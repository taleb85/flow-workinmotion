/**
 * Popover di scelta del periodo presenze: navigazione per anno + griglia dei 12 mesi.
 * Ogni voce mostra l'intervallo del periodo e il numero di settimane.
 *
 * Usi:
 * - Gestione turni: imposta il periodo preimpostato (`savePeriodConfig`).
 * - Scheda Presenze staff: naviga i periodi senza modificare la configurazione.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Language } from '../../types';
import {
  periodConfigForMonth, getPeriodStartDate, getPeriodEndDate, type PeriodConfig,
} from '../../utils/periodConfig';
import { getTranslations, getDateLocale } from '../../utils/translations';

interface PeriodPickerPopoverProps {
  /**
   * Ref dell'elemento trigger: il popover si posiziona sotto di esso.
   * È una ref (non il nodo) così la misura avviene sempre sul nodo corrente,
   * anche se il componente trigger è stato rimontato.
   */
  anchorRef: RefObject<HTMLElement>;
  /** Periodo attualmente selezionato: evidenziato nella griglia. */
  selected: PeriodConfig;
  onSelect: (config: PeriodConfig) => void;
  onClose: () => void;
  language: Language;
}

export default function PeriodPickerPopover({
  anchorRef, selected, onSelect, onClose, language,
}: PeriodPickerPopoverProps) {
  const t = getTranslations(language) as Record<string, string>;
  const locale = getDateLocale(language);
  const popoverRef = useRef<HTMLDivElement>(null);
  // Posizione fuori schermo finché non è misurata (evita il lampo in alto a sinistra).
  const [style, setStyle] = useState<CSSProperties>({ top: -9999, left: -9999 });
  const [year, setYear] = useState(() => parseISO(selected.startDate).getFullYear());

  /**
   * Posizionamento: sempre **sotto** il trigger, centrato su di esso.
   * L'altezza è limitata allo spazio disponibile sotto (il popover scorre internamente).
   */
  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    const el = popoverRef.current;
    if (!rect || !el) return;
    const gap = 6;
    const margin = 8;
    const w = el.offsetWidth;

    const spaceBelow = window.innerHeight - rect.bottom - gap - margin;
    const maxHeight = Math.max(180, Math.min(spaceBelow, window.innerHeight * 0.85));

    const centerX = rect.left + rect.width / 2;
    const minLeft = w / 2 + 16;
    const maxLeft = window.innerWidth - w / 2 - 16;
    const left = Math.min(maxLeft, Math.max(minLeft, centerX));

    setStyle({ top: rect.bottom + gap, left, maxHeight });
  }, [anchorRef]);

  // Chiusura al click fuori (il trigger è escluso).
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!popoverRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [anchorRef, onClose]);

  return createPortal(
    <div ref={popoverRef}
      className="fixed z-[10050] mt-1 rounded-2xl border border-white/[0.14] p-3 md:p-4 w-[calc(100vw-32px)] max-w-[21.25rem] overflow-y-auto"
      style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', ...style, transform: 'translateX(-50%)' }}>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => setYear(y => y - 1)}
          className="rounded-lg bg-white/10 px-2 py-1 text-white/60 hover:text-white transition-colors"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <span className="text-sm font-bold text-white">{year}</span>
        <button type="button" onClick={() => setYear(y => y + 1)}
          className="rounded-lg bg-white/10 px-2 py-1 text-white/60 hover:text-white transition-colors"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
      <div className="grid grid-cols-3 gap-1 md:gap-2">
        {Array.from({ length: 12 }, (_, i) => {
          const refDate = new Date(year, i, 15);
          const cfg = periodConfigForMonth(refDate);
          const start = getPeriodStartDate(cfg);
          const end = getPeriodEndDate(cfg);
          const isActive = cfg.startDate === selected.startDate && cfg.numWeeks === selected.numWeeks;
          return (
            <button key={i} type="button" onClick={() => onSelect(cfg)}
              className={`rounded-xl border px-2.5 py-2 text-center transition-colors ${isActive ? 'border-white/40 bg-white/20' : 'border-white/20 hover:border-white/40'}`}>
              <div className="text-[0.6875rem] font-bold text-white">{format(refDate, 'MMM', { locale }).toUpperCase()}</div>
              <div className="text-[0.5625rem] text-white/40 mt-0.5 leading-tight tabular-nums whitespace-nowrap">
                {format(start, 'd MMM', { locale }).toUpperCase()} — {format(end, 'd MMM', { locale }).toUpperCase()}
              </div>
              <div className="text-[0.5rem] text-white/30 mt-0.5 font-bold uppercase">{(t.ts_period_weeks_abbr ?? '{n} sett.').replace('{n}', String(cfg.numWeeks))}</div>
            </button>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
