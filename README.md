# FLOW — Work in Motion

Applicazione web (React, Vite, Supabase) per turni, ferie, presenze e gestione staff.

**Repository:** [github.com/taleb85/osteria-basilico-app](https://github.com/taleb85/osteria-basilico-app) · **Produzione (default):** [flow-workinmotion.vercel.app](https://flow-workinmotion.vercel.app) — hosting **Vercel** (override con `VITE_PUBLIC_APP_ORIGIN`).

## Prerequisiti

- Node.js 18+
- Progetto Supabase: copia `.env.example` in `.env` e inserisci URL e chiave anon (il file `.env` non va mai committato).

## Sviluppo

```bash
npm install
npm run dev
```

**Vite:** la configurazione ufficiale è `scripts/vite.config.mjs`. Usa sempre gli script `npm` (`dev`, `build`, `preview`); non avviare `vite` o `npx vite` senza `--config scripts/vite.config.mjs`, per evitare problemi di build su alcuni ambienti.

## Build e deploy

- Build: `npm run build` → output in `dist`
- Anteprima locale: `npm run preview`
- Pubblicazione: **[DEPLOY.md](./DEPLOY.md)** (Cloudflare Pages, `npm run deploy`)

## Repository Git

Sintesi se il remoto non è ancora collegato (dopo aver creato il repo vuoto su GitHub):

```bash
bash scripts/git-remote-push.sh https://github.com/TUO_UTENTE/TUO_REPO.git
```

In **Cloudflare Pages**: collega lo stesso repository; **Build Command** `npm run build`, **Output Directory** `dist`. Su ogni push, la **CI** su GitHub esegue typecheck, lint e build (vedi `.github/workflows/ci.yml`).

## Altri comandi

| Comando | Uso |
|--------|-----|
| `npm run typecheck` | Controllo TypeScript |
| `npm run lint` | ESLint |
| `npm run deploy` | Build + deploy produzione su Cloudflare Pages (richiede `wrangler` / login) |

Documentazione aggiuntiva: cartella `docs/` e file markdown in root. Riepilogo: **[docs/STATO_PROGETTO.md](./docs/STATO_PROGETTO.md)**. Checklist operativa: **[docs/CHECKLIST_VERIFICA_COMPLETA.md](./docs/CHECKLIST_VERIFICA_COMPLETA.md)**.
