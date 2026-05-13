/**
 * Sincronizzazione “config condivisa” (Storage `app-config`, `client_sync_revision.json`,
 * tabella `app_settings_sync_signal`).
 *
 * `VITE_APP_CLOUD_SYNC=false` → niente pull/push automatici di quel layer; restano DB + Realtime su turni/utenti/timbrature/ferie.
 */
export function isAppCloudSyncEnabled(): boolean {
  return import.meta.env.VITE_APP_CLOUD_SYNC !== 'false';
}
