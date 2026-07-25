import {} from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { LogOut, X, Lock } from 'lucide-react';
import {
  findFreezeVerifierByPin,
  findFreezeVerifierById as _findFreezeVerifierById,
} from '../../utils/permissions';
import { PinPadModal } from '../ui/PinPadModal';
import { fmtHM } from './timesheetHelpers';
import type { ClosingShiftState } from './timesheetTypes';
import type { User } from '../../types';

// ── Props ───────────────────────────────────────────────────────────────────

export interface TimesheetApprovalsProps {
  /** Modal congelo singolo turno (approvalConfirm) */
  approvalConfirm: {
    shiftId: string;
    employeeName: string;
    dateStr: string;
    plannedStart: string;
    plannedEnd: string;
    plannedMins: number;
    actualStart: string | null;
    actualEnd: string | null;
    actualMins: number;
    deltaMins: number;
    freezeUsesPlannedTimes: boolean;
    afterFreeze: 'advance_review';
  } | null;
  approvalPin: string;
  approvalPinError: string;
  onApprovalPinChange: (pin: string) => void;
  onApprovalConfirm: () => Promise<void>;
  onApprovalCancel: () => void;
  approvingShiftId: string | null;

  /** Riepilogo approvazione settimana */
  approveWeekSummary: {
    approvedCount?: number;
    approvedIds?: string[];
    frozenPayrollCount?: number;
    employeeName?: string;
    shiftIds?: string[];
    previewRows?: Array<{ dateStr?: string; planned: string; delta?: string; employeeLabel?: string }>;
    dateStr?: string;
    employeeLabel?: string;
  } | null;
  approveWeekSummaryBusy: boolean;
  onUndoApproveWeek: () => Promise<void>;
  onCloseApproveWeekSummary: () => void;
  onOpenBatchWeekApprove: () => void;

  /** Modal chiusura turno sera */
  closingShift: ClosingShiftState | null;
  clockOutTime: string;
  closingLoading: boolean;
  onClockOutTimeChange: (v: string) => void;
  onConfirmClose: () => Promise<void>;
  onCancelClose: () => void;
  /** Opzionale: calcolo ore nette per preview (context non disponibile qui) */
  computeClosingShiftPreview?: {
    plannedMins: number;
    previewMins: number;
    previewDelta: number;
  };

  /** Congelamento batch (freeze payroll employee week) */
  employeeWeekFreezeBatch: {
    employeeName: string;
    shiftIds: string[];
  } | null;
  employeeWeekFreezeBusy: boolean;
  onFreezeBatchConfirm: () => Promise<void>;
  onFreezeBatchCancel: () => void;

  /** PIN Gate generico (unlock, delete, batch, etc.) */
  pinGateModal: {
    shiftId: string;
    mode: string;
    batchData?: { shiftIds: string[]; employeeName: string; previewRows?: Array<{ dateStr?: string; planned: string; delta?: string; employeeLabel?: string }> };
    plannedStart?: string;
    plannedEnd?: string;
  } | null;
  pinGatePin: string;
  pinGateError: string;
  pinGateUnlocking: boolean;
  onPinGatePinChange: (pin: string) => void;
  onPinGateConfirm: (pin: string) => void;
  onPinGateCancel: () => void;
  onBiometricSuccess: () => void;

  /** Utenti per verifica PIN */
  users: User[];

  /** Info utente corrente per biometria */
  currentUserId?: string;
  currentUserDisplayName?: string;
  currentUserEmail?: string;

  t: Record<string, string> | any;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function TimesheetApprovals(props: TimesheetApprovalsProps) {
  const {
    approvalConfirm, approvalPin, approvalPinError,
    onApprovalPinChange, onApprovalConfirm, onApprovalCancel,
    approvingShiftId,
    approveWeekSummary, approveWeekSummaryBusy,
    onUndoApproveWeek, onCloseApproveWeekSummary, onOpenBatchWeekApprove,
    closingShift, clockOutTime, closingLoading,
    onClockOutTimeChange, onConfirmClose, onCancelClose,
    computeClosingShiftPreview,
    employeeWeekFreezeBatch, employeeWeekFreezeBusy,
    onFreezeBatchConfirm, onFreezeBatchCancel,
    pinGateModal, pinGatePin, pinGateError, pinGateUnlocking,
    onPinGatePinChange, onPinGateConfirm, onPinGateCancel, onBiometricSuccess,
    users, currentUserId, currentUserDisplayName, currentUserEmail,
    t,
  } = props;

  if (typeof document === 'undefined') return null;

  const _pinTitle = (mode: string) => {
    if (mode === 'unlock_frozen') return t.ts_btn_unlock_to_edit ?? t.sync_lock_title;
    if (mode === 'unlock_shift_edits') return t.ts_drawer_shift_edits ?? t.sync_lock_title;
    if (mode === 'delete_punches') return t.ts_delete_punches_pin_title ?? t.sync_lock_title;
    if (mode === 'enable_planned_times_edit') return t.ts_drawer_edit_planned_times_pin_title ?? t.sync_lock_title;
    if (mode === 'batch_week_approve') return t.ts_approve_week_title ?? 'Approvazione Settimanale';
    if (mode === 'freeze_single_shift') return t.sync_lock_title;
    return t.ts_drawer_manual_punches_title ?? t.sync_lock_title;
  };

  return createPortal(
    <AnimatePresence>
      {/* ── Modal congelo singolo turno (approvalConfirm) ──────────────── */}
      {approvalConfirm && (
        <PinPadModal
          key="approval-confirm-pin"
          title={t.sync_lock_title}
          subtitle={t.ts_enter_manager_pin}
          pinLabel={t.ts_approval_pin_label}
          pin={approvalPin}
          onPinChange={(p) => (onApprovalPinChange(p), null)}
          onConfirm={async () => {
            const verifier = findFreezeVerifierByPin(users, approvalPin);
            if (!verifier) {
              onApprovalPinChange('');
              return;
            }
            onApprovalCancel(); // pulisce approvalConfirm
            await onApprovalConfirm();
          }}
          onCancel={onApprovalCancel}
          error={approvalPinError}
          isLoading={approvingShiftId === approvalConfirm.shiftId}
          confirmLabel={t.ts_btn_yes_approve_freeze ?? t.ts_btn_confirm}
          cancelLabel={t.cancel}
          userId={currentUserId}
          userDisplayName={currentUserDisplayName ?? ''}
          userEmail={currentUserEmail ?? ''}
          onBiometricSuccess={onBiometricSuccess}
        />
      )}

      {/* ── Riepilogo approvazione settimana ───────────────────────────── */}
      {approveWeekSummary && (
        <motion.div
          key="approve-week-summary"
          className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full max-w-sm rounded-2xl border border-neutral-500 bg-gray-900 p-6 shadow-2xl"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{t.ts_approve_week_title}</h3>
              <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-400">
                {approveWeekSummary.approvedCount} {t.ts_approve_count_shift}
              </span>
            </div>

            <div className="mb-5 space-y-2">
              <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                <span className="text-sm text-white/70">{t.ts_approve_week_approved}</span>
                <span className="text-sm font-bold text-emerald-400">{approveWeekSummary.approvedCount}</span>
              </div>
              {(approveWeekSummary.frozenPayrollCount ?? 0) > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-sm text-white/70">{t.ts_approve_week_frozen_payroll}</span>
                  <span className="text-sm font-bold text-amber-400">{approveWeekSummary.frozenPayrollCount ?? 0}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                disabled={approveWeekSummaryBusy}
                onClick={onUndoApproveWeek}
                className="flex-1 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 shadow-sm transition-colors hover:bg-red-500/20 disabled:opacity-50 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
              >
                {approveWeekSummaryBusy ? '...' : (t.ts_btn_undo_approve ?? 'Ripristina')}
              </button>
              <button
                type="button"
                disabled={approveWeekSummaryBusy}
                onClick={onOpenBatchWeekApprove}
                className="flex-1 rounded-xl bg-accent hover:bg-accent-hover px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition-colors flex items-center justify-center gap-1.5 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
              >
                <Lock className="w-3.5 h-3.5" />
                Approva
              </button>
              <button
                type="button"
                disabled={approveWeekSummaryBusy}
                onClick={onCloseApproveWeekSummary}
                className="flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white/95 shadow-sm transition-colors hover:bg-white/15 disabled:opacity-50 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
              >
                {t.close}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ── Chiusura turno sera (closingShift) ─────────────────────────── */}
      {closingShift && (
        <motion.div
          key="closing-shift"
          className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => { if (e.target === e.currentTarget) onCancelClose(); }}
        >
          <motion.div
            className="modal-glass-panel w-full max-w-sm rounded-2xl p-6"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-bold text-white text-base flex items-center gap-2">
                  <LogOut className="w-4 h-4 text-amber-500" />
                  {t.ts_modal_close_shift_title}
                </h3>
                <p className="text-sm text-white/60 mt-0.5">
                  {closingShift.employeeName} · {closingShift.dateStr}
                </p>
              </div>
              <button type="button" onClick={onCancelClose}
                className="p-1.5 rounded-xl hover:bg-white/10 transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            <div className="bg-white/8 rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between text-sm">
              <span className="text-white/60">{t.ts_modal_entry_registered}</span>
              <span className="font-bold text-white/90">{closingShift.actualStart}</span>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-white/70 mb-1.5 uppercase tracking-wide">{t.ts_label_exit_time}</label>
              <input
                type="text"
                value={clockOutTime}
                onChange={(e) => onClockOutTimeChange(e.target.value)}
                placeholder="HH:mm"
                className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white tabular-nums placeholder:text-white/30 focus:border-accent/50 focus:outline-none"
              />
              <p className="text-[11px] text-white/50 mt-1 text-center">
                {t.ts_label_planned}: {closingShift.plannedStart}–{closingShift.plannedEnd}
              </p>
            </div>

            {computeClosingShiftPreview && (
              <div className="bg-white/8 rounded-xl p-3 mb-4">
                <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide mb-2">{t.ts_modal_hours_preview}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[11px] text-white/50">{t.ts_kpi_planned}</p>
                    <p className="font-bold text-white/80 text-sm">{fmtHM(computeClosingShiftPreview.plannedMins)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-white/50">{t.ts_kpi_actual}</p>
                    <p className="font-bold text-white/90 text-sm">{fmtHM(computeClosingShiftPreview.previewMins)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-white/50">{t.ts_kpi_delta}</p>
                    <p className={`font-bold text-sm ${computeClosingShiftPreview.previewDelta > 5 ? 'text-accent' : computeClosingShiftPreview.previewDelta < -5 ? 'text-red-500' : 'text-white/60'}`}>
                      {computeClosingShiftPreview.previewDelta >= 0 ? '+' : ''}{fmtHM(computeClosingShiftPreview.previewDelta)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button type="button" onClick={onCancelClose}
                className="flex-1 px-4 py-2.5 rounded-xl text-white/70 text-sm font-medium transition-colors hover:bg-white/10 active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                style={{ border: '1px solid rgba(255,255,255,0.22)' }}>
                {t.cancel}
              </button>
              <button type="button" disabled={!clockOutTime || closingLoading} onClick={onConfirmClose}
                className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors active:bg-accent-hover/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">
                {closingLoading ? t.ts_saving : <><LogOut className="w-3.5 h-3.5" />{t.ts_btn_register_exit}</>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* ── Congelamento batch settimana dipendente ────────────────────── */}
      {employeeWeekFreezeBatch && (
        <PinPadModal
          key="freeze-batch-pin"
          title={t.sync_lock_title}
          subtitle={(t as Record<string, string>).ts_employee_week_freeze_batch_title ?? 'Congela turni revisionati'}
          pinLabel={t.ts_approval_pin_label}
          pin={approvalPin}
          onPinChange={(p) => (onApprovalPinChange(p), null)}
          onConfirm={async () => {
            const verifier = findFreezeVerifierByPin(users, approvalPin);
            if (!verifier) { onApprovalPinChange(''); return; }
            await onFreezeBatchConfirm();
          }}
          onCancel={onFreezeBatchCancel}
          error={approvalPinError}
          isLoading={employeeWeekFreezeBusy}
          confirmLabel={(t as Record<string, string>).ts_employee_week_freeze_batch_cta ?? t.ts_btn_yes_approve_freeze}
          cancelLabel={t.cancel}
          userId={currentUserId}
          userDisplayName={currentUserDisplayName ?? ''}
          userEmail={currentUserEmail ?? ''}
          onBiometricSuccess={onBiometricSuccess}
        />
      )}

      {/* ── PIN Gate generico (unlock, delete, batch, etc.) ────────────── */}
      {pinGateModal && (
        <PinPadModal
          key="pin-gate"
          title={_pinTitle(pinGateModal.mode)}
          subtitle={t.ts_enter_manager_pin}
          pinLabel={t.ts_approval_pin_label}
          pin={pinGatePin}
          onPinChange={(p) => (onPinGatePinChange(p), null)}
          onConfirm={() => onPinGateConfirm(pinGatePin)}
          onCancel={onPinGateCancel}
          error={pinGateError}
          isLoading={pinGateUnlocking}
          confirmLabel={t.ts_btn_confirm ?? t.confirm}
          cancelLabel={t.cancel}
          userId={currentUserId}
          userDisplayName={currentUserDisplayName ?? ''}
          userEmail={currentUserEmail ?? ''}
          onBiometricSuccess={onBiometricSuccess}
        />
      )}
    </AnimatePresence>,
    document.body
  );
}
