-- Aggiunge la tabella alla publication Realtime solo se manca (idempotente).
-- Utile se una migrazione precedente ha creato la tabella ma `ALTER PUBLICATION` è fallito o è stato saltato.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'app_settings_sync_signal'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'app_settings_sync_signal'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings_sync_signal;
  END IF;
END $$;
