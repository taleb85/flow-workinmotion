import { format, parseISO, startOfWeek, startOfDay, startOfMonth, addDays, endOfMonth, subDays, getDay } from 'date-fns';

export const PERIOD_STORAGE_KEY = 'osteria_timesheet_period';

export type PeriodConfig = { startDate: string; numWeeks: 4 | 5 };

const PERIOD_UPDATED_EVENT = 'osteria_period_updated';

/** Notifica tutti i componenti che il periodo presenze è cambiato (localStorage o remoto). */
export function dispatchPeriodConfigUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PERIOD_UPDATED_EVENT));
  }
}

/**
 * Valida JSON remoto / oggetto arbitrario come PeriodConfig.
 * Ritorna null se non è utilizzabile (non sovrascrivere il locale).
 */
export function coercePeriodConfig(parsed: unknown): PeriodConfig | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const o = parsed as Record<string, unknown>;
  const numWeeks = o.numWeeks === 5 ? 5 : 4;
  if (typeof o.startDate !== 'string') return null;
  const startStr = o.startDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) return null;
  const testDate = parseISO(startStr);
  if (Number.isNaN(testDate.getTime())) return null;
  return { startDate: startStr, numWeeks: numWeeks as 4 | 5 };
}

/** Carica la configurazione periodo da localStorage (data inizio + 4 o 5 settimane). */
export function loadPeriodConfig(): PeriodConfig {
  const autoDefault = currentPeriodConfig();
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return autoDefault;
    }
    const raw = localStorage.getItem(PERIOD_STORAGE_KEY);
    if (!raw || typeof raw !== 'string') return autoDefault;
    const parsed = JSON.parse(raw) as { startDate?: string; numWeeks?: number };
    const numWeeks = (parsed?.numWeeks === 5 ? 5 : 4) as 4 | 5;
    const startStr = parsed?.startDate ? String(parsed.startDate).slice(0, 10) : autoDefault.startDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr)) return { startDate: autoDefault.startDate, numWeeks };
    const testDate = parseISO(startStr);
    if (Number.isNaN(testDate.getTime())) return { startDate: autoDefault.startDate, numWeeks };

    // Se il periodo salvato non contiene la data odierna, resetta al periodo corrente
    const savedConfig: PeriodConfig = { startDate: startStr, numWeeks };
    const savedStart = getPeriodStartDate(savedConfig);
    const savedEnd = getPeriodEndDate(savedConfig);
    const today = startOfDay(new Date());
    if (today < savedStart || today > savedEnd) {
      return autoDefault;
    }

    return savedConfig;
  } catch {
    try {
      localStorage.removeItem(PERIOD_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return autoDefault;
  }
}

/** Salva la configurazione periodo in localStorage. */
export function savePeriodConfig(cfg: PeriodConfig): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(PERIOD_STORAGE_KEY, JSON.stringify(cfg));
    }
  } catch {
    /* ignore */
  }
}

/**
 * Indice settimana (0-based) nel periodo configurato che contiene `refDate` (default: oggi).
 * Allineato al pulsante «Oggi» in Gestione turni: fuori dall’intervallo → clamp a 0 … ultima settimana.
 */
export function weekIndexForDateInPeriod(config: PeriodConfig, refDate: Date = new Date()): number {
  const periodStart = getPeriodStartDate(config);
  const maxWeekIndex = Math.max(0, config.numWeeks - 1);
  const refDay = startOfDay(refDate);
  const diffDays = Math.round((refDay.getTime() - periodStart.getTime()) / 86_400_000);
  return Math.max(0, Math.min(maxWeekIndex, Math.floor(diffDays / 7)));
}

/** Restituisce la data di inizio del periodo (startOfDay). */
export function getPeriodStartDate(config: PeriodConfig): Date {
  const defaultStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  try {
    const d = parseISO(config.startDate);
    if (Number.isNaN(d.getTime())) return startOfDay(parseISO(defaultStart));
    return startOfDay(d);
  } catch {
    return startOfDay(parseISO(defaultStart));
  }
}

/** Restituisce la data di fine del periodo (ultimo giorno). */
export function getPeriodEndDate(config: PeriodConfig): Date {
  const start = getPeriodStartDate(config);
  return addDays(start, Math.max(1, config.numWeeks) * 7 - 1);
}

/** Restituisce { startDate, endDate } in formato yyyy-MM-dd per il periodo. */
export function getPeriodDateRange(config: PeriodConfig): { startDate: string; endDate: string } {
  const start = getPeriodStartDate(config);
  const end = getPeriodEndDate(config);
  return {
    startDate: format(start, 'yyyy-MM-dd'),
    endDate: format(end, 'yyyy-MM-dd'),
  };
}

// ── Logica periodo basata sull'ultima domenica del mese ───────────────────────
//
// Regola:
//   • Il periodo termina sull'ULTIMA DOMENICA del mese di riferimento.
//   • Il periodo inizia il LUNEDÌ successivo all'ultima domenica del mese precedente.
//   • La durata (4 o 5 sett.) dipende da quante settimane complete cadono tra inizio e fine.
//
// Esempi verificati:
//   dic 2025 → ultima dom = 28/12/2025 → periodo gen: 29/12 → 25/01 (4 sett.)
//   gen 2026 → ultima dom = 25/01/2026 → periodo feb: 26/01 → 22/02 (4 sett.)
//   feb 2026 → ultima dom = 22/02/2026 → periodo mar: 23/02 → 29/03 (5 sett.)

/** Ultima domenica del mese che contiene `d`. */
export function lastSundayOfMonth(d: Date): Date {
  const last = endOfMonth(d);
  const dow = getDay(last); // 0 = dom, 1 = lun, …, 6 = sab
  return startOfDay(subDays(last, dow));
}

/**
 * Costruisce il PeriodConfig per il mese che contiene `refDate`.
 * Il periodo termina sull'ultima domenica di quel mese
 * e inizia il lunedì dopo l'ultima domenica del mese precedente.
 *
 * Fix: si trova l'ultima domenica del mese PRECEDENTE andando all'ultimo giorno del mese
 * prima di refDate, così non si resta mai nello stesso mese.
 */
export function periodConfigForMonth(refDate: Date): PeriodConfig {
  const endSun = lastSundayOfMonth(refDate);
  // Ultimo giorno del mese precedente = giorno prima dell'inizio del mese di refDate
  const prevMonthLastDay = subDays(startOfMonth(refDate), 1);
  const prevMonthLastSun = lastSundayOfMonth(prevMonthLastDay);
  const startMon = addDays(prevMonthLastSun, 1); // lunedì dopo l'ultima domenica del mese precedente

  // numWeeks = numero di settimane complete tra startMon e endSun (inclusi)
  const days = Math.round((endSun.getTime() - startMon.getTime()) / 86_400_000) + 1;
  const weeks = Math.round(days / 7);
  const numWeeks: 4 | 5 = weeks === 5 ? 5 : 4;

  return { startDate: format(startMon, 'yyyy-MM-dd'), numWeeks };
}

/** Periodo del mese successivo a quello che inizia con `startDate`. */
export function nextPeriodConfig(current: PeriodConfig): PeriodConfig {
  const currentEnd = getPeriodEndDate(current); // ultima dom del periodo corrente
  const _nextMonthRef = addDays(currentEnd, 1);  // primo giorno del mese successivo (lunedì)
  return periodConfigForMonth(addDays(currentEnd, 14)); // ref a metà del mese successivo
}

/** Periodo del mese precedente a quello che inizia con `startDate`. */
export function prevPeriodConfig(current: PeriodConfig): PeriodConfig {
  const currentStart = getPeriodStartDate(current);
  const prevMonthRef = subDays(currentStart, 7); // una settimana prima → dentro il mese precedente
  return periodConfigForMonth(prevMonthRef);
}

/** Periodo corrente basato su oggi. */
export function currentPeriodConfig(): PeriodConfig {
  return periodConfigForMonth(new Date());
}

/**
 * Trova il PeriodConfig il cui intervallo CONTIENE `refDate`.
 * Prova i candidati costruiti dal mese di refDate e dai mesi a ±7 giorni,
 * così le date ai confini di mese (es. un lunedì di fine dicembre) ricadono
 * nel periodo corretto (es. quello di gennaio).
 */
export function periodConfigContainingDate(refDate: Date): PeriodConfig {
  const ref = startOfDay(refDate);
  const candidates = [
    periodConfigForMonth(ref),
    periodConfigForMonth(subDays(ref, 7)),
    periodConfigForMonth(addDays(ref, 7)),
  ];
  for (const cfg of candidates) {
    const start = getPeriodStartDate(cfg);
    const end = getPeriodEndDate(cfg);
    if (ref >= start && ref <= end) return cfg;
  }
  return candidates[0];
}

/**
 * Regola "Primo giorno": costruisce il PeriodConfig partendo da una data di inizio
 * scelta dall'utente.
 * Il periodo termina sull'ultima domenica del mese che si trova a ~2 settimane
 * dalla data di inizio (così si trova il mese "target" corretto per 4-5 settimane).
 * Se l'ultima domenica trovata è prima o uguale all'inizio, si sposta al mese successivo.
 */
export function periodConfigFromStartDate(startDate: Date): PeriodConfig {
  const start = startOfDay(startDate);
  // Punto di mezzo per individuare il mese in cui dovrebbe terminare il periodo
  const midPoint = addDays(start, 14);
  let endSun = lastSundayOfMonth(midPoint);

  // Se l'ultima domenica trovata è uguale o precedente alla data di inizio, sposta al mese successivo
  if (endSun.getTime() <= start.getTime()) {
    endSun = lastSundayOfMonth(addDays(start, 35));
  }

  const days = Math.round((endSun.getTime() - start.getTime()) / 86_400_000) + 1;
  const weeks = Math.round(days / 7);
  const numWeeks: 4 | 5 = weeks === 5 ? 5 : 4;
  return { startDate: format(start, 'yyyy-MM-dd'), numWeeks };
}
