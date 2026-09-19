import { supabase } from '../lib/supabase';
import type { User, Shift, PunchRecord, HolidayRequest } from '../types';

export interface GDPRExportData {
  exportedAt: string;
  user: Partial<User> | null;
  shifts: Shift[];
  punchRecords: PunchRecord[];
  holidayRequests: HolidayRequest[];
  departments?: string[];
  settings?: Record<string, unknown>;
  /** Dispositivi riconosciuti (identificativo opaco, senza dati hardware). */
  devices?: Array<{
    id: string;
    platform: string | null;
    label: string | null;
    created_at: string;
    last_seen_at: string;
    revoked_at: string | null;
  }>;
}

export async function exportUserData(userId: string): Promise<GDPRExportData> {
  const { data: user } = await supabase!.from('users').select('*').eq('id', userId).single();
  const { data: shifts } = await supabase!.from('shifts').select('*').eq('user_id', userId);
  const { data: punchRecords } = await supabase!.from('punch_records').select('*').eq('user_id', userId);
  const { data: holidayRequests } = await supabase!.from('holiday_requests').select('*').eq('user_id', userId);
  const { data: devices } = await supabase!
    .from('user_devices')
    .select('id, platform, label, created_at, last_seen_at, revoked_at')
    .eq('user_id', userId);

  return {
    exportedAt: new Date().toISOString(),
    user: user ?? null,
    shifts: shifts ?? [],
    punchRecords: punchRecords ?? [],
    holidayRequests: holidayRequests ?? [],
    devices: (devices ?? []) as GDPRExportData['devices'],
  };
}

export async function anonymizeUser(userId: string): Promise<boolean> {
  const { error } = await supabase!.from('users').update({
    first_name: 'UTENTE',
    last_name: 'CANCELLATO',
    email: `deleted-${userId.slice(0, 8)}@anonymized.flow.app`,
    phone: null,
    pin: null as any,
    secondary_pin: null,
    avatar_url: null,
    status: 'inactive',
  } as any).eq('id', userId);
  return !error;
}

export function isEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isPhoneValid(phone: string): boolean {
  return /^[\d\s+\-()]{6,20}$/.test(phone);
}
