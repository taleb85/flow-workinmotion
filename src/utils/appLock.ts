/**
 * PIN di sblocco app — API client.
 *
 * L'hashing (bcrypt) e il blocco dopo 5 tentativi sono applicati lato server dalle RPC
 * `app_lock_*` (vedi `supabase/migrations/*_user_app_lock.sql`); il client non conserva
 * né il PIN né il suo hash. Se le RPC non sono disponibili (migrazione non applicata)
 * le operazioni restituiscono `unavailable` e l'app ricade sul PIN di login.
 */
import { supabase } from '../lib/supabase';

export const APP_LOCK_MAX_ATTEMPTS = 5;

export interface AppLockStatus {
  /** False se le RPC non sono raggiungibili (migrazione non applicata / offline). */
  available: boolean;
  configured: boolean;
  locked: boolean;
  lockedUntil: string | null;
  failedAttempts: number;
}

export type SetAppLockPinResult =
  | { ok: true; recoveryCode: string }
  | { ok: false; reason: 'invalid_pin' | 'unavailable' | 'error' };

export type VerifyAppLockPinResult =
  | { ok: true }
  | { ok: false; reason: 'wrong_pin'; remainingAttempts: number }
  | { ok: false; reason: 'locked'; lockedUntil: string | null }
  | { ok: false; reason: 'not_configured' | 'unavailable' | 'error' };

export type RecoverAppLockResult =
  | { ok: true; recoveryCode: string }
  | { ok: false; reason: 'wrong_code' | 'invalid_pin' | 'not_configured' | 'unavailable' | 'error' };

type RpcResponse = { ok?: boolean; reason?: string; recovery_code?: string; remaining_attempts?: number; locked_until?: string | null; configured?: boolean; locked?: boolean; failed_attempts?: number };

/** True se l'errore indica che la funzione RPC non esiste (migrazione non applicata). */
function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST202' || error.code === '404') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('could not find the function') || msg.includes('schema cache');
}

/** Formatta un codice di recupero per la visualizzazione: `XXXX-XXXX-XXXX`. */
export function formatRecoveryCode(code: string): string {
  const clean = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1-').replace(/-$/, '');
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

/** Stato del PIN di sblocco (configurato, bloccato, tentativi). */
export async function getAppLockStatus(userId: string): Promise<AppLockStatus> {
  const res = await callRpc<RpcResponse>('app_lock_status', { p_user_id: userId });
  if (!res.available) {
    return { available: false, configured: false, locked: false, lockedUntil: null, failedAttempts: 0 };
  }
  if ('error' in res) {
    return { available: false, configured: false, locked: false, lockedUntil: null, failedAttempts: 0 };
  }
  const d = res.data;
  return {
    available: true,
    configured: Boolean(d.configured),
    locked: Boolean(d.locked),
    lockedUntil: d.locked_until ?? null,
    failedAttempts: Number(d.failed_attempts ?? 0),
  };
}

/** Imposta (o sostituisce) il PIN di sblocco. Ritorna il codice di recupero una sola volta. */
export async function setAppLockPin(
  userId: string,
  pin: string,
  tenantId?: string | null
): Promise<SetAppLockPinResult> {
  if (!isValidUnlockPin(pin)) return { ok: false, reason: 'invalid_pin' };
  const res = await callRpc<RpcResponse>('app_lock_set_pin', {
    p_user_id: userId,
    p_pin: pin,
    p_tenant_id: tenantId ?? null,
  });
  if (!res.available) return { ok: false, reason: 'unavailable' };
  if ('error' in res) return { ok: false, reason: 'error' };
  const d = res.data;
  if (!d.ok) return { ok: false, reason: 'invalid_pin' };
  return { ok: true, recoveryCode: d.recovery_code ?? '' };
}

/** Verifica il PIN di sblocco (con lockout lato server). */
export async function verifyAppLockPin(userId: string, pin: string): Promise<VerifyAppLockPinResult> {
  const res = await callRpc<RpcResponse>('app_lock_verify_pin', { p_user_id: userId, p_pin: pin });
  if (!res.available) return { ok: false, reason: 'unavailable' };
  if ('error' in res) return { ok: false, reason: 'error' };
  const d = res.data;
  if (d.ok) return { ok: true };
  if (d.reason === 'locked') return { ok: false, reason: 'locked', lockedUntil: d.locked_until ?? null };
  if (d.reason === 'wrong_pin') {
    return { ok: false, reason: 'wrong_pin', remainingAttempts: Number(d.remaining_attempts ?? 0) };
  }
  if (d.reason === 'not_configured') return { ok: false, reason: 'not_configured' };
  return { ok: false, reason: 'error' };
}

/** Recupero account: codice di recupero valido → nuovo PIN + nuovo codice. */
export async function recoverAppLockPin(
  userId: string,
  recoveryCode: string,
  newPin: string
): Promise<RecoverAppLockResult> {
  if (!isValidUnlockPin(newPin)) return { ok: false, reason: 'invalid_pin' };
  if (recoveryCode.replace(/[^a-zA-Z0-9]/g, '').length < 8) return { ok: false, reason: 'wrong_code' };
  const res = await callRpc<RpcResponse>('app_lock_recover', {
    p_user_id: userId,
    p_recovery_code: recoveryCode,
    p_new_pin: newPin,
  });
  if (!res.available) return { ok: false, reason: 'unavailable' };
  if ('error' in res) return { ok: false, reason: 'error' };
  const d = res.data;
  if (!d.ok) {
    if (d.reason === 'wrong_code') return { ok: false, reason: 'wrong_code' };
    if (d.reason === 'invalid_pin') return { ok: false, reason: 'invalid_pin' };
    if (d.reason === 'not_configured') return { ok: false, reason: 'not_configured' };
    return { ok: false, reason: 'error' };
  }
  return { ok: true, recoveryCode: d.recovery_code ?? '' };
}

/** Rimuove PIN di sblocco e lockout per l'utente (disattivazione / recupero admin). */
export async function resetAppLock(userId: string): Promise<boolean> {
  const res = await callRpc<RpcResponse>('app_lock_reset', { p_user_id: userId });
  if (!res.available || 'error' in res) return false;
  return Boolean(res.data.ok);
}
