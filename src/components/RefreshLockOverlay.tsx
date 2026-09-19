import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { formatTrans } from '../utils/translations';
import { pinMatchesStored } from '../utils/loginIdentifier';
import { database } from '../lib/database';
import { getAppLockStatus, minutesUntil, verifyAppLockPin, type AppLockStatus } from '../utils/appLock';
import { isCurrentDeviceRegistered } from '../utils/userDevices';
import { PinPadModal } from './ui/PinPadModal';

interface RefreshLockOverlayProps {
  /**
   * `refresh` (default): blocco dopo sincronizzazione/pubblicazione.
   * `app-open`: blocco alla riapertura dell'app — PIN del profilo con lockout.
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

  // ── Riconoscimento dispositivo + stato lockout (solo riapertura app) ─────────
  const [checking, setChecking] = useState(appOpen);
  const [lockStatus, setLockStatus] = useState<AppLockStatus | null>(null);
  const [deviceRevoked, setDeviceRevoked] = useState(false);

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

  /** True quando il lockout è applicato lato server (RPC disponibili). */
  const serverLockActive = Boolean(appOpen && lockStatus?.available);

  /** Confronto locale del PIN del profilo: fallback se le RPC non sono disponibili. */
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
      if (serverLockActive) {
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
          // Utente non trovato o RPC non disponibile: fallback locale.
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
    // Un nuovo login completo (nome + PIN) azzera il lockout: è il recupero account.
    if (appOpen) {
      logout();
      return;
    }
    cancelRefreshLock();
    setPin('');
    setError('');
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
      />
    </AnimatePresence>
  );
}
