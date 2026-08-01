-- Push turni via payload allineato ai Database Webhook Supabase (docs: Database Webhooks).
-- pg_net accoda la POST in modo asincrono: non blocca il commit e non richiede l’app aperta.
--
-- URL destinazione: https://xzfcxjcwsyigdlsfmwwv.supabase.co/functions/v1/shift-change-webhook
-- La edge function è deployata con --no-verify-jwt e usa la propria service role key in
-- ambiente, quindi il trigger non ha bisogno di header Authorization né di GUC custom.
--
-- NOTA: in passato questa funzione leggeva i GUC custom `app.supabase_url` e
-- `app.service_role_key` (via current_setting). Non erano mai stati impostati sul DB,
-- quindi il trigger usciva subito e NON inviava MAI alcuna notifica. Ora l'URL è
-- hardcodato: se il progetto cambia, aggiornare qui e nella edge function.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Rimuove vecchia logica che chiamava send-push-notification con body già costruito.
DROP TRIGGER IF EXISTS trg_push_on_shift_update ON public.shifts;
DROP TRIGGER IF EXISTS trg_push_on_shift_delete ON public.shifts;
DROP FUNCTION IF EXISTS public.notify_push_on_shift();

CREATE OR REPLACE FUNCTION public.notify_shift_change_webhook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url  text;
  _payload jsonb;
BEGIN
  _url := 'https://xzfcxjcwsyigdlsfmwwv.supabase.co/functions/v1/shift-change-webhook';

  IF TG_OP = 'INSERT' THEN
    IF NEW.approval_status IS NOT DISTINCT FROM 'draft'::text THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.date IS NOT DISTINCT FROM NEW.date
       AND OLD.start_time IS NOT DISTINCT FROM NEW.start_time
       AND OLD.end_time IS NOT DISTINCT FROM NEW.end_time
       AND NOT (OLD.approval_status = 'draft'::text AND NEW.approval_status = 'confirmed'::text)
    THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN
    _payload := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', NULL
    );
  ELSIF TG_OP = 'UPDATE' THEN
    _payload := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', to_jsonb(OLD)
    );
  ELSE
    _payload := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', NULL,
      'old_record', to_jsonb(OLD)
    );
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := _url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      ),
      body := _payload
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE WARNING 'notify_shift_change_webhook: net.http_post failed: %', SQLERRM;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shift_change_webhook_insert ON public.shifts;
DROP TRIGGER IF EXISTS trg_shift_change_webhook_update ON public.shifts;
DROP TRIGGER IF EXISTS trg_shift_change_webhook_delete ON public.shifts;

CREATE TRIGGER trg_shift_change_webhook_insert
  AFTER INSERT ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_shift_change_webhook();

CREATE TRIGGER trg_shift_change_webhook_update
  AFTER UPDATE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_shift_change_webhook();

CREATE TRIGGER trg_shift_change_webhook_delete
  AFTER DELETE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_shift_change_webhook();

COMMENT ON FUNCTION public.notify_shift_change_webhook() IS
  'Accoda POST verso Edge shift-change-webhook (payload come Database Webhooks Supabase).';
