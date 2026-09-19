-- PIN di sblocco app (dedicato, distinto dal PIN di login).
--
-- Sicurezza:
--  - il PIN NON è mai salvato in chiaro: hash bcrypt (pgcrypto) con salt per-riga;
--  - il codice di recupero è salvato solo come hash bcrypt;
--  - blocco dopo 5 tentativi falliti (15 minuti), applicato lato server;
--  - la tabella ha RLS attiva SENZA policy: leggibile/scrivibile solo dalle funzioni RPC
--    SECURITY DEFINER qui sotto, quindi l'hash non è esposto via PostgREST con la chiave anon.
--
-- Da applicare via Supabase SQL Editor / pipeline migrazioni.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_app_lock (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  tenant_id UUID,
  pin_hash TEXT NOT NULL,
  recovery_code_hash TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.user_app_lock IS
  'PIN di sblocco app per utente (hash bcrypt + lockout). Accessibile solo via RPC.';

-- RLS attiva senza policy: accesso diretto negato (deny-all). Le RPC bypassano RLS.
ALTER TABLE public.user_app_lock ENABLE ROW LEVEL SECURITY;

-- Normalizzazione codice di recupero: solo caratteri alfanumerici, maiuscolo.
CREATE OR REPLACE FUNCTION public.app_lock_normalize_code(p_code TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT upper(regexp_replace(coalesce(p_code, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;

-- Stato del PIN di sblocco per l'utente.
CREATE OR REPLACE FUNCTION public.app_lock_status(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r public.user_app_lock;
BEGIN
  SELECT * INTO r FROM public.user_app_lock WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'configured', false, 'locked', false,
      'locked_until', NULL, 'failed_attempts', 0, 'max_attempts', 5
    );
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'configured', true,
    'locked', (r.locked_until IS NOT NULL AND r.locked_until > now()),
    'locked_until', r.locked_until,
    'failed_attempts', r.failed_attempts,
    'max_attempts', 5
  );
END;
$$;

-- Imposta/aggiorna PIN di sblocco. Ritorna il codice di recupero in chiaro UNA sola volta.
CREATE OR REPLACE FUNCTION public.app_lock_set_pin(
  p_user_id UUID,
  p_pin TEXT,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_pin');
  END IF;

  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 12));
  v_code := substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);

  INSERT INTO public.user_app_lock (
    user_id, tenant_id, pin_hash, recovery_code_hash, failed_attempts, locked_until, updated_at
  ) VALUES (
    p_user_id, p_tenant_id,
    crypt(p_pin, gen_salt('bf', 10)),
    crypt(app_lock_normalize_code(v_code), gen_salt('bf', 10)),
    0, NULL, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tenant_id = COALESCE(EXCLUDED.tenant_id, public.user_app_lock.tenant_id),
    pin_hash = EXCLUDED.pin_hash,
    recovery_code_hash = EXCLUDED.recovery_code_hash,
    failed_attempts = 0,
    locked_until = NULL,
    updated_at = now();

  RETURN jsonb_build_object('ok', true, 'recovery_code', v_code);
END;
$$;

-- Verifica il PIN con lockout: 5 tentativi falliti → blocco 15 minuti.
CREATE OR REPLACE FUNCTION public.app_lock_verify_pin(p_user_id UUID, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r public.user_app_lock;
  v_attempts INTEGER;
  v_locked TIMESTAMPTZ;
BEGIN
  SELECT * INTO r FROM public.user_app_lock WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_configured');
  END IF;

  IF r.locked_until IS NOT NULL AND r.locked_until > now() THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked', 'locked_until', r.locked_until, 'max_attempts', 5
    );
  END IF;

  IF p_pin IS NOT NULL AND r.pin_hash = crypt(p_pin, r.pin_hash) THEN
    UPDATE public.user_app_lock
      SET failed_attempts = 0, locked_until = NULL, updated_at = now()
      WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  v_attempts := r.failed_attempts + 1;
  IF v_attempts >= 5 THEN
    v_locked := now() + interval '15 minutes';
    UPDATE public.user_app_lock
      SET failed_attempts = 0, locked_until = v_locked, updated_at = now()
      WHERE user_id = p_user_id;
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked', 'locked_until', v_locked, 'max_attempts', 5
    );
  END IF;

  UPDATE public.user_app_lock
    SET failed_attempts = v_attempts, updated_at = now()
    WHERE user_id = p_user_id;
  RETURN jsonb_build_object(
    'ok', false, 'reason', 'wrong_pin', 'remaining_attempts', 5 - v_attempts, 'max_attempts', 5
  );
END;
$$;

-- Recupero account: codice di recupero valido → nuovo PIN + nuovo codice di recupero.
CREATE OR REPLACE FUNCTION public.app_lock_recover(
  p_user_id UUID,
  p_recovery_code TEXT,
  p_new_pin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r public.user_app_lock;
  v_code TEXT;
BEGIN
  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_pin');
  END IF;

  SELECT * INTO r FROM public.user_app_lock WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_configured');
  END IF;

  v_code := app_lock_normalize_code(p_recovery_code);
  IF v_code = '' OR r.recovery_code_hash <> crypt(v_code, r.recovery_code_hash) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_code');
  END IF;

  RETURN app_lock_set_pin(p_user_id, p_new_pin, r.tenant_id);
END;
$$;

-- Rimozione PIN di sblocco (recupero amministrativo / disattivazione).
CREATE OR REPLACE FUNCTION public.app_lock_reset(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM public.user_app_lock WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.app_lock_status(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.app_lock_set_pin(UUID, TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.app_lock_verify_pin(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_lock_recover(UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_lock_reset(UUID) TO anon;
