import { useState, useCallback, useRef, useEffect, useMemo, useLayoutEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays, AlertTriangle, Check, Lock, Plus, Clock,
  ChevronLeft, ChevronRight, Copy, Send, Filter, FileDown,
  Trash2, Save, X, ChevronDown, Unlock, Menu, ChevronUp, Pencil,
  History,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { CenteredModalPortal } from './ui/CenteredModalPortal';
import type { Shift, PunchRecord, User, ShiftAuditEntry } from '../types';
// import type { BreakRule } from '../utils/breakRules';
import {
  format, addDays, startOfWeek, endOfWeek, eachDayOfInterval, isToday, parseISO,
} from 'date-fns';
import type { Locale } from 'date-fns';
import { it } from 'date-fns/locale';
import { getTranslations, getDateLocale, getIntlLocale } from '../utils/translations';
import { translateDepartmentValue } from '../utils/departmentLabels';
import { formatMinutesToHoursAndMinutes, calculateShiftMinutesGross, getBreakLabels, hasShiftConflictSameDay } from '../utils/timeCalculations';
import { getBreakMinutesForShift, DEFAULT_AUTO_BREAK_MINUTES, AUTO_BREAK_THRESHOLD_MINUTES } from '../utils/breakRules';
import { shiftPastPlannedEndWithoutClockIn, punchTimeHHMM, getResolvedStartEndForHours } from '../utils/shiftResolvedClockTimes';
import { exportSchedulePDF } from '../utils/exportSchedulePDF';
import { TimeInputField } from './ui/TimeInputField';
import { ShiftSlotPresetsSection } from './shifts/ShiftSlotPresetsSection';
import { database } from '../lib/database';
import { useAppUser, useAppData, useAppConfig, useAppOverlay, authorizeFrozenDelete } from '../context/AppContext';
import { isManagementRole, canEditTeamShifts, canPublishScheduleDrafts, canApproveShiftActions, findFreezeVerifierByPin, findFreezeVerifierById, isUserVisibleOnTeamSchedule, isAdminOnly } from '../utils/permissions';
import { getShiftViolations, DEFAULT_WORK_RULES } from '../utils/workRules';
import { isShiftPayrollFrozen } from '../utils/timesheetFreezeCriteria';
import { logShiftAudit, formatAuditDate } from '../utils/shiftAuditLog';
import { PinPadModal } from './ui/PinPadModal';
import {
  loadPeriodConfig, savePeriodConfig, getPeriodStartDate, getPeriodEndDate,
  nextPeriodConfig, prevPeriodConfig, periodConfigForMonth,
  type PeriodConfig,
} from '../utils/periodConfig';
import {
  getShiftSlotFromStartTime,
  getShiftTypeFromStartTime,
  loadShiftSlotPresets,
} from '../utils/shiftSlotPresets';

export type GridMode = 'planning' | 'realtime';
type ViewMode = 'week' | 'period';

interface DayShiftGroup {
  shift: Shift;
  punchIn?: PunchRecord;
  punchOut?: PunchRecord;
  actualMinutes: number;
  deltaMinutes: number;
  isAbsent: boolean;
  isMissingPunch: boolean;
  breakMinutes: number;
  actualBreakMinutes: number;
  netMinutes: number;
  violations?: ReturnType<typeof getShiftViolations>;
}

function isFrozen(shift: Shift) {
    return (shift as any).approval_status === 'frozen';
  }

function splitDayGroupsBySlot(groups: DayShiftGroup[]) {
  const lunchGroups = groups.filter(g => getShiftSlotFromStartTime(g.shift.start_time ?? '10:00') === 'lunch');
  const eveningGroups = groups.filter(g => getShiftSlotFromStartTime(g.shift.start_time ?? '18:00') === 'evening');
  return {
    lunch: lunchGroups[0] ?? null,
    evening: eveningGroups[0] ?? null,
    extraLunchGroups: lunchGroups.slice(1),
    extraEveningGroups: eveningGroups.slice(1),
  };
}

/** Array condiviso immutabile per i giorni senza turni (evita allocazioni a ogni cella). */
const EMPTY_GROUPS: DayShiftGroup[] = [];

function isExtraShiftInDay(shift: Shift, dayShifts: Shift[]): boolean {
  const slot = getShiftSlotFromStartTime(shift.start_time ?? '10:00');
  const sameSlot = dayShifts
    .filter(s => getShiftSlotFromStartTime(s.start_time ?? '10:00') === slot)
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
  return sameSlot.length > 1 && sameSlot[0]?.id !== shift.id;
}

function formatShiftTimeRangeCompact(start?: string | null, end?: string | null): string {
  const fmt = (raw?: string | null) => {
    const t = (raw || '').slice(0, 5);
    if (!t) return '?';
    const [h, m] = t.split(':');
    return m === '00' ? h : t;
  };
  return `${fmt(start)}-${fmt(end)}`;
}

function formatShiftTimeRangeFull(start?: string | null, end?: string | null): string {
  const s = (start || '').slice(0, 5) || '--';
  const e = (end || '').slice(0, 5) || '--';
  return `${s}-${e}`;
}

type ShiftCellDisplay = {
  main: string;
  title?: string;
  breakSuffix?: string;
  missingOut?: boolean;
};

function getShiftCellDisplay(
  g: DayShiftGroup,
  mode: GridMode,
  punchRecords: PunchRecord[],
  compact = false,
): ShiftCellDisplay {
  const planned = formatShiftTimeRangeFull(g.shift.start_time, g.shift.end_time);
  const breakSuffix = g.breakMinutes > 0 ? `−${g.breakMinutes}m` : undefined;
  const actualBreakSuffix = g.actualBreakMinutes > 0 ? `−${g.actualBreakMinutes}m` : undefined;
  if (g.isAbsent) return { main: 'Assente', breakSuffix };

  if (mode === 'planning') {
    return {
      main: compact ? formatShiftTimeRangeCompact(g.shift.start_time, g.shift.end_time) : planned,
      breakSuffix,
    };
  }

  const shift = g.shift;
  const approvedStart = shift.approved_start_time?.slice(0, 5);
  const approvedEnd = shift.approved_end_time?.slice(0, 5);
  if (shift.approved_at && approvedStart && approvedEnd) {
    return {
      main: compact
        ? formatShiftTimeRangeCompact(approvedStart, approvedEnd)
        : formatShiftTimeRangeFull(approvedStart, approvedEnd),
      title: `Pianificato: ${planned}`,
      breakSuffix: actualBreakSuffix,
    };
  }

  const inT = g.punchIn ? punchTimeHHMM(g.punchIn.calculated_time || g.punchIn.timestamp) ?? null : null;
  const outT = g.punchOut ? punchTimeHHMM(g.punchOut.calculated_time || g.punchOut.timestamp) ?? null : null;

  if (inT && outT) {
    const mainFull = `${inT}-${outT}`;
    return {
      main: compact ? formatShiftTimeRangeCompact(inT, outT) : mainFull,
      title: mainFull !== planned ? `Pianificato: ${planned}` : undefined,
      breakSuffix: actualBreakSuffix,
    };
  }

  if (inT) {
    return {
      main: `${inT}→`,
      title: `Pianificato: ${planned}`,
      missingOut: true,
      breakSuffix,
    };
  }

  if (g.isMissingPunch) {
    return {
      main: compact ? formatShiftTimeRangeCompact(shift.start_time, shift.end_time) : planned,
      title: 'Timbratura mancante',
      breakSuffix,
    };
  }

  const { start, end } = getResolvedStartEndForHours(shift, punchRecords);
  return {
    main: compact ? formatShiftTimeRangeCompact(start, end) : formatShiftTimeRangeFull(start, end),
    breakSuffix,
  };
}
type ShiftDetailTab = 'details' | 'punches' | 'history' | 'breaks';

function useT() {
  const { effectiveLanguage } = useAppUser();
  // useMemo: getTranslations restituisce lo stesso oggetto per lingua, ma questo
  // rende esplicita la stabilità del riferimento passato ai figli memoizzati.
  return useMemo(() => getTranslations(effectiveLanguage), [effectiveLanguage]);
}

/* ── Righe/card memoizzate ──────────────────────────────────────────────────
 * La matrice utenti×giorni è estratta in componenti React.memo: si ri-renderizzano
 * SOLO quando cambiano le loro props. Prima era tutto nel componente padre:
 * ogni keystroke nel drawer di dettaglio (orari, timbrature) o nella modale di
 * creazione ri-renderizzava l'intera griglia (centinaia di celle JSX).
 */

type GridRenderHelpers = {
  renderGroupButton: (g: DayShiftGroup, layout: 'desktop' | 'mobile', compact?: boolean, extraGroups?: DayShiftGroup[]) => React.ReactNode;
};

const ShiftGridMobileCard = memo(function ShiftGridMobileCard({
  user, totals, isExpanded, hasShifts, weekDays, weekDateStrings, dayGroupsByUserDate,
  canEdit, dropTargetKey, t, locale,
  renderGroupButton,
  onToggleExpanded, onCreateShift, onDragOver, onDragLeave, onDrop,
}: ShiftGridMobileCardProps) {
  const { effectiveLanguage } = useAppUser();
  const totalNet = totals.planned;
  const totalActual = totals.actual;
  return (
    <div className="rounded-xl border border-neutral-500 overflow-hidden p-4 shadow-sm">
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onClick={() => onToggleExpanded(user.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpanded(user.id);
          }
        }}
        className="flex justify-between items-start mb-4 cursor-pointer select-none"
      >
        <div className="flex items-start gap-2 min-w-0">
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-white/40 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
            aria-hidden
          />
          <div className="min-w-0">
            <h4 className="font-bold text-lg text-white truncate">{user.first_name} {user.last_name?.[0] ?? ''}</h4>
            {user.department && (
              <p className="text-[0.6875rem] text-white/50 font-medium uppercase tracking-wider">{translateDepartmentValue(user.department ?? '', effectiveLanguage)}</p>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[0.625rem] font-bold text-white/40 uppercase tracking-tight">{t.total_hours ?? 'Ore'}</div>
          <div className="text-sm font-bold text-accent tabular-nums">
            {formatMinutesToHoursAndMinutes(totalActual)}
          </div>
          <div className={`text-[0.625rem] font-bold tabular-nums ${totalActual > totalNet ? 'text-accent' : 'text-emerald-400'}`}>
            {totalActual > totalNet ? '+' : ''}{formatMinutesToHoursAndMinutes(Math.abs(totalActual - totalNet))}
          </div>
        </div>
      </div>

      {isExpanded && (
      <div className="space-y-2">
        {!hasShifts ? (
          <div
            className={`py-4 text-center border-2 border-dashed border-white/10 rounded-xl ${dropTargetKey ===`${user.id}_empty` ? 'ring-2 ring-inset ring-amber-400/50' : ''}`}
            onDragOver={(e) => onDragOver(e, `${user.id}_empty`)}
            onDragLeave={onDragLeave}
            onDrop={(e) => { const firstDay = weekDateStrings[0]; if (firstDay) onDrop(e, user.id, firstDay); }}
          >
            <p className="text-xs text-white/50 italic">{t.no_shifts_this_week ?? 'Nessun turno'}</p>
          </div>
        ) : (
          weekDays.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const groups = dayGroupsByUserDate.get(`${user.id}|${dateStr}`) ?? EMPTY_GROUPS;
            if (groups.length === 0) return null;

            const todayDate = isToday(day);
            return (
              <div key={dateStr}
                className={`flex items-start gap-3 p-2.5 rounded-xl ${todayDate ? 'bg-accent/5 ring-1 ring-accent/20' : 'bg-white/[0.04]'} ${dropTargetKey ===`${user.id}_${dateStr}` ? 'ring-2 ring-inset ring-amber-400/50' : ''}`}
                onDragOver={(e) => onDragOver(e, `${user.id}_${dateStr}`)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, user.id, dateStr)}
              >
                <div className="w-10 shrink-0 text-center pt-0.5">
                  <div className={`text-[0.625rem] font-bold uppercase ${todayDate ? 'text-accent' : 'text-white/50'}`}>
                    {format(day, 'EEE', { locale })}
                  </div>
                  <div className={`text-sm font-bold ${todayDate ? 'text-accent' : 'text-white/70'}`}>
                    {format(day, 'd')}
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-1">
                  {(() => {
                    const { lunch, evening, extraLunchGroups, extraEveningGroups } = splitDayGroupsBySlot(groups);
                    const canAddSecond = canEdit && groups.length < 2;
                    return (
                      <>
                        <div className="min-h-[1.75rem]">
                          {lunch ? renderGroupButton(lunch, 'mobile', false, extraLunchGroups) : canAddSecond ? (
                            <button type="button" onClick={() => onCreateShift(user.id, dateStr, 'lunch')}
                              className="w-full rounded-lg border border-dashed border-white/15 py-1.5 text-[0.625rem] font-bold text-white/40 transition-colors hover:border-white/30 hover:text-white/70">
                              <Plus className="mb-0.5 inline-block h-3 w-3" /> {t.add_shift ?? 'Aggiungi'}
                            </button>
                          ) : null}
                        </div>
                        <div className="min-h-[1.75rem]">
                          {evening ? renderGroupButton(evening, 'mobile', false, extraEveningGroups) : canAddSecond ? (
                            <button type="button" onClick={() => onCreateShift(user.id, dateStr, 'evening')}
                              className="w-full rounded-lg border border-dashed border-white/15 py-1.5 text-[0.625rem] font-bold text-white/40 transition-colors hover:border-white/30 hover:text-white/70">
                              <Plus className="mb-0.5 inline-block h-3 w-3" /> {t.add_second_shift ?? '2° turno'}
                            </button>
                          ) : null}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            );
          })
        )}
      </div>
      )}
    </div>
  );
});

type ShiftGridMobileCardProps = {
  user: User;
  totals: { planned: number; actual: number };
  isExpanded: boolean;
  hasShifts: boolean;
  weekDays: Date[];
  weekDateStrings: string[];
  dayGroupsByUserDate: Map<string, DayShiftGroup[]>;
  canEdit: boolean;
  dropTargetKey: string | null;
  t: ReturnType<typeof getTranslations>;
  locale: Locale;
} & GridRenderHelpers & {
  onToggleExpanded: (userId: string) => void;
  onCreateShift: (userId: string, date: string, preferredSlot?: 'lunch' | 'evening') => void;
  onDragOver: (e: React.DragEvent, cellKey: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetUserId: string, targetDate: string, targetSlot?: 'lunch' | 'evening') => void;
};

const ShiftGridDesktopRow = memo(function ShiftGridDesktopRow({
  user, totals, weekDays, dayGroupsByUserDate,
  isPeriodView, compactGrid, canEdit, hScrolled, slotRowHeight, slotCellHeight,
  dropTargetKey, t,
  renderGroupButton,
  onCreateShift, onDragOver, onDragLeave, onDrop, onReviewClick,
}: ShiftGridDesktopRowProps) {
  const totalNet = totals.planned;
  const totalActual = totals.actual;
  return (
    <tr className="wst-employee-row">
      <td className={`sticky left-0 z-10 px-2 py-1.5 border-b border-r border-white/[0.06] cursor-pointer hover:bg-white/[0.08] transition-colors duration-200 ${hScrolled ? 'wst-col-scrolled' : ''}`}
        onClick={() => onReviewClick(user)}>
        <div className="flex items-center gap-1 min-w-0 ml-2">
          <span className="text-xs font-bold text-white truncate">{user.first_name} {user.last_name?.[0] ?? ''}</span>
        </div>
      </td>
      {weekDays.map((day, dIdx) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const groups = dayGroupsByUserDate.get(`${user.id}|${dateStr}`) ?? EMPTY_GROUPS;
        const _weekStripe = isPeriodView && Math.floor(dIdx / 7) % 2 === 1;
        const weekEnd = isPeriodView && day.getDay() === 0;
        return (
          <td key={dIdx}
            className={`px-1 py-0.5 align-top group min-w-0 border-b border-r border-white/[0.06] ${weekEnd ? 'border-r-2 border-r-white/15' : ''} ${isToday(day) ? '!border-b-white' : ''}`}
          >
            {groups.length === 0 ? (
              <div
                className={`flex items-center justify-center h-full ${dropTargetKey ===`${user.id}_${dateStr}_lunch` ? 'ring-2 ring-inset ring-amber-400/50 rounded' : ''}`}
                style={{ minHeight: slotCellHeight }}
                onDragOver={(e) => onDragOver(e, `${user.id}_${dateStr}_lunch`)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, user.id, dateStr, 'lunch')}
              >
                {canEdit ? (
                  <button type="button" onClick={() => onCreateShift(user.id, dateStr)}
                    className={`rounded-lg border border-dashed border-white flex items-center justify-center text-[0.625rem] font-bold transition-colors opacity-0 group-hover:opacity-100 text-white [color:#fff_!important] ${isPeriodView ? 'w-7 h-7' : 'px-3 py-2'}`}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <Plus className="h-3 w-3 inline-block" />{!isPeriodView && <span className="ml-1">{t.add_shift ?? 'Aggiungi'}</span>}
                  </button>
                ) : (
                  <span className="text-[0.625rem] text-white/20 font-medium">&mdash;</span>
                )}
              </div>
            ) : (
              (() => {
                const { lunch, evening, extraLunchGroups, extraEveningGroups } = splitDayGroupsBySlot(groups);
                const canAddSecond = canEdit && groups.length < 2;
                const emptySlot = (slot: 'lunch' | 'evening', label: string) => (
                  canAddSecond && !(slot === 'lunch' ? lunch : evening) ? (
                    <button type="button" onClick={() => onCreateShift(user.id, dateStr, slot)}
                      className={`w-full rounded-md border border-dashed border-white flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100 text-white [color:#fff_!important] ${isPeriodView ? '' : 'text-[0.625rem] font-bold'}`}
                      style={{ height: isPeriodView ? slotRowHeight - 2 : slotRowHeight }}
                      title={label}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <Plus className={`${isPeriodView ? 'h-3 w-3' : 'inline-block h-3 w-3 mr-0.5'}`} />
                      {!isPeriodView && label}
                    </button>
                  ) : (
                    <div style={{ height: isPeriodView ? slotRowHeight - 2 : slotRowHeight }} />
                  )
                );
                return (
                  <div className={`flex flex-col ${isPeriodView ? 'gap-px' : ''}`} style={{ height: slotCellHeight }}>
                    <div
                      className={`flex items-center flex-1 ${dropTargetKey ===`${user.id}_${dateStr}_lunch` ? 'ring-2 ring-inset ring-amber-400/50 rounded' : ''}`}
                      style={{ ...(isPeriodView ? {} : { borderBottom: '1px solid rgba(255,255,255,0.10)', paddingLeft: '1px', paddingRight: '1px' }) }}
                      onDragOver={(e) => onDragOver(e, `${user.id}_${dateStr}_lunch`)}
                      onDragLeave={onDragLeave}
                      onDrop={(e) => onDrop(e, user.id, dateStr, 'lunch')}
                    >
                      {lunch ? (
                        <div className="relative w-full min-w-0 overflow-visible">
                          {renderGroupButton(lunch, 'desktop', compactGrid, extraLunchGroups)}
                        </div>
                      ) : emptySlot('lunch', t.add_shift ?? 'Aggiungi')}
                    </div>
                    <div
                      className={`flex items-center flex-1 ${isPeriodView ? 'border-t border-white/[0.08]' : ''} ${dropTargetKey ===`${user.id}_${dateStr}_evening` ? 'ring-2 ring-inset ring-amber-400/50' : ''}`}
                      style={{ ...(isPeriodView ? {} : { paddingLeft: '1px', paddingRight: '1px' }) }}
                      onDragOver={(e) => onDragOver(e, `${user.id}_${dateStr}_evening`)}
                      onDragLeave={onDragLeave}
                      onDrop={(e) => onDrop(e, user.id, dateStr, 'evening')}
                    >
                      {evening ? (
                        <div className="relative w-full min-w-0 overflow-visible">
                          {renderGroupButton(evening, 'desktop', compactGrid, extraEveningGroups)}
                        </div>
                      ) : emptySlot('evening', t.add_second_shift ?? '2° turno')}
                    </div>
                  </div>
                );
              })()
            )}
          </td>
        );
      })}
      <td className={`px-1 py-1 text-center align-middle border-b border-white/[0.06] ${compactGrid ? 'text-[0.625rem]' : ''}`}>
        <div className={`${compactGrid ? 'text-[0.625rem]' : 'text-xs'} font-bold text-white tabular-nums`}>{formatMinutesToHoursAndMinutes(totalActual)}</div>
        <div className={`${compactGrid ? 'text-[0.5625rem]' : 'text-[0.625rem]'} font-bold tabular-nums ${totalActual > totalNet ? 'text-accent' : 'text-emerald-400'}`}>
          {totalActual > totalNet ? '+' : ''}{formatMinutesToHoursAndMinutes(Math.abs(totalActual - totalNet))}
        </div>
      </td>
    </tr>
  );
});

type ShiftGridDesktopRowProps = {
  user: User;
  totals: { planned: number; actual: number };
  weekDays: Date[];
  dayGroupsByUserDate: Map<string, DayShiftGroup[]>;
  isPeriodView: boolean;
  compactGrid: boolean;
  canEdit: boolean;
  hScrolled: boolean;
  slotRowHeight: number;
  slotCellHeight: number;
  dropTargetKey: string | null;
  t: ReturnType<typeof getTranslations>;
} & GridRenderHelpers & {
  onCreateShift: (userId: string, date: string, preferredSlot?: 'lunch' | 'evening') => void;
  onDragOver: (e: React.DragEvent, cellKey: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, targetUserId: string, targetDate: string, targetSlot?: 'lunch' | 'evening') => void;
  onReviewClick: (user: User) => void;
};

export default function UnifiedShiftGrid({ mode, onModeChange: _onModeChange, filterUserId }: { mode: GridMode; onModeChange: (m: GridMode) => void; filterUserId?: string }) {
  const t = useT();
  const { currentUser, users, effectiveLanguage, isSessionElevated, setIsSessionElevated: _setIsSessionElevated, globalPinSessionId, reorderUsers } = useAppUser();
  const sessionActive = isSessionElevated || !!globalPinSessionId;
  const {
    shifts: allShifts, punchRecords: allPunchRecords,
    deleteShift, bulkCopyPreviousWeek, publishWeekShifts,
    addPunchRecord, updatePunchRecord, addShift, updateShift,
  } = useAppData();
  const { breakRules, featureFlags } = useAppConfig();
  const { showSuccess, showError } = useAppOverlay();
  // Memoizzati: `today`/`locale` cambiavano riferimento a ogni render e invalidavano
  // tutte le useCallback che li citavano tra le dipendenze (→ funzioni ricreate
  // a ogni render → memo dei figli inutile).
  const locale = useMemo(() => getDateLocale(effectiveLanguage) ?? it, [effectiveLanguage]);
  const today = useMemo(() => new Date(), []);
  const canEdit = useMemo(
    () => currentUser ? canEditTeamShifts(currentUser) : false,
    [currentUser]
  );
  const _canPublish = currentUser ? canPublishScheduleDrafts(currentUser) : false;
  const _canApprove = useMemo(
    () => currentUser ? canApproveShiftActions(currentUser) : false,
    [currentUser]
  );
  const isMgmt = useMemo(
    () => currentUser ? isManagementRole(currentUser.role) : false,
    [currentUser?.role]
  );
  const canDeleteShift = useCallback((shift: Shift) => {
    if (!canEdit) return false;
    if (isMgmt || sessionActive) return true;
    return !isShiftPayrollFrozen(shift);
  }, [canEdit, isMgmt, sessionActive]);
  const effectiveWorkRules = DEFAULT_WORK_RULES;
  const violationChromeEnabled = featureFlags?.violation_rules !== false;

  /** DEBUG — conta turni totali caricati (solo quando cambia il dataset, non a ogni render) */
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log(`[🔄 Grid] totali allShifts: ${allShifts.length} | con tenant_id: ${allShifts.filter(s => (s as any).tenant_id).length}`);
    }
  }, [allShifts]);

  const gridRootRef = useRef<HTMLDivElement>(null);
  const contentAboveRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrolled, setTableScrolled] = useState(false);
  const [hScrolled, setHScrolled] = useState(false);
  const [tableMaxHeight, setTableMaxHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const root = gridRootRef.current;
    const above = contentAboveRef.current;
    if (!root || !above) return;
    const update = () => {
      const rootRect = root.getBoundingClientRect();
      const aboveRect = above.getBoundingClientRect();
      const usedAbove = aboveRect.bottom - rootRect.top;
      const bottomGap = 4;
      setTableMaxHeight(Math.max(200, window.innerHeight - rootRect.top - usedAbove - bottomGap));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  /** Scroll listener per rendere opaco l'header sticky quando la tabella scrolla */
  useLayoutEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;
    // Guardia: nessun re-render se lo stato non cambia davvero (lo scroll genera molti eventi).
    const onScroll = () => {
      const nextV = el.scrollTop > 0;
      setTableScrolled(prev => (prev === nextV ? prev : nextV));
      const nextH = el.scrollLeft > 0;
      setHScrolled(prev => (prev === nextH ? prev : nextH));
    };
    onScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  const [periodConfig, setPeriodConfigState] = useState<PeriodConfig>(() => loadPeriodConfig());
  const [periodNavOffset, setPeriodNavOffset] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today, { weekStartsOn: 1 }));

  /** Schede dipendenti a cassetto nella vista mobile (default: tutte chiuse, si aprono al tap). */
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(() => new Set());
  const toggleUserExpanded = useCallback((userId: string) => {
    setExpandedUserIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const effectivePeriod = periodNavOffset === 0 ? periodConfig
    : periodNavOffset > 0
      ? Array.from({ length: periodNavOffset }, () => null).reduce((p) => nextPeriodConfig(p), periodConfig)
      : Array.from({ length: -periodNavOffset }, () => null).reduce((p) => prevPeriodConfig(p), periodConfig);

  const periodStart = getPeriodStartDate(effectivePeriod);
  const periodEnd = getPeriodEndDate(effectivePeriod);

  // Memoizzato su chiavi stringa: periodStart/periodEnd/weekEnd sono NUOVI oggetti Date a ogni
  // render → senza useMemo, weekDays cambiava identità e l'intera griglia veniva ricalcolata
  // a ogni interazione (scroll incluso), invalidando anche il memo di weekShifts.
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
  const periodStartStr = format(periodStart, 'yyyy-MM-dd');
  const periodEndStr = format(periodEnd, 'yyyy-MM-dd');
  const weekDays = useMemo(() => {
    if (viewMode === 'period') {
      return eachDayOfInterval({ start: parseISO(periodStartStr), end: parseISO(periodEndStr) });
    }
    return eachDayOfInterval({ start: parseISO(weekStartStr), end: parseISO(weekEndStr) });
  }, [viewMode, periodStartStr, periodEndStr, weekStartStr, weekEndStr]);

  const [showPeriodPopover, setShowPeriodPopover] = useState(false);
  const [periodPopoverYear, setPeriodPopoverYear] = useState(today.getFullYear());
  const [periodPopoverStyle, setPeriodPopoverStyle] = useState<React.CSSProperties>({});
  const periodTriggerRef = useRef<HTMLButtonElement>(null);
  const periodPopoverRef = useRef<HTMLDivElement>(null);

  // ── Department filter ──
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [deptDropdownOpen, setDeptDropdownOpen] = useState(false);
  const [deptDropdownStyle, setDeptDropdownStyle] = useState<React.CSSProperties>({});
  const deptTriggerRef = useRef<HTMLButtonElement>(null);
  const deptPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showPeriodPopover) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!periodPopoverRef.current?.contains(t) && !periodTriggerRef.current?.contains(t)) {
        setShowPeriodPopover(false);
      }
    };
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [showPeriodPopover]);

  useEffect(() => {
    if (!deptDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (!deptPopoverRef.current?.contains(e.target as Node) && !deptTriggerRef.current?.contains(e.target as Node)) {
        setDeptDropdownOpen(false);
      }
    };
    const id = setTimeout(() => document.addEventListener('click', handler), 0);
    return () => { clearTimeout(id); document.removeEventListener('click', handler); };
  }, [deptDropdownOpen]);

  const togglePeriodPopover = useCallback(() => {
    setShowPeriodPopover(prev => {
      if (!prev && periodTriggerRef.current) {
        const rect = periodTriggerRef.current.getBoundingClientRect();
        const popoverWidth = Math.min(340, window.innerWidth - 32);
        const popoverHeight = 300;
        const gap = 6;

        let top: number;
        if (rect.bottom + gap + popoverHeight > window.innerHeight) {
          top = Math.max(8, rect.top - gap - popoverHeight);
        } else {
          top = rect.bottom + gap;
        }

        const centerX = rect.left + rect.width / 2;
        const minLeft = popoverWidth / 2 + 16;
        const maxLeft = window.innerWidth - popoverWidth / 2 - 16;
        const left = Math.min(maxLeft, Math.max(minLeft, centerX));

        setPeriodPopoverStyle({ top, left });
      }
      return !prev;
    });
  }, []);

  const toggleDeptDropdown = useCallback(() => {
    setDeptDropdownOpen(prev => {
      if (!prev && deptTriggerRef.current) {
        const rect = deptTriggerRef.current.getBoundingClientRect();
        const gap = 6;
        const dropdownWidth = 180;
        const estimatedHeight = 130;

        let top: number;
        if (rect.bottom + gap + estimatedHeight > window.innerHeight) {
          top = Math.max(8, rect.top - gap - estimatedHeight);
        } else {
          top = rect.bottom + gap;
        }

        let left = rect.right - dropdownWidth;
        if (left < 16) left = 16;
        if (left + dropdownWidth > window.innerWidth - 16) {
          left = window.innerWidth - dropdownWidth - 16;
        }

        setDeptDropdownStyle({ top, left });
      }
      return !prev;
    });
  }, []);

  const applyPeriod = useCallback((cfg: PeriodConfig) => {
    savePeriodConfig(cfg);
    setPeriodConfigState(cfg);
    setPeriodNavOffset(0);
    setWeekStart(startOfWeek(getPeriodStartDate(cfg), { weekStartsOn: 1 }));
    setShowPeriodPopover(false);
  }, []);

  // ── Detail drawer state ──
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerIsExtraShift, setDrawerIsExtraShift] = useState(false);
  const [drawerDeleteConfirm, setDrawerDeleteConfirm] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<Shift[] | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);

  useEffect(() => {
    if (!drawerOpen) { setDrawerDeleteConfirm(false); setReviewQueue(null); setReviewIdx(0); }
  }, [drawerOpen]);
  const [_detailTab, setDetailTab] = useState<ShiftDetailTab>('details');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // ── Create shift modal state ──
  const [createModal, setCreateModal] = useState<{ userId: string; date: string; hasExisting: boolean } | null>(null);
  const [createStart, setCreateStart] = useState('10:00');
  const [createEnd, setCreateEnd] = useState('16:00');

  // ── Manual punch / break edit state ──
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [saving, setSaving] = useState(false);
  const [deductBreak, setDeductBreak] = useState(true);
  const [isAutoBreak, setIsAutoBreak] = useState(true);
  const editOutHourRef = useRef<HTMLInputElement>(null);

  const initialValuesRef = useRef({ editStartTime: '', editEndTime: '', editIn: '', editOut: '', deductBreak: true, isAutoBreak: true });
  const hasUnsavedChanges = useMemo(() => {
    if (!drawerOpen) return false;
    const iv = initialValuesRef.current;
    return iv.editStartTime !== editStartTime || iv.editEndTime !== editEndTime
        || iv.editIn !== editIn || iv.editOut !== editOut
        || iv.deductBreak !== deductBreak || iv.isAutoBreak !== isAutoBreak;
  }, [drawerOpen, editStartTime, editEndTime, editIn, editOut, deductBreak, isAutoBreak]);

  const handleCloseDrawer = useCallback(() => {
    if (hasUnsavedChanges) return; // Impedisce la chiusura se ci sono modifiche non salvate
    setDrawerOpen(false);
  }, [hasUnsavedChanges]);

  // ── Selection / Bulk edit ──
  const [selectedShiftIds, setSelectedShiftIds] = useState<Set<string>>(new Set());

  // ── ESC annulla azione corrente ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Chiudi modale creazione turno
      setCreateModal(null);
      // Chiudi drawer dettaglio (solo se nessuna modifica non salvata)
      if (drawerOpen && !hasUnsavedChanges) {
        setDrawerOpen(false);
        setSelectedShift(null);
      }
      // Deseleziona turni
      if (selectedShiftIds.size > 0) setSelectedShiftIds(new Set());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, selectedShiftIds, hasUnsavedChanges]);

  // ── Drag & Drop ──
  // Usiamo una ref per draggedShiftId per evitare stale closure nei drag handler
  const draggedShiftIdRef = useRef<string | null>(null);
  const [_draggedShiftId, setDraggedShiftId] = useState<string | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [_dragCopyMode, setDragCopyMode] = useState(false);
  // Conferma dopo il drop: chiede se spostare o copiare
  const [dropConfirm, setDropConfirm] = useState<{
    shiftIds: string[];
    targetUserId: string;
    targetDate: string;
    targetLabel: string;
    targetSlot: 'lunch' | 'evening';
    targetTimeRange: string;
    presets: { start: string; end: string }[];
    selectedPresetIdx: number;
  } | null>(null);

  // ── Template state ──
  const [templatesList, setTemplatesList] = useState<string[]>([]);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [actionsDrawerOpen, setActionsDrawerOpen] = useState(false);
  const [actionsDrawerSection, setActionsDrawerSection] = useState<'templates' | 'reorder' | null>(null);
  const actionsDrawerTriggerRef = useRef<HTMLDivElement>(null);
  const actionsDrawerPanelRef = useRef<HTMLDivElement>(null);

  const closeActionsDrawer = useCallback(() => {
    setActionsDrawerOpen(false);
    setActionsDrawerSection(null);
  }, []);

  // ── Storico modifiche del turno aperto (solo admin) ──
  /** Eventi di audit del turno selezionato; null = nessuno o da caricare. */
  const [shiftAuditEntries, setShiftAuditEntries] = useState<ShiftAuditEntry[] | null>(null);
  /** Apre lo storico in una modale separata (non modifica la modale principale). */
  const [showShiftAuditModal, setShowShiftAuditModal] = useState(false);

  useEffect(() => {
    if (!drawerOpen || !selectedShift) {
      setShiftAuditEntries(null);
      setShowShiftAuditModal(false);
      return;
    }
    let cancelled = false;
    setShiftAuditEntries(null);
    database.auditLog
      .getByShiftId(selectedShift.id)
      .then((entries) => {
        if (cancelled) return;
        setShiftAuditEntries(entries && entries.length > 0 ? entries : null);
      })
      .catch(() => {
        if (!cancelled) setShiftAuditEntries(null);
      });
    return () => { cancelled = true; };
  }, [drawerOpen, selectedShift]);

  useEffect(() => {
    if (!actionsDrawerOpen) return;
    const handler = (e: MouseEvent) => {
      const tgt = e.target as Node;
      if (
        !actionsDrawerPanelRef.current?.contains(tgt) &&
        !actionsDrawerTriggerRef.current?.contains(tgt)
      ) {
        closeActionsDrawer();
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [actionsDrawerOpen, closeActionsDrawer]);

  // ── Freeze / PinPad state ──
  const [panelPinModalOpen, setPanelPinModalOpen] = useState(false);
  const [panelPinTargetShiftId, setPanelPinTargetShiftId] = useState<string | null>(null);
  const [panelPinError, setPanelPinError] = useState('');
  const [panelPin, setPanelPin] = useState('');
  const [panelPinMode, setPanelPinMode] = useState<'freeze' | 'unfreeze' | 'delete'>('unfreeze');

  useEffect(() => {
    try {
      if (typeof database !== 'undefined' && database?.shiftTemplates?.listAll) {
        database.shiftTemplates.listAll().then((list: any) => {
          if (Array.isArray(list)) setTemplatesList(list);
        }).catch(() => {});
      }
    } catch { /* database not available */ }
  }, []);

  const prevWeek = () => setWeekStart(d => addDays(d, -7));
  const nextWeek = () => setWeekStart(d => addDays(d, 7));
  const goToday = () => {
    // Ripristina il periodo predefinito salvato, non quello personalizzato
    const defaultCfg = loadPeriodConfig();
    setPeriodConfigState(defaultCfg);
    setPeriodNavOffset(0);
    setWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
  };

  const visibleUsers = useMemo(() => {
    if (filterUserId) return users.filter(u => u.id === filterUserId);
    return users
      .filter(u => isUserVisibleOnTeamSchedule(u, allShifts))
      .filter(u => !deptFilter || u.department === deptFilter);
  }, [filterUserId, users, allShifts, deptFilter]);

  const weekDateStrings = useMemo(() => weekDays.map(d => format(d, 'yyyy-MM-dd')), [weekDays]);
  const weekDateSet = useMemo(() => new Set(weekDateStrings), [weekDateStrings]);
  const weekShifts = useMemo(
    () => allShifts.filter(s => weekDateSet.has(s.date) && (!filterUserId || s.user_id === filterUserId)),
    [allShifts, weekDateSet, filterUserId]
  );
  // Memoizzato con Set: prima era un filter O(P×D) a ogni render.
  const weekPunchRecords = useMemo(
    () => allPunchRecords.filter(pr => pr.timestamp && weekDateSet.has(pr.timestamp.slice(0, 10))),
    [allPunchRecords, weekDateSet]
  );
  const departments = [...new Set(users.filter(u => u.department).map(u => u.department as string))];
  const hasWeekDraftShifts = weekShifts.some(s => s.approval_status === 'draft');
  const canFreezeWeek = !hasWeekDraftShifts && weekShifts.some(s => s.approval_status === 'approved') && weekShifts.every(s => s.approval_status !== 'draft' && s.approval_status !== 'confirmed');

  const dayCount = weekDays.length;
  const isPeriodView = viewMode === 'period';
  const employeeColWidth = 96;
  const totalColWidth = 72;
  const dayColMinWidth = isPeriodView ? 88 : 120;
  const tableMinWidth = employeeColWidth + totalColWidth + dayCount * dayColMinWidth;
  const dayColCalc = `calc((100% - ${employeeColWidth + totalColWidth}px) / ${dayCount})`;
  const slotRowHeight = isPeriodView ? 28 : dayCount > 7 ? 28 : 36;
  const slotCellHeight = slotRowHeight * 2 + 16;
  const extraRowHeight = 16;
  const compactGrid = isPeriodView || dayCount > 7;

  /** Indice punch della settimana (per shift_id e per user+data): elimina i filter O(P) per turno. */
  const weekPunchIndex = useMemo(() => {
    const byShiftId = new Map<string, PunchRecord[]>();
    const byUserDate = new Map<string, PunchRecord[]>();
    for (const pr of weekPunchRecords) {
      if (pr.shift_id) {
        const arr = byShiftId.get(pr.shift_id);
        if (arr) arr.push(pr);
        else byShiftId.set(pr.shift_id, [pr]);
      }
      const ds = pr.timestamp?.slice(0, 10);
      if (ds) {
        const key = `${pr.user_id}|${ds}`;
        const arr = byUserDate.get(key);
        if (arr) arr.push(pr);
        else byUserDate.set(key, [pr]);
      }
    }
    return { byShiftId, byUserDate };
  }, [weekPunchRecords]);

  const getPunchForShift = useCallback((shift: Shift) => {
    const exact = weekPunchIndex.byShiftId.get(shift.id) ?? [];
    if (exact.length > 0) {
      const sorted = [...exact].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const pIn = sorted.find(p => p.type === 'in');
      const pOut = [...sorted].reverse().find(p => p.type === 'out');
      if (pIn && !pIn.timestamp?.startsWith(shift.date)) {
        return { in: undefined, out: undefined };
      }
      return { in: pIn, out: pOut };
    }
    return { in: undefined, out: undefined };
  }, [weekPunchIndex]);

  /** Turni della settimana per (user, data) e per utente: niente filter O(S) per cella né per getShiftViolations. */
  const { shiftsByUserDate, shiftsByUser } = useMemo(() => {
    const byUserDate = new Map<string, Shift[]>();
    const byUser = new Map<string, Shift[]>();
    for (const s of weekShifts) {
      const keyDate = `${s.user_id}|${s.date}`;
      const arrD = byUserDate.get(keyDate);
      if (arrD) arrD.push(s);
      else byUserDate.set(keyDate, [s]);
      const arrU = byUser.get(s.user_id);
      if (arrU) arrU.push(s);
      else byUser.set(s.user_id, [s]);
    }
    return { shiftsByUserDate: byUserDate, shiftsByUser: byUser };
  }, [weekShifts]);

  /**
   * Cache dei gruppi giorno: calcolata UNA volta per set di dati.
   * Prima getDayGroup veniva rieseguita ~5× per (utente, giorno) a ogni render
   * (totali pianificato/effettivo, celle mobile, celle desktop, userHasShifts),
   * con getShiftViolations O(S²) e filter O(P) per turno: ogni scroll/keystroke
   * dell'interfaccia ricalcolava l'intera matrice → thread bloccato su PC.
   */
  const dayGroupsByUserDate = useMemo(() => {
    const cache = new Map<string, DayShiftGroup[]>();
    const firstDateStr = weekDateStrings[0] ?? '';
    const lastDateStr = weekDateStrings[weekDateStrings.length - 1] ?? '';
    for (const [key, shifts] of shiftsByUserDate) {
      const groups = shifts.map(shift => {
        const { in: punchIn, out: punchOut } = getPunchForShift(shift);
        const plannedMins = calculateShiftMinutesGross(shift.start_time ?? '', shift.end_time ?? '');
        const actualMins = punchIn && punchOut
          ? (() => {
              const startMs = new Date(punchIn.calculated_time || punchIn.timestamp).getTime();
              let endMs = new Date(punchOut.calculated_time || punchOut.timestamp).getTime();
              if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
              return (endMs - startMs) / 60000;
            })() : 0;
        const breakMins = getBreakMinutesForShift(shift, plannedMins, null, breakRules);
        const actualBreakMins = (() => {
          const gross = Math.round(actualMins);
          if (gross < AUTO_BREAK_THRESHOLD_MINUTES) return 0;
          if (shift.deduct_break === false) return 0;
          const st = (shift.start_time || '').slice(0, 5);
          const en = (shift.end_time || '').slice(0, 5);
          if (!st || !en) return 0;
          const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
          if (toMin(en) <= toMin(st)) return 0;
          const mealKeys = getBreakLabels(st, en);
          return mealKeys.length > 0 ? mealKeys.length * DEFAULT_AUTO_BREAK_MINUTES : 0;
        })();
        const actualNet = Math.max(0, Math.round(actualMins) - actualBreakMins);
        const plannedNet = Math.max(0, plannedMins - breakMins);
        // getShiftViolations limitata ai turni dello stesso utente: prima filtrava l'intera settimana O(S).
        const violations = violationChromeEnabled
          ? getShiftViolations(shift, shiftsByUser.get(shift.user_id) ?? [], firstDateStr, lastDateStr, effectiveWorkRules, { breakRules })
          : undefined;
        return {
          shift, punchIn, punchOut, actualMinutes: actualNet, deltaMinutes: actualNet - plannedNet,
          isAbsent: shift.approval_status === 'absent',
          isMissingPunch: !punchIn && shiftPastPlannedEndWithoutClockIn(shift, weekPunchIndex.byShiftId.get(shift.id) ?? []),
          breakMinutes: breakMins, actualBreakMinutes: actualBreakMins, netMinutes: plannedNet, violations,
        };
      }).sort((a, b) => {
        const slotA = getShiftSlotFromStartTime(a.shift.start_time ?? '00:00') === 'lunch' ? 0 : 1;
        const slotB = getShiftSlotFromStartTime(b.shift.start_time ?? '00:00') === 'lunch' ? 0 : 1;
        if (slotA !== slotB) return slotA - slotB;
        return (a.shift.start_time?.slice(0, 5) ?? '00:00').localeCompare(b.shift.start_time?.slice(0, 5) ?? '00:00');
      });
      cache.set(key, groups);
    }
    return cache;
  }, [shiftsByUserDate, shiftsByUser, weekPunchIndex, weekDateStrings, breakRules, violationChromeEnabled, effectiveWorkRules, getPunchForShift]);

  /**
   * Totali (pianificato/effettivo) per utente, calcolati UNA volta per dataset.
   * Prima venivano ricalcolati ~2× per utente a ogni render (vista mobile E desktop
   * sono entrambe montate) → 2 loop O(U×D) inutili a ogni interazione.
   */
  const totalsByUser = useMemo(() => {
    const totals: Record<string, { planned: number; actual: number }> = {};
    for (const user of visibleUsers) {
      let planned = 0;
      let actual = 0;
      for (const ds of weekDateStrings) {
        const groups = dayGroupsByUserDate.get(`${user.id}|${ds}`);
        if (!groups || groups.length === 0) continue;
        for (const g of groups) {
          planned += g.netMinutes;
          actual += g.actualMinutes > 0 ? g.actualMinutes : g.netMinutes;
        }
      }
      totals[user.id] = { planned, actual };
    }
    return totals;
  }, [visibleUsers, weekDateStrings, dayGroupsByUserDate]);

  /** Utenti con almeno un turno nella settimana (per la card mobile "Nessun turno"). */
  const usersWithShifts = useMemo(() => {
    const set = new Set<string>();
    for (const key of dayGroupsByUserDate.keys()) {
      const idx = key.indexOf('|');
      if (idx > 0) set.add(key.slice(0, idx));
    }
    return set;
  }, [dayGroupsByUserDate]);

  const handlePublishWeek = useCallback(async () => {
    if (!confirm(t.confirm_publish_week ?? 'Pubblicare tutti i turni della settimana?')) return;
    try { await publishWeekShifts(weekStart); showSuccess(t.week_published ?? 'Settimana pubblicata.'); }
    catch { showError(t.error_generic ?? 'Errore.'); }
  }, [publishWeekShifts, weekStart, showSuccess, showError, t]);

  const handleFreezeWeek = useCallback(async () => {
    if (!confirm(t.confirm_freeze_week ?? 'Congelare tutti i turni della settimana?')) return;
    let count = 0;
    const approvedShifts = weekShifts.filter(s => s.approval_status === 'approved' || s.approval_status === 'confirmed');
    for (const shift of approvedShifts) {
      try {
        await updateShift(shift.id, { approval_status: 'frozen' } as any);
        count++;
      } catch { /* skip error for individual shift */ }
    }
    if (count > 0) showSuccess((t.week_frozen ?? '{n} turni congelati.').replace('{n}', String(count)));
    else showError(t.no_shifts_to_freeze ?? 'Nessun turno da congelare.');
  }, [weekShifts, updateShift, showSuccess, showError, t]);

  const handleCopyWeek = useCallback(async () => {
    try {
      const n = await bulkCopyPreviousWeek(weekStart);
      showSuccess(n > 0 ? (t.copied_n_shifts ?? '{n} turni copiati.').replace('{n}', String(n)) : (t.no_shifts_to_copy ?? 'Nessun turno da copiare.'));
    } catch { showError(t.error_generic ?? 'Errore.'); }
  }, [bulkCopyPreviousWeek, weekStart, showSuccess, showError, t]);

  const handleExportPdf = useCallback(async () => {
    try {
      await exportSchedulePDF(weekStart, weekDays, visibleUsers, weekShifts, { breakRules, language: effectiveLanguage });
      showSuccess(t.pdf_exported ?? 'PDF esportato.');
    } catch { showError(t.error_generic ?? 'Errore.'); }
  }, [weekStart, weekDays, visibleUsers, weekShifts, breakRules, effectiveLanguage, showSuccess, showError, t]);

  const handleDeleteShift = useCallback(async (shift: Shift, _opts?: { skipConfirm?: boolean }) => {
    if (!canDeleteShift(shift)) {
      showError(t.shift_delete_blocked_frozen ?? 'Turno non eliminabile.');
      return;
    }
    // Sessione elevata: elimina direttamente, senza PIN
    if (sessionActive) {
      if (isFrozen(shift)) authorizeFrozenDelete(shift.id);
      try {
        await deleteShift(shift.id);
        showSuccess(t.shift_deleted ?? 'Turno eliminato.');
        setDrawerDeleteConfirm(false);
        handleCloseDrawer();
      } catch {
        showError(t.shift_delete_bulk_error ?? t.error_generic ?? 'Errore eliminazione turno.');
      }
      return;
    }
    // Sessione non elevata: sempre PIN
    requestAnimationFrame(() => {
      setPanelPinTargetShiftId(shift.id);
      setPanelPinMode('delete');
      setPanelPinError('');
      setPanelPinModalOpen(true);
    });
  }, [deleteShift, showSuccess, showError, t, canDeleteShift, sessionActive]);

  // ── Menu contestuale (tasto destro) ──
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; w: number; h: number; shift: Shift; group: DayShiftGroup } | null>(null);

  const handleShiftContextMenu = useCallback((e: React.MouseEvent, shift: Shift, group: DayShiftGroup) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setContextMenu({ x: rect.left, y: rect.top, w: rect.width, h: rect.height, shift, group });
  }, []);

  const handleContextDelete = useCallback(() => {
    if (!contextMenu) return;
    setContextMenu(null);
    handleDeleteShift(contextMenu.shift);
  }, [contextMenu, handleDeleteShift]);

  const handleSaveShiftEdit = useCallback(async () => {
    if (!selectedShift) return;
    setSaving(true);
    try {
      await updateShift(selectedShift.id, {
        start_time: editStartTime + ':00',
        end_time: editEndTime + ':00',
        deduct_break: deductBreak,
        is_auto_break: isAutoBreak,
      });
      // Aggiorna i valori iniziali così hasUnsavedChanges torna false
      initialValuesRef.current = {
        ...initialValuesRef.current,
        editStartTime,
        editEndTime,
        deductBreak,
        isAutoBreak,
      };
      showSuccess(t.shift_updated ?? 'Turno aggiornato.');
      // Chiudi automaticamente il drawer dopo salvataggio riuscito
      setDrawerOpen(false);
    } catch { showError(t.error_generic ?? 'Errore.'); }
    finally { setSaving(false); }
  }, [selectedShift, editStartTime, editEndTime, deductBreak, isAutoBreak, updateShift, showSuccess, showError, t]);

  const handleConfirmPunches = useCallback(async () => {
    if (!selectedShift) return;
    if (!editIn || !editOut) {
      showError(t.confirm_punches_required ?? 'Inserisci entrambe le timbrature prima di confermare.');
      return;
    }
    setSaving(true);
    try {
      const shift = selectedShift;
      const todayStr = today.toISOString().slice(0, 10);
      const punchDate = shift.date <= todayStr ? shift.date : todayStr;
      const existingIn = allPunchRecords.find(pr => pr.shift_id === shift.id && pr.type === 'in');
      const existingOut = allPunchRecords.find(pr => pr.shift_id === shift.id && pr.type === 'out');
      if (editIn) {
        if (existingIn) {
          await updatePunchRecord(existingIn.id, { timestamp: new Date(`${punchDate}T${editIn}:00`).toISOString() });
        } else {
          await addPunchRecord(shift.user_id, 'in', { shift_id: shift.id, timestamp: `${punchDate}T${editIn}:00`, source: 'manual' });
        }
      }
      if (editOut) {
        if (existingOut) {
          await updatePunchRecord(existingOut.id, { timestamp: new Date(`${punchDate}T${editOut}:00`).toISOString() });
        } else {
          await addPunchRecord(shift.user_id, 'out', { shift_id: shift.id, timestamp: `${punchDate}T${editOut}:00`, source: 'manual' });
        }
      }
      await updateShift(shift.id, { approval_status: 'approved' } as any);
      const actorFull = currentUser;
      await logShiftAudit({
        shiftId: shift.id,
        action: 'update',
        field: 'punch_confirm',
        oldValue: existingIn && existingOut
          ? `${new Date(existingIn.timestamp ?? '').toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} / ${new Date(existingOut.timestamp ?? '').toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`
          : 'assente',
        newValue: `${editIn} / ${editOut}`,
        description: `${formatAuditDate(shift.date)} — timbrature confermate manualmente (in ${editIn}, out ${editOut}); turno approvato`,
        actorUserId: actorFull?.id ?? null,
        actorName: actorFull ? `${actorFull.first_name} ${actorFull.last_name ?? ''}`.trim() : 'Sistema',
      });
      setSelectedShift(prev => prev && prev.id === shift.id ? { ...prev, approval_status: 'approved' as const } : prev);
      showSuccess(t.shift_approved ?? 'Turno approvato.');
      // Advance to next shift in review queue if available
      if (reviewQueue && reviewIdx < reviewQueue.length - 1) {
        const nextIdx = reviewIdx + 1;
        setReviewIdx(nextIdx);
        requestAnimationFrame(() => {
          handleOpenDrawer(reviewQueue[nextIdx]);
        });
      }
    } catch { showError(t.error_generic ?? 'Errore.'); }
    finally { setSaving(false); }
  }, [selectedShift, editIn, editOut, allPunchRecords, addPunchRecord, updatePunchRecord, updateShift, setSelectedShift, showSuccess, showError, t, reviewQueue, reviewIdx, currentUser, today]);

  const handleFreezeShift = useCallback(async (shift: Shift) => {
    if (sessionActive) {
      await updateShift(shift.id, { approval_status: 'frozen' } as any);
      setSelectedShift(prev => prev && prev.id === shift.id ? { ...prev, approval_status: 'frozen' as const } : prev);
      showSuccess(t.wst_freeze_success ?? 'Turno congelato.');
      return;
    }
    requestAnimationFrame(() => {
      setPanelPinTargetShiftId(shift.id);
      setPanelPinMode('freeze');
      setPanelPinError('');
      setPanelPinModalOpen(true);
    });
  }, [sessionActive, updateShift, setSelectedShift, showSuccess, t]);

  const handleUnfreezeShift = useCallback(async (shift: Shift) => {
    if (sessionActive) {
      await updateShift(shift.id, { approval_status: 'confirmed' } as any);
      setSelectedShift(prev => prev && prev.id === shift.id ? { ...prev, approval_status: 'confirmed' as const } : prev);
      showSuccess(t.wst_unfreeze_success ?? 'Turno sbloccato.');
      return;
    }
    requestAnimationFrame(() => {
      setPanelPinTargetShiftId(shift.id);
      setPanelPinMode('unfreeze');
      setPanelPinError('');
      setPanelPinModalOpen(true);
    });
  }, [sessionActive, updateShift, setSelectedShift, showSuccess, t]);

  const handlePinConfirm = useCallback(async () => {
    if (!panelPinTargetShiftId) return;
    setSaving(true);
    try {
      const verifier = findFreezeVerifierByPin(users, panelPin);
      if (!verifier) {
        setPanelPinError(t.wst_unfreeze_pin_invalid ?? 'PIN non valido');
        setSaving(false);
        return;
      }
      if (panelPinMode === 'delete') {
        authorizeFrozenDelete(panelPinTargetShiftId);
        await deleteShift(panelPinTargetShiftId);
        showSuccess(t.shift_deleted ?? 'Turno eliminato.');
        setDrawerDeleteConfirm(false);
        handleCloseDrawer();
      } else if (panelPinMode === 'freeze') {
        await updateShift(panelPinTargetShiftId, { approval_status: 'frozen' } as any);
        setSelectedShift(prev => prev && prev.id === panelPinTargetShiftId ? { ...prev, approval_status: 'frozen' as const } : prev);
        showSuccess(t.wst_freeze_success ?? 'Turno congelato.');
      } else {
        await updateShift(panelPinTargetShiftId, { approval_status: 'confirmed' } as any);
        setSelectedShift(prev => prev && prev.id === panelPinTargetShiftId ? { ...prev, approval_status: 'confirmed' as const } : prev);
        showSuccess(t.wst_unfreeze_success ?? 'Turno sbloccato.');
      }
      setPanelPinModalOpen(false);
      setPanelPinTargetShiftId(null);
      setPanelPin('');
      setPanelPinError('');
    } catch { showError(t.error_generic ?? 'Errore.'); }
    finally { setSaving(false); }
  }, [panelPinTargetShiftId, panelPin, panelPinMode, users, updateShift, deleteShift, setSelectedShift, showSuccess, showError, t]);

  const _handleSaveManualPunch = useCallback(async () => {
    if (!selectedShift) return;
    setSaving(true);
    try {
      const shift = selectedShift;
      const todayStr = today.toISOString().slice(0, 10);
      const punchDate = shift.date <= todayStr ? shift.date : todayStr;
      const existingIn = allPunchRecords.find(pr => pr.shift_id === shift.id && pr.type === 'in');
      const existingOut = allPunchRecords.find(pr => pr.shift_id === shift.id && pr.type === 'out');
      if (editIn) {
        if (existingIn) {
          await updatePunchRecord(existingIn.id, { timestamp: new Date(`${punchDate}T${editIn}:00`).toISOString() });
        } else {
          await addPunchRecord(shift.user_id, 'in', {
            shift_id: shift.id,
            timestamp: `${punchDate}T${editIn}:00`,
            source: 'manual',
          });
        }
      }
      if (editOut) {
        if (existingOut) {
          await updatePunchRecord(existingOut.id, { timestamp: new Date(`${punchDate}T${editOut}:00`).toISOString() });
        } else {
          await addPunchRecord(shift.user_id, 'out', {
            shift_id: shift.id,
            timestamp: `${punchDate}T${editOut}:00`,
            source: 'manual',
          });
        }
      }
      // Auto-approve published shifts when both punches are saved
      if (shift.approval_status === 'confirmed' && editIn && editOut) {
        await updateShift(shift.id, { approval_status: 'approved' } as any);
        setSelectedShift(prev => prev && prev.id === shift.id ? { ...prev, approval_status: 'approved' as const } : prev);
      }
      showSuccess(t.punch_saved ?? 'Timbratura salvata.');
    } catch { showError(t.error_generic ?? 'Errore.'); }
    finally { setSaving(false); }
  }, [selectedShift, editIn, editOut, allPunchRecords, addPunchRecord, updatePunchRecord, updateShift, setSelectedShift, showSuccess, showError, t, today]);

  const handleCreateShift = useCallback(async (overrideStart?: string, overrideEnd?: string) => {
    if (!createModal) return;
    setSaving(true);
    try {
      // Se chiamato da onClick del pulsante "Crea", React passa l'evento come primo arg — ignoralo
      const start = (typeof overrideStart === 'string' ? overrideStart : undefined) ?? createStart;
      const end = (typeof overrideEnd === 'string' ? overrideEnd : undefined) ?? createEnd;
      const result = await addShift({
        user_id: createModal.userId, date: createModal.date,
        start_time: start + ':00', end_time: end + ':00',
        type: getShiftTypeFromStartTime(start),
        approval_status: 'draft' as const,
        department: users.find(u => u.id === createModal.userId)?.department ?? undefined,
      });
      if (result) {
        showSuccess(t.shift_created ?? 'Turno creato.');
        setCreateModal(null);
      } else {
        // addShift ha fallito silenziosamente (es. insert non ha salvato nulla)
        console.warn('[handleCreateShift] addShift returned null — turno NON salvato');
        showError(t.error_generic ?? 'Errore durante la creazione del turno.');
      }
    } catch (err) {
      console.error('[handleCreateShift] insert error:', err);
      showError(t.error_generic ?? 'Errore.');
    }
    finally { setSaving(false); }
  }, [createModal, createStart, createEnd, addShift, showSuccess, showError, t, users]);

  const openCreateShiftModal = useCallback((userId: string, date: string, preferredSlot?: 'lunch' | 'evening') => {
    const existing = weekShifts.filter((s) => s.user_id === userId && s.date === date);
    if (existing.length >= 2) {
      showError(t.max_two_shifts_same_day ?? 'Massimo 2 turni nello stesso giorno.');
      return;
    }
    const defaultForSlot = (slot: 'lunch' | 'evening') =>
      slot === 'lunch' ? { start: '10:00', end: '16:00' } : { start: '18:00', end: '23:00' };
    if (existing.length === 1) {
      const first = existing[0];
      const oppositeSlot = getShiftSlotFromStartTime(first.start_time ?? '10:00') === 'lunch' ? 'evening' : 'lunch';
      const slot = preferredSlot ?? oppositeSlot;
      const presets = loadShiftSlotPresets(slot);
      const pick = presets.find((p) =>
        !hasShiftConflictSameDay(existing, { start_time: p.start, end_time: p.end })
      ) ?? defaultForSlot(slot);
      setCreateStart(pick.start);
      setCreateEnd(pick.end);
    } else {
      const slot = preferredSlot ?? 'lunch';
      const presets = loadShiftSlotPresets(slot);
      const pick = presets[0] ?? defaultForSlot(slot);
      setCreateStart(pick.start);
      setCreateEnd(pick.end);
    }
    setCreateModal({ userId, date, hasExisting: existing.length === 1 });
  }, [weekShifts, showError, t]);

  // Toggle pausa: aggiornano solo lo stato locale; il salvataggio avviene con "Salva modifiche"
  const handleDeductBreakToggle = useCallback(() => {
    setDeductBreak((prev) => !prev);
  }, []);

  const handleAutoBreakToggle = useCallback(() => {
    setIsAutoBreak((prev) => !prev);
  }, []);

  // Modifica pausa non ancora salvata → mostra il pulsante "Salva" accanto alla spunta
  const breakUnsaved = useMemo(() => {
    if (!drawerOpen) return false;
    const iv = initialValuesRef.current;
    return iv.deductBreak !== deductBreak || iv.isAutoBreak !== isAutoBreak;
  }, [drawerOpen, deductBreak, isAutoBreak]);

  // Timbrature modificate o mancanti → il pulsante "Conferma timbrature" richiede l'azione
  const punchActionRequired = useMemo(() => {
    if (!drawerOpen || !selectedShift) return false;
    const iv = initialValuesRef.current;
    if (iv.editIn !== editIn || iv.editOut !== editOut) return true;
    const { in: punchIn, out: punchOut } = getPunchForShift(selectedShift);
    return !punchIn || !punchOut;
  }, [drawerOpen, selectedShift, editIn, editOut, getPunchForShift]);

  // Orario del turno modificato → "Salva modifiche" richiede l'azione
  const timeUnsaved = useMemo(() => {
    if (!drawerOpen) return false;
    const iv = initialValuesRef.current;
    return iv.editStartTime !== editStartTime || iv.editEndTime !== editEndTime;
  }, [drawerOpen, editStartTime, editEndTime]);

  const handleSaveBreakSettings = useCallback(async () => {
    if (!selectedShift) return;
    setSaving(true);
    try {
      await updateShift(selectedShift.id, { deduct_break: deductBreak, is_auto_break: isAutoBreak });
      initialValuesRef.current = { ...initialValuesRef.current, deductBreak, isAutoBreak };
      showSuccess((t as Record<string, string>).break_settings_saved ?? 'Impostazioni pausa aggiornate');
      // Chiudi la modale: nessuna modifica pendente, il pulsante Salva scompare
      setDrawerOpen(false);
    } catch { showError(t.error_generic ?? 'Errore.'); }
    finally { setSaving(false); }
  }, [selectedShift, deductBreak, isAutoBreak, updateShift, showSuccess, showError, t]);

  const handleSaveTemplate = useCallback(async () => {
    if (!saveTemplateName.trim() || !database.shiftTemplates?.save) return;
    setSavingTemplate(true);
    try {
      const entries = weekShifts.filter(s => s.user_id).map(s => ({
        day_of_week: new Date(s.date).getDay(),
        user_id: s.user_id,
        start_time: s.start_time,
        end_time: s.end_time,
        type: s.type,
      }));
      await database.shiftTemplates.save(saveTemplateName.trim(), entries);
      const list = await database.shiftTemplates.listAll?.() ?? [];
      if (Array.isArray(list)) setTemplatesList(list);
      setSaveTemplateName('');
      closeActionsDrawer();
      showSuccess(t.template_saved ?? 'Template salvato.');
    } catch { showError(t.error_generic ?? 'Errore.'); }
    finally { setSavingTemplate(false); }
  }, [saveTemplateName, weekStart, weekShifts, showSuccess, showError, t, closeActionsDrawer]);

  const handleApplyTemplate = useCallback(async (name: string) => {
    if (!database.shiftTemplates?.load) return;
    try {
      const loaded = (await database.shiftTemplates.load(name)) as any[];
      if (Array.isArray(loaded)) {
        for (const s of loaded) {
          // day_of_week: 0=Sun, 1=Mon, ..., 6=Sat
          // weekDateStrings: [0]=Mon, ..., [6]=Sun
          const dayIndex = s.day_of_week === 0 ? 6 : s.day_of_week - 1;
          if (dayIndex < 0 || dayIndex >= weekDateStrings.length) continue;
          await addShift({ ...s, id: undefined, date: weekDateStrings[dayIndex] });
        }
        showSuccess(t.template_applied ?? 'Template applicato.');
        closeActionsDrawer();
      }
    } catch { showError(t.error_generic ?? 'Errore.'); }
  }, [addShift, weekDateStrings, showSuccess, showError, t, closeActionsDrawer]);

  const handleOpenDrawer = useCallback((shift: Shift, opts?: { isExtra?: boolean }) => {
    const u = users.find(us => us.id === shift.user_id) ?? null;
    const { in: punchIn, out: punchOut } = getPunchForShift(shift);
    const dayShifts = weekShifts.filter(s => s.user_id === shift.user_id && s.date === shift.date);
    setSelectedShift(shift); setSelectedUser(u);
    setDrawerIsExtraShift(opts?.isExtra ?? isExtraShiftInDay(shift, dayShifts));
    setDrawerDeleteConfirm(false);
    setDetailTab('details');
    const sv = String(shift.start_time ?? '').slice(0, 5);
    const ev = String(shift.end_time ?? '').slice(0, 5);
    const iv = punchIn ? punchTimeHHMM(punchIn.calculated_time || punchIn.timestamp) ?? '' : sv;
    const ov = punchOut ? punchTimeHHMM(punchOut.calculated_time || punchOut.timestamp) ?? '' : ev;
    const db = shift.deduct_break !== false;
    const ab = shift.is_auto_break !== false;
    setEditStartTime(sv); setEditEndTime(ev);
    setEditIn(iv); setEditOut(ov);
    setDeductBreak(db); setIsAutoBreak(ab);
    initialValuesRef.current = { editStartTime: sv, editEndTime: ev, editIn: iv, editOut: ov, deductBreak: db, isAutoBreak: ab };
    setDrawerOpen(true);
  }, [users, getPunchForShift, weekShifts]);

  // ── Drag & Drop handlers ──
  const handleDragStart = useCallback((e: React.DragEvent, shiftId: string) => {
    e.dataTransfer.setData('text/plain', shiftId);
    e.dataTransfer.effectAllowed = 'move';
    draggedShiftIdRef.current = shiftId;
    setDraggedShiftId(shiftId);
  }, []);

  const handleDropOnCell = useCallback(async (shiftId: string, targetUserId: string, targetDate: string, targetSlot?: 'lunch' | 'evening', presetStart?: string, presetEnd?: string) => {
    draggedShiftIdRef.current = null;
    setDraggedShiftId(null);
    setDropTargetKey(null);
    setDragCopyMode(false);
    try {
      const updates: Record<string, string> = { user_id: targetUserId, date: targetDate };
      if (presetStart && presetEnd) {
        updates.start_time = presetStart;
        updates.end_time = presetEnd;
      }
      await updateShift(shiftId, updates);
      showSuccess(t.shift_updated ?? 'Turno spostato.');
    } catch { showError(t.error_generic ?? 'Errore.'); }
  }, [updateShift, showSuccess, showError, t]);

  const handleDropCopyOnCell = useCallback(async (shiftId: string, targetUserId: string, targetDate: string, targetSlot?: 'lunch' | 'evening', presetStart?: string, presetEnd?: string) => {
    draggedShiftIdRef.current = null;
    setDraggedShiftId(null);
    setDropTargetKey(null);
    setDragCopyMode(false);
    try {
      const original = allShifts.find(s => s.id === shiftId);
      if (!original) return;
      await addShift({
        user_id: targetUserId, date: targetDate,
        start_time: presetStart ?? original.start_time,
        end_time: presetEnd ?? original.end_time,
        type: original.type, approval_status: 'draft' as const,
        deduct_break: original.deduct_break ?? true,
        department: users.find(u => u.id === targetUserId)?.department ?? original.department,
      });
      showSuccess(t.shift_copied ?? 'Turno copiato.');
    } catch { showError(t.error_generic ?? 'Errore.'); }
  }, [allShifts, addShift, users, showSuccess, showError, t]);

  const handleDragOver = useCallback((e: React.DragEvent, cellKey: string) => {
    if (!draggedShiftIdRef.current) return;
    e.preventDefault();
    setDropTargetKey(cellKey);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTargetKey(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetUserId: string, targetDate: string, _targetSlot?: 'lunch' | 'evening') => {
    e.preventDefault();
    const shiftId = draggedShiftIdRef.current;
    if (!shiftId) return;
    draggedShiftIdRef.current = null;
    setDraggedShiftId(null);
    setDropTargetKey(null);
    setDragCopyMode(false);
    // Se il turno trascinato è parte della selezione, usa TUTTI gli ID selezionati
    const ids = selectedShiftIds.has(shiftId) ? [...selectedShiftIds] : [shiftId];
    // Filtra eventuali turni già sulla stessa cella
    const filtered = ids.filter(id => {
      const s = allShifts.find(x => x.id === id);
      return !(s && s.user_id === targetUserId && s.date === targetDate);
    });
    if (filtered.length === 0) return;
    // Mostra conferma per spostare o copiare
    const targetUser = users.find(u => u.id === targetUserId);
    const firstShift = allShifts.find(s => s.id === filtered[0]);
    // I preset mostrati devono corrispondere al tipo di turno trascinato (dal suo orario),
    // non alla zona di drop (targetSlot indica solo in quale metà della cella posizionarlo).
    const slot = getShiftSlotFromStartTime(firstShift?.start_time ?? '10:00');
    const slotLabel = slot === 'lunch' ? 'pranzo' : 'sera';
    const presets = loadShiftSlotPresets(slot);
    const origStart = firstShift?.start_time?.slice(0, 5);
    const origEnd = firstShift?.end_time?.slice(0, 5);
    const selectedPresetIdx = presets.findIndex(p => p.start === origStart && p.end === origEnd);
    const effectiveIdx = selectedPresetIdx >= 0 ? selectedPresetIdx : 0;
    const pick = presets[effectiveIdx] ?? (slot === 'lunch' ? { start: '10:00', end: '16:00' } : { start: '18:00', end: '23:00' });
    const targetTimeRange = `${pick.start}–${pick.end}`;
    const targetLabel = targetUser ? `${targetUser.first_name} — ${targetDate} (${slotLabel})` : `${targetDate} (${slotLabel})`;
    setDropConfirm({ shiftIds: filtered, targetUserId, targetDate, targetLabel, targetSlot: slot, targetTimeRange, presets, selectedPresetIdx: effectiveIdx });
  }, [handleDropOnCell, handleDropCopyOnCell, allShifts, users, selectedShiftIds]);

  /** Deseleziona/seleziona un turno (Shift+click o checkbox) con identità stabile. */
  const toggleSelectShift = useCallback((id: string) => {
    setSelectedShiftIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  /** Reset stato drag&drop: identità stabile (prima era una closure inline ricreata a ogni render). */
  const handleDragEnd = useCallback(() => {
    draggedShiftIdRef.current = null;
    setDraggedShiftId(null);
    setDropTargetKey(null);
    setDragCopyMode(false);
  }, []);

  /** Apre la coda di revisione del dipendente dal nome colonna (identità stabile). */
  const handleReviewQueueClick = useCallback((user: User) => {
    const shifts = weekShifts
      .filter(s => s.user_id === user.id && s.approval_status !== 'approved' && !isShiftPayrollFrozen(s))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.start_time ?? '').localeCompare(b.start_time ?? ''));
    if (shifts.length === 0) {
      showError(t.no_shifts_to_review ?? 'Nessun turno da revisionare.');
      return;
    }
    setReviewQueue(shifts);
    setReviewIdx(0);
    handleOpenDrawer(shifts[0]);
  }, [weekShifts, showError, t, handleOpenDrawer]);

  const renderExtraShiftRows = useCallback((extraGroups: DayShiftGroup[], layout: 'desktop' | 'mobile') => {
    if (extraGroups.length === 0) return null;
    const stacked = layout === 'desktop';
    return extraGroups.map((ex) => {
      const label = formatShiftTimeRangeFull(ex.shift.start_time, ex.shift.end_time);
      const title = `${t.extra_shift ?? 'Turno aggiuntivo'}: ${label}`;
      const compactLabel = formatShiftTimeRangeCompact(ex.shift.start_time, ex.shift.end_time);
      const isChecked = selectedShiftIds.has(ex.shift.id);
      const handleClick = (e: React.MouseEvent) => {
        if (e.shiftKey) {
          toggleSelectShift(ex.shift.id);
        } else {
          handleOpenDrawer(ex.shift, { isExtra: true });
        }
      };
      return (
        <button
          key={ex.shift.id}
          type="button"
          title={title}
          aria-label={title}
          onClick={handleClick}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          draggable={canEdit}
          onDragStart={(e) => handleDragStart(e, ex.shift.id)}
          onDragEnd={handleDragEnd}
          className={
            stacked
              ? `w-full relative flex shrink-0 items-center justify-center gap-0.5 rounded-md border-2 border-dashed px-1 text-[0.625rem] font-extrabold tabular-nums leading-none text-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ${isChecked ? 'border-white/80 bg-white/20' : 'border-accent bg-accent'}`
              : `w-full rounded-lg border-2 border-dashed px-2 py-1.5 text-[0.6875rem] font-extrabold tabular-nums text-white ${isChecked ? 'border-white/80 bg-white/20' : 'border-accent bg-accent/80'}`
          }
          style={stacked ? { height: extraRowHeight, minHeight: extraRowHeight } : undefined}
        >
          {stacked ? (
            <>
              <input type="checkbox" checked={isChecked} readOnly
                className={`absolute left-0.5 top-0.5 z-10 w-3 h-3 rounded border-white/30 accent-accent transition-colors ${isChecked ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} />
              <Plus className="h-2.5 w-2.5 shrink-0 stroke-[3]" aria-hidden />
            </>
          ) : (
            <Plus className="h-3 w-3 shrink-0" aria-hidden />
          )}
          <span className="truncate">{stacked ? compactLabel : label}</span>
        </button>
      );
    });
  }, [t, selectedShiftIds, toggleSelectShift, handleOpenDrawer, handleDragStart, handleDragEnd, canEdit, extraRowHeight]);

  const renderGroupButton = useCallback((g: DayShiftGroup, layout: 'desktop' | 'mobile', compact = false, extraGroups: DayShiftGroup[] = []) => {
    const isDraft = g.shift.approval_status === 'draft';
    const isApproved = g.shift.approval_status === 'approved';
    const _isConfirmed = g.shift.approval_status === 'confirmed';
    const display = getShiftCellDisplay(g, mode, weekPunchRecords, compact || isPeriodView);
    let borderColor = 'border-cyan-400/50';
    let bgColor = 'bg-white/[0.06]';
    let glow = '';
    if (isDraft) { borderColor = 'border-blue-400/60'; bgColor = 'bg-white/[0.08]'; }
    if (isApproved) { borderColor = 'border-emerald-400/60'; bgColor = 'bg-emerald-500/10'; }
    if (g.isAbsent) { borderColor = 'border-rose-400/60'; bgColor = 'bg-rose-500/10'; }
    if (g.isMissingPunch) { borderColor = 'border-amber-400/60'; bgColor = 'bg-amber-500/10'; }
    if (g.violations?.length && g.violations.length > 0) glow = 'ring-1 ring-rose-400/40';
    // Turno congelato: sfondo verde pieno
    if (isFrozen(g.shift)) { borderColor = 'border-emerald-400/80'; bgColor = 'bg-emerald-600/25'; }

    const timeOnly = (
      <span className={`font-bold tabular-nums whitespace-nowrap ${layout === 'mobile' ? 'text-xs' : compact || isPeriodView ? 'text-[0.6875rem]' : 'text-xs'} ${g.isAbsent ? 'text-rose-400 line-through' : display.missingOut ? 'text-red-400' : 'text-white'}`}>
        {display.main}
      </span>
    );
    const breakBadge = display.breakSuffix ? (
      <span className="shrink-0 text-[0.625rem] font-bold tabular-nums text-amber-400 leading-none">
        {display.breakSuffix}
      </span>
    ) : null;
    const breakBesideIcons = layout === 'desktop' && !isPeriodView;
    const timeLabel = breakBesideIcons ? timeOnly : (
      <span className="inline-flex items-center gap-0.5 max-w-full">
        {timeOnly}
        {!isPeriodView && breakBadge}
      </span>
    );

    const handleShiftClick = (e: React.MouseEvent) => {
      if (e.shiftKey) {
        toggleSelectShift(g.shift.id);
      } else {
        handleOpenDrawer(g.shift);
      }
    };

    if (layout === 'mobile') {
      return (
        <div className="flex flex-col gap-1">
          <button type="button" onClick={handleShiftClick} title={display.title}
            onContextMenu={(e) => handleShiftContextMenu(e, g.shift, g)}
            draggable={canEdit}
            onDragStart={(e) => handleDragStart(e, g.shift.id)}
            onDragEnd={handleDragEnd}
              className={`w-full text-left rounded-lg border-l-4 ${borderColor} ${bgColor} ${glow} px-2.5 py-2 transition-colors ${!isApproved && !isFrozen(g.shift) ? 'border-dashed' : ''}`}>
              <div className="flex items-center justify-between gap-1">
              {timeLabel}
              <div className="flex items-center gap-1 shrink-0">
                {g.isMissingPunch ? <AlertTriangle className="h-3 w-3 text-white" /> : isApproved ? <Check className="h-3 w-3 text-white" /> : isFrozen(g.shift) ? <Lock className="h-3 w-3 text-white" /> : null}
              </div>
            </div>
          </button>
          {renderExtraShiftRows(extraGroups, 'mobile')}
        </div>
      );
    }
    const hasExtras = extraGroups.length > 0;
    const mainRowHeight = hasExtras
      ? Math.max(18, slotRowHeight - extraGroups.length * extraRowHeight - (extraGroups.length > 0 ? 2 : 0))
      : slotRowHeight - (layout === 'desktop' && isPeriodView ? 2 : 4);

    if (layout === 'desktop' && isPeriodView) {
      let accent = 'border-cyan-400';
      if (isDraft) accent = 'border-blue-400';
      else if (isApproved) accent = 'border-emerald-400';
      else if (g.isAbsent) accent = 'border-rose-400';
      else if (g.isMissingPunch) accent = 'border-amber-400';
      else if (display.missingOut) accent = 'border-red-400';
      else if (mode === 'realtime' && g.punchIn) accent = 'border-emerald-400/80';
      return (
        <div className={`flex w-full min-w-0 flex-col ${hasExtras ? 'gap-0.5 justify-center' : ''}`} style={{ minHeight: slotRowHeight - 2 }}>
          <button
            type="button"
            title={display.title ?? formatShiftTimeRangeFull(g.shift.start_time, g.shift.end_time)}
            onClick={handleShiftClick}
            onContextMenu={(e) => handleShiftContextMenu(e, g.shift, g)}
            draggable={canEdit}
            onDragStart={(e) => handleDragStart(e, g.shift.id)}
            onDragEnd={handleDragEnd}
            className={`w-full flex items-center justify-center rounded-md border-l-[0.1875rem] ${accent} transition-colors ${g.isAbsent ? 'opacity-70' : ''} ${!isApproved && !isFrozen(g.shift) ? 'border-dashed' : ''}`}
            style={{ height: mainRowHeight, minHeight: mainRowHeight }}
          >
            {timeLabel}
          </button>
          {renderExtraShiftRows(extraGroups, 'desktop')}
        </div>
      );
    }
    return (
      <div className={`flex w-full min-w-0 flex-col ${hasExtras ? 'gap-0.5 justify-center' : ''}`}>
        <button type="button" onClick={handleShiftClick} title={display.title}
          onContextMenu={(e) => handleShiftContextMenu(e, g.shift, g)}
          draggable={canEdit}
          onDragStart={(e) => handleDragStart(e, g.shift.id)}
          onDragEnd={handleDragEnd}
          className={`relative w-full min-w-0 text-left rounded-lg border ${borderColor} ${bgColor} ${glow} transition-colors ${!isApproved && !isFrozen(g.shift) ? 'border-dashed' : ''} px-0.5 py-0.5`}>
          <input type="checkbox" checked={selectedShiftIds.has(g.shift.id)} onChange={() => toggleSelectShift(g.shift.id)}
            className={`absolute left-0.5 top-0.5 z-10 w-3 h-3 rounded border-white/30 accent-accent transition-colors ${selectedShiftIds.has(g.shift.id) ? 'opacity-100 scale-100' : 'opacity-0 scale-0'}`} onClick={e => e.stopPropagation()} />
          <div
            className="flex items-end justify-center w-full gap-1 px-2 whitespace-nowrap overflow-hidden"
            style={{ minHeight: mainRowHeight, height: mainRowHeight }}
          >
            <span className={`${hasExtras ? 'text-[0.625rem]' : 'text-xs'} font-bold tabular-nums ${g.isAbsent ? 'text-rose-400 line-through' : display.missingOut ? 'text-red-400' : 'text-white'}`}>
              {display.main}
            </span>
          </div>
          <div className="absolute left-1/2 -translate-x-1/2 top-1 flex items-center gap-0.5">
            {breakBadge}
            {g.isMissingPunch ? <AlertTriangle className={`${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'} text-white`} /> : isApproved ? <Check className={`${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'} text-white`} /> : isFrozen(g.shift) ? <Lock className={`${compact ? 'h-2 w-2' : 'h-2.5 w-2.5'} text-white`} /> : null}
          </div>
        </button>
        {renderExtraShiftRows(extraGroups, 'desktop')}
      </div>
    );
  }, [t, mode, weekPunchRecords, isPeriodView, selectedShiftIds, toggleSelectShift, handleOpenDrawer, handleShiftContextMenu, handleDragStart, handleDragEnd, canEdit, extraRowHeight, slotRowHeight, renderExtraShiftRows]);

  return (
    <div ref={gridRootRef} className="w-full flex-1 min-h-0 flex flex-col font-sans">
      {/* Linea divisoria tra dipendenti */}
      <style>{`.wst-employee-row td { border-bottom: 1px solid rgba(255,255,255,0.20) !important; }
.wst-employee-row td { border-top: 1px solid rgba(255,255,255,0.10) !important; }
/* Header tabella opaco su scroll: solo vetro satinato senza colore, offusca il contenuto sottostante */
.wst-header-scrolled { background: transparent !important; backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important; }
.wst-header-scrolled th { color: #ffffff !important; border-bottom-color: rgba(255,255,255,0.12) !important; }
.wst-header-scrolled th.border-b-white { border-bottom-color: white !important; }
.wst-header-scrolled th div { color: #ffffff !important; }
.wst-header-scrolled .text-accent { color: #ffffff !important; }
.wst-col-scrolled.wst-col-scrolled { background-color: rgba(10, 10, 10, 0.55) !important; backdrop-filter: blur(20px) !important; -webkit-backdrop-filter: blur(20px) !important; }
.wst-col-scrolled th { color: #ffffff !important; }`}</style>
      {mode === 'planning' && (
        <style>{`
          [data-theme="dark"][data-toolbar-mode="planning"] button[class*="uppercase"][class*="tracking-wider"] {
            border: 1.5px solid rgba(34, 211, 238, 0.65) !important;
          }
          [data-table-container] {
            border-color: rgba(34, 211, 238, 0.45) !important;
          }
        `}</style>
      )}

      {/* ── Sezione superiore fissa (toolbar + selezioni + mobile view) ── */}
      <div ref={contentAboveRef}>
      {/* Toolbar sticky in tutte le viewport */}
       <div className="ui-toolbar-page-band ui-toolbar-page-band-presences !h-auto !max-h-none min-h-0 mb-3 w-full min-w-0 md:sticky md:top-[3.125rem] md:z-50 py-2"
        data-toolbar-mode={mode}>
        {/* MOBILE: ◀ e ▶ occupano lo spazio ai lati; Oggi + data al centro */}
        <div className="flex w-full min-w-0 items-center gap-1.5 md:hidden">
          <button type="button" onClick={prevWeek} aria-label="Settimana precedente"
            className="flex flex-1 items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-white/60 hover:text-white transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"><ChevronLeft className="h-5 w-5" /></button>
          <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            <button type="button" onClick={goToday}
              className="rounded-lg bg-white/10 px-2.5 py-2 text-white/60 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">{t.today_btn ?? 'Oggi'}</button>
            <span
              className="min-w-0 max-w-full truncate text-sm font-semibold text-white/50 tabular-nums"
              title={`${(() => { const d = weekStart; return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })()} — ${(() => { const d = weekEnd; return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })()}`}
            >
              {(() => { const d = weekStart; return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; })()}
            </span>
          </div>
          <button type="button" onClick={nextWeek} aria-label="Settimana successiva"
            className="flex flex-1 items-center justify-center rounded-lg bg-white/10 px-3 py-2 text-white/60 hover:text-white transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"><ChevronRight className="h-5 w-5" /></button>
        </div>
        {/* DESKTOP: come prima */}
        <div className="hidden md:flex w-full min-w-0 items-center gap-1.5 md:gap-2">
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={prevWeek} aria-label="Settimana precedente"
              className="rounded-lg bg-white/10 px-3 py-2 md:py-1.5 text-white/60 hover:text-white transition-colors md:px-3 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"><ChevronLeft className="h-5 w-5 md:h-4 md:w-4" /></button>
            <button type="button" onClick={goToday}
              className="rounded-lg bg-white/10 px-2.5 py-2 md:py-1.5 text-white/60 hover:text-white transition-colors text-xs md:text-xs font-bold uppercase tracking-wider hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">{t.today_btn ?? 'Oggi'}</button>
            <button type="button" onClick={nextWeek} aria-label="Settimana successiva"
              className="rounded-lg bg-white/10 px-3 py-2 md:py-1.5 text-white/60 hover:text-white transition-colors md:px-3 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"><ChevronRight className="h-5 w-5 md:h-4 md:w-4" /></button>
          </div>
          <span
            className="flex-1 md:flex-none min-w-0 max-w-full truncate text-sm font-semibold text-white/50 tabular-nums"
            title={`${(() => { const d = weekStart; return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })()} — ${(() => { const d = weekEnd; return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; })()}`}
          >
            {(() => { const d = weekStart; return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; })()}
            <span className="hidden md:inline"> — {(() => { const d = weekEnd; return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; })()}</span>
          </span>
          {selectedShiftIds.size > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs font-bold text-white/60 whitespace-nowrap">{selectedShiftIds.size} selezionati</span>
              <button type="button" onClick={async () => {
                if (!sessionActive) {
                  showError(t.require_pin_session ?? 'Attiva la sessione PIN per eliminare in massa.');
                  return;
                }
                for (const id of selectedShiftIds) {
                  const s = allShifts.find(x => x.id === id);
                  if (!s || !canDeleteShift(s)) continue;
                  if (isFrozen(s)) authorizeFrozenDelete(id);
                  try { await deleteShift(id); } catch { /* toast già mostrato */ }
                }
                setSelectedShiftIds(new Set());
              }}
                className="rounded-lg bg-rose-600/20 px-2.5 py-1.5 text-rose-300 hover:bg-rose-600/30 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Mobile: filtri su una riga sola (filtro | sett/periodo | data periodo);
            desktop: riga flessibile allineata a destra */}
        <div className="flex w-full min-w-0 items-center gap-1.5 md:ml-auto md:h-10 md:max-h-10 md:flex-nowrap md:justify-end md:gap-2">
          {departments.length > 1 && (
            <div className="shrink-0 md:flex-none relative">
              <button ref={deptTriggerRef} type="button" onClick={toggleDeptDropdown}
                className="relative flex max-w-none md:max-w-[min(100%,7.5rem)] items-center gap-1 truncate rounded-lg bg-white/10 py-1.5 pl-2 pr-6 text-[0.625rem] md:text-[0.6875rem] font-bold uppercase tracking-wider text-white/60 transition-colors hover:text-white md:px-2.5 md:pr-7 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                <Filter className="h-3 w-3 shrink-0 text-white/40" aria-hidden />
                <span className="truncate">{deptFilter ?? (t.department_filter_all ?? 'Tutti')}</span>
                <ChevronDown className={`pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-white/40 transition-transform ${deptDropdownOpen ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {deptDropdownOpen && createPortal(
                <div ref={deptPopoverRef}
                  className="fixed z-[10050] mt-0 min-w-[8.125rem] overflow-hidden rounded-2xl border border-white/10 py-1"
                  style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', top: deptDropdownStyle.top, left: deptDropdownStyle.left }}>
                  <button type="button" onClick={() => { setDeptFilter(null); setDeptDropdownOpen(false); }}
                    className="w-full px-3 py-1.5 text-left text-[0.6875rem] font-bold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/10">
                    {t.department_filter_all ?? 'Tutti'}
                  </button>
                  {departments.map(d => (
                    <button key={d} type="button" onClick={() => { setDeptFilter(d); setDeptDropdownOpen(false); }}
                      className="w-full px-3 py-1.5 text-left text-[0.6875rem] font-bold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/10">
                      {d}
                    </button>
                  ))}
                </div>,
                document.body
              )}
            </div>
          )}
          <div className="flex flex-1 md:flex-none min-w-0 items-center gap-1 rounded-lg bg-white/5 p-0.5">
            <button type="button" onClick={() => setViewMode('week')}
              className={`flex-1 md:flex-none rounded-md px-1.5 md:px-2.5 py-1.5 text-[0.625rem] md:text-[0.625rem] font-bold uppercase tracking-wider transition-colors ${viewMode === 'week' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/70'}`}>
              <span className="md:hidden">{t.view_week_short ?? 'Sett.'}</span>
              <span className="hidden md:inline">{t.view_week ?? 'Settimana'}</span>
            </button>
            <button type="button" onClick={() => setViewMode('period')}
              className={`flex-1 md:flex-none rounded-md px-1.5 md:px-2.5 py-1.5 text-[0.625rem] md:text-[0.625rem] font-bold uppercase tracking-wider transition-colors ${viewMode === 'period' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white/70'}`}>
              {t.view_period ?? 'Periodo'}
            </button>
          </div>

          <button ref={periodTriggerRef} type="button" onClick={togglePeriodPopover}
            className="flex shrink-0 md:flex-none max-w-none md:max-w-[min(100%,11rem)] items-center gap-1 truncate rounded-lg bg-white/5 px-2 py-1.5 text-[0.625rem] font-bold uppercase tracking-wider text-white/50 transition-colors hover:text-white hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
            <CalendarDays className="h-3 w-3 shrink-0" />
            <span className="truncate md:hidden">
              {format(periodStart, 'd/M', { locale })}–{format(periodEnd, 'd/M', { locale })}
            </span>
            <span className="hidden truncate md:inline">
              {format(periodStart, 'd MMM', { locale })} — {format(periodEnd, 'd MMM', { locale })}
            </span>
            <ChevronDown className="ml-0.5 h-3 w-3 shrink-0" />
          </button>

          {isMgmt && hasWeekDraftShifts && (
            <button
              type="button"
              onClick={() => void handlePublishWeek()}
              aria-label={t.publish_week ?? 'Pubblica settimana'}
              className="hidden md:flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600/20 px-2 py-1.5 text-[0.625rem] md:text-[0.6875rem] font-bold uppercase tracking-wider text-emerald-300 transition-colors hover:bg-emerald-600/30 md:px-2.5"
            >
              <Send className="h-3 w-3 shrink-0" />
              <span className="hidden md:inline">{t.publish_week ?? 'Pubblica settimana'}</span>
            </button>
          )}
          {isMgmt && canFreezeWeek && (
            <button
              type="button"
              onClick={() => void handleFreezeWeek()}
              aria-label={t.freeze_week ?? 'Congela settimana'}
              className="flex flex-1 md:flex-none min-w-0 items-center gap-1 truncate rounded-lg bg-amber-600/20 px-2 py-1.5 text-[0.625rem] md:text-[0.6875rem] font-bold uppercase tracking-wider text-amber-300 transition-colors hover:bg-amber-600/30 md:px-2.5"
            >
              <Lock className="h-3 w-3 shrink-0" />
              <span className="hidden md:inline">{t.freeze_week ?? 'Congela settimana'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleExportPdf()}
            aria-label="Esporta PDF"
            className="hidden md:flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1.5 text-[0.625rem] md:text-[0.6875rem] font-bold uppercase tracking-wider text-white/60 transition-colors hover:text-white md:px-2.5"
          >
            <FileDown className="h-3 w-3 shrink-0" />
            <span className="hidden md:inline">PDF</span>
          </button>

          {(isMgmt || canEdit) && (
          <>
          <div className="relative shrink-0" ref={actionsDrawerTriggerRef}>
            <button
              type="button"
              onClick={() => setActionsDrawerOpen((open) => !open)}
              className={`hidden md:flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-2 py-1.5 text-[0.625rem] md:text-[0.6875rem] font-bold uppercase tracking-wider transition-colors md:px-2.5 ${
 actionsDrawerOpen ? 'text-white' : 'text-white/60 hover:text-white'
 }`}
              aria-expanded={actionsDrawerOpen}
              aria-haspopup="true"
              aria-label={(t as Record<string, string>).wst_toolbar_hamburger_aria ?? 'Apri menu azioni'}
              title={t.actions ?? 'Azioni'}
            >
              <Menu className="h-3 w-3 shrink-0" strokeWidth={2.25} aria-hidden />
              <span className="hidden md:inline">{t.actions ?? 'Azioni'}</span>
            </button>
          </div>

          {actionsDrawerOpen && (
            <CenteredModalPortal
              open
              onClose={closeActionsDrawer}
              panelRef={actionsDrawerPanelRef}
              backdropAriaLabel={t.cancel ?? 'Chiudi'}
              ariaLabel={t.actions ?? 'Azioni'}
              maxWidthClass="max-w-md"
              maxHeightClass="max-h-[min(90dvh,720px)]"
              panelClassName="py-1"
            >
              <div className="border-b border-white/10 px-4 py-2.5 text-sm font-semibold text-white">
                {t.actions ?? 'Azioni'}
              </div>

              {isMgmt && (
                <button
                  type="button"
                  onClick={() => {
                    closeActionsDrawer();
                    void handleCopyWeek();
                  }}
                  className="flex w-full items-center gap-2 border-b border-white/10 px-4 py-2.5 text-left text-sm text-white/85 transition-colors hover:bg-white/10"
                >
                  <Copy className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2.25} />
                  {t.copy_week ?? 'Copia settimana'}
                </button>
              )}

              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setActionsDrawerSection((sec) => (sec === 'templates' ? null : 'templates'))
                    }
                    className="flex w-full items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 text-left transition-colors hover:bg-white/10"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
                      <Save className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2.25} />
                      {t.templates ?? 'Template'}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${
 actionsDrawerSection === 'templates' ? '-rotate-180' : ''
 }`}
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  </button>
                  {actionsDrawerSection === 'templates' && (
                    <div className="border-b border-white/10 px-4 py-3">
                      <div className="mb-2 flex items-center gap-1">
                        <input
                          value={saveTemplateName}
                          onChange={(e) => setSaveTemplateName(e.target.value)}
                          placeholder={t.save_current_as ?? 'Salva come...'}
                          className="flex-1 rounded-lg border border-white/10 bg-white/10 px-2 py-1.5 text-[0.6875rem] font-bold text-white outline-none placeholder:text-white/30"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveTemplate()}
                          disabled={savingTemplate || !saveTemplateName.trim()}
                          className="rounded-lg bg-accent px-2.5 py-1.5 text-[0.625rem] font-bold text-white disabled:opacity-40"
                        >
                          <Save className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {templatesList.length > 0 ? (
                        <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                          {templatesList.map((name) => (
                            <li key={name}>
                              <button
                                type="button"
                                onClick={() => void handleApplyTemplate(name)}
                                className="w-full truncate rounded-lg px-2 py-1.5 text-left text-[0.6875rem] font-bold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                              >
                                {name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="py-2 text-center text-[0.625rem] text-white/40">
                          {t.no_templates ?? 'Nessun template'}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* ── Vista ── */}
              {canEdit && (
                <>
                  <div className="border-b border-white/10 px-3 py-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white/55">
                    {t.wst_view_section ?? 'Vista'}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setActionsDrawerSection((sec) => (sec === 'reorder' ? null : 'reorder'))
                    }
                    className="flex w-full items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5 text-left transition-colors hover:bg-white/10"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-white">
                      <Pencil className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2.25} />
                      {t.edit_view ?? 'Modifica vista'}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${
                        actionsDrawerSection === 'reorder' ? '-rotate-180' : ''
                      }`}
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  </button>
                  {actionsDrawerSection === 'reorder' && (
                    <div className="border-b border-white/10 px-4 py-2 max-h-64 overflow-y-auto space-y-0.5">
                      {users
                        .filter((u) => isUserVisibleOnTeamSchedule(u, allShifts))
                        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                        .map((u, i, arr) => (
                          <div key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/10">
                            <div className="flex flex-col gap-0.5">
                              <button
                                type="button"
                                onClick={() => reorderUsers(u.id, 'up')}
                                disabled={i === 0}
                                className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center hover:bg-white/20 disabled:opacity-20 transition-colors"
                              >
                                <ChevronUp className="w-3 h-3 text-white/70" />
                              </button>
                              <button
                                type="button"
                                onClick={() => reorderUsers(u.id, 'down')}
                                disabled={i === arr.length - 1}
                                className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center hover:bg-white/20 disabled:opacity-20 transition-colors"
                              >
                                <ChevronDown className="w-3 h-3 text-white/70" />
                              </button>
                            </div>
                            <span className="text-xs font-semibold text-white truncate flex-1">
                              {u.first_name.toUpperCase()} {u.last_name ?? ''}
                            </span>
                            <span className="text-[0.625rem] text-white/40 shrink-0">
                              {u.role === 'admin' ? 'Admin' : u.role === 'manager' ? 'Manager' : ''}
                            </span>
                          </div>
                        ))}
                      {users.filter((u) => isUserVisibleOnTeamSchedule(u, allShifts)).length === 0 && (
                        <p className="text-center text-[0.6875rem] text-white/40 py-3">Nessun dipendente attivo</p>
                      )}
                    </div>
                  )}
                </>
              )}

            </CenteredModalPortal>
          )}
          </>
          )}
        </div>
      </div>

      {/* ── Period Popover ── */}
      {showPeriodPopover && createPortal(
          <div ref={periodPopoverRef}
            className="fixed z-[10050] mt-1 rounded-2xl border border-white/10 p-3 md:p-4 w-[calc(100vw-32px)] max-w-[21.25rem] max-h-[85vh] overflow-y-auto"
            style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', top: periodPopoverStyle.top, left: periodPopoverStyle.left, transform: 'translateX(-50%)' }}>
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setPeriodPopoverYear(y => y - 1)}
              className="rounded-lg bg-white/10 px-2 py-1 text-white/60 hover:text-white transition-colors"><ChevronLeft className="h-3.5 w-3.5" /></button>
            <span className="text-sm font-bold text-white">{periodPopoverYear}</span>
            <button type="button" onClick={() => setPeriodPopoverYear(y => y + 1)}
              className="rounded-lg bg-white/10 px-2 py-1 text-white/60 hover:text-white transition-colors"><ChevronRight className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid grid-cols-3 gap-1 md:gap-2">
            {Array.from({ length: 12 }, (_, i) => {
              const refDate = new Date(periodPopoverYear, i, 15);
              const cfg = periodConfigForMonth(refDate);
              const start = getPeriodStartDate(cfg);
              const end = getPeriodEndDate(cfg);
              const isActive = periodNavOffset === 0 && cfg.startDate === periodConfig.startDate && cfg.numWeeks === periodConfig.numWeeks;
              return (
                <button key={i} type="button" onClick={() => applyPeriod(cfg)}
                  className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${isActive ? 'border-accent/50 bg-accent/10' : 'border-white/10 bg-white/[0.04] hover:border-white/20'}`}>
                  <div className={`text-[0.6875rem] font-bold ${isActive ? 'text-accent' : 'text-white'}`}>{format(new Date(periodPopoverYear, i, 15), 'MMM', { locale }).toUpperCase()}</div>
                  <div className="text-[0.5625rem] text-white/40 mt-0.5 leading-tight tabular-nums truncate">
                    {format(start, 'd MMM', { locale }).toUpperCase()} — {format(end, 'd MMM', { locale }).toUpperCase()}
                  </div>
                  <div className="text-[0.5rem] text-white/30 mt-0.5 font-bold uppercase">{(t.ts_period_weeks_abbr ?? '{n} sett.').replace('{n}', String(cfg.numWeeks))}</div>
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}

      {/* ── Mobile Card View (card memoizzate: si ri-renderizzano solo se le loro props cambiano) ── */}
      <div className="md:hidden space-y-4 px-1 pb-4">
        {visibleUsers.map((user) => (
          <ShiftGridMobileCard
            key={user.id}
            user={user}
            totals={totalsByUser[user.id] ?? { planned: 0, actual: 0 }}
            isExpanded={expandedUserIds.has(user.id)}
            hasShifts={usersWithShifts.has(user.id)}
            weekDays={weekDays}
            weekDateStrings={weekDateStrings}
            dayGroupsByUserDate={dayGroupsByUserDate}
            canEdit={canEdit}
            dropTargetKey={dropTargetKey}
            t={t}
            locale={locale}
            renderGroupButton={renderGroupButton}
            onToggleExpanded={toggleUserExpanded}
            onCreateShift={openCreateShiftModal}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          />
        ))}
      </div>
      </div>

      {/* ── Desktop Grid ── */}
      {isPeriodView && (
        <p className="hidden md:block mb-2 text-[0.625rem] font-medium text-white/40">
          {t.period_scroll_hint ?? 'Scorri orizzontalmente per vedere tutti i giorni del periodo.'}
        </p>
      )}
      <div
        ref={tableScrollRef}
        className="hidden md:flex flex-col min-h-0 overflow-auto rounded-2xl border border-white/10"
        style={tableMaxHeight ? { maxHeight: tableMaxHeight } : { flex: '1 1 0', minHeight: 0 }}
        data-table-container
      >
        <table
          className={`table-fixed border-collapse ${isPeriodView ? '' : 'w-full'}`}
          style={{ minWidth: tableMinWidth, width: isPeriodView ? tableMinWidth : undefined }}
        >
          <colgroup>
            <col style={{ width: employeeColWidth }} />
            {weekDays.map((_, i) => (
              <col key={i} style={{ width: isPeriodView ? dayColMinWidth : dayColCalc }} />
            ))}
            <col style={{ width: totalColWidth }} />
          </colgroup>
          <thead className={`sticky top-0 z-20 transition-colors duration-200 ${tableScrolled ? 'wst-header-scrolled' : 'bg-transparent'}`}>
            <tr>
              <th className={`sticky left-0 z-30 text-left px-2 py-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white/50 border-b border-white/10 transition-colors duration-200 ${hScrolled ? 'wst-col-scrolled' : ''}`}>
                {t.employee ?? 'Dipendente'}
              </th>
              {weekDays.map((day, i) => {
                const _weekStripe = isPeriodView && Math.floor(i / 7) % 2 === 1;
                const weekEnd = isPeriodView && day.getDay() === 0;
                return (
                  <th
                    key={i}
                    title={format(day, 'EEEE d MMMM', { locale })}
                    className={`px-1.5 py-1.5 text-center border-b border-white/10 ${weekEnd ? 'border-r-2 border-r-white/20' : ''} ${isToday(day) ? '!border-b-white' : ''}`}
                  >
                    {isPeriodView ? (
                      <>
                        <div className={`text-[0.5625rem] font-bold uppercase leading-none ${isToday(day) ? 'text-white/60' : 'text-white/20'}`}>{format(day, 'EEEEE', { locale })}</div>
                        <div className={`text-sm font-black leading-tight ${isToday(day) ? 'text-white' : 'text-white/45'}`}>{format(day, 'd')}</div>
                      </>
                    ) : (
                      <>
                        <div className={`text-[0.625rem] font-bold uppercase tracking-wider ${isToday(day) ? 'text-white/80' : 'text-white/25'}`}>{format(day, 'EEE', { locale })}</div>
                        <div className={`text-sm font-black ${isToday(day) ? 'text-white' : 'text-white/50'}`}>{format(day, 'd')}</div>
                      </>
                    )}
                  </th>
                );
              })}
              <th className="px-1 py-2.5 text-center border-b border-white/10">
                <div className="text-[0.625rem] font-bold uppercase tracking-wider text-white/40">{t.total_hours ?? 'Ore'}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.map((user) => (
              <ShiftGridDesktopRow
                key={user.id}
                user={user}
                totals={totalsByUser[user.id] ?? { planned: 0, actual: 0 }}
                weekDays={weekDays}
                dayGroupsByUserDate={dayGroupsByUserDate}
                isPeriodView={isPeriodView}
                compactGrid={compactGrid}
                canEdit={canEdit}
                hScrolled={hScrolled}
                slotRowHeight={slotRowHeight}
                slotCellHeight={slotCellHeight}
                dropTargetKey={dropTargetKey}
                t={t}
                renderGroupButton={renderGroupButton}
                onCreateShift={openCreateShiftModal}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onReviewClick={handleReviewQueueClick}
              />
            ))}
          </tbody>
        </table>
        <div className="h-12 shrink-0" />
      </div>

      {/* ── Detail Drawer ── */}
      {createPortal(
        <AnimatePresence>
          {drawerOpen && selectedShift && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center px-4" onClick={handleCloseDrawer}>
          <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-3xl rounded-2xl border border-white/15 p-5 shadow-2xl max-h-[90vh] z-10 flex flex-col"
            style={{ background: 'transparent', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: `2px solid ${isFrozen(selectedShift) || selectedShift.approval_status === 'approved' ? '#34d399' : selectedShift.approval_status === 'confirmed' ? '#67e8f9' : 'rgba(255,255,255,0.2)'}40`, boxShadow: `0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.08), 0 0 24px ${isFrozen(selectedShift) || selectedShift.approval_status === 'approved' ? '#34d399' : selectedShift.approval_status === 'confirmed' ? '#67e8f9' : 'rgba(255,255,255,0.2)'}20` }}
            onClick={e => e.stopPropagation()}
          >
            <div className="shrink-0">
            {/* Mobile: pulsanti in alto, a tutta larghezza */}
            <div className="mb-2 flex items-stretch gap-2 md:hidden">
              {reviewQueue && (
                <>
                  <span className="flex items-center text-[0.625rem] font-bold text-white/50 tabular-nums">{reviewIdx + 1}/{reviewQueue.length}</span>
                  <button type="button" disabled={reviewIdx <= 0} onClick={() => { const next = reviewIdx - 1; if (next >= 0) { setReviewIdx(next); handleOpenDrawer(reviewQueue[next]); } }} className="flex-1 flex items-center justify-center rounded-lg bg-white/10 px-2 py-2 text-white/50 hover:text-white hover:bg-white/20 transition-colors disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" disabled={reviewIdx >= reviewQueue.length - 1} onClick={() => { const next = reviewIdx + 1; if (next < reviewQueue.length) { setReviewIdx(next); handleOpenDrawer(reviewQueue[next]); } }} className="flex-1 flex items-center justify-center rounded-lg bg-white/10 px-2 py-2 text-white/50 hover:text-white hover:bg-white/20 transition-colors disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
                </>
              )}
              {canDeleteShift(selectedShift) && !drawerDeleteConfirm && (
                <button type="button" onClick={() => setDrawerDeleteConfirm(true)}
                  className="flex-1 flex items-center justify-center rounded-lg bg-rose-600/20 px-2 py-2 text-rose-300 hover:bg-rose-600/30 transition-colors" title={t.delete ?? 'Elimina'}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              {canDeleteShift(selectedShift) && drawerDeleteConfirm && (
                <div className="flex-1 flex items-center justify-center gap-1.5">
                  <button type="button" onClick={() => setDrawerDeleteConfirm(false)}
                    className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[0.625rem] font-bold text-white/70 hover:bg-white/20 transition-colors whitespace-nowrap">
                    {t.cancel ?? 'Annulla'}
                  </button>
                  <button type="button" onClick={() => void handleDeleteShift(selectedShift, { skipConfirm: true })}
                    className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[0.625rem] font-bold text-white hover:bg-rose-700 transition-colors whitespace-nowrap">
                    {t.wst_confirm_delete_btn ?? 'Conferma elimina'}
                  </button>
                </div>
              )}
              {canEdit && !isFrozen(selectedShift) && selectedShift.approval_status !== 'draft' && (
                <button type="button" onClick={() => handleFreezeShift(selectedShift)}
                  className="flex-1 flex items-center justify-center rounded-lg bg-emerald-600/20 px-2 py-2 text-emerald-300 hover:bg-emerald-600/30 transition-colors" title={t.ts_drawer_freeze_btn ?? 'Congela'}>
                  <Unlock className="h-4 w-4" />
                </button>
              )}
              {isAdminOnly(currentUser) && shiftAuditEntries && shiftAuditEntries.length > 0 && (
                <button type="button" onClick={() => setShowShiftAuditModal(true)}
                  className="flex-1 flex items-center justify-center rounded-lg bg-white/10 px-2 py-2 text-white/50 hover:text-white hover:bg-white/20 transition-colors"
                  title={(t as Record<string, string>).shift_edit_history ?? 'Storico modifiche'}
                  aria-label={(t as Record<string, string>).shift_edit_history ?? 'Storico modifiche'}>
                  <History className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={handleCloseDrawer} className="flex-1 flex items-center justify-center rounded-lg bg-white/10 px-2 py-2 text-white/50 hover:text-white hover:bg-white/20 transition-colors"><X className="h-4 w-4" /></button>
            </div>

            {/* Riga principale: nome/data (mobile: sotto i pulsanti) */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="min-w-0 flex flex-wrap items-baseline gap-x-1.5">
                <h3 className="text-base md:text-sm font-bold text-white">{selectedUser?.first_name ?? ''} {selectedUser?.last_name ?? ''}</h3>
                {drawerIsExtraShift && (
                  <span className="inline-block mt-0.5 rounded-md bg-accent/20 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wider text-accent">
                    {t.extra_shift ?? 'Turno aggiuntivo'}
                  </span>
                )}
                <p className="text-xs md:text-[0.6875rem] text-white font-semibold uppercase">· {format(parseISO(selectedShift.date), 'EEEE d MMMM', { locale })} — {selectedShift.start_time?.slice(0, 5)}-{selectedShift.end_time?.slice(0, 5)}</p>
              </div>
              <div className="hidden md:flex shrink-0 items-center gap-2">
                {reviewQueue && (
                  <>
                    <span className="text-[0.625rem] font-bold text-white/50 tabular-nums">{reviewIdx + 1}/{reviewQueue.length}</span>
                    <button type="button" disabled={reviewIdx <= 0} onClick={() => { const next = reviewIdx - 1; if (next >= 0) { setReviewIdx(next); handleOpenDrawer(reviewQueue[next]); } }} className="rounded-lg bg-white/10 px-4 py-1 text-white/50 hover:text-white hover:bg-white/20 transition-colors disabled:opacity-30 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"><ChevronLeft className="h-4 w-4" /></button>
                    <button type="button" disabled={reviewIdx >= reviewQueue.length - 1} onClick={() => { const next = reviewIdx + 1; if (next < reviewQueue.length) { setReviewIdx(next); handleOpenDrawer(reviewQueue[next]); } }} className="rounded-lg bg-white/10 px-4 py-1 text-white/50 hover:text-white hover:bg-white/20 transition-colors disabled:opacity-30 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"><ChevronRight className="h-4 w-4" /></button>
                  </>
                )}
                {/* Desktop: chip turni + azioni a icona */}
                <div className="flex items-center gap-2">
                  {(() => {
                    const dayShifts = weekShifts
                      .filter(s => s.user_id === selectedShift.user_id && s.date === selectedShift.date)
                      .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));
                    if (dayShifts.length <= 1) return null;
                    return (
                      <div className="flex flex-wrap gap-1">
                        {dayShifts.map(s => {
                          const isActive = s.id === selectedShift.id;
                          return (
                            <div
                              key={s.id}
                              className={`rounded-md px-2 py-1 text-[0.625rem] font-bold tabular-nums ${isActive ? 'bg-accent text-white' : 'bg-white/10 text-white/60'}`}
                            >
                              {formatShiftTimeRangeFull(s.start_time, s.end_time)}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  {canDeleteShift(selectedShift) && !drawerDeleteConfirm && (
                    <button type="button" onClick={() => setDrawerDeleteConfirm(true)}
                      className="rounded-lg bg-rose-600/20 p-2 text-rose-300 hover:bg-rose-600/30 transition-colors" title={t.delete ?? 'Elimina'}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  {canDeleteShift(selectedShift) && drawerDeleteConfirm && (
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => setDrawerDeleteConfirm(false)}
                        className="rounded-lg bg-white/10 px-2.5 py-1.5 text-[0.625rem] font-bold text-white/70 hover:bg-white/20 transition-colors whitespace-nowrap">
                        {t.cancel ?? 'Annulla'}
                      </button>
                      <button type="button" onClick={() => void handleDeleteShift(selectedShift, { skipConfirm: true })}
                        className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-[0.625rem] font-bold text-white hover:bg-rose-700 transition-colors whitespace-nowrap">
                        {t.wst_confirm_delete_btn ?? 'Conferma elimina'}
                      </button>
                    </div>
                  )}
                  {canEdit && !isFrozen(selectedShift) && selectedShift.approval_status !== 'draft' && (
                    <button type="button" onClick={() => handleFreezeShift(selectedShift)}
                      className="rounded-lg bg-emerald-600/20 p-2 text-emerald-300 hover:bg-emerald-600/30 transition-colors" title={t.ts_drawer_freeze_btn ?? 'Congela'}>
                      <Unlock className="h-4 w-4" />
                    </button>
                  )}
                  {isAdminOnly(currentUser) && shiftAuditEntries && shiftAuditEntries.length > 0 && (
                    <button type="button" onClick={() => setShowShiftAuditModal(true)}
                      className="rounded-lg bg-white/10 p-2 text-white/50 hover:text-white hover:bg-white/20 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                      title={(t as Record<string, string>).shift_edit_history ?? 'Storico modifiche'}
                      aria-label={(t as Record<string, string>).shift_edit_history ?? 'Storico modifiche'}>
                      <History className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button type="button" onClick={handleCloseDrawer} className="rounded-lg bg-white/10 p-2 text-white/50 hover:text-white hover:bg-white/20 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"><X className="h-4 w-4" /></button>
              </div>
            </div>
            </div>
            <div className="flex-1 grid min-w-0 grid-cols-1 md:grid-cols-2 gap-3 min-h-0 overflow-y-auto md:overflow-visible">
              {/* Left column: Time editing, Status (no dept), Breaks */}
              <div className="min-w-0 space-y-3">
                {(() => {
                  // Stessa colorazione della cella nella tabella turni
                  const sFrozen = isFrozen(selectedShift);
                  const status = selectedShift.approval_status;
                  let borderColor = 'border-cyan-400/50';
                  let bgColor = 'bg-white/[0.06]';
                  let textColor = 'text-cyan-300';
                  if (status === 'draft') { borderColor = 'border-blue-400/60'; bgColor = 'bg-white/[0.08]'; textColor = 'text-blue-300'; }
                  else if (status === 'approved') { borderColor = 'border-emerald-400/60'; bgColor = 'bg-emerald-500/10'; textColor = 'text-emerald-300'; }
                  else if (status === 'absent') { borderColor = 'border-rose-400/60'; bgColor = 'bg-rose-500/10'; textColor = 'text-rose-300'; }
                  if (sFrozen) { borderColor = 'border-emerald-400/80'; bgColor = 'bg-emerald-600/25'; textColor = 'text-emerald-300'; }
                  return (
                    <div className={`rounded-xl border p-3 space-y-2 ${borderColor} ${bgColor} ${status !== 'approved' && !sFrozen ? 'border-dashed' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[0.6875rem] font-bold text-white/50 uppercase tracking-wider">{t.status ?? 'Stato'}</span>
                        <span className={`text-[0.6875rem] font-bold uppercase tracking-wider ${textColor}`}>
                          {status === 'approved' ? (t.status_approved ?? 'Approvato') :
                            sFrozen ? (t.wst_frozen_badge ?? 'Congelato') :
                            status === 'confirmed' ? (t.status_confirmed ?? 'Pubblicato') :
                            status === 'draft' ? (t.status_draft ?? 'Bozza') :
                            status === 'absent' ? 'Non ha lavorato' :
                            status}
                        </span>
                      </div>
                    </div>
                  );
                })()}
                {canEdit && (selectedShift.approval_status === 'draft' || selectedShift.approval_status === 'confirmed') && (
                  <div className="rounded-xl bg-gradient-to-br from-sky-500/10 to-blue-600/10 p-3 space-y-3">
                    <div>
                      <label className="text-[0.625rem] font-bold uppercase tracking-wider text-white/50 block mb-1">{t.start_time ?? 'Inizio'}</label>
                      <TimeInputField value={editStartTime} onChange={setEditStartTime} size="md" className="w-full" disabled={selectedShift.approval_status === 'confirmed'} />
                    </div>
                    <div>
                      <label className="text-[0.625rem] font-bold uppercase tracking-wider text-white/50 block mb-1">{t.end_time ?? 'Fine'}</label>
                      <TimeInputField value={editEndTime} onChange={setEditEndTime} size="md" className="w-full" disabled={selectedShift.approval_status === 'confirmed'} />
                    </div>
                    <button type="button" onClick={handleSaveShiftEdit} disabled={saving || selectedShift.approval_status === 'confirmed'}
                      className={`${timeUnsaved ? 'glow-pulse ' : ''}w-full rounded-lg bg-accent px-4 py-2.5 text-[0.6875rem] font-bold text-white hover:bg-accent-hover disabled:opacity-40 transition-colors uppercase tracking-wider hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}>
                      {saving ? (t.saving ?? 'Salvataggio...') : <><Save className="h-3.5 w-3.5 inline-block mr-1.5" />{t.save_changes ?? 'Salva modifiche'}</>}
                    </button>
                  </div>
                )}
              </div>
              {/* Right column: Punches — hidden for draft shifts */}
              <div className="min-w-0 flex flex-col space-y-3">
                {selectedShift && selectedShift.approval_status !== 'draft' && (() => {
                  const { in: punchIn, out: punchOut } = getPunchForShift(selectedShift);
                  const hasIn = !!punchIn; const hasOut = !!punchOut;
                  const showEditFields = canEdit && !isFrozen(selectedShift);
                  return (
                    <div className="space-y-3">
                      <div className={`flex items-center gap-2 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-600/10 p-3 ${(!hasIn && !hasOut) ? 'border-2 border-amber-500/60 animate-pulse' : ''}`}>
                        <span className="text-[0.625rem] font-bold uppercase tracking-wider text-white/50">{t.status ?? 'Stato'}:</span>
                        {!hasIn && !hasOut ? (
                          <span className="flex items-center gap-1 text-[0.6875rem] font-bold text-amber-400"><AlertTriangle className="h-3 w-3" />{t.not_clocked ?? 'Non timbrato'}</span>
                        ) : hasIn && !hasOut ? (
                          <span className="flex items-center gap-1 text-[0.6875rem] font-bold text-accent"><Clock className="h-3 w-3" />{t.clocked_in_only ?? 'Solo entrata'}</span>
                        ) : (
                          <span className="flex items-center gap-1 text-[0.6875rem] font-bold text-emerald-400"><Check className="h-3 w-3" />{t.clocked_complete ?? 'Timbratura completa'}</span>
                        )}
                      </div>
                      <div className="rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-600/10 p-3 space-y-3">
                        {showEditFields ? (
                          <>
                            <div>
                              <label className="text-[0.625rem] font-bold uppercase tracking-wider text-white/50 block mb-1">
                                {t.punch_in ?? 'Entrata'}
                              </label>
                              <TimeInputField value={editIn} onChange={setEditIn} size="md" onMinutesEnter={() => { editOutHourRef.current?.focus(); editOutHourRef.current?.select(); }} className={`w-full ${editIn ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/20 bg-white/10'}`} />
                            </div>
                            <div>
                              <label className="text-[0.625rem] font-bold uppercase tracking-wider text-white/50 block mb-1">
                                {t.punch_out ?? 'Uscita'}
                              </label>
                              <TimeInputField value={editOut} onChange={setEditOut} size="md" hourInputRef={editOutHourRef} className={`w-full ${editOut ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/20 bg-white/10'}`} />
                            </div>
                            <button type="button" onClick={() => void handleConfirmPunches()} disabled={saving || (!editIn && !editOut)}
                              className={`${punchActionRequired ? 'glow-pulse ' : ''}w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-[0.6875rem] font-bold text-white hover:bg-emerald-700 transition-colors uppercase tracking-wider`}>
                              <Check className="h-3.5 w-3.5 inline-block mr-1.5" />{t.confirm_punches ?? 'Conferma timbrature'}
                            </button>
                          </>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[0.625rem] font-bold text-white/50 uppercase tracking-wider">{t.punch_in ?? 'Entrata'}</span>
                              <span className="text-[0.6875rem] font-bold text-white tabular-nums">{editIn || '—'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-[0.625rem] font-bold text-white/50 uppercase tracking-wider">{t.punch_out ?? 'Uscita'}</span>
                              <span className="text-[0.6875rem] font-bold text-white tabular-nums">{editOut || '—'}</span>
                            </div>
                            {isFrozen(selectedShift) && (
                              <p className="text-[0.625rem] text-amber-400/70 text-center pt-2">{t.wst_frozen_readonly_hint ?? 'Turno congelato — sola lettura'}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
              {/* Componente unico in basso: riepilogo ore + detrae pausa */}
              {selectedShift && (() => {
                const { in: punchIn, out: punchOut } = getPunchForShift(selectedShift);
                const hasActual = !!(punchIn?.calculated_time || punchIn?.timestamp) && !!(punchOut?.calculated_time || punchOut?.timestamp);
                const actualStart = hasActual ? (punchIn!.calculated_time || punchIn!.timestamp) : null;
                const actualEnd = hasActual ? (punchOut!.calculated_time || punchOut!.timestamp) : null;
                const grossMins = actualStart && actualEnd
                  ? (() => {
                      const startMs = new Date(actualStart).getTime();
                      let endMs = new Date(actualEnd).getTime();
                      if (endMs <= startMs) endMs += 24 * 60 * 60 * 1000;
                      return (endMs - startMs) / 60000;
                    })()
                  : calculateShiftMinutesGross(selectedShift.start_time ?? '', selectedShift.end_time ?? '');
                const shiftUser = users.find((u) => u.id === selectedShift.user_id);
                const breakMins = getBreakMinutesForShift({ ...selectedShift, deduct_break: deductBreak }, grossMins, shiftUser ?? null, breakRules,
                  editIn && editOut ? { breakRuleWindow: { start: editIn, end: editOut } } : undefined);
                const netMins = Math.max(0, grossMins - breakMins);
                const _hasAutoBreak = grossMins >= AUTO_BREAK_THRESHOLD_MINUTES && isAutoBreak;
                const frozen = isFrozen(selectedShift);
                return (
                  <div className="col-span-1 md:col-span-2">
                    <div className="rounded-xl bg-gradient-to-br from-violet-500/10 to-pink-600/10 px-3 py-2">
                      <div className="flex min-h-[2.375rem] items-center justify-between gap-3">
                        {/* Lato sinistro: riepilogo ore */}
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="text-sm font-bold text-white tabular-nums" title={t.gross_hours ?? 'Ore lorde'}>{formatMinutesToHoursAndMinutes(grossMins)}</span>
                          <span className="text-sm text-white/25">→</span>
                          <span className="text-sm font-black text-emerald-400 tabular-nums" title={t.net_hours ?? 'Ore nette'}>{formatMinutesToHoursAndMinutes(netMins)}</span>
                          {breakMins > 0 && (
                            <span className="text-sm font-bold text-amber-400 tabular-nums" title={t.break_deduction ?? 'Detrazione pausa'}>−{breakMins}'</span>
                          )}
                        </div>
                        {/* Lato destro: pulsante Salva (affianco alla spunta) + toggle pausa */}
                        {!frozen && (
                          <div className="flex shrink-0 items-center gap-3">
                            <AnimatePresence>
                              {breakUnsaved && (
                                <motion.button
                                  type="button" onClick={() => void handleSaveBreakSettings()} disabled={saving}
                                  initial={{ opacity: 0, scale: 0.6, y: 6 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.6, y: 6 }}
                                  transition={{ duration: 0.18, ease: 'easeOut' }}
                                  className="glow-pulse hidden md:flex shrink-0 items-center rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[0.625rem] font-bold text-white hover:bg-emerald-700 transition-colors uppercase tracking-wider disabled:opacity-40"
                                >
                                  {saving ? (t.saving ?? 'Salvataggio...') : <><Check className="h-3 w-3 inline-block mr-1" />{t.save ?? 'Salva'}</>}
                                </motion.button>
                              )}
                            </AnimatePresence>
                            <label className="flex items-center gap-2 cursor-pointer" aria-label={t.deduct_break_label ?? 'Detrae pausa'}>
                              <input type="checkbox" checked={deductBreak} onChange={handleDeductBreakToggle}
                                className="w-4 h-4 rounded border-white/30 bg-white/10 accent-accent" />
                              {breakUnsaved ? (
                                <button
                                  type="button"
                                  onClick={(e) => { e.preventDefault(); void handleSaveBreakSettings(); }}
                                  disabled={saving}
                                  className="glow-pulse md:hidden rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[0.625rem] font-bold text-white hover:bg-emerald-700 transition-colors uppercase tracking-wider disabled:opacity-40"
                                >
                                  {saving ? (t.saving ?? 'Salvataggio...') : <><Check className="h-3 w-3 inline-block mr-1" />{t.save ?? 'Salva'}</>}
                                </button>
                              ) : (
                                <span className="text-sm font-bold text-white whitespace-nowrap">{t.deduct_break_label ?? 'Detrae pausa'}</span>
                              )}
                            </label>
                            {deductBreak && _hasAutoBreak && (
                              <label className="flex items-center gap-2 cursor-pointer" aria-label={t.auto_break_label ?? 'Pausa automatica (≥6h)'}>
                                <input type="checkbox" checked={isAutoBreak} onChange={handleAutoBreakToggle}
                                  className="w-4 h-4 rounded border-white/30 bg-white/10 accent-accent" />
                                <span className="text-[0.625rem] font-bold text-amber-400 whitespace-nowrap">{t.auto_break_label ?? 'Pausa automatica (≥6h)'}</span>
                              </label>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
              {/* Bottom row: Action buttons */}
              <div className="col-span-1 md:col-span-2 flex flex-wrap gap-2">
                {canEdit && isFrozen(selectedShift) && (
                  <button type="button" onClick={() => handleUnfreezeShift(selectedShift)}
                    className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent/20 px-3 py-2 text-[0.6875rem] font-bold text-accent hover:bg-accent/30 transition-colors border border-transparent hover:border-accent/30">
                    <Lock className="h-3.5 w-3.5" />{t.wst_unfreeze_btn ?? 'Sblocca'}
                  </button>
                )}
              </div>
            </div>
            </motion.div>
        </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Modale Storico modifiche (solo admin, separata dalla modale del turno) ── */}
      {createPortal(
        <AnimatePresence>
          {showShiftAuditModal && shiftAuditEntries && (
        <div className="fixed inset-0 z-[10051] flex items-center justify-center px-4" onClick={() => setShowShiftAuditModal(false)}>
          <motion.div className="absolute inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative z-10 flex h-[70vh] max-h-[82vh] w-full max-w-xl flex-col rounded-2xl p-4 shadow-2xl"
            style={{ background: 'transparent', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.08)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-white/70" aria-hidden />
                <h3 className="text-sm font-bold text-white">
                  {(t as Record<string, string>).shift_edit_history ?? 'Storico modifiche'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowShiftAuditModal(false)}
                className="rounded-lg bg-white/10 p-2 text-white/50 hover:text-white hover:bg-white/20 transition-colors"
                aria-label={t.close ?? 'Chiudi'}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Intestazione tabella — sempre visibile (fuori dallo scroll) */}
            <div className="mb-1 grid grid-cols-[minmax(110px,auto)_1fr_auto] items-center gap-2.5 px-3 text-[0.625rem] font-bold uppercase tracking-wider text-white/60">
              <span>{(t as Record<string, string>).audit_col_change ?? 'Modifica'}</span>
              <span>{(t as Record<string, string>).audit_col_detail ?? 'Dettaglio'}</span>
              <span className="justify-self-end">{(t as Record<string, string>).audit_col_author ?? 'Autore'}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {(() => {
                const tv = t as Record<string, string>;
                const actionLabel: Record<string, string> = {
                  create: t.hist_action_create ?? 'Creato',
                  update: t.hist_action_update ?? 'Modificato',
                  shift_edit: tv.hist_action_shift_edit ?? 'Modifica',
                  delete: t.hist_action_delete ?? 'Eliminato',
                  publish: t.hist_action_publish ?? 'Pubblicato',
                  bulk_delete: t.hist_action_bulk_delete ?? 'Eliminazione multipla',
                  bulk_approve: t.hist_action_bulk_approve ?? 'Approvazione multipla',
                };
                const actionColor: Record<string, string> = {
                  create: 'bg-accent/25 text-accent',
                  update: 'bg-amber-500/25 text-amber-300',
                  shift_edit: 'bg-sky-500/25 text-sky-300',
                  delete: 'bg-red-500/25 text-red-300',
                  publish: 'bg-accent/20 text-accent',
                  bulk_delete: 'bg-red-500/25 text-red-300',
                  bulk_approve: 'bg-accent/25 text-accent',
                };
                const fieldLabels: Record<string, string> = {
                  start_time: tv.field_start_time ?? 'Ora inizio',
                  end_time: tv.field_end_time ?? 'Ora fine',
                  date: tv.field_date ?? 'Data',
                  user_id: tv.field_user_id ?? 'Dipendente',
                  approval_status: tv.field_approval_status ?? 'Stato',
                  punch_confirm: tv.field_punch_confirm ?? 'Timbrature',
                  deduct_break: tv.field_deduct_break ?? 'Pausa',
                  is_auto_break: tv.field_is_auto_break ?? 'Pausa automatica',
                  type: tv.field_type ?? 'Tipo turno',
                };
                // Colore associato a ogni campo: stesso schema di colori della modale del turno
                const fieldColor: Record<string, string> = {
                  start_time: 'bg-sky-500/25 text-sky-300',
                  end_time: 'bg-blue-500/25 text-blue-300',
                  date: 'bg-indigo-500/25 text-indigo-300',
                  user_id: 'bg-fuchsia-500/25 text-fuchsia-300',
                  approval_status: 'bg-cyan-500/25 text-cyan-300',
                  punch_confirm: 'bg-amber-500/25 text-amber-300',
                  deduct_break: 'bg-violet-500/25 text-violet-300',
                  is_auto_break: 'bg-pink-500/25 text-pink-300',
                  type: 'bg-teal-500/25 text-teal-300',
                };
                // Descrizione leggibile: date ISO → GG/MM/AAAA (ovunque) e orari senza secondi
                const prettyDesc = (d?: string | null) =>
                  (d ?? '')
                    .replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3/$2/$1')
                    .replace(/(\d{2}:\d{2}):00/g, '$1');
                // Rimuove il prefisso ridondante ("Turno creato: …") già espresso dal chip di azione
                const cleanDesc = (d?: string | null) =>
                  prettyDesc(d)
                    .replace(/^(Turno (?:creato|eliminato|confermato):\s*)/i, '')
                    .replace(/^(\d+)\s*turni eliminati$/i, '$1 turni');
                const fieldLabel = (f?: string | null) => (f ? fieldLabels[f] ?? f : '');
                const fmtWhen = (iso?: string | null) =>
                  iso
                    ? new Date(iso).toLocaleString(getIntlLocale(effectiveLanguage), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
                    : '';
                return shiftAuditEntries.map((entry) => {
                  const hasField = !!entry.field && entry.old_value !== undefined && entry.new_value !== undefined && entry.old_value !== entry.new_value;
                  const chipClass = hasField && entry.field
                    ? (fieldColor[entry.field] ?? 'bg-sky-500/25 text-sky-300')
                    : (actionColor[entry.action] ?? 'bg-white/15 text-white/85');
                  return (
                    <div key={entry.id} className="grid grid-cols-[minmax(110px,auto)_1fr_auto] items-center gap-2.5 rounded-lg border border-white/15 px-3 py-2 uppercase">
                      {/* Col 1: la modifica effettuata (es. "Ora inizio"); senza campo, l'azione (es. "Creato") */}
                      <span className={`justify-self-start rounded-full px-2 py-1 text-[0.6875rem] font-bold ${chipClass}`}>
                        {hasField ? fieldLabel(entry.field) : (actionLabel[entry.action] ?? entry.action)}
                      </span>
                      {/* Col 2: dettaglio del cambio (il campo è già nel chip in col 1) */}
                      {hasField ? (
                        <p className="min-w-0 truncate text-xs text-white/70" title={`${tv.audit_from ?? 'da'} ${prettyDesc(entry.old_value)} ${tv.audit_to ?? 'a'} ${prettyDesc(entry.new_value)}`}>
                          {tv.audit_from ?? 'da'} {prettyDesc(entry.old_value)} {tv.audit_to ?? 'a'} {prettyDesc(entry.new_value)}
                        </p>
                      ) : (
                        <p className="min-w-0 truncate text-[0.8125rem] font-semibold text-white" title={cleanDesc(entry.description)}>
                          {cleanDesc(entry.description)}
                        </p>
                      )}
                      {/* Col 3: chi e quando */}
                      <p className="justify-self-end whitespace-nowrap text-xs text-white/55">
                        {entry.actor_name ?? 'Sistema'} · {fmtWhen(entry.created_at)}
                      </p>
                    </div>
                  );
                });
              })()}
            </div>
          </motion.div>
        </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Create Shift Modal ── */}
      {createPortal(
        <AnimatePresence>
          {createModal && (
        <div className="fixed inset-0 z-[10050] flex items-center justify-center" onClick={() => setCreateModal(null)}>
          <motion.div className="fixed inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-lg rounded-2xl border border-white/15 p-5 shadow-2xl z-10 bg-transparent"
            style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">{t.create_shift ?? 'Nuovo turno'}</h3>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-[0.625rem] font-bold uppercase tracking-wider text-white/50 block mb-1">{t.start_time ?? 'Inizio'}</label>
                <TimeInputField value={createStart} onChange={setCreateStart} size="md" className="w-full border-white/20 bg-white/10" />
              </div>
              <div>
                <label className="text-[0.625rem] font-bold uppercase tracking-wider text-white/50 block mb-1">{t.end_time ?? 'Fine'}</label>
                <TimeInputField value={createEnd} onChange={setCreateEnd} size="md" className="w-full border-white/20 bg-white/10" />
              </div>
              <div className="space-y-4">
                {createModal.hasExisting ? (
                  <ShiftSlotPresetsSection
                    startTime={createStart}
                    endTime={createEnd}
                    onApply={(start, end) => {
                      setCreateStart(start);
                      setCreateEnd(end);
                    }}
                    slotOverride={getShiftSlotFromStartTime(createStart)}
                    onAutoCreate={(s, e) => handleCreateShift(s, e)}
                  />
                ) : (
                  <>
                    <ShiftSlotPresetsSection
                      startTime={createStart}
                      endTime={createEnd}
                      onApply={(start, end) => {
                        setCreateStart(start);
                        setCreateEnd(end);
                      }}
                      slotOverride="lunch"
                      onAutoCreate={(s, e) => handleCreateShift(s, e)}
                    />
                    <ShiftSlotPresetsSection
                      startTime={createStart}
                      endTime={createEnd}
                      onApply={(start, end) => {
                        setCreateStart(start);
                        setCreateEnd(end);
                      }}
                      slotOverride="evening"
                      onAutoCreate={(s, e) => handleCreateShift(s, e)}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCreateModal(null)}
                className="flex-1 rounded-lg border border-white/20 px-4 py-2.5 text-[0.6875rem] font-bold text-white/70 hover:bg-white/[0.07] hover:text-white uppercase tracking-wider"
              >{t.cancel ?? 'Annulla'}</button>
              <button type="button" onClick={() => handleCreateShift()} disabled={saving}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-[0.6875rem] font-bold text-white hover:bg-accent/80 disabled:opacity-60 uppercase tracking-wider flex items-center justify-center gap-1.5"
              >
                {saving ? (
                  <><span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Salvando…</>
                ) : (
                  <><Plus className="h-3.5 w-3.5" />{t.create ?? 'Crea'}</>
                )}
              </button>
            </div>
          </motion.div>
        </div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* ── Drop confirm modal ── */}
      <AnimatePresence>
      {dropConfirm && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={() => setDropConfirm(null)}>
          <motion.div className="fixed inset-0 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-xs rounded-2xl border border-white/15 p-5 shadow-2xl z-10 bg-white/[0.04]"
            style={{ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-white mb-2">{t.drop_confirm_title ?? 'Turno trascinato'}</h3>
            <p className="text-[0.75rem] text-white/60 mb-3">
              {t.drop_confirm_desc ?? 'Dove vuoi sistemarlo?'}
              <br />
              <span className="text-white/80 font-semibold">{dropConfirm.targetLabel}</span>
            </p>

            {/* Preset selezionabili */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {dropConfirm.presets.map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setDropConfirm(prev =>
                      prev ? { ...prev, selectedPresetIdx: i, targetTimeRange: `${p.start}–${p.end}` } : prev
                    )
                  }
                  className={`rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold tabular-nums transition-colors ${
 i === dropConfirm.selectedPresetIdx
 ? 'ring-2 ring-accent/70 bg-accent/15 text-accent shadow-md'
 : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
 }`}
                >
                  {p.start}–{p.end}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  const p = dropConfirm.presets[dropConfirm.selectedPresetIdx];
                  if (dropConfirm.shiftIds.length > 1) {
                    // Batch: ogni turno mantiene i propri orari
                    for (const id of dropConfirm.shiftIds) {
                      void handleDropOnCell(id, dropConfirm.targetUserId, dropConfirm.targetDate, dropConfirm.targetSlot);
                    }
                  } else {
                    void handleDropOnCell(dropConfirm.shiftIds[0], dropConfirm.targetUserId, dropConfirm.targetDate, dropConfirm.targetSlot, p.start + ':00', p.end + ':00');
                  }
                  setSelectedShiftIds(new Set());
                  setDropConfirm(null);
                }}
                className="flex-1 rounded-lg bg-amber-600/20 px-4 py-2.5 text-[0.6875rem] font-bold text-amber-300 hover:bg-amber-600/30 transition-colors uppercase tracking-wider"
              >
                {t.drop_move ?? 'Sposta'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const p = dropConfirm.presets[dropConfirm.selectedPresetIdx];
                  if (dropConfirm.shiftIds.length > 1) {
                    // Batch: ogni turno mantiene i propri orari
                    for (const id of dropConfirm.shiftIds) {
                      void handleDropCopyOnCell(id, dropConfirm.targetUserId, dropConfirm.targetDate, dropConfirm.targetSlot);
                    }
                  } else {
                    void handleDropCopyOnCell(dropConfirm.shiftIds[0], dropConfirm.targetUserId, dropConfirm.targetDate, dropConfirm.targetSlot, p.start + ':00', p.end + ':00');
                  }
                  setSelectedShiftIds(new Set());
                  setDropConfirm(null);
                }}
                className="flex-1 rounded-lg bg-blue-600/20 px-4 py-2.5 text-[0.6875rem] font-bold text-blue-300 hover:bg-blue-600/30 transition-colors uppercase tracking-wider"
              >
                {t.drop_copy ?? 'Copia'}
              </button>
              <button
                type="button"
                onClick={() => setDropConfirm(null)}
                className="rounded-lg bg-white/10 px-3 py-2.5 text-[0.6875rem] font-bold text-white/50 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* ── Menu contestuale tasto destro ── */}
      {contextMenu && createPortal(
        <>
          {/* Backdrop invisibile per chiudere */}
          <div
            className="fixed inset-0 z-[10050]"
            onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }}
            onClick={() => setContextMenu(null)}
          />
          {/* Menu */}
          <div
            className="fixed z-[10060] rounded-xl font-sans text-sm overflow-hidden"
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              left: contextMenu.x,
              top: contextMenu.y,
              width: contextMenu.w,
              height: contextMenu.h,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleContextDelete}
              className="flex w-full h-full items-center justify-center gap-2.5 text-white font-bold hover:bg-white/10 transition-colors active:bg-white/20"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" style={{ color: '#ef4444' }} />
              Elimina turno
            </button>
          </div>
        </>,
        document.body,
      )}

      {/* ── PinPad Modal per congelare / sbloccare / eliminare turno ── */}
      {panelPinModalOpen && (
        <PinPadModal
          title={(() => {
            if (panelPinMode === 'delete') {
              const targetShift = panelPinTargetShiftId ? allShifts.find(s => s.id === panelPinTargetShiftId) : null;
              const statusLabel = targetShift?.approval_status === 'draft' ? 'bozza'
                : targetShift?.approval_status === 'frozen' ? 'congelato'
                : targetShift?.approval_status === 'confirmed' ? 'confermato'
                : targetShift?.approval_status === 'approved' ? 'approvato'
                : targetShift?.approval_status === 'absent' ? 'assente'
                : '';
              return statusLabel ? `Elimina turno ${statusLabel}` : 'Elimina turno';
            }
            return panelPinMode === 'freeze' ? (t.ts_drawer_freeze_title ?? 'Congela questo turno') : (t.wst_freeze_pin_title ?? 'Sblocca turno');
          })()}
          subtitle={panelPinMode === 'delete' ? 'Inserisci il PIN per confermare l\'eliminazione' : panelPinMode === 'freeze' ? (t.ts_drawer_freeze_subtitle ?? 'Inserisci il PIN del manager/assistant per congelare il turno') : (t.wst_freeze_pin_subtitle ?? 'Inserisci il PIN del manager/assistant per sbloccare il turno')}
          pinLabel={t.wst_pin_label ?? 'PIN'}
          pin={panelPin}
          onPinChange={setPanelPin}
          onConfirm={handlePinConfirm}
          onCancel={() => { setPanelPinModalOpen(false); setPanelPinTargetShiftId(null); setPanelPin(''); setPanelPinError(''); }}
          error={panelPinError}
          isLoading={saving}
          confirmLabel={t.confirm ?? 'Conferma'}
          cancelLabel={t.cancel ?? 'Annulla'}
          userId={currentUser?.id}
          userDisplayName={[currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ')}
          userEmail={currentUser?.email ?? ''}
          onBiometricSuccess={() => {
            const verifier = findFreezeVerifierById(users, currentUser?.id ?? '');
            if (!verifier) { setPanelPinError(t.wst_freeze_pin_invalid ?? 'PIN non valido'); return; }
            void handlePinConfirm();
          }}
        />
      )}
    </div>
  );
}
