/**
 * Regole di arrotondamento degli orari di timbratura.
 *
 * L'arrotondamento agisce sulle timbrature registrate dall'app/kiosk: l'ora reale del
 * click resta in `punch_records.timestamp`, l'orario efficace (arrotondato) viene scritto
 * in `calculated_time` — la stessa architettura già usata da `computeEffectivePunchIn`.
 * Le correzioni manuali di un responsabile restano invariate.
 *
 * Configurazione persistita su Supabase Storage (bucket `app-config`, file
 * `punch_rounding_rules.json`) con mirror in localStorage, come le altre impostazioni.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Direzione dell'arrotondamento. */
export type RoundingDirection = 'up' | 'down' | 'nearest';

/** Orario di riferimento su cui si aggancia la griglia di arrotondamento. */
export type RoundingAnchor = 'shiftStart' | 'shiftEnd' | 'midnight';

export interface PunchRoundingRuleConfig {
  /** Se false, la regola non viene applicata (l'orario resta quello reale). */
  enabled: boolean;
  /** Passo di arrotondamento in minuti (1–60). */
  stepMinutes: number;
  /** Direzione: eccesso, difetto o arrotondamento matematico. */
  direction: RoundingDirection;
}

export interface PunchRoundingRules {
  /** Interruttore generale: se false le regole restano salvate ma non si applicano. */
  enabled: boolean;
  /** Entrata: riferimento tipico l'inizio del turno. */
  clockIn: PunchRoundingRuleConfig & {
    anchor: RoundingAnchor;
    /** Mai ore prima dell'inizio del turno (comportamento storico FLOW). */
    neverBeforeShiftStart: boolean;
  };
  /** Uscita: riferimento tipico la fine del turno. */
  clockOut: PunchRoundingRuleConfig & { anchor: RoundingAnchor };
  /** Inizio finestra pausa (orari delle timbrature usati per calcolare la pausa). */
  breakStart: PunchRoundingRuleConfig;
  /** Fine finestra pausa. */
  breakEnd: PunchRoundingRuleConfig;
  /** Eccezioni: se il turno ricade in una di queste condizioni l'arrotondamento non si applica. */
  exceptions: {
    /** Giorni della settimana (0 = domenica … 6 = sabato). */
    weekdays: number[];
    /** Ruoli esenti (vuoto = nessuna eccezione per ruolo). */
    roles: string[];
    /** Reparti esenti (vuoto = nessuna eccezione per reparto). */
    departments: string[];
  };
}

export const DEFAULT_PUNCH_ROUNDING_RULES: PunchRoundingRules = {
  enabled: false,
  clockIn: { enabled: true, stepMinutes: 5, direction: 'up', anchor: 'shiftStart', neverBeforeShiftStart: true },
  clockOut: { enabled: true, stepMinutes: 5, direction: 'up', anchor: 'shiftEnd' },
  breakStart: { enabled: false, stepMinutes: 5, direction: 'nearest' },
  breakEnd: { enabled: false, stepMinutes: 5, direction: 'nearest' },
  exceptions: { weekdays: [], roles: [], departments: [] },
};

/** Passi proposti nell'interfaccia (minuti). */
export const ROUNDING_STEP_PRESETS = [5, 10, 15, 30];
export const ROUNDING_STEP_MIN = 1;
export const ROUNDING_STEP_MAX = 60;

const STORAGE_KEY = 'osteria_punch_rounding_rules';
const STORAGE_SKIP_KEY = 'osteria_punch_rounding_rules_storage_skip';
const BUCKET = 'app-config';
const FILE_PATH = 'punch_rounding_rules.json';

// ── Utilità di parsing ────────────────────────────────────────────────────────

function markStorageUnavailable(): void {
  try {
    localStorage.setItem(STORAGE_SKIP_KEY, '1');
  } catch {
    // ignore
  }
}

export function clearPunchRoundingStorageSkip(): void {
  try {
    localStorage.removeItem(STORAGE_SKIP_KEY);
  } catch {
    // ignore
  }
}

function toRuleConfig(value: unknown, fallback: PunchRoundingRuleConfig): PunchRoundingRuleConfig {
  const raw = (value ?? {}) as Partial<PunchRoundingRuleConfig>;
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : fallback.enabled,
    stepMinutes: clampStep(raw.stepMinutes, fallback.stepMinutes),
    direction: isDirection(raw.direction) ? raw.direction : fallback.direction,
  };
}

function clampStep(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(ROUNDING_STEP_MAX, Math.max(ROUNDING_STEP_MIN, n));
}

function isDirection(value: unknown): value is RoundingDirection {
  return value === 'up' || value === 'down' || value === 'nearest';
}

function isAnchor(value: unknown): value is RoundingAnchor {
  return value === 'shiftStart' || value === 'shiftEnd' || value === 'midnight';
}

/** Normalizza un oggetto parziale (da storage o cloud) in regole valide. */
export function sanitizePunchRoundingRules(input: unknown): PunchRoundingRules {
  const raw = (input ?? {}) as Partial<PunchRoundingRules>;
  const d = DEFAULT_PUNCH_ROUNDING_RULES;
  const exc = (raw.exceptions ?? {}) as Partial<PunchRoundingRules['exceptions']>;
  const weekdays = Array.isArray(exc.weekdays)
    ? [...new Set(exc.weekdays.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v >= 0 && v <= 6))]
    : [];
  const cleanList = (v: unknown): string[] =>
    Array.isArray(v) ? [...new Set(v.map((x) => String(x)).filter((x) => x.length > 0))] : [];
  const clockInBase = toRuleConfig(raw.clockIn, d.clockIn);
  const clockOutBase = toRuleConfig(raw.clockOut, d.clockOut);
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : d.enabled,
    clockIn: {
      ...clockInBase,
      anchor: isAnchor((raw.clockIn as PunchRoundingRules['clockIn'] | undefined)?.anchor)
        ? (raw.clockIn as PunchRoundingRules['clockIn']).anchor
        : d.clockIn.anchor,
      neverBeforeShiftStart:
        typeof (raw.clockIn as PunchRoundingRules['clockIn'] | undefined)?.neverBeforeShiftStart === 'boolean'
          ? (raw.clockIn as PunchRoundingRules['clockIn']).neverBeforeShiftStart
          : d.clockIn.neverBeforeShiftStart,
    },
    clockOut: {
      ...clockOutBase,
      anchor: isAnchor((raw.clockOut as PunchRoundingRules['clockOut'] | undefined)?.anchor)
        ? (raw.clockOut as PunchRoundingRules['clockOut']).anchor
        : d.clockOut.anchor,
    },
    breakStart: toRuleConfig(raw.breakStart, d.breakStart),
    breakEnd: toRuleConfig(raw.breakEnd, d.breakEnd),
    exceptions: { weekdays, roles: cleanList(exc.roles), departments: cleanList(exc.departments) },
  };
}

// ── Validazione ───────────────────────────────────────────────────────────────

export type PunchRoundingValidationCode =
  | 'step_out_of_range'
  | 'no_active_rule'
  | 'nearest_requires_odd_step'
  | 'exception_emptied';

export interface PunchRoundingValidationIssue {
  code: PunchRoundingValidationCode;
  field: string;
  message: string;
}

/**
 * Controlla che le regole siano coerenti. Restituisce un elenco di problemi:
 * vuoto = configurazione valida e salvabile.
 */
export function validatePunchRoundingRules(rules: PunchRoundingRules): PunchRoundingValidationIssue[] {
  const issues: PunchRoundingValidationIssue[] = [];
  const fields: Array<[string, PunchRoundingRuleConfig]> = [
    ['clockIn', rules.clockIn],
    ['clockOut', rules.clockOut],
    ['breakStart', rules.breakStart],
    ['breakEnd', rules.breakEnd],
  ];

  for (const [field, cfg] of fields) {
    if (cfg.stepMinutes < ROUNDING_STEP_MIN || cfg.stepMinutes > ROUNDING_STEP_MAX) {
      issues.push({
        code: 'step_out_of_range',
        field,
        message: `Il passo di arrotondamento deve essere tra ${ROUNDING_STEP_MIN} e ${ROUNDING_STEP_MAX} minuti.`,
      });
    }
    // Con arrotondamento matematico un passo dispari non divide i 60 minuti dell'ora:
    // l'ora successiva risulterebbe disallineata (es. 5' → 8:55 / 9:00 / 9:05).
    if (cfg.enabled && cfg.direction === 'nearest' && 60 % cfg.stepMinutes !== 0) {
      issues.push({
        code: 'nearest_requires_odd_step',
        field,
        message: 'Con arrotondamento matematico usa un passo che divide 60 (5, 10, 15, 20, 30, 60).',
      });
    }
  }

  if (rules.enabled) {
    const anyActive = fields.some(([, cfg]) => cfg.enabled);
    if (!anyActive) {
      issues.push({
        code: 'no_active_rule',
        field: 'enabled',
        message: 'Arrotondamento attivo ma nessuna regola selezionata: attivane almeno una o disattiva l\'arrotondamento.',
      });
    }
  }

  if (rules.exceptions.weekdays.length >= 7) {
    issues.push({
      code: 'exception_emptied',
      field: 'exceptions.weekdays',
      message: 'Con tutti i giorni in eccezione l\'arrotondamento non verrebbe mai applicato.',
    });
  }

  return issues;
}

// ── Storage ───────────────────────────────────────────────────────────────────

export function getPunchRoundingRules(): PunchRoundingRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sanitizePunchRoundingRules(null);
    return sanitizePunchRoundingRules(JSON.parse(raw));
  } catch {
    return sanitizePunchRoundingRules(null);
  }
}

export function savePunchRoundingRules(rules: PunchRoundingRules): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // ignore
  }
}

/** Carica le regole da Supabase Storage; null se non disponibili (si usa il locale). */
export async function loadPunchRoundingRulesFromSupabase(): Promise<PunchRoundingRules | null> {
  if (import.meta.env.VITE_APP_CONFIG_STORAGE_ENABLED === 'false') return null;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_SKIP_KEY) === '1') return null;
  try {
    const { supabase } = await import('../lib/supabase');
    if (!supabase) return null;
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error || !data) {
      markStorageUnavailable();
      return null;
    }
    const text = await data.text();
    if (!text) return null;
    return sanitizePunchRoundingRules(JSON.parse(text));
  } catch {
    return null;
  }
}

/** Salva le regole su Supabase Storage (sync su tutti i dispositivi). */
export async function savePunchRoundingRulesToSupabase(rules: PunchRoundingRules): Promise<void> {
  const { supabase } = await import('../lib/supabase');
  if (!supabase) return;
  try {
    const blob = new Blob([JSON.stringify(rules)], { type: 'application/json' });
    await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, { upsert: true, contentType: 'application/json' });
    clearPunchRoundingStorageSkip();
  } catch {
    /* Storage non disponibile */
  }
}

// ── Motore di calcolo ─────────────────────────────────────────────────────────

export interface PunchRoundingShiftLike {
  date: string;
  start_time?: string | null;
  end_time?: string | null;
}

export interface PunchRoundingUserLike {
  role?: string | null;
  department?: string | null;
}

export interface AppliedRoundingRule {
  direction: RoundingDirection;
  stepMinutes: number;
  anchor: RoundingAnchor;
}

export interface PunchRoundingResult {
  /** ISO dell'orario efficace da salvare in `calculated_time`. */
  iso: string;
  /** Minuti da mezzanotte (relativi alla data del turno) prima/dopo l'arrotondamento. */
  rawMinutes: number;
  effectiveMinutes: number;
  /** Differenza applicata in minuti (positiva = spostato avanti). */
  deltaMinutes: number;
  /** true se l'orario efficace differisce da quello reale. */
  rounded: boolean;
  /** Motivo per cui l'arrotondamento non è stato applicato. */
  skippedReason?: 'rules_disabled' | 'rule_disabled' | 'exception';
  /** Regola effettivamente usata (assente se non applicata). */
  appliedRule?: AppliedRoundingRule;
}

function minutesOfDay(value: string): number | null {
  const m = String(value ?? '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 47 || min > 59) return null;
  return h * 60 + min;
}

function hhmmOfMinute(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/** Data locale (yyyy-MM-dd) di un ISO, per capire se la timbratura cade dopo la mezzanotte. */
function localDateOf(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Minuti da mezzanotte della timbratura, riferiti alla data del turno:
 * una timbratura del giorno successivo (turno a cavallo della mezzanotte) supera i 1440.
 */
export function punchMinutesRelativeToShift(iso: string, shiftDate: string): number | null {
  const localDate = localDateOf(iso);
  const time = minutesOfDay(new Date(iso).toTimeString().slice(0, 5));
  if (time == null) return null;
  if (!localDate || !shiftDate) return time;
  if (localDate === shiftDate) return time;
  // Giorno diverso: confronto in giorni interi per gestire la mezzanotte
  const diffDays = Math.round(
    (new Date(`${localDate}T00:00:00`).getTime() - new Date(`${shiftDate}T00:00:00`).getTime()) / 86400000
  );
  return time + diffDays * 1440;
}

/** Arrotonda `value` sulla griglia con passo `step` ancorata a `base`. */
export function roundMinutesOnGrid(
  value: number,
  base: number,
  stepMinutes: number,
  direction: RoundingDirection
): number {
  const step = Math.round(stepMinutes);
  if (!Number.isFinite(step) || step <= 0) return value;
  const delta = value - base;
  if (delta % step === 0) return value;
  const lowerSteps = Math.floor(delta / step);
  const lower = base + lowerSteps * step;
  const upper = lower + step;
  if (direction === 'down') return lower;
  if (direction === 'up') return upper;
  return value - lower < upper - value ? lower : upper;
}

function anchorMinutes(anchor: RoundingAnchor, shift: PunchRoundingShiftLike): number {
  if (anchor === 'shiftStart') return minutesOfDay(shift.start_time ?? '') ?? 0;
  if (anchor === 'shiftEnd') {
    const end = minutesOfDay(shift.end_time ?? '');
    if (end == null) return 0;
    const start = minutesOfDay(shift.start_time ?? '') ?? 0;
    // Turno oltre la mezzanotte: la fine sta nel giorno successivo
    return end <= start ? end + 1440 : end;
  }
  return 0;
}

/** true se il turno/utente ricade in una delle eccezioni configurate. */
export function isRoundingExceptional(
  rules: PunchRoundingRules,
  shift: PunchRoundingShiftLike,
  user?: PunchRoundingUserLike | null
): boolean {
  const { weekdays, roles, departments } = rules.exceptions;
  if (weekdays.length > 0) {
    const [y, m, d] = String(shift.date ?? '').split('-').map(Number);
    if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
      if (weekdays.includes(new Date(y, m - 1, d).getDay())) return true;
    }
  }
  const role = (user?.role ?? '').toString().trim().toLowerCase();
  if (role && roles.some((r) => r.trim().toLowerCase() === role)) return true;
  const dept = (user?.department ?? '').toString().trim().toLowerCase();
  if (dept && departments.some((d) => d.trim().toLowerCase() === dept)) return true;
  return false;
}

function isoFromShiftMinutes(shiftDate: string, minutes: number): string {
  const [y, m, d] = String(shiftDate).split('-').map(Number);
  const base = new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
  base.setMinutes(base.getMinutes() + minutes);
  return base.toISOString();
}

export interface ComputeRoundedPunchParams {
  rules: PunchRoundingRules;
  type: 'in' | 'out';
  rawIso: string;
  shift: PunchRoundingShiftLike;
  user?: PunchRoundingUserLike | null;
}

/**
 * Calcola l'orario efficace di una timbratura applicando le regole configurate.
 * L'ora reale (`rawIso`) non viene mai modificata: qui si produce solo il valore
 * da salvare come orario efficace.
 */
export function computeRoundedPunchTime(params: ComputeRoundedPunchParams): PunchRoundingResult {
  const { rules, type, rawIso, shift, user } = params;
  const rawMinutes = punchMinutesRelativeToShift(rawIso, shift.date) ?? 0;
  const base: PunchRoundingResult = {
    iso: rawIso,
    rawMinutes,
    effectiveMinutes: rawMinutes,
    deltaMinutes: 0,
    rounded: false,
  };

  const cfg = type === 'in' ? rules.clockIn : rules.clockOut;
  const shiftStart = minutesOfDay(shift.start_time ?? '') ?? 0;

  // Politica storica FLOW, indipendente dall'arrotondamento: l'entrata anticipata non
  // matura ore prima dell'inizio del turno (l'orario efficace parte dal turno).
  const applyNeverBefore = type === 'in' && rules.clockIn.neverBeforeShiftStart;
  const withPolicy = (minutes: number) =>
    applyNeverBefore && minutes < shiftStart ? shiftStart : minutes;

  let effective = withPolicy(rawMinutes);
  const policyResult = (skippedReason: PunchRoundingResult['skippedReason']): PunchRoundingResult => ({
    ...base,
    iso: isoFromShiftMinutes(shift.date, effective),
    effectiveMinutes: effective,
    deltaMinutes: effective - rawMinutes,
    rounded: effective !== rawMinutes,
    skippedReason,
  });

  if (!rules.enabled) return policyResult('rules_disabled');
  if (isRoundingExceptional(rules, shift, user)) return policyResult('exception');
  if (!cfg.enabled) return policyResult('rule_disabled');

  const anchor = anchorMinutes(cfg.anchor, shift);
  effective = withPolicy(roundMinutesOnGrid(effective, anchor, cfg.stepMinutes, cfg.direction));

  return {
    iso: isoFromShiftMinutes(shift.date, effective),
    rawMinutes,
    effectiveMinutes: effective,
    deltaMinutes: effective - rawMinutes,
    rounded: effective !== rawMinutes,
    appliedRule: { direction: cfg.direction, stepMinutes: cfg.stepMinutes, anchor: cfg.anchor },
  };
}

/**
 * Arrotonda gli estremi della finestra pausa (orari delle timbrature usati per
 * dedurre la pausa). Restituisce gli orari in HH:mm, invariati se le regole non
 * sono attive o il turno è in eccezione.
 */
export function roundBreakWindow(params: {
  rules: PunchRoundingRules;
  startHHMM: string;
  endHHMM: string;
  shift: PunchRoundingShiftLike;
  user?: PunchRoundingUserLike | null;
}): { start: string; end: string; rounded: boolean } {
  const { rules, startHHMM, endHHMM, shift, user } = params;
  if (!rules.enabled || isRoundingExceptional(rules, shift, user)) {
    return { start: startHHMM, end: endHHMM, rounded: false };
  }
  const start = minutesOfDay(startHHMM);
  const end = minutesOfDay(endHHMM);
  if (start == null || end == null) return { start: startHHMM, end: endHHMM, rounded: false };
  const nextStart = rules.breakStart.enabled
    ? roundMinutesOnGrid(start, 0, rules.breakStart.stepMinutes, rules.breakStart.direction)
    : start;
  let nextEnd = rules.breakEnd.enabled
    ? roundMinutesOnGrid(end, 0, rules.breakEnd.stepMinutes, rules.breakEnd.direction)
    : end;
  if (nextEnd <= nextStart) nextEnd = nextStart;
  return {
    start: hhmmOfMinute(nextStart),
    end: hhmmOfMinute(nextEnd),
    rounded: nextStart !== start || nextEnd !== end,
  };
}

// ── Anteprima per l'interfaccia ───────────────────────────────────────────────

export interface RoundingPreviewParams {
  rules: PunchRoundingRules;
  type: 'in' | 'out';
  /** Orario reale di esempio in HH:mm. */
  timeHHMM: string;
  shiftDate: string;
  shiftStart: string;
  shiftEnd: string;
  user?: PunchRoundingUserLike | null;
}

export interface RoundingPreviewResult {
  rawHHMM: string;
  effectiveHHMM: string;
  deltaMinutes: number;
  rounded: boolean;
  skippedReason?: PunchRoundingResult['skippedReason'];
  appliedRule?: AppliedRoundingRule;
  /** Spiegazione leggibile del risultato. */
  explanation: string;
}

/** Calcola l'anteprima su un orario di esempio (usata nella scheda Impostazioni). */
export function previewPunchRounding(params: RoundingPreviewParams): RoundingPreviewResult {
  const { rules, type, timeHHMM, shiftDate, shiftStart, shiftEnd, user } = params;
  const iso = isoFromShiftMinutes(shiftDate, minutesOfDay(timeHHMM) ?? 0);
  const res = computeRoundedPunchTime({
    rules,
    type,
    rawIso: iso,
    shift: { date: shiftDate, start_time: shiftStart, end_time: shiftEnd },
    user,
  });
  const rawHHMM = hhmmOfMinute(res.rawMinutes);
  const effectiveHHMM = hhmmOfMinute(res.effectiveMinutes);
  let explanation: string;
  if (res.skippedReason === 'rules_disabled') explanation = 'Arrotondamento disattivato: l\'orario resta quello reale.';
  else if (res.skippedReason === 'exception') explanation = 'Turno in eccezione (giorno, ruolo o reparto): l\'orario resta quello reale.';
  else if (res.skippedReason === 'rule_disabled') explanation = 'Regola non attiva per questo tipo di timbratura: l\'orario resta quello reale.';
  else if (!res.rounded) explanation = 'Orario già allineato alla griglia: nessuna correzione.';
  else explanation = `Arrotondato di ${res.deltaMinutes > 0 ? '+' : ''}${res.deltaMinutes} minuti (${res.appliedRule?.stepMinutes}′ ${directionLabel(res.appliedRule?.direction)}).`;
  return { rawHHMM, effectiveHHMM, deltaMinutes: res.deltaMinutes, rounded: res.rounded, skippedReason: res.skippedReason, appliedRule: res.appliedRule, explanation };
}

function directionLabel(direction?: RoundingDirection): string {
  if (direction === 'up') return 'per eccesso';
  if (direction === 'down') return 'per difetto';
  if (direction === 'nearest') return 'matematico';
  return '';
}

// ── Ricalcolo delle timbrature già registrate ─────────────────────────────────

export interface PunchRoundingShiftRef extends PunchRoundingShiftLike {
  id: string;
}

export interface PunchRoundingUserRef extends PunchRoundingUserLike {
  id: string;
}

export interface PunchRoundingPunchRef {
  id: string;
  user_id: string;
  type: 'in' | 'out';
  timestamp: string;
  calculated_time?: string | null;
  shift_id?: string | null;
  source?: string | null;
}

export interface PunchRoundingRecalculation {
  id: string;
  /** Nuovo orario efficace da salvare in `calculated_time`. */
  iso: string;
}

/**
 * Calcola quali timbrature già registrate vanno riscritte quando cambiano le regole.
 *
 * Le regole si applicano al momento della timbratura: senza questo passaggio una
 * configurazione salvata vale solo per le timbrature successive. Vengono toccate
 * solo le timbrature dell'app/kiosk (non `source === 'manual'`) il cui orario
 * efficace non è mai stato corretto a mano, cioè è ancora quello reale oppure è
 * esattamente il risultato delle regole precedenti. Un valore diverso è una
 * correzione manuale di un responsabile e resta intatta.
 */
export function planPunchRoundingRecalculation(params: {
  previousRules: PunchRoundingRules;
  nextRules: PunchRoundingRules;
  punches: PunchRoundingPunchRef[];
  shifts: PunchRoundingShiftRef[];
  users: PunchRoundingUserRef[];
}): PunchRoundingRecalculation[] {
  const { previousRules, nextRules, punches, shifts, users } = params;
  const shiftById = new Map(shifts.map((s) => [s.id, s]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const plan: PunchRoundingRecalculation[] = [];

  for (const punch of punches) {
    if (punch.source === 'manual') continue;
    const shift = punch.shift_id ? shiftById.get(punch.shift_id) : undefined;
    if (!shift) continue;

    const shared = {
      type: punch.type,
      rawIso: punch.timestamp,
      shift,
      user: userById.get(punch.user_id) ?? null,
    };
    const previous = computeRoundedPunchTime({ rules: previousRules, ...shared });

    const storedMinutes = punchMinutesRelativeToShift(punch.calculated_time || punch.timestamp, shift.date);
    if (storedMinutes == null) continue;
    const untouched = storedMinutes === previous.rawMinutes || storedMinutes === previous.effectiveMinutes;
    if (!untouched) continue;

    const next = computeRoundedPunchTime({ rules: nextRules, ...shared });
    if (next.effectiveMinutes === storedMinutes) continue;

    plan.push({ id: punch.id, iso: isoFromShiftMinutes(shift.date, next.effectiveMinutes) });
  }

  return plan;
}
