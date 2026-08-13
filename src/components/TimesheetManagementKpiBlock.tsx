import { useMemo, useState } from 'react';
import { format, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import { it } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppData } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import type { Language } from '../types';
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
 * Stessa logica che era in Ore; i pannelli espandibili sono opzionali (`stats.detail_panels`).
 */
export default function TimesheetManagementKpiBlock({ visibleWeekDays, showDetailPanels }: Props) {
  const { users, currentUser, effectiveLanguage } = useAppUser();
  const { shifts, punchRecords } = useAppData();
  const { breakRules, featureFlags } = useAppConfig();
  const t = useT();
  const tv = t as Record<string, string>;
  const [activeWidget, _setActiveWidget] = useState<'approved' | 'pending' | null>(null);

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
          s.approval_status === 'confirmed' &&
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
          s.approval_status === 'confirmed' &&
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
        className={`fluid-grid gap-2 mb-3 w-full ${showEstimatedCostWidget ? 'fluid-grid-3' : 'fluid-grid-2'}`}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors select-none"
          style={{ background: 'transparent', border: '1.5px solid rgba(255,255,255,0.35)' }}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/20 ring-1 ring-inset ring-accent/40">
            <CheckCircle2 className="h-3.5 w-3.5 text-accent" />
          </div>
          <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">{t.stats_approved_hours}</p>
              <p className="text-[11px] leading-snug text-white/55">{t.stats_approved_shifts_count.replace('{n}', String(approvedShifts.length))}</p>
            </div>
            <p className="text-xl font-black tabular-nums leading-none text-white shrink-0">
              {approvedMins > 0 ? formatMinutesToHoursAndMinutes(approvedMins) : '—'}
            </p>
          </div>
        </motion.div>

        {showEstimatedCostWidget && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${
 estimatedCostStats.shiftsWithRate === 0 ? 'opacity-75' : ''
 }`}
            style={{ background: 'transparent', border: '1.5px solid rgba(255,255,255,0.35)' }}
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-inset ring-accent/25">
              <TrendingUp className="h-3.5 w-3.5 text-accent" />
            </div>
            <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">{t.stats_estimated_cost}</p>
                <p className="text-[11px] leading-snug text-white/55">
                  {estimatedCostStats.shiftsWithRate + estimatedCostStats.shiftsWithoutRate === 0
                    ? (tv.stats_no_approved_for_cost ?? t.stats_no_approved_shifts)
                    : estimatedCostStats.shiftsWithRate === 0
                      ? (tv.stats_hourly_rate_not_set ?? t.stats_base_salary_not_set)
                      : estimatedCostStats.shiftsWithoutRate > 0
                        ? (tv.stats_partial_hourly_rates?.replace('{n}', String(estimatedCostStats.shiftsWithoutRate)) ?? `${estimatedCostStats.shiftsWithoutRate} turni senza tariffa`)
                        : (tv.stats_cost_from_rates ?? '')}
                </p>
              </div>
              <p className={`text-xl font-black tabular-nums leading-none shrink-0 ${estimatedCostStats.shiftsWithRate === 0 ? 'text-white/40' : 'text-white'}`}>
                {estimatedCostStats.shiftsWithRate > 0 ? formatEurAmount(estimatedCostStats.totalEur, effectiveLanguage) : '—'}
              </p>
            </div>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors select-none`}
          style={{
            background: pendingCount > 0 ? 'rgba(245,158,11,0.12)' : 'transparent',
            border: pendingCount > 0 ? '1.5px solid rgba(245,158,11,0.30)' : '1.5px solid rgba(255,255,255,0.35)',
          }}
        >
          <div
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${
 pendingCount > 0
 ? 'bg-amber-500/15 ring-amber-400/40'
 : 'bg-white/8 ring-white/20'
 }`}
          >
            <AlertCircle
              className={`h-3.5 w-3.5 ${pendingCount > 0 ? 'text-amber-400' : 'text-white/40'}`}
            />
          </div>
          <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/75">{t.stats_pending_shifts}</p>
              <p className="text-[11px] leading-snug text-white/55">{t.stats_confirmed_not_approved}</p>
            </div>
            <p className={`text-xl font-black tabular-nums leading-none shrink-0 ${pendingCount > 0 ? 'text-amber-300' : 'text-white'}`}>
              {pendingCount}
            </p>
          </div>
        </motion.div>
      </div>

      {showDetailPanels && (
        <AnimatePresence>
          {activeWidget === 'pending' && (
            <motion.div
              key="pending-panel-ts"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden mb-4"
            >
              <div className="bg-amber-500/10 border border-amber-400/30 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-amber-400/20">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-semibold text-amber-200">{t.stats_shifts_awaiting_approval}</span>
                  <span className="ml-auto text-xs text-amber-200 bg-amber-500/20 px-2 py-0.5 rounded-full font-bold border border-amber-400/30">
                    {pendingCount}
                  </span>
                </div>
                {pendingShifts.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-white/40 text-center">{t.stats_no_pending_shifts}</p>
                ) : (
                  <div className="divide-y divide-amber-400/15 max-h-[320px] overflow-y-auto">
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
                        <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-amber-500/15 transition-colors active:bg-amber-500/80">
                          <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 ring-1 ring-amber-400/30">
                            <span className="text-[11px] font-bold text-amber-300">{(u?.first_name?.[0] ?? '?').toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-white truncate" title={u?.first_name ?? '—'}>{u?.first_name ?? '—'} {u?.last_name ?? ''}
                            </p>
                            <p className="text-[11px] text-white/45">
                              {format(new Date(s.date), 'EEE d MMM', { locale: it })} · {(s.start_time || '').slice(0, 5)} –{' '}
                              {(s.end_time || '').slice(0, 5)}
                            </p>
                          </div>
                          <span className="text-xs font-bold text-amber-300 tabular-nums">{formatMinutesToHoursAndMinutes(mins)}</span>
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
