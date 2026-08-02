import { startOfMonth, endOfMonth, addDays, startOfWeek, endOfWeek } from 'date-fns';

/**
 * Pagamento stipendi (regola FLOW):
 * **lunedì immediatamente successivo** alla domenica che chiude l'**ultima settimana
 * completa** (lunedì–domenica) **interamente contenuta** nel mese civile.
 *
 * Esempio: marzo 2026 — l'ultima settimana tutta in marzo termina domenica **29/03** →
 * pagamento **30/03/2026** (lunedì).
 */
export function getPayrollPaymentDateForCalendarMonth(monthRef: Date): Date {
  const monthStart = startOfMonth(monthRef);
  const monthEnd = endOfMonth(monthRef);

  let weekStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  let lastCompleteWeekSunday: Date | null = null;

  while (weekStart <= monthEnd) {
    const weekSunday = endOfWeek(weekStart, { weekStartsOn: 1 });
    const weekFullyInMonth = weekStart >= monthStart && weekSunday <= monthEnd;
    if (weekFullyInMonth) {
      lastCompleteWeekSunday = weekSunday;
    }
    weekStart = addDays(weekStart, 7);
  }

  if (!lastCompleteWeekSunday) {
    const endW = endOfWeek(monthStart, { weekStartsOn: 1 });
    const anchor = endW <= monthEnd ? endW : monthEnd;
    return addDays(anchor, 1);
  }

  return addDays(lastCompleteWeekSunday, 1);
}
