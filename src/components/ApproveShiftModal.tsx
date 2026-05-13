import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Clock, RotateCcw } from 'lucide-react';
import { Shift, User } from '../types';
import { calculateShiftMinutes, formatMinutesToHoursAndMinutes } from '../utils/timeCalculations';
import { getPunchPairForShift, getDefaultApprovalClockHHMM, type PunchRecordLike } from '../utils/shiftResolvedClockTimes';
import { getTranslations } from '../utils/translations';
import { useApp } from '../context/AppContext';

interface ApproveShiftModalProps {
  shift: Shift;
  punchRecords: PunchRecordLike[];
  userName: string;
  onClose: () => void;
  onApprove: (shiftId: string, updatedStartTime: string, updatedEndTime: string) => void | Promise<void>;
  onRevertToPending?: (shiftId: string) => void;
  currentUser: User;
}

export default function ApproveShiftModal({ shift, punchRecords, userName, onClose, onApprove, onRevertToPending, currentUser }: ApproveShiftModalProps) {
  const { effectiveLanguage } = useApp();
  const t = getTranslations(effectiveLanguage);
  const pair = getPunchPairForShift(shift, punchRecords);
  const defaults = getDefaultApprovalClockHHMM(shift, punchRecords);
  const [startTime, setStartTime] = useState(defaults.start);
  const [endTime, setEndTime] = useState(defaults.end);

  useEffect(() => {
    const d = getDefaultApprovalClockHHMM(shift, punchRecords);
    setStartTime(d.start);
    setEndTime(d.end);
  }, [shift, punchRecords]);

  const handleApprove = async () => {
    await onApprove(shift.id, startTime, endTime);
    onClose();
  };

  const handleRevert = () => {
    if (onRevertToPending) {
      onRevertToPending(shift.id);
      onClose();
    }
  };

  const totalMinutes = calculateShiftMinutes(`${startTime}:00`, `${endTime}:00`);
  const formattedTime = formatMinutesToHoursAndMinutes(totalMinutes);
  const isAlreadyApproved = shift.approval_status === 'approved';
  const canRevertToPending = isAlreadyApproved && onRevertToPending && !['waiter', 'bartender'].includes(currentUser.role);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="bg-white dark:bg-[#1a1a1a] rounded-2xl border border-slate-200 dark:border-white/5 max-w-md w-full overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-gradient-to-br from-yellow-400 to-yellow-500 dark:from-yellow-600 dark:to-yellow-700 p-6 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <Check className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white">{t.approve_shift}</h2>
                <p className="text-yellow-100 text-sm font-semibold">{userName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 transition-colors flex items-center justify-center"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-500/30 rounded-xl p-4">
              <p className="text-yellow-800 dark:text-yellow-200 text-sm font-bold mb-2">{t.check_and_edit_times}</p>
              <p className="text-yellow-700 dark:text-yellow-300/80 text-xs">
                {t.times_based_on_punches}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t.home_label_planned}</p>
                <p className="font-bold tabular-nums text-slate-800 dark:text-gray-100">
                  {pair.plannedStart} → {pair.plannedEnd}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-sky-50/80 dark:bg-sky-900/20 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{t.ts_label_punched}</p>
                <p className="font-bold tabular-nums text-slate-800 dark:text-gray-100">
                  {pair.actualStart ?? '—'} → {pair.actualEnd ?? '—'}
                </p>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-gray-400 font-semibold">{t.approve_shift_edit_hint}</p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-slate-600 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
                  {t.entry}
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 focus:border-accent outline-none transition-all font-bold text-center text-slate-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-gray-400 text-xs font-bold uppercase tracking-wider mb-2">
                  {t.exit}
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 focus:border-accent outline-none transition-all font-bold text-center text-slate-900 dark:text-gray-100"
                />
              </div>
            </div>

            <div className="bg-accent/10 dark:bg-accent/20 border border-accent/30 dark:border-accent/40 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-accent dark:text-accent-light" />
                <span className="text-[#1a1a1a] dark:text-accent-light text-sm font-bold">{t.total_hours_label}</span>
              </div>
              <span className="text-accent dark:text-accent-light text-2xl font-black">{formattedTime}</span>
            </div>

            {canRevertToPending && (
              <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-500/30 rounded-xl p-4 mb-4">
                <p className="text-blue-700 dark:text-blue-300 text-sm font-bold mb-3">
                  Questo turno è già approvato. Vuoi riportarlo in sospeso?
                </p>
                <button
                  type="button"
                  onClick={handleRevert}
                  className="w-full bg-blue-600 text-white rounded-xl py-3 font-black uppercase tracking-wider hover:bg-blue-500 transition-all flex items-center justify-center space-x-2"
                >
                  <RotateCcw className="w-5 h-5" />
                  <span>Riporta in Sospeso</span>
                </button>
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-slate-200 dark:bg-white/5 text-slate-800 dark:text-gray-100 rounded-xl py-4 font-black uppercase tracking-wider hover:bg-slate-300 dark:hover:bg-white/10 transition-all"
              >
                {isAlreadyApproved ? t.close : t.cancel}
              </button>
              {!isAlreadyApproved && (
                <button
                  type="button"
                  onClick={handleApprove}
                  className="flex-1 bg-accent text-white rounded-xl py-4 font-black uppercase tracking-wider hover:bg-accent-hover transition-all flex items-center justify-center space-x-2"
                >
                  <Check className="w-5 h-5" />
                  <span>{t.approve}</span>
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
