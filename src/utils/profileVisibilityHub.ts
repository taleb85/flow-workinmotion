/**
 * Eccezioni per utente sopra ai template di ruolo (Storage + default codice).
 * `enabled_features` contiene solo override; chiavi assenti = eredita dal template.
 */
import type { User } from '../types';
import {
  getEnabledFeatures,
  PERMISSION_MATRIX_KEYS,
  type EnabledFeatureKey,
} from './enabledFeatures';
import { type AppNavTab } from './enabledModules';

/** Raggruppa widget UI (`screenGroup`) sotto la scheda bottom bar / hub anteprima. */
const UI_SCREEN_GROUP_TO_PREVIEW_TAB: Record<string, AppNavTab> = {
  home_mgmt: 'home',
  home_compact: 'home',
  staff_home: 'home',
  turni: 'turni',
  staff_shifts: 'turni',
  ferie: 'ferie',
  staff_holidays: 'ferie',
  timesheet: 'timesheet',
  stats: 'reports',
  staff_profile: 'profile',
  global_popups: 'settings',
};

export function screenGroupToPreviewTab(screenGroup: string): AppNavTab | 'all' {
  if (screenGroup === 'global_popups') return 'all';
  const tab = UI_SCREEN_GROUP_TO_PREVIEW_TAB[screenGroup as keyof typeof UI_SCREEN_GROUP_TO_PREVIEW_TAB];
  return tab ?? 'home';
}

/** Dove mostrare il toggle permesso nella hub “Cosa vede chi” (per scheda). */
export function featureKeyToPreviewTab(key: EnabledFeatureKey): AppNavTab {
  switch (key) {
    case 'team_view':
    case 'edit_shifts':
    case 'approve_shifts':
      return 'turni';
    case 'export_pdf':
      return 'turni';
    case 'view_stats':
      return 'reports';
    default:
      return 'settings';
  }
}

export function getTemplateOnlyFeaturesUser(user: User): User {
  return { ...user, enabled_features: undefined };
}

/** Valori effettivi (template + eventuali override su questo utente). */
export function getEffectiveFeaturesForUser(user: User) {
  return getEnabledFeatures(user);
}

/** Solo template di ruolo + file globale, senza `users.enabled_features`. */
export function getTemplateBaselineFeatures(user: User) {
  return getEnabledFeatures(getTemplateOnlyFeaturesUser(user));
}

export function isFeatureExplicitlyOverridden(user: User, key: EnabledFeatureKey): boolean {
  const raw = user.enabled_features;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  return typeof (raw as Record<string, unknown>)[key] === 'boolean';
}

/**
 * Dopo il toggle: se coincide col template, rimuove l'override per quella chiave.
 * Restituisce `null` se non resta nessun override (persisti come `{}` per JSONB pulito).
 */
export function computeNextEnabledFeaturesOverride(
  user: User,
  key: EnabledFeatureKey,
  desiredOn: boolean
): Record<string, boolean> | null {
  const baseline = getTemplateBaselineFeatures(user);
  const baselineOn = baseline[key] === true;
  const prev = { ...(user.enabled_features ?? {}) } as Record<string, boolean>;

  if (desiredOn === baselineOn) {
    delete prev[key];
  } else {
    prev[key] = desiredOn;
  }

  if (Object.keys(prev).length === 0) return null;
  return prev as Record<string, boolean>;
}

/**
 * Chiavi configurabili per utente nell'hub “Cosa vede chi”.
 * Le schede della barra (Panoramica, Presenze, Ferie, Admin) sono fisse: non
 * compaiono qui perché non è possibile disattivarle singolarmente.
 */
export const PROFILE_VISIBILITY_FEATURE_KEYS: EnabledFeatureKey[] = [
  ...PERMISSION_MATRIX_KEYS,
];
