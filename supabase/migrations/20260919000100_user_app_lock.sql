-- Blocco di sblocco app basato sul PIN DEL PROFILO (users.pin).
--
-- Il PIN di sblocco è lo stesso associato al profilo: nessun PIN dedicato e nessuna
-- copia del PIN. La verifica e il blocco dopo 5 tentativi falliti (15 minuti) sono
-- applicati lato server, quindi non bypassabili cancellando lo storage del browser.
--
-- La tabella contiene solo lo stato del lockout (nessuna credenziale).
-- Recupero: un nuovo login completo (nome + PIN del profilo) azzera il lockout;
--         l'amministratore può azzerarlo con app_lock_reset.
--
-- Da applicare via Supabase SQL Editor / pipeline migrazioni.

CREATE TABLE IF NOT EXISTS public.user_app_lock (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compatibilità con la prima versione della tabella (PIN dedicato hashato): ora non serve.
ALTER TABLE public.user_app_lock DROP COLUMN IF EXISTS pin_hash;
ALTER TABLE public.user_app_lock DROP COLUMN IF EXISTS recovery_code_hash;
ALTER TABLE public.user_app_lock DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE public.user_app_lock DROP COLUMN IF EXISTS created_at;

COMMENT ON TABLE public.user_app_lock IS
  'Stato lockout dello sblocco app (nessuna credenziale): verifica su users.pin via RPC.';

-- RLS attiva senza policy: accesso diretto negato (deny-all). Le RPC bypassano RLS.
ALTER TABLE public.user_app_lock ENABLE ROW LEVEL SECURITY;

-- Stato del lockout per l'utente.
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
      'ok', true, 'locked', false, 'locked_until', NULL, 'failed_attempts', 0, 'max_attempts', 5
    );
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'locked', (r.locked_until IS NOT NULL AND r.locked_until > now()),
    'locked_until', r.locked_until,
    'failed_attempts', r.failed_attempts,
    'max_attempts', 5
  );
END;
$$;

-- Verifica il PIN del profilo con lockout: 5 tentativi falliti → blocco 15 minuti.
CREATE OR REPLACE FUNCTION public.app_lock_verify(p_user_id UUID, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  r public.user_app_lock;
  v_pin TEXT;
  v_attempts INTEGER;
  v_locked TIMESTAMPTZ;
BEGIN
  SELECT pin INTO v_pin
    FROM public.users
    WHERE id = p_user_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO r FROM public.user_app_lock WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_app_lock (user_id) VALUES (p_user_id)
      ON CONFLICT (user_id) DO NOTHING;
    r.failed_attempts := 0;
    r.locked_until := NULL;
  END IF;

  IF r.locked_until IS NOT NULL AND r.locked_until > now() THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'locked', 'locked_until', r.locked_until, 'max_attempts', 5
    );
  END IF;

  IF p_pin IS NOT NULL AND v_pin IS NOT NULL AND btrim(v_pin) = btrim(p_pin) THEN
    UPDATE public.user_app_lock
      SET failed_attempts = 0, locked_until = NULL, updated_at = now()
      WHERE user_id = p_user_id;
    RETURN jsonb_build_object('ok', true);
  END IF;

  v_attempts := COALESCE(r.failed_attempts, 0) + 1;
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

-- Azzera il lockout (recupero dopo login completo o intervento amministrativo).
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
GRANT EXECUTE ON FUNCTION public.app_lock_verify(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.app_lock_reset(UUID) TO anon;
