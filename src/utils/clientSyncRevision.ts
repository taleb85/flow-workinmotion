import { supabase } from '../lib/supabase';
import { isAppCloudSyncEnabled } from './appCloudSync';

const BUCKET = 'app-config';
const FILE_PATH = 'client_sync_revision.json';
const LS_ACK_KEY = 'osteria_client_sync_rev_ack';

export interface ClientSyncRevisionFile {
  revision: number;
  updated_at?: string;
}

export function getAckClientSyncRevision(): number {
  try {
    const raw = localStorage.getItem(LS_ACK_KEY);
    if (raw == null || raw === '') return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function writeAckClientSyncRevision(revision: number): void {
  try {
    localStorage.setItem(LS_ACK_KEY, String(Math.max(0, Math.floor(revision))));
  } catch {
    /* ignore */
  }
}

/**
 * Legge la revisione globale da Storage (allineamento multi-dispositivo dopo modifiche admin critiche).
 * `null` = file assente o errore (nessun lock lato client).
 */
export async function fetchClientSyncRevisionFromSupabase(): Promise<number | null> {
  if (!supabase || !isAppCloudSyncEnabled()) return null;
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(FILE_PATH);
    if (error || !data) {
      if (import.meta.env.DEV && error && error.message && !String(error.message).includes('404')) {
        console.warn('[clientSyncRevision] download', FILE_PATH, error.message);
      }
      return null;
    }
    const text = await data.text();
    const parsed = JSON.parse(text) as ClientSyncRevisionFile;
    const r = parsed?.revision;
    if (typeof r !== 'number' || !Number.isFinite(r) || r < 0) return null;
    return Math.floor(r);
  } catch {
    return null;
  }
}

/** Incrementa la revisione su Storage (dopo salvataggio permessi / profilo critico). */
export async function bumpClientSyncRevisionOnSupabase(): Promise<number | null> {
  if (!supabase || !isAppCloudSyncEnabled()) return null;
  try {
    const current = (await fetchClientSyncRevisionFromSupabase()) ?? 0;
    const next = current + 1;
    const body: ClientSyncRevisionFile = { revision: next, updated_at: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    const { error } = await supabase.storage.from(BUCKET).upload(FILE_PATH, blob, {
      upsert: true,
      contentType: 'application/json',
    });
    if (error) {
      console.warn('[clientSyncRevision] upload fallito (policy Storage o bucket):', error.message);
      return null;
    }
    return next;
  } catch {
    return null;
  }
}
