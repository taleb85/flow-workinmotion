# Report di localizzazione — FLOW Work in Motion

**Data:** 16 agosto 2026 · **File interessato:** `src/utils/translations.ts` (unico file di traduzione del progetto)

## 1. Inventario dei file di traduzione

| Percorso | Tipo | Stato |
|---|---|---|
| `src/utils/translations.ts` | TS — 4 blocchi (`baseIt`, `baseEn`, `baseEs`, `baseFr`) | **modificato** |
| `src/translations/` | directory | vuota (file rimossi nella refactor precedente) |
| `.json` / `.po` / `.yaml` | — | nessuno presente nel progetto |

Il progetto centralizza tutte le traduzioni in un unico file: `translations.ts`, con un oggetto per lingua (italiano, inglese, spagnolo, francese).

## 2. Parità delle chiavi (prima → dopo)

| Lingua | Chiavi prima | Chiavi mancanti prima | Chiavi dopo |
|---|---|---|---|
| Italiano | 1468 | **8** (tutte `wst_*`) | 1476 |
| Inglese | 1476 | 0 | 1476 |
| Spagnolo | 1468 | **8** (tutte `wst_*`) | 1476 |
| Francese | 1019 | **460** | 1476 |

**Risultato: 1476 chiavi identiche in tutte e 4 le lingue — parità al 100%.**

### Chiavi aggiunte per il francese (460)
Traduzione completa di tutti i testi mancanti: azioni (`Approuver`, `Créer un service`), stati (`En attente`, `Approuvé`, `Brouillon`, `Congelé`), schermate Home/Presenze/Ferie/Ore/Profilo, messaggi di errore e conferma, permessi, template, statistiche, PDF presenze, ecc.

### Chiavi aggiunte per italiano e spagnolo (8 ciascuna)
Blocco "congelamento/sblocco" della griglia settimanale (`wst_*`): `wst_freeze_btn`, `wst_unfreeze_btn`, `wst_frozen_badge`, `wst_freeze_pin_title`, `wst_freeze_pin_subtitle`, `wst_pin_label`, `wst_unfreeze_pin_invalid`, `wst_unfreeze_success`.

## 3. Correzioni linguistiche puntuali

| Chiave | Problema | Corretta in |
|---|---|---|
| `email_placeholder` (EN) | valore in **italiano** | «Enter your company email…» |
| `email_placeholder` (ES) | valore in **italiano** | «Introduce tu email corporativo…» |
| `home_todays_shifts` (IT) | maiuscola incoerente «Turni di Oggi» | «Turni di oggi» |
| `home_todays_shifts` (ES) | maiuscola incoerente «Turnos de Hoy» | «Turnos de hoy» |

## 4. Coerenza terminologica e registro

- **Francese**: registro allineato al *vous* («Saisissez votre PIN…», «Touchez le bouton…», «Sélectionnez…») coerente con i testi FR esistenti; terminologia **«service»** per "turno" (termine dominante nel FR esistente: 20 occorrenze vs 7 di «créneau») applicata a tutte le 460 nuove traduzioni.
- **Placeholder**: 0 disallineamenti — ogni `{placeholder}` presente in una lingua esiste identico nelle altre 4 (es. `{name}`, `{n}`, `{date}`, `{current}`, `{total}`).
- **Ruoli** uniformi: IT «Cameriere/Vice responsabile», EN «Waiter/Assistant manager», ES «Camarero/Subencargado», FR «Serveur/Assistant manager».

## 5. Verifiche eseguite

- ✅ `npm run typecheck` pulito (nessuna chiave duplicata, nessun errore di sintassi)
- ✅ 0 chiavi mancanti in ogni lingua (1476/1476)
- ✅ 0 mismatch di placeholder
- ✅ Controllo visivo in browser in **francese**: tab «Vue d'ensemble / Feuille de présence / Congés / Profil», Home «Bonjour, LINDA !», Profilo «Serveur · Salle», Ferie «Aucune demande effectuée» — nessun testo grezzo o chiave non renderizzata

## 6. Note

- Il blocco FR esistente usava un mix preesistente di «service» e «créneau»; le nuove traduzioni usano coerentemente «service». L'unificazione dei valori FR preesistenti è stata lasciata invariata per non alterare testi già pubblicati.
- Il profilo di test (LINDA) è stato ripristinato alla lingua italiana nel database al termine delle verifiche.

## 7. Aggiornamento (16/08 — secondo giro)

Ulteriori elementi non tradotti individuati dal controllo visivo e corretti:

| Elemento | Prima | Dopo (EN) |
|---|---|---|
| Card «Questa settimana» (Home): giorni `Lun 10`, `Mar 11`… | `DAY_LABELS` hardcoded italiano | `Mon 10`, `Tue 11`, `Wed 12`… (locale attivo via date-fns) |
| Titolo sezione Presenze: «Le mie presenze» | chiave `my_attendance_label` mancante → fallback italiano | **«My attendance»** (chiave aggiunta in it/en/es/fr) |
| Template turni (Impostazioni): giorni `Dom, Lun, Mar`… e «N turni» | hardcoded italiano | giorni localizzati + singolare/plurale via `shift_singular`/`shift_plural` |

**File modificati:** `src/components/mobile/MobileHome.tsx`, `src/components/SettingsPage.tsx`, `src/utils/translations.ts` (+1 chiave × 4 lingue).

Verifiche: typecheck pulito; controllo visivo in EN (Home «Mon 10», Presenze «My attendance») superato; lingua di test ripristinata a IT.

## 8. Aggiornamento (16/08 — terzo giro, area gestionale/timesheet)

Altri testi non tradotti trovati nella griglia turni (vista gestionale), nel pannello notifiche e nel profilo:

| Elemento | Prima | Fix |
|---|---|---|
| Tab pannello notifiche: «Notifiche» / «Messaggi» | hardcoded in `DirectMessagesPanel` | chiavi `notifications` / `messages` (4 lingue) |
| Profilo → scorciatoia «Pannello Impostazioni» / «Area gestionale riservata» | hardcoded in `ProfileNavTabPanel` | chiavi `settings_panel_title` / `settings_panel_subtitle` |
| Reparto utente «sala» (card griglia) | valore grezzo | `translateDepartmentValue(…, lingua attiva)` → EN «Floor» |
| Toggle «Sett.»/«Week» + «Periodo» | chiavi `view_week_short` / `view_period` mancanti | aggiunte (IT/EN/ES/FR) |
| Pulsante «Oggi» | chiave `today_btn` mancante | aggiunta |
| Pulsante «+ Aggiungi» | chiavi `add_shift` / `add` / `add_preset` mancanti | aggiunte |
| Intestazione «Stato» | chiave `status` mancante | aggiunta |
| Banner «Stato: Non timbrato» | chiave `not_clocked` mancante | aggiunta |
| Pulsante «Conferma timbrature» | chiave `confirm_punches` mancante | aggiunta |
| Mesi «GEN, FEB, MAG…» (popover periodo) | `MONTHS_IT` hardcoded | `format(…, 'MMM', { locale })` con lingua attiva |
| «{n} sett.» (durata periodo) | hardcoded | chiave esistente `ts_period_weeks_abbr` ora utilizzata |

**File modificati:** `src/utils/translations.ts` (+13 chiavi × 4 lingue), `src/components/UnifiedShiftGrid.tsx`, `src/components/DirectMessagesPanel.tsx`, `src/components/ProfileNavTabPanel.tsx`.

Verifiche: typecheck pulito; controllo visivo EN con utente admin: «Week», «Period», «Today», «Add», «Floor», tab «Notifications/Messages»; lingue di test (TALEB, LINDA) ripristinate a IT.

## 9. Aggiornamento (16/08 — quarto giro, error boundary)

Anche l'alert di errore dell'app era hardcoded in italiano (`RouteErrorBoundary`):

| Elemento | Prima | Fix |
|---|---|---|
| Titolo alert | «Errore in {sezione}» | chiave `route_error_title` (it/en/es/fr) + nomi sezione localizzati (Turni/Presenze → Shifts/Attendance, Ferie → Holidays, ecc.) |
| Messaggio generico | «Errore imprevisto nel caricamento.» | chiave `route_error_unexpected` |
| Pulsante | «Riprova» | chiave `retry` (EN «Retry», ES «Reintentar», FR «Réessayer») |
| Fallback sezione | «questa sezione» | chiave `route_section_generic` |

`RouteErrorBoundary` è stato rifattorizzato in wrapper funzionale (legge `useAppUser().effectiveLanguage` + `getTranslations`) + classe interna (React richiede classi per gli error boundary).

**File modificati:** `src/components/RouteErrorBoundary.tsx` (riscritto), `src/utils/translations.ts` (+4 chiavi × 4 lingue).

**Nota sul messaggio «effectiveLanguage is not defined»:** non riproducibile nei test dopo le correzioni (il codice ora è coerente in tutti i punti); probabilmente residuo di uno stato transitorio del dev server durante le modifiche ai file. Un tap su «Riprova» (ora tradotto) o un refresh risolve.

Verifiche: typecheck pulito; parità 1494 chiavi × 4 lingue (0 mancanti); griglia Turni in EN renderizzata senza alert.

## 10. Aggiornamento (16/08 — quinto giro, preset turni e modale creazione)

Altri testi non tradotti nella sezione preset orari (modale di creazione turno) e nel registro modifiche:

| Elemento | Prima | Fix |
|---|---|---|
| Etichetta preset | «Preset pranzo» / «Preset cena» | chiavi `wst_preset_lunch` / `wst_preset_dinner` (EN «Lunch preset» / «Dinner preset») |
| Pulsante toggle | «Modifica» / «Fatto» | chiavi `edit` / `done` (EN «Edit» / «Done») |
| Pulsante modale | «+ Crea» | chiave `create` (EN «Create») |
| Stato vuoto preset | «Nessun orario salvato» | chiave `no_presets` |
| Eliminazione preset | «Elimina» (aria) | chiave `delete` |
| Registro modifiche | «Modifica» (colonna/azione) | chiavi `audit_col_change` / `hist_action_shift_edit` |

**File modificati:** `src/utils/translations.ts` (+9 chiavi × 4 lingue). I componenti usavano già chiavi con fallback — mancavano le chiavi.

Verifiche: typecheck pulito; parità 1503 chiavi × 4 lingue (0 mancanti); modale preset in EN: «Lunch preset», «Edit», «Create» ✓; lingua di test (TALEB) ripristinata a IT.

## 11. Sistema di scala proporzionale (CSS)

Implementato in `src/index.css` il sistema di adattamento proporzionale alla larghezza dello schermo:

| Variabile | Valore | Effetto |
|---|---|---|
| `--app-base-width` | `473px` | larghezza di progetto (layout disegnato) |
| `--scale-factor` | `clamp(0.75, calc(100vw / 473px), 1)` | schermi < 473px si rimpiccioliscono, desktop resta invariato |
| `--font-base/small/large` | `calc(Npx × scale)` | scala font |
| `--spacing-xs…lg` | `calc(Npx × scale)` | scala spaziature |
| `--radius-card` / `--radius-panel` | `calc(Npx × scale)` | scala raggi angoli |
| `--padding-card` | coppia calcolata | scala padding card |

**Come agisce sull'app:** `html { font-size: var(--font-base) }` — tutte le utility Tailwind sono **rem-based** (spacing, font, dimensioni) e si adattano automaticamente in proporzione; il desktop (≥473px) è bloccato a scala 1 (nessuna modifica). Collegate alle variabili anche le classi custom `button`/`nav a` (radius), `.panel` (radius) e l'animazione `.glow-pulse`.

**Verifica misurata:** a 390px → root font 13.19px (0.825×) e radius pulsante 9.89px; a 1280px → 16px e 12px invariati. Screenshot in `verifica-scala/`.

**Nota:** i valori `px` arbitrari di Tailwind (es. `text-[11px]`) non scalano; il sistema copre le utility rem-based (la stragrande maggioranza del layout).

### Copertura 100% — conversione px → rem (completata)

Tutti i valori arbitrari `[Npx]` sono stati convertiti in rem (÷16), così ogni elemento scala proporzionalmente:

| Tipo | Occorrenze | Esempio |
|---|---|---|
| Classi Tailwind `[Npx]` (73 file) | **811** | `text-[11px]` → `text-[0.6875rem]`, `pb-[48px]` → `pb-[3rem]`, `max-w-[320px]` → `max-w-[20rem]` |
| `@apply` in `index.css` | 28 | `h-[22px]` → `h-[1.375rem]`, `text-[13px]` → `text-[0.8125rem]` |
| Stili inline statici (9 file) | 18 | `fontSize: 7` → `fontSize: '0.4375rem'`, `borderRadius: 32` → `'2rem'` |

**Esclusi volutamente:** logica non-CSS (`context/LayoutPresetContext` breakpoint 640px, canvas QR in `utils/`, geometria SVG in `FlowLogoSvg`), valori `0` (0px ≡ 0rem) e `lineHeight` unitless.

**Verifica finale misurata:** mobile 390px → `text-[0.6875rem]` rende a **9.07px** (scala attiva), desktop 1280px → **11px** invariato; nessun overflow orizzontale, nessun errore di pagina, typecheck pulito. Screenshot aggiornati in `verifica-scala/` (`*-rem.png`).

## 12. Unificazione card riepilogo ore (Home vs Presenze)

Le card riepilogo ore erano renderizzate con **due design diversi**: `MobileHome` (card compatte «Questa settimana»/`text-xl`/`h-1.5`) e `MobileStatsCards` (card «Settimana»/`p-5`/`text-lg`/`h-2`, usato in Presenze).

**Fix (design di riferimento = Presenze/`MobileStatsCards`):** unico componente `MobileStatsCards` usato ovunque; `MobileHome` ora lo usa con le stesse etichette (`ts_period_week`/`ts_period_month` → «Settimana»/«Mese») e stesso formato `hhmm`.

**Verifica misurata (390px):** Home e Presenze identiche — padding `16.49px` (`p-5`), etichetta `text-xs font-medium uppercase`, valore `14.84px` peso 700 (`text-lg`), barra `6.59px` (`h-2`), testo «Settimana 00:00 / 40:00».

### Tetto settimanale nascosto (scelta utente)

Il cap `40:00` (tetto settimanale, hardcoded `40 * 60`) non viene più mostrato nella card Settimana: ora compare solo il valore delle ore lavorate (`00:00`) + la barra di progresso (che continua a usare il cap internamente per la percentuale). Modifica in `MobileStatsCards` → vale per Home, Presenze e vista desktop. Verifica: card «Settimana 00:00», nessun «40:00» in pagina.

## 13. Modale "Nuova richiesta ferie" su mobile → bottom sheet

La variante mobile era a schermo intero trasparente: campi schiacciati in alto e un grande vuoto centrale prima dei pulsanti. Ridisegnata prima come **bottom sheet** standard (foglio ancorato in basso, grip, sfondo solido), poi — su richiesta — come **modale centrata con effetto vetro**:

- Overlay **senza sfocatura** (`bg-slate-900/60`, solo oscuramento)
- Modale **centrata nello schermo** (`items-center justify-center` + padding laterale)
- Form con **effetto vetro**: classe app `modal-glass-panel` → sfondo traslucido `rgba(5,5,5,0.1)`, `backdrop-filter: blur(32px)`, bordo `1px rgba(255,255,255,0.10)`, angoli `rounded-3xl`
- Animazione fade + scale (come il dialog desktop); rimossa la grip da bottom sheet

File: `src/components/RequestHolidayModal.tsx`. Verifica (390px): overlay `backdropFilter: none`, form centrato (x/y ✓), `blur(32px)`. Screenshot: `verifica-scala/ferie-modal-glass.png`.

### Rettifiche overlay e animazione (richieste utente)

- Overlay `bg-slate-900/60` (tinta bluastra) → **`bg-black/10`** neutro: lo sfondo dell'app resta visibile, solo la modale è sfuocata (vetro `blur(32px)` sul form)
- Animazione aperta/chiusura allineata allo standard app (`CenteredModalPortal`): overlay fade 0.2s + pannello `scale 0.92→1` con `blur(10px)→0` in 0.4s (easing `[0.22,1,0.36,1]`), su mobile e desktop
- Verifica: durante l'apertura `blur` in corso → a riposo `blur(0px)`/opacity 1
