import { STAFF_PERMISSION_OPT_OUT_KEYS } from './staffPermissionDefaults';

/** Chiavi permessi operativi salvate nel template ruoli e sincronizzate sugli utenti. */
export const SETTINGS_OPERATIONAL_PERM_KEYS = [
  'can_request_holidays',
  'can_punch_from_app',
  'can_create_shifts',
  'can_manage_drafts',
  'can_approve_shifts',
  'can_view_total_hours',
  'can_edit_staff_pins',
] as const;

export type SettingsOperationalPermKey = (typeof SETTINGS_OPERATIONAL_PERM_KEYS)[number];

/** Base template operativo: opt-out (ferie, timbratura) attivi; flag gestionali spenti. */
export function defaultOperationalTemplateBase(): Record<SettingsOperationalPermKey, boolean> {
  const opt = new Set<string>(STAFF_PERMISSION_OPT_OUT_KEYS);
  return Object.fromEntries(
    SETTINGS_OPERATIONAL_PERM_KEYS.map((k) => [k, opt.has(k)])
  ) as Record<SettingsOperationalPermKey, boolean>;
}

export function buildSettingsPermissionRows(t: Record<string, string>): {
  key: SettingsOperationalPermKey;
  label: string;
  description: string;
  adminOnly?: boolean;
}[] {
  return [
    { key: 'can_request_holidays', label: t.settings_perm_holidays_l, description: t.settings_perm_holidays_d },
    { key: 'can_punch_from_app', label: t.settings_perm_punch_l, description: t.settings_perm_punch_d },
    { key: 'can_create_shifts', label: t.settings_perm_create_l, description: t.settings_perm_create_d, adminOnly: true },
    { key: 'can_manage_drafts', label: t.settings_perm_drafts_l, description: t.settings_perm_drafts_d, adminOnly: true },
    { key: 'can_approve_shifts', label: t.settings_perm_approve_l, description: t.settings_perm_approve_d, adminOnly: true },
    { key: 'can_view_total_hours', label: t.settings_perm_hours_l, description: t.settings_perm_hours_d, adminOnly: true },
    { key: 'can_edit_staff_pins', label: t.settings_perm_pins_l, description: t.settings_perm_pins_d, adminOnly: true },
  ];
}
