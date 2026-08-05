import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, FileText, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppUser } from '../context/appSliceContexts';
import { useAppData } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
import { hapticLight as lightHaptic } from '../utils/haptics';
import DatePickerField from './DatePickerField';

interface RequestHolidayModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

const formatDiscursiveDate = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const day = d.getDate();
  const month = d.toLocaleString('en-US', { month: 'long' });
  const getSuffix = (n: number) => {
    if (n > 3 && n < 21) return 'th';
    switch (n % 10) {
      case 1:
        return 'st';
      case 2:
        return 'nd';
      case 3:
        return 'rd';
      default:
        return 'th';
    }
  };
  return `${day}${getSuffix(day)} of ${month}`;
};

export default function RequestHolidayModal({ isOpen, onClose, userId }: RequestHolidayModalProps) {
  const { addHolidayRequest } = useAppData();
  const { currentUser } = useAppUser();
  const { showError } = useAppOverlay();
  const t = useT();
  const tr = t as Record<string, string>;
  const isMobile = useIsMobileViewport();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    setStartDate('');
    setEndDate('');
    setReason('');
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    lightHaptic();
    setIsSubmitting(true);
    try {
      await addHolidayRequest({
        user_id: userId,
        start_date: startDate,
        end_date: endDate,
        type: 'ferie',
        requester_email: currentUser?.email ?? '',
        ...((reason ?? '').trim() && { reason: (reason ?? '').trim() }),
      });

      const requesterName = currentUser
        ? `${currentUser.first_name} ${currentUser.last_name}`.trim() || 'Employee'
        : 'Employee';

      const displayStart = formatDiscursiveDate(startDate);
      const displayEnd = formatDiscursiveDate(endDate);

      const mailSubject = encodeURIComponent(`Holiday Request - ${requesterName}`);
      const mailBody = encodeURIComponent(
        `Hi, hope you are well,\nI'd like to request a week of holiday that goes from the ${displayStart} until the ${displayEnd}.\nLooking forward to hear from you.\n\nKind Regards`
      );

      try {
        window.location.href = `mailto:info@flow-workinmotion.com?subject=${mailSubject}&body=${mailBody}`;
      } catch {
        /* silently ignore */
      }

      handleClose();
    } catch {
      showError?.(t.holiday_request_send_error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls =
    'w-full px-3 py-2.5 text-base rounded-2xl border border-neutral-500 focus:border-accent focus:ring-2 focus:ring-accent/20 outline-none text-white placeholder:text-white/40 transition-colors bg-white/10' as const;
  const labelClsFull = 'block text-xs font-bold uppercase tracking-wider mb-1 text-accent/80';

  if (!isOpen) return null;

  const title = tr.holiday_request_modal_title ?? 'Nuova richiesta';
  const startLbl = tr.holiday_request_start ?? 'Data inizio';
  const endLbl = tr.holiday_request_end ?? 'Data fine';
  const reasonLbl = tr.holiday_request_reason ?? 'Motivazione';
  const reasonOpt = tr.holiday_request_reason_optional ?? '(opzionale)';
  const reasonPh = tr.holiday_request_reason_placeholder ?? 'Es. Visita medica, ferie estive…';

  const fields = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClsFull}>
            <Calendar className="inline h-3 w-3 mr-1" aria-hidden />
            {startLbl}
          </label>
          <DatePickerField value={startDate} onChange={(v) => { setStartDate(v); if (endDate && v > endDate) setEndDate(v); }} className="w-full" />
        </div>
        <div>
          <label className={labelClsFull}>
            <Calendar className="inline h-3 w-3 mr-1" aria-hidden />
            {endLbl}
          </label>
          <DatePickerField value={endDate} onChange={setEndDate} min={startDate} className="w-full" />
        </div>
      </div>

      <div>
        <label className={labelClsFull}>
          <FileText className="inline h-3 w-3 mr-1" aria-hidden />
          {reasonLbl}{' '}
          <span className="text-white/50 normal-case font-normal">{reasonOpt}</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={reasonPh}
          className={`${inputCls} h-24 resize-none`}
        />
      </div>
    </div>
  );

  if (isMobile) {
    return createPortal(
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10050] flex flex-col bg-slate-900/50 backdrop-blur-sm"
          role="presentation"
        >
          <motion.form
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onSubmit={handleSubmit}
            className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden bg-transparent backdrop-blur-xl" style={{ WebkitBackdropFilter: 'blur(8px)' }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3 pt-[max(12px,env(safe-area-inset-top,0px))]">
              <h3 className="text-lg font-bold text-white">{title}</h3>
              <button
                type="button"
                onClick={() => {
                  lightHaptic();
                  handleClose();
                }}
                className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white/70 transition-colors hover:bg-white/15 active:bg-white/80"
                aria-label={t.cancel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-smooth px-4 py-4 [-webkit-overflow-scrolling:touch]">
              {fields}
            </div>

            <div className="shrink-0 border-t border-white/10 px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom,0px))] bg-transparent">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    lightHaptic();
                    handleClose();
                  }}
                  className="min-h-[56px] rounded-3xl border border-slate-200 text-base font-bold text-white/80 transition-colors"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !startDate || !endDate}
                  className="flex min-h-[56px] items-center justify-center gap-2 rounded-3xl bg-accent text-base font-bold uppercase tracking-wide text-white shadow-lg shadow-accent/20 transition-colors hover:shadow-xl hover:shadow-accent/30 disabled:cursor-not-allowed disabled:opacity-50 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
                >
                  {isSubmitting ? (
                    <span className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="h-5 w-5" strokeWidth={3} />
                      {t.request_holiday ?? 'Invia'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.form>
        </motion.div>
      </AnimatePresence>,
      document.body
    );
  }

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 backdrop-blur-md supports-[backdrop-filter]:bg-black/30 p-4"
        onClick={handleClose}
      >
        <motion.form
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          onSubmit={handleSubmit}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl border border-white/15 p-6 shadow-2xl bg-transparent"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        >
          <div className="mb-5 flex items-center justify-between">
            <h3 className="text-base font-semibold text-white">{title}</h3>
            <button
              type="button"
              onClick={() => {
                lightHaptic();
                handleClose();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-colors hover:bg-white/20 active:bg-white/80"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {fields}

          <button
            type="submit"
            disabled={isSubmitting || !startDate || !endDate}
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-accent/20 transition-colors hover:shadow-xl hover:shadow-accent/30 disabled:cursor-not-allowed disabled:opacity-50 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          >
            {isSubmitting ? (
              <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                {t.request_holiday ?? 'Invia richiesta'}
              </>
            )}
          </button>
        </motion.form>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
