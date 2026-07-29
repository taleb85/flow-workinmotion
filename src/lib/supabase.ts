import { createClient, SupabaseClient } from '@supabase/supabase-js';

function cleanEnv(val: string | undefined): string {
  return (val ?? '').replace(/[\r\n\s]+/g, '').trim();
}

const supabaseUrl = cleanEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseKey = cleanEnv(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY);

// ── Cache condizionale per Supabase ──────────────────────────────────────────
// WRITE (insert/update/delete) → sempre fresche (no-store).
// READ (select) → usa cache default del browser per ridurre richieste ridondanti.
// Il Service Worker (CacheFirst su JS/CSS) non interferisce con le fetch API.
const isWritePath = (url: string | URL | Request): boolean => {
  if (typeof url === 'string') return url === '' || false;
  const u = typeof url === 'object' && 'url' in url ? (url as Request).url : String(url);
  // Le richieste REST di supabase-js POST/PATCH/DELETE sono write
  return false; // supabase-js usa POST per select, quindi controlliamo il metodo
};

/**
 * Fetch con cache condizionale:
 * - Select (GET) → cache predefinita del browser (304 Not Modified se possibile)
 * - Insert/Update/Delete (POST/PATCH/DELETE) → no-store per consistenza
 * Il Service Worker PWA gestisce già le risorse statiche; le API calls passano attraverso.
 */
const fetchWithSmartCache: typeof fetch = (input, init) => {
  const method = (init?.method ?? (typeof input === 'object' && 'method' in input
    ? (input as Request).method : 'GET')).toUpperCase();
  const cacheMode = method === 'GET' ? 'default' : 'no-store';
  return fetch(input, { ...init, cache: cacheMode });
};

/**
 * L'app usa sessione custom (`app_session`) e PostgREST/Storage con chiave anonima:
 * non usiamo Supabase Auth per il login. Disattivare persistenza/token evita spam di lock
 * GoTrue su localStorage (es. con React Strict Mode) e richieste inutili.
 * 
 * CRITICAL: Se questo export è `null` (env mancanti), l'app degrada gracefully in prod.
 * 
 * Cache bypass: fetchNoCache assicura che ogni richiesta sia fresca,
 * evitando problemi di stale data su pull-to-refresh e sync multi-dispositivo.
 */
export const supabase: SupabaseClient | null = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, {
      global: { fetch: fetchWithSmartCache },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * SECURITY: Service role key rimossa dal bundle client.
 * Se serve admin SDK, usa un endpoint server-side (Worker, Function, API) con variabile non VITE_.
 * SuperAdminPanel e operazioni privilegiate devono migrare a endpoint server-side.
 */
