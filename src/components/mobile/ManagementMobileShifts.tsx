import { useState, useMemo, useCallback } from 'react';

import {
  format, startOfWeek, endOfWeek, isSameWeek,
  eachDayOfInterval, isToday, parseISO,
  addWeeks, startOfDay, endOfDay, isWithinInterval, getISOWeek,
} from 'date-fns';
import { it, es, enUS } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ChevronDown, Calendar, Users } from 'lucide-react';
import type { Shift, User } from '../../types';
import { translateDepartmentValue } from '../../utils/departmentLabels';
import { getTranslations } from '../../utils/translations';
import {
  loadPeriodConfig, getPeriodDateRange,
  prevPeriodConfig, nextPeriodConfig, type PeriodConfig,
} from '../../utils/periodConfig';

type NavMode = 'week' | 'period';

interface Props {
  shifts: Shift[];
  users: User[];
  currentUserId: string;
  language: string;
}

function getLocale(lang: string) {
  if (lang === 'es') return es;
  if (lang === 'en') return enUS;
  return it;
}

function shiftMins(s: Shift): number {
  if (!s.start_time || !s.end_time || s.approval_status === 'absent') return 0;
  const [sh, sm] = s.start_time.split(':').map(Number);
  const [eh, em] = s.end_time.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

function minsLabel(m: number): string {
  if (m <= 0) return '—';
  return m % 60 > 0 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`;
}

function StatusBadge({ shift, t: _t }: { shift: Shift; t: Record<string, string> }) {
  const isAbsent = shift.approval_status === 'absent';
  
  if (isAbsent) {
    return <span className="shift-status-off">OFF</span>;
  }
  
  // Semplificazione: solo check per completato (entrata+uscita presenti)
  // Non esiste più lo stato 'approved'

  
  // Draft: niente badge visibile, il grigio del testo è sufficiente
  return null;
}

/* ── Raggruppamento per settimana ──────────────────────────────────────── */
function groupByWeeks(list: Shift[]) {
  const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
  const map: { start: Date; end: Date; shifts: Shift[] }[] = [];
  sorted.forEach(s => {
    const d = parseISO(s.date);
    const start = startOfWeek(d, { weekStartsOn: 1 });
    const end = endOfWeek(d, { weekStartsOn: 1 });
    let week = map.find(w => isSameWeek(w.start, start, { weekStartsOn: 1 }));
    if (!week) { week = { start, end, shifts: [] }; map.push(week); }
    week.shifts.push(s);
  });
  return map;
}

/* ── I miei turni: griglia settimanale + lista (multi-settimana) ──────── */
function getDayLetters(locale: typeof it): string[] {
  const base = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return format(d, 'EEEEE', { locale }).toUpperCase();
  });
}

function MyShiftsSection({
  myShifts, locale, language, t,
}: {
  myShifts: Shift[];
  locale: typeof it;
  language: string;
  t: Record<string, string>;
}) {
  const cardBg = { background: 'transparent' };
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  // Track which non-current weeks the user has manually expanded
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const dayLetters = getDayLetters(locale);
  const weeks = useMemo(() => groupByWeeks(myShifts), [myShifts]);

  const currentWeekIdx = useMemo(
    () => weeks.findIndex(w => isSameWeek(new Date(), w.start, { weekStartsOn: 1 })),
    [weeks],
  );

  function toggleWeek(wIdx: number) {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(wIdx)) next.delete(wIdx);
      else next.add(wIdx);
      return next;
    });
    setSelectedDayKey(null);
  }

  if (myShifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Calendar className="w-5 h-5 text-white/55 mb-2" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/55">
          {t.no_shifts ?? 'Nessun turno'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {weeks.map((week, wIdx) => {
        const weekDays = eachDayOfInterval({ start: week.start, end: week.end });
        const byDay: Record<string, Shift[]> = {};
        week.shifts.forEach(s => {
          const k = format(parseISO(s.date), 'yyyy-MM-dd');
          if (!byDay[k]) byDay[k] = [];
          byDay[k].push(s);
        });
        Object.keys(byDay).forEach(k => {
          byDay[k].sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
        });
        const totalMins = week.shifts.reduce((acc, s) => acc + shiftMins(s), 0);
        const confirmed = week.shifts.filter(s => s.approval_status !== 'absent');
        const restDays = weekDays.filter(d =>
          !(byDay[format(d, 'yyyy-MM-dd')] ?? []).some(s => s.approval_status !== 'absent')
        ).length;
        const isCurrentWeek = wIdx === currentWeekIdx;
        // Current week: expanded by default (unless user collapsed it)
        // Other weeks: collapsed by default (unless user expanded them)
        const isOpen = isCurrentWeek ? !expandedWeeks.has(wIdx) : expandedWeeks.has(wIdx);

        // Compact row for non-current weeks when collapsed
        if (!isCurrentWeek && !isOpen) {
          const weekLabel = `${format(week.start, 'd MMM', { locale })} – ${format(week.end, 'd MMM', { locale })}`;
          return (
            <button
              key={wIdx}
              type="button"
              onClick={() => toggleWeek(wIdx)}
              className="w-full flex items-center justify-between rounded-2xl border border-neutral-500 px-4 py-3 text-left transition-colors hover:border-white/20 active:brightness-95"
              style={cardBg}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[11px] font-bold uppercase tracking-widest text-white/50">
                  {weekLabel}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-white/70 tabular-nums">
                    {confirmed.length} {t.shift_plural ?? 'turni'}
                  </span>
                  <span className="text-[11px] text-white/40">·</span>
                  <span className="text-xs font-semibold text-white/70 tabular-nums">
                    {minsLabel(totalMins)}
                  </span>
                </div>
              </div>
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-white/35 shrink-0 rotate-0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3,6 8,11 13,6" />
              </svg>
            </button>
          );
        }

        return (
          <div key={wIdx}>
            <div
              className="rounded-2xl border border-neutral-500 overflow-hidden shadow-sm"
              style={cardBg}
            >
              {/* Griglia 7 giorni */}
              <div className="grid grid-cols-7 gap-1 px-2 pt-3 pb-2">
                {weekDays.map((day, i) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const dayShifts = byDay[key] ?? [];
                  const hasShift = dayShifts.length > 0;
                  const first = dayShifts[0];
                  const isAbsent = first?.approval_status === 'absent';
                  const isToday_ = isToday(day);
                  const shiftCount = hasShift && !isAbsent ? dayShifts.length : 0;
                  const isSelected = selectedDayKey === key;
                  const blockCls = hasShift && !isAbsent
                    ? 'bg-white/[0.12] border border-white/20'
                    : isAbsent
                      ? 'bg-red-500/[0.08] border border-red-500/[0.18]'
                      : 'border border-white/8 bg-white/4';
                  return (
                    <div
                      key={i}
                      className="flex flex-col items-center gap-1 cursor-pointer"
                      onClick={() => {
                        setSelectedDayKey((prev) => (prev === key ? null : key));
                      }}
                    >
                      <span className={`text-[11px] font-bold ${isToday_ ? 'text-white' : 'text-white/55'}`}>
                        {dayLetters[i]}
                      </span>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold ${
 isToday_ ? 'bg-white/20 text-white' : 'text-white/55'
 }`}>
                        {format(day, 'd')}
                      </div>
                      <div className={`w-full rounded-lg flex flex-col items-center justify-center py-1.5 px-0.5 min-h-[38px] transition-colors ${blockCls} ${
 isSelected ? 'ring-2 ring-white/40 ring-offset-1' : ''
 }`}>
                        {shiftCount > 0 && (
                          <span className="text-[13px] font-black text-white leading-none drop-shadow-sm">
                            {shiftCount}
                          </span>
                        )}
                        {isAbsent && <span className="text-[11px] font-bold text-red-500 opacity-80">—</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Stats + pulsante settimana */}
              <div className="border-t border-white/10 mx-3 pt-2.5 pb-3 flex items-center justify-around">
                {[
                  { label: t.shift_plural ?? 'Turni', value: confirmed.length.toString() },
                  { label: t.stat_hours_total_abbr ?? 'Ore tot', value: minsLabel(totalMins) },
                  { label: t.stat_rest_days ?? 'Riposi', value: restDays.toString() },
                ].map(({ label, value }, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <span className="text-sm font-bold text-white tabular-nums">{value}</span>
                    <span className="text-[11px] text-white/50 uppercase font-bold tracking-wider">{label}</span>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => toggleWeek(wIdx)}
                  className="flex items-center gap-1 px-2 h-7 rounded-lg border transition-colors text-[11px] font-black uppercase tracking-widest border-white/20 text-white/80"
                  style={{ background: 'rgba(15, 35, 90, 0.82)' }}
                >
                  <span>{isOpen ? (t.collapse ?? 'Comprimi') : (t.ts_period_week ?? 'Espandi')}</span>
                  <svg viewBox="0 0 16 16" fill="none" className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : 'rotate-0'}`} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3,6 8,11 13,6" />
                  </svg>
                </button>
              </div>
            </div>

              {/* Lista turni (ULTRA-CLEAN) */}
            {isOpen && (
              <div className="flex flex-col shift-gap-ultra mt-3 shift-mobile-ultra">
                {weekDays.map(day => {
                  const key = format(day, 'yyyy-MM-dd');
                  const dayShifts = byDay[key] ?? [];
                  if (!dayShifts.length) return null;
                  if (selectedDayKey && selectedDayKey !== key) return null;
                  const isToday_ = isToday(day);
                  return (
                    <div key={key}>
                      <p className="text-[11px] font-medium uppercase tracking-wider mb-3 flex items-center gap-2 text-white/80">
                        {format(day, 'EEEE d MMMM', { locale })}
                        {isToday_ && <span className="h-1.5 w-1.5 rounded-full bg-black" />}
                      </p>
                      {dayShifts.map(shift => {
                        const isAbsent = shift.approval_status === 'absent';
                        const isDraft = shift.approval_status === 'draft';
                        const statusCls = isDraft ? 'shift-status-draft' : 'shift-status-confirmed';
                        
                        return (
                          <div key={shift.id}
                            className="flex items-center justify-between py-3 shift-separator-ultra mb-3"
                          >
                            <div className="flex flex-col gap-1.5">
                              {isAbsent ? (
                                <p className="shift-status-off">OFF</p>
                              ) : (
                                <p className={`font-medium shift-time-clean shift-time-ultra leading-tight ${statusCls}`}>
                                  {shift.start_time.slice(0, 5)} – {shift.end_time?.slice(0, 5) ?? '…'}
                                </p>
                              )}
                              {shift.department && !isAbsent && (
                                <p className="text-[11px] font-medium uppercase tracking-wider text-white/55">
                                  {translateDepartmentValue(shift.department, language as never)}
                                </p>
                              )}
                            </div>
                            <StatusBadge shift={shift} t={t} />
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Team: cassetto espandibile per giorno ─────────────────────────────── */
function TeamShiftsSection({
  teamShifts, users, weekDays, locale, language, t,
}: {
  teamShifts: Shift[];
  users: User[];
  weekDays: Date[];
  locale: typeof it;
  language: string;
  t: Record<string, string>;
}) {
  // Always dark theme
  const cardBg = { background: 'transparent' };
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});

  const userMap = useMemo(() => {
    const m: Record<string, User> = {};
    users.forEach(u => { m[u.id] = u; });
    return m;
  }, [users]);

  const byDay = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    teamShifts.forEach(s => {
      const k = format(parseISO(s.date), 'yyyy-MM-dd');
      if (!map[k]) map[k] = [];
      map[k].push(s);
    });
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => {
        const ta = (a.start_time ?? '').slice(0, 5);
        const tb = (b.start_time ?? '').slice(0, 5);
        if (ta !== tb) return ta.localeCompare(tb);
        return (userMap[a.user_id]?.sort_order ?? 9999) - (userMap[b.user_id]?.sort_order ?? 9999);
      });
    });
    return map;
  }, [teamShifts, userMap]);

  const toggle = useCallback((key: string) => {
    setOpenDays(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const daysWithShifts = weekDays.filter(d => (byDay[format(d, 'yyyy-MM-dd')] ?? []).length > 0);

  if (daysWithShifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Users className="w-5 h-5 text-white/55 mb-2" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/55">
          Nessun turno team
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {daysWithShifts.map(day => {
        const key = format(day, 'yyyy-MM-dd');
        const dayShifts = byDay[key] ?? [];
        const isOpen = !!openDays[key];
        const isToday_ = isToday(day);
        const confirmed = dayShifts.filter(s => s.approval_status !== 'absent');

        return (
          <div key={key} className="rounded-xl border border-neutral-500 overflow-hidden shadow-sm" style={cardBg}>
            {/* Header cassetto */}
            <button
              type="button"
              onClick={() => toggle(key)}
              className="w-full flex items-center justify-between px-3 py-2.5 active:bg-white/12 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-[11px] font-black uppercase tracking-widest truncate ${
 isToday_ ? 'text-white' : 'text-white/55'
 }`}>
                  {format(day, 'EEE d MMM', { locale })}
                </span>
                {isToday_ && <span className="h-1.5 w-1.5 rounded-full bg-white/60 shrink-0" />}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-black tabular-nums text-white/55">
                  {confirmed.length} {t.shift_plural ?? 'turni'}
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-white/55 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  strokeWidth={2.5}
                />
              </div>
            </button>

            {/* Corpo cassetto (ULTRA-CLEAN) */}
            {isOpen && (
              <div className="border-t border-white/10 px-4 pb-4 pt-3 flex flex-col shift-gap-ultra">
                {dayShifts.map(shift => {
                  const isAbsent = shift.approval_status === 'absent';
                  const isDraft = shift.approval_status === 'draft';
                  const u = userMap[shift.user_id];
                  const fullName = u ? `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}` : '–';
                  const statusCls = isDraft ? 'shift-status-draft' : 'shift-status-confirmed';
                  
                  return (
                    <div key={shift.id} className="flex items-center justify-between py-3 shift-separator-ultra">
                      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                        <p className="shift-name-ultra uppercase tracking-wide truncate" title={fullName}>{fullName}
                        </p>
                        {isAbsent ? (
                          <p className="shift-status-off">OFF</p>
                        ) : (
                          <p className={`font-medium shift-time-clean shift-time-ultra leading-tight ${statusCls}`}>
                            {shift.start_time.slice(0, 5)} – {shift.end_time?.slice(0, 5) ?? '…'}
                          </p>
                        )}
                        {shift.department && !isAbsent && (
                          <p className="text-[11px] font-medium uppercase tracking-wider text-white/55">
                            {translateDepartmentValue(shift.department, language as never)}
                          </p>
                        )}
                      </div>
                      <StatusBadge shift={shift} t={t} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Componente principale ─────────────────────────────────────────────── */
export default function ManagementMobileShifts({ shifts, users, currentUserId, language }: Props) {
  const locale = getLocale(language);
  const t = getTranslations(language as 'it' | 'en' | 'es') as Record<string, string>;

  const [navMode, setNavMode] = useState<NavMode>('period');
  const [navOffset, setNavOffset] = useState(0);

  const getRange = useCallback((mode: NavMode, offset: number): { start: Date; end: Date } => {
    const today = new Date();
    if (mode === 'week') {
      const base = addWeeks(startOfWeek(today, { weekStartsOn: 1 }), offset);
      return { start: startOfDay(base), end: endOfDay(endOfWeek(base, { weekStartsOn: 1 })) };
    }
    let cfg: PeriodConfig = loadPeriodConfig();
    if (offset > 0) for (let i = 0; i < offset; i++) cfg = nextPeriodConfig(cfg);
    else if (offset < 0) for (let i = 0; i > offset; i--) cfg = prevPeriodConfig(cfg);
    const r = getPeriodDateRange(cfg);
    return { start: startOfDay(new Date(r.startDate)), end: endOfDay(new Date(r.endDate)) };
  }, []);

  const range = useMemo(() => getRange(navMode, navOffset), [getRange, navMode, navOffset]);

  const rangeLabel = navMode === 'week'
    ? `S.${getISOWeek(range.start)} · ${format(range.start, 'd MMM', { locale })} – ${format(range.end, 'd MMM', { locale })}`
    : `${format(range.start, 'd MMM', { locale })} – ${format(range.end, 'd MMM yy', { locale })}`;

  const weekDays = useMemo(() =>
    eachDayOfInterval({ start: range.start, end: range.end }),
    [range]
  );

  const filteredShifts = useMemo(
    () => shifts.filter(s => isWithinInterval(parseISO(s.date), { start: range.start, end: range.end })),
    [shifts, range]
  );

  const myShifts   = useMemo(() => filteredShifts.filter(s => s.user_id === currentUserId), [filteredShifts, currentUserId]);
  const teamShifts = useMemo(() => filteredShifts.filter(s => s.user_id !== currentUserId), [filteredShifts, currentUserId]);

  return (
    <div className="flex flex-col pb-content pt-1">

      {/* ── Barra navigazione periodo ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-5 px-4">
        {/* Toggle settimana / periodo */}
        <span
          className="h-9 inline-flex items-center px-3 rounded-2xl border border-white/30 text-white/70 text-[11px] font-black uppercase tracking-widest shrink-0 cursor-pointer select-none"
          onClick={() => { setNavMode(m => m === 'week' ? 'period' : 'week'); setNavOffset(0); }}
        >
          {navMode === 'week' ? (t.ts_period_week ?? 'Sett.') : (t.tab_period ?? 'Periodo')}
        </span>

        {/* Frecce + label */}
        <div
          className="flex items-center border border-white/40 rounded-2xl overflow-hidden flex-1"
          style={{ background: 'transparent' }}
        >
          <button
            type="button"
            onClick={() => setNavOffset(o => o - 1)}
            className="flex items-center justify-center h-9 w-9 text-white hover:bg-white/15 transition-colors shrink-0 border-r border-white/20 active:bg-white/80"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-1.5 px-2 min-w-0" style={{ color: '#ffffff' }}>
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="text-[11px] font-bold tabular-nums truncate" title={rangeLabel}>{rangeLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setNavOffset(o => o + 1)}
            className="flex items-center justify-center h-9 w-9 text-white hover:bg-white/15 transition-colors shrink-0 border-l border-white/20 active:bg-white/80"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Contenuto ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-8 px-4">

        {/* I miei turni */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-black uppercase tracking-widest text-white/55">
              {t.my_shifts_label ?? 'I miei turni'}
            </span>
            {myShifts.length > 0 && (
              <span className="text-[11px] font-black tabular-nums text-white/70">
                ({myShifts.length})
              </span>
            )}
          </div>
          <MyShiftsSection
            myShifts={myShifts}
            locale={locale}
            language={language}
            t={t}
          />
        </section>

        {/* Team */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-black uppercase tracking-widest text-white/55">
              Team
            </span>
            {teamShifts.length > 0 && (
              <span className="text-[11px] font-black tabular-nums text-white/70">
                ({teamShifts.length})
              </span>
            )}
          </div>
          <TeamShiftsSection
            teamShifts={teamShifts}
            users={users}
            weekDays={weekDays}
            locale={locale}
            language={language}
            t={t}
          />
        </section>

      </div>
    </div>
  );
}
