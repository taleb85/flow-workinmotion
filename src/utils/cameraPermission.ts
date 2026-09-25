/**
 * Autorizzazione alla fotocamera con **memoria persistente**.
 *
 * Obiettivo: la timbratura richiede l'autorizzazione alla fotocamera una sola
 * volta. Una volta concessa, lo stato viene memorizzato (in `localStorage`) e
 * verificato tramite la Permissions API quando disponibile, così l'app non
 * mostra di nuovo la richiesta a ogni scansione.
 *
 * Nota: alcuni browser (es. Safari/iOS in modalità standalone) non supportano
 * `navigator.permissions.query({ name: 'camera' })` e possono riproporre il
 * prompt a ogni nuovo stream. In quel caso la memoria locale evita la richiesta
 * "di pre-verifica" e la prova QR in cache evita del tutto di riaprire la camera.
 */
const GRANT_KEY = 'osteria_camera_permission_granted_v1';

export type CameraPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** True se l'autorizzazione è stata concessa e memorizzata in precedenza. */
export function isCameraGrantRemembered(): boolean {
  const s = storage();
  if (!s) return false;
  try {
    return s.getItem(GRANT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Memorizza il fatto che l'utente ha concesso l'accesso alla fotocamera. */
export function rememberCameraGrant(): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(GRANT_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Dimentica l'autorizzazione memorizzata (es. se l'utente la revoca). */
export function forgetCameraGrant(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(GRANT_KEY);
  } catch {
    /* ignore */
  }
}

/** Stato della fotocamera tramite Permissions API (dove supportata). */
export async function queryCameraPermission(): Promise<CameraPermissionState> {
  try {
    const perms = typeof navigator !== 'undefined' ? navigator.permissions : undefined;
    if (!perms?.query) return 'unsupported';
    const status = await perms.query({ name: 'camera' as PermissionName });
    return status.state as CameraPermissionState;
  } catch {
    // Safari/iOS non supporta la query per 'camera': la trattiamo come non disponibile.
    return 'unsupported';
  }
}

/**
 * True se possiamo usare la fotocamera senza riproporre l'autorizzazione:
 * - permesso già concesso (Permissions API), oppure
 * - autorizzazione memorizzata in precedenza.
 */
export async function isCameraAuthorized(): Promise<boolean> {
  const state = await queryCameraPermission();
  if (state === 'granted') {
    rememberCameraGrant();
    return true;
  }
  if (state === 'denied') return false;
  return isCameraGrantRemembered();
}

/**
 * Richiede (se necessario) l'autorizzazione alla fotocamera e la memorizza.
 * Ritorna `true` se l'accesso è disponibile, `false` se negato o non concedibile.
 */
export async function requestCameraAuthorization(): Promise<boolean> {
  if (await isCameraAuthorized()) return true;
  try {
    const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!devices?.getUserMedia) return false;
    const stream = await devices.getUserMedia({ video: { facingMode: 'environment' } });
    stream.getTracks().forEach((track) => track.stop());
    rememberCameraGrant();
    return true;
  } catch {
    // Permesso negato o fotocamera non disponibile.
    const state = await queryCameraPermission();
    if (state === 'denied') forgetCameraGrant();
    return false;
  }
}
