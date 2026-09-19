import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Copy, KeyRound, Loader2, ShieldAlert } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { formatTrans } from '../utils/translations';
import { pinMatchesStored } from '../utils/loginIdentifier';
import { database } from '../lib/database';
import {
  formatRecoveryCode,
  getAppLockStatus,
  isValidUnlockPin,
  minutesUntil,
  recoverAppLockPin,
  verifyAppLockPin,
  type AppLockStatus,
} from '../utils/appLock';
import { isCurrentDeviceRegistered } from '../utils/userDevices';
import { PinPadModal } from './ui/PinPadModal';

interface RefreshLockOverlayProps {
  /**
   * `refresh` (default): blocco dopo sincronizzazione/pubblicazione (PIN di login).
   * `app-open`: blocco alla riapertura dell'app — PIN di sblocco dedicato con lockout.
   */
  mode?: 'refresh' | 'app-open';
  /** Chiamato quando lo sblocco alla riapertura riesce: il chiamante nasconde l'overlay. */
  onUnlocked?: () => void;
}

export default function RefreshLockOverlay({ mode = 'refresh', onUnlocked }: RefreshLockOverlayProps) {
  const { currentUser, users, logout } = useAppUser();
  const {
    unlockAfterRefresh,
    cancelRefreshLock,
    pendingOrderIds,
    pendingPublishWeekStart,
  } = useAppOverlay();
  const appOpen = mode === 'app-open';
  const t = useT();
  const tv = t as Record<string, string>;

  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Riconoscimento dispositivo + stato PIN di sblocco (solo riapertura app) ──
  const [checking, setChecking] = useState(appOpen);
  const [lockStatus, setLockStatus] = useState<AppLockStatus | null>(null);
  const [deviceRevoked, setDeviceRevoked] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [issuedRecoveryCode, setIssuedRecoveryCode] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!appOpen || !currentUser) return;
    let mounted = true;
    void (async () => {
      const [status, device] = await Promise.all([
        getAppLockStatus(currentUser.id),
        isCurrentDeviceRegistered(currentUser.id),
      ]);
      if (!mounted) return;
      setLockStatus(status);
      setDeviceRevoked(device === false);
      setChecking(false);
    })();
    return () => {
      mounted = false;
    };
  }, [appOpen, currentUser]);

  /** True quando è configurato un PIN di sblocco dedicato e le RPC sono disponibili. */
  const useUnlockPin = Boolean(appOpen && lockStatus?.available && lockStatus.configured);

  /** Verifica il PIN di LOGIN dell'utente corrente (fallback quando il PIN di sblocco non c'è). */
  const verifyCurrentUserPin = useCallback(
    async (typedPin: string): Promise<boolean> => {
      if (!currentUser) return false;
      let freshUser = users.find((u) => u.id === currentUser.id) ?? null;
      if (!freshUser) {
        try {
          freshUser = await database.users.getById(currentUser.id);
        } catch {
          freshUser = null;
        }
      }
      return Boolean(freshUser && freshUser.status === 'active' && pinMatchesStored(freshUser, typedPin));
    },
    [currentUser, users]
  );

  const profileDisplayName = useMemo(() => {
    if (!currentUser) return '';
    const fn = (currentUser.first_name ?? '').trim();
    const ln = (currentUser.last_name ?? '').trim();
    const full = [fn, ln].filter(Boolean).join(' ').trim();
    return full || currentUser.email?.split('@')[0] || currentUser.email || '—';
  }, [currentUser]);

  const pinProfileLabel = formatTrans(tv.pin_for_profile_named ?? t.pin_for_profile, {
    name: profileDisplayName,
  });

  const message = appOpen
    ? lockStatus?.locked
      ? formatTrans(tv.app_lock_locked ?? 'Troppi tentativi falliti. Riprova tra {minutes} min.', {
          minutes: String(minutesUntil(lockStatus.lockedUntil)),
        })
      : (t.app_lock_subtitle ?? '')
    : pendingPublishWeekStart
      ? t.publish_pin_prompt
      : pendingOrderIds?.length
        ? t.changes_pin_prompt
        : t.sync_complete_pin_prompt;

  const handleUnlock = async () => {
    if (pin.length !== 4 || !currentUser) return;
    setLoading(true);
    setError('');
    try {
      let ok = false;
      if (useUnlockPin) {
        const res = await verifyAppLockPin(currentUser.id, pin);
        if (res.ok) {
          ok = true;
        } else if (res.reason === 'wrong_pin') {
          setError(formatTrans(tv.app_lock_attempts_left ?? 'PIN errato. Tentativi rimasti: {count}.', {
            count: String(res.remainingAttempts),
          }));
        } else if (res.reason === 'locked') {
          setLockStatus((s) => (s ? { ...s, locked: true, lockedUntil: res.lockedUntil } : s));
          setError(formatTrans(tv.app_lock_locked ?? 'Troppi tentativi falliti. Riprova tra {minutes} min.', {
            minutes: String(minutesUntil(res.lockedUntil)),
          }));
        } else {
          // RPC non disponibile o PIN rimosso: fallback sul PIN di login.
          ok = await verifyCurrentUserPin(pin);
          if (!ok) setError(t.sync_lock_wrong_pin);
        }
      } else if (appOpen) {
        ok = await verifyCurrentUserPin(pin);
        if (!ok) setError(t.sync_lock_wrong_pin);
      } else {
        ok = await unlockAfterRefresh(pin);
        if (!ok) setError(t.sync_lock_wrong_pin);
      }
      setPin('');
      if (ok) {
        setError('');
        onUnlocked?.();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    // Riapertura: senza sblocco non si accede all'app → si esce dal profilo.
    if (appOpen) {
      logout();
      return;
    }
    cancelRefreshLock();
    setPin('');
    setError('');
  };

  const handleRecover = async () => {
    if (!currentUser || recoveryBusy) return;
    if (!isValidUnlockPin(newPin)) {
      setRecoveryError(tv.unlock_pin_error ?? 'Operazione non riuscita. Riprova.');
      return;
    }
    setRecoveryBusy(true);
    setRecoveryError('');
    const res = await recoverAppLockPin(currentUser.id, recoveryCodeInput, newPin);
    setRecoveryBusy(false);
    if (res.ok) {
      setIssuedRecoveryCode(res.recoveryCode);
      setRecoveryCodeInput('');
      setNewPin('');
    } else if (res.reason === 'wrong_code') {
      setRecoveryError(tv.app_lock_recovery_wrong ?? 'Codice di recupero non valido.');
    } else {
      setRecoveryError(tv.unlock_pin_error ?? 'Operazione non riuscita. Riprova.');
    }
  };

  const handleCopyRecovery = async () => {
    try {
      await navigator.clipboard.writeText(issuedRecoveryCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      /* clipboard non disponibile */
    }
  };

  if (!currentUser) return null;

  const cardStyle: CSSProperties = {
    background: 'rgba(20,20,22,0.96)',
    border: '1px solid rgba(255,255,255,0.35)',
    boxShadow: '0 32px 80px rgba(0,0,0,0.75)',
  };

  if (appOpen && checking) {
    return createPortal(
      <div className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/30">
        <Loader2 className="w-8 h-8 animate-spin text-white/80" aria-label={t.app_lock_title} />
      </div>,
      document.body
    );
  }

  if (appOpen && deviceRevoked) {
    return createPortal(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-[23rem] rounded-2xl p-6 text-center text-white" style={cardStyle}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold">{tv.profile_tab_device_title ?? 'Questo dispositivo'}</h2>
          <p className="mt-2 text-sm text-white/70 leading-snug">
            {tv.profile_tab_device_not_registered ?? 'Non riconosciuto'}
          </p>
          <button
            type="button"
            onClick={() => logout()}
            className="mt-6 w-full rounded-2xl py-3.5 text-sm font-bold uppercase tracking-wide"
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            {t.logout}
          </button>
        </div>
      </motion.div>,
      document.body
    );
  }

  if (appOpen && issuedRecoveryCode) {
    return createPortal(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-[23rem] rounded-2xl p-6 text-white" style={cardStyle}>
          <div className="flex flex-col items-center text-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <KeyRound className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold">{tv.app_lock_recovery_code_title ?? 'Codice di recupero'}</h2>
            <p className="text-sm text-white/70 leading-snug">{tv.app_lock_recovery_code_body ?? ''}</p>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <span className="text-lg font-bold tracking-[0.15em]">{formatRecoveryCode(issuedRecoveryCode)}</span>
            <button
              type="button"
              onClick={() => void handleCopyRecovery()}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.12)' }}
            >
              <Copy className="w-3.5 h-3.5" />
              {copiedCode ? 'OK' : 'Copia'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => onUnlocked?.()}
            className="mt-6 w-full rounded-2xl py-3.5 text-sm font-bold uppercase tracking-wide"
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            {tv.app_lock_recovery_code_saved ?? 'Ho salvato il codice'}
          </button>
        </div>
      </motion.div>,
      document.body
    );
  }

  if (appOpen && recoveryOpen) {
    return createPortal(
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[10060] flex items-center justify-center bg-black/40 px-4">
        <div className="w-full max-w-[23rem] rounded-2xl p-6 text-white" style={cardStyle}>
          <div className="flex flex-col items-center text-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <KeyRound className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold">{tv.app_lock_recovery_title ?? 'Recupero account'}</h2>
            <p className="text-sm text-white/70 leading-snug">{tv.app_lock_recovery_subtitle ?? ''}</p>
          </div>

          <div className="mt-5 space-y-3">
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              value={recoveryCodeInput}
              onChange={(e) => { setRecoveryError(''); setRecoveryCodeInput(e.target.value); }}
              placeholder={tv.app_lock_recovery_code ?? 'Codice di recupero'}
              aria-label={tv.app_lock_recovery_code ?? 'Codice di recupero'}
              className="w-full rounded-xl px-4 py-3 text-center text-base font-bold tracking-[0.15em] uppercase text-white placeholder:normal-case placeholder:tracking-normal placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
              style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.2)' }}
            />
            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={newPin}
              onChange={(e) => { setRecoveryError(''); setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4)); }}
              placeholder={tv.app_lock_recovery_new_pin ?? 'Nuovo PIN'}
              aria-label={tv.app_lock_recovery_new_pin ?? 'Nuovo PIN'}
              className="w-full rounded-xl px-4 py-3 text-center text-base font-bold tracking-[0.3em] text-white placeholder:tracking-normal placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/40"
              style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.2)' }}
            />
            {recoveryError && (
              <p className="text-center text-xs font-bold text-red-300 rounded-lg px-3 py-2" style={{ background: 'rgba(255,80,80,0.16)' }}>
                {recoveryError}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={recoveryBusy || recoveryCodeInput.trim().length < 8 || newPin.length !== 4}
            onClick={() => void handleRecover()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold uppercase tracking-wide disabled:opacity-40"
            style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            {recoveryBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : (tv.app_lock_recovery_submit ?? 'Reimposta PIN')}
          </button>
          <button
            type="button"
            onClick={() => { setRecoveryOpen(false); setRecoveryError(''); }}
            className="mt-2 w-full rounded-2xl py-3 text-xs font-semibold text-white/70"
          >
            {t.cancel}
          </button>
        </div>
      </motion.div>,
      document.body
    );
  }

  const recoveryButton = useUnlockPin ? (
    <button
      type="button"
      onClick={() => { setError(''); setRecoveryOpen(true); }}
      disabled={loading}
      title={tv.app_lock_recovery_cta ?? 'Usa codice di recupero'}
      aria-label={tv.app_lock_recovery_cta ?? 'Usa codice di recupero'}
      className="flex flex-col items-center justify-center gap-1 text-white/70 transition-colors hover:text-white disabled:opacity-50"
    >
      <KeyRound className="w-6 h-6" />
    </button>
  ) : undefined;

  return (
    <AnimatePresence>
      <PinPadModal
        title={appOpen ? t.app_lock_title : t.sync_lock_title}
        subtitle={message}
        pinLabel={pinProfileLabel}
        pin={pin}
        onPinChange={(p) => (setPin(p), setError(''))}
        onConfirm={() => void handleUnlock()}
        onCancel={handleCancel}
        error={error}
        isLoading={loading}
        confirmLabel={t.confirm}
        cancelLabel={appOpen ? t.logout : t.sync_lock_cancel}
        leftActionButton={recoveryButton}
      />
    </AnimatePresence>
  );
}
