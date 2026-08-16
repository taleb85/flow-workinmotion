import { useState, useMemo, useEffect, useCallback, memo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  format,
  isWithinInterval,
  eachWeekOfInterval,
  getISOWeek,
  getISOWeekYear,
  parseISO,
  parse,
  isSameDay,
  eachDayOfInterval,
} from 'date-fns';
import { it } from 'date-fns/locale';
import { useAppUser } from '../context/appSliceContexts';
import { useAppData } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { getDateLocale, formatTrans } from '../utils/translations';
import { getPayrollPaymentDateForCalendarMonth } from '../utils/payrollSchedule';
import {
  loadPeriodConfig,
  getPeriodDateRange,
  prevPeriodConfig,
  nextPeriodConfig,
  periodConfigContainingDate,
  type PeriodConfig,
} from '../utils/periodConfig';
import { formatMinutesToHoursAndMinutes } from '../utils/timeCalculations';
import { getNetShiftMinutes } from '../utils/breakRules';
import { getResolvedStartEndForHours } from '../utils/shiftResolvedClockTimes';
import { isManagementRole, isPurelyManagementRole, canViewAllTeamHours } from '../utils/permissions';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';
import { isFeatureEnabled } from '../utils/enabledFeatures';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, FileDown, Filter, ChevronDown, ChevronLeft, ChevronRight, Check, X } from 'lucide-react';
// import DatePickerField from './DatePickerField'; // unused
import { CenteredModalPortal } from './ui/CenteredModalPortal';
import { exportAttendancePdfFromGrid } from '../utils/timesheetPdfFromRange';
import { translateDepartmentValue } from '../utils/departmentLabels';
import { getDeptColor, getDepartments, deptMatchesFilterKey } from '../utils/departments';
import { exportToCsv } from '../utils/exportCsv';

function toDateOnly(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

function _formatStatsChipDate(iso: string, locale: typeof it): string {
  const d = parseISO(iso.slice(0, 10));
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'dd/MM/yy', { locale });
}

/** `YYYY-MM-DD` a mezzanotte locale — evita settimane ISO sbagliate con `new Date('YYYY-MM-DD')` (UTC). */
function parseShiftLocalDate(ymd: string): Date {
  const raw = (ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(NaN);
  return parse(raw, 'yyyy-MM-dd', new Date());
}

type WeekKey = string; // "2026-W10"
type StatsTab = 'current_week' | 'period';

function getInitialDatesFromOffset(): { start: string; end: string } {
  const saved = sessionStorage.getItem('osteria_staff_nav_offset');
  const offset = saved ? Number(saved) : 0;
  let cfg: PeriodConfig = loadPeriodConfig();
  if (offset > 0) for (let i = 0; i < offset; i++) cfg = nextPeriodConfig(cfg);
  else if (offset < 0) for (let i = 0; i > offset; i--) cfg = prevPeriodConfig(cfg);
  const r = getPeriodDateRange(cfg);
  return { start: r.startDate, end: r.endDate };
}

export default memo(function Statistics({ anchorDate = null }: { anchorDate?: string | null }) {
  const { users, currentUser, effectiveLanguage } = useAppUser();
  const { shifts, punchRecords } = useAppData();
  const { breakRules, featureFlags, departmentsRevision } = useAppConfig();
  const { showSuccess, showError } = useAppOverlay();
  const t = useT();
  const breakComputeOpts = useMemo(
    () => ({ autoBreaksFeatureEnabled: featureFlags['auto_breaks'] !== false }),
    [featureFlags]
  );
  /** Vista gestione team: ruolo gestionale, `view_stats` e (admin o `can_view_total_hours`). */
  const isManagementRoleUser = useMemo(
    () => currentUser ? isManagementRole(currentUser.role) : false,
    [currentUser?.role]
  );
  const showManagementStatsChrome =
    currentUser &&
    isManagementRoleUser &&
    isFeatureEnabled(currentUser, 'view_stats') &&
    canViewAllTeamHours(currentUser);

  /** Ruoli gestionali (admin/manager/assistant_manager/capo): filtro libero.
   *  Staff operativo: vincolato al reparto del proprio profilo. */
  const isAdmin = useMemo(
    () => currentUser ? isManagementRole(currentUser.role) : false,
    [currentUser?.role]
  );
  const lockedDept = (!isAdmin && currentUser?.department) ? currentUser.department : null;

  // ── Ancora opzionale: Statistiche ancorate alla settimana scelta in Presenze ──
  const anchor = useMemo(() => {
    if (!anchorDate) return null;
    const d = parseISO(anchorDate);
    return Number.isNaN(d.getTime()) ? null : startOfDay(d);
  }, [anchorDate]);
  const anchored = anchor != null;

  const [statsTab, setStatsTab] = useState<StatsTab>('period');
  /**
   * Offset di navigazione contestuale:
   * - tab 'current_week': offset in settimane (0 = settimana base)
   * - tab 'period': offset in periodi (0 = periodo base)
   */
  const [navOffset, setNavOffset] = useState(() => {
    if (anchored) return 0;
    const saved = sessionStorage.getItem('osteria_staff_nav_offset');
    return saved ? Number(saved) : 0;
  });

  // Persiste l'offset in sessionStorage per condividerlo con Presenze
  useEffect(() => {
    if (anchored) return;
    sessionStorage.setItem('osteria_staff_nav_offset', String(navOffset));
  }, [navOffset, anchored]);

  // Sincronizza l'offset con la navigazione dalla scheda Presenze (StaffPersonalDashboard)
  useEffect(() => {
    if (anchored) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === 'number') {
        setNavOffset(detail);
        sessionStorage.setItem('osteria_staff_nav_offset', String(detail));
      }
    };
    window.addEventListener('osteria-staff-nav-offset', handler);
    return () => window.removeEventListener('osteria-staff-nav-offset', handler);
  }, [anchored]);

  // Quando l'offset cambia in Statistiche, aggiorna anche la scheda Presenze
  useEffect(() => {
    if (anchored) return;
    window.dispatchEvent(new CustomEvent('osteria-staff-nav-offset', { detail: navOffset }));
  }, [navOffset, anchored]);

  /** Calcola le date in base al tab attivo e all'offset (base ancorata se presente). */
  const getDatesForRange = useCallback((tab: StatsTab, offset: number): { start: string; end: string } => {
    const today = new Date();
    if (tab === 'current_week') {
      const base = addWeeks(startOfWeek(anchor ?? today, { weekStartsOn: 1 }), offset);
      return {
        start: toDateOnly(base),
        end: toDateOnly(endOfWeek(base, { weekStartsOn: 1 })),
      };
    }
    // tab === 'period': naviga per periodi (base = periodo che contiene l'ancora se ancorato)
    let cfg: PeriodConfig = anchored && anchor ? periodConfigContainingDate(anchor) : loadPeriodConfig();
    if (offset > 0) for (let i = 0; i < offset; i++) cfg = nextPeriodConfig(cfg);
    else if (offset < 0) for (let i = 0; i > offset; i--) cfg = prevPeriodConfig(cfg);
    const r = getPeriodDateRange(cfg);
    return { start: r.startDate, end: r.endDate };
  }, [anchor, anchored]);

  const [dateStart, setDateStart] = useState<string>(() => {
    if (anchored) return getDatesForRange('period', 0).start;
    return getInitialDatesFromOffset().start;
  });
  const [dateEnd, setDateEnd]     = useState<string>(() => {
    if (anchored) return getDatesForRange('period', 0).end;
    return getInitialDatesFromOffset().end;
  });
  const [deptFilter, setDeptFilter] = useState<string>(() => currentUser?.department ?? lockedDept ?? 'all');
  const [showDeptMenu, setShowDeptMenu] = useState(false);

  // Se l'ancora cambia con Statistics montata, torna al mese ancorato
  useEffect(() => {
    if (anchored) {
      setStatsTab('period');
      setNavOffset(0);
    }
  }, [anchored]);

  // Riallinea il filtro quando cambia il reparto del profilo o il login
  useEffect(() => {
    if (lockedDept) setDeptFilter(lockedDept);
    else if (!isAdmin) setDeptFilter('all');
  }, [lockedDept, isAdmin]);

  // Aggiorna le date quando cambia il tab o l'offset
  useEffect(() => {
    const { start, end } = getDatesForRange(statsTab, navOffset);
    setDateStart(start);
    setDateEnd(end);
  }, [statsTab, navOffset, getDatesForRange]);

  // Quando il periodo viene salvato in Impostazioni, ricarica le date correnti
  useEffect(() => {
    const handler = () => {
      const { start, end } = getDatesForRange(statsTab, navOffset);
      setDateStart(start);
      setDateEnd(end);
    };
    window.addEventListener('osteria_period_updated', handler);
    return () => window.removeEventListener('osteria_period_updated', handler);
  }, [statsTab, navOffset, getDatesForRange]);

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

  const statsWeekDaysForPdf = useMemo(
    () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
    [rangeStart, rangeEnd]
  );

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

  /**
   * Minuti per utente per settimana: turni confermati o approvati, ore da orari congelati / timbrature / pianificato.
   * Date turno parse-ate in locale (stesso calendario delle card settimana).
   */
  const minutesByUserByWeek = useMemo(() => {
    const byUser: Record<string, Record<WeekKey, number>> = {};
    const rangeShifts = shifts.filter((s) => {
      if (s.approval_status === 'absent') return false;
      if (s.approval_status !== 'confirmed' && s.approval_status !== 'approved') return false;
      const sd = parseShiftLocalDate(s.date);
      if (Number.isNaN(sd.getTime())) return false;
      return isWithinInterval(sd, { start: rangeStart, end: rangeEnd });
    });
    for (const s of rangeShifts) {
      let { start, end } = getResolvedStartEndForHours(s, punchRecords);
      if (!start || !end || start === end) {
        const ps = (s.start_time || '').slice(0, 5);
        const pe = (s.end_time || '').slice(0, 5);
        if (ps && pe && ps !== pe) {
          start = ps;
          end = pe;
        } else {
          continue;
        }
      }
      const u = users.find((x) => x.id === s.user_id);
      const mins = getNetShiftMinutes(s, start, end, u ?? undefined, breakRules, breakComputeOpts);
      const d = parseShiftLocalDate(s.date);
      if (Number.isNaN(d.getTime())) continue;
      const w = getISOWeek(d);
      const y = getISOWeekYear(d);
      const weekKey = `${y}-W${String(w).padStart(2, '0')}` as WeekKey;
      if (!byUser[s.user_id]) byUser[s.user_id] = {} as Record<WeekKey, number>;
      byUser[s.user_id][weekKey] = (byUser[s.user_id][weekKey] ?? 0) + mins;
    }
    return byUser;
  }, [shifts, punchRecords, rangeStart, rangeEnd, users, breakRules, breakComputeOpts]);

  /** Minuti per utente per giorno (YYYY-MM-DD): stessa logica di minutesByUserByWeek, chiave diversa. */
  const minutesByUserByDay = useMemo(() => {
    const byUser: Record<string, Record<string, number>> = {};
    const rangeShifts = shifts.filter((s) => {
      if (s.approval_status === 'absent') return false;
      if (s.approval_status !== 'confirmed' && s.approval_status !== 'approved') return false;
      const sd = parseShiftLocalDate(s.date);
      if (Number.isNaN(sd.getTime())) return false;
      return isWithinInterval(sd, { start: rangeStart, end: rangeEnd });
    });
    for (const s of rangeShifts) {
      let { start, end } = getResolvedStartEndForHours(s, punchRecords);
      if (!start || !end || start === end) {
        const ps = (s.start_time || '').slice(0, 5);
        const pe = (s.end_time || '').slice(0, 5);
        if (ps && pe && ps !== pe) { start = ps; end = pe; } else { continue; }
      }
      const u = users.find((x) => x.id === s.user_id);
      const mins = getNetShiftMinutes(s, start, end, u ?? undefined, breakRules, breakComputeOpts);
      const dayKey = s.date.slice(0, 10);
      if (!byUser[s.user_id]) byUser[s.user_id] = {};
      byUser[s.user_id][dayKey] = (byUser[s.user_id][dayKey] ?? 0) + mins;
    }
    return byUser;
  }, [shifts, punchRecords, rangeStart, rangeEnd, users, breakRules, breakComputeOpts]);

  const displayUsers = useMemo(() => {
    if (!currentUser) return [];

    // Staff: vede solo se stesso
    if (!canViewAllTeamHours(currentUser)) {
      return users.filter(u => u.id === currentUser.id);
    }

    // Gestione: tutti gli utenti attivi eccetto admin (profilo impostazioni puro).
    return users
      .filter((u) => {
        if (u.status !== 'active') return false;
        if (isPurelyManagementRole(u.role)) return false;
        return true;
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [users, currentUser]);

  const statsLocForPdf = getDateLocale(effectiveLanguage) ?? it;
  const handleExportStatsPdf = useCallback(async () => {
    if (!currentUser || !isFeatureEnabled(currentUser, 'export_pdf')) return;
    try {
      const result = await exportAttendancePdfFromGrid({
        weekDays: statsWeekDaysForPdf,
        visibleUsers: displayUsers,
        shifts,
        punchRecords,
        breakRules,
        breakComputeOpts,
        locale: statsLocForPdf,
        t: t as Record<string, string>,
        formatTrans,
        fmtHM: formatMinutesToHoursAndMinutes,
        onlyConfirmedOrApproved: true,
      });
      if (result === 'no_days' || result === 'no_users') {
        showError?.((t as { ts_pdf_no_data?: string }).ts_pdf_no_data ?? 'Nessun dato da esportare');
        return;
      }
      showSuccess?.((t as { mod_pdf_export?: string }).mod_pdf_export ?? 'PDF presenze esportato');
    } catch (e) {
      showError?.(e instanceof Error ? e.message : 'Export PDF non riuscito');
    }
  }, [
    currentUser,
    statsWeekDaysForPdf,
    displayUsers,
    shifts,
    punchRecords,
    breakRules,
    breakComputeOpts,
    statsLocForPdf,
    t,
    showSuccess,
    showError,
  ]);

  const totalMinutesAll = useMemo(() => {
    return displayUsers.reduce((sum, u) => {
      const byWeek = minutesByUserByWeek[u.id] ?? {};
      return sum + Object.values(byWeek).reduce((a, b) => a + b, 0);
    }, 0);
  }, [displayUsers, minutesByUserByWeek]);

  // Reparti dalla configurazione (rispetta nascosti e ordine), filtrati a quelli con almeno un utente attivo
  const departments = useMemo(() => {
    const usedValues = new Set(users.map(u => u.department).filter(Boolean) as string[]);
    return getDepartments().filter(d => usedValues.has(d.value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, departmentsRevision]);

  const filteredUsers = useMemo(() => {
    if (deptFilter === 'all') return displayUsers;
    return displayUsers.filter(u => deptMatchesFilterKey(u.department, deptFilter));
  }, [displayUsers, deptFilter]);

  /** Totali per settimana e per giorno su TUTTI gli utenti filtrati (footer delle tabelle):
   *  prima erano reduce inline ricalcolati a ogni render dentro il loop delle settimane. */
  const weekTotalsByKey = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const u of filteredUsers) {
      const byWeek = minutesByUserByWeek[u.id];
      if (!byWeek) continue;
      for (const [k, v] of Object.entries(byWeek)) {
        if (!v) continue;
        totals[k] = (totals[k] ?? 0) + v;
      }
    }
    return totals;
  }, [filteredUsers, minutesByUserByWeek]);

  const dayTotalsByDate = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const u of filteredUsers) {
      const byDay = minutesByUserByDay[u.id];
      if (!byDay) continue;
      for (const [d, v] of Object.entries(byDay)) {
        if (!v) continue;
        totals[d] = (totals[d] ?? 0) + v;
      }
    }
    return totals;
  }, [filteredUsers, minutesByUserByDay]);

  const totalMinutesFiltered = useMemo(() => {
    return filteredUsers.reduce((sum, u) => {
      const byWeek = minutesByUserByWeek[u.id] ?? {};
      return sum + Object.values(byWeek).reduce((a, b) => a + b, 0);
    }, 0);
  }, [filteredUsers, minutesByUserByWeek]);

  /** Ore dell’utente connesso nel range (anche se non compare nella lista team, es. admin). */
  const mgmtPersonalTotalMins = useMemo(() => {
    if (!currentUser) return 0;
    const byWeek = minutesByUserByWeek[currentUser.id] ?? {};
    return Object.values(byWeek).reduce((a, b) => a + b, 0);
  }, [currentUser, minutesByUserByWeek]);

  const todayStrKpi = useMemo(() => format(new Date(), 'yyyy-MM-dd'), []);

  const kpiMonthTotalMins = useMemo(() => {
    const m0 = format(startOfMonth(new Date()), 'yyyy-MM-dd');
    const m1 = format(endOfMonth(new Date()), 'yyyy-MM-dd');
    let sum = 0;
    for (const u of filteredUsers) {
      const byDay = minutesByUserByDay[u.id] ?? {};
      for (const [d, mins] of Object.entries(byDay)) {
        if (d >= m0 && d <= m1) sum += mins;
      }
    }
    return sum;
  }, [filteredUsers, minutesByUserByDay]);

  const kpiPresentAbsent = useMemo(() => {
    const m0 = startOfMonth(new Date());
    const m1 = endOfMonth(new Date());
    // Set di lookup: prima ogni turno scannerizzava `filteredUsers.some(...)` → O(S×U).
    const filteredUserIds = new Set(filteredUsers.map((u) => u.id));
    let pres = 0;
    let abs = 0;
    for (const s of shifts) {
      if (!filteredUserIds.has(s.user_id)) continue;
      const sd = parseShiftLocalDate(s.date);
      if (Number.isNaN(sd.getTime()) || !isWithinInterval(sd, { start: m0, end: m1 })) continue;
      if (s.approval_status === 'absent') abs += 1;
      else if (s.approval_status === 'confirmed') pres += 1;
    }
    return { pres, abs };
  }, [filteredUsers, shifts]);

  const kpiAvgWeeklyMins = useMemo(() => {
    const n = weeksInRange.length;
    if (n < 1) return 0;
    return Math.round(totalMinutesFiltered / n);
  }, [totalMinutesFiltered, weeksInRange.length]);

  const kpiActiveToday = useMemo(() => {
    // Set degli utenti con turno attivo oggi: prima era `filteredUsers.filter(... shifts.some(...))` → O(U×S).
    const activeTodayIds = new Set<string>();
    for (const s of shifts) {
      if (
        s.date === todayStrKpi &&
        s.approval_status !== 'absent' &&
        (s.approval_status === 'approved' ||
          s.approval_status === 'confirmed' ||
          s.approval_status === 'draft')
      ) {
        activeTodayIds.add(s.user_id);
      }
    }
    return filteredUsers.reduce((n, u) => n + (activeTodayIds.has(u.id) ? 1 : 0), 0);
  }, [filteredUsers, shifts, todayStrKpi]);

  const eightWeekTrend = useMemo(() => {
    const out: { key: string; label: string; minutes: number }[] = [];
    const anchor = new Date();
    for (let back = 7; back >= 0; back -= 1) {
      const wStart = startOfWeek(subWeeks(anchor, back), { weekStartsOn: 1 });
      const wk = getISOWeek(wStart);
      const y = getISOWeekYear(wStart);
      const key = `${y}-W${String(wk).padStart(2, '0')}` as WeekKey;
      let mins = 0;
      for (const u of filteredUsers) {
        mins += minutesByUserByWeek[u.id]?.[key] ?? 0;
      }
      out.push({ key, label: `S${wk}`, minutes: mins });
    }
    return out;
  }, [filteredUsers, minutesByUserByWeek]);

  const hasDataInRange = totalMinutesAll > 0;

  const handleExportStatsCsv = useCallback(() => {
    const rows: Record<string, unknown>[] = filteredUsers.map((u) => {
      const byWeek = minutesByUserByWeek[u.id] ?? {};
      const total = Object.values(byWeek).reduce((a, b) => a + b, 0);
      return {
        nome: `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
        reparto: u.department ?? '',
        minuti_periodo: total,
        ore_periodo: formatMinutesToHoursAndMinutes(total),
      };
    });
    exportToCsv(`statistiche-${format(new Date(), 'yyyy-MM-dd')}`, rows);
  }, [filteredUsers, minutesByUserByWeek]);


  if (!currentUser) return null;
  const uiW = (key: string) => isUiWidgetVisible(currentUser, key);
  const statsLoc = getDateLocale(effectiveLanguage) ?? it;
  const tv = t as Record<string, string>;
  const _staffSelfId = displayUsers[0]?.id ?? currentUser.id;
  const staffRangeTotalMins = Object.values(minutesByUserByWeek[currentUser.id] ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div className="pb-content pt-4 px-4 w-full max-w-7xl mx-auto font-sans">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      >
        {/* ── Toolbar 4-tab (tutti gli utenti) ──────────────────────── */}
        {/* eslint-disable-next-line no-constant-binary-expression */}
        {true && (
          <>
            <div className="ui-toolbar-page-band ui-toolbar-page-band-presences !h-auto !max-h-none min-h-0 w-full max-w-full relative z-[1000] mb-5">
              <div className="relative z-[1001] flex min-h-0 w-full min-w-0 flex-1 flex-row flex-nowrap items-center justify-start gap-2 overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
                <div className="ui-toolbar-row-tight min-w-0 flex-1 md:gap-2">
                  {/* ── MOBILE: stile semplificato (PERIODO pill + ← date →) ── */}
                  <div className="flex md:hidden shrink-0 flex-nowrap items-center gap-2">
                    <button type="button" onClick={() => { setStatsTab('period'); setNavOffset(0); }}
                      className="h-9 inline-flex items-center px-3 rounded-2xl bg-white/20 text-white text-xs font-extrabold uppercase tracking-wider shrink-0 shadow-sm active:bg-white/30 transition-colors">
                      {t.today}
                    </button>
                    <div className="flex items-center rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.28)' }}>
                      <button
                        type="button"
                        onClick={() => setNavOffset(o => o - 1)}
                        className="flex items-center justify-center h-9 w-9 text-white/60 hover:bg-white/10 transition-colors active:bg-white/80"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden />
                      </button>
                      <div className="flex items-center gap-1.5 px-2">
                        <Calendar className="h-3 w-3 text-white/60 shrink-0" aria-hidden />
                        <span className="text-xs font-bold text-white tabular-nums whitespace-nowrap">
                          {statsTab === 'current_week'
                            ? `S.${getISOWeek(rangeStart)} · ${format(rangeStart, 'd MMM', { locale: statsLoc })} – ${format(rangeEnd, 'd MMM', { locale: statsLoc })}`
                            : `${format(rangeStart, 'd MMM', { locale: statsLoc })} – ${format(rangeEnd, 'd MMM yy', { locale: statsLoc })}`
                          }
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setNavOffset(o => o + 1)}
                        className="flex items-center justify-center h-9 w-9 text-white/60 hover:bg-white/10 transition-colors active:bg-white/80"
                      >
                        <ChevronRight className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>

                  {/* ── DESKTOP: toolbar originale ── */}
                  <div className="hidden md:flex shrink-0 flex-nowrap items-center gap-2">
                  <div className="ui-toolbar-group">
                    <button
                      type="button"
                      onClick={() => setNavOffset(o => o - 1)}
                      className="ui-toolbar-tab !px-2.5 !text-xs shrink-0 hover:bg-white/10 disabled:opacity-30 active:bg-white/80"
                      style={{ color: 'rgba(255,255,255,0.80)' }}
                      aria-label={statsTab === 'current_week' ? 'Settimana precedente' : 'Periodo precedente'}
                    >
                      <ChevronLeft className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
                      <span>{t.nav_prev_abbr ?? 'Prec.'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStatsTab('current_week'); setNavOffset(0); }}
                      className={`ui-toolbar-tab !px-2.5 !text-xs shrink-0 ${
 statsTab === 'current_week'
 ? 'bg-white/20 text-white font-extrabold'
 : 'hover:bg-white/10'
 } active:bg-white/15`}
                      style={statsTab !== 'current_week' ? { color: 'rgba(255,255,255,0.80)' } : {}}
                    >
                      {t.view_week}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setStatsTab('period'); setNavOffset(0); }}
                      className={`ui-toolbar-tab !px-2.5 !text-xs shrink-0 ${
 statsTab === 'period' && navOffset === 0
 ? 'bg-white/20 text-white font-extrabold'
 : 'hover:bg-white/10'
 } active:bg-white/15`}
                      style={!(statsTab === 'period' && navOffset === 0) ? { color: 'rgba(255,255,255,0.80)' } : {}}
                    >
                      {t.view_month}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNavOffset(o => o + 1)}
                      className="ui-toolbar-tab !px-2.5 !text-xs shrink-0 hover:bg-white/10 disabled:opacity-30 active:bg-white/80"
                      style={{ color: 'rgba(255,255,255,0.80)' }}
                      aria-label={statsTab === 'current_week' ? 'Settimana successiva' : 'Periodo successivo'}
                    >
                      <span>{t.nav_next_abbr ?? 'Pros.'}</span>
                      <ChevronRight className="h-3.5 w-3.5 md:h-4 md:w-4" aria-hidden />
                    </button>
                  </div>
                  <div
                    className="ui-toolbar-chip shrink-0 max-w-full min-w-0 cursor-default select-none font-bold !px-3 !h-9 md:!h-10 !text-xs md:!text-sm"
                    role="status"
                  >
                    <Calendar className="h-3.5 w-3.5 md:h-4 md:w-4 shrink-0 text-white/50" aria-hidden />
                    <span className="min-w-0 truncate tabular-nums">
                      {statsTab === 'current_week' ? (
                        <>
                          <span className="text-white font-extrabold">S.{getISOWeek(rangeStart)}&nbsp;</span>
                          {format(rangeStart, 'dd/MM', { locale: statsLoc })}
                          <span className="text-white/45"> → {format(rangeEnd, 'dd/MM', { locale: statsLoc })}</span>
                        </>
                      ) : (
                        <>
                          {format(rangeStart, 'dd/MM', { locale: statsLoc })}
                          <span className="text-white/45"> → </span>
                          {format(rangeEnd, 'dd/MM/yy', { locale: statsLoc })}
                        </>
                      )}
                    </span>
                  </div>
                  </div>{/* end desktop wrapper */}
                </div>

              </div>

              {/* PDF + Filtro reparto — lato destro (renderizzato solo se c'è almeno un'azione disponibile) */}
              {((showManagementStatsChrome && isFeatureEnabled(currentUser, 'export_pdf')) || (isAdmin && departments.length > 0)) && (
              <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end md:w-auto md:flex-nowrap md:contents">
                <div className="relative flex min-h-9 w-full min-w-0 items-center justify-end gap-1 md:w-auto md:ml-auto md:min-h-10">
                  {showManagementStatsChrome && isFeatureEnabled(currentUser, 'export_pdf') && (
                    <div className="ui-toolbar-group">
                      <button
                        type="button"
                        onClick={() => void handleExportStatsPdf()}
                        className="ui-toolbar-tab !px-2.5 !text-xs shrink-0 hover:bg-white/10 active:bg-white/80"
                        style={{ color: 'rgba(255,255,255,0.80)' }}
                        title={t.download_pdf}
                        aria-label={t.download_pdf}
                      >
                        <FileDown className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0" aria-hidden />
                        <span className="hidden md:inline">{t.download_pdf}</span>
                      </button>
                    </div>
                  )}
                  {isAdmin && departments.length > 0 && (
                  <div className="relative">
                    <div className="ui-toolbar-group">
                    <button
                      type="button"
                      onClick={() => setShowDeptMenu(prev => !prev)}
                      className={`ui-toolbar-tab !px-2.5 !text-xs shrink-0 ${
 showDeptMenu ? 'bg-white/10 text-white/80' : 'hover:bg-white/10'
 } ${deptFilter !== 'all' ? 'font-extrabold' : ''} active:bg-white/15`}
                      style={!showDeptMenu ? { color: 'rgba(255,255,255,0.80)' } : {}}
                    >
                      <Filter className="h-3 w-3 md:h-3.5 md:w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                      <span className="max-w-[5rem] truncate">
                        {deptFilter === 'all' ? 'Reparti' : translateDepartmentValue(deptFilter, effectiveLanguage)}
                      </span>
                      <ChevronDown className={`h-3 w-3 md:h-3.5 md:w-3.5 text-white/45 transition-transform ${showDeptMenu ? 'rotate-180' : ''}`} />
                    </button>
                    </div>

                    <AnimatePresence>
                      {showDeptMenu && (
                        <>
                          {/* Desktop Dropdown */}
                          <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.95 }}
                            transition={{ duration: 0.1 }}
                            className="hidden md:block absolute right-0 top-full z-[300] mt-1 w-48 rounded-xl p-1 shadow-xl"
                            style={{
                              background: 'var(--bg-popover-solid, rgb(21, 40, 72))',
                              color: '#f1f5f9',
                              border: '1px solid rgba(255,255,255,0.15)',
                              isolation: 'isolate',
                            }}
                          >
                            <div className="px-2 py-1.5 text-xs font-bold uppercase tracking-wider text-white/60 border-b border-white/10 mb-1">
                              {t.department_filter_label}
                            </div>
                            <button type="button" onClick={() => { setDeptFilter('all'); setShowDeptMenu(false); }}
                              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[0.6875rem] font-bold transition-colors ${deptFilter === 'all' ? 'bg-white/20 text-white shadow-md' : 'text-white/80 hover:bg-white/10'} active:bg-white/15`}>
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                <Check className={`h-3 w-3 ${deptFilter === 'all' ? 'text-white' : 'text-white/80'}`} strokeWidth={3} />
                              </div>
                              <span className="flex-1 truncate">Tutti i reparti</span>
                              {deptFilter === 'all' && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                            </button>
                            <div className="my-1 h-px bg-white/10" />
                            {departments.map((d) => (
                              <button key={d.value} type="button" onClick={() => { setDeptFilter(d.value); setShowDeptMenu(false); }}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[0.6875rem] font-bold transition-colors ${deptFilter === d.value ? 'bg-white/20 text-white shadow-md' : 'text-white/80 hover:bg-white/10'} active:bg-white/15`}>
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                  <span className={`h-2.5 w-2.5 rounded-full shadow-sm ${deptFilter === d.value ? 'bg-white' : ''}`}
                                    style={deptFilter !== d.value ? { backgroundColor: d.color ?? getDeptColor(d.value) } : {}} />
                                </div>
                                <span className="flex-1 truncate" title={translateDepartmentValue(d.value, effectiveLanguage)}>{translateDepartmentValue(d.value, effectiveLanguage)}</span>
                                {deptFilter === d.value && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                              </button>
                            ))}
                          </motion.div>

                          {/* Mobile Modal */}
                          <div className="md:hidden">
                            <CenteredModalPortal
                              open={showDeptMenu}
                              onClose={() => setShowDeptMenu(false)}
                              maxWidthClass="max-w-[17.5rem]"
                              panelClassName="p-1 !text-slate-50"
                              panelStyle={{
                                background: 'var(--bg-popover-solid, rgb(21, 40, 72))',
                                color: '#f1f5f9',
                              }}
                              disableBackdropClose
                            >
                              <div className="flex items-center justify-between px-2 py-1.5 border-b border-white/10 mb-1">
                                <span className="text-xs font-bold uppercase tracking-wider text-white/45">{t.department_filter_label}</span>
                                <button type="button" onClick={() => setShowDeptMenu(false)} className="rounded-lg p-1 text-white/45 transition-colors hover:bg-white/10 hover:text-white/70 active:text-white/70 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]" aria-label={t.close}>
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <button type="button" onClick={() => { setDeptFilter('all'); setShowDeptMenu(false); }}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[0.6875rem] font-bold transition-colors ${deptFilter === 'all' ? 'bg-white/20 text-white shadow-md' : 'text-white/80 hover:bg-white/10'} active:bg-white/15`}>
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                  <Check className={`h-3 w-3 ${deptFilter === 'all' ? 'text-white' : 'text-white/80'}`} strokeWidth={3} />
                                </div>
                                <span className="flex-1 truncate">Tutti i reparti</span>
                                {deptFilter === 'all' && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                              </button>
                              <div className="my-1 h-px bg-white/10" />
                              {departments.map((d) => (
                                <button key={d.value} type="button" onClick={() => { setDeptFilter(d.value); setShowDeptMenu(false); }}
                                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[0.6875rem] font-bold transition-colors ${deptFilter === d.value ? 'bg-white/20 text-white shadow-md' : 'text-white/80 hover:bg-white/10'} active:bg-white/15`}>
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                    <span className={`h-2.5 w-2.5 rounded-full shadow-sm ${deptFilter === d.value ? 'bg-white' : ''}`}
                                      style={deptFilter !== d.value ? { backgroundColor: d.color ?? getDeptColor(d.value) } : {}} />
                                  </div>
                                  <span className="flex-1 truncate" title={translateDepartmentValue(d.value, effectiveLanguage)}>{translateDepartmentValue(d.value, effectiveLanguage)}</span>
                                  {deptFilter === d.value && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                                </button>
                              ))}
                            </CenteredModalPortal>
                          </div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                  )}
                </div>
              </div>
              )}
             </div>
          </>
        )}

        {showManagementStatsChrome && (
          <div className="mb-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-white/70">
                {tv.stats_analytics_title ?? 'Analytics'}
              </p>
              <button
                type="button"
                onClick={handleExportStatsCsv}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white/15 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
              >
                <FileDown className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {tv.stats_export_csv ?? 'Export CSV'}
              </button>
            </div>
            <div className="fluid-grid fluid-grid-4 gap-3">
              <div
                className="rounded-2xl border border-white/12 px-3 py-3"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <p className="text-[0.625rem] font-bold uppercase tracking-wider text-white/45">
                  {tv.stats_kpi_month_hours ?? 'Ore mese (calendario)'}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-white">
                  {formatMinutesToHoursAndMinutes(kpiMonthTotalMins)}
                </p>
              </div>
              <div
                className="rounded-2xl border border-white/12 px-3 py-3"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <p className="text-[0.625rem] font-bold uppercase tracking-wider text-white/45">
                  {tv.stats_kpi_present_absent ?? 'Presenze / assenze (mese)'}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-white">
                  {kpiPresentAbsent.pres} / {kpiPresentAbsent.abs}
                </p>
              </div>
              <div
                className="rounded-2xl border border-white/12 px-3 py-3"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <p className="text-[0.625rem] font-bold uppercase tracking-wider text-white/45">
                  {tv.stats_kpi_avg_week ?? 'Media ore / sett. (vista)'}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-white">
                  {formatMinutesToHoursAndMinutes(kpiAvgWeeklyMins)}
                </p>
              </div>
              <div
                className="rounded-2xl border border-white/12 px-3 py-3"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <p className="text-[0.625rem] font-bold uppercase tracking-wider text-white/45">
                  {tv.stats_kpi_active_today ?? 'Dipendenti con turno oggi'}
                </p>
                <p className="mt-1 text-lg font-bold tabular-nums text-white">{kpiActiveToday}</p>
              </div>
            </div>
            <div
              className="rounded-2xl border border-white/12 p-4"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wider text-white/50">
                {tv.stats_trend_8w ?? 'Trend ultime 8 settimane'}
              </p>
              {(() => {
                const w = 1000;
                const h = 120;
                const pad = 12;
                const maxM = Math.max(1, ...eightWeekTrend.map((t) => t.minutes));
                const n = eightWeekTrend.length;
                const pts = eightWeekTrend.map((t, i) => {
                  const x = n <= 1 ? w / 2 : pad + (i / (n - 1)) * (w - 2 * pad);
                  const y = h - pad - (t.minutes / maxM) * (h - 2 * pad);
                  return [x, y] as const;
                });
                const lineD =
                  pts.length === 0
                    ? ''
                    : `M ${pts[0]![0]} ${pts[0]![1]}` +
                      pts
                        .slice(1)
                        .map((p) => ` L ${p[0]} ${p[1]}`)
                        .join('');
                const areaD =
                  pts.length > 1
                    ? `${lineD} L ${pts[pts.length - 1]![0]} ${h} L ${pts[0]![0]} ${h} Z`
                    : '';
                return (
                  <svg
                    viewBox={`0 0 ${w} ${h}`}
                    className="h-32 w-full"
                    role="img"
                    aria-label={tv.stats_trend_8w ?? 'Trend ore'}
                  >
                    <defs>
                      <linearGradient id="statsLine" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(0 82 255)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="rgb(0 82 255)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {areaD ? <path d={areaD} fill="url(#statsLine)" /> : null}
                    {lineD ? (
                      <path
                        d={lineD}
                        fill="none"
                        stroke="rgb(0 120 255)"
                        strokeWidth="2.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    ) : null}
                  </svg>
                );
              })()}
              <div className="mt-1 flex justify-between text-[0.5625rem] font-semibold text-white/40">
                {eightWeekTrend.map((t) => (
                  <span key={t.key}>{t.label}</span>
                ))}
              </div>
            </div>
          </div>
        )}

        {showManagementStatsChrome && payrollForCalendarMonth && uiW('stats.table') && (
          <div className="mb-4 rounded-2xl px-4 py-3.5 text-sm"
            style={{
              background: 'rgba(255,255,255,0.11)',
              border: '1px solid rgba(255,255,255,0.18)',
            }}
          >
            <p className="font-bold text-white">
              {tv.stats_payroll_title ?? 'Pagamento stipendi'}
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-snug text-white/60">
              {tv.stats_payroll_hint}
            </p>
            <p className="mt-2 font-semibold text-cyan-300">
              {formatTrans(tv.stats_payroll_date_line ?? 'Data prevista: {date}', {
                date: format(payrollForCalendarMonth.payDate, 'EEEE d MMMM yyyy', { locale: statsLoc }),
              })}
            </p>
          </div>
        )}

        {/* ── Tabella ore: solo card (stesso stile “Le tue ore nell’intervallo…”), niente scroll orizzontale ─ */}
        {!showManagementStatsChrome && (
          <div className="mb-8 md:mb-6">

            {/* ── DESKTOP: card unica con tabella (invariato) ── */}
            <div className="hidden md:block rounded-xl border border-neutral-500 overflow-hidden border-l-4 border-l-white/30 border border-neutral-500">
              <div className="flex items-center justify-between gap-3 px-5 py-4 md:px-6">
                <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-white/80">
                  {t.stats_your_hours_in_range}
                </p>
                <p className="text-2xl font-bold tabular-nums text-white">
                  {staffRangeTotalMins > 0 ? formatMinutesToHoursAndMinutes(staffRangeTotalMins) : '–'}
                </p>
              </div>
              {staffRangeTotalMins === 0 ? (
                <div className="border-t border-white/10 flex flex-col items-center gap-3 p-8 pb-12 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
                    <Calendar className="h-5 w-5 text-white/60" />
                  </div>
                  <p className="text-sm font-semibold text-white">{t.stats_no_data}</p>
                  <p className="max-w-xs text-xs leading-relaxed text-white/50">{t.stats_no_confirmed_shifts_period}</p>
                </div>
              ) : (
                <div className="border-t border-neutral-500">
                  {weeksInRange.map((w) => {
                    const weekMins = minutesByUserByWeek[currentUser.id]?.[w.key] ?? 0;
                    const clampedStart = w.start < rangeStart ? rangeStart : w.start;
                    const clampedEnd   = w.end   > rangeEnd   ? rangeEnd   : w.end;
                    const weekDays = eachDayOfInterval({ start: clampedStart, end: clampedEnd });
                    return (
                      <div key={`staff-d-${w.key}`} className="border-b border-white/10 last:border-0">
                        <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
                            <table className="w-full border-collapse border border-white/12" style={{ minWidth: `${weekDays.length * 60 + 120}px` }}>
                            <thead>
                              <tr className="bg-white/10">
                                <th className="py-2 pl-5 pr-2 text-left text-[0.6875rem] font-bold uppercase tracking-wider text-white/70 border border-white/12">
                                  {w.label}
                                </th>
                                {weekDays.map((day) => (
                                  <th key={format(day, 'yyyy-MM-dd')} className="px-2 py-2 text-center min-w-[3.75rem] border border-white/12">
                                    <span className="block text-[0.6875rem] font-bold uppercase tracking-wider text-white/70">
                                      {format(day, 'EEE', { locale: statsLoc })}
                                    </span>
                                    <span className="block text-[0.6875rem] font-semibold text-white/45 tabular-nums">
                                      {format(day, 'dd/MM')}
                                    </span>
                                  </th>
                                ))}
                                <th className="py-2 pl-2 pr-5 text-right text-[0.6875rem] font-bold uppercase tracking-wider text-white/70 min-w-[3.75rem] border border-white/12 bg-white/10">
                                  Tot.
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="py-2 pl-5 pr-2 border border-white/12 text-[0.6875rem] text-white/45" />
                                {weekDays.map((day) => {
                                  const dayKey = format(day, 'yyyy-MM-dd');
                                  const mins = minutesByUserByDay[currentUser.id]?.[dayKey] ?? 0;
                                  return (
                                    <td key={dayKey} className="px-2 py-2.5 text-center tabular-nums border border-white/12">
                                      {mins > 0 ? (
                                        <span className="text-[0.8125rem] font-bold text-white">
                                          {formatMinutesToHoursAndMinutes(mins)}
                                        </span>
                                      ) : (
                                        <span className="text-[0.8125rem] text-white/25">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="py-2.5 pl-2 pr-5 text-right tabular-nums border border-white/12 bg-white/5">
                                  <span className={`text-[0.8125rem] font-extrabold ${weekMins > 0 ? 'text-white' : 'text-white/25'}`}>
                                    {weekMins > 0 ? formatMinutesToHoursAndMinutes(weekMins) : '—'}
                                  </span>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {uiW('stats.table') && displayUsers.length > 1 && (
          <div className="mb-6 space-y-4">
            {showManagementStatsChrome && (
              <div className="rounded-xl border border-neutral-500 overflow-hidden border-l-4 border-l-white/30 border border-neutral-500">
                {/* Intestazione totale */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 md:px-6">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-white/80">
                    {tv.stats_mgmt_personal_hours_period ?? t.stats_your_hours_in_range}
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-white">
                    {mgmtPersonalTotalMins > 0 ? formatMinutesToHoursAndMinutes(mgmtPersonalTotalMins) : '–'}
                  </p>
                </div>
                {/* Griglia giornaliera per settimana */}
                {mgmtPersonalTotalMins > 0 && (
                  <div className="border-t border-neutral-500">
                    {weeksInRange.map((w) => {
                      const weekMins = minutesByUserByWeek[currentUser.id]?.[w.key] ?? 0;
                      const clampedStart = w.start < rangeStart ? rangeStart : w.start;
                      const clampedEnd   = w.end   > rangeEnd   ? rangeEnd   : w.end;
                      const weekDays = eachDayOfInterval({ start: clampedStart, end: clampedEnd });
                      return (
                        <div key={`self-${w.key}`} className="border-b border-white/10 last:border-0">
                          {/* ── Mobile: layout fisso senza scroll ── */}
                          <div className="md:hidden px-3 py-2">
                            <div className="flex items-center justify-between mb-1.5">
                              <span className="text-[0.6875rem] font-bold uppercase tracking-wide text-white/70">
                                {format(clampedStart, 'dd/MM')} → {format(clampedEnd, 'dd/MM')}
                              </span>
                              <span className={`text-sm font-extrabold tabular-nums ${weekMins > 0 ? 'text-white' : 'text-white/50'}`}>
                                {weekMins > 0 ? formatMinutesToHoursAndMinutes(weekMins) : '—'}
                              </span>
                            </div>
                            <div className="grid gap-px" style={{ gridTemplateColumns: `repeat(${weekDays.length}, 1fr)` }}>
                              {weekDays.map((day) => {
                                const dayKey = format(day, 'yyyy-MM-dd');
                                const mins = minutesByUserByDay[currentUser.id]?.[dayKey] ?? 0;
                                return (
                                  <div key={dayKey} className="flex flex-col items-center py-1.5 rounded">
                                    <span className="block text-[0.6875rem] font-bold uppercase text-white/60 leading-none mb-0.5">
                                      {format(day, 'EEE', { locale: statsLoc }).slice(0, 3)}
                                    </span>
                                    <span className="block text-[0.6875rem] text-white/50 tabular-nums leading-none mb-1">
                                      {format(day, 'dd')}
                                    </span>
                                    {mins > 0 ? (
                                      <span className="text-[0.6875rem] font-bold text-white tabular-nums leading-none">
                                        {formatMinutesToHoursAndMinutes(mins)}
                                      </span>
                                    ) : (
                                      <span className="text-[0.6875rem] text-white/40 leading-none">—</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          {/* ── Desktop: tabella scrollabile ── */}
                          <div className="hidden md:block overflow-x-auto [-webkit-overflow-scrolling:touch]">
                            <table className="w-full border-collapse table-fixed" style={{ minWidth: `${weekDays.length * 72 + 130}px` }}>
                              <colgroup>
                                <col style={{ width: '120px' }} />
                                {weekDays.map((day) => (
                                  <col key={format(day, 'yyyy-MM-dd')} style={{ width: '72px' }} />
                                ))}
                                <col style={{ width: '72px' }} />
                              </colgroup>
                              <thead>
                                <tr>
                                  <th className="py-2 pl-5 pr-2 text-left text-[0.6875rem] font-bold uppercase tracking-wider text-white/60">
                                    {w.label}
                                  </th>
                                  {weekDays.map((day) => (
                                    <th key={format(day, 'yyyy-MM-dd')} className="py-2 px-1 text-center">
                                      <span className="block text-[0.6875rem] font-bold uppercase tracking-wider text-white/60">
                                        {format(day, 'EEE', { locale: statsLoc })}
                                      </span>
                                      <span className="block text-[0.6875rem] font-semibold text-white/60 tabular-nums">
                                        {format(day, 'dd/MM')}
                                      </span>
                                    </th>
                                  ))}
                                  <th className="py-2 pr-5 text-right text-[0.6875rem] font-bold uppercase tracking-wider text-white/60">
                                    Tot.
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  {/* Colonna label settimana (allineata con l'header) */}
                                  <td />
                                  {weekDays.map((day) => {
                                    const dayKey = format(day, 'yyyy-MM-dd');
                                    const mins = minutesByUserByDay[currentUser.id]?.[dayKey] ?? 0;
                                    return (
                                      <td key={dayKey} className="py-2.5 px-1 text-center tabular-nums">
                                        {mins > 0 ? (
                                          <span className="text-[0.8125rem] font-bold text-white">
                                            {formatMinutesToHoursAndMinutes(mins)}
                                          </span>
                                        ) : (
                                          <span className="text-[0.8125rem] font-normal text-white/40">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className="py-2.5 pr-5 text-right tabular-nums">
                                    <span className={`text-[0.8125rem] font-extrabold ${weekMins > 0 ? 'text-white' : 'text-white/40'}`}>
                                      {weekMins > 0 ? formatMinutesToHoursAndMinutes(weekMins) : '—'}
                                    </span>
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {showManagementStatsChrome && (
              <div className="rounded-xl border border-neutral-500 border-l-4 border-l-white/30 border border-neutral-500 p-5 md:p-6">
                <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-widest text-white/80">
                  {deptFilter === 'all' ? (tv.stats_team_hours_period ?? t.stats_total) : `TOTALE ${translateDepartmentValue(deptFilter, effectiveLanguage).toUpperCase()}`}
                </p>
                <p className="text-3xl font-bold tabular-nums text-white/80">
                  {formatMinutesToHoursAndMinutes(totalMinutesFiltered)}
                </p>
              </div>
            )}
            {!hasDataInRange ? (
              <div className="rounded-xl border border-neutral-500 flex flex-col items-center gap-3 p-8 text-center md:p-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  <Calendar className="h-6 w-6 text-white/25" />
                </div>
                <p className="text-sm font-semibold text-white">{t.stats_no_data}</p>
                <p className="max-w-xs text-xs text-white/50">{t.stats_no_confirmed_shifts_period}</p>
              </div>
            ) : (
              weeksInRange.map((w) => {
                const weekTotal = weekTotalsByKey[w.key] ?? 0;
                // Giorni della settimana ritagliati sul range selezionato
                const clampedStart = w.start < rangeStart ? rangeStart : w.start;
                const clampedEnd   = w.end   > rangeEnd   ? rangeEnd   : w.end;
                const weekDays = eachDayOfInterval({ start: clampedStart, end: clampedEnd });
                return (
                  <div key={w.key} className="overflow-hidden rounded-2xl" style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 4px 16px -4px rgba(0,0,0,0.35)' }}>
                    {/* Intestazione settimana */}
                    <div className="px-4 py-2.5 md:px-5 border-b border-white/12 bg-white/5 flex items-center justify-between gap-3">
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-white/80">{w.label}</p>
                      {showManagementStatsChrome && weekTotal > 0 && (
                        <span className="tabular-nums text-sm font-extrabold text-white/80">
                          {formatMinutesToHoursAndMinutes(weekTotal)}
                        </span>
                      )}
                    </div>
                    {/* ── Mobile: layout compatto senza scroll ── */}
                    <div className="md:hidden px-3 pb-3 pt-1 space-y-1.5">
                      {/* Header giorni (fisso per tutte le righe) */}
                      <div className="flex items-center gap-1">
                        <div className="w-[4.5rem] shrink-0" />
                        <div className="grid flex-1 gap-0" style={{ gridTemplateColumns: `repeat(${weekDays.length}, 1fr)` }}>
                          {weekDays.map((day) => (
                            <div key={format(day, 'yyyy-MM-dd')} className="flex flex-col items-center">
                              <span className="text-[0.4375rem] font-bold uppercase text-white/80 leading-none">
                                {format(day, 'EEE', { locale: statsLoc }).slice(0, 3)}
                              </span>
                              <span className="text-[0.4375rem] text-white/35 tabular-nums leading-none mt-0.5">
                                {format(day, 'dd')}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="w-[2.75rem] shrink-0 text-right text-[0.4375rem] font-bold uppercase text-white/35">Tot.</div>
                      </div>
                      {/* Righe utenti */}
                      {filteredUsers.map((u, i) => {
                        const userWeekTotal = minutesByUserByWeek[u.id]?.[w.key] ?? 0;
                        const rowBg = i % 2 === 0 ? 'bg-white/5' : '';
                        return (
                          <div key={u.id} className={`flex items-center gap-1 rounded-lg py-1.5 ${rowBg}`}>
                            <div className="w-[4.5rem] shrink-0 pl-1">
                              <span className="block text-xs font-semibold uppercase tracking-wide text-white/80 truncate">
                                {(u.first_name ?? '').trim() || '—'}
                              </span>
                              {deptFilter === 'all' && u.department && (
                                <span className="block text-[0.6875rem] font-bold text-white/45 uppercase leading-none truncate mt-0.5" title={translateDepartmentValue(u.department, effectiveLanguage)}>{translateDepartmentValue(u.department, effectiveLanguage)}
                                </span>
                              )}
                            </div>
                            <div className="grid flex-1 gap-0" style={{ gridTemplateColumns: `repeat(${weekDays.length}, 1fr)` }}>
                              {weekDays.map((day) => {
                                const dayKey = format(day, 'yyyy-MM-dd');
                                const mins = minutesByUserByDay[u.id]?.[dayKey] ?? 0;
                                return (
                                  <div key={dayKey} className="flex items-center justify-center">
                                    {mins > 0 ? (
                                      <span className="text-xs font-bold text-white/80 tabular-nums">
                                        {formatMinutesToHoursAndMinutes(mins)}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-white/25">—</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div className="w-[2.75rem] shrink-0 text-right pr-1">
                              <span className={`text-[0.6875rem] font-extrabold tabular-nums ${userWeekTotal > 0 ? 'text-white/80' : 'text-white/25'}`}>
                                {userWeekTotal > 0 ? formatMinutesToHoursAndMinutes(userWeekTotal) : '—'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {/* Footer totali giornalieri su mobile */}
                      {showManagementStatsChrome && weekTotal > 0 && (
                        <div className="flex items-center gap-1 pt-1 border-t border-white/12 mt-1 rounded-lg">
                          <div className="w-[4.5rem] shrink-0 pl-1 text-[0.6875rem] font-bold uppercase tracking-wide text-white/80">
                            {t.stats_total}
                          </div>
                          <div className="grid flex-1 gap-0" style={{ gridTemplateColumns: `repeat(${weekDays.length}, 1fr)` }}>
                            {weekDays.map((day) => {
                              const dayKey = format(day, 'yyyy-MM-dd');
                              const dayTotal = dayTotalsByDate[dayKey] ?? 0;
                              return (
                                <div key={dayKey} className="flex items-center justify-center">
                                  {dayTotal > 0 ? (
                                    <span className="text-xs font-bold text-white/80 tabular-nums">
                                      {formatMinutesToHoursAndMinutes(dayTotal)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-white/25">—</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="w-[2.75rem] shrink-0 text-right pr-1">
                            <span className="text-[0.6875rem] font-extrabold text-white/80 tabular-nums">
                              {formatMinutesToHoursAndMinutes(weekTotal)}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                    {/* ── Desktop: tabella scrollabile ── */}
                    <div className="hidden md:block overflow-x-auto [-webkit-overflow-scrolling:touch]">
                      <table className="w-full border-collapse table-fixed" style={{ minWidth: `${weekDays.length * 72 + 140}px` }}>
                        <colgroup>
                          <col style={{ width: '130px' }} />
                          {weekDays.map((day) => (
                            <col key={format(day, 'yyyy-MM-dd')} style={{ width: '72px' }} />
                          ))}
                          <col style={{ width: '72px' }} />
                        </colgroup>
                        <thead>
                          <tr className="bg-white/8" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                            <th className="sticky left-0 z-10 bg-white/8 backdrop-blur-sm py-2 pl-5 pr-3 text-left text-[0.6875rem] font-bold uppercase tracking-wider text-white/80 border-r border-white/12">
                              {tv.department_filter_label ?? 'Nome'}
                            </th>
                            {weekDays.map((day) => (
                              <th key={format(day, 'yyyy-MM-dd')} className="py-2 px-1 text-center border-r border-white/10 last:border-r-0">
                                <span className="block text-[0.6875rem] font-bold uppercase tracking-wider text-white/80">
                                  {format(day, 'EEE', { locale: statsLoc })}
                                </span>
                                <span className="block text-[0.6875rem] font-semibold text-white/80 tabular-nums">
                                  {format(day, 'dd/MM')}
                                </span>
                              </th>
                            ))}
                            <th className="py-2 pr-5 text-right text-[0.6875rem] font-bold uppercase tracking-wider text-white/80">
                              Tot.
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((u, i) => {
                            const userWeekTotal = minutesByUserByWeek[u.id]?.[w.key] ?? 0;
                            const rowBg = i % 2 === 0 ? 'bg-white/5' : '';
                            return (
                              <tr key={u.id} className={`${rowBg} depth-row`}>
                                <td className={`sticky left-0 z-10 backdrop-blur-sm py-2.5 pl-5 pr-3 border-r border-white/12 ${i % 2 === 0 ? 'bg-white/5' : 'bg-white/3'}`}>
                                  <span className="block text-[0.6875rem] font-semibold uppercase tracking-wide text-white truncate">
                                    {(u.first_name ?? '').trim() || '—'}
                                  </span>
                                  {deptFilter === 'all' && u.department && (
                                    <span className="block text-[0.6875rem] font-bold text-white/45 uppercase tracking-wider truncate" title={translateDepartmentValue(u.department, effectiveLanguage)}>{translateDepartmentValue(u.department, effectiveLanguage)}
                                    </span>
                                  )}
                                </td>
                                {weekDays.map((day) => {
                                  const dayKey = format(day, 'yyyy-MM-dd');
                                  const mins = minutesByUserByDay[u.id]?.[dayKey] ?? 0;
                                  return (
                                    <td key={dayKey} className="py-2.5 px-1 text-center tabular-nums border-r border-white/8 last:border-r-0">
                                      {mins > 0 ? (
                                        <span className="text-[0.8125rem] font-bold text-white/80">
                                          {formatMinutesToHoursAndMinutes(mins)}
                                        </span>
                                      ) : (
                                        <span className="text-[0.8125rem] font-normal text-white/25">—</span>
                                      )}
                                    </td>
                                  );
                                })}
                                <td className="py-2.5 pr-5 text-right tabular-nums">
                                  <span className={`text-[0.8125rem] font-extrabold ${userWeekTotal > 0 ? 'text-white/80' : 'text-white/25'}`}>
                                    {userWeekTotal > 0 ? formatMinutesToHoursAndMinutes(userWeekTotal) : '—'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        {showManagementStatsChrome && (
                          <tfoot>
                            <tr className="bg-white/8" style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15)' }}>
                              <td className="sticky left-0 z-10 bg-white/8 py-2.5 pl-5 pr-3 text-[0.6875rem] font-bold uppercase tracking-wider text-white/80 border-r border-white/12">
                                {t.stats_total}
                              </td>
                              {weekDays.map((day) => {
                                const dayKey = format(day, 'yyyy-MM-dd');
                                const dayTotal = dayTotalsByDate[dayKey] ?? 0;
                                return (
                                  <td key={dayKey} className="py-2.5 px-1 text-center tabular-nums border-r border-white/10 last:border-r-0">
                                    {dayTotal > 0 ? (
                                      <span className="text-[0.8125rem] font-bold text-white/80">
                                        {formatMinutesToHoursAndMinutes(dayTotal)}
                                      </span>
                                    ) : (
                                      <span className="text-[0.8125rem] font-normal text-white/25">—</span>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="py-2.5 pr-5 text-right tabular-nums">
                                <span className="text-[0.8125rem] font-extrabold text-white/80">
                                  {weekTotal > 0 ? formatMinutesToHoursAndMinutes(weekTotal) : '—'}
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

      </motion.div>
    </div>
  );
})
