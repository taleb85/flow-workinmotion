import { useMemo, useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Smartphone, Fingerprint, Loader2 } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { formatTrans } from '../utils/translations';
import { supportsPinUnlockWebAuthn, hasPlatformBiometricAuthenticator } from '../utils/pinUnlockWebAuthn';
import { PinPadModal } from './ui/PinPadModal';

export default function RefreshLockOverlay() {
  const { currentUser } = useAppUser();
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
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deviceUnlockLoading, setDeviceUnlockLoading] = useState(false);
  const [linkDeviceLoading, setLinkDeviceLoading] = useState(false);
  const t = useT();
  const tv = t as Record<string, string>;
  const [webAuthnSupported, setWebAuthnSupported] = useState(false);
  useEffect(() => {
    if (supportsPinUnlockWebAuthn()) {
      hasPlatformBiometricAuthenticator().then(setWebAuthnSupported);
    }
  }, []);

  const handleDeviceUnlock = async () => {
    if (deviceUnlockLoading || loading || linkDeviceLoading) return;
    setDeviceUnlockLoading(true);
    setError('');
    try {
      const ok = await unlockAfterRefreshWithDevice();
      if (!ok) setError(t.sync_lock_device_failed);
    } finally {
      setDeviceUnlockLoading(false);
    }
  };

  // Auto-trigger biometric unlock if device is registered
  useEffect(() => {
    if (pinUnlockDeviceRegistered && !deviceUnlockLoading && !loading && !linkDeviceLoading) {
      void handleDeviceUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinUnlockDeviceRegistered]);

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

  const message = pendingPublishWeekStart
    ? t.publish_pin_prompt
    : pendingOrderIds?.length
      ? t.changes_pin_prompt
      : t.sync_complete_pin_prompt;

  const handleUnlock = async () => {
    if (pin.length !== 4) return;
    setLoading(true);
    setError('');
    try {
      const ok = await unlockAfterRefresh(pin);
      if (ok) {
        setPin('');
      } else {
        setError(t.sync_lock_wrong_pin);
        setPin('');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
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
        onClick={handleDeviceUnlock}
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
        <span className="text-[11px] font-black uppercase tracking-tighter leading-none">
          {t.sync_lock_link_device}
        </span>
      </button>
    )
  ) : null;

  return (
    <AnimatePresence>
      <PinPadModal
        title={t.sync_lock_title}
        subtitle={message}
        pinLabel={pinProfileLabel}
        pin={pin}
        onPinChange={(p) => (setPin(p), setError(''))}
        onConfirm={handleUnlock}
        onCancel={handleCancel}
        error={error}
        isLoading={busy}
        confirmLabel={t.confirm}
        cancelLabel={t.sync_lock_cancel}
        leftActionButton={leftActionButton}
      />
    </AnimatePresence>
  );
}
