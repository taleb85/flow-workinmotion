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

---

## 9. Audit simmetria & allineamento (2026-09-16)

Scope: gutter orizzontali, allineamento dei bordi, coerenza delle griglie e delle spaziature in tutte le schede e sottopagine.
Metodo: lettura dei layer CSS/JSX + **misurazione dei rettangoli reali nel browser** (header, contenuto, card, bottom nav, `scrollWidth`) a 390, 768, 1058 e 1440 px, in entrambe le modalità `compact`/`comfortable`.

### 9.1 Diagnosi (misure PRIMA delle correzioni)

Token di riferimento: `--layout-app-px` = `1rem` (compact) / `1.5rem` (comfortable), applicato dall'utility `.app-horizontal-pad` ([index.css:317-321](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/index.css#L317-L321)). Attenzione: `html { font-size: 16px * var(--scale-factor) }` → `1rem` vale 13,19px a 390px, 16px da 473px in su.

| Larghezza | Modalità | gutter Panoramica | gutter Presenze | gutter Ferie | gutter header |
|---|---|---|---|---|---|
| 1058×753 | tablet/compact (1rem) | 32 | 24 | 16 | 16 |
| 390×844 | phone/compact (13,19px) | 26 | 16 | 13 | 13 |
| 1440×900 | tablet/compact (16px) | 32 | 24 | 16 | 16 |
| 1440×1080 | desktop/comfortable (24px) | 48 | 32 | 24 | 16 |

Cause individuate:
1. **Doppia applicazione del gutter**: la shell applica `app-horizontal-pad` ([AppShell.tsx:807](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/AppShell.tsx#L807)) e molte pagine lo riapplicavano al proprio interno → 2× (Home, Impostazioni, Sistema), 1,5× (Presenze, per `md:px-2`), 1× (Ferie).
2. **Header non allineato**: `.app-header` forzava `padding-left/right: 1rem !important` ignorando il token → 16px fissi contro 48px del contenuto in comfortable (Δ 32px).
3. **Indentazioni extra**: `px-1` sul saluto della Home (+4px vs card), `px-1` su MobileHome, `px-4`/`px-6` nelle dashboard staff, `px-4`/`px-5` interni al pannello Profilo.
4. **Title vs card**: i titoli di sezione risultavano disallineati rispetto alle card sottostanti (+4/+8px).
5. **Griglie non omogenee**: `grid grid-cols-2 gap-4` fisso accanto a `fluid-grid fluid-grid-2` nella stessa pagina → a 360-400px le card critiche si comprimevano (~140px) mentre le altre andavano a capo.
6. **Bottom nav**: pillola mobile con `left/right: 16px` fissi vs gutter scalato (13,19px) → Δ ~4px dall'header.
7. **Tile asimmetrici** nel modale "Chiudi turno": primo tile bordo+trasparente, secondo a riempimento.

### 9.2 Correzioni applicate

**Regola introdotta:** il gutter orizzontale dell'app è applicato **una sola volta**, dal contenitore di shell, usando il token `--layout-app-px`. Le pagine non lo riapplicano.

CSS
- [flow-v2-skin.css:136-142](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/flow-v2-skin.css#L136-L142) — `.app-header`: `padding-left/right` da `1rem !important` a `var(--layout-app-px) !important` (header allineato al contenuto in compact e comfortable).
- [flow-v2-skin.css:208-212](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/flow-v2-skin.css#L208-L212) — `.bottom-nav-glass-edge` (pillola mobile): `left/right` da `16px !important` a `var(--layout-app-px) !important`.

Shell e pagine (rimozione gutter duplicato)
- [AdminLayout.tsx:91](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/AdminLayout.tsx#L91) — rimossa `app-horizontal-pad` dall'header (già fornita dal wrapper di riga 90): header e contenuto admin ora condividono lo stesso bordo.
- [HomeManagerView.tsx:168](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/HomeManagerView.tsx#L168) — rimossa `app-horizontal-pad`; [:175](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/HomeManagerView.tsx#L175) — rimossa `px-1` dal saluto (il titolo ora allinea con le card).
- [HomeStaffView.tsx:85](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/HomeStaffView.tsx#L85) — rimossa `app-horizontal-pad`.
- [SettingsPage.tsx:872](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/SettingsPage.tsx#L872), [:896](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/SettingsPage.tsx#L896), [:1068](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/SettingsPage.tsx#L1068) — rimossa `app-horizontal-pad` (tutti e tre i rami di render).
- [HolidayRequests.tsx:67](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/HolidayRequests.tsx#L67) — rimossa `app-horizontal-pad` dal ramo "feature disattivata".
- [UnifiedShiftsPage.tsx:18](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/UnifiedShiftsPage.tsx#L18) — rimossi `mx-auto px-0` e `md:px-2` (era +8px solo su desktop).
- [UnifiedShiftGrid.tsx:2250](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/UnifiedShiftGrid.tsx#L2250) — rimossa `px-1` dalla vista card mobile.
- [Statistics.tsx:541](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/Statistics.tsx#L541) — rimossa `px-4`.
- [StaffPersonalDashboard.tsx:85](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/StaffPersonalDashboard.tsx#L85) — rimossi `px-4 md:px-6`.
- [MobileHome.tsx:126](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/mobile/MobileHome.tsx#L126) — rimossa `px-4`; [:146](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/mobile/MobileHome.tsx#L146) — rimossa `px-1` dal saluto.
- [ProfileNavTabPanel.tsx:595](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/ProfileNavTabPanel.tsx#L595) — rimossa `px-4` dal wrapper del menu (resta il gutter di shell; le righe mantengono il proprio padding interno).
- [MobileProfileHeader.tsx:98](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/MobileProfileHeader.tsx#L98) — rimosso `px-4`: il gutter è applicato da `.app-header` (evita doppio padding, che il CSS azzerava con `!important`).

Coerenza di griglie e tile
- [HomeManagerView.tsx:327](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/HomeManagerView.tsx#L327), [:354](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/HomeManagerView.tsx#L354), [:431](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/HomeManagerView.tsx#L431) — `grid grid-cols-2 gap-4` → `fluid-grid fluid-grid-2 gap-4`: le tre sezioni usano ora la stessa regola di colonne/flessione del resto della pagina (stat bar `fluid-grid-4` e riga inferiore `fluid-grid-2`), invece di una griglia a colonne fisse che si comprimeva sotto la soglia di wrap. Verificato a 1920px: 4 KPI a 456px e coppie a 928px, gutter 24/24 su ogni riga.
- [HomeManagerView.tsx:483](file:///Users/talebbarikhan/Desktop/Osteria_Basilico_Final/src/components/HomeManagerView.tsx#L483) — tile "Ingresso" del modale allineato al tile gemello (bordo `white/[0.14]` + sfondo trasparente).

### 9.3 Verifica DOPO le correzioni (misure browser)

| Viewport | `--layout-app-px` | gutter header | bordo sx logo | bordo sx contenuto/card | Δ | overflowX |
|---|---|---|---|---|---|---|
| 390×844 (compact) | 1rem = 13,19px | 13,19 | 13,19 | 13,19 | **0,00** | no |
| 768×1000 (compact) | 1rem = 16px | 16 | 16 | 16 | **0,00** | no |
| 1058×1200 (comfortable) | 1.5rem = 24px | 24 | 24 | 24 | **0,00** | no |
| 1440×1600 (comfortable) | 1.5rem = 24px | 24 | 24 | 24 | **0,00** | no |
| 1440×900 (tablet/compact) | 1rem = 16px | 16 | 16 | 16 | **0,00** | no |

- **Gutter identico in tutte le schede** (Panoramica, Presenze, Ferie, Profilo) e in `/admin`: Δ tra schede = 0,00px a ogni larghezza.
- **Bottom nav mobile**: pillola `left/right` = 13,19px a 390px, identica al gutter di header e contenuto (prima 16px fissi).
- **Nessun overflow orizzontale**: `documentElement.scrollWidth === innerWidth` su tutte le schede e tutte le larghezze.
- Test unitari: `vitest run` → 74/74 passati; `tsc --noEmit` senza errori; nessun errore console legato al layout.

### 9.4 Comportamenti intenzionali (non modificati)

- **Scheda Profilo**: colonna centrata `max-w-lg` (512px) con il wrapper che rispetta il gutter. È un paradigma "form centrato" diverso dalle schede full-bleed, ma simmetrico rispetto all'asse verticale (misurato: distanza dal bordo identica a sinistra e a destra a ogni larghezza). Se in futuro si vuole uniformare, va deciso a livello di design (full-bleed vs colonna).
- **Bottom nav a ≥768px**: full-bleed (`left/right: 0`), coerente con il pattern "tabbar a tutta larghezza" desktop; la pillola con gutter condiviso vale solo sotto 768px.
- **Padding interni delle card** (`px-3`, `px-4`, `px-5` dentro card/accordion/modali): restano invariati perché sono spaziature *interne*, non gutter di pagina.

