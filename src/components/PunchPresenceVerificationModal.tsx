import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Nfc, Camera, X, Loader2 } from 'lucide-react';
import type { Language } from '../types';
import { getTranslations } from '../utils/translations';
import { readNfcTagOnce, isNfcSupported } from '../utils/nfc';
import { scanQrCodeFromCamera, stopActiveQrScanner } from '../utils/qrScanner';

type Mode = 'choice' | 'nfc' | 'qr' | 'error';

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
  const [mode, setMode] = useState<Mode>('choice');
  const [localError, setLocalError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setMode('choice');
      setLocalError('');
      setBusy(false);
      void stopActiveQrScanner();
    }
  }, [open]);

  const handleNfc = async () => {
    setLocalError('');
    if (!isNfcSupported()) {
      setLocalError(t.punch_presence_nfc_unsupported);
      setMode('error');
      return;
    }
    setMode('nfc');
    setBusy(true);
    const res = await readNfcTagOnce();
    setBusy(false);
    if (res.ok) {
      onVerified(res.text);
      return;
    }
    if (res.error === 'denied') {
      setLocalError(t.punch_presence_nfc_denied);
    } else if (res.error === 'empty') {
      setLocalError(t.punch_presence_tag_unrecognized);
    } else if (res.error === 'unsupported') {
      setLocalError(t.punch_presence_nfc_unsupported);
    } else {
      setLocalError(res.message === 'timeout' ? t.punch_presence_nfc_timeout : t.punch_presence_tag_unrecognized);
    }
    setMode('error');
  };

  const handleQr = () => {
    setLocalError('');
    setMode('qr');
    window.setTimeout(() => {
      void (async () => {
        setBusy(true);
        try {
          const text = await scanQrCodeFromCamera(qrContainerId);
          setBusy(false);
          onVerified(text);
        } catch (e: unknown) {
          setBusy(false);
          const err = e as { name?: string; message?: string };
          if (err?.name === 'NotAllowedError' || /permission|denied/i.test(err?.message ?? '')) {
            setLocalError(t.punch_presence_camera_denied);
          } else {
            setLocalError(t.punch_presence_qr_failed);
          }
          setMode('error');
          await stopActiveQrScanner();
        }
      })();
    }, 120);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="punch-presence-title"
        >
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"
              aria-label={tv.close ?? 'Chiudi'}
            >
              <X className="h-4 w-4" />
            </button>
            <div className="p-5 pt-6">
              <h2 id="punch-presence-title" className="pr-10 text-base font-bold text-slate-900">
                {title}
              </h2>
              <p className="mt-1 text-xs text-slate-500 leading-snug">{subtitle}</p>

              {mode === 'choice' && (
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleNfc()}
                    disabled={busy}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-50"
                  >
                    <Nfc className="h-10 w-10 text-accent" strokeWidth={1.5} />
                    <span className="text-sm font-bold text-slate-800">{t.punch_presence_btn_nfc}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleQr()}
                    disabled={busy}
                    className="flex flex-col items-center gap-2 rounded-2xl border-2 border-slate-200 bg-slate-50 px-4 py-6 text-center transition-colors hover:border-accent hover:bg-accent/5 disabled:opacity-50"
                  >
                    <Camera className="h-10 w-10 text-accent" strokeWidth={1.5} />
                    <span className="text-sm font-bold text-slate-800">{t.punch_presence_btn_camera}</span>
                  </button>
                </div>
              )}

              {mode === 'qr' && (
                <div className="mt-4">
                  <p className="mb-2 text-center text-xs font-medium text-slate-600">{t.punch_presence_point_camera}</p>
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

              {mode === 'nfc' && (
                <div className="mt-8 flex flex-col items-center gap-3 py-6">
                  <Loader2 className="h-10 w-10 animate-spin text-accent" />
                  <p className="text-center text-sm text-slate-600">{t.punch_presence_hold_tag}</p>
                </div>
              )}

              {localError && (mode === 'error' || mode === 'qr') && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm text-red-700">
                  {localError}
                </p>
              )}

              {mode === 'error' && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalError('');
                    setMode('choice');
                  }}
                  className="mt-4 w-full rounded-xl bg-slate-100 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-200"
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
