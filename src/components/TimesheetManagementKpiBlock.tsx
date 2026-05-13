import { useMemo, useState } from 'react';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { it } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, TrendingUp, ChevronDown } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Language } from '../types';
import { getTranslations } from '../utils/translations';
import { formatMinutesToHoursAndMinutes } from '../utils/timeCalculations';
import { getNetShiftMinutes } from '../utils/breakRules';
import { getResolvedStartEndForHours } from '../utils/shiftResolvedClockTimes';
import { isFeatureEnabled } from '../utils/enabledFeatures';

function formatEurAmount(amount: number, lang: Language): string {
  const loc = lang === 'en' ? 'en-GB' : lang === 'es' ? 'es-ES' : lang === 'fr' ? 'fr-FR' : 'it-IT';
  return new Intl.NumberFormat(loc, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

type Props = {
  visibleWeekDays: Date[];
  showDetailPanels: boolean;
};

/**
 * Riepilogo ore approvate / costo / turni in attesa nel periodo visibile in Presenze (settimana o periodo in vista mese).
 * Stessa logica che era in Statistiche; i pannelli espandibili sono opzionali (`stats.detail_panels`).
 */
export default function TimesheetManagementKpiBlock({ visibleWeekDays, showDetailPanels }: Props) {
  const { users, shifts, currentUser, effectiveLanguage, breakRules, featureFlags, punchRecords } = useApp();
  const t = getTranslations(effectiveLanguage);
  const tv = t as Record<string, string>;
  const [activeWidget, setActiveWidget] = useState<'approved' | 'pending' | null>(null);

  const breakComputeOpts = useMemo(
    () => ({ autoBreaksFeatureEnabled: featureFlags['auto_breaks'] !== false }),
    [featureFlags]
  );

  const showEstimatedCostWidget =
    !!currentUser && isFeatureEnabled(currentUser, 'view_estimated_cost');

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (visibleWeekDays.length === 0) {
      const n = new Date();
      return { rangeStart: startOfDay(n), rangeEnd: endOfDay(n) };
    }
    const first = visibleWeekDays[0]!;
    const last = visibleWeekDays[visibleWeekDays.length - 1]!;
    return { rangeStart: startOfDay(first), rangeEnd: endOfDay(last) };
  }, [visibleWeekDays]);

  const approvedMins = useMemo(() => {
    return shifts
      .filter(
        (s) =>
          s.approval_status === 'approved' &&
          isWithinInterval(new Date(s.date), { start: rangeStart, end: rangeEnd })
      )
      .reduce((sum, s) => {
        const { start, end } = getResolvedStartEndForHours(s, punchRecords);
        if (!start || !end || start === end) return sum;
        const u = users.find((x) => x.id === s.user_id);
        return sum + getNetShiftMinutes(s, start, end, u ?? undefined, breakRules, breakComputeOpts);
      }, 0);
  }, [shifts, punchRecords, rangeStart, rangeEnd, users, breakRules, breakComputeOpts]);

  const pendingShifts = useMemo(() => {
    return shifts
      .filter(
        (s) =>
          s.approval_status === 'confirmed' &&
          isWithinInterval(new Date(s.date), { start: rangeStart, end: rangeEnd })
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [shifts, rangeStart, rangeEnd]);
  const pendingCount = pendingShifts.length;

  const approvedShifts = useMemo(() => {
    return shifts
      .filter(
        (s) =>
          s.approval_status === 'approved' &&
          isWithinInterval(new Date(s.date), { start: rangeStart, end: rangeEnd })
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [shifts, rangeStart, rangeEnd]);

  const estimatedCostStats = useMemo(() => {
    let totalEur = 0;
    let shiftsWithRate = 0;
    let shiftsWithoutRate = 0;
    for (const s of approvedShifts) {
      const { start, end } = getResolvedStartEndForHours(s, punchRecords);
      if (!start || !end || start === end) continue;
      const u = users.find((x) => x.id === s.user_id);
      if (!u || u.status !== 'active') continue;
      const mins = getNetShiftMinutes(s, start, end, u ?? undefined, breakRules, breakComputeOpts);
      const raw = u?.hourly_rate_eur;
      const rate = typeof raw === 'string' ? parseFloat(raw) : raw;
      if (rate != null && Number.isFinite(rate) && rate >= 0) {
        totalEur += (mins / 60) * rate;
        shiftsWithRate += 1;
      } else {
        shiftsWithoutRate += 1;
      }
    }
    return { totalEur, shiftsWithRate, shiftsWithoutRate };
  }, [approvedShifts, punchRecords, users, breakRules, breakComputeOpts]);

  if (!currentUser) return null;

  return (
    <>
      <div
        className={`grid grid-cols-1 gap-4 mb-4 ${showEstimatedCostWidget ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
      >
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          onClick={() => setActiveWidget(activeWidget === 'approved' ? null : 'approved')}
          className={`bg-white rounded-2xl border shadow-sm p-5 flex items-center gap-4 text-left transition-all cursor-pointer hover:shadow-md ${
            activeWidget === 'approved' ? 'border-accent ring-2 ring-accent/20' : 'border-slate-200 hover:border-accent/40'
          }`}
        >
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{t.stats_approved_hours}</p>
            <p className="text-2xl font-bold text-slate-900 leading-none">
              {approvedMins > 0 ? formatMinutesToHoursAndMinutes(approvedMins) : '—'}
            </p>
            <p className="text-xs text-slate-500 mt-1.5">{t.stats_approved_shifts_count.replace('{n}', String(approvedShifts.length))}</p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${activeWidget === 'approved' ? 'rotate-180 text-accent' : ''}`}
          />
        </motion.button>

        {showEstimatedCostWidget && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 ${
              estimatedCostStats.shiftsWithRate === 0 ? 'opacity-75' : ''
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
              <TrendingUp className="w-5 h-5 text-violet-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{t.stats_estimated_cost}</p>
              {estimatedCostStats.shiftsWithRate + estimatedCostStats.shiftsWithoutRate === 0 ? (
                <>
                  <p className="text-2xl font-bold text-slate-400 leading-none">—</p>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {tv.stats_no_approved_for_cost ?? t.stats_no_approved_shifts}
                  </p>
                </>
              ) : estimatedCostStats.shiftsWithRate === 0 ? (
                <>
                  <p className="text-2xl font-bold text-slate-400 leading-none">—</p>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {tv.stats_hourly_rate_not_set ?? t.stats_base_salary_not_set}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-slate-900 leading-none tabular-nums">
                    {formatEurAmount(estimatedCostStats.totalEur, effectiveLanguage)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1.5">
                    {estimatedCostStats.shiftsWithoutRate > 0
                      ? tv.stats_partial_hourly_rates?.replace('{n}', String(estimatedCostStats.shiftsWithoutRate)) ??
                        `${estimatedCostStats.shiftsWithoutRate} turni senza tariffa`
                      : tv.stats_cost_from_rates ?? ''}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}

        <motion.button
          type="button"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          onClick={() => {
            if (pendingCount > 0) {
              try {
                sessionStorage.setItem('osteria_timesheet_filter', 'confirmed');
              } catch {
                /* ignore */
              }
              window.dispatchEvent(
                new CustomEvent('osteria-navigate', {
                  detail: { tab: 'timesheet', anchor: 'timesheet-section-main-grid' },
                })
              );
            } else {
              setActiveWidget(activeWidget === 'pending' ? null : 'pending');
            }
          }}
          className={`bg-white rounded-2xl border shadow-sm p-5 flex items-center gap-4 text-left transition-all cursor-pointer hover:shadow-md ${
            activeWidget === 'pending' && pendingCount === 0
              ? 'border-amber-400 ring-2 ring-amber-200'
              : pendingCount > 0
                ? 'border-amber-200 hover:border-amber-400'
                : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              pendingCount > 0 ? 'bg-amber-50' : 'bg-slate-50'
            }`}
          >
            <AlertCircle className={`w-5 h-5 ${pendingCount > 0 ? 'text-amber-500' : 'text-slate-400'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-1">{t.stats_pending_shifts}</p>
            <p className={`text-2xl font-bold leading-none ${pendingCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {pendingCount}
            </p>
            <p className="text-xs text-slate-500 mt-1.5">{t.stats_confirmed_not_approved}</p>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${
              activeWidget === 'pending' && pendingCount === 0 ? 'rotate-180 text-amber-500' : ''
            }`}
          />
        </motion.button>
      </div>

      {showDetailPanels && (
        <AnimatePresence>
          {activeWidget === 'approved' && (
            <motion.div
              key="approved-panel-ts"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-4"
            >
              <div className="bg-accent/5 border border-accent/20 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-accent/10">
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                  <span className="text-sm font-semibold text-accent-dark">{t.stats_approved_shifts_in_period}</span>
                  <span className="ml-auto text-xs text-accent-dark bg-accent/10 px-2 py-0.5 rounded-full font-bold">
                    {approvedShifts.length}
                  </span>
                </div>
                {approvedShifts.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-400 text-center">{t.stats_no_approved_shifts}</p>
                ) : (
                  <div className="divide-y divide-accent/10 max-h-[320px] overflow-y-auto">
                    {approvedShifts.map((s) => {
                      const u = users.find((x) => x.id === s.user_id);
                      const { start: rs, end: re } = getResolvedStartEndForHours(s, punchRecords);
                      const mins = getNetShiftMinutes(s, rs, re, u ?? undefined, breakRules, breakComputeOpts);
                      const ps = (s.start_time || '').slice(0, 5);
                      const pe = (s.end_time || '').slice(0, 5);
                      return (
                        <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/5 transition-colors">
                          <div className="w-7 h-7 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
                            <span className="text-[11px] font-bold text-accent">{(u?.first_name?.[0] ?? '?').toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">
                              {u?.first_name ?? '—'} {u?.last_name ?? ''}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {format(new Date(s.date), 'EEE d MMM', { locale: it })} · {rs} – {re}
                              {s.approved_at && (rs !== ps || re !== pe) ? (
                                <span className="text-slate-400">
                                  {' '}
                                  ({t.stats_planned_abbr} {ps}–{pe})
                                </span>
                              ) : null}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-accent tabular-nums">{formatMinutesToHoursAndMinutes(mins)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeWidget === 'pending' && (
            <motion.div
              key="pending-panel-ts"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-4"
            >
              <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-100">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  <span className="text-sm font-semibold text-amber-800">{t.stats_shifts_awaiting_approval}</span>
                  <span className="ml-auto text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full font-bold border border-amber-200">
                    {pendingCount}
                  </span>
                </div>
                {pendingShifts.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-400 text-center">{t.stats_no_pending_shifts}</p>
                ) : (
                  <div className="divide-y divide-amber-100 max-h-[320px] overflow-y-auto">
                    {pendingShifts.map((s) => {
                      const u = users.find((x) => x.id === s.user_id);
                      const mins = getNetShiftMinutes(
                        s,
                        (s.start_time || '').slice(0, 5),
                        (s.end_time || '').slice(0, 5),
                        u ?? undefined,
                        breakRules,
                        breakComputeOpts
                      );
                      return (
                        <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-50/80 transition-colors">
                          <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                            <span className="text-[11px] font-bold text-amber-700">{(u?.first_name?.[0] ?? '?').toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">
                              {u?.first_name ?? '—'} {u?.last_name ?? ''}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {format(new Date(s.date), 'EEE d MMM', { locale: it })} · {(s.start_time || '').slice(0, 5)} –{' '}
                              {(s.end_time || '').slice(0, 5)}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-amber-600 tabular-nums">{formatMinutesToHoursAndMinutes(mins)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
