/**
 * WebAuthn (passkey piattaforma): sblocco PIN, login senza digitare PIN (stesso storage),
 * e registrazione dopo primo login con PIN sul dispositivo.
 * La credenziale resta sul client; nessun server verifica la firma (stesso modello di rischio del PIN-only).
 */

const STORAGE_KEY = 'osteria_pin_unlock_webauthn_v1';

type StoredEntry = { credentialIdB64: string; rpId: string };

function readStore(): Record<string, StoredEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, StoredEntry>;
    return p && typeof p === 'object' ? p : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, StoredEntry>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Copia in Uint8Array "stretto" per compatibilità TypeScript / BufferSource (WebAuthn). */
function toBufferSource(arr: Uint8Array): BufferSource {
  return new Uint8Array(arr);
}

/** User handle WebAuthn: max 64 byte (UTF-8). */
function userHandleFromId(userId: string): Uint8Array {
  const enc = new TextEncoder().encode(userId);
  return enc.length <= 64 ? enc : enc.slice(0, 64);
}

export function supportsPinUnlockWebAuthn(): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext) return false;
  const c = navigator.credentials;
  return !!(
    window.PublicKeyCredential &&
    typeof c?.create === 'function' &&
    typeof c?.get === 'function'
  );
}

/**
 * Controlla (in modo asincrono) se il dispositivo ha un autenticatore biometrico integrato
 * (Face ID, Touch ID, Windows Hello). Su desktop senza biometria restituisce false.
 * Usare questo prima di mostrare il pulsante Face ID / Touch ID.
 */
export async function hasPlatformBiometricAuthenticator(): Promise<boolean> {
  if (!supportsPinUnlockWebAuthn()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** True se esiste una credenziale salvata per questo utente su questo host (rpId). */
export function hasPinUnlockCredential(userId: string): boolean {
  if (typeof window === 'undefined') return false;
  const entry = readStore()[userId];
  if (!entry?.credentialIdB64) return false;
  return entry.rpId === window.location.hostname;
}

export async function registerPinUnlockCredential(
  userId: string,
  displayName: string,
  email: string
): Promise<boolean> {
  if (!supportsPinUnlockWebAuthn()) return false;

  const rpId = window.location.hostname;
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: toBufferSource(challenge),
      rp: { id: rpId, name: 'FLOW' },
      user: {
        id: toBufferSource(userHandleFromId(userId)),
        name: email,
        displayName: displayName.slice(0, 64),
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;

  if (!cred?.rawId?.byteLength) return false;

  const store = readStore();
  store[userId] = {
    credentialIdB64: bytesToB64(cred.rawId),
    rpId,
  };
  writeStore(store);
  return true;
}

export async function authenticatePinUnlockCredential(userId: string): Promise<boolean> {
  if (!supportsPinUnlockWebAuthn()) return false;

  const entry = readStore()[userId];
  if (!entry?.credentialIdB64 || entry.rpId !== window.location.hostname) return false;

  let credId: Uint8Array;
  try {
    credId = b64ToBytes(entry.credentialIdB64);
  } catch {
    return false;
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: toBufferSource(challenge),
      allowCredentials: [{ id: toBufferSource(credId), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;

  return !!assertion?.rawId?.byteLength;
}

/** Credenziali salvate per l'host corrente (login / sblocco PIN condividono lo stesso storage). */
export function listCredentialsForCurrentRp(): { userId: string; credentialIdB64: string }[] {
  if (typeof window === 'undefined') return [];
  const host = window.location.hostname;
  const store = readStore();
  return Object.entries(store)
    .filter(([, e]) => e?.credentialIdB64 && e.rpId === host)
    .map(([userId, e]) => ({ userId, credentialIdB64: e.credentialIdB64 }));
}

export function hasAnyPinUnlockCredentialOnDevice(): boolean {
  return listCredentialsForCurrentRp().length > 0;
}

/**
 * WebAuthn con tutte le passkey note per questo dominio; restituisce l'userId associato alla credenziale usata.
 * Utile per la schermata di login senza digitare email/PIN.
 */
export async function authenticatePinUnlockAndResolveUserId(): Promise<string | null> {
  if (!supportsPinUnlockWebAuthn()) return null;
  const list = listCredentialsForCurrentRp();
  if (list.length === 0) return null;

  const allowCredentials = list
    .map((l) => {
      try {
        return { id: toBufferSource(b64ToBytes(l.credentialIdB64)), type: 'public-key' as const };
      } catch {
        return null;
      }
    })
    .filter((x): x is { id: BufferSource; type: 'public-key' } => x !== null);

  if (allowCredentials.length === 0) return null;

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  let assertion: PublicKeyCredential | null;
  try {
    assertion = (await navigator.credentials.get({
      publicKey: {
        challenge: toBufferSource(challenge),
        allowCredentials,
        userVerification: 'required',
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;
  } catch {
    return null;
  }

  if (!assertion?.rawId?.byteLength) return null;
  const raw = new Uint8Array(assertion.rawId);

  for (const { userId, credentialIdB64 } of list) {
    try {
      const stored = b64ToBytes(credentialIdB64);
      if (raw.byteLength !== stored.byteLength) continue;
      let match = true;
      for (let i = 0; i < raw.byteLength; i++) {
        if (raw[i] !== stored[i]) {
          match = false;
          break;
        }
      }
      if (match) return userId;
    } catch {
      /* skip */
    }
  }
  return null;
}
