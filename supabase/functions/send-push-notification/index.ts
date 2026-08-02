import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT     = Deno.env.get('VAPID_SUBJECT')     ?? 'mailto:admin@flow-app.com';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')              ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  try {
    const body = await req.json();
    const {
      message_id,
      sender_id,
      recipient_id,
      recipient_ids,
      message_type,
      subject,
      body: msgBody,
      type: notifType,
      push_title: pushTitleOverride,
      url: urlFromBody,
    } = body;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Recupera nome e avatar del mittente
    let senderName = 'FLOW';
    let senderAvatar: string | null = null;

    if (sender_id) {
      const { data: sender } = await supabase
        .from('users')
        .select('first_name, last_name, avatar_url')
        .eq('id', sender_id)
        .single();

      if (sender) {
        senderName = [sender.first_name, sender.last_name].filter(Boolean).join(' ').trim() || 'FLOW';
        senderAvatar = sender.avatar_url ?? null;
      }
    }

    // Trova le subscription dei destinatari
    let query = supabase.from('push_subscriptions').select('*');

    if (message_type === 'private' && recipient_id) {
      query = query.eq('user_id', recipient_id);
    } else if (message_type === 'targeted' && Array.isArray(recipient_ids) && recipient_ids.length > 0) {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const cleaned = [
        ...new Set(
          recipient_ids.filter(
            (x: unknown): x is string => typeof x === 'string' && uuidRe.test(x)
          )
        ),
      ];
      if (cleaned.length === 0) {
        return new Response(JSON.stringify({ sent: 0, message: 'Nessun destinatario valido' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }
      query = query.in('user_id', cleaned);
    } else {
      // Broadcast → tutti tranne il mittente
      if (sender_id) query = query.neq('user_id', sender_id);
    }

    const { data: subscriptions, error } = await query;
    if (error) throw error;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: 'Nessuna subscription trovata' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Titolo: override (es. trigger turni da DB) oppure nome mittente / FLOW
    const notifTitle =
      typeof pushTitleOverride === 'string' && pushTitleOverride.trim()
        ? pushTitleOverride.trim()
        : senderName;
    const notifBody = (msgBody || subject || '').slice(0, 120);
    const iconUrl    = senderAvatar ?? '/icon-192.png';
    const urlPath =
      typeof urlFromBody === 'string' &&
      urlFromBody.trim().startsWith('/') &&
      !urlFromBody.trim().startsWith('//')
        ? urlFromBody.trim()
        : '/';

    const notification = JSON.stringify({
      title: notifTitle,
      body:  notifBody,
      icon:  iconUrl,          // foto mittente come icona notifica
      image: senderAvatar ?? undefined, // immagine espansa (Android)
      badge: '/icon-192.png',
      url:   urlPath,
      message_id,
      ...(notifType ? { type: notifType } : {}),
    });

    const expiredEndpoints: string[] = [];

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth_key,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, notification);
          return true;
        } catch (err: any) {
          if (err?.statusCode === 410 || err?.statusCode === 404) {
            expiredEndpoints.push(sub.endpoint);
          }
          console.error('[push] Errore invio a', sub.endpoint, err?.statusCode, err?.message);
          return false;
        }
      })
    );

    // Rimuovi subscription scadute
    if (expiredEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', expiredEndpoints);
    }

    const sent = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;

    return new Response(JSON.stringify({ sent, total: subscriptions.length }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[send-push-notification]', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
