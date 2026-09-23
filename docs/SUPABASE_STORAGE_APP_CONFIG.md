# Supabase Storage — bucket `app-config`

L’app può salvare in Storage (bucket **`app-config`**) questi file JSON:

| File | Contenuto |
|------|-----------|
| `features.json` | Feature flags (Master Control) |
| `geofence.json` | Centro GPS timbrature (lat, lng, `radiusM`) — Profili → Impostazioni → «Salva su cloud» |
| `work_rules.json` | Regole violazioni / ore |
| `break_rules.json` | Regole pause |
| `punch_rounding_rules.json` | Regole di arrotondamento degli orari di timbratura (Impostazioni → Arrotondamento timbrature) |
| `role_feature_templates.json` | Template permessi per ruolo (Admin → Permessi ruoli) |
| `admin_sheet_modules.json` | Moduli scheda Admin globali |
| `departments.json` | Reparti (colori, etichette, custom) — stesso bucket, sync con altri dispositivi |
| `timesheet-period.json` | Config periodo foglio ore (se usata la sync su Storage) |
| `client_sync_revision.json` | Contatore revisione: dopo modifiche admin critiche (permessi, ruoli, flag…) gli altri dispositivi richiedono refresh con PIN |

Le policy sul bucket **`app-config`** valgono per **tutti** i path sopra: non servono policy separate per `geofence.json`. Se l’upload da Impostazioni fallisce con errore Storage, verifica le stesse condizioni degli altri JSON (bucket esistente, policy `anon`/`authenticated`, MIME).

## Errore 400 su POST (upload)

Di solito: **bucket `app-config` assente**, **policy mancanti**, oppure **MIME types** troppo restrittivi sul bucket.

### Login senza Supabase Auth (questo progetto)

L’accesso è con **email + PIN** sulla tabella `users`: il client Supabase usa solo la **anon key**, quindi il JWT ha ruolo **`anon`**, non `authenticated`.

Servono **due** migrazioni in SQL Editor (in ordine):

1. `20260317220000_storage_app_config_bucket.sql` — bucket + policy `authenticated` (utili se in futuro userai Auth).
2. **`20260317230000_storage_app_config_anon_policies.sql`** — policy per **`anon`** su `app-config` (necessarie per l’app così com’è oggi).

Se il bucket ha **Allowed MIME types** ristretti, consenti `application/json` o rimuovi il filtro.

## Errore 400 / 404 su GET

Significa di solito che:

1. Il bucket **non esiste** — in Supabase: **Storage → New bucket** → nome `app-config` (public se vuoi lettura senza JWT, oppure private con policy).
2. Il **file non è ancora stato creato** — la prima volta salva da Impostazioni (upload) oppure carica i file a mano.
3. Le **policy RLS** non permettono `SELECT` per il ruolo che usa il client (anon o authenticated).

## Senza Storage

Le regole restano in **localStorage** sul browser. Per **non** chiamare mai Storage per work/break rules (nessun GET), in `.env`:

```env
VITE_APP_CONFIG_STORAGE_ENABLED=false
```

I download da Storage vengono **ripetuti** a ogni avvio / sync (404 = file non ancora presente è normale su un dispositivo nuovo). La PWA sul telefono e il browser sul PC **non** condividono `localStorage`: la fonte condivisa è **Supabase Storage** (`app-config/*.json`).

## Setup rapido bucket

1. Storage → Create bucket → `app-config`  
2. Policy esempio (authenticated): `SELECT` e `INSERT`/`UPDATE` sul bucket `app-config` per `authenticated`.

Verifica i path esatti nella dashboard Storage dopo la creazione.
