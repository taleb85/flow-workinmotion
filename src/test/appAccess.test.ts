import { describe, test, expect, beforeEach, vi } from 'vitest';

/** RPC Supabase mockata: ogni test imposta la risposta del server. */
const rpcMock = vi.fn();
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import {
  formatRecoveryCode,
  isValidUnlockPin,
  minutesUntil,
  getAppLockStatus,
  setAppLockPin,
  verifyAppLockPin,
  recoverAppLockPin,
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

  test('formatRecoveryCode raggruppa in blocchi da 4', () => {
    expect(formatRecoveryCode('abcd1234ef56')).toBe('ABCD-1234-EF56');
    expect(formatRecoveryCode('ABCD-1234-EF56')).toBe('ABCD-1234-EF56');
  });

  test('minutesUntil arrotonda per eccesso e gestisce valori nulli', () => {
    expect(minutesUntil(null)).toBe(0);
    expect(minutesUntil(new Date(Date.now() + 1000).toISOString())).toBe(1);
    expect(minutesUntil(new Date(Date.now() + 61_000).toISOString())).toBe(2);
    expect(minutesUntil(new Date(Date.now() - 1000).toISOString())).toBe(0);
  });
});

describe('appLock client', () => {
  test('status: configurazione assente', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, configured: false, locked: false, failed_attempts: 0 }, error: null });
    const status = await getAppLockStatus('u1');
    expect(status).toEqual({ available: true, configured: false, locked: false, lockedUntil: null, failedAttempts: 0 });
  });

  test('status: RPC assente → unavailable', async () => {
    rpcMock.mockResolvedValue(MISSING_FUNCTION);
    const status = await getAppLockStatus('u1');
    expect(status.available).toBe(false);
  });

  test('verify: PIN errato con tentativi rimasti', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, reason: 'wrong_pin', remaining_attempts: 3 }, error: null });
    const res = await verifyAppLockPin('u1', '0000');
    expect(res).toEqual({ ok: false, reason: 'wrong_pin', remainingAttempts: 3 });
  });

  test('verify: blocco attivo', async () => {
    const until = new Date(Date.now() + 600_000).toISOString();
    rpcMock.mockResolvedValue({ data: { ok: false, reason: 'locked', locked_until: until }, error: null });
    const res = await verifyAppLockPin('u1', '0000');
    expect(res).toEqual({ ok: false, reason: 'locked', lockedUntil: until });
  });

  test('verify: successo', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await verifyAppLockPin('u1', '1234')).toEqual({ ok: true });
    expect(rpcMock).toHaveBeenCalledWith('app_lock_verify_pin', { p_user_id: 'u1', p_pin: '1234' });
  });

  test('set: PIN formalmente non valido viene rifiutato senza chiamare il server', async () => {
    const res = await setAppLockPin('u1', '12');
    expect(res).toEqual({ ok: false, reason: 'invalid_pin' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  test('set: ritorna il codice di recupero una sola volta', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, recovery_code: 'ABCD-1234-EF56' }, error: null });
    expect(await setAppLockPin('u1', '1234')).toEqual({ ok: true, recoveryCode: 'ABCD-1234-EF56' });
  });

  test('recover: codice troppo corto rifiutato localmente', async () => {
    const res = await recoverAppLockPin('u1', 'abc', '1234');
    expect(res).toEqual({ ok: false, reason: 'wrong_code' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  test('recover: codice valido → nuovo PIN e nuovo codice', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true, recovery_code: 'ZZZZ-9999-0000' }, error: null });
    expect(await recoverAppLockPin('u1', 'abcd-1234-ef56', '5678')).toEqual({
      ok: true,
      recoveryCode: 'ZZZZ-9999-0000',
    });
  });

  test('recover: codice errato', async () => {
    rpcMock.mockResolvedValue({ data: { ok: false, reason: 'wrong_code' }, error: null });
    expect(await recoverAppLockPin('u1', 'abcd-1234-ef56', '5678')).toEqual({ ok: false, reason: 'wrong_code' });
  });

  test('reset: rimuove il PIN di sblocco', async () => {
    rpcMock.mockResolvedValue({ data: { ok: true }, error: null });
    expect(await resetAppLock('u1')).toBe(true);
  });

  test('reset: errore server → false', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: '500', message: 'boom' } });
    expect(await resetAppLock('u1')).toBe(false);
  });
});
