/**
 * Imposta o cambia il PIN di sblocco app.
 * Flusso a passi riusando `PinPadModal`; al termine mostra una sola volta il codice di recupero.
 */
import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Copy, KeyRound } from 'lucide-react';
import { PinPadModal } from './PinPadModal';
import { useAppUser } from '../../context/appSliceContexts';
import { useT } from '../../hooks/useT';
import { formatTrans } from '../../utils/translations';
import {
  formatRecoveryCode,
  isValidUnlockPin,
  minutesUntil,
  setAppLockPin,
  verifyAppLockPin,
} from '../../utils/appLock';

type Step = 'current' | 'new' | 'confirm' | 'recovery';

interface UnlockPinModalProps {
  /** `set`: primo PIN (nessun PIN corrente). `change`: richiede il PIN attuale. */
  mode: 'set' | 'change';
  /** Chiamato a flusso completato (PIN salvato e codice mostrato) o annullato. */
  onDone: (result: { configured: boolean }) => void;
  onCancel: () => void;
}

export function UnlockPinModal({ mode, onDone, onCancel }: UnlockPinModalProps) {
  const { currentUser } = useAppUser();
  const t = useT();
  const tv = t as Record<string, string>;

  const [step, setStep] = useState<Step>(mode === 'change' ? 'current' : 'new');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [copied, setCopied] = useState(false);
  const firstPinRef = useRef('');

  const resetToNew = useCallback(() => {
    firstPinRef.current = '';
    setPin('');
    setError('');
    setStep('new');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (busy || !currentUser) return;
    if (pin.length !== 4) return;

    if (step === 'current') {
      setBusy(true);
      const res = await verifyAppLockPin(currentUser.id, pin);
      setBusy(false);
      setPin('');
      if (res.ok) {
        setError('');
        setStep('new');
        return;
      }
      if (res.reason === 'wrong_pin') {
        setError(`${tv.unlock_pin_wrong_current ?? 'PIN attuale non corretto'} · ${res.remainingAttempts}`);
      } else if (res.reason === 'locked') {
        setError(formatTrans(tv.app_lock_locked ?? 'Troppi tentativi falliti. Riprova tra {minutes} min.', {
          minutes: String(minutesUntil(res.lockedUntil)),
        }));
      } else {
        setError(tv.unlock_pin_error ?? 'Operazione non riuscita. Riprova.');
      }
      return;
    }

    if (step === 'new') {
      if (!isValidUnlockPin(pin)) {
        setError(tv.unlock_pin_error ?? 'Operazione non riuscita. Riprova.');
        setPin('');
        return;
      }
      firstPinRef.current = pin;
      setPin('');
      setError('');
      setStep('confirm');
      return;
    }

    if (step === 'confirm') {
      if (pin !== firstPinRef.current) {
        setError(tv.unlock_pin_mismatch ?? 'I PIN non coincidono');
        resetToNew();
        return;
      }
      setBusy(true);
      const res = await setAppLockPin(currentUser.id, pin, currentUser.tenant_id ?? null);
      setBusy(false);
      setPin('');
      if (res.ok) {
        setRecoveryCode(res.recoveryCode);
        setStep('recovery');
        return;
      }
      setError(tv.unlock_pin_error ?? 'Operazione non riuscita. Riprova.');
      resetToNew();
    }
  }, [busy, currentUser, pin, step, tv, resetToNew]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard non disponibile */
    }
  }, [recoveryCode]);

  const title =
    step === 'current'
      ? (tv.unlock_pin_change ?? 'Cambia PIN')
      : step === 'confirm'
        ? (tv.unlock_pin_set ?? 'Imposta PIN')
        : (tv.app_lock_setup_title ?? 'Imposta il PIN di sblocco');

  const pinLabel =
    step === 'current'
      ? (tv.unlock_pin_wrong_current ?? 'PIN attuale')
      : step === 'confirm'
        ? (t.confirm ?? 'Conferma')
        : (tv.app_lock_recovery_new_pin ?? 'Nuovo PIN');

  const subtitle =
    step === 'current'
      ? (tv.profile_tab_security_desc ?? '')
      : (tv.app_lock_setup_subtitle ?? '');

  if (step === 'recovery') {
    return createPortal(
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/40 px-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[23rem] rounded-2xl p-6 text-white"
          style={{ background: 'rgba(20,20,22,0.96)', border: '1px solid rgba(255,255,255,0.35)' }}
        >
          <div className="flex flex-col items-center text-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <KeyRound className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold">{tv.app_lock_recovery_code_title ?? 'Codice di recupero'}</h2>
            <p className="text-sm text-white/70 leading-snug">{tv.app_lock_recovery_code_body ?? ''}</p>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <span className="text-lg font-bold tracking-[0.15em]">{formatRecoveryCode(recoveryCode)}</span>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.12)' }}
              aria-label={tv.app_lock_recovery_code_title ?? 'Codice di recupero'}
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? 'OK' : 'Copia'}
            </button>
          </div>

          <button
            type="button"
            onClick={() => onDone({ configured: true })}
            className="mt-6 w-full rounded-2xl py-3.5 text-sm font-bold uppercase tracking-wide"
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            {tv.app_lock_recovery_code_saved ?? 'Ho salvato il codice'}
          </button>
        </motion.div>
      </motion.div>,
      document.body
    );
  }

  return (
    <PinPadModal
      title={title}
      subtitle={subtitle}
      pinLabel={pinLabel}
      pin={pin}
      onPinChange={(p) => { setError(''); setPin(p); }}
      onConfirm={() => void handleConfirm()}
      onCancel={onCancel}
      error={error}
      isLoading={busy}
      confirmLabel={tv.unlock_pin_set ?? 'Imposta PIN'}
      cancelLabel={t.cancel}
    />
  );
}

export default UnlockPinModal;
