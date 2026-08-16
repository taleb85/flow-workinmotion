import { useMemo } from 'react';
import { format, startOfWeek, endOfWeek, isSameWeek, eachDayOfInterval, isToday, parseISO } from 'date-fns';
import { it, es, enUS } from 'date-fns/locale';
import { Calendar } from 'lucide-react';
import type { Language, Shift } from '../../types';
import { translateDepartmentValue } from '../../utils/departmentLabels';
import { getTranslations } from '../../utils/translations';

interface MobileShiftsProps {
  shifts: Shift[];
  language: string;
}

function getLocale(lang: string) {
  if (lang === 'es') return es;
  if (lang === 'en') return enUS;
  return it;
}

function getDayLetters(locale: typeof it): string[] {
  const base = new Date(2024, 0, 1); // Monday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return format(d, 'EEEEE', { locale }).toUpperCase();
  });
}

export default function MobileShifts({ shifts, language }: MobileShiftsProps) {
  const locale = getLocale(language);
  const t = getTranslations(language as 'it' | 'en' | 'es');
  const dayLetters = getDayLetters(locale);

  // Raggruppa i turni per settimana
  const weeks = useMemo(() => {
    const sorted = [...shifts].sort((a, b) => a.date.localeCompare(b.date));
    const map: { start: Date; end: Date; shifts: Shift[] }[] = [];
    sorted.forEach(shift => {
      const d = parseISO(shift.date);
      const s = startOfWeek(d, { weekStartsOn: 1 });
      const e = endOfWeek(d, { weekStartsOn: 1 });
      let week = map.find(w => isSameWeek(w.start, s, { weekStartsOn: 1 }));
      if (!week) { week = { start: s, end: e, shifts: [] }; map.push(week); }
      week.shifts.push(shift);
    });
    return map;
  }, [shifts]);

  if (shifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border border-white/[0.09]">
          <Calendar className="w-7 h-7 text-white/25" />
        </div>
        <p className="text-white/25 font-bold uppercase tracking-widest text-[0.6875rem]">
          {t.no_shifts_scheduled}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-content pt-1">
      {weeks.map((week, wIdx) => {
        const weekDays = eachDayOfInterval({ start: week.start, end: week.end });

        // Mappa per giorno
        const byDay: Record<string, Shift[]> = {};
        week.shifts.forEach(s => {
          const k = format(parseISO(s.date), 'yyyy-MM-dd');
          if (!byDay[k]) byDay[k] = [];
          byDay[k].push(s);
        });

        // Totale ore settimana
        const totalMins = week.shifts.reduce((acc, s) => {
          if (!s.start_time || !s.end_time || s.approval_status === 'absent') return acc;
          const [sh, sm] = s.start_time.split(':').map(Number);
          const [eh, em] = s.end_time.split(':').map(Number);
          return acc + (eh * 60 + em - sh * 60 - sm);
        }, 0);
        const hoursLabel = totalMins > 0
          ? (totalMins % 60 > 0 ? `${Math.floor(totalMins / 60)}h ${totalMins % 60}m` : `${Math.floor(totalMins / 60)}h`)
          : '—';
        const confirmedShifts = week.shifts.filter(s => s.approval_status !== 'absent');
        const restDays = weekDays.filter(d => !byDay[format(d, 'yyyy-MM-dd')]?.filter(s => s.approval_status !== 'absent').length).length;

        return (
          <div key={wIdx} className="mb-4">
            {/* Card griglia settimanale — trasparente, solo bordo */}
            <div className="rounded-2xl border border-neutral-500 overflow-hidden" style={{ background: 'transparent' }}>
              {/* Griglia giorni */}
              <div className="grid grid-cols-7 gap-1 px-2 pt-3 pb-2">
                {weekDays.map((day, i) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const dayShifts = byDay[key] ?? [];
                  const hasShift = dayShifts.length > 0;
                  const first = dayShifts[0];
                  const isAbsent = first?.approval_status === 'absent';
                  const isToday_ = isToday(day);

                  const shiftCount = hasShift && !isAbsent ? dayShifts.length : 0;

                  const blockCls = hasShift && !isAbsent
                    ? 'bg-white/[0.12] border border-white/20'
                    : isAbsent
                      ? 'bg-red-500/[0.08] border border-red-500/[0.18]'
                      : 'border border-neutral-500 bg-white/5';

                  return (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span className={`text-[0.6875rem] font-bold ${isToday_ ? 'text-white' : 'text-white/50'}`}>{dayLetters[i]}</span>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[0.6875rem] font-bold ${
 isToday_ ? 'bg-white/20 text-white' : 'text-white/60'
 }`}>
                        {format(day, 'd')}
                      </div>
                      <div className={`w-full rounded-lg flex flex-col items-center justify-center py-1.5 px-0.5 min-h-[2.375rem] transition-colors ${blockCls}`}>
                        {shiftCount > 0 && (
                          <span className="text-[0.8125rem] font-black text-white leading-none drop-shadow-sm">
                            {shiftCount}
                          </span>
                        )}
                        {isAbsent && <span className="text-[0.6875rem] font-bold text-red-500 opacity-80">—</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Riepilogo settimana */}
              <div className="border-t border-white/10 mx-3 mt-0 pt-2.5 pb-3 flex justify-around">
                {[
                  { label: t.shift_plural ?? 'Turni', value: confirmedShifts.length.toString() },
                  { label: t.stat_hours_total_abbr ?? 'Ore tot', value: hoursLabel },
                  { label: t.stat_rest_days ?? 'Riposi', value: restDays.toString() },
                ].map(({ label, value }, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <span className="text-sm font-black text-white/90 tabular-nums">{value}</span>
                    <span className="text-[0.6875rem] text-white/50 uppercase font-bold tracking-wider">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Lista dettaglio turni della settimana */}
            <div className="flex flex-col gap-1.5 mt-2.5">
              {weekDays.map(day => {
                const key = format(day, 'yyyy-MM-dd');
                const dayShifts = byDay[key] ?? [];
                if (!dayShifts.length) return null;
                return (
                  <div key={key}>
                    <p className="text-[0.6875rem] font-black uppercase tracking-widest mt-2 mb-1.5 text-white/70 flex items-center gap-2">
                      {format(day, 'EEEE d MMMM', { locale })}
                      {isToday(day) && (
                        <span className="h-1 w-1 rounded-full bg-white/60" />
                      )}
                    </p>
                    {dayShifts.map(shift => {
                      const isAbsent = shift.approval_status === 'absent';
                      const isDraft  = shift.approval_status === 'draft';
                      const badgeCls = isAbsent
                        ? 'text-red-400 border-red-500/30 bg-red-500/15'
                        : isDraft
                          ? 'text-white/50 border-neutral-500 bg-white/8'
                          : 'text-white/70 border-white/20 bg-white/10';
                      const badgeLabel = isAbsent
                        ? (t.status_absent ?? 'Assente')
                        : isDraft
                          ? (t.status_draft ?? 'Bozza')
                          : (t.shifts_confirmed ?? 'Pubblicato');

                      return (
                        <div key={shift.id}
                          className={`flex items-center justify-between rounded-xl px-3 py-2.5 mb-1 border ${
 isAbsent
 ? 'border-red-500/30 bg-red-500/10'
 : 'border-neutral-500'
 }`}
                          style={isAbsent ? {} : { background: 'transparent' }}
                        >
                          <div className="flex flex-col gap-0.5">
                            <p className={`font-black tabular-nums text-base leading-none ${isAbsent ? 'text-white/40 line-through' : 'text-white/90'}`}>
                              {shift.start_time.slice(0, 5)} – {shift.end_time?.slice(0, 5) ?? '…'}
                            </p>
                            {shift.department && (
                              <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-white/50 mt-0.5">
                                {translateDepartmentValue(shift.department, language as Language)}
                              </p>
                            )}
                          </div>
                          <span className={`text-[0.6875rem] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${badgeCls}`}>
                            {badgeLabel}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
