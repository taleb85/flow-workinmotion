-- Segnale Realtime per propagare subito il pull del bundle impostazioni (config/settings_bundle.json) a tutti i client.
-- La riga id=1 viene aggiornata da bumpAppSettingsSyncSignal() dopo push del bundle.

CREATE TABLE IF NOT EXISTS public.app_settings_sync_signal (
  id smallint PRIMARY KEY DEFAULT 1,
  CONSTRAINT app_settings_sync_signal_single_row CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings_sync_signal (id, revision) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings_sync_signal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "app_settings_sync_signal_select_all"
  ON public.app_settings_sync_signal FOR SELECT
  USING (true);

CREATE POLICY "app_settings_sync_signal_insert_all"
  ON public.app_settings_sync_signal FOR INSERT
  WITH CHECK (true);

CREATE POLICY "app_settings_sync_signal_update_all"
  ON public.app_settings_sync_signal FOR UPDATE
  USING (true);

-- Realtime: consente subscribe postgres_changes su questa tabella (Supabase Dashboard → Realtime già attivo sul progetto).
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings_sync_signal;
