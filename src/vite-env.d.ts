/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Se "true", utenti loggati possono usare l'app nel browser senza PWA installata (solo build con questo env). */
  readonly VITE_ALLOW_BROWSER_APP?: string;
  /** Se "false", disattiva pull/push Storage config, revisione client e segnale Realtime impostazioni (DB/turni restano attivi). */
  readonly VITE_APP_CLOUD_SYNC?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;

declare module 'virtual:pwa-register' {
  export function registerSW(options?: {
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegisteredSW?: (swScriptUrl: string, registration: ServiceWorkerRegistration | undefined) => void;
  }): (reloadPage?: boolean) => Promise<void>;
}
