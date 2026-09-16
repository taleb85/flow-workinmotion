import { supabase } from '../lib/supabase';

/** Allineare a `ADMIN_MODULE_KEYS` in enabledFeatures.ts */
const MODULE_KEYS = [
  'visibility_management',
  'department_creation',
  'violation_rules',
  'auto_breaks',
] as const;

const BUCKET = 'app-config';
const FILE_PATH = 'admin_sheet_modules.json';
const STORAGE_KEY = 'osteria_admin_sheet_modules_v1';
export type AdminModuleKeyGlobal = (typeof MODULE_KEYS)[number];
export type AdminModulesGlobalOnDisk = Partial<Record<AdminModuleKeyGlobal, boolean>>;

let cache: AdminModulesGlobalOnDisk | null = null;

export function setAdminModulesGlobalCache(data: AdminModulesGlobalOnDisk | null): void {
  cache = data;
}

export function getAdminModulesGlobalCache(): AdminModulesGlobalOnDisk | null {
  return cache;
}

export function getLocalAdminModulesGlobal(): AdminModulesGlobalOnDisk | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return parseAdminModulesFile(parsed);
  } catch {
    return null;
  }
}

export function writeAdminModulesGlobalLocal(data: AdminModulesGlobalOnDisk): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function parseAdminModulesFile(raw: unknown): AdminModulesGlobalOnDisk | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const out: AdminModulesGlobalOnDisk = {};
  for (const k of MODULE_KEYS) {
    if (typeof o[k] === 'boolean') out[k] = o[k];
  }
  return Object.keys(out).length ? out : null;
}

function mergeLayers(
  remote: AdminModulesGlobalOnDisk | null,
  local: AdminModulesGlobalOnDisk | null
): AdminModulesGlobalOnDisk | null {
  if (!remote && !local) return null;
  // Stesso criterio dei template ruoli: remoto = fonte di verità quando presente.
  return { ...(local ?? {}), ...(remote ?? {}) };
}

export async function loadAdminModulesGlobalFromSupabase(): Promise<AdminModulesGlobalOnDisk | null> {
  if (!supabase) return null;
  if (import.meta.env.VITE_FEATURE_FLAGS_STORAGE_ENABLED === 'false') return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error || !data) return null;
    const text = await data.text();
    return parseAdminModulesFile(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export async function saveAdminModulesGlobalToSupabase(data: AdminModulesGlobalOnDisk): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');
  const blob = new Blob([JSON.stringify(data, null, 0)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '3600',
  });
  if (error) {
    throw new Error(
      error.message ||
        'Upload su Storage fallito (bucket app-config o policy mancanti: vedi docs/SUPABASE_STORAGE_APP_CONFIG.md).'
    );
  }
}

export function loadAndMergeAdminModulesGlobal(
  remote: AdminModulesGlobalOnDisk | null,
  local: AdminModulesGlobalOnDisk | null
): AdminModulesGlobalOnDisk | null {
  return mergeLayers(remote, local);
}

/** Serializza tutte le chiavi modulo per il JSON. */
export function serializeAdminModulesForDisk(
  state: Partial<Record<AdminModuleKeyGlobal, boolean>>
): Record<string, boolean> {
  return Object.fromEntries(MODULE_KEYS.map((k) => [k, state[k] === true])) as Record<string, boolean>;
}
