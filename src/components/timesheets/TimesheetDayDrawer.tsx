import { useRef } from 'react';
import { X, LogOut, UserX, Save } from 'lucide-react';
import { type Locale } from 'date-fns';
import { calculateShiftMinutesGross } from '../../utils/timeCalculations';
import {
  getActiveBreakRules,
  getBreakDeductionDisplayItems,
  DEFAULT_AUTO_BREAK_MINUTES,
  AUTO_BREAK_THRESHOLD_MINUTES,
  type BreakMinutesComputeOptions,
  type BreakRule,
} from '../../utils/breakRules';

import { calculateDrawerPermissions } from '../../utils/drawerPermissions';
import { TimeInputField } from '../ui/TimeInputField';
import { CenteredModalPortal } from '../ui/CenteredModalPortal';
import { mergeShiftDeductExclusionsFromLocal } from '../../utils/shiftDeductExclusionsLocal';
import { TimesheetDrawerHeader } from './TimesheetDrawerHeader';
import { ShiftHoursCards } from './ShiftHoursCards';
import { ShiftHistoryCard } from './ShiftHistoryCard';
import {
  fmtHM,
  fmtBreakDeductionShort,
  fmtAuditValue,
  humanizeFieldName,
  punchSourceLabel,
} from './timesheetHelpers';
import type { ShiftRow, DrawerData, DrawerReviewQueue, ClosingShiftState } from './timesheetTypes';
import type { Shift, User } from '../../types';

// ── Helper ──────────────────────────────────────────────────────────────────
function getShiftCardStyle(s: ShiftRow) {
  if (s.status === 'approved') return { border: 'border-emerald-500/30', bg: 'bg-emerald-500/12', ring: 'ring-emerald-500/30', label: 'Approvato', labelCls: 'text-emerald-300' };
  if (s.status === 'absent') return { border: 'border-rose-500/30', bg: 'bg-rose-500/12', ring: 'ring-rose-500/30', label: 'Assente', labelCls: 'text-rose-300' };
  if (s.status === 'confirmed') return { border: 'border-brand-electric/30', bg: 'bg-brand-electric/10', ring: 'ring-brand-electric/30', label: 'Pubblicato', labelCls: 'text-blue-300' };
  return { border: 'border-neutral-500', bg: 'bg-white/6', ring: 'ring-white/15', label: 'Bozza', labelCls: 'text-white/50' };
}

// ── Props ───────────────────────────────────────────────────────────────────
export interface TimesheetDayDrawerContext {
  drawerData: DrawerData | null;
  drawerReviewQueue: DrawerReviewQueue | null;
  drawerSessionId: string | null;
  drawerJustOpened: boolean;
  manualPunchIn: string;
  manualPunchOut: string;
  manualPunchSaving: boolean;
  drawerManualPunchFormExpanded: boolean;
  showCloseConfirm: boolean;
  reviewQueueSaving: boolean;
  markAbsentSaving: boolean;
  deductBreakSaving: boolean;
  drawerShiftEditsExpanded: boolean;
  clockOutTime: string;
  closingLoading: boolean;
  approvingShiftId: string | null;
  todayStr: string;
  timesheetShiftDetailPanelRef: React.RefObject<HTMLDivElement | null>;

  setManualPunchIn: (v: string) => void;
  setManualPunchOut: (v: string) => void;
  setDrawerManualPunchFormExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setShowCloseConfirm: React.Dispatch<React.SetStateAction<boolean>>;
  setDrawerShiftEditsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  setClockOutTime: (v: string) => void;
  setClosingShift: (v: ClosingShiftState | null) => void;
  setMarkAbsentSaving: React.Dispatch<React.SetStateAction<boolean>>;
  pushTsUndo: (label: string, fn: () => Promise<void>) => void;

  closeTimesheetShiftDrawer: () => void;
  handleDrawerSaveTimbratures: (opts?: { silentToast?: boolean }) => Promise<boolean>;
  handleDrawerReviewNavigate: (dir: -1 | 1) => void;
  handleSaveAndFreeze: () => Promise<void>;
  handleSavePunchIn: () => Promise<boolean>;
  handleDrawerDeductBreakChange: (v: boolean) => Promise<void>;
  handleDrawerAutoBreakChange: (v: boolean) => Promise<void>;
  handleDrawerDeductRuleExclusionChange: (ruleId: string, exclude: boolean) => Promise<void>;
  advanceDrawerReviewAfterStep: () => void;
  handleDrawerMarkAbsent: () => Promise<void>;
  handleDrawerFreeze: () => Promise<void>;
  handleDrawerUnfreeze: () => Promise<void>;

  shifts: Shift[];
  users: User[];
  breakRules: BreakRule[];
  breakComputeOpts: BreakMinutesComputeOptions;
  currentUser: User | null;
  canTimesheetApprove: boolean;
  canTeamTimesheetOps: boolean;
  effectiveLanguage: string;
  globalPinSessionId: string | null;
  featureFlags: Record<string, boolean | undefined>;

  showSuccess?: (msg: string) => void;
  showError?: (msg: string) => void;

  t: Record<string, string>;
  locale: Locale;
  tv: Record<string, string>;
}

export interface TimesheetDayDrawerProps {
  ctx: TimesheetDayDrawerContext;
  updateShift: (id: string, data: Partial<Shift>) => void;
}

// ── Component ───────────────────────────────────────────────────────────────
export default function TimesheetDayDrawer({ ctx, updateShift }: TimesheetDayDrawerProps) {
  const {
    drawerData, drawerReviewQueue, drawerSessionId, drawerJustOpened,
    manualPunchIn, manualPunchOut, manualPunchSaving,
    drawerManualPunchFormExpanded, showCloseConfirm, reviewQueueSaving,
    markAbsentSaving, deductBreakSaving, drawerShiftEditsExpanded,
    clockOutTime: _clockOutTime, closingLoading: _closingLoading, approvingShiftId: _approvingShiftId,
    todayStr, timesheetShiftDetailPanelRef,
    setManualPunchIn, setManualPunchOut,
    setDrawerManualPunchFormExpanded, setShowCloseConfirm,
    setDrawerShiftEditsExpanded, setClockOutTime, setClosingShift,
    setMarkAbsentSaving, pushTsUndo,
    closeTimesheetShiftDrawer, handleDrawerSaveTimbratures,
    handleDrawerReviewNavigate: _handleDrawerReviewNavigate,
    handleSaveAndFreeze, handleSavePunchIn,
    handleDrawerDeductBreakChange, handleDrawerAutoBreakChange,
    handleDrawerDeductRuleExclusionChange, advanceDrawerReviewAfterStep,
    handleDrawerMarkAbsent, handleDrawerFreeze, handleDrawerUnfreeze,
    shifts, users, breakRules, breakComputeOpts,
    currentUser: _currentUser, canTimesheetApprove, canTeamTimesheetOps,
    effectiveLanguage, globalPinSessionId, featureFlags,
    showSuccess, showError, t, locale, tv,
  } = ctx;

  const manualPunchInHourRef = useRef<HTMLInputElement | null>(null);
  const manualPunchOutHourRef = useRef<HTMLInputElement | null>(null);

  if (!drawerData) return null;
  const s = drawerData.shift;

  // ── Calcoli derivati ──────────────────────────────────────────────────
  const fullShiftRaw = shifts.find((sh) => sh.id === s.id);
  const fullShift = fullShiftRaw ? mergeShiftDeductExclusionsFromLocal(fullShiftRaw) : undefined;
  const userForBreakReadout = users.find((u) => u.id === drawerData.userId);
  const grossPlannedForBreakReadout = fullShift
    ? calculateShiftMinutesGross(
        (fullShift.start_time || '').slice(0, 5),
        (fullShift.end_time || '').slice(0, 5),
      )
    : 0;
  const canUseActualForBreakReadout =
    !!s.actualStart && !!s.actualEnd && !s.isCrossDay && !s.hasMissingOut;
  const grossForBreakReadout = canUseActualForBreakReadout
    ? calculateShiftMinutesGross(s.actualStart as string, s.actualEnd as string)
    : grossPlannedForBreakReadout;
  const breakReadoutOpts: BreakMinutesComputeOptions = {
    ...breakComputeOpts,
    ...(s.displayFromFrozenApprovedTimes ? { autoBreaksFeatureEnabled: false } : {}),
    ...(canUseActualForBreakReadout ? { breakRuleWindow: { start: s.actualStart as string, end: s.actualEnd as string } } : {}),
  };
  const deductBreakLineItemsAll =
    fullShift && userForBreakReadout
      ? getBreakDeductionDisplayItems(fullShift, grossForBreakReadout, userForBreakReadout, breakRules, breakReadoutOpts, {
          fromShift: t.ts_deduct_break_from_shift,
          auto: t.ts_deduct_break_auto,
          lunch: t.ts_deduct_break_lunch,
          dinner: t.ts_deduct_break_dinner,
        })
      : undefined;

  const hasAdminBreakRules = !!(userForBreakReadout && getActiveBreakRules(breakRules).length > 0);
  const hasManualNonAutoBreak = !!(fullShift && fullShift.break_minutes != null && fullShift.break_minutes > 0 && fullShift.is_auto_break !== true);
  const hasPerMealAutoBreak = !!(deductBreakLineItemsAll?.some((it) => it.ruleId?.startsWith('__flow_meal_')) ?? false);
  const showAutoBreakSubToggle = !!(fullShift && !hasManualNonAutoBreak && !hasAdminBreakRules && !hasPerMealAutoBreak && featureFlags['auto_breaks'] !== false && grossForBreakReadout >= AUTO_BREAK_THRESHOLD_MINUTES);
  const implicitAutoBreakTitles = new Set([t.ts_deduct_break_auto, t.ts_deduct_break_lunch, t.ts_deduct_break_dinner]);
  const deductBreakLineItems = showAutoBreakSubToggle && deductBreakLineItemsAll
    ? deductBreakLineItemsAll.filter((it) => !implicitAutoBreakTitles.has(it.title))
    : deductBreakLineItemsAll;
  const autoBreakSubLineItems = showAutoBreakSubToggle && deductBreakLineItemsAll
    ? deductBreakLineItemsAll.filter((it) => implicitAutoBreakTitles.has(it.title))
    : undefined;
  const autoSubChecked = !!(fullShift && showAutoBreakSubToggle && fullShift.deduct_break !== false && fullShift.is_auto_break !== false);

  // ── Permessi ──────────────────────────────────────────────────────────
  const permissions = calculateDrawerPermissions({
    shiftRow: s as ShiftRow,
    fullShift: fullShift ?? null,
    dateStr: drawerData.dateStr,
    todayStr,
    canTimesheetApprove,
    canTeamTimesheetOps,
    unlockWithPinEnabled: featureFlags['unlock_with_pin'] !== false,
    timbratureUnlockedShiftId: null,
    plannedTimesUnlockedShiftId: null,
    historyUnlockedShiftId: null,
    drawerSessionId,
    globalSessionId: globalPinSessionId,
  });
  const isFrozen = permissions.isFrozen;
  const isApproved = isFrozen || s.status === 'approved';
  const isAbsentDraw = permissions.isAbsent;
  const canClose = permissions.canClose;
  const canMarkAbsentTimesheet = permissions.canMarkAbsent;
  const showTimbratureEditForm = permissions.showTimbratureForm;

  const punchAuditEntries = drawerData.punchAuditEntries;
  const shiftEdits = drawerData.shiftEdits;
  const drawerHistoryTotalCount = shiftEdits.length + punchAuditEntries.length;
  const { border, bg, ring, label, labelCls } = getShiftCardStyle(s);
  const deltaColor = s.deltaMins > 5 ? 'text-accent' : s.deltaMins < -5 ? 'text-red-400' : 'text-white/50';
  const isEmployeeWeekReviewSheet = drawerReviewQueue?.reviewScope === 'employee_week';

  const plannedApprovedCard = s.status === 'approved';
  const plannedConfirmedCard = s.status === 'confirmed';
  const plannedDraftCard = s.status === 'draft';
  const plannedAbsentCard = s.status === 'absent';
  const plannedCardBoxClass = plannedApprovedCard ? 'rounded-xl border-2 border-l-4 border-emerald-500/30 border-l-emerald-500 bg-emerald-500/12 p-3'
    : plannedConfirmedCard ? 'rounded-xl border-2 border-l-4 border-brand-electric/30 border-l-brand-electric bg-brand-electric/10 p-3'
    : plannedAbsentCard ? 'rounded-xl border-2 border-l-4 border-rose-500/30 border-l-error bg-rose-500/12 p-3'
    : plannedDraftCard ? 'rounded-xl border-2 border-l-4 border-neutral-500 border-l-review bg-white/6 p-3'
    : 'rounded-xl border-2 border-l-4 border-neutral-500 border-l-white/30 bg-white/6 p-3';
  const plannedCardLabelCls = plannedApprovedCard ? 'text-emerald-300' : plannedConfirmedCard ? 'text-blue-300' : plannedAbsentCard ? 'text-rose-300' : plannedDraftCard ? 'text-white/50' : 'text-white/40';
  const plannedCardMainCls = plannedApprovedCard ? 'text-white' : plannedConfirmedCard ? 'text-white' : plannedAbsentCard ? 'text-rose-200' : plannedDraftCard ? 'text-white' : 'text-white/85';
  const plannedCardSubCls = plannedApprovedCard ? 'text-emerald-300/90' : plannedConfirmedCard ? 'text-blue-300/80' : plannedAbsentCard ? 'text-rose-300' : plannedDraftCard ? 'text-white/55' : 'text-white/50';

  const needsSave = showTimbratureEditForm && drawerManualPunchFormExpanded &&
    (manualPunchIn !== (s.actualStart ?? s.plannedStart) || manualPunchOut !== (s.actualEnd ?? s.plannedEnd ?? ''));
  const isInReviewQueue = !!(drawerReviewQueue && !drawerReviewQueue.completed);
  const hasValidIn = showTimbratureEditForm ? (manualPunchIn ?? '').replace(/\D/g, '').length >= 4 : !!(s.actualStart || s.plannedStart);
  const hasValidOut = showTimbratureEditForm ? (manualPunchOut ?? '').replace(/\D/g, '').length >= 4 : !!(s.actualEnd || s.plannedEnd);
  const punchDataComplete = hasValidIn && hasValidOut;
  const isDisabled = reviewQueueSaving || manualPunchSaving || isInReviewQueue || drawerJustOpened || !punchDataComplete;

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <CenteredModalPortal
      open={!!drawerData}
      onClose={closeTimesheetShiftDrawer}
      panelRef={timesheetShiftDetailPanelRef}
      maxWidthClass={drawerReviewQueue?.reviewScope === "employee_week" ? "max-w-sm md:max-w-xl lg:max-w-2xl" : "max-w-sm md:max-w-2xl lg:max-w-4xl"}
      maxHeightClass="max-h-[92dvh] lg:max-h-[630px]"
      overlayZClass="z-[10050]"
      ariaLabel={drawerData ? `${drawerData.employeeName} · ${drawerData.dateStr}` : t.ts_shift_detail_modal_aria}
      panelClassName="!overflow-hidden flex flex-col p-0"
      markDatePickerPortal
      disableBackdropClose
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TimesheetDrawerHeader
          employeeName={drawerData.employeeName}
          dateStr={drawerData.dateStr}
          department={drawerData.department}
          effectiveLanguage={effectiveLanguage}
          locale={locale}
          border={border}
          bg={bg}
          ring={ring}
          label={label}
          labelCls={labelCls}
          isFrozen={isFrozen}
          isApproved={isApproved}
          canMarkAbsent={canMarkAbsentTimesheet}
          canTimesheetApprove={canTimesheetApprove}
          markAbsentSaving={markAbsentSaving}
          drawerOpenSource={'name'}
          drawerReviewQueue={drawerReviewQueue as any}
          navigation={undefined}
          navigationReviewDay={undefined}
          hasUnsavedChanges={needsSave}
          onCloseRequest={closeTimesheetShiftDrawer}
          onShowCloseConfirm={() => setShowCloseConfirm(true)}
          onMarkAbsent={handleDrawerMarkAbsent}
          onUnlockFrozen={handleDrawerUnfreeze}
          onFreezeShift={handleDrawerFreeze}
          t={t as any}
        />
        {showCloseConfirm && (
          <div className="border-b border-amber-500/30 bg-amber-500/10 p-3">
            <p className="mb-2 text-sm text-amber-200">{tv.ts_close_confirm ?? 'Chiudere senza salvare?'}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => void (async () => { const ok = await handleDrawerSaveTimbratures({ silentToast: false }); if (ok) closeTimesheetShiftDrawer(); })()}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-accent-hover active:bg-accent-hover/80">
                {manualPunchSaving ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Save className="h-3 w-3 shrink-0" />}
                Salva e chiudi
              </button>
              <button type="button" onClick={closeTimesheetShiftDrawer}
                className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/80 transition-colors hover:bg-white/15 active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                <X className="h-3 w-3 shrink-0" /> Chiudi senza salvare
              </button>
              <button type="button" onClick={() => setShowCloseConfirm(false)}
                className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-white/60 transition-colors hover:bg-white/10 active:bg-white/80">
                Annulla
              </button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {s.status === 'absent' && canTeamTimesheetOps && !isFrozen && (
            <div className="border-b border-rose-500/30 bg-rose-500/10 p-5">
              <p className="text-sm font-medium text-rose-300">{t.wst_status_sub_absent}</p>
              <button type="button" onClick={() => void (async () => { try { await updateShift(s.id, { approval_status: 'confirmed' }); showSuccess?.(t.shift_restored_published_toast); closeTimesheetShiftDrawer(); } catch { showError?.(t.save_error); } })()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 py-2.5 text-sm font-bold text-rose-300 transition-colors hover:bg-rose-500/20 active:bg-rose-500/80">
                {t.shift_restore_published_btn}
              </button>
            </div>
          )}

          <div className={isEmployeeWeekReviewSheet ? 'grid grid-cols-1 grid-rows-[auto_auto] items-stretch' : 'grid grid-cols-1 md:grid-cols-2 md:items-stretch md:divide-x md:divide-white/10'}>
            <div className="min-w-0 flex flex-col">
              <ShiftHoursCards
                shift={s}
                fullShift={fullShift}
                plannedCardBoxClass={plannedCardBoxClass}
                plannedCardLabelCls={plannedCardLabelCls}
                plannedCardMainCls={plannedCardMainCls}
                plannedCardSubCls={plannedCardSubCls}
                deltaColor={deltaColor}
                isEmployeeWeekReviewSheet={isEmployeeWeekReviewSheet}
                canTeamTimesheetOps={canTeamTimesheetOps}
                isFrozen={isFrozen}
                isAbsent={isAbsentDraw}
                deductBreakSaving={deductBreakSaving}
                onDeductBreakChange={handleDrawerDeductBreakChange as any}
                onAutoBreakChange={handleDrawerAutoBreakChange as any}
                onDeductPerRuleChange={handleDrawerDeductRuleExclusionChange as any}
                showAutoBreakSubToggle={showAutoBreakSubToggle}
                autoSubChecked={autoSubChecked}
                autoBreakSubLineItems={autoBreakSubLineItems}
                defaultAutoBreakMinutes={DEFAULT_AUTO_BREAK_MINUTES}
                deductExcludedRuleIds={fullShift?.deduct_excluded_rule_ids}
                fmtHM={fmtHM}
                fmtBreakDeductionShort={fmtBreakDeductionShort}
                punchSourceLabel={punchSourceLabel}
                t={t}
                tv={tv}
                deductBreakLineItems={deductBreakLineItems}
              />
              {!isEmployeeWeekReviewSheet && drawerHistoryTotalCount > 0 && (
                <ShiftHistoryCard
                  shiftEdits={shiftEdits}
                  punchAuditEntries={punchAuditEntries}
                  isUnlocked={false}
                  isExpanded={drawerShiftEditsExpanded}
                  onToggleExpand={() => setDrawerShiftEditsExpanded((v) => !v)}
                  onRequestUnlock={() => {}}
                  skipPinDuringReview={!!drawerReviewQueue}
                  humanizeFieldName={humanizeFieldName}
                  fmtAuditValue={(v: unknown) => fmtAuditValue(v as string | null | undefined)}
                  t={t}
                />
              )}
            </div>

            {!isEmployeeWeekReviewSheet && (
              <div className="flex min-w-0 flex-col">
                {showTimbratureEditForm && (
                  <div className="p-4 space-y-3 border-b border-white/10">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wide text-amber-300/80">{t.ts_drawer_manual_punches_title}</h4>
                      <button type="button" onClick={() => setDrawerManualPunchFormExpanded(!drawerManualPunchFormExpanded)}
                        className="text-[11px] text-amber-300/70 hover:text-amber-300 transition-colors">
                        {drawerManualPunchFormExpanded ? t.ts_collapse : t.ts_expand}
                      </button>
                    </div>
                    {!drawerManualPunchFormExpanded && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg px-2.5 py-1.5 ring-1 transition-colors bg-white/8 ring-amber-400/40">
                          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">{t.ts_drawer_manual_punch_in}</p>
                          <p className="text-xs sm:text-sm font-bold tabular-nums text-white">{s.actualStart ?? s.plannedStart ?? '—'}</p>
                        </div>
                        <div className="rounded-lg px-2.5 py-1.5 ring-1 transition-colors bg-white/8 ring-amber-400/40">
                          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">{t.ts_drawer_manual_punch_out}</p>
                          <p className="text-xs sm:text-sm font-bold tabular-nums text-white">{s.actualEnd ?? s.plannedEnd ?? '—'}</p>
                        </div>
                      </div>
                    )}
                    {showTimbratureEditForm && drawerManualPunchFormExpanded && (
                      <div className="space-y-2 border-t border-amber-400/30 pt-3">
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">{t.ts_drawer_manual_punch_in}</p>
                          <TimeInputField value={manualPunchIn} onChange={setManualPunchIn} hourInputRef={manualPunchInHourRef}
                            onMinutesEnter={() => { manualPunchOutHourRef.current?.focus(); manualPunchOutHourRef.current?.select(); }}
                            onBlurCommit={() => { if (s.punchInId && /^\d{1,2}:\d{2}$/.test((manualPunchIn || '').trim())) void handleSavePunchIn(); }}
                            aria-label={t.ts_drawer_manual_punch_in}
                            className={`w-full ${!manualPunchIn || manualPunchIn === '__:__' ? 'ring-2 ring-red-400 focus-within:ring-red-500' : 'focus-within:ring-amber-500'}`}
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-300/80">{t.ts_drawer_manual_punch_out}</p>
                          <TimeInputField value={manualPunchOut} onChange={setManualPunchOut} hourInputRef={manualPunchOutHourRef}
                            aria-label={t.ts_drawer_manual_punch_out}
                            className={`w-full ${!manualPunchOut || manualPunchOut === '__:__' ? 'ring-2 ring-red-400 focus-within:ring-red-500' : 'focus-within:ring-amber-500'}`}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!isEmployeeWeekReviewSheet && (
                  <div className="mt-auto p-4 border-t border-white/10 space-y-2">
                    {canMarkAbsentTimesheet && drawerReviewQueue != null && (
                      <button type="button" disabled={markAbsentSaving} onClick={() => {
                        if (!window.confirm(t.shift_mark_absent_confirm)) return;
                        void (async () => {
                          setMarkAbsentSaving(true);
                          try {
                            const prevStatus = fullShift?.approval_status ?? s.status;
                            const prevStart = fullShift?.start_time ?? (s.plannedStart || '');
                            const prevEnd = fullShift?.end_time ?? (s.plannedEnd || '');
                            pushTsUndo('Ripristina turno ' + prevStart + '\u2013' + prevEnd, async () => { await updateShift(s.id, { approval_status: prevStatus, start_time: prevStart, end_time: prevEnd }); });
                            await updateShift(s.id, { approval_status: 'absent' });
                            showSuccess?.(t.shift_marked_absent_toast);
                            if (drawerReviewQueue) advanceDrawerReviewAfterStep(); else closeTimesheetShiftDrawer();
                          } catch (e) {
                            const raw = e && typeof e === 'object' && 'message' in e ? String((e as any).message || '') : '';
                            showError?.(raw || t.save_error);
                          } finally { setMarkAbsentSaving(false); }
                        })();
                      }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-red-700 bg-red-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50 active:bg-red-700/80">
                        {markAbsentSaving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <UserX className="h-4 w-4" />}
                        {t.shift_mark_absent}
                      </button>
                    )}
                    {!isEmployeeWeekReviewSheet && canClose && (
                      <button type="button" onClick={() => { setClockOutTime(s.plannedEnd); setClosingShift({ shiftId: s.id, punchInId: s.punchInId ?? '', dateStr: drawerData.dateStr, plannedStart: s.plannedStart, plannedEnd: s.plannedEnd, plannedMins: s.plannedMins, actualStart: s.actualStart ?? s.plannedStart, employeeName: drawerData.employeeName }); }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs font-bold text-amber-300 transition-colors hover:bg-amber-500/20 active:bg-amber-500/80">
                        <LogOut className="h-4 w-4" /> {t.ts_dinner_close_btn}
                      </button>
                    )}
                    {isEmployeeWeekReviewSheet && (
                      <div className="space-y-2">
                        <button type="button" disabled={isDisabled} onClick={() => { void (async () => { if (needsSave) { const ok = await handleDrawerSaveTimbratures({ silentToast: false }); if (!ok) return; } closeTimesheetShiftDrawer(); })(); }}
                          className="w-full rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold bg-accent text-white hover:bg-accent-hover disabled:opacity-50">
                          CHIUDI
                        </button>
                      </div>
                    )}
                    {!isEmployeeWeekReviewSheet && (
                      <div className="flex gap-2">
                        <button type="button" disabled={isDisabled} onClick={() => { void (async () => { if (needsSave) { const ok = await handleDrawerSaveTimbratures({ silentToast: false }); if (!ok) return; } closeTimesheetShiftDrawer(); })(); }}
                          className="flex-1 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold transition-all duration-200 bg-accent text-white hover:bg-accent-hover disabled:opacity-50">
                          {t.ts_btn_save_changes ?? 'Salva modifiche'}
                        </button>
                        {canTimesheetApprove && needsSave && !drawerReviewQueue && (
                          <button type="button" disabled={isDisabled} onClick={() => void handleSaveAndFreeze()}
                            className="flex-1 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-bold transition-all duration-200 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
                            {t.wst_save_freeze_btn ?? 'Salva, approva e congela'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </CenteredModalPortal>
  );
}
