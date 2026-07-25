import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, CalendarDays } from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  eachDayOfInterval,
  isSameDay,
  isToday,
  parseISO,
  setMonth as dfSetMonth,
  setYear as dfSetYear,
} from 'date-fns';

interface CalendarDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (val: string) => void;
  minDate?: string;
  maxDate?: string;
}

const MONTHS_IT = [
  'Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
  'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre',
];
const DAY_HEADERS = ['lun','mar','mer','gio','ven','sab','dom'];

export function CalendarDatePicker({ value, onChange, minDate, maxDate }: CalendarDatePickerProps) {
  const selectedDate = useMemo(() => (value ? parseISO(value) : new Date()), [value]);
  const [viewDate, setViewDate] = useState(() => value ? parseISO(value) : new Date());
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const viewMonth = viewDate.getMonth();
  const viewYear = viewDate.getFullYear();

  useEffect(() => {
    if (value) setViewDate(parseISO(value));
  }, [value]);

  useEffect(() => {
    if (!showMonthPicker && !showYearPicker) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowMonthPicker(false);
        setShowYearPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMonthPicker, showYearPicker]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(viewDate), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(viewDate), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [viewDate]);

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = viewYear - 6; y <= viewYear + 6; y++) arr.push(y);
    return arr;
  }, [viewYear]);

  const isDisabled = (day: Date) => {
    if (minDate && format(day, 'yyyy-MM-dd') < minDate) return true;
    if (maxDate && format(day, 'yyyy-MM-dd') > maxDate) return true;
    return false;
  };

  const handleDayClick = (day: Date) => {
    if (isDisabled(day)) return;
    onChange(format(day, 'yyyy-MM-dd'));
  };

  const handleToday = () => {
    const today = new Date();
    setViewDate(today);
    onChange(format(today, 'yyyy-MM-dd'));
  };

  return (
    <div
      ref={containerRef}
      className="w-full rounded-2xl border border-white/15 p-4 select-none shadow-2xl"
      style={{ background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          {/* Mese */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowMonthPicker(v => !v); setShowYearPicker(false); }}
              className="flex items-center gap-0.5 text-[15px] font-bold text-white hover:text-accent transition-colors active:text-accent"
            >
              {MONTHS_IT[viewMonth].toLowerCase()}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {showMonthPicker && (
              <div className="absolute top-full left-0 z-20 mt-1.5 w-44 rounded-xl border border-white/15 shadow-lg p-1.5 grid grid-cols-3 gap-0.5"
                style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
                {MONTHS_IT.map((m, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { setViewDate(dfSetMonth(viewDate, i)); setShowMonthPicker(false); }}
                    className={`rounded-lg py-1.5 text-[11px] font-semibold transition-colors ${
                      i === viewMonth
                        ? 'bg-accent text-white'
                        : 'text-white/70 hover:bg-white/10'
                    } active:bg-white/10'/80`}
                  >
                    {m.slice(0, 3).toLowerCase()}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Anno */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setShowYearPicker(v => !v); setShowMonthPicker(false); }}
              className="flex items-center gap-0.5 text-[15px] font-bold text-white hover:text-accent transition-colors active:text-accent"
            >
              {viewYear}
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
            {showYearPicker && (
              <div className="absolute top-full left-0 z-20 mt-1.5 w-20 rounded-xl border border-white/15 shadow-lg p-1.5 flex flex-col gap-0.5 max-h-48 overflow-y-auto"
                style={{ background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
                {years.map(y => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => { setViewDate(dfSetYear(viewDate, y)); setShowYearPicker(false); }}
                    className={`rounded-lg py-1.5 text-[12px] font-semibold transition-colors ${
                      y === viewYear
                        ? 'bg-accent text-white'
                        : 'text-white/70 hover:bg-white/10'
                    } active:bg-white/10'/80`}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Frecce prev/next */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewDate(subMonths(viewDate, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 text-accent hover:bg-white/10 transition-colors active:bg-white/80"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewDate(addMonths(viewDate, 1))}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 text-accent hover:bg-white/10 transition-colors active:bg-white/80"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Intestazioni giorno ── */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-white/40 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* ── Griglia giorni ── */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map(day => {
          const isCurrentMonth = day.getMonth() === viewMonth;
          const isSelected = isSameDay(day, selectedDate);
          const isTodayDay = isToday(day);
          const disabled = isDisabled(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => handleDayClick(day)}
              disabled={disabled}
              className={`flex h-9 w-full items-center justify-center rounded-xl text-[13px] font-semibold transition-all duration-100 ${
                disabled
                  ? 'opacity-25 cursor-not-allowed'
                  : isSelected
                    ? 'bg-accent text-white shadow-sm'
                    : isTodayDay
                      ? 'border-2 border-accent text-accent'
                        : isCurrentMonth
                        ? 'text-white hover:bg-white/12'
                        : 'text-white/30 hover:bg-white/8'
              } active:bg-white/12'/80`}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      {/* ── Footer: pulsante Oggi ── */}
      <div className="flex justify-end mt-3">
        <button
          type="button"
          onClick={handleToday}
          className="rounded-xl bg-accent px-4 py-1.5 text-[13px] font-bold text-white shadow-sm hover:bg-accent/90 active:scale-95 transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
        >
          Oggi
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   DatePickerInput — campo trigger + popover a comparsa
───────────────────────────────────────────────────────────────── */
interface DatePickerInputProps {
  value: string;
  onChange: (val: string) => void;
  inputClassName?: string;
  minDate?: string;
  maxDate?: string;
  /** Per associare un `<label htmlFor>` al trigger. */
  id?: string;
}

export function DatePickerInput({ value, onChange, inputClassName, minDate, maxDate, id }: DatePickerInputProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const displayValue = useMemo(() => {
    if (!value) return '';
    try {
      return format(parseISO(value), 'dd/MM/yyyy');
    } catch {
      return value;
    }
  }, [value]);

  const handleChange = useCallback((val: string) => {
    onChange(val);
    setOpen(false);
  }, [onChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        id={id}
        onClick={() => setOpen(v => !v)}
        className={`flex w-full items-center gap-2 rounded-xl border border-white/35 bg-white/15 px-3 py-2.5 text-base font-semibold text-white shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 ${inputClassName ?? ''}`}
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-white/50" />
        <span className="flex-1 text-left">{displayValue || <span className="text-white/35 font-normal">Seleziona data</span>}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full z-[99] mt-1.5 w-full min-w-0 min-w-[min(300px,100%)] max-w-[min(340px,calc(100vw-32px))] overflow-x-hidden">
          <CalendarDatePicker
            value={value}
            onChange={handleChange}
            minDate={minDate}
            maxDate={maxDate}
          />
        </div>
      )}
    </div>
  );
}
