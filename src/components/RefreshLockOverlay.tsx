import { useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAppUser } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { formatTrans } from '../utils/translations';
import { pinMatchesStored } from '../utils/loginIdentifier';
import { database } from '../lib/database';
import { PinPadModal } from './ui/PinPadModal';

interface RefreshLockOverlayProps {
  /**
   * `refresh` (default): blocco dopo sincronizzazione/pubblicazione.
   * `app-open`: blocco alla riapertura dell'app — PIN a 4 cifre.
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
  /** Riapertura app: l'utente è già autenticato, serve solo riconfermare l'accesso. */
  const appOpen = mode === 'app-open';
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const t = useT();
  const tv = t as Record<string, string>;

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

  const busy = loading;

  if (!currentUser) return null;

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
      />
    </AnimatePresence>
  );
}
