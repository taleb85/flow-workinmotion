import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import type { Language } from '../types';
import { getTranslations } from '../utils/translations';
import FlowWaveIcon from './ui/FlowWaveIcon';

/** Tempo minimo messaggio visibile prima del reload (ms). */
const RELOAD_DELAY_MS = 3200;

const STEPS = [
  { label: 'Dati profilo salvati',        doneAt: 0    },
  { label: 'Configurazione aggiornata',   doneAt: 900  },
  { label: 'Cache sincronizzata',         doneAt: 1800 },
  { label: 'Riavvio in corso…',          doneAt: null  },
];

/**
 * Forza un vero reload anche in contesti PWA/service-worker dove
 * `location.href = location.href` viene ignorato (stesso URL).
 */
function hardReload() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set('_r', String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    try {
      window.location.reload();
    } catch {
      window.location.assign(window.location.origin + window.location.pathname);
    }
  }
}

/**
 * Dopo PIN corretto su blocco post-sync: messaggio di aggiornamento e reload pagina.
 * Il salvataggio dati avviene già in `runPostUnlockRefreshActions` prima che questo monti.
 */
export default function PostUnlockRestartOverlay({ language }: { language: Language }) {
  const t = getTranslations(language);
  const tv = t as Record<string, string>;
  const scheduled = useRef(false);
  const [visibleCount, setVisibleCount] = useState(1);
  const [doneCount, setDoneCount]       = useState(1);

  useEffect(() => {
    if (scheduled.current) return;
    scheduled.current = true;

    // Mostra e completa i passaggi progressivamente
    const stepTimers: number[] = [];

    // Step 2 visibile a 400ms, completato a 900ms
    stepTimers.push(window.setTimeout(() => setVisibleCount(2), 400));
    stepTimers.push(window.setTimeout(() => setDoneCount(2),    900));

    // Step 3 visibile a 1200ms, completato a 1800ms
    stepTimers.push(window.setTimeout(() => setVisibleCount(3), 1200));
    stepTimers.push(window.setTimeout(() => setDoneCount(3),    1800));

    // Step 4 (spinner "Riavvio in corso…") visibile a 2200ms
    stepTimers.push(window.setTimeout(() => setVisibleCount(4), 2200));

    // Reload principale
    const reloadId = window.setTimeout(hardReload, RELOAD_DELAY_MS);

    // Fallback sicuro
    const fallbackId = window.setTimeout(hardReload, 5000);

    return () => {
      stepTimers.forEach((id) => window.clearTimeout(id));
      window.clearTimeout(reloadId);
      window.clearTimeout(fallbackId);
      scheduled.current = false;
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center px-6 text-center font-sans"
      style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(107,107,107,0.15) 0%, transparent 55%), rgba(10,10,12,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={tv.post_unlock_restart_title ?? 'Aggiornamento'}
    >
      {/* Icona */}
      <motion.div
        animate={{
          boxShadow: [
            '0 0 32px rgba(255,149,0,0.70), 0 0 12px rgba(255,200,150,0.50)',
            '0 0 56px rgba(255,149,0,1.00), 0 0 24px rgba(255,200,150,0.80)',
            '0 0 32px rgba(255,149,0,0.70), 0 0 12px rgba(255,200,150,0.50)',
          ],
        }}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
        style={{ borderRadius: 32, marginBottom: 24 }}
      >
        <FlowWaveIcon size={120} radius={32} />
      </motion.div>

      <div className="flex flex-col items-center gap-1 mb-5 min-h-[40px]">
        <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Riavvio in corso</p>
        <h2 className="text-sm font-bold tracking-tight text-white/90">
          {tv.post_unlock_restart_title ?? 'Aggiornamento completato'}
        </h2>
      </div>

      {/* Passaggi */}
      <ul className="mb-6 flex w-full max-w-[220px] flex-col gap-2.5 text-left" aria-hidden>
        <AnimatePresence initial={false}>
          {STEPS.slice(0, visibleCount).map((step, i) => {
            const isDone  = i < doneCount;
            const isLast  = step.doneAt === null;
            return (
              <motion.li
                key={step.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="flex items-center gap-2.5"
              >
                {/* Icona */}
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
 isDone
 ? 'bg-accent text-white'
 : isLast
 ? 'bg-accent/15 text-accent'
 : 'bg-white/10 text-white/40'
 }`}
                >
                  {isDone ? (
                    <Check className="h-3 w-3" strokeWidth={3} />
                  ) : (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                </span>

                {/* Testo */}
                <span
                  className={`text-xs font-medium transition-colors duration-300 ${
 isDone ? 'text-neutral-200' : 'text-neutral-400'
 }`}
                >
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
