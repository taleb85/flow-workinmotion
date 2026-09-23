import { getEnabledFeatures } from './enabledFeatures';
import { isMobileLayout } from './layoutPreset';
import type { FeatureFlags } from './featureFlags';
import type { User } from '../types';

/** Dati minimi per la barra tab. */
export type UnifiedNavUser = Pick<User, 'role' | 'enabled_features'>;

/** Richieste ferie/permessi: disattivabile dal Master Control (`staff_requests`). */
export function isStaffRequestsFeatureEnabled(featureFlags?: FeatureFlags | null): boolean {
  return featureFlags == null || featureFlags.staff_requests !== false;
}

/** Tab principali app (bottom bar unificata PWA — stessi id per gestione e staff). */
export type AppNavTab = 'home' | 'turni' | 'ferie' | 'reports' | 'timesheet' | 'settings' | 'profile';

/** Titolo principale della schermata (sticky header / h1) in base alla tab. */
export function getAppNavTabTitle(t: Record<string, string>, tab: AppNavTab): string {
  switch (tab) {
    case 'home':
      return t.home_dashboard_title;
    case 'turni':
    case 'timesheet':
      return t.tab_planning_or_timesheet ?? 'Pianificazione';
    case 'ferie':
      return t.sidebar_holidays;
    case 'reports':
      return t.sidebar_statistics;
    case 'settings':
      return (t as Record<string, string>).bottom_nav_settings_title ?? 'Impostazioni';
    case 'profile':
      return (t as Record<string, string>).bottom_nav_profile ?? t.sidebar_profile;
  }
}

/** Ordine bottom bar / PWA: 'timesheet' unifica planning + presenze. */
const UNIFIED_NAV_ORDER: AppNavTab[] = ['home', 'timesheet', 'ferie', 'profile', 'settings'];

/**
 * Staff mobile: [Home] [Pianificazione] [Ferie] [Profilo]
 */
const STAFF_BOTTOM_NAV_ORDER: AppNavTab[] = ['home', 'timesheet', 'ferie', 'profile'];

/**
 * Voci bottom bar: stessa struttura per tutti i profili (come PWA).
 * Panoramica e Presenze sono sempre presenti; Ferie dipende dal flag globale
 * `staff_requests`, Impostazioni dal ruolo.
 */
export function getUnifiedNavTabs(
  user: UnifiedNavUser,
  _isManagement: boolean,
  featureFlags?: FeatureFlags | null
): AppNavTab[] {
  const feat = getEnabledFeatures(user);
  const out: AppNavTab[] = [];
  for (const id of UNIFIED_NAV_ORDER) {
    if (id === 'home' || id === 'timesheet') out.push(id);
    else if (id === 'ferie' && isStaffRequestsFeatureEnabled(featureFlags)) out.push('ferie');
    // 'reports' removed from nav — Statistics is now a sub-tab inside 'timesheet'
    else if (id === 'profile') out.push('profile');
    else if (id === 'settings' && feat.admin_tab) out.push('settings');
  }
  return out;
}

/** Bottom bar effettiva in MainApp: staff con ordine `STAFF_BOTTOM_NAV_ORDER`, stesse voci abilitate di `getUnifiedNavTabs`. */
export function getBottomNavTabsForMainApp(
  user: UnifiedNavUser,
  isManagement: boolean,
  featureFlags?: FeatureFlags | null
): AppNavTab[] {
  const all = getUnifiedNavTabs(user, isManagement, featureFlags);

  // Su mobile, forziamo l'ordine dello staff per tutti (inclusi manager)
  // e rimuoviamo le voci da desktop come "Impostazioni".
  const isMobileViewport = isMobileLayout();
  if (isManagement && !isMobileViewport) return all;

  const set = new Set(all);
  return STAFF_BOTTOM_NAV_ORDER.filter((id) => set.has(id) && id !== 'settings');
}
