-- Disabilita notifiche push per turni in stato bozza (draft).
-- Le notifiche devono partire solo dalla pubblicazione in poi (confirmed/approved).
-- Fix: DELETE e UPDATE su turni draft non inviano più push.

CREATE OR REPLACE FUNCTION public.notify_push_on_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _base   text;
  _url    text;
  _body   text;
  _rec    uuid;
  _start  text;
  _end    text;
  _range  text;
BEGIN
  _base := rtrim(coalesce(nullif(current_setting('app.supabase_url', true), ''), ''), '/');
  IF _base = '' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  _url := _base || '/functions/v1/send-push-notification';

  IF TG_OP = 'DELETE' THEN
    -- Ignora eliminazione turni in bozza
    IF OLD.approval_status = 'draft' THEN
      RETURN OLD;
    END IF;
    _rec := OLD.user_id;
    _body := format(
      'Il tuo turno del %s è stato annullato',
      to_char(OLD.date, 'DD/MM/YYYY')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Ignora modifiche a turni ancora in bozza
    IF NEW.approval_status = 'draft' THEN
      RETURN NEW;
    END IF;
    IF OLD.date IS NOT DISTINCT FROM NEW.date
       AND OLD.start_time IS NOT DISTINCT FROM NEW.start_time
       AND OLD.end_time IS NOT DISTINCT FROM NEW.end_time
    THEN
      RETURN NEW;
    END IF;
    _rec := NEW.user_id;
    _start := to_char(NEW.start_time::time, 'HH24:MI');
    IF NEW.end_time IS NULL THEN
      _range := _start;
    ELSE
      _end := to_char(NEW.end_time::time, 'HH24:MI');
      _range := _start || '-' || _end;
    END IF;
    _body := format(
      'Il tuo turno del %s è stato modificato: %s',
      to_char(NEW.date, 'DD/MM/YYYY'),
      _range
    );
  ELSE
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := _url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(nullif(current_setting('app.service_role_key', true), ''), '')
      ),
      body := jsonb_build_object(
        'message_type', 'private',
        'recipient_id', _rec,
        'push_title', 'FLOW',
        'body', left(_body, 120)
      )
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'notify_push_on_shift: net.http_post failed: %', SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;
