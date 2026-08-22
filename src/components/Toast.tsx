import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';
interface ToastProps {
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
  /** Sezione di origine: il fumetto si aggancia ad essa e la segue durante lo scroll */
  anchor?: HTMLElement | null;
}


/**
 * Fumetto di notifica. Se `anchor` è presente si posiziona vicino alla sezione
 * che ha generato l'azione (seguendola anche durante lo scroll), altrimenti
 * resta nel banner globale in alto a destra.
 * Scompare automaticamente dopo 3 secondi.
 */
export default function Toast({ message, type = 'error', onClose, anchor }: ToastProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  /* Calcola la posizione relativa alla sezione e la riaggiorna a ogni scroll/resize */
  useLayoutEffect(() => {
    if (!anchor || !anchor.isConnected) {
      setPos(null);
      return;
    }
    const update = () => {
      if (!anchor.isConnected) {
        setPos(null);
        return;
      }
      const rect = anchor.getBoundingClientRect();
      const el = innerRef.current;
      const toastH = el?.offsetHeight ?? 48;
      const toastW = el?.offsetWidth ?? 220;
      const margin = 10;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = rect.left + rect.width / 2 - toastW / 2;
      left = Math.max(margin, Math.min(left, vw - toastW - margin));
      // Se la sezione è completamente uscita dallo schermo, il fumetto resta al bordo corrispondente
      if (rect.bottom < 0) {
        setPos({ top: margin, left });
        return;
      }
      if (rect.top > vh) {
        setPos({ top: vh - toastH - margin, left });
        return;
      }
      let top = rect.top - toastH - margin;
      if (top < margin) top = rect.bottom + margin; // sotto la sezione se sopra non c'è spazio
      setPos({ top, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchor]);

  const isSuccess = type === 'success';
  const isError = type === 'error';

  const accentColor = isSuccess ? '#22c55e' : isError ? '#ef4444' : '#ffffff';
  const Icon = isSuccess ? CheckCircle : isError ? AlertTriangle : Info;

  const el = (
    <motion.div
      ref={innerRef}
      role="status"
      aria-live="polite"
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="fixed z-[99999]"
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { top: 'calc(env(safe-area-inset-top, 0px) + 60px)', right: '1rem' }
      }
    >
      <div
        className="flex max-w-[min(80vw,18rem)] items-center gap-1.5 rounded-lg px-2.5 py-1.5 backdrop-blur-xl"
        style={{
          background: 'rgba(12,14,18,1)',
          border: `1.5px solid ${accentColor}88`,
          boxShadow: `0 24px 80px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.08), 0 0 40px ${accentColor}33, 0 4px 16px rgba(0,0,0,0.40)`,
        }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} />
        <p className="min-w-0 flex-1 text-left text-[0.75rem] font-semibold leading-snug text-white/95 break-words">
          {message}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          aria-label="Chiudi notifica"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(el, document.body);
}
