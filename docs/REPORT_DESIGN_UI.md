# Report — Analisi layout & design UI (FLOW)

Data: 2026-09-05 · Scope: tipografia, colori/contrasto, forme e spaziature, responsività
Metodo: lettura dei layer CSS (`index.css`, `flow-v2-skin.css`, `tailwind.config.js`, `index.html`), conteggi d'uso nel codice, audit browser (mobile 402×874 e desktop) con misurazioni reali di contrasto (axe + motore WCAG) e verifica dei layer dipinti a schermo.

---

## 1. Sintesi

L'app ha già una **base solida**: sistema di token scuro "Apple" in `flow-v2-skin.css`, scala tipografica/raggi fluidi via `--scale-factor`, layout responsive a singola colonna centrata senza overflow orizzontale né mobile né desktop, nessuna regressione di rottura layout rilevata. I problemi principali sono di **coerenza e manutenzione**: token definiti in più punti e in conflitto tra loro, font caricati ma mai usati, colori/contrasto sotto soglia AA su alcuni riempimenti e testi muted, raggi forzati globalmente che annullano la scala, e molti valori inline non governati dai token.

---

## 2. Tipografia

### Stato attuale
- `index.html` preloada **Inter** (pesi 400–800) e i font decorativi **Parisienne, Great Vibes, Playfair Display, Montserrat**.
- `flow-v2-skin.css` applica come font di sistema `--flow-font-sans: -apple-system / SF Pro…` su `body`.
- `index.css` (`@layer base`) e numerosi contenitori (`font-sans` usato ~72 volte in 41 file) applicano invece lo stack **Inter** via Tailwind.
- Regola globale `h1,h2,h3,.text-2xl,.text-xl,.text-lg,.font-bold { letter-spacing:-0.02em !important }` in `flow-v2-skin.css`.

### Problemi trovati
1. **Font decorativi mai usati** (`Parisienne`, `Great Vibes`, `Playfair Display`, `Montserrat`): 0 occorrenze in `src/**` → preload scaricati inutilmente (costo di rete + TTFB su ogni apertura). Righe [index.html:306-312](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/index.html#L306-L312).
2. **Due stack tipografici conviventi**: UI dentro contenitori `font-sans` rende con **Inter**; tutto ciò che eredita da `body` rende con **SF/system** (flow-v2). Sottile ma reale disomogeneità (forma di cifre e pesi differenti, es. tabelloni orari vs etichette).
3. **`font-serif` mappato su Inter** in [tailwind.config.js:86](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/tailwind.config.js#L86) → nome semanticamente falso se mai usato.
4. `letter-spacing:-0.02em` applicato a **tutti** `.font-bold` (anche numeri, badge, bottoni) con `!important`: eccessivamente pervasivo; può stringere cifre/kpi.

### Modifiche suggerite
- Rimuovere i 4 font decorativi da `index.html` (o usarli davvero per il titolo brand) e, se si sceglie Inter, togliere anche i fallback SF separati.
- **Unica fonte di verità**: definire una volta `--flow-font-sans` (= stack scelto) e usarla ovunque, includendo `tailwind.config → fontFamily.sans` e le occorrenze `font-sans`; eliminare i `font-family` duplicati in `index.css` (righe 257, 301, 943, 949, 956, 1166) sostituendoli con `var(--flow-font-sans)`.
- Limitare il `letter-spacing` negativo a classi semantiche (`.flow-title`) e non a `.font-bold` generico.

---

## 3. Colori e contrasto

### Stato attuale
- Palette principale in `flow-v2-skin.css`: base `#1c1c1e`, foreground `#f5f5f7`, card vetro, stati Apple, `--flow-primary:#0a84ff`.
- **Tre definizioni di brand in conflitto**: `index.css` `@layer base` (`--brand:#10b981`, righe 186–230), blocco `index.css` righe 2155–2177 (`--brand:#10b981`) e `flow-v2-skin.css` (`--brand:#0a84ff`, vince perché caricato dopo), più override runtime inline in `TenantContext` che imposta `--brand/accent = #ffffff` su `:root`. Effetto: il valore effettivo di `--brand` dipende da dove/dopo cosa viene usato (misurato `#0a84ff` in /admin).
- ~487 stili inline `rgba(255,255,255,…)` in 56 file (es. pannelli accordion, chip) che bypassano i token.
- Regole correttive a forza bruta su `text-white/25..55` in [index.css:1756-1786](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/index.css#L1756-L1786).

### Problemi trovati (contrasto misurato — fallimenti AA per testo piccolo <4.5:1)
1. **Testo bianco su riempimenti blu pieni (admin /impostazioni)** — 6 violazioni axe:
   - Bottoni pieni `.bg-accent` (`#0a84ff`): "Genera e stampa QR code", "Salva su cloud", "Sblocca con PIN", "Sincronizza", "Carica sul cloud" → **3.64:1**.
   - Chip reparto "Cucina" (bianco su `#2196f3`) → **3.12:1**.
2. **Etichette grigio muted** `--flow-muted-foreground #98989D` (11–12 px, `.flow-section-label`, `.flow-label`) su Home: da **4.65:1** a ~5.7:1 secondo la zona (AA superato di poco, **AAA fallito**). L'andamento reale dipende dai glow radiali sotto al testo.
3. Testi bianchi con opacità originaria bassa vengono "salvati" solo grazie agli override `[data-theme="dark"]` che alzano l'opacità: fragile e difficile da mantenere.

### Modifiche suggerite (con stima contrasto)
- Per i **riempimenti accent**: usare una tinta più scura per il riempimento con testo bianco, es. `#0071e3` (≈ **4.6:1**, AA ok) invece di `#0a84ff`; esporla come token dedicato `--flow-primary-fill` e applicarlo ai CTA pieni. Per le **swatch reparto**: quando usate come sfondo con testo bianco, scurire (es. `#2196f3 → #1976d2`, ≈ 4.7:1).
- Alzare il **grigio muted** a ~`#b4b7bd`/`rgba(255,255,255,0.78)` per portare i testi piccoli sopra ~7:1 (AAA) con margine.
- **Centralizzare la palette**: un solo blocco di `:root` con i token (`--brand`, `--accent`, `--flow-primary`, testo, superfici); rimuovere i doppioni in `index.css` (base + blocco 2155) e far dipendere `TenantContext` da quei token invece di sovrascriverli con `#ffffff` inline.
- **Convertire gli stili inline bianchi** nei token `var(--text-primary)` / `var(--text-on-glass…)` tramite classi utilità, così il tema resta governabile senza override `!important`.

---

## 4. Forme e dimensioni

### Stato attuale
- Token raggi in `flow-v2-skin.css`: `--flow-radius-sm 8 / md 12 / lg 16 / pill 999` + token legacy `--radius-card` in `index.css` (es. 12px) → **due scale parallele**.
- Uso reale: ~860 occorrenze `rounded-*` in 81 file (da `rounded-sm` a `rounded-[arbitrary]`, `rounded-3xl` per modali).
- Regole globali molto invasive:
  - `button[class*="rounded-"] { border-radius: var(--flow-radius-pill) !important }` → **ogni bottone diventa pillola**, qualunque sia il raggio inteso;
  - `body .bg-white:not(…) { border-radius: var(--flow-radius-lg) !important }` e simili → impongono il raggio card a prescindere dal componente.
- Spaziature: scala Tailwind coerente, ma tanti valori ripetuti "a mano" (`px-4 py-3.5`, `gap-3`, `p-4`, `rounded-[…]`) e layout preset (`data-layout-effective`, `--layout-app-px`) già presenti.

### Problemi trovati
1. **Due scale di raggi** (`--radius-card` vs `--flow-radius-*`) senza un unico responsabile.
2. **Raggi forzati `!important`** (pill su ogni bottone, lg su ogni `.bg-white`): annullano la scala e l'intento del componente; es. un controllo `rounded-md` (chip/badge) diventa pill solo se `<button>` ma resta sm/md se `<span>` → incoerenza tra elementi interattivi e non della stessa forma.
3. Tanti **raggi arbitrari inline** (`rounded-[…]`) e `rounded-2xl/3xl` non mappati sui token.

### Modifiche suggerite
- Unificare i raggi in **un'unica scala token** (`--radius-sm/md/lg/xl/2xl` + `pill`) e mapparla su classi utilità dedicate (`flow-radius-card/panel/modal/pill`); far sparire `--radius-card` separato.
- Rendere la pillola **esplicita** (solo `.rounded-full`/classe `.btn-pill`) invece dell'override globale su ogni `button[class*="rounded-"]`; verificare i bottini compatti che oggi risultano pill involontarie.
- Attribuire ruoli ai raggi: chip=md(8–12), card=lg(16), pannelli/accordion=2xl, modali=3xl — e sostituire gli arbitrari con questi token.
- Riusare le classi layout preset (`--layout-app-px`, `.app-horizontal-pad`) per i padding orizzontali dei contenuti al posto dei valori ripetuti.

---

## 5. Responsività

### Stato attuale
- Fluid scale globale: `--scale-factor: clamp(0.75, 100vw/473px, 1)` e font/spazi/raggi `rem`-based in [index.css:58-86](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/index.css#L58-L86).
- **Un solo breakpoint** Tailwind `md: 768px` ([tailwind.config.js](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/tailwind.config.js#L8-L10)); layout preset via `data-layout-effective` (compact/comfortable) e viewport class (phone/tablet/desktop) impostate in `index.html`.
- Audit visivo: nessun overflow orizzontale a 402px né ~1058px; contenuto centrato a colonna singola; bottom-nav mobile, top-tab desktop; scroll sempre dentro `#root`/contenitori dedicati.

### Problemi trovati
1. Il punto di snodo unico a 768px fa sì che tablet/stage (ad es. 700–1100px) usino quasi sempre il layout mobile o desktop "di colpo": saltare direttamente da `compact` a `comfortable` senza passi intermedi può lasciare card molto larghe in mobile landscape.
2. In landscape mobile / tablet, contenitori `max-w-*` centrati rendono bene ma alcune aree admin (righe con molti controlli) si verificano meglio su ≥1024px; è un rischio, non un difetto misurato.
3. Coesistenza di due meccanismi ridondanti per lo spazio orizzontale (`--layout-app-px` preset + utility `app-horizontal-pad` + `safe-area-pad`) — da consolidare per evitare comportamenti divergenti tra shell diverse.

### Modifiche suggerite
- Valutare un breakpoint intermedio (es. `lg: 1024px`) solo dove servono le griglie dense (griglia turni, admin), lasciando il resto a colonna singola.
- Verificare il **fluid type** nei punti estremi: a `--scale-factor` minimo (0.75) alcune etichette `text-[0.6875rem]` diventano ~8.2px reali — sotto la soglia di comfort (e per alcuni font sotto 12px di leggibilità): valutare un clamp per i testi minimi.
- Uniformare gli helper di spazio laterale (preset vs classi) in un unico set usato da AppShell/AdminLayout/Login.

---

## 6. Priorità consigliate

| # | Intervento | Impatto | Sforzo |
|---|-----------|---------|--------|
| 1 | Rimuovere font decorativi mai usati da `index.html` | performance | basso |
| 2 | Contrasto: riempimenti accent `#0071e3` + reparto `#1976d2` + grigio muted più chiaro | accessibilità (AA/AAA) | basso |
| 3 | Centralizzare token colore/raggio in un unico `:root` ed eliminare doppioni `index.css`/`flow-v2-skin`/`TenantContext` | manutenibilità + coerenza | medio |
| 4 | Sostituire override globali sui raggi (`button[rounded]→pill`, `.bg-white→lg`) con classi di ruolo | coerenza forme | medio |
| 5 | Unificare stack font (una sola `--flow-font-sans`) e `font-serif` semanticamente corretto | coerenza tipografica | basso |
| 6 | Convertire gli ~487 stili inline bianchi in token/classi (progressivo) | manutenibilità | alto |
| 7 | Test mirati tablet/landscape + clamp minimo per testi piccoli | responsività | medio |

---

## 7. Note
- Le misure di contrasto riportate derivano da axe-core (violazioni AA) e da un motore WCAG numerico sui layer dipinti reali; le stime per i colori proposti sono approssimate a ±0.1.
- Fonti principali consultate: [flow-v2-skin.css](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/flow-v2-skin.css), [index.css](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/index.css), [tailwind.config.js](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/tailwind.config.js), [index.html](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/index.html), [TenantContext.tsx](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/context/TenantContext.tsx).

---

## 8. Stato implementazione (aggiornamento)

**Applicato (verificato nel browser, axe 0 violazioni su Home e Impostazioni):**
- ✅ Rimossi i 4 font decorativi mai usati da `index.html` (solo Inter resta caricato).
- ✅ Stack font unificato su **Inter**: `--flow-font-sans` ora inizia con `'Inter'`; `font-serif` riportato a uno stack serif vero in `tailwind.config.js`.
- ✅ `letter-spacing:-0.02em` limitato a titoli (`h1,h2,h3,.text-2xl/xl/lg`), non più su ogni `.font-bold`.
- ✅ Contrasto CTA pieni: nuovo token `--flow-primary-fill:#0071e3` (bianco sopra ≈4.7:1); la regola `.bg-accent/.bg-brand/.bg-primary` usa il fill → verificati su /admin (era 3.64:1).
- ✅ Contrasto grigio muted: `--flow-muted-foreground:#b1b4ba` (≈8.2:1 su sfondo, era 5.9) → ora passa anche AAA per i testi piccoli.
- ✅ Colore reparto blu della palette `#2196F3 → #1976D2` (default nuovi) **e** helper `ensureWhiteTextContrast()` applicato ai chip reparto in `SettingsPage` (righe + modale eliminazione): scurisce a runtime qualunque colore chiaro (anche già salvato in DB) per mantenere il testo bianco ≥AA. Verificato: chip "Cucina" da 3.12:1 → 7.3:1.
- ✅ Badge ruolo admin (`RoleFeatureTemplatesPage`): colori scuriti (`#047857`, `#B45309`) → bianco sopra ≥AA (erano 2.5–3.8:1).
- ✅ (Sessione precedente) Sfondo mesh spostato su `#root` senza `background-attachment:fixed` → niente banda scura in fondo su iOS.

**Differiti (alto rischio di regressioni visive, richiedono QA schermata per schermata):**
- ⏳ Centralizzazione completa dei token colore/raggio (rimozione doppioni `:root` in `index.css` e override `TenantContext`).
- ⏳ Override globali sui raggi (`button[class*="rounded-"]→pill`, `.bg-white→lg`): da rendere espliciti con classi di ruolo.
- ⏳ Conversione dei ~487 stili inline `rgba(255,255,255,…)` in token/classi.
- ⏳ Breakpoint intermedio + clamp minimo testi (`text-[0.6875rem]` a scale 0.75).
