import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

interface SavedToastProps {
  open: boolean;
  /** Elemento a cui il fumetto si aggancia (lo segue durante lo scroll) */
  anchor: HTMLElement | null;
  message: string;
  onClose: () => void;
  autoHideMs?: number;
}

/**
 * Fumetto verde "Salvato": si aggancia all'elemento che ha generato il salvataggio
 * (lo segue durante lo scroll) e scompare automaticamente dopo autoHideMs.
 */
export default function SavedToast({ open, anchor, message, onClose, autoHideMs = 2000 }: SavedToastProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  /* Auto-hide garantito: il timer parte a ogni apertura e, se `open` resta true,
     scade comunque e chiude il fumetto. */
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(onClose, autoHideMs);
    return () => clearTimeout(t);
  }, [open, autoHideMs, onClose]);

  /* Posizione calcolata dall'ancora, aggiornata a ogni scroll/resize (il fumetto segue la sezione) */
  useLayoutEffect(() => {
    if (!open || !anchor || !anchor.isConnected) {
      setPos(null);
      return;
    }
    const update = () => {
      if (!anchor.isConnected) return;
      const rect = anchor.getBoundingClientRect();
      const el = innerRef.current;
      const toastH = el?.offsetHeight ?? 32;
      const toastW = el?.offsetWidth ?? 90;
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = rect.right - 100;
      left = Math.max(margin, Math.min(left, vw - toastW - margin));
      // Se il campo è completamente fuori schermo, il fumetto resta al bordo corrispondente
      if (rect.bottom < 0) {
        setPos({ top: margin, left });
        return;
      }
      if (rect.top > vh) {
        setPos({ top: vh - toastH - margin, left });
        return;
      }
      // Sotto il campo (con la freccetta che punta verso l'alto)
      let top = rect.bottom + 4;
      if (top + toastH > vh - margin) top = rect.top - toastH - 4;
      setPos({ top, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, anchor]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={innerRef}
          initial={{ opacity: 0, y: 6, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.92 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="fixed z-[9999] pointer-events-none"
          style={{
            top: pos.top,
            left: pos.left,
            transform: 'translate(-100%, 0)',
          }}
        >
          <span className="relative inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1 text-xs font-bold text-white shadow-xl shadow-emerald-500/30" style={{ marginTop: '0.375rem' }}>
            <span className="absolute -top-[0.3125rem] right-3 w-0 h-0 border-l-[0.3125rem] border-r-[0.3125rem] border-b-[0.375rem] border-l-transparent border-r-transparent border-b-emerald-500" />
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            {message}
          </span>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
