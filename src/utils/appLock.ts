/**
 * Sblocco app — API client.
 *
 * Il PIN di sblocco è il PIN del profilo (`users.pin`): nessun PIN dedicato e nessuna
 * copia locale. Verifica e blocco dopo 5 tentativi sono applicati lato server dalle RPC
 * `app_lock_*` (vedi `supabase/migrations/*_user_app_lock.sql`).
 * Se le RPC non sono disponibili la verifica ricade sul confronto locale del PIN profilo.
 */
import { supabase } from '../lib/supabase';

export const APP_LOCK_MAX_ATTEMPTS = 5;

export interface AppLockStatus {
  /** False se le RPC non sono raggiungibili (migrazione non applicata / offline). */
  available: boolean;
  locked: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
}

export type VerifyAppLockPinResult =
  | { ok: true }
  | { ok: false; reason: 'wrong_pin'; remainingAttempts: number }
  | { ok: false; reason: 'locked'; lockedUntil: string | null }
  | { ok: false; reason: 'not_found' | 'unavailable' | 'error' };

type RpcResponse = { ok?: boolean; reason?: string; remaining_attempts?: number; locked_until?: string | null; locked?: boolean; failed_attempts?: number };

/** True se l'errore indica che la funzione RPC non esiste (migrazione non applicata). */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '404') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('could not find the function') || msg.includes('schema cache');
}

/** Valida un PIN numerico a 4 cifre. */
export function isValidUnlockPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}

/** Minuti rimanenti al termine del blocco (arrotondati per eccesso, minimo 1). */
export function minutesUntil(lockedUntil: string | null): number {
  if (!lockedUntil) return 0;
  const ms = new Date(lockedUntil).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.max(1, Math.ceil(ms / 60000));
}

async function callRpc<T extends RpcResponse>(fn: string, args: Record<string, unknown>): Promise<
  { available: true; data: T } | { available: false } | { available: true; error: true }
> {
  if (!supabase) return { available: false };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return isMissingFunction(error) ? { available: false } : { available: true, error: true };
  return { available: true, data: (data ?? {}) as T };
}

/** Stato del lockout dello sblocco app. */
export async function getAppLockStatus(userId: string): Promise<AppLockStatus> {
  const res = await callRpc<RpcResponse>('app_lock_status', { p_user_id: userId });
  if (!res.available || 'error' in res) {
    return { available: false, locked: false, lockedUntil: null, failedAttempts: 0 };
  }
  const d = res.data;
  return {
    available: true,
    locked: Boolean(d.locked),
    lockedUntil: d.locked_until ?? null,
    failedAttempts: Number(d.failed_attempts ?? 0),
  };
}

/** Verifica il PIN del profilo per lo sblocco (con lockout lato server). */
export async function verifyAppLockPin(userId: string, pin: string): Promise<VerifyAppLockPinResult> {
  const res = await callRpc<RpcResponse>('app_lock_verify', { p_user_id: userId, p_pin: pin });
  if (!res.available) return { ok: false, reason: 'unavailable' };
  if ('error' in res) return { ok: false, reason: 'error' };
  const d = res.data;
  if (d.ok) return { ok: true };
  if (d.reason === 'locked') return { ok: false, reason: 'locked', lockedUntil: d.locked_until ?? null };
  if (d.reason === 'wrong_pin') {
    return { ok: false, reason: 'wrong_pin', remainingAttempts: Number(d.remaining_attempts ?? 0) };
  }
  if (d.reason === 'not_found') return { ok: false, reason: 'not_found' };
  return { ok: false, reason: 'error' };
}

/** Azzera il lockout (recupero dopo login completo o intervento amministrativo). */
export async function resetAppLock(userId: string): Promise<boolean> {
  const res = await callRpc<RpcResponse>('app_lock_reset', { p_user_id: userId });
  if (!res.available || 'error' in res) return false;
  return Boolean(res.data.ok);
}
