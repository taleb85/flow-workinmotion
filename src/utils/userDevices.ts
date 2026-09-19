/**
 * Registro dispositivi dell'utente (tabella `user_devices`).
 * Il riconoscimento del dispositivo è lato server: l'ID opaco locale viene associato
 * all'utente e può essere revocato (utente o admin). Nessun dato hardware è memorizzato.
 */
import { supabase } from '../lib/supabase';
import { getDeviceId, getOrCreateDeviceId, getDeviceLabel, getDevicePlatform } from './deviceIdentity';

export type DeviceSyncResult = 'ok' | 'unavailable' | 'error';

export interface UserDevice {
  id: string;
  user_id: string;
  device_id: string;
  platform: string | null;
  label: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
}

/** True se l'errore indica che la tabella/colonne non esistono ancora (migrazione non applicata). */
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42P01' || error.code === 'PGRST204' || error.code === 'PGRST205') return true;
  const msg = (error.message ?? '').toLowerCase();
  return msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find the table');
}

/** Registra (o aggiorna) il dispositivo corrente per l'utente. Idempotente. */
export async function registerCurrentDevice(userId: string, tenantId?: string | null): Promise<DeviceSyncResult> {
  if (!supabase) return 'unavailable';
  const deviceId = getOrCreateDeviceId();
  if (!deviceId) return 'unavailable';
  const now = new Date().toISOString();
  const { error } = await supabase.from('user_devices').upsert(
    {
      user_id: userId,
      tenant_id: tenantId ?? null,
      device_id: deviceId,
      platform: getDevicePlatform(),
      label: getDeviceLabel(),
      last_seen_at: now,
      revoked_at: null,
    },
    { onConflict: 'user_id,device_id' }
  );
  if (!error) return 'ok';
  return isMissingRelation(error) ? 'unavailable' : 'error';
}

/** Aggiorna solo `last_seen_at` del dispositivo corrente (best-effort). */
export async function touchCurrentDevice(userId: string): Promise<DeviceSyncResult> {
  if (!supabase) return 'unavailable';
  const deviceId = getDeviceId();
  if (!deviceId) return 'unavailable';
  const { error } = await supabase
    .from('user_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .is('revoked_at', null);
  if (!error) return 'ok';
  return isMissingRelation(error) ? 'unavailable' : 'error';
}

/** True se il dispositivo corrente è registrato e non revocato. `null` se non verificabile. */
export async function isCurrentDeviceRegistered(userId: string): Promise<boolean | null> {
  if (!supabase) return null;
  const deviceId = getDeviceId();
  // Nessun ID locale (es. sessione creata prima del riconoscimento): non è una revoca.
  if (!deviceId) return null;
  const { data, error } = await supabase
    .from('user_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) return null;
  return Boolean(data);
}

/** Revoca il dispositivo corrente per l'utente. */
export async function revokeCurrentDevice(userId: string): Promise<DeviceSyncResult> {
  if (!supabase) return 'unavailable';
  const deviceId = getDeviceId();
  if (!deviceId) return 'unavailable';
  const { error } = await supabase
    .from('user_devices')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('device_id', deviceId);
  if (!error) return 'ok';
  return isMissingRelation(error) ? 'unavailable' : 'error';
}

/** Elenco dispositivi (inclusi revocati) dell'utente, dal più recente. */
export async function listUserDevices(userId: string): Promise<UserDevice[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('user_devices')
    .select('*')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false });
  if (error || !data) return [];
  return data as UserDevice[];
}
