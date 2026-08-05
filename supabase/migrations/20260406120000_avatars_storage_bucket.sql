-- Bucket pubblico per le foto profilo dei dipendenti
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,           -- lettura pubblica (URL stabile per push notification e UI)
  512000,         -- max 500 KB per file
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public            = EXCLUDED.public,
      file_size_limit   = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Chiunque può leggere (le foto profilo sono semi-pubbliche nell'app)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'avatars_public_read' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "avatars_public_read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');
  END IF;
END $$;

-- Ogni utente autenticato può caricare solo nella propria cartella (user_id/*)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'avatars_owner_insert' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "avatars_owner_insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- Può aggiornare solo i propri file
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'avatars_owner_update' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "avatars_owner_update"
      ON storage.objects FOR UPDATE
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- Può eliminare solo i propri file
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'avatars_owner_delete' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "avatars_owner_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;

-- Il service role può fare tutto (per le Edge Functions e admin)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'avatars_service_all' AND tablename = 'objects' AND schemaname = 'storage') THEN
    CREATE POLICY "avatars_service_all"
      ON storage.objects FOR ALL
      TO service_role
      USING (bucket_id = 'avatars');
  END IF;
END $$;
