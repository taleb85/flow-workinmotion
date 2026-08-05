import { useEffect, useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Camera, X, Loader2 } from 'lucide-react';
import type { Language } from '../types';
import { getTranslations } from '../utils/translations';
import { scanQrCodeFromCamera, stopActiveQrScanner } from '../utils/qrScanner';

type Mode = 'qr' | 'error';

export default function PunchPresenceVerificationModal({
  open,
  onClose,
  onVerified,
  qrContainerId,
  language,
  title,
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  onVerified: (payload: string) => void;
  qrContainerId: string;
  language: Language;
  title: string;
  subtitle: string;
}) {
  const t = getTranslations(language);
  const tv = t as Record<string, string>;
  const [mode, setMode] = useState<Mode>('qr');
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);
  const onVerifiedRef = useRef(onVerified);
  onVerifiedRef.current = onVerified;

  const runQrScan = useCallback(async () => {
    const tr = getTranslations(language);
    setLocalError('');
    setBusy(true);
    try {
      const text = await scanQrCodeFromCamera(qrContainerId);
      setBusy(false);
      onVerifiedRef.current(text);
    } catch (e: unknown) {
      setBusy(false);
      const err = e as { name?: string; message?: string };
      if (err?.name === 'NotAllowedError' || /permission|denied/i.test(err?.message ?? '')) {
        setLocalError(tr.punch_presence_camera_denied);
      } else {
        setLocalError(tr.punch_presence_qr_failed);
      }
      setMode('error');
      await stopActiveQrScanner();
    }
  }, [language, qrContainerId]);

  useEffect(() => {
    if (!open) {
      setMode('qr');
      setLocalError('');
      setBusy(false);
      void stopActiveQrScanner();
      return;
    }
    setMode('qr');
    setLocalError('');
    const tid = window.setTimeout(() => void runQrScan(), 120);
    return () => {
      window.clearTimeout(tid);
      void stopActiveQrScanner();
    };
  }, [open, runQrScan]);

  const handleRetry = () => {
    setLocalError('');
    setMode('qr');
    window.setTimeout(() => void runQrScan(), 120);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="punch-presence-title"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="modal-glass-panel relative w-full max-w-md overflow-hidden rounded-2xl"
          >
            <button
              type="button"
              onClick={onClose}
className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-white/70 hover:bg-slate-200 active:bg-slate-200/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
              aria-label={tv.close ?? 'Chiudi'}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="p-5 pt-6">
              <h2 id="punch-presence-title" className="pr-10 text-base font-bold text-white">
                {title}
              </h2>
              <p className="mt-1 text-xs leading-snug text-white/60">{subtitle}</p>

              {mode === 'qr' && (
                <div className="mt-4">
                  <div className="mb-2 flex items-center justify-center gap-2 text-xs font-medium text-white/70">
                    <Camera className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                    <span>{t.punch_presence_point_camera}</span>
                  </div>
                  <div
                    id={qrContainerId}
                    className="mx-auto min-h-[260px] w-full max-w-[280px] overflow-hidden rounded-xl bg-black"
                  />
                  {busy && (
                    <div className="mt-3 flex justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-accent" />
                    </div>
                  )}
                </div>
              )}

              {localError && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">
                  {localError}
                </p>
              )}

              {mode === 'error' && (
                <button
                  type="button"
                  onClick={handleRetry}
className="mt-4 w-full rounded-xl bg-slate-100 py-3 text-sm font-semibold text-white/90 hover:bg-slate-200 active:bg-slate-200/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
                >
                  {t.punch_presence_try_again}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
