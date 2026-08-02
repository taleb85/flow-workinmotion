// Supabase Edge Function: invio email notifica ferie via Resend API
// Mittente: FLOW <notifications@flow-workinmotion.vercel.app>

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const FROM = 'FLOW <notifications@flow-workinmotion.vercel.app>';

interface Payload {
  email: string;
  nome: string;
  start_date: string;
  end_date: string;
  status: 'approved' | 'rejected';
  language?: 'it' | 'en' | 'es';
}

const TEXTS = {
  it: {
    subject: (nome: string) => `Aggiornamento Richiesta Ferie - ${nome}`,
    approved: {
      title: 'Richiesta Approvata',
      body: 'La tua richiesta di ferie/permesso è stata approvata.',
      dates: 'Date',
      regards: 'Cordiali saluti,',
      team: 'Il team FLOW',
    },
    rejected: {
      title: 'Richiesta Non Approvata',
      body: 'La tua richiesta di ferie/permesso non è stata approvata.',
      dates: 'Date richieste',
      regards: 'Cordiali saluti,',
      team: 'Il team FLOW',
    },
  },
  en: {
    subject: (nome: string) => `Holiday Request Update - ${nome}`,
    approved: {
      title: 'Request Approved',
      body: 'Your holiday/leave request has been approved.',
      dates: 'Dates',
      regards: 'Kind regards,',
      team: 'The FLOW Team',
    },
    rejected: {
      title: 'Request Not Approved',
      body: 'Your holiday/leave request has not been approved.',
      dates: 'Requested dates',
      regards: 'Kind regards,',
      team: 'The FLOW Team',
    },
  },
  es: {
    subject: (nome: string) => `Actualización Solicitud Vacaciones - ${nome}`,
    approved: {
      title: 'Solicitud Aprobada',
      body: 'Tu solicitud de vacaciones/permiso ha sido aprobada.',
      dates: 'Fechas',
      regards: 'Atentamente,',
      team: 'El equipo FLOW',
    },
    rejected: {
      title: 'Solicitud No Aprobada',
      body: 'Tu solicitud de vacaciones/permiso no ha sido aprobada.',
      dates: 'Fechas solicitadas',
      regards: 'Atentamente,',
      team: 'El equipo FLOW',
    },
  },
};

function formatDate(d: string, lang: string): string {
  try {
    const date = new Date(d);
    return date.toLocaleDateString(lang === 'it' ? 'it-IT' : lang === 'es' ? 'es-ES' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

function buildHtml(payload: Payload): string {
  const lang = payload.language && ['it', 'en', 'es'].includes(payload.language) ? payload.language : 'it';
  const t = TEXTS[lang];
  const isApproved = payload.status === 'approved';
  const content = isApproved ? t.approved : t.rejected;
  const startFormatted = formatDate(payload.start_date, lang);
  const endFormatted = formatDate(payload.end_date, lang);
  const statusColor = isApproved ? '#059669' : '#dc2626';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${content.title}</title>
</head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background-color:#f8fafc;color:#1e293b;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="background:#fff;border-radius:12px;box-shadow:0 4px 6px rgba(0,0,0,0.05);overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:#0f172a;padding:24px;text-align:center;">
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;letter-spacing:0.5px;">FLOW — Work in Motion</h1>
        <p style="margin:8px 0 0;color:#94a3b8;font-size:13px;">Ferie & Permessi</p>
      </div>
      <div style="padding:28px 24px;">
        <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:${statusColor};">${content.title}</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">${content.body}</p>
        <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">${content.dates}</p>
          <p style="margin:0;font-size:15px;font-weight:500;color:#1e293b;">${startFormatted} – ${endFormatted}</p>
        </div>
        <p style="margin:0;font-size:14px;color:#64748b;">${content.regards}</p>
        <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${content.team}</p>
      </div>
    </div>
    <p style="margin:20px 0 0;text-align:center;font-size:11px;color:#94a3b8;">FLOW — Work in Motion · notifications@flow-workinmotion.vercel.app</p>
  </div>
</body>
</html>
`.trim();
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  try {
    if (!RESEND_API_KEY) {
      console.error('[send-holiday-notification] RESEND_API_KEY mancante');
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY non configurata. Vedi CONFIGURAZIONE_MAIL_NECESSARIA.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const payload: Payload = await req.json();
    if (!payload.email || !payload.nome || !payload.start_date || !payload.end_date || !payload.status) {
      return new Response(
        JSON.stringify({ error: 'Payload incompleto: email, nome, start_date, end_date, status richiesti' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const lang = payload.language && ['it', 'en', 'es'].includes(payload.language) ? payload.language : 'it';
    const subject = TEXTS[lang].subject(payload.nome);
    const html = buildHtml({ ...payload, language: lang });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [payload.email],
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('[send-holiday-notification] Resend API error:', data);
      return new Response(JSON.stringify({ error: data.message || 'Invio email fallito' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    return new Response(JSON.stringify({ success: true, id: data.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    console.error('[send-holiday-notification] Errore:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Errore interno' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
});
