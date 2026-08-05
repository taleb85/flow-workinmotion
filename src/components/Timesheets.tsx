import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef, lazy, Suspense, type CSSProperties } from 'react';

const StatisticsLazy = lazy(() => import('./Statistics'));
import {
  format,
  addDays,
  parseISO,
  isToday,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isValid,
} from 'date-fns';
import { it } from 'date-fns/locale';
import {
  ChevronRight, ChevronLeft, Check, X,
  Clock, History, ShieldAlert, LogOut, Lock, Unlock,
  Users, UserCheck, AlertCircle, ArrowRight, Calendar, Moon,
  ChevronDown, Filter, RotateCcw,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppUser, useAppData, useAppConfig, useAppOverlay } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { getTranslations, getDateLocale, formatTrans } from '../utils/translations';
import {
  calculateShiftMinutesGross,
  formatMinutesToHoursAndMinutes,
  normalizeTimeInputToHHmm,
} from '../utils/timeCalculations';
import {
  getBreakMinutesForShift,
  getNetShiftMinutes,
  DEFAULT_AUTO_BREAK_MINUTES,
  type BreakMinutesComputeOptions,
  type BreakRule,
} from '../utils/breakRules';
import {
  isManagementRole,
  isUserVisibleOnTeamSchedule,
  canOperateTeamSchedule,
  canApproveShiftActions,
  findFreezeVerifierByPin,
  findFreezeVerifierById,
} from '../utils/permissions';
import { isFeatureEnabled } from '../utils/enabledFeatures';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';
import { getShiftHistory, type HistoryEntry } from '../utils/scheduleHistory';
import { safeFormatDate } from '../utils/safeDateFormat';
import { database } from '../lib/database';
import { TimeInputField } from './ui/TimeInputField';
import {
  loadPeriodConfig,
  savePeriodConfig as persistPeriodConfig,
  getPeriodStartDate,
  getPeriodEndDate,
  PERIOD_STORAGE_KEY,
  dispatchPeriodConfigUpdated,
  weekIndexForDateInPeriod,
  getPeriodDateRange,
  nextPeriodConfig,
  prevPeriodConfig,
  currentPeriodConfig,
  periodConfigForMonth,
  type PeriodConfig,
} from '../utils/periodConfig';
import { saveTimesheetPeriodToSupabase } from '../utils/timesheetPeriodSupabase';
import type { PunchAuditEntry, PunchRecord, PunchRecordSource, Shift, User } from '../types';
import { getResolvedStartEndForHours, shiftPastPlannedEndWithoutClockIn } from '../utils/shiftResolvedClockTimes';
import { HorizontalScrollArea } from './HorizontalScrollArea';
// import DatePickerField from './DatePickerField'; // unused
import TimesheetManagementKpiBlock from './TimesheetManagementKpiBlock';
import { CenteredModalPortal } from './ui/CenteredModalPortal';
import { getPayrollPaymentDateForCalendarMonth } from '../utils/payrollSchedule';
import { isShiftPayrollFrozen } from '../utils/timesheetFreezeCriteria';
import { getDeptColor, getDepartments, deptMatchesFilterKey } from '../utils/departments';
// import { translateDepartmentValue } from '../utils/departmentLabels'; // unused
import { getTimesheetGridPrivacyMode } from '../utils/timesheetGridPrivacy';
import { PinPadModal } from './ui/PinPadModal';
import { runAutoApprove } from '../utils/autoApprovePunches';
import { useDrawerUnlock } from '../hooks/useDrawerUnlock';
import TimesheetDayDrawer from './timesheets/TimesheetDayDrawer';
import { mergeShiftDeductExclusionsFromLocal } from '../utils/shiftDeductExclusionsLocal';

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Pill reparto: sfondo colore reparto, testo bianco (scurisce il rgb se troppo chiaro per il contrasto). */
function _departmentChipStyle(hex: string): CSSProperties {
  const raw = hex.replace('#', '').trim();
  const six = raw.length === 6 && /^[0-9a-fA-F]{6}$/.test(raw) ? raw : '6b6b6b';
  let r = parseInt(six.slice(0, 2), 16);
  let g = parseInt(six.slice(2, 4), 16);
  let b = parseInt(six.slice(4, 6), 16);
  const lin = (x: number) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const relLum = () => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  for (let i = 0; i < 10 && relLum() > 0.48; i++) {
    r = Math.max(0, Math.floor(r * 0.82));
    g = Math.max(0, Math.floor(g * 0.82));
    b = Math.max(0, Math.floor(b * 0.82));
  }
  return {
    backgroundColor: `rgb(${r},${g},${b})`,
    borderColor: 'rgba(255,255,255,0.25)',
    color: '#ffffff',
  };
}

function toMinutesFromMidnight(hhmm: string): number {
  const [h, m] = (hhmm || '00:00').slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Uscita sul calendario del giorno dopo il turno, entro 24h dall’ingresso: chiusura notturna (es. 18:00 → 00:00),
 * non errore "data errata".
 */
function isTimesheetNightRolloverOk(
  shiftDateStr: string,
  actualEndISO: string,
  punchIn: { calculated_time?: string; timestamp: string } | undefined,
  isLunchSlot: boolean,
  punchActualStart: string | null
): boolean {
  if (!punchIn) return false;
  const outD = new Date(actualEndISO);
  if (!isValid(outD)) return false;
  const shiftD = parseISO(shiftDateStr);
  if (!isValid(shiftD)) return false;
  const actualEndDate = format(outD, 'yyyy-MM-dd');
  const nextShiftDay = format(addDays(shiftD, 1), 'yyyy-MM-dd');
  if (actualEndDate !== nextShiftDay) return false;
  const inMs = new Date(punchIn.calculated_time || punchIn.timestamp).getTime();
  const outMs = outD.getTime();
  const elapsed = outMs - inMs;
  if (elapsed <= 0 || elapsed > 24 * 60 * 60 * 1000) return false;
  if (isLunchSlot) {
    const eveningIn =
      !!punchActualStart && toMinutesFromMidnight(punchActualStart) >= 14 * 60;
    if (!eveningIn) return false;
  }
  return true;
}

/**
 * Se data uscita = giorno turno ma l’ora è prima dell’ingresso (es. IN 18:00, OUT 00:00), assume giorno successivo.
 */
function resolveTimesheetPunchOutDateStr(
  shiftDateStr: string,
  manualOutDateStr: string | undefined,
  inHHMM: string,
  outHHMM: string
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(shiftDateStr)) return null;
  const trimmedManual = (manualOutDateStr || '').trim();
  const base =
    trimmedManual && /^\d{4}-\d{2}-\d{2}$/.test(trimmedManual) ? trimmedManual : shiftDateStr;
  const inSlice = (inHHMM || '').trim().slice(0, 5);
  const outSlice = (outHHMM || '').trim().slice(0, 5);
  const inNorm = normalizeTimeInputToHHmm(inSlice) || inSlice;
  const outNorm = normalizeTimeInputToHHmm(outSlice) || outSlice;
  if (!/^\d{1,2}:\d{2}$/.test(inNorm) || !/^\d{1,2}:\d{2}$/.test(outNorm)) return base;
  const pad2 = (hm: string) => {
    const [h, m] = hm.split(':').map((x) => parseInt(String(x), 10) || 0);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const inP = pad2(inNorm);
  const outP = pad2(outNorm);
  const inM = toMinutesFromMidnight(inP);
  const outM = toMinutesFromMidnight(outP);
  if (base === shiftDateStr && outM < inM) {
    return format(addDays(parseISO(shiftDateStr), 1), 'yyyy-MM-dd');
  }
  return base;
}

/** Dati per il popup congelo dopo salvataggio timbrature in coda revisione giornata/settimana. */
function buildReviewQueueFreezeApprovalPayload(args: {
  shiftId: string;
  employeeName: string;
  shiftDateStr: string;
  plannedStart: string;
  plannedEnd: string;
  plannedMins: number;
  fullShift: Shift;
  user: User;
  breakRules: BreakRule[];
  breakComputeOpts: BreakMinutesComputeOptions;
  inHm: string;
  outHm: string;
  resolvedOutDate: string;
}): {
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
  freezeUsesPlannedTimes: boolean;
  afterFreeze: 'advance_review';
} {
  const inNorm = normalizeTimeInputToHHmm(args.inHm.trim()) || args.inHm.trim().slice(0, 5);
  const outNorm = normalizeTimeInputToHHmm(args.outHm.trim()) || args.outHm.trim().slice(0, 5);
  const pad2 = (hm: string) => {
    const [h, m] = hm.split(':').map((x) => parseInt(String(x), 10) || 0);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const inP = pad2(inNorm);
  const outP = pad2(outNorm);
  const actualMins = getNetShiftMinutes(
    args.fullShift,
    inP,
    outP,
    args.user,
    args.breakRules,
    args.breakComputeOpts
  );
  const deltaMins = actualMins - args.plannedMins;
  return {
    shiftId: args.shiftId,
    employeeName: args.employeeName,
    dateStr: args.shiftDateStr,
    plannedStart: args.plannedStart,
    plannedEnd: args.plannedEnd,
    plannedMins: args.plannedMins,
    actualStart: inP,
    actualEnd: outP,
    actualMins,
    deltaMins,
    freezeUsesPlannedTimes: false,
    afterFreeze: 'advance_review',
  };
}

function fmtHM(mins: number): string {
  if (mins === 0) return '0h';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  const sign = mins < 0 ? '−' : '';
  return m > 0 ? `${sign}${h}h${m.toString().padStart(2, '0')}` : `${sign}${h}h`;
}

/** Durata pausa detratta in forma leggibile (es. 30 → "30m", 90 → "1h30m"). */
function fmtBreakDeductionShort(mins: number): string {
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${m}m`;
}

/** Formatta un valore audit: se è un ISO timestamp lo converte in dd/MM HH:mm, altrimenti lo restituisce as-is */
function _fmtAuditValue(v: string | null | undefined): string {
  if (!v) return '—';
  // Plain ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    try {
      const d = new Date(v);
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { return v; }
  }
  // "approved @ ISO" pattern
  const approvedMatch = v.match(/^approved\s*@\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}[^\s]*)/i);
  if (approvedMatch && approvedMatch[1]) {
    try {
      const d = new Date(approvedMatch[1]);
      return `Approvato ${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    } catch { /* fall through */ }
  }
  // Status label translations
  const statusMap: Record<string, string> = {
    confirmed: 'Pubblicato', approved: 'Approvato', draft: 'Bozza',
    absent: 'Assente', frozen: 'Congelato', published: 'Pubblicato',
  };
  if (statusMap[v.toLowerCase()]) return statusMap[v.toLowerCase()];
  // Boolean
  if (v === 'true') return 'Sì';
  if (v === 'false') return 'No';
  return v;
}

const FIELD_LABEL_MAP: Record<string, string> = {
  STATUS: 'Stato', STATO: 'Stato', APPROVAL_STATUS: 'Stato',
  CALCULATED_TIME: 'Ore calcolate', START_TIME: 'Inizio', END_TIME: 'Fine',
  DEDUCT_BREAK: 'Detrae pausa', APPROVED_AT: 'Data approvazione',
  APPROVED_BY: 'Approvato da', APPROVAZIONE_TURNO: 'Approvazione',
  PUNCH_IN: 'Entrata', PUNCH_OUT: 'Uscita', PUNCH_IN_TIME: 'Ora entrata',
  PUNCH_OUT_TIME: 'Ora uscita', NOTE: 'Note', DEPARTMENT: 'Reparto',
  ROLE: 'Ruolo', BREAK_MINUTES: 'Pausa (min)',
};
function _humanizeFieldName(field: string | undefined): string {
  if (field == null || field === '') return '—';
  const up = field.toUpperCase();
  return FIELD_LABEL_MAP[up] ?? field.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase());
}

function punchTimeHHMM(ts: string | null | undefined): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return null; }
}

function _punchSourceLabel(
  source: PunchRecordSource | null | undefined,
  t: ReturnType<typeof getTranslations>
): string {
  if (source === 'manual') return t.ts_punch_source_manual;
  if (source === 'manager') return t.ts_punch_source_manager;
  if (source === 'kiosk') return t.ts_punch_source_kiosk;
  return t.ts_punch_source_legacy;
}

/** Stesso criterio della griglia presenze (`timesheetData`) per l’IN. */
function findPunchInForShiftOnDate(
  shift: Shift,
  userId: string,
  dateStr: string,
  punchRecords: PunchRecord[]
): PunchRecord | undefined {
  const plannedStart = (shift.start_time || '').slice(0, 5);
  const shiftHour = parseInt(plannedStart.split(':')[0], 10);
  const isLunch = shiftHour < 16;
  return punchRecords.find((p) => {
    if (p.type !== 'in') return false;
    if (shift.id && p.shift_id) return p.shift_id === shift.id;
    if (p.user_id !== userId) return false;
    const pDate = new Date(p.timestamp);
    if (!isValid(pDate)) return false;
    if (format(pDate, 'yyyy-MM-dd') !== dateStr) return false;
    return isLunch ? pDate.getHours() < 16 : pDate.getHours() >= 16;
  });
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
  /** Detrazione pausa sul pianificato (regole / fallback sul turno pianificato). */
  breakMinutes: number;
  /** Detrazione pausa sulle ore effettive (timbratura / congelato); 0 se effettivo incompleto. */
  breakMinutesActual: number;
  actualStart: string | null;
  actualEnd: string | null;
  actualEndFull?: string;
  actualMins: number;
  deltaMins: number;
  /** In griglia l’effettivo deriva da orari congelati (approved_start/end), non da timbrature grezze. */
  displayFromFrozenApprovedTimes?: boolean;
  status: 'approved' | 'confirmed' | 'draft' | 'absent' | 'frozen';
  punched: boolean;
  punchInId?: string;
  punchOutId?: string;
  punchInSource?: PunchRecordSource | null;
  punchOutSource?: PunchRecordSource | null;
  isLate: boolean;
  hasMissingOut: boolean;
  isCrossDay?: boolean;
  /** Uscita legittima il giorno dopo (mezzanotte / notte), solo informativo in UI. */
  nightRolloverOk?: boolean;
  approved_by?: string;
  approved_at?: string;
}

/** Pranzo / mattina &lt; 16:00 in alto; cena (inizio pianificato ≥ 16:00) in basso nella cella. */
function partitionShiftsByPlannedHour16(shifts: ShiftRow[]): { before16: ShiftRow[]; from16: ShiftRow[] } {
  const before16: ShiftRow[] = [];
  const from16: ShiftRow[] = [];
  for (const s of shifts) {
    const hour = parseInt((s.plannedStart || '00:00').split(':')[0], 10) || 0;
    if (hour >= 16) from16.push(s);
    else before16.push(s);
  }
  return { before16, from16 };
}

interface DayData {
  dateStr: string;
  shifts: ShiftRow[];
  totalPlannedMins: number;
  totalActualMins: number;
  totalDeltaMins: number;
  /** Somma ore nette da turni con orario ufficiale congelato (solo per totali in modalità solo pianificato). */
  totalFrozenOfficialMins: number;
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

/** Coda «revisione giornata» / settimana per dipendente: stesso modal, navigazione 1/N e salva/prossimo. */
type DrawerReviewQueueItem = {
  userId: string;
  employeeName: string;
  department?: string;
  shift: ShiftRow;
  /** Giorno di calendario del turno (yyyy-MM-dd). */
  dateStr: string;
};
type DrawerReviewQueue = {
  dateStr: string;
  items: DrawerReviewQueueItem[];
  currentIdx: number;
  reviewScope?: 'day' | 'employee_week';
  completed?: boolean;
};

function shiftRowPayrollFrozen(s: ShiftRow): boolean {
  return isShiftPayrollFrozen({
    approval_status: s.status,
    approved_at: s.approved_at ?? undefined,
  });
}

/** Stessi criteri di `handleOpenDayReview` (header «revisiona» e modal). */
function shiftEligibleForDayReview(s: ShiftRow): boolean {
  if (s.status === 'absent') return false;
  return s.status !== 'approved' && !shiftRowPayrollFrozen(s);
}

/** Turno pronto per approvazione massiva: assenza, già congelato in griglia, o timbratura con entrata e uscita (niente uscita mancante). */
function shiftRowCompleteForToolbarApprove(row: ShiftRow): boolean {
  if (row.status === 'absent') return true;
  if (row.displayFromFrozenApprovedTimes) return true;
  if (shiftRowPayrollFrozen(row)) return true;
  if (row.hasMissingOut) return false;
  if (!row.punched) return false;
  return !!(row.actualStart && row.actualEnd);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Timesheets() {
  const { shifts, punchRecords, updateShift, approveShift, updatePunchRecord, addPunchRecord, deletePunchRecordsForShift } = useAppData();
  const { currentUser, effectiveLanguage, isSessionElevated, globalPinSessionId, users } = useAppUser();
  const { featureFlags, breakRules, departmentsRevision } = useAppConfig();
  const { showSuccess, showError } = useAppOverlay();
  const t = useT();
  const locale = getDateLocale(effectiveLanguage) ?? it;

  const canTeamTimesheetOps = useMemo(
    () => currentUser ? canOperateTeamSchedule(currentUser) : false,
    [currentUser]
  );
  const canTimesheetApprove = useMemo(
    () => currentUser ? canApproveShiftActions(currentUser) : false,
    [currentUser]
  );
  const timesheetGridPrivacyMode = getTimesheetGridPrivacyMode(currentUser);
  const showFullTimesheetGrid = timesheetGridPrivacyMode === 'full';
  const plannedOnlyTimesheetGrid = timesheetGridPrivacyMode === 'planned_only';
  const uiW = (key: string) => (currentUser ? isUiWidgetVisible(currentUser, key) : false);

  const now = new Date();
  const initialConfig = loadPeriodConfig();
  /** Evita setWeekIndex(0) se loadPeriodConfig() coincide con il periodo già in memoria (es. rientro su Presenze). */
  const periodSyncRef = useRef<{ startDate: string; numWeeks: 4 | 5 } | null>(null);
  /** Salta una risincronizza weekIndex ← sessionStorage nell'effetto periodo (altrimenti può annullare goToToday). */
  const skipWeekIndexSessionSyncRef = useRef(false);
  const [periodConfig, setPeriodConfig] = useState(initialConfig);
  const [periodStart, setPeriodStart] = useState<string>(initialConfig.startDate);
  const [periodNumWeeks, setPeriodNumWeeks] = useState<4 | 5>(initialConfig.numWeeks);
  const [periodSaved, setPeriodSaved] = useState(true);
  /** Offset di navigazione periodo: 0 = periodo salvato, -N = N periodi indietro, +N = N periodi avanti. */
  const [periodNavOffset, setPeriodNavOffset] = useState(0);

  /** Sub-tab interno: griglia presenze o statistiche. */
  const [tsView, setTsView] = useState<'grid' | 'stats'>('grid');
  const showStatsSubTab = currentUser ? isFeatureEnabled(currentUser, 'view_stats') : false;

  // ── Auto-Conferma timbrature ─────────────────────────────────────────────────
  const [autoApprovedCount, setAutoApprovedCount] = useState(0);
  const [autoApproveBannerDismissed, setAutoApproveBannerDismissed] = useState(false);
  const autoApproveRunRef = useRef(false);

  useEffect(() => {
    if (!canTimesheetApprove) return;
    if (autoApproveRunRef.current) return;
    if (!shifts.length || !punchRecords.length) return;

    autoApproveRunRef.current = true;

    runAutoApprove(shifts, currentUser?.id ?? '').then(
      (approved) => {
        if (approved > 0) setAutoApprovedCount(approved);
      },
    ).catch(() => {
      // Silent fail per auto-approve
    });
  }, [shifts, punchRecords, updateShift, canTimesheetApprove]);
  // ─────────────────────────────────────────────────────────────────────────────

  const _handleSavePeriodConfig = () => {
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

  /** Applica un PeriodConfig precalcolato (prev/next/today) salvandolo subito. */
  const applyAndSavePeriod = useCallback((cfg: PeriodConfig) => {
    setPeriodStart(cfg.startDate);
    setPeriodNumWeeks(cfg.numWeeks);
    persistPeriodConfig(cfg);
    setPeriodConfig(cfg);
    setPeriodSaved(true);
    setWeekIndex(0);
    dispatchPeriodConfigUpdated();
    void saveTimesheetPeriodToSupabase(cfg).catch(() => {
      showError?.(t.ts_period_cloud_failed);
    });
  }, [showError, t]);

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

  // Applica offset navigazione periodo rispetto al periodo base salvato
  useEffect(() => {
    if (periodNavOffset === 0) return; // gestito da applyPeriodFromStorage
    let cfg = loadPeriodConfig();
    if (periodNavOffset > 0) {
      for (let i = 0; i < periodNavOffset; i++) cfg = nextPeriodConfig(cfg);
    } else {
      for (let i = 0; i > periodNavOffset; i--) cfg = prevPeriodConfig(cfg);
    }
    setPeriodStart(cfg.startDate);
    setPeriodNumWeeks(cfg.numWeeks);
    setPeriodSaved(false);
    setWeekIndex(0);
   
  }, [periodNavOffset]);

  type ViewMode = 'day' | 'week' | 'month';
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [dayOffset, setDayOffset] = useState(() => {
    const today = new Date();
    const config = loadPeriodConfig();
    const start = getPeriodStartDate(config);
    const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  });
  const [weekIndex, setWeekIndex] = useState(() =>
    readStoredWeekIndex(initialConfig.startDate, initialConfig.numWeeks)
  );
  const [drawerData, setDrawerData] = useState<DrawerData | null>(null);
  const [drawerReviewQueue, setDrawerReviewQueue] = useState<DrawerReviewQueue | null>(null);

  // Persisti weekIndex in sessionStorage ogni volta che cambia (sincronizza con Scheda Turni)
  useEffect(() => {
    try {
      sessionStorage.setItem(timesheetWeekStorageKey(periodConfig.startDate, periodConfig.numWeeks), String(weekIndex));
    } catch { /* ignore */ }
  }, [weekIndex, periodConfig.startDate, periodConfig.numWeeks]);

  // Quando la scheda diventa attiva, riporta la visualizzazione al giorno corrente
  // MA non se l'utente sta già operando (drawer aperto o review queue in corso)
  // IMPORTANTE: NON resettare la settimana - rimane quella selezionata anche dopo aver cambiato scheda
  useEffect(() => {
    if (drawerData || drawerReviewQueue) return; // Non riportare a oggi se il drawer è aperto o queue in corso
    const today = new Date();
    const start = getPeriodStartDate(periodConfig);
    const diff = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (dayOffset !== diff) {
      setDayOffset(diff);
    }
    // Risincronizza la settimana dalla sessionStorage (es. se Turni ha cambiato settimana nel frattempo)
    if (skipWeekIndexSessionSyncRef.current) {
      skipWeekIndexSessionSyncRef.current = false;
    } else {
      const stored = readStoredWeekIndex(periodConfig.startDate, periodConfig.numWeeks);
      if (stored !== weekIndex) setWeekIndex(stored);
    }
    // dayOffset è letto per confrontarlo con oggi ma non va nelle dipendenze: a ogni cambio di offset
    // rieseguire l'effetto riallineerebbe al «oggi» e annullerebbe la navigazione giorno-per-giorno.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- vedi sopra
  }, [periodConfig, drawerData, drawerReviewQueue, weekIndex]);

  // Rilegge weekIndex da sessionStorage quando la tab Presenze viene attivata
  useEffect(() => {
    const onActivated = (e: Event) => {
      if ((e as CustomEvent).detail !== 'timesheet') return;
      const stored = readStoredWeekIndex(periodConfig.startDate, periodConfig.numWeeks);
      if (stored !== weekIndex) setWeekIndex(stored);
    };
    window.addEventListener('osteria-tab-activated', onActivated);
    return () => window.removeEventListener('osteria-tab-activated', onActivated);
  }, [periodConfig, weekIndex]);

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
  const _calendarPaddedDays = useMemo(() => {
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
  const [approvingShiftId, setApprovingShiftId] = useState<string | null>(null);
  // Undo stack — max 10 operazioni reversibili
  const [tsUndoStack, setTsUndoStack] = useState<Array<{ label: string; fn: () => Promise<void> }>>([]);
  const pushTsUndo = (label: string, fn: () => Promise<void>) =>
    setTsUndoStack((prev) => [{ label, fn }, ...prev].slice(0, 10));

  // Highlight turni dalla card KPI: filtro persistente a toggle
  const [statFilter, setStatFilter] = useState<{ label: string; ids: Set<string> } | null>(null);
  const highlightedShiftIds: Set<string> = statFilter?.ids ?? new Set();
  const [punchAudits, setPunchAudits] = useState<Record<string, PunchAuditEntry[]>>({});
  const [closingShift, setClosingShift] = useState<ClosingShiftState | null>(null);
  const [clockOutTime, setClockOutTime] = useState('');
  const [closingLoading, setClosingLoading] = useState(false);
  const [drawerOpenSource, setDrawerOpenSource] = useState<'name' | 'date' | 'turno' | null>(null);

  // Ruoli gestionali: filtro libero. Staff operativo: vincolato al reparto del profilo.
  // Capo: management ma bloccato al proprio reparto (non può cambiarlo).
  // isSessionElevated e elevated_role: accesso gestionale completo anche per ruoli non-management.
  const isAdminTs = currentUser
    ? (isManagementRole(currentUser.role) || isSessionElevated || !!currentUser.elevated_role)
    : false;
  const lockedDeptTs = (!isAdminTs && currentUser?.department) ? currentUser.department : null;

  const [pdfDeptFilter, setPdfDeptFilter] = useState<string>(() =>
    currentUser?.department ?? lockedDeptTs ?? 'all'
  );
  const [showPdfDeptMenu, setShowPdfDeptMenu] = useState(false);

  useEffect(() => {
    if (lockedDeptTs) setPdfDeptFilter(lockedDeptTs);
    else if (!isAdminTs) setPdfDeptFilter('all');
  }, [lockedDeptTs, isAdminTs]);
  const pdfDeptMenuRef = useRef<HTMLDivElement | null>(null);
  const [showWeekApproveMenu, setShowWeekApproveMenu] = useState(false);
  const [weekApproveMenuMobile, setWeekApproveMenuMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  );
  const [weekApproveDesktopPos, setWeekApproveDesktopPos] = useState<{ top: number; left: number } | null>(null);
  const weekApproveMenuRef = useRef<HTMLDivElement | null>(null);
  const weekApproveBtnRef = useRef<HTMLButtonElement | null>(null);
  const weekApprovePortalRef = useRef<HTMLDivElement | null>(null);
  const [showPeriodPopover, setShowPeriodPopover] = useState(false);
  const [periodPopoverYear, setPeriodPopoverYear] = useState<number>(() => new Date().getFullYear());
  const [periodPopoverPos, setPeriodPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const periodPopoverRef = useRef<HTMLDivElement | null>(null);
  const periodTriggerRef = useRef<HTMLButtonElement | null>(null);
  const timesheetBodyScrollRef = useRef<HTMLDivElement | null>(null);
  const timesheetHeaderScrollRef = useRef<HTMLDivElement | null>(null);
  const timesheetTheadRef = useRef<HTMLTableSectionElement | null>(null);
  const [timesheetHeaderSticky, setTimesheetHeaderSticky] = useState(false);
  const timesheetMirrorHeaderRef = useRef<HTMLDivElement>(null);
  const timesheetMirrorHeaderH = useRef(64);

  // Mostra il mirror header quando il thead originale esce dalla viewport
  useEffect(() => {
    const el = timesheetTheadRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setTimesheetHeaderSticky(!entry.isIntersecting),
      { threshold: 0, rootMargin: '-60px 0px 0px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Compensazione scroll sincrona: evita il salto visivo quando il mirror header appare/scompare
  useLayoutEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;
    if (timesheetHeaderSticky) {
      const h = timesheetMirrorHeaderRef.current?.offsetHeight ?? 64;
      timesheetMirrorHeaderH.current = h;
      root.scrollTop += h;
    } else {
      root.scrollTop -= timesheetMirrorHeaderH.current;
    }
  }, [timesheetHeaderSticky]);

  // Sincronizza scroll orizzontale: corpo → header mirror
  useEffect(() => {
    const body = timesheetBodyScrollRef.current;
    const header = timesheetHeaderScrollRef.current;
    if (!body || !header) return;
    const sync = () => { header.scrollLeft = body.scrollLeft; };
    body.addEventListener('scroll', sync, { passive: true });
    return () => body.removeEventListener('scroll', sync);
  });

  // Reparti dalla configurazione: rispetta ordine, nascosti e custom — aggiornato al cambio delle impostazioni
  const availableDepts = useMemo(() => {
    const usedValues = new Set(users.map(u => u.department).filter(Boolean) as string[]);
    return getDepartments().filter(d => usedValues.has(d.value));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, departmentsRevision]);

  useEffect(() => {
    if (!showPdfDeptMenu) return;
    const onClick = (e: MouseEvent) => {
      if (pdfDeptMenuRef.current && !pdfDeptMenuRef.current.contains(e.target as Node)) {
        setShowPdfDeptMenu(false);
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [showPdfDeptMenu]);

  useEffect(() => {
    if (!showWeekApproveMenu) return;
    let removeListener: (() => void) | undefined;
    const t = window.setTimeout(() => {
      const onClick = (e: MouseEvent) => {
        const node = e.target as Node;
        if (weekApproveMenuRef.current?.contains(node)) return;
        if (weekApprovePortalRef.current?.contains(node)) return;
        setShowWeekApproveMenu(false);
        setWeekApproveDesktopPos(null);
      };
      window.addEventListener('click', onClick);
      removeListener = () => window.removeEventListener('click', onClick);
    }, 0);
    return () => {
      window.clearTimeout(t);
      removeListener?.();
    };
  }, [showWeekApproveMenu]);

  useLayoutEffect(() => {
    if (!showWeekApproveMenu || weekApproveMenuMobile) {
      if (!showWeekApproveMenu) setWeekApproveDesktopPos(null);
      return;
    }
    const btn = weekApproveBtnRef.current;
    if (!btn) return;
    const update = () => {
      const r = btn.getBoundingClientRect();
      const panelW = 256;
      const left = Math.min(Math.max(8, r.right - panelW), window.innerWidth - panelW - 8);
      setWeekApproveDesktopPos({ top: r.bottom + 4, left });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [showWeekApproveMenu, weekApproveMenuMobile]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)');
    const sync = () => setWeekApproveMenuMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!showPeriodPopover) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const insidePopover = periodPopoverRef.current?.contains(target);
      const insideTrigger = periodTriggerRef.current?.contains(target);
      if (!insidePopover && !insideTrigger) {
        setShowPeriodPopover(false);
      }
    };
    // Leggero delay per non catturare il click che ha aperto il popover
    const t = setTimeout(() => window.addEventListener('click', onClick), 0);
    return () => { clearTimeout(t); window.removeEventListener('click', onClick); };
  }, [showPeriodPopover]);

  const [pinGatePin, setPinGatePin] = useState('');
  const [pinGateError, setPinGateError] = useState('');
  const [pinGateUnlocking, setPinGateUnlocking] = useState(false);
  
  // Hook unificato per gestire unlock PIN (sostituisce 5 stati separati)
  const {
    isUnlocked: isDrawerUnlocked,
    unlock: unlockDrawer,
    unlockDrawerSession,
    resetAll: resetDrawerUnlocks,
    drawerSessionId,
  } = useDrawerUnlock();
  
  const pinGateKeyboardInputRef = useRef<HTMLInputElement | null>(null);
  /** Evita doppio submit (React Strict Mode) e permette di reinserire lo stesso PIN dopo errore. */
  const pinGateAutoSubmittedFor = useRef('');
  const drawerReviewQueueRef = useRef(drawerReviewQueue);
  drawerReviewQueueRef.current = drawerReviewQueue;
  const [reviewQueueSaving, setReviewQueueSaving] = useState(false);
  const timesheetShiftDetailPanelRef = useRef<HTMLDivElement | null>(null);

  const [manualPunchIn, setManualPunchIn] = useState('');
  const [manualPunchOut, setManualPunchOut] = useState('');
  const [manualPunchOutDate, setManualPunchOutDate] = useState('');
  const [drawerJustOpened, setDrawerJustOpened] = useState(false);
  const [manualPunchSaving, setManualPunchSaving] = useState(false);
  /** Form IN/OUT sotto il riepilogo: dopo «Registra timbrature» si richiude; tap su riepilogo lo riapre. */
  const [drawerManualPunchFormExpanded, setDrawerManualPunchFormExpanded] = useState(true);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const manualPunchInHourRef = useRef<HTMLInputElement | null>(null);
  const manualPunchOutHourRef = useRef<HTMLInputElement | null>(null);

  /** Click/tap sulla card orario → stesso effetto di un click diretto sul campo ore (un solo gesto). */
  const _focusManualPunchHourFromSummary = useCallback((which: 'in' | 'out') => {
    const pick = () => (which === 'in' ? manualPunchInHourRef.current : manualPunchOutHourRef.current);
    const apply = () => {
      const el = pick();
      if (!el) return false;
      el.focus({ preventScroll: true });
      queueMicrotask(() => el.select());
      return true;
    };
    if (apply()) return;
    requestAnimationFrame(() => {
      if (apply()) return;
      requestAnimationFrame(apply);
    });
  }, []);
  const [markAbsentSaving, setMarkAbsentSaving] = useState(false);
  const [drawerShiftEditsExpanded, setDrawerShiftEditsExpanded] = useState(false);
  const [deductBreakSaving, setDeductBreakSaving] = useState(false);
  const [, setDrawerPlannedTimeStart] = useState('');
  const [, setDrawerPlannedTimeEnd] = useState('');

  const closeTimesheetShiftDrawer = useCallback(() => {
    setDrawerData(null);
    setDrawerReviewQueue(null);
    setMarkAbsentSaving(false);
    setPinGateModal(null);
    setPinGatePin('');
    setPinGateError('');
    resetDrawerUnlocks();
    setDrawerShiftEditsExpanded(false);
    setDrawerManualPunchFormExpanded(true);
    setDrawerJustOpened(false);
    setShowCloseConfirm(false);
  }, [resetDrawerUnlocks]);

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
    /** true se mancano timbrature complete: in congelamento si usano orari pianificati / uscita prevista. */
    freezeUsesPlannedTimes: boolean;
    /** Dopo congelamento con PIN: avanza la coda revisione invece di chiudere solo il pannello. */
    afterFreeze?: 'advance_review';
  } | null>(null);
  const [approvalPin, setApprovalPin] = useState('');
  const [approvalPinError, setApprovalPinError] = useState('');
  /** Dopo l’ultimo salvataggio in revisione settimana dipendente: congela tutti i turni della coda con un solo PIN. */
  const [employeeWeekFreezeBatch, setEmployeeWeekFreezeBatch] = useState<{
    shiftIds: string[];
    employeeName: string;
    previewRows: { dateStr: string; planned: string }[];
  } | null>(null);
  const [employeeWeekFreezeBusy, setEmployeeWeekFreezeBusy] = useState(false);

  const [approveWeekSummary, setApproveWeekSummary] = useState<{
    employeeName: string;
    shiftIds: string[];
    previewRows: Array<{ dateStr: string; planned: string; employeeLabel?: string }>;
    approvedIds?: string[];
  } | null>(null);
  const [undoApprovalBusy, setUndoApprovalBusy] = useState(false);

  const [pinGateModal, setPinGateModal] = useState<{
    shiftId: string;
    mode:
      | 'enable_timbrature'
      | 'unlock_frozen'
      | 'unlock_shift_edits'
      | 'delete_punches'
      | 'enable_planned_times_edit'
      | 'batch_week_approve'
      | 'freeze_single_shift';
    batchData?: {
      shiftIds: string[];
      employeeName: string;
      previewRows: Array<{ dateStr: string; planned: string; employeeLabel?: string }>;
    };
    /** Orari pianificati da usare come timbratura quando il turno non è timbrato (freeze_single_shift). */
    plannedStart?: string;
    plannedEnd?: string;
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

  const weekDays = useMemo(
    () =>
      viewMode === 'day'
        ? [addDays(periodStartDate, dayOffset)]
        : viewMode === 'week'
          ? allPeriodDays.slice(weekIndex * 7, weekIndex * 7 + 7)
          : allPeriodDays, // 'month': mostra solo i giorni del periodo configurato
    [viewMode, periodStartDate, dayOffset, allPeriodDays, weekIndex]
  );
  const weekStart = weekDays[0] ?? periodStartDate;
  const lastDay = weekDays[weekDays.length - 1] ?? periodEndDate;
  const weekStr = format(weekStart, 'yyyy-MM-dd');

  // Reset filtro KPI quando cambia la settimana visualizzata
   
  useEffect(() => { setStatFilter(null); }, [weekStr]);

  const triggerShiftHighlight = (ids: string[], label: string) => {
    setStatFilter(prev => {
      if (prev && prev.label === label) return null;
      return ids.length > 0 ? { label, ids: new Set(ids) } : null;
    });
  };
  const weekEnd = format(addDays(lastDay, 1), 'yyyy-MM-dd');
  const todayStr = format(now, 'yyyy-MM-dd');

  const maxDayOffset = allPeriodDays.length - 1;

  const timesheetMainGridWeekNav = useMemo(
    () =>
      viewMode === 'day'
        ? {
            canPrev: dayOffset > 0,
            canNext: dayOffset < maxDayOffset,
            onPrev: () => setDayOffset((d) => Math.max(0, d - 1)),
            onNext: () => setDayOffset((d) => Math.min(maxDayOffset, d + 1)),
          }
        : viewMode === 'week'
          ? {
              canPrev: weekIndex > 0,
              canNext: weekIndex < maxWeekIndex,
              onPrev: () => setWeekIndex((i) => Math.max(0, i - 1)),
              onNext: () => setWeekIndex((i) => Math.min(maxWeekIndex, i + 1)),
            }
          : undefined,
    [viewMode, weekIndex, maxWeekIndex, dayOffset, maxDayOffset]
  );

  /** Griglia presenze: larghezze fisse (px) — nome | ogni giorno | colonna totale. */
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const timesheetGridDayColPx = viewMode === 'month' ? (isMobile ? 120 : 148) : 132;
  const timesheetGridNameColPx = 90;
  const timesheetGridTotalColPx = 76;
  const timesheetGridMinWidthPx =
    timesheetGridNameColPx + weekDays.length * timesheetGridDayColPx + timesheetGridTotalColPx;

  /** Già sulla settimana che contiene oggi (stesso periodo salvato in stato, senza offset navigazione periodo). */
  const isShowingTodayWeek = useMemo(() => {
    if (viewMode !== 'week' || periodNavOffset !== 0) return false;
    const { startDate, endDate } = getPeriodDateRange(periodConfig);
    if (todayStr < startDate || todayStr > endDate) return false;
    const target = weekIndexForDateInPeriod(periodConfig, new Date());
    return weekIndex === target;
  }, [viewMode, periodNavOffset, todayStr, periodConfig, weekIndex]);

  const goToToday = useCallback(() => {
    const cfg = loadPeriodConfig();
    const { startDate, endDate } = getPeriodDateRange(cfg);
    if (todayStr < startDate || todayStr > endDate) {
      const targetCfg = currentPeriodConfig();
      const wIdx = weekIndexForDateInPeriod(targetCfg, new Date());
      skipWeekIndexSessionSyncRef.current = true;
      setViewMode('week');
      setPeriodNavOffset(0);
      applyAndSavePeriod(targetCfg);
      try {
        sessionStorage.setItem(timesheetWeekStorageKey(targetCfg.startDate, targetCfg.numWeeks), String(wIdx));
      } catch {
        /* ignore */
      }
      setWeekIndex(wIdx);
      return;
    }
    const wIdx = weekIndexForDateInPeriod(cfg, new Date());
    skipWeekIndexSessionSyncRef.current = true;
    setViewMode('week');
    setPeriodNavOffset(0);
    applyPeriodFromStorage();
    try {
      sessionStorage.setItem(timesheetWeekStorageKey(cfg.startDate, cfg.numWeeks), String(wIdx));
    } catch {
      /* ignore */
    }
    setWeekIndex(wIdx);
  }, [applyPeriodFromStorage, todayStr, applyAndSavePeriod]);


  useEffect(() => {
    setWeekIndex((i) => Math.min(i, maxWeekIndex));
  }, [maxWeekIndex]);

  useEffect(() => {
    if (approvalConfirm || employeeWeekFreezeBatch) {
      setApprovalPin('');
      setApprovalPinError('');
    }
  }, [approvalConfirm, employeeWeekFreezeBatch]);

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
    // Se l'utente corrente NON è gestionale, vede solo sé stesso
    if (currentUser && !isManagementRole(currentUser.role)) {
      return users.filter((u) => u.id === currentUser.id);
    } else {
      // Utente gestionale: vede tutti gli utenti operativi
      let list = users.filter((u) => {
        // Solo attivi e visibili in planning
        if (u.status !== 'active' || !isUserVisibleOnTeamSchedule(u, shifts)) return false;
        
        // Filtro data inizio rapporto: nascondi se employment_start_date > fine settimana visualizzata
        if (u.employment_start_date && u.employment_start_date >= weekEnd) return false;
        
      // Filtro reparto (se attivo)
      if (pdfDeptFilter !== 'all') {
        return deptMatchesFilterKey(u.department, pdfDeptFilter);
      }

        return true;
      });

      // Applica lo stesso ordinamento della scheda Turni (WeeklyShiftsTable)
      list = [...list].sort((a, b) => {
        // Priorità reparto: Sala e Bar, poi Sala, poi Bar, poi Cucina, poi altri
        const getDeptPriority = (u: User) => {
          const d = (u.department || '').toLowerCase();
          if (d === 'sala_bar') return 1;
          if (d === 'sala') return 2;
          if (d === 'bar') return 3;
          if (d === 'kitchen' || d === 'cucina') return 4;
          return 5;
        };
        const pa = getDeptPriority(a);
        const pb = getDeptPriority(b);
        if (pa !== pb) return pa - pb;

        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });
      return list;
    }
  }, [users, shifts, currentUser, pdfDeptFilter, weekEnd]);

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
          const sForBreak = mergeShiftDeductExclusionsFromLocal(s);
          if (s.approval_status === 'absent') {
            const plannedStart = (s.start_time || '').slice(0, 5);
            const plannedEnd = (s.end_time || '').slice(0, 5);
            const grossPlanned = calculateShiftMinutesGross(plannedStart, plannedEnd);
            const breakMinutes = getBreakMinutesForShift(
              sForBreak,
              grossPlanned,
              user,
              breakRules,
              breakComputeOpts
            );
            const plannedMins = Math.max(0, grossPlanned - breakMinutes);
            return {
              id: s.id,
              plannedStart,
              plannedEnd,
              plannedMins,
              breakMinutes,
              breakMinutesActual: 0,
              actualStart: null,
              actualEnd: null,
              actualEndFull: undefined,
              actualMins: 0,
              deltaMins: -plannedMins,
              displayFromFrozenApprovedTimes: false,
              status: 'absent' as const,
              punched: false,
              isLate: false,
              hasMissingOut: false,
              isCrossDay: false,
              nightRolloverOk: false,
              approved_by: s.approved_by ?? undefined,
              approved_at: s.approved_at ?? undefined,
            };
          }
          const plannedStart = (s.start_time || '').slice(0, 5);
          const plannedEnd = (s.end_time || '').slice(0, 5);
          const grossPlanned = calculateShiftMinutesGross(plannedStart, plannedEnd);
          const breakMinutes = getBreakMinutesForShift(
            sForBreak,
            grossPlanned,
            user,
            breakRules,
            breakComputeOpts
          );
          const plannedMins = Math.max(0, grossPlanned - breakMinutes);

          const shiftHour = parseInt(plannedStart.split(':')[0], 10);
          const isLunch = shiftHour < 16;

          const punchIn = punchRecords.find((p) => {
            if (p.type !== 'in') return false;
            if (s.id && p.shift_id) return p.shift_id === s.id;
            if (p.user_id !== user.id) return false;
            const pDate = new Date(p.timestamp);
            if (!isValid(pDate)) return false;
            if (format(pDate, 'yyyy-MM-dd') !== dateStr) return false;
            return isLunch ? pDate.getHours() < 16 : pDate.getHours() >= 16;
          });

          const nextCalendarDayStr = format(addDays(parseISO(dateStr), 1), 'yyyy-MM-dd');
          const punchOut = punchRecords.find((p) => {
            if (p.type !== 'out') return false;
            if (s.id && p.shift_id) return p.shift_id === s.id;
            if (p.user_id !== user.id) return false;
            const pDate = new Date(p.timestamp);
            if (!isValid(pDate)) return false;
            const pDateStr = format(pDate, 'yyyy-MM-dd');
            if (pDateStr === dateStr) {
              return isLunch ? pDate.getHours() < 16 : pDate.getHours() >= 16;
            }
            if (
              !isLunch &&
              punchIn &&
              pDateStr === nextCalendarDayStr &&
              pDate.getTime() > new Date(punchIn.calculated_time || punchIn.timestamp).getTime() &&
              pDate.getTime() - new Date(punchIn.calculated_time || punchIn.timestamp).getTime() <=
                24 * 60 * 60 * 1000
            ) {
              return true;
            }
            return false;
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

          const actualEndDateRaw = actualEndFull ? new Date(actualEndFull) : null;
          const actualEndDate =
            actualEndDateRaw && isValid(actualEndDateRaw)
              ? format(actualEndDateRaw, 'yyyy-MM-dd')
              : dateStr;
          const nightRolloverOk =
            !frozen &&
            !!actualEndFull &&
            isTimesheetNightRolloverOk(
              dateStr,
              actualEndFull,
              punchIn,
              isLunch,
              punchActualStart
            );
          const isCrossDay =
            !frozen && !!actualEndFull && actualEndDate !== dateStr && !nightRolloverOk;
          /** Pausa sulle ore effettive: regole e fasce pranzo/cena usano timbratura (o congelate); su turni congelati
           *  si disabilita solo il fallback unico 30' senza fascia pasto (straordinario oltre il pianificato). */
          const actualMins =
            displayActualStart && displayActualEnd
              ? getNetShiftMinutes(
                  sForBreak,
                  displayActualStart,
                  displayActualEnd,
                  user,
                  breakRules,
                  frozen ? { ...breakComputeOpts, autoBreaksFeatureEnabled: false } : breakComputeOpts
                )
              : Math.max(0, grossActualMins);
          const breakMinutesActual =
            displayActualStart && displayActualEnd
              ? Math.max(
                  0,
                  calculateShiftMinutesGross(displayActualStart, displayActualEnd) - actualMins
                )
              : 0;
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
            breakMinutesActual,
            actualStart: displayActualStart,
            actualEnd: displayActualEnd,
            actualEndFull: actualEndFullForRow,
            actualMins,
            deltaMins,
            displayFromFrozenApprovedTimes: frozen,
            status: s.approval_status,
            punched: !!punchIn,
            punchInId: punchIn?.id,
            punchOutId: punchOut?.id,
            punchInSource: punchIn?.source ?? null,
            punchOutSource: punchOut?.source ?? null,
            isLate,
            hasMissingOut,
            isCrossDay,
            nightRolloverOk,
            approved_by: s.approved_by ?? undefined,
            approved_at: s.approved_at ?? undefined,
          };
        });

        const totalPlannedMins = shiftRows.reduce((a, r) => a + r.plannedMins, 0);
        const totalActualMins = shiftRows.reduce((a, r) => a + r.actualMins, 0);
        const totalDeltaMins = totalActualMins - totalPlannedMins;
        const totalFrozenOfficialMins = shiftRows.reduce(
          (a, r) => a + (r.displayFromFrozenApprovedTimes ? r.actualMins : 0),
          0
        );

        data[user.id][dateStr] = {
          dateStr,
          shifts: shiftRows,
          totalPlannedMins,
          totalActualMins,
          totalDeltaMins,
          totalFrozenOfficialMins,
        };
      }
    }
    return data;
  }, [visibleUsers, weekDays, weekShifts, punchRecords, breakRules, breakComputeOpts]);

  const userTotals = useMemo(() => {
    const totals: Record<
      string,
      { plannedMins: number; actualMins: number; deltaMins: number; frozenOfficialMins: number }
    > = {};
    for (const user of visibleUsers) {
      let planned = 0,
        actual = 0,
        frozenOfficial = 0;
      for (const day of weekDays) {
        const dayData = timesheetData[user.id]?.[format(day, 'yyyy-MM-dd')];
        if (dayData) {
          planned += dayData.totalPlannedMins;
          actual += dayData.totalActualMins;
          frozenOfficial += dayData.totalFrozenOfficialMins;
        }
      }
      totals[user.id] = {
        plannedMins: planned,
        actualMins: actual,
        deltaMins: actual - planned,
        frozenOfficialMins: frozenOfficial,
      };
    }
    return totals;
  }, [visibleUsers, weekDays, timesheetData]);

  /** Vista settimana: toolbar Approva settimana + menu (tutti / per dipendente; abilitazione se dati completi). */
  const weekBulkApproveToolbar = useMemo(() => {
    if (viewMode !== 'week') return null;
    const visibleUserIds = new Set(visibleUsers.map((u) => u.id));
    const weekShiftsAll = shifts.filter(
      (s) => visibleUserIds.has(s.user_id) && s.date >= weekStr && s.date < weekEnd
    );
    if (weekShiftsAll.length === 0) return null;
    /** Turni ancora da sigillare in contabilità (inclusi absent senza `approved_at`). I congelati sono `approved` o `absent`+`approved_at`. */
    const weekShiftsToApprove = weekShiftsAll.filter((s) => !isShiftPayrollFrozen(s));
    const weekApproved = weekShiftsAll.filter((s) => isShiftPayrollFrozen(s));
    const hasDataToApprove = weekShiftsToApprove.length > 0;
    const hasApproved = weekApproved.length > 0;
    if (!hasDataToApprove && !hasApproved) return null;
    const isApprovedState = !hasDataToApprove && hasApproved;

    const rowComplete = (shiftId: string, userId: string, dateStr: string): boolean => {
      const row = timesheetData[userId]?.[dateStr]?.shifts.find((sr) => sr.id === shiftId);
      if (!row) return false;
      return shiftRowCompleteForToolbarApprove(row);
    };

    const fullWeekComplete =
      weekShiftsToApprove.length > 0 &&
      weekShiftsToApprove.every((s) => rowComplete(s.id, s.user_id, s.date));

    const employeesPending = visibleUsers
      .map((u) => {
        const pending = weekShiftsToApprove.filter((s) => s.user_id === u.id);
        if (pending.length === 0) return null;
        const complete = pending.every((s) => rowComplete(s.id, s.user_id, s.date));
        const name = `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}`.trim();
        return { user: u, name, pendingShifts: pending, complete };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    const approvedByUser = visibleUsers
      .map((u) => {
        const ap = weekApproved.filter((s) => s.user_id === u.id);
        if (ap.length === 0) return null;
        const name = `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}`.trim();
        return { user: u, name, approvedShifts: ap };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    /** Almeno un’azione nel menu (stessa logica dei pulsanti interni): undo oppure approva con dati completi. */
    const hasApproveMenuAction =
      isApprovedState ||
      fullWeekComplete ||
      employeesPending.some((e) => e.complete);

    return {
      isApprovedState,
      targetShifts: isApprovedState ? weekApproved : weekShiftsToApprove,
      weekApproved,
      weekShiftsToApprove,
      fullWeekComplete,
      employeesPending,
      approvedByUser,
      hasApproveMenuAction,
    };
  }, [viewMode, visibleUsers, shifts, weekStr, weekEnd, timesheetData]);

  /** Allinea il drawer al dato griglia dopo nuove timbrature (stesso turno aperto). */
  useEffect(() => {
    if (!drawerData) return;
    const u = visibleUsers.find((x) => x.id === drawerData.userId);
    if (!u) return;
    const freshRows = timesheetData[u.id]?.[drawerData.dateStr]?.shifts;
    const fresh = freshRows?.find((r) => r.id === drawerData.shift.id);
    if (!fresh) return;
    setDrawerData((d) => {
      if (!d || d.shift.id !== fresh.id) return d;
      const p = d.shift;
      if (
        fresh.punched === p.punched &&
        fresh.actualStart === p.actualStart &&
        fresh.actualEnd === p.actualEnd &&
        fresh.punchInId === p.punchInId &&
        fresh.punchInSource === p.punchInSource &&
        fresh.punchOutSource === p.punchOutSource &&
        fresh.actualMins === p.actualMins &&
        fresh.plannedMins === p.plannedMins &&
        fresh.plannedStart === p.plannedStart &&
        fresh.plannedEnd === p.plannedEnd &&
        fresh.breakMinutes === p.breakMinutes &&
        fresh.breakMinutesActual === p.breakMinutesActual &&
        fresh.deltaMins === p.deltaMins &&
        fresh.hasMissingOut === p.hasMissingOut &&
        fresh.isCrossDay === p.isCrossDay &&
        fresh.nightRolloverOk === p.nightRolloverOk
      ) {
        return d;
      }
      return {
        ...d,
        shift: fresh,
        punchAuditEntries: fresh.punchInId ? punchAudits[fresh.punchInId] ?? [] : [],
      };
    });
  }, [timesheetData, punchAudits, drawerData, visibleUsers]);

  useEffect(() => {
    if (drawerData?.shift?.id) setDrawerShiftEditsExpanded(true);
  }, [drawerData?.shift?.id]);

  // ── Indicatori Presenze: settimana visualizzata (in turno = solo se oggi è in quella settimana) ──
  const weekViewStats = useMemo(() => {
    const visibleUserIds = new Set(visibleUsers.map((u) => u.id));
    const todayInViewedWeek = todayStr >= weekStr && todayStr < weekEnd;
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    let inTurno = 0,
      ritardi = 0,
      senzaTimbratura = 0,
      approvati = 0;
    const ritardiIds: string[] = [];
    const senzaTimbratureIds: string[] = [];

    for (const day of weekDays) {
      const dateStr = format(day, 'yyyy-MM-dd');
      const isFutureDay = dateStr > todayStr;
      const dayShifts = weekShifts.filter((s) => s.date === dateStr && visibleUserIds.has(s.user_id));

      for (const s of dayShifts) {
        if (s.approval_status === 'absent') continue;

        if (s.approval_status === 'approved') approvati++;

        if (todayInViewedWeek && dateStr === todayStr) {
          const startMins = toMinutesFromMidnight((s.start_time || '').slice(0, 5));
          const endMins = toMinutesFromMidnight((s.end_time || '00:00').slice(0, 5));
          if (nowMins >= startMins - 30 && nowMins <= endMins) inTurno++;
        }

        if (isFutureDay) continue;

        const startMins = toMinutesFromMidnight((s.start_time || '').slice(0, 5));
        const punchIn = findPunchInForShiftOnDate(s, s.user_id, dateStr, punchRecords);
        if (!punchIn) {
          senzaTimbratura++;
          senzaTimbratureIds.push(s.id);
        } else {
          const actualStartHHMM = punchTimeHHMM(punchIn.calculated_time || punchIn.timestamp);
          if (actualStartHHMM && toMinutesFromMidnight(actualStartHHMM) > startMins + 5) {
            ritardi++;
            ritardiIds.push(s.id);
          }
        }
      }
    }
    return { inTurno, ritardi, ritardiIds, senzaTimbratura, senzaTimbratureIds, approvati };
  }, [weekShifts, weekDays, punchRecords, visibleUsers, todayStr, weekStr, weekEnd]);

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
      const sForBreak = mergeShiftDeductExclusionsFromLocal(s);
      const breakMins = getBreakMinutesForShift(
        sForBreak,
        grossPlanned,
        user ?? undefined,
        breakRules,
        breakComputeOpts
      );
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

  const scrollToTimesheetAnchor = useCallback((elementId: string) => {
    requestAnimationFrame(() => {
      document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  /** Card riepilogo settimana visualizzata: tutte portano alla griglia presenze principale. */
  const handleStatCardClick = useCallback(() => {
    if (!currentUser) return;
    scrollToTimesheetAnchor('timesheet-section-main-grid');
  }, [currentUser, scrollToTimesheetAnchor]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleApproveShift = async (
    shiftId: string,
    actorOverride?: import('../types').User,
    opts?: { afterSuccess?: 'close_drawer' | 'advance_review'; silentToast?: boolean }
  ) => {
    setApprovingShiftId(shiftId);
    try {
      const raw = shifts.find((s) => s.id === shiftId);
      // Push undo: ripristina stato approvazione precedente
      if (raw) {
        const prevStatus = raw.approval_status;
        const prevStart = raw.start_time;
        const prevEnd = raw.end_time;
        pushTsUndo(`Annulla approvazione ${prevStart}–${prevEnd}`, async () => {
          await updateShift(shiftId, { approval_status: prevStatus, start_time: prevStart, end_time: prevEnd });
        });
      }
      await approveShift(shiftId, {
        actorOverride,
        promoteFromDraft: raw?.approval_status === 'draft',
      });
      if (!opts?.silentToast) showSuccess?.(t.ts_toast_shift_approved);
      if (opts?.afterSuccess === 'advance_review') {
        advanceDrawerReviewAfterStep();
      } else {
        setDrawerData(null);
        setDrawerReviewQueue(null);
      }
    } catch {
      showError?.(t.ts_toast_approve_freeze_error);
    } finally {
      setApprovingShiftId(null);
    }
  };

  const applyPayrollUnlock = useCallback(
    async (shiftId: string, verifier: User) => {
      const actorName = `${verifier.first_name} ${verifier.last_name ?? ''}`.trim();
      const full = shifts.find((sh) => sh.id === shiftId);
      const restoreAbsent = full?.approval_status === 'absent' && !!full?.approved_at;
      const nextStatus = restoreAbsent ? 'absent' : 'confirmed';
      await updateShift(shiftId, {
        approval_status: nextStatus,
        approved_at: null as unknown as string,
        approved_by: null as unknown as string,
        approved_start_time: null as unknown as string,
        approved_end_time: null as unknown as string,
      });
      const punchIn = punchRecords.find((p) => p.type === 'in' && p.shift_id === shiftId);
      if (punchIn) {
        try {
          await database.punchAuditLog.insert({
            punch_record_id: punchIn.id,
            changed_by: verifier.id,
            actor_id: verifier.id,
            actor_name: actorName,
            field: 'sblocco_turno',
            old_value: 'approved',
            new_value: nextStatus,
          });
        } catch {
          /* non bloccante */
        }
      }
      setDrawerData((prev) =>
        prev
          ? {
              ...prev,
              shift: {
                ...prev.shift,
                status: nextStatus as ShiftRow['status'],
                approved_at: undefined,
                approved_by: undefined,
              },
            }
          : null
      );
    },
    [shifts, punchRecords, updateShift]
  );

  const runEmployeeWeekBatchFreeze = useCallback(async (verifier: User) => {
    const batch = employeeWeekFreezeBatch || pinGateModal?.batchData;
    if (!batch) return;
    if (!verifier) {
      setPinGateError(t.ts_approval_pin_invalid);
      setPinGatePin('');
      return;
    }
    setEmployeeWeekFreezeBusy(true);
    try {
      for (const shiftId of batch.shiftIds) {
        const raw = shifts.find((s) => s.id === shiftId);
        if (!raw || raw.approval_status === 'approved' || isShiftPayrollFrozen(raw)) continue;
        await approveShift(shiftId, {
          actorOverride: verifier,
          promoteFromDraft: raw.approval_status === 'draft',
        });
      }
      setEmployeeWeekFreezeBatch(null);
      setPinGateModal(null);
      setPinGatePin('');
      setApproveWeekSummary(prev => prev
        ? { ...prev, approvedIds: batch.shiftIds }
        : {
            employeeName: batch.employeeName,
            shiftIds: batch.shiftIds,
            previewRows: batch.previewRows ?? [],
            approvedIds: batch.shiftIds,
          }
      );
    } catch {
      showError?.(t.ts_toast_approve_freeze_error);
    } finally {
      setEmployeeWeekFreezeBusy(false);
    }
  }, [employeeWeekFreezeBatch, pinGateModal, shifts, approveShift, showError, t]);

  const submitTimbraturePinGate = useCallback(
    async (pinOrVerifier: string | User) => {
      if (!pinGateModal) return;
      const verifier = typeof pinOrVerifier === 'string'
        ? findFreezeVerifierByPin(users, pinOrVerifier)
        : pinOrVerifier;
      if (!verifier) {
        setPinGateError(t.wst_freeze_pin_invalid);
        setPinGatePin('');
        return;
      }
      setPinGateUnlocking(true);
      try {
        if (pinGateModal.mode === 'batch_week_approve') {
          await runEmployeeWeekBatchFreeze(verifier);
          return;
        }
        if (pinGateModal.mode === 'freeze_single_shift') {
          try {
            const raw = shifts.find((s) => s.id === pinGateModal.shiftId);
            await approveShift(pinGateModal.shiftId, {
              actorOverride: verifier,
              promoteFromDraft: raw?.approval_status === 'draft',
              ...(pinGateModal.plannedStart ? { approvedStart: pinGateModal.plannedStart } : {}),
              ...(pinGateModal.plannedEnd ? { approvedEnd: pinGateModal.plannedEnd } : {}),
            });
            showSuccess?.(t.ts_toast_shift_frozen ?? 'Turno congelato');
          } catch {
            showError?.(t.ts_toast_approve_freeze_error);
          } finally {
            setPinGateModal(null);
            setPinGatePin('');
            setPinGateError('');
          }
          return;
        }
        if (pinGateModal.mode === 'delete_punches') {
          await deletePunchRecordsForShift(pinGateModal.shiftId);
          showSuccess?.(t.ts_toast_punches_deleted);
          setPinGateModal(null);
          setPinGatePin('');
          setPinGateError('');
          closeTimesheetShiftDrawer();
          return;
        }
        
        // Sessione PIN globale: una volta sbloccato il drawer, tutte le modifiche non richiedono il PIN
        const sessionId = Date.now().toString();
        unlockDrawerSession(sessionId);
        
        if (pinGateModal.mode === 'unlock_frozen') {
          await applyPayrollUnlock(pinGateModal.shiftId, verifier);
          showSuccess?.(t.ts_toast_shift_unlocked);
        }
        if (pinGateModal.mode === 'unlock_shift_edits') {
          unlockDrawer(pinGateModal.shiftId, 'history');
          setDrawerShiftEditsExpanded(true);
          
          // Apri il drawer in sospeso con keepPinSession=true (sessione già sbloccata)
          try {
            const pending = sessionStorage.getItem('pendingDrawerOpen');
            if (pending) {
              sessionStorage.removeItem('pendingDrawerOpen');
              const { shift, user, dateStr, openSource, reviewQueue: pendingQueue } = JSON.parse(pending);
              // Se c'è una queue, passa openSource=null così il footer della review queue prende il controllo
              openDrawer(shift, user, dateStr, pendingQueue ?? null, pendingQueue ? null : (openSource || 'date'), true);
            }
          } catch {
            // ignorare errori parsing
          }
        }
        if (pinGateModal.mode === 'enable_planned_times_edit') {
          const full = shifts.find((sh) => sh.id === pinGateModal.shiftId);
          if (full) {
            setDrawerPlannedTimeStart((full.start_time || '').slice(0, 5));
            setDrawerPlannedTimeEnd((full.end_time || '').slice(0, 5));
          }
          unlockDrawer(pinGateModal.shiftId, 'planned');
        }
        if (pinGateModal.mode === 'enable_timbrature' || pinGateModal.mode === 'unlock_frozen') {
          unlockDrawer(pinGateModal.shiftId, 'timbrature');
          setDrawerManualPunchFormExpanded(true);
        }
        setPinGateModal(null);
        setPinGatePin('');
        setPinGateError('');
      } catch {
        showError?.(
          pinGateModal.mode === 'delete_punches' ? t.save_error : t.ts_toast_unlock_error
        );
      } finally {
        setPinGateUnlocking(false);
      }
    },
    // openDrawer è dichiarato sotto: metterlo nelle dipendenze qui darebbe TDZ; approveShift da context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      pinGateModal,
      currentUser,
      users,
      shifts,
      applyPayrollUnlock,
      deletePunchRecordsForShift,
      closeTimesheetShiftDrawer,
      runEmployeeWeekBatchFreeze,
      showSuccess,
      showError,
      t,
      unlockDrawer,
      unlockDrawerSession,
      approveShift,
    ]
  );

  useEffect(() => {
    if (!pinGateModal) return;
    const id = requestAnimationFrame(() => {
      pinGateKeyboardInputRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [pinGateModal]);

  useEffect(() => {
    if (!pinGateModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pinGateUnlocking) return;
      e.preventDefault();
      setPinGateModal(null);
      setPinGatePin('');
      setPinGateError('');
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [pinGateModal, pinGateUnlocking]);

  useEffect(() => {
    if (!pinGateModal || pinGateUnlocking) {
      if (!pinGateModal) pinGateAutoSubmittedFor.current = '';
      return;
    }
    if (pinGatePin.length < 4) {
      pinGateAutoSubmittedFor.current = '';
      return;
    }
    if (pinGateAutoSubmittedFor.current === pinGatePin) return;
    pinGateAutoSubmittedFor.current = pinGatePin;
    void submitTimbraturePinGate(pinGatePin);
  }, [pinGateModal, pinGatePin, pinGateUnlocking, submitTimbraturePinGate]);

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
      setDrawerReviewQueue(null);
    } catch {
      showError?.(t.ts_toast_exit_error);
    } finally {
      setClosingLoading(false);
    }
  };

  const openDrawer = (
    shift: ShiftRow,
    user: { id: string; first_name: string; department?: string },
    dateStr: string,
    reviewQueue: DrawerReviewQueue | null = null,
    openSource: 'name' | 'date' | 'turno' | null = null,
    keepPinSession = false
  ) => {
    // PIN come primo passo: se richiesto e sessione non già sbloccata, chiedi PIN prima di aprire
    const needsPinFirst = canTeamTimesheetOps &&
      featureFlags['unlock_with_pin'] !== false &&
      !keepPinSession &&
      !drawerSessionId &&
      !globalPinSessionId;
    if (needsPinFirst) {
      setPinGateModal({ shiftId: shift.id, mode: 'unlock_shift_edits' });
      setPinGatePin('');
      setPinGateError('');
      sessionStorage.setItem('pendingDrawerOpen', JSON.stringify({
        shift,
        user,
        dateStr,
        openSource: openSource ?? 'date',
        reviewQueue: reviewQueue ?? null,
      }));
      return;
    }

    setDrawerReviewQueue(reviewQueue);
    setDrawerOpenSource(openSource);
    setDrawerJustOpened(true);
    const punchAuditEntries = shift.punchInId ? (punchAudits[shift.punchInId] || []) : [];
    const shiftEdits = getShiftHistory(shift.id);
    setDrawerData({ shift, userId: user.id, employeeName: user.first_name, department: user.department, dateStr, punchAuditEntries, shiftEdits });
    if (reviewQueue || (shift.punched && shift.punchInId)) {
      setManualPunchIn(shift.actualStart || shift.plannedStart);
      if (shift.actualEndFull) {
        const d = new Date(shift.actualEndFull);
        setManualPunchOutDate(format(d, 'yyyy-MM-dd'));
        setManualPunchOut(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      } else {
        setManualPunchOutDate(dateStr);
        setManualPunchOut(shift.actualEnd || shift.plannedEnd);
      }
    } else {
      setManualPunchIn(shift.plannedStart);
      setManualPunchOut(shift.plannedEnd);
      setManualPunchOutDate(dateStr);
    }
    setManualPunchSaving(false);
    setPinGateModal(null);
    setPinGatePin('');
    setPinGateError('');
    // Con il nuovo sistema unlock unificato, non serve azzerare gli unlock individuali:
    // il drawerSessionId rimane attivo durante la navigazione nella review session
    setDrawerPlannedTimeStart(shift.plannedStart);
    setDrawerPlannedTimeEnd((shift.plannedEnd || '').slice(0, 5));
    setDrawerShiftEditsExpanded(false);
    // Collassa il form se le timbrature esistono già; espandilo solo se mancano
    setDrawerManualPunchFormExpanded(!shift.punched);
  };

  const toISOFromDateHHMM = (dateStr: string, hhmm: string): string => {
    const [h, m] = hhmm.split(':').map(Number);
    const d = parseISO(dateStr);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), h ?? 0, m ?? 0, 0, 0).toISOString();
  };

  // Resetta drawerJustOpened dopo 500ms
  useEffect(() => {
    if (drawerJustOpened) {
      const timer = setTimeout(() => {
        setDrawerJustOpened(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [drawerJustOpened]);

  /** Inserimento timbrature mancanti o aggiornamento ingresso/uscita già presenti (dopo PIN se richiesto). */
  const handleDrawerSaveTimbratures = async (opts?: { silentToast?: boolean }): Promise<boolean> => {
    if (!drawerData) return false;
    const shiftRow = drawerData.shift;
    if (shiftRow.status === 'absent') return false;
    const fullForPunch = shifts.find((sh) => sh.id === shiftRow.id);
    const payFrozen = fullForPunch ? isShiftPayrollFrozen(fullForPunch) : false;
    if (payFrozen) return false;
    if (
      featureFlags['unlock_with_pin'] !== false &&
      !isDrawerUnlocked(shiftRow.id, 'timbrature', globalPinSessionId)
    ) {
      return false;
    }
    const inHm = (manualPunchIn || '').trim().slice(0, 5);
    const outHm = (manualPunchOut || '').trim().slice(0, 5);
    if (!/^\d{1,2}:\d{2}$/.test(inHm) || !/^\d{1,2}:\d{2}$/.test(outHm)) {
      showError?.(t.enter_valid_time_example);
      return false;
    }
    const [yIn, moIn, dIn] = drawerData.dateStr.split('-').map((n) => parseInt(n, 10));
    const [hIn, mIn] = inHm.split(':').map((n) => parseInt(n, 10));
    const inLocal = new Date(yIn, moIn - 1, dIn, hIn, mIn, 0, 0);
    const outDateStr = resolveTimesheetPunchOutDateStr(
      drawerData.dateStr,
      manualPunchOutDate || undefined,
      manualPunchIn,
      manualPunchOut
    );
    if (!outDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(outDateStr)) {
      showError?.(t.save_error);
      return false;
    }
    const [yOut, moOut, dOut] = outDateStr.split('-').map((n) => parseInt(n, 10));
    const [hOut, mOut] = outHm.split(':').map((n) => parseInt(n, 10));
    const outLocal = new Date(yOut, moOut - 1, dOut, hOut, mOut, 0, 0);
    if (outLocal.getTime() <= inLocal.getTime()) {
      showError?.(t.ts_manual_punches_out_after_in_error);
      return false;
    }
    setManualPunchSaving(true);
    try {
      if (shiftRow.punchInId) {
        const newInISO = toISOFromDateHHMM(drawerData.dateStr, inHm);
        await updatePunchRecord(shiftRow.punchInId, { calculated_time: newInISO });
        const newOutISO = toISOFromDateHHMM(outDateStr, outHm);
        if (shiftRow.punchOutId) {
          await updatePunchRecord(shiftRow.punchOutId, { timestamp: newOutISO });
        } else {
          try {
            await updatePunchRecord(shiftRow.punchInId, { clock_out_time: newOutISO });
          } catch {
            await updatePunchRecord(shiftRow.punchInId, { calculated_time: newOutISO });
          }
        }
        if (!opts?.silentToast) showSuccess?.(t.ts_toast_shift_updated);
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        setDrawerManualPunchFormExpanded(false);
        
        // Auto-advance dopo salvataggio: se in review queue, avanza; altrimenti naviga contextualmente
        if (drawerReviewQueue) {
          advanceDrawerReviewAfterStep();
        } else if (drawerOpenSource) {
          handleDrawerContextualNavigate(1);
        }
        
        return true;
      }
      const rIn = await addPunchRecord(drawerData.userId, 'in', {
        shift_id: shiftRow.id,
        timestamp: inLocal.toISOString(),
        source: 'manual',
      });
      if (rIn && typeof rIn === 'object' && 'error' in rIn && rIn.error) {
        showError?.(rIn.error);
        return false;
      }
      const rOut = await addPunchRecord(drawerData.userId, 'out', {
        shift_id: shiftRow.id,
        timestamp: outLocal.toISOString(),
        source: 'manual',
      });
      if (rOut && typeof rOut === 'object' && 'error' in rOut && rOut.error) {
        try {
          await deletePunchRecordsForShift(shiftRow.id);
        } catch {
          /* best effort */
        }
        showError?.(rOut.error);
        return false;
      }
      if (!opts?.silentToast) showSuccess?.(t.ts_toast_manual_punches_saved);
      if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setDrawerManualPunchFormExpanded(false);
      
      // Auto-advance dopo salvataggio: se in review queue, avanza; altrimenti naviga contextualmente
      if (drawerReviewQueue) {
        advanceDrawerReviewAfterStep();
      } else if (drawerOpenSource) {
        handleDrawerContextualNavigate(1);
      }
      
      return true;
    } catch {
      showError?.(t.save_error);
      return false;
    } finally {
      setManualPunchSaving(false);
    }
  };

  /** Salva solo l'ORA ENTRATA senza toccare l'uscita. */
  const handleSavePunchIn = async (): Promise<boolean> => {
    if (!drawerData) return false;
    const shiftRow = drawerData.shift;
    if (!shiftRow.punchInId) return false;
    if (
      featureFlags['unlock_with_pin'] !== false &&
      !isDrawerUnlocked(shiftRow.id, 'timbrature', globalPinSessionId)
    ) return false;
    const inHm = (manualPunchIn || '').trim().slice(0, 5);
    if (!/^\d{1,2}:\d{2}$/.test(inHm)) { showError?.(t.enter_valid_time_example); return false; }
    setManualPunchSaving(true);
    try {
      const newInISO = toISOFromDateHHMM(drawerData.dateStr, inHm);
      await updatePunchRecord(shiftRow.punchInId, { calculated_time: newInISO });
      showSuccess?.(t.ts_toast_shift_updated);
      return true;
    } catch { showError?.(t.save_error); return false; }
    finally { setManualPunchSaving(false); }
  };

  /** Salva solo l'ORA USCITA senza toccare l'entrata. */
  const _handleSavePunchOut = async (): Promise<boolean> => {
    if (!drawerData) return false;
    const shiftRow = drawerData.shift;
    if (!shiftRow.punchInId) return false;
    if (
      featureFlags['unlock_with_pin'] !== false &&
      !isDrawerUnlocked(shiftRow.id, 'timbrature', globalPinSessionId)
    ) return false;
    const outHm = (manualPunchOut || '').trim().slice(0, 5);
    if (!/^\d{1,2}:\d{2}$/.test(outHm)) { showError?.(t.enter_valid_time_example); return false; }
    const outDateStr = resolveTimesheetPunchOutDateStr(
      drawerData.dateStr, manualPunchOutDate || undefined, manualPunchIn, manualPunchOut
    );
    if (!outDateStr) { showError?.(t.save_error); return false; }
    setManualPunchSaving(true);
    try {
      const newOutISO = toISOFromDateHHMM(outDateStr, outHm);
      if (shiftRow.punchOutId) {
        await updatePunchRecord(shiftRow.punchOutId, { timestamp: newOutISO });
      } else {
        try {
          await updatePunchRecord(shiftRow.punchInId, { clock_out_time: newOutISO });
        } catch {
          await updatePunchRecord(shiftRow.punchInId, { calculated_time: newOutISO });
        }
      }
      showSuccess?.(t.ts_toast_shift_updated);
      return true;
    } catch { showError?.(t.save_error); return false; }
    finally { setManualPunchSaving(false); }
  };

  /** Se OUT è prima di IN sulla data del turno (es. 00:00 dopo le 18:00), imposta data uscita al giorno dopo. */
  useEffect(() => {
    if (!drawerData) return;
    const shiftD = drawerData.dateStr;
    const raw = (manualPunchOutDate || '').trim();
    const effective = raw || shiftD;
    const resolved = resolveTimesheetPunchOutDateStr(
      shiftD,
      manualPunchOutDate || undefined,
      manualPunchIn,
      manualPunchOut
    );
    if (!resolved) return;
    if (resolved !== effective && (raw === '' || raw === shiftD)) {
      setManualPunchOutDate(resolved);
    }
  }, [drawerData, manualPunchOutDate, manualPunchIn, manualPunchOut]);

  const handleDrawerDeductBreakChange = useCallback(
    async (shiftId: string, checked: boolean) => {
      setDeductBreakSaving(true);
      try {
        await updateShift(shiftId, { deduct_break: checked });
        showSuccess?.(t.shift_saved);
      } catch {
        showError?.(t.save_error);
      } finally {
        setDeductBreakSaving(false);
      }
    },
    [updateShift, showSuccess, showError, t]
  );

  const handleDrawerAutoBreakChange = useCallback(
    async (shiftId: string, on: boolean) => {
      setDeductBreakSaving(true);
      try {
        if (on) {
          const sh = shifts.find((x) => x.id === shiftId);
          const u = sh ? users.find((x) => x.id === sh.user_id) : undefined;
          const st = (sh?.start_time || '').slice(0, 5);
          const en = (sh?.end_time || '').slice(0, 5);
          const gross = st && en ? calculateShiftMinutesGross(st, en) : 0;
          const mins =
            sh && u != null
              ? getBreakMinutesForShift(
                  { ...sh, is_auto_break: true, break_minutes: 0 },
                  gross,
                  u,
                  breakRules,
                  breakComputeOpts
                )
              : DEFAULT_AUTO_BREAK_MINUTES;
          await updateShift(shiftId, {
            is_auto_break: true,
            break_minutes: Math.max(0, mins),
          });
        } else {
          await updateShift(shiftId, { is_auto_break: false, break_minutes: 0 });
        }
        showSuccess?.(t.shift_saved);
      } catch {
        showError?.(t.save_error);
      } finally {
        setDeductBreakSaving(false);
      }
    },
    [updateShift, showSuccess, showError, t, shifts, users, breakRules, breakComputeOpts]
  );

  /** Attiva/disattiva la detrazione per singola regola pausa (admin). */
  const handleDrawerDeductRuleExclusionChange = useCallback(
    async (shiftId: string, ruleId: string, applyDeduction: boolean) => {
      setDeductBreakSaving(true);
      try {
        const sh = shifts.find((x) => x.id === shiftId);
        if (!sh) return;
        const withLocal = mergeShiftDeductExclusionsFromLocal(sh);
        const cur = Array.isArray(withLocal.deduct_excluded_rule_ids)
          ? [...withLocal.deduct_excluded_rule_ids]
          : [];
        const next = new Set(cur);
        if (applyDeduction) next.delete(ruleId);
        else next.add(ruleId);
        await updateShift(shiftId, { deduct_excluded_rule_ids: Array.from(next) });
        showSuccess?.(t.shift_saved);
      } catch {
        showError?.(t.save_error);
      } finally {
        setDeductBreakSaving(false);
      }
    },
    [updateShift, showSuccess, showError, t, shifts]
  );

  // ── Day Review ───────────────────────────────────────────────────────────

  const handleOpenDayReview = (dateStr: string) => {
    const items: DrawerReviewQueueItem[] = [];
    for (const user of visibleUsers) {
      const dayData = timesheetData[user.id]?.[dateStr];
      if (!dayData) continue;
      for (const shift of dayData.shifts) {
        if (!shiftEligibleForDayReview(shift)) continue;
        items.push({
          userId: user.id,
          employeeName: user.first_name,
          department: (user as { department?: string }).department,
          shift,
          dateStr,
        });
      }
    }
    if (items.length === 0) return;
    const first = items[0];
    const u = visibleUsers.find((x) => x.id === first.userId);
    if (!u) return;
    const queue: DrawerReviewQueue = { dateStr, items, currentIdx: 0, reviewScope: 'day' };
    openDrawer(
      first.shift,
      { id: u.id, first_name: first.employeeName, department: first.department },
      first.dateStr,
      queue,
      null  // openSource null → review queue footer + frecce ↑↓ tramite reviewScope='day'
    );
  };

  const handleOpenEmployeeWeekReview = (user: User) => {
    const items: DrawerReviewQueueItem[] = [];
    for (const day of weekDays) {
      const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
      if (!inP) continue;
      const dStr = format(day, 'yyyy-MM-dd');
      const dayData = timesheetData[user.id]?.[dStr];
      if (!dayData) continue;
      for (const shift of dayData.shifts) {
        if (!shiftEligibleForDayReview(shift)) continue;
        items.push({
          userId: user.id,
          employeeName: user.first_name,
          department: user.department,
          shift,
          dateStr: dStr,
        });
      }
    }
    items.sort((a, b) => {
      const c = a.dateStr.localeCompare(b.dateStr);
      if (c !== 0) return c;
      return toMinutesFromMidnight(a.shift.plannedStart) - toMinutesFromMidnight(b.shift.plannedStart);
    });
    if (items.length === 0) {
      showError?.(t.ts_employee_week_review_empty);
      return;
    }
    const first = items[0];
    const queue: DrawerReviewQueue = {
      dateStr: first.dateStr,
      items,
      currentIdx: 0,
      reviewScope: 'employee_week',
    };
    openDrawer(
      first.shift,
      { id: user.id, first_name: first.employeeName, department: first.department },
      first.dateStr,
      queue,
      'name'
    );
  };

  const goToDrawerReviewIndex = (i: number) => {
    const q = drawerReviewQueueRef.current;
    if (!q || i < 0 || i >= q.items.length) return;
    const item = q.items[i];
    const u = visibleUsers.find((x) => x.id === item.userId);
    if (!u) return;
    openDrawer(item.shift, { id: u.id, first_name: item.employeeName, department: item.department }, item.dateStr, {
      ...q,
      currentIdx: i,
    });
  };

  const handleDrawerReviewNavigate = (dir: 1 | -1) => {
    const q = drawerReviewQueueRef.current;
    if (!q) return;
    const next = q.currentIdx + dir;
    goToDrawerReviewIndex(next);
  };

  const advanceDrawerReviewAfterStep = () => {
    const q = drawerReviewQueueRef.current;
    if (!q) return;
    const next = q.currentIdx + 1;
    if (next < q.items.length) {
      goToDrawerReviewIndex(next);
    } else {
      // Fine della queue: marca come completata ma MANTIENI il drawer aperto
      const scope = q.reviewScope;
      setDrawerReviewQueue({ ...q, completed: true });
      if (scope === 'employee_week' && canTimesheetApprove) {
        const uniqueIds = [...new Set(q.items.map((it) => it.shift.id))];
        const toConfirm = uniqueIds.filter((id) => {
          const full = shifts.find((s) => s.id === id);
          if (!full) return false;
          if (full.approval_status === 'approved') return false;
          if (full.approval_status === 'absent') return false;
          if (isShiftPayrollFrozen(full)) return false;
          return true;
        });
        if (toConfirm.length > 0) {
          const employeeName = q.items[0]?.employeeName ?? '—';
          void (async () => {
            await Promise.all(
              toConfirm.map((id) => updateShift(id, { approval_status: 'confirmed' }))
            );
            showSuccess?.(t.ts_toast_employee_week_confirmed?.replace('{name}', employeeName) ?? `Turni di ${employeeName} confermati.`);
          })();
        } else {
          showSuccess?.(t.ts_toast_employee_week_review_complete);
        }
      } else {
        showSuccess?.(
          scope === 'employee_week' ? t.ts_toast_employee_week_review_complete : t.ts_toast_day_review_complete
        );
      }
    }
  };

  /**
   * Navigazione contestuale per auto-advance dopo salvataggio.
   * - Se aperto da NAME: naviga giorni della settimana per lo stesso dipendente
   * - Se aperto da DATA: naviga dipendenti per la stessa data
   */
  const handleDrawerContextualNavigate = (dir: 1 | -1) => {
    if (!drawerData || !drawerOpenSource) return;

    if (drawerOpenSource === 'name') {
      // Navigazione settimanale (NOME): scorrere giorni per lo stesso dipendente
      const currentDate = parseISO(drawerData.dateStr);
      const nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + dir);
      const nextDateStr = format(nextDate, 'yyyy-MM-dd');
      
      // Verifica che la data sia all'interno della settimana visibile
      const weekStart = weekDays[0];
      const weekEnd = weekDays[weekDays.length - 1];
      if (nextDate < weekStart || nextDate > weekEnd) return;
      
      const dayData = timesheetData[drawerData.userId]?.[nextDateStr];
      if (!dayData || dayData.shifts.length === 0) return;
      
      const firstShift = dayData.shifts[0];
      const user = visibleUsers.find((u) => u.id === drawerData.userId);
      if (!user) return;
      
      openDrawer(firstShift, { id: user.id, first_name: drawerData.employeeName, department: drawerData.department }, nextDateStr, null, 'name');
    } else if (drawerOpenSource === 'date') {
      // Navigazione per data (DATA): scorrere dipendenti per la stessa data
      const userList = visibleUsers.map((u) => u.id);
      const currentUserIdx = userList.indexOf(drawerData.userId);
      if (currentUserIdx === -1) return;
      
      const nextUserIdx = currentUserIdx + dir;
      if (nextUserIdx < 0 || nextUserIdx >= userList.length) return;
      
      const nextUserId = userList[nextUserIdx];
      const nextUser = visibleUsers.find((u) => u.id === nextUserId);
      if (!nextUser) return;
      
      const nextDayData = timesheetData[nextUserId]?.[drawerData.dateStr];
      if (!nextDayData || nextDayData.shifts.length === 0) return;
      
      const firstShift = nextDayData.shifts[0];
      openDrawer(firstShift, { id: nextUser.id, first_name: nextUser.first_name, department: nextUser.department }, drawerData.dateStr, null, 'date');
    }
  };

  const _handleDrawerReviewSaveAndNext = async () => {
    if (!drawerReviewQueue || !drawerData) return;
    const s = drawerData.shift;
    if (drawerReviewQueue.reviewScope === 'employee_week' && s.status === 'absent') {
      advanceDrawerReviewAfterStep();
      return;
    }
    const inHm = (manualPunchIn || '').trim().slice(0, 5);
    const outHm = (manualPunchOut || '').trim().slice(0, 5);
    const outDate = (manualPunchOutDate || '').trim();
    if (!inHm || !outHm) {
      showError?.(t.enter_valid_time_example);
      return;
    }
    const resolvedOutDate = resolveTimesheetPunchOutDateStr(
      drawerData.dateStr,
      outDate || undefined,
      inHm,
      outHm
    );
    if (
      !/^\d{1,2}:\d{2}$/.test(inHm) ||
      !/^\d{1,2}:\d{2}$/.test(outHm) ||
      !resolvedOutDate ||
      !/^\d{4}-\d{2}-\d{2}$/.test(resolvedOutDate)
    ) {
      showError?.(t.enter_valid_time_example);
      return;
    }
    setReviewQueueSaving(true);
    try {
      const foundShift = shifts.find((x) => x.id === s.id);
      const fullShiftForBreak = foundShift ? mergeShiftDeductExclusionsFromLocal(foundShift) : undefined;
      const userForBreak = users.find((u) => u.id === drawerData.userId);
      if (!fullShiftForBreak || !userForBreak) {
        showError?.(t.save_error);
        return;
      }
      const isEmployeeWeek = drawerReviewQueue.reviewScope === 'employee_week';
      const requireFreezeAfterSave = canTimesheetApprove && !isEmployeeWeek;
      const silentIntermediateToast = canTimesheetApprove && isEmployeeWeek;
      if (!s.punchInId) {
        const ok = await handleDrawerSaveTimbratures({
          silentToast: requireFreezeAfterSave || silentIntermediateToast,
        });
        if (!ok) return;
        if (requireFreezeAfterSave) {
          setApprovalConfirm(
            buildReviewQueueFreezeApprovalPayload({
              shiftId: s.id,
              employeeName: drawerData.employeeName,
              shiftDateStr: drawerData.dateStr,
              plannedStart: s.plannedStart,
              plannedEnd: s.plannedEnd,
              plannedMins: s.plannedMins,
              fullShift: fullShiftForBreak,
              user: userForBreak,
              breakRules,
              breakComputeOpts,
              inHm,
              outHm,
              resolvedOutDate,
            })
          );
        } else {
          if (!silentIntermediateToast) showSuccess?.(t.ts_toast_manual_punches_saved);
          advanceDrawerReviewAfterStep();
        }
        return;
      }
      const newInISO = toISOFromDateHHMM(drawerData.dateStr, inHm);
      await updatePunchRecord(s.punchInId, { calculated_time: newInISO });
      const newOutISO = toISOFromDateHHMM(resolvedOutDate, outHm);
      if (s.punchOutId) {
        await updatePunchRecord(s.punchOutId, { timestamp: newOutISO });
      } else {
        await updatePunchRecord(s.punchInId, { clock_out_time: newOutISO });
      }
      if (requireFreezeAfterSave) {
        setApprovalConfirm(
          buildReviewQueueFreezeApprovalPayload({
            shiftId: s.id,
            employeeName: drawerData.employeeName,
            shiftDateStr: drawerData.dateStr,
            plannedStart: s.plannedStart,
            plannedEnd: s.plannedEnd,
            plannedMins: s.plannedMins,
            fullShift: fullShiftForBreak,
            user: userForBreak,
            breakRules,
            breakComputeOpts,
            inHm,
            outHm,
            resolvedOutDate,
          })
        );
      } else {
        if (!silentIntermediateToast) showSuccess?.(t.ts_toast_shift_updated);
        advanceDrawerReviewAfterStep();
      }
    } catch {
      showError?.(t.save_error);
    } finally {
      setReviewQueueSaving(false);
    }
  };

  // ── Helpers rendering ────────────────────────────────────────────────────

  const getShiftCardStyle = (s: ShiftRow, punchAuditCount: number, cellDateStr?: string, boardShift?: Shift | null) => {
    const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
    const startMins = toMinutesFromMidnight(s.plannedStart);
    const endMins = toMinutesFromMidnight((s.plannedEnd || '00:00').slice(0, 5));
    const inTodayKpiWindow =
      cellDateStr === todayStr &&
      nowMins >= startMins - 30 &&
      nowMins <= endMins;

    const punchMissingOnBoard =
      !!boardShift && shiftPastPlannedEndWithoutClockIn(boardShift, punchRecords);
    const publishedOnBoard = s.status === 'confirmed' || s.status === 'approved';

    // sfondo dark glass — il colore di stato è il bordo sinistro + tinta sottile
    const white = 'bg-white/20';
    const ring0 = 'ring-1 ring-white/25';

    // Assenza — bordo rosso
    if (s.status === 'absent') {
      const frozen = !!s.approved_at;
      return {
        border: 'border-l-rose-500',
        bg: 'bg-rose-500/28',
        ring: 'ring-1 ring-rose-500/50',
        dot: 'bg-rose-500',
        label: frozen ? t.wst_grid_shift_frozen_short : t.status_absent,
        labelCls: 'text-rose-300 bg-rose-500/30',
      };
    }
    // Approvato / congelato contabilità
    if (s.status === 'approved' && shiftRowPayrollFrozen(s)) {
      return {
        border: 'border-l-emerald-500',
        bg: 'bg-emerald-500/28',
        ring: 'ring-1 ring-emerald-500/50',
        dot: 'bg-emerald-500',
        label: t.wst_grid_shift_frozen_short,
        labelCls: 'text-emerald-300 bg-emerald-500/30',
      };
    }
    // Bozza
    if (s.status === 'draft') {
      return {
        border: 'border-l-slate-400',
        bg: white,
        ring: ring0,
        dot: 'bg-slate-400',
        label: t.ts_status_draft,
        labelCls: 'text-white/60 bg-white/15',
      };
    }
    // Ritardo / OUT mancante
    if (s.hasMissingOut || s.isLate) {
      return {
        border: 'border-l-red-500',
        bg: 'bg-red-500/28',
        ring: 'ring-1 ring-red-500/50',
        dot: 'bg-red-500',
        label: s.hasMissingOut ? t.ts_status_missing_out : t.ts_status_late,
        labelCls: 'text-red-300 bg-red-500/30',
      };
    }
    // Modifiche manuali
    if (punchAuditCount > 0) {
      return {
        border: 'border-l-orange-500',
        bg: 'bg-orange-500/25',
        ring: ring0,
        dot: 'bg-orange-500',
        label: t.ts_status_modified,
        labelCls: 'text-orange-300 bg-orange-500/30',
      };
    }
    // Non timbrato dopo fine turno
    if (!s.punched && punchMissingOnBoard) {
      return {
        border: 'border-l-amber-500',
        bg: 'bg-amber-500/25',
        ring: 'ring-1 ring-amber-500/50',
        dot: 'bg-amber-500',
        label: t.ts_status_unpunched,
        labelCls: 'text-amber-300 bg-amber-500/30',
      };
    }
    // Pubblicato senza timbratura
    if (!s.punched && publishedOnBoard) {
      return {
        border: 'border-l-blue-400',
        bg: white,
        ring: ring0,
        dot: 'bg-blue-400',
        label: t.ts_status_unpunched,
        labelCls: 'text-blue-300 bg-blue-500/20',
      };
    }
    if (!s.punched) {
      return {
        border: 'border-l-amber-400',
        bg: 'bg-amber-500/22',
        ring: 'ring-1 ring-amber-500/45',
        dot: 'bg-amber-500',
        label: t.ts_status_unpunched,
        labelCls: 'text-amber-300 bg-amber-500/30',
      };
    }
    // In turno ora
    if (inTodayKpiWindow) {
      return {
        border: 'border-l-blue-500',
        bg: 'bg-blue-500/30',
        ring: 'ring-1 ring-blue-500/50',
        dot: 'bg-blue-500',
        label: t.ts_status_in_shift,
        labelCls: 'text-blue-300 bg-blue-500/30',
      };
    }
    if (s.punched && !s.actualEnd) {
      return {
        border: 'border-l-blue-400',
        bg: white,
        ring: ring0,
        dot: 'bg-blue-400',
        label: t.ts_status_in_shift,
        labelCls: 'text-blue-300 bg-blue-500/30',
      };
    }
    // Timbrato e completato — verde
    if (s.punched && s.actualEnd) {
      return {
        border: 'border-l-emerald-500',
        bg: 'bg-emerald-500/28',
        ring: 'ring-1 ring-emerald-500/50',
        dot: 'bg-emerald-500',
        label: t.ts_status_to_approve,
        labelCls: 'text-emerald-300 bg-emerald-500/30',
      };
    }
    return {
      border: 'border-l-slate-300',
      bg: white,
      ring: ring0,
      dot: 'bg-slate-400',
      label: t.ts_status_unpunched,
      labelCls: 'text-white/60 bg-white/15',
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
      <div
        className="pb-content pt-6 w-full font-sans"
        role="region"
        aria-label={t.timesheet_title ?? 'Presenze'}
      >

        {/* ── Sub-tab: Griglia | Statistiche ──────────────────────────────────── */}
        {showStatsSubTab && (
          <div className="flex items-center gap-1.5 mb-5 px-0.5">
            {(['grid', 'stats'] as const).map((v) => {
              const label = v === 'grid' ? (t.tab_grid ?? 'Griglia') : (t.tab_statistics ?? 'Statistiche');
              const active = tsView === v;
              return (
                <button
                  key={v}
                  type="button"
                  data-tour={v === 'stats' ? 'stats' : undefined}
                  onClick={() => setTsView(v)}
                  className={`h-9 px-5 rounded-full text-xs font-extrabold uppercase tracking-wider transition-colors ${
 active
 ? 'shadow-lg'
 : 'bg-white/8 border border-white/20 hover:bg-white/15 hover:border-white/35'
 } active:bg-white/80`}
                  style={active
                    ? { background: 'linear-gradient(135deg, #1a56db 0%, #0b3573 100%)', boxShadow: '0 2px 12px rgba(26,86,219,0.45)', color: '#ffffff' }
                    : { color: '#ffffff' }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Statistiche (sub-tab) ───────────────────────────────────────────── */}
        {tsView === 'stats' && showStatsSubTab && (
          <Suspense fallback={<div className="flex items-center justify-center py-20"><span className="text-white/50 text-sm">Caricamento…</span></div>}>
            <StatisticsLazy />
          </Suspense>
        )}

        {/* ── Griglia presenze (sub-tab default) ──────────────────────────────── */}
        {tsView === 'grid' && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>

          {/* ── Banner Auto-Conferma ──────────────────────────────────────────── */}
          <AnimatePresence>
            {autoApprovedCount > 0 && !autoApproveBannerDismissed && (
              <motion.div
                key="auto-approve-banner"
                initial={{ opacity: 0, y: -8, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: -8, height: 0 }}
                transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
                className="overflow-hidden mb-3"
              >
                <div
                  className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
                  style={{
                    background: 'linear-gradient(90deg, #e8f4e8 0%, #f0faf0 100%)',
                    border: '1px solid #86efac',
                    color: '#166534',
                  }}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
                    style={{ background: '#16a34a' }}
                  >
                    ✓
                  </span>
                  <span className="flex-1">
                    <strong>{autoApprovedCount}</strong>{' '}
                    {autoApprovedCount === 1
                      ? 'turno approvato automaticamente ieri'
                      : 'turni approvati automaticamente ieri'}{' '}
                    — GPS ✓ · scarto &lt; 5 min
                  </span>
                  <button
                    type="button"
                    onClick={() => setAutoApproveBannerDismissed(true)}
                    className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-green-200 active:bg-green-200/80"
                    aria-label={t.close}
                    style={{ color: '#166534' }}
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Stats Cards: settimana visualizzata (management) ────────────────── */}
          {uiW('timesheet.stats_today') && canTeamTimesheetOps && (
            <>
            <p className="ui-section-title mb-2">{t.tab_statistics ?? 'Statistiche'}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3 w-full">
              {([
                {
                  label: t.ts_stat_in_shift,
                  value: weekViewStats.inTurno,
                  Icon: Users,
                  iconColor: 'text-accent',
                  border: 'border-accent/25',
                  iconWell: 'bg-accent/15',
                  highlightIds: [] as string[],
                },
                {
                  label: t.ts_stat_delays_week,
                  value: weekViewStats.ritardi,
                  Icon: Clock,
                  iconColor: 'text-red-400',
                  border: 'border-2 border-red-400/25',
                  iconWell: 'bg-red-500/15',
                  highlightIds: weekViewStats.ritardiIds,
                },
                {
                  label: t.ts_stat_no_punch_week,
                  value: weekViewStats.senzaTimbratura,
                  Icon: AlertCircle,
                  iconColor: 'text-amber-400',
                  border: 'border-2 border-amber-400/25',
                  iconWell: 'bg-amber-400/15',
                  highlightIds: weekViewStats.senzaTimbratureIds,
                },
                {
                  label: t.ts_stat_approved_week,
                  value: weekViewStats.approvati,
                  Icon: UserCheck,
                  iconColor: 'text-accent',
                  border: 'border-accent/25',
                  iconWell: 'bg-accent/15',
                  highlightIds: [] as string[],
                },
              ]).map(({ label, value, Icon, iconColor, border, iconWell, highlightIds }) => {
                const isActive = statFilter?.label === label;
                return (
                <button
                  key={label}
                  type="button"
                  title={highlightIds.length > 0
                    ? (isActive ? 'Clicca per rimuovere il filtro' : 'Clicca per filtrare nella griglia')
                    : t.ts_stat_card_hint}
                  onClick={() => {
                    if (highlightIds.length > 0) {
                      triggerShiftHighlight(highlightIds, label);
                    }
                    handleStatCardClick();
                  }}
                  className={`group w-full rounded-lg border px-3 py-1.5 shadow-none flex items-center gap-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 ${
 isActive
 ?`${border} ring-1 ring-inset ring-accent/30`
                      : `${border} hover:bg-white/15`
                  }`}
                  style={{ background: isActive ? 'rgba(59,130,246,0.20)' : 'rgba(15, 35, 90, 0.82)' }}
                >
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 border ${border} ${iconWell}`}>
                    <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} strokeWidth={2} aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-bold text-white leading-none tabular-nums">{value}</p>
                    <p className="text-[11px] text-white/75 mt-0.5 leading-tight pr-1">{label}</p>
                  </div>
                  {isActive
                    ? <span className="text-[11px] font-bold text-accent shrink-0">× Filtro</span>
                    : <ChevronRight className="w-4 h-4 text-white/30 shrink-0 opacity-70 group-hover:text-accent group-hover:opacity-100 transition-colors active:opacity-90" aria-hidden />
                  }
                </button>
                );
              })}
            </div>
            </>
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
              <div className="mb-3 flex items-center gap-2">
                <Moon className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-bold text-white">{t.ts_dinner_close_required}</h3>
                <span className="ml-auto rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                  {dinnerShiftsNeedingClose.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {dinnerShiftsNeedingClose.map((item) => (
                  <div
                    key={item.shift.id}
                    className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4"
                  >
                    {/* Employee header */}
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-200 text-sm font-bold text-amber-900">
                        {item.user?.first_name?.[0] ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white">{item.user?.first_name ?? '—'}</p>
                        <p className="text-[11px] text-white/55 truncate" title={item.user?.department ?? ''}>{item.user?.department ?? ''}</p>
                      </div>
                      <span className="flex flex-shrink-0 items-center gap-1 rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[11px] font-bold text-accent">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent/80" /> {t.ts_badge_in_shift}
                      </span>
                    </div>
                    {/* Times */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-xl bg-white/10 px-2.5 py-2 text-center">
                        <p className="mb-0.5 text-[11px] font-semibold uppercase text-white/50">{t.ts_label_planned}</p>
                        <p className="text-sm font-bold text-white tabular-nums">
                          {item.scheduledStart}–{item.scheduledEnd}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/10 px-2.5 py-2 text-center">
                        <p className="mb-0.5 text-[11px] font-semibold uppercase text-white/50">{t.ts_label_actual_entry}</p>
                        <p className="text-sm font-bold text-white tabular-nums">{item.actualStart}</p>
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
                      className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-bold transition-colors shadow-sm active:bg-accent-hover/80"
                    >
                      <LogOut className="w-4 h-4" /> {t.ts_btn_close_and_approve}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Toolbar presenze: sopra la griglia ── */}
          {uiW('timesheet.header') && (
          <div className="ui-toolbar-page-band ui-toolbar-page-band-presences !h-auto !max-h-none min-h-0 w-full max-w-full sticky top-0 z-[1000]">
            {/**
             * Niente `flex-nowrap` forzato qui: la variante `presences` è `col` sotto `lg` (niente
             * sovrapposizione) e su desktop `min-w-0` + `overflow-x-auto` evita che le chip coprano
             * PDF / reparto a destra.
             */}
            <div className="relative z-[1001] flex min-h-0 w-full min-w-0 flex-1 flex-row flex-nowrap items-center justify-start gap-2 overflow-x-auto overscroll-x-contain [scrollbar-gutter:stable]">
              <div className="ui-toolbar-row-tight min-w-0 flex-1 md:gap-2">

                {/* Wrapper compatto: nav + chip data — scroll orizzontale se stretto */}
                <div className="flex min-w-0 max-w-full flex-nowrap items-center gap-2">
                {/* Gruppo unificato: ◀ Prec. | Settimana | Mese | ▶ Pros. */}
                <div className="ui-toolbar-group">
                  {/* ◀ Prec. — settimana in week mode, periodo in month mode */}
                  <button
                    type="button"
                    onClick={() => {
                      if (viewMode === 'week') timesheetMainGridWeekNav?.onPrev();
                      else setPeriodNavOffset(o => o - 1);
                    }}
                    disabled={viewMode === 'week' && !timesheetMainGridWeekNav?.canPrev}
                    className="ui-toolbar-tab !px-2.5 !text-xs shrink-0 disabled:opacity-30"
                    style={{ color: 'rgba(255,255,255,0.80)' }}
                    aria-label={viewMode === 'week' ? 'Settimana precedente' : 'Periodo precedente'}
                  >
                    <ChevronLeft className="h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden />
                    <span className="hidden sm:inline">{t.nav_prev_abbr ?? 'Prec.'}</span>
                  </button>

                  {/* Settimana: vista settimanale + reset a oggi */}
                  <button
                    type="button"
                    onClick={() => { setViewMode('week'); goToToday(); }}
                    className={`ui-toolbar-tab !px-2.5 !text-xs shrink-0 ${
 viewMode === 'week'
 ? 'bg-accent text-white font-extrabold'
 : 'hover:bg-white/10'
 } active:bg-white/15`}
                    style={viewMode !== 'week' ? { color: 'rgba(255,255,255,0.80)' } : {}}
                  >
                    {t.ts_period_week}
                  </button>

                  {/* Mese: vista mensile + reset al periodo corrente */}
                  <button
                    type="button"
                    onClick={() => { setViewMode('month'); setPeriodNavOffset(0); applyPeriodFromStorage(); }}
                    className={`ui-toolbar-tab !px-2.5 !text-xs shrink-0 ${
 viewMode === 'month' && periodNavOffset === 0
 ? 'bg-accent text-white font-extrabold'
 : 'hover:bg-white/10'
 } active:bg-white/15`}
                    style={!(viewMode === 'month' && periodNavOffset === 0) ? { color: 'rgba(255,255,255,0.80)' } : {}}
                    title={monthTabTitle}
                  >
                    {t.ts_period_month}
                  </button>

                  {/* ▶ Pros. — settimana in week mode, periodo in month mode */}
                  <button
                    type="button"
                    onClick={() => {
                      if (viewMode === 'week') timesheetMainGridWeekNav?.onNext();
                      else setPeriodNavOffset(o => o + 1);
                    }}
                    disabled={viewMode === 'week' && !timesheetMainGridWeekNav?.canNext}
                    className="ui-toolbar-tab !px-2.5 !text-xs shrink-0 disabled:opacity-30"
                    style={{ color: 'rgba(255,255,255,0.80)' }}
                    aria-label={viewMode === 'week' ? 'Settimana successiva' : 'Periodo successivo'}
                  >
                    <span className="hidden sm:inline">{t.nav_next_abbr ?? 'Pros.'}</span>
                    <ChevronRight className="h-3.5 w-3.5 lg:h-4 lg:w-4" aria-hidden />
                  </button>
                </div>

                {/* Chip data corrente */}
                <div
                  className="ui-toolbar-chip shrink-0 max-w-full min-w-0 cursor-default select-none font-bold !px-3 !h-9 lg:!h-10 !text-xs lg:!text-sm"
                  role="status"
                  aria-label={t.ts_period_chip_aria}
                  title={`${format(periodStartDate, 'dd/MM/yy', { locale })} → ${format(periodEndDate, 'dd/MM/yy', { locale })}`}
                >
                  <Calendar className="hidden sm:block h-3.5 w-3.5 lg:h-4 lg:w-4 shrink-0 text-white/50" aria-hidden />
                  <span className="min-w-0 truncate tabular-nums">
                    {viewMode === 'week'
                      ? <>
                          <span className="text-white font-extrabold">S.{weekIndex + 1}&nbsp;</span>
                          {format(weekStart, 'dd/MM', { locale })}
                          <span className="text-white/50 hidden sm:inline"> → {format(lastDay, 'dd/MM/yy', { locale })}</span>
                        </>
                      : <><span>{format(periodStartDate, 'dd/MM', { locale })}</span><span className="hidden sm:inline"> → {format(periodEndDate, 'dd/MM/yy', { locale })}</span></>}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => goToToday()}
                  disabled={isShowingTodayWeek}
                  title={
                    isShowingTodayWeek ? t.ts_toolbar_current_week_already : t.ts_toolbar_today_hint
                  }
                  aria-label={
                    isShowingTodayWeek ? t.ts_toolbar_current_week_already : t.ts_toolbar_today_hint
                  }
                  className={`hidden md:inline-flex ui-toolbar-chip !h-9 !min-h-9 lg:!h-10 lg:!min-h-10 !px-2.5 !text-xs shrink-0 items-center gap-1 hover:bg-white/10 ${
 isShowingTodayWeek
 ? 'cursor-default opacity-50'
 : 'cursor-pointer'
 } disabled:opacity-40 disabled:cursor-not-allowed active:bg-white/80`}
                >
                  <Calendar className="h-3.5 w-3.5 lg:h-4 lg:w-4 shrink-0" style={{ color: 'rgba(255,255,255,0.70)' }} aria-hidden />
                  <span className="font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    {t.ts_toolbar_current_week_btn}
                  </span>
                </button>

                {viewMode === 'month' && payrollStripForToolbar && (
                  <span
                    className="hidden min-[400px]:inline-flex h-9 max-h-9 min-h-9 lg:h-10 lg:max-h-10 lg:min-h-10 max-w-[min(100%,12rem)] shrink-0 items-center truncate rounded-lg px-2 lg:px-2.5 text-[11px] lg:text-[11px] font-semibold"
                    style={{ border: '1px solid rgba(59,130,246,0.35)', background: 'rgba(59,130,246,0.12)', color: 'rgba(255,255,255,0.85)' }}
                    title={tv.ts_timesheet_month_tab_hint}
                  >
                    {payrollStripForToolbar}
                  </span>
                )}
                {/* Chip periodo: mostra data inizio + durata; click apre popover di modifica */}
                <div className="relative">
                <div className="ui-toolbar-group">
                  <button
                    ref={periodTriggerRef}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const next = !showPeriodPopover;
                      if (next) {
                        const rect = periodTriggerRef.current?.getBoundingClientRect();
                        if (rect) setPeriodPopoverPos({ top: rect.bottom + 4, left: rect.left });
                        setPeriodPopoverYear(new Date().getFullYear());
                      }
                      setShowPeriodPopover(next);
                    }}
                    className={`ui-toolbar-tab !px-4 lg:!px-5 !text-[11px] lg:!text-sm shrink-0 ${
 showPeriodPopover ? 'bg-accent/10 text-accent' : 'text-white/80 hover:bg-white/10'
 } ${!periodSaved ? 'font-extrabold' : ''} active:bg-white/15`}
                    title="Seleziona periodo"
                  >
                    <span className="text-[12px] lg:text-sm font-bold tabular-nums capitalize text-white">
                      {format(parseISO(periodStart), 'MMM yy', { locale })}
                    </span>
                    <span className="h-3 w-px bg-white/20 shrink-0 mx-1" aria-hidden />
                    {(() => {
                      const rule = (() => { try { return localStorage.getItem('osteria_period_rule') ?? 'last_sunday'; } catch { return 'last_sunday'; } })();
                      const isFixedStart = rule === 'fixed_start';
                      return (
                        <span className={`text-[12px] lg:text-sm font-extrabold ${isFixedStart ? 'text-accent' : (periodNumWeeks === 4 ? 'text-accent' : 'text-cyan-300')}`}>
                          {periodNumWeeks} sett.
                        </span>
                      );
                    })()}
                    <ChevronDown className={`h-3 w-3 lg:h-3.5 lg:w-3.5 shrink-0 text-white/50 transition-transform ${showPeriodPopover ? 'rotate-180' : ''}`} aria-hidden />
                  </button>
                  </div>

                  {showPeriodPopover && periodPopoverPos && createPortal(
                    (() => {
                      const nowYear = new Date().getFullYear();
                      const activeRule = (() => { try { return localStorage.getItem('osteria_period_rule') ?? 'last_sunday'; } catch { return 'last_sunday'; } })();
                      const listYear = periodPopoverYear;
                      const twelveMonths = Array.from({ length: 12 }, (_, i) => {
                        const refDate = new Date(listYear, i, 15);
                        const cfg = periodConfigForMonth(refDate);
                        const s = getPeriodStartDate(cfg);
                        const e = getPeriodEndDate(cfg);
                        const isActive = cfg.startDate === periodStart && cfg.numWeeks === periodNumWeeks;
                        const isCurrentMonth = i === new Date().getMonth() && listYear === nowYear;
                        return { cfg, s, e, isActive, isCurrentMonth, monthIdx: i, activeRule };
                      });
                      return (
                        <div
                          ref={periodPopoverRef}
                          style={{
                            position: 'fixed',
                            top: periodPopoverPos.top,
                            left: periodPopoverPos.left,
                            zIndex: 99999,
                            background: 'var(--bg-popover-solid, rgb(5, 14, 60))',
                            color: '#f1f5f9',
                          }}
                          className="w-64 rounded-xl border border-neutral-500 shadow-2xl overflow-hidden text-slate-50"
                        >
                          {/* Header anno con navigazione */}
                          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 bg-white/5">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPeriodPopoverYear(y => y - 1); }}
                              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 active:bg-white/15"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            <span className="text-[11px] font-extrabold text-white tabular-nums">
                              {listYear}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPeriodPopoverYear(y => y + 1); }}
                              className="flex h-6 w-6 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 active:bg-white/15"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {/* Lista 12 periodi */}
                          <div className="max-h-[340px] overflow-y-auto py-1">
                            {twelveMonths.map(({ cfg, s, e, isActive, isCurrentMonth, monthIdx }) => (
                              <button
                                key={monthIdx}
                                type="button"
                                onClick={() => { applyAndSavePeriod(cfg); setShowPeriodPopover(false); }}
                                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${
 isActive
 ? 'bg-accent/15'
 : 'hover:bg-white/8'
 } active:bg-white/10`}
                              >
                                <span className={`text-[12px] font-bold capitalize ${
 isActive
 ? 'text-accent'
 : isCurrentMonth
 ? 'text-white'
 : 'text-white/70'
 }`}>
                                  {format(new Date(listYear, monthIdx, 1), 'MMMM', { locale })}
                                  {listYear !== nowYear && (
                                    <span className="ml-1 text-[11px] font-normal text-white/40">{listYear}</span>
                                  )}
                                  {isCurrentMonth && !isActive && (
                                    <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 align-middle" />
                                  )}
                                </span>
                                <span className={`shrink-0 text-[11px] tabular-nums ${
 isActive
 ? 'text-accent font-bold'
 : 'text-white/45'
 }`}>
                                  {format(s, 'dd/MM', { locale })}–{format(e, 'dd/MM', { locale })}
                                  <span className={`ml-1 font-extrabold ${cfg.numWeeks === 5 ? 'text-cyan-300' : ''}`}>
                                    {cfg.numWeeks}s
                                  </span>
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })(),
                    document.body
                  )}
                </div>
                </div>{/* end wrapper nav+chip */}
              </div>

            </div>

            <div className="flex min-h-9 w-full min-w-0 shrink-0 flex-wrap items-center justify-start gap-1 self-stretch sm:w-auto sm:flex-nowrap sm:justify-start md:ml-auto md:justify-end md:self-center">
              <div className="flex flex-wrap items-center gap-1 sm:flex-nowrap">
                {/* Undo button presenze */}
                {tsUndoStack.length > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      const [top, ...rest] = tsUndoStack;
                      setTsUndoStack(rest);
                      await top.fn();
                    }}
                    className="inline-flex h-9 max-h-9 min-h-9 lg:h-10 lg:max-h-10 lg:min-h-10 shrink-0 items-center gap-1 rounded-lg border border-neutral-500 px-2 lg:px-2.5 text-[11px] lg:text-xs font-semibold text-white/80 shadow-sm transition-colors hover:bg-white/10 active:bg-white/80"
                    style={{ background: 'rgba(255, 255, 255, 0.14)' }}
                    title={tsUndoStack[0]?.label ?? 'Annulla ultima azione'}
                  >
                    <RotateCcw className="h-3 w-3 lg:h-3.5 lg:w-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                    <span className="hidden sm:inline max-w-[7rem] truncate" title={tsUndoStack[0]?.label ?? 'Annulla'}>{tsUndoStack[0]?.label ?? 'Annulla'}</span>
                    {tsUndoStack.length > 1 && (
                      <span className="tabular-nums rounded-md bg-white/15 px-1 py-px text-[11px] font-bold leading-none text-white border border-white/25">
                        {tsUndoStack.length}
                      </span>
                    )}
                  </button>
                )}
                {canTimesheetApprove && weekBulkApproveToolbar && (() => {
                  const wAp = weekBulkApproveToolbar;
                  const weekApproveDisabled = undoApprovalBusy || !wAp.hasApproveMenuAction;
                  return (
                  <div className="relative" ref={weekApproveMenuRef}>
                    <button
                      ref={weekApproveBtnRef}
                      type="button"
                      disabled={weekApproveDisabled}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!wAp.hasApproveMenuAction) return;
                        if (showWeekApproveMenu) {
                          setShowWeekApproveMenu(false);
                          setWeekApproveDesktopPos(null);
                          return;
                        }
                        if (weekApproveMenuMobile) {
                          setShowWeekApproveMenu(true);
                          return;
                        }
                        const btn = weekApproveBtnRef.current;
                        if (btn) {
                          const r = btn.getBoundingClientRect();
                          const panelW = 256;
                          const left = Math.min(Math.max(8, r.right - panelW), window.innerWidth - panelW - 8);
                          setWeekApproveDesktopPos({ top: r.bottom + 4, left });
                        }
                        setShowWeekApproveMenu(true);
                      }}
                      className={`ui-toolbar-chip !inline-flex !h-9 !min-h-9 lg:!h-10 lg:!min-h-10 !px-2 lg:!px-2.5 !text-[11px] lg:!text-xs items-center gap-1.5 shrink-0 border shadow-sm ${
 weekApproveDisabled
 ? 'cursor-not-allowed opacity-60'
 : wAp.isApprovedState
 ? '!border-red-500'
 : '!border-emerald-600'
 } disabled:cursor-not-allowed`}
                      title={
                        !wAp.hasApproveMenuAction
                          ? t.ts_toolbar_week_approve_no_action_hint
                          : wAp.isApprovedState
                            ? t.ts_toolbar_week_approve_title_undo
                            : t.ts_toolbar_week_approve_title_freeze
                      }
                      aria-label={
                        !wAp.hasApproveMenuAction
                          ? t.ts_toolbar_week_approve_no_action_hint
                          : wAp.isApprovedState
                            ? t.ts_toolbar_week_approve_title_undo
                            : t.ts_toolbar_week_approve_title_freeze
                      }
                    >
                      {wAp.isApprovedState ? (
                        <Lock
                          className={`w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0 ${weekApproveDisabled ? 'text-white/50' : 'text-red-600'}`}
                          aria-hidden
                        />
                      ) : (
                        <Unlock
                          className={`w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0 ${weekApproveDisabled ? 'text-white/50' : 'text-emerald-600'}`}
                          aria-hidden
                        />
                      )}
                      <span className="hidden min-[380px]:inline font-bold whitespace-nowrap">
                        {wAp.isApprovedState
                          ? t.ts_toolbar_week_restore_btn
                          : t.ts_toolbar_week_approve_btn}
                      </span>
                      <ChevronDown
                        className={`h-3 w-3 lg:h-3.5 lg:w-3.5 shrink-0 transition-transform ${showWeekApproveMenu ? 'rotate-180' : ''}`}
                        aria-hidden
                      />
                    </button>

                    {(() => {
                      const visUserIds = new Set(visibleUsers.map(u => u.id));
                      const confirmedShifts = shifts.filter(
                        s => visUserIds.has(s.user_id) && s.date >= weekStr && s.date < weekEnd
                          && s.approval_status === 'confirmed' && !isShiftPayrollFrozen(s)
                      );
                      if (confirmedShifts.length === 0) return null;
                      const batchData = {
                        shiftIds: confirmedShifts.map(s => s.id),
                        employeeName: `Tutti (${confirmedShifts.length} turni)`,
                        previewRows: [],
                      };
                      return (
                        <button type="button" onClick={() => setPinGateModal({
                          mode: 'batch_week_approve',
                          shiftId: '',
                          batchData,
                        })}
                          className="ui-toolbar-chip !inline-flex !h-9 !min-h-9 lg:!h-10 lg:!min-h-10 !px-2 lg:!px-2.5 !text-[11px] lg:!text-xs items-center gap-1.5 shrink-0 border border-amber-600 shadow-sm !text-amber-400 hover:!bg-amber-500/10"
                        >
                          <Lock className="w-3.5 h-3.5 lg:w-4 lg:h-4 shrink-0" />
                          <span className="hidden min-[380px]:inline font-bold whitespace-nowrap">
                            {t.ts_employee_week_freeze_batch_cta ?? 'Congela tutto'} ({confirmedShifts.length})
                          </span>
                        </button>
                      );
                    })()}

                    {typeof document !== 'undefined' &&
                      createPortal(
                        <AnimatePresence>
                          {showWeekApproveMenu && !weekApproveMenuMobile && weekApproveDesktopPos && (
                            <motion.div
                              ref={weekApprovePortalRef}
                              key="week-approve-desktop"
                              initial={{ opacity: 0, y: 4, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 4, scale: 0.95 }}
                              className="fixed z-[10050] max-h-[min(70vh,420px)] w-64 overflow-y-auto rounded-xl border border-neutral-500 p-1 shadow-xl"
                              style={{
                                background: 'var(--bg-popover-solid)',
                                top: weekApproveDesktopPos.top,
                                left: weekApproveDesktopPos.left,
                                isolation: 'isolate',
                              }}
                            >
                            {(() => {
                              const w = weekBulkApproveToolbar;
                              const openSummary = (
                                targetShifts: Shift[],
                                approvedSlice: Shift[],
                                isApprovedState: boolean,
                                employeeName: string
                              ) => {
                                const previewRows = targetShifts.map((s) => {
                                  const u =
                                    visibleUsers.find((vu) => vu.id === s.user_id) ??
                                    users.find((x) => x.id === s.user_id);
                                  const dayData = timesheetData[s.user_id]?.[s.date];
                                  const shiftRow = dayData?.shifts.find((sr) => sr.id === s.id);
                                  const displayStart = shiftRow?.actualStart || s.start_time || '';
                                  const displayEnd = shiftRow?.actualEnd || s.end_time || '';
                                  const name = u
                                    ? `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}`.trim()
                                    : '—';
                                  return {
                                    dateStr: s.date,
                                    planned: `${(displayStart || '').slice(0, 5)}–${(displayEnd || '').slice(0, 5)}`,
                                    employeeLabel: name,
                                  };
                                });
                                setApproveWeekSummary({
                                  employeeName,
                                  shiftIds: targetShifts.map((s) => s.id),
                                  previewRows,
                                  ...(isApprovedState ? { approvedIds: approvedSlice.map((s) => s.id) } : {}),
                                });
                                setShowWeekApproveMenu(false);
                                setWeekApproveDesktopPos(null);
                              };

                              if (w.isApprovedState) {
                                return (
                                  <>
                                    <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/40">
                                      Ripristina approvazione
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openSummary(w.weekApproved, w.weekApproved, true, `Tutti (${visibleUsers.length})`)
                                      }
                                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold text-white/85 transition-colors hover:bg-white/10 active:bg-white/80"
                                    >
                                      <Users className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                                      <span className="flex-1">Tutti i dipendenti visibili</span>
                                    </button>
                                    <div className="my-1 h-px bg-white/10" />
                                    {w.approvedByUser.map(({ user, name, approvedShifts }) => (
                                      <button
                                        key={user.id}
                                        type="button"
                                        onClick={() =>
                                          openSummary(approvedShifts, approvedShifts, true, name)
                                        }
                                        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold text-white/85 transition-colors hover:bg-white/10 active:bg-white/80"
                                      >
                                        <UserCheck className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
                                        <span className="flex-1 truncate" title={name}>{name}</span>
                                      </button>
                                    ))}
                                  </>
                                );
                              }

                              return (
                                <>
                                  <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/40">
                                    Approva turni
                                  </p>
                                  <button
                                    type="button"
                                    disabled={!w.fullWeekComplete}
                                    title={
                                      w.fullWeekComplete
                                        ? 'Approvazione settimana intera'
                                        : 'Completa timbrature (entrata e uscita) per tutti i turni in attesa'
                                    }
                                    onClick={() =>
                                      openSummary(
                                        w.weekShiftsToApprove,
                                        w.weekApproved,
                                        false,
                                        `Tutti (${visibleUsers.length})`
                                      )
                                    }
                                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 w.fullWeekComplete
 ? 'text-white/85 hover:bg-white/10'
 : 'cursor-not-allowed text-white/30 opacity-60'
 } active:bg-white/15`}
                                  >
                                    <Users className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
                                    <span className="flex-1">Settimana intera (tutti)</span>
                                  </button>
                                  <div className="my-1 h-px bg-white/10" />
                                  <p className="px-2 py-0.5 text-[11px] font-semibold text-white/40">
                                    Per dipendente
                                  </p>
                                  {w.employeesPending.map(({ user, name, pendingShifts, complete }) => (
                                    <button
                                      key={user.id}
                                      type="button"
                                      disabled={!complete}
                                      title={
                                        complete
                                          ? `Approvazione solo per ${name}`
                                          : 'Completa timbrature (entrata e uscita) per i turni in attesa di questo dipendente'
                                      }
                                      onClick={() => openSummary(pendingShifts, w.weekApproved, false, name)}
                                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 complete
 ? 'text-white/85 hover:bg-white/10'
 : 'cursor-not-allowed text-white/30 opacity-60'
 } active:bg-white/15`}
                                    >
                                      <UserCheck className="h-3.5 w-3.5 shrink-0 text-white/40" aria-hidden />
                                      <span className="flex-1 truncate" title={name}>{name}</span>
                                    </button>
                                  ))}
                                </>
                              );
                            })()}
                            </motion.div>
                          )}
                        </AnimatePresence>,
                        document.body
                      )}
                    <div className="lg:hidden">
                            <CenteredModalPortal
                              open={showWeekApproveMenu && weekApproveMenuMobile}
                              onClose={() => {
                                setShowWeekApproveMenu(false);
                                setWeekApproveDesktopPos(null);
                              }}
                              maxWidthClass="max-w-[320px]"
                              panelClassName="p-1 max-h-[min(75dvh,480px)] overflow-y-auto"
                            >
                              {(() => {
                                const w = weekBulkApproveToolbar;
                                const openSummary = (
                                  targetShifts: Shift[],
                                  approvedSlice: Shift[],
                                  isApprovedState: boolean,
                                  employeeName: string
                                ) => {
                                  const previewRows = targetShifts.map((s) => {
                                    const u =
                                      visibleUsers.find((vu) => vu.id === s.user_id) ??
                                      users.find((x) => x.id === s.user_id);
                                    const dayData = timesheetData[s.user_id]?.[s.date];
                                    const shiftRow = dayData?.shifts.find((sr) => sr.id === s.id);
                                    const displayStart = shiftRow?.actualStart || s.start_time || '';
                                    const displayEnd = shiftRow?.actualEnd || s.end_time || '';
                                    const name = u
                                      ? `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}`.trim()
                                      : '—';
                                    return {
                                      dateStr: s.date,
                                      planned: `${(displayStart || '').slice(0, 5)}–${(displayEnd || '').slice(0, 5)}`,
                                      employeeLabel: name,
                                    };
                                  });
                                  setApproveWeekSummary({
                                    employeeName,
                                    shiftIds: targetShifts.map((s) => s.id),
                                    previewRows,
                                    ...(isApprovedState ? { approvedIds: approvedSlice.map((s) => s.id) } : {}),
                                  });
                                  setShowWeekApproveMenu(false);
                                  setWeekApproveDesktopPos(null);
                                };

                                return (
                                  <>
                                    <div className="flex items-center justify-between border-b border-white/10 px-2 py-2">
                                      <span className="text-[11px] font-bold text-white/85">
                                        {w.isApprovedState ? 'Ripristina' : 'Approvazione settimana'}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setShowWeekApproveMenu(false);
                                          setWeekApproveDesktopPos(null);
                                        }}
                                        className="rounded-lg p-1 text-white/50 hover:bg-white/10 active:bg-white/80"
                                        aria-label={t.close}
                                      >
                                        <X className="h-4 w-4" />
                                      </button>
                                    </div>
                                    <div className="p-1">
                                      {w.isApprovedState ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              openSummary(w.weekApproved, w.weekApproved, true, `Tutti (${visibleUsers.length})`)
                                            }
                                            className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[11px] font-bold text-white/85 hover:bg-white/10 active:bg-white/80"
                                          >
                                            <Users className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                                            Tutti i dipendenti visibili
                                          </button>
                                          {w.approvedByUser.map(({ user, name, approvedShifts }) => (
                                            <button
                                              key={user.id}
                                              type="button"
                                              onClick={() => openSummary(approvedShifts, approvedShifts, true, name)}
                                              className="flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[11px] font-bold text-white/85 hover:bg-white/10 active:bg-white/80"
                                            >
                                              <UserCheck className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
                                              {name}
                                            </button>
                                          ))}
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            type="button"
                                            disabled={!w.fullWeekComplete}
                                            onClick={() =>
                                              openSummary(
                                                w.weekShiftsToApprove,
                                                w.weekApproved,
                                                false,
                                                `Tutti (${visibleUsers.length})`
                                              )
                                            }
                                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[11px] font-bold ${
 w.fullWeekComplete
 ? 'text-white/85 hover:bg-white/10'
 : 'cursor-not-allowed text-white/30 opacity-60'
 } active:bg-white/15`}
                                          >
                                            <Users className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                                            Settimana intera (tutti)
                                          </button>
                                          <p className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase text-white/40">
                                            Per dipendente
                                          </p>
                                          {w.employeesPending.map(({ user, name, pendingShifts, complete }) => (
                                            <button
                                              key={user.id}
                                              type="button"
                                              disabled={!complete}
                                              onClick={() => openSummary(pendingShifts, w.weekApproved, false, name)}
                                              className={`flex w-full items-center gap-2 rounded-lg px-2 py-2.5 text-left text-[11px] font-bold ${
 complete
 ? 'text-white/85 hover:bg-white/10'
 : 'cursor-not-allowed text-white/30 opacity-60'
 } active:bg-white/15`}
                                            >
                                              <UserCheck className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
                                              {name}
                                            </button>
                                          ))}
                                        </>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            </CenteredModalPortal>
                          </div>
                  </div>
                ); })()}
                {/* Department Selector for PDF — visibile solo per admin */}
                <div className={`relative ${!isAdminTs ? 'hidden' : ''}`} ref={pdfDeptMenuRef}>
                  <button
                    type="button"
                    onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation(); 
                      setShowPdfDeptMenu(prev => !prev); 
                    }}
                    className="ui-toolbar-chip !inline-flex !h-9 !min-h-9 lg:!h-10 lg:!min-h-10 !px-2 lg:!px-2.5 !text-[11px] lg:!text-xs items-center gap-1.5 cursor-pointer relative z-[110] max-w-[110px] sm:max-w-none"
                    title="Seleziona reparto per PDF"
                  >
                    <Filter className="h-3 w-3 lg:h-3.5 lg:w-3.5 shrink-0 text-white/50" />
                    <span className="font-bold text-white/80 truncate">
                      {pdfDeptFilter === 'all' 
                        ? <span>Reparti</span>
                        : availableDepts.find(d => d.value === pdfDeptFilter)?.label || pdfDeptFilter}
                    </span>
                    <ChevronDown className={`h-3 w-3 lg:h-3.5 lg:w-3.5 shrink-0 text-white/50 transition-transform ${showPdfDeptMenu ? 'rotate-180' : ''}`} />
                  </button>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                      {showPdfDeptMenu && (
                        <>
                          {/* Desktop Dropdown */}
                          <motion.div
                            initial={{ opacity: 0, y: 4, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 4, scale: 0.95 }}
                            className="hidden lg:block absolute left-0 lg:right-0 lg:left-auto top-full z-[300] mt-1 w-48 rounded-xl border border-neutral-500 p-1 shadow-xl"
                            style={{ background: 'var(--bg-popover-solid)', isolation: 'isolate' }}
                          >
                            <button
                              type="button"
                              onClick={() => { setPdfDeptFilter('all'); setShowPdfDeptMenu(false); }}
                              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 pdfDeptFilter === 'all' 
 ? 'bg-accent text-white shadow-md' 
 : 'text-white/80 hover:bg-white/10'
 } active:bg-white/15`}
                            >
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                <Check className={`h-3 w-3 ${pdfDeptFilter === 'all' ? 'text-white' : 'text-accent'}`} strokeWidth={3} />
                              </div>
                              <span className="flex-1 truncate">Tutti i reparti</span>
                              {pdfDeptFilter === 'all' && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                            </button>

                            <div className="my-1 h-px" style={{ background: 'rgba(15, 35, 90, 0.82)' }} />

                            {availableDepts
                              .map((dept) => (
                              <button
                                key={dept.value}
                                type="button"
                                onClick={() => { setPdfDeptFilter(dept.value); setShowPdfDeptMenu(false); }}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 pdfDeptFilter === dept.value 
 ? 'bg-accent text-white shadow-md' 
 : 'text-white/70 hover:bg-white/10'
 } active:bg-white/15`}
                              >
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                  <span
                                    className={`h-2.5 w-2.5 rounded-full shadow-sm ${pdfDeptFilter === dept.value ? 'bg-white' : ''}`}
                                    style={pdfDeptFilter !== dept.value ? { backgroundColor: getDeptColor(dept.value) } : {}}
                                  />
                                </div>
                                <span className="flex-1 truncate" title={dept.label}>{dept.label}</span>
                                {pdfDeptFilter === dept.value && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                              </button>
                            ))}
                          </motion.div>

                          {/* Mobile/Tablet Popup Modal */}
                          <div className="lg:hidden">
                            <CenteredModalPortal
                              open={showPdfDeptMenu}
                              onClose={() => setShowPdfDeptMenu(false)}
                              maxWidthClass="max-w-[280px]"
                              panelClassName="p-1"
                              disableBackdropClose
                            >
                              <div className="flex items-center justify-between px-2 py-1.5 mb-1" style={{ borderBottom: '1px solid rgba(15, 35, 90, 0.82)' }}>
                                <span className="text-[11px] font-bold uppercase tracking-wider text-white/50">
                                  {t.department_filter_label}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowPdfDeptMenu(false)}
                                  className="rounded-lg p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white/70 active:text-white/70"
                                  aria-label={t.close}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => { setPdfDeptFilter('all'); setShowPdfDeptMenu(false); }}
                                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 pdfDeptFilter === 'all' 
 ? 'bg-accent text-white shadow-md' 
 : 'text-white/70 hover:bg-white/10'
 } active:bg-white/15`}
                              >
                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                  <Check className={`h-3 w-3 ${pdfDeptFilter === 'all' ? 'text-white' : 'text-accent'}`} strokeWidth={3} />
                                </div>
                                <span className="flex-1 truncate">Tutti i reparti</span>
                                {pdfDeptFilter === 'all' && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                              </button>

                              <div className="my-1 h-px" style={{ background: 'rgba(15, 35, 90, 0.82)' }} />

                              {availableDepts
                                .map((dept) => (
                                <button
                                  key={dept.value}
                                  type="button"
                                  onClick={() => { setPdfDeptFilter(dept.value); setShowPdfDeptMenu(false); }}
                                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[11px] font-bold transition-colors ${
 pdfDeptFilter === dept.value 
 ? 'bg-accent text-white shadow-md' 
 : 'text-white/70 hover:bg-white/10'
 } active:bg-white/15`}
                                >
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20">
                                    <span
                                      className={`h-2.5 w-2.5 rounded-full shadow-sm ${pdfDeptFilter === dept.value ? 'bg-white' : ''}`}
                                      style={pdfDeptFilter !== dept.value ? { backgroundColor: getDeptColor(dept.value) } : {}}
                                    />
                                  </div>
                                  <span className="flex-1 truncate" title={dept.label}>{dept.label}</span>
                                  {pdfDeptFilter === dept.value && <Check className="h-3 w-3 text-white/90" strokeWidth={3} />}
                                </button>
                              ))}
                            </CenteredModalPortal>
                          </div>
                        </>
                      )}
                    </AnimatePresence>
                </div>

              </div>
            </div>
          </div>
          )}
          {/* ── Griglia presenze (ancora scroll dalle card riepilogo) ─── */}
          {uiW('timesheet.main_grid') && (
          <>
          {/* Mobile Card View */}
          <div className="md:hidden space-y-4 px-4 pb-8">
            {visibleUsers.map((user) => {
              const totals = userTotals[user.id];
              const userHasShifts = weekDays.some(day => {
                const dateStr = format(day, 'yyyy-MM-dd');
                return timesheetData[user.id]?.[dateStr]?.shifts.length > 0;
              });

              return (
                <div key={user.id} className="rounded-xl border border-neutral-500 rounded-2xl p-4 shadow-sm border border-neutral-500 overflow-hidden">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="font-bold text-lg text-white">{user.first_name}</h4>
                      {user.department && (
                        <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider">{user.department}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-bold text-white/50 uppercase tracking-tight">{t.stats_total}</div>
                      <div className="text-sm font-bold text-accent">
                        {formatMinutesToHoursAndMinutes(totals?.actualMins || totals?.plannedMins || 0)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {!userHasShifts ? (
                      <div className="py-4 text-center border-2 border-dashed border-slate-100 rounded-xl">
                        <p className="text-xs text-white/50 italic">{t.no_shifts_this_week}</p>
                      </div>
                    ) : (
                      weekDays.map(day => {
                        const dateStr = format(day, 'yyyy-MM-dd');
                        const dayData = timesheetData[user.id]?.[dateStr];
                        if (!dayData || dayData.shifts.length === 0) return null;
                        
                        const todayDate = isToday(day);

                        const onOpenDayQueue = () => { if (!isMobile) handleOpenDayReview(dateStr); };
                        const dayClickBlocked = isMobile || plannedOnlyTimesheetGrid;
                        return (
                          <div
                            key={dateStr}
                            className={`flex items-start gap-3 p-2 rounded-xl ${todayDate ? 'bg-accent/5 ring-1 ring-accent/20' : 'bg-slate-50/50'} ${dayClickBlocked ? 'cursor-default' : 'cursor-pointer'}`}
                            role={dayClickBlocked ? undefined : 'button'}
                            tabIndex={dayClickBlocked ? undefined : 0}
                            onClick={dayClickBlocked ? undefined : onOpenDayQueue}
                            onKeyDown={dayClickBlocked ? undefined : (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onOpenDayQueue();
                              }
                            }}
                          >
                            <div className="w-10 shrink-0 text-center">
                              <div className={`text-[11px] font-bold uppercase ${todayDate ? 'text-accent' : 'text-white/50'}`}>
                                {format(day, 'EEE', { locale })}
                              </div>
                              <div className={`text-xs font-bold ${todayDate ? 'text-accent' : 'text-white/70'}`}>
                                {format(day, 'd', { locale })}
                              </div>
                            </div>
                            
                            <div className="flex-1 space-y-2">
                              {dayData.shifts.map(s => {
                                const punchAuditCount = s.punchInId ? (punchAudits[s.punchInId]?.length ?? 0) : 0;
                                const boardShift = shifts.find((sh) => sh.id === s.id) ?? null;
                                const { border, bg, ring } = getShiftCardStyle(s, punchAuditCount, dateStr, boardShift);
                                
                                const shiftClickBlocked = isMobile || plannedOnlyTimesheetGrid;
                                return (
                                  <div
                                    key={s.id}
                                    onClick={shiftClickBlocked ? undefined : (e) => {
                                      e.stopPropagation();
                                      openDrawer(s, user, dateStr, null, 'turno');
                                    }}
                                    className={`flex w-full items-center justify-between rounded-lg border-l-4 ${border} ${bg} ${ring} p-2 text-left ${shiftClickBlocked ? 'cursor-default' : 'cursor-pointer transition-transform '}`}
                                  >
                                    <div className="flex flex-col">
                                      <span className="text-xs font-bold text-white/90">
                                        {s.plannedStart}–{s.plannedEnd || '?'}
                                      </span>
                                      {s.punched && s.actualStart && (
                                        <span className="text-[11px] font-medium text-white/60">
                                          {s.actualStart}–{s.actualEnd || '...'}
                                        </span>
                                      )}
                                    </div>
                                    {!isMobile && <ChevronRight className="h-4 w-4 text-white/30" />}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table View */}
          {/* ── Mirror header sticky — compare quando il thead originale esce dalla vista ── */}
          {timesheetHeaderSticky && (
            <div
              ref={timesheetMirrorHeaderRef}
              className="hidden md:block sticky z-[200] rounded-b-xl overflow-hidden border-x border-b border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.4)]"
              style={{ top: 'var(--app-sticky-header-offset)', background: 'transparent' }}
            >
              <div ref={timesheetHeaderScrollRef} className="overflow-x-hidden">
                <table
                  className="w-full table-fixed border-collapse [&_th]:border-neutral-500"
                  style={{ minWidth: timesheetGridMinWidthPx }}
                >
                  <colgroup>
                    <col style={{ width: timesheetGridNameColPx }} />
                    {weekDays.map((day) => (
                      <col key={format(day, 'yyyy-MM-dd')} style={{ width: timesheetGridDayColPx }} />
                    ))}
                    <col style={{ width: timesheetGridTotalColPx }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-white/20" style={{ background: 'transparent' }}>
                      <th className="sticky left-0 z-10 box-border py-3.5 pl-4 pr-3 text-center text-[11px] font-semibold uppercase tracking-wider text-white border-r border-r-white/20 md:py-2.5 md:pl-3 md:pr-2" style={{ background: 'transparent' }}>
                        {t.employee}
                      </th>
                      {weekDays.map((day, dayIdx) => {
                        const todayDate = isToday(day);
                        const dStr = format(day, 'yyyy-MM-dd');
                        const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
                        const isPayrollDay = dStr === weekViewPayrollDayStr;
                        const payrollHighlight = isPayrollDay && (viewMode === 'week' || inP);
                        const canReviewThisDay = dStr <= todayStr;
                        const dayReviewableCount = visibleUsers.reduce((n, u) => {
                          const d = timesheetData[u.id]?.[dStr];
                          return n + (d?.shifts.filter((s) => shiftEligibleForDayReview(s)).length ?? 0);
                        }, 0);
                        const canReview = inP && canReviewThisDay && canTeamTimesheetOps && dayReviewableCount > 0;
                        const weekEndCol = viewMode === 'month' && (dayIdx + 1) % 7 === 0;
                        return (
                          <th key={dStr}
                            onClick={canReview ? () => handleOpenDayReview(dStr) : undefined}
                            className={`box-border px-2 py-2.5 text-center text-[11px] font-semibold whitespace-nowrap transition-colors md:px-1 md:py-1.5 ${
 weekEndCol ? 'border-r-2 border-r-white/20' : 'border-r border-r-white/10'
 } ${canReview ? 'cursor-pointer hover:bg-white/10 group' : ''} active:bg-white/80`}
                            style={{ background: payrollHighlight ? 'rgba(51,102,204,0.35)' : todayDate ? 'rgba(0,82,255,0.08)' : 'transparent' }}
                          >
                            <div className={todayDate && inP ? 'text-cyan-300' : 'text-white/70'}>
                              {format(day, 'EEE', { locale })}
                            </div>
                            <div className={`font-bold mt-0.5 text-sm md:text-xs ${todayDate && inP ? 'text-white' : payrollHighlight ? 'text-emerald-200' : 'text-white'}`}>
                              {format(day, 'd MMM', { locale })}
                            </div>
                            {payrollHighlight && (
                              <div className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-400">
                                {tv.ts_payroll_day_abbr ?? 'Paga'}
                              </div>
                            )}
                            {canReview && (
                              <div className="mt-0.5 text-[11px] font-semibold text-accent/60 group-hover:text-accent transition-colors active:text-accent">
                                {t.ts_review_short}
                              </div>
                            )}
                          </th>
                        );
                      })}
                      <th className="box-border border-l border-l-white/20 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wider text-white md:px-2 md:py-2" style={{ background: 'transparent' }}>
                        {t.stats_total}
                      </th>
                    </tr>
                  </thead>
                </table>
              </div>
            </div>
          )}

          <div id="timesheet-section-main-grid" className="hidden md:block overflow-hidden scroll-mt-24 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.12)', border: '1px solid rgba(255,255,255,0.12)' }}>
            <HorizontalScrollArea
              variant="overlay"
              remeasureKey={`${viewMode}-${weekStr}-${weekDays.length}`}
              ariaLabelPrev={viewMode === 'week' ? tv.ts_timesheet_week_nav_prev : t.table_h_scroll_prev}
              ariaLabelNext={viewMode === 'week' ? tv.ts_timesheet_week_nav_next : t.table_h_scroll_next}
              weekNav={timesheetMainGridWeekNav}
              scrollClassName="overflow-x-auto-safe"
              scrollSyncRef={timesheetBodyScrollRef}
            >
            <table
              className="w-full table-fixed border-collapse [&_th]:border-white/10 [&_td]:border-white/10"
              style={{ minWidth: timesheetGridMinWidthPx }}
            >
              <colgroup>
                <col style={{ width: timesheetGridNameColPx }} />
                {weekDays.map((day) => (
                  <col key={format(day, 'yyyy-MM-dd')} style={{ width: timesheetGridDayColPx }} />
                ))}
                <col style={{ width: timesheetGridTotalColPx }} />
              </colgroup>
              <thead ref={timesheetTheadRef}>
                <tr className="border-b border-neutral-500">
                  <th className="sticky left-0 z-10 box-border py-2 pl-4 pr-3 text-center text-[11px] font-semibold uppercase tracking-wider text-white/50 border-r border-r-white/15 md:py-1.5 md:pl-3 md:pr-2" style={{ background: 'transparent', boxShadow: 'none' }}>
                    {t.employee}
                  </th>
                  {weekDays.map((day, dayIdx) => {
                    const todayDate = isToday(day);
                    const dStr = format(day, 'yyyy-MM-dd');
                    const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
                    const isPayrollDay = dStr === weekViewPayrollDayStr;
                    const payrollHighlight = isPayrollDay && (viewMode === 'week' || inP);
                    const canReviewThisDay = dStr <= todayStr;
                    const dayReviewableCount = visibleUsers.reduce((n, u) => {
                      const d = timesheetData[u.id]?.[dStr];
                      return n + (d?.shifts.filter((s) => shiftEligibleForDayReview(s)).length ?? 0);
                    }, 0);
                    const canReview = inP && canReviewThisDay && canTeamTimesheetOps && dayReviewableCount > 0;
                    const weekEndCol = viewMode === 'month' && (dayIdx + 1) % 7 === 0;
                    return (
                      <th key={dStr}
                        onClick={canReview ? () => handleOpenDayReview(dStr) : undefined}
                        title={
                          isPayrollDay
                            ? `${format(day, 'EEEE d MMMM yyyy', { locale })} — ${tv.ts_payroll_day_abbr ?? 'Paga'}`
                            : canReview
                              ? t.ts_review_shifts_tooltip.replace('{n}', String(dayReviewableCount))
                              : undefined
                        }
                        className={`box-border px-2 py-1.5 text-center text-[11px] font-semibold whitespace-nowrap transition-colors md:px-1 md:py-1 ${
 weekEndCol ? 'border-r-2 border-r-white/15' : 'border-r border-r-white/10'
 } ${viewMode === 'month' && !inP ? 'opacity-40' : ''} ${canReview ? 'cursor-pointer hover:bg-white/10 group' : ''} active:bg-white/80`}
                        style={{ background: payrollHighlight ? 'rgba(51,102,204,0.35)' : todayDate ? 'rgba(0,82,255,0.08)' : 'transparent' }}
                      >
                        <div
                          className={`text-[11px] font-bold uppercase tracking-widest mb-0.5 ${
 todayDate && inP ? 'text-accent/70' : 'text-white/40'
 }`}
                        >
                          {format(day, 'EEE', { locale })}
                        </div>
                        <div className="flex items-center justify-center gap-1">
                          <div
                            className={`font-black tabular-nums text-[13px] md:text-xs ${
 todayDate && inP
 ? 'text-accent'
 : !inP
 ? 'text-white/30'
 : payrollHighlight
 ? 'text-white/90'
 : 'text-white/70'
 }`}
                          >
                            {format(day, 'd/MM')}
                          </div>
                          {payrollHighlight && (
                            <span className="text-[11px] font-bold uppercase tracking-wide text-[#007A5E]">
                              {tv.ts_payroll_day_abbr ?? 'Paga'}
                            </span>
                          )}
                          {canReview && (
                            <span className="text-[11px] font-semibold text-accent/60 group-hover:text-accent transition-colors active:text-accent">
                              {t.ts_review_short}
                            </span>
                          )}
                        </div>
                      </th>
                    );
                  })}
                  <th className="box-border border-l-2 border-l-white/20 px-3 py-3.5 text-center text-[11px] font-semibold uppercase tracking-wider text-white/60 md:px-2 md:py-2" style={{ background: 'transparent' }}>
                    {t.stats_total}
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleUsers.map((user, userIdx) => {
                        const totals = userTotals[user.id];
                        const _isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
                        return (
                          <tr
                            key={user.id}
                            className={`depth-row last:border-b-0`}
                            style={{ background: userIdx % 2 === 0 ? 'rgba(20,45,110,0.60)' : 'rgba(20,45,110,0.70)' }}
                          >
                      {/* Nome dipendente — click → revisione settimana (coda turni) */}
                      <td className="sticky left-0 pl-4 pr-3 py-2 border-r border-r-white/10 z-10 md:py-1.5 md:pl-3 md:pr-2 align-middle" style={{ background: 'transparent', boxShadow: 'none' }}>
                        <div className="flex flex-col gap-1 justify-center">
                          <button
                            type="button"
                            className="w-full max-w-full rounded-lg py-0.5 text-right transition-colors hover:bg-white/[0.04] hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                            aria-label={formatTrans(t.ts_employee_week_review_open_aria, { name: user.first_name })}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEmployeeWeekReview(user);
                            }}
                          >
                            <div className="font-semibold text-sm text-white md:text-xs">{user.first_name}</div>
                            {user.department && (
                              <div className="text-[11px] text-white/40 mt-0.5 md:text-[11px] uppercase">{user.department}</div>
                            )}
                          </button>
                        </div>
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
                        const tdBorder = weekEndCol ? 'border-r-2 border-r-white/15' : 'border-r border-r-white/10';
                        const tdMuted = viewMode === 'month' && !inP;
                        const tdStyle: React.CSSProperties = payrollHighlight
                          ? { background: 'rgba(51,102,204,0.12)' }
                          : todayDate && inP
                            ? { background: 'rgba(0,82,255,0.08)' }
                            : tdMuted
                              ? { background: 'transparent', opacity: 0.35 }
                              : { background: userIdx % 2 === 0 ? 'rgba(20,45,110,0.60)' : 'rgba(20,45,110,0.70)' };

                        if (!dayData || dayData.shifts.length === 0) {
                          return (
                            <td key={dateStr} className={`px-2 py-2 text-center ${tdBorder} md:px-1.5 md:py-1.5`} style={tdStyle}>
                              <span className="text-sm md:text-xs text-white/45">–</span>
                            </td>
                          );
                        }

                        const { before16, from16 } = partitionShiftsByPlannedHour16(dayData.shifts);
                        const renderShiftButton = (s: ShiftRow) => {
                                const punchAuditCount = s.punchInId ? (punchAudits[s.punchInId]?.length ?? 0) : 0;
                                const boardShift = shifts.find((sh) => sh.id === s.id) ?? null;
                                const { border, bg, ring, dot } = getShiftCardStyle(s, punchAuditCount, dateStr, boardShift);
                                const publishedCell = s.status === 'confirmed' || s.status === 'approved';
                                const showPlannedTimesInCell =
                                  showFullTimesheetGrid || (plannedOnlyTimesheetGrid && publishedCell);
                                const deltaColor =
                                  s.deltaMins > 5 ? 'text-accent' : s.deltaMins < -5 ? 'text-red-400' : 'text-white/50';

                                // Logica per determinare se mostrare l'orario pianificato come "effettivo" in assenza di timbrature
                                const showPlannedAsActual = !s.punched && publishedCell;
                                const displayActualMins = showPlannedAsActual ? s.plannedMins : s.actualMins;
                                const displayDeltaMins = showPlannedAsActual ? 0 : s.deltaMins;

                                const isHighlighted = highlightedShiftIds.has(s.id);
                                const isDimmed = statFilter !== null && !isHighlighted;
                                return (
                                  <button
                                    key={s.id}
                                    type="button"
                                    onClick={plannedOnlyTimesheetGrid ? undefined : () => {
                                      openDrawer(s, user, dateStr, null, 'turno');
                                    }}
                                    className={`relative flex w-full items-stretch text-left rounded-lg border-l-[3px] ${border} ${bg} ${ring} py-1 pl-2 pr-2 shadow-sm transition-colors group md:rounded-md md:py-0.5 md:pl-1.5 md:pr-1.5 md:border-l-2 ${plannedOnlyTimesheetGrid ? 'cursor-default' : 'hover:shadow-md'} ${isHighlighted ? 'ts-shift-highlighted' : ''} ${isDimmed ? 'opacity-20 pointer-events-none' : ''}`}
                                  >
                                    {/* Spunta / lucchetto subito dopo la barra verticale, poi orari */}
                                    {(s.status === 'confirmed' || s.status === 'approved') && (
                                      <span className="mr-1.5 flex shrink-0 flex-col items-center justify-center gap-0.5 self-stretch md:mr-1">
                                        {s.status === 'confirmed' && (
                                          <Check
                                            className="h-2.5 w-2.5 shrink-0 text-brand-mid md:h-2 md:w-2"
                                            strokeWidth={2.5}
                                            aria-hidden
                                          />
                                        )}
                                        {s.status === 'approved' && (
                                          <Lock
                                            className="h-2.5 w-2.5 shrink-0 text-emerald-600 md:h-2 md:w-2"
                                            strokeWidth={2.5}
                                            aria-hidden
                                          />
                                        )}
                                      </span>
                                    )}
                                    <div className="flex min-w-0 flex-1 flex-col gap-1 md:gap-0.5">
                                    <div className="mb-0.5 flex items-center justify-between gap-1 md:mb-0">
                                      <span
                                        className="text-[11px] font-semibold text-white/70 tabular-nums md:text-[11px]"
                                        aria-label={
                                          showPlannedTimesInCell
                                            ? undefined
                                            : t.ts_times_grid_times_masked_aria
                                        }
                                      >
                                        {showPlannedTimesInCell
                                          ? `${s.plannedStart}–${s.plannedEnd || '?'}`
                                          : t.ts_times_masked_range}
                                      </span>
                                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot} md:h-1.5 md:w-1.5`} />
                                    </div>
                                    {/* Effettivo: mostra solo orari timbratura reali; se non timbrato → "–". */}
                                    {showFullTimesheetGrid ? (
                                      s.punched ? (
                                        s.actualEnd ? (
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="text-[11px] font-bold text-white tabular-nums md:text-[11px]">
                                              {`${s.actualStart}–${s.actualEnd}`}
                                            </span>
                                            <span
                                              className={`max-w-[min(100%,5.5rem)] shrink-0 text-right text-[11px] font-semibold leading-tight tabular-nums md:max-w-[4.75rem] md:text-[11px] ${
 s.breakMinutesActual > 0 ? 'text-white/50' : deltaColor
 }`}
                                              title={
                                                s.breakMinutesActual > 0
                                                  ? `${t.ts_net_hours}: ${fmtHM(displayActualMins)}`
                                                  : undefined
                                              }
                                            >
                                              {s.breakMinutesActual > 0
                                                ? `−${fmtBreakDeductionShort(s.breakMinutesActual)}`
                                                : `${displayDeltaMins >= 0 ? '+' : ''}${fmtHM(displayDeltaMins)}`}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="flex items-start justify-between gap-1 md:gap-0.5">
                                            <div className="min-w-0 flex flex-1 flex-wrap items-center gap-x-0.5 text-[11px] font-semibold text-red-400 md:text-[11px]">
                                              <span>{s.actualStart}</span>
                                              <span className="text-red-500">{t.ts_missing_exit}</span>
                                            </div>
                                            {s.breakMinutes > 0 && (
                                              <span
                                                className="max-w-[min(100%,5.5rem)] shrink-0 text-right text-[11px] font-semibold leading-tight tabular-nums text-white/50 md:max-w-[4.75rem] md:text-[11px]"
                                                title={`${t.ts_kpi_planned}: ${fmtHM(s.plannedMins)}`}
                                              >
                                                {`−${fmtBreakDeductionShort(s.breakMinutes)}`}
                                              </span>
                                            )}
                                          </div>
                                        )
                                      ) : (
                                        <span className="text-[11px] font-semibold text-white/45 md:text-[11px]">–</span>
                                      )
                                    ) : plannedOnlyTimesheetGrid &&
                                      publishedCell &&
                                      s.displayFromFrozenApprovedTimes &&
                                      s.actualStart &&
                                      s.actualEnd ? (
                                      <div className="flex items-center justify-between gap-1">
                                        <span
                                          className="text-[11px] font-bold text-white tabular-nums md:text-[11px]"
                                          title={t.ts_kpi_frozen_official}
                                        >
                                          {`${s.actualStart}–${s.actualEnd}`}
                                        </span>
                                      </div>
                                    ) : null}
                                    {/* Badge icone — assoluti in alto a destra */}
                                    {showFullTimesheetGrid && (punchAuditCount > 0 || getShiftHistory(s.id).length > 0) && (
                                      <div className="absolute top-0.5 right-1 flex items-center gap-0.5">
                                        {punchAuditCount > 0 && (
                                          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-orange-300 bg-orange-500/20 rounded px-0.5 py-px leading-none">
                                            <ShieldAlert className="w-2 h-2" />{punchAuditCount}
                                          </span>
                                        )}
                                        {getShiftHistory(s.id).length > 0 && (
                                          <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-300 bg-amber-500/20 rounded px-0.5 py-px leading-none">
                                            <History className="w-2 h-2" />{getShiftHistory(s.id).length}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                    <ArrowRight className="absolute bottom-0.5 right-1 w-2 h-2 text-white/40 opacity-0 group-hover:opacity-100 transition-opacity active:opacity-90" />
                                    </div>
                                  </button>
                                );
                        };

                        return (
                          <td key={dateStr} className={`px-1.5 py-1.5 ${tdBorder} align-top md:px-1 md:py-1 h-px`} style={tdStyle}>
                            <div className="flex h-full flex-col">
                              {before16.length > 0 && (
                                <div className="flex flex-col gap-1 md:gap-0.5">
                                  {before16.map((s) => renderShiftButton(s))}
                                </div>
                              )}
                              {from16.length > 0 && (
                                <div className={`flex flex-col gap-1 md:gap-0.5 ${before16.length > 0 ? 'mt-1.5 md:mt-1' : 'mt-auto'}`}>
                                  {from16.map((s) => renderShiftButton(s))}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}

                      {/* Totale settimana */}
                      <td className="px-3 py-2 text-center border-l-2 border-l-white/15 md:px-2 md:py-1.5" style={{ background: userIdx % 2 === 0 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.14)' }}>
                        <div className="flex flex-col items-center gap-2">
                          <div className="text-xs font-semibold text-white/55 md:text-[11px]">
                            {showFullTimesheetGrid || plannedOnlyTimesheetGrid
                              ? formatMinutesToHoursAndMinutes(totals?.plannedMins ?? 0)
                              : t.ts_times_masked_hm}
                          </div>
                          {showFullTimesheetGrid && (totals?.actualMins ?? 0) > 0 && (
                            <>
                              <div className="text-sm font-bold text-white md:text-xs">
                                {formatMinutesToHoursAndMinutes(totals?.actualMins ?? 0)}
                              </div>
                              <div className={`text-[11px] font-semibold ${(totals?.deltaMins ?? 0) >= 0 ? 'text-accent' : 'text-red-400'} md:text-[11px]`}>
                                {(totals?.deltaMins ?? 0) >= 0 ? '+' : ''}
                                {fmtHM(totals?.deltaMins ?? 0)}
                              </div>
                            </>
                          )}
                          {plannedOnlyTimesheetGrid && (totals?.frozenOfficialMins ?? 0) > 0 && (
                            <div
                              className="text-sm font-bold text-white md:text-xs"
                              title={t.ts_kpi_frozen_official}
                            >
                              {formatMinutesToHoursAndMinutes(totals?.frozenOfficialMins ?? 0)}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {/* Empty state — nessun dipendente */}
                {visibleUsers.length === 0 && (
                  <tr>
                    <td colSpan={weekDays.length + 2} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-white/30" />
                        </div>
                        <p className="text-white/70 font-semibold text-sm">{t.ts_no_data}</p>
                        <p className="text-white/50 text-xs">{t.ts_no_employees_this_week}</p>
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
                        <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                          <Calendar className="w-6 h-6 text-white/30" />
                        </div>
                        <p className="text-white/70 font-semibold text-sm">{t.ts_no_shifts_this_week}</p>
                        <p className="text-white/50 text-xs">{t.ts_no_shifts_description}</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Footer totali */}
              {canTeamTimesheetOps && (
                <tfoot>
                  <tr className="bg-brand-mid/5 border-t-2 border-brand-mid/35">
                    <td className="sticky left-0 pl-4 pr-3 py-3 text-accent font-bold text-xs uppercase border-r-2 border-r-white/15 z-10 md:py-2 md:pl-3 md:pr-2 md:text-[11px]" style={{ background: 'transparent' }}>
                      {t.stats_total}
                    </td>
                    {weekDays.map((day, dayIdx) => {
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const planned = visibleUsers.reduce((s, u) => s + (timesheetData[u.id]?.[dateStr]?.totalPlannedMins ?? 0), 0);
                      const actual = visibleUsers.reduce((s, u) => s + (timesheetData[u.id]?.[dateStr]?.totalActualMins ?? 0), 0);
                      const frozenCol = visibleUsers.reduce(
                        (s, u) => s + (timesheetData[u.id]?.[dateStr]?.totalFrozenOfficialMins ?? 0),
                        0
                      );
                      const inP = viewMode === 'month' ? isDayInConfiguredPeriod(day) : true;
                      const isPayrollDay = dateStr === weekViewPayrollDayStr;
                      const payrollHighlight = isPayrollDay && (viewMode === 'week' || inP);
                      const weekEndCol = viewMode === 'month' && (dayIdx + 1) % 7 === 0;
                      const tdBorder = weekEndCol ? 'border-r-[3px] border-r-white/40' : 'border-r-2';
                      const tdMuted = viewMode === 'month' && !inP;
                      const tdBgStyle: React.CSSProperties = payrollHighlight
                        ? { background: 'rgba(51,102,204,0.12)' }
                        : tdMuted
                          ? { background: 'transparent', opacity: 0.35 }
                          : {};
                      return (
                        <td key={dateStr} className={`px-2 py-3 text-center ${tdBorder} text-xs md:px-1.5 md:py-2 md:text-[11px]`} style={tdBgStyle}>
                          {planned > 0 ? (
                            <>
                              <div className={tdMuted ? 'text-white/30' : 'text-white/55'}>
                                {formatMinutesToHoursAndMinutes(planned)}
                              </div>
                              {showFullTimesheetGrid && actual > 0 && (
                                <div className={`font-semibold ${tdMuted ? 'text-white/40' : 'text-white'}`}>
                                  {formatMinutesToHoursAndMinutes(actual)}
                                </div>
                              )}
                              {plannedOnlyTimesheetGrid && frozenCol > 0 && (
                                <div
                                  className={`font-semibold ${tdMuted ? 'text-white/60' : 'text-white/90'}`}
                                  title={t.ts_kpi_frozen_official}
                                >
                                  {formatMinutesToHoursAndMinutes(frozenCol)}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className={tdMuted ? 'text-slate-300' : 'text-slate-300'}>–</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3 text-center bg-white/5 border-l-[3px] border-l-white/30 md:px-2 md:py-2">
                      <div className="text-xs text-white/60 md:text-[11px]">
                        {formatMinutesToHoursAndMinutes(visibleUsers.reduce((s, u) => s + (userTotals[u.id]?.plannedMins ?? 0), 0))}
                      </div>
                      {showFullTimesheetGrid && (
                        <div className="text-xs font-bold text-white md:text-[11px]">
                          {(() => {
                            const act = visibleUsers.reduce((s, u) => s + (userTotals[u.id]?.actualMins ?? 0), 0);
                            return act > 0 ? formatMinutesToHoursAndMinutes(act) : '';
                          })()}
                        </div>
                      )}
                      {plannedOnlyTimesheetGrid &&
                        (() => {
                          const gf = visibleUsers.reduce((s, u) => s + (userTotals[u.id]?.frozenOfficialMins ?? 0), 0);
                          return gf > 0 ? (
                            <div
                              className="text-xs font-bold text-white md:text-[11px]"
                              title={t.ts_kpi_frozen_official}
                            >
                              {formatMinutesToHoursAndMinutes(gf)}
                            </div>
                          ) : null;
                        })()}
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
            <div className="mt-4 rounded-2xl border border-slate-100 bg-transparent p-5 shadow-none">
              <p className="text-xs uppercase tracking-wider text-white/50 mb-3 font-semibold">
                {t.timesheet_my_week}
              </p>
              {(() => {
                const myTot = userTotals[currentUser.id];
                const frozenM = myTot?.frozenOfficialMins ?? 0;
                const gridCols = showFullTimesheetGrid
                  ? 'grid-cols-3'
                  : plannedOnlyTimesheetGrid && frozenM > 0
                    ? 'grid-cols-2'
                    : 'grid-cols-1 sm:grid-cols-1';
                const kpiItems = showFullTimesheetGrid
                  ? [
                      {
                        label: t.ts_kpi_planned,
                        val: formatMinutesToHoursAndMinutes(myTot?.plannedMins ?? 0),
                        color: 'text-white/90',
                      },
                      {
                        label: t.ts_kpi_punched,
                        val:
                          (myTot?.actualMins ?? 0) > 0
                            ? formatMinutesToHoursAndMinutes(myTot?.actualMins ?? 0)
                            : '–',
                        color: 'text-white/90',
                      },
                      {
                        label: t.ts_kpi_delta,
                        val: `${(myTot?.deltaMins ?? 0) >= 0 ? '+' : ''}${fmtHM(myTot?.deltaMins ?? 0)}`,
                        color: (myTot?.deltaMins ?? 0) >= 0 ? 'text-brand-mid' : 'text-red-500',
                      },
                    ]
                  : plannedOnlyTimesheetGrid && frozenM > 0
                    ? [
                        {
                          label: t.ts_kpi_planned,
                          val: formatMinutesToHoursAndMinutes(myTot?.plannedMins ?? 0),
                          color: 'text-white/90',
                        },
                        {
                          label: t.ts_kpi_frozen_official,
                          val: formatMinutesToHoursAndMinutes(frozenM),
                          color: 'text-white/90',
                        },
                      ]
                    : [
                        {
                          label: t.ts_kpi_planned,
                          val: formatMinutesToHoursAndMinutes(myTot?.plannedMins ?? 0),
                          color: 'text-white/90',
                        },
                      ];
                return (
                  <div className={`grid gap-4 ${gridCols}`}>
                    {kpiItems.map(({ label, val, color }) => (
                      <div key={label}>
                        <p className="text-[11px] text-white/50 uppercase tracking-wide mb-1">{label}</p>
                        <p className={`text-2xl font-bold ${color}`}>{val}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

        </motion.div>
        )} {/* end tsView === 'grid' */}
      </div>

      {/* ── Popup centrato: dettaglio turno (stesso schema del tabellone) ── */}
      {isUiWidgetVisible(currentUser, 'timesheet.punch_modal') && (
        <TimesheetDayDrawer
          ctx={{
            currentUser,
            drawerData,
            drawerReviewQueue,
            drawerSessionId,
            drawerJustOpened,
            manualPunchIn,
            manualPunchOut,
            manualPunchSaving,
            drawerManualPunchFormExpanded,
            showCloseConfirm,
            drawerShiftEditsExpanded,
            reviewQueueSaving,
            markAbsentSaving,
            deductBreakSaving,
            shifts,
            users,
            breakRules,
            breakComputeOpts,
            canTimesheetApprove,
            canTeamTimesheetOps,
            effectiveLanguage,
            locale,
            featureFlags,
            t,
            tv,
            setManualPunchIn,
            setManualPunchOut,
            setDrawerManualPunchFormExpanded,
            setShowCloseConfirm,
            setDrawerShiftEditsExpanded,
            setMarkAbsentSaving,
            closeTimesheetShiftDrawer,
            handleDrawerSaveTimbratures,
            handleSavePunchIn,
            handleDrawerDeductBreakChange: (v: boolean) => handleDrawerDeductBreakChange(drawerData?.shift.id ?? '', v),
            handleDrawerAutoBreakChange: (v: boolean) => handleDrawerAutoBreakChange(drawerData?.shift.id ?? '', v),
            handleDrawerDeductRuleExclusionChange: (ruleId: string, exclude: boolean) => handleDrawerDeductRuleExclusionChange(drawerData?.shift.id ?? '', ruleId, exclude),
            handleDrawerReviewNavigate,
            advanceDrawerReviewAfterStep,
            pushTsUndo,
            globalPinSessionId,
            timesheetShiftDetailPanelRef,
            todayStr,
            handleDrawerMarkAbsent: async () => {
              if (!drawerData) return;
              if (!window.confirm(t.shift_mark_absent_confirm)) return;
              setMarkAbsentSaving(true);
              try {
                const shiftRow = drawerData.shift;
                await updateShift(shiftRow.id, { approval_status: 'absent' });
                showSuccess?.(t.shift_marked_absent_toast);
                closeTimesheetShiftDrawer();
              } catch {
                showError?.(t.save_error);
              } finally { setMarkAbsentSaving(false); }
            },
            handleDrawerFreeze: async () => {
              if (!drawerData) return;
              const shiftRow = drawerData.shift;
              if (shiftRow.status === 'approved') return;
              try {
                setApprovingShiftId(shiftRow.id);
                await approveShift(shiftRow.id);
                showSuccess?.(t.ts_toast_shift_updated);
                closeTimesheetShiftDrawer();
              } catch {
                showError?.(t.ts_toast_approve_freeze_error);
              } finally { setApprovingShiftId(null); }
            },
            handleDrawerUnfreeze: async () => {
              if (!drawerData || !currentUser) return;
              try {
                await applyPayrollUnlock(drawerData.shift.id, currentUser);
                showSuccess?.(t.ts_toast_shift_updated);
              } catch {
                showError?.(t.save_error);
              }
            },
            clockOutTime: '',
            closingLoading: false,
            approvingShiftId: null,
            setClockOutTime: (_v: string) => {},
            setClosingShift: (_v: any) => {},
            handleSaveAndFreeze: async () => {
              if (!drawerData) return;
              const ok = await handleDrawerSaveTimbratures({ silentToast: true });
              if (!ok) return;
              const shiftRow = drawerData.shift;
              if (shiftRow.status !== 'approved') {
                try {
                  await approveShift(shiftRow.id);
                } catch {
                  showError?.(t.ts_toast_approve_freeze_error);
                  return;
                }
              }
              closeTimesheetShiftDrawer();
            },
          }}
          updateShift={updateShift}
        />
    )}

      {/* ── Popup riepilogo approvazione settimana ── */}
      <CenteredModalPortal
        open={!!approveWeekSummary}
        onClose={() => setApproveWeekSummary(null)}
        maxWidthClass="max-w-[380px]"
        panelClassName={`rounded-[40px] overflow-hidden !bg-brand-electric/5 !border-brand-electric/18 ${
          approveWeekSummary?.approvedIds ? 'ring-1 ring-inset ring-emerald-500/25' : ''
        }`}
        ariaLabel="Riepilogo approvazione settimana"
      >
        {approveWeekSummary && (() => {
          const isDone = !!approveWeekSummary.approvedIds;
          return (
          <div className="p-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
 isDone ? 'bg-emerald-500/20 ring-1 ring-emerald-400/30' : 'bg-brand-electric/12'
 }`}
              >
                {isDone
                  ? <Check className="h-5 w-5 text-emerald-400" strokeWidth={2.5} />
                  : <Lock className="h-5 w-5 text-brand-electric" />
                }
              </div>
              <div>
                <h3 className="font-bold text-base text-white">
                  {isDone ? 'Approvazione Completata' : 'Approvazione Settimanale'}
                </h3>
                <p
                  className={`text-sm ${isDone ? 'text-emerald-200/90' : 'text-white/60'}`}
                >
                  {approveWeekSummary.employeeName} · {approveWeekSummary.shiftIds.length} turni
                </p>
              </div>
            </div>

            {/* Lista turni */}
            <div
              className={`mb-4 max-h-[260px] overflow-y-auto rounded-xl border divide-y ${
 isDone
 ? 'border-emerald-500/25 divide-emerald-500/15'
 : 'border-brand-electric/18 divide-brand-electric/10'
 }`}
            >
              {approveWeekSummary.previewRows.map((row, i) => {
                const approved = isDone;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-2.5 transition-colors ${
 approved ? 'bg-emerald-500/10' : 'bg-brand-electric/4'
 }`}
                  >
                    <span className={`text-sm font-medium capitalize ${isDone ? 'text-white/90' : 'text-white/80'}`}>
                      {row.employeeLabel ? (
                        <span className="block text-left">
                          <span
                            className={`block text-[11px] font-semibold uppercase tracking-wide ${
 isDone ? 'text-white/50' : 'text-white/60'
 }`}
                          >
                            {row.employeeLabel}
                          </span>
                          {safeFormatDate(row.dateStr, 'EEE d MMM', { locale })}
                        </span>
                      ) : (
                        safeFormatDate(row.dateStr, 'EEE d MMM', { locale })
                      )}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums text-white">
                        {row.planned}
                      </span>
                      {approved && (
                        <Check className="h-4 w-4 text-emerald-400 shrink-0" strokeWidth={2.5} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottoni */}
            {isDone ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={undoApprovalBusy}
                  onClick={() => {
                    const ids = approveWeekSummary.approvedIds ?? [];
                    void (async () => {
                      setUndoApprovalBusy(true);
                      try {
                        for (const id of ids) {
                          await updateShift(id, { approval_status: 'confirmed' });
                        }
                        showSuccess?.('Approvazione annullata.');
                        setApproveWeekSummary(null);
                      } catch {
                        showError?.(t.save_error);
                      } finally {
                        setUndoApprovalBusy(false);
                      }
                    })();
                  }}
                  className="flex-1 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-200 shadow-sm transition-colors hover:bg-red-500/20 disabled:opacity-50 active:bg-red-500/80"
                >
                  {undoApprovalBusy ? '...' : 'Ripristina'}
                </button>
                <button
                  type="button"
                  disabled={undoApprovalBusy}
                  onClick={() => setApproveWeekSummary(null)}
                  className="flex-1 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-bold text-white/95 shadow-sm transition-colors hover:bg-white/15 disabled:opacity-50 active:bg-white/80"
                >
                  Chiudi
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setApproveWeekSummary(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-white/20 bg-white/10 text-white/80 text-sm font-semibold hover:bg-white/15 transition-colors active:bg-white/80"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const data = approveWeekSummary;
                    setApproveWeekSummary(null);
                    setPinGateModal({
                      shiftId: 'batch_week_approve',
                      mode: 'batch_week_approve',
                      batchData: {
                        shiftIds: data.shiftIds,
                        employeeName: data.employeeName,
                        previewRows: data.previewRows,
                      },
                    });
                    setPinGatePin('');
                    setPinGateError('');
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold shadow-lg shadow-accent/20 transition-colors flex items-center justify-center gap-1.5 active:bg-accent-hover/80"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Approva
                </button>
              </div>
            )}
          </div>
          );
        })()}
      </CenteredModalPortal>

      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {!!pinGateModal && (
            <PinPadModal
              title={
                pinGateModal.mode === 'unlock_frozen'
                  ? t.ts_btn_unlock_to_edit
                  : pinGateModal.mode === 'unlock_shift_edits'
                    ? t.ts_drawer_shift_edits
                    : pinGateModal.mode === 'delete_punches'
                      ? t.ts_delete_punches_pin_title
                      : pinGateModal.mode === 'enable_planned_times_edit'
                        ? t.ts_drawer_edit_planned_times_pin_title
                        : pinGateModal.mode === 'batch_week_approve'
                          ? 'Approvazione Settimanale'
                          : t.ts_drawer_manual_punches_title
              }
              subtitle={t.ts_enter_manager_pin}
              pinLabel={t.ts_enter_manager_pin}
              pin={pinGatePin}
              onPinChange={(v) => { setPinGatePin(v); setPinGateError(''); }}
              onConfirm={() => void submitTimbraturePinGate(pinGatePin)}
              onCancel={() => {
                if (pinGateUnlocking) return;
                setPinGateModal(null);
                setPinGatePin('');
                setPinGateError('');
              }}
              error={pinGateError || undefined}
              isLoading={pinGateUnlocking}
              confirmLabel={t.confirm ?? 'Conferma'}
              cancelLabel={t.cancel ?? 'Annulla'}
              userId={currentUser?.id}
              userDisplayName={[currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ')}
              userEmail={currentUser?.email ?? ''}
              onBiometricSuccess={() => {
                const verifier = findFreezeVerifierById(users, currentUser?.id ?? '');
                if (!verifier) { setPinGateError(t.wst_freeze_pin_invalid); return; }
                void submitTimbraturePinGate(verifier);
              }}
            />
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Modal chiusura manuale turno sera ────────────────────────── */}
      <AnimatePresence>
        {closingShift && (() => {
          const [h, m] = clockOutTime ? clockOutTime.split(':').map(Number) : [0, 0];
          const outTime = clockOutTime ? `${String(h ?? 0).padStart(2,'0')}:${String(m ?? 0).padStart(2,'0')}` : '';
          const shiftObjRaw = shifts.find((s) => s.id === closingShift.shiftId);
          const shiftObj = shiftObjRaw ? mergeShiftDeductExclusionsFromLocal(shiftObjRaw) : undefined;
          const userObj = shiftObj ? users.find((u) => u.id === shiftObj.user_id) : undefined;
          const previewMins = outTime && shiftObj && userObj
            ? getNetShiftMinutes(shiftObj, closingShift.actualStart, outTime, userObj, breakRules, breakComputeOpts)
            : 0;
          const clockOutComplete = /^\d{2}:\d{2}$/.test((clockOutTime || '').trim());
          const showHoursPreview = clockOutComplete && !!shiftObj && !!userObj;
          const previewDelta = previewMins - closingShift.plannedMins;
          const previewDeltaColor = previewDelta > 5 ? 'text-brand-mid' : previewDelta < -5 ? 'text-red-500' : 'text-white/60';

          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
              onClick={(e) => { if (e.target === e.currentTarget) { setClosingShift(null); setClockOutTime(''); } }}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="modal-glass-panel w-full max-w-sm rounded-2xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-white text-base flex items-center gap-2">
                      <LogOut className="w-4 h-4 text-amber-500" />
                      {t.ts_modal_close_shift_title}
                    </h3>
                    <p className="text-sm text-white/60 mt-0.5">
                      {closingShift.employeeName} · {safeFormatDate(closingShift.dateStr, 'd MMM', { locale })}
                    </p>
                  </div>
                  <button type="button" onClick={() => { setClosingShift(null); setClockOutTime(''); }}
                    className="p-1.5 rounded-xl hover:bg-white/10 transition-colors active:bg-white/80">
                    <X className="w-4 h-4 text-white/60" />
                  </button>
                </div>

                <div className="bg-white/8 rounded-xl px-3 py-2.5 mb-4 flex items-center justify-between text-sm">
                  <span className="text-white/60">{t.ts_modal_entry_registered}</span>
                  <span className="font-bold text-white/90">{closingShift.actualStart}</span>
                </div>

                <div className="mb-4">
                  <label className="block text-xs font-semibold text-white/70 mb-1.5 uppercase tracking-wide">{t.ts_label_exit_time}</label>
                  <TimeInputField
                    size="hero"
                    value={clockOutTime}
                    onChange={setClockOutTime}
                    aria-label={t.ts_label_exit_time}
                    className="w-full"
                    autoFocus
                  />
                  <p className="text-[11px] text-white/50 mt-1 text-center">
                    {t.ts_label_planned}: {closingShift.plannedStart}–{closingShift.plannedEnd}
                  </p>
                </div>

                {showHoursPreview && (
                  <div className="bg-white/8 rounded-xl p-3 mb-4">
                    <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide mb-2">{t.ts_modal_hours_preview}</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[11px] text-white/50">{t.ts_kpi_planned}</p>
                        <p className="font-bold text-white/80 text-sm">{fmtHM(closingShift.plannedMins)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-white/50">{t.ts_kpi_actual}</p>
                        <p className="font-bold text-white/90 text-sm">{fmtHM(previewMins)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-white/50">{t.ts_kpi_delta}</p>
                        <p className={`font-bold text-sm ${previewDeltaColor}`}>{previewDelta >= 0 ? '+' : ''}{fmtHM(previewDelta)}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button type="button" onClick={() => { setClosingShift(null); setClockOutTime(''); }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-white/70 text-sm font-medium transition-colors hover:bg-white/10 active:bg-white/80" style={{ border: '1px solid rgba(255,255,255,0.22)' }}>
                    {t.cancel}
                  </button>
                  <button type="button" disabled={!clockOutTime || closingLoading} onClick={handleConfirmClose}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors active:bg-accent-hover/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">
                    {closingLoading ? t.ts_saving : <><LogOut className="w-3.5 h-3.5" />{t.ts_btn_register_exit}</>}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* ── Modal conferma congelo: portal su body così sta sopra CenteredModalPortal (z-10050); #root ha stacking separato. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {approvalConfirm && (() => {
              const ac = approvalConfirm;
              return (
                <PinPadModal
                  title={t.sync_lock_title}
                  subtitle={t.ts_enter_manager_pin}
                  pinLabel={t.ts_approval_pin_label}
                  pin={approvalPin}
                  onPinChange={(p) => (setApprovalPin(p), setApprovalPinError(''))}
                  onConfirm={async () => {
                    const verifier = findFreezeVerifierByPin(users, approvalPin);
                    if (!verifier) {
                      setApprovalPinError(t.ts_approval_pin_invalid);
                      setApprovalPin('');
                      return;
                    }
                    setApprovalConfirm(null);
                    await handleApproveShift(ac.shiftId, verifier, {
                      afterSuccess:
                        ac.afterFreeze === 'advance_review' ? 'advance_review' : 'close_drawer',
                    });
                  }}
                  onCancel={() => {
                    setApprovalConfirm(null);
                    setApprovalPin('');
                    setApprovalPinError('');
                  }}
                  error={approvalPinError}
                  isLoading={approvingShiftId === ac.shiftId}
                  confirmLabel={t.ts_btn_yes_approve_freeze}
                  cancelLabel={t.cancel}
                  userId={currentUser?.id}
                  userDisplayName={[currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ')}
                  userEmail={currentUser?.email ?? ''}
                  onBiometricSuccess={async () => {
                    const verifier = findFreezeVerifierById(users, currentUser?.id ?? '');
                    if (!verifier) { setApprovalPinError(t.ts_approval_pin_invalid); return; }
                    setApprovalConfirm(null);
                    await handleApproveShift(ac.shiftId, verifier, {
                      afterSuccess: ac.afterFreeze === 'advance_review' ? 'advance_review' : 'close_drawer',
                    });
                  }}
                />
              );
            })()}
            {employeeWeekFreezeBatch && (() => {
              const tv = t as Record<string, string>;
              return (
                <PinPadModal
                  title={t.sync_lock_title}
                  subtitle={tv.ts_employee_week_freeze_batch_title ?? 'Congela turni revisionati'}
                  pinLabel={t.ts_approval_pin_label}
                  pin={approvalPin}
                  onPinChange={(p) => (setApprovalPin(p), setApprovalPinError(''))}
                  onConfirm={async () => {
                    const verifier = findFreezeVerifierByPin(users, approvalPin);
                    if (!verifier) { setApprovalPinError(t.ts_approval_pin_invalid); setApprovalPin(''); return; }
                    void runEmployeeWeekBatchFreeze(verifier);
                  }}
                  onCancel={() => {
                    setEmployeeWeekFreezeBatch(null);
                    setApprovalPin('');
                    setApprovalPinError('');
                    showSuccess?.(
                      tv.ts_employee_week_review_skipped_freeze ??
                        'Revisione completata senza congelare i turni.'
                    );
                  }}
                  error={approvalPinError}
                  isLoading={employeeWeekFreezeBusy}
                  confirmLabel={tv.ts_employee_week_freeze_batch_cta ?? t.ts_btn_yes_approve_freeze}
                  cancelLabel={t.cancel}
                  userId={currentUser?.id}
                  userDisplayName={[currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ')}
                  userEmail={currentUser?.email ?? ''}
                  onBiometricSuccess={() => {
                    const verifier = findFreezeVerifierById(users, currentUser?.id ?? '');
                    if (!verifier) { setApprovalPinError(t.ts_approval_pin_invalid); return; }
                    void runEmployeeWeekBatchFreeze(verifier);
                  }}
                />
              );
            })()}
          </AnimatePresence>,
          document.body
        )}

      {/* ── PIN Gate Modal per unlock_shift_edits e altre operazioni ── */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {pinGateModal && (() => {
              const pgm = pinGateModal;
              void pgm;
              return (
                <PinPadModal
                  title={t.sync_lock_title}
                  subtitle={t.ts_enter_manager_pin}
                  pinLabel={t.ts_approval_pin_label}
                  pin={pinGatePin}
                  onPinChange={(p) => (setPinGatePin(p), setPinGateError(''))}
                  onConfirm={() => void submitTimbraturePinGate(pinGatePin)}
                  onCancel={() => {
                    setPinGateModal(null);
                    setPinGatePin('');
                    setPinGateError('');
                  }}
                  error={pinGateError}
                  isLoading={pinGateUnlocking}
                  confirmLabel={t.ts_btn_confirm}
                  cancelLabel={t.cancel}
                  userId={currentUser?.id}
                  userDisplayName={[currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ')}
                  userEmail={currentUser?.email ?? ''}
                  onBiometricSuccess={() => {
                    const verifier = findFreezeVerifierById(users, currentUser?.id ?? '');
                    if (!verifier) { setPinGateError(t.wst_freeze_pin_invalid); return; }
                    void submitTimbraturePinGate(verifier);
                  }}
                />
              );
            })()}
          </AnimatePresence>,
          document.body
        )}

    </>
  );
}
 
