import { getDay, parseISO, isWithinInterval } from 'date-fns';
import { calculateShiftMinutesGross, getBreakLabels } from './timeCalculations';
import { departmentMatchesBreakRuleDepartments } from './departments';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface BreakRule {
  id: string;
  title: string;
  /** Chiave icona associata alla regola (es. 'coffee', 'utensils'); assente = default */
  icon?: string;
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

/** Salva break rules in localStorage (fallback se Supabase Storage non disponibile). */
export function saveBreakRulesToLocalStorage(rules: BreakRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
    clearBreakRulesStorageSkip();
  } catch {
    /* localStorage non disponibile */
  }
}

function toMinutes(hhmm: string): number {
  const parts = String(hhmm).split(':');
  return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
}

/**
 * Calcola i minuti di pausa NON retribuita da detrarre per un turno specifico,
 * in base alle regole attive. Tiene conto di reparto, ruolo, data e giorno.
 *
 * Restituisce 0 se il campo `paid` è true (pausa retribuita → non detrae).
 */
export type BreakDeductionLine = { title: string; minutes: number; /** regola break admin */ ruleId?: string };

/**
 * Riga per riga le pause non retribuite (regole) che si applicano al turno
 * (stessi criteri di `calculateBreakDeductions`).
 */
export function getPlannedBreakDeductionLines(
  shift: { start_time: string; end_time: string; date: string },
  user: { department?: string | null; role: string },
  rules: BreakRule[]
): BreakDeductionLine[] {
  if (!rules.length) return [];

  const shiftStart = toMinutes(shift.start_time);
  const shiftEndRaw = toMinutes(shift.end_time);
  let shiftDuration = shiftEndRaw - shiftStart;
  if (shiftDuration < 0) shiftDuration += 24 * 60;
  const shiftSpanEnd = shiftEndRaw <= shiftStart ? shiftEndRaw + 24 * 60 : shiftEndRaw;

  const lines: BreakDeductionLine[] = [];

  for (const rule of rules) {
    if (rule.enabled === false) continue;
    if (rule.departments.length > 0 && !departmentMatchesBreakRuleDepartments(user.department, rule.departments)) continue;
    if (rule.roles.length > 0 && !rule.roles.includes(user.role)) continue;

    if (rule.daysOfWeek.length > 0) {
      const dow = getDay(parseISO(shift.date)) as DayOfWeek;
      if (!rule.daysOfWeek.includes(dow)) continue;
    }

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

    if (rule.minShiftDurationEnabled !== false && shiftDuration < rule.minShiftMinutes) continue;

    const breakStart = toMinutes(rule.breakStart);
    const breakEnd = toMinutes(rule.breakEnd);
    const breakDuration = Math.max(0, breakEnd - breakStart);

    const overlapEnd = Math.min(shiftSpanEnd, breakEnd);
    const overlapStart = Math.max(shiftStart, breakStart);
    if (overlapEnd <= overlapStart) continue;

    const shiftCoversBreak = shiftStart <= breakStart && shiftSpanEnd >= breakEnd;
    if (!shiftCoversBreak) continue;

    if (!rule.paid && breakDuration > 0) {
      lines.push({
        title: (rule.title && rule.title.trim()) || 'Pausa',
        minutes: breakDuration,
        ruleId: rule.id,
      });
    }
  }

  return lines;
}

/** Durata pausa predefinita per turni > 6 ore (minuti). */
export const DEFAULT_AUTO_BREAK_MINUTES = 30;

/** ID sintetici in `deduct_excluded_rule_ids` per escludere pranzo/cena nel percorso pausa auto (≥6h, senza regole admin). */
export const FLOW_MEAL_EXCLUSION_LUNCH = '__flow_meal_lunch' as const;
export const FLOW_MEAL_EXCLUSION_DINNER = '__flow_meal_dinner' as const;

export function flowMealExclusionId(meal: 'lunch' | 'dinner'): string {
  return meal === 'lunch' ? FLOW_MEAL_EXCLUSION_LUNCH : FLOW_MEAL_EXCLUSION_DINNER;
}

/** Soglia turno per pausa automatica — DEFAULT: 6 ore in minuti (prima fascia predefinita). */
export const AUTO_BREAK_THRESHOLD_MINUTES = 6 * 60;

/** Fascia progressiva di pausa automatica: turni ≥ `minShiftMinutes` → `breakMinutes` di pausa. */
export interface AutoBreakTier {
  minShiftMinutes: number;
  breakMinutes: number;
}

/** Fascia predefinita (6h → 30′): replica il comportamento storico della soglia singola. */
export const DEFAULT_AUTO_BREAK_TIER: AutoBreakTier = {
  minShiftMinutes: AUTO_BREAK_THRESHOLD_MINUTES,
  breakMinutes: DEFAULT_AUTO_BREAK_MINUTES,
};

/**
 * Fasce pausa automatica ATTIVE nell'app: aggiornate dalle Work Rules
 * (`autoBreakTiers`) quando l'admin le modifica in Impostazioni.
 * [] = pausa automatica disattivata.
 */
let currentAutoBreakTiers: AutoBreakTier[] = [{ ...DEFAULT_AUTO_BREAK_TIER }];

export function sanitizeAutoBreakTiers(tiers: AutoBreakTier[] | null | undefined): AutoBreakTier[] {
  if (!Array.isArray(tiers)) return [{ ...DEFAULT_AUTO_BREAK_TIER }];
  const cleaned = tiers
    .filter((t) => t && Number.isFinite(t.minShiftMinutes) && Number.isFinite(t.breakMinutes))
    .map((t) => ({
      minShiftMinutes: Math.max(0, Math.round(t.minShiftMinutes)),
      breakMinutes: Math.max(0, Math.round(t.breakMinutes)),
    }))
    .sort((a, b) => a.minShiftMinutes - b.minShiftMinutes);
  return cleaned.length > 0 ? cleaned : [];
}

export function setAutoBreakTiers(tiers: AutoBreakTier[] | null | undefined): void {
  currentAutoBreakTiers = sanitizeAutoBreakTiers(tiers);
}

export function getAutoBreakTiers(): AutoBreakTier[] {
  return currentAutoBreakTiers;
}

/**
 * Minuti di pausa per la fascia più alta coperta dal turno.
 * Es. fasce [6h→30, 8h→45, 10h→60]: turno da 9h → 45; da 5h → 0.
 * 0 = nessuna fascia applicabile (o fasce vuote → pausa auto disattivata).
 */
export function getAutoBreakMinutesForGross(grossMinutes: number): number {
  let minutes = 0;
  for (const tier of currentAutoBreakTiers) {
    if (grossMinutes >= tier.minShiftMinutes && tier.breakMinutes > minutes) {
      minutes = tier.breakMinutes;
    }
  }
  return minutes;
}

/**
 * Soglia pausa automatica minima ATTIVA nell'app: il minore tra le `minShiftMinutes`
 * delle fasce configurate (usata per etichette e check "può avere pausa").
 * 0 = nessuna soglia minima (fasce che partono da 0, o fasce vuote).
 */
export function getAutoBreakThresholdMinutes(): number {
  if (currentAutoBreakTiers.length === 0) return 0;
  return Math.min(...currentAutoBreakTiers.map((t) => t.minShiftMinutes));
}

/** Solo regole con `enabled !== false` (default = attiva). */
export function getActiveBreakRules(rules: BreakRule[] | null | undefined): BreakRule[] {
  if (!rules?.length) return [];
  return rules.filter((r) => r.enabled !== false);
}

/** Opzioni comuni per calcolo pausa (allineate al feature `auto_breaks` ovunque nell’app). */
export type BreakMinutesComputeOptions = {
  /**
   * Se `false`, non applicare il **solo** fallback generico ≥6h (30 min senza fasce pasto).
   * Fasce pranzo/cena (`getBreakLabels`) e regole admin restano prioritarie. Default: true.
   */
  autoBreaksFeatureEnabled?: boolean;
  /**
   * Finestra oraria (HH:mm) usata per **regole pausa** (sovrapposizione con breakStart/breakEnd, durata minima turno).
   * Se assente, si usano `shift.start_time` / `shift.end_time` (pianificato).
   * Per ore effettive: passare orari da timbratura / congelamento (es. da `getNetShiftMinutes`).
   */
  breakRuleWindow?: { start: string; end: string };
};

/**
 * Restituisce i minuti di pausa da detrarre per un turno.
 *
 * **Turno completato**: i minuti pausa vengono dal campo break_minutes o calcolati sulle regle
 * sulle regole pranzo/cena rispetto alle timbrature effettive.
 *
 * **Regole attive** (bozze o turni non ancora sigillati in contabilità): con almeno una regola
 * `enabled !== false` e un `user`, l’importo è **solo** quello dalle regole
 * (anche 0 se nessuna finestra admin copre il turno, es. turno 18:00 con pause 11:30–12 e 17:00–17:30).
 * Non si applicano `break_minutes` sul turno né il fallback automatico ≥6h (evita −30′ indebiti).
 *
 * **Senza regole attive:** `break_minutes` sul turno; con durata ≥6h, fasce pasto
 * (vedi `getBreakLabels`) e `deduct_excluded_rule_ids` su `__flow_meal_*` si detrae **30 min per fascia
 * attiva**; se nessuna fascia copre la finestra ma la durata è ≥6h, resta 30 min di fallback
 * (disattivabile con `autoBreaksFeatureEnabled: false` — es. turno congelato oltre il pianificato, senza pasti
 * in finestra). `is_auto_break: false` disattiva l’autocalcolo fasce+fallback.
 */
export function getBreakMinutesForShift(
  shift: {
    start_time?: string;
    end_time?: string;
    date?: string;
      deduct_break?: boolean;
    break_minutes?: number;
    /** Se `false`, non applicare la pausa automatica (≥6h) quando non si usano `break_minutes` né le regole. */
    is_auto_break?: boolean;
    /** Regole break admin escluse per questo turno. */
    deduct_excluded_rule_ids?: string[];
  },
  grossMinutes: number,
  user?: { department?: string | null; role: string } | null,
  rules?: BreakRule[] | null,
  options?: BreakMinutesComputeOptions
): number {
  const deductBreak = shift.deduct_break !== false;
  if (!deductBreak) return 0;

  /* Regole admin attive: prioritarie — calcolate prima di break_minutes bloccati
     (che potrebbero essere 0 per turni non ancora processati dalle regole). */
  const activeRules = getActiveBreakRules(rules);
  if (user && activeRules.length > 0) {
    const w = options?.breakRuleWindow;
    const st = (w?.start ?? String(shift.start_time ?? '')).slice(0, 5);
    const en = (w?.end ?? String(shift.end_time ?? '')).slice(0, 5);
    const d = shift.date ?? '';
    if (!st || !en || !d) return 0;
    let lines = getPlannedBreakDeductionLines(
      { start_time: st, end_time: en, date: d },
      user,
      activeRules
    );
    /* Se nessuna regola ha matchato il ruolo/reparto dell'utente, riprova senza filtri. */
    if (lines.length === 0) {
      lines = getPlannedBreakDeductionLines(
        { start_time: st, end_time: en, date: d },
        { role: '' },
        activeRules.map((r) => ({ ...r, departments: [], roles: [] }))
      );
    }
    const ex = new Set(shift.deduct_excluded_rule_ids ?? []);
    const fromRules = lines
      .filter((l) => !l.ruleId || !ex.has(l.ruleId))
      .reduce((sum, l) => sum + l.minutes, 0);
    if (fromRules > 0) return Math.max(0, fromRules);
  }

  /* Pausa manuale sul turno: rispetta `break_minutes` solo se non è la pausa automatica persistita. */
  if (shift.break_minutes != null && shift.break_minutes > 0 && shift.is_auto_break !== true) {
    return shift.break_minutes;
  }
  /* Se le regole sono state esplicitamente passate come vuote (feature flag auto_breaks OFF),
     non applicare la pausa automatica pasto. */
  if (rules !== undefined && rules !== null && rules.length === 0 && activeRules.length === 0) {
    return 0;
  }
  const startStr = (options?.breakRuleWindow?.start ?? String(shift.start_time ?? '')).slice(0, 5);
  const endStr   = (options?.breakRuleWindow?.end   ?? String(shift.end_time   ?? '')).slice(0, 5);
  // Turni che attraversano la mezzanotte (escluso 00:00 = fine giornata): niente fasce pasto né fallback generico
  const endMinutes = endStr === '00:00' ? 1440 : toMinutes(endStr);
  if (startStr && endStr && endMinutes <= toMinutes(startStr)) {
    return 0;
  }
  /* Fasce progressive: si applica la fascia più alta coperta dal turno (0 = nessuna fascia → nessuna pausa auto). */
  const tierBreakMinutes = getAutoBreakMinutesForGross(grossMinutes);
  if (tierBreakMinutes <= 0) {
    return 0;
  }
  const mealKeys = getBreakLabels(startStr, endStr);
  if (mealKeys.length > 0) {
    const ex = new Set(shift.deduct_excluded_rule_ids ?? []);
    const active = mealKeys.filter((k) => !ex.has(flowMealExclusionId(k)));
    return active.length * tierBreakMinutes;
  }
  if (options?.autoBreaksFeatureEnabled === false) {
    return 0;
  }
  /* Nessuna fascia pasto coperta → nessuna detrazione automatica. */
  return 0;
}

/** Calcola i minuti netti di un turno: (End - Start) - break. */
export function getNetShiftMinutes(
  shift: {
    start_time?: string;
    end_time?: string;
    date?: string;
      deduct_break?: boolean;
    break_minutes?: number;
    is_auto_break?: boolean;
  },
  startTime: string,
  endTime: string,
  user?: { department?: string | null; role: string } | null,
  rules?: BreakRule[] | null,
  options?: BreakMinutesComputeOptions
): number {
  const gross = calculateShiftMinutesGross(startTime, endTime);
  const breakMins = getBreakMinutesForShift(shift, gross, user, rules, {
    ...options,
    breakRuleWindow: { start: String(startTime).slice(0, 5), end: String(endTime).slice(0, 5) },
  });
  const bm = Number.isFinite(breakMins) ? breakMins : 0;
  const net = gross - bm;
  return Math.max(0, Number.isFinite(net) ? net : 0);
}

/**
 * Voci per il testo sotto l’interruttore «Detrae pausa» nel drawer presenze.
 * Con regole attive: **una riga per ogni pausa non retribuita**; altrimenti una riga con etichetta i18n.
 */
export function getBreakDeductionDisplayItems(
  shift: {
    start_time?: string;
    end_time?: string;
    date?: string;
    deduct_break?: boolean;
    break_minutes?: number;
    is_auto_break?: boolean;
    deduct_excluded_rule_ids?: string[];
  },
  grossMinutes: number,
  user: { department?: string | null; role: string } | null | undefined,
  rules: BreakRule[] | null | undefined,
  options: BreakMinutesComputeOptions | undefined,
  i18n: { fromShift: string; auto: string; lunch: string; dinner: string }
): BreakDeductionLine[] {
  if (shift.deduct_break === false) return [];
  /* Regole admin attive: prioritarie — stesse priorità di getBreakMinutesForShift. */
  const active = getActiveBreakRules(rules);
  if (user && active.length > 0) {
    const w = options?.breakRuleWindow;
    const st = (w?.start ?? shift.start_time ?? '').slice(0, 5);
    const en = (w?.end ?? shift.end_time ?? '').slice(0, 5);
    const d = shift.date ?? '';
    if (!st || !en || !d) return [];
    let adminLines = getPlannedBreakDeductionLines(
      { start_time: st, end_time: en, date: d },
      user,
      active
    );
    /* Fallback: se nessuna regola ha matchato ruolo/reparto, prova senza filtri. */
    if (adminLines.length === 0) {
      adminLines = getPlannedBreakDeductionLines(
        { start_time: st, end_time: en, date: d },
        { role: '' },
        active.map((r) => ({ ...r, departments: [], roles: [] }))
      );
    }
    const ex = new Set(shift.deduct_excluded_rule_ids ?? []);
    const filtered = adminLines.filter((l) => !l.ruleId || !ex.has(l.ruleId));
    if (filtered.length > 0) return filtered;
    /* Se le regole admin danno 0 righe, ricadi al calcolo automatico fasce pasto. */
  }
  const startStr = (options?.breakRuleWindow?.start ?? shift.start_time ?? '').slice(0, 5);
  const endStr = (options?.breakRuleWindow?.end ?? shift.end_time ?? '').slice(0, 5);
  const endMinutesCheck = endStr === '00:00' ? 1440 : toMinutes(endStr);
  /* Fasce progressive: minuti per la fascia più alta coperta dal turno (0 = nessuna fascia). */
  const autoBreakMins = getAutoBreakMinutesForGross(grossMinutes);
  /** Pranzo/cena (fasce) con interruttori separati — allineate a getBreakMinutesForShift (anche con `autoBreaksFeatureEnabled: false` per fasce). */
  if (
    startStr &&
    endStr &&
    endMinutesCheck > toMinutes(startStr) &&
    autoBreakMins > 0 &&
    shift.is_auto_break !== false &&
    !(shift.break_minutes != null && shift.break_minutes > 0 && shift.is_auto_break !== true)
  ) {
    const mealKeys = getBreakLabels(startStr, endStr);
    if (mealKeys.length > 0) {
      return mealKeys.map((k) => ({
        title: k === 'lunch' ? i18n.lunch : i18n.dinner,
        minutes: autoBreakMins,
        ruleId: flowMealExclusionId(k),
      }));
    }
  }
  const total = getBreakMinutesForShift(shift, grossMinutes, user, rules, options);
  if (total <= 0) return [];
  if (shift.break_minutes != null && shift.break_minutes > 0 && shift.is_auto_break !== true) {
    return [{ title: i18n.fromShift, minutes: total }];
  }
  if (
    (options?.autoBreaksFeatureEnabled !== false) &&
    startStr &&
    endStr &&
    endMinutesCheck > toMinutes(startStr) &&
    autoBreakMins > 0
  ) {
    if (shift.is_auto_break === false) {
      return [];
    }
    return [{ title: i18n.auto, minutes: total }];
  }
  return [{ title: i18n.fromShift, minutes: total }];
}
