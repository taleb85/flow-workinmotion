import { type ReactNode, useEffect, useState } from 'react';
import { Play, LogOut, RotateCcw, ChevronRight } from 'lucide-react';
import { useT } from '../../hooks/useT';
import { useAppUser } from '../../context/AppContext';
import { getDateLocale } from '../../utils/translations';
import HeaderTodayCoworkersCard from '../HeaderTodayCoworkersCard';
import MobileStatsCards from './MobileStatsCards';
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
  inProgressLabel: string;
  savingLabel: string;
  startLabel: string;
  endLabel: string;
  canStart: boolean;
  canEnd: boolean;
  punchBusy: boolean;
  onStart: () => void;
  onEnd: () => void;
  onSeeAllShifts?: () => void;
  todayWorkShifts: Shift[];
  /** Full list of user shifts — used to build the weekly preview */
  myShifts?: Shift[];
  locale?: Locale;
}

/** Minuti da "HH:MM" */
function timeToMin(t?: string): number {
  const [h, m] = (t || '00:00').slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
/** Minuti → "XhYY" (es. 8h30) */
function fmtHours(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h${String(m).padStart(2, '0')}`;
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
/** Stato approvazione turno → badge design */
function approvalBadge(status: string, t: Record<string, string>): { label: string; cls: string } | null {
  if (status === 'approved' || status === 'confirmed') return { label: t.home_status_approved ?? 'Confermato', cls: 'flow-badge-success' };
  if (status === 'draft') return { label: t.status_draft ?? 'Bozza', cls: 'flow-badge-neutral' };
  if (status === 'absent') return { label: t.status_absent ?? 'Assente', cls: 'flow-badge-error' };
  return null;
}

export default function MobileHome({
  greetingText,
  todayLabel,
  todayStr,
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
  inProgressLabel,
  savingLabel,
  startLabel,
  endLabel,
  canStart,
  canEnd,
  punchBusy,
  onStart,
  onEnd,
  onSeeAllShifts,
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

  // ── Orologio live (come da design) ─────────────────────────────────
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const clockHHMM = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;

  const today = todayStr ?? format(new Date(), 'yyyy-MM-dd');
  const firstShift = todayWorkShifts[0];
  const shiftRange = firstShift
    ? `${firstShift.start_time.slice(0, 5)} → ${firstShift.end_time?.slice(0, 5) ?? '…'}`
    : null;

  // ── KPI ────────────────────────────────────────────────────────────
  const todayMinutes = todayWorkShifts.reduce((sum, s) => {
    const start = timeToMin(s.start_time);
    const end = s.end_time ? timeToMin(s.end_time) : start;
    return sum + Math.max(0, end - start);
  }, 0);

  // ── Prossimi turni (da domani in poi) ──────────────────────────────
  const nextShifts = myShifts
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
    )
    .slice(0, 5);

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

  const bigClock = inProgress && elapsedLabel ? elapsedLabel : clockHHMM;

  const shiftBadge = firstShift ? approvalBadge(firstShift.approval_status, t) : null;

  const dayLabel = (dateStr: string) => {
    const d = parseISO(dateStr);
    const s = format(d, 'EEEE d MMMM', { locale: calLocale });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  return (
    <div
      className="flex flex-col gap-4 px-4 py-3 pb-12 relative shift-mobile-safe"
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
      <div className="px-1 mt-5 flex items-start justify-between gap-3">
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
        <span className="flow-section-label">Timbratura</span>
        <div className="punch-time text-white tabular-nums">{bigClock}</div>
        <div className="flex items-center justify-between gap-2 mb-4">
          <span className="text-sm font-medium text-white/70">{punchStatus}</span>
          {inProgress && entryTime && (
            <span className="flow-badge flow-badge-success">Entrata {entryTime}</span>
          )}
        </div>

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
      </section>

      {/* ── Riga KPI ────────────────────────────────────────────────── */}
      <section className="flow-card" aria-label="Riepilogo">
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0">
            <span className="flow-label block">Ore oggi</span>
            <span className="flow-kpi text-white block mt-0.5">{fmtHours(todayMinutes)}</span>
          </div>
          <div className="min-w-0">
            <span className="flow-label block">Turni</span>
            <span className="flow-kpi text-white block mt-0.5">{todayWorkShiftsCount}</span>
          </div>
          <div className="min-w-0">
            <span className="flow-label block">Settimana</span>
            <span className="flow-kpi text-white block mt-0.5">{fmtHours(weeklyMinutes)}</span>
          </div>
        </div>
      </section>

      {/* ── Turno di oggi ───────────────────────────────────────────── */}
      <section className="flow-card" aria-label="Turno di oggi">
        <span className="flow-section-label">Turno di oggi</span>
        {shiftRange ? (
          <>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {firstShift && (
                <span className="flow-badge flow-badge-neutral">
                  {firstShift.type === 'lunch' ? 'Pranzo' : 'Cena'}
                </span>
              )}
              <span className="flow-time text-white">{shiftRange}</span>
              {shiftBadge && <span className={`flow-badge ${shiftBadge.cls}`}>{shiftBadge.label}</span>}
            </div>
            {shiftTimeHint && (
              <p className="flow-label mt-1.5">{shiftTimeHint}</p>
            )}

            {/* Turni extra oggi (se più di uno) */}
            {!inProgress && todayWorkShifts.length > 1 && (
              <div className="flex flex-col gap-1.5 mt-3">
                {todayWorkShifts.slice(1).map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-t border-white/10">
                    <span className="text-base font-medium text-white tabular-nums">
                      {s.start_time.slice(0, 5)} – {s.end_time?.slice(0, 5) ?? '…'}
                    </span>
                    <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-white/50">
                      {s.type === 'lunch' ? 'Pranzo' : 'Cena'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-base font-medium text-white/50 mt-2">{noShiftsHint}</p>
        )}

        {onSeeAllShifts && (
          <button type="button" onClick={onSeeAllShifts} className="flow-btn-ghost-link">
            Vedi tutti i turni
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </section>

      {/* ── Prossimi turni ──────────────────────────────────────────── */}
      <section className="flow-card" aria-label="Prossimi turni">
        <span className="flow-section-label">Prossimi turni</span>
        {nextShifts.length === 0 ? (
          <p className="text-sm text-white/40 py-2">—</p>
        ) : (
          <div className="flex flex-col mt-1">
            {nextShifts.map((s) => (
              <div key={s.id} className="flex items-center justify-between py-2.5 border-b border-white/10 last:border-b-0">
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-white truncate">{dayLabel(s.date)}</span>
                  <span className="block text-xs text-white/45 mt-0.5">
                    {s.type === 'lunch' ? 'Pranzo' : 'Cena'}
                  </span>
                </div>
                <span className="text-base font-semibold text-white tabular-nums shrink-0 ml-3">
                  {s.start_time.slice(0, 5)} – {s.end_time?.slice(0, 5) ?? '…'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Colleghi in turno oggi ──────────────────────────────────── */}
      <HeaderTodayCoworkersCard />

      {/* ── I miei numeri ───────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between px-1 mb-2">
          <h2 className="flow-section-label">{statsLabels.title}</h2>
        </div>

        <MobileStatsCards
          weekWorkedMins={weeklyMinutes}
          weekCapMins={weekCapMinutes}
          monthWorkedMins={monthlyMinutes}
          monthDaysWorked={monthDaysWorked}
          hoursFormat="hhmm"
          hideWeek
          labels={{
            title: statsLabels.title,
            week: t.ts_period_week ?? 'Settimana',
            month: t.ts_period_month ?? 'Mese',
            daysWorked: statsLabels.daysWorked,
          }}
        />
      </section>

    </div>
  );
}
