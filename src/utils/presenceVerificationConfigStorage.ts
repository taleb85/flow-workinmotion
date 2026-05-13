/**
 * `presence_verification.json` nel bucket Storage `app-config` (stesso pattern di geofence.json).
 */
import { supabase } from '../lib/supabase';

const BUCKET = 'app-config';
const FILE_PATH = 'presence_verification.json';
const STORAGE_KEY = 'osteria_presence_verification_v1';

export type PresenceVerificationConfig = {
  /** Se true, timbratura richiede QR o NFC valido (salvo manager che timbra per altri). */
  requireVerification: boolean;
  /** Payload atteso: stesso testo nel QR stampato e sul tag NFC. */
  verificationToken: string;
  nfcLastRegisteredAt?: string;
};

const DEFAULTS: PresenceVerificationConfig = {
  requireVerification: false,
  verificationToken: '',
};

export function parsePresenceVerificationFile(raw: unknown): PresenceVerificationConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    requireVerification: o.requireVerification === true,
    verificationToken: typeof o.verificationToken === 'string' ? o.verificationToken : '',
    nfcLastRegisteredAt: typeof o.nfcLastRegisteredAt === 'string' ? o.nfcLastRegisteredAt : undefined,
  };
}

export function getLocalPresenceVerificationConfig(): PresenceVerificationConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parsePresenceVerificationFile(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeLocalPresenceVerificationConfig(data: PresenceVerificationConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

export function mergePresenceVerificationLayers(
  remote: PresenceVerificationConfig | null,
  local: PresenceVerificationConfig | null
): PresenceVerificationConfig {
  const base = { ...DEFAULTS };
  if (local) {
    base.requireVerification = local.requireVerification;
    base.verificationToken = local.verificationToken ?? '';
    base.nfcLastRegisteredAt = local.nfcLastRegisteredAt;
  }
  if (remote) {
    base.requireVerification = remote.requireVerification;
    base.verificationToken = remote.verificationToken ?? '';
    base.nfcLastRegisteredAt = remote.nfcLastRegisteredAt ?? base.nfcLastRegisteredAt;
  }
  return base;
}

export async function loadPresenceVerificationFromSupabase(): Promise<PresenceVerificationConfig | null> {
  if (!supabase) return null;
  if (import.meta.env.VITE_FEATURE_FLAGS_STORAGE_ENABLED === 'false') return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error || !data) return null;
    const text = await data.text();
    if (!text) return null;
    return parsePresenceVerificationFile(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

export async function savePresenceVerificationToSupabase(data: PresenceVerificationConfig): Promise<void> {
  if (!supabase) throw new Error('Supabase non configurato');
  const blob = new Blob([JSON.stringify(data, null, 0)], { type: 'application/json' });
  const { error } = await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '3600',
  });
  if (error) {
    throw new Error(error.message || 'Upload presence_verification.json fallito.');
  }
}
