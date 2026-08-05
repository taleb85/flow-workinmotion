import { useState } from 'react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { X, Save, Copy, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppUser, useAppData, useAppOverlay } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { Shift } from '../types';
import { format, addDays, parseISO } from 'date-fns';
import { hasShiftConflictSameDay, normalizeTimeInputToHHmm as toHHmm } from '../utils/timeCalculations';
import { TimeInputField } from './ui/TimeInputField';

interface EditShiftModalProps {
  shift: Shift;
  onClose: () => void;
}

export default function EditShiftModal({ shift, onClose }: EditShiftModalProps) {
  useBodyScrollLock(true);
  const { users } = useAppUser();
  const { shifts, updateShift, deleteShift, copyShift } = useAppData();
  const { showError } = useAppOverlay();
  const t = useT();
  const [tempShifts, setTempShifts] = useState({
    start_time: (shift.start_time || '').trim().slice(0, 5),
    end_time: (shift.end_time || '').trim().slice(0, 5),
    date: shift.date,
    user_id: shift.user_id,
    type: shift.type,
    approval_status: shift.approval_status,
  });

  const user = users.find((u) => u.id === shift.user_id);

  const handleSave = () => {
    const startNorm = toHHmm(tempShifts.start_time);
    const endNorm = toHHmm(tempShifts.end_time);
    if (!startNorm) return;
    const finalUserId = tempShifts.user_id ?? shift.user_id;
    const finalDate = tempShifts.date ?? shift.date;
    const others = shifts.filter(s => s.id !== shift.id && s.user_id === finalUserId && s.date === finalDate);
    if (others.length >= 2) {
      showError(t.max_two_shifts_same_day);
      return;
    }
    if (hasShiftConflictSameDay(others, { start_time: startNorm, end_time: endNorm })) {
      showError(t.shift_overlap_same_day);
      return;
    }
    updateShift(shift.id, {
      start_time: startNorm,
      end_time: endNorm,
      date: tempShifts.date,
    });
    onClose();
  };

  const handleDelete = () => {
    if (confirm(t.delete_shift_confirm)) {
      deleteShift(shift.id);
      onClose();
    }
  };

  const handleCopy = () => {
    const nextDay = format(addDays(parseISO(shift.date), 1), 'yyyy-MM-dd');
    copyShift(shift, nextDay);
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/35 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="modal-glass-panel w-full max-w-lg overflow-hidden rounded-[40px]"
        >
          <div className="bg-accent p-6 relative">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center hover:bg-white transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            >
              <X className="w-5 h-5 text-white" />
            </button>

            <h2 className="text-white text-2xl font-black uppercase tracking-wider">
              {t.edit_shift}
            </h2>
            <p className="text-white/80 text-sm mt-1">
              <span className="uppercase">{user?.first_name}</span>
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="edit-shift-date" className="text-white/70 text-xs uppercase tracking-[0.2em] font-bold mb-2 block">
                Data
              </label>
              <input
                id="edit-shift-date"
                type="date"
                value={tempShifts.date}
                onChange={(e) => setTempShifts((s) => ({ ...s, date: e.target.value }))}
                className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 focus:border-accent outline-none font-bold text-white [color-scheme:dark]"
                placeholder="GG/MM/AAAA"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="edit-shift-start" className="text-white/70 text-xs uppercase tracking-[0.2em] font-bold mb-2 block">
                  {t.start}
                </label>
                <TimeInputField
                  id="edit-shift-start"
                  value={tempShifts.start_time}
                  onChange={(next) => setTempShifts((s) => ({ ...s, start_time: next }))}
                  aria-label={t.start}
                  className="w-full rounded-2xl border-white/20 bg-white/10 px-2"
                />
              </div>

              <div>
                <label htmlFor="edit-shift-end" className="text-white/70 text-xs uppercase tracking-[0.2em] font-bold mb-2 block">
                  Fine {!tempShifts.end_time && <span className="text-amber-400">(da completare)</span>}
                </label>
                <TimeInputField
                  id="edit-shift-end"
                  value={tempShifts.end_time}
                  onChange={(next) => setTempShifts((s) => ({ ...s, end_time: next }))}
                  aria-label={t.end}
                  className="w-full rounded-2xl border-white/20 bg-white/10 px-2"
                />
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                onClick={handleSave}
className="flex-1 bg-accent text-white rounded-2xl py-4 font-black uppercase tracking-wider flex items-center justify-center space-x-2 hover:bg-accent-hover hover:shadow-lg transition-shadow active:bg-accent-hover/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
              >
                <Save className="w-5 h-5" />
                <span>{t.save}</span>
              </button>
              <button
                onClick={handleCopy}
                className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center hover:bg-white/15 transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
              >
                <Copy className="w-5 h-5 text-white/80" />
              </button>
              <button
                onClick={handleDelete}
                className="w-14 h-14 bg-red-900/20 rounded-2xl flex items-center justify-center hover:bg-red-900/30 transition-colors border border-red-500/30 active:bg-red-900/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
              >
                <Trash2 className="w-5 h-5 text-red-400" />
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
