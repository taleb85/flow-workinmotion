import { describe, it, expect } from 'vitest';
import { parseISO } from 'date-fns';
import { periodConfigContainingDate, getPeriodStartDate, getPeriodEndDate } from '../utils/periodConfig';

describe('periodConfigContainingDate', () => {
  it('trova il periodo per una data a metà mese', () => {
    const cfg = periodConfigContainingDate(parseISO('2026-03-10'));
    const start = getPeriodStartDate(cfg);
    const end = getPeriodEndDate(cfg);
    expect(parseISO('2026-03-10') >= start).toBe(true);
    expect(parseISO('2026-03-10') <= end).toBe(true);
  });

  it('data ai confini di mese (lunedì 29/12/2025) ricade nel periodo di gennaio 2026', () => {
    // 29/12/2025 è un lunedì, ultima settimana del 2025 → appartiene al periodo gen 2026
    const cfg = periodConfigContainingDate(parseISO('2025-12-29'));
    const start = getPeriodStartDate(cfg);
    expect(parseISO('2025-12-29') >= start).toBe(true);
    const end = getPeriodEndDate(cfg);
    expect(parseISO('2025-12-29') <= end).toBe(true);
  });

  it('ultimo giorno di dicembre (30/12/2026) ricade nel periodo giusto', () => {
    const cfg = periodConfigContainingDate(parseISO('2026-12-30'));
    const start = getPeriodStartDate(cfg);
    const end = getPeriodEndDate(cfg);
    expect(parseISO('2026-12-30') >= start).toBe(true);
    expect(parseISO('2026-12-30') <= end).toBe(true);
  });

  it('primi giorni di gennaio (25/01/2026) ricadono nel periodo giusto', () => {
    const cfg = periodConfigContainingDate(parseISO('2026-01-25'));
    const start = getPeriodStartDate(cfg);
    const end = getPeriodEndDate(cfg);
    expect(parseISO('2026-01-25') >= start).toBe(true);
    expect(parseISO('2026-01-25') <= end).toBe(true);
  });
});
