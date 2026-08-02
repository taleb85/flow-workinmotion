# Stato progetto (riferimento rapido)

Repository pubblico: **[github.com/taleb85/osteria-basilico-app](https://github.com/taleb85/osteria-basilico-app)** (nome storico, non legato al brand) · Produzione (default): **https://flow-workinmotion.vercel.app** (Vercel; override con `VITE_PUBLIC_APP_ORIGIN` al build)

| Voce | Stato |
|------|--------|
| Codice su `main` + `origin` | OK — `main` allineato con GitHub |
| Lint / TypeScript / build locale | OK (`npm run lint`, `typecheck`, `build`) |
| CI GitHub Actions | OK su ogni push/PR — workflow [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |
| Deploy Cloudflare Pages | OK — `npm run deploy` (Wrangler) o deploy al push se il repo è collegato |
| Pages ↔ GitHub | [CONNESSIONE_GIT_CLOUDFLARE.md](./CONNESSIONE_GIT_CLOUDFLARE.md) (nomenclatura file storica) |
| Variabili `VITE_*` su Pages | Da verificare in Cloudflare → progetto → Environment variables (build) |
| Supabase (URL produzione, RLS) | Checklist in [DEPLOY.md](../DEPLOY.md) — verifica manuale in dashboard Supabase |
| Verifica “tutto” passo-passo | [CHECKLIST_VERIFICA_COMPLETA.md](./CHECKLIST_VERIFICA_COMPLETA.md) |
