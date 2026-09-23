/**
 * Chiave localStorage per “resta collegato”:
 * `{ userId: string; email?: string; tenantSlug?: string }`.
 * `email` opzionale: dopo merge utenti sul DB il vecchio userId può sparire; il ripristino può usare l’email.
 * `tenantSlug` (Option B single-URL): serve a caricare il tenant prima del ripristino sessione su `/app`.
 */
export const APP_SESSION_STORAGE_KEY = 'app_session';

/** Login: nome precompilato dopo link invito `/i/:slug`. */
export const FLOW_INVITE_NAME_STORAGE_KEY = 'flow-invite-name';

/** Login: PIN precompilato dopo link invito `/i/:slug`. */
export const FLOW_INVITE_PIN_STORAGE_KEY = 'flow-invite-pin';

/**
 * True se all'avvio dell'app esisteva già una sessione salvata: indica una **riapertura**
 * dell'app (PWA chiusa e riaperta), non un login appena effettuato.
 * Usato per il blocco di riapertura (Face ID / impronta / PIN).
 */
export const HAD_SAVED_SESSION_AT_BOOT = (() => {
  try {
    return Boolean(localStorage.getItem(APP_SESSION_STORAGE_KEY));
  } catch {
    return false;
  }
})();

/** Ultimo utilizzo reale dell'app: base di calcolo della finestra di grazia. */
export const APP_LAST_ACTIVITY_STORAGE_KEY = 'app_last_activity_at';

/**
 * Ultimo profilo che ha usato l'app su questo dispositivo.
 * A differenza di `APP_SESSION_STORAGE_KEY` **non** viene cancellato al logout:
 * serve a riproporre sulla schermata di accesso gli stessi colori/sfondo del profilo.
 */
export const LAST_PROFILE_STORAGE_KEY = 'flow_last_profile_id';

export function markLastProfile(userId?: string | null): void {
  if (!userId) return;
  try {
    localStorage.setItem(LAST_PROFILE_STORAGE_KEY, userId);
  } catch {
    /* storage non disponibile */
  }
}

export function readLastProfileId(): string | null {
  try {
    return localStorage.getItem(LAST_PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Finestra di grazia dello sblocco alla riapertura: entro questo intervallo l'app non
 * richiede Face ID/PIN. Da tarare qui se serve una soglia diversa.
 */
export const APP_UNLOCK_GRACE_MS = 5 * 60 * 1000;

/** Memorizza l'ultimo utilizzo (app in background o chiusa): usato alla riapertura. */
export function markAppSessionActive(): void {
  try {
    localStorage.setItem(APP_LAST_ACTIVITY_STORAGE_KEY, String(Date.now()));
  } catch {
    /* storage non disponibile: lo sblocco resterà richiesto a ogni riapertura */
  }
}

/** True se l'ultimo utilizzo è più recente della finestra di grazia. */
export function isAppSessionWithinGrace(): boolean {
  try {
    const raw = localStorage.getItem(APP_LAST_ACTIVITY_STORAGE_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < APP_UNLOCK_GRACE_MS;
  } catch {
    return false;
  }
}
