/**
 * Identificativo univoco del dispositivo.
 *
 * Privacy (GDPR/CCPA): l'ID è un valore casuale opaco (128 bit) generato dal browser,
 * NON deriva da impronte hardware/software e non è riconducibile all'utente senza il
 * record `user_devices` sul server. Serve solo a riconoscere il dispositivo tra
 * riavvii/aggiornamenti e a permetterne la revoca da parte dell'utente.
 */

const DEVICE_ID_STORAGE_KEY = 'flow_device_id_v1';

export type DevicePlatform = 'ios' | 'android' | 'web';

function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/** ID dispositivo corrente salvato in localStorage, `null` se assente/non disponibile. */
export function getDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    return raw && /^[a-f0-9]{32}$/.test(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** ID dispositivo corrente, generandolo al primo accesso. `null` se lo storage non è disponibile. */
export function getOrCreateDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  const existing = getDeviceId();
  if (existing) return existing;
  try {
    const created = randomHex(16);
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return null;
  }
}

/** Rimuove l'ID dal dispositivo (l'app tratterà il device come nuovo). */
export function clearDeviceIdentity(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(DEVICE_ID_STORAGE_KEY);
  } catch {
    /* storage non disponibile */
  }
}

export function getDevicePlatform(): DevicePlatform {
  if (typeof navigator === 'undefined') return 'web';
  const ua = navigator.userAgent;
  // iPad su iPadOS 13+ si presenta come Mac con touch: il controllo touch distingue.
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}

/** Etichetta leggibile e non identificativa (solo famiglia browser + modalità app installata). */
export function getDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo';
  const ua = navigator.userAgent;
  const browser = /EdgiOS|Edg\//i.test(ua)
    ? 'Edge'
    : /CriOS|Chrome\//i.test(ua)
      ? 'Chrome'
      : /FxiOS|Firefox\//i.test(ua)
        ? 'Firefox'
        : 'Safari';
  const standalone =
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const platformLabel = getDevicePlatform() === 'ios' ? 'iOS' : getDevicePlatform() === 'android' ? 'Android' : 'Web';
  return `${platformLabel} · ${browser}${standalone ? ' · App' : ''}`;
}
