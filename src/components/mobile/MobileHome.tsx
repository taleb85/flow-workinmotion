import { type ReactNode } from 'react';
import { Play, LogOut, Clock, RotateCcw } from 'lucide-react';
import { useT } from '../../hooks/useT';
import HeaderTodayCoworkersCard from '../HeaderTodayCoworkersCard';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { startOfWeek, addDays, format, isToday, type Locale } from 'date-fns';
import type { Shift } from '../../types';
import type { EnrichedShift } from '../../hooks/useSmartPunchAction';

export interface MobileHomeProps {
  onRefresh?: () => Promise<void> | void;
  greetingText: string;
  todayLabel: string;
  rightContent?: ReactNode;
  statsLabels: {
    title: string;
    week: string;
    month: string;
    daysWorked: string;
  };
  weeklyMinutes: number;
  monthlyMinutes: number;
  monthDaysWorked: number;
  weekCapMinutes: number;
  inProgress: EnrichedShift | null;
  elapsedLabel: string | null;
  todayWorkShiftsCount: number;
  noShiftsHint: string;
  tapStartHint: string;
  shiftTimeHint: string | null;
  statusInShift: string;
  todayShiftLabel: string;
  inProgressLabel: string;
  nextShiftLabel: string;
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

function fmtH(mins: number) {
  if (!Number.isFinite(mins) || mins <= 0) return '0h';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${h}h`;
}

const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

export default function MobileHome({
  greetingText,
  todayLabel,
  rightContent,
  statsLabels,
  weeklyMinutes,
  monthlyMinutes,
  monthDaysWorked,
  weekCapMinutes,
  inProgress,
  elapsedLabel,
  todayWorkShiftsCount,
  noShiftsHint,
  tapStartHint,
  shiftTimeHint,
  todayShiftLabel,
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
}: MobileHomeProps) {

  const { pullDistance, isRefreshing, isTriggered, indicatorOpacity, indicatorRotation } =
    usePullToRefresh({ onRefresh: onRefresh ?? (() => {}), disabled: !onRefresh });
  const t = useT();
  const cardCls = 'rounded-2xl border border-neutral-500';
  const cardStyle = { background: 'transparent' };

  const firstShift = todayWorkShifts[0];
  const shiftRange = firstShift
    ? `${firstShift.start_time.slice(0, 5)} → ${firstShift.end_time?.slice(0, 5) ?? '…'}`
    : null;

  const weekPct = weekCapMinutes > 0
    ? Math.min(100, Math.round((weeklyMinutes / weekCapMinutes) * 100))
    : 0;

  // ── Weekly preview data ────────────────────────────────────────────────
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const shiftsForDay = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    return myShifts.filter(
      (s) => s.date === dateStr && !s.notes?.startsWith('__OPEN__') && s.approval_status !== 'draft'
    );
  };

  return (
    <div
      className="flex flex-col gap-3 px-4 py-3 pb-12 relative shift-mobile-safe"
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

      {/* ── Saluto compatto ─────────────────────────────────────────── */}
      <div className="px-1 mt-5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold tracking-tight leading-tight text-white">
            {greetingText}
          </h1>
          <p className="text-sm font-bold capitalize mt-0.5 tracking-wide text-white/70">
            {todayLabel}
          </p>
        </div>
        {rightContent && (
          <div className="flex shrink-0 items-center gap-3">
            {rightContent}
          </div>
        )}
      </div>

      {/* ── Il tuo turno oggi ──────────────────────────────────────────── */}
      <section className="shift-card-ultra px-4 py-4" data-tour="punch" style={{ background: 'transparent', border: '1px solid rgb(115, 115, 115)', boxShadow: 'none' }}>
        {/* Header row: label + stato badge */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
            {todayShiftLabel}
          </p>
          {inProgress ? (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-white/70">
              <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-pulse" />
              {inProgressLabel}
            </span>
          ) : null}
        </div>

        {/* Shift time — reduced from text-5xl to text-3xl */}
        {shiftRange ? (
          <p className="text-3xl font-semibold shift-time-clean text-white leading-tight tracking-tight mb-3">
            {shiftRange}
          </p>
        ) : (
          <p className="text-base font-medium text-white/50 mb-3">
            {noShiftsHint}
          </p>
        )}

        {/* Hint orario in corso */}
        {shiftTimeHint && (
          <p className="text-xs font-medium text-white/50 -mt-2 mb-3">
            {shiftTimeHint}
          </p>
        )}

        {/* Elapsed timer */}
        {inProgress && elapsedLabel && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2.5 rounded-xl"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <Clock className="w-4 h-4 text-white/50 shrink-0" strokeWidth={1.5} />
            <span className="text-2xl shift-time-clean font-medium text-white tabular-nums">
              {elapsedLabel}
            </span>
          </div>
        )}

        {/* Extra shifts today (if more than 1) */}
        {!inProgress && todayWorkShifts.length > 1 && (
          <div className="flex flex-col gap-1.5 mb-3">
            {todayWorkShifts.slice(1).map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2 border-t border-white/8">
                <span className="text-base font-medium shift-time-clean text-white">
                  {s.start_time.slice(0, 5)} – {s.end_time?.slice(0, 5) ?? '…'}
                </span>
                <span className="text-[11px] font-medium uppercase tracking-wider text-white/50">
                  {s.type === 'lunch' ? 'Pranzo' : 'Cena'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Punch buttons */}
        {inProgress ? (
          canEnd && (
            <button
              type="button"
              disabled={punchBusy}
              onClick={onEnd}
              className="w-full h-11 bg-red-600 hover:bg-red-700 text-white rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-600/20 transition-colors disabled:opacity-60 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-bold uppercase tracking-wider">
                {punchBusy ? savingLabel : endLabel}
              </span>
            </button>
          )
        ) : (
          canStart ? (
            <button
              type="button"
              disabled={punchBusy}
              onClick={onStart}
              className="w-full h-11 bg-brand-electric hover:bg-blue-500 text-white rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-black/20 transition-colors disabled:opacity-60 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span className="text-sm font-bold uppercase tracking-wider">
                {punchBusy ? savingLabel : startLabel}
              </span>
            </button>
          ) : (
            todayWorkShiftsCount > 0 && (
              <p className="text-center text-[11px] font-bold uppercase tracking-widest text-white/50 py-2">
                {tapStartHint}
              </p>
            )
          )
        )}
      </section>

      {/* ── Colleghi in turno oggi ───────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-neutral-500"
        style={{
          background: 'transparent',
        }}
      >
        <HeaderTodayCoworkersCard />
      </div>

      {/* ── Questa settimana ──────────────────────────────────────────────── */}
      <div className={`${cardCls} px-4 py-3`} style={cardStyle}>
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-2">
          {t.mobile_dash_this_week ?? 'Questa settimana'}
        </p>
        <div className="flex flex-col divide-y divide-white/[0.07]">
          {weekDays.map((day, idx) => {
            const dayShifts = shiftsForDay(day);
            const today = isToday(day);
            const dayNum = format(day, 'd');
            const label = `${DAY_LABELS[idx]} ${dayNum}`;

            return (
              <div
                key={idx}
                className={`flex items-center justify-between py-1.5 ${today ? 'bg-white/5 -mx-1 px-1 rounded-lg' : ''}`}
              >
                <span className={`text-xs font-semibold ${today ? 'text-white' : 'text-white/55'}`}>
                  {label}
                </span>
                {dayShifts.length > 0 ? (
                  <div className="flex flex-col items-end gap-0.5">
                    {dayShifts.map((s, i) => (
                      <span
                        key={i}
                        className={`text-xs font-semibold tabular-nums ${today ? 'text-white' : 'text-white/70'}`}
                      >
                        {s.start_time.slice(0, 5)}–{s.end_time?.slice(0, 5) ?? '?'}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-white/25 font-medium">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── I miei numeri ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between px-1 mb-2">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-white/50">
            {statsLabels.title}
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Ore settimana */}
          <div className={`${cardCls} px-4 py-3`} style={cardStyle}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-1">
              {statsLabels.week}
            </p>
            <p className="text-xl font-black text-white tabular-nums leading-none mb-2">
              {fmtH(weeklyMinutes)}
            </p>
            <div className="w-full bg-white/15 rounded-full h-1.5">
              <div
                className="h-full rounded-full bg-white/40 transition-[width] duration-700 ease-out"
                style={{ width: `${weekPct}%` }}
              />
            </div>
            <p className="text-[11px] text-white/50 mt-1 tabular-nums">
              / {fmtH(weekCapMinutes)}
            </p>
          </div>

          {/* Ore mese */}
          <div className={`${cardCls} px-4 py-3`} style={cardStyle}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/50 mb-1">
              {statsLabels.month}
            </p>
            <p className="text-xl font-black text-white tabular-nums leading-none mb-1">
              {fmtH(monthlyMinutes)}
            </p>
            <p className="text-[11px] text-white/50 tabular-nums">
              {monthDaysWorked} {statsLabels.daysWorked}
            </p>
          </div>
        </div>
      </section>

    </div>
  );
}
