import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PUNCH_ROUNDING_RULES,
  computeRoundedPunchTime,
  isRoundingExceptional,
  planPunchRoundingRecalculation,
  previewPunchRounding,
  punchMinutesRelativeToShift,
  roundBreakWindow,
  roundMinutesOnGrid,
  sanitizePunchRoundingRules,
  validatePunchRoundingRules,
  type PunchRoundingRules,
} from '../utils/punchRoundingRules';

/** ISO di un orario locale (evita dipendenze dal fuso orario del runner). */
function localIso(shiftDate: string, hh: number, mm: number): string {
  const [y, m, d] = shiftDate.split('-').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

/** Regole con arrotondamento attivo e passi noti, senza eccezioni. */
function enabledRules(overrides: Partial<PunchRoundingRules> = {}): PunchRoundingRules {
  return {
    ...DEFAULT_PUNCH_ROUNDING_RULES,
    enabled: true,
    clockIn: { enabled: true, stepMinutes: 15, direction: 'up', anchor: 'shiftStart', neverBeforeShiftStart: true },
    clockOut: { enabled: true, stepMinutes: 15, direction: 'down', anchor: 'shiftEnd' },
    // Copia profonda: i test modificano le eccezioni e non devono toccare i default.
    exceptions: { weekdays: [], roles: [], departments: [] },
    ...overrides,
  };
}

describe('roundMinutesOnGrid', () => {
  it('arrotonda per eccesso sulla griglia ancorata alla base', () => {
    expect(roundMinutesOnGrid(503, 480, 5, 'up')).toBe(505);
  });

  it('arrotonda per difetto', () => {
    expect(roundMinutesOnGrid(503, 480, 5, 'down')).toBe(500);
  });

  it('arrotonda al valore più vicino', () => {
    expect(roundMinutesOnGrid(502, 480, 5, 'nearest')).toBe(500);
    expect(roundMinutesOnGrid(503, 480, 5, 'nearest')).toBe(505);
  });

  it('lascia invariato un orario già allineato', () => {
    expect(roundMinutesOnGrid(500, 480, 5, 'up')).toBe(500);
    expect(roundMinutesOnGrid(500, 480, 5, 'down')).toBe(500);
  });

  it('ignora passi non validi', () => {
    expect(roundMinutesOnGrid(503, 480, 0, 'up')).toBe(503);
  });
});

describe('punchMinutesRelativeToShift', () => {
  it('mantiene i minuti del giorno per timbrature nello stesso giorno', () => {
    expect(punchMinutesRelativeToShift(localIso('2026-09-22', 18, 7), '2026-09-22')).toBe(1087);
  });

  it('supera i 1440 minuti per timbrature dopo la mezzanotte', () => {
    expect(punchMinutesRelativeToShift(localIso('2026-09-23', 2, 7), '2026-09-22')).toBe(1440 + 127);
  });
});

describe('computeRoundedPunchTime', () => {
  const shift = { date: '2026-09-22', start_time: '18:00', end_time: '23:00' };

  it('non modifica l’orario quando le regole sono disattivate', () => {
    const res = computeRoundedPunchTime({
      rules: { ...DEFAULT_PUNCH_ROUNDING_RULES, enabled: false },
      type: 'in',
      rawIso: localIso('2026-09-22', 18, 7),
      shift,
    });
    expect(res.skippedReason).toBe('rules_disabled');
    expect(res.effectiveMinutes).toBe(1087);
    expect(res.rounded).toBe(false);
  });

  it('arrotonda l’entrata per eccesso sull’inizio turno', () => {
    const res = computeRoundedPunchTime({
      rules: enabledRules(),
      type: 'in',
      rawIso: localIso('2026-09-22', 18, 7),
      shift,
    });
    expect(res.effectiveMinutes).toBe(1095); // 18:15
    expect(res.deltaMinutes).toBe(8);
    expect(res.appliedRule).toEqual({ direction: 'up', stepMinutes: 15, anchor: 'shiftStart' });
  });

  it('arrotonda l’uscita per difetto sulla fine turno', () => {
    const res = computeRoundedPunchTime({
      rules: enabledRules(),
      type: 'out',
      rawIso: localIso('2026-09-22', 23, 7),
      shift,
    });
    expect(res.effectiveMinutes).toBe(1380); // 23:00
    expect(res.deltaMinutes).toBe(-7);
  });

  it('applica “mai prima dell’inizio turno” anche senza arrotondamento attivo', () => {
    const res = computeRoundedPunchTime({
      rules: { ...DEFAULT_PUNCH_ROUNDING_RULES, enabled: false },
      type: 'in',
      rawIso: localIso('2026-09-22', 17, 16),
      shift,
    });
    expect(res.effectiveMinutes).toBe(1080); // 18:00
    expect(res.rounded).toBe(true);
  });

  it('mantiene l’entrata anticipata quando la politica è disattivata', () => {
    const rules = enabledRules();
    rules.clockIn = { enabled: true, stepMinutes: 15, direction: 'down', anchor: 'shiftStart', neverBeforeShiftStart: false };
    const res = computeRoundedPunchTime({
      rules,
      type: 'in',
      rawIso: localIso('2026-09-22', 17, 50),
      shift,
    });
    expect(res.rawMinutes).toBe(1070);
    expect(res.effectiveMinutes).toBe(1065); // 17:45, prima dell’inizio turno
  });

  it('riporta l’entrata anticipata all’inizio turno quando la politica è attiva', () => {
    const rules = enabledRules();
    rules.clockIn = { enabled: true, stepMinutes: 15, direction: 'down', anchor: 'shiftStart', neverBeforeShiftStart: true };
    const res = computeRoundedPunchTime({
      rules,
      type: 'in',
      rawIso: localIso('2026-09-22', 17, 50),
      shift,
    });
    expect(res.effectiveMinutes).toBe(1080); // 18:00
  });

  it('non arrotonda la regola disattivata per il tipo di timbratura', () => {
    const rules = enabledRules();
    rules.clockOut = { ...rules.clockOut, enabled: false };
    const res = computeRoundedPunchTime({
      rules,
      type: 'out',
      rawIso: localIso('2026-09-22', 23, 7),
      shift,
    });
    expect(res.skippedReason).toBe('rule_disabled');
    expect(res.effectiveMinutes).toBe(1387);
  });

  it('gestisce il turno oltre la mezzanotte con ancoraggio alla fine turno', () => {
    const nightShift = { date: '2026-09-22', start_time: '22:00', end_time: '02:00' };
    const res = computeRoundedPunchTime({
      rules: enabledRules({ clockOut: { enabled: true, stepMinutes: 30, direction: 'down', anchor: 'shiftEnd' } }),
      type: 'out',
      rawIso: localIso('2026-09-23', 2, 7),
      shift: nightShift,
    });
    expect(res.effectiveMinutes).toBe(1560); // 02:00 del giorno dopo
    expect(res.deltaMinutes).toBe(-7);
  });

  it('salta l’arrotondamento per un turno in eccezione (giorno della settimana)', () => {
    const rules = enabledRules();
    rules.exceptions.weekdays = [2]; // 2026-09-22 è un martedì
    const res = computeRoundedPunchTime({
      rules,
      type: 'in',
      rawIso: localIso('2026-09-22', 18, 7),
      shift,
    });
    expect(res.skippedReason).toBe('exception');
    expect(res.effectiveMinutes).toBe(1087);
  });

  it('salta l’arrotondamento per un turno in eccezione (ruolo e reparto)', () => {
    const rules = enabledRules();
    rules.exceptions.roles = ['manager'];
    rules.exceptions.departments = ['kitchen'];
    expect(isRoundingExceptional(rules, shift, { role: 'MANAGER' })).toBe(true);
    expect(isRoundingExceptional(rules, shift, { department: 'Kitchen' })).toBe(true);
    expect(isRoundingExceptional(rules, shift, { role: 'waiter', department: 'sala' })).toBe(false);
  });
});

describe('roundBreakWindow', () => {
  const shift = { date: '2026-09-22', start_time: '12:00', end_time: '23:00' };

  it('lascia invariata la finestra quando l’arrotondamento è disattivato', () => {
    const res = roundBreakWindow({
      rules: { ...DEFAULT_PUNCH_ROUNDING_RULES, enabled: false },
      startHHMM: '12:07',
      endHHMM: '12:22',
      shift,
    });
    expect(res).toEqual({ start: '12:07', end: '12:22', rounded: false });
  });

  it('arrotonda inizio e fine della finestra pausa', () => {
    const rules = enabledRules({
      breakStart: { enabled: true, stepMinutes: 15, direction: 'down' },
      breakEnd: { enabled: true, stepMinutes: 15, direction: 'up' },
    });
    const res = roundBreakWindow({ rules, startHHMM: '12:07', endHHMM: '12:22', shift });
    expect(res).toEqual({ start: '12:00', end: '12:30', rounded: true });
  });

  it('non produce una finestra con fine precedente all’inizio', () => {
    const rules = enabledRules({
      breakStart: { enabled: true, stepMinutes: 30, direction: 'up' },
      breakEnd: { enabled: true, stepMinutes: 30, direction: 'down' },
    });
    const res = roundBreakWindow({ rules, startHHMM: '12:40', endHHMM: '12:35', shift });
    expect(res.end).toBe(res.start);
  });
});

describe('sanitizePunchRoundingRules', () => {
  it('restituisce i valori predefiniti per input non valido', () => {
    expect(sanitizePunchRoundingRules(null)).toEqual(DEFAULT_PUNCH_ROUNDING_RULES);
  });

  it('limita i passi e scarta direzioni non valide', () => {
    const res = sanitizePunchRoundingRules({
      enabled: true,
      clockIn: { enabled: true, stepMinutes: 999, direction: 'sideways', anchor: 'ora' },
    });
    expect(res.clockIn.stepMinutes).toBe(60);
    expect(res.clockIn.direction).toBe('up');
    expect(res.clockIn.anchor).toBe('shiftStart');
  });

  it('normalizza le eccezioni (dettagli, duplicati, valori fuori range)', () => {
    const res = sanitizePunchRoundingRules({
      exceptions: { weekdays: [2, 2, 9, -1], roles: ['manager', 'manager', ''], departments: ['sala'] },
    });
    expect(res.exceptions.weekdays).toEqual([2]);
    expect(res.exceptions.roles).toEqual(['manager']);
    expect(res.exceptions.departments).toEqual(['sala']);
  });
});

describe('validatePunchRoundingRules', () => {
  it('accetta una configurazione coerente', () => {
    expect(validatePunchRoundingRules(enabledRules())).toEqual([]);
  });

  it('segnala un passo fuori intervallo', () => {
    const rules = enabledRules();
    rules.clockIn.stepMinutes = 90;
    expect(validatePunchRoundingRules(rules).some((i) => i.code === 'step_out_of_range')).toBe(true);
  });

  it('segnala l’arrotondamento attivo senza regole selezionate', () => {
    const rules = enabledRules();
    rules.clockIn.enabled = false;
    rules.clockOut.enabled = false;
    expect(validatePunchRoundingRules(rules).some((i) => i.code === 'no_active_rule')).toBe(true);
  });

  it('segnala il passo che non divide 60 con arrotondamento matematico', () => {
    const rules = enabledRules();
    rules.clockOut = { enabled: true, stepMinutes: 7, direction: 'nearest', anchor: 'shiftEnd' };
    expect(validatePunchRoundingRules(rules).some((i) => i.code === 'nearest_requires_odd_step')).toBe(true);
  });

  it('segnala tutti i giorni in eccezione', () => {
    const rules = enabledRules();
    rules.exceptions.weekdays = [0, 1, 2, 3, 4, 5, 6];
    expect(validatePunchRoundingRules(rules).some((i) => i.code === 'exception_emptied')).toBe(true);
  });
});

describe('planPunchRoundingRecalculation', () => {
  const shift = { id: 's1', date: '2026-09-22', start_time: '18:00', end_time: '23:00' };
  const punches = [
    {
      id: 'p1',
      user_id: 'u1',
      type: 'out' as const,
      timestamp: localIso('2026-09-22', 22, 50),
      calculated_time: null,
      shift_id: 's1',
    },
  ];
  const base = {
    punches,
    shifts: [shift],
    users: [{ id: 'u1', role: 'waiter', department: 'sala' }],
  };

  it('riallinea le timbrature app/kiosk registrate con le regole precedenti', () => {
    const plan = planPunchRoundingRecalculation({
      previousRules: { ...DEFAULT_PUNCH_ROUNDING_RULES, enabled: false },
      nextRules: enabledRules(),
      ...base,
    });
    expect(plan).toEqual([{ id: 'p1', iso: localIso('2026-09-22', 22, 45) }]);
  });

  it('riallinea le timbrature mai corrette anche risalvando le stesse regole', () => {
    const plan = planPunchRoundingRecalculation({
      previousRules: enabledRules(),
      nextRules: enabledRules(),
      ...base,
    });
    expect(plan).toEqual([{ id: 'p1', iso: localIso('2026-09-22', 22, 45) }]);
  });

  it('non tocca una correzione manuale sul record', () => {
    const plan = planPunchRoundingRecalculation({
      previousRules: { ...DEFAULT_PUNCH_ROUNDING_RULES, enabled: false },
      nextRules: enabledRules(),
      ...base,
      punches: [{ ...punches[0], calculated_time: localIso('2026-09-22', 22, 52) }],
    });
    expect(plan).toEqual([]);
  });

  it('ignora le timbrature senza turno collegato o con turno sconosciuto', () => {
    expect(
      planPunchRoundingRecalculation({
        previousRules: { ...DEFAULT_PUNCH_ROUNDING_RULES, enabled: false },
        nextRules: enabledRules(),
        ...base,
        punches: [{ ...punches[0], shift_id: null }],
      })
    ).toEqual([]);
    expect(
      planPunchRoundingRecalculation({
        previousRules: { ...DEFAULT_PUNCH_ROUNDING_RULES, enabled: false },
        nextRules: enabledRules(),
        ...base,
        punches: [{ ...punches[0], shift_id: 'ignoto' }],
      })
    ).toEqual([]);
  });

  it('riporta l’orario reale quando l’arrotondamento viene disattivato', () => {
    const plan = planPunchRoundingRecalculation({
      previousRules: enabledRules(),
      nextRules: { ...DEFAULT_PUNCH_ROUNDING_RULES, enabled: false },
      ...base,
      punches: [{ ...punches[0], calculated_time: localIso('2026-09-22', 22, 45) }],
    });
    expect(plan).toEqual([{ id: 'p1', iso: localIso('2026-09-22', 22, 50) }]);
  });

  it('non propone nulla se il risultato non cambia', () => {
    const plan = planPunchRoundingRecalculation({
      previousRules: enabledRules(),
      nextRules: enabledRules(),
      ...base,
      punches: [{ ...punches[0], calculated_time: localIso('2026-09-22', 22, 45) }],
    });
    expect(plan).toEqual([]);
  });
});

describe('previewPunchRounding', () => {
  it('mostra orario reale e orario efficace con la regola applicata', () => {
    const res = previewPunchRounding({
      rules: enabledRules(),
      type: 'in',
      timeHHMM: '18:07',
      shiftDate: '2026-09-22',
      shiftStart: '18:00',
      shiftEnd: '23:00',
    });
    expect(res.rawHHMM).toBe('18:07');
    expect(res.effectiveHHMM).toBe('18:15');
    expect(res.deltaMinutes).toBe(8);
    expect(res.appliedRule?.stepMinutes).toBe(15);
  });

  it('spiega perché l’arrotondamento non è stato applicato', () => {
    const res = previewPunchRounding({
      rules: { ...DEFAULT_PUNCH_ROUNDING_RULES, enabled: false },
      type: 'in',
      timeHHMM: '18:07',
      shiftDate: '2026-09-22',
      shiftStart: '18:00',
      shiftEnd: '23:00',
    });
    expect(res.skippedReason).toBe('rules_disabled');
    expect(res.effectiveHHMM).toBe('18:07');
  });
});
