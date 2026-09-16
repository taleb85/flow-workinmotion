/**
 * Admin: in griglia Presenze mostra orario pianificato per turni pubblicati/confermati e,
 * se congelati, le ore approvate ufficiali (non timbrature grezze); nasconde delta,
 * totali da timbrature, badge audit (il drawer resta completo).
 */
export const TIMESHEET_GRID_PLANNED_ONLY_KEY = 'timesheet_presences_grid_planned_only';

export type TimesheetGridPrivacyMode = 'full' | 'planned_only';

export function getTimesheetGridPrivacyMode(
  user: { enabled_features?: unknown } | null | undefined
): TimesheetGridPrivacyMode {
  if (!user) return 'full';
  const fe = user.enabled_features as Record<string, unknown> | undefined;
  if (fe?.[TIMESHEET_GRID_PLANNED_ONLY_KEY] === true) return 'planned_only';
  return 'full';
}
