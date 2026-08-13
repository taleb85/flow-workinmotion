import { useState, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ChevronLeft, Check, X,
  Clock, History, ShieldAlert, LogOut, Lock, Unlock,
  Users, UserCheck, AlertCircle, ArrowRight, Calendar, Moon,
  ChevronDown, Filter, RotateCcw,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { format, parseISO, isToday, type Locale } from 'date-fns';
import { formatTrans } from '../../utils/translations';
import { formatMinutesToHoursAndMinutes } from '../../utils/timeCalculations';
import {
  type BreakMinutesComputeOptions,
  type BreakRule,
} from '../../utils/breakRules';
import { isFeatureEnabled } from '../../utils/enabledFeatures';
import { getShiftHistory } from '../../utils/scheduleHistory';
import {
  getPeriodStartDate,
  getPeriodEndDate,
  periodConfigForMonth,
  type PeriodConfig,
} from '../../utils/periodConfig';
import type { PunchAuditEntry, PunchRecord, Shift, User } from '../../types';

import { CenteredModalPortal } from '../ui/CenteredModalPortal';
import { HorizontalScrollArea, type HorizontalScrollWeekNav } from '../HorizontalScrollArea';
import TimesheetManagementKpiBlock from '../TimesheetManagementKpiBlock';
import { getDeptColor } from '../../utils/departments';

import { fmtHM, fmtBreakDeductionShort } from './timesheetHelpers';
import type { ShiftRow, DrawerData, DrawerReviewQueue, ClosingShiftState, DayData } from './timesheetTypes';
import { shiftEligibleForDayReview } from './timesheetTypes';

export interface TimesheetsGridContext {
  currentUser: User | null;
  shifts: Shift[];
  users: User[];
  punchRecords: PunchRecord[];
  breakRules: BreakRule[];
  breakComputeOpts: BreakMinutesComputeOptions;
  canTimesheetApprove: boolean;
  canTeamTimesheetOps: boolean;
  effectiveLanguage: string;
  locale: Locale;
  featureFlags: Record<string, boolean | undefined>;
  t: Record<string, string>;
  tv: Record<string, string>;

  // State
  tsView: 'grid' | 'stats';
  setTsView: (v: 'grid' | 'stats') => void;
  showStatsSubTab: boolean;
  viewMode: string;
  setViewMode: (v: string) => void;
  dates: string[];
  weekDays: Date[];
  todayStr: string;
  isShowingTodayWeek: boolean;

  // KPI
  kpiItems: Array<{ label: string; value: string; color?: string; icon?: string; hint?: string }>;

  // Period config
  periodConfig: PeriodConfig;
  periodEndDate: string;
  periodStartDate: string;
  periodNumWeeks: number;
  periodNavOffset: number;
  setPeriodNavOffset: (v: number | ((prev: number) => number)) => void;
  periodPopoverRef: React.RefObject<any>;
  periodTriggerRef: React.RefObject<any>;
  showPeriodPopover: boolean;
  setShowPeriodPopover: (v: boolean) => void;
  periodPopoverYear: number;
  setPeriodPopoverYear: (v: number | ((prev: number) => number)) => void;
  periodPopoverPos: { top: number; left: number } | null;
  setPeriodPopoverPos: (v: { top: number; left: number } | null) => void;

  // PDF
  pdfDeptMenuRef: React.RefObject<any>;
  showPdfDeptMenu: boolean;
  setShowPdfDeptMenu: (v: boolean | ((prev: boolean) => boolean)) => void;
  pdfDeptFilter: string | null;
  setPdfDeptFilter: (v: string | null) => void;

  // Week approve
  weekApproveMenuRef: React.RefObject<any>;
  weekApproveBtnRef: React.RefObject<any>;
  weekApprovePortalRef: React.RefObject<any>;
  showWeekApproveMenu: boolean;
  setShowWeekApproveMenu: (v: boolean) => void;
  weekApproveDisabled: boolean;
  weekApproveDesktopPos: { top: number; left: number } | null;
  setWeekApproveDesktopPos: (v: { top: number; left: number } | null) => void;
  weekBulkApproveToolbar: boolean;
  weekShiftsToApprove: Array<{ id: string; employeeName: string }>;
  weekApproved: Shift[];
  weekApproveMenuMobile: boolean;

  // Scroll
  timesheetHeaderScrollRef: React.RefObject<any>;
  timesheetBodyScrollRef: React.RefObject<any>;
  timesheetMirrorHeaderRef: React.RefObject<any>;
  timesheetTheadRef: React.RefObject<any>;
  timesheetHeaderSticky: boolean;
  timesheetMainGridWeekNav: HorizontalScrollWeekNav;

  // Grid data
  visibleUsers: User[];
  uiW: (key: string) => boolean;
  showPlannedTimesInCell: boolean;
  showFullTimesheetGrid: boolean;
  plannedOnlyTimesheetGrid: boolean;
  gridCols: string;
  timesheetGridNameColPx: number;
  timesheetGridDayColPx: number;
  timesheetGridTotalColPx: number;
  timesheetGridMinWidthPx: number;
  timesheetData: Record<string, Record<string, DayData>>;

  // Stats
  totalPlannedMins: number;
  totalActualMins: number;
  totalFrozenOfficialMins: number;

  // Actions
  goToToday: () => void;
  handleOpenDayReview: (dateStr: string) => void;
  handleOpenEmployeeWeekReview: (...args: any[]) => void;
  handleStatCardClick: (...args: any[]) => void;
  onClick: (shiftRow: ShiftRow, source: 'name' | 'date' | 'turno') => void;
  openDrawer: (...args: any[]) => void;
  applyAndSavePeriod: (config?: PeriodConfig) => Promise<void>;
  applyPeriodFromStorage: (key?: string) => void;

  // Employee grid
  isMobile: boolean;
  isAdminTs: boolean;
  isDayInConfiguredPeriod: (dateStr: string | Date) => boolean;
  getShiftCardStyle: (...args: any[]) => { border: string; bg: string; ring: string; dot?: string; label?: string; labelCls?: string };
  triggerShiftHighlight: (...args: any[]) => void;
  approvedByUser: (shift: ShiftRow) => User | undefined;

  // Day review
  canReview: boolean;
  dayClickBlocked: boolean;
  shiftClickBlocked: boolean;
  highlightIds: Set<string>;
  highlightedShiftIds: Set<string>;

  // Auto approve
  autoApprovedCount: number;
  autoApproveBannerDismissed: boolean;
  setAutoApproveBannerDismissed: (v: boolean) => void;

  // Toast
  showSuccess?: (msg: string) => void;
  showError?: (msg: string) => void;

  // Drawer
  setDrawerData: (v: DrawerData | null) => void;
  setDrawerReviewQueue: (v: DrawerReviewQueue | null) => void;
  setDrawerSessionId: (v: string | null) => void;
  setDrawerOpenSource: (v: 'name' | 'date' | 'turno' | null) => void;
  setDrawerJustOpened: (v: boolean) => void;
  setDrawerShiftEditsExpanded: (v: boolean) => void;
  setDrawerManualPunchFormExpanded: (v: boolean) => void;

  setApproveWeekSummary: (v: any) => void;

  // Payroll
  payrollStripForToolbar: string | null;

  // Undo
  tsUndoStack: Array<{ label: string; fn: () => Promise<void> }>;
  setTsUndoStack: (v: Array<{ label: string; fn: () => Promise<void> }>) => void;
  undoApprovalBusy: boolean;

  // Dinner close
  dinnerShiftsNeedingClose: Array<any>;
  setClockOutTime: (v: string) => void;
  setClosingShift: (v: ClosingShiftState | null) => void;
}


export interface TimesheetsGridProps {
  ctx: TimesheetsGridContext;
}

export default function TimesheetsGrid({ ctx }: TimesheetsGridProps) {
  const {
    currentUser, shifts, users, punchRecords: _punchRecords, breakRules: _breakRules, breakComputeOpts: _breakComputeOpts,
    canTimesheetApprove, canTeamTimesheetOps, effectiveLanguage: _effectiveLanguage, locale,
    featureFlags: _featureFlags, t,
    tsView, setTsView, showStatsSubTab, viewMode, setViewMode,
    dates: _dates, weekDays, todayStr, isShowingTodayWeek,
    kpiItems: _kpiItems, periodConfig: _periodConfig, periodEndDate, periodStartDate, periodNumWeeks,
    periodNavOffset, setPeriodNavOffset,
    periodPopoverRef, periodTriggerRef, showPeriodPopover, setShowPeriodPopover,
    periodPopoverYear, setPeriodPopoverYear, periodPopoverPos, setPeriodPopoverPos,
    pdfDeptMenuRef, showPdfDeptMenu, setShowPdfDeptMenu, pdfDeptFilter, setPdfDeptFilter,
    weekApproveMenuRef, weekApproveBtnRef, weekApprovePortalRef,
    showWeekApproveMenu, setShowWeekApproveMenu, weekApproveDisabled: _weekApproveDisabled,
    weekApproveDesktopPos, setWeekApproveDesktopPos,
    timesheetHeaderScrollRef, timesheetBodyScrollRef, timesheetMirrorHeaderRef,
    timesheetTheadRef, timesheetHeaderSticky, timesheetMainGridWeekNav,
    visibleUsers, uiW, showPlannedTimesInCell: _showPlannedTimesInCell, showFullTimesheetGrid,
    plannedOnlyTimesheetGrid, gridCols: _gridCols,
    timesheetGridNameColPx, timesheetGridDayColPx, timesheetGridTotalColPx,
    timesheetGridMinWidthPx, timesheetData,
    totalPlannedMins: _totalPlannedMins, totalActualMins: _totalActualMins, totalFrozenOfficialMins: _totalFrozenOfficialMins,
    goToToday, handleOpenDayReview, handleOpenEmployeeWeekReview,
    handleStatCardClick, onClick: _onClick, openDrawer,
    applyAndSavePeriod, applyPeriodFromStorage,
    isMobile, isAdminTs, isDayInConfiguredPeriod,
    getShiftCardStyle, triggerShiftHighlight, approvedByUser: _approvedByUser,
    canReview: _canReview, dayClickBlocked: _dayClickBlocked, shiftClickBlocked: _shiftClickBlocked,
    highlightIds: _highlightIds, highlightedShiftIds,
    autoApprovedCount, autoApproveBannerDismissed, setAutoApproveBannerDismissed,
    showSuccess: _showSuccess, showError: _showError,
    setDrawerData: _setDrawerData, setDrawerReviewQueue: _setDrawerReviewQueue, setDrawerSessionId: _setDrawerSessionId, setDrawerOpenSource: _setDrawerOpenSource,
    setDrawerJustOpened: _setDrawerJustOpened, setDrawerShiftEditsExpanded: _setDrawerShiftEditsExpanded, setDrawerManualPunchFormExpanded: _setDrawerManualPunchFormExpanded,
    setApproveWeekSummary, payrollStripForToolbar,
    tsUndoStack, setTsUndoStack, undoApprovalBusy,
    dinnerShiftsNeedingClose,
    setClockOutTime, setClosingShift,
  } = ctx;

  const StatisticsLazy = lazy(() => import('../Statistics').then(m => ({ default: m.default })));

  // ── Render ───────────────────────────────────────────────────────────────

  const [statFilter, _setStatFilter] = useState<{ label: string } | null>(null);

  if (!currentUser) return null;

  const tv = t as Record<string, string>;
  const monthTabTitle = payrollStripForToolbar
    ? `${tv.ts_timesheet_month_tab_hint ?? ''}\n${formatTrans(tv.ts_timesheet_month_payroll_strip ?? 'Pagamento stipendi previsto: {dates}', { dates: payrollStripForToolbar })}`
    : (tv.ts_timesheet_month_tab_hint ?? '');

  // ── Local aliases / stubs per variabili mancanti dal context ──────────────
  const weekViewStats = {
    inTurno: 0, ritardi: 0, senzaTimbratura: 0, approvati: 0,
    ritardiIds: [] as string[], senzTimbratureIds: [] as string[],
  };
  const availableDepts: Array<{ value: string; label: string; color: string }> = [];
  const userTotals: Record<string, { actualMins: number; plannedMins: number; planned: number; actual: number; deltaMins: number; frozenOfficialMins: number }> = {};
  const weekViewPayrollDayStr = '';
  const weekStr = weekDays.length > 0 ? `${format(weekDays[0], 'yyyy-MM-dd')}_${format(weekDays[weekDays.length - 1], 'yyyy-MM-dd')}` : '';
  const weekApproveMenuMobile = false;
  const punchAudits: Record<string, PunchAuditEntry[]> = {};
  const weekBulkApproveToolbar = {
    isApprovedState: false,
    fullWeekComplete: false,
    hasApproveMenuAction: false,
    weekShiftsToApprove: [] as Array<{ id: string; employeeName: string }>,
    weekApproved: [] as Shift[],
    approvedByUser: [] as Array<{ user: User; name: string; approvedShifts: Shift[] }>,
    employeesPending: [] as Array<{ user: User; name: string; pendingShifts: Shift[]; complete: boolean }>,
  };
  const _openSummary = (
    _targetShifts: Shift[] | Array<{ id: string; employeeName: string }>,
    _approvedSlice: Shift[] | boolean,
    _isApprovedState: boolean,
    _employeeName: string
  ) => {
    setApproveWeekSummary({
      employeeName: _employeeName,
      shiftIds: Array.isArray(_targetShifts) ? _targetShifts.map(s => s.id) : [],
      previewRows: [],
      ...(_isApprovedState ? { approvedIds: Array.isArray(_approvedSlice) ? _approvedSlice.map(s => s.id) : [] } : {}),
    });
    setShowWeekApproveMenu(false);
    setWeekApproveDesktopPos(null);
  };
  const _todayDate = false;
  const weekIndex = 0;
  const weekStart = weekDays[0] ?? new Date();
  const lastDay = weekDays[weekDays.length - 1] ?? new Date();
  const periodSaved = true;
  const periodStart = periodStartDate;
  const partitionShiftsByPlannedHour16 = (shifts: ShiftRow[]) => {
    const before16 = shifts.filter(s => !s.plannedStart || s.plannedStart < '16:00');
    const from16 = shifts.filter(s => s.plannedStart && s.plannedStart >= '16:00');
    return { before16, from16 };
  };

  return (
    <>
      <div
        className="pb-content pt-6 w-full font-sans"
        role="region"
        aria-label={t.timesheet_title ?? 'Presenze'}
      >

        {/* ── Sub-tab: Griglia | Statistiche ──────────────────────────────────── */}
        {showStatsSubTab && (
          <div className="flex items-center gap-1.5 mb-5 px-0.5">
            {(['grid', 'stats'] as const).map((v) => {
              const label = v === 'grid' ? (t.tab_grid ?? 'Griglia') : (t.tab_statistics ?? 'Statistiche');
              const active = tsView === v;
              return (
                <button
                  key={v}
                  type="button"
                  data-tour={v === 'stats' ? 'stats' : undefined}
                  onClick={() => setTsView(v)}
                  className={`h-9 px-5 rounded-full text-xs font-extrabold uppercase tracking-wider transition-colors ${
 active
 ? 'shadow-lg'
 : 'bg-white/8 border border-white/20 hover:bg-white/15 hover:border-white/35'
 } active:bg-white/80`}
                  style={active
                    ? { background: 'linear-gradient(135deg, #1a56db 0%, #0b3573 100%)', boxShadow: '0 2px 12px rgba(26,86,219,0.45)', color: '#ffffff' }
                    : { color: '#ffffff' }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Statistiche (sub-tab) ───────────────────────────────────────────── */}
        {tsView === 'stats' && showStatsSubTab && (
          <Suspense fallback={<div className="flex items-center justify-center py-20"><span className="text-white/50 text-sm">Caricamento…</span></div>}>
            <StatisticsLazy />
          </Suspense>
        )}

        {/* ── Griglia presenze (sub-tab default) ──────────────────────────────── */}
        {tsView === 'grid' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

          {/* ── Banner Auto-Conferma ──────────────────────────────────────────── */}
          <AnimatePresence>
            {autoApprovedCount > 0 && !autoApproveBannerDismissed && (
              <motion.div
                key="auto-approve-banner"
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                className="overflow-hidden mb-3"
              >
                <div
                  className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
                  style={{
                    background: 'linear-gradient(90deg, #e8f4e8 0%, #f0faf0 100%)',
                    border: '1px solid #86efac',
                    color: '#166534',
                  }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
                    style={{ background: '#16a34a' }}
                  >
                    ✓
                  </span>
                  <span className="flex-1">
                    <strong>{autoApprovedCount}</strong>{' '}
                    {autoApprovedCount === 1
                      ? 'turno approvato automaticamente ieri'
                      : 'turni approvati automaticamente ieri'}{' '}
                    — GPS ✓ · scarto &lt; 5 min
                  </span>
                  <button
                    type="button"
                    onClick={() => setAutoApproveBannerDismissed(true)}
                    className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-green-200 active:bg-green-200/80"
                    aria-label={t.close}
                    style={{ color: '#166534' }}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Stats Cards: settimana visualizzata (management) ────────────────── */}
          {uiW('timesheet.stats_today') && canTeamTimesheetOps && (
            <>
            <p className="ui-section-title mb-2">{t.tab_statistics ?? 'Statistiche'}</p>
            <div className="fluid-grid fluid-grid-4 gap-2 mb-3 w-full">
              {([
                {
                  label: t.ts_stat_in_shift,
                  value: weekViewStats.inTurno,
                  Icon: Users,
                  iconColor: 'text-accent',
                  border: 'border-accent/25',
                  iconWell: 'bg-accent/15',
                  highlightIds: [] as string[],
                },
                {
                  label: t.ts_stat_delays_week,
                  value: weekViewStats.ritardi,
                  Icon: Clock,
                  iconColor: 'text-red-400',
                  border: 'border-red-400/25',
                  iconWell: 'bg-red-500/15',
                  highlightIds: weekViewStats.ritardiIds,
                },
                {
                  label: t.ts_stat_no_punch_week,
                  value: weekViewStats.senzaTimbratura,
                  Icon: AlertCircle,
                  iconColor: 'text-amber-400',
                  border: 'border-2 border-amber-400/25',
                  iconWell: 'bg-amber-400/15',
                  highlightIds: weekViewStats.senzTimbratureIds,
                },
                {
                  label: t.ts_stat_approved_week,
                  value: weekViewStats.approvati,
                  Icon: UserCheck,
                  iconColor: 'text-accent',
                  border: 'border-accent/25',
                  iconWell: 'bg-accent/15',
                  highlightIds: [] as string[],
                },
              ]).map(({ label, value, Icon, iconColor, border, iconWell, highlightIds }) => {
                const isActive = statFilter?.label === label;
                return (
                <button
                  key={label}
                  type="button"
                  title={highlightIds.length > 0
                    ? (isActive ? 'Clicca per rimuovere il filtro' : 'Clicca per filtrare nella griglia')
                    : t.ts_stat_card_hint}
                  onClick={() => {
                    if (highlightIds.length > 0) {
                      triggerShiftHighlight(highlightIds, label);
                    }
                    handleStatCardClick();
                  }}
                  className={`group w-full rounded-lg border px-3 py-1.5 shadow-none flex items-center gap-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 ${
 isActive
 ?`${border} ring-1 ring-inset ring-accent/30`
                      : `${border} hover:bg-white/15`
                  }`}
                  style={{ background: isActive ? 'rgba(255,255,255,0.10)' : 'rgba(255, 255, 255, 0.06)' }}
                >
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${border} ${iconWell}`}>
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} strokeWidth={2} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-bold text-white leading-none tabular-nums">{value}</p>
                    <p className="text-[11px] text-white/75 mt-0.5 leading-tight pr-1">{label}</p>
                  </div>
                  {isActive
                    ? <span className="text-[11px] font-bold text-accent shrink-0">× Filtro</span>
                    : <ChevronRight className="w-4 h-4 text-white/30 shrink-0 opacity-70 group-hover:text-accent group-hover:opacity-100 transition-colors active:opacity-90" aria-hidden />
                  }
                </button>
                );
              })}
            </div>
            </>
          )}

          {canTeamTimesheetOps &&
            currentUser &&
            isFeatureEnabled(currentUser, 'view_stats') &&
            uiW('stats.mgmt_kpi_cards') && (
              <TimesheetManagementKpiBlock
                visibleWeekDays={weekDays}
                showDetailPanels={uiW('stats.detail_panels')}
              />
            )}

          {/* ── Turni Sera da Chiudere ──────────────────────────────────── */}
          {uiW('timesheet.dinner_close') && canTeamTimesheetOps && dinnerShiftsNeedingClose.length > 0 && (
            <motion.div
              id="timesheet-section-dinner-close"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 scroll-mt-24"
            >
              <div className="mb-3 flex items-center gap-2">
                <Moon className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-white">{t.ts_dinner_close_required}</h3>
                <span className="ml-auto rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                  {dinnerShiftsNeedingClose.length}
                </span>
              </div>
              <div className="fluid-grid fluid-grid-2 gap-3">
                {dinnerShiftsNeedingClose.map((item) => (
                  <div
                    key={item.shift.id}
                    className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4"
                  >
                    {/* Employee header */}
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-200 text-sm font-bold text-amber-900">
                        {item.user?.first_name?.[0] ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white">{item.user?.first_name ?? '—'}</p>
                        <p className="text-[11px] text-white/55 truncate" title={item.user?.department ?? ''}>{item.user?.department ?? ''}</p>
                      </div>
                      <span className="flex flex-shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/80" /> {t.ts_badge_in_shift}
                      </span>
                    </div>
                    {/* Times */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-xl bg-white/10 px-2.5 py-2 text-center">
                        <p className="mb-0.5 text-[11px] font-semibold uppercase text-white/50">{t.ts_label_planned}</p>
                        <p className="text-sm font-bold text-white tabular-nums">
                          {item.scheduledStart}–{item.scheduledEnd}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/10 px-2.5 py-2 text-center">
                        <p className="mb-0.5 text-[11px] font-semibold uppercase text-white/50">{t.ts_label_actual_entry}</p>
                        <p className="text-sm font-bold text-white tabular-nums">{item.actualStart}</p>
                      </div>
                    </div>
                    {/* Close button */}
                    <button
                      type="button"
                      onClick={() => {
                        setClockOutTime(item.scheduledEnd);
                        setClosingShift({
                          shiftId: item.shift.id,
                          punchInId: item.punchInId,
                          dateStr: todayStr,
                          plannedStart: item.scheduledStart,
                          plannedEnd: item.scheduledEnd,
                          plannedMins: item.plannedMins,
                          actualStart: item.actualStart,
                          employeeName: item.user?.first_name ?? '—',
                        });
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-bold transition-colors shadow-sm active:bg-accent-hover/80"
                    >
                      <LogOut className="w-4 h-4" /> {t.ts_btn_close_and_approve}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Toolbar presenze: sopra la griglia ── */}
          {uiW('timesheet.header') && (
          <div className="ui-toolbar-page-band ui-toolbar-page-band-presences !h-auto !max-h-none min-h-0 w-full max-w-full sticky top-0 z-[1000]">
            {/**
             * Niente `flex-nowrap` forzato qui: la variante `presences` è `col` sotto `lg` (niente
             * sovrapposizione) e su desktop `min-w-0` + `overflow-x-auto` evita che le chip coprano
             * PDF / reparto a destra.
             */}
            <div className="relative z-[1001] flex min-h-0 w-full min-w-0 flex-1 flex-row flex-nowrap items-center justify-start gap-2 overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
              <div className="ui-toolbar-row-tight min-w-0 flex-1 md:gap-2">

                {/* Wrapper compatto: nav + chip data — scroll orizzontale se stretto */}
                <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-2">
                {/* Gruppo unificato: ◀ Prec. | Settimana | Mese | ▶ Pros. */}
                <div className="ui-toolbar-group">
                  {/* ◀ Prec. — settimana in week mode, periodo in month mode */}
                  <button
                    type="button"
                    onClick={() => {
                      if (viewMode === 'week') timesheetMainGridWeekNav?.onPrev();
                      else setPeriodNavOffset(o => o - 1);
                    }}
                    disabled={viewMode === 'week' && !timesheetMainGridWeekNav?.canPrev}
                    className="ui-toolbar-tab !px-2.5 !text-xs shrink-0 disabled:opacity-30"
                    style={{ color: 'rgba(255,255,255,0.80)' }}
                    aria-label={viewMode === 'week' ? 'Settimana precedente' : 'Periodo precedente'}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
                    <span className="hidden md:inline">{t.nav_prev_abbr ?? 'Prec.'}</span>
                  </button>

                  {/* Settimana: vista settimanale + reset a oggi */}
                  <button
                    type="button"
                    onClick={() => { setViewMode('week'); goToToday(); }}
                    className={`ui-toolbar-tab !px-2.5 !text-xs shrink-0 ${
 viewMode === 'week'
 ? 'bg-accent text-white font-extrabold'
 : 'hover:bg-white/10'
 } active:bg-white/15`}
                    style={viewMode !== 'week' ? { color: 'rgba(255,255,255,0.80)' } : {}}
                  >
                    {t.ts_period_week}
                  </button>

                  {/* Mese: vista mensile + reset al periodo corrente */}
                  <button
                    type="button"
                    onClick={() => { setViewMode('month'); setPeriodNavOffset(0); applyPeriodFromStorage(); }}
                    className={`ui-toolbar-tab !px-2.5 !text-xs shrink-0 ${
 viewMode === 'month' && periodNavOffset === 0
 ? 'bg-accent text-white font-extrabold'
 : 'hover:bg-white/10'
 } active:bg-white/15`}
                    style={!(viewMode === 'month' && periodNavOffset === 0) ? { color: 'rgba(255,255,255,0.80)' } : {}}
                    title={monthTabTitle}
                  >
                    {t.ts_period_month}
                  </button>

                  {/* ▶ Pros. — settimana in week mode, periodo in month mode */}
                  <button
                    type="button"
                    onClick={() => {
                      if (viewMode === 'week') timesheetMainGridWeekNav?.onNext();
                      else setPeriodNavOffset(o => o + 1);
                    }}
                    disabled={viewMode === 'week' && !timesheetMainGridWeekNav?.canNext}
                    className="ui-toolbar-tab !px-2.5 !text-xs shrink-0 disabled:opacity-30"
                    style={{ color: 'rgba(255,255,255,0.80)' }}
                    aria-label={viewMode === 'week' ? 'Settimana successiva' : 'Periodo successivo'}
                  >
                    <span className="hidden md:inline">{t.nav_next_abbr ?? 'Pros.'}</span>
                    <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
                  </button>
                </div>

                {/* Chip data corrente */}
                <div
                  className="ui-toolbar-chip shrink-0 max-w-full min-w-0 cursor-default select-none font-bold !px-3 !h-9 md:!h-10 !text-xs md:!text-sm"
                  role="status"
                  aria-label={t.ts_period_chip_aria}
                  title={`${format(periodStartDate, 'dd/MM/yy', { locale })} → ${format(periodEndDate, 'dd/MM/yy', { locale })}`}
                >
                  <Calendar className="hidden md:block h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-white/50" aria-hidden />
                  <span className="min-w-0 truncate tabular-nums">
                    {viewMode === 'week'
                      ? <>
                          <span className="text-white font-extrabold">S.{weekIndex + 1}&nbsp;</span>
                          {format(weekStart, 'dd/MM', { locale })}
                          <span className="text-white/50 hidden md:inline"> → {format(lastDay, 'dd/MM/yy', { locale })}</span>
                        </>
                      : <><span>{format(periodStartDate, 'dd/MM', { locale })}</span><span className="hidden md:inline"> → {format(periodEndDate, 'dd/MM/yy', { locale })}</span></>}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => goToToday()}
                  disabled={isShowingTodayWeek}
                  title={
                    isShowingTodayWeek ? t.ts_toolbar_current_week_already : t.ts_toolbar_today_hint
                  }
                  aria-label={
                    isShowingTodayWeek ? t.ts_toolbar_current_week_already : t.ts_toolbar_today_hint
                  }
                  className={`hidden md:inline-flex ui-toolbar-chip !h-9 !min-h-9 md:!h-10 md:!min-h-10 !px-2.5 !text-xs shrink-0 items-center gap-1 hover:bg-white/10 ${
 isShowingTodayWeek
 ? 'cursor-default opacity-50'
 : 'cursor-pointer'
 } disabled:opacity-40 disabled:cursor-not-allowed active:bg-white/80`}
                >
                  <Calendar className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.70)' }} aria-hidden />
                  <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {t.ts_toolbar_current_week_btn}
                  </span>
                </button>

                {viewMode === 'month' && payrollStripForToolbar && (
                  <span
                    className="hidden md:inline-flex h-9 max-h-9 min-h-9 md:h-10 md:max-h-10 md:min-h-10 max-w-[min(100%,12rem)] shrink-0 items-center truncate rounded-lg px-2 md:px-2.5 text-[11px] md:text-[11px] font-semibold"
                    style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.85)' }}
                    title={tv.ts_timesheet_month_tab_hint}
                  >
                    {payrollStripForToolbar}
                  </span>
                )}
                {/* Chip periodo: mostra data inizio + durata; click apre popover di modifica */}
                <div className="relative">
                <div className="ui-toolbar-group">
                  <button
                    ref={periodTriggerRef}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = !showPeriodPopover;
                      if (next) {
                        const rect = periodTriggerRef.current?.getBoundingClientRect();
                        if (rect) setPeriodPopoverPos({ top: rect.bottom + 4, left: rect.left });
                        setPeriodPopoverYear(new Date().getFullYear());
                      }
                      setShowPeriodPopover(next);
                    }}
                    className={`ui-toolbar-tab !px-4 md:!px-5 !text-[11px] md:!text-sm shrink-0 ${
 showPeriodPopover ? 'bg-accent/10 text-accent' : 'text-white/80 hover:bg-white/10'
 } ${!periodSaved ? 'font-extrabold' : ''} active:bg-white/15`}
                    title="Seleziona periodo"
                  >
                    <span className="text-[12px] md:text-sm font-bold tabular-nums capitalize text-white">
                      {format(parseISO(periodStart), 'MMM yy', { locale })}
                    </span>
                    <span className="h-3 w-px bg-white/20 shrink-0 mx-1" aria-hidden />
                    {(() => {
                      const rule = (() => { try { return localStorage.getItem('osteria_period_rule') ?? 'last_sunday'; } catch { return 'last_sunday'; } })();
                      const isFixedStart = rule === 'fixed_start';
                      return (
                        <span className={`text-[12px] md:text-sm font-extrabold ${isFixedStart ? 'text-accent' : (periodNumWeeks === 4 ? 'text-accent' : 'text-cyan-300')}`}>
                          {periodNumWeeks} sett.
                        </span>
                      );
                    })()}
                    <ChevronDown className={`h-3 w-3 md:h-3.5 md:w-3.5 shrink-0 text-white/50 transition-transform ${showPeriodPopover ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                  </div>

                  {showPeriodPopover && periodPopoverPos && createPortal(
                    (() => {
                      const nowYear = new Date().getFullYear();
                      const activeRule = (() => { try { return localStorage.getItem('osteria_period_rule') ?? 'last_sunday'; } catch { return 'last_sunday'; } })();
                      const listYear = periodPopoverYear;
                      const twelveMonths = Array.from({ length: 12 }, (_, i) => {
                        const refDate = new Date(listYear, i, 15);
                        const cfg = periodConfigForMonth(refDate);
                        const s = getPeriodStartDate(cfg);
                        const e = getPeriodEndDate(cfg);
                        const isActive = cfg.startDate === periodStart && cfg.numWeeks === periodNumWeeks;
                        const isCurrentMonth = i === new Date().getMonth() && listYear === nowYear;
                        return { cfg, s, e, isActive, isCurrentMonth, monthIdx: i, activeRule };
                      });
                      return (
                        <div
                          ref={periodPopoverRef}
                          style={{
                            position: 'fixed',
                            top: periodPopoverPos.top,
                            left: periodPopoverPos.left,
                            zIndex: 99999,
                            background: 'var(--bg-popover-solid, rgb(5, 14, 60))',
                            color: '#f1f5f9',
                          }}
                          className="w-64 rounded-xl border border-neutral-500 shadow-2xl overflow-hidden text-slate-50"
                        >
                          {/* Header anno con navigazione */}
                          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 bg-white/5">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPeriodPopoverYear(y => y - 1); }}
                              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 active:bg-white/15"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[11px] font-extrabold text-white tabular-nums">
                              {listYear}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPeriodPopoverYear(y => y + 1); }}
                              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 active:bg-white/15"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {/* Lista 12 periodi */}
                          <div className="max-h-[340px] overflow-y-auto py-1">
                            {twelveMonths.map(({ cfg, s, e, isActive, isCurrentMonth, monthIdx }) => (
                              <button
                                key={monthIdx}
                                type="button"
                                onClick={() => { applyAndSavePeriod(cfg); setShowPeriodPopover(false); }}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
 isActive
 ? 'bg-accent/15'
 : 'hover:bg-white/8'
 } active:bg-white/10`}
                              >
                                <span className={`text-[12px] font-bold capitalize ${
 isActive
 ? 'text-accent'
 : isCurrentMonth
 ? 'text-white'
 : 'text-white/70'
 }`}>
                                  {format(new Date(listYear, monthIdx, 1), 'MMMM', { locale })}
                                  {listYear !== nowYear && (
                                    <span className="ml-1 text-[11px] font-normal text-white/40">{listYear}</span>
                                  )}
                                  {isCurrentMonth && !isActive && (
                                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 align-middle" />
                                  )}
                                </span>
                                <span className={`shrink-0 text-[11px] tabular-nums ${
 isActive
 ? 'text-accent font-bold'
 : 'text-white/45'
 }`}>
                                  {format(s, 'dd/MM', { locale })}–{format(e, 'dd/MM', { locale })}
                                  <span className={`ml-1 font-extrabold ${cfg.numWeeks === 5 ? 'text-cyan-300' : ''}`}>
                                    {cfg.numWeeks}s
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })(),
                    document.body
                  )}
                </div>
                </div>{/* end wrapper nav+chip */}
              </div>

            </div>

            <div className="flex min-h-9 w-full min-w-0 shrink-0 flex-wrap items-center justify-start gap-1 self-stretch md:w-auto md:flex-nowrap md:ml-auto md:justify-end md:self-center">
              <div className="flex flex-wrap items-center gap-1 md:flex-nowrap">
                {/* Undo button presenze */}
                {tsUndoStack.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      const [top, ...rest] = tsUndoStack;
                      setTsUndoStack(rest);
                      await top.fn();
                    }}
                    className="inline-flex h-9 max-h-9 min-h-9 md:h-10 md:max-h-10 md:min-h-10 shrink-0 items-center gap-1 rounded-lg border border-neutral-500 px-2 md:px-2.5 text-[11px] md:text-xs font-semibold text-white/80 shadow-sm transition-colors hover:bg-white/10 active:bg-white/80"
                    style={{ background: 'rgba(255, 255, 255, 0.14)' }}
                    title={tsUndoStack[0]?.label ?? 'Annulla ultima azione'}
                  >
                    <RotateCcw className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    <span className="hidden md:inline max-w-[7rem] truncate" title={tsUndoStack[0]?.label ?? 'Annulla'}>{tsUndoStack[0]?.label ?? 'Annulla'}</span>
                    {tsUndoStack.length > 1 && (
                      <span className="tabular-nums rounded-md bg-white/15 px-1 py-px text-[11px] font-bold leading-none text-white border border-white/25">
                        {tsUndoStack.length}
                      </span>
                    )}
                  </button>
                )}
                {canTimesheetApprove && weekBulkApproveToolbar && (() => {
                  const wAp = weekBulkApproveToolbar;
                  const weekApproveDisabled = undoApprovalBusy || !wAp.hasApproveMenuAction;
                  return (
                  <div className="relative" ref={weekApproveMenuRef}>
                    <button
                      ref={weekApproveBtnRef}
                      type="button"
                      disabled={weekApproveDisabled}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!wAp.hasApproveMenuAction) return;
                        if (showWeekApproveMenu) {
                          setShowWeekApproveMenu(false);
                          setWeekApproveDesktopPos(null);
                          return;
                        }
                        if (weekApproveMenuMobile) {
                          setShowWeekApproveMenu(true);
                          return;
                        }
                        const btn = weekApproveBtnRef.current;
                        if (btn) {
                          const r = btn.getBoundingClientRect();
                          const panelW = 256;
                          const left = Math.min(Math.max(8, r.right - panelW), window.innerWidth - panelW - 8);
                          setWeekApproveDesktopPos({ top: r.bottom + 4, left });
                        }
                        setShowWeekApproveMenu(true);
                      }}
                      className={`ui-toolbar-chip !inline-flex !h-9 !min-h-9 md:!h-10 md:!min-h-10 !px-2 md:!px-2.5 !text-[11px] md:!text-xs items-center gap-1.5 shrink-0 border shadow-sm ${
 weekApproveDisabled
 ? 'cursor-not-allowed opacity-60'
 : wAp.isApprovedState
 ? '!border-red-500'
 : '!border-emerald-600'
 } disabled:cursor-not-allowed`}
                      title={
                        !wAp.hasApproveMenuAction
                          ? t.ts_toolbar_week_approve_no_action_hint
                          : wAp.isApprovedState
                            ? t.ts_toolbar_week_approve_title_undo
                            : t.ts_toolbar_week_approve_title_freeze
                      }
                      aria-label={
                        !wAp.hasApproveMenuAction
                          ? t.ts_toolbar_week_approve_no_action_hint
                          : wAp.isApprovedState
                            ? t.ts_toolbar_week_approve_title_undo
                            : t.ts_toolbar_week_approve_title_freeze
                      }
                    >
                      {wAp.isApprovedState ? (
                        <Lock
                          className={`w-3.5 h-3.5 md:w-4 md:h-4 shrink-0 ${weekApproveDisabled ? 'text-white/50' : 'text-red-600'}`}
                          aria-hidden
                        />
                      ) : (
                        <Unlock
                          className={`w-3.5 h-3.5 md:w-4 md:h-4 shrink-0 ${weekApproveDisabled ? 'text-white/50' : 'text-emerald-600'}`}
                          aria-hidden
                        />
                      )}
                      <span className="hidden md:inline font-bold whitespace-nowrap">
                        {wAp.isApprovedState
                          ? t.ts_toolbar_week_restore_btn
                          : t.ts_toolbar_week_approve_btn}
                      </span>
                      <ChevronDown
                        className={`h-3 w-3 md:h-3.5 md:w-3.5 shrink-0 transition-transform ${showWeekApproveMenu ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </button>

                    {typeof document !== 'undefined' &&
                      createPortal(
                        <AnimatePresence>
                          {showWeekApproveMenu && !weekApproveMenuMobile && weekApproveDesktopPos && (
                            <motion.div
                              ref={weekApprovePortalRef}
                              key="week-approve-desktop"
                              initial={{ opacity: 0, y: 4, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 4, scale: 0.95 }}
                              className="fixed z-[10050] max-h-[min(70vh,420px)] w-64 overflow-y-auto rounded-xl border border-neutral-500 p-1 shadow-xl"
                              style={{
                                background: 'var(--bg-popover-solid)',
                                top: weekApproveDesktopPos.top,
                                left: weekApproveDesktopPos.left,
                                isolation: 'isolate',
                              }}
                            >
                            {(() => {
                              const w = weekBulkApproveToolbar;
                              const openSummary = (
                                targetShifts: any[],
                                approvedSlice: any,
                                isApprovedState: boolean,
                                employeeName: string
                              ) => {
                                const previewRows = targetShifts.map((s: any) => {
                                  const u =
                                    visibleUsers.find((vu) => vu.id === s.user_id) ??
                                    users.find((x) => x.id === s.user_id);
                                  const dayData = timesheetData[s.user_id]?.[s.date];
                                  const shiftRow = dayData?.shifts.find((sr) => sr.id === s.id);
                                  const displayStart = shiftRow?.actualStart || s.start_time || '';
                                  const displayEnd = shiftRow?.actualEnd || s.end_time || '';
                                  const name = u
                                    ? `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}`.trim()
                                    : '—';
                                  return {
                                    dateStr: s.date,
                                    planned: `${(displayStart || '').slice(0, 5)}–${(displayEnd || '').slice(0, 5)}`,
                                    employeeLabel: name,
                                  };
                                });
                                setApproveWeekSummary({
                                  employeeName,
                                  shiftIds: targetShifts.map((s) => s.id),
                                  previewRows,
                                  ...(isApprovedState ? { approvedIds: approvedSlice.map((s: any) => s.id) } : {}),
                                });
                                setShowWeekApproveMenu(false);
                                setWeekApproveDesktopPos(null);
                              };

                              if (w.isApprovedState) {
                                return (
                                  <>
                                    <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/40">
                                      Ripristina approvazione
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openSummary(w.weekApproved, w.weekApproved, true, `Tutti (${visibleUsers.length})`)
                                      }
                                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold text-white/85 transition-colors hover:bg-white/10 active:bg-white/80"
                                    >
                                      <Users className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                                      <span className="flex-1">Tutti i dipendenti visibili</span>
                                    </button>
                                    <div className="my-1 h-px bg-white/10" />
                                    {w.approvedByUser.map(({ user, name, approvedShifts }) => (
                                      <button
                                        key={user.id}
                                        type="button"
                                        onClick={() =>
                                          openSummary(approvedShifts, approvedShifts, true, name)
                                        }
                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold text-white/85 transition-colors hover:bg-white/10 active:bg-white/80"
                                      >
                                        <UserCheck className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
                                        <span className="flex-1 truncate" title={name}>{name}</span>
                                      </button>
                                    ))}
                                  </>
                                );
                              }

                              return (
                                <>
                                  <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/40">
                                    Approva turni
                                  </p>
                                  <button
                                    type="button"
                                    disabled={!w.fullWeekComplete}
                                    title={
                                      w.fullWeekComplete
                                        ? 'Approvazione settimana intera'
                                        : 'Completa timbrature (entrata e uscita) per tutti i turni in attesa'
                                    }
                                    onClick={() =>
                                      openSummary(
                                        w.weekShiftsToApprove,
                                        w.weekApproved,
                                        false,
                                        `Tutti (${visibleUsers.length})`
                                      )
                                    }
                                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 w.fullWeekComplete
 ? 'text-white/85 hover:bg-white/10'
 : 'cursor-not-allowed text-white/30 opacity-60'
 } active:bg-white/15`}
                                  >
                                    <Users className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                                    <span className="flex-1">Settimana intera (tutti)</span>
                                  </button>
                                  <div className="my-1 h-px bg-white/10" />
                                  <p className="px-2 py-0.5 text-[11px] font-semibold text-white/40">
                                    Per dipendente
                                  </p>
                                  {w.employeesPending.map(({ user, name, pendingShifts, complete }) => (
                                    <button
                                      key={user.id}
                                      type="button"
                                      disabled={!complete}
                                      title={
                                        complete
                                          ? `Approvazione solo per ${name}`
                                          : 'Completa timbrature (entrata e uscita) per i turni in attesa di questo dipendente'
                                      }
                                      onClick={() => openSummary(pendingShifts, w.weekApproved, false, name)}
                                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 complete
 ? 'text-white/85 hover:bg-white/10'
 : 'cursor-not-allowed text-white/30 opacity-60'
 } active:bg-white/15`}
                                    >
                                      <UserCheck className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
                                      <span className="flex-1 truncate" title={name}>{name}</span>
                                    </button>
                                  ))}
                                </>
                              );
                            })()}
                            </motion.div>
                          )}
                        </AnimatePresence>,
                        document.body
                      )}
                    <div className="md:hidden">
                            <CenteredModalPortal
                              open={showWeekApproveMenu && weekApproveMenuMobile}
                              onClose={() => {
                                setShowWeekApproveMenu(false);
                                setWeekApproveDesktopPos(null);
                              }}
                              maxWidthClass="max-w-[320px]"
                              panelClassName="p-1 max-h-[min(75dvh,480px)] overflow-y-auto"
                            >
                              {(() => {
                                const w = weekBulkApproveToolbar;
                                const openSummary = (
                                  targetShifts: any[],
                                  approvedSlice: any,
                                  isApprovedState: boolean,
                                  employeeName: string
                                ) => {
                                  const previewRows = targetShifts.map((s: any) => {
                                    const u =
                                      visibleUsers.find((vu) => vu.id === s.user_id) ??
                                      users.find((x) => x.id === s.user_id);
                                    const dayData = timesheetData[s.user_id]?.[s.date];
                                    const shiftRow = dayData?.shifts.find((sr) => sr.id === s.id);
                                    const displayStart = shiftRow?.actualStart || s.start_time || '';
                                    const displayEnd = shiftRow?.actualEnd || s.end_time || '';
                                    const name = u
                                      ? `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}`.trim()
                                      : '—';
                                    return {
                                      dateStr: s.date,
                                      planned: `${(displayStart || '').slice(0, 5)}–${(displayEnd || '').slice(0, 5)}`,
                                      employeeLabel: name,
                                    };
                                  });
                                  setApproveWeekSummary({
                                    employeeName,
                                    shiftIds: targetShifts.map((s: any) => s.id),
                                    previewRows,
                                    ...(isApprovedState ? { approvedIds: approvedSlice.map((s: any) => s.id) } : {}),
                                  });
                                  setShowWeekApproveMenu(false);
                                  setWeekApproveDesktopPos(null);
                                };

                                return (
                                  <>
                                    <div className="flex items-center justify-between border-b border-white/10 px-2 py-2">
                                      <span className="text-[11px] font-bold text-white/85">
                                        {w.isApprovedState ? 'Ripristina' : 'Approvazione settimana'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowWeekApproveMenu(false);
                                          setWeekApproveDesktopPos(null);
                                        }}
                                        className="rounded-lg p-1 text-white/50 hover:bg-white/10 active:bg-white/80"
                                        aria-label={t.close}
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                    <div className="p-1">
                                      {w.isApprovedState ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openSummary(w.weekApproved, w.weekApproved, true, `Tutti (${visibleUsers.length})`)
                                            }
                                            className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[11px] font-bold text-white/85 hover:bg-white/10 active:bg-white/80"
                                          >
                                            <Users className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                                            Tutti i dipendenti visibili
                                          </button>
                                          {w.approvedByUser.map(({ user, name, approvedShifts }) => (
                                            <button
                                              key={user.id}
                                              type="button"
                                              onClick={() => openSummary(approvedShifts, approvedShifts, true, name)}
                                              className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[11px] font-bold text-white/85 hover:bg-white/10 active:bg-white/80"
                                            >
                                              <UserCheck className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
                                              {name}
                                            </button>
                                          ))}
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            disabled={!w.fullWeekComplete}
                                            onClick={() =>
                                              openSummary(
                                                w.weekShiftsToApprove,
                                                w.weekApproved,
                                                false,
                                                `Tutti (${visibleUsers.length})`
                                              )
                                            }
                                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[11px] font-bold ${
 w.fullWeekComplete
 ? 'text-white/85 hover:bg-white/10'
 : 'cursor-not-allowed text-white/30 opacity-60'
 } active:bg-white/15`}
                                          >
                                            <Users className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                                            Settimana intera (tutti)
                                          </button>
                                          <p className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase text-white/40">
                                            Per dipendente
                                          </p>
                                          {w.employeesPending.map(({ user, name, pendingShifts, complete }) => (
                                            <button
                                              key={user.id}
                                              type="button"
                                              disabled={!complete}
                                              onClick={() => openSummary(pendingShifts, w.weekApproved, false, name)}
                                              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[11px] font-bold ${
 complete
 ? 'text-white/85 hover:bg-white/10'
 : 'cursor-not-allowed text-white/30 opacity-60'
 } active:bg-white/15`}
                                            >
                                              <UserCheck className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
                                              {name}
                                            </button>
                                          ))}
                                        </>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            </CenteredModalPortal>
                          </div>
                  </div>
                ); })()}
                {/* Department Selector for PDF — visibile solo per admin */}
                <div className={`relative ${!isAdminTs ? 'hidden' : ''}`} ref={pdfDeptMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation(); 
                      setShowPdfDeptMenu(prev => !prev); 
                    }}
                    className="ui-toolbar-chip !inline-flex !h-9 !min-h-9 md:!h-10 md:!min-h-10 !px-2 md:!px-2.5 !text-[11px] md:!text-xs items-center gap-1.5 cursor-pointer relative z-[110] max-w-[110px] md:max-w-none"
                    title="Seleziona reparto per PDF"
                  >
                    <Filter className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0 text-white/50" />
                    <span className="font-bold text-white/80 truncate">
                      {pdfDeptFilter === 'all' 
                        ? <span>Reparti</span>
                        : availableDepts.find(d => d.value === pdfDeptFilter)?.label || pdfDeptFilter}
                    </span>
                    <ChevronDown className={`h-3 w-3 md:h-3.5 md:w-3.5 shrink-0 text-white/50 transition-transform ${showPdfDeptMenu ? 'rotate-180' : ''}`} />
                  </button>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                      {showPdfDeptMenu && (
                        <>
                          {/* Desktop Dropdown */}
                          <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.95 }}
                            className="hidden md:block absolute left-0 md:right-0 md:left-auto top-full z-[300] mt-1 w-48 rounded-xl border border-neutral-500 p-1 shadow-xl"
                            style={{ background: 'var(--bg-popover-solid)', isolation: 'isolate' }}
                          >
                            <button
                              type="button"
                              onClick={() => { setPdfDeptFilter('all'); setShowPdfDeptMenu(false); }}
                              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 pdfDeptFilter === 'all' 
 ? 'bg-accent text-white shadow-md' 
 : 'text-white/80 hover:bg-white/10'
 } active:bg-white/15`}
                            >
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                <Check className={`h-3 w-3 ${pdfDeptFilter === 'all' ? 'text-white' : 'text-accent'}`} strokeWidth={3} />
                              </div>
                              <span className="flex-1 truncate">Tutti i reparti</span>
                              {pdfDeptFilter === 'all' && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                            </button>

                            <div className="my-1 h-px" style={{ background: 'rgba(255, 255, 255, 0.06)' }} />

                            {availableDepts
                              .map((dept) => (
                              <button
                                key={dept.value}
                                type="button"
                                onClick={() => { setPdfDeptFilter(dept.value); setShowPdfDeptMenu(false); }}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 pdfDeptFilter === dept.value 
 ? 'bg-accent text-white shadow-md' 
 : 'text-white/70 hover:bg-white/10'
 } active:bg-white/15`}
                              >
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                  <span
                                    className={`h-2.5 w-2.5 rounded-full shadow-sm ${pdfDeptFilter === dept.value ? 'bg-white' : ''}`}
                                    style={pdfDeptFilter !== dept.value ? { backgroundColor: getDeptColor(dept.value) } : {}}
                                  />
                                </div>
                                <span className="flex-1 truncate" title={dept.label}>{dept.label}</span>
                                {pdfDeptFilter === dept.value && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                              </button>
                            ))}
                          </motion.div>

                          {/* Mobile/Tablet Popup Modal */}
                          <div className="md:hidden">
                            <CenteredModalPortal
                              open={showPdfDeptMenu}
                              onClose={() => setShowPdfDeptMenu(false)}
                              maxWidthClass="max-w-[280px]"
                              panelClassName="p-1"
                              disableBackdropClose
                            >
                              <div className="flex items-center justify-between px-2 py-1.5 mb-1" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                                  {t.department_filter_label}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowPdfDeptMenu(false)}
                                  className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white/70 active:text-white/70"
                                  aria-label={t.close}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setPdfDeptFilter('all'); setShowPdfDeptMenu(false); }}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 pdfDeptFilter === 'all' 
 ? 'bg-accent text-white shadow-md' 
 : 'text-white/70 hover:bg-white/10'
 } active:bg-white/15`}
                              >
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                  <Check className={`h-3 w-3 ${pdfDeptFilter === 'all' ? 'text-white' : 'text-accent'}`} strokeWidth={3} />
                                </div>
                                <span className="flex-1 truncate">Tutti i reparti</span>
                                {pdfDeptFilter === 'all' && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                              </button>

                              <div className="my-1 h-px" style={{ background: 'rgba(255, 255, 255, 0.06)' }} />

                              {availableDepts
                                .map((dept) => (
                                <button
                                  key={dept.value}
                                  type="button"
                                  onClick={() => { setPdfDeptFilter(dept.value); setShowPdfDeptMenu(false); }}
                                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 pdfDeptFilter === dept.value 
 ? 'bg-accent text-white shadow-md' 
 : 'text-white/70 hover:bg-white/10'
 } active:bg-white/15`}
                                >
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                    <span
                                      className={`h-2.5 w-2.5 rounded-full shadow-sm ${pdfDeptFilter === dept.value ? 'bg-white' : ''}`}
                                      style={pdfDeptFilter !== dept.value ? { backgroundColor: getDeptColor(dept.value) } : {}}
                                    />
                                  </div>
                                  <span className="flex-1 truncate" title={dept.label}>{dept.label}</span>
                                  {pdfDeptFilter === dept.value && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                                </button>
                              ))}
                            </CenteredModalPortal>
                          </div>
                        </>
                      )}
                    </AnimatePresence>
                </div>

              </div>
            </div>
          </div>
          )}
          {/* ── Griglia presenze (ancora scroll dalle card riepilogo) ─── */}
          {uiW('timesheet.main_grid') && (
          <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-4 px-4 pb-8">
            {visibleUsers.map((user) => {
              const totals = userTotals[user.id];
              const userHasShifts = weekDays.some(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                return timesheetData[user.id]?.[dateStr]?.shifts.length > 0;
              });

              return (
                <div key={user.id} className="rounded-xl border border-neutral-500 rounded-2xl p-4 shadow-sm border border-neutral-500 overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-bold text-lg text-white">{user.first_name}</h4>
                      {user.department && (
                        <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider">{user.department}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold text-white/50 uppercase tracking-tight">{t.stats_total}</div>
                      <div className="text-sm font-bold text-accent">
                        {formatMinutesToHoursAndMinutes(totals?.actualMins || totals?.plannedMins || 0)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {!userHasShifts ? (
                      <div className="py-4 text-center border-2 border-dashed border-slate-100 rounded-xl">
                        <p className="text-xs text-white/50 italic">{t.no_shifts_this_week}</p>
                      </div>
                    ) : (
                      weekDays.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dayData = timesheetData[user.id]?.[dateStr];
                        if (!dayData || dayData.shifts.length === 0) return null;
                        
                        const todayDate = isToday(day);

                        const onOpenDayQueue = () => { if (!isMobile) handleOpenDayReview(dateStr); };
                        const dayClickBlocked = isMobile || plannedOnlyTimesheetGrid;
                        return (
                          <div
                            key={dateStr}
                            className={`flex items-start gap-3 p-2 rounded-xl ${todayDate ? 'bg-accent/5 ring-1 ring-accent/20' : 'bg-slate-50/50'} ${dayClickBlocked ? 'cursor-default' : 'cursor-pointer'}`}
                            role={dayClickBlocked ? undefined : 'button'}
                            tabIndex={dayClickBlocked ? undefined : 0}
                            onClick={dayClickBlocked ? undefined : onOpenDayQueue}
                            onKeyDown={dayClickBlocked ? undefined : (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onOpenDayQueue();
                              }
                            }}
                          >
                            <div className="w-10 shrink-0 text-center">
                              <div className={`text-[11px] font-bold uppercase ${todayDate ? 'text-accent' : 'text-white/50'}`}>
                                {format(day, 'EEE', { locale })}
                              </div>
                              <div className={`text-xs font-bold ${todayDate ? 'text-accent' : 'text-white/70'}`}>
                                {format(day, 'd', { locale })}
                              </div>
                            </div>
                            
                            <div className="flex-1 space-y-2">
                              {dayData.shifts.map(s => {
                                const punchAuditCount = s.punchInId ? (punchAudits[s.punchInId]?.length ?? 0) : 0;
                                const boardShift = shifts.find((sh) => sh.id === s.id) ?? null;
                                const { border, bg, ring } = getShiftCardStyle(s, punchAuditCount, dateStr, boardShift);
                                
                                const shiftClickBlocked = isMobile || plannedOnlyTimesheetGrid;
                                return (
                                  <div
                                    key={s.id}
                                    onClick={shiftClickBlocked ? undefined : (e) => {
                                      e.stopPropagation();
                                      openDrawer(s, user, dateStr, null, 'turno');
                                    }}
                                    className={`flex w-full items-center justify-between rounded-lg border-l-4 ${border} ${bg} ${ring} p-2 text-left ${shiftClickBlocked ? 'cursor-default' : 'cursor-pointer transition-transform '}`}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-xs font-bold text-white/90">
                                        {s.plannedStart}–{s.plannedEnd || '?'}
                                      </span>
                                      {s.punched && s.actualStart && (
                                        <span className="text-[11px] font-medium text-white/60">
                                          {s.actualStart}–{s.actualEnd || '...'}
                                        </span>
                                      )}
                                    </div>
                                    {!isMobile && <ChevronRight className="h-4 w-4 text-white/30" />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          {/* ── Mirror header sticky — compare quando il thead originale esce dalla vista ── */}
          {timesheetHeaderSticky && (
            <div
              ref={timesheetMirrorHeaderRef}
              className="hidden md:block sticky z-[200] rounded-b-xl overflow-hidden border-x border-b border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              style={{ top: 'var(--app-sticky-header-offset)', background: 'transparent' }}
            >
              <div ref={timesheetHeaderScrollRef} className="overflow-x-hidden">
                <table
                  className="w-full table-fixed border-collapse [&_th]:border-neutral-500"
                  style={{ minWidth: timesheetGridMinWidthPx }}
                >
                  <colgroup>
                    <col style={{ width: timesheetGridNameColPx }} />
                    {weekDays.map((day) => (
                      <col key={format(day, 'yyyy-MM-dd')} style={{ width: timesheetGridDayColPx }} />
                    ))}
                    <col style={{ width: timesheetGridTotalColPx }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-white/20" style={{ background: 'transparent' }}>
                      <th className="sticky left-0 z-10 box-border py-3.5 pl-4 pr-3 text-center text-[11px] font-semibold uppercase tracking-wider text-white border-r border-r-white/20 md:py-2.5 md:pl-3 md:pr-2" style={{ background: 'transparent' }}>
                        {t.employee}
                      </th>
                      {weekDays.map((day, dayIdx) => {
                        const todayDate = isToday(day);
                        const dStr = format(day, 'yyyy-MM-dd');
                        const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
                        const isPayrollDay = dStr === weekViewPayrollDayStr;
                        const payrollHighlight = isPayrollDay && (viewMode === 'week' || inP);
                        const canReviewThisDay = dStr <= todayStr;
                        const dayReviewableCount = visibleUsers.reduce((n, u) => {
                          const d = timesheetData[u.id]?.[dStr];
                          return n + (d?.shifts.filter((s) => shiftEligibleForDayReview(s)).length ?? 0);
                        }, 0);
                        const canReview = inP && canReviewThisDay && canTeamTimesheetOps && dayReviewableCount > 0;
                        const weekEndCol = viewMode === 'month' && (dayIdx + 1) % 7 === 0;
                        return (
                          <th key={dStr}
                            onClick={canReview ? () => handleOpenDayReview(dStr) : undefined}
                            className={`box-border px-2 py-2.5 text-center text-[11px] font-semibold whitespace-nowrap transition-colors md:px-1 md:py-1.5 ${
 weekEndCol ? 'border-r-2 border-r-white/20' : 'border-r border-r-white/10'
 } ${canReview ? 'cursor-pointer hover:bg-white/10 group' : ''} active:bg-white/80`}
                            style={{ background: payrollHighlight ? 'transparent' : todayDate ? 'transparent' : 'transparent' }}
                          >
                            <div className={todayDate && inP ? 'text-cyan-300' : 'text-white/70'}>
                              {format(day, 'EEE', { locale })}
                            </div>
                            <div className={`font-bold mt-0.5 text-sm md:text-xs ${todayDate && inP ? 'text-white' : payrollHighlight ? 'text-emerald-200' : 'text-white'}`}>
                              {format(day, 'd MMM', { locale }).toUpperCase()}
                            </div>
                            {payrollHighlight && (
                              <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-400">
                                {tv.ts_payroll_day_abbr ?? 'Paga'}
                              </div>
                            )}
                            {canReview && (
                              <div className="mt-0.5 text-[11px] font-semibold text-accent/60 group-hover:text-accent transition-colors active:text-accent">
                                {t.ts_review_short}
                              </div>
                            )}
                          </th>
                        );
                      })}
                      <th className="box-border border-l border-l-white/20 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wider text-white md:px-2 md:py-2" style={{ background: 'transparent' }}>
                        {t.stats_total}
                      </th>
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
          )}

          <div id="timesheet-section-main-grid" className="hidden md:block overflow-hidden scroll-mt-24 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <HorizontalScrollArea
              variant="overlay"
              remeasureKey={`${viewMode}-${weekStr}-${weekDays.length}`}
              ariaLabelPrev={viewMode === 'week' ? tv.ts_timesheet_week_nav_prev : t.table_h_scroll_prev}
              ariaLabelNext={viewMode === 'week' ? tv.ts_timesheet_week_nav_next : t.table_h_scroll_next}
              weekNav={timesheetMainGridWeekNav}
              scrollClassName="overflow-x-auto-safe"
              scrollSyncRef={timesheetBodyScrollRef}
            >
            <table
              className="w-full table-fixed border-collapse [&_th]:border-white/10 [&_td]:border-white/10"
              style={{ minWidth: timesheetGridMinWidthPx }}
            >
              <colgroup>
                <col style={{ width: timesheetGridNameColPx }} />
                {weekDays.map((day) => (
                  <col key={format(day, 'yyyy-MM-dd')} style={{ width: timesheetGridDayColPx }} />
                ))}
                <col style={{ width: timesheetGridTotalColPx }} />
              </colgroup>
              <thead ref={timesheetTheadRef}>
                <tr className="border-b border-neutral-500">
                  <th className="sticky left-0 z-10 box-border py-2 pl-4 pr-3 text-center text-[11px] font-semibold uppercase tracking-wider text-white/50 border-r border-r-white/15 md:py-1.5 md:pl-3 md:pr-2" style={{ background: 'transparent', boxShadow: 'none' }}>
                    {t.employee}
                  </th>
                  {weekDays.map((day, dayIdx) => {
                    const todayDate = isToday(day);
                    const dStr = format(day, 'yyyy-MM-dd');
                    const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
                    const isPayrollDay = dStr === weekViewPayrollDayStr;
                    const payrollHighlight = isPayrollDay && (viewMode === 'week' || inP);
                    const canReviewThisDay = dStr <= todayStr;
                    const dayReviewableCount = visibleUsers.reduce((n, u) => {
                      const d = timesheetData[u.id]?.[dStr];
                      return n + (d?.shifts.filter((s) => shiftEligibleForDayReview(s)).length ?? 0);
                    }, 0);
                    const canReview = inP && canReviewThisDay && canTeamTimesheetOps && dayReviewableCount > 0;
                    const weekEndCol = viewMode === 'month' && (dayIdx + 1) % 7 === 0;
                    return (
                      <th key={dStr}
                        onClick={canReview ? () => handleOpenDayReview(dStr) : undefined}
                        title={
                          isPayrollDay
                            ? `${format(day, 'EEEE d MMMM yyyy', { locale })} — ${tv.ts_payroll_day_abbr ?? 'Paga'}`
                            : canReview
                              ? t.ts_review_shifts_tooltip.replace('{n}', String(dayReviewableCount))
                              : undefined
                        }
                        className={`box-border px-2 py-1.5 text-center text-[11px] font-semibold whitespace-nowrap transition-colors md:px-1 md:py-1 ${
 weekEndCol ? 'border-r-2 border-r-white/15' : 'border-r border-r-white/10'
 } ${viewMode === 'month' && !inP ? 'opacity-40' : ''} ${canReview ? 'cursor-pointer hover:bg-white/10 group' : ''} active:bg-white/80`}
                        style={{ background: payrollHighlight ? 'rgba(51,102,204,0.35)' : todayDate ? 'rgba(0,82,255,0.08)' : 'transparent' }}
                      >
                        <div
                          className={`text-[11px] font-bold uppercase tracking-widest mb-0.5 ${
 todayDate && inP ? 'text-accent/70' : 'text-white/40'
 }`}
                        >
                          {format(day, 'EEE', { locale })}
                        </div>
                        <div className="flex items-center justify-center gap-1">
                          <div
                            className={`font-black tabular-nums text-[13px] md:text-xs ${
 todayDate && inP
 ? 'text-accent'
 : !inP
 ? 'text-white/30'
 : payrollHighlight
 ? 'text-white/90'
 : 'text-white/70'
 }`}
                          >
                            {format(day, 'd/MM')}
                          </div>
                          {payrollHighlight && (
                            <span className="text-[11px] font-bold uppercase tracking-wide text-[#007A5E]">
                              {tv.ts_payroll_day_abbr ?? 'Paga'}
                            </span>
                          )}
                          {canReview && (
                            <span className="text-[11px] font-semibold text-accent/60 group-hover:text-accent transition-colors active:text-accent">
                              {t.ts_review_short}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="box-border border-l-2 border-l-white/20 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wider text-white/60 md:px-2 md:py-2" style={{ background: 'transparent' }}>
                    {t.stats_total}
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleUsers.map((user, userIdx) => {
                        const totals = userTotals[user.id];
                        const _isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
                        return (
                          <tr
                            key={user.id}
                            className={`depth-row last:border-b-0`}
                            style={{ background: userIdx % 2 === 0 ? 'rgba(20,45,110,0.60)' : 'rgba(20,45,110,0.70)' }}
                          >
                      {/* Nome dipendente — click → revisione settimana (coda turni) */}
                      <td className="sticky left-0 pl-4 pr-3 py-2 border-r border-r-white/10 z-10 md:py-1.5 md:pl-3 md:pr-2 align-middle" style={{ background: 'transparent', boxShadow: 'none' }}>
                        <div className="flex flex-col gap-1 justify-center">
                          <button
                            type="button"
                            className="w-full max-w-full rounded-lg py-0.5 text-right transition-colors hover:bg-white/[0.04] hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                            aria-label={formatTrans(t.ts_employee_week_review_open_aria, { name: user.first_name })}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEmployeeWeekReview(user);
                            }}
                          >
                            <div className="font-semibold text-sm text-white md:text-xs">{user.first_name}</div>
                            {user.department && (
                              <div className="text-[11px] text-white/40 mt-0.5 md:text-[11px] uppercase">{user.department}</div>
                            )}
                          </button>
                          <div className="text-[11px] font-bold text-accent/70 tabular-nums text-right">
                            {formatMinutesToHoursAndMinutes(totals?.actualMins ?? totals?.plannedMins ?? 0)}
                          </div>
                        </div>
                      </td>

                      {/* Celle giornaliere */}
                      {weekDays.map((day, dayIdx) => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dayData = timesheetData[user.id]?.[dateStr];
                        const todayDate = isToday(day);
                        const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
                        const isPayrollDay = dateStr === weekViewPayrollDayStr;
                        const payrollHighlight = isPayrollDay && (viewMode === 'week' || inP);
                        const weekEndCol = viewMode === 'month' && (dayIdx + 1) % 7 === 0;
                        const tdBorder = weekEndCol ? 'border-r-2 border-r-white/15' : 'border-r border-r-white/10';
                        const tdMuted = viewMode === 'month' && !inP;
                        const tdStyle: React.CSSProperties = payrollHighlight
                          ? { background: 'rgba(51,102,204,0.12)' }
                          : todayDate && inP
                            ? { background: 'rgba(0,82,255,0.08)' }
                            : tdMuted
                              ? { background: 'transparent', opacity: 0.35 }
                              : { background: userIdx % 2 === 0 ? 'rgba(20,45,110,0.60)' : 'rgba(20,45,110,0.70)' };

                        if (!dayData || dayData.shifts.length === 0) {
                          return (
                            <td key={dateStr} className={`px-2 py-2 text-center ${tdBorder} md:px-1.5 md:py-1.5`} style={tdStyle}>
                              <span className="text-sm md:text-xs text-white/45">–</span>
                            </td>
                          );
                        }

                        const { before16, from16 } = partitionShiftsByPlannedHour16(dayData.shifts);
                        const renderShiftButton = (s: ShiftRow) => {
                                const punchAuditCount = s.punchInId ? (punchAudits[s.punchInId]?.length ?? 0) : 0;
                                const boardShift = shifts.find((sh) => sh.id === s.id) ?? null;
                                const { border, bg, ring, dot } = getShiftCardStyle(s, punchAuditCount, dateStr, boardShift);
                                const publishedCell = s.status === 'confirmed' || s.status === 'approved';
                                const showPlannedTimesInCell =
                                  showFullTimesheetGrid || (plannedOnlyTimesheetGrid && publishedCell);
                                const deltaColor =
                                  s.deltaMins > 5 ? 'text-accent' : s.deltaMins < -5 ? 'text-red-400' : 'text-white/50';

                                // Logica per determinare se mostrare l'orario pianificato come "effettivo" in assenza di timbrature
                                const showPlannedAsActual = !s.punched && publishedCell;
                                const displayActualMins = showPlannedAsActual ? s.plannedMins : s.actualMins;
                                const displayDeltaMins = showPlannedAsActual ? 0 : s.deltaMins;

                                const isHighlighted = highlightedShiftIds.has(s.id);
                                const isDimmed = statFilter !== null && !isHighlighted;
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={plannedOnlyTimesheetGrid ? undefined : () => {
                                      openDrawer(s, user, dateStr, null, 'turno');
                                    }}
                                    className={`relative flex w-full items-stretch text-left rounded-lg border-l-[3px] ${border} ${bg} ${ring} py-1 pl-2 pr-2 shadow-sm transition-colors group md:rounded-md md:py-0.5 md:pl-1.5 md:pr-1.5 md:border-l-2 ${plannedOnlyTimesheetGrid ? 'cursor-default' : 'hover:shadow-md'} ${isHighlighted ? 'ts-shift-highlighted' : ''} ${isDimmed ? 'opacity-20 pointer-events-none' : ''}`}
                                  >
                                    {/* Spunta / lucchetto subito dopo la barra verticale, poi orari */}
                                    {(s.status === 'confirmed' || s.status === 'approved') && (
                                      <span className="mr-1.5 flex shrink-0 flex-col items-center justify-center gap-0.5 self-stretch md:mr-1">
                                        {s.status === 'confirmed' && (
                                          <Check
                                            className="h-2.5 w-2.5 shrink-0 text-brand-mid md:h-2 md:w-2"
                                            strokeWidth={2.5}
                                            aria-hidden
                                          />
                                        )}
                                        {s.status === 'approved' && (
                                          <Lock
                                            className="h-2.5 w-2.5 shrink-0 text-emerald-600 md:h-2 md:w-2"
                                            strokeWidth={2.5}
                                            aria-hidden
                                          />
                                        )}
                                      </span>
                                    )}
                                    <div className="flex min-w-0 flex-1 flex-col gap-1 md:gap-0.5">
                                    <div className="mb-0.5 flex items-center justify-between gap-1 md:mb-0">
                                      <span
                                        className="text-[11px] font-semibold text-white/70 tabular-nums md:text-[11px]"
                                        aria-label={
                                          showPlannedTimesInCell
                                            ? undefined
                                            : t.ts_times_grid_times_masked_aria
                                        }
                                      >
                                        {showPlannedTimesInCell
                                          ? `${s.plannedStart}–${s.plannedEnd || '?'}`
                                          : t.ts_times_masked_range}
                                      </span>
                                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot} md:h-1.5 md:w-1.5`} />
                                    </div>
                                    {/* Effettivo: mostra solo orari timbratura reali; se non timbrato → "–". */}
                                    {showFullTimesheetGrid ? (
                                      s.punched ? (
                                        s.actualEnd ? (
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="text-[11px] font-bold text-white tabular-nums md:text-[11px]">
                                              {`${s.actualStart}–${s.actualEnd}`}
                                            </span>
                                            <span
                                              className={`max-w-[min(100%,5.5rem)] shrink-0 text-right text-[11px] font-semibold leading-tight tabular-nums md:max-w-[4.75rem] md:text-[11px] ${
 s.breakMinutesActual > 0 ? 'text-white/50' : deltaColor
 }`}
                                              title={
                                                s.breakMinutesActual > 0
                                                  ? `${t.ts_net_hours}: ${fmtHM(displayActualMins)}`
                                                  : undefined
                                              }
                                            >
                                              {s.breakMinutesActual > 0
                                                ? `−${fmtBreakDeductionShort(s.breakMinutesActual)}`
                                                : `${displayDeltaMins >= 0 ? '+' : ''}${fmtHM(displayDeltaMins)}`}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex items-start justify-between gap-1 md:gap-0.5">
                                            <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-0.5 text-[11px] font-semibold text-red-400 md:text-[11px]">
                                              <span>{s.actualStart}</span>
                                              <span className="text-red-500">{t.ts_missing_exit}</span>
                                            </div>
                                            {s.breakMinutes > 0 && (
                                              <span
                                                className="max-w-[min(100%,5.5rem)] shrink-0 text-right text-[11px] font-semibold leading-tight tabular-nums text-white/50 md:max-w-[4.75rem] md:text-[11px]"
                                                title={`${t.ts_kpi_planned}: ${fmtHM(s.plannedMins)}`}
                                              >
                                                {`−${fmtBreakDeductionShort(s.breakMinutes)}`}
                                              </span>
                                            )}
                                          </div>
                                        )
                                      ) : (
                                        <span className="text-[11px] font-semibold text-white/45 md:text-[11px]">–</span>
                                      )
                                    ) : plannedOnlyTimesheetGrid &&
                                      publishedCell &&
                                      s.displayFromFrozenApprovedTimes &&
                                      s.actualStart &&
                                      s.actualEnd ? (
                                      <div className="flex items-center justify-between gap-1">
                                        <span
                                          className="text-[11px] font-bold text-white tabular-nums md:text-[11px]"
                                          title={t.ts_kpi_frozen_official}
                                        >
                                          {`${s.actualStart}–${s.actualEnd}`}
                                        </span>
                                      </div>
                                    ) : null}
                                    {/* Badge icone — assoluti in alto a destra */}
                                    {showFullTimesheetGrid && (punchAuditCount > 0 || getShiftHistory(s.id).length > 0) && (
                                      <div className="absolute top-0.5 right-1 flex items-center gap-0.5">
                                        {punchAuditCount > 0 && (
                                          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-orange-300 bg-orange-500/20 rounded px-0.5 py-px leading-none">
                                            <ShieldAlert className="w-2 h-2" />{punchAuditCount}
                                          </span>
                                        )}
                                        {getShiftHistory(s.id).length > 0 && (
                                          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-300 bg-amber-500/20 rounded px-0.5 py-px leading-none">
                                            <History className="w-2 h-2" />{getShiftHistory(s.id).length}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    <ArrowRight className="absolute bottom-0.5 right-1 w-2 h-2 text-white/40 opacity-0 group-hover:opacity-100 transition-opacity active:opacity-90" />
                                    </div>
                                  </button>
                                );
                        };

                        return (
                          <td key={dateStr} className={`px-1.5 py-1.5 ${tdBorder} align-top md:px-1 md:py-1 h-px`} style={tdStyle}>
                            <div className="flex h-full flex-col">
                              {before16.length > 0 && (
                                <div className="flex flex-col gap-1 md:gap-0.5">
                                  {before16.map((s) => renderShiftButton(s))}
                                </div>
                              )}
                              {from16.length > 0 && (
                                <div className={`flex flex-col gap-1 md:gap-0.5 ${before16.length > 0 ? 'mt-1.5 md:mt-1' : 'mt-auto'}`}>
                                  {from16.map((s) => renderShiftButton(s))}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Totale settimana */}
                      <td className="px-3 py-2 text-center border-l-2 border-l-white/15 md:px-2 md:py-1.5" style={{ background: userIdx % 2 === 0 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.14)' }}>
                        <div className="flex flex-col items-center gap-2">
                          <div className="text-xs font-semibold text-white/55 md:text-[11px]">
                            {showFullTimesheetGrid || plannedOnlyTimesheetGrid
                              ? formatMinutesToHoursAndMinutes(totals?.plannedMins ?? 0)
                              : t.ts_times_masked_hm}
                          </div>
                          {showFullTimesheetGrid && (totals?.actualMins ?? 0) > 0 && (
                            <>
                              <div className="text-sm font-bold text-white md:text-xs">
                                {formatMinutesToHoursAndMinutes(totals?.actualMins ?? 0)}
                              </div>
                              <div className={`text-[11px] font-semibold ${(totals?.deltaMins ?? 0) >= 0 ? 'text-accent' : 'text-red-400'} md:text-[11px]`}>
                                {(totals?.deltaMins ?? 0) >= 0 ? '+' : ''}
                                {fmtHM(totals?.deltaMins ?? 0)}
                              </div>
                            </>
                          )}
                          {plannedOnlyTimesheetGrid && (totals?.frozenOfficialMins ?? 0) > 0 && (
                            <div
                              className="text-sm font-bold text-white md:text-xs"
                              title={t.ts_kpi_frozen_official}
                            >
                              {formatMinutesToHoursAndMinutes(totals?.frozenOfficialMins ?? 0)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Empty state — nessun dipendente */}
                {visibleUsers.length === 0 && (
                  <tr>
                    <td colSpan={weekDays.length + 2} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-white/30" />
                        </div>
                        <p className="text-white/70 font-semibold text-sm">{t.ts_no_data}</p>
                        <p className="text-white/50 text-xs">{t.ts_no_employees_this_week}</p>
                      </div>
                    </td>
                  </tr>
                )}
                {/* Empty state — dipendenti presenti ma senza turni */}
                {visibleUsers.length > 0 && visibleUsers.every((u) =>
                  weekDays.every((d) => (timesheetData[u.id]?.[format(d,'yyyy-MM-dd')]?.shifts.length ?? 0) === 0)
                ) && (
                  <tr>
                    <td colSpan={weekDays.length + 2} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-white/30" />
                        </div>
                        <p className="text-white/70 font-semibold text-sm">{t.ts_no_shifts_this_week}</p>
                        <p className="text-white/50 text-xs">{t.ts_no_shifts_description}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Footer totali */}
              {canTeamTimesheetOps && (
                <tfoot>
                  <tr className="bg-brand-mid/5 border-t-2 border-brand-mid/35">
                    <td className="sticky left-0 pl-4 pr-3 py-3 text-accent font-bold text-xs uppercase border-r-2 border-r-white/15 z-10 md:py-2 md:pl-3 md:pr-2 md:text-[11px]" style={{ background: 'transparent' }}>
                      {t.stats_total}
                    </td>
                    {weekDays.map((day, dayIdx) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const planned = visibleUsers.reduce((s, u) => s + (timesheetData[u.id]?.[dateStr]?.totalPlannedMins ?? 0), 0);
                      const actual = visibleUsers.reduce((s, u) => s + (timesheetData[u.id]?.[dateStr]?.totalActualMins ?? 0), 0);
                      const frozenCol = visibleUsers.reduce(
                        (s, u) => s + (timesheetData[u.id]?.[dateStr]?.totalFrozenOfficialMins ?? 0),
                        0
                      );
                      const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
                      const isPayrollDay = dateStr === weekViewPayrollDayStr;
                      const payrollHighlight = isPayrollDay && (viewMode === 'week' || inP);
                      const weekEndCol = viewMode === 'month' && (dayIdx + 1) % 7 === 0;
                      const tdBorder = weekEndCol ? 'border-r-[3px] border-r-white/40' : 'border-r-2';
                      const tdMuted = viewMode === 'month' && !inP;
                      const tdBgStyle: React.CSSProperties = payrollHighlight
                        ? { background: 'rgba(51,102,204,0.12)' }
                        : tdMuted
                          ? { background: 'transparent', opacity: 0.35 }
                          : {};
                      return (
                        <td key={dateStr} className={`px-2 py-3 text-center ${tdBorder} text-xs md:px-1.5 md:py-2 md:text-[11px]`} style={tdBgStyle}>
                          {planned > 0 ? (
                            <>
                              <div className={tdMuted ? 'text-white/30' : 'text-white/55'}>
                                {formatMinutesToHoursAndMinutes(planned)}
                              </div>
                              {showFullTimesheetGrid && actual > 0 && (
                                <div className={`font-semibold ${tdMuted ? 'text-white/40' : 'text-white'}`}>
                                  {formatMinutesToHoursAndMinutes(actual)}
                                </div>
                              )}
                              {plannedOnlyTimesheetGrid && frozenCol > 0 && (
                                <div
                                  className={`font-semibold ${tdMuted ? 'text-white/60' : 'text-white/90'}`}
                                  title={t.ts_kpi_frozen_official}
                                >
                                  {formatMinutesToHoursAndMinutes(frozenCol)}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className={tdMuted ? 'text-slate-300' : 'text-slate-300'}>–</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center bg-white/5 border-l-[3px] border-l-white/30 md:px-2 md:py-2">
                      <div className="text-xs text-white/60 md:text-[11px]">
                        {formatMinutesToHoursAndMinutes(visibleUsers.reduce((s, u) => s + (userTotals[u.id]?.plannedMins ?? 0), 0))}
                      </div>
                      {showFullTimesheetGrid && (
                        <div className="text-xs font-bold text-white md:text-[11px]">
                          {(() => {
                            const act = visibleUsers.reduce((s, u) => s + (userTotals[u.id]?.actualMins ?? 0), 0);
                            return act > 0 ? formatMinutesToHoursAndMinutes(act) : '';
                          })()}
                        </div>
                      )}
                      {plannedOnlyTimesheetGrid &&
                        (() => {
                          const gf = visibleUsers.reduce((s, u) => s + (userTotals[u.id]?.frozenOfficialMins ?? 0), 0);
                          return gf > 0 ? (
                            <div
                              className="text-xs font-bold text-white md:text-[11px]"
                              title={t.ts_kpi_frozen_official}
                            >
                              {formatMinutesToHoursAndMinutes(gf)}
                            </div>
                          ) : null;
                        })()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            </HorizontalScrollArea>
          </div>
          </>
          )}

          {/* Box personale per staff */}
          {!canTeamTimesheetOps && currentUser && uiW('timesheet.staff_summary_box') && (
            <div className="mt-4 rounded-2xl border border-slate-100 bg-transparent p-5 shadow-none">
              <p className="text-xs uppercase tracking-wider text-white/50 mb-3 font-semibold">
                {t.timesheet_my_week}
              </p>
              {(() => {
                const myTot = userTotals[currentUser.id];
                const frozenM = myTot?.frozenOfficialMins ?? 0;
                const gridCols = showFullTimesheetGrid
                  ? 'grid-cols-3'
                  : plannedOnlyTimesheetGrid && frozenM > 0
                    ? 'grid-cols-2'
                    : 'grid-cols-1 md:grid-cols-1';
                const kpiItems = showFullTimesheetGrid
                  ? [
                      {
                        label: t.ts_kpi_planned,
                        val: formatMinutesToHoursAndMinutes(myTot?.plannedMins ?? 0),
                        color: 'text-white/90',
                      },
                      {
                        label: t.ts_kpi_punched,
                        val:
                          (myTot?.actualMins ?? 0) > 0
                            ? formatMinutesToHoursAndMinutes(myTot?.actualMins ?? 0)
                            : '–',
                        color: 'text-white/90',
                      },
                      {
                        label: t.ts_kpi_delta,
                        val: `${(myTot?.deltaMins ?? 0) >= 0 ? '+' : ''}${fmtHM(myTot?.deltaMins ?? 0)}`,
                        color: (myTot?.deltaMins ?? 0) >= 0 ? 'text-brand-mid' : 'text-red-500',
                      },
                    ]
                  : plannedOnlyTimesheetGrid && frozenM > 0
                    ? [
                        {
                          label: t.ts_kpi_planned,
                          val: formatMinutesToHoursAndMinutes(myTot?.plannedMins ?? 0),
                          color: 'text-white/90',
                        },
                        {
                          label: t.ts_kpi_frozen_official,
                          val: formatMinutesToHoursAndMinutes(frozenM),
                          color: 'text-white/90',
                        },
                      ]
                    : [
                        {
                          label: t.ts_kpi_planned,
                          val: formatMinutesToHoursAndMinutes(myTot?.plannedMins ?? 0),
                          color: 'text-white/90',
                        },
                      ];
                return (
                  <div className={`grid gap-4 ${gridCols}`}>
                    {kpiItems.map(({ label, val, color }) => (
                      <div key={label}>
                        <p className="text-[11px] text-white/50 uppercase tracking-wide mb-1">{label}</p>
                        <p className={`text-2xl font-bold ${color}`}>{val}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

        </motion.div>
        )} {/* end tsView === 'grid' */}
      </div>
    </>
  );
}
