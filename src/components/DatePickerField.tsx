import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  forwardRef,
  type MutableRefObject,
} from 'react';
import { format } from 'date-fns';
import { DayPicker, type Matcher } from 'react-day-picker';
import { Calendar, ChevronDown } from 'lucide-react';
import { it } from 'date-fns/locale';
import { useApp } from '../context/AppContext';
import { getTranslations, getDateLocale } from '../utils/translations';
import { CenteredModalPortal } from './ui/CenteredModalPortal';
import 'react-day-picker/style.css';

/** yyyy-MM-dd come data locale (mezzogiorno), senza shift UTC di parseISO. */
function parseLocalDateOnly(iso: string): Date | undefined {
  const s = iso.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

export type DatePickerFieldProps = {
  value: string;
  onChange: (isoDate: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /** Mostra «Cancella» nel footer (default true). */
  allowClear?: boolean;
  /** Data breve (es. 23/02/26) e padding ridotto — toolbar su una riga. */
  compact?: boolean;
  'aria-label'?: string;
};

const DatePickerField = forwardRef<HTMLButtonElement, DatePickerFieldProps>(function DatePickerField(
  {
    value,
    onChange,
    min,
    max,
    disabled,
    className = '',
    id,
    allowClear = true,
    compact = false,
    'aria-label': ariaLabel,
  },
  ref
) {
  const { effectiveLanguage } = useApp();
  const t = getTranslations(effectiveLanguage);
  const tv = t as Record<string, string>;
  const locale = getDateLocale(effectiveLanguage) ?? it;
  const clearLabel = (t as { date_picker_clear?: string }).date_picker_clear ?? 'Cancella';
  const chooseLabel = (t as { date_picker_choose?: string }).date_picker_choose ?? 'Scegli data';

  const innerRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const setButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as MutableRefObject<HTMLButtonElement | null>).current = node;
    },
    [ref]
  );

  const [open, setOpen] = useState(false);

  const selected = value ? parseLocalDateOnly(value) : undefined;

  const anchorMonth = useMemo(() => {
    if (value) {
      const p = parseLocalDateOnly(value);
      if (p) return p;
    }
    if (min) {
      const p = parseLocalDateOnly(min);
      if (p) return p;
    }
    return new Date();
  }, [value, min]);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => anchorMonth);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  /** Solo all’apertura: evita di azzerare il mese mentre si naviga o mentre `value` si aggiorna con il menu aperto. */
  useLayoutEffect(() => {
    if (open && !wasOpenRef.current) setVisibleMonth(anchorMonth);
    wasOpenRef.current = open;
  }, [open, anchorMonth]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (popRef.current?.contains(n) || innerRef.current?.contains(n)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const minD = min ? parseLocalDateOnly(min) : undefined;
  const maxD = max ? parseLocalDateOnly(max) : undefined;
  const startMonthNav = useMemo(() => {
    const m = min ? parseLocalDateOnly(min) : undefined;
    if (m) return new Date(m.getFullYear(), m.getMonth(), 1);
    const y = new Date().getFullYear();
    return new Date(y - 5, 0, 1);
  }, [min]);
  const endMonthNav = useMemo(() => {
    const m = max ? parseLocalDateOnly(max) : undefined;
    if (m) return new Date(m.getFullYear(), m.getMonth(), 1);
    const y = new Date().getFullYear();
    return new Date(y + 2, 11, 1);
  }, [max]);

  const matchers: Matcher[] = [];
  if (minD) matchers.push({ before: minD });
  if (maxD) matchers.push({ after: maxD });

  const label = selected
    ? format(selected, compact ? 'dd/MM/yy' : 'd MMM yyyy', { locale })
    : chooseLabel;

  const panelInner = (
    <>
      <DayPicker
        mode="single"
        required={!allowClear}
        selected={selected}
        onSelect={(d: Date | undefined) => {
          if (d) onChange(format(d, 'yyyy-MM-dd'));
          else if (allowClear) onChange('');
          setOpen(false);
        }}
        locale={locale}
        captionLayout="dropdown"
        startMonth={startMonthNav}
        endMonth={endMonthNav}
        month={visibleMonth}
        onMonthChange={setVisibleMonth}
        disabled={matchers.length ? matchers : undefined}
        className="rdp-modern"
      />
      <div
        className={`mt-3 flex items-center gap-2.5 border-t border-slate-100 pt-3.5 ${allowClear ? 'justify-between' : 'justify-end'}`}
      >
        {allowClear ? (
          <button
            type="button"
            className="rounded-2xl px-2.5 py-1.5 text-sm font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            {clearLabel}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-2xl bg-accent px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent-hover"
          onClick={() => {
            onChange(format(new Date(), 'yyyy-MM-dd'));
            setOpen(false);
          }}
        >
          {t.today}
        </button>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={setButtonRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel ?? chooseLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={`inline-flex h-[22px] min-h-[22px] max-h-[22px] shrink-0 items-center gap-0.5 rounded-lg border border-slate-200 bg-white text-left font-medium leading-none tabular-nums text-slate-800 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/80 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:cursor-not-allowed disabled:opacity-50 ${
          compact ? 'px-1.5 text-[11px] sm:text-[12px]' : 'gap-1 px-2 text-[13px]'
        } ${className}`}
      >
        <Calendar className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
        <span className="min-w-0 truncate tabular-nums">{label}</span>
        <ChevronDown className="ml-0.5 h-3 w-3 shrink-0 text-slate-400" aria-hidden />
      </button>
      {open && !disabled && (
        <CenteredModalPortal
          open
          onClose={() => setOpen(false)}
          panelRef={popRef}
          backdropAriaLabel={tv.close ?? 'Chiudi'}
          ariaLabel={chooseLabel}
          maxWidthClass="max-w-lg"
          maxHeightClass="max-h-[min(92dvh,720px)]"
          panelClassName="p-3.5"
          markDatePickerPortal
        >
          {panelInner}
        </CenteredModalPortal>
      )}
    </>
  );
});

export default DatePickerField;
