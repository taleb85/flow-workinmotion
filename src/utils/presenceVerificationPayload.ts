import type { PresenceVerificationConfig } from './presenceVerificationConfigStorage';

const PREFIX = 'ob-punch-v1:';

/** Chiave ristorante da `.env` (VITE_OSTERIA_BASILICO_AUTH_KEY). */
export function readOsteriaAuthKeyFromEnv(): string {
  const k = import.meta.env.VITE_OSTERIA_BASILICO_AUTH_KEY;
  return typeof k === 'string' ? k.trim() : '';
}

/** Payload canonico salvato su QR/NFC quando si usa solo la chiave .env. */
export function buildVerificationPayloadFromAuthKey(secret: string): string {
  const s = secret.trim();
  return s ? `${PREFIX}${s}` : '';
}

/**
 * Token effettivo per validazione: priorità valore su cloud/disk, altrimenti derivato da env.
 */
export function resolveEffectiveVerificationToken(disk: PresenceVerificationConfig | null): string {
  const fromDisk = disk?.verificationToken?.trim() ?? '';
  if (fromDisk) return fromDisk;
  const envKey = readOsteriaAuthKeyFromEnv();
  if (envKey) return buildVerificationPayloadFromAuthKey(envKey);
  return '';
}

export function normalizePresenceProof(raw: string): string {
  return raw.replace(/\s+/g, '').trim();
}

/** Genera un token casuale persistente (se mancano env e cloud). */
export function generateRandomVerificationToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${PREFIX}${crypto.randomUUID()}`;
  }
  return `${PREFIX}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
