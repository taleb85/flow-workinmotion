import type { User, UserRole } from '../types';

const ALLOWED_ROLES: UserRole[] = [
  'admin',
  'manager',
  'assistant_manager',
  'capo',
  'waiter',
  'server',
  'bartender',
  'cook',
  'chef',
  'dishwasher',
];

/** DB legacy / vecchie righe: `proprietario` → `manager` (ruolo rimosso dall’app). */
export function normalizeUserRoleFromRow(role: unknown): UserRole {
  const r = typeof role === 'string' ? role : 'waiter';
  if (r === 'proprietario') return 'manager';
  if (ALLOWED_ROLES.includes(r as UserRole)) return r as UserRole;
  return 'waiter';
}

/**
 * Chiavi permesso “opt-out”: assenti/null nel DB = **consentito** (allineato a StaffPersonalDashboard `!== false`).
 */
export const STAFF_PERMISSION_OPT_OUT_KEYS = ['can_request_holidays', 'can_punch_from_app'] as const;
export type StaffPermissionOptOutKey = (typeof STAFF_PERMISSION_OPT_OUT_KEYS)[number];

const MGMT_FLAG_KEYS = [
  'can_create_shifts',
  'can_approve_shifts',
  'can_manage_drafts',
  'can_view_total_hours',
  'can_edit_staff_pins',
] as const;

/** Valore effettivo mostrato nei toggle e usato nell’app (coerente tra Impostazioni e UI). */
export function isUserPermissionEffective(user: User, key: keyof User): boolean {
  const v = user[key];
  if (STAFF_PERMISSION_OPT_OUT_KEYS.includes(key as StaffPermissionOptOutKey)) {
    return v !== false;
  }
  if (MGMT_FLAG_KEYS.includes(key as (typeof MGMT_FLAG_KEYS)[number])) {
    return (v as boolean | undefined) ?? false;
  }
  return Boolean(v);
}

/** Valore da scrivere nel DB al toggle (sempre booleano esplicito). */
export function toggledPermissionDbValue(user: User, key: keyof User): boolean {
  return !isUserPermissionEffective(user, key);
}

/**
 * Costruisce l’oggetto `User` per sessione/login da una riga DB/merge,
 * senza perdere JSONB opzionali e senza far collassare i permessi opt-out in `false`.
 */
/**
 * Flag gestionali iniziali (nuova riga `users`).
 * Solo **admin** ha tutto attivo; ogni altro ruolo (manager, capo, staff…) parte con tutto disattivato:
 * l’Admin abilita i singoli permessi dal profilo dipendente.
 */
export function defaultPermissionFieldsForNewUser(role: UserRole): Pick<
  User,
  'can_create_shifts' | 'can_approve_shifts' | 'can_manage_drafts' | 'can_view_total_hours' | 'can_edit_staff_pins'
> {
  const off = {
    can_create_shifts: false,
    can_approve_shifts: false,
    can_manage_drafts: false,
    can_view_total_hours: false,
    can_edit_staff_pins: false,
  };
  if (role === 'admin') {
    return {
      can_create_shifts: true,
      can_approve_shifts: true,
      can_manage_drafts: true,
      can_view_total_hours: true,
      can_edit_staff_pins: true,
    };
  }
  return off;
}

export function userRowToSessionUser(row: User): User {
  return {
    ...row,
    first_name: row.first_name ?? '',
    email: row.email ?? '',
    pin: row.pin ?? '',
    role: normalizeUserRoleFromRow(row.role),
    status: row.status ?? 'active',
    sort_order: row.sort_order ?? 0,
    language: row.language ?? 'it',
    theme: row.theme ?? 'light',
    can_create_shifts: row.can_create_shifts ?? false,
    can_approve_shifts: row.can_approve_shifts ?? false,
    can_view_total_hours: row.can_view_total_hours ?? false,
    can_edit_staff_pins: row.can_edit_staff_pins ?? false,
    can_manage_drafts: row.can_manage_drafts ?? false,
    can_request_holidays: row.can_request_holidays,
    can_punch_from_app: row.can_punch_from_app,
    monthly_confirmed: row.monthly_confirmed,
    department: row.department,
    enabled_modules: row.enabled_modules,
    enabled_features: row.enabled_features,
    ui_section_overrides: row.ui_section_overrides,
    hourly_rate_eur: row.hourly_rate_eur,
    phone: row.phone,
    last_name: row.last_name,
    hide_from_team_schedule: row.hide_from_team_schedule,
  };
}
