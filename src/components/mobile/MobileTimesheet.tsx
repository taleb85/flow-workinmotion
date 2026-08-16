import type React from 'react';
import { format, startOfWeek, endOfWeek, isSameWeek } from 'date-fns';
import { it, es, enUS } from 'date-fns/locale';
import { Clock, CheckCircle2, AlertCircle, XCircle, Calendar } from 'lucide-react';
import type { Shift, PunchRecord, User } from '../../types';
import type { BreakRule, BreakMinutesComputeOptions } from '../../utils/breakRules';
import { safeFormatDate } from '../../utils/safeDateFormat';
import { getResolvedStartEndForHours } from '../../utils/shiftResolvedClockTimes';
import { getNetShiftMinutes } from '../../utils/breakRules';
import { getTranslations } from '../../utils/translations';

interface MobileTimesheetProps {
  shifts: Shift[];
  punchRecords: PunchRecord[];
  user: User;
  breakRules: BreakRule[];
  breakComputeOpts: BreakMinutesComputeOptions;
  language?: string;
}

function getLocale(lang = 'it') {
  if (lang === 'es') return es;
  if (lang === 'en') return enUS;
  return it;
}

function getDarkCard() {
  return {
    cls: 'rounded-2xl border border-neutral-500 overflow-hidden',
    style: { background: 'transparent' } as React.CSSProperties,
  };
}

export default function MobileTimesheet({
  shifts, punchRecords, user, breakRules, breakComputeOpts, language = 'it',
}: MobileTimesheetProps) {
  const locale = getLocale(language);
  const t = getTranslations(language as 'it' | 'en' | 'es');

  const STATUS_CONFIG = {
    approved: {
      label: t.ts_status_approved ?? 'Approvato',
      icon: CheckCircle2,
      pill: 'bg-white/10 text-white/70 border-white/20',
    },
    confirmed: {
      label: t.ts_status_confirmed ?? 'Pubblicato',
      icon: AlertCircle,
      pill: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
    },
    absent: {
      label: t.status_absent ?? 'Assente',
      icon: XCircle,
      pill: 'bg-red-500/10 text-red-700 border-red-500/20',
    },
  } as const;

  const history = shifts
    .filter(s => s.date <= format(new Date(), 'yyyy-MM-dd'))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border border-white/[0.08]">
          <Clock className="w-7 h-7 text-white/50" />
        </div>
        <p className="text-white/50 font-bold uppercase tracking-widest text-[0.6875rem]">
          {t.no_shifts_scheduled ?? 'Nessuno storico disponibile'}
        </p>
      </div>
    );
  }

  // Raggruppa per settimana
  const weeks: { start: Date; end: Date; shifts: Shift[] }[] = [];
  history.forEach(shift => {
    const shiftDate = new Date(shift.date);
    const s = startOfWeek(shiftDate, { weekStartsOn: 1 });
    const e = endOfWeek(shiftDate, { weekStartsOn: 1 });
    let week = weeks.find(w => isSameWeek(w.start, s, { weekStartsOn: 1 }));
    if (!week) { week = { start: s, end: e, shifts: [] }; weeks.push(week); }
    week.shifts.push(shift);
  });

  return (
    <div className="flex flex-col gap-3 px-4 pb-content pt-2">
      {weeks.map((week, wIdx) => {
        // Totale ore settimana
        let totalMins = 0;
        week.shifts.forEach(shift => {
          const { start, end } = getResolvedStartEndForHours(shift, punchRecords);
          totalMins += getNetShiftMinutes(shift, start, end, user, breakRules, breakComputeOpts);
        });
        const totalH = Math.floor(totalMins / 60);
        const totalM = totalMins % 60;
        const totalLabel = totalM > 0 ? `${totalH}h ${totalM}m` : `${totalH}h`;

        // Raggruppa per giorno
        const days: { date: string; shifts: Shift[] }[] = [];
        week.shifts.forEach(shift => {
          let day = days.find(d => d.date === shift.date);
          if (!day) { day = { date: shift.date, shifts: [] }; days.push(day); }
          day.shifts.push(shift);
        });
        days.forEach(day => day.shifts.sort((a, b) => a.start_time.localeCompare(b.start_time)));

        const { cls: cardCls, style: cardStyle } = getDarkCard();
        return (
          <div key={wIdx} className={cardCls} style={cardStyle}>
            {/* Header settimana */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-white/50" />
                </div>
                <div>
                  <p className="text-[0.6875rem] font-black uppercase tracking-widest text-white/50 leading-none mb-0.5">
                    {t.week_label ?? 'Sett.'}
                  </p>
                  <p className="text-sm font-bold text-white/90 leading-none">
                    {format(week.start, 'd MMM', { locale })} – {format(week.end, 'd MMM', { locale })}
                  </p>
                </div>
              </div>
              {totalMins > 0 && (
                <span className="text-[0.6875rem] font-black px-2.5 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/20">
                  {totalLabel}
                </span>
              )}
            </div>

            {/* Giorni */}
            <div className="flex flex-col divide-y divide-white/10">
              {days.map((day) => (
                <div key={day.date} className="px-4 py-3 flex flex-col gap-2">
                  {/* Label giorno */}
                  <p className="text-[0.6875rem] font-black uppercase tracking-widest text-white/70">
                    {safeFormatDate(day.date, 'EEEE d MMMM', { locale })}
                  </p>

                  {/* Turni del giorno */}
                  <div className="flex flex-col gap-1.5">
                    {day.shifts.map((shift) => {
                      const statusKey = (shift.approval_status as keyof typeof STATUS_CONFIG) || 'confirmed';
                      const config = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.confirmed;
                      const Icon = config.icon;
                      const isAbsent = shift.approval_status === 'absent';

                      const { start, end } = getResolvedStartEndForHours(shift, punchRecords);
                      const mins = getNetShiftMinutes(shift, start, end, user, breakRules, breakComputeOpts);
                      const hh = Math.floor(mins / 60);
                      const mm = mins % 60;
                      const hoursWorked = mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;

                      return (
                        <div
                          key={shift.id}
                          className={`rounded-xl px-3 py-2.5 border ${
 isAbsent
 ? 'border-red-500/10'
 : 'bg-white/8 border-neutral-500'
 }`}
                          style={
                            typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
                              ? { background: 'transparent' }
                              : isAbsent ? { background: 'rgba(239,68,68,0.04)' } : {}
                          }
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            {/* Ore lavorate */}
                            <p className={`font-black tabular-nums text-xl leading-none ${
 isAbsent ? 'text-white/50' : 'text-white/90'
 }`}>
                              {isAbsent ? '—' : hoursWorked}
                            </p>
                            {/* Badge stato */}
                            <span className={`flex items-center gap-1 text-[0.6875rem] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${config.pill}`}>
                              <Icon className="w-3 h-3" />
                              {config.label}
                            </span>
                          </div>
                          {/* Orario pianificato + tipo */}
                          <div className="flex items-center justify-between">
                            <p className={`text-[0.6875rem] font-bold tabular-nums ${
 isAbsent ? 'text-white/50 line-through' : 'text-white/60'
 }`}>
                              {shift.start_time.slice(0, 5)} – {shift.end_time?.slice(0, 5) ?? '…'}
                            </p>
                            {shift.type && (
                              <p className="text-[0.6875rem] font-semibold uppercase tracking-widest text-white/50">
                                {shift.type === 'lunch' ? (t.lunch ?? 'Pranzo') : (t.dinner ?? 'Cena')}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
