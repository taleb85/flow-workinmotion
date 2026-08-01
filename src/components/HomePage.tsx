import { useState, useCallback, useMemo } from 'react';
import { useAppUser, useAppData, useAppConfig, useAppOverlay } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { useWallAlignedMinuteClock } from '../hooks/useWallAlignedMinuteClock';
import { format, isToday, isTomorrow, parseISO, isValid, addDays, startOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { it } from 'date-fns/locale';
import { getNetShiftMinutes } from '../utils/breakRules';
import {
  isManagementRole,
  isUserVisibleOnTeamSchedule,
  canOperateTeamSchedule,
  canEditTeamShifts,
  canApproveShiftActions,
} from '../utils/permissions';
import { getDateLocale } from '../utils/translations';
import { isFeatureEnabled } from '../utils/enabledFeatures';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';
import type { Shift } from '../types';
import { getResolvedStartEndForHours, shiftPastPlannedEndWithoutClockIn } from '../utils/shiftResolvedClockTimes';
import type { AppNavTab } from '../utils/enabledModules';
import MobileStaffDashboard from './mobile/MobileStaffDashboard';
import HomeStaffView from './HomeStaffView';
import HomeManagerView, { type EnrichedShift } from './HomeManagerView';

// ── Board helpers ────────────────────────────────────────────────────────────
const BOARD_KEY = 'manager_board_note';
function getBoardNote(): { text: string; author: string; updatedAt: string } | null {
  try { return JSON.parse(localStorage.getItem(BOARD_KEY) || 'null'); } catch { return null; }
}
function saveBoardNote(text: string, author: string) {
  localStorage.setItem(BOARD_KEY, JSON.stringify({ text, author, updatedAt: new Date().toISOString() }));
}
function clearBoardNote() { localStorage.removeItem(BOARD_KEY); }

// ── Time helpers ─────────────────────────────────────────────────────────────
function timeToMins(t: string): number {
  const [h, m] = (t || '00:00').slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function punchTimeHHMM(ts: string | null | undefined): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (!isValid(d)) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch { return null; }
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface CloseShiftModal {
  shiftId: string;
  punchInId: string;
  dateStr: string;
  plannedEnd: string;
  employeeName: string;
  actualStart: string;
}

interface HomePageProps {
  onNavigateToHolidays?: () => void;
  onNavigateToShifts?: () => void;
  onNavigateToReports?: () => void;
  onTabChange?: (tab: AppNavTab) => void;
  activeTab?: AppNavTab;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function HomePage({
  onNavigateToHolidays,
  onNavigateToShifts,
  onNavigateToReports,
  onTabChange,
  activeTab: activeTabProp,
}: HomePageProps) {
  const { currentUser, users, effectiveLanguage } = useAppUser();
  const { shifts, holidays, punchRecords, updatePunchRecord, approveShift } = useAppData();
  const { breakRules, featureFlags } = useAppConfig();
  const { showSuccess, showError } = useAppOverlay();
  const t = useT();
  const now = useWallAlignedMinuteClock();

  const [boardNote, setBoardNoteState] = useState(() => getBoardNote());
  const [editingBoard, setEditingBoard] = useState(false);
  const [boardDraft, setBoardDraft] = useState('');
  const [closeModal, setCloseModal] = useState<CloseShiftModal | null>(null);
  const [clockOutInput, setClockOutInput] = useState('');
  const [closingLoading, setClosingLoading] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveModal, setApproveModal] = useState<{ shift: Shift; userName: string } | null>(null);

  const handleSaveBoard = () => {
    if (!boardDraft.trim()) { clearBoardNote(); setBoardNoteState(null); }
    else { saveBoardNote(boardDraft.trim(), currentUser?.first_name ?? 'Manager'); setBoardNoteState(getBoardNote()); }
    setEditingBoard(false);
  };

  const handleConfirmClose = useCallback(async () => {
    if (!closeModal || !clockOutInput) return;
    setClosingLoading(true);
    try {
      const [h, m] = clockOutInput.split(':').map(Number);
      const base = parseISO(closeModal.dateStr);
      const clockOutDate = new Date(base.getFullYear(), base.getMonth(), base.getDate(), h ?? 0, m ?? 0, 0, 0);
      await updatePunchRecord(closeModal.punchInId, { clock_out_time: clockOutDate.toISOString() });
      showSuccess?.(t.home_toast_exit_registered);
      setCloseModal(null);
      setClockOutInput('');
    } catch {
      showError?.(t.home_toast_exit_error);
    } finally {
      setClosingLoading(false);
    }
  }, [closeModal, clockOutInput, updatePunchRecord, showSuccess, showError, t]);

  const handleApproveFromModal = useCallback(
    async (shiftId: string, approvedStart: string, approvedEnd: string) => {
      const shift = shifts.find(s => s.id === shiftId);
      const _user = users.find(u => u.id === shift?.user_id);
      setApprovingId(shiftId);
      try {
        await approveShift(shiftId, { approvedStart, approvedEnd });
        showSuccess?.(t.home_toast_shift_approved);
      } finally {
        setApprovingId(null);
      }
    },
    [approveShift, showSuccess, shifts, users, t]
  );

  const breakComputeOpts = useMemo(
    () => ({ autoBreaksFeatureEnabled: featureFlags['auto_breaks'] !== false }),
    [featureFlags]
  );

  if (!currentUser) return null;
  const locale = getDateLocale(effectiveLanguage) ?? it;

  const isMgmtUser = isManagementRole(currentUser.role);
  const isMobile = window.innerWidth < 768;
  const uiW = (key: string) => isUiWidgetVisible(currentUser, key);
  const showTeamHome = isMgmtUser && isFeatureEnabled(currentUser, 'team_view');
  const canEditShiftsHome =
    currentUser.role === 'admin' ||
    (isFeatureEnabled(currentUser, 'edit_shifts') &&
      canOperateTeamSchedule(currentUser) &&
      canEditTeamShifts(currentUser));
  const canEditTeamBoard =
    currentUser.role === 'admin' ||
    currentUser.role === 'manager' ||
    currentUser.role === 'assistant_manager' ||
    canEditShiftsHome;
  const canApproveShiftsHome =
    currentUser.role === 'admin' ||
    (isFeatureEnabled(currentUser, 'approve_shifts') && canApproveShiftActions(currentUser));

  const staffRequestsEnabled = featureFlags['staff_requests'] !== false;
  const todayStr = format(now, 'yyyy-MM-dd');
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const myShifts = shifts
    .filter((s) => s.user_id === currentUser.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const upcomingShifts = myShifts.filter((s) => {
    if (s.date < todayStr) return false;
    if (isMgmtUser && showTeamHome) return true;
    return s.approval_status === 'approved' || s.approval_status === 'confirmed' || s.approval_status === 'absent';
  });

  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const thisWeekShifts = myShifts.filter((s) => {
    const d = parseISO(s.date);
    return (
      d >= weekStart &&
      d < weekEnd &&
      (s.approval_status === 'approved' || s.approval_status === 'confirmed' || s.approval_status === 'absent')
    );
  });
  const weeklyMinutes = thisWeekShifts.reduce((sum, s) => {
    if (s.approval_status === 'absent') return sum;
    const u = users.find((x) => x.id === s.user_id) ?? currentUser;
    if (s.approved_at && s.approved_start_time && s.approved_end_time) {
      const { start, end } = getResolvedStartEndForHours(s, punchRecords);
      return sum + getNetShiftMinutes(s, start, end, u, breakRules, breakComputeOpts);
    }
    return (
      sum +
      getNetShiftMinutes(s, (s.start_time || '').slice(0, 5), (s.end_time || '').slice(0, 5), u, breakRules, breakComputeOpts)
    );
  }, 0);

  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const thisMonthShifts = myShifts.filter((s) => {
    const d = parseISO(s.date);
    return (
      d >= monthStart &&
      d <= monthEnd &&
      (s.approval_status === 'approved' || s.approval_status === 'confirmed' || s.approval_status === 'absent')
    );
  });
  const monthlyMinutes = thisMonthShifts.reduce((sum, s) => {
    if (s.approval_status === 'absent') return sum;
    const u = users.find((x) => x.id === s.user_id) ?? currentUser;
    if (s.approved_at && s.approved_start_time && s.approved_end_time) {
      const { start, end } = getResolvedStartEndForHours(s, punchRecords);
      return sum + getNetShiftMinutes(s, start, end, u, breakRules, breakComputeOpts);
    }
    return (
      sum +
      getNetShiftMinutes(s, (s.start_time || '').slice(0, 5), (s.end_time || '').slice(0, 5), u, breakRules, breakComputeOpts)
    );
  }, 0);
  const monthDaysWorked = new Set(thisMonthShifts.filter((s) => s.approval_status !== 'absent').map((s) => s.date)).size;

  const pendingHolidays = holidays.filter((h) => h.status === 'pending');
  const myApprovedHolidays = holidays
    .filter((h) => h.user_id === currentUser.id && h.status === 'approved' && new Date(h.end_date) >= new Date())
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    .slice(0, 3);

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (!isValid(date)) return dateStr;
    if (isToday(date)) return t.home_today;
    if (isTomorrow(date)) return t.home_tomorrow;
    return format(date, 'EEEE d MMMM', { locale });
  };

  const getPunchForShift = (shiftId: string, userId: string, dateStr: string, isLunchShift: boolean) => {
    const punchIn = punchRecords.find((p) => {
      if (p.type !== 'in') return false;
      if (shiftId && p.shift_id) return p.shift_id === shiftId;
      if (p.user_id !== userId) return false;
      const d = new Date(p.timestamp);
      if (!isValid(d)) return false;
      return format(d, 'yyyy-MM-dd') === dateStr && (isLunchShift ? d.getHours() < 16 : d.getHours() >= 16);
    });
    const punchOut = punchRecords.find((p) => {
      if (p.type !== 'out') return false;
      if (shiftId && p.shift_id) return p.shift_id === shiftId;
      if (p.user_id !== userId) return false;
      const d = new Date(p.timestamp);
      if (!isValid(d)) return false;
      return format(d, 'yyyy-MM-dd') === dateStr && (isLunchShift ? d.getHours() < 16 : d.getHours() >= 16);
    });
    return { punchIn, punchOut };
  };

  // ── Manager: today's shifts with punch data ─────────────────────────────────
  const todayAllShifts = showTeamHome
    ? shifts
        .filter((s) => {
          if (s.date !== todayStr || s.notes?.startsWith('__OPEN__')) return false;
          const u = users.find((x) => x.id === s.user_id);
          if (!u) return true;
          return isUserVisibleOnTeamSchedule(u, shifts);
        })
        .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
    : [];

  const todayShiftsEnriched = todayAllShifts.map((s) => {
    const isDinner = timeToMins((s.start_time || '').slice(0, 5)) >= 16 * 60;
    const user = users.find((u) => u.id === s.user_id);
    const { punchIn, punchOut } = getPunchForShift(s.id, s.user_id, todayStr, !isDinner);
    const clockOutRaw = (punchIn as { clock_out_time?: string | null })?.clock_out_time ?? null;
    const actualStart = punchIn ? punchTimeHHMM(punchIn.calculated_time || punchIn.timestamp) : null;
    const actualEnd = clockOutRaw ? punchTimeHHMM(clockOutRaw) : punchOut ? punchTimeHHMM(punchOut.timestamp) : null;
    const scheduledStart = (s.start_time || '').slice(0, 5);
    const scheduledEnd = (s.end_time || '').slice(0, 5);
    const scheduledMins = getNetShiftMinutes(s, scheduledStart, scheduledEnd, user ?? undefined, breakRules, breakComputeOpts);
    let actualMins = 0;
    if (s.approved_at && s.approved_start_time && s.approved_end_time) {
      const { start, end } = getResolvedStartEndForHours(s, punchRecords);
      actualMins = getNetShiftMinutes(s, start, end, user ?? undefined, breakRules, breakComputeOpts);
    } else if (actualStart && actualEnd) {
      actualMins = getNetShiftMinutes(s, actualStart, actualEnd, user ?? undefined, breakRules, breakComputeOpts);
    } else if (actualStart && scheduledEnd) {
      actualMins = getNetShiftMinutes(s, actualStart, scheduledEnd, user ?? undefined, breakRules, breakComputeOpts);
    }
    const deltaMins = actualMins - scheduledMins;
    const isLate = !!(actualStart && timeToMins(actualStart) > timeToMins(scheduledStart) + 5);
    const hasMissingOut = !!(punchIn && !actualEnd);
    const isApproved = s.approval_status === 'approved' && !!s.approved_at;
    const canApprove =
      showTeamHome &&
      canApproveShiftsHome &&
      s.approval_status === 'confirmed' &&
      !!punchIn &&
      !!actualEnd &&
      (currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'assistant_manager');
    const canClose =
      showTeamHome && canEditShiftsHome && isDinner && !!punchIn && !actualEnd && !isApproved;
    return { shift: s, user, isDinner, punchIn, punchOut, actualStart, actualEnd, scheduledStart, scheduledEnd, scheduledMins, actualMins, deltaMins, isLate, hasMissingOut, isApproved, canApprove, canClose };
  });

  const inTurnoCount = todayAllShifts.filter((s) => {
    if (s.approval_status === 'absent') return false;
    const start = timeToMins((s.start_time || '').slice(0, 5));
    const end = timeToMins((s.end_time || '23:59').slice(0, 5));
    return nowMins >= start - 30 && nowMins <= end;
  }).length;
  const ritardiCount = todayShiftsEnriched.filter((e) => e.isLate).length;
  const senzaTimbraturaCount = todayAllShifts.filter((s) => {
    if (s.approval_status === 'absent') return false;
    const isDinner = timeToMins((s.start_time || '').slice(0, 5)) >= 16 * 60;
    const { punchIn } = getPunchForShift(s.id, s.user_id, todayStr, !isDinner);
    return !punchIn;
  }).length;
  const approvatiCount = todayAllShifts.filter((s) => {
    if (s.approval_status !== 'approved') return false;
    return true;
  }).length;

  const criticalShifts = todayShiftsEnriched.filter((e) => e.hasMissingOut || e.isLate || e.canApprove);
  const dinnerNeedsClose = todayShiftsEnriched.filter((e) => e.canClose);

  const todayShiftsWithPunch = todayAllShifts.filter((s) => {
    const isDinner = timeToMins((s.start_time || '').slice(0, 5)) >= 16 * 60;
    const { punchIn } = getPunchForShift(s.id, s.user_id, todayStr, !isDinner);
    return !!punchIn;
  });
  const attendancePercent = todayAllShifts.length > 0 ? Math.round((todayShiftsWithPunch.length / todayAllShifts.length) * 100) : 100;
  const hoursPercent = Math.min(100, Math.round((weeklyMinutes / (40 * 60)) * 100));

  const getCardStyle = (e: EnrichedShift) => {
    const startMins = timeToMins(e.scheduledStart);
    const endMins = timeToMins((e.scheduledEnd || '00:00').slice(0, 5));
    const inTodayKpiWindow = nowMins >= startMins - 30 && nowMins <= endMins;
    const punchMissingHome = shiftPastPlannedEndWithoutClockIn(e.shift, punchRecords);
    const publishedHome =
      e.shift.approval_status === 'confirmed' ||
      (e.shift.approval_status === 'approved' && !e.shift.approved_at);

    if (e.shift.approval_status === 'absent') {
      return { border: 'border-l-rose-400', bg: 'bg-rose-500/12', badge: 'bg-rose-500/20 text-rose-200 border-rose-400/50', dot: 'bg-rose-400', label: t.status_absent };
    }
    if (e.isApproved) {
      return { border: 'border-l-emerald-400/70', bg: 'bg-emerald-500/10', badge: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40', dot: 'bg-emerald-400', label: t.home_status_approved };
    }
    if (e.shift.approval_status === 'draft') {
      return { border: 'border-l-slate-400', bg: 'bg-white/10', badge: 'bg-white/10 text-white/80 border-white/25', dot: 'bg-white/45', label: t.status_draft };
    }
    if (e.hasMissingOut || e.isLate) {
      return { border: 'border-l-red-500', bg: 'bg-red-500/12', badge: 'bg-red-500/20 text-red-200 border-red-400/50', dot: 'bg-red-400', label: t.home_status_anomaly };
    }
    if (e.canApprove) {
      return { border: 'border-l-white/30', bg: 'bg-white/10', badge: 'bg-white/10 text-white/80 border-white/25', dot: 'bg-white/45', label: t.home_status_to_approve };
    }
    if (!e.punchIn) {
      if (punchMissingHome) {
        return { border: 'border-l-amber-400', bg: 'bg-amber-500/12', badge: 'bg-amber-500/20 text-amber-200 border-amber-400/50', dot: 'bg-amber-400', label: t.home_status_not_punched };
      }
      if (publishedHome) {
        return { border: 'border-l-white/30', bg: 'bg-white/10', badge: 'bg-white/10 text-white/70 border-white/20', dot: 'bg-white/40', label: t.home_status_not_punched };
      }
      return { border: 'border-l-amber-400', bg: 'bg-amber-500/12', badge: 'bg-amber-500/20 text-amber-200 border-amber-400/50', dot: 'bg-amber-400', label: t.home_status_not_punched };
    }
    if (inTodayKpiWindow && e.punchIn && !e.isLate && !e.hasMissingOut) {
      return { border: 'border-l-white/40', bg: 'bg-white/12', badge: 'bg-white/12 text-white border-white/20', dot: 'bg-white/70', label: t.home_status_in_shift };
    }
    if (e.punchIn && !e.actualEnd) {
      return { border: 'border-l-white/40', bg: 'bg-white/12', badge: 'bg-white/12 text-white border-white/20', dot: 'animate-pulse bg-white/70', label: t.home_status_in_shift };
    }
    if (e.punchIn && e.actualEnd) {
      return { border: 'border-l-white/30', bg: 'bg-white/10', badge: 'bg-white/10 text-white/80 border-white/20', dot: 'bg-white/50', label: t.home_status_complete };
    }
    return { border: 'border-l-amber-400', bg: 'bg-amber-500/12', badge: 'bg-amber-500/20 text-amber-200 border-amber-400/50', dot: 'bg-amber-400', label: t.home_status_not_punched };
  };

  // ── STAFF VIEW (o gestionale senza team_view sulla Home) ────────────────────
  if (!showTeamHome) {
    const todayShiftsMine = shifts.filter((s) => s.date === todayStr && s.user_id === currentUser.id);
    return (
      <HomeStaffView
        currentUser={currentUser}
        effectiveLanguage={effectiveLanguage}
        t={t}
        now={now}
        todayStr={todayStr}
        myShifts={myShifts}
        punchRecords={punchRecords}
        myApprovedHolidays={myApprovedHolidays}
        upcomingShifts={upcomingShifts}
        todayShiftsMine={todayShiftsMine}
        weeklyMinutes={weeklyMinutes}
        monthlyMinutes={monthlyMinutes}
        monthDaysWorked={monthDaysWorked}
        getDateLabel={getDateLabel}
        getPunchForShift={getPunchForShift}
        staffRequestsEnabled={staffRequestsEnabled}
        isMgmtUser={isMgmtUser}
        canEditTeamBoard={canEditTeamBoard}
        boardNote={boardNote}
        editingBoard={editingBoard}
        boardDraft={boardDraft}
        onBoardDraftChange={setBoardDraft}
        onStartEditBoard={() => setEditingBoard(true)}
        onSaveBoard={handleSaveBoard}
        onCancelEditBoard={() => setEditingBoard(false)}
        onClearBoard={() => { clearBoardNote(); setBoardNoteState(null); }}
        onNavigateToHolidays={onNavigateToHolidays}
        onNavigateToShifts={onNavigateToShifts}
        onTabChange={onTabChange}
        activeTab={activeTabProp}
        uiW={uiW}
        punchTimeHHMM={punchTimeHHMM}
        timeToMins={timeToMins}
      />
    );
  }

  // ── MANAGER VIEW (team home) ────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="pb-content pt-6 w-full font-sans">
        <MobileStaffDashboard
          user={currentUser}
          language={effectiveLanguage}
          todayStr={todayStr}
          now={now}
          myShifts={myShifts}
          punchRecords={punchRecords}
          weeklyMinutes={weeklyMinutes}
          monthlyMinutes={monthlyMinutes}
          monthDaysWorked={monthDaysWorked}
          weekCapMinutes={40 * 60}
          onTabChange={onTabChange}
          greetingText={t.home_greeting.replace('{name}', currentUser.first_name ?? '')}
          activeTab={activeTabProp ?? 'home'}
        />
      </div>
    );
  }

  return (
    <HomeManagerView
      currentUser={currentUser}
      t={t}
      now={now}
      todayStr={todayStr}
      todayShiftsEnriched={todayShiftsEnriched}
      criticalShifts={criticalShifts}
      dinnerNeedsClose={dinnerNeedsClose}
      inTurnoCount={inTurnoCount}
      ritardiCount={ritardiCount}
      senzaTimbraturaCount={senzaTimbraturaCount}
      approvatiCount={approvatiCount}
      attendancePercent={attendancePercent}
      hoursPercent={hoursPercent}
      todayAllShiftsCount={todayAllShifts.length}
      weeklyMinutes={weeklyMinutes}
      pendingHolidays={pendingHolidays}
      holidays={holidays}
      users={users}
      myApprovedHolidays={myApprovedHolidays}
      staffRequestsEnabled={staffRequestsEnabled}
      boardNote={boardNote}
      editingBoard={editingBoard}
      boardDraft={boardDraft}
      onBoardDraftChange={setBoardDraft}
      onStartEditBoard={() => setEditingBoard(true)}
      onSaveBoard={handleSaveBoard}
      onCancelEditBoard={() => setEditingBoard(false)}
      onClearBoard={() => { clearBoardNote(); setBoardNoteState(null); }}
      canEditTeamBoard={canEditTeamBoard}
      closeModal={closeModal}
      clockOutInput={clockOutInput}
      closingLoading={closingLoading}
      onClockOutInputChange={setClockOutInput}
      onCloseShift={(e) => {
        if (!e.punchIn) return;
        setClockOutInput(e.scheduledEnd);
        setCloseModal({ shiftId: e.shift.id, punchInId: e.punchIn.id, dateStr: todayStr, plannedEnd: e.scheduledEnd, employeeName: e.user?.first_name ?? '—', actualStart: e.actualStart ?? e.scheduledStart });
      }}
      onDismissCloseModal={() => setCloseModal(null)}
      onConfirmClose={handleConfirmClose}
      approvingId={approvingId}
      approveModal={approveModal}
      onApproveFromModal={handleApproveFromModal}
      onDismissApproveModal={() => setApproveModal(null)}
      onNavigateToShifts={onNavigateToShifts}
      onNavigateToReports={onNavigateToReports}
      onNavigateToHolidays={onNavigateToHolidays}
      uiW={uiW}
      punchTimeHHMM={punchTimeHHMM}
      timeToMins={timeToMins}
      getPunchForShift={getPunchForShift}
      getCardStyle={getCardStyle}
    />
  );
}

// Re-export from shared file to avoid circular imports
export type { HomeManagementShiftCardProps } from './HomeManagementShiftCard';
export { HomeManagementShiftCard } from './HomeManagementShiftCard';
