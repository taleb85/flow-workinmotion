import { it as itLocale } from 'date-fns/locale';
import { Calendar, Clock } from 'lucide-react';
import type { Language, Shift } from '../../types';
import { safeFormatDate } from '../../utils/safeDateFormat';
import { translateDepartmentValue } from '../../utils/departmentLabels';
import { getDateLocale } from '../../utils/translations';

interface MobileShiftListProps {
  shifts: Shift[];
  language: Language;
}

export default function MobileShiftList({ shifts, language }: MobileShiftListProps) {
  const locale = getDateLocale(language) ?? itLocale;

  if (shifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
          <Calendar className="w-8 h-8 text-white/50" />
        </div>
        <p className="text-white/60 font-medium">Nessun turno in programma</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-content">
      {shifts.map((shift) => {
        const isAbsent = shift.approval_status === 'absent';
        const isDraft = shift.approval_status === 'draft';
        
        return (
          <div 
            key={shift.id}
            className={`rounded-3xl p-5 border flex flex-col gap-4 ${isAbsent ? 'opacity-60 border-red-500/20' : 'border-neutral-500'}`} style={isAbsent ? { background: 'rgba(239,68,68,0.08)' } : { background: 'transparent' }}
          >
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <p className="text-xs font-bold text-white/50 uppercase tracking-widest mb-1">
                  {safeFormatDate(shift.date, 'EEEE d MMMM', { locale })}
                </p>
                <div className="flex items-center gap-2">
                  <Clock className="w-5 h-5 text-white/50" />
                  <p className="text-2xl font-bold text-white tabular-nums">
                    {shift.start_time.slice(0, 5)} – {shift.end_time?.slice(0, 5) ?? '…'}
                  </p>
                </div>
              </div>
              
              {shift.department && (
                <span className="px-3 py-1 rounded-full bg-white/10 text-white/70 text-[11px] font-black uppercase tracking-wider border border-neutral-500">
                  {translateDepartmentValue(shift.department, language as Language)}
                </span>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/10">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${
 isAbsent ? 'bg-red-500' : isDraft ? 'bg-white' : 'bg-brand-500'
 }`} />
                <span className="text-[11px] font-bold text-white/60 uppercase tracking-wider">
                  {isAbsent ? 'Assente' : isDraft ? 'Bozza' : 'Pubblicato'}
                </span>
              </div>
              
              {shift.notes && !shift.notes.startsWith('__OPEN__') && (
                <p className="text-[11px] text-white/50 italic truncate max-w-[150px]" title={shift.notes}>{shift.notes}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
