import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';
interface ToastProps {
  message: string;
  type?: 'error' | 'success' | 'info';
  onClose: () => void;
}


/**
 * Banner globale sul lato destro dello schermo.
 * Scompare automaticamente dopo 10 secondi.
 */
export default function Toast({ message, type = 'error', onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const isSuccess = type === 'success';
  const isError = type === 'error';

  const accentColor = isSuccess ? '#22c55e' : isError ? '#ef4444' : '#ffffff';
  const Icon = isSuccess ? CheckCircle : isError ? AlertTriangle : Info;

  const el = (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="fixed right-4 z-[99999]"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 60px)' }}
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
        <p className="min-w-0 flex-1 text-left text-[12px] font-semibold leading-snug text-white/95 break-words">
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
