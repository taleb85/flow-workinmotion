-- Tabella per le push subscription Web Push (VAPID)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL,
  p256dh      TEXT        NOT NULL,
  auth_key    TEXT        NOT NULL,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Solo l'utente stesso può leggere/scrivere le proprie subscription
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_sub_own' AND tablename = 'push_subscriptions') THEN
    CREATE POLICY "push_sub_own" ON public.push_subscriptions
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Service role può leggere tutto (per le Edge Functions)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'push_sub_service' AND tablename = 'push_subscriptions') THEN
    CREATE POLICY "push_sub_service" ON public.push_subscriptions
      FOR SELECT USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Trigger: quando viene inserito un messaggio in staff_messages,
-- chiama la Edge Function send-push-notification via pg_net
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notify_push_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  _url TEXT;
BEGIN
  -- URL della Edge Function (si usa il progetto corrente)
  _url := current_setting('app.supabase_url', true) || '/functions/v1/send-push-notification';

  PERFORM net.http_post(
    url     := _url,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
    ),
    body    := jsonb_build_object(
      'message_id',    NEW.id,
      'sender_id',     NEW.sender_id,
      'recipient_id',  NEW.recipient_id,
      'message_type',  NEW.message_type,
      'subject',       NEW.subject,
      'body',          substring(NEW.body, 1, 120)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_push_on_message ON public.staff_messages;
CREATE TRIGGER trg_push_on_message
  AFTER INSERT ON public.staff_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_on_message();
