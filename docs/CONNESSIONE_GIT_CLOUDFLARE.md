# Connessione Git + Cloudflare Pages (checklist)

Passi da fare **una volta** sul tuo computer o dopo aver creato il repository remoto.

## 1. Identità Git (commit con nome e email corretti)

Se Git avvisa che nome/email non sono configurati:

```bash
cd /percorso/del/progetto

# Solo questo repo (consigliato)
git config user.name "Il Tuo Nome"
git config user.email "tua-email@esempio.com"

# Oppure globalmente su tutta la macchina
git config --global user.name "Il Tuo Nome"
git config --global user.email "tua-email@esempio.com"
```

Su GitHub puoi usare l’email **noreply** (Impostazioni → Email): così non esponi l’email reale nei commit.

## 2. Repository remoto (GitHub o altro)

1. Crea un repository **vuoto** sul provider (senza README/licenza se hai già commit locali).
2. Collega `origin` e invia `main` — **in un comando** (dalla root del progetto):

```bash
bash scripts/git-remote-push.sh https://github.com/TUO_UTENTE/TUO_REPO.git
```

Equivalente manuale:

```bash
git remote add origin https://github.com/TUO_UTENTE/TUO_REPO.git
git push -u origin main
```

Se `origin` esiste già con URL sbagliato:

```bash
git remote set-url origin https://github.com/TUO_UTENTE/TUO_REPO.git
git push -u origin main
```

## 3. Cloudflare Pages collegato al repo

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → collega **Git** (autorizza GitHub/GitLab) oppure carica a mano con [Wrangler](https://developers.cloudflare.com/workers/wrangler/).
2. Scegli il repository, branch di build (es. `main` o `feature/multi-tenant` per anteprime), e imposta:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. In **Settings** → **Environment variables** (per il contesto *Build*), aggiungi le stesse `VITE_*` che usi in produzione, come in [DEPLOY.md](../DEPLOY.md).
4. Deploy manuale da terminale: `npx wrangler login` (una volta), poi `npm run deploy` dalla root del repo.

*Nota: il vecchio flusso Vercel non è più usato; resta questa guida sotto lo stesso nome file per i link esistenti.*

## 4. Supabase URL di produzione

In Supabase → **Authentication** → **URL Configuration**, imposta **Site URL** e **Redirect URLs** sull'URL **Vercel** (o dominio custom), es. `https://flow-workinmotion.vercel.app`. Dettagli in [DEPLOY.md](../DEPLOY.md).

## 5. CI su GitHub

Con push su `main` o pull request, il workflow **CI** (`.github/workflows/ci.yml`) esegue `typecheck`, `lint` e `build`. Non servono secret per la build se le variabili Vite non sono obbligatorie a compile-time nel tuo setup attuale.
