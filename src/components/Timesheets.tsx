import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  format,
  addDays,
  parseISO,
  isToday,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
} from 'date-fns';
import { it } from 'date-fns/locale';
import {
  ChevronLeft, ChevronRight, Check, AlertTriangle, X,
  Clock, History, FileEdit, ShieldAlert, LogOut, Lock, Unlock,
  Users, UserCheck, AlertCircle, ArrowRight, Calendar, Moon,
  ChevronDown, MoreHorizontal,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { getTranslations, getDateLocale, formatTrans } from '../utils/translations';
import { calculateShiftMinutesGross, formatMinutesToHoursAndMinutes } from '../utils/timeCalculations';
import { getBreakMinutesForShift, getNetShiftMinutes } from '../utils/breakRules';
import {
  isPurelyManagementRole,
  isUserVisibleOnTeamSchedule,
  canOperateTeamSchedule,
  canApproveShiftActions,
} from '../utils/permissions';
import { isFeatureEnabled } from '../utils/enabledFeatures';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';
import { getShiftHistory, type HistoryEntry } from '../utils/scheduleHistory';
import { database } from '../lib/database';
import {
  loadPeriodConfig,
  savePeriodConfig as persistPeriodConfig,
  getPeriodStartDate,
  getPeriodEndDate,
  PERIOD_STORAGE_KEY,
  dispatchPeriodConfigUpdated,
  type PeriodConfig,
} from '../utils/periodConfig';
import { saveTimesheetPeriodToSupabase } from '../utils/timesheetPeriodSupabase';
import type { PunchAuditEntry, Shift } from '../types';
import { getResolvedStartEndForHours } from '../utils/shiftResolvedClockTimes';
import { HorizontalScrollArea } from './HorizontalScrollArea';
import DatePickerField from './DatePickerField';
import { isDatePickerPortalClick } from '../utils/datePickerPortal';
import TimesheetManagementKpiBlock from './TimesheetManagementKpiBlock';
import { CenteredModalPortal } from './ui/CenteredModalPortal';
import { getPayrollPaymentDateForCalendarMonth } from '../utils/payrollSchedule';

// ── Helpers ─────────────────────────────────────────────────────────────────

function toMinutesFromMidnight(hhmm: string): number {
  const [h, m] = (hhmm || '00:00').slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fmtHM(mins: number): string {
  if (mins === 0) return '0h';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  const sign = mins < 0 ? '−' : '';
  return m > 0 ? `${sign}${h}h${m.toString().padStart(2, '0')}` : `${sign}${h}h`;
}

/** Formatta un valore audit: se è un ISO timestamp lo converte in dd/MM HH:mm, altrimenti lo restituisce as-is */
function fmtAuditValue(v: string | null | undefined): string {
  if (!v) return '—';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    try {
      const d = new Date(v);
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { return v; }
  }
  return v;
}

function punchTimeHHMM(ts: string | null | undefined): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return null; }
}

/** Indice settimana nel periodo Presenze: sopravvive a uscite dalla pagina (stesso browser). */
function timesheetWeekStorageKey(startDate: string, numWeeks: 4 | 5): string {
  return `osteria_ts_weekIdx_${startDate}_${numWeeks}`;
}

function readStoredWeekIndex(startDate: string, numWeeks: 4 | 5): number {
  try {
    const raw = sessionStorage.getItem(timesheetWeekStorageKey(startDate, numWeeks));
    if (raw == null) return 0;
    const n = parseInt(raw, 10);
    const max = numWeeks - 1;
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(n, max);
  } catch {
    return 0;
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ClosingShiftState {
  shiftId: string;
  punchInId: string;
  dateStr: string;
  plannedStart: string;
  plannedEnd: string;
  plannedMins: number;
  actualStart: string;
  employeeName: string;
}

interface ShiftRow {
  id: string;
  plannedStart: string;
  plannedEnd: string;
  plannedMins: number;
  breakMinutes: number;
  actualStart: string | null;
  actualEnd: string | null;
  actualEndFull?: string;
  actualMins: number;
  deltaMins: number;
  status: 'approved' | 'confirmed' | 'draft';
  punched: boolean;
  punchInId?: string;
  punchOutId?: string;
  isLate: boolean;
  hasMissingOut: boolean;
  isCrossDay?: boolean;
  approved_by?: string;
  approved_at?: string;
}

interface DayData {
  dateStr: string;
  shifts: ShiftRow[];
  totalPlannedMins: number;
  totalActualMins: number;
  totalDeltaMins: number;
}

interface DrawerData {
  shift: ShiftRow;
  userId: string;
  employeeName: string;
  department?: string;
  dateStr: string;
  punchAuditEntries: PunchAuditEntry[];
  shiftEdits: HistoryEntry[];
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Timesheets() {
  const { users, shifts, punchRecords, currentUser, updateShift, approveShift, updatePunchRecord, effectiveLanguage, showSuccess, showError, featureFlags, breakRules } = useApp();
  const t = getTranslations(effectiveLanguage);
  const locale = getDateLocale(effectiveLanguage) ?? it;

  const formatAuditValue = useCallback((raw: string | undefined) => {
    if (raw == null || raw === '') return '—';
    if (raw.length >= 12 && (raw.includes('T') || /^\d{4}-\d{2}-\d{2}/.test(raw))) {
      try {
        const d = parseISO(raw);
        if (!Number.isNaN(d.getTime())) return format(d, 'dd/MM HH:mm', { locale });
      } catch {
        /* ignore */
      }
    }
    return raw.length > 40 ? `${raw.slice(0, 37)}…` : raw;
  }, [locale]);

  const punchAuditFieldLabel = useCallback(
    (field: string) => {
      const tr = t as Record<string, string>;
      if (field === 'timestamp') return tr.ts_audit_field_timestamp || 'Entrata';
      if (field === 'calculated_time') return tr.ts_audit_field_calculated_time || 'Entrata (arrotondata)';
      if (field === 'clock_out_time') return tr.ts_audit_field_clock_out_time || 'Uscita';
      return field;
    },
    [t]
  );

  const canTeamTimesheetOps = currentUser ? canOperateTeamSchedule(currentUser) : false;
  const canTimesheetApprove = currentUser ? canApproveShiftActions(currentUser) : false;
  const uiW = (key: string) => (currentUser ? isUiWidgetVisible(currentUser, key) : false);

  const now = new Date();
  const initialConfig = loadPeriodConfig();
  /** Evita setWeekIndex(0) se loadPeriodConfig() coincide con il periodo già in memoria (es. rientro su Presenze). */
  const periodSyncRef = useRef<{ startDate: string; numWeeks: 4 | 5 } | null>(null);
  const [periodConfig, setPeriodConfig] = useState(initialConfig);
  const [periodStart, setPeriodStart] = useState<string>(initialConfig.startDate);
  const [periodNumWeeks, setPeriodNumWeeks] = useState<4 | 5>(initialConfig.numWeeks);
  const [periodSaved, setPeriodSaved] = useState(true);

  const handleSavePeriodConfig = () => {
    const cfg = { startDate: periodStart, numWeeks: periodNumWeeks };
    persistPeriodConfig(cfg);
    setPeriodConfig(cfg);
    setPeriodSaved(true);
    setWeekIndex(0);
    dispatchPeriodConfigUpdated();
    showSuccess?.(t.ts_period_saved);
    void saveTimesheetPeriodToSupabase(cfg).catch(() => {
      showError?.(t.ts_period_cloud_failed);
    });
  };

  /** Allinea stato UI al periodo salvato in localStorage (altri profili, altre schede, evento globale). */
  const applyPeriodFromStorage = useCallback(() => {
    const cfg = loadPeriodConfig();
    const prev = periodSyncRef.current;
    const configChanged =
      prev !== null && (prev.startDate !== cfg.startDate || prev.numWeeks !== cfg.numWeeks);
    periodSyncRef.current = { startDate: cfg.startDate, numWeeks: cfg.numWeeks };

    setPeriodConfig(cfg);
    setPeriodStart(cfg.startDate);
    setPeriodNumWeeks(cfg.numWeeks);
    setPeriodSaved(true);
    if (configChanged) setWeekIndex(0);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onCustom = () => applyPeriodFromStorage();
    const onStorage = (e: StorageEvent) => {
      if (e.key === PERIOD_STORAGE_KEY) applyPeriodFromStorage();
    };
    window.addEventListener('osteria_period_updated', onCustom);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('osteria_period_updated', onCustom);
      window.removeEventListener('storage', onStorage);
    };
  }, [applyPeriodFromStorage]);

  useEffect(() => {
    if (!currentUser?.id) return;
    applyPeriodFromStorage();
  }, [currentUser?.id, applyPeriodFromStorage]);

  /** Da notifiche / Statistiche: filtra la griglia Presenze (es. solo turni pubblicati). */
  useEffect(() => {
    try {
      const v = sessionStorage.getItem('osteria_timesheet_filter');
      if (!v) return;
      sessionStorage.removeItem('osteria_timesheet_filter');
      if (v === 'confirmed' || v === 'approved' || v === 'draft' || v === 'unpunched') {
        setFilterStatus(v);
      }
    } catch {
      /* ignore */
    }
  }, []);

  type ViewMode = 'week' | 'month';
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekIndex, setWeekIndex] = useState(() =>
    readStoredWeekIndex(initialConfig.startDate, initialConfig.numWeeks)
  );

  const [timesheetActionsOpen, setTimesheetActionsOpen] = useState(false);
  const timesheetActionsRef = useRef<HTMLDivElement>(null);
  const timesheetActionsModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!timesheetActionsOpen) return;
    const handleClick = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (timesheetActionsModalRef.current?.contains(tgt)) return;
      if (timesheetActionsRef.current?.contains(tgt)) return;
      if (isDatePickerPortalClick(e.target)) return;
      setTimesheetActionsOpen(false);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [timesheetActionsOpen]);

  /** Periodo effettivo in griglia: bozza (data/settimane) finché non si salva, altrimenti config persistita. */
  const displayPeriodConfig: PeriodConfig = useMemo(() => {
    if (periodSaved) return periodConfig;
    const startStr = periodStart.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) {
      return { startDate: periodConfig.startDate, numWeeks: periodNumWeeks };
    }
    const d = parseISO(startStr);
    if (Number.isNaN(d.getTime())) {
      return { startDate: periodConfig.startDate, numWeeks: periodNumWeeks };
    }
    return { startDate: startStr, numWeeks: periodNumWeeks };
  }, [periodSaved, periodConfig, periodStart, periodNumWeeks]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        timesheetWeekStorageKey(displayPeriodConfig.startDate, displayPeriodConfig.numWeeks),
        String(weekIndex)
      );
    } catch {
      /* ignore */
    }
  }, [displayPeriodConfig.startDate, displayPeriodConfig.numWeeks, weekIndex]);

  const periodStartDate = getPeriodStartDate(displayPeriodConfig);
  const periodEndDate = getPeriodEndDate(displayPeriodConfig);
  const allPeriodDays = (() => {
    try {
      const end = periodEndDate >= periodStartDate ? periodEndDate : addDays(periodStartDate, 6);
      return eachDayOfInterval({ start: periodStartDate, end });
    } catch {
      return eachDayOfInterval({ start: periodStartDate, end: addDays(periodStartDate, 6) });
    }
  })();

  /** Vista Mese: griglia lun–dom allineata al calcolo paghe (settimane intere sul periodo). */
  const calendarPaddedDays = useMemo(() => {
    const calStart = startOfWeek(periodStartDate, { weekStartsOn: 1 });
    const calEnd = endOfWeek(periodEndDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [periodStartDate, periodEndDate]);

  /** Settimana e mese: una sola paga evidenziata = quella del mese civile che contiene la **fine** del periodo (es. fine marzo → 30/03, non altri lunedì della griglia). */
  const weekViewPayrollDayStr = useMemo(
    () => format(getPayrollPaymentDateForCalendarMonth(periodEndDate), 'yyyy-MM-dd'),
    [periodEndDate]
  );

  /** Riferimento unico in toolbar vista mese: data pagamento per quel periodo. */
  const payrollStripForToolbar = useMemo(() => {
    const pay = getPayrollPaymentDateForCalendarMonth(periodEndDate);
    return format(pay, 'd MMM yyyy', { locale });
  }, [periodEndDate, locale]);

  const maxWeekIndex = displayPeriodConfig.numWeeks - 1;
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [auditDetailShiftId, setAuditDetailShiftId] = useState<string | null>(null);
  const [approvingShiftId, setApprovingShiftId] = useState<string | null>(null);
  const [punchAudits, setPunchAudits] = useState<Record<string, PunchAuditEntry[]>>({});
  const [closingShift, setClosingShift] = useState<ClosingShiftState | null>(null);
  const [clockOutTime, setClockOutTime] = useState('');
  const [closingLoading, setClosingLoading] = useState(false);
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null);
  const [unlockModalShiftId, setUnlockModalShiftId] = useState<string | null>(null);
  const [unlockPin, setUnlockPin] = useState('');
  const [unlockError, setUnlockError] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [drawerEditStart, setDrawerEditStart] = useState('');
  const [drawerEditEnd, setDrawerEditEnd] = useState('');
  const [drawerEditSaving, setDrawerEditSaving] = useState(false);
  const [drawerEditOutDate, setDrawerEditOutDate] = useState('');
  const [drawerEditOutTime, setDrawerEditOutTime] = useState('');
  const [drawerEditOutSaving, setDrawerEditOutSaving] = useState(false);
  const [dayReview, setDayReview] = useState<{
    dateStr: string;
    items: Array<{ userId: string; employeeName: string; department?: string; shift: ShiftRow }>;
    currentIdx: number;
  } | null>(null);
  const [dayReviewIn, setDayReviewIn] = useState('');
  const [dayReviewOutDate, setDayReviewOutDate] = useState('');
  const [dayReviewOut, setDayReviewOut] = useState('');
  const [dayReviewSaving, setDayReviewSaving] = useState(false);

  const [approvalConfirm, setApprovalConfirm] = useState<{
    shiftId: string;
    employeeName: string;
    dateStr: string;
    plannedStart: string;
    plannedEnd: string;
    plannedMins: number;
    actualStart: string | null;
    actualEnd: string | null;
    actualMins: number;
    deltaMins: number;
  } | null>(null);

  const periodStartStr = format(periodStartDate, 'yyyy-MM-dd');
  const periodEndStr = format(periodEndDate, 'yyyy-MM-dd');
  const isDayInConfiguredPeriod = useCallback(
    (d: Date) => {
      const s = format(d, 'yyyy-MM-dd');
      return s >= periodStartStr && s <= periodEndStr;
    },
    [periodStartStr, periodEndStr]
  );

  const weekDays =
    viewMode === 'week'
      ? allPeriodDays.slice(weekIndex * 7, weekIndex * 7 + 7)
      : calendarPaddedDays;
  const weekStart = weekDays[0] ?? periodStartDate;
  const lastDay = weekDays[weekDays.length - 1] ?? periodEndDate;
  const weekStr = format(weekStart, 'yyyy-MM-dd');
  const weekEnd = format(addDays(lastDay, 1), 'yyyy-MM-dd');
  const todayStr = format(now, 'yyyy-MM-dd');

  const goPrevWeek = () => setWeekIndex((i) => Math.max(0, i - 1));
  const goNextWeek = () => setWeekIndex((i) => Math.min(maxWeekIndex, i + 1));

  useEffect(() => {
    setWeekIndex((i) => Math.min(i, maxWeekIndex));
  }, [maxWeekIndex]);

  // Carica audit log per la settimana
  useEffect(() => {
    const weekPunchIds = punchRecords
      .filter((p) => {
        const d = p.timestamp ? new Date(p.timestamp) : null;
        if (!d) return false;
        const dateStr = format(d, 'yyyy-MM-dd');
        return dateStr >= weekStr && dateStr < weekEnd;
      })
      .map((p) => p.id);

    if (weekPunchIds.length === 0) { setPunchAudits({}); return; }

    database.punchAuditLog.getByPunchIds(weekPunchIds).then((entries) => {
      const grouped: Record<string, PunchAuditEntry[]> = {};
      for (const entry of entries) {
        if (!grouped[entry.punch_record_id]) grouped[entry.punch_record_id] = [];
        grouped[entry.punch_record_id].push(entry);
      }
      setPunchAudits(grouped);
    }).catch(() => { /* tabella non ancora creata */ });
  }, [punchRecords, weekStr, weekEnd]);

  const visibleUsers = useMemo(() => {
    const onSchedule = users.filter(isUserVisibleOnTeamSchedule);
    if (!canTeamTimesheetOps && currentUser) {
      const self = users.find((u) => u.id === currentUser.id);
      if (!self || self.status !== 'active' || isPurelyManagementRole(self.role)) return [];
      return [self].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }
    const self = currentUser
      ? users.find((u) => u.id === currentUser.id)
      : undefined;
    const needsSelf =
      self &&
      self.status === 'active' &&
      !isPurelyManagementRole(self.role) &&
      !onSchedule.some((u) => u.id === self.id);
    const merged = needsSelf ? [...onSchedule, self] : [...onSchedule];
    return merged.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [users, canTeamTimesheetOps, currentUser]);

  const weekShifts = useMemo(() =>
    shifts.filter((s) => s.date >= weekStr && s.date < weekEnd && !s.notes?.startsWith('__OPEN__')),
    [shifts, weekStr, weekEnd]
  );

  /** Allineato al Master Control `auto_breaks`; le regole pausa attive restano sempre prioritarie in getBreakMinutesForShift. */
  const breakComputeOpts = useMemo(
    () => ({ autoBreaksFeatureEnabled: featureFlags['auto_breaks'] !== false }),
    [featureFlags]
  );

  const timesheetData = useMemo(() => {
    const data: Record<string, Record<string, DayData>> = {};

    for (const user of visibleUsers) {
      data[user.id] = {};
      for (const day of weekDays) {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayShifts = weekShifts
          .filter((s) => s.user_id === user.id && s.date === dateStr)
          .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

        const shiftRows: ShiftRow[] = dayShifts.map((s) => {
          const plannedStart = (s.start_time || '').slice(0, 5);
          const plannedEnd = (s.end_time || '').slice(0, 5);
          const grossPlanned = calculateShiftMinutesGross(plannedStart, plannedEnd);
          const breakMinutes = getBreakMinutesForShift(s, grossPlanned, user, breakRules, breakComputeOpts);
          const plannedMins = Math.max(0, grossPlanned - breakMinutes);

          const shiftHour = parseInt(plannedStart.split(':')[0], 10);
          const isLunch = shiftHour < 16;

          const punchIn = punchRecords.find((p) => {
            if (p.type !== 'in') return false;
            if (s.id && p.shift_id) return p.shift_id === s.id;
            if (p.user_id !== user.id) return false;
            const pDate = new Date(p.timestamp);
            if (format(pDate, 'yyyy-MM-dd') !== dateStr) return false;
            return isLunch ? pDate.getHours() < 16 : pDate.getHours() >= 16;
          });

          const punchOut = punchRecords.find((p) => {
            if (p.type !== 'out') return false;
            if (s.id && p.shift_id) return p.shift_id === s.id;
            if (p.user_id !== user.id) return false;
            const pDate = new Date(p.timestamp);
            if (format(pDate, 'yyyy-MM-dd') !== dateStr) return false;
            return isLunch ? pDate.getHours() < 16 : pDate.getHours() >= 16;
          });

          const clockOutRaw = (punchIn as { clock_out_time?: string | null })?.clock_out_time ?? null;
          const punchActualStart = punchIn ? punchTimeHHMM(punchIn.calculated_time || punchIn.timestamp) : null;
          const actualEndFull = clockOutRaw ?? punchOut?.timestamp ?? undefined;
          const punchActualEnd = actualEndFull ? punchTimeHHMM(actualEndFull) : null;

          const frozen = !!(s.approved_at && s.approved_start_time && s.approved_end_time);
          let displayActualStart = punchActualStart;
          let displayActualEnd = punchActualEnd;
          let grossActualMins = 0;
          let actualEndFullForRow: string | undefined = actualEndFull;

          if (frozen) {
            const r = getResolvedStartEndForHours(s as Shift, punchRecords);
            displayActualStart = r.start;
            displayActualEnd = r.end;
            grossActualMins = calculateShiftMinutesGross(r.start, r.end);
            actualEndFullForRow = undefined;
          } else if (punchActualStart && punchActualEnd) {
            const startM = toMinutesFromMidnight(punchActualStart);
            const endM = toMinutesFromMidnight(punchActualEnd);
            const elapsedMs = actualEndFull && punchIn
              ? new Date(actualEndFull).getTime() - new Date(punchIn.calculated_time || punchIn.timestamp).getTime()
              : (endM >= startM ? endM - startM : endM + 1440 - startM) * 60_000;
            grossActualMins = Math.max(0, Math.round(elapsedMs / 60_000));
          }

          const actualEndDate = actualEndFull ? format(new Date(actualEndFull), 'yyyy-MM-dd') : dateStr;
          const isCrossDay = !frozen && !!actualEndFull && actualEndDate !== dateStr;
          const actualMins = Math.max(0, grossActualMins - breakMinutes);
          const deltaMins = actualMins - plannedMins;

          const isLate = !!(
            displayActualStart &&
            toMinutesFromMidnight(displayActualStart) > toMinutesFromMidnight(plannedStart) + 5
          );
          const hasMissingOut = frozen ? false : !!(punchIn && !punchActualEnd);

          return {
            id: s.id,
            plannedStart,
            plannedEnd,
            plannedMins,
            breakMinutes,
            actualStart: displayActualStart,
            actualEnd: displayActualEnd,
            actualEndFull: actualEndFullForRow,
            actualMins,
            deltaMins,
            status: s.approval_status,
            punched: !!punchIn,
            punchInId: punchIn?.id,
            punchOutId: punchOut?.id,
            isLate,
            hasMissingOut,
            isCrossDay,
            approved_by: s.approved_by,
            approved_at: s.approved_at,
          };
        });

        const totalPlannedMins = shiftRows.reduce((a, r) => a + r.plannedMins, 0);
        const totalActualMins = shiftRows.reduce((a, r) => a + r.actualMins, 0);
        const totalDeltaMins = totalActualMins - totalPlannedMins;

        data[user.id][dateStr] = { dateStr, shifts: shiftRows, totalPlannedMins, totalActualMins, totalDeltaMins };
      }
    }
    return data;
  }, [visibleUsers, weekDays, weekShifts, punchRecords, breakRules, breakComputeOpts]);

  const userTotals = useMemo(() => {
    const totals: Record<string, { plannedMins: number; actualMins: number; deltaMins: number }> = {};
    for (const user of visibleUsers) {
      let planned = 0, actual = 0;
      for (const day of weekDays) {
        const dayData = timesheetData[user.id]?.[format(day, 'yyyy-MM-dd')];
        if (dayData) { planned += dayData.totalPlannedMins; actual += dayData.totalActualMins; }
      }
      totals[user.id] = { plannedMins: planned, actualMins: actual, deltaMins: actual - planned };
    }
    return totals;
  }, [visibleUsers, weekDays, timesheetData]);

  // ── Statistiche rapide di OGGI ────────────────────────────────────────────
  const todayStats = useMemo(() => {
    const todayShifts = weekShifts.filter((s) => s.date === todayStr);
    let inTurno = 0, ritardi = 0, outMancanti = 0, approvati = 0;
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();

    for (const s of todayShifts) {
      const startMins = toMinutesFromMidnight((s.start_time || '').slice(0, 5));
      const endMins = toMinutesFromMidnight((s.end_time || '00:00').slice(0, 5));
      if (nowMins >= startMins - 30 && nowMins <= endMins) inTurno++;
      if (s.approval_status === 'approved') approvati++;

      const punchIn = punchRecords.find((p) => p.type === 'in' && p.shift_id === s.id);
      if (punchIn) {
        const actualStartHHMM = punchTimeHHMM(punchIn.calculated_time || punchIn.timestamp);
        if (actualStartHHMM && toMinutesFromMidnight(actualStartHHMM) > startMins + 5) ritardi++;
        const hasOut = punchRecords.some((p) => p.type === 'out' && p.shift_id === s.id);
        const hasClockOut = !!(punchIn as { clock_out_time?: string | null }).clock_out_time;
        if (!hasOut && !hasClockOut && nowMins > endMins) outMancanti++;
      }
    }
    return { inTurno, ritardi, outMancanti, approvati };
  }, [weekShifts, todayStr, punchRecords]);

  // ── Turni dinner senza OUT (solo oggi, solo se oggi è nel periodo) ─────────────────
  const dinnerShiftsNeedingClose = useMemo(() => {
    const todayInRange = todayStr >= weekStr && todayStr < weekEnd;
    if (!todayInRange) return [];
    const todayShifts = weekShifts.filter((s) => s.date === todayStr);
    const result: Array<{
      shift: typeof todayShifts[0];
      user: (typeof visibleUsers)[0] | undefined;
      punchInId: string;
      actualStart: string;
      scheduledStart: string;
      scheduledEnd: string;
      plannedMins: number;
    }> = [];

    for (const s of todayShifts) {
      if (s.approval_status === 'approved') continue;
      const startHour = parseInt((s.start_time || '00:00').slice(0, 2), 10);
      if (startHour < 16) continue;

      const user = visibleUsers.find((u) => u.id === s.user_id);
      const punchIn = punchRecords.find(
        (p) =>
          p.type === 'in' &&
          (p.shift_id === s.id || (p.user_id === s.user_id && new Date(p.timestamp).getHours() >= 16))
      );
      if (!punchIn) continue;

      const hasOut = punchRecords.some(
        (p) =>
          p.type === 'out' &&
          (p.shift_id === s.id || (p.user_id === s.user_id && new Date(p.timestamp).getHours() >= 16))
      );
      const hasClockOut = !!(punchIn as { clock_out_time?: string | null }).clock_out_time;
      if (hasOut || hasClockOut) continue;

      const actualStart =
        punchTimeHHMM(
          (punchIn as { calculated_time?: string | null }).calculated_time || punchIn.timestamp
        ) ?? (s.start_time || '').slice(0, 5);
      const plannedStart = (s.start_time || '').slice(0, 5);
      const plannedEnd = (s.end_time || '').slice(0, 5);
      const grossPlanned = calculateShiftMinutesGross(plannedStart, plannedEnd);
      const breakMins = getBreakMinutesForShift(s, grossPlanned, user ?? undefined, breakRules, breakComputeOpts);
      const plannedMins = Math.max(0, grossPlanned - breakMins);

      result.push({
        shift: s,
        user,
        punchInId: punchIn.id,
        actualStart,
        scheduledStart: (s.start_time || '').slice(0, 5),
        scheduledEnd: (s.end_time || '').slice(0, 5),
        plannedMins,
      });
    }
    return result;
  }, [weekShifts, todayStr, visibleUsers, punchRecords, breakRules, breakComputeOpts, weekStr, weekEnd]);

  // ── Turni pronti per l'approvazione (confirmed + IN + OUT) ──────────────
  const readyForApproval = useMemo(() => {
    const result: Array<{
      shift: (typeof weekShifts)[0];
      user: (typeof visibleUsers)[0] | undefined;
      plannedStart: string;
      plannedEnd: string;
      plannedMins: number;
      actualStart: string;
      actualEnd: string;
      actualMins: number;
      grossActualMins: number;
      breakDeductionMins: number;
      deltaMins: number;
      punchInId: string;
      auditCount: number;
      auditEntries: PunchAuditEntry[];
      dateStr: string;
    }> = [];

    for (const s of weekShifts) {
      // "Pronti per il congelo" = approvati ma non ancora congelati (approved_at assente)
      if (s.approval_status !== 'approved' || s.approved_at) continue;
      if (s.date > todayStr) continue; // Solo turni già trascorsi o odierni

      const user = visibleUsers.find((u) => u.id === s.user_id);
      const plannedStart = (s.start_time || '').slice(0, 5);
      const plannedEnd = (s.end_time || '').slice(0, 5);
      const grossPlanned = calculateShiftMinutesGross(plannedStart, plannedEnd);
      const breakMins = getBreakMinutesForShift(s, grossPlanned, user ?? undefined, breakRules, breakComputeOpts);
      const plannedMins = Math.max(0, grossPlanned - breakMins);

      const punchIn = punchRecords.find(
        (p) => p.type === 'in' && (p.shift_id === s.id || p.user_id === s.user_id)
      );
      if (!punchIn) continue;

      const clockOutRaw = (punchIn as { clock_out_time?: string | null }).clock_out_time ?? null;
      const punchOut = punchRecords.find(
        (p) => p.type === 'out' && (p.shift_id === s.id || p.user_id === s.user_id)
      );
      const actualEndRaw = clockOutRaw ?? punchOut?.timestamp ?? null;
      if (!actualEndRaw) continue; // no OUT yet

      const actualStart = punchTimeHHMM(
        (punchIn as { calculated_time?: string | null }).calculated_time || punchIn.timestamp
      ) ?? plannedStart;
      const actualEnd = punchTimeHHMM(actualEndRaw) ?? plannedEnd;
      const grossActualMins = calculateShiftMinutesGross(actualStart, actualEnd);
      const actualMins = Math.max(0, grossActualMins - breakMins);
      const breakDeductionMins = breakMins;
      const deltaMins = actualMins - plannedMins;
      const auditEntries = punchIn.id ? (punchAudits[punchIn.id] ?? []) : [];
      const auditCount = auditEntries.length;

      result.push({
        shift: s,
        user,
        plannedStart,
        plannedEnd,
        plannedMins,
        actualStart,
        actualEnd,
        actualMins,
        grossActualMins,
        breakDeductionMins,
        deltaMins,
        punchInId: punchIn.id,
        auditCount,
        auditEntries,
        dateStr: s.date,
      });
    }
    // Sort: oldest first (data crescente)
    return result.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [weekShifts, visibleUsers, punchRecords, punchAudits, breakRules, breakComputeOpts, todayStr]);

  const scrollToTimesheetAnchor = useCallback((elementId: string) => {
    requestAnimationFrame(() => {
      document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  /** Card riepilogo oggi: portano alla griglia presenze o alle sezioni operative sotto. */
  const handleStatCardClick = useCallback(
    (kind: 'in_turno' | 'ritardi' | 'out' | 'approvati') => {
      if (!currentUser) return;
      const showDinner =
        isUiWidgetVisible(currentUser, 'timesheet.dinner_close') && dinnerShiftsNeedingClose.length > 0;
      const showReady =
        isUiWidgetVisible(currentUser, 'timesheet.ready_approval') && readyForApproval.length > 0;
      if (kind === 'out' && showDinner) {
        scrollToTimesheetAnchor('timesheet-section-dinner-close');
        return;
      }
      if (kind === 'approvati' && showReady) {
        scrollToTimesheetAnchor('timesheet-section-ready-approval');
        return;
      }
      scrollToTimesheetAnchor('timesheet-section-main-grid');
    },
    [currentUser, dinnerShiftsNeedingClose.length, readyForApproval.length, scrollToTimesheetAnchor]
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleApproveShift = async (shiftId: string) => {
    setApprovingShiftId(shiftId);
    try {
      await approveShift(shiftId);
      showSuccess?.(t.ts_toast_shift_approved);
      setDrawerData(null);
    } finally {
      setApprovingShiftId(null);
    }
  };

  const handleUnlockShift = async (pin: string) => {
    if (!unlockModalShiftId || !currentUser) return;
    if (pin !== currentUser.pin) {
      setUnlockError(t.ts_toast_wrong_pin);
      setUnlockPin('');
      return;
    }
    setUnlocking(true);
    try {
      const actorName = `${currentUser.first_name} ${currentUser.last_name ?? ''}`.trim();
      await updateShift(unlockModalShiftId, {
        approval_status: 'confirmed',
        approved_at: null as unknown as string,
        approved_by: null as unknown as string,
        approved_start_time: null as unknown as string,
        approved_end_time: null as unknown as string,
      });
      const punchIn = punchRecords.find(
        (p) => p.type === 'in' && p.shift_id === unlockModalShiftId
      );
      if (punchIn) {
        try {
          await database.punchAuditLog.insert({
            punch_record_id: punchIn.id,
            actor_id: currentUser.id,
            actor_name: actorName,
            field: 'sblocco_turno',
            old_value: 'approved',
            new_value: 'confirmed',
          });
        } catch { /* audit log non bloccante */ }
      }
      setUnlockModalShiftId(null);
      setUnlockPin('');
      setUnlockError('');
      // Aggiorna lo snapshot nel drawer in tempo reale
      setDrawerData((prev) =>
        prev ? { ...prev, shift: { ...prev.shift, status: 'confirmed', approved_at: undefined, approved_by: undefined } } : null
      );
      showSuccess?.(t.ts_toast_shift_unlocked);
    } catch {
      showError?.(t.ts_toast_unlock_error);
    } finally {
      setUnlocking(false);
    }
  };

  const handleConfirmClose = async () => {
    if (!closingShift || !clockOutTime || !closingShift.punchInId) return;
    setClosingLoading(true);
    try {
      const [h, m] = clockOutTime.split(':').map(Number);
      const base = parseISO(closingShift.dateStr);
      const clockOutDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h ?? 0, m ?? 0, 0, 0);
      try {
        await updatePunchRecord(closingShift.punchInId, { clock_out_time: clockOutDate.toISOString() });
      } catch {
        // Fallback: colonna clock_out_time non ancora migrata — usa calculated_time come campo di uscita
        await updatePunchRecord(closingShift.punchInId, { calculated_time: clockOutDate.toISOString() });
      }
      showSuccess?.(t.ts_toast_exit_saved);
      setClosingShift(null);
      setClockOutTime('');
      setDrawerData(null);
    } catch {
      showError?.(t.ts_toast_exit_error);
    } finally {
      setClosingLoading(false);
    }
  };

  const openDrawer = (shift: ShiftRow, user: { id: string; first_name: string; department?: string }, dateStr: string) => {
    const punchAuditEntries = shift.punchInId ? (punchAudits[shift.punchInId] || []) : [];
    const shiftEdits = getShiftHistory(shift.id);
    setDrawerData({ shift, userId: user.id, employeeName: user.first_name, department: user.department, dateStr, punchAuditEntries, shiftEdits });
    setDrawerEditStart(shift.plannedStart);
    setDrawerEditEnd(shift.plannedEnd);
    setDrawerEditSaving(false);
    // Inizializza editor orario uscita
    if (shift.actualEndFull) {
      const d = new Date(shift.actualEndFull);
      setDrawerEditOutDate(format(d, 'yyyy-MM-dd'));
      setDrawerEditOutTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    } else {
      setDrawerEditOutDate(dateStr);
      setDrawerEditOutTime(shift.plannedEnd);
    }
    setDrawerEditOutSaving(false);
  };

  const handleDrawerSaveShift = async (shiftId: string, start: string, end: string) => {
    setDrawerEditSaving(true);
    try {
      await updateShift(shiftId, { start_time: start, end_time: end });
      const rawShift = shifts.find((s) => s.id === shiftId);
      const user = rawShift ? visibleUsers.find((u) => u.id === rawShift.user_id) : undefined;
      const gross = calculateShiftMinutesGross(start, end);
      const breakMins = rawShift
        ? getBreakMinutesForShift({ ...rawShift, start_time: start, end_time: end }, gross, user ?? undefined, breakRules, breakComputeOpts)
        : 0;
      const newPlannedMins = Math.max(0, gross - breakMins);
      setDrawerData((prev) => {
        if (!prev) return null;
        const newDeltaMins = prev.shift.actualMins - newPlannedMins;
        return {
          ...prev,
          shift: {
            ...prev.shift,
            plannedStart: start,
            plannedEnd: end,
            plannedMins: newPlannedMins,
            deltaMins: newDeltaMins,
          },
        };
      });
      showSuccess?.(t.ts_toast_shift_time_updated);
    } catch {
      showError?.(t.save_error);
    } finally {
      setDrawerEditSaving(false);
    }
  };

  const handleDrawerSaveOut = async (punchOutId: string, date: string, time: string) => {
    if (!currentUser) return;
    setDrawerEditOutSaving(true);
    try {
      const [h, m] = time.split(':').map(Number);
      const d = parseISO(date);
      const newTs = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h ?? 0, m ?? 0, 0, 0);
      const actorName = `${currentUser.first_name} ${currentUser.last_name ?? ''}`.trim();
      const oldVal = drawerData?.shift.actualEndFull ?? '—';
      await updatePunchRecord(punchOutId, { timestamp: newTs.toISOString() });
      // Audit log non bloccante
      try {
        await database.punchAuditLog.insert({
          punch_record_id: punchOutId,
          actor_id: currentUser.id,
          actor_name: actorName,
          field: 'timestamp_out',
          old_value: oldVal,
          new_value: newTs.toISOString(),
        });
      } catch { /* non bloccante */ }
      // Aggiorna snapshot drawer
      setDrawerData((prev) => {
        if (!prev) return null;
        const newEnd = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const rawElapsed = prev.shift.actualStart
          ? (() => {
              const punchInTs = punchRecords.find((p) => p.id === prev.shift.punchInId);
              if (punchInTs) {
                const elapsedMs = newTs.getTime() - new Date(punchInTs.calculated_time || punchInTs.timestamp).getTime();
                return Math.max(0, Math.round(elapsedMs / 60_000));
              }
              return calculateShiftMinutesGross(prev.shift.actualStart, newEnd);
            })()
          : 0;
        const newActualMins = Math.max(0, rawElapsed - prev.shift.breakMinutes);
        return {
          ...prev,
          shift: {
            ...prev.shift,
            actualEnd: newEnd,
            actualEndFull: newTs.toISOString(),
            actualMins: newActualMins,
            deltaMins: newActualMins - prev.shift.plannedMins,
            hasMissingOut: false,
            isCrossDay: false,
          },
        };
      });
      showSuccess?.(t.ts_toast_exit_corrected);
    } catch {
      showError?.(t.save_error);
    } finally {
      setDrawerEditOutSaving(false);
    }
  };

  // ── Day Review ───────────────────────────────────────────────────────────

  const toISOFromDateHHMM = (dateStr: string, hhmm: string): string => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = parseISO(dateStr);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h ?? 0, m ?? 0, 0, 0).toISOString();
  };

  const initDayReviewFields = (item: { shift: ShiftRow }, reviewDateStr: string) => {
    setDayReviewIn(item.shift.actualStart ?? item.shift.plannedStart);
    if (item.shift.actualEndFull) {
      const d = new Date(item.shift.actualEndFull);
      setDayReviewOutDate(format(d, 'yyyy-MM-dd'));
      setDayReviewOut(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
    } else {
      setDayReviewOutDate(reviewDateStr);
      setDayReviewOut(item.shift.actualEnd ?? '');
    }
  };

  const handleOpenDayReview = (dateStr: string) => {
    const items: Array<{ userId: string; employeeName: string; department?: string; shift: ShiftRow }> = [];
    for (const user of visibleUsers) {
      const dayData = timesheetData[user.id]?.[dateStr];
      if (!dayData) continue;
      for (const shift of dayData.shifts) {
        if (shift.status === 'approved') continue;
        items.push({ userId: user.id, employeeName: user.first_name, department: (user as { department?: string }).department, shift });
      }
    }
    if (items.length === 0) return;
    setDayReview({ dateStr, items, currentIdx: 0 });
    initDayReviewFields(items[0], dateStr);
  };

  const handleDayReviewNavigate = (dir: 1 | -1) => {
    if (!dayReview) return;
    const next = dayReview.currentIdx + dir;
    if (next < 0 || next >= dayReview.items.length) return;
    setDayReview((prev) => prev ? { ...prev, currentIdx: next } : null);
    initDayReviewFields(dayReview.items[next], dayReview.dateStr);
  };

  const handleDayReviewSave = async () => {
    if (!dayReview) return;
    const item = dayReview.items[dayReview.currentIdx];
    const s = item.shift;
    setDayReviewSaving(true);
    try {
      // Salva IN se cambiato
      if (s.punchInId && dayReviewIn) {
        const newInISO = toISOFromDateHHMM(dayReview.dateStr, dayReviewIn);
        await updatePunchRecord(s.punchInId, { calculated_time: newInISO });
      }
      // Salva OUT
      if (dayReviewOut && dayReviewOutDate) {
        const newOutISO = toISOFromDateHHMM(dayReviewOutDate, dayReviewOut);
        if (s.punchOutId) {
          await updatePunchRecord(s.punchOutId, { timestamp: newOutISO });
        } else if (s.punchInId) {
          await updatePunchRecord(s.punchInId, { clock_out_time: newOutISO });
        }
      }
      showSuccess?.(t.ts_toast_shift_updated);
      // Avanza automaticamente al prossimo
      const next = dayReview.currentIdx + 1;
      if (next < dayReview.items.length) {
        setDayReview((prev) => prev ? { ...prev, currentIdx: next } : null);
        initDayReviewFields(dayReview.items[next], dayReview.dateStr);
      } else {
        setDayReview(null);
        showSuccess?.(t.ts_toast_day_review_complete);
      }
    } catch {
      showError?.(t.save_error);
    } finally {
      setDayReviewSaving(false);
    }
  };

  // ── Helpers rendering ────────────────────────────────────────────────────

  const getShiftCardStyle = (s: ShiftRow, punchAuditCount: number) => {
    // Verde bosco — turno approvato e congelato
    if (s.status === 'approved') {
      return {
        border: 'border-l-accent',
        bg: 'bg-accent/5',
        ring: 'ring-1 ring-accent/20',
        dot: 'bg-accent',
        label: t.ts_status_approved,
        labelCls: 'text-accent-dark bg-accent/10',
      };
    }
    // Rosso — anomalia critica (uscita mancante o ritardo > 15 min)
    if (s.hasMissingOut || (s.isLate && Math.abs(s.deltaMins) > 15)) {
      return {
        border: 'border-l-red-500',
        bg: 'bg-red-50',
        ring: 'ring-1 ring-red-200',
        dot: 'bg-red-500',
        label: s.hasMissingOut ? t.ts_status_missing_out : t.ts_status_late,
        labelCls: 'text-red-700 bg-red-100',
      };
    }
    // Arancione — modifiche manuali non ancora approvate
    if (punchAuditCount > 0) {
      return {
        border: 'border-l-orange-500',
        bg: 'bg-orange-50',
        ring: 'ring-1 ring-orange-200',
        dot: 'bg-orange-500',
        label: t.ts_status_modified,
        labelCls: 'text-orange-700 bg-orange-100',
      };
    }
    // Giallo/Ambra — IN timbrato ma OUT ancora mancante
    if (s.punched && !s.actualEnd) {
      return {
        border: 'border-l-amber-500',
        bg: 'bg-amber-50',
        ring: 'ring-1 ring-amber-200',
        dot: 'bg-amber-500',
        label: t.ts_status_in_shift,
        labelCls: 'text-amber-700 bg-amber-100',
      };
    }
    // Blu — completo, in attesa di approvazione
    if (s.punched && s.actualEnd) {
      return {
        border: 'border-l-blue-500',
        bg: 'bg-blue-50',
        ring: 'ring-1 ring-blue-200',
        dot: 'bg-blue-500',
        label: t.ts_status_to_approve,
        labelCls: 'text-blue-700 bg-blue-100',
      };
    }
    // Grigio — non timbrato
    return {
      border: 'border-l-slate-300',
      bg: 'bg-slate-50',
      ring: '',
      dot: 'bg-slate-300',
      label: t.ts_status_unpunched,
      labelCls: 'text-slate-500 bg-slate-100',
    };
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (!currentUser) return null;

  const tv = t as Record<string, string>;
  const monthTabTitle = payrollStripForToolbar
    ? `${tv.ts_timesheet_month_tab_hint ?? ''}\n${formatTrans(tv.ts_timesheet_month_payroll_strip ?? 'Pagamento stipendi previsto: {dates}', { dates: payrollStripForToolbar })}`
    : (tv.ts_timesheet_month_tab_hint ?? '');

  return (
    <>
      <div className="pb-content pt-6 w-full max-w-full font-sans min-h-full">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

          {/* ── Header: periodo, vista, navigazione ── */}
          {uiW('timesheet.header') && (
          <div className="ui-toolbar-page-band">
            <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 sm:gap-3">
              <div className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center gap-2 sm:h-[22px] sm:max-h-[22px] sm:flex-nowrap sm:gap-2 sm:overflow-x-auto-safe">
                <div className="ui-toolbar-row-tight min-w-0 shrink-0 gap-1.5 sm:gap-1.5">
                  <div className="ui-toolbar-group">
                    <button type="button" onClick={() => setViewMode('week')}
                      className={`ui-toolbar-tab ${viewMode === 'week' ? 'bg-accent text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                      {t.ts_period_week}
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('month')}
                      className={`ui-toolbar-tab ${viewMode === 'month' ? 'bg-accent text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                      title={monthTabTitle}
                      aria-label={`${t.ts_period_month}${payrollStripForToolbar ? `. ${formatTrans(tv.ts_timesheet_month_payroll_strip ?? '', { dates: payrollStripForToolbar })}` : ''}`}
                    >
                      {t.ts_period_month}
                    </button>
                  </div>

                  {viewMode === 'month' && payrollStripForToolbar && (
                    <span
                      className="hidden min-[400px]:inline-flex h-[22px] max-w-[min(100%,22rem)] shrink-0 items-center truncate rounded-lg border border-emerald-200/90 bg-emerald-50 px-2 text-[10px] font-semibold text-emerald-900"
                      title={tv.ts_timesheet_month_tab_hint}
                    >
                      {formatTrans(tv.ts_timesheet_month_payroll_strip ?? 'Pagamento stipendi previsto: {dates}', { dates: payrollStripForToolbar })}
                    </span>
                  )}

                  {viewMode === 'week' && (
                    <div className="ui-toolbar-group">
                      <button type="button" onClick={goPrevWeek} disabled={weekIndex <= 0}
                        className="ui-toolbar-icon-btn hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
                        <ChevronLeft className="h-3 w-3 text-slate-600" />
                      </button>
                      <span className="ui-toolbar-segment-static min-w-[52px]">
                        {weekIndex + 1} / {displayPeriodConfig.numWeeks}
                      </span>
                      <button type="button" onClick={goNextWeek} disabled={weekIndex >= maxWeekIndex}
                        className="ui-toolbar-icon-btn hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40">
                        <ChevronRight className="h-3 w-3 text-slate-600" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="ui-toolbar-row-tight shrink-0">
                <div className="ui-toolbar-dropdown-root" ref={timesheetActionsRef}>
                  <button
                    type="button"
                    onClick={() => setTimesheetActionsOpen((o) => !o)}
                    className={`ui-toolbar-chip border-slate-200 text-slate-600 hover:bg-slate-100 ${!periodSaved ? 'border-amber-300/80 bg-amber-50/50' : ''}`}
                    aria-label={(t as { wst_actions?: string }).wst_actions ?? 'Azioni'}
                    title={(t as { wst_actions?: string }).wst_actions ?? 'Azioni'}
                  >
                    <MoreHorizontal className="h-3 w-3 shrink-0 sm:hidden" aria-hidden />
                    <span className="hidden sm:inline">{(t as { wst_actions?: string }).wst_actions ?? 'Azioni'}</span>
                    {!periodSaved && (
                      <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                    )}
                    <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
                  </button>
                </div>
                {timesheetActionsOpen && (
                  <CenteredModalPortal
                    open
                    onClose={() => setTimesheetActionsOpen(false)}
                    panelRef={timesheetActionsModalRef}
                    backdropAriaLabel={(t as Record<string, string>).close ?? 'Chiudi'}
                    ariaLabel={(t as { wst_actions?: string }).wst_actions ?? 'Azioni'}
                    maxWidthClass="max-w-sm"
                    maxHeightClass="max-h-[min(90dvh,560px)]"
                    panelClassName="py-2"
                  >
                    <div className="px-3 pb-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {(t as { stats_preset_period?: string }).stats_preset_period ?? 'Periodo Presenze'}
                      </p>
                    </div>
                    <div className="space-y-2.5 border-b border-slate-100 px-3 pb-2.5">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold text-slate-500">{t.ts_period_start}</label>
                        <DatePickerField
                          value={periodStart}
                          onChange={(v) => { setPeriodStart(v); setPeriodSaved(false); setWeekIndex(0); }}
                          allowClear={false}
                          aria-label={t.ts_period_start}
                          className="!h-[34px] !min-h-[34px] !max-h-[34px] w-full justify-between gap-2 rounded-lg border border-slate-200 bg-white px-2 text-[13px] shadow-sm [&_svg]:h-3 [&_svg]:w-3"
                        />
                      </div>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => { setPeriodNumWeeks(4); setPeriodSaved(false); setWeekIndex(0); }}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                            periodNumWeeks === 4 ? 'bg-accent text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          {t.ts_preset_4weeks}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPeriodNumWeeks(5); setPeriodSaved(false); setWeekIndex(0); }}
                          className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors ${
                            periodNumWeeks === 5 ? 'bg-accent text-white' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          {t.ts_preset_5weeks}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          handleSavePeriodConfig();
                          setTimesheetActionsOpen(false);
                        }}
                        disabled={periodSaved}
                        className={`w-full rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                          periodSaved ? 'cursor-not-allowed bg-slate-200 text-slate-500' : 'bg-accent text-white hover:bg-accent-hover'
                        }`}
                      >
                        {t.ts_save_period}
                      </button>
                    </div>
                  </CenteredModalPortal>
                )}
              </div>
            </div>
          </div>
          )}

          {/* ── Stats Cards (solo oggi, solo management) ────────────────── */}
          {uiW('timesheet.stats_today') && canTeamTimesheetOps && todayStr >= weekStr && todayStr < weekEnd && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              {([
                {
                  label: t.ts_stat_in_shift,
                  value: todayStats.inTurno,
                  Icon: Users,
                  color: 'text-blue-600',
                  bg: 'bg-blue-50',
                  border: 'border-blue-100',
                  kind: 'in_turno' as const,
                },
                {
                  label: t.ts_stat_delays,
                  value: todayStats.ritardi,
                  Icon: Clock,
                  color: todayStats.ritardi > 0 ? 'text-red-600' : 'text-slate-400',
                  bg: todayStats.ritardi > 0 ? 'bg-red-50' : 'bg-slate-50',
                  border: todayStats.ritardi > 0 ? 'border-red-100' : 'border-slate-100',
                  kind: 'ritardi' as const,
                },
                {
                  label: t.ts_stat_missing_out,
                  value: todayStats.outMancanti,
                  Icon: AlertCircle,
                  color: todayStats.outMancanti > 0 ? 'text-red-600' : 'text-slate-400',
                  bg: todayStats.outMancanti > 0 ? 'bg-red-50' : 'bg-slate-50',
                  border: todayStats.outMancanti > 0 ? 'border-red-100' : 'border-slate-100',
                  kind: 'out' as const,
                },
                {
                  label: t.ts_stat_approved_today,
                  value: todayStats.approvati,
                  Icon: UserCheck,
                  color: todayStats.approvati > 0 ? 'text-accent' : 'text-slate-400',
                  bg: todayStats.approvati > 0 ? 'bg-accent/8' : 'bg-slate-50',
                  border: todayStats.approvati > 0 ? 'border-accent/20' : 'border-slate-100',
                  kind: 'approvati' as const,
                },
              ] as const).map(({ label, value, Icon, color, bg, border, kind }) => (
                <button
                  key={label}
                  type="button"
                  title={t.ts_stat_card_hint}
                  onClick={() => handleStatCardClick(kind)}
                  className={`group w-full rounded-xl border ${border} ${bg} px-2.5 py-2 shadow-sm flex items-center gap-2 text-left transition-all hover:shadow-md hover:border-slate-300/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/60 border ${border}`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-bold text-slate-900 leading-none tabular-nums">{value}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 leading-tight pr-1">{label}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 opacity-70 group-hover:text-accent group-hover:opacity-100 transition-colors" aria-hidden />
                </button>
              ))}
            </div>
          )}

          {canTeamTimesheetOps &&
            currentUser &&
            isFeatureEnabled(currentUser, 'view_stats') &&
            uiW('stats.mgmt_kpi_cards') && (
              <TimesheetManagementKpiBlock
                visibleWeekDays={weekDays}
                showDetailPanels={uiW('stats.detail_panels')}
              />
            )}

          {/* ── Turni Sera da Chiudere ──────────────────────────────────── */}
          {uiW('timesheet.dinner_close') && canTeamTimesheetOps && dinnerShiftsNeedingClose.length > 0 && (
            <motion.div
              id="timesheet-section-dinner-close"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 scroll-mt-24"
            >
              <div className="flex items-center gap-2 mb-3">
                <Moon className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-bold text-slate-800">{t.ts_dinner_close_required}</h3>
                <span className="ml-auto text-[11px] font-bold text-indigo-600 bg-indigo-100 border border-indigo-200 px-2 py-0.5 rounded-full">
                  {dinnerShiftsNeedingClose.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {dinnerShiftsNeedingClose.map((item) => (
                  <div
                    key={item.shift.id}
                    className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 shadow-sm"
                  >
                    {/* Employee header */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                        {item.user?.first_name?.[0] ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm">{item.user?.first_name ?? '—'}</p>
                        <p className="text-[11px] text-slate-500 truncate">{item.user?.department ?? ''}</p>
                      </div>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-sky-700 bg-sky-100 border border-sky-200 px-2 py-0.5 rounded-full flex-shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" /> {t.ts_badge_in_shift}
                      </span>
                    </div>
                    {/* Times */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-white/70 rounded-xl px-2.5 py-2 text-center">
                        <p className="text-[9px] text-slate-400 uppercase font-semibold mb-0.5">{t.ts_label_planned}</p>
                        <p className="text-sm font-bold text-slate-700 tabular-nums">
                          {item.scheduledStart}–{item.scheduledEnd}
                        </p>
                      </div>
                      <div className="bg-white/70 rounded-xl px-2.5 py-2 text-center">
                        <p className="text-[9px] text-slate-400 uppercase font-semibold mb-0.5">{t.ts_label_actual_entry}</p>
                        <p className="text-sm font-bold text-slate-800 tabular-nums">{item.actualStart}</p>
                      </div>
                    </div>
                    {/* Close button */}
                    <button
                      type="button"
                      onClick={() => {
                        setClockOutTime(item.scheduledEnd);
                        setClosingShift({
                          shiftId: item.shift.id,
                          punchInId: item.punchInId,
                          dateStr: todayStr,
                          plannedStart: item.scheduledStart,
                          plannedEnd: item.scheduledEnd,
                          plannedMins: item.plannedMins,
                          actualStart: item.actualStart,
                          employeeName: item.user?.first_name ?? '—',
                        });
                      }}
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-bold transition-colors shadow-sm"
                    >
                      <LogOut className="w-4 h-4" /> {t.ts_btn_close_and_approve}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Turni pronti per l'approvazione ─────────────────────────── */}
          {uiW('timesheet.ready_approval') && canTeamTimesheetOps && readyForApproval.length > 0 && (
            <motion.div
              id="timesheet-section-ready-approval"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-5 scroll-mt-24"
            >
              <div className="flex items-center gap-2 mb-3">
                <Check className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-bold text-slate-800">{t.ts_ready_for_approval}</h3>
                <span className="ml-auto text-[11px] font-bold text-accent-dark bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full">
                  {readyForApproval.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {readyForApproval.map((item) => {
                  const deltaColor = item.deltaMins > 5 ? 'text-accent' : item.deltaMins < -5 ? 'text-red-500' : 'text-slate-500';
                  const isApproving = approvingShiftId === item.shift.id;
                  const auditOpen = auditDetailShiftId === item.shift.id;
                  return (
                    <div
                      key={item.shift.id}
                      className="bg-white border border-accent/20 rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow"
                    >
                      {/* Employee + date */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent-dark font-bold text-sm flex-shrink-0">
                          {item.user?.first_name?.[0] ?? '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-800 text-sm truncate">{item.user?.first_name ?? '—'}</p>
                          <p className="text-[11px] text-slate-400">
                            {format(parseISO(item.dateStr), 'EEEE d MMM', { locale })}
                          </p>
                        </div>
                        {item.auditCount > 0 && (
                          <button
                            type="button"
                            title={(t as Record<string, string>).ts_audit_toggle_hint || ''}
                            aria-expanded={auditOpen}
                            onClick={() =>
                              setAuditDetailShiftId((id) => (id === item.shift.id ? null : item.shift.id))
                            }
                            className={`flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 border transition-colors ${
                              auditOpen
                                ? 'text-orange-800 bg-orange-200 border-orange-300'
                                : 'text-orange-600 bg-orange-100 border-orange-200 hover:bg-orange-200/80'
                            }`}
                          >
                            <ShieldAlert className="w-3 h-3" />
                            {item.auditCount}
                          </button>
                        )}
                      </div>
                      {auditOpen && item.auditEntries.length > 0 && (
                        <div className="mb-3 rounded-xl border border-orange-200 bg-orange-50/80 px-3 py-2.5 space-y-1.5">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-orange-800/80">
                            {(t as Record<string, string>).ts_audit_changes_title || 'Modifiche'}
                          </p>
                          <ul className="space-y-1.5 text-[10px] text-slate-700">
                            {item.auditEntries.map((e) => (
                              <li key={e.id} className="leading-snug border-b border-orange-100/80 pb-1.5 last:border-0 last:pb-0">
                                <span className="font-semibold text-slate-800">{punchAuditFieldLabel(e.field)}</span>
                                <span className="text-slate-500"> · </span>
                                <span className="tabular-nums">{formatAuditValue(e.old_value)}</span>
                                <span className="text-slate-400"> → </span>
                                <span className="tabular-nums font-medium">{formatAuditValue(e.new_value)}</span>
                                <span className="block text-[9px] text-slate-500 mt-0.5">{e.actor_name}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Pianificato vs Timbrato */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-slate-50 rounded-xl px-2.5 py-2">
                          <p className="text-[9px] text-slate-400 uppercase font-semibold mb-0.5">{t.ts_label_planned}</p>
                          <p className="text-sm font-semibold text-slate-600 tabular-nums">
                            {item.plannedStart} → {item.plannedEnd}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{fmtHM(item.plannedMins)}</p>
                        </div>
                        <div className="bg-accent/5 rounded-xl px-2.5 py-2">
                          <p className="text-[9px] text-slate-400 uppercase font-semibold mb-0.5">{t.ts_label_punched}</p>
                          <p className="text-sm font-bold text-slate-800 tabular-nums">
                            {item.actualStart} → {item.actualEnd}
                          </p>
                          <p className={`text-[10px] font-semibold mt-0.5 ${deltaColor} tabular-nums`}>
                            {fmtHM(item.grossActualMins)}
                            {item.breakDeductionMins > 0 && (
                              <span className="opacity-70">&nbsp;(−{fmtHM(item.breakDeductionMins)} {t.ts_break_deduction})</span>
                            )}
                          </p>
                          {item.breakDeductionMins > 0 && (
                            <p className="mt-0.5 text-[9px] font-normal leading-tight text-slate-400">
                              {t.ts_break_hint_ready_card}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Ore progress bar */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${item.deltaMins >= 0 ? 'bg-accent' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(100, Math.max(4, (item.actualMins / Math.max(item.plannedMins, 1)) * 100))}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-bold tabular-nums ${deltaColor}`}>
                          {Math.round((item.actualMins / Math.max(item.plannedMins, 1)) * 100)}%
                        </span>
                      </div>

                      {/* Approva e Congela — apre il modal di conferma */}
                      <button
                        type="button"
                        disabled={isApproving}
                        onClick={() => setApprovalConfirm({
                          shiftId: item.shift.id,
                          employeeName: item.user?.first_name ?? '—',
                          dateStr: item.dateStr,
                          plannedStart: item.plannedStart,
                          plannedEnd: item.plannedEnd,
                          plannedMins: item.plannedMins,
                          actualStart: item.actualStart,
                          actualEnd: item.actualEnd,
                          actualMins: item.actualMins,
                          deltaMins: item.deltaMins,
                        })}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-bold transition-colors shadow-sm"
                      >
                        {isApproving ? (
                          <span className="flex items-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            {t.ts_approving}
                          </span>
                        ) : (
                          <>
                            <Lock className="w-4 h-4" />
                            {t.ts_btn_approve_freeze} — {fmtHM(item.actualMins)}
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Filtri / Legenda ────────────────────────────────────────── */}
          {uiW('timesheet.main_grid') && (
          <>
          <div id="timesheet-section-main-grid" className="ui-toolbar-row mb-4 w-full scroll-mt-24">
            <span className="inline-flex h-[22px] shrink-0 items-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {t.ts_filter_label}
            </span>
            {[
              { key: 'approved',  label: t.ts_status_approved,   dot: 'bg-accent' },
              { key: 'confirmed', label: t.ts_status_confirmed,  dot: 'bg-blue-400'    },
              { key: 'draft',     label: t.ts_status_draft,      dot: 'bg-slate-300'   },
              { key: 'unpunched', label: t.ts_status_unpunched,  dot: 'bg-red-400'     },
            ].map(({ key, label, dot }) => {
              const active = filterStatus === key;
              return (
                <button key={key} type="button"
                  onClick={() => setFilterStatus(active ? null : key)}
                  className={`ui-toolbar-chip shrink-0 gap-1 transition-all ${
                    active
                      ? 'border-slate-800 bg-slate-800 text-white shadow-sm hover:bg-slate-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-white' : dot}`} />
                  {label}
                </button>
              );
            })}
            {filterStatus && (
              <button type="button" onClick={() => setFilterStatus(null)}
                className="ui-toolbar-chip shrink-0 border-transparent bg-transparent shadow-none text-slate-500 hover:border-slate-200 hover:bg-slate-100 hover:text-slate-800">
                <X className="h-3 w-3 shrink-0" /> {t.filter_all}
              </button>
            )}

            {/* Legenda colori */}
            <div className="ml-auto hidden h-[22px] items-center gap-2.5 sm:flex text-[10px] leading-none text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-accent" /> {t.ts_legend_validated}</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-red-400" /> {t.ts_legend_critical}</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-orange-400" /> {t.ts_legend_manual_edit}</span>
              <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-blue-400" /> {t.ts_legend_complete}</span>
            </div>
          </div>

          {/* ── Tabella principale ──────────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <HorizontalScrollArea
              variant="overlay"
              remeasureKey={`${viewMode}-${weekStr}-${weekDays.length}`}
              ariaLabelPrev={t.table_h_scroll_prev}
              ariaLabelNext={t.table_h_scroll_next}
              scrollClassName="overflow-x-auto-safe"
            >
            <table className="w-full border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="sticky left-0 bg-slate-50 pl-4 pr-3 py-3.5 text-left text-slate-500 text-[11px] uppercase tracking-wider font-semibold min-w-[130px] border-r border-slate-100 z-10">
                    {t.employee}
                  </th>
                  {weekDays.map((day, dayIdx) => {
                    const todayDate = isToday(day);
                    const dStr = format(day, 'yyyy-MM-dd');
                    const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
                    const isPayrollDay = dStr === weekViewPayrollDayStr;
                    const payrollHighlight = isPayrollDay && (viewMode === 'week' || inP);
                    const isPast = dStr < todayStr;
                    const dayShiftCount = visibleUsers.reduce((n, u) => {
                      const d = timesheetData[u.id]?.[dStr];
                      return n + (d?.shifts.filter((s) => s.status !== 'approved').length ?? 0);
                    }, 0);
                    const canReview = inP && isPast && canTeamTimesheetOps && dayShiftCount > 0;
                    const weekEndCol = viewMode === 'month' && (dayIdx + 1) % 7 === 0;
                    return (
                      <th key={dStr}
                        onClick={canReview ? () => handleOpenDayReview(dStr) : undefined}
                        title={
                          isPayrollDay
                            ? `${format(day, 'EEEE d MMMM yyyy', { locale })} — ${tv.ts_payroll_day_abbr ?? 'Paga'}`
                            : canReview
                              ? t.ts_review_shifts_tooltip.replace('{n}', String(dayShiftCount))
                              : undefined
                        }
                        className={`px-2 py-2.5 text-center text-[11px] font-semibold whitespace-nowrap min-w-[92px] transition-colors ${
                          weekEndCol ? 'border-r-2 border-r-slate-200' : 'border-r border-slate-100'
                        } ${
                          payrollHighlight ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-200/90' : todayDate ? 'bg-accent/5' : 'bg-slate-50'
                        } ${viewMode === 'month' && !inP ? '!bg-slate-100/90 opacity-70' : ''} ${canReview ? 'cursor-pointer hover:bg-accent/10 group' : ''}`}
                      >
                        <div className={todayDate && inP ? 'text-accent' : !inP ? 'text-slate-400' : 'text-slate-400'}>{format(day, 'EEE', { locale })}</div>
                        <div className={`font-bold mt-0.5 text-sm ${todayDate && inP ? 'text-accent' : !inP ? 'text-slate-500' : payrollHighlight ? 'text-emerald-900' : 'text-slate-700'}`}>{format(day, 'd MMM', { locale })}</div>
                        {payrollHighlight && (
                          <div className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-emerald-800">
                            {tv.ts_payroll_day_abbr ?? 'Paga'}
                          </div>
                        )}
                        {canReview && (
                          <div className="mt-0.5 text-[9px] font-semibold text-accent/60 group-hover:text-accent transition-colors">
                            {t.ts_review_short}
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="px-3 py-3.5 text-center text-slate-500 text-[11px] uppercase tracking-wider font-semibold bg-slate-50 border-l border-slate-100 min-w-[80px]">
                    {t.stats_total}
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleUsers.map((user, userIdx) => {
                  const totals = userTotals[user.id];
                  return (
                    <tr key={user.id} className={`border-b border-slate-100 last:border-0 ${userIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}>
                      {/* Nome dipendente */}
                      <td className="sticky left-0 bg-inherit pl-4 pr-3 py-3 border-r border-slate-100 z-10">
                        <div className="font-semibold text-sm text-slate-800">{user.first_name}</div>
                        {user.department && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{user.department}</div>
                        )}
                      </td>

                      {/* Celle giornaliere */}
                      {weekDays.map((day, dayIdx) => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dayData = timesheetData[user.id]?.[dateStr];
                        const todayDate = isToday(day);
                        const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
                        const isPayrollDay = dateStr === weekViewPayrollDayStr;
                        const payrollHighlight = isPayrollDay && (viewMode === 'week' || inP);
                        const weekEndCol = viewMode === 'month' && (dayIdx + 1) % 7 === 0;
                        const tdBorder = weekEndCol ? 'border-r-2 border-r-slate-200' : 'border-r border-slate-100';
                        const tdMuted = viewMode === 'month' && !inP;
                        const tdBg =
                          payrollHighlight
                            ? 'bg-emerald-50/50'
                            : todayDate && inP
                              ? 'bg-accent/5'
                              : tdMuted
                                ? 'bg-slate-100/90 opacity-70'
                                : '';

                        if (!dayData || dayData.shifts.length === 0) {
                          return (
                            <td key={dateStr} className={`px-2 py-3 text-center ${tdBorder} ${tdBg}`}>
                              <span className={`text-sm ${tdMuted ? 'text-slate-300' : 'text-slate-200'}`}>–</span>
                            </td>
                          );
                        }

                        const filteredShifts = filterStatus ? dayData.shifts.filter((s) => {
                          if (filterStatus === 'unpunched') return !s.punched;
                          return s.status === filterStatus;
                        }) : dayData.shifts;

                        if (filteredShifts.length === 0) {
                          return (
                            <td key={dateStr} className={`px-2 py-3 text-center ${tdBorder} ${tdBg}`}>
                              <span className={`text-sm ${tdMuted ? 'text-slate-300' : 'text-slate-200'}`}>–</span>
                            </td>
                          );
                        }

                        return (
                          <td key={dateStr} className={`px-1.5 py-2 ${tdBorder} align-top ${tdBg}`}>
                            <div className="flex flex-col gap-1">
                              {filteredShifts.map((s) => {
                                const punchAuditCount = s.punchInId ? (punchAudits[s.punchInId]?.length ?? 0) : 0;
                                const { border, bg, ring, dot } = getShiftCardStyle(s, punchAuditCount);
                                const deltaColor = s.deltaMins > 5 ? 'text-accent' : s.deltaMins < -5 ? 'text-red-500' : 'text-slate-500';

                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={() => openDrawer(s, user, dateStr)}
                                    className={`w-full text-left rounded-xl border-l-[3px] ${border} ${bg} ${ring} px-2 py-1.5 shadow-sm hover:shadow-md transition-all group`}
                                  >
                                    {/* Planned times */}
                                    <div className="flex items-center justify-between gap-1 mb-0.5">
                                      <span className="text-[11px] font-semibold text-slate-600 tabular-nums">
                                        {s.plannedStart}–{s.plannedEnd || '?'}
                                      </span>
                                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                                    </div>
                                    {/* Actual times or status */}
                                    {s.punched ? (
                                      s.actualEnd ? (
                                        <div className="flex items-center justify-between">
                                          <span className="text-[11px] font-bold text-slate-800 tabular-nums">
                                            {s.actualStart}–{s.actualEnd}
                                          </span>
                                          <span className={`text-[10px] font-semibold ${deltaColor} tabular-nums`}>
                                            {s.deltaMins >= 0 ? '+' : ''}{fmtHM(s.deltaMins)}
                                          </span>
                                        </div>
                                      ) : (
                                        <div className="text-[10px] font-semibold text-amber-600 flex items-center gap-0.5">
                                          <span>{s.actualStart}</span>
                                          <span className="text-amber-400">{t.ts_missing_exit}</span>
                                        </div>
                                      )
                                    ) : (
                                      <div className="text-[10px] text-slate-400 italic">{t.ts_status_unpunched}</div>
                                    )}
                                    {/* Badge icone */}
                                    <div className="flex items-center gap-1 mt-1">
                                      {punchAuditCount > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-orange-600 bg-orange-100 rounded-xl px-1 py-0.5">
                                          <ShieldAlert className="w-2.5 h-2.5" />{punchAuditCount}
                                        </span>
                                      )}
                                      {getShiftHistory(s.id).length > 0 && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-100 rounded-xl px-1 py-0.5">
                                          <History className="w-2.5 h-2.5" />{getShiftHistory(s.id).length}
                                        </span>
                                      )}
                                      {s.status === 'approved' && (
                                        <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-accent-dark bg-accent/10 rounded-xl px-1 py-0.5">
                                          <Lock className="w-2.5 h-2.5" />OK
                                        </span>
                                      )}
                                      <ArrowRight className="w-2.5 h-2.5 text-slate-300 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                  </button>
                                );
                              })}
                              {dayData.shifts.length > 1 && (
                                <div className="text-[10px] font-semibold text-slate-500 text-right px-1 mt-0.5">
                                  {fmtHM(dayData.totalPlannedMins)} / {dayData.totalActualMins > 0 ? fmtHM(dayData.totalActualMins) : '?'}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Totale settimana */}
                      <td className="px-3 py-3 text-center border-l border-slate-100 bg-slate-50/50">
                        <div className="text-xs font-semibold text-slate-500">
                          {formatMinutesToHoursAndMinutes(totals?.plannedMins ?? 0)}
                        </div>
                        {(totals?.actualMins ?? 0) > 0 && (
                          <>
                            <div className="text-sm font-bold text-slate-900">{formatMinutesToHoursAndMinutes(totals?.actualMins ?? 0)}</div>
                            <div className={`text-[10px] font-semibold ${(totals?.deltaMins ?? 0) >= 0 ? 'text-accent' : 'text-red-500'}`}>
                              {(totals?.deltaMins ?? 0) >= 0 ? '+' : ''}{fmtHM(totals?.deltaMins ?? 0)}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {/* Empty state — nessun dipendente */}
                {visibleUsers.length === 0 && (
                  <tr>
                    <td colSpan={weekDays.length + 2} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-slate-300" />
                        </div>
                        <p className="text-slate-600 font-semibold text-sm">{t.ts_no_data}</p>
                        <p className="text-slate-400 text-xs">{t.ts_no_employees_this_week}</p>
                      </div>
                    </td>
                  </tr>
                )}
                {/* Empty state — dipendenti presenti ma senza turni */}
                {visibleUsers.length > 0 && visibleUsers.every((u) =>
                  weekDays.every((d) => (timesheetData[u.id]?.[format(d,'yyyy-MM-dd')]?.shifts.length ?? 0) === 0)
                ) && (
                  <tr>
                    <td colSpan={weekDays.length + 2} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-slate-300" />
                        </div>
                        <p className="text-slate-600 font-semibold text-sm">{t.ts_no_shifts_this_week}</p>
                        <p className="text-slate-400 text-xs">{t.ts_no_shifts_description}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Footer totali */}
              {canTeamTimesheetOps && (
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td className="sticky left-0 bg-slate-50 pl-4 pr-3 py-3 text-slate-600 font-bold text-xs uppercase border-r border-slate-100 z-10">
                      {t.stats_total}
                    </td>
                    {weekDays.map((day, dayIdx) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const planned = visibleUsers.reduce((s, u) => s + (timesheetData[u.id]?.[dateStr]?.totalPlannedMins ?? 0), 0);
                      const actual = visibleUsers.reduce((s, u) => s + (timesheetData[u.id]?.[dateStr]?.totalActualMins ?? 0), 0);
                      const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
                      const isPayrollDay = dateStr === weekViewPayrollDayStr;
                      const payrollHighlight = isPayrollDay && (viewMode === 'week' || inP);
                      const weekEndCol = viewMode === 'month' && (dayIdx + 1) % 7 === 0;
                      const tdBorder = weekEndCol ? 'border-r-2 border-r-slate-200' : 'border-r border-slate-100';
                      const tdMuted = viewMode === 'month' && !inP;
                      const tdBg =
                        payrollHighlight
                          ? 'bg-emerald-50/50'
                          : tdMuted
                            ? 'bg-slate-100/90 opacity-70'
                            : '';
                      return (
                        <td key={dateStr} className={`px-2 py-3 text-center ${tdBorder} text-xs ${tdBg}`}>
                          {planned > 0 ? (
                            <>
                              <div className={tdMuted ? 'text-slate-400' : 'text-slate-500'}>{formatMinutesToHoursAndMinutes(planned)}</div>
                              {actual > 0 && (
                                <div className={`font-semibold ${tdMuted ? 'text-slate-500' : 'text-slate-800'}`}>
                                  {formatMinutesToHoursAndMinutes(actual)}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className={tdMuted ? 'text-slate-300' : 'text-slate-300'}>–</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center bg-slate-50 border-l border-slate-100">
                      <div className="text-xs text-slate-500">
                        {formatMinutesToHoursAndMinutes(visibleUsers.reduce((s, u) => s + (userTotals[u.id]?.plannedMins ?? 0), 0))}
                      </div>
                      <div className="text-xs font-bold text-slate-900">
                        {(() => { const act = visibleUsers.reduce((s, u) => s + (userTotals[u.id]?.actualMins ?? 0), 0); return act > 0 ? formatMinutesToHoursAndMinutes(act) : ''; })()}
                      </div>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
            </HorizontalScrollArea>
          </div>
          </>
          )}

          {/* Box personale per staff */}
          {!canTeamTimesheetOps && currentUser && uiW('timesheet.staff_summary_box') && (
            <div className="mt-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <p className="text-xs uppercase tracking-wider text-slate-400 mb-3 font-semibold">
                {t.timesheet_my_week}
              </p>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: t.ts_kpi_planned, val: formatMinutesToHoursAndMinutes(userTotals[currentUser.id]?.plannedMins ?? 0), color: 'text-slate-800' },
                  { label: t.ts_kpi_punched, val: (userTotals[currentUser.id]?.actualMins ?? 0) > 0 ? formatMinutesToHoursAndMinutes(userTotals[currentUser.id]?.actualMins ?? 0) : '–', color: 'text-slate-800' },
                  { label: t.ts_kpi_delta, val: `${(userTotals[currentUser.id]?.deltaMins ?? 0) >= 0 ? '+' : ''}${fmtHM(userTotals[currentUser.id]?.deltaMins ?? 0)}`, color: (userTotals[currentUser.id]?.deltaMins ?? 0) >= 0 ? 'text-accent' : 'text-red-500' },
                ].map(({ label, val, color }) => (
                  <div key={label}>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">{label}</p>
                    <p className={`text-2xl font-bold ${color}`}>{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

        </motion.div>
      </div>

      {/* ── DRAWER: Dettaglio turno ────────────────────────────────────── */}
      <AnimatePresence>
        {drawerData && (() => {
          const s = drawerData.shift;
          const isFrozen = s.status === 'approved' && !!s.approved_at;
          const isSoftApproved = s.status === 'approved' && !s.approved_at;
          const isApproved = isFrozen; // alias: frozen = fully locked
          const canClose = canTeamTimesheetOps && s.punched && !s.actualEnd && !!s.punchInId && !isFrozen;
          // "Congela" appare per turni soft-approved (approvati dal drawer ma non ancora congelati)
          const canApprove = canTimesheetApprove && isSoftApproved && drawerData.dateStr <= todayStr;
          const punchAuditEntries = drawerData.punchAuditEntries;
          const shiftEdits = drawerData.shiftEdits;
          const { dot, border, bg, ring, label, labelCls } = getShiftCardStyle(s, punchAuditEntries.length);
          const deltaColor = s.deltaMins > 5 ? 'text-accent' : s.deltaMins < -5 ? 'text-red-500' : 'text-slate-500';

          return (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={() => setDrawerData(null)}
              />
              {/* Drawer panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col"
              >
                {/* Drawer header — strip colorato in base allo stato */}
                <div className={`border-l-4 ${border} ${bg} ${ring}`}>
                  <div className="flex items-start justify-between px-5 pt-5 pb-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${labelCls}`}>
                          {label}
                        </span>
                        {drawerData.department && (
                          <span className="text-[10px] font-medium text-slate-400 bg-white/70 px-2 py-0.5 rounded-full border border-slate-200 truncate">
                            {drawerData.department}
                          </span>
                        )}
                        {isApproved && <Lock className="w-3.5 h-3.5 text-accent ml-auto flex-shrink-0" />}
                      </div>
                      <h3 className="font-bold text-slate-900 text-xl leading-tight truncate">{drawerData.employeeName}</h3>
                      <p className="text-sm text-slate-500 mt-1 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                        {format(parseISO(drawerData.dateStr), 'EEEE d MMMM yyyy', { locale })}
                      </p>
                    </div>
                    <button type="button" onClick={() => setDrawerData(null)}
                      className="ml-3 flex-shrink-0 p-2 rounded-xl hover:bg-white/80 transition-colors">
                      <X className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>
                </div>

                {/* Drawer body */}
                <div className="flex-1 overflow-y-auto">
                  {/* Riepilogo ore */}
                  <div className="p-5 border-b border-slate-100">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-slate-50 rounded-xl p-3">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{t.ts_label_planned}</p>
                        <p className="text-base font-bold text-slate-800 tabular-nums">{s.plannedStart}–{s.plannedEnd}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{fmtHM(s.plannedMins)}</p>
                      </div>
                      <div className={`rounded-xl p-3 ${s.punched ? (s.isCrossDay ? 'bg-red-50' : 'bg-blue-50') : 'bg-red-50'}`}>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1">{t.ts_label_punched}</p>
                        {s.punched ? (
                          <>
                            <p className="text-base font-bold text-slate-800 tabular-nums">
                              {s.actualStart}
                              {s.actualEnd ? `–${s.actualEnd}` : ''}
                            </p>
                            {s.isCrossDay && s.actualEndFull && (
                              <p className="text-[10px] font-bold text-red-600 mt-0.5 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                                {formatTrans(t.ts_crossday_out_label, {
                                  time: format(new Date(s.actualEndFull), 'dd/MM HH:mm'),
                                })}
                              </p>
                            )}
                            <p className={`text-[11px] font-semibold mt-0.5 ${s.actualMins > 0 && !s.isCrossDay ? deltaColor : 'text-amber-600'}`}>
                              {s.isCrossDay
                                ? t.ts_fix_exit_time_label
                                : s.actualMins > 0
                                  ? `${fmtHM(s.actualMins)} (${s.deltaMins >= 0 ? '+' : ''}${fmtHM(s.deltaMins)})`
                                  : t.ts_out_missing_short}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm font-semibold text-red-500">{t.ts_status_unpunched}</p>
                        )}
                      </div>
                    </div>

                    {/* Ore effettive summary se complete */}
                    {s.punched && s.actualEnd && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${s.deltaMins >= 0 ? 'bg-accent' : 'bg-red-400'}`}
                            style={{ width: `${Math.min(100, Math.max(5, (s.actualMins / Math.max(s.plannedMins, 1)) * 100))}%` }}
                          />
                        </div>
                        <span className={`text-xs font-bold ${deltaColor} tabular-nums`}>
                          {Math.round((s.actualMins / Math.max(s.plannedMins, 1)) * 100)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ── Blocco Approvazione (sempre visibile se approvato) ── */}
                  {isApproved && (
                    <div className="p-5 border-b border-slate-100 bg-accent/5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center flex-shrink-0">
                          <Lock className="w-4 h-4 text-accent" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-accent-dark">{t.ts_drawer_approved_frozen}</p>
                          <p className="text-[11px] text-accent">{t.ts_drawer_no_further_edits}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/80 rounded-xl p-3">
                          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{t.ts_drawer_approved_by}</p>
                          <p className="text-sm font-bold text-slate-800 truncate">
                            {s.approved_by ?? '—'}
                          </p>
                        </div>
                        <div className="bg-white/80 rounded-xl p-3">
                          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{t.ts_drawer_approval_date}</p>
                          <p className="text-sm font-bold text-slate-800">
                            {s.approved_at
                              ? format(new Date(s.approved_at), 'dd/MM/yyyy HH:mm')
                              : '—'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Audit log timbrature */}
                  {punchAuditEntries.length > 0 && (
                    <div className="p-5 border-b border-slate-100">
                      <div className="flex items-center gap-2 mb-3">
                        <ShieldAlert className="w-4 h-4 text-orange-500" />
                        <h4 className="text-sm font-bold text-slate-800">{t.ts_drawer_punch_edits}</h4>
                        <span className="ml-auto text-[10px] font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                          {punchAuditEntries.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {punchAuditEntries.map((e) => (
                          <div key={e.id} className="bg-orange-50 border border-orange-100 rounded-xl p-3">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                              <span className="font-semibold uppercase tracking-wide text-orange-600">{e.field}</span>
                              <span>{format(new Date(e.changed_at), 'dd/MM HH:mm')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-red-500 line-through bg-red-50 px-1.5 py-0.5 rounded-xl">{fmtAuditValue(e.old_value)}</span>
                              <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="text-accent-dark font-semibold bg-accent/5 px-1.5 py-0.5 rounded-xl">{fmtAuditValue(e.new_value)}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1.5">da {e.actor_name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Storico modifiche turno */}
                  {shiftEdits.length > 0 && (
                    <div className="p-5 border-b border-slate-100">
                      <div className="flex items-center gap-2 mb-3">
                        <History className="w-4 h-4 text-amber-500" />
                        <h4 className="text-sm font-bold text-slate-800">{t.ts_drawer_shift_edits}</h4>
                        <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                          {shiftEdits.length}
                        </span>
                      </div>
                      <div className="flex flex-col gap-2">
                        {shiftEdits.map((e) => (
                          <div key={e.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1.5">
                              <span className="font-semibold uppercase tracking-wide text-amber-600">{e.field}</span>
                              <span>{format(new Date(e.timestamp), 'dd/MM HH:mm')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-red-500 line-through bg-red-50 px-1.5 py-0.5 rounded-xl">{e.oldValue}</span>
                              <ArrowRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              <span className="text-accent-dark font-semibold bg-accent/5 px-1.5 py-0.5 rounded-xl">{e.newValue}</span>
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1.5">da {e.actorName}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {punchAuditEntries.length === 0 && shiftEdits.length === 0 && (
                    <div className="p-5 text-center text-slate-400 text-sm">
                      <FileEdit className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                      {t.ts_drawer_no_edits}
                    </div>
                  )}
                </div>

                {/* Drawer footer – azioni */}
                {canTeamTimesheetOps && !isApproved && (
                  <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-col gap-3">

                    {/* ── Modifica orario turno ── */}
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{t.ts_drawer_shift_time}</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          value={drawerEditStart}
                          onChange={(e) => setDrawerEditStart(e.target.value)}
                          className="flex-1 px-2 py-2 rounded-xl border border-slate-200 text-slate-900 font-bold text-sm text-center focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
                        />
                        <span className="text-slate-400 font-bold text-sm">–</span>
                        <input
                          type="time"
                          value={drawerEditEnd}
                          onChange={(e) => setDrawerEditEnd(e.target.value)}
                          className="flex-1 px-2 py-2 rounded-xl border border-slate-200 text-slate-900 font-bold text-sm text-center focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
                        />
                        <button
                          type="button"
                          disabled={drawerEditSaving || (drawerEditStart === s.plannedStart && drawerEditEnd === s.plannedEnd)}
                          onClick={() => handleDrawerSaveShift(s.id, drawerEditStart, drawerEditEnd)}
                          className="px-3 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent-hover disabled:opacity-40 transition-colors flex-shrink-0 flex items-center gap-1"
                        >
                          {drawerEditSaving
                            ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                            : <Check className="w-3.5 h-3.5" />}
                          {t.save}
                        </button>
                      </div>
                    </div>

                    {/* ── Correggi orario uscita (quando OUT già esiste ma è sbagliato) ── */}
                    {s.punched && s.punchOutId && (
                      <div>
                        <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${s.isCrossDay ? 'text-red-500' : 'text-slate-400'}`}>
                          {s.isCrossDay ? t.ts_drawer_fix_exit_datetime : t.ts_drawer_exit_time_punched}
                        </p>
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={drawerEditOutDate}
                            onChange={(e) => setDrawerEditOutDate(e.target.value)}
                            className="w-[130px] px-2 py-2 rounded-xl border border-slate-200 text-slate-900 text-xs text-center focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
                          />
                          <input
                            type="time"
                            value={drawerEditOutTime}
                            onChange={(e) => setDrawerEditOutTime(e.target.value)}
                            className="flex-1 px-2 py-2 rounded-xl border border-slate-200 text-slate-900 font-bold text-sm text-center focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
                          />
                          <button
                            type="button"
                            disabled={drawerEditOutSaving || (!drawerEditOutDate || !drawerEditOutTime)}
                            onClick={() => handleDrawerSaveOut(s.punchOutId!, drawerEditOutDate, drawerEditOutTime)}
                            className={`px-3 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-40 transition-colors flex-shrink-0 flex items-center gap-1 ${s.isCrossDay ? 'bg-red-500 hover:bg-red-600' : 'bg-accent hover:bg-accent-hover'}`}
                          >
                            {drawerEditOutSaving
                              ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                              : <Check className="w-3.5 h-3.5" />}
                          {t.save}
                          </button>
                        </div>
                      </div>
                    )}

                    {canClose && (
                      <button type="button"
                        onClick={() => {
                          setClockOutTime(s.plannedEnd);
                          setClosingShift({
                            shiftId: s.id,
                            punchInId: s.punchInId!,
                            dateStr: drawerData.dateStr,
                            plannedStart: s.plannedStart,
                            plannedEnd: s.plannedEnd,
                            plannedMins: s.plannedMins,
                            actualStart: s.actualStart ?? s.plannedStart,
                            employeeName: drawerData.employeeName,
                          });
                          setDrawerData(null);
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors">
                        <LogOut className="w-4 h-4" />
                        {t.ts_btn_close_shift_insert_out}
                      </button>
                    )}
                    {canApprove && (
                      <>
                        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                          <span>{t.ts_kpi_planned}: <strong className="text-slate-700">{fmtHM(s.plannedMins)}</strong></span>
                          <span>{t.ts_kpi_actual}: <strong className="text-slate-700">{fmtHM(s.actualMins)}</strong></span>
                          <span className={`font-bold ${deltaColor}`}>{s.deltaMins >= 0 ? '+' : ''}{fmtHM(s.deltaMins)}</span>
                        </div>
                        <button type="button"
                          disabled={approvingShiftId === s.id}
                          onClick={() => setApprovalConfirm({
                            shiftId: s.id,
                            employeeName: drawerData.employeeName,
                            dateStr: drawerData.dateStr,
                            plannedStart: s.plannedStart,
                            plannedEnd: s.plannedEnd,
                            plannedMins: s.plannedMins,
                            actualStart: s.actualStart,
                            actualEnd: s.actualEnd,
                            actualMins: s.actualMins,
                            deltaMins: s.deltaMins,
                          })}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-bold transition-colors disabled:opacity-50">
                          {approvingShiftId === s.id ? (
                            <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {t.ts_approving}</>
                          ) : (
                            <><Lock className="w-4 h-4" /> {t.ts_btn_approve_freeze} — {fmtHM(s.actualMins)}</>
                          )}
                        </button>
                      </>
                    )}
                    {!canClose && !canApprove && (
                      <p className="text-xs text-slate-400 text-center py-1">
                        {!s.punched
                          ? t.ts_drawer_not_punched_yet
                          : drawerData.dateStr >= todayStr
                            ? t.ts_drawer_shift_not_elapsed
                            : t.ts_drawer_awaiting_completion}
                      </p>
                    )}
                  </div>
                )}
                {isApproved && (() => {
                  const fullShift = shifts.find((sh) => sh.id === s.id);
                  return (
                    <div className="p-4 border-t border-accent/20 bg-accent/5">
                      <div className="flex items-center gap-2 text-accent-dark text-sm font-semibold mb-1">
                        <Lock className="w-4 h-4 flex-shrink-0" />
                        {t.ts_shift_approved_frozen}
                      </div>
                      {fullShift?.approved_by && (
                        <p className="text-[11px] text-accent pl-6">
                          da <strong>{fullShift.approved_by}</strong>
                          {fullShift.approved_at && (
                            <> · {format(new Date(fullShift.approved_at), 'dd/MM/yyyy HH:mm')}</>
                          )}
                        </p>
                      )}
                      <p className="text-[10px] text-accent/70 pl-6 mt-0.5">
                        {t.ts_no_edits_allowed}
                      </p>
                      {canTeamTimesheetOps && featureFlags['unlock_with_pin'] !== false && (
                        unlockModalShiftId === s.id ? (
                          <div className="mt-3">
                            <p className="text-[11px] text-slate-500 mb-1.5 text-center">{t.ts_enter_manager_pin}</p>
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={4}
                              autoFocus
                              value={unlockPin}
                              placeholder="••••"
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                setUnlockPin(val);
                                setUnlockError('');
                                if (val.length === 4) handleUnlockShift(val);
                              }}
                              className={`w-full text-center text-2xl tracking-[0.5em] font-bold px-3 py-2.5 rounded-xl border focus:outline-none focus:ring-2 transition-all ${unlockError ? 'border-red-400 ring-red-200 bg-red-50 text-red-600' : 'border-slate-300 ring-accent/30 bg-white text-slate-900'}`}
                            />
                            {unlockError && <p className="text-[11px] text-red-500 text-center mt-1 font-semibold">{unlockError}</p>}
                            {unlocking && <p className="text-[11px] text-accent text-center mt-1">{t.ts_unlocking}</p>}
                            <button type="button" onClick={() => { setUnlockModalShiftId(null); setUnlockPin(''); setUnlockError(''); }}
                              className="mt-2 w-full text-[11px] text-slate-400 hover:text-slate-600 transition-colors">
                              {t.cancel}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setUnlockModalShiftId(s.id); setUnlockPin(''); setUnlockError(''); }}
                            className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            {t.ts_btn_unlock_to_edit}
                          </button>
                        )
                      )}
                    </div>
                  );
                })()}
              </motion.div>
            </>
          );
        })()}
      </AnimatePresence>

      {/* ── Modal chiusura manuale turno sera ────────────────────────── */}
      <AnimatePresence>
        {closingShift && (() => {
          const [h, m] = clockOutTime ? clockOutTime.split(':').map(Number) : [0, 0];
          const outTime = clockOutTime ? `${String(h ?? 0).padStart(2,'0')}:${String(m ?? 0).padStart(2,'0')}` : '';
          const shiftObj = shifts.find((s) => s.id === closingShift.shiftId);
          const userObj = shiftObj ? users.find((u) => u.id === shiftObj.user_id) : undefined;
          const previewMins = outTime && shiftObj && userObj
            ? getNetShiftMinutes(shiftObj, closingShift.actualStart, outTime, userObj, breakRules, breakComputeOpts)
            : 0;
          const previewDelta = previewMins - closingShift.plannedMins;
          const previewDeltaColor = previewDelta > 5 ? 'text-accent' : previewDelta < -5 ? 'text-red-500' : 'text-slate-500';

          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
              onClick={(e) => { if (e.target === e.currentTarget) { setClosingShift(null); setClockOutTime(''); } }}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                      <LogOut className="w-4 h-4 text-amber-500" />
                      {t.ts_modal_close_shift_title}
                    </h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {closingShift.employeeName} · {format(parseISO(closingShift.dateStr), 'd MMM', { locale })}
                    </p>
                  </div>
                  <button type="button" onClick={() => { setClosingShift(null); setClockOutTime(''); }}
                    className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors">
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>

                <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between text-sm">
                  <span className="text-slate-500">{t.ts_modal_entry_registered}</span>
                  <span className="font-bold text-slate-800">{closingShift.actualStart}</span>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">{t.ts_label_exit_time}</label>
                  <input type="time" value={clockOutTime} onChange={(e) => setClockOutTime(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-slate-900 font-bold text-2xl focus:ring-2 focus:ring-accent focus:border-transparent outline-none text-center"
                    autoFocus />
                  <p className="text-[11px] text-slate-400 mt-1 text-center">
                    {t.ts_label_planned}: {closingShift.plannedStart}–{closingShift.plannedEnd}
                  </p>
                </div>

                {clockOutTime && previewMins > 0 && (
                  <div className="bg-slate-50 rounded-xl p-3 mb-4">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">{t.ts_modal_hours_preview}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-slate-400">{t.ts_kpi_planned}</p>
                        <p className="font-bold text-slate-700 text-sm">{fmtHM(closingShift.plannedMins)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">{t.ts_kpi_actual}</p>
                        <p className="font-bold text-slate-800 text-sm">{fmtHM(previewMins)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400">{t.ts_kpi_delta}</p>
                        <p className={`font-bold text-sm ${previewDeltaColor}`}>{previewDelta >= 0 ? '+' : ''}{fmtHM(previewDelta)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={() => { setClosingShift(null); setClockOutTime(''); }}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                    {t.cancel}
                  </button>
                  <button type="button" disabled={!clockOutTime || closingLoading} onClick={handleConfirmClose}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors">
                    {closingLoading ? t.ts_saving : <><LogOut className="w-3.5 h-3.5" />{t.ts_btn_register_exit}</>}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Modal revisione giornata ─────────────────────────────────── */}
      <AnimatePresence>
        {dayReview && (() => {
          const item = dayReview.items[dayReview.currentIdx];
          const s = item.shift;
          const total = dayReview.items.length;
          const idx = dayReview.currentIdx;
          const isComplete = !!(dayReviewIn && dayReviewOut);
          const hasMissingOut = !s.actualEnd && !s.actualEndFull;
          const hasMissingIn = !s.punchInId;
          const deltaColor = s.deltaMins > 5 ? 'text-accent' : s.deltaMins < -5 ? 'text-red-500' : 'text-slate-500';
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
              onClick={(e) => { if (e.target === e.currentTarget) setDayReview(null); }}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.15 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

                {/* Header */}
                <div className="bg-slate-50 border-b border-slate-100 px-5 py-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Calendar className="w-4 h-4 text-accent" />
                      <h3 className="font-bold text-slate-900 text-base">
                        {t.ts_modal_day_review_title} {format(parseISO(dayReview.dateStr), 'EEE d MMM', { locale })}
                      </h3>
                    </div>
                    {/* Progress pills */}
                    <div className="flex items-center gap-1 mt-1.5 pl-6">
                      {dayReview.items.map((_, i) => (
                        <button key={i} type="button"
                          onClick={() => { setDayReview((p) => p ? { ...p, currentIdx: i } : null); initDayReviewFields(dayReview.items[i], dayReview.dateStr); }}
                          className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-5 bg-accent' : 'w-2 bg-slate-200 hover:bg-slate-300'}`} />
                      ))}
                      <span className="ml-1 text-[10px] text-slate-400 font-medium">{idx + 1}/{total}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => setDayReview(null)}
                    className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors ml-2 flex-shrink-0">
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4">
                  {/* Dipendente */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-accent-dark font-bold text-sm flex-shrink-0">
                      {item.employeeName[0]}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{item.employeeName}</p>
                      {item.department && <p className="text-[11px] text-slate-400">{item.department}</p>}
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-[10px] text-slate-400 uppercase font-semibold">{t.ts_label_planned}</p>
                      <p className="text-sm font-bold text-slate-700 tabular-nums">{s.plannedStart}–{s.plannedEnd}</p>
                    </div>
                  </div>

                  {/* Avvisi */}
                  {hasMissingIn && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      {t.ts_warning_no_punch_in}
                    </div>
                  )}
                  {hasMissingOut && !hasMissingIn && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      {t.ts_warning_no_exit}
                    </div>
                  )}
                  {s.isCrossDay && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600 font-medium">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      {t.ts_warning_crossday_exit}
                    </div>
                  )}

                  {/* Campi IN / OUT */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                        {t.ts_label_entry} {hasMissingIn && <span className="text-red-500">{t.ts_label_absent}</span>}
                      </label>
                      <input type="time" value={dayReviewIn}
                        onChange={(e) => setDayReviewIn(e.target.value)}
                        disabled={hasMissingIn}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-900 font-bold text-sm text-center focus:ring-2 focus:ring-accent focus:border-transparent outline-none disabled:opacity-40 disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                        {t.ts_label_exit}
                      </label>
                      <input type="time" value={dayReviewOut}
                        onChange={(e) => setDayReviewOut(e.target.value)}
                        disabled={hasMissingIn}
                        className={`w-full px-3 py-2.5 rounded-xl border text-slate-900 font-bold text-sm text-center focus:ring-2 focus:ring-accent focus:border-transparent outline-none disabled:opacity-40 ${
                          hasMissingOut && !hasMissingIn ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Data uscita (solo se cross-day o diversa dal turno) */}
                  {(s.isCrossDay || (s.actualEndFull && format(new Date(s.actualEndFull), 'yyyy-MM-dd') !== dayReview.dateStr)) && (
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                        {t.ts_label_exit_date}
                      </label>
                      <input type="date" value={dayReviewOutDate}
                        onChange={(e) => setDayReviewOutDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-slate-900 text-sm focus:ring-2 focus:ring-accent outline-none"
                      />
                    </div>
                  )}

                  {/* Preview ore nette */}
                  {dayReviewIn && dayReviewOut && !hasMissingIn && (
                    <div className="bg-slate-50 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                      <span className="text-slate-500">{t.ts_net_hours}</span>
                      <span className={`font-bold tabular-nums ${deltaColor}`}>
                        {fmtHM(Math.max(0, calculateShiftMinutesGross(dayReviewIn, dayReviewOut) - s.breakMinutes))}
                      </span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 pb-5 flex flex-col gap-2">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => handleDayReviewNavigate(-1)} disabled={idx === 0}
                      className="flex-shrink-0 px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 disabled:opacity-30 transition-colors">
                      ←
                    </button>
                    <button type="button"
                      disabled={dayReviewSaving || hasMissingIn || !isComplete}
                      onClick={handleDayReviewSave}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
                      {dayReviewSaving
                        ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {t.ts_saving}</>
                        : <><Check className="w-4 h-4" /> {idx < total - 1 ? t.ts_btn_save_and_next : t.ts_btn_save_and_close}</>
                      }
                    </button>
                    {idx < total - 1 && (
                      <button type="button" onClick={() => handleDayReviewNavigate(1)}
                        className="flex-shrink-0 px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                        →
                      </button>
                    )}
                  </div>
                  <button type="button" onClick={() => handleDayReviewNavigate(1)}
                    className="text-[11px] text-slate-400 hover:text-slate-600 text-center transition-colors py-0.5">
                    {idx < total - 1 ? t.ts_btn_skip : t.ts_btn_close_without_saving}
                  </button>
                </div>

              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Modal conferma approvazione ──────────────────────────────── */}
      <AnimatePresence>
        {approvalConfirm && (() => {
          const ac = approvalConfirm;
          const deltaColor = ac.deltaMins > 5 ? 'text-accent' : ac.deltaMins < -5 ? 'text-red-500' : 'text-slate-500';
          const hasAnomaly = ac.deltaMins < -10 || !ac.actualEnd;
          return (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
              onClick={(e) => { if (e.target === e.currentTarget) setApprovalConfirm(null); }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }} transition={{ duration: 0.15 }}
                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
              >
                {/* Header */}
                <div className="bg-accent/8 border-b border-accent/15 px-5 py-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <Lock className="w-4 h-4 text-accent flex-shrink-0" />
                      <h3 className="font-bold text-slate-900 text-base">{t.ts_modal_confirm_approval}</h3>
                    </div>
                    <p className="text-sm text-slate-500 pl-6">
                      {ac.employeeName} · {format(parseISO(ac.dateStr), 'EEEE d MMMM', { locale })}
                    </p>
                  </div>
                  <button type="button" onClick={() => setApprovalConfirm(null)}
                    className="p-1.5 rounded-xl hover:bg-slate-100 transition-colors ml-2 flex-shrink-0">
                    <X className="w-4 h-4 text-slate-500" />
                  </button>
                </div>

                {/* Dati da verificare */}
                <div className="p-5 space-y-3">
                  {/* Pianificato vs Effettivo */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">{t.ts_label_planned}</p>
                      <p className="text-sm font-bold text-slate-700 tabular-nums">{ac.plannedStart} – {ac.plannedEnd}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{fmtHM(ac.plannedMins)}</p>
                    </div>
                    <div className={`rounded-xl p-3 ${ac.actualEnd ? 'bg-blue-50' : 'bg-red-50'}`}>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">{t.ts_label_punched}</p>
                      {ac.actualEnd ? (
                        <>
                          <p className="text-sm font-bold text-slate-800 tabular-nums">{ac.actualStart} – {ac.actualEnd}</p>
                          <p className={`text-[11px] font-semibold mt-0.5 ${deltaColor}`}>
                            {fmtHM(ac.actualMins)} ({ac.deltaMins >= 0 ? '+' : ''}{fmtHM(ac.deltaMins)})
                          </p>
                        </>
                      ) : (
                        <p className="text-sm font-semibold text-red-500">{t.ts_status_missing_out}</p>
                      )}
                    </div>
                  </div>

                  {/* Barra visiva delta */}
                  {ac.actualMins > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${ac.deltaMins >= 0 ? 'bg-accent' : 'bg-red-400'}`}
                          style={{ width: `${Math.min(100, Math.max(4, (ac.actualMins / Math.max(ac.plannedMins, 1)) * 100))}%` }}
                        />
                      </div>
                      <span className={`text-[11px] font-bold tabular-nums ${deltaColor}`}>
                        {Math.round((ac.actualMins / Math.max(ac.plannedMins, 1)) * 100)}%
                      </span>
                    </div>
                  )}

                  {/* Avviso se anomalia */}
                  {hasAnomaly && (
                    <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 font-medium">
                        {!ac.actualEnd
                          ? t.ts_warning_no_exit_confirm
                          : t.ts_warning_anomaly}
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400 text-center">
                    {t.ts_approval_freeze_notice}
                  </p>
                </div>

                {/* Azioni */}
                <div className="flex gap-2 px-5 pb-5">
                  <button type="button" onClick={() => setApprovalConfirm(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    disabled={approvingShiftId === ac.shiftId}
                    onClick={async () => {
                      setApprovalConfirm(null);
                      await handleApproveShift(ac.shiftId);
                    }}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {approvingShiftId === ac.shiftId
                      ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> {t.ts_approving}</>
                      : <><Lock className="w-4 h-4" /> {t.ts_btn_yes_approve_freeze}</>
                    }
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </>
  );
}
