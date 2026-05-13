import { calculateShiftMinutesGross, hasShiftConflictSameDay } from './timeCalculations';
import { getBreakMinutesForShift, type BreakRule, type BreakMinutesComputeOptions } from './breakRules';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkRules {
  /** Ore massime per turno/giorno prima che scatti l'alert (default 9) */
  maxDailyHours: number;
  maxDailyHoursEnabled: boolean;
  /** Ore massime settimanali (default 48) */
  maxWeeklyHours: number;
  maxWeeklyHoursEnabled: boolean;
  /** Riposo minimo (ore) tra fine turno e inizio turno successivo (default 11) */
  minRestHours: number;
  minRestHoursEnabled: boolean;
  /** Soglia ritardo tollerato in minuti prima di mostrare l'alert (default 10) */
  lateThresholdMinutes: number;
  lateThresholdEnabled: boolean;
  /** Abilita violazioni Critico (turno lungo + riposo insufficiente) */
  criticEnabled: boolean;
  /** Abilita violazioni Attenzione (ore giornaliere/settimanali oltre limite) */
  attentionEnabled: boolean;
  /** Abilita violazione Sovrapposizione (due turni sovrapposti stesso dipendente) */
  overlapEnabled: boolean;
}

export const DEFAULT_WORK_RULES: WorkRules = {
  maxDailyHours: 9,
  maxDailyHoursEnabled: true,
  maxWeeklyHours: 48,
  maxWeeklyHoursEnabled: true,
  minRestHours: 11,
  minRestHoursEnabled: true,
  lateThresholdMinutes: 10,
  lateThresholdEnabled: true,
  criticEnabled: true,
  attentionEnabled: true,
  overlapEnabled: true,
};

const STORAGE_KEY = 'osteria_work_rules';
const STORAGE_SKIP_KEY = 'osteria_work_rules_storage_skip';
const BUCKET = 'app-config';
const FILE_PATH = 'work_rules.json';

function markWorkRulesStorageUnavailable(): void {
  try {
    localStorage.setItem(STORAGE_SKIP_KEY, '1');
  } catch {
    // ignore
  }
}

export function clearWorkRulesStorageSkip(): void {
  try {
    localStorage.removeItem(STORAGE_SKIP_KEY);
  } catch {
    // ignore
  }
}

export function getWorkRules(): WorkRules {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_WORK_RULES };
    return { ...DEFAULT_WORK_RULES, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_WORK_RULES };
  }
}

export function saveWorkRules(rules: WorkRules): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

/** Carica work rules da Supabase Storage. Fallback a localStorage se non disponibile. */
export async function loadWorkRulesFromSupabase(): Promise<WorkRules | null> {
  if (import.meta.env.VITE_APP_CONFIG_STORAGE_ENABLED === 'false') return null;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_SKIP_KEY) === '1') {
    return null;
  }
  try {
    const { supabase } = await import('../lib/supabase');
    if (!supabase) return null;
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error || !data) {
      /** Un solo tentativo fallito (bucket/file/policy): evita GET ripetuti e rumore in console. */
      markWorkRulesStorageUnavailable();
      return null;
    }
    const text = await data.text();
    if (!text) return null;
    const parsed = JSON.parse(text) as Partial<WorkRules>;
    const merged = { ...DEFAULT_WORK_RULES, ...parsed };
    return merged;
  } catch {
    return null;
  }
}

/** Salva work rules su Supabase Storage (sync su tutti i profili/dispositivi). */
export async function saveWorkRulesToSupabase(rules: WorkRules): Promise<void> {
  const { supabase } = await import('../lib/supabase');
  if (!supabase) return;
  try {
    const blob = new Blob([JSON.stringify(rules)], { type: 'application/json' });
    await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, { upsert: true, contentType: 'application/json' });
    clearWorkRulesStorageSkip();
  } catch {
    /* Storage non disponibile */
  }
}

// ── Violation detection ───────────────────────────────────────────────────────

export type ViolationType = 'long_shift' | 'max_daily' | 'max_weekly' | 'min_rest' | 'late' | 'overlap';

export interface ShiftViolation {
  type: ViolationType;
  message: string;
  severity: 'warn' | 'error';
}

type ShiftLike = { user_id: string; date: string; start_time: string; end_time: string; deduct_break?: boolean; break_minutes?: number; notes?: string };
type UserLike = { id: string; department?: string | null; role: string };

/** Opzioni violazioni: stesso criterio pausa dell’app (`auto_breaks` + regole attive prioritarie). */
export type ShiftViolationComputeOptions = {
  users?: UserLike[];
  breakRules?: BreakRule[];
  autoBreaksFeatureEnabled?: boolean;
};

/** Minuti totali per un utente in un dato giorno (tutti i suoi turni). */
function dailyMinutes(
  userId: string,
  dateStr: string,
  allShifts: ShiftLike[],
  users?: UserLike[],
  breakRules?: BreakRule[],
  breakOpts?: BreakMinutesComputeOptions
): number {
  const user = users?.find((u) => u.id === userId);
  return allShifts
    .filter((s) => s.user_id === userId && s.date === dateStr && !s.notes?.startsWith('__OPEN__'))
    .reduce((sum, s) => {
      const gross = calculateShiftMinutesGross((s.start_time || '').slice(0, 5), (s.end_time || '').slice(0, 5));
      const breakMins = getBreakMinutesForShift(s, gross, user ?? undefined, breakRules ?? null, breakOpts);
      return sum + Math.max(0, gross - breakMins);
    }, 0);
}

/** Minuti totali per un utente nell'arco di sette giorni da weekStr. */
export function weeklyMinutes(
  userId: string,
  weekStr: string,
  weekEnd: string,
  allShifts: ShiftLike[],
  users?: UserLike[],
  breakRules?: BreakRule[],
  breakOpts?: BreakMinutesComputeOptions
): number {
  const user = users?.find((u) => u.id === userId);
  return allShifts
    .filter((s) => s.user_id === userId && s.date >= weekStr && s.date < weekEnd && !s.notes?.startsWith('__OPEN__'))
    .reduce((sum, s) => {
      const gross = calculateShiftMinutesGross((s.start_time || '').slice(0, 5), (s.end_time || '').slice(0, 5));
      const breakMins = getBreakMinutesForShift(s, gross, user ?? undefined, breakRules ?? null, breakOpts);
      return sum + Math.max(0, gross - breakMins);
    }, 0);
}

function toMins(hhmm: string): number {
  const [h, m] = (hhmm || '00:00').slice(0, 5).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Calcola le violazioni per un singolo turno nel contesto di tutti i turni dell'utente.
 * Restituisce lista di violazioni (può essere vuota).
 */
export function getShiftViolations(
  shift: { id: string; user_id: string; date: string; start_time: string; end_time: string; deduct_break?: boolean; break_minutes?: number; notes?: string },
  allShifts: Array<{ id: string; user_id: string; date: string; start_time: string; end_time: string; deduct_break?: boolean; break_minutes?: number; notes?: string }>,
  weekStr: string,
  weekEnd: string,
  rules: WorkRules,
  options?: ShiftViolationComputeOptions
): ShiftViolation[] {
  const violations: ShiftViolation[] = [];
  const startNorm = (shift.start_time || '').slice(0, 5);
  const endNorm = (shift.end_time || '').trim().slice(0, 5);
  if (!startNorm || !endNorm || endNorm === startNorm) return violations;

  const gross = calculateShiftMinutesGross(startNorm, endNorm);
  const user = options?.users?.find((u) => u.id === shift.user_id);
  const breakOpts: BreakMinutesComputeOptions | undefined =
    options?.autoBreaksFeatureEnabled !== undefined
      ? { autoBreaksFeatureEnabled: options.autoBreaksFeatureEnabled }
      : undefined;
  const breakMins = getBreakMinutesForShift(shift, gross, user ?? undefined, options?.breakRules ?? null, breakOpts);
  const shiftMins = Math.max(0, gross - breakMins);

  // 0. Sovrapposizione (se abilitata)
  if (rules.overlapEnabled !== false) {
    const othersSameDay = allShifts.filter(
      (s) => s.user_id === shift.user_id && s.date === shift.date && s.id !== shift.id && !s.notes?.startsWith('__OPEN__')
    );
    const hasOverlap = hasShiftConflictSameDay(
      othersSameDay.map((s) => ({ id: s.id, start_time: (s.start_time || '').slice(0, 5), end_time: (s.end_time || '').slice(0, 5) })),
      { start_time: startNorm, end_time: endNorm },
      shift.id
    );
    if (hasOverlap) {
      violations.push({
        type: 'overlap',
        message: 'Due turni sovrapposti per lo stesso dipendente',
        severity: 'error',
      });
    }
  }

  // 1. Turno lungo (singolo) — Critico
  if (rules.criticEnabled !== false && rules.maxDailyHoursEnabled !== false && shiftMins > rules.maxDailyHours * 60) {
    violations.push({
      type: 'long_shift',
      message: `Turno di ${Math.round(shiftMins / 60 * 10) / 10}h (max ${rules.maxDailyHours}h)`,
      severity: 'error',
    });
  }

  // 2. Ore giornaliere totali — Attenzione
  const dayMins = dailyMinutes(shift.user_id, shift.date, allShifts, options?.users, options?.breakRules, breakOpts);
  if (rules.attentionEnabled !== false && rules.maxDailyHoursEnabled !== false && dayMins > rules.maxDailyHours * 60 && shiftMins <= rules.maxDailyHours * 60) {
    violations.push({
      type: 'max_daily',
      message: `Totale giorno: ${Math.round(dayMins / 60 * 10) / 10}h (max ${rules.maxDailyHours}h)`,
      severity: 'warn',
    });
  }

  // 3. Ore settimanali — Attenzione
  const wMins = weeklyMinutes(shift.user_id, weekStr, weekEnd, allShifts, options?.users, options?.breakRules, breakOpts);
  if (rules.attentionEnabled !== false && rules.maxWeeklyHoursEnabled !== false && wMins > rules.maxWeeklyHours * 60) {
    violations.push({
      type: 'max_weekly',
      message: `Settimana: ${Math.round(wMins / 60 * 10) / 10}h (max ${rules.maxWeeklyHours}h)`,
      severity: 'warn',
    });
  }

  // 4. Riposo minimo — Critico
  const userShifts = allShifts
    .filter((s) => s.user_id === shift.user_id && s.id !== shift.id && !s.notes?.startsWith('__OPEN__'))
    .sort((a, b) => `${a.date} ${a.start_time}`.localeCompare(`${b.date} ${b.start_time}`));

  for (const prev of userShifts) {
    if (!prev.end_time) continue;
    // prev termina prima di questo inizia?
    const prevEnd = `${prev.date} ${(prev.end_time || '').slice(0, 5)}`;
    const currStart = `${shift.date} ${startNorm}`;
    if (prevEnd > currStart) continue; // il prev è dopo
    // Gap in minuti
    const prevEndMins = prev.date === shift.date
      ? toMins(prev.end_time)
      : 24 * 60 - toMins(prev.end_time) + toMins(startNorm); // stima grezza cross-day
    const currStartMins = toMins(startNorm);
    let gapMins: number;
    if (prev.date === shift.date) {
      gapMins = currStartMins - toMins((prev.end_time || '').slice(0, 5));
    } else {
      // Calcolo cross-day preciso: include ore E minuti
      void prevEndMins;
      const [prevEndH, prevEndM] = (prev.end_time || '00:00').slice(0, 5).split(':').map(n => parseInt(n, 10) || 0);
      const [currStartH, currStartM] = startNorm.split(':').map(n => parseInt(n, 10) || 0);
      const prevEndTotal = prevEndH * 60 + prevEndM;
      const currStartTotal = currStartH * 60 + currStartM;
      gapMins = (24 * 60 - prevEndTotal) + currStartTotal;
    }
    if (rules.criticEnabled !== false && rules.minRestHoursEnabled !== false && gapMins >= 0 && gapMins < rules.minRestHours * 60) {
      violations.push({
        type: 'min_rest',
        message: `Riposo ${Math.round(gapMins / 60 * 10) / 10}h (min ${rules.minRestHours}h)`,
        severity: 'error',
      });
      break;
    }
  }

  return violations;
}

/** Colore badge in base alla severità. */
export function violationColor(violations: ShiftViolation[]): string {
  if (violations.some((v) => v.severity === 'error')) return 'text-red-500';
  if (violations.some((v) => v.severity === 'warn')) return 'text-amber-500';
  return '';
}

/** Testo tooltip con tutte le violazioni. */
export function violationTooltip(violations: ShiftViolation[]): string {
  return violations.map((v) => `⚠ ${v.message}`).join('\n');
}
