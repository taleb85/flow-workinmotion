import { supabase } from '../lib/supabase';
import type { PeriodConfig, PeriodRule } from './periodConfig';
import {
  coercePeriodConfig,
  savePeriodConfig,
  dispatchPeriodConfigUpdated,
  coercePeriodRules,
  saveCustomPeriodRules,
  dispatchPeriodRulesUpdated,
} from './periodConfig';

const BUCKET = 'app-config';
const FILE_PATH = 'timesheet-period.json';
const RULES_FILE_PATH = 'period-rules.json';
/** Evita GET ripetuti se Storage risponde 400/404 (bucket/policy o file assente). */
const SKIP_SESSION_KEY = 'osteria_skip_timesheet_period_storage';
/** Chiave separata: il file delle regole può mancare anche se il periodo esiste. */
const RULES_SKIP_SESSION_KEY = 'osteria_skip_period_rules_storage';

function setSkipThisSession(): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(SKIP_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

function clearSkipThisSession(): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SKIP_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function shouldSkipLoad(): boolean {
  if (import.meta.env.VITE_TIMESHEET_PERIOD_STORAGE_ENABLED === 'false') return true;
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(SKIP_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Carica periodo presenze da Supabase Storage (condiviso tra PWA/browser e app installata).
 */
export async function loadTimesheetPeriodFromSupabase(): Promise<PeriodConfig | null> {
  if (!supabase) return null;
  if (shouldSkipLoad()) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error || !data) {
      setSkipThisSession();
      return null;
    }
    const text = await data.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    clearSkipThisSession();
    return coercePeriodConfig(parsed);
  } catch {
    setSkipThisSession();
    return null;
  }
}

/**
 * Salva il periodo su Storage (upsert). In caso di errore il locale resta comunque valido.
 */
export async function saveTimesheetPeriodToSupabase(cfg: PeriodConfig): Promise<void> {
  if (!supabase) return;
  const blob = new Blob([JSON.stringify(cfg)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, {
    upsert: true,
    contentType: 'application/json',
  });
  if (error) throw error;
  clearSkipThisSession();
}

/**
 * Se il remoto è valido: scrive localStorage + notifica i listener (come un salvataggio locale).
 */
export function applyRemoteTimesheetPeriod(cfg: PeriodConfig): void {
  savePeriodConfig(cfg);
  dispatchPeriodConfigUpdated();
}

// ── Regole di calcolo del periodo (personalizzate) ───────────────────────────

function setRulesSkipThisSession(): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(RULES_SKIP_SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

function clearRulesSkipThisSession(): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(RULES_SKIP_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

function shouldSkipRulesLoad(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(RULES_SKIP_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** Carica le regole di calcolo personalizzate da Supabase Storage. */
export async function loadPeriodRulesFromSupabase(): Promise<PeriodRule[] | null> {
  if (!supabase) return null;
  if (shouldSkipRulesLoad()) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(RULES_FILE_PATH);
    if (error || !data) {
      setRulesSkipThisSession();
      return null;
    }
    const text = await data.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    const rules = coercePeriodRules(parsed);
    if (!rules) return null;
    clearRulesSkipThisSession();
    return rules;
  } catch {
    setRulesSkipThisSession();
    return null;
  }
}

/** Salva le regole di calcolo personalizzate su Storage (upsert). */
export async function savePeriodRulesToSupabase(rules: PeriodRule[]): Promise<void> {
  if (!supabase) return;
  const blob = new Blob([JSON.stringify(rules)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(RULES_FILE_PATH, blob, {
    upsert: true,
    contentType: 'application/json',
  });
  if (error) throw error;
  clearRulesSkipThisSession();
}

/** Applica le regole remote in locale e notifica i listener. */
export function applyRemotePeriodRules(rules: PeriodRule[]): void {
  saveCustomPeriodRules(rules);
  dispatchPeriodRulesUpdated();
}
