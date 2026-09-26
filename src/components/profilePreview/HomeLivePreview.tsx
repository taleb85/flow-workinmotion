/**
 * Anteprima "Cosa vede chi" — scheda Panoramica (Home).
 *
 * A differenza dei vecchi mock statici, questa anteprima riusa i componenti
 * REALI della schermata:
 *   • staff                 → `MobileHome`  (vista mobile personale)
 *   • gestionale + team_view→ `HomeManagerView` (dashboard team)
 *   • gestionale senza team → `HomeStaffView` (vista compatta)
 *
 * I dati sono dimostrativi ma realistici, così compaiono TUTTE le sezioni
 * condizionate dai dati (timbrature, ritardi, chiusura cena, criticità,
 * bacheca, ferie, KPI). La visibilità dei blocchi è pilotata da
 * `isUiWidgetVisible(previewUser, key)` tramite il prop `uiW`, esattamente
 * come nell'app reale.
 */
import { addDays, format, isToday, isTomorrow, isValid, parseISO, startOfWeek } from 'date-fns';
import type { HolidayRequest, Language, PunchRecord, Shift, User } from '../../types';
import { getDateLocale, getTranslations } from '../../utils/translations';
import { isUiWidgetVisible } from '../../utils/uiScreenWidgets';
import { getEffectiveFeaturesForUser } from '../../utils/profileVisibilityHub';
import HomeManagerView, { type EnrichedShift as ManagerEnrichedShift } from '../HomeManagerView';
import HomeStaffView from '../HomeStaffView';
import MobileHome from '../mobile/MobileHome';
import type { EnrichedShift as PunchEnrichedShift } from '../../hooks/useSmartPunchAction';

// ── Time helpers (stessa semantica di HomePage) ──────────────────────────────
function timeToMins(value: string): number {
  const [h, m] = (value || '00:00').slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function punchTimeHHMM(ts: string | null | undefined): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (!isValid(d)) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

// ── Demo data helpers ────────────────────────────────────────────────────────
function demoShift(
  id: string,
  userId: string,
  dateStr: string,
  start: string,
  end: string,
  type: Shift['type'],
  status: Shift['approval_status'],
  extra?: Partial<Shift>
): Shift {
  return {
    id,
    user_id: userId,
    date: dateStr,
    start_time: start,
    end_time: end,
    type,
    approval_status: status,
    ...extra,
  };
}

function demoUser(
  id: string,
  firstName: string,
  role: User['role'],
  department: string,
  language: Language,
  sortOrder: number
): User {
  return {
    id,
    first_name: firstName,
    email: `${firstName.toLowerCase()}@osteria.demo`,
    role,
    pin: '0000',
    status: 'active',
    sort_order: sortOrder,
    language,
    theme: 'dark',
    can_create_shifts: false,
    can_approve_shifts: false,
    can_manage_drafts: false,
    department,
  };
}

// Handler no-op: l'anteprima è di sola lettura.
const noop = () => {};
const noopString = (_value: string) => {};
const noopShift = (_e: ManagerEnrichedShift) => {};

interface HomeLivePreviewProps {
  previewUser: User;
  language: Language;
  isSelectedAdmin: boolean;
  onUiToggle: (key: string, visible: boolean) => void;
  isMgmt: boolean;
}

export default function HomeLivePreview({
  previewUser,
  language,
  isMgmt,
  isSelectedAdmin: _isSelectedAdmin,
  onUiToggle: _onUiToggle,
}: HomeLivePreviewProps) {
  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');
  const locale = getDateLocale(language);
  const t = getTranslations(language);
  const tv = t as Record<string, string>;

  const uiW = (key: string) => isUiWidgetVisible(previewUser, key);

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (!isValid(date)) return dateStr;
    if (isToday(date)) return t.home_today;
    if (isTomorrow(date)) return t.home_tomorrow;
    return format(date, 'EEEE d MMMM', { locale });
  };

  // Id dei turni con timbratura d'ingresso (per `getPunchForShift`).
  const punchedShiftIds = new Set<string>(['pv-mine-1', 'pv-mob-1', 'pv-mgmt-1', 'pv-mgmt-2']);
  const getPunchForShift = (
    shiftId: string,
    _userId: string,
    _dateStr: string,
    _isLunchShift: boolean
  ) => (punchedShiftIds.has(shiftId) ? { punchIn: { id: `pv-punch-${shiftId}` } } : {});

  const demoTake = (offset: number) => format(addDays(now, offset), 'yyyy-MM-dd');

  // Ferie dimostrative (condivise tra vista gestionale e staff).
  const demoHolidays: HolidayRequest[] = [
    {
      id: 'pv-h1',
      user_id: 'pv-user-luca',
      start_date: demoTake(4),
      end_date: demoTake(6),
      type: 'ferie',
      status: 'pending',
      created_at: now.toISOString(),
    },
    {
      id: 'pv-h2',
      user_id: 'pv-user-sara',
      start_date: demoTake(10),
      end_date: demoTake(12),
      type: 'permesso',
      status: 'approved',
      created_at: now.toISOString(),
    },
    {
      id: 'pv-h3',
      user_id: previewUser.id,
      start_date: demoTake(20),
      end_date: demoTake(24),
      type: 'ferie',
      status: 'approved',
      created_at: now.toISOString(),
    },
  ];
  const demoMyApprovedHolidays = demoHolidays.filter(
    (h) => h.user_id === previewUser.id && h.status === 'approved'
  );

  const demoBoardNote = {
    text:
      tv.home_board_demo_text ??
      'Promemoria: prima del servizio, briefing di 5 minuti in sala. Grazie!',
    author: previewUser.first_name ?? 'Manager',
    updatedAt: now.toISOString(),
  };

  // ── 1) STAFF: vista mobile personale reale ─────────────────────────────────
  if (!isMgmt) {
    const mobileTodayShifts: Shift[] = [
      demoShift('pv-mob-1', previewUser.id, todayStr, '10:00', '16:00', 'lunch', 'confirmed'),
      demoShift('pv-mob-2', previewUser.id, todayStr, '18:00', '23:00', 'dinner', 'confirmed'),
    ];
    const mobileMyShifts: Shift[] = [
      ...mobileTodayShifts,
      demoShift('pv-mob-3', previewUser.id, demoTake(1), '12:00', '18:00', 'lunch', 'approved'),
      demoShift('pv-mob-4', previewUser.id, demoTake(3), '18:00', '23:30', 'dinner', 'approved'),
    ];
    const mobilePunchIn: PunchRecord = {
      id: 'pv-mob-punch',
      user_id: previewUser.id,
      shift_id: 'pv-mob-1',
      timestamp: `${todayStr}T10:00:00`,
      calculated_time: `${todayStr}T10:00:00`,
      type: 'in',
      source: 'kiosk',
    };
    const mobileInProgress: PunchEnrichedShift = {
      shift: mobileTodayShifts[0]!,
      isLunchSlot: true,
      punchIn: mobilePunchIn,
      punchOut: undefined,
      actualStart: `${todayStr}T10:00:00`,
      actualEnd: null,
    };

    return (
      <MobileHome
        greetingText={t.home_greeting.replace('{name}', previewUser.first_name ?? '')}
        todayLabel={format(now, 'EEEE d MMMM', { locale })}
        todayStr={todayStr}
        inProgress={mobileInProgress}
        elapsedLabel="05:23:41"
        todayWorkShiftsCount={mobileTodayShifts.length}
        noShiftsHint={t.no_shifts_scheduled}
        tapStartHint={tv.mobile_dash_tap_start ?? 'Tocca Inizia per timbrare l’entrata.'}
        inProgressLabel={t.home_status_in_shift}
        savingLabel={t.saving}
        startLabel={tv.mobile_dash_start ?? 'Inizia'}
        endLabel={tv.mobile_dash_end ?? 'Fine turno'}
        canStart={false}
        canEnd
        punchBusy={false}
        onStart={noop}
        onEnd={noop}
        todayWorkShifts={mobileTodayShifts}
        myShifts={mobileMyShifts}
        locale={locale}
        visibilityUser={previewUser}
      />
    );
  }

  // ── 2) GESTIONALE con team_view: dashboard team reale ──────────────────────
  const features = getEffectiveFeaturesForUser(previewUser);
  if (features['team_view'] !== false) {
    const luca = demoUser('pv-user-luca', 'Luca', 'waiter', 'Sala', language, 1);
    const sara = demoUser('pv-user-sara', 'Sara', 'server', 'Sala', language, 2);
    const marco = demoUser('pv-user-marco', 'Marco', 'cook', 'Cucina', language, 3);
    const giulia = demoUser('pv-user-giulia', 'Giulia', 'bartender', 'Bar', language, 4);
    const elena = demoUser('pv-user-elena', 'Elena', 'chef', 'Cucina', language, 5);
    const managerUsers: User[] = [previewUser, luca, sara, marco, giulia, elena];

    // Turno approvato + timbrato.
    const approvedShift: ManagerEnrichedShift = {
      shift: demoShift('pv-mgmt-1', luca.id, todayStr, '10:00:00', '16:00:00', 'lunch', 'approved', {
        approved_at: `${todayStr}T16:05:00`,
        approved_start_time: '10:00',
        approved_end_time: '16:00',
      }),
      user: luca,
      isDinner: false,
      punchIn: { id: 'pv-p1' },
      punchOut: { id: 'pv-p1-out' },
      actualStart: '10:02',
      actualEnd: '16:00',
      scheduledStart: '10:00',
      scheduledEnd: '16:00',
      scheduledMins: 360,
      actualMins: 358,
      deltaMins: -2,
      isLate: false,
      hasMissingOut: false,
      isApproved: true,
      canApprove: false,
      canClose: false,
    };

    // Turno in ritardo (ingresso tardivo, uscita non ancora timbrata).
    const lateShift: ManagerEnrichedShift = {
      shift: demoShift('pv-mgmt-2', sara.id, todayStr, '12:00:00', '18:00:00', 'lunch', 'confirmed'),
      user: sara,
      isDinner: false,
      punchIn: { id: 'pv-p2' },
      punchOut: undefined,
      actualStart: '12:18',
      actualEnd: null,
      scheduledStart: '12:00',
      scheduledEnd: '18:00',
      scheduledMins: 360,
      actualMins: 342,
      deltaMins: -18,
      isLate: true,
      hasMissingOut: true,
      isApproved: false,
      canApprove: false,
      canClose: false,
    };

    // Turno senza timbratura d'ingresso.
    const noPunchShift: ManagerEnrichedShift = {
      shift: demoShift('pv-mgmt-3', marco.id, todayStr, '09:00:00', '15:00:00', 'lunch', 'confirmed'),
      user: marco,
      isDinner: false,
      punchIn: undefined,
      punchOut: undefined,
      actualStart: null,
      actualEnd: null,
      scheduledStart: '09:00',
      scheduledEnd: '15:00',
      scheduledMins: 360,
      actualMins: 0,
      deltaMins: -360,
      isLate: false,
      hasMissingOut: false,
      isApproved: false,
      canApprove: false,
      canClose: false,
    };

    // Turno cena in corso da chiudere.
    const dinnerToClose: ManagerEnrichedShift = {
      shift: demoShift('pv-mgmt-4', giulia.id, todayStr, '18:00:00', '23:00:00', 'dinner', 'confirmed'),
      user: giulia,
      isDinner: true,
      punchIn: { id: 'pv-p4' },
      punchOut: undefined,
      actualStart: '18:05',
      actualEnd: null,
      scheduledStart: '18:00',
      scheduledEnd: '23:00',
      scheduledMins: 300,
      actualMins: 295,
      deltaMins: -5,
      isLate: false,
      hasMissingOut: false,
      isApproved: false,
      canApprove: false,
      canClose: true,
    };

    // Turno completato in attesa di approvazione.
    const toApproveShift: ManagerEnrichedShift = {
      shift: demoShift('pv-mgmt-5', elena.id, todayStr, '19:00:00', '23:30:00', 'dinner', 'confirmed'),
      user: elena,
      isDinner: true,
      punchIn: { id: 'pv-p5' },
      punchOut: { id: 'pv-p5-out' },
      actualStart: '19:00',
      actualEnd: '23:30',
      scheduledStart: '19:00',
      scheduledEnd: '23:30',
      scheduledMins: 270,
      actualMins: 270,
      deltaMins: 0,
      isLate: false,
      hasMissingOut: false,
      isApproved: false,
      canApprove: true,
      canClose: false,
    };

    const todayShiftsEnriched: ManagerEnrichedShift[] = [
      approvedShift,
      lateShift,
      noPunchShift,
      dinnerToClose,
      toApproveShift,
    ];
    const criticalShifts: ManagerEnrichedShift[] = [lateShift, toApproveShift];
    const dinnerNeedsClose: ManagerEnrichedShift[] = [dinnerToClose];

    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekRangeLabel = `${format(weekStart, 'd MMM', { locale })} – ${format(
      addDays(weekStart, 6),
      'd MMM',
      { locale }
    )}`;

    const getCardStyle = (_e: ManagerEnrichedShift) => ({
      border: 'border-l-white/30',
      bg: 'bg-white/10',
      badge: 'bg-white/10 text-white/80 border-white/20',
      dot: 'bg-white/50',
      label: t.home_status_complete,
    });

    return (
      <HomeManagerView
        currentUser={previewUser}
        t={t}
        effectiveLanguage={language}
        now={now}
        todayStr={todayStr}
        todayShiftsEnriched={todayShiftsEnriched}
        criticalShifts={criticalShifts}
        dinnerNeedsClose={dinnerNeedsClose}
        inTurnoCount={todayShiftsEnriched.length}
        ritardiCount={todayShiftsEnriched.filter((e) => e.isLate).length}
        senzaTimbraturaCount={1}
        approvatiCount={todayShiftsEnriched.filter((e) => e.isApproved).length}
        attendancePercent={80}
        hoursPercent={72}
        todayAllShiftsCount={todayShiftsEnriched.length}
        weekMinutes={2280}
        weekShiftsCount={14}
        weekRangeLabel={weekRangeLabel}
        pendingHolidays={demoHolidays.filter((h) => h.status === 'pending')}
        holidays={demoHolidays}
        users={managerUsers}
        myApprovedHolidays={demoMyApprovedHolidays}
        staffRequestsEnabled
        boardNote={demoBoardNote}
        editingBoard={false}
        boardDraft=""
        onBoardDraftChange={noopString}
        onStartEditBoard={noop}
        onSaveBoard={noop}
        onCancelEditBoard={noop}
        onClearBoard={noop}
        canEditTeamBoard
        closeModal={null}
        clockOutInput=""
        closingLoading={false}
        onClockOutInputChange={noopString}
        onCloseShift={noopShift}
        onDismissCloseModal={noop}
        onConfirmClose={noop}
        approvingId={null}
        approveModal={null}
        onApproveFromModal={() => Promise.resolve()}
        onDismissApproveModal={noop}
        onNavigateToShifts={noop}
        onNavigateToReports={noop}
        onNavigateToHolidays={noop}
        uiW={uiW}
        punchTimeHHMM={punchTimeHHMM}
        timeToMins={timeToMins}
        getPunchForShift={getPunchForShift}
        getCardStyle={getCardStyle}
      />
    );
  }

  // ── 3) GESTIONALE senza team_view: vista compatta reale ────────────────────
  const staffMyShifts: Shift[] = [
    demoShift('pv-mine-1', previewUser.id, todayStr, '10:00', '16:00', 'lunch', 'approved'),
    demoShift('pv-mine-2', previewUser.id, todayStr, '18:00', '23:00', 'dinner', 'confirmed'),
    demoShift('pv-mine-3', previewUser.id, demoTake(1), '12:00', '18:00', 'lunch', 'approved'),
    demoShift('pv-mine-4', previewUser.id, demoTake(3), '18:00', '23:30', 'dinner', 'approved'),
  ];
  const staffTodayMine = staffMyShifts.filter((s) => s.date === todayStr);
  const staffUpcoming = staffMyShifts.filter((s) => s.date >= todayStr);
  const staffPunchRecords: PunchRecord[] = [
    {
      id: 'pv-staff-punch-1',
      user_id: previewUser.id,
      shift_id: 'pv-mine-1',
      timestamp: `${todayStr}T10:01:00`,
      calculated_time: `${todayStr}T10:01:00`,
      type: 'in',
      source: 'kiosk',
    },
  ];

  return (
    <HomeStaffView
      currentUser={previewUser}
      effectiveLanguage={language}
      t={t}
      now={now}
      todayStr={todayStr}
      myShifts={staffMyShifts}
      punchRecords={staffPunchRecords}
      myApprovedHolidays={demoMyApprovedHolidays}
      upcomingShifts={staffUpcoming}
      todayShiftsMine={staffTodayMine}
      getDateLabel={getDateLabel}
      getPunchForShift={getPunchForShift}
      staffRequestsEnabled
      isMgmtUser
      canEditTeamBoard
      boardNote={demoBoardNote}
      editingBoard={false}
      boardDraft=""
      onBoardDraftChange={noopString}
      onStartEditBoard={noop}
      onSaveBoard={noop}
      onCancelEditBoard={noop}
      onClearBoard={noop}
      onNavigateToHolidays={noop}
      onNavigateToShifts={noop}
      activeTab="home"
      uiW={uiW}
      punchTimeHHMM={punchTimeHHMM}
      timeToMins={timeToMins}
    />
  );
}
