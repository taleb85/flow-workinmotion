/**
 * UpdateReadyNotice — avviso discreto in basso quando un nuovo deploy è già attivo
 * sul dispositivo. Non blocca l'app e non ricarica nulla: la nuova versione si
 * applica alla prossima apertura.
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { RefreshCw, X } from 'lucide-react';
import { getTranslations } from '../utils/translations';
import { getDeviceUiLanguage, readStoredUiLanguage } from '../utils/uiLanguagePreference';

/** L'avviso si nasconde da solo: resta un promemoria, non una richiesta. */
const AUTOHIDE_MS = 8000;

interface Props {
  onClose: () => void;
}

export default function UpdateReadyNotice({ onClose }: Props) {
  const t = getTranslations(readStoredUiLanguage() ?? getDeviceUiLanguage());

  useEffect(() => {
    const id = window.setTimeout(onClose, AUTOHIDE_MS);
    return () => window.clearTimeout(id);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      role="status"
      aria-live="polite"
      aria-label={t.sw_update_aria}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="fixed left-0 right-0 z-[10055] flex justify-center px-4 pointer-events-none"
      /* Sopra la bottom nav, sotto notch / home indicator */
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
    >
      <div className="pointer-events-auto flex max-w-[min(92vw,22rem)] items-center gap-2 rounded-xl px-3 py-2 modal-glass-panel backdrop-blur-xl">
        <RefreshCw className="h-3.5 w-3.5 shrink-0 text-white/80" aria-hidden />
        <p className="min-w-0 flex-1 text-left text-xs font-semibold leading-snug text-white/95">
          {t.sw_update_ready}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.close}
          className="shrink-0 rounded p-0.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}
