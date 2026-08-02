# Checklist verifica completa (produzione)

Usala **in ordine**. Non incollare mai in chat **chiavi, token o `.env`**: se serve aiuto, manda solo **esito** (ok / errore), **nomi** delle variabili presenti, o screenshot con valori oscurati.

**URL di riferimento produzione:** `https://flow-workinmotion.vercel.app` (o `VITE_PUBLIC_APP_ORIGIN` al build)  
**Repo:** [taleb85/osteria-basilico-app](https://github.com/taleb85/osteria-basilico-app) (nome storico, non legato al brand)  

---

## A — Cloudflare Pages (progetto collegato a Git)

1. **Progetto Pages →** collega il repository  
   - [ ] Repository corretto (`osteria-basilico-app` o come lo hai chiamato).
   - [ ] Branch di build: `main` (o il branch usato in produzione).

2. **Build settings**  
   - [ ] Build command: `npm run build`  
   - [ ] Build output directory: `dist`  
   - [ ] Stesse voci che in [DEPLOY.md](../DEPLOY.md).

3. **Settings → Environment variables** (per il *build*, almeno **Production**)

   Obbligatorie per il frontend (Vite le legge in **build**):

   | Nome | Presente? (sì/no) | Note |
   |------|-------------------|------|
   | `VITE_SUPABASE_URL` | | URL progetto Supabase |
   | `VITE_SUPABASE_ANON_KEY` **oppure** `VITE_SUPABASE_PUBLISHABLE_KEY` | | Una sola delle due se il codice la risolve (vedi `src/lib/supabase.ts`) |

   Opzionali (solo se le usi):

   | Nome | Presente? |
   |------|-----------|
   | `VITE_GEMINI_API_KEY` | Scan foto turni |
   | `VITE_ALLOW_BROWSER_APP` | Solo se serve bypass PWA in browser su dominio produzione (temporaneo) |
   | `VITE_RESTAURANT_LAT` / `VITE_RESTAURANT_LNG` / `VITE_GEOFENCE_RADIUS_M` | Geofence senza config su Storage |
   | `VITE_APP_CONFIG_STORAGE_ENABLED` | Se disabiliti lettura config da Storage |

   **Non** impostare la **service role** come variabile `VITE_*` nel build client. Per script locali vedi `.env.example`.

4. **Deployments**  
   - [ ] Ultimo deploy **success** sull’ultimo commit del branch.  
   - [ ] Nessun errore di build recente (log).

5. **Custom domains** (se usi dominio proprio)  
   - [ ] DNS e certificato OK in dashboard Cloudflare.

---

## B — Supabase (stesso progetto puntato da `VITE_SUPABASE_URL`)

1. **Authentication → URL Configuration**  
   - [ ] **Site URL** = l'URL Vercel o dominio custom ufficiale (es. `https://flow-workinmotion.vercel.app`).  
   - [ ] **Redirect URLs** includono quell’origine (e wildcard se serve, es. `https://tuo.dominio/**`).

2. **Project Settings → API**  
   - [ ] La **anon public** key usata nel build (Pages) corrisponde a **questo** progetto (controllo umano: confronto in dashboard, non in chat).

3. **Database → Migrations / SQL**  
   - [ ] Tutte le migrazioni in `supabase/migrations/` applicate su questo DB (o equivalente).  
   - [ ] Da repo (CLI già linkata): `npx supabase db push` — se chiede migrazioni “fuori ordine”: `npx supabase db push --include-all` (vedi messaggio CLI).  
   - [ ] Se la cronologia remota ha versioni orfane: `npx supabase migration list --linked` poi `npx supabase migration repair --status reverted <versione>` solo per le righe indicate dalla CLI (non inventare il numero).  
   - [ ] Alternativa senza CLI: incolla in **SQL Editor** lo script unico `supabase/manual_paste_sql_editor_rls.sql` (RLS/policy recenti) dopo aver verificato l’ordine rispetto a migrazioni già eseguite.  
   - [ ] Edge function `send-holiday-notification` deployata se usi notifiche mail da lì.

4. **RLS e sicurezza (controllo consigliato)**  
   - [ ] In **Table Editor** o **SQL**: verifica che le tabelle usate dall’app abbiano policy coerenti con come l’app chiama PostgREST (anon key + sessione custom).  
   - [ ] In dashboard: **Advisors** (sicurezza) — “RLS disabled” / “multiple permissive policies”: allinea con migrazioni `20260324160000_*`, `20260324170000_*` e script `supabase/manual_paste_sql_editor_rls.sql` se serve.  
   - [ ] Avviso **“RLS Policy Always True”** con policy `TO anon` e `USING (true)`: per questo progetto è spesso **voluto** (client solo anon + controllo accessi in app con PIN); non è di per sé un bug finché accetti il modello di minaccia.  
   - [ ] Documentazione interna: `RLS_POLICIES_DOCUMENTATION.md`, `SECURITY_NOTES.md`.

5. **Storage** (multi-dispositivo: flag, template ruoli, geofence JSON, ecc.)  
   - [ ] Bucket **`app-config`** creato (Supabase → **Storage**).  
   - [ ] Migrazioni applicate in ordine: `20260317220000_storage_app_config_bucket.sql` poi **`20260317230000_storage_app_config_anon_policies.sql`** (necessaria per client con sola **anon key**).  
   - [ ] MIME: consenti `application/json` sul bucket o nessun filtro troppo stretto (altrimenti upload 400).  
   - [ ] Dettagli e troubleshooting: [docs/SUPABASE_STORAGE_APP_CONFIG.md](./SUPABASE_STORAGE_APP_CONFIG.md).  
   - [ ] Per disattivare del tutto i GET verso Storage: `VITE_APP_CONFIG_STORAGE_ENABLED=false` in `.env` o nelle variabili di build Pages (vedi `.env.example`).

6. **Realtime (aggiornamenti tra dispositivi senza refresh)**  
   L’app si iscrive in codice a queste tabelle (`src/lib/database.ts` → `postgres_changes`):  
   `shifts`, `users`, `punch_records`, `holiday_requests`, **`app_settings_sync_signal`** (pull config cloud dopo bump revisione / bundle).  
   In Supabase: **Database → Publications** (o **Replication**, a seconda della UI) → publication tipicamente **`supabase_realtime`** → devono comparire **tutte** le tabelle sopra (altrimenti i client non ricevono eventi e restano solo pull manuali / foreground).  
   La tabella `app_settings_sync_signal` è creata dalla migrazione `20260322180000_app_settings_sync_signal.sql` (e publication idempotente in `20260324130000_*` se applicata).  
   Migrazione dedicata che aggiunge **tutte** e cinque le tabelle alla publication se mancano: `20260325200000_realtime_publication_operational_tables.sql` (stesso blocco anche in `supabase/manual_paste_sql_editor_rls.sql` in coda).  
   **Dati su Storage** (`app-config`: template ruoli, feature flags, …): non passano da Realtime; l’app li riallinea al **ritorno in primo piano**, al **pull-to-refresh**, al cambio tab in **gestione**, e in **Area admin** (throttle pull config in foreground ~12s + pull forzato a visibility/focus). Se PC e telefono sembrano diversi, verifica bucket/policy in `docs/SUPABASE_STORAGE_APP_CONFIG.md`.  
   **Background Sync** (Chrome/Edge/Android): in **offline** viene registrato un sync one-shot; alla **riconnessione** il service worker può risvegliarsi e far partire un refresh dati (`silentRefreshData` + Storage) sulle finestre ancora aperte — su Safari iOS non è disponibile; restano foreground/online già gestiti dall’app.

---

## C — App live (browser, dati reali o di test)

Apri l’URL di produzione su Pages (o dominio custom).

1. **Caricamento**  
   - [ ] Pagina principale senza schermata bianca.  
   - [ ] DevTools → **Console**: nessun errore rosso critico all’avvio.  
   - [ ] **Network**: richieste a `*.supabase.co` con stato 2xx (non 401 ripetuti infiniti).

2. **Login (PIN)**  
   - [ ] Login con utente di test.  
   - [ ] Logout / cambio utente se applicabile.

3. **Flussi core** (spunta ciò che usate in produzione)  
   - [ ] Turni (vista staff / gestione).  
   - [ ] Presenze / timesheet (se abilitato).  
   - [ ] Ferie / richieste (se abilitato).  
   - [ ] Impostazioni admin (solo profilo autorizzato).  
   - [ ] PWA: installazione o gate come previsto (senza `VITE_ALLOW_BROWSER_APP` la PWA può essere richiesta su produzione).

4. **Scan foto / Gemini** (solo se abilitato)  
   - [ ] Funziona o fallisce con messaggio chiaro se manca la chiave.

---

## D — Repository e CI (già automatizzabili)

- [ ] Tab **Actions** su GitHub: ultimo workflow **CI** su `main` verde.  
- [ ] In locale: `npm run lint`, `npm run typecheck`, `npm run build` ok.

---

## Cosa puoi incollare all’assistente (senza segreti)

- Elenco: «Su Cloudflare Pages (build) ho: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` → sì/no».  
- «Site URL Supabase è impostato su …» (solo dominio pubblico, ok).  
- Messaggio di errore **testuale** dal browser o da Network (senza header `Authorization`).  
- Screenshot con valori oscurati.

---

## Riferimenti nel repo

- Deploy e checklist generale: [DEPLOY.md](../DEPLOY.md)  
- Git + Cloudflare Pages: [CONNESSIONE_GIT_CLOUDFLARE.md](./CONNESSIONE_GIT_CLOUDFLARE.md) (nome file storico)  
- Stato sintetico: [STATO_PROGETTO.md](./STATO_PROGETTO.md)  
- Variabili esempio: [`.env.example`](../.env.example)  
- Storage bucket `app-config`: [SUPABASE_STORAGE_APP_CONFIG.md](./SUPABASE_STORAGE_APP_CONFIG.md)  
- SQL RLS incollabile (senza CLI): `supabase/manual_paste_sql_editor_rls.sql`  
- **Sincronizzazione multi-dispositivo (QA manuale):** [SYNC_VERIFICATION_CHECKLIST.md](./SYNC_VERIFICATION_CHECKLIST.md)
