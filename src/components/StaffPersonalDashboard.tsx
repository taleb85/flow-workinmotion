import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Palmtree, Clock, CheckCircle, Download, X, Share, ChevronRight, ChevronLeft, LogOut, Shield } from 'lucide-react';
import { database } from '../lib/database';
import { useApp } from '../context/AppContext';
import { User as UserType, Shift, HolidayRequest, PunchRecord } from '../types';
import { format, isToday, isFuture } from 'date-fns';
import { formatMinutesToHoursAndMinutes } from '../utils/timeCalculations';
import { getNetShiftMinutes } from '../utils/breakRules';
import { getResolvedStartEndForHours } from '../utils/shiftResolvedClockTimes';
import { getTranslations, getDateLocale } from '../utils/translations';
import { getVisibleStaffTabs, getUnifiedNavTabs, isStaffRequestsFeatureEnabled, type AppNavTab } from '../utils/enabledModules';
import { isPurelyManagementRole } from '../utils/permissions';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';
import { userRowToSessionUser } from '../utils/staffPermissionDefaults';
import { APP_SESSION_STORAGE_KEY } from '../constants/appSession';
import { getDepartments } from '../utils/departments';
import WeeklyShiftsTable from './WeeklyShiftsTable';
import AdminRow from './ui/AdminRow';
import RequestHolidayModal from './RequestHolidayModal';
import LanguageToggleGrid from './LanguageToggleGrid';
import NotificationCenter from './NotificationCenter';

const Timesheets = lazy(() => import('./Timesheets'));
const Statistics = lazy(() => import('./Statistics'));

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
  onTabChange: _onTabChange,
}: StaffPersonalDashboardProps) {
  void _onTabChange;
  const {
    setCurrentUser,
    users,
    effectiveLanguage,
    setLanguage,
    breakRules,
    featureFlags,
    roleTemplatesRevision,
    seedDemoProfileForUser,
    showSuccess,
    showError,
  } = useApp();
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
  const t = getTranslations(effectiveLanguage);
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
    let t: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (document.visibilityState !== 'visible') {
        if (t) {
          clearTimeout(t);
          t = null;
        }
        return;
      }
      if (t) clearTimeout(t);
      t = setTimeout(() => {
        t = null;
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
      if (t) clearTimeout(t);
    };
  }, [loadUserData]);
  const dateLocale = getDateLocale(effectiveLanguage);

  const visibleShifts = shifts.filter(s => s.approval_status === 'approved' || s.approval_status === 'confirmed');
  const todayShifts = visibleShifts.filter((shift) => isToday(new Date(shift.date)));
  const upcomingShifts = visibleShifts.filter((shift) => isFuture(new Date(shift.date)));
  const approvedShifts = visibleShifts;
  
  const totalApprovedMinutes = approvedShifts.reduce((sum, shift) => {
    const { start, end } = getResolvedStartEndForHours(shift, punchRecords);
    return sum + getNetShiftMinutes(shift, start, end, displayUser, breakRules, breakComputeOpts);
  }, 0);
  const totalApprovedHours = formatMinutesToHoursAndMinutes(totalApprovedMinutes);

  // ── PWA Install Prompt ────────────────────────────────────────────────────
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<Event | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Already installed as PWA — don't show the banner
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    // Already dismissed
    if (localStorage.getItem('pwa_install_dismissed') === '1') return;

    // iOS detection (no beforeinstallprompt — show manual instructions)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream;
    if (ios) {
      setIsIos(true);
      setShowInstallBanner(true);
      return;
    }

    // Chrome/Android: listen for the browser's install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredInstallPrompt) return;
    const prompt = deferredInstallPrompt as Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> };
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallBanner(false);
      setDeferredInstallPrompt(null);
    }
  };

  const dismissInstallBanner = () => {
    setShowInstallBanner(false);
    localStorage.setItem('pwa_install_dismissed', '1');
  };
  // ─────────────────────────────────────────────────────────────────────────

  const monthKey = format(new Date(), 'yyyy-MM');
  const confirmedThisMonth = displayUser.monthly_confirmed?.[monthKey];
  const shiftsListRef = useRef<HTMLDivElement>(null);

  const [holidaysFocus, setHolidaysFocus] = useState(false);

  useEffect(() => {
    if (activeTab !== 'home') setHolidaysFocus(false);
  }, [activeTab]);

  /** Sempre prima di qualsiasi return anticipato (loading / profilo gestionale) — altrimenti React #310. */
  const visibleStaffTabs = useMemo(() => {
    void roleTemplatesRevision;
    return getVisibleStaffTabs(displayUser, featureFlags);
  }, [displayUser, featureFlags, roleTemplatesRevision]);

  const staffUnifiedTabs = useMemo(() => {
    void roleTemplatesRevision;
    return getUnifiedNavTabs(displayUser, false, featureFlags);
  }, [displayUser, featureFlags, roleTemplatesRevision]);

  const showHomeKpiStrip =
    totalApprovedMinutes > 0 || todayShifts.length + upcomingShifts.length > 0;

  const renderHome = () => {
    const grouped: Record<string, typeof upcomingShifts> = {};
    upcomingShifts.slice(0, 10).forEach(s => {
      if (!grouped[s.date]) grouped[s.date] = [];
      grouped[s.date].push(s);
    });
    const sortedDates = Object.keys(grouped).sort().slice(0, 6);

    return (
      <div className="space-y-4">

        {/* Card ORE MESE (se disponibile) */}
        {uiW('staff_home.month_hours') && confirmedThisMonth && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">{t.hours_this_month}</p>
              <p className="text-2xl font-bold text-slate-900">{formatMinutesToHoursAndMinutes(confirmedThisMonth.minutes)}</p>
              <p className="text-xs text-slate-400 mt-0.5">{confirmedThisMonth.shiftsCount} {t.shifts_confirmed}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-accent" />
            </div>
          </div>
        )}

        {/* Turno di oggi — card read-only */}
        {uiW('staff_home.today_shift') && todayShifts.length > 0 && (() => {
          const shift = todayShifts[0];
          const isPunched = punchRecords.some(r => r.type === 'in' && isToday(new Date(r.timestamp)));
          return (
            <div className="bg-accent rounded-2xl p-5 shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-white/70 text-[10px] font-semibold uppercase tracking-widest mb-1">
                    {t.scheduled_today}
                  </p>
                  <p className="text-white text-2xl font-bold">
                    {shift.start_time.slice(0,5)} – {shift.end_time ? shift.end_time.slice(0,5) : '…'}
                  </p>
                  <p className="text-white/60 text-xs mt-1 capitalize">
                    {shift.type === 'lunch' ? t.lunch : t.dinner}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${isPunched ? 'bg-white/25 border-white/30' : 'bg-white/15 border-white/20'}`}>
                  {isPunched
                    ? <CheckCircle className="w-5 h-5 text-white" />
                    : <Clock className="w-5 h-5 text-white" />
                  }
                </div>
              </div>
              {isPunched && (
                <div className="mt-3 flex items-center gap-1.5 bg-white/15 rounded-xl px-3 py-2">
                  <CheckCircle className="w-3.5 h-3.5 text-white/80 flex-shrink-0" />
                  <span className="text-white/80 text-[11px] font-medium">{t.already_punched}</span>
                </div>
              )}
            </div>
          );
        })()}

        {/* Prossimi turni */}
        {uiW('staff_home.upcoming') && (
        <div ref={shiftsListRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-[0.18em]">{t.upcoming_shifts}</h3>
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </div>

          {upcomingShifts.length === 0 && todayShifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <Clock className="w-7 h-7 mb-2 opacity-50" />
              <p className="text-sm">{t.no_shifts_scheduled}</p>
            </div>
          ) : sortedDates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <CheckCircle className="w-7 h-7 mb-2 opacity-50" />
              <p className="text-sm">Nessun turno futuro</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {sortedDates.map((dateStr) => {
                const dayShifts = grouped[dateStr].sort((a, b) => a.start_time.localeCompare(b.start_time));
                return (
                  <div key={dateStr} className="flex items-center px-5 py-3.5 gap-4">
                    <p className="text-slate-400 font-semibold text-xs uppercase tracking-wide flex-shrink-0 w-[68px] leading-tight">
                      {format(new Date(dateStr), 'EEE d MMM', { locale: dateLocale })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {dayShifts.map(s => (
                        <div
                          key={s.id}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-accent/8 border border-accent/20 text-accent-dark"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                          <span className="font-semibold text-xs">
                            {s.start_time.slice(0,5)} – {s.end_time ? s.end_time.slice(0,5) : '…'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {uiW('staff_home.holidays_button') &&
          visibleStaffTabs.includes('holidays') &&
          isStaffRequestsFeatureEnabled(featureFlags) &&
          !staffUnifiedTabs.includes('ferie') && (
          <button
            type="button"
            onClick={() => setHolidaysFocus(true)}
            className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center justify-between gap-3 text-left hover:border-accent/30 transition-colors min-h-[52px]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Palmtree className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-widest">{t.sidebar_holidays}</p>
                <p className="text-sm text-slate-500 truncate">{t.holiday_management}</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 flex-shrink-0" />
          </button>
        )}

      </div>
    );
  };

  const renderShifts = () => (
    <div className="space-y-4">
      {uiW('staff_shifts.summary') && (
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">{t.approved_hours_summary}</p>
          <p className="text-4xl font-bold text-slate-900">{totalApprovedHours}</p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
          <TrendingUp className="w-6 h-6 text-accent" />
        </div>
      </div>
      )}
      {uiW('staff_shifts.table') && (
        <WeeklyShiftsTable filterUserId={user.id} stickyDateBarInScrollPane />
      )}
    </div>
  );

  const deptLabels: Record<string, string> = {
    sala: (t as { department_sala?: string }).department_sala ?? 'Sala',
    kitchen: (t as { department_kitchen?: string }).department_kitchen ?? 'Cucina',
    bar: (t as { department_bar?: string }).department_bar ?? 'Bar',
  };
  const displayName = (displayUser?.first_name?.trim() || displayUser?.email?.split('@')[0] || 'Utente').trim() || 'Utente';
  const displayDept = displayUser?.department
    ? (getDepartments().find((d) => d.value === displayUser.department)?.label
      ?? deptLabels[displayUser.department]
      ?? displayUser.department)
    : ((t as { department_none?: string }).department_none ?? 'Nessuno');

  const renderProfile = () => (
    <div className="space-y-4">
      {uiW('staff_profile.panel') && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="ui-section-title text-slate-600">{(t as { profile_settings?: string }).profile_settings ?? 'Impostazioni profilo'}</h3>
        </div>
        <div>
          <AdminRow
            label={t.sidebar_profile}
            action={<span className="text-sm font-semibold text-slate-900 uppercase tracking-wide truncate max-w-[55%] text-right">{displayName}</span>}
          />
          <AdminRow
            label={(t as { email?: string }).email ?? 'Email'}
            action={<span className="text-sm text-slate-600 truncate max-w-[55%] text-right">{displayUser?.email ?? '—'}</span>}
          />
          <AdminRow
            label={(t as { phone?: string }).phone ?? 'Telefono'}
            action={<span className="text-sm text-slate-600">{displayUser?.phone ?? '—'}</span>}
          />
          <AdminRow
            label={(t as { department_label?: string }).department_label ?? 'Reparto'}
            action={<span className="text-sm text-slate-600">{displayDept}</span>}
          />
          <AdminRow label={t.profile_notifications} action={<NotificationCenter />} />
          <AdminRow
            className="!items-start"
            label={t.language}
            action={
              <div className="min-w-0 max-w-full sm:max-w-xs">
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
                className="w-full py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-60 transition-colors"
              >
                {seedingDemoProfile ? t.ui_ellipsis : t.settings_seed_demo_profile_btn}
              </button>
              <p className="text-[10px] text-slate-400 leading-relaxed">{t.settings_seed_demo_profile_hint}</p>
            </div>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="w-full flex items-center justify-between border-t border-slate-100 px-5 py-4 text-left hover:bg-red-50 transition-colors min-h-[52px] text-red-600 font-medium"
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
      {uiW('staff_holidays.header_actions') && (
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">{t.holiday_management}</h3>
        {displayUser.can_request_holidays !== false && (
          <button
            onClick={() => setIsHolidayModalOpen(true)}
            className="px-4 py-2 bg-accent text-white rounded-xl font-semibold text-xs uppercase tracking-wider shadow-sm hover:bg-accent-hover active:scale-95 transition-all"
          >
            + {t.new_request}
          </button>
        )}
      </div>
      )}
      {uiW('staff_holidays.list') && (holidays.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-sm text-slate-400">
          <Palmtree className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">{t.no_holidays_yet}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {holidays.map((holiday) => (
            <div key={holiday.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-slate-800 font-semibold text-sm">
                  {format(new Date(holiday.start_date), 'd MMM', { locale: dateLocale })} — {format(new Date(holiday.end_date), 'd MMM yyyy', { locale: dateLocale })}
                </p>
                {'reason' in holiday && typeof holiday.reason === 'string' && holiday.reason && (
                  <p className="text-slate-400 text-xs italic mt-1 truncate">"{holiday.reason}"</p>
                )}
              </div>
              <div className={`flex-shrink-0 px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase border tracking-wider ${
                holiday.status === 'approved'
                  ? 'text-accent border-accent/30 bg-accent/8'
                  : holiday.status === 'rejected'
                  ? 'text-red-600 border-red-200 bg-red-50'
                  : 'text-amber-700 border-amber-200 bg-amber-50'
              }`}>
                {holiday.status === 'approved' ? t.approved : holiday.status === 'rejected' ? t.rejected : t.pending}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );

  if (loading) return null;

  // Profilo gestionale solo Admin: nessun turno assegnato (Proprietario = stesso flusso Manager)
  if (isPurelyManagementRole(displayUser.role)) {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans antialiased flex flex-col items-center justify-center px-6 safe-area-pad">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-sm text-center">
          <Shield className="w-14 h-14 text-slate-400 mx-auto mb-4" strokeWidth={1.5} />
          <h2 className="text-lg font-bold text-slate-800 mb-2">Profilo Gestionale</h2>
          <p className="text-slate-500 text-sm">Nessun turno assegnato</p>
          <p className="text-slate-400 text-xs mt-3">Questo profilo è riservato alla gestione. Accedi al pannello di controllo per amministrare turni e personale.</p>
          <button
            type="button"
            onClick={onLogout}
            className="mt-6 w-full py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-sm hover:bg-slate-200 transition-colors"
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
    <div className="w-full text-slate-800 font-sans antialiased">
      {holidaysFocus && (
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setHolidaysFocus(false)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent min-h-[44px] px-2 -ml-2 rounded-xl hover:bg-accent/10 touch-target"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden />
            {(t as { back?: string }).back ?? 'Indietro'}
          </button>
          <span className="text-xs font-bold text-slate-600 uppercase tracking-widest truncate">{t.sidebar_holidays}</span>
        </div>
      )}

      {activeTab === 'home' && !holidaysFocus && uiW('staff_home.header_kpi') && showHomeKpiStrip && (
        <div className="pb-4 pt-1">
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-center">
                <p className="text-slate-400 text-[10px] font-medium uppercase tracking-widest mb-1">{t.week_hours}</p>
                <p className="text-slate-900 text-2xl font-bold tabular-nums">{totalApprovedHours}</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 text-center">
                <p className="text-slate-400 text-[10px] font-medium uppercase tracking-widest mb-1">{t.shifts_week}</p>
                <p className="text-slate-900 text-2xl font-bold tabular-nums">{upcomingShifts.length + todayShifts.length}</p>
              </div>
            </div>
          </div>
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
          >
            {holidaysFocus ? (
              renderHolidays()
            ) : (
              <>
                {activeTab === 'home' && renderHome()}
                {activeTab === 'turni' && renderShifts()}
                {activeTab === 'ferie' && renderHolidays()}
                {activeTab === 'timesheet' && (
                  <Suspense fallback={tabSpinner}>
                    <Timesheets />
                  </Suspense>
                )}
                {activeTab === 'reports' && (
                  <Suspense fallback={tabSpinner}>
                    <Statistics />
                  </Suspense>
                )}
                {activeTab === 'settings' && renderProfile()}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showInstallBanner && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="fixed bottom-[5.5rem] left-0 right-0 z-[45] flex justify-center px-4 max-w-screen-xl mx-auto"
          >
            <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-accent/20 px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center flex-shrink-0">
                {isIos ? <Share className="w-4 h-4 text-white" /> : <Download className="w-4 h-4 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 leading-tight">Installa l'app Osteria</p>
                {isIos ? (
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    Tocca <strong>Condividi</strong> → <strong>Aggiungi a schermata Home</strong>
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-0.5">Accedi più velocemente ai tuoi turni</p>
                )}
              </div>
              {!isIos && (
                <button type="button" onClick={handleInstall}
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors">
                  Installa
                </button>
              )}
              <button type="button" onClick={dismissInstallBanner}
                className="flex-shrink-0 p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" aria-label="Chiudi">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <RequestHolidayModal isOpen={isHolidayModalOpen} onClose={() => setIsHolidayModalOpen(false)} userId={user.id} />
    </div>
  );
}