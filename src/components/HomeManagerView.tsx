import { memo } from 'react';
import { it } from 'date-fns/locale';
import {
  Clock, Calendar, TrendingUp, Palmtree, X,
  Users, AlertCircle, UserCheck, Moon, LogOut as LogOutIcon,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { safeFormatDate } from '../utils/safeDateFormat';
import { formatMinutesToHoursAndMinutes } from '../utils/timeCalculations';
import { isPurelyManagementRole } from '../utils/permissions';
import { TimeInputField } from './ui/TimeInputField';
import { HomeManagementShiftCard } from './HomeManagementShiftCard';
import TeamBoard from './TeamBoard';
import type { User, Shift, HolidayRequest } from '../types';

export interface EnrichedShift {
  shift: Shift;
  user?: User;
  isDinner: boolean;
  punchIn?: any;
  punchOut?: any;
  actualStart: string | null;
  actualEnd: string | null;
  scheduledStart: string;
  scheduledEnd: string;
  scheduledMins: number;
  actualMins: number;
  deltaMins: number;
  isLate: boolean;
  hasMissingOut: boolean;
  isApproved: boolean;
  canApprove: boolean;
  canClose: boolean;
}

interface CloseShiftModal {
  shiftId: string;
  punchInId: string;
  dateStr: string;
  plannedEnd: string;
  employeeName: string;
  actualStart: string;
}

interface HomeManagerViewProps {
  currentUser: User;
  t: Record<string, string>;
  now: Date;
  todayStr: string;
  // Enriched shift data
  todayShiftsEnriched: EnrichedShift[];
  criticalShifts: EnrichedShift[];
  dinnerNeedsClose: EnrichedShift[];
  // Stats
  inTurnoCount: number;
  ritardiCount: number;
  senzaTimbraturaCount: number;
  approvatiCount: number;
  attendancePercent: number;
  hoursPercent: number;
  todayAllShiftsCount: number;
  // Monthly/weekly data
  weeklyMinutes: number;
  // Holidays
  pendingHolidays: HolidayRequest[];
  holidays: HolidayRequest[];
  users: User[];
  myApprovedHolidays: HolidayRequest[];
  staffRequestsEnabled: boolean;
  // Board props
  boardNote: { text: string; author: string; updatedAt: string } | null;
  editingBoard: boolean;
  boardDraft: string;
  onBoardDraftChange: (v: string) => void;
  onStartEditBoard: () => void;
  onSaveBoard: () => void;
  onCancelEditBoard: () => void;
  onClearBoard: () => void;
  canEditTeamBoard: boolean;
  // Modal state
  closeModal: CloseShiftModal | null;
  clockOutInput: string;
  closingLoading: boolean;
  onClockOutInputChange: (v: string) => void;
  onCloseShift: (enriched: EnrichedShift) => void;
  onDismissCloseModal: () => void;
  onConfirmClose: () => void;
  approvingId: string | null;
  approveModal: { shift: Shift; userName: string } | null;
  onApproveFromModal: (shiftId: string, approvedStart: string, approvedEnd: string) => Promise<void>;
  onDismissApproveModal: () => void;
  // Navigation
  onNavigateToShifts?: () => void;
  onNavigateToReports?: () => void;
  onNavigateToHolidays?: () => void;
  // Filters
  uiW: (key: string) => boolean;
  // Clock helpers
  punchTimeHHMM: (ts: string | null | undefined) => string | null;
  timeToMins: (t: string) => number;
  // Approve helpers
  getPunchForShift: (shiftId: string, userId: string, dateStr: string, isLunchShift: boolean) => { punchIn?: any; punchOut?: any };
  // Card style
  getCardStyle: (e: EnrichedShift) => { border: string; bg: string; badge: string; dot: string; label: string };
}

export default memo(function HomeManagerView({
  currentUser,
  t,
  now: _now,
  todayStr: _todayStr,
  todayShiftsEnriched,
  criticalShifts,
  dinnerNeedsClose,
  inTurnoCount,
  ritardiCount,
  senzaTimbraturaCount,
  approvatiCount,
  attendancePercent,
  hoursPercent,
  todayAllShiftsCount: _todayAllShiftsCount,
  weeklyMinutes,
  pendingHolidays,
  holidays,
  users,
  myApprovedHolidays: _myApprovedHolidays,
  staffRequestsEnabled,
  boardNote,
  editingBoard,
  boardDraft,
  onBoardDraftChange,
  onStartEditBoard,
  onSaveBoard,
  onCancelEditBoard,
  onClearBoard,
  canEditTeamBoard,
  closeModal,
  clockOutInput,
  closingLoading,
  onClockOutInputChange,
  onCloseShift,
  onDismissCloseModal,
  onConfirmClose,
  approvingId,
  approveModal: _approveModal,
  onApproveFromModal: _onApproveFromModal,
  onDismissApproveModal: _onDismissApproveModal,
  onNavigateToShifts,
  onNavigateToReports,
  onNavigateToHolidays,
  uiW,
  punchTimeHHMM: _punchTimeHHMM,
  timeToMins,
  getPunchForShift: _getPunchForShift,
  getCardStyle,
}: HomeManagerViewProps) {
  const locale = it;

  const handleDismissCloseModal = () => {
    onDismissCloseModal();
    onClockOutInputChange('');
  };

  return (
    <>
      <section
        className="pb-content pt-6 w-full app-horizontal-pad font-sans"
        aria-label={t.home_dashboard_title}
      >
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
          className="flex flex-col gap-5">

          {/* ── Saluto ────────────────────────────────────────────────── */}
          <div className="px-1 pt-3">
            <h1 className="text-xl font-extrabold tracking-tight leading-tight text-white">
              {t.home_greeting.replace('{name}', currentUser.first_name)}
            </h1>
          </div>

          {/* ── Profilo amministratore (solo Admin) ───────────────────── */}
          {uiW('home_mgmt.admin_banner') && isPurelyManagementRole(currentUser.role) && (
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-200 flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-white/55" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {(t as Record<string, string>).home_admin_profile_banner_title}
                </p>
                <p className="text-xs text-white/55">
                  {(t as Record<string, string>).home_admin_profile_banner_body}
                </p>
              </div>
            </div>
          )}

          {/* ── Bacheca Manager ───────────────────────────────────────────── */}
          {uiW('home_mgmt.team_board') && (
            <TeamBoard
              t={t}
              boardNote={boardNote}
              editingBoard={editingBoard}
              boardDraft={boardDraft}
              onBoardDraftChange={onBoardDraftChange}
              onStartEdit={onStartEditBoard}
              onSave={onSaveBoard}
              onCancel={onCancelEditBoard}
              onClear={onClearBoard}
              canEdit={canEditTeamBoard}
              effectiveLanguage={'it'}
            />
          )}

          {/* ── Stats Bar ─────────────────────────────────────────────────── */}
          {uiW('home_mgmt.stats_bar') && (
          <div className="fluid-grid fluid-grid-4 gap-3 mb-6">
            {[
              {
                label: t.home_stat_in_shift,
                value: inTurnoCount,
                Icon: Users,
                iconColor: 'text-white/70',
                border: 'border-neutral-500',
                iconWell: 'bg-white/10',
              },
              {
                label: t.home_stat_delays,
                value: ritardiCount,
                Icon: Clock,
                iconColor: 'text-red-400',
                border: 'border-2 border-red-400/25',
                iconWell: 'bg-red-500/15',
              },
              {
                label: t.home_stat_missing_out,
                value: senzaTimbraturaCount,
                Icon: AlertCircle,
                iconColor: 'text-amber-400',
                border: 'border-2 border-amber-400/25',
                iconWell: 'bg-amber-400/15',
              },
              {
                label: t.home_stat_approved,
                value: approvatiCount,
                Icon: UserCheck,
                iconColor: 'text-white/70',
                border: 'border-neutral-500',
                iconWell: 'bg-white/10',
              },
            ].map(({ label, value, Icon, iconColor, border, iconWell }) => (
              <div
                key={label}
                className={`group w-full rounded-xl border px-3 py-2.5 flex items-center gap-2.5 text-left ${border}`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${border} ${iconWell}`}>
                  <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} strokeWidth={2} aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-2xl font-bold text-white leading-none tabular-nums">{value}</p>
                  <p className="text-[11px] text-white/75 mt-1 leading-tight">{label}</p>
                </div>
              </div>
            ))}
          </div>
          )}

          {/* ── Pannello Dinner: Chiudi Turno ────────────────────────────── */}
          {uiW('home_mgmt.dinner_close') && dinnerNeedsClose.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
              <div className="flex items-center gap-2 mb-3">
                <Moon className="w-4 h-4 text-amber-600" />
                <h2 className="text-sm font-bold text-white">{t.home_dinner_close_required}</h2>
                <span className="ml-auto rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                  {dinnerNeedsClose.length}
                </span>
              </div>
              <div className="fluid-grid fluid-grid-2 gap-3">
                {dinnerNeedsClose.map((e) => (
                  <div
                    key={e.shift.id}
                    className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/25 text-sm font-bold text-amber-200">
                        {e.user?.first_name?.[0] ?? '?'}
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm">{e.user?.first_name ?? '—'}</p>
                        <p className="text-[11px] text-white/55">{e.user?.department ?? e.user?.role ?? ''}</p>
                      </div>
                      <span className="ml-auto flex items-center gap-1 rounded-full border border-accent/50 bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-white">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" /> {t.home_badge_in_shift}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-transparent rounded-xl px-2.5 py-2 text-center border border-white/10">
                        <p className="text-[11px] text-white/45 uppercase font-semibold mb-0.5">{t.home_label_planned}</p>
                        <p className="text-sm font-bold text-white tabular-nums">{e.scheduledStart}–{e.scheduledEnd}</p>
                      </div>
                      <div className="bg-transparent rounded-xl px-2.5 py-2 text-center border border-white/10">
                        <p className="text-[11px] text-white/45 uppercase font-semibold mb-0.5">{t.home_label_entry}</p>
                        <p className="text-sm font-bold text-white tabular-nums">{e.actualStart ?? '—'}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCloseShift(e)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-bold transition-colors shadow-sm active:bg-accent-hover/80"
                    >
                      <LogOutIcon className="w-4 h-4" /> {t.home_btn_close_shift}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Richiede Attenzione (rosso/giallo) ───────────────────────── */}
          {uiW('home_mgmt.critical') && criticalShifts.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <h2 className="text-sm font-bold text-white">{t.home_requires_attention}</h2>
                <span className="ml-auto text-[11px] font-bold text-red-300 bg-red-500/15 px-2 py-0.5 rounded-full border border-red-400/30">{criticalShifts.length}</span>
              </div>
              <div className="fluid-grid fluid-grid-2 gap-3">
                {criticalShifts.map((e) => {
                  const style = getCardStyle(e);
                  return (
                    <HomeManagementShiftCard key={e.shift.id} e={e} style={style} isManager={true}
                      onClose={() => onCloseShift(e)}
                      onApprove={() => {}}
                      approvingId={approvingId}
                      t={t}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Tutti i turni di oggi ─────────────────────────────────────── */}
          {uiW('home_mgmt.today_shifts') && todayShiftsEnriched.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-white/55" />
                <h2 className="text-sm font-bold text-white">{t.home_todays_shifts}</h2>
                <span className="text-[11px] text-slate-200 ml-1">({todayShiftsEnriched.length})</span>
<button type="button" onClick={() => onNavigateToShifts?.()} className="ml-auto text-xs font-semibold text-accent flex items-center gap-0.5 hover:underline active:brightness-95 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                  {t.home_see_all_shifts} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <div className="fluid-grid fluid-grid-2 gap-3">
                {todayShiftsEnriched.map((e) => {
                  const style = getCardStyle(e);
                  return (
                    <HomeManagementShiftCard key={e.shift.id} e={e} style={style} isManager={true}
                      onClose={() => onCloseShift(e)}
                      onApprove={() => {}}
                      approvingId={approvingId}
                      t={t}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Bottom grid: Reports + Holidays + KPI ─────────────────────── */}
          <div className="fluid-grid fluid-grid-2 gap-4">
            {/* Reports */}
            {uiW('home_mgmt.card_presenze') && (
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 cursor-pointer" onClick={() => onNavigateToReports?.()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-white">{t.home_section_attendance}</h3>
                <TrendingUp className="w-4 h-4 text-white/45" />
              </div>
              <div className="space-y-3">
                {[
                  { label: t.home_attendance_today, pct: attendancePercent, color: 'bg-white' },
                  { label: t.home_hours_this_week, pct: hoursPercent, color: 'bg-white/20' },
                ].map(({ label, pct, color }) => (
                  <div key={label}>
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-white/70 font-medium">{label}</span>
                      <span className="text-white font-bold tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: 0.3, duration: 0.7, ease: 'easeOut' }}
                        className={`h-full rounded-full ${color}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            )}

            {/* Holidays — nascosto se funzione disattivata globalmente */}
            {uiW('home_mgmt.card_ferie') && staffRequestsEnabled && (
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 cursor-pointer" onClick={() => onNavigateToHolidays?.()}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-white">{t.home_holidays_section}</h3>
                <Palmtree className="w-4 h-4 text-white/60" />
              </div>
              {pendingHolidays.length > 0 && (
                <div className="flex items-center gap-2 mb-3 bg-amber-500/12 border border-amber-400/30 rounded-xl px-3 py-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <p className="text-xs font-semibold text-amber-300">{pendingHolidays.length} {t.home_holiday_pending}</p>
                </div>
              )}
              <div className="space-y-1.5">
                {holidays.slice(0, 3).map((h) => {
                  const u = users.find((x) => x.id === h.user_id);
                  return (
                    <div key={h.id} className="flex items-center justify-between py-1 border-b border-white/8 last:border-0">
                      <span className="text-white/70 text-xs font-medium truncate flex-1" title={u?.first_name ?? '?'}>{u?.first_name ?? '?'}</span>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ml-2 ${h.status === 'approved' ? 'bg-white/15 text-white/80 border-white/20' : h.status === 'pending' ? 'bg-amber-500/15 text-amber-300 border-amber-400/30' : 'bg-red-500/15 text-red-300 border-red-400/30'}`}>
                        {h.status === 'approved' ? t.home_holiday_approved : h.status === 'pending' ? t.home_holiday_pending : t.home_holiday_rejected}
                      </span>
                    </div>
                  );
                })}
                {holidays.length === 0 && <p className="text-white/55 text-xs text-center py-2 font-medium">{t.home_no_requests}</p>}
              </div>
            </div>
            )}

            {/* KPI */}
            {uiW('home_mgmt.card_kpi') && (
            <div className="flex flex-col gap-3">
              <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 cursor-pointer" onClick={() => onNavigateToShifts?.()}>
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="w-4 h-4 text-white/45" />
                  <span className="text-[11px] text-white/55 font-semibold uppercase">{t.home_kpi_hours_week}</span>
                </div>
                <p className="text-2xl font-bold text-white tabular-nums">{formatMinutesToHoursAndMinutes(weeklyMinutes)}</p>
              </div>
              <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 cursor-pointer" onClick={() => onNavigateToShifts?.()}>
                <div className="flex items-center justify-between mb-2">
                  <Calendar className="w-4 h-4 text-white/45" />
                  <span className="text-[11px] text-white/55 font-semibold uppercase">{t.home_kpi_shifts_week}</span>
                </div>
                <p className="text-2xl font-bold text-white tabular-nums">{todayShiftsEnriched.length}</p>
                <p className="text-[11px] text-white/55 mt-0.5">{t.home_today}</p>
              </div>
            </div>
            )}
          </div>

        </motion.div>
      </section>

      {/* ── Modal Chiudi Turno ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {closeModal && (() => {
          const [h, m] = clockOutInput ? clockOutInput.split(':').map(Number) : [0, 0];
          const previewMins = clockOutInput ? Math.max(0, timeToMins(`${String(h ?? 0).padStart(2,'0')}:${String(m ?? 0).padStart(2,'0')}`) - timeToMins(closeModal.actualStart)) : 0;
          const homeClockComplete = /^\d{2}:\d{2}$/.test((clockOutInput || '').trim());
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
              onClick={(e) => { if (e.target === e.currentTarget) { handleDismissCloseModal(); } }}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.15 }} className="modal-glass-panel w-full max-w-sm rounded-2xl p-6">
                <div className="flex items-start justify-between mb-5">
                  <div>
                    <h3 className="font-bold text-white text-lg flex items-center gap-2">
                      <Moon className="h-5 w-5 text-amber-600" /> {t.home_modal_close_dinner}
                    </h3>
                    <p className="text-sm text-white/55 mt-0.5">{closeModal.employeeName} · {safeFormatDate(closeModal.dateStr, 'd MMM', { locale })}</p>
                  </div>
                  <button type="button" onClick={handleDismissCloseModal} className="p-1.5 rounded-xl hover:bg-white/10 transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                    <X className="w-4 h-4 text-white/55" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-transparent rounded-xl p-3 text-center border border-white/10">
                    <p className="text-[11px] text-white/45 uppercase font-semibold mb-1">{t.home_label_planned}</p>
                    <p className="font-bold text-white tabular-nums">{closeModal.actualStart} → {closeModal.plannedEnd}</p>
                  </div>
                  <div className="rounded-xl bg-brand-deep/8 p-3 text-center">
                    <p className="text-[11px] text-white/55 uppercase font-semibold mb-1">{t.home_label_entry}</p>
                    <p className="font-bold text-white tabular-nums">{closeModal.actualStart}</p>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-white/70 mb-1.5 uppercase tracking-wide">{t.home_label_exit_time}</label>
                  <TimeInputField
                    size="hero"
                    value={clockOutInput}
                    onChange={onClockOutInputChange}
                    aria-label={t.home_label_exit_time}
                    className="w-full tabular-nums"
                    autoFocus
                  />
                </div>

                {homeClockComplete && (
                  <div className="bg-transparent rounded-xl p-3 mb-4 grid grid-cols-3 gap-2 text-center border border-white/10">
                    {[
                      { label: t.home_modal_start, val: closeModal.actualStart },
                      { label: t.home_modal_end, val: clockOutInput },
                      { label: t.home_modal_duration, val: `${Math.floor(previewMins / 60)}h${previewMins % 60 > 0 ? String(previewMins % 60).padStart(2,'0') : ''}` },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <p className="text-[11px] text-white/45 uppercase font-semibold mb-0.5">{label}</p>
                        <p className="font-bold text-white text-sm tabular-nums">{val}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={handleDismissCloseModal}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-neutral-500 text-white/70 text-sm font-semibold hover:bg-white/12 transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                    {t.cancel}
                  </button>
                  <button type="button" disabled={!clockOutInput || closingLoading} onClick={onConfirmClose}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors active:bg-accent-hover/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">
                    {closingLoading ? t.saving : <><LogOutIcon className="w-4 h-4" />{t.home_btn_register}</>}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </>
  );
});
