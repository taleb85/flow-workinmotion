import { readLastProfileId } from '../constants/appSession';

export interface BackgroundTheme {
  id: string;
  label: Record<string, string>;
  appBg: string;
  previewGradient: string;
  /** Mesh esplicita (usata al posto dei `glows`): serve per riprodurre uno sfondo
   *  già definito altrove, es. la mesh ufficiale della skin v2. */
  mesh?: string;
  glows: Array<{
    color: string;
    opacity: number;
    blur: number;
    position: { top?: string; bottom?: string; left?: string; right?: string };
    size: string;
  }>;
  accentLine: string;
  starColor: string;
  waveOpacity: number;
}

/** Sfondo ufficiale dell'app: base + mesh a 4 aloni (da `flow-v2-skin.css`, alzata di luminosità). */
const OFFICIAL_MESH =
  'radial-gradient(at 12% 8%, rgba(140,74,164,0.42) 0, transparent 45%), ' +
  'radial-gradient(at 88% 12%, rgba(52,110,192,0.42) 0, transparent 45%), ' +
  'radial-gradient(at 78% 88%, rgba(178,100,64,0.36) 0, transparent 45%), ' +
  'radial-gradient(at 20% 82%, rgba(98,74,168,0.36) 0, transparent 45%)';

/** Tema applicato a chi non ha mai scelto uno sfondo. */
const DEFAULT_THEME_ID = 'ufficiale';

const THEMES: BackgroundTheme[] = [
  {
    id: 'ufficiale',
    label: { it: 'Ufficiale', en: 'Official', es: 'Oficial', fr: 'Officiel' },
    appBg: '#26262b',
    /* Sfondo ufficiale: base + mesh a 4 aloni, niente aurora/onda (la skin la nasconde) */
    previewGradient: OFFICIAL_MESH,
    mesh: OFFICIAL_MESH,
    glows: [],
    accentLine: 'rgba(255,255,255,0.06)',
    starColor: '255,255,255',
    waveOpacity: 0,
  },
  {
    id: 'slate',
    label: { it: 'Ardesia', en: 'Slate', es: 'Pizarra', fr: 'Ardoise' },
    appBg: '#0a0a0e',
    /* Nessuna luce in cima (ellisse centrata più in basso): la zona alta resta
       pulita anche sui temi chiari (evita l'effetto "sfocatura/difetto" in alto) */
    previewGradient: 'radial-gradient(ellipse at 50% 58%, rgba(148,163,184,0.10) 0%, rgba(80,90,110,0.06) 30%, transparent 70%)',
    glows: [
      /* Nessun glow in alto: i bagliori blurred in cima allo schermo davano
         l'effetto "sfocatura sopra l'header" su iOS. Aurora solo in basso/meta. */
      { color: '#5eead4', opacity: 0.07, blur: 160, position: { bottom: '20%', right: '8%' }, size: '24rem 28rem' },
      { color: '#67e8f9', opacity: 0.05, blur: 140, position: { top: '25%', left: '-6rem' }, size: '20rem 24rem' },
      { color: '#a78bfa', opacity: 0.04, blur: 130, position: { bottom: '-4rem', left: '18%' }, size: '18rem 22rem' },
      { color: '#94a3b8', opacity: 0.04, blur: 120, position: { bottom: '8%', right: '-4rem' }, size: '14rem 18rem' },
    ],
    accentLine: 'rgba(148,163,184,0.07)',
    starColor: '148,163,184',
    waveOpacity: 0.05,
  },
  {
    id: 'notte',
    label: { it: 'Notte', en: 'Midnight', es: 'Noche', fr: 'Nuit' },
    appBg: '#070b1a',
    /* Nessuna luce in cima: vedi tema 'slate' */
    previewGradient: 'radial-gradient(ellipse at 50% 58%, rgba(129,140,248,0.14) 0%, rgba(59,73,160,0.07) 35%, transparent 72%)',
    glows: [
      /* Nessun glow in alto — vedi tema 'slate' */
      { color: '#818cf8', opacity: 0.09, blur: 165, position: { bottom: '22%', right: '6%' }, size: '26rem 30rem' },
      { color: '#38bdf8', opacity: 0.06, blur: 150, position: { top: '28%', left: '-7rem' }, size: '22rem 26rem' },
      { color: '#6366f1', opacity: 0.05, blur: 140, position: { bottom: '-5rem', left: '20%' }, size: '18rem 22rem' },
      { color: '#4f46e5', opacity: 0.04, blur: 130, position: { bottom: '10%', right: '-4rem' }, size: '14rem 18rem' },
    ],
    accentLine: 'rgba(129,140,248,0.08)',
    starColor: '165,180,252',
    waveOpacity: 0.05,
  },
  {
    id: 'bosco',
    label: { it: 'Bosco', en: 'Forest', es: 'Bosque', fr: 'Forêt' },
    appBg: '#06120e',
    /* Nessuna luce in cima: vedi tema 'slate' */
    previewGradient: 'radial-gradient(ellipse at 50% 58%, rgba(45,212,191,0.12) 0%, rgba(16,90,70,0.06) 35%, transparent 72%)',
    glows: [
      /* Nessun glow in alto — vedi tema 'slate' */
      { color: '#2dd4bf', opacity: 0.09, blur: 165, position: { bottom: '22%', right: '6%' }, size: '26rem 30rem' },
      { color: '#4ade80', opacity: 0.05, blur: 150, position: { top: '28%', left: '-7rem' }, size: '22rem 26rem' },
      { color: '#34d399', opacity: 0.05, blur: 140, position: { bottom: '-5rem', left: '20%' }, size: '18rem 22rem' },
      { color: '#0ea5e9', opacity: 0.035, blur: 130, position: { bottom: '10%', right: '-4rem' }, size: '14rem 18rem' },
    ],
    accentLine: 'rgba(45,212,191,0.08)',
    starColor: '153,246,228',
    waveOpacity: 0.05,
  },
  {
    id: 'ambra',
    label: { it: 'Ambra', en: 'Amber', es: 'Ámbar', fr: 'Ambre' },
    appBg: '#120e07',
    /* Nessuna luce in cima: vedi tema 'slate' */
    previewGradient: 'radial-gradient(ellipse at 50% 58%, rgba(251,191,36,0.11) 0%, rgba(120,80,20,0.06) 35%, transparent 72%)',
    glows: [
      /* Nessun glow in alto — vedi tema 'slate' */
      { color: '#fbbf24', opacity: 0.08, blur: 165, position: { bottom: '22%', right: '6%' }, size: '26rem 30rem' },
      { color: '#fb923c', opacity: 0.05, blur: 150, position: { top: '28%', left: '-7rem' }, size: '22rem 26rem' },
      { color: '#f59e0b', opacity: 0.045, blur: 140, position: { bottom: '-5rem', left: '20%' }, size: '18rem 22rem' },
      { color: '#ef4444', opacity: 0.03, blur: 130, position: { bottom: '10%', right: '-4rem' }, size: '14rem 18rem' },
    ],
    accentLine: 'rgba(251,191,36,0.08)',
    starColor: '253,230,138',
    waveOpacity: 0.05,
  },
  {
    id: 'rosa',
    label: { it: 'Rosa', en: 'Rose', es: 'Rosa', fr: 'Rose' },
    appBg: '#120710',
    /* Nessuna luce in cima: vedi tema 'slate' */
    previewGradient: 'radial-gradient(ellipse at 50% 58%, rgba(244,114,182,0.12) 0%, rgba(120,40,90,0.06) 35%, transparent 72%)',
    glows: [
      /* Nessun glow in alto — vedi tema 'slate' */
      { color: '#f472b6', opacity: 0.08, blur: 165, position: { bottom: '22%', right: '6%' }, size: '26rem 30rem' },
      { color: '#c084fc', opacity: 0.06, blur: 150, position: { top: '28%', left: '-7rem' }, size: '22rem 26rem' },
      { color: '#a855f7', opacity: 0.05, blur: 140, position: { bottom: '-5rem', left: '20%' }, size: '18rem 22rem' },
      { color: '#6366f1', opacity: 0.035, blur: 130, position: { bottom: '10%', right: '-4rem' }, size: '14rem 18rem' },
    ],
    accentLine: 'rgba(244,114,182,0.08)',
    starColor: '251,207,232',
    waveOpacity: 0.05,
  },
];

function storageKey(userId?: string): string {
  return userId ? `flow_background_theme_${userId}` : 'flow_background_theme';
}

const DEFAULT_THEME = THEMES.find(t => t.id === DEFAULT_THEME_ID) ?? THEMES[0];

export function getBackgroundThemes(): BackgroundTheme[] {
  return THEMES;
}

export function getThemeById(id: string): BackgroundTheme {
  return THEMES.find(t => t.id === id) ?? DEFAULT_THEME;
}

export function getStoredTheme(userId?: string): BackgroundTheme {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    if (stored) return getThemeById(stored);
  } catch { /* ignore */ }
  return DEFAULT_THEME;
}

/** Tema scelto esplicitamente da un profilo; `null` se non ha mai scelto. */
export function getProfileTheme(userId?: string): BackgroundTheme | null {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    if (stored) return getThemeById(stored);
  } catch { /* ignore */ }
  return null;
}

export function storeTheme(id: string, userId?: string): void {
  try {
    localStorage.setItem(storageKey(userId), id);
    // Il tema attivo resta valido anche senza sessione (schermata di accesso): la chiave
    // senza userId memorizza l'ultimo sfondo usato da un profilo.
    if (userId) localStorage.setItem(storageKey(), id);
  } catch { /* ignore */ }
}

/**
 * Tema da mostrare quando non c'è sessione (schermate di accesso/installazione):
 * quello scelto dall'ultimo profilo che ha usato l'app su questo dispositivo, altrimenti
 * l'ultimo sfondo memorizzato o il tema di default.
 */
export function getLastUsedTheme(): BackgroundTheme {
  const lastUserId = readLastProfileId();
  return (lastUserId ? getProfileTheme(lastUserId) : null) ?? getStoredTheme();
}

/** `#rrggbb` + alpha → `rgba(r,g,b,a)` (i colori dei temi sono sempre hex). */
function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

/** Mesh del tema: quella esplicita se definita, altrimenti un alone per bagliore. */
function themeMesh(theme: BackgroundTheme): string {
  if (theme.mesh) return theme.mesh;
  return theme.glows
    .map((glow) => {
      const x = glow.position.left ?? (glow.position.right ? `calc(100% - ${glow.position.right})` : '50%');
      const y = glow.position.top ?? (glow.position.bottom ? `calc(100% - ${glow.position.bottom})` : '50%');
      return `radial-gradient(at ${x} ${y}, ${withAlpha(glow.color, Math.min(glow.opacity * 2.4, 0.5))} 0, transparent 50%)`;
    })
    .join(', ');
}

/**
 * Applica il tema allo sfondo globale.
 * La skin v2 dipinge lo sfondo su `#root` tramite `--flow-background` / `--flow-mesh`
 * e forza le regioni a trasparente: senza aggiornare queste variabili il tema
 * selezionato non si vede.
 */
export function applyThemeToDocument(theme: BackgroundTheme): void {
  const root = document.documentElement;
  const r = parseInt(theme.appBg.slice(1, 3), 16);
  const g = parseInt(theme.appBg.slice(3, 5), 16);
  const b = parseInt(theme.appBg.slice(5, 7), 16);
  root.style.setProperty('--flow-background', theme.appBg);
  root.style.setProperty('--flow-mesh', themeMesh(theme));
  root.style.setProperty('--app-bg-r', String(r));
  root.style.setProperty('--app-bg-g', String(g));
  root.style.setProperty('--app-bg-b', String(b));
  root.style.background = theme.appBg;
  if (document.body) document.body.style.background = theme.appBg;
  /* Allinea la status bar (Android) allo sfondo scelto. */
  const themeColor = document.querySelector('meta[name="theme-color"]');
  if (themeColor) themeColor.setAttribute('content', theme.appBg);
  storeBootBackground(theme);
}

/** Chiave dello "snapshot" di avvio: sfondo già calcolato, letto dallo script inline in `index.html`. */
const BOOT_BG_KEY = 'flow_bg_boot';

/**
 * Salva uno snapshot dello sfondo attivo (colore + mesh) in localStorage, così lo script
 * inline in `index.html` può applicarlo **prima** del bundle, evitando che la splash di
 * boot mostri lo sfondo ufficiale di default invece di quello scelto dall'utente.
 */
export function storeBootBackground(theme: BackgroundTheme): void {
  try {
    localStorage.setItem(BOOT_BG_KEY, JSON.stringify({ bg: theme.appBg, mesh: themeMesh(theme) }));
  } catch { /* storage non disponibile */ }
}
