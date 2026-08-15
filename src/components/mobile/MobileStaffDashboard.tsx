import ProfileNavTabPanel from '../ProfileNavTabPanel';
import type { AppNavTab } from '../../utils/enabledModules';
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { parseISO } from 'date-fns';
import { AnimatePresence, motion } from 'framer-motion';
import { LogOut, Moon, X } from 'lucide-react';
import type { User, Shift, PunchRecord, Language } from '../../types';
import { useAppUser } from '../../context/appSliceContexts';
import { useAppData } from '../../context/appSliceContexts';
import { useAppConfig } from '../../context/appSliceContexts';
import { PATH_PROFILO } from '../../config/appPaths';
import { APP_SESSION_STORAGE_KEY } from '../../constants/appSession';
import { persistStoredUiLanguage } from '../../utils/uiLanguagePreference';
import { applyUnauthenticatedDocumentTheme } from '../../utils/theme';
import { useNavigate } from 'react-router-dom';
import { useAppOverlay } from '../../context/appSliceContexts';
import { getTranslations, getDateLocale } from '../../utils/translations';
import { usePunchPresenceVerification } from '../../hooks/usePunchPresenceVerification';
import { TimeInputField } from '../ui/TimeInputField';
import { safeFormatDate } from '../../utils/safeDateFormat';
import MobileHome from './MobileHome';
import MobileStaffShifts from './MobileStaffShifts';
import { calculateUserStats } from '../../utils/stats';
import { hapticLight as lightHaptic, hapticHeavy as heavyHaptic } from '../../utils/haptics';
import { useSmartPunchAction } from '../../hooks/useSmartPunchAction';

const HolidayRequests = lazy(() => import('../HolidayRequests'));
const Statistics = lazy(() => import('../Statistics'));
const SettingsPage = lazy(() => import('../SettingsPage'));
const ManagementMobileTimesheet = lazy(() => import('./ManagementMobileTimesheet'));


export interface MobileStaffDashboardProps {
  user: User;
  language: Language;
  todayStr: string;
  now: Date;
  myShifts: Shift[];
  punchRecords: PunchRecord[];
  onTabChange?: (tab: AppNavTab) => void;
  greetingText: string;
  activeTab: AppNavTab;
  /** Se passati dal genitore (es. stesso calcolo KPI della Home), sovrascrivono gli stat interni. */
  weeklyMinutes?: number;
  monthlyMinutes?: number;
  monthDaysWorked?: number;
  weekCapMinutes?: number;
  onRefresh?: () => Promise<void> | void;
}

export default function MobileStaffDashboard({
  user,
  language,
  todayStr,
  now,
  myShifts,
  punchRecords,
  onTabChange,
  greetingText,
  activeTab,
  weeklyMinutes: weeklyMinutesProp,
  monthlyMinutes: monthlyMinutesProp,
  monthDaysWorked: monthDaysWorkedProp,
  weekCapMinutes: weekCapMinutesProp,
  onRefresh,
}: MobileStaffDashboardProps) {
  const t = getTranslations(language);
  const tv = t as Record<string, string>;
  const locale = getDateLocale(language);
  const { users } = useAppUser();
  const { updatePunchRecord, shifts: allShifts } = useAppData();
  const { showError, showSuccess } = useAppOverlay();
  const navigate = useNavigate();
  const { setCurrentUser, setIsSessionElevated } = useAppUser();
  const { featureFlags, breakRules } = useAppConfig();
  const { requestProof, modal: presenceModal } = usePunchPresenceVerification(language);
  const [tick, setTick] = useState(0);
  const [closeModal, setCloseModal] = useState<{
    shiftId: string;
    punchInId: string;
    plannedEnd: string;
    actualStart: string;
  } | null>(null);
  const [clockOutInput, setClockOutInput] = useState('');
  const [closingLoading, setClosingLoading] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const todayShifts = useMemo(
    () => myShifts.filter((s) => s.date === todayStr),
    [myShifts, todayStr],
  );

  const {
    execute: smartExecute,
    checkGeofence,
    isLoading: punchBusy,
    inProgress,
    shiftForStart,
    enriched,
  } = useSmartPunchAction({
    user,
    language,
    todayStr,
    now,
    todayShifts,
    punchRecords,
    onPresenceProof: requestProof,
  });

  const todayWorkShifts = useMemo(
    () => enriched.map((e) => e.shift),
    [enriched],
  );

  const stats = useMemo(() => {
    return calculateUserStats(user, myShifts, punchRecords, now, breakRules, {
      autoBreaksFeatureEnabled: featureFlags['auto_breaks'] !== false,
    });
  }, [user, myShifts, punchRecords, now, breakRules, featureFlags]);

  let elapsedLabel: string | null = null;
  if (inProgress?.punchIn) {
    const start = new Date(inProgress.punchIn.calculated_time || inProgress.punchIn.timestamp).getTime();
    const diff = Math.max(0, Date.now() - start);
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const sec = Math.floor((diff % 60000) / 1000);
    elapsedLabel = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  void tick;

  const canStart = !!shiftForStart && !punchBusy;
  const canEnd = !!inProgress && !inProgress.actualEnd && !punchBusy;

  const handleConfirmClose = useCallback(async () => {
    if (!closeModal || !clockOutInput) return;
    if (featureFlags['maintenance_mode'] === true && user.role !== 'admin') {
      showError?.(t.maintenance_mode_active || 'Sistema in manutenzione.');
      return;
    }
    if (!(await checkGeofence())) return;
    lightHaptic();
    setClosingLoading(true);
    try {
      const [h, m] = clockOutInput.split(':').map(Number);
      const base = parseISO(todayStr);
      const clockOutDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h ?? 0, m ?? 0, 0, 0);
      await updatePunchRecord(closeModal.punchInId, { clock_out_time: clockOutDate.toISOString() });
      showSuccess?.(t.home_toast_exit_registered);
      setCloseModal(null);
      setClockOutInput('');
    } catch {
      showError?.(t.home_toast_exit_error);
    } finally {
      setClosingLoading(false);
    }
  }, [closeModal, clockOutInput, todayStr, updatePunchRecord, showSuccess, showError, t, checkGeofence, featureFlags, user.role]);

  const statsLabels = {
    title: tv.mobile_dash_numbers ?? 'I miei numeri',
    week: tv.mobile_dash_this_week ?? 'Questa settimana',
    month: tv.mobile_dash_this_month ?? 'Questo mese',
    daysWorked: tv.mobile_dash_days_worked ?? 'Giorni lavorati',
  };

  const shiftTimeHint =
    inProgress && elapsedLabel
      ? `${inProgress.shift.start_time.slice(0, 5)} – ${inProgress.shift.end_time?.slice(0, 5) ?? '…'} · ${inProgress.shift.type === 'lunch' ? t.lunch : t.dinner}`
      : null;

  const tabSpinner = (
    <div className="flex items-center justify-center min-h-[200px]">
      <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <MobileHome
            greetingText={greetingText}
            todayLabel={safeFormatDate(todayStr, 'EEEE d MMMM', { locale })}
            statsLabels={statsLabels}
            weeklyMinutes={weeklyMinutesProp ?? stats.weeklyMinutes}
            monthlyMinutes={monthlyMinutesProp ?? stats.monthlyMinutes}
            monthDaysWorked={monthDaysWorkedProp ?? stats.monthDaysWorked}
            weekCapMinutes={weekCapMinutesProp ?? 40 * 60}
            inProgress={inProgress}
            elapsedLabel={elapsedLabel}
            todayWorkShiftsCount={todayWorkShifts.length}
            noShiftsHint={t.no_shifts_scheduled}
            tapStartHint={tv.mobile_dash_tap_start ?? 'Tocca Inizia per timbrare l’entrata.'}
            shiftTimeHint={shiftTimeHint}
            statusInShift={t.home_status_in_shift}
            todayShiftLabel={t.home_todays_shifts}
            inProgressLabel={t.legend_in_progress}
            nextShiftLabel={t.home_next_shift}
            savingLabel={t.saving}
            startLabel={tv.mobile_dash_start ?? 'Inizia'}
            endLabel={tv.mobile_dash_end ?? 'Fine turno'}
            canStart={canStart}
            canEnd={canEnd}
            punchBusy={punchBusy}
            onStart={() => { heavyHaptic(); void smartExecute(); }}
            onEnd={() => void smartExecute()}
            onNavigateToTimesheet={() => onTabChange?.('timesheet')}
            onRefresh={onRefresh}
            todayWorkShifts={todayWorkShifts}
            detailLabel={t.detail_link}
            myShifts={myShifts}
          />
        );
      case 'turni':
        return (
          <MobileStaffShifts user={user} myShifts={myShifts} language={language} todayStr={todayStr} />
        );
      case 'ferie':
        return (
          <Suspense fallback={tabSpinner}>
            <HolidayRequests />
          </Suspense>
        );
      case 'timesheet':
        return (
          <Suspense fallback={tabSpinner}>
            <ManagementMobileTimesheet
              variant="standalone"
              shifts={allShifts}
              punchRecords={punchRecords}
              users={users}
              currentUserId={user.id}
              language={language}
            />
          </Suspense>
        );
      case 'reports':
        return (
          <Suspense fallback={tabSpinner}>
            <Statistics />
          </Suspense>
        );
      case 'profile':
        return <ProfileNavTabPanel onLogout={() => {}} />;
      case 'settings':
        return (
          <Suspense fallback={tabSpinner}>
            <SettingsPage />
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-0 w-full flex-col font-sans">
      <div className="mx-auto w-full min-h-0 max-w-7xl flex flex-col">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>

      {presenceModal}
      </div>

      <AnimatePresence>
        {closeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setCloseModal(null);
                setClockOutInput('');
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="modal-glass-panel w-full max-w-sm rounded-2xl p-6"
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-extrabold text-white tracking-tight">
                    <Moon className="h-5 w-5 text-amber-600" />
                    {t.home_modal_close_dinner}
                  </h3>
                  <p className="mt-0.5 text-sm text-white/60">
                    {safeFormatDate(todayStr, 'd MMM', { locale })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCloseModal(null);
                    setClockOutInput('');
                  }}
                  className="rounded-xl p-1.5 hover:bg-slate-100 active:bg-slate-100/80"
                >
                  <X className="h-4 w-4 text-white/60" />
                </button>
              </div>
              <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-white/70">
                {t.home_label_exit_time}
              </label>
              <TimeInputField
                size="hero"
                value={clockOutInput}
                onChange={setClockOutInput}
                aria-label={t.home_label_exit_time}
                className="w-full tabular-nums"
                autoFocus
              />
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCloseModal(null);
                    setClockOutInput('');
                  }}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-white/70"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  disabled={!/^\d{2}:\d{2}$/.test((clockOutInput || '').trim()) || closingLoading}
                  onClick={() => void handleConfirmClose()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/15 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {closingLoading ? t.saving : (
                    <>
                      <LogOut className="h-4 w-4" />
                      {t.home_btn_register}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
