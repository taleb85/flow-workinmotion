import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Smartphone, Fingerprint, Loader2 } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { formatTrans } from '../utils/translations';
import {
  supportsPinUnlockWebAuthn,
  hasPlatformBiometricAuthenticator,
  authenticatePinUnlockCredential,
} from '../utils/pinUnlockWebAuthn';
import { pinMatchesStored } from '../utils/loginIdentifier';
import { database } from '../lib/database';
import { PinPadModal } from './ui/PinPadModal';

interface RefreshLockOverlayProps {
  /**
   * `refresh` (default): blocco dopo sincronizzazione/pubblicazione.
   * `app-open`: blocco alla riapertura dell'app — Face ID/impronta oppure PIN a 4 cifre.
   */
  mode?: 'refresh' | 'app-open';
  /** Chiamato quando lo sblocco alla riapertura riesce: il chiamante nasconde l'overlay. */
  onUnlocked?: () => void;
}

export default function RefreshLockOverlay({ mode = 'refresh', onUnlocked }: RefreshLockOverlayProps) {
  const { currentUser, users, logout } = useAppUser();
  const {
    unlockAfterRefresh,
    unlockAfterRefreshWithDevice,
    registerPinUnlockDevice,
    pinUnlockDeviceRegistered,
    cancelRefreshLock,
    pendingOrderIds,
    pendingPublishWeekStart,
    showSuccess,
  } = useAppOverlay();
  /** Riapertura app: l'utente è già autenticato, serve solo riconfermare l'accesso. */
  const appOpen = mode === 'app-open';
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceUnlockLoading, setDeviceUnlockLoading] = useState(false);
  const [linkDeviceLoading, setLinkDeviceLoading] = useState(false);
  /** Ritentativo biometrico al primo tocco, con uso unico (evita prompt a raffica). */
  const [armedGestureRetry, setArmedGestureRetry] = useState(false);
  const gestureRetryUsedRef = useRef(false);
  const t = useT();
  const tv = t as Record<string, string>;
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);
  useEffect(() => {
    if (supportsPinUnlockWebAuthn()) {
      hasPlatformBiometricAuthenticator().then(setWebAuthnSupported);
    }
  }, []);

  /** Verifica il PIN dell'utente corrente sul dispositivo (nessuna azione di sync). */
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

  const handleDeviceUnlock = useCallback(async (fromGesture = false) => {
    if (deviceUnlockLoading || loading || linkDeviceLoading) return;
    if (!currentUser) return;
    if (fromGesture) gestureRetryUsedRef.current = true;
    setDeviceUnlockLoading(true);
    setError('');
    let ok = false;
    try {
      ok = appOpen
        ? await authenticatePinUnlockCredential(currentUser.id)
        : await unlockAfterRefreshWithDevice();
    } catch (e) {
      // Cerimonia WebAuthn rifiutata (es. iOS senza gesto utente): mostra il motivo
      // invece di lasciare il pulsante apparentemente inerte.
      console.warn('[RefreshLockOverlay] sblocco dispositivo fallito', e);
    } finally {
      setDeviceUnlockLoading(false);
    }
    if (ok) {
      onUnlocked?.();
      return;
    }
    setError(t.sync_lock_device_failed);
    // All'avvio a freddo iOS/Chrome possono rifiutare la cerimonia automatica (pagina non
    // ancora a fuoco): si arma un solo ritentativo, che parte al primo tocco sullo schermo.
    if (!fromGesture && !gestureRetryUsedRef.current) setArmedGestureRetry(true);
  }, [appOpen, currentUser, deviceUnlockLoading, linkDeviceLoading, loading, onUnlocked, t.sync_lock_device_failed, unlockAfterRefreshWithDevice]);

  // Auto-trigger biometric unlock if device is registered
  useEffect(() => {
    if (pinUnlockDeviceRegistered && !deviceUnlockLoading && !loading && !linkDeviceLoading) {
      void handleDeviceUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinUnlockDeviceRegistered]);

  // Ritentativo unico dello sblocco biometrico al primo tocco (vedi handleDeviceUnlock).
  useEffect(() => {
    if (!armedGestureRetry) return;
    const retry = () => {
      setArmedGestureRetry(false);
      void handleDeviceUnlock(true);
    };
    window.addEventListener('pointerdown', retry, { once: true });
    return () => window.removeEventListener('pointerdown', retry);
  }, [armedGestureRetry, handleDeviceUnlock]);

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
    ? t.app_lock_subtitle
    : pendingPublishWeekStart
      ? t.publish_pin_prompt
      : pendingOrderIds?.length
        ? t.changes_pin_prompt
        : t.sync_complete_pin_prompt;

  const handleUnlock = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    setError('');
    try {
      const ok = appOpen ? await verifyCurrentUserPin(pin) : await unlockAfterRefresh(pin);
      if (ok) {
        setPin('');
        onUnlocked?.();
      } else {
        setError(t.sync_lock_wrong_pin);
        setPin('');
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

  const handleLinkDevice = async () => {
    if (pin.length !== 4) {
      setError(t.sync_lock_link_need_pin);
      return;
    }
    setLinkDeviceLoading(true);
    setError('');
    try {
      const r = await registerPinUnlockDevice(pin);
      if (r.wrongPin) {
        setError(t.sync_lock_wrong_pin);
        setPin('');
      } else if (r.ok) {
        showSuccess(t.sync_lock_device_linked);
      } else {
        setError(t.sync_lock_device_register_failed);
      }
    } finally {
      setLinkDeviceLoading(false);
    }
  };

  const busy = loading || deviceUnlockLoading || linkDeviceLoading;

  if (!currentUser) return null;

  const leftActionButton = webAuthnSupported ? (
    pinUnlockDeviceRegistered ? (
      <button
        type="button"
        onClick={() => void handleDeviceUnlock(true)}
        disabled={busy}
        title={t.sync_lock_device_unlock_title}
        className="flex flex-col items-center justify-center gap-1 text-accent transition-transform"
      >
        {deviceUnlockLoading ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <Fingerprint className="w-6 h-6" />
        )}
      </button>
    ) : (
      <button
        type="button"
        onClick={handleLinkDevice}
        disabled={busy}
        title={t.sync_lock_link_device_title}
        className="flex flex-col items-center justify-center gap-0.5 text-white/50 transition-transform"
      >
        {linkDeviceLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Smartphone className="w-5 h-5 text-[#455a3f]" />
        )}
        <span className="text-[0.6875rem] font-black uppercase tracking-tighter leading-none">
          {t.sync_lock_link_device}
        </span>
      </button>
    )
  ) : null;

  return (
    <AnimatePresence>
      <PinPadModal
        title={appOpen ? t.app_lock_title : t.sync_lock_title}
        subtitle={message}
        pinLabel={pinProfileLabel}
        pin={pin}
        onPinChange={(p) => (setPin(p), setError(''))}
        onConfirm={handleUnlock}
        onCancel={handleCancel}
        error={error}
        isLoading={busy}
        confirmLabel={t.confirm}
        cancelLabel={appOpen ? t.logout : t.sync_lock_cancel}
        leftActionButton={leftActionButton}
      />
    </AnimatePresence>
  );
}
