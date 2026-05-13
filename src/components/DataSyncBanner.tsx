import { Loader2 } from 'lucide-react';
import type { Language } from '../types';
import { getTranslations } from '../utils/translations';

/**
 * Indicatore non bloccante mentre `silentRefreshData` aggiorna DB + (opz.) Storage cloud.
 * `role="status"` + `aria-live` per lettori schermo.
 */
export default function DataSyncBanner({ language }: { language: Language }) {
  const t = getTranslations(language);
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.08] px-3 py-2.5 text-slate-800 shadow-sm"
    >
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent" aria-hidden />
      <div className="min-w-0 flex-1 text-left">
        <p className="text-sm font-semibold leading-tight text-slate-900">{t.data_sync_banner_line1}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{t.data_sync_banner_line2}</p>
      </div>
    </div>
  );
}
