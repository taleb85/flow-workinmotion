import { type ReactNode } from 'react';
import { Play, LogOut, RotateCcw } from 'lucide-react';
import { useT } from '../../hooks/useT';
import { groupShiftsByDay } from '../../utils/timeCalculations';
import { useAppUser } from '../../context/AppContext';
import { getDateLocale } from '../../utils/translations';
import HeaderTodayCoworkersCard from '../HeaderTodayCoworkersCard';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { format, parseISO, type Locale } from 'date-fns';
import type { Shift } from '../../types';
import type { EnrichedShift } from '../../hooks/useSmartPunchAction';

export interface MobileHomeProps {
  onRefresh?: () => Promise<void> | void;
  greetingText: string;
  todayLabel: string;
  todayStr?: string;
  rightContent?: ReactNode;
  inProgress: EnrichedShift | null;
  /** Tempo trascorso dall'entrata — mostrato solo con timbratura in corso */
  elapsedLabel: string | null;
  todayWorkShiftsCount: number;
  noShiftsHint: string;
  tapStartHint: string;
  inProgressLabel: string;
  savingLabel: string;
  startLabel: string;
  endLabel: string;
  canStart: boolean;
  canEnd: boolean;
  punchBusy: boolean;
  onStart: () => void;
  onEnd: () => void;
  todayWorkShifts: Shift[];
  /** Full list of user shifts — used to build the weekly preview */
  myShifts?: Shift[];
  locale?: Locale;
}

/** TS → "HH:MM" */
function punchHHMM(ts?: string | null): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}
export default function MobileHome({
  greetingText,
  todayLabel,
  todayStr,
  rightContent,
  inProgress,
  elapsedLabel,
  todayWorkShiftsCount,
  noShiftsHint,
  tapStartHint,
  inProgressLabel,
  savingLabel,
  startLabel,
  endLabel,
  canStart,
  canEnd,
  punchBusy,
  onStart,
  onEnd,
  onRefresh,
  todayWorkShifts,
  myShifts = [],
  locale,
}: MobileHomeProps) {

  const { pullDistance, isRefreshing, isTriggered, indicatorOpacity, indicatorRotation } =
    usePullToRefresh({ onRefresh: onRefresh ?? (() => {}), disabled: true });
  const t = useT();
  const { effectiveLanguage } = useAppUser();
  const calLocale = locale ?? getDateLocale(effectiveLanguage);

  const today = todayStr ?? format(new Date(), 'yyyy-MM-dd');

  // ── Prossimi turni (da domani in poi) ──────────────────────────────
  const upcomingShifts = myShifts
    .filter((s) =>
      s.date > today &&
      !s.notes?.startsWith('__OPEN__') &&
      s.approval_status !== 'draft' &&
      (s.approval_status === 'approved' || s.approval_status === 'confirmed' || s.approval_status === 'absent')
    )
    .sort((a, b) =>
      a.date === b.date
        ? (a.start_time || '').localeCompare(b.start_time || '')
        : a.date.localeCompare(b.date)
    );

  // Massimo 5 turni, ma senza spezzare l'ultimo giorno: ogni blocco
  // giornaliero mostra sempre tutti i turni della stessa data.
  const nextShifts = (() => {
    const limited = upcomingShifts.slice(0, 5);
    const lastDate = limited[limited.length - 1]?.date;
    if (!lastDate) return limited;
    return [...limited, ...upcomingShifts.slice(5).filter((s) => s.date === lastDate)];
  })();

  const entryTime = inProgress?.punchIn
    ? punchHHMM((inProgress.punchIn as { calculated_time?: string | null }).calculated_time ?? inProgress.punchIn.timestamp)
    : null;

  const punchStatus = inProgress
    ? `${inProgressLabel}${inProgress.shift.type === 'lunch' ? ' · Pranzo' : ' · Cena'}`
    : canStart
      ? 'In attesa'
      : todayWorkShiftsCount > 0
        ? 'Nessun turno in corso'
        : 'Nessun turno oggi';

  const dayLabel = (dateStr: string) => {
    const d = parseISO(dateStr);
    const s = format(d, 'EEEE d MMMM', { locale: calLocale });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <div
      className="flex flex-col gap-4 py-3 pb-12 relative shift-mobile-safe staff-home-screen"
      style={{ transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined, transition: pullDistance === 0 ? 'transform 0.25s ease-out' : undefined }}
    >
      {/* Pull-to-refresh indicator */}
      {onRefresh && pullDistance > 0 && (
        <div
          className="absolute -top-10 left-0 right-0 flex justify-center pointer-events-none"
          style={{ opacity: indicatorOpacity }}
        >
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${isTriggered ? 'bg-white/15 text-white' : 'bg-white/10 text-white/60'}`}>
            <RotateCcw
              className={`h-3.5 w-3.5 shrink-0 ${isRefreshing ? 'animate-spin' : ''}`}
              style={{ transform: isRefreshing ? undefined : `rotate(${indicatorRotation}deg)` }}
            />
            {isTriggered ? 'Rilascia per aggiornare' : 'Trascina per aggiornare'}
          </div>
        </div>
      )}

      {/* ── Saluto (page-title) ─────────────────────────────────────── */}
      <div className="mt-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title text-white">{greetingText}</h1>
          <p className="page-subtitle capitalize">{todayLabel}</p>
        </div>
        {rightContent && (
          <div className="flex shrink-0 items-center gap-3">
            {rightContent}
          </div>
        )}
      </div>

      {/* ── Card timbratura dominante ───────────────────────────────── */}
      <section className="flow-card" data-tour="punch">
        <div className="flex items-center justify-between gap-2">
          <span className="flow-section-label">Timbratura</span>
          <span className="text-sm font-medium text-white/70">{punchStatus}</span>
        </div>

        {inProgress && elapsedLabel && (
          <div className="punch-time text-white tabular-nums">{elapsedLabel}</div>
        )}

        {inProgress && entryTime && (
          <div className="mt-2">
            <span className="flow-badge flow-badge-success">Entrata {entryTime}</span>
          </div>
        )}

        <div className="mt-4">
          {inProgress ? (
            canEnd && (
              <button
                type="button"
                disabled={punchBusy}
                onClick={onEnd}
                className="w-full h-12 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-colors disabled:opacity-60"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-bold uppercase tracking-wider">
                  {punchBusy ? savingLabel : endLabel}
                </span>
              </button>
            )
          ) : canStart ? (
            <button
              type="button"
              disabled={punchBusy}
              onClick={onStart}
              className="w-full h-12 bg-brand hover:bg-blue-500 text-white rounded-full flex items-center justify-center gap-2 shadow-lg shadow-black/20 transition-colors disabled:opacity-60"
            >
              <Play className="w-4 h-4 fill-current" />
              <span className="text-sm font-bold uppercase tracking-wider">
                {punchBusy ? savingLabel : startLabel}
              </span>
            </button>
          ) : (
            <p className="text-center text-[0.6875rem] font-bold uppercase tracking-widest text-white/50 py-2">
              {todayWorkShiftsCount > 0 ? tapStartHint : noShiftsHint}
            </p>
          )}
        </div>
      </section>

      {/* ── Turno di oggi: tutti i turni, evidenziato quello in corso ── */}
      <section className="flow-card" aria-label="Turno di oggi">
        <span className="flow-section-label">Turno di oggi</span>
        {todayWorkShifts.length > 0 ? (
          <div className="flex gap-2 mt-3">
            {todayWorkShifts.map((s) => {
              const isActive = inProgress?.shift.id === s.id;
              return (
                <div
                  key={s.id}
                  className={`flex flex-1 min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2.5 ${isActive ? '' : 'border-white/[0.14]'}`}
                  style={isActive ? { borderColor: 'rgba(10, 132, 255, 0.6)', background: 'rgba(10, 132, 255, 0.10)' } : undefined}
                >
                  <div className="min-w-0">
                    <span className="block text-base font-semibold text-white tabular-nums">
                      {s.start_time.slice(0, 5)} – {s.end_time?.slice(0, 5) ?? '…'}
                    </span>
                  </div>
                  {isActive && (
                    <span className="flow-badge flow-badge-info shrink-0">
                      {t.legend_in_progress ?? 'In corso'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-base font-medium text-white/50 mt-2">{noShiftsHint}</p>
        )}
      </section>

      {/* ── Prossimi turni: un blocco per giorno ────────────────────── */}
      <section className="flow-card" aria-label="Prossimi turni">
        <span className="flow-section-label">Prossimi turni</span>
        {nextShifts.length === 0 ? (
          <p className="text-sm text-white/40 py-2">—</p>
        ) : (
          <div className="flex flex-col gap-2 mt-3">
            {groupShiftsByDay(nextShifts).map((group) => (
              <div
                key={group.date}
                data-shift-day={group.date}
                className="rounded-xl border border-white/[0.14] overflow-hidden"
              >
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-white/10">
                  <span className="flow-section-label">
                    {dayLabel(group.date)}
                  </span>
                  {group.shifts.length > 1 && (
                    <span className="flow-section-label tabular-nums shrink-0">
                      {group.shifts.length} turni
                    </span>
                  )}
                </div>
                <div className="flex gap-2 p-2">
                  {group.shifts.map((s) => (
                    <div
                      key={s.id}
                      className="flex flex-1 min-w-0 items-center justify-center px-2 py-1.5"
                    >
                      <span className="block text-base font-semibold text-white tabular-nums">
                        {s.start_time.slice(0, 5)} – {s.end_time?.slice(0, 5) ?? '…'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Colleghi in turno oggi ──────────────────────────────────── */}
      <HeaderTodayCoworkersCard />

    </div>
  );
}
