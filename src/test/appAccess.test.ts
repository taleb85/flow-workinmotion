import { describe, test, expect, beforeEach, vi } from 'vitest';

/** RPC Supabase mockata: ogni test imposta la risposta del server. */
const rpcMock = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import {
  isValidUnlockPin,
  minutesUntil,
  getAppLockStatus,
  verifyAppLockPin,
  resetAppLock,
} from '../utils/appLock';
import {
  getDeviceId,
  getOrCreateDeviceId,
  clearDeviceIdentity,
  getDevicePlatform,
} from '../utils/deviceIdentity';

const MISSING_FUNCTION = {
  data: null,
  error: { code: 'PGRST202', message: 'Could not find the function public.app_lock_status in the schema cache' },
};

beforeEach(() => {
  rpcMock.mockReset();
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
});

describe('deviceIdentity', () => {
  test('genera un ID opaco di 32 hex e lo mantiene stabile', () => {
    const first = getOrCreateDeviceId();
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(getOrCreateDeviceId()).toBe(first);
    expect(getDeviceId()).toBe(first);
  });

  test('clearDeviceIdentity rimuove l’identificativo', () => {
    getOrCreateDeviceId();
    clearDeviceIdentity();
    expect(getDeviceId()).toBeNull();
  });

  test('getDevicePlatform non espone dati hardware', () => {
    expect(['ios', 'android', 'web']).toContain(getDevicePlatform());
  });
});

describe('appLock helpers', () => {
  test('isValidUnlockPin accetta solo 4 cifre', () => {
    expect(isValidUnlockPin('1234')).toBe(true);
    expect(isValidUnlockPin('123')).toBe(false);
    expect(isValidUnlockPin('12a4')).toBe(false);
    expect(isValidUnlockPin('')).toBe(false);
  });

  test('minutesUntil arrotonda per eccesso e gestisce valori nulli', () => {
    expect(minutesUntil(null)).toBe(0);
    expect(minutesUntil(new Date(Date.now() + 1000).toISOString())).toBe(1);
    expect(minutesUntil(new Date(Date.now() + 61_000).toISOString())).toBe(2);
    expect(minutesUntil(new Date(Date.now() - 1000).toISOString())).toBe(0);
  });
});

describe('appLock client', () => {
  test('status: nessun lockout', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, locked: false, locked_until: null, failed_attempts: 0 }, error: null });
    expect(await getAppLockStatus('u1')).toEqual({
      available: true,
      locked: false,
      lockedUntil: null,
      failedAttempts: 0,
    });
    expect(rpcMock).toHaveBeenCalledWith('app_lock_status', { p_user_id: 'u1' });
  });

  test('status: lockout attivo', async () => {
    const until = new Date(Date.now() + 600_000).toISOString();
    rpcMock.mockResolvedValue({ data: { ok: true, locked: true, locked_until: until, failed_attempts: 0 }, error: null });
    const status = await getAppLockStatus('u1');
    expect(status.locked).toBe(true);
    expect(status.lockedUntil).toBe(until);
  });

  test('status: RPC assente → unavailable', async () => {
    rpcMock.mockResolvedValue(MISSING_FUNCTION);
    expect((await getAppLockStatus('u1')).available).toBe(false);
  });

  test('verify: verifica il PIN del profilo lato server', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await verifyAppLockPin('u1', '1234')).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('app_lock_verify', { p_user_id: 'u1', p_pin: '1234' });
  });

  test('verify: PIN errato con tentativi rimasti', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, reason: 'wrong_pin', remaining_attempts: 3 }, error: null });
    expect(await verifyAppLockPin('u1', '0000')).toEqual({ ok: false, reason: 'wrong_pin', remainingAttempts: 3 });
  });

  test('verify: blocco attivo', async () => {
    const until = new Date(Date.now() + 600_000).toISOString();
    rpcMock.mockResolvedValue({ data: { ok: false, reason: 'locked', locked_until: until }, error: null });
    expect(await verifyAppLockPin('u1', '0000')).toEqual({ ok: false, reason: 'locked', lockedUntil: until });
  });

  test('verify: utente non trovato', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, reason: 'not_found' }, error: null });
    expect(await verifyAppLockPin('u1', '0000')).toEqual({ ok: false, reason: 'not_found' });
  });

  test('verify: RPC assente → unavailable (fallback locale)', async () => {
    rpcMock.mockResolvedValue(MISSING_FUNCTION);
    expect(await verifyAppLockPin('u1', '0000')).toEqual({ ok: false, reason: 'unavailable' });
  });

  test('reset: azzera il lockout', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await resetAppLock('u1')).toBe(true);
    expect(rpcMock).toHaveBeenCalledWith('app_lock_reset', { p_user_id: 'u1' });
  });

  test('reset: errore server → false', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '500', message: 'boom' } });
    expect(await resetAppLock('u1')).toBe(false);
  });
});
