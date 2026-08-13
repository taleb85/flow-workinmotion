import { database } from '../lib/database';

export interface ShiftAuditLogInput {
  /** ID del turno interessato (null per operazioni bulk). */
  shiftId?: string | null;
  /** Tipo di azione: create | update | shift_edit | delete | bulk_delete | publish | bulk_approve */
  action: string;
  /** Descrizione leggibile dell'evento. */
  description: string;
  /** Campo modificato (es. start_time, approval_status, punch_confirm). */
  field?: string | null;
  /** Valore precedente. */
  oldValue?: string | null;
  /** Nuovo valore. */
  newValue?: string | null;
  /** ID dell'utente che ha eseguito l'azione. */
  actorUserId?: string | null;
  /** Nome visualizzato di chi ha eseguito l'azione. */
  actorName?: string | null;
}

/**
 * Converte una data ISO (yyyy-MM-dd) nel formato italiano giorno/mese/anno
 * (es. 2026-08-10 → 10/08/2026). Se la stringa non è una data ISO, la lascia invariata.
 */
export function formatAuditDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Registra un evento di audit sul server (non bloccante).
 * Restituisce la promise della scrittura per chi vuole attendere
 * (es. prima di aggiornare l'UI) — i chiamanti fire-and-forget usano `void`.
 * La visibilità dello storico è riservata all'admin a livello UI.
 */
export function logShiftAudit(opts: ShiftAuditLogInput): Promise<void> | void {
  try {
    return database.auditLog
      .insert({
        shift_id: opts.shiftId ?? null,
        actor_user_id: opts.actorUserId ?? null,
        actor_name: opts.actorName ?? 'Sistema',
        action: opts.action,
        field: opts.field ?? null,
        old_value: opts.oldValue ?? null,
        new_value: opts.newValue ?? null,
        description: opts.description,
      })
      .then(() => undefined);
  } catch {
    /* non bloccante */
  }
}
