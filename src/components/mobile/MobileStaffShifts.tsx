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

/**
 * Vista settimanale "I miei turni" per la dashboard mobile dello staff.
 * Sostituisce WeeklyShiftsTable (eliminata): lista leggera dei propri turni
 * della settimana con navigazione, raggruppati per giorno.
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

  const statusLabel: Record<string, string> = {
    draft: t.status_draft,
    confirmed: t.status_confirmed,
    approved: t.status_approved,
    absent: t.status_absent,
  };
  const statusColor: Record<string, string> = {
    approved: 'bg-accent/15 text-accent',
    confirmed: 'bg-sky-500/15 text-sky-300',
    absent: 'bg-white/10 text-white/50',
  };

  return (
    <div className="px-3 pb-8">
      {/* Navigazione settimana */}
      <div className="sticky top-0 z-10 mb-3 -mx-3 flex items-center justify-between gap-2 border-b border-white/10 bg-[#0a0a0c]/95 px-3 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={() => setWeekStart((d) => addWeeks(d, -1))}
          aria-label={t.previous_week ?? 'Settimana precedente'}
          className="rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 touch-manipulation"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-col items-center">
          <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">
            {t.timesheet_my_week ?? 'La tua settimana'}
          </span>
          <span className="text-xs text-white/50">
            {format(weekStart, 'd MMM', { locale })} – {format(addDays(weekStart, 6), 'd MMM', { locale })}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setWeekStart((d) => addWeeks(d, 1))}
          aria-label={t.next_week ?? 'Settimana successiva'}
          className="rounded-xl p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white active:bg-white/20 touch-manipulation"
        >
          <ChevronRight className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {!isCurrentWeek && (
        <button
          type="button"
          onClick={() => setWeekStart(startOfWeek(today, { weekStartsOn: 1 }))}
          className="mb-3 w-full rounded-xl bg-white/10 py-2 text-xs font-bold text-white/70 transition-colors hover:bg-white/15 active:bg-white/80 touch-manipulation"
        >
          {t.today ?? 'Oggi'}
        </button>
      )}

      {weekShifts.length === 0 ? (
        <p className="py-10 text-center text-sm text-white/40">{t.no_shifts_scheduled}</p>
      ) : (
        <div className="space-y-2">
          {weekDays.map((day) => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const dayShifts = weekShifts.filter((s) => s.date === dateStr);
            if (dayShifts.length === 0) return null;
            const dayIsToday = isSameDay(day, today);
            return (
              <div key={dateStr} className="overflow-hidden rounded-2xl border border-white/10">
                <div
                  className={`flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider ${
                    dayIsToday ? 'bg-accent/15 text-accent' : 'bg-white/5 text-white/60'
                  }`}
                >
                  <span className="truncate">{format(day, 'EEEE d MMMM', { locale })}</span>
                  {dayIsToday && <span className="shrink-0">{t.today ?? 'Oggi'}</span>}
                </div>
                {dayShifts.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-sm font-bold text-white">
                        {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
                      </span>
                      <span className="text-[11px] text-white/45">
                        {s.type === 'lunch' ? t.lunch : t.dinner}
                      </span>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        statusColor[s.approval_status] ?? 'bg-white/10 text-white/60'
                      }`}
                    >
                      {statusLabel[s.approval_status] ?? s.approval_status}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
