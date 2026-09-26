/**
 * Sezioni UI per scheda: default visibili; `users.ui_section_overrides[key]=false` nasconde.
 * Solo chiavi nel registro sono persistite (sanitizzazione DB).
 */
import type { User } from '../types';
import { isManagementRole } from './permissions';

export type UiWidgetAudience = 'management' | 'staff' | 'all';

export interface UiScreenWidgetDef {
  key: string;
  audience: UiWidgetAudience;
  /** Raggruppamento in Admin → Cosa vede chi */
  screenGroup: string;
  /** Etichetta scheda (IT) */
  screenLabel: string;
  /** Etichetta sezione (IT) */
  label: string;
}

/** Tutte le sezioni nota all’app (ordine = ordine elenco in admin). */
export const UI_SCREEN_WIDGETS: UiScreenWidgetDef[] = [
  // ── Home gestionale (tab Home, team_view) ─────────────────────────────
  {
    key: 'home_mgmt.header',
    audience: 'management',
    screenGroup: 'home_mgmt',
    screenLabel: 'Home — Dashboard gestionale',
    label: 'Intestazione desktop (titolo + data)',
  },
  {
    key: 'home_mgmt.admin_banner',
    audience: 'management',
    screenGroup: 'home_mgmt',
    screenLabel: 'Home — Dashboard gestionale',
    label: 'Banner “Profilo gestionale” (solo Admin)',
  },
  {
    key: 'home_mgmt.team_board',
    audience: 'management',
    screenGroup: 'home_mgmt',
    screenLabel: 'Home — Dashboard gestionale',
    label: 'Bacheca team',
  },
  {
    key: 'home_mgmt.stats_bar',
    audience: 'management',
    screenGroup: 'home_mgmt',
    screenLabel: 'Home — Dashboard gestionale',
    label: 'Barra indicatori (in turno, ritardi, OUT, approvati)',
  },
  {
    key: 'home_mgmt.dinner_close',
    audience: 'management',
    screenGroup: 'home_mgmt',
    screenLabel: 'Home — Dashboard gestionale',
    label: 'Turni sera — chiusura richiesta',
  },
  {
    key: 'home_mgmt.critical',
    audience: 'management',
    screenGroup: 'home_mgmt',
    screenLabel: 'Home — Dashboard gestionale',
    label: 'Richiedono attenzione',
  },
  {
    key: 'home_mgmt.today_shifts',
    audience: 'management',
    screenGroup: 'home_mgmt',
    screenLabel: 'Home — Dashboard gestionale',
    label: 'Turni di oggi',
  },
  {
    key: 'home_mgmt.card_presenze',
    audience: 'management',
    screenGroup: 'home_mgmt',
    screenLabel: 'Home — Dashboard gestionale',
    label: 'Card presenze / barre progresso',
  },
  {
    key: 'home_mgmt.card_ferie',
    audience: 'management',
    screenGroup: 'home_mgmt',
    screenLabel: 'Home — Dashboard gestionale',
    label: 'Card ferie e permessi',
  },
  {
    key: 'home_mgmt.card_kpi',
    audience: 'management',
    screenGroup: 'home_mgmt',
    screenLabel: 'Home — Dashboard gestionale',
    label: 'Card KPI (ore settimana, turni)',
  },

  // ── Home compatta (gestionale senza tabellone su Home) ─────────────────
  {
    key: 'home_compact.greeting',
    audience: 'management',
    screenGroup: 'home_compact',
    screenLabel: 'Home — Vista compatta',
    label: 'Saluto e data',
  },
  {
    key: 'home_compact.board',
    audience: 'management',
    screenGroup: 'home_compact',
    screenLabel: 'Home — Vista compatta',
    label: 'Bacheca (lettura)',
  },
  {
    key: 'home_compact.today_shifts',
    audience: 'management',
    screenGroup: 'home_compact',
    screenLabel: 'Home — Vista compatta',
    label: 'Turni di oggi',
  },
  {
    key: 'home_compact.next_shift',
    audience: 'management',
    screenGroup: 'home_compact',
    screenLabel: 'Home — Vista compatta',
    label: 'Prossimo turno',
  },
  {
    key: 'home_compact.shift_list',
    audience: 'management',
    screenGroup: 'home_compact',
    screenLabel: 'Home — Vista compatta',
    label: 'Lista “I miei turni”',
  },
  {
    key: 'home_compact.approved_holidays',
    audience: 'management',
    screenGroup: 'home_compact',
    screenLabel: 'Home — Vista compatta',
    label: 'Prossime ferie approvate',
  },

  // ── Staff: tab Home (Panoramica) ───────────────────────────────────────
  {
    key: 'staff_home.greeting',
    audience: 'staff',
    screenGroup: 'staff_home',
    screenLabel: 'Home personale',
    label: 'Saluto e data',
  },
  {
    key: 'staff_home.punch_card',
    audience: 'staff',
    screenGroup: 'staff_home',
    screenLabel: 'Home personale',
    label: 'Card timbratura (entrata / uscita)',
  },
  {
    key: 'staff_home.today_shift',
    audience: 'staff',
    screenGroup: 'staff_home',
    screenLabel: 'Home personale',
    label: 'Turno di oggi',
  },
  {
    key: 'staff_home.upcoming',
    audience: 'staff',
    screenGroup: 'staff_home',
    screenLabel: 'Home personale',
    label: 'Prossimi turni',
  },
  {
    key: 'staff_home.coworkers',
    audience: 'staff',
    screenGroup: 'staff_home',
    screenLabel: 'Home personale',
    label: 'Colleghi in turno oggi',
  },

  // ── Staff: tab Turni ─────────────────────────────────────────────────
  {
    key: 'staff_shifts.summary',
    audience: 'staff',
    screenGroup: 'staff_shifts',
    screenLabel: 'Turni (personale)',
    label: 'Riepilogo ore approvate',
  },
  {
    key: 'staff_shifts.table',
    audience: 'staff',
    screenGroup: 'staff_shifts',
    screenLabel: 'Turni (personale)',
    label: 'Tabellone turni',
  },

  // ── Staff: tab Profilo ────────────────────────────────────────────────
  {
    key: 'staff_profile.panel',
    audience: 'staff',
    screenGroup: 'staff_profile',
    screenLabel: 'Profilo (personale)',
    label: 'Pannello impostazioni profilo',
  },

  // ── Staff: tab Ferie ────────────────────────────────────────────────
  {
    key: 'staff_holidays.header_actions',
    audience: 'staff',
    screenGroup: 'staff_holidays',
    screenLabel: 'Ferie (personale)',
    label: 'Intestazione e nuova richiesta',
  },
  {
    key: 'staff_holidays.list',
    audience: 'staff',
    screenGroup: 'staff_holidays',
    screenLabel: 'Ferie (personale)',
    label: 'Elenco richieste',
  },

  // ── Tab Turni (tabellone team) ───────────────────────────────────────
  {
    key: 'turni.toolbar_block',
    audience: 'management',
    screenGroup: 'turni',
    screenLabel: 'Tabellone turni',
    label: 'Barra strumenti (filtri, azioni, export)',
  },
  {
    key: 'turni.date_nav_bar',
    audience: 'management',
    screenGroup: 'turni',
    screenLabel: 'Tabellone turni',
    label: 'Barra date / navigazione settimana',
  },
  {
    key: 'turni.schedule_grid',
    audience: 'management',
    screenGroup: 'turni',
    screenLabel: 'Tabellone turni',
    label: 'Griglia turni e contenuto principale',
  },
  {
    key: 'turni.shift_modal',
    audience: 'management',
    screenGroup: 'turni',
    screenLabel: 'Tabellone turni',
    label: 'Popup dettaglio turno (modifica orari)',
  },

  // ── Ore ─────────────────────────────────────────────────────────────
  {
    key: 'stats.title',
    audience: 'all',
    screenGroup: 'stats',
    screenLabel: 'Ore',
    label: 'Titolo pagina',
  },
  {
    key: 'stats.mgmt_filters',
    audience: 'management',
    screenGroup: 'stats',
    screenLabel: 'Ore',
    label: 'Preset periodo, date, PDF',
  },
  {
    key: 'stats.mgmt_kpi_cards',
    audience: 'management',
    screenGroup: 'stats',
    screenLabel: 'Ore',
    label: 'Card KPI (ore approvate, costo, in attesa)',
  },
  {
    key: 'stats.detail_panels',
    audience: 'management',
    screenGroup: 'stats',
    screenLabel: 'Ore',
    label: 'Pannelli dettaglio espandibili',
  },
  {
    key: 'stats.table',
    audience: 'all',
    screenGroup: 'stats',
    screenLabel: 'Ore',
    label: 'Tabella ore per settimana',
  },
  {
    key: 'stats.staff_summary',
    audience: 'staff',
    screenGroup: 'stats',
    screenLabel: 'Ore',
    label: 'Riepilogo ore (vista staff)',
  },

  // ── Presenze (Timesheet) ────────────────────────────────────────────
  {
    key: 'timesheet.header',
    audience: 'all',
    screenGroup: 'timesheet',
    screenLabel: 'Presenze',
    label: 'Intestazione, periodo, navigazione',
  },
  {
    key: 'timesheet.stats_today',
    audience: 'management',
    screenGroup: 'timesheet',
    screenLabel: 'Presenze',
    label: 'Card indicatori giornalieri (Presenze)',
  },
  {
    key: 'timesheet.dinner_close',
    audience: 'management',
    screenGroup: 'timesheet',
    screenLabel: 'Presenze',
    label: 'Sezione chiusura turni sera',
  },
  {
    key: 'timesheet.main_grid',
    audience: 'all',
    screenGroup: 'timesheet',
    screenLabel: 'Presenze',
    label: 'Tabella / schede presenze',
  },
  {
    key: 'timesheet.punch_modal',
    audience: 'management',
    screenGroup: 'timesheet',
    screenLabel: 'Presenze',
    label: 'Popup revisione timbratura (conferma ore)',
  },
  {
    key: 'timesheet.staff_summary_box',
    audience: 'staff',
    screenGroup: 'timesheet',
    screenLabel: 'Presenze',
    label: 'Riepilogo settimana personale',
  },

  // ── Ferie (gestione) ─────────────────────────────────────────────────
  {
    key: 'ferie.header',
    audience: 'management',
    screenGroup: 'ferie',
    screenLabel: 'Ferie e permessi',
    label: 'Intestazione e nuova richiesta',
  },
  {
    key: 'ferie.calendar',
    audience: 'management',
    screenGroup: 'ferie',
    screenLabel: 'Ferie e permessi',
    label: 'Calendario mensile',
  },
  {
    key: 'ferie.list',
    audience: 'management',
    screenGroup: 'ferie',
    screenLabel: 'Ferie e permessi',
    label: 'Elenco richieste / dettagli',
  },

  // ── Menu a popup e interazioni speciali ──────────────────────────────
  {
    key: 'global.quick_switch',
    audience: 'all',
    screenGroup: 'global_popups',
    screenLabel: 'Menu e Popup',
    label: 'Cambio rapido utente (pressione lunga su Profilo)',
  },
  {
    key: 'global.notifications',
    audience: 'all',
    screenGroup: 'global_popups',
    screenLabel: 'Menu e Popup',
    label: 'Centro notifiche (campanella)',
  },
];

const WIDGET_KEY_SET = new Set(UI_SCREEN_WIDGETS.map((w) => w.key));

export function widgetAppliesToUser(def: UiScreenWidgetDef, role: string): boolean {
  const mgmt = isManagementRole(role);
  if (def.audience === 'all') return true;
  if (def.audience === 'management') return mgmt;
  return !mgmt;
}

/** Per anteprime UI: mostra il blocco solo se il widget è previsto per questo ruolo. */
export function uiWidgetKeyAppliesToUser(role: string, key: string): boolean {
  const def = UI_SCREEN_WIDGETS.find((w) => w.key === key);
  if (!def) return true;
  return widgetAppliesToUser(def, role);
}

/**
 * Se la sezione non appartiene al ruolo → sempre true (nessun effetto).
 * Se `ui_section_overrides[key] === false` → nascosta (tranne **admin**: vede sempre le sezioni previste per il ruolo).
 */
export function isUiWidgetVisible(user: Pick<User, 'role' | 'ui_section_overrides'>, key: string): boolean {
  const def = UI_SCREEN_WIDGETS.find((w) => w.key === key);
  if (!def) return true;
  if (!widgetAppliesToUser(def, user.role)) return true;
  if (user.ui_section_overrides?.[key] === false) return false;
  return true;
}

export function sanitizeUiSectionOverrides(raw: unknown): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const o = raw as Record<string, unknown>;
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(o)) {
    if (WIDGET_KEY_SET.has(k) && typeof v === 'boolean') out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Toggle: false = nascondi (salva override), true = mostra (rimuovi override). */
export function computeNextUiSectionOverrides(
  user: User,
  key: string,
  visible: boolean
): Record<string, boolean> | null {
  if (!WIDGET_KEY_SET.has(key)) return user.ui_section_overrides ? { ...user.ui_section_overrides } : null;
  const prev = { ...(user.ui_section_overrides ?? {}) };
  if (visible) {
    delete prev[key];
  } else {
    prev[key] = false;
  }
  return Object.keys(prev).length ? prev : null;
}

export function uiWidgetsByGroup(): Map<string, UiScreenWidgetDef[]> {
  const m = new Map<string, UiScreenWidgetDef[]>();
  for (const w of UI_SCREEN_WIDGETS) {
    const arr = m.get(w.screenGroup) ?? [];
    arr.push(w);
    m.set(w.screenGroup, arr);
  }
  return m;
}
