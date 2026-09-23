# Regole di arrotondamento delle timbrature

Guida breve per l'amministratore. Si configura da **Impostazioni → Arrotondamento timbrature**
(sezione visibile solo agli Admin).

## Come funziona

L'arrotondamento **non cancella** l'ora reale del click:

| Campo DB (`punch_records`) | Contenuto |
|---|---|
| `timestamp` | ora reale del click (mai sovrascritta dall'arrotondamento) |
| `calculated_time` | orario efficace, cioè quello arrotondato |

Tutti i calcoli (ore lavorate, pausa, foglio presenze) leggono `calculated_time` quando presente,
altrimenti `timestamp`. Le correzioni manuali fatte da un responsabile restano invariate:
l'arrotondamento si applica alle timbrature registrate da **app e kiosk**.

## Configurazione

La sezione ha due tab.

### Regole

- **Arrotondamento attivo**: interruttore generale. Se spento, le regole restano salvate ma non si applicano.
- **Entrata** / **Uscita**: ognuna con
  - *Soglia di arrotondamento*: chip 5′ / 10′ / 15′ / 30′ oppure valore libero (1–60 minuti);
  - *Direzione*: **Eccesso**, **Difetto** o **Matematico** (al più vicino);
  - *Orario di riferimento*: **Inizio turno**, **Fine turno** o **Mezzanotte** — è il punto su cui si
    aggancia la griglia (es. inizio turno 18:00, passo 15′ → griglia 18:00, 18:15, 18:30…).
- **Mai prima dell'inizio turno** (solo entrata): l'entrata anticipata non matura ore prima
  dell'orario del turno. È il comportamento storico di FLOW e resta attivo anche con
  l'arrotondamento spento.
- **Finestra pausa**: arrotonda gli orari usati per dedurre la pausa (`Inizio pausa` / `Fine pausa`).

### Eccezioni

Se il turno ricade in una di queste condizioni **l'arrotondamento non viene applicato**:

- **Giorni settimana** (nessuna selezione = tutti i giorni);
- **Ruoli** (nessuna selezione = tutti i ruoli);
- **Reparti** (nessuna selezione = tutti i reparti).

### Anteprima

Dentro le card **Entrata** e **Uscita** c'è un riquadro *Risultato* che mostra in tempo reale
l'effetto della regola su un orario di esempio (turno 18:00–23:00, entrata 18:07, uscita 23:07):
`ora reale → ora efficace` con la spiegazione della regola applicata, o il motivo per cui non è
stata applicata. Cambiando soglia, direzione o orario di riferimento il riquadro si aggiorna subito.

Il riquadro calcola il risultato **come se la regola fosse attiva**, quindi resta utile anche mentre
l'interruttore generale o quello della singola regola è spento: in quel caso la nota lo segnala
(«Arrotondamento disattivato: anteprima di come si applicherebbe») e il valore mostrato è indicativo.

## Salvataggio e reset

- **Salva regole**: valida la configurazione, la salva su Supabase Storage
  (`app-config/punch_rounding_rules.json`) + mirror in `localStorage`, allinea gli altri
  dispositivi e **riallinea le timbrature già registrate** (vedi sotto).
- **Ripristina valori predefiniti**: ricarica i valori di default nella scheda, **senza salvare**:
  occorre premere *Salva regole* per applicarli.

### Ricalcolo delle timbrature esistenti

L'arrotondamento viene scritto in `calculated_time` nel momento in cui la timbratura viene
registrata: senza un passaggio aggiuntivo una regola salvata varrebbe solo per le timbrature
successive, non per le ore già registrate.

Per questo, al salvataggio l'app riallinea anche le timbrature esistenti. Vengono considerate solo
le timbrature dell'app/kiosk (non quelle inserite a mano, `source = 'manual'`) il cui orario
efficace **non è mai stato corretto**: cioè è ancora l'ora reale del click oppure è esattamente il
risultato delle regole precedenti. Qualsiasi altro valore è una correzione manuale di un
responsabile e resta intatta.

Di conseguenza:

- salvare le regole aggiorna subito le ore dei turni già timbrati;
- disattivare l'arrotondamento e salvare riporta le timbrature all'ora reale (il ricalcolo è
  reversibile), senza toccare le correzioni manuali.

### Validazioni

Il salvataggio viene bloccato con un messaggio se:

- una soglia è fuori dall'intervallo 1–60 minuti;
- l'arrotondamento è attivo ma nessuna regola è selezionata;
- con direzione *Matematico* il passo non divide 60 (usare 5, 10, 15, 20, 30 o 60);
- tutti i giorni della settimana sono in eccezione.

## Valori predefiniti

| Regola | Attiva | Passo | Direzione | Riferimento |
|---|---|---|---|---|
| Arrotondamento | No | — | — | — |
| Entrata | Sì | 5′ | Eccesso | Inizio turno |
| Uscita | Sì | 5′ | Eccesso | Fine turno |
| Inizio pausa | No | 5′ | Matematico | — |
| Fine pausa | No | 5′ | Matematico | — |

## Dettagli tecnici

- Motore di calcolo e validazione: `src/utils/punchRoundingRules.ts`.
- Applicazione alle timbrature: `addPunchRecord` in `src/context/AppContext.tsx`.
- Finestra pausa: `UnifiedShiftGrid.tsx`.
- Interfaccia: `src/components/ui/PunchRoundingSettingsSection.tsx`.
- Persistenza: vedi `docs/SUPABASE_STORAGE_APP_CONFIG.md`.
