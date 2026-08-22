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
 * `attached`: il contenuto si apre ATTACCATO al bottone dentro un'unica card
 * (bottone = header della card, divider in alto quando aperto).
 */
export function SettingsAccordionSection({
  storageKey,
  title,
  subtitle,
  defaultOpen = false,
  children,
  className = 'mb-6',
  accentBorder,
  attached = false,
}: {
  storageKey: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
  accentBorder?: string;
  attached?: boolean;
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

  const borderColor = accentBorder ?? 'rgba(255,255,255,0.35)';

  return (
    <section className={className} data-toast-anchor>
      <div
        className={attached ? 'rounded-xl overflow-hidden' : undefined}
        style={attached ? { border: `1.5px solid ${borderColor}` } : undefined}
      >
        <button
          type="button"
          onClick={toggle}
          className={
            attached
              ? 'flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors'
              : 'mb-3 flex w-full items-center justify-between gap-2 rounded-xl py-2 pl-3 pr-3 text-left transition-colors'
          }
          style={attached ? { background: 'transparent' } : { background: 'transparent', border: `1.5px solid ${borderColor}` }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backdropFilter = 'blur(12px)'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.backdropFilter = ''; }}
          aria-expanded={open}
        >
          <div className="min-w-0 flex-1">
            <h2 style={{ color: '#ffffff', fontWeight: 600, fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{title}</h2>
            {subtitle ? (
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '0.8rem', marginTop: '0.125rem', fontWeight: 400, letterSpacing: 'normal', textTransform: 'none' }}>
                {subtitle}
              </p>
            ) : null}
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            style={{ color: 'rgba(255,255,255,0.6)' }}
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
              {attached && <div className="border-t border-white/10" />}
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
