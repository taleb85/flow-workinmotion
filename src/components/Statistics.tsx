import { useState, useMemo, useEffect } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  subMonths,
  format,
  isWithinInterval,
  eachWeekOfInterval,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  isSameDay,
} from 'date-fns';
import { it } from 'date-fns/locale';
import { useApp } from '../context/AppContext';
import { getTranslations, getDateLocale, formatTrans } from '../utils/translations';
import { getPayrollPaymentDateForCalendarMonth } from '../utils/payrollSchedule';
import { loadPeriodConfig, getPeriodDateRange } from '../utils/periodConfig';
import { formatMinutesToHoursAndMinutes } from '../utils/timeCalculations';
import { getNetShiftMinutes } from '../utils/breakRules';
import { getResolvedStartEndForHours } from '../utils/shiftResolvedClockTimes';
import {
  isManagementRole,
  isPurelyManagementRole,
  isUserVisibleOnTeamSchedule,
  canViewAllTeamHours,
} from '../utils/permissions';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';
import { isFeatureEnabled } from '../utils/enabledFeatures';
import { motion } from 'framer-motion';
import { Calendar } from 'lucide-react';
import DatePickerField from './DatePickerField';
import { CenteredModalPortal } from './ui/CenteredModalPortal';

function toDateOnly(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function formatStatsChipDate(iso: string, locale: typeof it): string {
  const d = parseISO(iso.slice(0, 10));
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yy', { locale });
}

type WeekKey = string; // "2026-W10"
type Preset = 'period' | 'current_week' | 'current_month' | 'prev_month' | 'custom';

function getInitialPeriodRange(): { start: string; end: string } {
  const { startDate, endDate } = getPeriodDateRange(loadPeriodConfig());
  return { start: startDate, end: endDate };
}

export default function Statistics() {
  const { users, shifts, currentUser, effectiveLanguage, breakRules, featureFlags, punchRecords } = useApp();
  const t = getTranslations(effectiveLanguage);
  const breakComputeOpts = useMemo(
    () => ({ autoBreaksFeatureEnabled: featureFlags['auto_breaks'] !== false }),
    [featureFlags]
  );
  /** Vista gestione team: ruolo gestionale, `view_stats` e (admin o `can_view_total_hours`). */
  const isManagementRoleUser = currentUser ? isManagementRole(currentUser.role) : false;
  const showManagementStatsChrome =
    currentUser &&
    isManagementRoleUser &&
    isFeatureEnabled(currentUser, 'view_stats') &&
    canViewAllTeamHours(currentUser);

  const initialPeriod = getInitialPeriodRange();
  const [preset, setPreset]     = useState<Preset>('period');
  const [dateStart, setDateStart] = useState<string>(initialPeriod.start);
  const [dateEnd, setDateEnd]     = useState<string>(initialPeriod.end);
  /** Staff: date manuali → non sovrascrivere su `osteria_period_updated` finché non si riallinea. */
  const [staffRangeCustom, setStaffRangeCustom] = useState(false);
  const [mgmtRangeModalOpen, setMgmtRangeModalOpen] = useState(false);

  // Sync date range when preset changes
  useEffect(() => {
    const n = new Date();
    if (preset === 'period') {
      const { startDate, endDate } = getPeriodDateRange(loadPeriodConfig());
      setDateStart(startDate);
      setDateEnd(endDate);
    } else if (preset === 'current_month') {
      setDateStart(toDateOnly(startOfMonth(n)));
      setDateEnd(toDateOnly(endOfMonth(n)));
    } else if (preset === 'prev_month') {
      const prev = subMonths(n, 1);
      setDateStart(toDateOnly(startOfMonth(prev)));
      setDateEnd(toDateOnly(endOfMonth(prev)));
    } else if (preset === 'current_week') {
      setDateStart(toDateOnly(startOfWeek(n, { weekStartsOn: 1 })));
      setDateEnd(toDateOnly(endOfWeek(n, { weekStartsOn: 1 })));
    }
  }, [preset]);

  // Aggiorna range quando il periodo viene salvato in Presenze (gestione: solo preset «periodo»; staff: sempre salvo date custom)
  useEffect(() => {
    const handler = () => {
      const { startDate, endDate } = getPeriodDateRange(loadPeriodConfig());
      if (!showManagementStatsChrome) {
        if (staffRangeCustom) return;
        setDateStart(startDate);
        setDateEnd(endDate);
        return;
      }
      if (preset === 'period') {
        setDateStart(startDate);
        setDateEnd(endDate);
      }
    };
    window.addEventListener('osteria_period_updated', handler);
    return () => window.removeEventListener('osteria_period_updated', handler);
  }, [preset, showManagementStatsChrome, staffRangeCustom]);

  const rangeStart = useMemo(() => {
    const s = new Date(dateStart);
    const e = new Date(dateEnd);
    return startOfDay(s <= e ? s : e);
  }, [dateStart, dateEnd]);
  const rangeEnd = useMemo(() => {
    const s = new Date(dateStart);
    const e = new Date(dateEnd);
    return endOfDay(s <= e ? e : s);
  }, [dateStart, dateEnd]);

  /** Mese civile intero selezionato → data pagamento stipendi (lun dopo ultima dom. sett. completa nel mese). */
  const payrollForCalendarMonth = useMemo(() => {
    try {
      const s = parseISO(dateStart);
      const e = parseISO(dateEnd);
      if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
      if (!isSameDay(s, startOfMonth(s)) || !isSameDay(e, endOfMonth(s))) return null;
      return { payDate: getPayrollPaymentDateForCalendarMonth(s) };
    } catch {
      return null;
    }
  }, [dateStart, dateEnd]);

  /** Settimane incluse nell'intervallo (chiave: "YYYY-Www") */
  const weeksInRange = useMemo(() => {
    const weeks = eachWeekOfInterval(
      { start: rangeStart, end: rangeEnd },
      { weekStartsOn: 1 }
    );
    return weeks.map((d) => {
      const w = getISOWeek(d);
      const y = getISOWeekYear(d);
      const weekStart = startOfWeek(d, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(d, { weekStartsOn: 1 });
      const label = `${format(weekStart, 'dd/MM')} - ${format(weekEnd, 'dd/MM')}`;
      return { key: `${y}-W${String(w).padStart(2, '0')}` as WeekKey, start: weekStart, end: weekEnd, label };
    });
  }, [rangeStart, rangeEnd]);

  /** Minuti confermati per utente per settimana (solo turni confirmed) */
  const minutesByUserByWeek = useMemo(() => {
    const byUser: Record<string, Record<WeekKey, number>> = {};
    const rangeShifts = shifts.filter(
      (s) =>
        (s.approval_status === 'confirmed' || s.approval_status === 'approved') &&
        isWithinInterval(new Date(s.date), { start: rangeStart, end: rangeEnd })
    );
    for (const s of rangeShifts) {
      const { start, end } = getResolvedStartEndForHours(s, punchRecords);
      if (!start || !end || start === end) continue;
      const u = users.find((x) => x.id === s.user_id);
      const mins = getNetShiftMinutes(s, start, end, u ?? undefined, breakRules, breakComputeOpts);
      const d = new Date(s.date);
      const w = getISOWeek(d);
      const y = getISOWeekYear(d);
      const weekKey = `${y}-W${String(w).padStart(2, '0')}` as WeekKey;
      if (!byUser[s.user_id]) byUser[s.user_id] = {} as Record<WeekKey, number>;
      byUser[s.user_id][weekKey] = (byUser[s.user_id][weekKey] ?? 0) + mins;
    }
    return byUser;
  }, [shifts, punchRecords, rangeStart, rangeEnd, users, breakRules, breakComputeOpts]);

  const displayUsers = useMemo(() => {
    if (!currentUser) return [];
    return users
      .filter((u) => {
        if (u.status !== 'active' || isPurelyManagementRole(u.role)) return false;
        if (!showManagementStatsChrome) return u.id === currentUser.id;
        if (u.id === currentUser.id) return true;
        return isUserVisibleOnTeamSchedule(u);
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [users, currentUser, showManagementStatsChrome]);

  const totalMinutesAll = useMemo(() => {
    return displayUsers.reduce((sum, u) => {
      const byWeek = minutesByUserByWeek[u.id] ?? {};
      return sum + Object.values(byWeek).reduce((a, b) => a + b, 0);
    }, 0);
  }, [displayUsers, minutesByUserByWeek]);

  const hasDataInRange = totalMinutesAll > 0;

  // ── Preset labels ────────────────────────────────────────────────────────
  const PRESETS: { key: Preset; label: string }[] = [
    { key: 'period',       label: (t as { stats_preset_period?: string }).stats_preset_period ?? 'Periodo Presenze' },
    { key: 'current_week',  label: t.stats_preset_current_week },
    { key: 'current_month', label: t.stats_preset_current_month },
    { key: 'prev_month',    label: t.stats_preset_prev_month },
    { key: 'custom',        label: t.stats_preset_custom },
  ];

  if (!currentUser) return null;
  const uiW = (key: string) => isUiWidgetVisible(currentUser, key);
  const statsLoc = getDateLocale(effectiveLanguage) ?? it;
  const tv = t as Record<string, string>;
  const staffSelfId = displayUsers[0]?.id ?? currentUser.id;
  const staffRangeTotalMins = Object.values(minutesByUserByWeek[staffSelfId] ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div className="pb-content pt-6 w-full max-w-full font-sans min-h-full">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {showManagementStatsChrome && uiW('stats.title') && (
          <div className="mb-5 px-1 sm:px-0">
            <h1 className="text-slate-900 font-bold text-xl sm:text-2xl tracking-tight">{t.stats_title}</h1>
          </div>
        )}

        {/* ── Filtro Temporale (gestione + view_stats) ───────────────── */}
        {showManagementStatsChrome && uiW('stats.mgmt_filters') && (
          <>
            <div className="ui-toolbar-page-band">
              <div className="ui-toolbar-page-band-inner">
                <div className="ui-toolbar-row-tight min-w-0 flex-wrap items-center gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setPreset(p.key);
                        if (p.key === 'custom') setMgmtRangeModalOpen(true);
                      }}
                      className={`ui-toolbar-pill transition-all ${
                        preset === p.key
                          ? 'border-accent bg-accent text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {p.key === 'custom' && <Calendar className="h-3 w-3 shrink-0" aria-hidden />}
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setMgmtRangeModalOpen(true)}
                    className="ui-toolbar-chip max-w-full border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    aria-label={t.stats_date_range}
                    title={t.stats_date_range}
                  >
                    <Calendar className="h-3 w-3 shrink-0 text-slate-500" aria-hidden />
                    <span className="min-w-0 truncate tabular-nums text-[12px] font-semibold sm:text-[13px]">
                      {formatStatsChipDate(dateStart, statsLoc)} → {formatStatsChipDate(dateEnd, statsLoc)}
                    </span>
                  </button>
                </div>
              </div>
            </div>
            {mgmtRangeModalOpen && (
              <CenteredModalPortal
                open
                onClose={() => setMgmtRangeModalOpen(false)}
                backdropAriaLabel={tv.close ?? 'Chiudi'}
                ariaLabel={t.stats_date_range}
                maxWidthClass="max-w-md"
                panelClassName="p-4 sm:p-5"
              >
                <h3 className="mb-4 border-b border-slate-100 pb-3 text-base font-bold text-slate-900">{t.stats_date_range}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <DatePickerField
                    value={dateStart}
                    max={dateEnd}
                    allowClear={false}
                    onChange={(v) => {
                      setDateStart(v);
                      setPreset('custom');
                    }}
                    aria-label={tv.stats_aria_date_start ?? t.stats_date_range}
                  />
                  <span className="inline-flex h-[22px] shrink-0 items-center text-[13px] font-medium leading-none text-slate-400" aria-hidden>
                    →
                  </span>
                  <DatePickerField
                    value={dateEnd}
                    min={dateStart}
                    allowClear={false}
                    onChange={(v) => {
                      setDateEnd(v);
                      setPreset('custom');
                    }}
                    aria-label={tv.stats_aria_date_end ?? t.stats_date_range}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setMgmtRangeModalOpen(false)}
                  className="mt-5 w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-accent-hover"
                >
                  {tv.close ?? 'Chiudi'}
                </button>
              </CenteredModalPortal>
            )}
          </>
        )}

        {/* ── Sezione ore (staff o gestionale senza view_stats) ──────── */}
        {!showManagementStatsChrome && uiW('stats.table') && (
          <div className="mb-5 flex w-full min-w-0 flex-nowrap items-center justify-start gap-1.5 overflow-x-auto pb-0.5 smooth-touch [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="sr-only">{t.stats_date_range}</span>
            <DatePickerField
              compact
              value={dateStart}
              max={dateEnd}
              allowClear={false}
              onChange={(v) => {
                setStaffRangeCustom(true);
                setDateStart(v);
              }}
              aria-label={tv.stats_aria_date_start}
            />
            <span className="inline-flex shrink-0 items-center text-[11px] font-semibold text-slate-400 sm:text-[12px]" aria-hidden>
              →
            </span>
            <DatePickerField
              compact
              value={dateEnd}
              min={dateStart}
              allowClear={false}
              onChange={(v) => {
                setStaffRangeCustom(true);
                setDateEnd(v);
              }}
              aria-label={tv.stats_aria_date_end}
            />
            {staffRangeCustom ? (
              <button
                type="button"
                onClick={() => {
                  setStaffRangeCustom(false);
                  const { startDate, endDate } = getPeriodDateRange(loadPeriodConfig());
                  setDateStart(startDate);
                  setDateEnd(endDate);
                }}
                className="shrink-0 rounded-lg border border-accent/30 bg-accent/5 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-dark transition-colors hover:bg-accent/10 sm:text-[11px]"
              >
                {tv.stats_align_timesheet_period ?? 'Periodo presenze'}
              </button>
            ) : null}
          </div>
        )}

        {showManagementStatsChrome && payrollForCalendarMonth && uiW('stats.table') && (
          <div className="mb-4 rounded-2xl border border-accent/25 bg-accent/5 px-4 py-3.5 text-sm">
            <p className="font-bold text-slate-900">{tv.stats_payroll_title ?? 'Pagamento stipendi'}</p>
            <p className="text-slate-600 mt-1 text-xs leading-snug max-w-2xl">
              {tv.stats_payroll_hint}
            </p>
            <p className="mt-2 font-semibold text-accent-dark">
              {formatTrans(tv.stats_payroll_date_line ?? 'Data prevista: {date}', {
                date: format(payrollForCalendarMonth.payDate, 'EEEE d MMMM yyyy', { locale: statsLoc }),
              })}
            </p>
          </div>
        )}

        {/* ── Tabella ore: solo card (stesso stile “Le tue ore nell’intervallo…”), niente scroll orizzontale ─ */}
        {uiW('stats.table') && displayUsers.length <= 1 && (
          <div className="mb-8 space-y-4 md:mb-6">
            <div className="card-factorial p-5 sm:p-6">
              <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-600">
                {t.stats_your_hours_in_range}
              </p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">
                {formatMinutesToHoursAndMinutes(staffRangeTotalMins)}
              </p>
            </div>
            {!hasDataInRange ? (
              <div className="card-factorial flex flex-col items-center gap-3 p-8 pb-16 text-center sm:p-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                  <Calendar className="h-6 w-6 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-800">{t.stats_no_data}</p>
                <p className="max-w-xs text-xs leading-relaxed text-slate-500">{t.stats_no_confirmed_shifts_period}</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="px-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                  {tv.stats_week_by_week_heading ?? tv.stats_week_tabs_legend}
                </p>
                {weeksInRange.map((w) => {
                  const wMins = minutesByUserByWeek[staffSelfId]?.[w.key] ?? 0;
                  return (
                    <div key={w.key} className="card-factorial p-5 sm:p-6">
                      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-600">
                        {w.label}
                      </p>
                      <p className="text-2xl font-semibold tabular-nums text-slate-900">
                        {wMins > 0 ? formatMinutesToHoursAndMinutes(wMins) : '–'}
                      </p>
                      {wMins === 0 && (
                        <p className="mt-3 text-xs text-slate-500">{tv.stats_week_no_hours}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {uiW('stats.table') && displayUsers.length > 1 && (
          <div className="mb-6 space-y-4">
            {showManagementStatsChrome && (
              <div className="card-factorial p-5 sm:p-6">
                <p className="mb-2 text-xs font-medium uppercase tracking-widest text-slate-600">
                  {tv.stats_team_hours_period ?? t.stats_total}
                </p>
                <p className="text-2xl font-semibold tabular-nums text-slate-900">
                  {formatMinutesToHoursAndMinutes(totalMinutesAll)}
                </p>
              </div>
            )}
            {!hasDataInRange ? (
              <div className="card-factorial flex flex-col items-center gap-3 p-8 text-center sm:p-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                  <Calendar className="h-6 w-6 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-800">{t.stats_no_data}</p>
                <p className="max-w-xs text-xs text-slate-500">{t.stats_no_confirmed_shifts_period}</p>
              </div>
            ) : (
              weeksInRange.map((w) => {
                const weekTotal = displayUsers.reduce(
                  (s, u) => s + (minutesByUserByWeek[u.id]?.[w.key] ?? 0),
                  0
                );
                return (
                  <div key={w.key} className="card-factorial p-5 sm:p-6">
                    <p className="mb-4 text-xs font-medium uppercase tracking-widest text-slate-600">{w.label}</p>
                    <ul className="space-y-3">
                      {displayUsers.map((u) => {
                        const m = minutesByUserByWeek[u.id]?.[w.key] ?? 0;
                        return (
                          <li key={u.id} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                            <span className="text-sm font-semibold uppercase tracking-wide text-slate-800">
                              {(u.first_name ?? '').trim() || '—'}
                            </span>
                            <span className="shrink-0 text-lg font-semibold tabular-nums text-slate-900">
                              {m > 0 ? formatMinutesToHoursAndMinutes(m) : '–'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    {showManagementStatsChrome && (
                      <div className="mt-4 flex items-baseline justify-between border-t border-slate-200 pt-4 text-sm font-bold text-slate-800">
                        <span>{t.stats_total}</span>
                        <span className="tabular-nums text-lg text-accent-dark">
                          {weekTotal > 0 ? formatMinutesToHoursAndMinutes(weekTotal) : '–'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {!showManagementStatsChrome && uiW('stats.staff_summary') && !uiW('stats.table') && (
          <div className="card-factorial p-5 sm:p-6">
            <p className="text-slate-600 text-xs uppercase tracking-widest font-medium mb-2">
              {t.stats_your_hours_in_range}
            </p>
            <p className="text-slate-900 text-2xl font-semibold">
              {formatMinutesToHoursAndMinutes(
                Object.values(minutesByUserByWeek[currentUser.id] ?? {}).reduce((a, b) => a + b, 0)
              )}
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
