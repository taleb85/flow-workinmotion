/** Due card affiancate: ore settimana (vs tetto) e mese (ore + giorni lavorati). */

function fmtHoursShort(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '0h';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

/** Formato `HH:mm` — senza suffissi h/m. */
function fmtHoursHhMm(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '00:00';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export interface MobileStatsCardsProps {
  weekWorkedMins: number;
  weekCapMins: number;
  monthWorkedMins: number;
  monthDaysWorked: number;
  hoursFormat?: 'short' | 'hhmm';
  labels: {
    title: string;
    week: string;
    month: string;
    daysWorked: string;
  };
}

export default function MobileStatsCards({
  weekWorkedMins,
  weekCapMins,
  monthWorkedMins,
  monthDaysWorked,
  hoursFormat = 'short',
  labels,
}: MobileStatsCardsProps) {
  const pct = weekCapMins > 0 ? Math.min(100, Math.round((weekWorkedMins / weekCapMins) * 100)) : 0;
  const fmt = hoursFormat === 'hhmm' ? fmtHoursHhMm : fmtHoursShort;
  // Vista staff (hhmm): numeri più compatti; gestione: dimensione originale.
  const sizeCls = hoursFormat === 'hhmm' ? 'text-lg' : 'text-xl';

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* CARD SETTIMANA */}
      <div className="p-5 rounded-2xl border border-neutral-500" style={{ background: 'transparent' }}>
        <p className="text-xs font-medium text-white/50 uppercase mb-1">
          {labels.week}
        </p>
        <p className={`${sizeCls} font-bold text-white mb-3 tabular-nums whitespace-nowrap`}>
          {fmt(weekWorkedMins)} <span className="text-white/30 font-normal">/</span>{' '}
          {fmt(weekCapMins)}
        </p>
        <div className="w-full bg-white/15 rounded-full h-2">
          <div
            className="h-full rounded-full bg-white/40 transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* CARD MESE */}
      <div className="p-5 rounded-2xl border border-neutral-500" style={{ background: 'transparent' }}>
        <p className="text-xs font-medium text-white/50 uppercase mb-1">
          {labels.month}
        </p>
        <p className={`${sizeCls} font-bold text-white mb-1 tabular-nums`}>
          {fmt(monthWorkedMins)}
        </p>
        <p className="text-xs font-medium text-white/60">
          {monthDaysWorked} {labels.daysWorked}
        </p>
      </div>
    </div>
  );
}
