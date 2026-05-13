/**
 * Bundle unico `config/settings_bundle.json` nel bucket Storage `app-config`.
 * Allinea geofence, regole lavoro/pausa, template ruoli, moduli admin, flag e verifica presenza su tutti i dispositivi.
 *
 * **Lettura:** non usiamo `storage.download()` su questo path: Supabase risponde spesso **400** se l’oggetto non
 * esiste ancora e il browser logga sempre il GET fallito. La sync pull usa i file JSON separati in `app-config`
 * (`features.json`, `role_feature_templates.json`, …) che `pushSettingsToCloud` aggiorna insieme al bundle.
 *
 * **Scrittura:** `uploadGlobalSettingsBundleToSupabase` resta attiva (backup + allineamento futuro).
 */
import { supabase } from '../lib/supabase';
import type { WorkRules } from './workRules';
import { DEFAULT_WORK_RULES } from './workRules';
import type { BreakRule } from './breakRules';
import type { GeofenceConfig } from './geofencePunch';
import { parseGeofenceFile } from './geofenceConfigStorage';
import type { FeatureFlags } from './featureFlags';
import type { RoleFeatureTemplatesOnDisk } from './roleFeatureTemplates';
import type { AdminModulesGlobalOnDisk } from './adminModulesGlobal';
import type { PresenceVerificationConfig } from './presenceVerificationConfigStorage';
import { parsePresenceVerificationFile } from './presenceVerificationConfigStorage';
import { isAppCloudSyncEnabled } from './appCloudSync';

export const GLOBAL_SETTINGS_BUNDLE_PATH = 'config/settings_bundle.json';
export const GLOBAL_SETTINGS_SCHEMA_VERSION = 1;

const BUCKET = 'app-config';

/** Dopo un errore “tabella assente”, non richiamiamo più REST/Realtime per questa funzione (niente GET 404 ripetuti). Si rimuove al primo bump riuscito o con `clearAppSettingsSyncSignalUnavailableFlag()`. */
const LS_SYNC_SIGNAL_UNAVAILABLE = 'osteria_app_settings_sync_signal_unavailable';

try {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('osteria_skip_app_settings_sync_signal');
  }
} catch {
  /* ignore */
}

function appSettingsSyncSignalDisabledByEnv(): boolean {
  return import.meta.env.VITE_APP_SETTINGS_SYNC_SIGNAL === 'false';
}

function readAppSettingsSyncSignalRestSkipped(): boolean {
  if (appSettingsSyncSignalDisabledByEnv()) return true;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(LS_SYNC_SIGNAL_UNAVAILABLE) === '1';
  } catch {
    return false;
  }
}

function writeAppSettingsSyncSignalUnavailable(): void {
  try {
    localStorage.setItem(LS_SYNC_SIGNAL_UNAVAILABLE, '1');
  } catch {
    /* ignore */
  }
}

function clearAppSettingsSyncSignalUnavailableStorage(): void {
  try {
    localStorage.removeItem(LS_SYNC_SIGNAL_UNAVAILABLE);
  } catch {
    /* ignore */
  }
}

/** Dopo aver applicato la migrazione `app_settings_sync_signal` su Supabase, chiama questo (o cancella la chiave localStorage sopra) per riattivare bump + subscribe. */
export function clearAppSettingsSyncSignalUnavailableFlag(): void {
  clearAppSettingsSyncSignalUnavailableStorage();
}

/** `true` se bump/subscribe REST per il segnale sono disattivati (env o tabella assente rilevata). */
export function isAppSettingsSyncSignalRestSkipped(): boolean {
  return readAppSettingsSyncSignalRestSkipped();
}

function isMissingAppSettingsSyncTable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const o = err as Record<string, unknown>;
  const msg = typeof o.message === 'string' ? o.message : '';
  const details = typeof o.details === 'string' ? o.details : '';
  const hint = typeof o.hint === 'string' ? o.hint : '';
  const code = typeof o.code === 'string' ? o.code : '';
  const blob = `${msg} ${details} ${hint} ${code}`;
  const status =
    typeof o.status === 'number'
      ? o.status
      : typeof o.statusCode === 'number'
        ? o.statusCode
        : typeof o.status === 'string'
          ? parseInt(o.status, 10)
          : NaN;
  let raw = '';
  try {
    raw = JSON.stringify(o);
  } catch {
    raw = '';
  }
  const mentionsTable = /app_settings_sync_signal/i.test(blob) || /app_settings_sync_signal/i.test(raw);
  const looksMissing =
    code === 'PGRST205' ||
    /schema cache|could not find|does not exist|not found|\b404\b/i.test(blob) ||
    /PGRST205|schema cache|"status":\s*404/i.test(raw);
  /* Solo `bumpAppSettingsSyncSignal` interroga questa tabella: 404 = tabella/route assente. */
  if (status === 404) return true;
  return mentionsTable && looksMissing;
}

/** Un solo `Promise` all’avvio (Strict Mode / doppie chiamate). */
let appBootBundlePull: Promise<AppGlobalSettingsBundle | null> | null = null;

export interface AppGlobalSettingsBundle {
  schemaVersion: number;
  updatedAt: string;
  workRules?: WorkRules;
  breakRules?: BreakRule[];
  geofence?: GeofenceConfig | null;
  featureFlags?: FeatureFlags | null;
  roleFeatureTemplates?: RoleFeatureTemplatesOnDisk | null;
  adminModulesGlobal?: AdminModulesGlobalOnDisk | null;
  presenceVerification?: PresenceVerificationConfig | null;
}

function storageEnabled(): boolean {
  return import.meta.env.VITE_APP_CONFIG_STORAGE_ENABLED !== 'false';
}

export function parseGlobalSettingsBundle(raw: unknown): AppGlobalSettingsBundle | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const schemaVersion = Number(o.schemaVersion);
  if (schemaVersion !== GLOBAL_SETTINGS_SCHEMA_VERSION) return null;
  const updatedAt = typeof o.updatedAt === 'string' && o.updatedAt ? o.updatedAt : new Date().toISOString();
  const out: AppGlobalSettingsBundle = { schemaVersion, updatedAt };

  if (o.workRules && typeof o.workRules === 'object' && !Array.isArray(o.workRules)) {
    out.workRules = { ...DEFAULT_WORK_RULES, ...(o.workRules as Partial<WorkRules>) };
  }
  if (Array.isArray(o.breakRules)) {
    out.breakRules = o.breakRules as BreakRule[];
  }
  if (o.geofence === null) {
    out.geofence = null;
  } else if (o.geofence !== undefined) {
    const g = parseGeofenceFile(o.geofence);
    if (g) out.geofence = g;
  }
  if (o.featureFlags && typeof o.featureFlags === 'object' && !Array.isArray(o.featureFlags)) {
    out.featureFlags = o.featureFlags as FeatureFlags;
  }
  if (o.roleFeatureTemplates && typeof o.roleFeatureTemplates === 'object' && !Array.isArray(o.roleFeatureTemplates)) {
    out.roleFeatureTemplates = o.roleFeatureTemplates as RoleFeatureTemplatesOnDisk;
  }
  if (o.adminModulesGlobal && typeof o.adminModulesGlobal === 'object' && !Array.isArray(o.adminModulesGlobal)) {
    out.adminModulesGlobal = o.adminModulesGlobal as AdminModulesGlobalOnDisk;
  }
  if (o.presenceVerification && typeof o.presenceVerification === 'object' && !Array.isArray(o.presenceVerification)) {
    const p = parsePresenceVerificationFile(o.presenceVerification);
    if (p) out.presenceVerification = p;
  }

  return out;
}

/**
 * Primo “pull” bundle all’avvio: dedup Strict Mode. Non effettua richieste Storage sull’object (vedi nota file).
 */
export function pullGlobalSettingsBundleOnAppBoot(): Promise<AppGlobalSettingsBundle | null> {
  if (!supabase || !storageEnabled()) return Promise.resolve(null);
  if (!appBootBundlePull) {
    appBootBundlePull = Promise.resolve(null);
  }
  return appBootBundlePull;
}

export function invalidateAppBootGlobalSettingsBundlePull(): void {
  appBootBundlePull = null;
}

/**
 * Pull del bundle da Storage: sempre `null` lato client (niente GET su `settings_bundle.json`).
 * Il merge remoto avviene tramite i JSON separati in `AppContext` / `silentRefreshData`.
 * @param opts — mantenuto per compatibilità chiamanti (`force`, ecc.); la lettura object è disattivata.
 */
export async function fetchGlobalSettingsBundleFromSupabase(opts?: {
  force?: boolean;
}): Promise<AppGlobalSettingsBundle | null> {
  void opts?.force;
  if (!supabase || !storageEnabled()) return null;
  return null;
}

export async function uploadGlobalSettingsBundleToSupabase(bundle: AppGlobalSettingsBundle): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');
  const body: AppGlobalSettingsBundle = {
    ...bundle,
    schemaVersion: GLOBAL_SETTINGS_SCHEMA_VERSION,
    updatedAt: bundle.updatedAt || new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(GLOBAL_SETTINGS_BUNDLE_PATH, blob, {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '120',
  });
  if (error) {
    throw new Error(error.message || 'Upload settings_bundle.json fallito.');
  }
  invalidateAppBootGlobalSettingsBundlePull();
}

/**
 * Notifica gli altri client via Realtime (tabella `app_settings_sync_signal`).
 * Se la tabella non esiste, dopo il primo errore non vengono più inviate richieste (meno 404 in console).
 * Migrazione: `supabase/migrations/20260322180000_app_settings_sync_signal.sql`.
 * Disattiva da build: `VITE_APP_SETTINGS_SYNC_SIGNAL=false` in `.env`.
 */
export async function bumpAppSettingsSyncSignal(): Promise<void> {
  if (!supabase || !isAppCloudSyncEnabled() || readAppSettingsSyncSignalRestSkipped()) return;
  try {
    const { data, error: selectError } = await supabase
      .from('app_settings_sync_signal')
      .select('revision')
      .eq('id', 1)
      .maybeSingle();
    if (selectError) {
      if (isMissingAppSettingsSyncTable(selectError)) {
        writeAppSettingsSyncSignalUnavailable();
        return;
      }
      if (import.meta.env.DEV) {
        console.warn('[app_settings_sync_signal]', selectError.message);
      }
      return;
    }
    const prev = typeof data?.revision === 'number' && Number.isFinite(data.revision) ? Math.floor(data.revision) : 0;
    const next = prev + 1;
    const { error } = await supabase.from('app_settings_sync_signal').upsert(
      { id: 1, revision: next, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );
    if (error) {
      if (isMissingAppSettingsSyncTable(error)) {
        writeAppSettingsSyncSignalUnavailable();
        return;
      }
      if (import.meta.env.DEV) {
        console.warn('[app_settings_sync_signal]', error.message);
      }
      return;
    }
    clearAppSettingsSyncSignalUnavailableStorage();
  } catch (e) {
    if (isMissingAppSettingsSyncTable(e)) {
      writeAppSettingsSyncSignalUnavailable();
      return;
    }
    if (import.meta.env.DEV) {
      console.warn('[app_settings_sync_signal]', e);
    }
  }
}

export function buildGlobalSettingsBundleFromParts(parts: {
  workRules: WorkRules;
  breakRules: BreakRule[];
  geofenceDisk: GeofenceConfig | null;
  featureFlags: FeatureFlags;
  roleFeatureTemplates: RoleFeatureTemplatesOnDisk | null;
  adminModulesGlobal: AdminModulesGlobalOnDisk | null;
  presenceVerification: PresenceVerificationConfig;
}): AppGlobalSettingsBundle {
  return {
    schemaVersion: GLOBAL_SETTINGS_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    workRules: { ...parts.workRules },
    breakRules: [...parts.breakRules],
    geofence: parts.geofenceDisk,
    featureFlags: { ...parts.featureFlags },
    roleFeatureTemplates: parts.roleFeatureTemplates ? { ...parts.roleFeatureTemplates } : null,
    adminModulesGlobal: parts.adminModulesGlobal ? { ...parts.adminModulesGlobal } : null,
    presenceVerification: { ...parts.presenceVerification },
  };
}
