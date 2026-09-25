/**
 * Cache persistente (`localStorage`) della prova di presenza (QR) già letta con successo.
 *
 * Scopo: la timbratura non deve riaprire la fotocamera — e quindi richiedere di
 * nuovo l'accesso — a ogni entrata/uscita. La prova viene memorizzata e
 * riutilizzata per le timbrature successive dello stesso utente, finché il QR
 * firmato non scade (o fino al tetto di riutilizzo).
 *
 * La prova in cache viene comunque rivalidata prima dell'uso (vedi
 * `verifyPresenceProofScanned`): se token, sede o scadenza cambiano, la
 * fotocamera viene richiesta di nuovo automaticamente.
 */
const STORAGE_KEY = 'osteria_presence_proof_cache_v1';

/** Tetto massimo di riutilizzo, anche quando il QR firmato durasse di più. */
export const PRESENCE_PROOF_MAX_REUSE_MS = 12 * 60 * 60 * 1000;

export interface PresenceProofCacheScope {
  /** Dipendente che sta timbrando: evita riusi tra utenti diversi sullo stesso dispositivo. */
  userId: string;
  /** Token di verifica effettivo: se cambia, la cache precedente non è più valida. */
  token: string;
  /** Slug della sede (tenant). */
  tenantSlug: string;
}

interface CacheEntry {
  proof: string;
  savedAt: number;
}

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function entryKey(scope: PresenceProofCacheScope): string {
  return `${scope.userId}|${scope.token}|${scope.tenantSlug || 'default'}`;
}

function readAll(storage: Storage): Record<string, CacheEntry> {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function persist(storage: Storage, all: Record<string, CacheEntry>): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore quota/storage errors */
  }
}

/** Restituisce la prova in cache per lo scope indicato, oppure null se assente/scaduta. */
export function readCachedPresenceProof(scope: PresenceProofCacheScope): string | null {
  const storage = getStorage();
  if (!storage) return null;
  const key = entryKey(scope);
  const all = readAll(storage);
  const entry = all[key];
  if (!entry || typeof entry.proof !== 'string' || !entry.proof) return null;
  if (typeof entry.savedAt !== 'number' || Date.now() - entry.savedAt > PRESENCE_PROOF_MAX_REUSE_MS) {
    delete all[key];
    persist(storage, all);
    return null;
  }
  return entry.proof;
}

/** Memorizza la prova appena letta, per riutilizzarla nelle timbrature successive. */
export function writeCachedPresenceProof(scope: PresenceProofCacheScope, proof: string): void {
  const storage = getStorage();
  if (!storage) return;
  const trimmed = proof.trim();
  if (!trimmed) return;
  const all = readAll(storage);
  all[entryKey(scope)] = { proof: trimmed, savedAt: Date.now() };
  persist(storage, all);
}

/** Rimuove la prova in cache per lo scope indicato (es. se la validazione fallisce). */
export function clearCachedPresenceProof(scope: PresenceProofCacheScope): void {
  const storage = getStorage();
  if (!storage) return;
  const all = readAll(storage);
  const key = entryKey(scope);
  if (key in all) {
    delete all[key];
    persist(storage, all);
  }
}

/** Svuota completamente la cache (es. al logout). */
export function clearAllCachedPresenceProofs(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
