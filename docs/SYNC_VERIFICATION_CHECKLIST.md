# Checklist verifica sincronizzazione (multi-dispositivo)

Usala con **due contesti separati** (es. Chrome normale + finestra anonima, oppure PC + telefono con PWA). Stesso progetto Supabase, **nessun segreto** in chat: solo esito ok/ko.

**Prerequisiti:** bucket Storage `app-config` configurato (vedi [SUPABASE_STORAGE_APP_CONFIG.md](./SUPABASE_STORAGE_APP_CONFIG.md)); client con chiave **anon** che può leggere/scrivere i JSON previsti dalle policy.

---

## 1 — Dati turni / DB (PostgREST)

| Step | Azione | Esito atteso |
|------|--------|----------------|
| 1.1 | Browser **A**: login manager, apri tabellone, **crea o modifica** un turno (bozza o confermato, come usi di solito). | Salvataggio ok, toast/indicatori coerenti. |
| 1.2 | Browser **B**: stesso utente o altro con permessi, **ricarica** la pagina o torna in primo piano sull’app. | Il turno aggiornato **compare** (realtime o dopo refresh). |
| 1.3 | Browser **B**: metti la scheda in **background** 10–20 s, poi torna in **primo piano**. | Dati ancora allineati (o si aggiornano entro pochi secondi). |

---

## 2 — Config da Storage (flag, periodo presenze, template)

| Step | Azione | Esito atteso |
|------|--------|----------------|
| 2.1 | Browser **A**: **Impostazioni** (o dove salvi su cloud) — cambia un **feature flag** o il **periodo presenze** e salva su Storage. | Nessun errore Storage in console/network. |
| 2.2 | Browser **B**: **non** in primo piano da un po’; poi **porta in primo piano** l’app (o `online` se era offline). | Entro ~5–10 s il comportamento riflette il nuovo flag / periodo (può servire un secondo focus se c’è throttle 5 s). |

---

## 3 — Revisione globale `client_sync_revision.json` (blocco PIN)

Serve un cambio che **incrementa** la revisione (es. modifica **ruolo**, **PIN**, **permessi** utente da admin, oppure flag/regole che nel codice chiamano `bumpClientSyncRevisionOnSupabase`).

| Step | Azione | Esito atteso |
|------|--------|----------------|
| 3.1 | Browser **A**: effettua una modifica che **bump** la revisione (es. `updateUser` con ruolo/PIN/permessi come da `AppContext`). | Salvataggio ok. |
| 3.2 | Browser **B**: utente **già loggato** come staff/manager; attendi un **silent refresh** (cambio tab, focus, o breve attesa). | Compare **overlay / blocco** post-sync: serve **PIN** (o dispositivo se configurato) per continuare. |
| 3.3 | Browser **B**: inserisci **PIN corretto** del profilo. | Blocco si toglie; dati e **config Storage** (flag, template, ecc.) risultano **allineati** (dopo sblocco è previsto un `pullRemoteConfig`). |
| 3.4 | Browser **B**: PIN **errato** ripetuto. | Comportamento previsto dall’app (es. logout forzato): verificare che sia accettabile per il team. |

**Senza sessione (rotte pubbliche):** su **`/profilo`** — e sulle vecchie `/timbratura` e `/login`, che ora reindirizzano lì — un refresh non deve mostrare il blocco PIN; la revisione viene solo **ack** in locale.

---

## 4 — Rete e PWA (Chrome / Android)

| Step | Azione | Esito atteso |
|------|--------|----------------|
| 4.1 | **Offline** un attimo, poi **online** (Chrome desktop o Android). | Dopo riconnessione, entro pochi secondi i dati/config tendono ad aggiornarsi (Background Sync dove supportato; altrimenti evento `online` + focus). |
| 4.2 | **Safari iOS** | Nessun Background Sync: affidarsi a visibility/focus/online come sopra. |

---

## 5 — Controlli rapidi in Supabase (dashboard)

- [ ] **Storage → `app-config`**: esiste `client_sync_revision.json` dopo almeno un bump; il campo `revision` è un intero che **cresce** quando fai azioni critiche.
- [ ] **Network** nel browser: niente **403/400** ripetuti su `GET`/`upload` del bucket per i path usati dall’app.

---

## Riferimenti codice

- Revisione client: `src/utils/clientSyncRevision.ts`
- Refresh e lock: `silentRefreshData`, `forceGlobalRefresh`, `runPostUnlockRefreshActions` in `src/context/AppContext.tsx`
- Background sync: `src/utils/backgroundSync.ts`, `public/pwa-background-sync.js`
