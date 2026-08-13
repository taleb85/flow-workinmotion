/*
  Shift audit log — tracciabilità di conferme e modifiche ai turni.

  Registra per ogni evento: chi ha eseguito l'azione (actor), quale turno,
  quale campo è cambiato (old_value → new_value) e una descrizione leggibile.

  Nota sicurezza: l'app usa chiave anon + PIN (nessun Supabase Auth),
  quindi le policy seguono il pattern permissivo delle altre tabelle operative
  (punch_audit_log). La visibilità è riservata all'admin a livello app
  (isAdminOnly), come già avviene per backup/ripristino/eliminazione dipendenti.
*/

-- ─── Tabella ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.shift_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  shift_id      TEXT,
  actor_user_id TEXT,
  actor_name    TEXT,
  action        TEXT NOT NULL,
  field         TEXT,
  old_value     TEXT,
  new_value     TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_audit_log_created_at_idx ON public.shift_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS shift_audit_log_shift_id_idx ON public.shift_audit_log (shift_id);

-- ─── RLS: stessa policy permissiva delle altre tabelle ─────────────────────
ALTER TABLE public.shift_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_shift_audit_log" ON public.shift_audit_log;
CREATE POLICY "anon_all_shift_audit_log"
  ON public.shift_audit_log FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
