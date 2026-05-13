import { User } from '../types';
import { getTemplateDefaultTeamScheduleVisible } from './enabledFeatures';

/** Ruoli puramente gestionali: non compaiono nelle liste operative (turni, presenze, PDF). Solo Admin. */
export const PURELY_MANAGEMENT_ROLES = ['admin'] as const;

/** Ruoli con accesso gestionale: admin, manager, assistant_manager, capo (stessa app gestionale; template permessi `capo` separato). */
export const MANAGEMENT_ROLES = ['admin', 'manager', 'assistant_manager', 'capo'] as const;

/** Restituisce true se il ruolo ha accesso gestionale (dashboard completa, modifica turni, ecc.). */
export function isManagementRole(role: string): boolean {
  return MANAGEMENT_ROLES.includes(role as (typeof MANAGEMENT_ROLES)[number]);
}

/**
 * Restituisce true se il ruolo è puramente gestionale (solo Admin).
 * L’Admin non compare nel tabellone turni / liste operative come dipendente; gli altri ruoli sì, se visibili.
 */
export function isPurelyManagementRole(role: string): boolean {
  return PURELY_MANAGEMENT_ROLES.includes(role as (typeof PURELY_MANAGEMENT_ROLES)[number]);
}

/**
 * Modifica Impostazioni / anagrafica team / strumenti admin nella scheda collegata.
 * Solo **Admin**: manager e altri ruoli gestionali non hanno accesso finché non promossi ad admin.
 */
export function canUserEdit(user: User | null): boolean {
  if (!user) return false;
  return isAdminOnly(user);
}

/**
 * Restituisce true solo per l'Admin.
 * Funzioni riservate: Backup JSON, Ripristino Database, cancellazione dipendenti, Gestione Visibilità.
 */
export function isAdminOnly(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin';
}

/** Template permessi ruoli + moduli scheda Admin (file Storage): solo Admin. */
export function canEditRoleFeatureTemplates(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin';
}

/** Elenco sospesi/inattivi in Impostazioni: solo Admin. */
export function canViewSuspended(user: User | null): boolean {
  if (!user) return false;
  return isAdminOnly(user);
}

/** Tabellone turni: creazione/modifica turni (drag, celle, contestuali). Admin sempre, altri solo se `can_create_shifts`. */
export function canOperateTeamSchedule(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.can_create_shifts === true;
}

/** Approvazione turni (freeze) e ferie: Admin o `can_approve_shifts`. */
export function canApproveShiftActions(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.can_approve_shifts === true;
}

/** Pubblicazione settimana / bozze → confermati: Admin o `can_manage_drafts`. */
export function canPublishScheduleDrafts(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.can_manage_drafts === true;
}

/** Ore totali / viste payroll di gruppo: Admin o `can_view_total_hours`. */
export function canViewAllTeamHours(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.can_view_total_hours === true;
}

/** Modifica PIN altrui: Admin o `can_edit_staff_pins`. */
export function canEditOtherStaffPins(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.can_edit_staff_pins === true;
}

/**
 * Dipendente attivo da mostrare nel tabellone turni, presenze collettive e riepiloghi ore di gruppo.
 * Esclude admin puro, profili non attivi e chi ha scelto di restare fuori dalla griglia (back-office).
 */
export function isUserVisibleOnTeamSchedule(user: User): boolean {
  if (user.status !== 'active' || isPurelyManagementRole(user.role)) return false;
  const explicitHide = user.hide_from_team_schedule;
  if (explicitHide === true) return false;
  if (explicitHide === false) return true;
  return getTemplateDefaultTeamScheduleVisible(user.role);
}
