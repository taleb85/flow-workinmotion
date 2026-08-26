import { useMemo, useState } from 'react';
import { format, startOfWeek, addDays, addWeeks, isSameDay, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Shift, User, Language } from '../../types';
import { getTranslations, getDateLocale } from '../../utils/translations';
import { getHiddenDates } from '../../utils/hiddenPeriods';

interface MobileStaffShiftsProps {
  user: User;
  myShifts: Shift[];
  language: Language;
  todayStr: string;
}

/** Stato visibile allo staff: approvato, confermato o assenza (come il tabellone). */
const STAFF_VISIBLE_STATUSES = new Set(['approved', 'confirmed', 'absent']);

function fmtTime(time?: string): string {
  return (time ?? '').slice(0, 5);
}
function timeToMin(t?: string): number {
  const [h, m] = (t || '00:00').slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function fmtHours(mins: number): string {
  const h = Math.floor(mins / 60);
  return `${h}h`;
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Vista settimanale "I tuoi turni" — layout da design FLOW Apple:
 * titolo, selettore settimana a pillola, KPI (ore/turni/riposi), lista turni.
 */
export default function MobileStaffShifts({ user, myShifts, language, todayStr }: MobileStaffShiftsProps) {
  const t = getTranslations(language);
  const locale = getDateLocale(language);
  const today = useMemo(() => parseISO(todayStr), [todayStr]);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(today, { weekStartsOn: 1 }));

  const hiddenDates = useMemo(() => getHiddenDates(), []);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const weekShifts = useMemo(() => {
    const dayStr = new Set(weekDays.map((d) => format(d, 'yyyy-MM-dd')));
    return myShifts
      .filter((s) => s.user_id === user.id)
      .filter((s) => STAFF_VISIBLE_STATUSES.has(s.approval_status))
      .filter((s) => !hiddenDates.has(s.date))
      .filter((s) => dayStr.has(s.date))
      .sort((a, b) =>
        a.date === b.date
          ? (a.start_time ?? '').localeCompare(b.start_time ?? '')
          : a.date.localeCompare(b.date)
      );
  }, [myShifts, user.id, weekDays, hiddenDates]);

  const isCurrentWeek = isSameDay(weekStart, startOfWeek(today, { weekStartsOn: 1 }));

  // ── KPI settimana ────────────────────────────────────────────────
  const weekMinutes = weekShifts.reduce((sum, s) => {
    const start = timeToMin(s.start_time);
    const end = s.end_time ? timeToMin(s.end_time) : start;
    return sum + Math.max(0, end - start);
  }, 0);
  const daysWithShifts = new Set(weekShifts.map((s) => s.date)).size;
  const restDays = Math.max(0, 7 - daysWithShifts);

  const badgeFor = (s: Shift): { label: string; cls: string } => {
    if (s.approval_status === 'approved' || s.approval_status === 'confirmed') {
      return { label: t.status_confirmed ?? 'Confermato', cls: 'flow-badge-success' };
    }
    if (s.approval_status === 'draft') {
      return { label: t.status_draft ?? 'Bozza', cls: 'flow-badge-warning' };
    }
    if (s.approval_status === 'absent') {
      return { label: t.status_absent ?? 'Assente', cls: 'flow-badge-error' };
    }
    return { label: s.approval_status, cls: 'flow-badge-neutral' };
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-3 pb-10">
      {/* Titolo */}
      <div className="px-1 mt-4">
        <h1 className="page-title text-white">{t.my_shifts_title ?? 'I tuoi turni'}</h1>
        <p className="page-subtitle">
          {format(weekStart, 'd MMMM', { locale })} – {format(addDays(weekStart, 6), 'd MMMM', { locale })}
        </p>
      </div>

      {/* Selettore settimana (pillola) */}
      <div className="flow-card period-selector flex items-center justify-between py-2" role="group" aria-label={t.week_selector ?? 'Selettore settimana'}>
        <button
          type="button"
          onClick={() => setWeekStart((d) => addWeeks(d, -1))}
          aria-label={t.previous_week ?? 'Settimana precedente'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 touch-manipulation"
        >
          <ChevronLeft className="h-[18px] w-[18px]" aria-hidden />
        </button>
        <span className="text-sm font-semibold text-white">
          {format(weekStart, 'd MMM', { locale })} – {format(addDays(weekStart, 6), 'd MMM', { locale })}
        </span>
        <button
          type="button"
          onClick={() => setWeekStart((d) => addWeeks(d, 1))}
          aria-label={t.next_week ?? 'Settimana successiva'}
          className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 touch-manipulation"
        >
          <ChevronRight className="h-[18px] w-[18px]" aria-hidden />
        </button>
      </div>

      {/* Torna alla settimana corrente */}
      {!isCurrentWeek && (
        <button
          type="button"
          onClick={() => setWeekStart(startOfWeek(today, { weekStartsOn: 1 }))}
          className="flow-btn-ghost-link !mt-0"
        >
          {t.today ?? 'Oggi'}
        </button>
      )}

      {/* KPI settimana */}
      <div className="grid grid-cols-3 gap-2" aria-label={t.week_summary ?? 'Riepilogo della settimana'}>
        <div className="flow-card flex flex-col items-center py-3">
          <span className="flow-kpi text-white">{fmtHours(weekMinutes)}</span>
          <span className="flow-label mt-0.5">{t.week_hours ?? 'Ore settimana'}</span>
        </div>
        <div className="flow-card flex flex-col items-center py-3">
          <span className="flow-kpi text-white">{weekShifts.length}</span>
          <span className="flow-label mt-0.5">{t.shifts_plural ?? 'Turni'}</span>
        </div>
        <div className="flow-card flex flex-col items-center py-3">
          <span className="flow-kpi text-white">{restDays}</span>
          <span className="flow-label mt-0.5">{t.rest_days ?? 'Riposi'}</span>
        </div>
      </div>

      {/* Lista turni */}
      <section className="flow-card" aria-label={t.shift_list ?? 'Elenco turni'}>
        {weekShifts.length === 0 && weekDays.every((d) => hiddenDates.has(format(d, 'yyyy-MM-dd'))) ? (
          <p className="py-6 text-center text-sm text-white/40">{t.no_shifts_scheduled}</p>
        ) : (
          <div className="flex flex-col">
            {weekDays.map((day, idx) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayShifts = weekShifts.filter((s) => s.date === dateStr);
              const isHidden = hiddenDates.has(dateStr);
              const dayIsToday = isSameDay(day, today);

              if (isHidden) return null;

              if (dayShifts.length === 0) {
                return (
                  <div key={dateStr}>
                    {idx > 0 && <hr className="flow-divider" aria-hidden="true" />}
                    <div className="shift-item flex items-center justify-between py-3">
                      <div className="flex items-center gap-3">
                        <span className="flow-time text-white/35">{cap(format(day, 'EEE d', { locale }))}</span>
                      </div>
                      <span className="flow-label">{t.rest_day ?? 'Riposo'}</span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={dateStr}>
                  {dayShifts.map((s, si) => {
                    const dayLabel = dayIsToday
                      ? `Oggi · ${cap(format(day, 'EEEE d', { locale }))}`
                      : cap(format(day, 'EEE d', { locale }));
                    const badge = badgeFor(s);
                    return (
                      <div key={s.id}>
                        {(idx > 0 || si > 0) && <hr className="flow-divider" aria-hidden="true" />}
                        <div className="shift-item flex items-center justify-between gap-3 py-3">
                          <div className="flex items-baseline gap-1.5 shrink-0">
                            <span className="flow-time text-white">{fmtTime(s.start_time)}</span>
                            <span className="flow-label">– {fmtTime(s.end_time)}</span>
                          </div>
                          <div className="min-w-0 flex-1 px-2">
                            <span className="block text-sm font-semibold text-white truncate">{dayLabel}</span>
                            <span className="flow-label block">
                              {s.type === 'lunch' ? t.lunch : t.dinner}
                            </span>
                          </div>
                          <span className={`flow-badge ${badge.cls} shrink-0`}>{badge.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
