-- Registro dispositivi per utente (riconoscimento dispositivo).
--
-- Privacy (GDPR/CCPA): `device_id` è un identificativo casuale opaco generato dal client
-- (128 bit), NON derivato da impronte hardware/software e non riconducibile all'utente.
-- Viene associato all'utente solo per consentire il riconoscimento tra riavvii/aggiornamenti
-- e la revoca (utente o admin). `label`/`platform` contengono solo famiglia browser e OS.
--
-- Da applicare via Supabase SQL Editor / pipeline migrazioni.

CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id UUID,
  device_id TEXT NOT NULL,
  platform TEXT,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  CONSTRAINT user_devices_user_device_unique UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS user_devices_user_idx ON public.user_devices(user_id);
CREATE INDEX IF NOT EXISTS user_devices_device_idx ON public.user_devices(device_id);

COMMENT ON TABLE public.user_devices IS
  'Dispositivi associati a un utente (ID opaco casuale). Consentono riconoscimento e revoca.';

ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;

-- L'app usa chiave anon + PIN: policy permissive TO anon, coerenti con le altre tabelle operative.
DROP POLICY IF EXISTS "Anon can select user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "Anon can insert user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "Anon can update user_devices" ON public.user_devices;
DROP POLICY IF EXISTS "Anon can delete user_devices" ON public.user_devices;

CREATE POLICY "Anon can select user_devices"
  ON public.user_devices FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert user_devices"
  ON public.user_devices FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update user_devices"
  ON public.user_devices FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete user_devices"
  ON public.user_devices FOR DELETE TO anon USING (true);
