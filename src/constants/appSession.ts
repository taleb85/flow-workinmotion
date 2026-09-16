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
