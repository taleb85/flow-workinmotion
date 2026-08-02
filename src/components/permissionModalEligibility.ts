/**
 * Stato e check per il modal permessi (gate bloccante) — separato dal componente
 * per soddisfare react-refresh/only-export-components.
 *
 * Il modal viene mostrato OGNI volta che manca almeno un permesso necessario
 * (notifiche e/o posizione): finché non vengono concessi, l'app non prosegue.
 */
const STORAGE_KEY = 'app:permissions_requested';
const LOC_STORAGE_KEY = 'app:location_granted';

export function alreadyAskedForPermissionModal(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPermissionModalAsked(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * Flag persistente: true se la posizione è stata concessa con successo
 * almeno una volta su questo dispositivo. Su iOS Safari il Permissions API
 * può restare su "prompt" anche a permesso concesso → il flag è la fonte
 * affidabile per non riproporre la richiesta all'infinito.
 */
export function isLocationGrantedFlag(): boolean {
  try {
    return localStorage.getItem(LOC_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Registra che la posizione è stata concessa (per le sessioni future). */
export function markLocationGranted(): void {
  try {
    localStorage.setItem(LOC_STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}

/**
 * Ritorna true se il modal va mostrato: manca almeno uno dei permessi necessari.
 * I permessi non supportati dal browser NON bloccano l'avvio.
 */
export async function shouldShowPermissionModal(): Promise<boolean> {
  // Notifiche: richieste solo se supportate
  const notifMissing = 'Notification' in window && Notification.permission !== 'granted';
  // Posizione: richiesta solo se supportata — considerata concessa se il
  // flag locale è impostato O se il Permissions API dice "granted".
  let locMissing = !isLocationGrantedFlag();
  if (locMissing) {
    try {
      if (navigator.permissions) {
        const r = await navigator.permissions.query({ name: 'geolocation' });
        if (r.state === 'granted') {
          markLocationGranted();
          locMissing = false;
        }
      }
    } catch {
      /* keep flag-based */
    }
  }
  return notifMissing || locMissing;
}
