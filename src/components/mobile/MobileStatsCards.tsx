/** Due card affiancate: ore settimana (vs tetto) e ore mese. */

import type { ReactNode } from 'react';

/** Ore in formato `HH:mm` (unico formato ore dell'app: es. 41:30). */
function fmtHoursHhMm(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '00:00';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface MobileStatsCardsProps {
  /** Ore approvate (effettive) della settimana. */
  weekWorkedMins: number;
  /** Ore pianificate della settimana (orari del turno). */
  weekPlannedMins: number;
  weekCapMins: number;
  /** Ore approvate (effettive) del periodo. */
  monthWorkedMins: number;
  /** Ore pianificate del periodo (orari del turno). */
  monthPlannedMins: number;
  /** Tetto ore del periodo (ore settimanali × settimane del periodo). */
  monthCapMins: number;
  /** Numeri più compatti (vista staff). */
  compact?: boolean;
  /** Nasconde la card settimana (quando la settimana è già mostrata altrove). */
  hideWeek?: boolean;
  labels: {
    title: string;
    week: string;
    month: string;
  };
  /** Modalità di visualizzazione attiva (scheda selezionata). */
  activeMode?: 'week' | 'period';
  /** Se presente, le due card diventano schede selezionabili della modalità di visualizzazione. */
  onModeChange?: (mode: 'week' | 'period') => void;
}

export default function MobileStatsCards({
  weekWorkedMins,
  weekPlannedMins,
  weekCapMins,
  monthWorkedMins,
  monthPlannedMins,
  monthCapMins,
  compact = false,
  hideWeek = false,
  labels,
  activeMode,
  onModeChange,
}: MobileStatsCardsProps) {
  const pct = weekCapMins > 0 ? Math.min(100, Math.round((weekWorkedMins / weekCapMins) * 100)) : 0;
  const monthPct = monthCapMins > 0 ? Math.min(100, Math.round((monthWorkedMins / monthCapMins) * 100)) : 0;
  // Vista staff: numeri più compatti; gestione: dimensione originale.
  const sizeCls = compact ? 'text-lg' : 'text-xl';

  /** Con `onModeChange` le card diventano schede: quella attiva è evidenziata, l'altra attenuata. */
  const selectable = typeof onModeChange === 'function';

  /**
   * Riga ore `pianificate / approvate`, senza etichette: la seconda è in verde.
   * Colore via stile inline: le classi `text-<colore>` vengono neutralizzate dalla regola
   * `[data-theme="dark"] [class*="text-emerald-"] { color: revert }` in index.css.
   */
  const hoursPair = (plannedMins: number, workedMins: number) => (
    <p className={`${sizeCls} font-bold tabular-nums whitespace-nowrap flex items-baseline gap-1.5`}>
      <span className="text-white">{fmtHoursHhMm(plannedMins)}</span>
      <span className="text-white/40 font-medium">/</span>
      <span style={{ color: 'var(--state-success)' }}>{fmtHoursHhMm(workedMins)}</span>
    </p>
  );

  const weekBody = (
    <>
      <p className="text-xs font-medium text-white/50 uppercase mb-1">
        {labels.week}
      </p>
      <div className="mb-2">{hoursPair(weekPlannedMins, weekWorkedMins)}</div>
      <div className="w-full bg-white/15 rounded-full h-1.5">
        <div
          className="h-full rounded-full bg-white/40 transition-[width] duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </>
  );

  const periodBody = (
    <>
      <p className="text-xs font-medium text-white/50 uppercase mb-1">
        {labels.month}
      </p>
      <div className="mb-2">{hoursPair(monthPlannedMins, monthWorkedMins)}</div>
      <div className="w-full bg-white/15 rounded-full h-1.5">
        <div
          className="h-full rounded-full bg-white/40 transition-[width] duration-700 ease-out"
          style={{ width: `${monthPct}%` }}
        />
      </div>
    </>
  );

  /**
   * Card informativa (`div`) oppure scheda selezionabile (`button`).
   * La skin forza bordo/sfondo/ombra con `!important`: la scheda attiva si evidenzia
   * con `outline` (+ piena opacità), le altre restano attenuate.
   */
  const renderCard = (mode: 'week' | 'period', body: ReactNode) => {
    if (!selectable) return <div className="flow-card">{body}</div>;
    const active = activeMode === mode;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => onModeChange?.(mode)}
        className={`flow-card w-full text-left transition-all active:scale-[0.98] ${active ? '' : 'opacity-60'}`}
        style={active ? { outline: '2px solid rgba(255, 255, 255, 0.65)', outlineOffset: '2px' } : undefined}
      >
        {body}
      </button>
    );
  };

  return (
    <div className={`grid gap-4 stats-cards ${hideWeek ? 'grid-cols-1' : 'grid-cols-2'}`}>
      {/* CARD SETTIMANA */}
      {!hideWeek && renderCard('week', weekBody)}

      {/* CARD PERIODO */}
      {renderCard('period', periodBody)}
    </div>
  );
}
