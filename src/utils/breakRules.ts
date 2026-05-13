import { getDay, parseISO, isWithinInterval } from 'date-fns';
import { calculateShiftMinutesGross } from './timeCalculations';
import { departmentMatchesBreakRuleDepartments } from './departments';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BreakRule {
  id: string;
  title: string;
  /** Inizio finestra pausa (HH:mm) */
  breakStart: string;
  /** Fine finestra pausa (HH:mm) */
  breakEnd: string;
  /** Durata minima del turno in minuti per scattare la pausa (usata solo se minShiftDurationEnabled !== false) */
  minShiftMinutes: number;
  /** Se false, la soglia minShiftMinutes non si applica (pausa possibile su qualsiasi durata turno). Default true. */
  minShiftDurationEnabled?: boolean;
  /** true = retribuita (non detrae ore); false = non retribuita (detrae) */
  paid: boolean;
  /** Reparti a cui si applica ([] = tutti) */
  departments: string[];
  /** Ruoli a cui si applica ([] = tutti) */
  roles: string[];
  /** Data inizio validità, opzionale (YYYY-MM-DD) */
  validFrom?: string;
  /** Data fine validità, opzionale (YYYY-MM-DD) */
  validTo?: string;
  /** Giorni della settimana (0=Dom, 1=Lun, …, 6=Sab); [] = tutti */
  daysOfWeek: DayOfWeek[];
  /** Regola attiva (default true se assente) */
  enabled?: boolean;
}

const STORAGE_KEY = 'osteria_break_rules';
const STORAGE_SKIP_KEY = 'osteria_break_rules_storage_skip';
const BUCKET = 'app-config';
const FILE_PATH = 'break_rules.json';

function markBreakRulesStorageUnavailable(): void {
  try {
    localStorage.setItem(STORAGE_SKIP_KEY, '1');
  } catch {
    // ignore
  }
}

export function clearBreakRulesStorageSkip(): void {
  try {
    localStorage.removeItem(STORAGE_SKIP_KEY);
  } catch {
    // ignore
  }
}

export function getBreakRules(): BreakRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BreakRule[];
  } catch {
    return [];
  }
}

export function saveBreakRules(rules: BreakRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    // ignore
  }
}

/** Carica break rules da Supabase Storage. Fallback a localStorage se non disponibile. */
export async function loadBreakRulesFromSupabase(): Promise<BreakRule[] | null> {
  if (import.meta.env.VITE_APP_CONFIG_STORAGE_ENABLED === 'false') return null;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_SKIP_KEY) === '1') {
    return null;
  }
  try {
    const { supabase } = await import('../lib/supabase');
    if (!supabase) return null;
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error || !data) {
      markBreakRulesStorageUnavailable();
      return null;
    }
    const text = await data.text();
    if (!text) return null;
    const parsed = JSON.parse(text) as BreakRule[];
    const rules = Array.isArray(parsed) ? parsed : [];
    return rules;
  } catch {
    return null;
  }
}

/** Salva break rules su Supabase Storage (sync su tutti i profili/dispositivi). */
export async function saveBreakRulesToSupabase(rules: BreakRule[]): Promise<void> {
  const { supabase } = await import('../lib/supabase');
  if (!supabase) return;
  try {
    const blob = new Blob([JSON.stringify(rules)], { type: 'application/json' });
    await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, { upsert: true, contentType: 'application/json' });
    clearBreakRulesStorageSkip();
  } catch {
    /* Storage non disponibile */
  }
}

function toMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
}

/**
 * Calcola i minuti di pausa NON retribuita da detrarre per un turno specifico,
 * in base alle regole attive. Tiene conto di reparto, ruolo, data e giorno.
 *
 * Restituisce 0 se il campo `paid` è true (pausa retribuita → non detrae).
 */
export function calculateBreakDeductions(
  shift: { start_time: string; end_time: string; date: string },
  user: { department?: string | null; role: string },
  rules: BreakRule[]
): number {
  if (!rules.length) return 0;

  const shiftStart = toMinutes(shift.start_time);
  const shiftEnd = toMinutes(shift.end_time);
  let shiftDuration = shiftEnd - shiftStart;
  if (shiftDuration < 0) shiftDuration += 24 * 60;

  let totalDeduction = 0;

  for (const rule of rules) {
    // Salta regole disabilitate
    if (rule.enabled === false) continue;
    // Filtro reparto
    if (rule.departments.length > 0 && !departmentMatchesBreakRuleDepartments(user.department, rule.departments)) continue;
    // Filtro ruolo
    if (rule.roles.length > 0 && !rule.roles.includes(user.role)) continue;

    // Filtro giorni settimana
    if (rule.daysOfWeek.length > 0) {
      const dow = getDay(parseISO(shift.date)) as DayOfWeek;
      if (!rule.daysOfWeek.includes(dow)) continue;
    }

    // Filtro date validità
    if (rule.validFrom || rule.validTo) {
      try {
        const shiftDate = parseISO(shift.date);
        const from = rule.validFrom ? parseISO(rule.validFrom) : new Date(0);
        const to = rule.validTo ? parseISO(rule.validTo) : new Date(8640000000000000);
        if (!isWithinInterval(shiftDate, { start: from, end: to })) continue;
      } catch {
        continue;
      }
    }

    // Durata minima turno (disattivabile per regola)
    if (rule.minShiftDurationEnabled !== false && shiftDuration < rule.minShiftMinutes) continue;

    // Controlla se la finestra pausa si sovrappone al turno
    const breakStart = toMinutes(rule.breakStart);
    const breakEnd = toMinutes(rule.breakEnd);
    const breakDuration = Math.max(0, breakEnd - breakStart);

    const overlapStart = Math.max(shiftStart, breakStart);
    const overlapEnd = Math.min(shiftEnd, breakEnd);
    if (overlapEnd <= overlapStart) continue;

    // La pausa scatta solo se il turno copre interamente la finestra
    const shiftCoversBreak = shiftStart <= breakStart && shiftEnd >= breakEnd;
    if (!shiftCoversBreak) continue;

    // Pausa non retribuita → detrae; retribuita → non detrae
    if (!rule.paid) {
      totalDeduction += breakDuration;
    }
  }

  return totalDeduction;
}

/**
 * Versione sicura: restituisce 0 su qualsiasi errore.
 */
export function calculateBreakDeductionsSafe(
  shift: { start_time: string; end_time: string; date: string },
  user: { department?: string | null; role: string },
  rules: BreakRule[]
): number {
  try {
    return calculateBreakDeductions(shift, user, rules);
  } catch {
    return 0;
  }
}

/** Durata pausa predefinita per turni > 6 ore (minuti). */
export const DEFAULT_AUTO_BREAK_MINUTES = 30;

/** Soglia turno per pausa automatica: 6 ore in minuti. */
export const AUTO_BREAK_THRESHOLD_MINUTES = 6 * 60;

/** Solo regole con `enabled !== false` (default = attiva). */
export function getActiveBreakRules(rules: BreakRule[] | null | undefined): BreakRule[] {
  if (!rules?.length) return [];
  return rules.filter((r) => r.enabled !== false);
}

/** Opzioni comuni per calcolo pausa (allineate al feature `auto_breaks` ovunque nell’app). */
export type BreakMinutesComputeOptions = {
  /**
   * Se `false`, non applicare il fallback automatico ≥6h (30 min).
   * Le **regole pausa attive** restano sempre prioritarie. Default: true (undefined = true).
   */
  autoBreaksFeatureEnabled?: boolean;
};

/**
 * Restituisce i minuti di pausa da detrarre per un turno.
 *
 * **Priorità assoluta — regole attive:** se esiste almeno una regola con `enabled !== false` e c’è un `user`
 * per valutare reparto/ruolo, l’importo è **solo** quello calcolato dalle regole (anche 0). Non si usano
 * `break_minutes` sul turno né il fallback automatico ≥6h.
 *
 * **Senza regole attive:** `break_minutes` sul turno, altrimenti fallback 30 min se durata lorda ≥6h
 * (solo se `autoBreaksFeatureEnabled !== false`).
 */
export function getBreakMinutesForShift(
  shift: { start_time?: string; end_time?: string; date?: string; deduct_break?: boolean; break_minutes?: number },
  grossMinutes: number,
  user?: { department?: string | null; role: string } | null,
  rules?: BreakRule[] | null,
  options?: BreakMinutesComputeOptions
): number {
  const deductBreak = shift.deduct_break !== false;
  if (!deductBreak) return 0;

  const activeRules = getActiveBreakRules(rules);
  if (user && activeRules.length > 0) {
    const fromRules = calculateBreakDeductionsSafe(
      { start_time: shift.start_time ?? '', end_time: shift.end_time ?? '', date: shift.date ?? '' },
      user,
      activeRules
    );
    return Math.max(0, fromRules);
  }

  if (shift.break_minutes != null && shift.break_minutes > 0) {
    return shift.break_minutes;
  }
  if (options?.autoBreaksFeatureEnabled === false) {
    return 0;
  }
  if (grossMinutes >= AUTO_BREAK_THRESHOLD_MINUTES) {
    return DEFAULT_AUTO_BREAK_MINUTES;
  }
  return 0;
}

/** Calcola i minuti netti di un turno: (End - Start) - break. */
export function getNetShiftMinutes(
  shift: { start_time?: string; end_time?: string; date?: string; deduct_break?: boolean; break_minutes?: number },
  startTime: string,
  endTime: string,
  user?: { department?: string | null; role: string } | null,
  rules?: BreakRule[] | null,
  options?: BreakMinutesComputeOptions
): number {
  const gross = calculateShiftMinutesGross(startTime, endTime);
  const breakMins = getBreakMinutesForShift(shift, gross, user, rules, options);
  const bm = Number.isFinite(breakMins) ? breakMins : 0;
  const net = gross - bm;
  return Math.max(0, Number.isFinite(net) ? net : 0);
}
