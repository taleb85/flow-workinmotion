import { User } from '../types';
import { getTemplateDefaultTeamScheduleVisible, getRolePermissionGroup } from './enabledFeatures';

/** Ruoli puramente gestionali: non compaiono nelle liste operative (turni, presenze, PDF). Solo Admin. */
export const PURELY_MANAGEMENT_ROLES = ['admin'] as const;

/** Ruoli con accesso gestionale: admin, manager, assistant_manager. */
export const MANAGEMENT_ROLES = ['admin', 'manager', 'assistant_manager'] as const;

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

/**
 * Tabellone turni / griglia Presenze di squadra: operazioni sul team.
 * Ruoli gestionali (admin, manager, assistant_manager) sempre; staff operativo solo con `can_create_shifts`.
 */
export function canOperateTeamSchedule(user: User | null): boolean {
  if (!user) return false;
  if (isManagementRole(user.role)) return true;
  return user.can_create_shifts === true;
}

/**
 * Creazione, modifica orari/spostamento, eliminazione e copia turni sul planning.
 */
export function canEditTeamShifts(user: User | null): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'manager' || user.role === 'assistant_manager') return true;
  return user.can_create_shifts === true;
}

/** Approvazione ferie: Admin o `can_approve_shifts`. */
export function canApproveShiftActions(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.can_approve_shifts === true;
}

/** Pubblicazione settimana / bozze → confermati: Admin o `can_manage_drafts`. */
export function canPublishScheduleDrafts(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'admin' || user.can_manage_drafts === true;
}

/**
 * Ore totali / viste payroll di gruppo (scheda Ore, riepiloghi).
 * Regola di base: Solo i profili gestionali vedono gli orari altrui. Gli altri vedono solo i propri.
 */
export function canViewAllTeamHours(user: User | null): boolean {
  if (!user) return false;
  // Solo i ruoli definiti in MANAGEMENT_ROLES hanno accesso alla vista completa del team
  return isManagementRole(user.role);
}

/**
 * Manager / Assistant manager: scheda Impostazioni limitata (solo dipendenti operativi:
 * elenco profilo in lettura, creazione, sospensione). L’admin resta su vista completa.
 */
export function canManageDelegatedStaff(user: User | null): boolean {
  if (!user) return false;
  return user.role === 'manager' || user.role === 'assistant_manager';
}

/** Dipendente “di sala/cucina/bar” (esclusi admin, manager, assistant, capo) per elenco delegato. */
export function isOperationalStaffRole(role: string): boolean {
  return getRolePermissionGroup(role) === 'staff';
}

/**
 * Dipendente attivo da mostrare nel tabellone turni, presenze collettive e riepiloghi ore di gruppo.
 * L'admin è un profilo di controllo puro: di default non compare nelle viste operative, ma
 * diventa visibile se ha turni assegnati nel periodo mostrato (o se abilitato esplicitamente).
 */
export function isUserVisibleOnTeamSchedule(user: User, shifts?: { user_id: string }[]): boolean {
  if (user.status !== 'active') return false;

  // Admin = profilo di controllo puro: visibile nelle viste operative SOLO se
  // ha turni assegnati nel periodo mostrato, oppure se esplicitamente
  // abilitato (team_schedule_visible === true). Default: nascosto.
  if (isPurelyManagementRole(user.role)) {
    if (user.team_schedule_visible === true) return true;
    return Array.isArray(shifts) && shifts.some((s) => s.user_id === user.id);
  }

  const explicitVisible = user.team_schedule_visible;
  if (explicitVisible === true) return true;
  if (explicitVisible === false) return false;

  const explicitHide = user.hide_from_team_schedule;
  if (explicitHide === true) return false;
  if (explicitHide === false) return true;

  // Soppresso il parametro `shifts` — non più necessario, mantenuto per compatibilità firma.
  void shifts;
  return getTemplateDefaultTeamScheduleVisible(user.role);
}

/** Numero di profili con ruolo admin e stato attivo. */
export function countActiveAdmins(users: User[]): number {
  return users.filter((u) => u.role === 'admin' && u.status === 'active').length;
}

/**
 * True se, applicando role/status al profilo `targetUserId`, non resterebbe nessun admin attivo.
 * Usato per evitare di chiudere fuori dall’app l’ultimo accesso a Impostazioni complete.
 */
export function wouldLeaveNoActiveAdmin(
  users: User[],
  targetUserId: string,
  patch: Partial<Pick<User, 'role' | 'status'>>
): boolean {
  if (patch.role === undefined && patch.status === undefined) return false;
  const target = users.find((u) => u.id === targetUserId);
  if (!target) return false;

  const nextRole = patch.role !== undefined ? patch.role : target.role;
  const nextStatus = patch.status !== undefined ? patch.status : target.status;

  const activeAdminsAfter = users.filter((u) => {
    if (u.id === targetUserId) {
      return nextRole === 'admin' && nextStatus === 'active';
    }
    return u.role === 'admin' && u.status === 'active';
  }).length;

  return activeAdminsAfter < 1;
}

/**
 * Cerca un utente di management (admin, manager, assistant_manager) attivo che abbia il PIN indicato.
 * Usato per lo sblocco modifica/eliminazione turni congelati/pubblicati.
 * Restituisce l'utente se trovato, altrimenti null.
 */
export function findFreezeVerifierByPin(users: User[], pin: string): User | null {
  if (!pin || pin.trim() === '') return null;
  const trimmedPin = pin.trim();
  return users.find(
    (u) =>
      u.status === 'active' &&
      isManagementRole(u.role) &&
      u.pin === trimmedPin
  ) ?? null;
}

/**
 * Cerca un utente di management attivo per ID.
 * Restituisce l'utente se trovato e con ruolo gestionale, altrimenti null.
 */
export function findFreezeVerifierById(users: User[], userId: string): User | null {
  if (!userId) return null;
  const user = users.find((u) => u.id === userId);
  if (!user) return null;
  if (user.status !== 'active') return null;
  if (!isManagementRole(user.role)) return null;
  return user;
}
