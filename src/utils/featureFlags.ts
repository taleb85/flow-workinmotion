import { supabase } from '../lib/supabase';

export interface FeatureDefinition {
  slug: string;
  defaultEnabled: boolean;
  /** Renders with red/warning styling — for dangerous toggles like maintenance mode */
  dangerous?: boolean;
}

/** Labels/descriptions: `getFeatureStrings(getTranslations(lang), slug)` in `translations.ts`. */
export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  { slug: 'maintenance_mode', defaultEnabled: false, dangerous: true },
  { slug: 'unlock_with_pin', defaultEnabled: true },
  { slug: 'auto_breaks', defaultEnabled: true },
  { slug: 'staff_requests', defaultEnabled: true },
  { slug: 'kiosk_active', defaultEnabled: true },
  /** GPS entro raggio del locale per timbrare (`geofence.json` su Storage o VITE_*), salvo manager che timbra per altri. */
  { slug: 'geofence_punch', defaultEnabled: false },
  { slug: 'visibility_management', defaultEnabled: true },
  { slug: 'department_creation', defaultEnabled: true },
  { slug: 'violation_rules', defaultEnabled: true },
  { slug: 'master_control_panel', defaultEnabled: true },
];

export type FeatureFlags = Record<string, boolean>;

const STORAGE_KEY = 'osteria_app_features_v2';
const BUCKET = 'app-config';
const FILE_PATH = 'features.json';

function buildDefaults(): FeatureFlags {
  return Object.fromEntries(FEATURE_DEFINITIONS.map((f) => [f.slug, f.defaultEnabled]));
}

/** Read flags from localStorage merged with defaults. */
export function getLocalFeatureFlags(): FeatureFlags {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const defaults = buildDefaults();
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return buildDefaults();
  }
}

/** Persist one flag to localStorage. */
export function saveLocalFeatureFlag(slug: string, enabled: boolean): void {
  const flags = getLocalFeatureFlags();
  flags[slug] = enabled;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
}

/** Scrive l'intero oggetto flag (es. dopo merge con Supabase). */
export function writeFeatureFlagsToStorage(flags: FeatureFlags): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
  } catch {
    // ignore
  }
}

/**
 * Load feature flags from Supabase Storage (app-config/features.json).
 * Falls back to null if Storage is unavailable.
 */
export async function loadFeatureFlagsFromSupabase(): Promise<FeatureFlags | null> {
  if (!supabase) return null;
  if (import.meta.env.VITE_FEATURE_FLAGS_STORAGE_ENABLED === 'false') return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    // 404 = file non ancora creato su un altro dispositivo: non disattivare mai i retry (localStorage non è condiviso tra PWA/telefono e PC).
    if (error || !data) return null;
    const text = await data.text();
    const parsed = JSON.parse(text) as FeatureFlags;
    const defaults = buildDefaults();
    return { ...defaults, ...parsed };
  } catch {
    return null;
  }
}

/**
 * Save all current flags to Supabase Storage (upsert).
 * Called after any single-flag change.
 */
export async function updateFeatureFlagInSupabase(slug: string, enabled: boolean): Promise<void> {
  if (!supabase) return;
  try {
    // Read current stored flags, merge the change, then write back
    const current = await loadFeatureFlagsFromSupabase().catch(() => null);
    const merged: FeatureFlags = { ...buildDefaults(), ...(current ?? {}), [slug]: enabled };
    await writeAllFeatureFlagsToSupabase(merged);
  } catch {
    // Storage unavailable — localStorage is the authoritative fallback
  }
}

/** Scrive l’intero oggetto flag su Storage (es. bundle impostazioni globale). */
export async function writeAllFeatureFlagsToSupabase(flags: FeatureFlags): Promise<void> {
  if (!supabase) return;
  if (import.meta.env.VITE_FEATURE_FLAGS_STORAGE_ENABLED === 'false') return;
  const merged: FeatureFlags = { ...buildDefaults(), ...flags };
  const blob = new Blob([JSON.stringify(merged)], { type: 'application/json' });
  await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, {
    upsert: true,
    contentType: 'application/json',
  });
}
