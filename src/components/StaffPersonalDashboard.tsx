import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, ChevronRight, ChevronLeft, LogOut, Shield, Calendar } from 'lucide-react';
import { database } from '../lib/database';
import { useAppUser, useAppData, useAppConfig, useAppOverlay } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { User as UserType, Shift, HolidayRequest, PunchRecord, type Language } from '../types';
import type { BreakRule, BreakMinutesComputeOptions } from '../utils/breakRules';
import { format, isToday, isFuture, startOfWeek, endOfWeek, addWeeks, addDays, startOfMonth, endOfMonth, parseISO, isWithinInterval, startOfDay, endOfDay, getISOWeek } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
import { loadPeriodConfig, getPeriodDateRange, prevPeriodConfig, nextPeriodConfig, type PeriodConfig } from '../utils/periodConfig';
import { getTimesheetGridPrivacyMode } from '../utils/timesheetGridPrivacy';
import { getNetShiftMinutes } from '../utils/breakRules';
import { getResolvedStartEndForHours } from '../utils/shiftResolvedClockTimes';
import { getTranslations, getDateLocale } from '../utils/translations';
import {
  getVisibleStaffTabs,
  getUnifiedNavTabs,
  type AppNavTab,
} from '../utils/enabledModules';
import { useWallAlignedMinuteClock } from '../hooks/useWallAlignedMinuteClock';
import MobileStaffDashboard from './mobile/MobileStaffDashboard';
// import MobileShifts from './mobile/MobileShifts'; // rendered via MobileStaffDashboard
// import MobileTimesheet from './mobile/MobileTimesheet'; // rendered via MobileStaffDashboard
import ManagementMobileShifts from './mobile/ManagementMobileShifts';
import ManagementMobileTimesheet from './mobile/ManagementMobileTimesheet';
import MobileRequests from './mobile/MobileRequests';
import MobileStatsCards from './mobile/MobileStatsCards';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
// const Timesheets = lazy(() => import('./Timesheets')); // unused here
const HolidayRequests = lazy(() => import('./HolidayRequests'));
const Statistics = lazy(() => import('./Statistics'));
// const WeeklyShiftsTable = lazy(() => import('./WeeklyShiftsTable')); // unused here
const SettingsPage = lazy(() => import('./SettingsPage'));

import { CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { isSameWeek, eachDayOfInterval } from 'date-fns';
// import { safeFormatDate } from '../utils/safeDateFormat'; // unused
import { isPurelyManagementRole } from '../utils/permissions';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';
import { userRowToSessionUser } from '../utils/staffPermissionDefaults';
import { APP_SESSION_STORAGE_KEY } from '../constants/appSession';
import { translateDepartmentValue } from '../utils/departmentLabels';
import AdminRow from './ui/AdminRow';
import RequestHolidayModal from './RequestHolidayModal';
import LanguageToggleGrid from './LanguageToggleGrid';
import NotificationCenter from './NotificationCenter';
import ProfileNavTabPanel from './ProfileNavTabPanel';
import { StaffPushNotificationPromptBanner } from './StaffPushNotificationPromptBanner';

// ─── Desktop grid view for staff shifts ───────────────────────────────────────
function StaffDesktopShifts({ shifts, language = 'it' }: { shifts: Shift[]; language?: Language }) {
  const locale = getDateLocale(language) ?? itLocale;
  const t = getTranslations(language);
  const _STATUS_CFG = {
    approved:  { label: t.ts_status_approved  ?? 'Approvato',  Icon: CheckCircle2, pill: 'shift-badge-approved' },
    confirmed: { label: t.ts_status_confirmed ?? 'Pubblicato', Icon: AlertCircle,  pill: 'shift-badge-confirmed' },
    draft:     { label: t.status_draft        ?? 'Bozza',      Icon: AlertCircle,  pill: 'shift-badge-draft' },
    absent:    { label: t.status_absent       ?? 'Assente',    Icon: XCircle,      pill: 'shift-badge-absent' },
  } as const;

  const weeks = useMemo(() => {
    const sorted = [...shifts].sort((a, b) => a.date.localeCompare(b.date));
    const map: { start: Date; end: Date; shifts: Shift[] }[] = [];
    sorted.forEach(shift => {
      const d = parseISO(shift.date);
      const s = startOfWeek(d, { weekStartsOn: 1 });
      const e = endOfWeek(d, { weekStartsOn: 1 });
      let week = map.find(w => isSameWeek(w.start, s, { weekStartsOn: 1 }));
      if (!week) { week = { start: s, end: e, shifts: [] }; map.push(week); }
      week.shifts.push(shift);
    });
    return map;
  }, [shifts]);

  if (shifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border border-slate-200">
          <Calendar className="w-7 h-7 text-white/40" />
        </div>
        <p className="text-white/70 font-bold uppercase tracking-widest text-[11px]">
          {t.no_shifts_scheduled}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-11 pb-8 px-4 md:px-6 max-w-5xl mx-auto">
      {weeks.map((week, wIdx) => {
        const weekDays = eachDayOfInterval({ start: week.start, end: week.end });
        const byDay = new Map<string, Shift[]>();
        weekDays.forEach(d => byDay.set(format(d, 'yyyy-MM-dd'), []));
        week.shifts.forEach(s => {
          const k = format(parseISO(s.date), 'yyyy-MM-dd');
          const arr = byDay.get(k) ?? [];
          arr.push(s);
          byDay.set(k, arr);
        });

        const totalMins = week.shifts.reduce((acc, s) => {
          if (!s.start_time || !s.end_time || s.approval_status === 'absent') return acc;
          const [sh, sm] = s.start_time.split(':').map(Number);
          const [eh, em] = s.end_time.split(':').map(Number);
          return acc + (eh * 60 + em - sh * 60 - sm);
        }, 0);
        const totalH = Math.floor(totalMins / 60);
        const totalM = totalMins % 60;
        const totalLabel = totalMins > 0 ? (totalM > 0 ? `${totalH}h ${totalM}m` : `${totalH}h`) : '';

        return (
          <div key={wIdx}
            className="shift-card-ultra shift-week-spacing-ultra overflow-hidden"
          >
            {/* Week header */}
            <div className="flex items-center justify-between px-4 py-3 shift-separator-ultra">
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/60 leading-none mb-0.5">
                    {t.week_label ?? 'Sett.'}
                  </p>
                  <p className="text-[13px] font-semibold text-white">
                    {format(week.start, 'd MMM', { locale })} – {format(week.end, 'd MMM', { locale })}
                  </p>
                </div>
              </div>
              {totalLabel && (
                <span className="text-[13px] font-extrabold text-white tabular-nums">
                  {totalLabel}
                </span>
              )}
            </div>

            {/* 7-column day grid - NO VERTICAL BORDERS */}
            <div className="grid grid-cols-7 divide-x divide-white/[0.06]">
              {weekDays.map((day, dIdx) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayShifts = (byDay.get(dateStr) ?? []).sort((a, b) => a.start_time.localeCompare(b.start_time));
                const _isWeekend = dIdx >= 5;
                const today = isToday(day);

                return (
                  <div
                    key={dateStr}
                    className={`flex flex-col min-h-[100px] ${today ? 'bg-white/15' : ''}`}
                  >
                    {/* Day header */}
                    <div className={`px-2 py-2 text-center ${today ? 'bg-accent/20' : ''}`}>
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${today ? 'text-accent' : 'text-white/60'}`}>
                        {format(day, 'EEE', { locale })}
                      </p>
                      <p className={`text-[13px] font-semibold tabular-nums ${today ? 'text-white' : 'text-white/90'}`}>
                        {format(day, 'd')}
                      </p>
                    </div>

                    {/* Shifts */}
                    <div className="flex flex-col gap-1 px-2 py-2 flex-1">
                      {dayShifts.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-white/20" />
                        </div>
                      ) : dayShifts.map((shift) => {
                        const isAbsent = shift.approval_status === 'absent';
                        const isDraft = shift.approval_status === 'draft';

                        const [sh, sm2] = (shift.start_time ?? '00:00').split(':').map(Number);
                        const [eh, em2] = (shift.end_time ?? '00:00').split(':').map(Number);
                        const plannedMins = isAbsent ? 0 : Math.max(0, eh * 60 + em2 - sh * 60 - sm2);
                        const ph = Math.floor(plannedMins / 60);
                        const pm = plannedMins % 60;
                        const hoursLabel = isAbsent ? '' : (pm > 0 ? `${ph}h ${pm}m` : `${ph}h`);

                        const statusCls = isDraft ? 'text-white/40' : 'text-white';

                        return (
                          <div key={shift.id} className="text-center">
                            {isAbsent ? (
                              <p className="text-[11px] font-normal text-white/30 uppercase tracking-widest py-1">OFF</p>
                            ) : (
                              <>
                                <p className={`text-[13px] font-bold tabular-nums leading-tight ${statusCls}`}>
                                  {shift.start_time.slice(0, 5)}–{shift.end_time?.slice(0, 5) ?? '…'}
                                </p>
                                <p className="text-[11px] font-medium text-white/40">
                                  {hoursLabel}
                                </p>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Desktop grid view for staff timesheet ────────────────────────────────────
function StaffDesktopTimesheet({
  shifts, punchRecords, user, breakRules, breakComputeOpts, language = 'it',
}: {
  shifts: Shift[];
  punchRecords: PunchRecord[];
  user: UserType;
  breakRules: BreakRule[];
  breakComputeOpts: BreakMinutesComputeOptions;
  language?: Language;
}) {
  const locale = getDateLocale(language) ?? itLocale;
  const t = getTranslations(language);
  

  const _STATUS_CONFIG = {
    approved: { label: t.ts_status_approved ?? 'Approvato', Icon: CheckCircle2, pill: 'shift-badge-approved' },
    confirmed: { label: t.ts_status_confirmed ?? 'Pubblicato', Icon: AlertCircle, pill: 'shift-badge-confirmed' },
    absent: { label: t.status_absent ?? 'Assente', Icon: XCircle, pill: 'shift-badge-absent' },
  } as const;

  const history = shifts
    .filter(s => s.date <= format(new Date(), 'yyyy-MM-dd'))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border border-slate-200">
          <Clock className="w-7 h-7 text-white/40" />
        </div>
        <p className="text-white/70 font-bold uppercase tracking-widest text-[11px]">
          {t.no_shifts_scheduled ?? 'Nessuno storico disponibile'}
        </p>
      </div>
    );
  }

  // Group by week
  const weeks: { start: Date; end: Date; shifts: Shift[] }[] = [];
  history.forEach(shift => {
    const sd = new Date(shift.date);
    const s = startOfWeek(sd, { weekStartsOn: 1 });
    const e = endOfWeek(sd, { weekStartsOn: 1 });
    let week = weeks.find(w => isSameWeek(w.start, s, { weekStartsOn: 1 }));
    if (!week) { week = { start: s, end: e, shifts: [] }; weeks.push(week); }
    week.shifts.push(shift);
  });

  return (
    <div className="flex flex-col gap-11 pb-8 px-4 md:px-6 max-w-5xl mx-auto">
      {weeks.map((week, wIdx) => {
        // Total hours
        let totalMins = 0;
        week.shifts.forEach(shift => {
          const { start, end } = getResolvedStartEndForHours(shift, punchRecords);
          totalMins += getNetShiftMinutes(shift, start, end, user, breakRules, breakComputeOpts);
        });
        const totalH = Math.floor(totalMins / 60);
        const totalM = totalMins % 60;
        const totalLabel = totalM > 0 ? `${totalH}h ${totalM}m` : `${totalH}h`;

        // All 7 days of the week
        const weekDays = eachDayOfInterval({ start: week.start, end: week.end });

        // Map date → shifts
        const dayMap = new Map<string, Shift[]>();
        week.shifts.forEach(shift => {
          const arr = dayMap.get(shift.date) ?? [];
          arr.push(shift);
          dayMap.set(shift.date, arr);
        });
        weekDays.forEach(d => {
          const k = format(d, 'yyyy-MM-dd');
          if (!dayMap.has(k)) dayMap.set(k, []);
        });

        return (
          <div key={wIdx}
            className="shift-card-ultra shift-week-spacing-ultra overflow-hidden"
          >
            {/* Week header */}
            <div className="flex items-center justify-between px-4 py-3 shift-separator-ultra">
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/60 leading-none mb-0.5">
                    {t.week_label ?? 'Sett.'}
                  </p>
                  <p className="text-[13px] font-semibold text-white">
                    {format(week.start, 'd MMM', { locale })} – {format(week.end, 'd MMM', { locale })}
                  </p>
                </div>
              </div>
              {totalMins > 0 && (
                <span className="text-[13px] font-extrabold text-white tabular-nums">
                  {totalLabel}
                </span>
              )}
            </div>

            {/* Day grid: 7 columns - NO VERTICAL BORDERS */}
            <div className="grid grid-cols-7 divide-x divide-white/[0.06]">
              {weekDays.map((day, dIdx) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const dayShifts = (dayMap.get(dateStr) ?? []).sort((a, b) => a.start_time.localeCompare(b.start_time));
                const _isWeekend = dIdx >= 5;
                const today = isToday(day);

                return (
                  <div
                    key={dateStr}
                    className={`flex flex-col min-h-[100px] ${today ? 'bg-white/15' : ''}`}
                  >
                    {/* Day header */}
                    <div className={`px-2 py-2 text-center ${today ? 'bg-accent/20' : ''}`}>
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${today ? 'text-accent' : 'text-white/60'}`}>
                        {format(day, 'EEE', { locale })}
                      </p>
                      <p className={`text-[13px] font-semibold tabular-nums ${today ? 'text-white' : 'text-white/90'}`}>
                        {format(day, 'd')}
                      </p>
                    </div>

                    {/* Shifts */}
                    <div className="flex flex-col gap-1 px-2 py-2 flex-1">
                      {dayShifts.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center">
                          <span className="w-1 h-1 rounded-full bg-white/20" />
                        </div>
                      ) : dayShifts.map((shift) => {
                        const isAbsent = shift.approval_status === 'absent';
                        const isDraft = shift.approval_status === 'draft';
                        const { start, end } = getResolvedStartEndForHours(shift, punchRecords);
                        const mins = getNetShiftMinutes(shift, start, end, user, breakRules, breakComputeOpts);
                        const hh = Math.floor(mins / 60);
                        const mm = mins % 60;
                        const hoursLabel = isAbsent ? '' : (mm > 0 ? `${hh}h ${mm}m` : `${hh}h`);

                        const statusCls = isDraft ? 'text-white/40' : 'text-white';

                        return (
                          <div key={shift.id} className="text-center">
                            {isAbsent ? (
                              <p className="text-[11px] font-normal text-white/30 uppercase tracking-widest py-1">OFF</p>
                            ) : (
                              <>
                                <p className={`text-[13px] font-bold tabular-nums leading-tight ${statusCls}`}>
                                  {shift.start_time.slice(0, 5)}–{shift.end_time?.slice(0, 5) ?? '…'}
                                </p>
                                <p className="text-[11px] font-medium text-white/40">
                                  {hoursLabel}
                                </p>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface StaffPersonalDashboardProps {
  user: UserType;
  onLogout: () => void;
  activeTab: AppNavTab;
  onTabChange: (tab: AppNavTab) => void;
}

const showProfileDemoSeed =
  import.meta.env.DEV || import.meta.env.VITE_ENABLE_PROFILE_DEMO_SEED === 'true';

export default function StaffPersonalDashboard({
  user,
  onLogout,
  activeTab,
  onTabChange,
}: StaffPersonalDashboardProps) {
  const { setCurrentUser, users, effectiveLanguage, setLanguage } = useAppUser();
  const { breakRules, featureFlags, roleTemplatesRevision } = useAppConfig();
  const { showSuccess, showError } = useAppOverlay();
  const { seedDemoProfileForUser } = useAppData();
  const latestUser = users.find((u) => u.id === user.id) ?? user;
  // Usa latestUser (da users) per permessi: quando l'admin disabilita can_request_holidays,
  // currentUser non viene aggiornato (è un altro utente), ma users sì.
  const displayUser = latestUser;
  const uiW = useCallback((key: string) => isUiWidgetVisible(displayUser, key), [displayUser]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [holidays, setHolidays] = useState<HolidayRequest[]>([]);
  const [punchRecords, setPunchRecords] = useState<PunchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [seedingDemoProfile, setSeedingDemoProfile] = useState(false);
  const t = useT();
  const now = useWallAlignedMinuteClock();
  const breakComputeOpts = useMemo(
    () => ({ autoBreaksFeatureEnabled: featureFlags['auto_breaks'] !== false }),
    [featureFlags]
  );

  const loadUserData = useCallback(async () => {
    try {
      const [shiftsData, holidaysData, punchesData] = await Promise.all([
        database.shifts.getByUserId(user.id),
        database.holidays.getByUserId(user.id),
        database.punchRecords.getByUserId(user.id),
      ]);
      setShifts(shiftsData);
      setHolidays(holidaysData);
      setPunchRecords(punchesData);
    } catch (error) {
      console.error(t.load_error, error);
    } finally {
      setLoading(false);
    }
  }, [user.id, t.load_error]);

  // Allinea currentUser alla riga aggiornata in `users` (permessi, JSONB) — stessa normalizzazione del login / realtime.
  useEffect(() => {
    if (latestUser.status !== 'active') {
      try {
        localStorage.removeItem(APP_SESSION_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setCurrentUser(null);
      return;
    }
    setCurrentUser(userRowToSessionUser(latestUser));
  }, [latestUser, setCurrentUser]);

  useEffect(() => {
    loadUserData();
    const unsubShifts = database.realtime.subscribeToShifts(user.id, setShifts);
    const unsubHolidays = database.realtime.subscribeToHolidays(user.id, setHolidays);
    const unsubPunches = database.realtime.subscribeToPunchRecords(user.id, setPunchRecords);
    return () => {
      unsubShifts();
      unsubHolidays();
      unsubPunches();
    };
  }, [user.id, loadUserData]);

  /** PWA ↔ Safari / cambio app: realtime può restare indietro — riallinea da DB. */
  useEffect(() => {
    let reloadDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (document.visibilityState !== 'visible') {
        if (reloadDebounceTimer) {
          clearTimeout(reloadDebounceTimer);
          reloadDebounceTimer = null;
        }
        return;
      }
      if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer);
      reloadDebounceTimer = setTimeout(() => {
        reloadDebounceTimer = null;
        loadUserData();
      }, 300);
    };
    document.addEventListener('visibilitychange', scheduleReload);
    window.addEventListener('focus', scheduleReload);
    window.addEventListener('online', scheduleReload);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted || document.visibilityState === 'visible') scheduleReload();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', scheduleReload);
      window.removeEventListener('focus', scheduleReload);
      window.removeEventListener('online', scheduleReload);
      window.removeEventListener('pageshow', onPageShow);
      if (reloadDebounceTimer) clearTimeout(reloadDebounceTimer);
    };
  }, [loadUserData]);
  const dateLocale = getDateLocale(effectiveLanguage);

  const displayName = (displayUser?.first_name?.trim() || displayUser?.email?.split('@')[0] || 'Utente').trim() || 'Utente';
  const displayDept = displayUser?.department
    ? translateDepartmentValue(displayUser.department, effectiveLanguage)
    : ((t as { department_none?: string }).department_none ?? 'Nessuno');

  const visibleShifts = shifts.filter(
    (s) => s.approval_status === 'confirmed' || s.approval_status === 'absent'
  );
  const upcomingShifts = visibleShifts.filter((shift) => isFuture(new Date(shift.date)));

  const monthKey = format(new Date(), 'yyyy-MM');
  const _confirmedThisMonth = displayUser.monthly_confirmed?.[monthKey];
  const _shiftsListRef = useRef<HTMLDivElement>(null);

  const [holidaysFocus, setHolidaysFocus] = useState(false);

  useEffect(() => {
    if (activeTab !== 'home') setHolidaysFocus(false);
  }, [activeTab]);

  /** Sempre prima di qualsiasi return anticipato (loading / profilo gestionale) — altrimenti React #310. */
  const _visibleStaffTabs = useMemo(() => {
    void roleTemplatesRevision;
    return getVisibleStaffTabs(displayUser, featureFlags);
  }, [displayUser, featureFlags, roleTemplatesRevision]);

  const _staffUnifiedTabs = useMemo(() => {
    void roleTemplatesRevision;
    return getUnifiedNavTabs(displayUser, false, featureFlags);
  }, [displayUser, featureFlags, roleTemplatesRevision]);

  const staffHomeWeeklyMonthly = useMemo(() => {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = addDays(weekStart, 7);
    const mStart = startOfMonth(now);
    const mEnd = endOfMonth(now);
    const weekOk = (s: Shift) =>
      s.approval_status === 'confirmed' || s.approval_status === 'absent';
    const thisWeekShifts = visibleShifts.filter((s) => {
      const d = parseISO(s.date);
      return d >= weekStart && d < weekEnd && weekOk(s);
    });
    let weeklyMinutes = 0;
    for (const s of thisWeekShifts) {
      if (s.approval_status === 'absent') continue;
      const { start, end } = getResolvedStartEndForHours(s, punchRecords);
      weeklyMinutes += getNetShiftMinutes(s, start, end, displayUser, breakRules, breakComputeOpts);
    }
    const monthShifts = visibleShifts.filter((s) => {
      const d = parseISO(s.date);
      return d >= mStart && d <= mEnd && weekOk(s);
    });
    let monthlyMinutes = 0;
    for (const s of monthShifts) {
      if (s.approval_status === 'absent') continue;
      const { start, end } = getResolvedStartEndForHours(s, punchRecords);
      monthlyMinutes += getNetShiftMinutes(s, start, end, displayUser, breakRules, breakComputeOpts);
    }
    const monthDaysWorked = new Set(monthShifts.filter((s) => s.approval_status !== 'absent').map((s) => s.date)).size;
    const monthShiftCount = monthShifts.filter((s) => s.approval_status !== 'absent').length;
    return { weeklyMinutes, monthlyMinutes, monthDaysWorked, monthShiftCount };
  }, [now, visibleShifts, punchRecords, displayUser, breakRules, breakComputeOpts]);

  const renderHome = () => {
    const grouped: Record<string, typeof upcomingShifts> = {};
    upcomingShifts.slice(0, 10).forEach(s => {
      if (!grouped[s.date]) grouped[s.date] = [];
      grouped[s.date].push(s);
    });
    const _sortedDates = Object.keys(grouped).sort().slice(0, 6);
    const todayStr = format(now, 'yyyy-MM-dd');

    return (
      <div className="space-y-0">
        <StaffPushNotificationPromptBanner userId={displayUser.id} effectiveLanguage={effectiveLanguage} />
        <MobileStaffDashboard
          user={displayUser}
          language={effectiveLanguage}
          todayStr={todayStr}
          now={now}
          myShifts={shifts}
          punchRecords={punchRecords}
          weeklyMinutes={staffHomeWeeklyMonthly.weeklyMinutes}
          monthlyMinutes={staffHomeWeeklyMonthly.monthlyMinutes}
          monthDaysWorked={staffHomeWeeklyMonthly.monthDaysWorked}
          weekCapMinutes={40 * 60}
          onTabChange={onTabChange}
          greetingText={t.home_greeting.replace('{name}', displayUser.first_name ?? '')}
          activeTab={activeTab}
          onRefresh={loadUserData}
        />
      </div>
    );
  };

  const shiftsSortedMobile = useMemo(
    () =>
      [...visibleShifts].sort(
        (a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)
      ),
    [visibleShifts]
  );

  const isMobile = useIsMobileViewport();

  /** Sub-tab interno scheda Presenze/Ore: presenze oppure statistiche. */
  const [tsStaffView, setTsStaffView] = useState<'presence' | 'stats'>('presence');

  // ── Navigazione periodo mobile (turni + presenze) ──────────────
  type MobileNavTab = 'week' | 'period';
  const [mobileNavTab, _setMobileNavTab] = useState<MobileNavTab>('period');
  const [mobileNavOffset, setMobileNavOffset] = useState(() => {
    const saved = sessionStorage.getItem('osteria_staff_nav_offset');
    return saved ? Number(saved) : 0;
  });

  // Persiste l'offset in sessionStorage per condividerlo con Statistics
  useEffect(() => {
    sessionStorage.setItem('osteria_staff_nav_offset', String(mobileNavOffset));
  }, [mobileNavOffset]);

  // Sincronizza l'offset di navigazione con la scheda Statistiche (bidirezionale)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('osteria-staff-nav-offset', { detail: mobileNavOffset }));
  }, [mobileNavOffset]);

  // Ascolta cambiamenti provenienti dalla scheda Statistiche
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === 'number') {
        setMobileNavOffset(detail);
        sessionStorage.setItem('osteria_staff_nav_offset', String(detail));
      }
    };
    window.addEventListener('osteria-staff-nav-offset', handler);
    return () => window.removeEventListener('osteria-staff-nav-offset', handler);
  }, []);

  const getMobileRange = useCallback((tab: MobileNavTab, offset: number): { start: Date; end: Date } => {
    const today = new Date();
    if (tab === 'week') {
      const base = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), offset);
      return { start: startOfDay(base), end: endOfDay(endOfWeek(base, { weekStartsOn: 1 })) };
    }
    let cfg: PeriodConfig = loadPeriodConfig();
    if (offset > 0) for (let i = 0; i < offset; i++) cfg = nextPeriodConfig(cfg);
    else if (offset < 0) for (let i = 0; i > offset; i--) cfg = prevPeriodConfig(cfg);
    const r = getPeriodDateRange(cfg);
    return { start: startOfDay(new Date(r.startDate)), end: endOfDay(new Date(r.endDate)) };
  }, []);

  const mobileRange = useMemo(
    () => getMobileRange(mobileNavTab, mobileNavOffset),
    [getMobileRange, mobileNavTab, mobileNavOffset]
  );

  const mobileShiftsFiltered = useMemo(
    () => shiftsSortedMobile.filter(s => {
      const d = parseISO(s.date);
      return isWithinInterval(d, { start: mobileRange.start, end: mobileRange.end });
    }),
    [shiftsSortedMobile, mobileRange]
  );

  const mobileTimesheetFiltered = useMemo(
    () => visibleShifts.filter(s => {
      const d = parseISO(s.date);
      return isWithinInterval(d, { start: mobileRange.start, end: mobileRange.end });
    }),
    [visibleShifts, mobileRange]
  );

  const mobileLocale = dateLocale ?? itLocale;

  // ── Statistiche per MobileStatsCards ──────────────────────────────────────
  const mobileStatsData = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd   = endOfMonth(now);

    const workedStatuses = new Set(['approved', 'confirmed']);
    const calcMins = (s: Shift) => {
      const { start, end } = getResolvedStartEndForHours(s, punchRecords);
      return getNetShiftMinutes(s, start, end, displayUser, breakRules, breakComputeOpts);
    };

    let weekWorkedMins = 0;
    let monthWorkedMins = 0;
    const monthWorkedDays = new Set<string>();

    for (const s of visibleShifts) {
      if (!workedStatuses.has(s.approval_status ?? '')) continue;
      const d = parseISO(s.date);
      const mins = calcMins(s);
      if (isWithinInterval(d, { start: weekStart,  end: weekEnd  })) weekWorkedMins  += mins;
      if (isWithinInterval(d, { start: monthStart, end: monthEnd })) {
        monthWorkedMins += mins;
        monthWorkedDays.add(s.date);
      }
    }

    const weekCapMins =
      ((displayUser as UserType & { hours_per_week?: number }).hours_per_week ?? 40) * 60;

    return { weekWorkedMins, weekCapMins, monthWorkedMins, monthDaysWorked: monthWorkedDays.size };
  }, [visibleShifts, punchRecords, displayUser, breakRules, breakComputeOpts]);

  const MobileNavBar = () => (
    <div className="flex items-center gap-2 mb-4 px-4">
      {/* Etichetta "Oggi" a sinistra — cliccabile per tornare al periodo corrente */}
      <button type="button" onClick={() => setMobileNavOffset(0)}
        className="h-9 inline-flex items-center px-3 rounded-2xl bg-accent text-white text-[11px] font-extrabold uppercase tracking-wider shrink-0 shadow-sm active:bg-accent/80 transition-colors">
        {t.today}
      </button>

      {/* Frecce + chip data a destra */}
      <div className="flex items-center border border-slate-100 rounded-2xl overflow-hidden flex-1" style={{ background: 'transparent', boxShadow: 'none' }}>
        <button
          type="button"
          onClick={() => setMobileNavOffset(o => o - 1)}
          className="flex items-center justify-center h-9 w-9 text-white/60 hover:bg-slate-50 transition-colors shrink-0 border-r border-slate-100 active:bg-slate-50/80"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="flex-1 flex items-center justify-center gap-1.5 px-2 min-w-0">
          <Calendar className="h-3 w-3 text-white/50 shrink-0" />
          <span className="text-[11px] font-bold text-white/80 tabular-nums truncate">
            {mobileNavTab === 'week'
              ? `S.${getISOWeek(mobileRange.start)} · ${format(mobileRange.start, 'd MMM', { locale: mobileLocale })} – ${format(mobileRange.end, 'd MMM', { locale: mobileLocale })}`
              : `${format(mobileRange.start, 'd MMM', { locale: mobileLocale })} – ${format(mobileRange.end, 'd MMM yy', { locale: mobileLocale })}`
            }
          </span>
        </div>

        <button
          type="button"
          onClick={() => setMobileNavOffset(o => o + 1)}
          className="flex items-center justify-center h-9 w-9 text-white/60 hover:bg-slate-50 transition-colors shrink-0 border-l border-slate-100 active:bg-slate-50/80"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  const renderShifts = () => (
    <div className="space-y-4">
      {isMobile ? (
        <ManagementMobileShifts
          shifts={mobileShiftsFiltered}
          users={users}
          currentUserId={displayUser.id}
          language={effectiveLanguage}
        />
      ) : (
        <>
          <MobileNavBar />
          <StaffDesktopShifts shifts={mobileShiftsFiltered} language={effectiveLanguage} />
        </>
      )}
    </div>
  );

  const renderProfile = () => (
    <div className="space-y-4">
      {uiW('staff_profile.panel') && (
      <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="ui-section-title text-white/70">{(t as { profile_settings?: string }).profile_settings ?? 'Impostazioni profilo'}</h3>
        </div>
        <div>
          <AdminRow
            label={t.sidebar_profile}
            action={<span className="text-sm font-semibold text-white uppercase tracking-wide truncate max-w-[55%] text-right" title={displayName}>{displayName}</span>}
          />
          <AdminRow
            label={(t as { email?: string }).email ?? 'Email'}
            action={<span className="text-sm text-white/70 truncate max-w-[55%] text-right" title={displayUser?.email ?? '—'}>{displayUser?.email ?? '—'}</span>}
          />
          <AdminRow
            label={(t as { phone?: string }).phone ?? 'Telefono'}
            action={<span className="text-sm text-white/70">{displayUser?.phone ?? '—'}</span>}
          />
          <AdminRow
            label={(t as { department_label?: string }).department_label ?? 'Reparto'}
            action={<span className="text-sm text-white/70">{displayDept}</span>}
          />
          <AdminRow label={t.profile_notifications} action={<NotificationCenter denseTrigger />} />
          <AdminRow
            className="!items-start"
            label={t.language}
            action={
              <div className="min-w-0 max-w-full md:max-w-xs">
                <LanguageToggleGrid effectiveLanguage={effectiveLanguage} setLanguage={setLanguage} />
              </div>
            }
          />
          {showProfileDemoSeed && (
            <div className="border-t border-slate-100 px-5 py-4 space-y-2">
              <button
                type="button"
                disabled={seedingDemoProfile}
                onClick={async () => {
                  if (!window.confirm(t.settings_seed_demo_profile_confirm)) return;
                  setSeedingDemoProfile(true);
                  try {
                    await seedDemoProfileForUser(user.id);
                    await loadUserData();
                    showSuccess(t.settings_seed_demo_profile_done);
                  } catch (e) {
                    showError(e instanceof Error ? e.message : t.settings_seed_demo_profile_error);
                  } finally {
                    setSeedingDemoProfile(false);
                  }
                }}
                className="w-full py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider bg-slate-100 text-white/80 hover:bg-slate-200 disabled:opacity-60 transition-colors active:bg-slate-200/80"
              >
                {seedingDemoProfile ? t.ui_ellipsis : t.settings_seed_demo_profile_btn}
              </button>
              <p className="text-[11px] text-white/50 leading-relaxed">{t.settings_seed_demo_profile_hint}</p>
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-between border-t border-slate-100 px-5 py-4 text-left hover:bg-red-50 transition-colors min-h-[52px] text-red-600 font-medium active:bg-red-50/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          >
            <span className="text-sm">{(t as { header_logout?: string }).header_logout ?? 'Esci'}</span>
            <LogOut className="w-5 h-5" strokeWidth={2} />
          </button>
        </div>
      </div>
      )}
    </div>
  );

  const renderHolidays = () => (
    <div className="space-y-4">
      {isMobile ? (
        <MobileRequests 
          requests={holidays.filter(h => h.user_id === user.id)} 
          onRequestNew={() => setIsHolidayModalOpen(true)}
          t={t}
        />
      ) : (
        <Suspense fallback={tabSpinner}>
          <HolidayRequests />
        </Suspense>
      )}
    </div>
  );

  if (loading) return null;

  // Profilo gestionale solo Admin: nessun turno assegnato (Proprietario = stesso flusso Manager)
  if (isPurelyManagementRole(displayUser.role)) {
    return (
      <div className="min-h-screen text-white/90 font-sans antialiased flex flex-col items-center justify-center px-6 safe-area-pad" style={{ background: 'transparent' }}>
        <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 max-w-sm p-8 text-center">
          <Shield className="w-14 h-14 text-white/60 mx-auto mb-4" strokeWidth={1.5} />
          <h2 className="text-lg font-bold text-white/90 mb-2">Profilo Gestionale</h2>
          <p className="text-white/60 text-sm">Nessun turno assegnato</p>
          <p className="text-white/60 text-xs mt-3">Questo profilo è riservato alla gestione. Accedi al pannello di controllo per amministrare turni e personale.</p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-6 w-full py-3 rounded-xl bg-slate-100 text-white/80 font-semibold text-sm hover:bg-slate-200 transition-colors active:bg-slate-200/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          >
            {(t as { header_logout?: string }).header_logout ?? 'Esci'}
          </button>
        </div>
      </div>
    );
  }

  const tabMotionKey = holidaysFocus ? 'holidays-inline' : activeTab;

  const tabSpinner = (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="w-full flex-1 min-h-0 scroll-smooth text-white/90 font-sans antialiased pb-content pt-0">
      <div className="mx-auto w-full max-w-7xl">
      {holidaysFocus && (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHolidaysFocus(false)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent min-h-[44px] px-2 -ml-2 rounded-xl hover:bg-accent/10 touch-target active:bg-accent/80"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden />
            {(t as { back?: string }).back ?? 'Indietro'}
          </button>
          <span className="text-xs font-bold text-white/80 uppercase tracking-widest truncate" title={t.sidebar_holidays}>{t.sidebar_holidays}</span>
        </div>
      )}

      <div className="w-full min-h-[40vh]">
        <AnimatePresence mode="wait">
          <motion.div
            key={tabMotionKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ touchAction: 'pan-y' }}
          >
            {holidaysFocus ? (
              renderHolidays()
            ) : (
              <>
                {activeTab === 'home' && renderHome()}
                {activeTab === 'turni' && renderShifts()}
                {activeTab === 'ferie' && renderHolidays()}
                {activeTab === 'timesheet' && (
                  <>
                    {/* ── Sub-tab: Presenze | Statistiche — sempre visibile per tutti i profili ── */}
                    <div className="flex items-center gap-1.5 mt-8 mb-4 px-4">
                      {(['presence', 'stats'] as const).map((v) => {
                        const label = v === 'presence' ? (t.tab_attendance ?? 'Presenze') : (t.tab_statistics ?? 'Statistiche');
                        const active = tsStaffView === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setTsStaffView(v)}
                            className={`h-8 px-4 rounded-full text-[11px] font-extrabold uppercase tracking-wider transition-colors ${
 active
 ? 'bg-accent text-white shadow-[0_0_12px_-2px_var(--color-accent)] scale-105'
 : 'bg-white/[0.04] border border-white/[0.07] text-white/40 hover:border-white/25 hover:text-white/80'
 }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* ── Statistiche ── */}
                    {tsStaffView === 'stats' && (
                      <div className="min-h-0 overflow-y-auto overscroll-y-contain scroll-smooth [-webkit-overflow-scrolling:touch] pb-1">
                        <Suspense fallback={tabSpinner}>
                          <Statistics />
                        </Suspense>
                      </div>
                    )}

                    {/* ── Presenze ── */}
                    {tsStaffView === 'presence' && (
                      <>
                        {isMobile && (
                          <div className="px-4 mb-4">
                            <MobileStatsCards
                              weekWorkedMins={mobileStatsData.weekWorkedMins}
                              weekCapMins={mobileStatsData.weekCapMins}
                              monthWorkedMins={mobileStatsData.monthWorkedMins}
                              monthDaysWorked={mobileStatsData.monthDaysWorked}
                              labels={{
                                title: t.mobile_dash_numbers ?? 'I miei numeri',
                                week: t.ts_period_week ?? 'Settimana',
                                month: t.ts_period_month ?? 'Mese',
                                daysWorked:
                                  (t as Record<string, string>).mobile_dash_days_worked ?? 'Giorni lavorati',
                              }}
                            />
                          </div>
                        )}
                        {isMobile ? (
                          <ManagementMobileTimesheet
                            variant="embedded"
                            shifts={mobileTimesheetFiltered}
                            punchRecords={punchRecords}
                            users={users}
                            currentUserId={displayUser.id}
                            language={effectiveLanguage}
                            plannedOnly={getTimesheetGridPrivacyMode(displayUser) === 'planned_only'}
                          />
                        ) : (
                          <>
                            <MobileNavBar />
                            <StaffDesktopTimesheet
                              shifts={mobileTimesheetFiltered}
                              punchRecords={punchRecords}
                              user={displayUser}
                              breakRules={breakRules}
                              breakComputeOpts={breakComputeOpts}
                              language={effectiveLanguage}
                            />
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
                {activeTab === 'profile' && (
                  <div className="space-y-4">
                    <ProfileNavTabPanel onLogout={onLogout} />
                  </div>
                )}
                {activeTab === 'settings' && (
                  <Suspense fallback={tabSpinner}>
                    {displayUser?.elevated_role
                      ? <SettingsPage />
                      : renderProfile()
                    }
                  </Suspense>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      </div>

      {/* FINE install banner rimosso */}

      <RequestHolidayModal isOpen={isHolidayModalOpen} onClose={() => setIsHolidayModalOpen(false)} userId={user.id} />
    </div>
  );
}
