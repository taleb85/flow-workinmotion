/**
 * SwUpdateOverlay — mostrato quando il Service Worker viene aggiornato (nuovo deploy).
 * Design: identico alle schermate UPDATE della preview (dark + FlowNeonIcon + steps testo).
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import FlowLogoSvg from './FlowLogoSvg';

const STEPS = [
  { label: 'Nuova versione rilevata',   doneAt: 0    },
  { label: 'Pulizia cache',             doneAt: 800  },
  { label: 'Riavvio…',                  doneAt: null },
];

const BG = 'radial-gradient(ellipse at 50% 30%, rgba(107,107,107,0.15) 0%, transparent 55%), rgba(10,10,12,0.92)';

function redirectToApp() {
  try {
    sessionStorage.removeItem('app_session');
    const url = new URL(window.location.origin + '/app');
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    window.location.replace(window.location.origin + '/app');
  }
}

export default function SwUpdateOverlay() {
  const scheduled = useRef(false);
  const [visibleCount, setVisibleCount] = useState(1);
  const [doneCount, setDoneCount]       = useState(1);

  useEffect(() => {
    if (scheduled.current) return;
    scheduled.current = true;

    const timers: number[] = [];
    timers.push(window.setTimeout(() => setVisibleCount(2), 600));
    timers.push(window.setTimeout(() => setDoneCount(2),    1200));
    timers.push(window.setTimeout(() => setVisibleCount(3), 1800));

    const mainId = window.setTimeout(redirectToApp, 3200);
    const safeId = window.setTimeout(redirectToApp, 5500);

    return () => {
      timers.forEach(window.clearTimeout);
      window.clearTimeout(mainId);
      window.clearTimeout(safeId);
      scheduled.current = false;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 font-sans text-center px-4"
      style={{ background: BG, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Aggiornamento app"
    >
      {/* Icona */}
      <motion.div
        animate={{
          filter: [
            'drop-shadow(0 0 32px rgba(255,149,0,0.70)) drop-shadow(0 0 12px rgba(255,200,150,0.50))',
            'drop-shadow(0 0 56px rgba(255,149,0,1.00)) drop-shadow(0 0 24px rgba(255,200,150,0.80))',
            'drop-shadow(0 0 32px rgba(255,149,0,0.70)) drop-shadow(0 0 12px rgba(255,200,150,0.50))',
          ],
        }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
        className="leading-none"
      >
        <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 120, height: 120, display: 'block' }} />
      </motion.div>

      {/* Stato */}
      <div className="flex flex-col items-center gap-1.5 min-h-[44px]">
        <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">
          Aggiornamento in corso
        </p>
        <AnimatePresence mode="wait">
          <motion.p
            key={visibleCount}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25 }}
            className="text-white/90 text-sm font-medium"
          >
            {STEPS[visibleCount - 1]?.label ?? ''}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Steps lista */}
      <ul className="w-full max-w-[220px] space-y-2.5 text-left">
        <AnimatePresence initial={false}>
          {STEPS.slice(0, visibleCount).map((step, i) => {
            const isDone = doneCount > i;
            const isLast = step.doneAt === null;
            return (
              <motion.li
                key={step.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex items-center gap-2.5"
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
 isDone
 ? 'bg-accent text-white'
 : isLast
 ? 'bg-accent/15 text-accent'
 : 'bg-white/10 text-white/40'
 }`}>
                  {isDone
                    ? <Check className="h-3 w-3" strokeWidth={3} />
                    : <Loader2 className="h-3 w-3 animate-spin" />
                  }
                </span>
                <span className={`text-xs font-medium transition-colors duration-300 ${
 isDone ? 'text-neutral-200' : 'text-neutral-400'
 }`}>
                  {step.label}
                </span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </motion.div>
  );
}
