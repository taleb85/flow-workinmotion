import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from 'react';

import {
  format, startOfWeek, endOfWeek, isSameWeek,
  eachDayOfInterval, isToday, parseISO,
  addWeeks, startOfDay, endOfDay, isWithinInterval, getISOWeek,
  startOfMonth, endOfMonth,
} from 'date-fns';
import { it, es, enUS } from 'date-fns/locale';
import { Clock, ChevronLeft, ChevronRight, ChevronDown, Users } from 'lucide-react';
import type { Shift, PunchRecord, User, Language } from '../../types';
import { translateDepartmentValue } from '../../utils/departmentLabels';
import { getTranslations } from '../../utils/translations';
import {
  loadPeriodConfig, getPeriodDateRange,
  prevPeriodConfig, nextPeriodConfig, type PeriodConfig,
} from '../../utils/periodConfig';
import MobileStatsCards from './MobileStatsCards';

const Statistics = lazy(() => import('../Statistics'));

interface Props {
  shifts: Shift[];
  punchRecords: PunchRecord[];
  users: User[];
  currentUserId: string;
  language: string;
  plannedOnly?: boolean;
  /**
   * `embedded`: sotto StaffPersonalDashboard il toggle PRESENZE|STATISTICHE è nel padre;
   * qui solo griglia + periodo (niente doppia tab né secondo blocco KPI).
   * `standalone`: vista gestione da App (tab Timesheet) con sottovista completa.
   */
  variant?: 'standalone' | 'embedded';
  /** `embedded` sotto StaffPersonalDashboard: nasconde la navbar interna (la navigazione è nel parent). */
  hideNavBar?: boolean;
  /** `embedded`: espande sempre la settimana (niente accordion collassato). */
  forceExpanded?: boolean;
}

type NavMode = 'week' | 'period';

function getLocale(lang: string) {
  if (lang === 'es') return es;
  if (lang === 'en') return enUS;
  return it;
}

function getDayLetters(locale: typeof it): string[] {
  const base = new Date(2024, 0, 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return format(d, 'EEEEE', { locale }).toUpperCase();
  });
}

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

function punchLabel(pr: PunchRecord): string {
  const t = pr.calculated_time ?? pr.timestamp;
  try { return format(parseISO(t), 'HH:mm'); } catch { return '–'; }
}

function ShiftStatusBadge({ shift, t }: { shift: Shift; t: Record<string, string> }) {
  const isAbsent = shift.approval_status === 'absent';
  const isDraft  = shift.approval_status === 'draft';
  const isApproved = shift.approval_status === 'approved';
  const cls = isAbsent
    ? 'text-red-400 border-red-500/30 bg-red-500/15'
    : isDraft
      ? 'text-amber-300 border-amber-500/30 bg-amber-500/15'
      : isApproved
        ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/15'
        : 'text-cyan-300 border-cyan-500/30 bg-cyan-500/15';
  const label = isAbsent
    ? (t.status_absent ?? 'Assente')
    : isDraft
      ? (t.status_draft ?? 'Bozza')
      : isApproved
        ? (t.ts_status_approved ?? 'Approvato')
        : (t.shifts_confirmed ?? 'Pubblicato');
  return (
    <span className={`text-[11px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

/** Pallino colore per stato del turno (griglia settimana mobile). */
function statusDotColor(status: string | undefined): string {
  switch (status) {
    case 'approved': return 'bg-emerald-400';
    case 'confirmed': return 'bg-cyan-400';
    case 'draft': return 'bg-amber-400';
    case 'absent': return 'bg-red-400';
    default: return 'bg-white/40';
  }
}

/* ── Sezione personale ─────────────────────────────────────────────────── */
function MyTimesheetSection({
  myShifts, myPunches, locale, dayLetters, language, t, plannedOnly, forceExpanded = false,
}: {
  myShifts: Shift[];
  myPunches: PunchRecord[];
  locale: typeof it;
  dayLetters: string[];
  language: string;
  t: Record<string, string>;
  plannedOnly?: boolean;
  forceExpanded?: boolean;
}) {
  const cardBg = { background: 'transparent' };
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  // Track which non-current weeks the user manually expanded
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(new Set());
  const weeks = useMemo(() => groupByWeeks(myShifts), [myShifts]);

  const currentWeekIdx = useMemo(
    () => weeks.findIndex(w => isSameWeek(new Date(), w.start, { weekStartsOn: 1 })),
    [weeks],
  );

  function toggleWeek(wIdx: number) {
    setExpandedWeeks(prev => {
      const next = new Set(prev);
      if (next.has(wIdx)) next.delete(wIdx); else next.add(wIdx);
      return next;
    });
    setSelectedDayKey(null);
  }

  const punchByDay = useMemo(() => {
    const m: Record<string, PunchRecord[]> = {};
    myPunches.forEach(p => {
      const k = format(parseISO(p.calculated_time ?? p.timestamp), 'yyyy-MM-dd');
      if (!m[k]) m[k] = [];
      m[k].push(p);
    });
    return m;
  }, [myPunches]);

  if (myShifts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Clock className="w-6 h-6 text-white/55 mb-2" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/55">{t.no_attendance_records}</p>
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

        const confirmed = week.shifts.filter(s => s.approval_status !== 'absent');
        const totalMins = confirmed.reduce((acc, s) => acc + shiftMins(s), 0);
        const restDays = weekDays.filter(d =>
          !(byDay[format(d, 'yyyy-MM-dd')] ?? []).some(s => s.approval_status !== 'absent')
        ).length;
        const isCurrentWeek = wIdx === currentWeekIdx;
        // Current week expanded by default; others collapsed by default (forceExpanded: sempre aperte)
        const isOpen = forceExpanded || (isCurrentWeek ? !expandedWeeks.has(wIdx) : expandedWeeks.has(wIdx));
        const isDayInThisWeek = selectedDayKey !== null && weekDays.some(d => format(d, 'yyyy-MM-dd') === selectedDayKey);

        // Compact single-row for non-current collapsed weeks
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
              <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4 text-white/35 shrink-0" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
              {/* Griglia giorni — stile identico alla scheda turni */}
              <div className="grid grid-cols-7 gap-1 px-2 pt-3 pb-2">
                {weekDays.map((day, i) => {
                  const key = format(day, 'yyyy-MM-dd');
                  const dayShifts = byDay[key] ?? [];
                  const hasShift = dayShifts.length > 0;
                  const isAbsent = hasShift && dayShifts.some(s => s.approval_status === 'absent');
                  const shiftCount = hasShift && !isAbsent ? dayShifts.filter(s => s.approval_status !== 'absent').length : 0;
                  const isToday_ = isToday(day);
                  const isSelected = selectedDayKey === key;
                  const blockCls = hasShift && !isAbsent
                    ? 'bg-white/[0.12] border border-white/20'
                    : isAbsent
                      ? 'bg-red-500/[0.08] border border-red-500/[0.18]'
                      : 'border border-neutral-500 bg-white/4';
                  return (
                    <div
                      key={i}
                      className={`flex flex-col items-center gap-1 ${plannedOnly ? 'cursor-default' : 'cursor-pointer'}`}
                      onClick={plannedOnly ? undefined : () => {
                        setSelectedDayKey(prev => prev === key ? null : key);
                        // If non-current week, clicking a day expands it
                        if (!isCurrentWeek) {
                          setExpandedWeeks(prev => {
                            const next = new Set(prev);
                            next.add(wIdx);
                            return next;
                          });
                        }
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
 isSelected && !plannedOnly ? 'ring-2 ring-white/40 ring-offset-1' : ''
 }`}>
                        {shiftCount > 0 && (
                          <span className="text-[13px] font-black text-white leading-none drop-shadow-sm">
                            {shiftCount}
                          </span>
                        )}
                        {shiftCount > 0 && (
                          <span className="flex gap-0.5 mt-1">
                            {dayShifts.filter(s => s.approval_status !== 'absent').slice(0, 4).map(s => (
                              <span key={s.id} className={`w-1.5 h-1.5 rounded-full ${statusDotColor(s.approval_status)}`} />
                            ))}
                          </span>
                        )}
                        {isAbsent && <span className="text-[11px] font-bold text-red-500 opacity-80">—</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer stats — identico alla scheda turni */}
              <div className="border-t border-white/10 mx-3 pt-2.5 pb-3 flex items-center justify-around">
                {[
                  { label: t.shift_plural ?? 'Turni', value: confirmed.length.toString() },
                  { label: t.stat_hours_total_abbr ?? 'Ore tot', value: minsLabel(totalMins) },
                  { label: t.rest_days_label ?? 'Riposi', value: restDays.toString() },
                ].map(({ label, value }, i) => (
                  <div key={i} className="flex flex-col items-center gap-0.5">
                    <span className="text-sm font-bold text-white tabular-nums">{value}</span>
                    <span className="text-[11px] text-white/50 uppercase font-bold tracking-wider">{label}</span>
                  </div>
                ))}
                {!plannedOnly && (
                <button
                  type="button"
                  onClick={() => {
                    if (isDayInThisWeek) { setSelectedDayKey(null); }
                    else { toggleWeek(wIdx); }
                  }}
                  aria-label={isOpen ? 'Comprimi' : 'Espandi'}
                  className="flex items-center gap-1 px-2 h-7 rounded-lg border transition-colors text-[11px] font-black uppercase tracking-widest border-white/20 text-white/80"
                  style={{ background: 'rgba(255, 255, 255, 0.06)' }}
                >
                  <span>{isDayInThisWeek ? (t.all ?? 'Tutti') : isOpen ? (t.collapse ?? 'Comprimi') : (t.ts_period_week ?? 'Espandi')}</span>
                  <svg viewBox="0 0 16 16" fill="none" className={`w-3 h-3 transition-transform duration-200 ${isOpen && !isDayInThisWeek ? 'rotate-180' : 'rotate-0'}`} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3,6 8,11 13,6" />
                  </svg>
                </button>
                )}
              </div>
            </div>

            {/* Lista dettaglio */}
            {(isOpen || plannedOnly) && (
              <div className="flex flex-col gap-1.5 mt-2.5">
                {weekDays.map(day => {
                  const key = format(day, 'yyyy-MM-dd');
                  const dayShifts = byDay[key] ?? [];
                  if (!dayShifts.length) return null;
                  if (!plannedOnly && selectedDayKey && selectedDayKey !== key) return null;
                  const dayPunches = plannedOnly ? [] : (punchByDay[key] ?? []);
                  const pIn  = plannedOnly ? null : dayPunches.find(p => p.type === 'in');
                  const pOut = plannedOnly ? null : dayPunches.find(p => p.type === 'out');
                  const isToday_ = isToday(day);
                  return (
                    <div key={key}>
                      <p className="text-[11px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-2 text-white/70">
                        {format(day, 'EEEE d MMMM', { locale })}
                        {isToday_ && <span className="h-1 w-1 rounded-full bg-white/60" />}
                      </p>
                      {dayShifts.map(shift => {
                        const isAbsent = shift.approval_status === 'absent';
                        return (
                          <div key={shift.id}
                            className={`flex items-center justify-between rounded-xl px-3 py-2.5 mb-1 border shadow-sm ${
 isAbsent
 ? 'border-red-500/30 bg-red-500/15'
 : 'border-neutral-500'
 }`}
                            style={isAbsent ? undefined : cardBg}
                          >
                            <div className="flex flex-col gap-0.5">
                              <p className={`font-bold tabular-nums text-base leading-none ${isAbsent ? 'text-white/40 line-through' : 'text-white'}`}>
                                {shift.start_time.slice(0, 5)} – {shift.end_time?.slice(0, 5) ?? '…'}
                              </p>
                              {/* Timbratura — nascosta in modalità plannedOnly */}
                              {!plannedOnly && !isAbsent && (pIn || pOut) && (
                                <p className="text-[11px] tabular-nums text-white/55 mt-0.5 flex items-center gap-1">
                                  <Clock className="w-2.5 h-2.5 shrink-0" />
                                  {pIn ? punchLabel(pIn) : '–'} → {pOut ? punchLabel(pOut) : '–'}
                                </p>
                              )}
                              {shift.department && (
                                <p className="text-[11px] font-bold uppercase tracking-widest text-white/55 mt-0.5">
                                  {translateDepartmentValue(shift.department, language as Language)}
                                </p>
                              )}
                            </div>
                            <ShiftStatusBadge shift={shift} t={t} />
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

/* ── Sezione team — accordion identico alla scheda turni ───────────────── */
function TeamTimesheetSection({
  teamShifts, allPunches, users, locale, language, t, plannedOnly,
}: {
  teamShifts: Shift[];
  allPunches: PunchRecord[];
  users: User[];
  locale: typeof it;
  language: string;
  t: Record<string, string>;
  plannedOnly?: boolean;
}) {
  // Always dark theme
  const cardBg = { background: 'transparent' };
  const [openDays, setOpenDays] = useState<Record<string, boolean>>({});

  const userMap = useMemo(() => {
    const m: Record<string, User> = {};
    users.forEach(u => { m[u.id] = u; });
    return m;
  }, [users]);

  const punchByUserDay = useMemo(() => {
    const m: Record<string, PunchRecord[]> = {};
    allPunches.forEach(p => {
      const k = `${p.user_id}_${format(parseISO(p.calculated_time ?? p.timestamp), 'yyyy-MM-dd')}`;
      if (!m[k]) m[k] = [];
      m[k].push(p);
    });
    return m;
  }, [allPunches]);

  // Raggruppa tutti i turni team per giorno, ordinati per data
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

  const sortedDays = useMemo(() =>
    Object.keys(byDay).sort((a, b) => a.localeCompare(b)).map(k => parseISO(k)),
    [byDay]
  );

  const toggle = useCallback((key: string) => {
    setOpenDays(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  if (sortedDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Users className="w-6 h-6 text-white/55 mb-2" />
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/55">{t.no_team_attendance}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {sortedDays.map(day => {
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
              className="w-full flex items-center justify-between px-3 py-2.5 active:bg-white/8 transition-colors"
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

            {/* Corpo cassetto */}
            {isOpen && (
              <div className="border-t border-white/10 px-3 pb-2 pt-1.5 flex flex-col gap-1">
                {dayShifts.map(shift => {
                  const isAbsent = shift.approval_status === 'absent';
                  const u = userMap[shift.user_id];
                  const fullName = u ? `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}` : '–';
                  const dayPunches = plannedOnly ? [] : (punchByUserDay[`${shift.user_id}_${key}`] ?? []);
                  const pIn  = plannedOnly ? null : dayPunches.find(p => p.type === 'in');
                  const pOut = plannedOnly ? null : dayPunches.find(p => p.type === 'out');
                  return (
                    <div key={shift.id}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-2 border ${
 isAbsent
 ? 'border-red-500/30 bg-red-500/15'
 : 'border-neutral-500'
 }`}
                      style={isAbsent ? undefined : cardBg}
                    >
                      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                        <p className="text-[11px] font-black uppercase tracking-wide text-white/85 truncate" title={fullName}>{fullName}
                        </p>
                        <p className={`font-black tabular-nums text-sm leading-none ${
 isAbsent ? 'text-white/40 line-through' : 'text-white'
 }`}>
                          {shift.start_time.slice(0, 5)} – {shift.end_time?.slice(0, 5) ?? '…'}
                        </p>
                        {!plannedOnly && !isAbsent && (pIn || pOut) && (
                          <p className="text-[11px] tabular-nums text-white/55 mt-0.5 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5 shrink-0" />
                            {pIn ? punchLabel(pIn) : '–'} → {pOut ? punchLabel(pOut) : '–'}
                          </p>
                        )}
                        {shift.department && (
                          <p className="text-[11px] font-bold uppercase tracking-widest text-white/55 mt-0.5">
                            {translateDepartmentValue(shift.department, language as Language)}
                          </p>
                        )}
                      </div>
                      <ShiftStatusBadge shift={shift} t={t} />
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
export default function ManagementMobileTimesheet({
  shifts,
  punchRecords,
  users,
  currentUserId,
  language,
  plannedOnly,
  variant = 'standalone',
  hideNavBar = false,
  forceExpanded = false,
}: Props) {
  const locale = getLocale(language);
  const t = getTranslations(language as 'it' | 'en' | 'es') as Record<string, string>;
  const dayLetters = getDayLetters(locale);

  const [navMode, _setNavMode] = useState<NavMode>('period');
  const [navOffset, setNavOffset] = useState(() => {
    const saved = sessionStorage.getItem('osteria_staff_nav_offset');
    return saved ? Number(saved) : 0;
  });

  // Persiste l'offset in sessionStorage per sincronizzazione con Statistics
  useEffect(() => {
    if (hideNavBar) return;
    sessionStorage.setItem('osteria_staff_nav_offset', String(navOffset));
  }, [navOffset, hideNavBar]);

  // Invia evento per sincronizzare in tempo reale con Statistics
  useEffect(() => {
    if (hideNavBar) return;
    window.dispatchEvent(new CustomEvent('osteria-staff-nav-offset', { detail: navOffset }));
  }, [navOffset, hideNavBar]);

  // Ascolta cambiamenti di periodo da Statistics
  useEffect(() => {
    if (hideNavBar) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === 'number') {
        setNavOffset(detail);
        sessionStorage.setItem('osteria_staff_nav_offset', String(detail));
      }
    };
    window.addEventListener('osteria-staff-nav-offset', handler);
    return () => window.removeEventListener('osteria-staff-nav-offset', handler);
  }, [hideNavBar]);
  const [tsView, setTsView] = useState<'presence' | 'stats'>('presence');
  const embedded = variant === 'embedded';

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

  const filteredShifts = useMemo(
    () => shifts.filter(s => isWithinInterval(parseISO(s.date), { start: range.start, end: range.end })),
    [shifts, range]
  );
  const filteredPunches = useMemo(
    () => punchRecords.filter(p => {
      try {
        return isWithinInterval(parseISO(p.calculated_time ?? p.timestamp), { start: range.start, end: range.end });
      } catch { return false; }
    }),
    [punchRecords, range]
  );

  const myShifts   = useMemo(() => filteredShifts.filter(s => s.user_id === currentUserId), [filteredShifts, currentUserId]);
  const myPunches  = useMemo(() => filteredPunches.filter(p => p.user_id === currentUserId), [filteredPunches, currentUserId]);
  const teamShifts = useMemo(() => filteredShifts.filter(s => s.user_id !== currentUserId), [filteredShifts, currentUserId]);
  const teamPunches = useMemo(() => filteredPunches.filter(p => p.user_id !== currentUserId), [filteredPunches, currentUserId]);

  // ── Statistiche personali (per MobileStatsCards) ──────────────────────────
  const statsData = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);
    const monthEnd   = endOfMonth(now);
    const worked = new Set(['approved', 'confirmed']);
    let weekMins = 0, monthMins = 0;
    const monthDays = new Set<string>();
    for (const s of shifts.filter(s => s.user_id === currentUserId)) {
      if (!worked.has(s.approval_status ?? '')) continue;
      const d = parseISO(s.date);
      const sm = s.start_time ? parseInt(s.start_time.split(':')[0]) * 60 + parseInt(s.start_time.split(':')[1]) : 0;
      const em = s.end_time   ? parseInt(s.end_time.split(':')[0])   * 60 + parseInt(s.end_time.split(':')[1])   : 0;
      const mins = Math.max(0, em - sm);
      if (isWithinInterval(d, { start: weekStart,  end: weekEnd  })) weekMins  += mins;
      if (isWithinInterval(d, { start: monthStart, end: monthEnd })) { monthMins += mins; monthDays.add(s.date); }
    }
    return { weekMins, monthMins, monthDaysWorked: monthDays.size };
  }, [shifts, currentUserId]);

  const showPresenceBody = embedded || tsView === 'presence';

  return (
    <div className="flex flex-col pb-content pt-1">

      {!embedded && (
        <>
          <div className="flex items-center gap-1.5 mb-4 px-4">
            {(['presence', 'stats'] as const).map((v) => {
              const label = v === 'presence' ? (t.tab_attendance ?? 'Presenze') : (t.tab_statistics ?? 'Statistiche');
              const active = tsView === v;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTsView(v)}
                  className={`h-8 px-4 rounded-full text-[11px] font-extrabold uppercase tracking-wider transition-colors ${
 active
 ? 'bg-white/15 text-white shadow-sm'
 : 'bg-white/8 border border-white/20 text-white/60 hover:border-white/35 hover:text-white/90'
 } active:text-white/90`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {tsView === 'stats' && (
            <div className="min-h-0 overflow-y-auto pb-1">
              <Suspense fallback={null}>
                <Statistics />
              </Suspense>
            </div>
          )}
        </>
      )}

      {showPresenceBody && (
        <>
          {!embedded && (
            <div className="px-4 mb-4">
              <MobileStatsCards
                weekWorkedMins={statsData.weekMins}
                weekCapMins={40 * 60}
                monthWorkedMins={statsData.monthMins}
                monthDaysWorked={statsData.monthDaysWorked}
                labels={{
                  title: t.tab_statistics ?? 'Statistiche',
                  week: t.ts_period_week ?? 'Settimana',
                  month: t.ts_period_month ?? 'Mese',
                  daysWorked: (t as Record<string, string>).mobile_dash_days_worked ?? 'Giorni lavorati',
                }}
              />
            </div>
          )}

      {/* Barra navigazione periodo (nascosta in modalità embedded controllata) */}
      {!hideNavBar && (
      <div className="flex items-center gap-1.5 md:gap-2 mb-5 px-4">
        <button type="button" onClick={() => setNavOffset(0)}
          className="h-8 md:h-9 inline-flex items-center px-2 md:px-3 rounded-2xl border border-white/30 text-white/70 text-[10px] md:text-[11px] font-black uppercase tracking-widest shrink-0 active:bg-white/10 transition-colors">
          {t.today}
        </button>
        <div className="flex items-center border border-white/40 rounded-2xl overflow-hidden flex-1 min-w-0" style={{ background: 'transparent' }}>
          <button type="button" onClick={() => setNavOffset(o => o - 1)}
            className="flex items-center justify-center h-8 md:h-9 w-8 md:w-9 text-white hover:bg-white/15 transition-colors shrink-0 border-r border-white/20 active:bg-white/80">
            <ChevronLeft className="h-3.5 md:h-4 w-3.5 md:w-4" />
          </button>
          <div className="flex-1 flex items-center justify-center gap-1 px-1.5 md:px-2 min-w-0" style={{ color: '#ffffff' }}>
            <Clock className="h-2.5 md:h-3 w-2.5 md:w-3 shrink-0" />
            <span className="text-[10px] md:text-[11px] font-bold tabular-nums truncate" title={rangeLabel}>{rangeLabel}</span>
          </div>
          <button type="button" onClick={() => setNavOffset(o => o + 1)}
            className="flex items-center justify-center h-8 md:h-9 w-8 md:w-9 text-white hover:bg-white/15 transition-colors shrink-0 border-l border-white/20 active:bg-white/80">
            <ChevronRight className="h-3.5 md:h-4 w-3.5 md:w-4" />
          </button>
        </div>
      </div>
      )}

      <div className="flex flex-col gap-8 px-4">

        {/* I miei turni */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-black uppercase tracking-widest text-white/55">{t.my_attendance_label ?? 'Le mie presenze'}</span>
            {myShifts.length > 0 && <span className="text-[11px] font-black tabular-nums text-white/70">({myShifts.length})</span>}
          </div>
          <MyTimesheetSection myShifts={myShifts} myPunches={myPunches} locale={locale} dayLetters={dayLetters} language={language} t={t} plannedOnly={plannedOnly} forceExpanded={forceExpanded} />
        </section>

        {/* Team — solo in vista gestione standalone, non nella Presenze personale */}
        {!embedded && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-black uppercase tracking-widest text-white/55">Team</span>
            {teamShifts.length > 0 && <span className="text-[11px] font-black tabular-nums text-white/70">({teamShifts.length})</span>}
          </div>
          <TeamTimesheetSection teamShifts={teamShifts} allPunches={teamPunches} users={users} locale={locale} language={language} t={t} plannedOnly={plannedOnly} />
        </section>
        )}

      </div>
        </>
      )}
    </div>
  );
}
