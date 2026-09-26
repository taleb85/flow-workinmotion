/**
 * Anteprima "Cosa vede chi" — scheda Presenze.
 *
 * A differenza dei vecchi mock statici (`TurniMgmtPreview`,
 * `StatisticsTabPreview`, `StaffTimesheetPreview`), questa anteprima riusa i
 * componenti REALI delle due schermate:
 *   • gestione → `UnifiedShiftsPage` (copia esatta desktop, `mode="realtime"`)
 *   • staff    → `MobileStatsCards` + `ManagementMobileTimesheet`
 *                (`variant="embedded"` con dati dimostrativi)
 *
 * Nel ramo staff i dati sono dimostrativi ma realistici e cadono nella
 * settimana corrente: la griglia mostra così contenuto reale (turni, ore,
 * timbrature). La visibilità dei blocchi resta pilotata da
 * `isUiWidgetVisible(previewUser, key)` dentro i componenti veri; l'admin la
 * commuta dai toggle esposti in `ProfileTabRichPreview`.
 */
import { addDays, format, startOfWeek } from 'date-fns';
import type { Language, PunchRecord, Shift, User } from '../../types';
import { getTranslations } from '../../utils/translations';
import MobileStatsCards from '../mobile/MobileStatsCards';
import ManagementMobileTimesheet from '../mobile/ManagementMobileTimesheet';
import UnifiedShiftsPage from '../UnifiedShiftsPage';

interface TimesheetLivePreviewProps {
  previewUser: User;
  language: Language;
  isSelectedAdmin: boolean;
  onUiToggle: (key: string, visible: boolean) => void;
  isMgmt: boolean;
}

// Handler no-op: l'anteprima è di sola lettura.
const noop = () => {};

/** `HH:MM` + minuti (normalizzato su 24h). */
function addMinsToHHMM(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = ((h || 0) * 60 + (m || 0) + mins + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function demoShift(
  id: string,
  userId: string,
  dateStr: string,
  start: string,
  end: string,
  type: Shift['type'],
  status: Shift['approval_status'],
): Shift {
  return {
    id,
    user_id: userId,
    date: dateStr,
    start_time: start,
    end_time: end,
    type,
    approval_status: status,
  };
}

function demoUser(
  id: string,
  firstName: string,
  role: User['role'],
  department: string,
  language: Language,
  sortOrder: number,
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

/** Turni demo dell'utente in anteprima, uno per giorno (Lun→Sab) della settimana corrente. */
const SHIFT_DEFS: {
  off: number;
  start: string;
  end: string;
  type: Shift['type'];
  status: Shift['approval_status'];
}[] = [
  { off: 0, start: '10:00', end: '16:00', type: 'lunch', status: 'confirmed' },
  { off: 1, start: '18:00', end: '23:00', type: 'dinner', status: 'approved' },
  { off: 2, start: '12:00', end: '18:00', type: 'lunch', status: 'confirmed' },
  { off: 3, start: '18:00', end: '23:30', type: 'dinner', status: 'confirmed' },
  { off: 4, start: '10:00', end: '16:00', type: 'lunch', status: 'approved' },
  { off: 5, start: '19:00', end: '23:00', type: 'dinner', status: 'confirmed' },
];

// Numeri demo delle card (formato `HH:mm` lato MobileStatsCards).
const DEMO_WEEK_PLANNED_MINS = 1950;
const DEMO_WEEK_WORKED_MINS = 1230;
const DEMO_WEEK_CAP_MINS = 2400;
const DEMO_MONTH_PLANNED_MINS = 7800;
const DEMO_MONTH_WORKED_MINS = 4920;
const DEMO_MONTH_CAP_MINS = 9600;

export default function TimesheetLivePreview({
  previewUser,
  language,
  isMgmt,
  isSelectedAdmin: _isSelectedAdmin,
  onUiToggle: _onUiToggle,
}: TimesheetLivePreviewProps) {
  const t = getTranslations(language);
  const tv = t as Record<string, string>;

  // ── Gestione: copia esatta della schermata desktop reale ─────────────────
  // La griglia reale è interattiva (può creare/modificare/spostare turni):
  // nell'anteprima la rendiamo di sola lettura per evitare modifiche accidentali.
  if (isMgmt) {
    return (
      <div
        className="w-full pointer-events-none select-none"
        role="group"
        aria-label={tv.profile_visibility_timesheet_readonly ?? 'Anteprima Presenze (sola lettura)'}
      >
        <UnifiedShiftsPage visibilityUser={previewUser} />
      </div>
    );
  }

  // ── Staff: schermata reale personale con dati dimostrativi ───────────────
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  // 0 = lunedì … 6 = domenica.
  const todayIdx = (today.getDay() + 6) % 7;

  /** Utente del preview + due colleghi (con reparto) per la lista utenti reale. */
  const demoUsers: User[] = [
    previewUser,
    demoUser('pvts-user-marco', 'Marco', 'cook', 'kitchen', language, 1),
    demoUser('pvts-user-giulia', 'Giulia', 'bartender', 'bar', language, 2),
  ];

  const demoShifts: Shift[] = SHIFT_DEFS.map((def, idx) =>
    demoShift(
      `pvts-shift-${idx}`,
      previewUser.id,
      format(addDays(weekStart, def.off), 'yyyy-MM-dd'),
      def.start,
      def.end,
      def.type,
      def.status,
    ),
  );

  // Timbrature coerenti: giorni passati entrata+uscita, giorno corrente solo
  // entrata (turno in corso), giorni futuri nessuna.
  const demoPunches: PunchRecord[] = [];
  SHIFT_DEFS.forEach((def, idx) => {
    if (idx > todayIdx) return;
    const dateStr = format(addDays(weekStart, def.off), 'yyyy-MM-dd');
    const shiftId = `pvts-shift-${idx}`;
    const inTime = addMinsToHHMM(def.start, 3);
    demoPunches.push({
      id: `pvts-punch-${idx}-in`,
      user_id: previewUser.id,
      shift_id: shiftId,
      timestamp: `${dateStr}T${inTime}:00`,
      calculated_time: `${dateStr}T${inTime}:00`,
      type: 'in',
      source: 'kiosk',
    });
    if (idx < todayIdx) {
      const outTime = addMinsToHHMM(def.end, 2);
      demoPunches.push({
        id: `pvts-punch-${idx}-out`,
        user_id: previewUser.id,
        shift_id: shiftId,
        timestamp: `${dateStr}T${outTime}:00`,
        calculated_time: `${dateStr}T${outTime}:00`,
        type: 'out',
        source: 'kiosk',
      });
    }
  });

  return (
    <div className="w-full">
      {/* Blocco fisso: etichetta + card, identico a StaffPersonalDashboard. */}
      <div className="app-sticky-band sticky top-[var(--app-sticky-header-offset,5rem)] z-30 pb-1">
        <div className="px-4 pt-4 pb-3">
          <span className="text-[0.6875rem] font-black uppercase tracking-widest text-white/55">
            {t.my_attendance_label ?? 'Le mie presenze'}
          </span>
        </div>
        <div className="px-4 pb-4">
          <MobileStatsCards
            weekWorkedMins={DEMO_WEEK_WORKED_MINS}
            weekPlannedMins={DEMO_WEEK_PLANNED_MINS}
            weekCapMins={DEMO_WEEK_CAP_MINS}
            monthWorkedMins={DEMO_MONTH_WORKED_MINS}
            monthPlannedMins={DEMO_MONTH_PLANNED_MINS}
            monthCapMins={DEMO_MONTH_CAP_MINS}
            compact
            activeMode="week"
            onModeChange={noop}
            labels={{
              title: tv.mobile_dash_numbers ?? 'I miei numeri',
              week: tv.ts_period_week ?? 'Settimana',
              month: tv.ts_period_month ?? 'Mese',
            }}
          />
        </div>
      </div>
      <ManagementMobileTimesheet
        variant="embedded"
        hideNavBar
        hideSectionLabel
        forceExpanded
        shifts={demoShifts}
        punchRecords={demoPunches}
        users={demoUsers}
        currentUserId={previewUser.id}
        language={language}
        plannedOnly={false}
      />
    </div>
  );
}
