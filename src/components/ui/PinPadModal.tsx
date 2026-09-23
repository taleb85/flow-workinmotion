import { motion } from 'framer-motion';
import { Lock, ShieldCheck, Delete } from 'lucide-react';
import React, { ReactNode, useEffect, useId, useLayoutEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useT } from '../../hooks/useT';

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
  cancelLabel?: string;
  leftActionButton?: ReactNode;
  /** Non più usato: lo sfondo scuro è `bg-black/40`, uniforme a tutte le modali. */
  backdropClass?: string;
}

export function PinPadModal({
  pinLabel,
  pin,
  onPinChange,
  onConfirm,
  onCancel,
  error,
  isLoading = false,
  cancelLabel,
  leftActionButton,
  backdropClass: _backdropClass,
}: PinPadModalProps) {
  const t = useT();
  const cancelText = cancelLabel ?? t.cancel;
  useBodyScrollLock(true);

  const pinAreaRef = useRef<HTMLDivElement>(null);
  /** Input PIN della versione mobile: usa la tastiera numerica di sistema. */
  const mobilePinInputRef = useRef<HTMLInputElement>(null);
  const mobilePinInputId = useId();

  // Autofocus all'apertura: su mobile serve a far comparire subito la tastiera
  // numerica di sistema, su PC/tablet il focus va sulla card (si usa il tastierino
  // della modale). Deve essere `useLayoutEffect`, non `useEffect`: iOS mostra la
  // tastiera solo se il focus avviene in modo sincrono dentro il gesto che ha
  // aperto la modale.
  useLayoutEffect(() => {
    if (window.innerWidth < 768) {
      mobilePinInputRef.current?.focus();
      return;
    }
    pinAreaRef.current?.focus();
  }, []);

  /** iOS: se l'apertura non deriva da un gesto (es. dopo un controllo asincrono)
   *  il focus sincrono viene ignorato. Al primo tocco sulla card rimettiamo il
   *  focus sull'input, così la tastiera compare comunque subito. */
  const focusMobilePinInput = () => {
    if (window.innerWidth < 768) mobilePinInputRef.current?.focus();
  };

  // Auto-conferma quando il PIN raggiunge 4 cifre (con animazione lucchetto rosso→verde)
  const [successAnim, setSuccessAnim] = useState(false);
  useEffect(() => {
    if (pin.length === 4 && !isLoading) {
      setSuccessAnim(true);
      const timer = setTimeout(() => {
        onConfirm();
      }, 800);
      return () => clearTimeout(timer);
    }
    setSuccessAnim(false);
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

  const border = '1px solid rgba(255,255,255,0.40)';
  const btnBase = {
    background: 'transparent',
    border,
    transition: 'background 0.15s ease, border-color 0.15s ease',
  } as React.CSSProperties;

  /* ── Contenuto condiviso mobile/desktop ─────────────────────────── */
  const content = (
    <>
      {/* Header */}
      <div className="flex flex-col items-center text-center pt-8 md:pt-6 pb-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl mb-3" style={{ background: 'rgba(255,255,255,0.06)', border, boxShadow: '0 0 20px rgba(255,255,255,0.06)' }}>
          <div className={successAnim ? 'pin-lock-success' : ''} style={{ color: successAnim ? undefined : '#ffffff' }}>
            <Lock className="w-8 h-8" strokeWidth={2.5} />
          </div>
        </div>
      </div>

      {/* PIN display — mobile: pallini, con input invisibile sopra per la
          tastiera numerica di sistema. */}
      <div className="px-5 sm:px-8 mt-2 md:hidden">
        <div className="flex items-center justify-center gap-1.5 text-white/75 mb-2">
          <ShieldCheck className="w-5 h-5" strokeWidth={2.5} />
          <label htmlFor={mobilePinInputId} className="text-sm font-bold uppercase tracking-widest">{pinLabel}</label>
        </div>
        <div
          className="relative w-full h-14 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.40)' }}
        >
          <div className="flex items-center gap-6" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`w-4 h-4 rounded-full transition-colors duration-200 ${filledCount === i ? 'animate-pulse' : ''}`}
                style={filledCount > i
                  ? { background: '#ffffff', boxShadow: '0 0 10px 3px rgba(255,255,255,0.60)' }
                  : { background: 'transparent', border: '1.5px solid rgba(255,255,255,0.9)' }}
              />
            ))}
          </div>
          <input
            id={mobilePinInputId}
            ref={mobilePinInputRef}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={4}
            value={pin}
            disabled={isLoading}
            onChange={(e) => onPinChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && pin.length === 4) {
                e.preventDefault();
                onConfirm();
              }
            }}
            className="absolute inset-0 h-full w-full rounded-2xl opacity-0 outline-none"
          />
        </div>
        {error && <p className="text-red-400 text-xs font-bold text-center animate-shake mt-2">{error}</p>}
      </div>

      {/* PIN display — PC/tablet: pallini + tastierino della modale */}
      <div className="hidden md:flex flex-col items-center gap-2 px-5 sm:px-8 mt-2">
        <div className="flex items-center gap-1.5 text-white/75 mb-1">
          <ShieldCheck className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-sm font-bold uppercase tracking-widest">{pinLabel}</span>
        </div>
        <div className="w-full h-12 rounded-2xl flex items-center justify-center relative"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.40)' }}>
          <div className="flex items-center gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="relative flex items-center justify-center">
                <div
                  className={`w-4 h-4 rounded-full transition-colors duration-200 ${filledCount === i ? 'animate-pulse' : ''}`}
                  style={filledCount > i
                    ? { background: '#ffffff', boxShadow: '0 0 10px 3px rgba(255,255,255,0.60)' }
                    : { background: 'transparent', border: '1.5px solid rgba(255,255,255,0.9)' }}
                />
              </div>
            ))}
          </div>
        </div>
        {error && <p className="text-red-400 text-xs font-bold text-center animate-shake">{error}</p>}
      </div>

      {/* Numpad — solo PC e tablet */}
      <div className="hidden md:flex flex-col justify-center px-5 sm:px-8 mt-2">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
            <button key={n} type="button" onClick={() => handleKey(n)}
              className="h-16 sm:h-14 md:h-12 rounded-2xl font-bold text-3xl sm:text-2xl text-white transition-colors hover:bg-white/10 hover:border-white/20"
              style={btnBase}>{n}</button>
          ))}
          {leftActionButton ? (
            <div className="h-16 sm:h-14 md:h-12 rounded-2xl flex items-center justify-center" style={btnBase}>{leftActionButton}</div>
          ) : (
            <div className="h-16 sm:h-14 md:h-12 rounded-2xl" style={btnBase} aria-hidden />
          )}
          <button type="button" onClick={() => handleKey(0)}
            className="h-16 sm:h-14 md:h-12 rounded-2xl font-bold text-3xl sm:text-2xl text-white transition-colors hover:bg-white/10 hover:border-white/20"
            style={btnBase}>0</button>
          <button type="button" onClick={() => handleKey('del')}
            className="h-16 sm:h-14 md:h-12 rounded-2xl flex items-center justify-center text-white/70 hover:text-white transition-colors hover:bg-white/10 hover:border-white/20"
            style={btnBase}>
            <Delete className="w-7 h-7 sm:w-6 sm:h-6" />
          </button>
        </div>
      </div>

      {/* Azione. Nessun pulsante "Conferma": il PIN si invia da solo
          raggiunte le 4 cifre (vedi l'effetto `successAnim` sopra). */}
      <div className="flex gap-2 px-5 sm:px-8 pb-6 md:pb-4 mt-2">
        <button type="button" onClick={onCancel}
          className="flex-1 h-12 rounded-2xl font-bold text-sm text-white/80 hover:text-white transition-colors hover:bg-white/10 hover:border-white/20 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          style={btnBase}>{cancelText}</button>
      </div>
    </>
  );

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-[10060] flex flex-col items-center justify-start pt-[max(5.5rem,env(safe-area-inset-top,0px))] md:justify-center md:pt-0 overflow-hidden bg-black/30"
      style={{ }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      {/* Card centrata — mobile e desktop */}
      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30, mass: 0.9 }}
        ref={pinAreaRef}
        tabIndex={-1}
        className="pinpad-card flex flex-col w-full max-w-[23rem] md:max-w-[21.25rem] mx-4 rounded-2xl overflow-hidden outline-none"
        style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.40)', boxShadow: '0 32px 80px rgba(0,0,0,0.75)' }}
        onPointerDown={focusMobilePinInput}
        onClick={e => e.stopPropagation()}
      >
        {content}
      </motion.div>
    </motion.div>,
    document.body
  );
}
