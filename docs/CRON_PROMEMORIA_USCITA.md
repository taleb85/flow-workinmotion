# Cron promemoria "timbratura uscita"

Notifica push ai dipendenti che hanno **timbrato l'ingresso e non l'uscita**.

## Come funziona

1. **Ogni ora** (UTC 06:00–20:00) il database esegue un job `pg_cron` che chiama la Edge Function
   `punch-exit-reminder-cron` via `pg_net`.
2. La funzione esegue la RPC `get_stale_open_punch_for_reminder()`, che seleziona:
   - l'ultima timbratura di ogni utente attivo,
   - se è di tipo `in` (turno aperto) e più vecchia di **10 ore**,
   - e se per quella timbratura non è già stato inviato un promemoria (`punch_exit_reminder_log`).
3. Per ogni candidato invia una push (`send-push-notification`) e registra il promemoria in
   `punch_exit_reminder_log`.

Risposta della funzione: `{ candidates, subscriptions_notified, reminders_logged }`.

## Configurazione attuale

| Voce | Valore |
|------|--------|
| Job `pg_cron` | `punch-exit-reminder` |
| Schedule | `0 6-20 * * *` (ogni ora, 06:00–20:00 UTC ≈ 07:00–21:00 ora italiana) |
| Estensioni | `pg_cron`, `pg_net` |
| Endpoint | `https://iuvfkxygwjbdunwqumcb.supabase.co/functions/v1/punch-exit-reminder-cron` |
| Autorizzazione | header `Authorization: Bearer <CRON_SECRET>` (secret Supabase, **non** nel repo) |

Il `CRON_SECRET` è impostato come secret delle Edge Functions. Il comando del job `pg_cron`
lo contiene lato database (non è versionato).

## Comandi utili (SQL Editor Supabase)

Cambiare l'orario (es. solo 08:00–22:00 ora italiana):
```sql
select cron.unschedule('punch-exit-reminder');
select cron.schedule(
  'punch-exit-reminder',
  '0 7-21 * * *',
  $$ select net.http_post(
       url := 'https://iuvfkxygwjbdunwqumcb.supabase.co/functions/v1/punch-exit-reminder-cron',
       headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <CRON_SECRET>'),
       body := '{}'::jsonb ); $$
);
```

Disattivare:
```sql
select cron.unschedule('punch-exit-reminder');
```

Verificare i job attivi:
```sql
select jobid, schedule, jobname, active from cron.job;
```

## Requisiti

I device devono avere le **notifiche push attive** (l'app usa la VAPID public key hardcoded in
`src/hooks/usePushNotifications.ts`). Se le notifiche vengono rigenerate, i device devono
riattivarle.
