import { motion } from 'framer-motion';
import { Lock, ShieldCheck, Delete, Fingerprint, Loader2, Smartphone } from 'lucide-react';
import React, { ReactNode, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useT } from '../../hooks/useT';
import {
  supportsPinUnlockWebAuthn,
  hasPinUnlockCredential,
  authenticatePinUnlockCredential,
  registerPinUnlockCredential,
  hasPlatformBiometricAuthenticator,
} from '../../utils/pinUnlockWebAuthn';

interface PinPadModalProps {
  title: string;
  subtitle: string;
  pinLabel: string;
  pin: string;
  onPinChange: (pin: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  error?: string;
  isLoading?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
  leftActionButton?: ReactNode;
  /** Sovrascrive le classi dell'overlay (default: 'bg-black/30 backdrop-blur-[3px]') */
  backdropClass?: string;
  /** ID utente per biometrica interna (usato solo se leftActionButton non è fornito) */
  userId?: string;
  /** Nome visualizzato per la registrazione biometrica */
  userDisplayName?: string;
  /** Email per la registrazione biometrica */
  userEmail?: string;
  /** Chiamato quando l'autenticazione biometrica riesce. Se assente, viene chiamato onConfirm() direttamente. */
  onBiometricSuccess?: () => void | Promise<void>;
}

export function PinPadModal({
  title,
  subtitle,
  pinLabel,
  pin,
  onPinChange,
  onConfirm,
  onCancel,
  error,
  isLoading = false,
  confirmLabel,
  cancelLabel,
  leftActionButton,
  backdropClass: _backdropClass,
  userId,
  userDisplayName,
  userEmail,
  onBiometricSuccess,
}: PinPadModalProps) {
  const t = useT();
  const confirmText = confirmLabel ?? t.confirm;
  const cancelText = cancelLabel ?? t.cancel;
  useBodyScrollLock(true);

  // ── Biometrica interna (solo se leftActionButton non è fornito) ─────────────
  const [hasBiometric, setHasBiometric] = useState(false);
  useEffect(() => {
    if (!leftActionButton && !!userId && supportsPinUnlockWebAuthn()) {
      hasPlatformBiometricAuthenticator().then(setHasBiometric);
    }
  }, [leftActionButton, userId]);
  const webAuthnOk = !leftActionButton && !!userId && hasBiometric;
  const credRegistered = webAuthnOk && hasPinUnlockCredential(userId!);
  const [bioLoading, setBioLoading] = useState(false);
  const [bioRegLoading, setBioRegLoading] = useState(false);

  const handleBiometric = useCallback(async () => {
    if (!userId || bioLoading || isLoading) return;
    setBioLoading(true);
    try {
      const ok = await authenticatePinUnlockCredential(userId);
      if (ok) {
        if (onBiometricSuccess) await onBiometricSuccess();
        else onConfirm();
      }
    } finally {
      setBioLoading(false);
    }
  }, [userId, bioLoading, isLoading, onBiometricSuccess, onConfirm]);

  const handleBioRegister = useCallback(async () => {
    if (!userId || bioRegLoading) return;
    setBioRegLoading(true);
    try {
      await registerPinUnlockCredential(
        userId,
        userDisplayName ?? userId,
        userEmail ?? '',
      );
    } finally {
      setBioRegLoading(false);
    }
  }, [userId, bioRegLoading, userDisplayName, userEmail]);

  // Auto-trigger biometrica al mount se credenziale già registrata
  useEffect(() => {
    if (credRegistered && !bioLoading) void handleBiometric();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-conferma quando il PIN raggiunge 4 cifre
  useEffect(() => {
    if (pin.length === 4 && !isLoading) {
      onConfirm();
    }
  }, [pin.length, isLoading, onConfirm]);
  // ────────────────────────────────────────────────────────────────────────────

  const handleKey = (n: number | 'del') => {
    if (isLoading) return;
    if (n === 'del') {
      onPinChange(pin.slice(0, -1));
    } else if (pin.length < 4) {
      onPinChange(pin + String(n));
    }
  };

  // Supporto tastiera fisica
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isLoading) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKey(parseInt(e.key, 10));
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        handleKey('del');
      } else if (e.key === 'Enter' && pin.length === 4) {
        e.preventDefault();
        onConfirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, isLoading]);

  const filledCount = pin.length;

  const border = '1px solid rgba(255,255,255,0.18)';
  const btnBase = {
    background: 'transparent',
    border,
    transition: 'background 0.15s ease, border-color 0.15s ease',
  } as React.CSSProperties;

  /* ── Contenuto condiviso mobile/desktop ─────────────────────────── */
  const content = (
    <>
      {/* Header */}
      <div className="flex flex-col items-center text-center pt-12 sm:pt-6 pb-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4" style={{ background: 'rgba(255,255,255,0.06)', border, boxShadow: '0 0 20px rgba(255,255,255,0.06)' }}>
          <Lock className="w-6 h-6 text-white" strokeWidth={2.5} />
        </div>
        <h2 className="text-white font-bold uppercase tracking-widest text-base mb-1">{title}</h2>
        <p className="text-white/65 text-sm font-semibold leading-tight px-4">{subtitle}</p>
      </div>

      {/* PIN display */}
      <div className="flex flex-col items-center gap-2 px-8 mt-4">
        <div className="flex items-center gap-1.5 text-white/75 mb-1">
          <ShieldCheck className="w-4 h-4" strokeWidth={2.5} />
          <span className="text-xs font-bold uppercase tracking-widest">{pinLabel}</span>
        </div>
        <div className="w-full h-14 rounded-2xl flex items-center justify-center relative"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.18)' }}>
          <div className="flex items-center gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="relative flex items-center justify-center">
                {filledCount === i && (
                  <motion.div animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }}
                    className="absolute -left-3 h-8 w-[2px] rounded-full bg-white/70" />
                )}
                <motion.div
                  animate={filledCount > i ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                  transition={{ duration: 0.18 }}
                  className="w-4 h-4 rounded-full transition-colors duration-200"
                  style={filledCount > i
                    ? { background: '#ffffff', boxShadow: '0 0 10px 3px rgba(255,255,255,0.60)' }
                    : { background: 'rgba(255,255,255,0.35)' }}
                />
                {filledCount === 4 && i === 3 && (
                  <motion.div animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1, repeat: Infinity }}
                    className="absolute -right-3 h-8 w-[2px] rounded-full bg-white/70" />
                )}
              </div>
            ))}
          </div>
        </div>
        {error && <p className="text-red-400 text-xs font-bold text-center animate-shake">{error}</p>}
      </div>

      {/* Numpad */}
      <div className="flex-1 flex flex-col justify-center px-8 mt-4 sm:flex-none">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} type="button" onClick={() => handleKey(n)}
              className="h-14 rounded-2xl font-bold text-2xl text-white active:scale-95 transition-all hover:bg-white/10 hover:border-white/30"
              style={btnBase}>{n}</button>
          ))}
          {leftActionButton ? (
            <div className="h-14 rounded-2xl flex items-center justify-center" style={btnBase}>{leftActionButton}</div>
          ) : !!userId && supportsPinUnlockWebAuthn() ? (
            credRegistered ? (
              <button type="button" onClick={handleBiometric} disabled={bioLoading || isLoading}
                className="h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-white/80 active:scale-95 transition-all disabled:opacity-50 hover:bg-white/10 hover:border-white/30 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                style={btnBase} title="Usa impronta digitale">
                {bioLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Fingerprint className="w-6 h-6" />}
              </button>
            ) : (
              <button type="button" onClick={handleBioRegister} disabled={bioRegLoading || isLoading}
                className="h-14 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-white/50 hover:text-white/80 active:scale-95 transition-all hover:bg-white/10 hover:border-white/30 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                style={btnBase} title="Collega impronta digitale">
                {bioRegLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Smartphone style={{ width: '1.25rem', height: '1.25rem' }} />}
                <span className="text-[7px] font-black uppercase tracking-tighter leading-none">Collega</span>
              </button>
            )
          ) : (
            <div className="h-14 rounded-2xl" style={btnBase} />
          )}
          <button type="button" onClick={() => handleKey(0)}
            className="h-14 rounded-2xl font-bold text-2xl text-white active:scale-95 transition-all hover:bg-white/10 hover:border-white/30"
            style={btnBase}>0</button>
          <button type="button" onClick={() => handleKey('del')}
            className="h-14 rounded-2xl flex items-center justify-center text-white/70 hover:text-white active:scale-95 transition-all hover:bg-white/10 hover:border-white/30"
            style={btnBase}>
            <Delete className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 px-8 pb-10 sm:pb-6 mt-4">
        <button type="button" onClick={onCancel}
          className="flex-1 h-14 rounded-2xl font-bold text-sm text-white/80 hover:text-white active:scale-95 transition-all hover:bg-white/10 hover:border-white/30 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          style={btnBase}>{cancelText}</button>
        <button type="button" disabled={pin.length !== 4 || isLoading} onClick={onConfirm}
          className="flex-1 h-14 rounded-2xl text-white font-bold text-sm disabled:opacity-35 active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-white/12 hover:border-white/30 disabled:hover:bg-transparent disabled:hover:border-inherit hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          style={btnBase}>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmText}
        </button>
      </div>
    </>
  );

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[10060] flex flex-col items-center justify-center overflow-hidden bg-black/60 backdrop-blur-md supports-[backdrop-filter]:bg-black/50"
      style={{ }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Card centrata — mobile e desktop */}
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.9 }}
        className="flex flex-col w-full max-w-[340px] mx-4 rounded-3xl overflow-hidden"
        style={{ backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.18)', boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.08), 0 0 40px rgba(255,255,255,0.04)' }}
        onClick={e => e.stopPropagation()}
      >
        {content}
      </motion.div>
    </motion.div>,
    document.body
  );
}
