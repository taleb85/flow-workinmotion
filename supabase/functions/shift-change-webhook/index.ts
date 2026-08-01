/**
 * Riceve il payload dei Database Webhook Supabase (o equivalente da trigger pg_net).
 * Invia push al dipendente interessato; la richiesta parte dal DB → non dipende dall’app aperta.
 */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

type Payload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: Record<string, unknown> | null;
  old_record?: Record<string, unknown> | null;
};

function fmtDate(d: unknown): string {
  if (typeof d !== 'string') return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[3]}/${m[2]}`;
}

function fmtTime(t: unknown): string {
  if (t == null) return '';
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function fmtRange(record: Record<string, unknown>): string {
  const st = fmtTime(record.start_time);
  const en = fmtTime(record.end_time);
  return st && en ? `${st} – ${en}` : st || en || '';
}

function buildMessage(p: Payload): { recipientId: string; title: string; body: string } | null {
  const { type, record, old_record } = p;
  if (!type) return null;

  if (type === 'DELETE' && old_record) {
    const uid = old_record.user_id;
    if (typeof uid !== 'string') return null;
    return {
      recipientId: uid,
      title: 'Turno annullato',
      body: `Il tuo turno del ${fmtDate(old_record.date)} è stato annullato`,
    };
  }

  if (type === 'INSERT' && record) {
    if (record.approval_status === 'draft') return null;
    const uid = record.user_id;
    if (typeof uid !== 'string') return null;
    return {
      recipientId: uid,
      title: 'Nuovo turno',
      body: `Il tuo turno del ${fmtDate(record.date)}: ${fmtRange(record)}`,
    };
  }

  if (type === 'UPDATE' && record && old_record) {
    // Pubblicazione turno: draft → confirmed (invio notifica "turno pubblicato").
    if (old_record.approval_status === 'draft' && record.approval_status === 'confirmed') {
      const uid = record.user_id;
      if (typeof uid !== 'string') return null;
      return {
        recipientId: uid,
        title: 'Turno pubblicato',
        body: `Il tuo turno del ${fmtDate(record.date)} è stato pubblicato: ${fmtRange(record)}`,
      };
    }

    if (
      old_record.date === record.date &&
      old_record.start_time === record.start_time &&
      old_record.end_time === record.end_time
    ) {
      return null;
    }
    const uid = record.user_id;
    if (typeof uid !== 'string') return null;
    return {
      recipientId: uid,
      title: 'Turno modificato',
      body: `Il tuo turno del ${fmtDate(record.date)} è stato modificato: ${fmtRange(record)}`,
    };
  }

  return null;
}

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

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (payload.table !== 'shifts' || payload.schema !== 'public') {
    return new Response(JSON.stringify({ ok: true, ignored: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const built = buildMessage(payload);
  if (!built) {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pushRes = await fetch(`${SUPABASE_URL}/functions/v1/send-push-notification`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SRK}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message_type: 'private',
      recipient_id: built.recipientId,
      push_title: built.title,
      body: built.body.slice(0, 120),
      type: 'shift_change',
      url: '/app?open=turni',
    }),
  });

  let sent = 0;
  try {
    const j = await pushRes.json();
    if (typeof j.sent === 'number') sent = j.sent;
  } catch {
    /* ignore */
  }

  return new Response(JSON.stringify({ ok: true, sent }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
