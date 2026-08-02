/**
 * Stato e check per il modal permessi (gate bloccante) — separato dal componente
 * per soddisfare react-refresh/only-export-components.
 *
 * Il modal viene mostrato OGNI volta che manca almeno un permesso necessario
 * (notifiche e/o posizione): finché non vengono concessi, l'app non prosegue.
 */
const STORAGE_KEY = 'app:permissions_requested';

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
 * Ritorna true se il modal va mostrato: manca almeno uno dei permessi necessari.
 * I permessi non supportati dal browser NON bloccano l'avvio.
 */
export async function shouldShowPermissionModal(): Promise<boolean> {
  // Notifiche: richieste solo se supportate
  const notifMissing = 'Notification' in window && Notification.permission !== 'granted';
  // Posizione: richiesta solo se supportata
  let locMissing = false;
  try {
    if (navigator.permissions) {
      const r = await navigator.permissions.query({ name: 'geolocation' });
      locMissing = r.state !== 'granted';
    }
  } catch {
    /* ignore */
  }
  return notifMissing || locMissing;
}
