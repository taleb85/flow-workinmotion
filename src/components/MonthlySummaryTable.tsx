import { useMemo } from 'react';
import { startOfMonth, endOfMonth, eachWeekOfInterval, format, endOfWeek, eachDayOfInterval } from 'date-fns';
import { useAppUser } from '../context/appSliceContexts';
import { useAppData } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { formatMinutesToHoursAndMinutes, calculateShiftMinutesGross } from '../utils/timeCalculations';
import { getNetShiftMinutes } from '../utils/breakRules';
import { getResolvedStartEndForHours } from '../utils/shiftResolvedClockTimes';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { translateRole } from '../utils/roles';
import { isPurelyManagementRole, isManagementRole, isUserVisibleOnTeamSchedule, canViewAllTeamHours } from '../utils/permissions';
import { isFeatureEnabled } from '../utils/enabledFeatures';
import { getDateLocale, formatTrans } from '../utils/translations';
import { it } from 'date-fns/locale';
import { getPayrollPaymentDateForCalendarMonth } from '../utils/payrollSchedule';
import { safeFormatDate } from '../utils/safeDateFormat';

export default function MonthlySummaryTable() {
  const { users, currentUser, effectiveLanguage } = useAppUser();
  const { shifts, punchRecords } = useAppData();
  const { breakRules, featureFlags } = useAppConfig();
  const breakComputeOpts = useMemo(
    () => ({ autoBreaksFeatureEnabled: featureFlags['auto_breaks'] !== false }),
    [featureFlags]
  );
  const t = useT();
  if (!currentUser) return null;
  const hasManagementAccess =
    isManagementRole(currentUser.role) && canViewAllTeamHours(currentUser);
  const getLocale = () => getDateLocale(effectiveLanguage) ?? it;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const payrollPayDate = getPayrollPaymentDateForCalendarMonth(monthStart);

  const weeks = eachWeekOfInterval(
    { start: monthStart, end: monthEnd },
    { weekStartsOn: 1 }
  );

  const getWeekMinutes = (userId: string, weekStart: Date) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

    const weekShifts = shifts.filter((s) => {
      if (s.user_id !== userId || (s.approval_status !== 'approved' && s.approval_status !== 'confirmed')) return false;
      const shiftDayStr = safeFormatDate(s.date, 'yyyy-MM-dd');
      if (shiftDayStr === '—') return false;
      return daysInWeek.some((day) => format(day, 'yyyy-MM-dd') === shiftDayStr);
    });

    const user = users.find((u) => u.id === userId);
    return weekShifts.reduce((sum, shift) => {
      const { start, end } = getResolvedStartEndForHours(shift, punchRecords);
      if (calculateShiftMinutesGross(start, end) <= 0) return sum;
      return sum + getNetShiftMinutes(shift, start, end, user ?? undefined, breakRules, breakComputeOpts);
    }, 0);
  };

  const getTotalMinutes = (userId: string) => {
    return weeks.reduce((sum, week) => sum + getWeekMinutes(userId, week), 0);
  };

  // Gli utenti staff vedono solo se stessi, management vede tutti
  const displayUsers = users
    .filter((u) => {
      if (!hasManagementAccess) {
        return u.id === currentUser.id && u.status === 'active' && !isPurelyManagementRole(u.role);
      }
      if (u.id === currentUser.id && u.status === 'active' && !isPurelyManagementRole(u.role)) return true;
      return isUserVisibleOnTeamSchedule(u, shifts);
    })
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="pb-content pt-6 w-full max-w-full app-horizontal-pad font-sans mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">
              {t.statistics_nav}
            </h1>
            <p className="text-white/60 text-sm uppercase tracking-widest mt-1">
              {format(now, 'MMMM yyyy', { locale: getLocale() })}
            </p>
            <p className="text-white/70 text-xs mt-2 max-w-xl leading-snug">
              <span className="font-semibold text-white/90">
                {(t as { stats_payroll_title?: string }).stats_payroll_title ?? 'Pagamento stipendi'}:{' '}
              </span>
              {formatTrans(
                (t as { stats_payroll_date_line?: string }).stats_payroll_date_line ?? 'Data prevista: {date}',
                { date: safeFormatDate(payrollPayDate, 'EEEE d MMMM yyyy', { locale: getLocale() }) }
              )}
              <span className="block mt-1 text-white/60 font-normal">
                {(t as { stats_payroll_hint?: string }).stats_payroll_hint}
              </span>
            </p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center border border-slate-200">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
        </div>

        <div className="overflow-x-auto-safe scrollbar-hide snap-x snap-mandatory">
          <div className="inline-block min-w-full surface-ghost-sm overflow-hidden">
            <table className="w-full border-collapse min-w-full">
              <thead className="sticky top-0 z-20">
                <tr className="bg-slate-100">
                  <th className="sticky left-0 bg-slate-100 px-4 py-3 text-left border-b border-r border-slate-200 z-30 w-[120px] min-w-[120px]">
                    <span className="text-white/70 text-xs uppercase tracking-[0.2em] font-bold">
                      {t.personnel}
                    </span>
                  </th>
                  {weeks.map((week, index) => (
                    <th key={week.toString()} className="px-3 py-3 text-center border-b border-slate-200 snap-start w-[calc((100vw-120px)/3)] min-w-[140px]">
                      <div className="text-white/70 text-xs uppercase tracking-wider font-bold">
                        {t.week_label} {index + 1}
                      </div>
                      <div className="text-white text-sm font-black mt-0.5">
                        {format(week, 'd MMM', { locale: getLocale() })}
                      </div>
                    </th>
                  ))}
                  {currentUser && isFeatureEnabled(currentUser, 'view_stats') && (
                    <th className="px-4 py-3 text-center border-b border-l border-slate-200 w-[60px] min-w-[60px]">
                      <span className="text-white/70 text-xs uppercase tracking-[0.2em] font-bold">
                        {t.tot}
                      </span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayUsers.map((user, userIndex) => {
                  const totalMinutes = getTotalMinutes(user.id);

                  return (
                    <>
                      <tr key={`${user.id}-header`} className="bg-slate-100">
                        <td className="sticky left-0 bg-slate-100 px-4 py-2 border-r border-slate-200 z-10" colSpan={weeks.length + 2}>
                          <p className="text-white font-bold text-sm">
                            <span className="uppercase">{user.first_name}</span>
                          </p>
                        </td>
                      </tr>
                      <motion.tr
                        key={`${user.id}-data`}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: userIndex * 0.05 }}
                        className={`${userIndex < displayUsers.length - 1 ? 'border-b border-white/10' : ''}`}
                        style={{ background: 'rgba(255,255,255,0.05)' }}
                      >
                        <td className="sticky left-0 px-4 py-3 border-r border-white/10 z-10" style={{ background: 'rgba(8,18,52,0.88)' }}>
                          <p className="text-white/70 text-xs uppercase tracking-wider">
                            {translateRole(user.role, currentUser.language ?? 'it')}
                          </p>
                        </td>
                        {weeks.map((week) => {
                          const minutes = getWeekMinutes(user.id, week);
                          return (
                            <td key={week.toString()} className="px-4 py-3 text-center border-x border-white/10 snap-start">
                              <span className={`font-bold text-xs ${
 minutes > 0 ? 'text-white' : 'text-white/60'
 }`}>
                                {minutes > 0 ? formatMinutesToHoursAndMinutes(minutes) : '-'}
                              </span>
                            </td>
                          );
                        })}
                        {currentUser && isFeatureEnabled(currentUser, 'view_stats') && (
                          <td className="px-4 py-3 text-center border-l border-slate-200">
                            <span className="text-accent text-xs font-black">
                              {formatMinutesToHoursAndMinutes(totalMinutes)}
                            </span>
                          </td>
                        )}
                      </motion.tr>
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 grid grid-cols-2 gap-4 px-4"
        >
          <div className="rounded-xl border border-neutral-500 p-5">
            <p className="text-white/60 text-xs uppercase tracking-widest font-bold mb-2">
              {t.total_hours}
            </p>
            <p className="text-white text-2xl font-black tracking-tighter">
              {formatMinutesToHoursAndMinutes(displayUsers.reduce((sum, user) => sum + getTotalMinutes(user.id), 0))}
            </p>
          </div>

          <div className="rounded-xl border border-neutral-500 p-5">
            <p className="text-white/60 text-xs uppercase tracking-widest font-bold mb-2">
              {hasManagementAccess ? t.personnel : t.hours_this_month}
            </p>
            <p className="text-white text-3xl font-black tracking-tighter">
              {hasManagementAccess
                ? users.filter((u) => isUserVisibleOnTeamSchedule(u, shifts)).length
                : formatMinutesToHoursAndMinutes(getTotalMinutes(currentUser.id))
              }
            </p>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
