# CONFIGURAZIONE MAIL NECESSARIA

Per abilitare l'invio delle email di notifica ferie (da **FLOW <notifications@flow-workinmotion.vercel.app>**), è necessario configurare Resend e Supabase.

---

## 1. Account Resend

1. Crea un account su [resend.com](https://resend.com)
2. Verifica il dominio **flow-workinmotion.vercel.app** nelle impostazioni Resend (DNS: record TXT e MX)
3. Genera una **API Key** da Resend Dashboard → API Keys → Create API Key

---

## 2. Supabase Edge Function Secrets

La chiave API **non** va nel file `.env` del progetto. Va configurata come **segreto** della Edge Function Supabase.

### Opzione A: Supabase Dashboard

1. Vai su [supabase.com](https://supabase.com) → il tuo progetto
2. **Project Settings** → **Edge Functions** → **Secrets**
3. Aggiungi: `RESEND_API_KEY` = `re_xxxxxxxx` (la tua API key Resend)

### Opzione B: Supabase CLI

```bash
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
```

---

## 3. Deploy della Edge Function

```bash
supabase functions deploy resend-email --no-verify-jwt
```

> `--no-verify-jwt` permette alla funzione di essere invocata dal client senza token JWT (utile per app con autenticazione PIN).

---

## 4. Password / SMTP (alternativa)

Se preferisci usare **SMTP** invece di Resend:

- Resend supporta anche invio tramite SMTP con le credenziali fornite nel dashboard
- Per la Edge Function attuale, è richiesta solo la **Resend API Key** (più semplice)

---

## 5. Verifica

Dopo la configurazione:

1. Avvia l'app e vai su **Ferie**
2. Clicca **Approva** su una richiesta in attesa
3. Controlla che il dipendente riceva l'email all'indirizzo registrato
4. In caso di errore, controlla i log: Supabase Dashboard → Edge Functions → send-holiday-notification → Logs

---

## Riepilogo variabili

| Variabile        | Dove configurarla | Descrizione                          |
|------------------|-------------------|--------------------------------------|
| `RESEND_API_KEY` | Supabase Secrets  | API Key da resend.com                |
| `VITE_SUPABASE_*`| `.env` (progetto) | Già presenti per Supabase client    |
