import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

function readAccordionExpanded(storageKey: string, defaultOpen: boolean): boolean {
  if (typeof window === 'undefined') return defaultOpen;
  const v = window.localStorage.getItem(storageKey);
  if (v === '1') return true;
  if (v === '0') return false;
  return defaultOpen;
}

/**
 * Sezione collassabile per Impostazioni (mobile-first): riduce lo scroll verticale.
 * Stato aperto/chiuso persistito in localStorage.
 */
export function SettingsAccordionSection({
  storageKey,
  title,
  subtitle,
  defaultOpen = false,
  children,
  className = 'mb-6',
}: {
  storageKey: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(() => readAccordionExpanded(storageKey, defaultOpen));

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [storageKey]);

  return (
    <section className={className}>
      <button
        type="button"
        onClick={toggle}
        className="mb-3 flex w-full items-center justify-between gap-2 rounded-xl border border-transparent py-1.5 pl-1 pr-2 text-left transition-colors hover:bg-slate-100/80 -ml-1"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <h2 className="text-slate-700 text-[11px] font-semibold uppercase tracking-widest">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-left text-[11px] font-normal normal-case tracking-normal text-slate-400">
              {subtitle}
            </p>
          ) : null}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
