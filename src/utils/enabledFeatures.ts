/**
 * Matrice permessi e schede dashboard: **per ruolo**, con override opzionali da template salvati dall’Admin
 * (Storage `app-config/role_feature_templates.json` + localStorage).
 * I moduli della scheda Admin (Impostazioni) sono **globali** (`admin_sheet_modules.json`), modificabili solo dall’Admin.
 */
import type { RoleFeatureTemplatesOnDisk, RoleTemplateGroup } from './roleFeatureTemplates';
import { getRoleFeatureTemplatesCache } from './roleFeatureTemplates';
import { getAdminModulesGlobalCache } from './adminModulesGlobal';
import type { SettingsOperationalPermKey } from './settingsPermissionRows';

export type { SettingsOperationalPermKey };

export type { RoleTemplateGroup };
export const PERMISSION_MATRIX_KEYS = [
  'team_view',
  'edit_shifts',
  'approve_shifts',
  'export_pdf',
  'view_stats',
] as const;

/** Schede aggiuntive in dashboard (oltre alla matrice). */
export const DASHBOARD_TAB_FEATURE_KEYS = ['home_tab', 'ferie_tab', 'admin_tab', 'timesheet_tab'] as const;

export const ENABLED_FEATURE_KEYS = [
  ...PERMISSION_MATRIX_KEYS,
  ...DASHBOARD_TAB_FEATURE_KEYS,
] as const;

export type EnabledFeatureKey = (typeof ENABLED_FEATURE_KEYS)[number];

export type EnabledFeatures = Partial<Record<EnabledFeatureKey, boolean>>;

/** Chiave nel template per "visibile in tabellone turni". true = visibile, false = nascosto. Default true. */
export const TEMPLATE_TEAM_SCHEDULE_KEY = 'team_schedule_visible' as const;

export const FEATURE_LABELS: Record<EnabledFeatureKey, string> = {
  team_view: 'Visualizza Tabellone Team',
  edit_shifts: 'Modifica Turni',
  approve_shifts: 'Congelamento Turni (approvazione finale)',
  export_pdf: 'Download PDF — tabellone turni',
  view_stats: 'Visualizzazione Ore',
  home_tab: 'Visualizza scheda Dashboard',
  ferie_tab: 'Visualizza scheda Ferie',
  admin_tab: 'Visualizza scheda Admin (Impostazioni)',
  timesheet_tab: 'Visualizza scheda Presenze (foglio ore)',
};

/** Etichette orientate alle tab (stessi permessi; testo più chiaro nella sezione “Schede”). */
export const FEATURE_LABELS_TAB_FIRST: Record<EnabledFeatureKey, string> = {
  ...FEATURE_LABELS,
  home_tab: 'Panoramica',
  team_view: 'Turni — tabellone team',
  timesheet_tab: 'Presenze — foglio ore',
  export_pdf: 'Download PDF — tabellone turni',
  view_stats: 'Ore',
  ferie_tab: 'Ferie',
  admin_tab: 'Scheda Admin — impostazioni e profili',
};

export type RoleTemplateRow = { kind: 'feature'; key: EnabledFeatureKey };

export type RoleTemplateSectionId = 'tabs_nav' | 'shift_ops' | 'other';

export type RoleTemplateSection = {
  readonly id: RoleTemplateSectionId;
  readonly rows: readonly RoleTemplateRow[];
};

/**
 * Ordine e raggruppamento permessi in UI (template ruoli, gestione profili, anteprima).
 * Ogni chiave in ENABLED_FEATURE_KEYS compare una sola volta.
 * `tabs_nav` contiene solo `team_view`: le altre schede della barra sono fisse
 * (sempre attive), quindi non hanno un toggle per-utente.
 */
export const ROLE_TEMPLATE_FEATURE_SECTIONS: readonly RoleTemplateSection[] = [
  {
    id: 'tabs_nav',
    rows: [
      { kind: 'feature', key: 'team_view' },      // Turni — tabellone team
    ],
  },
  {
    id: 'shift_ops',
    rows: [
      { kind: 'feature', key: 'edit_shifts' },    // Modifica Turni
      { kind: 'feature', key: 'approve_shifts' }, // Congelamento Turni
      { kind: 'feature', key: 'export_pdf' },     // Download PDF
    ],
  },
  {
    id: 'other',
    rows: [
      { kind: 'feature', key: 'view_stats' },           // Ore (dentro Presenze)
    ],
  },
] as const;

/** Funzioni della scheda Impostazioni: config globale (solo Admin modifica), stessi valori per tutti i profili gestionali. */
export const ADMIN_MODULE_KEYS = [
  'visibility_management',
  'department_creation',
  'violation_rules',
  'auto_breaks',
] as const;

export type AdminModuleKey = (typeof ADMIN_MODULE_KEYS)[number];

/** Default per admin: tutte attive (cablate) */
const DEFAULT_ADMIN_FEATURES: EnabledFeatures = Object.fromEntries(
  ENABLED_FEATURE_KEYS.map((k) => [k, true])
) as EnabledFeatures;

/** Default codice: Manager e Assistant Manager (template gruppo `management`). Operatività e export partono spenti finché l’Admin non li abilita (template o profilo). */
const DEFAULT_MANAGER_FEATURES: EnabledFeatures = {
  home_tab: true,
  team_view: true,
  edit_shifts: false,
  approve_shifts: false,
  timesheet_tab: true,
  export_pdf: false,
  view_stats: false,
  ferie_tab: true,
  /** Scheda in barra per Manager/Assistant viene forzata attiva in `getEnabledFeatures` (team delegato). */
  admin_tab: false,
};

/** Default codice: Assistant Manager (template gruppo `assistant_manager`). */
const DEFAULT_ASSISTANT_MANAGER_FEATURES: EnabledFeatures = {
  ...DEFAULT_MANAGER_FEATURES,
};

/** Default staff: tabellone team spento di default. */
const DEFAULT_STAFF_FEATURES: EnabledFeatures = {
  ...DEFAULT_MANAGER_FEATURES,
  team_view: false,
};

export function getDefaultEnabledFeatures(role: string): EnabledFeatures {
  if (role === 'admin') return { ...DEFAULT_ADMIN_FEATURES };
  if (role === 'assistant_manager') return { ...DEFAULT_ASSISTANT_MANAGER_FEATURES };
  if (role === 'manager') return { ...DEFAULT_MANAGER_FEATURES };
  return { ...DEFAULT_STAFF_FEATURES };
}

/** Gruppo per file template: admin non ha file (sempre pieno). */
export function getRolePermissionGroup(role: string): 'admin' | RoleTemplateGroup {
  if (role === 'admin') return 'admin';
  if (role === 'manager') return 'management';
  if (role === 'assistant_manager') return 'assistant_manager';
  return 'staff';
}

function applyDiskTemplateToBase(base: EnabledFeatures, group: RoleTemplateGroup): EnabledFeatures {
  const partial = getRoleFeatureTemplatesCache()?.[group];
  if (!partial) return base;
  const out = { ...base };
  for (const k of ENABLED_FEATURE_KEYS) {
    if (typeof partial[k] === 'boolean') out[k] = partial[k];
  }
  return out;
}

/** Default “codice” per un gruppo template (editor Admin / reset). */
export function getCodeDefaultsForTemplateGroup(group: RoleTemplateGroup): EnabledFeatures {
  if (group === 'management') return { ...getDefaultEnabledFeatures('manager') } as EnabledFeatures;
  if (group === 'assistant_manager') return { ...getDefaultEnabledFeatures('assistant_manager') } as EnabledFeatures;
  return { ...getDefaultEnabledFeatures('waiter') } as EnabledFeatures;
}

/** Default template "visibile in tabellone" per gruppo. true = visibile. */
export function getTemplateGroupTeamScheduleVisible(
  group: RoleTemplateGroup,
  disk: RoleFeatureTemplatesOnDisk | null
): boolean {
  const partial = disk?.[group];
  if (partial && typeof partial[TEMPLATE_TEAM_SCHEDULE_KEY] === 'boolean') {
    return partial[TEMPLATE_TEAM_SCHEDULE_KEY];
  }
  return true;
}

/** Default "visibile in tabellone" per ruolo (usa template). */
export function getTemplateDefaultTeamScheduleVisible(role: string): boolean {
  const disk = getRoleFeatureTemplatesCache();
  const grp = getRolePermissionGroup(role);
  if (grp === 'admin') return true;
  return getTemplateGroupTeamScheduleVisible(grp, disk);
}

/**
 * Matrice + schede: default ruolo + template globale (se presente). L’admin resta sempre pieno.
 *
 * Per `role === 'admin'` **non** si applicano override da `users.enabled_features`: la barra tab,
 * `getVisibleManagementTabs` e ogni UI che usa `getEnabledFeatures` devono coincidere con
 * `isFeatureEnabled` (sempre true per l’admin). I dati JSONB restano in DB ma non limitano la sessione admin.
 */
export function getEnabledFeatures(user: { role: string; enabled_features?: unknown }): EnabledFeatures {
  const base = getDefaultEnabledFeatures(user.role);
  if (user.role === 'admin') {
    const result = { ...base };
    for (const k of PERMISSION_MATRIX_KEYS) result[k] = true;
    result.home_tab = true;
    result.admin_tab = true;
    // Admin vede tutte le sezioni per gestirle, ma non appare mai come dipendente nei dati
    result.ferie_tab = true;
    result.timesheet_tab = true;
    return result;
  }
  /** L'admin è già uscito sopra: qui il ruolo appartiene sempre a un template. */
  const grp = getRolePermissionGroup(user.role) as RoleTemplateGroup;
  const merged = mergeUserFeatureOverrides(applyDiskTemplateToBase(base, grp), user.enabled_features);
  /**
   * Schede a visibilità fissa (Panoramica, Presenze, Ferie, Admin): non hanno
   * un toggle in UI, quindi nessun template o override residuo può nasconderle.
   * Admin/Manager/Vice aprono la scheda Impostazioni, gli altri no.
   */
  merged.home_tab = true;
  merged.timesheet_tab = true;
  merged.ferie_tab = true;
  merged.admin_tab = user.role === 'manager' || user.role === 'assistant_manager';
  return merged;
}

/** Override per-utente da colonna `users.enabled_features` (JSONB), se presente. */
function mergeUserFeatureOverrides(
  merged: EnabledFeatures,
  raw: unknown
): EnabledFeatures {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return merged;
  const o = raw as Record<string, unknown>;
  const out = { ...merged };
  for (const k of ENABLED_FEATURE_KEYS) {
    if (typeof o[k] === 'boolean') out[k] = o[k];
  }
  return out;
}

/** Default per Manager/Assistant Manager: tutte le funzioni Impostazioni attive. */
const DEFAULT_ADMIN_MODULES: Partial<Record<AdminModuleKey, boolean>> = Object.fromEntries(
  ADMIN_MODULE_KEYS.map((k) => [k, true])
) as Partial<Record<AdminModuleKey, boolean>>;

/** Stato iniziale editor Admin (moduli globali + file salvato). */
export function buildMergedAdminModulesForAdminEditor(): Record<AdminModuleKey, boolean> {
  const result = { ...DEFAULT_ADMIN_MODULES } as Record<AdminModuleKey, boolean>;
  const g = getAdminModulesGlobalCache();
  if (g) {
    for (const k of ADMIN_MODULE_KEYS) {
      if (typeof g[k] === 'boolean') result[k] = g[k];
    }
  }
  return result;
}

/**
 * Moduli scheda Impostazioni: **solo config globale** (sincronizzata per tutti).
 * Capo / Manager / Assistant: stessi flag; Admin: sempre tutti attivi in lettura; Staff: nessuno.
 */
export function getAdminModuleEnabled(user: { role: string; enabled_features?: unknown }): Partial<Record<AdminModuleKey, boolean>> {
  // Admin: in UI mostra gli stessi flag globali dei manager (lettura coerente con Storage); l’accesso resta sempre sbloccato in isAdminModuleEnabled.
  if (user.role === 'admin') {
    const global = getAdminModulesGlobalCache();
    const base = { ...DEFAULT_ADMIN_MODULES } as Record<AdminModuleKey, boolean>;
    if (global && Object.keys(global).length > 0) {
      for (const k of ADMIN_MODULE_KEYS) {
        if (typeof global[k] === 'boolean') base[k] = global[k];
      }
    }
    return base;
  }
  const defaultForRole =
    user.role === 'manager' || user.role === 'assistant_manager'
      ? { ...DEFAULT_ADMIN_MODULES }
      : {};
  const global = getAdminModulesGlobalCache();
  if (!global || Object.keys(global).length === 0) {
    return defaultForRole;
  }
  const result = { ...defaultForRole };
  for (const k of ADMIN_MODULE_KEYS) {
    if (typeof global[k] === 'boolean') result[k] = global[k];
  }
  return result;
}

/** Restituisce true se l'utente ha il modulo admin abilitato. Solo admin: sempre tutti attivi; manager rispettano enabled_features. */
export function isAdminModuleEnabled(user: { role: string; enabled_features?: unknown }, key: AdminModuleKey): boolean {
  if (user.role === 'admin') return true;
  const mods = getAdminModuleEnabled(user);
  return mods[key] === true;
}

/** Admin: tutti TRUE. Altri: solo in base al ruolo (`getEnabledFeatures`). */
export function isFeatureEnabled(
  user: { role: string; enabled_features?: unknown },
  key: EnabledFeatureKey
): boolean {
  if (user.role === 'admin') return true;
  return getEnabledFeatures(user)[key] === true;
}
