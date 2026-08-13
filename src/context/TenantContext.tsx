/* eslint-disable react-refresh/only-export-components -- context file: exports provider, hooks, and brand/PWA utilities by design */
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { setDatabaseTenant } from '../lib/database';
import type { Tenant, TenantSettings } from '../types';
import { APP_SESSION_STORAGE_KEY } from '../constants/appSession';
import { withTimeout, TimeoutError } from '../utils/promiseTimeout';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Slug di fallback — usato solo se VITE_TENANT_SLUG è impostato o se c'è sottodominio/path.
 *  In modalità Option B (single-URL) rimane null finché LoginPage chiama loadTenantBySlug. */
const DEFAULT_SLUG: string | null = null;
const DEFAULT_ACCENT = '#ffffff';

/**
 * Legge lo slug dal env var, sottodominio, o path URL.
 * Ritorna null se nessun slug è configurato (modalità Option B single-URL):
 * in questo caso il tenant viene caricato dinamicamente tramite loadTenantBySlug().
 */
function readSlugFromEnv(): string | null {
  if (import.meta.env.VITE_TENANT_SLUG) return import.meta.env.VITE_TENANT_SLUG as string;
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const parts = hostname.split('.');
  // Sottodominio: slug.dominio.tld — solo se non è localhost o IP
  if (parts.length >= 3 && !['localhost', '127'].includes(parts[0])) return parts[0];
  const pathMatch = typeof window !== 'undefined'
    ? window.location.pathname.match(/^\/t\/([^/]+)/)
    : null;
  if (pathMatch) return pathMatch[1];
  return DEFAULT_SLUG; // null — aspetta loadTenantBySlug
}

/** Converte hex in HSL [hue 0-360, sat 0-100, l 0-100]. */
function hexToHsl(hex: string): [number, number, number] {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

/** Override FLOW: forza il brand grigio neutro indipendentemente dal colore del tenant. */
const FLOW_BRAND_COLOR = '#ffffff';

/**
 * Shell PWA: colore scuro neutro per safe area.
 */
const FLOW_PWA_SURFACE_COLOR = '#0a0a0c';

/**
 * Variante brand per dark mode: grigio chiaro neutro per garantire contrasto su sfondo scuro.
 */
const FLOW_BRAND_DARK = '#ffffff';
const FLOW_BRAND_DARK_RGB = '255 255 255';
const FLOW_BRAND_DARK_HOVER = '#ffffff';

/** Riferimento al MutationObserver per il tema — istanziato una sola volta. */
let _themeObserver: MutationObserver | null = null;

/**
 * Applica le variabili brand corrette in base al tema corrente (light/dark).
 * Chiamato sia direttamente sia dall'observer sul cambio di classe .dark.
 */
function syncBrandToTheme(): void {
  const root = document.documentElement;
  const isDark = root.classList.contains('dark');

  if (isDark) {
    root.style.setProperty('--brand',        FLOW_BRAND_DARK);
    root.style.setProperty('--brand-rgb',    FLOW_BRAND_DARK_RGB);
    root.style.setProperty('--accent',       FLOW_BRAND_DARK);
    root.style.setProperty('--color-accent', FLOW_BRAND_DARK);
    root.style.setProperty('--flow-primary', FLOW_BRAND_DARK);
    root.style.setProperty('--brand-hover',  FLOW_BRAND_DARK_HOVER);
    root.style.setProperty('--accent-hover', FLOW_BRAND_DARK_HOVER);
    root.style.setProperty('--brand-muted',  'rgb(156 156 156 / 0.12)');
  } else {
    const { r, g, b } = hexToRgb(FLOW_BRAND_COLOR);
    const [hue, sat] = hexToHsl(FLOW_BRAND_COLOR);
    const hsl = (l: number, sMod = 1) =>
      `hsl(${hue} ${Math.min(Math.round(sat * sMod), 100)}% ${l}%)`;
    root.style.setProperty('--brand',        FLOW_BRAND_COLOR);
    root.style.setProperty('--brand-rgb',    `${r} ${g} ${b}`);
    root.style.setProperty('--accent',       FLOW_BRAND_COLOR);
    root.style.setProperty('--color-accent', FLOW_BRAND_COLOR);
    root.style.setProperty('--flow-primary', FLOW_BRAND_COLOR);
    root.style.setProperty('--brand-hover',  hsl(30));
    root.style.setProperty('--accent-hover', hsl(30));
    root.style.setProperty('--brand-muted',  `rgb(${r} ${g} ${b} / 0.12)`);
  }
}

/** Applica le CSS variables del brand al documento — genera tutte le varianti shade + nav + shadow. */
export function applyTenantBrand(_accent: string): void {
  const accent = FLOW_BRAND_COLOR; // FLOW rebranding — usa sempre grigio neutro
  const root = document.documentElement;
  const { r, g, b } = hexToRgb(accent);
  const [hue, sat] = hexToHsl(accent);

  // Genera shade HSL con la stessa tonalità del brand
  const hsl = (l: number, sMod = 1) =>
    `hsl(${hue} ${Math.min(Math.round(sat * sMod), 100)}% ${l}%)`;

  // Variabili base (retrocompatibili con codice esistente)
  root.style.setProperty('--brand',           accent);
  root.style.setProperty('--brand-rgb',       `${r} ${g} ${b}`);
  root.style.setProperty('--accent',          accent);
  root.style.setProperty('--color-accent',    accent);
  root.style.setProperty('--flow-primary',accent);
  root.style.setProperty('--accent-hover',    hsl(30));
  root.style.setProperty('--accent-dark',     hsl(20));
  root.style.setProperty('--accent-light',    hsl(87, 0.28));
  root.style.setProperty('--brand-hover',     hsl(30));
  root.style.setProperty('--brand-dark',      hsl(20));
  root.style.setProperty('--brand-light',     hsl(87, 0.28));
  root.style.setProperty('--brand-muted',     `rgb(${r} ${g} ${b} / 0.12)`);

  // Palette shades (50–900) — usate da Tailwind via brand-50…brand-900
  root.style.setProperty('--brand-50',  hsl(97, 0.25));
  root.style.setProperty('--brand-100', hsl(93, 0.35));
  root.style.setProperty('--brand-200', hsl(85, 0.50));
  root.style.setProperty('--brand-300', hsl(73, 0.70));
  root.style.setProperty('--brand-400', hsl(57, 0.85));
  root.style.setProperty('--brand-500', hsl(45));
  root.style.setProperty('--brand-600', hsl(35));
  root.style.setProperty('--brand-700', hsl(26));
  root.style.setProperty('--brand-800', hsl(17));
  root.style.setProperty('--brand-900', hsl(10));

  // Gradienti bottom-nav
  const dr = Math.round(r * 0.77), dg = Math.round(g * 0.77), db = Math.round(b * 0.77);
  root.style.setProperty('--brand-nav-from', `rgb(${r} ${g} ${b} / 0.92)`);
  root.style.setProperty('--brand-nav-to',   `rgb(${dr} ${dg} ${db} / 0.88)`);
  root.style.setProperty('--brand-nav-dark-from', `rgb(${r} ${g} ${b} / 0.88)`);
  root.style.setProperty('--brand-nav-dark-to',   `rgb(${Math.round(r*0.66)} ${Math.round(g*0.66)} ${Math.round(b*0.66)} / 0.84)`);

  // Ombra card accent
  root.style.setProperty('--shadow-card-accent',
    `0 4px 16px -4px rgb(${r} ${g} ${b} / 0.14), 0 2px 8px -4px rgb(15 23 42 / 0.08)`);

  // Calendar (react-day-picker)
  root.style.setProperty('--rdp-accent-color', accent);
  root.style.setProperty('--rdp-accent-background-color', `rgb(${r} ${g} ${b} / 0.14)`);

  // Sovrascrive subito le variabili text/border in base al tema corrente
  syncBrandToTheme();

  // Attiva l'observer sul cambio tema (una volta sola per tutta la vita della pagina)
  if (!_themeObserver) {
    _themeObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'class') { syncBrandToTheme(); break; }
      }
    });
    _themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }
}

function _darken(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 0xff) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Restituisce le iniziali (max 2) del nome sede. */
export function getTenantInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/** Converte un colore hex in { r, g, b }. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/** Converte { r, g, b } in stringa hex. */
function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** Schiarisce un colore hex mescolandolo con il bianco (amount 0-1). */
function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}

/** Scurisce un colore hex (amount 0-1). */
function darkenColor(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/**
 * Genera un SVG stile "OB" con gradiente radiale, effetto vetro e testo gradiente.
 * Genera un logo SVG con iniziali e colore brand del tenant.
 * Nota: filtro drop-shadow rimosso per massima compatibilità browser quando usato come <img src>.
 * Restituisce un data URL usabile come <img src>.
 */
export function generateTenantLogoSvg(name: string, accent: string): string {
  const initials = getTenantInitials(name);
  const fontSize = initials.length === 1 ? 310 : initials.length === 2 ? 278 : 190;
  const letterSpacing = initials.length <= 2 ? 24 : 10;

  // Palette gradiente dal colore accent (proporzioni identiche al logo OB)
  const c0 = lighten(accent, 0.42);      // stop 0%  — luce calda al centro
  const c1 = lighten(accent, 0.18);      // stop 28% — leggermente chiaro
  const c2 = accent;                      // stop 55% — colore base
  const c3 = darkenColor(accent, 0.38);  // stop 100% — scuro ai bordi

  // SVG identico al logo OB: clipPath + drop shadow + gloss piatto clippato
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '<defs>',
    `<radialGradient id="g1" cx="38%" cy="26%" r="78%" fx="36%" fy="24%">`,
    `<stop offset="0%" stop-color="${c0}"/>`,
    `<stop offset="28%" stop-color="${c1}"/>`,
    `<stop offset="55%" stop-color="${c2}"/>`,
    `<stop offset="100%" stop-color="${c3}"/>`,
    '</radialGradient>',
    '<linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.20"/>',
    '<stop offset="35%" stop-color="#FFFFFF" stop-opacity="0.06"/>',
    '<stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>',
    '</linearGradient>',
    '<linearGradient id="g3" x1="0" y1="0" x2="0" y2="1">',
    '<stop offset="0%" stop-color="#D1D9D4"/>',
    '<stop offset="38%" stop-color="#FFFFFF"/>',
    '<stop offset="100%" stop-color="#F4FAF3"/>',
    '</linearGradient>',
    '<clipPath id="gc"><rect width="512" height="512" rx="120" ry="120"/></clipPath>',
    '<filter id="gd" x="-8%" y="-6%" width="116%" height="118%">',
    '<feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#0f172a" flood-opacity="0.18"/>',
    '</filter>',
    '</defs>',
    '<g filter="url(#gd)">',
    '<g clip-path="url(#gc)">',
    '<rect width="512" height="512" rx="120" ry="120" fill="url(#g1)"/>',
    '<rect width="512" height="220" x="0" y="0" fill="url(#g2)"/>',
    '</g>',
    '</g>',
    `<text x="256" y="250" text-anchor="middle" dominant-baseline="central"`,
    ` text-rendering="geometricPrecision"`,
    ` fill="url(#g3)"`,
    ` font-family="system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"`,
    ` font-weight="800" font-size="${fontSize}" letter-spacing="${letterSpacing}"`,
    ` font-feature-settings="'kern' 1"`,
    `>${initials}</text>`,
    '</svg>',
  ].join('');

  // base64 garantisce compatibilità massima in tutti i browser per SVG come <img>
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

/**
 * Aggiorna tutte le <link rel="icon"> e <link rel="apple-touch-icon">
 * puntandole al logo del tenant (data URL SVG o URL remoto).
 */
function updateFavicon(logoSrc: string): void {
  try {
    // Rimuove tutti i favicon esistenti
    document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]'
    ).forEach((el) => el.remove());

    // Favicon principale SVG (tutti i browser moderni)
    const svgLink = document.createElement('link');
    svgLink.rel = 'icon';
    svgLink.type = 'image/svg+xml';
    svgLink.href = logoSrc;
    document.head.appendChild(svgLink);

    // Fallback PNG 32×32 (generato via Canvas)
    generatePngFavicon(logoSrc, 32).then((png32) => {
      const pngLink = document.createElement('link');
      pngLink.rel = 'icon';
      pngLink.type = 'image/png';
      pngLink.sizes = '32x32';
      pngLink.href = png32;
      document.head.appendChild(pngLink);
    }).catch(() => null);

    // Apple touch icon 180×180
    generatePngFavicon(logoSrc, 180).then((png180) => {
      const appleLink = document.createElement('link');
      appleLink.rel = 'apple-touch-icon';
      appleLink.sizes = '180x180';
      appleLink.href = png180;
      document.head.appendChild(appleLink);
    }).catch(() => null);
  } catch {
    // Silent fail in ambienti SSR/test
  }
}

/**
 * Renderizza il logo SVG su un Canvas e restituisce un PNG data URL.
 * Usato per i fallback favicon PNG e apple-touch-icon.
 */
function generatePngFavicon(logoSrc: string, size: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('no ctx')); return; }
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = logoSrc;
  });
}

/**
 * Aggiorna il Web App Manifest in-memory con i dati del tenant.
 * Converte il logo SVG in PNG reale via Canvas per garantire compatibilità
 * con Chrome/Android che non accetta SVG data URL come icona PWA.
 */
export function updatePWAManifest(_tenant: Tenant): void {
  const origin = window.location.origin;
  // Usa sempre l'icona FLOW — ignorando logo/colori del tenant
  const logoSrc = `${origin}/icon-flow-final.png`;

  // Genera PNG reali via Canvas per i due formati richiesti dal manifest
  Promise.all([
    generatePngFavicon(logoSrc, 192),
    generatePngFavicon(logoSrc, 512),
  ])
    .then(([png192, png512]) => {
      _applyPWAManifest(_tenant, origin, png192, png512);
    })
    .catch(() => {
      // Fallback: icone statiche già presenti nel public folder
      _applyPWAManifest(_tenant, origin, `${origin}/icon-192.png`, `${origin}/icon-512.png`);
    });
}

function _applyPWAManifest(
  _tenant: Tenant,
  origin: string,
  icon192: string,
  icon512: string,
): void {
  const manifest = {
    name: 'FLOW',
    short_name: 'FLOW',
    description: 'FLOW — Sistema di gestione turni e presenze. Work in Motion.',
    start_url: `${origin}/profilo`,
    scope: `${origin}/`,
    display: 'standalone',
    background_color: FLOW_PWA_SURFACE_COLOR,
    theme_color: FLOW_PWA_SURFACE_COLOR,
    orientation: 'any',
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon512, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Accedi', short_name: 'Login', url: `${origin}/profilo` },
      { name: 'Profilo',    short_name: 'Profilo',    url: `${origin}/profilo` },
    ],
  };

  try {
    const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
    const blobUrl = URL.createObjectURL(blob);

    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    if (link.href.startsWith('blob:')) URL.revokeObjectURL(link.href);
    link.href = blobUrl;

    const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeMeta) themeMeta.content = FLOW_PWA_SURFACE_COLOR;
  } catch {
    // Silent fail in SSR/test
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface TenantContextValue {
  tenant: Tenant | null;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantSettings: TenantSettings;
  /** Logo URL del tenant: logo_url se presente, altrimenti SVG generato dalle iniziali. */
  tenantLogoUrl: string;
  isLoading: boolean;
  error: string | null;
  updateTenantConfig: (patch: Partial<Pick<Tenant, 'name' | 'accent_color' | 'logo_url'>>) => Promise<void>;
  updateTenantSettings: (patch: Partial<TenantSettings>) => Promise<void>;
  /**
   * Option B — carica il tenant on-demand dallo slug.
   * Chiamato da LoginPage dopo aver decodificato il tenantSlug dal token dell'invite link.
   */
  loadTenantBySlug: (slug: string) => Promise<void>;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  tenantId: null,
  tenantSlug: DEFAULT_SLUG,
  tenantSettings: {},
  tenantLogoUrl: generateTenantLogoSvg('App', DEFAULT_ACCENT),
  isLoading: true,
  error: null,
  updateTenantConfig: async () => {},
  updateTenantSettings: async () => {},
  loadTenantBySlug: async () => {},
});

export function useTenant(): TenantContextValue {
  return useContext(TenantContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function TenantProvider({ children }: { children: ReactNode }) {
  // Slug come stato: parte da readSlugFromEnv() (null in modalità single-URL),
  // poi aggiornato da loadTenantBySlug() quando LoginPage decodifica il token.
  const [slug, setSlug] = useState<string | null>(readSlugFromEnv);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Applica subito FLOW blue al primo render — prima che i dati Supabase arrivino,
  // così nessun componente mostrerà mai il verde del DB anche per un singolo frame.
  useState(() => { applyTenantBrand(FLOW_BRAND_COLOR); });

  const applyTenant = (t: Tenant) => {
    setTenant(t);
    setDatabaseTenant(t.id);
    applyTenantBrand(t.accent_color);
    // Font intestazione header — sempre Inter (FLOW brand, non override dal DB tenant)
    document.documentElement.style.setProperty('--brand-header-font', "'Inter', system-ui, sans-serif");
    updatePWAManifest(t);  // usa FLOW_BRAND_COLOR internamente — vedi sotto
    // Titolo e meta — sempre FLOW (indipendente dal nome DB del tenant)
    document.title = 'FLOW — Work in Motion';
    const appleTitleMeta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    if (appleTitleMeta) appleTitleMeta.content = 'FLOW';
    const descMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (descMeta) descMeta.content = 'FLOW — Sistema di gestione turni e presenze. Work in Motion.';
    // theme-color = stesso blu dello sfondo (non #001A80) → niente striscia in basso su iOS
    document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(m => {
      m.content = FLOW_PWA_SURFACE_COLOR;
    });
    // Favicon → sempre icona FLOW PNG (ignora logo del tenant per il brand globale)
    updateFavicon('/icon-192.png');
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Nessuno slug configurato — modalità single-URL in attesa di loadTenantBySlug().
      // Non carichiamo nulla; isLoading = false così LoginPage è subito visibile.
      if (!slug) {
        if (!cancelled) setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      if (!supabase) {
        const mock: Tenant = {
          id: 'local',
          slug,
          name: 'FLOW',
          accent_color: DEFAULT_ACCENT,
          plan: 'basic',
          is_active: true,
          settings: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (!cancelled) { applyTenant(mock); setIsLoading(false); }
        return;
      }

      try {
        const tenantQuery = Promise.resolve(
          supabase
            .from('tenants')
            .select('*')
            .eq('slug', slug)
            .eq('is_active', true)
            .maybeSingle()
        );
        const { data, error: err } = (await withTimeout(tenantQuery, 22_000, 'tenant')) as {
          data: Tenant | null;
          error: PostgrestError | null;
        };

        if (cancelled) return;
        if (err) throw err;

        if (!data) {
          setError(`Sede "${slug}" non trovata o non attiva.`);
          setIsLoading(false);
          return;
        }

        applyTenant(data as Tenant);
      } catch (e) {
        if (!cancelled) {
          if (e instanceof TimeoutError) {
            setError('Connessione lenta o assente: impossibile caricare la sede. Ricarica o controlla la rete.');
          } else {
            setError(e instanceof Error ? e.message : 'Errore caricamento sede.');
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [slug]);

  /**
   * Option B — carica il tenant on-demand.
   * Chiamato da LoginPage dopo aver decodificato il tenantSlug dal token dell'invite link.
   * Aggiornare lo stato slug fa ri-eseguire l'useEffect sopra che carica il tenant.
   */
  const loadTenantBySlug = useCallback(async (newSlug: string) => {
    if (!newSlug || newSlug === slug) return; // già caricato o uguale
    setSlug(newSlug);
  }, [slug]);

  /** Option B: aprendo `/app` con sessione salvata, lo slug non c’è nell’URL — lo leggiamo da `app_session`. */
  const sessionSlugHydrateAttemptedRef = useRef(false);
  useEffect(() => {
    if (slug !== null) return;
    if (sessionSlugHydrateAttemptedRef.current) return;
    sessionSlugHydrateAttemptedRef.current = true;
    try {
      const raw = localStorage.getItem(APP_SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { tenantSlug?: string };
      const ts = typeof parsed.tenantSlug === 'string' ? parsed.tenantSlug.trim() : '';
      if (!ts) return;
      void loadTenantBySlug(ts);
    } catch {
      /* ignore */
    }
  }, [slug, loadTenantBySlug]);

  const updateTenantConfig = async (
    patch: Partial<Pick<Tenant, 'name' | 'accent_color' | 'logo_url'>>
  ) => {
    if (!supabase || !tenant) return;
    const { data, error: err } = await supabase
      .from('tenants')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', tenant.id)
      .select()
      .maybeSingle();
    if (err) throw err;
    if (data) {
      const updated = data as Tenant;
      applyTenant(updated);
    }
  };

  const updateTenantSettings = async (patch: Partial<TenantSettings>) => {
    if (!supabase || !tenant) return;
    const merged: TenantSettings = { ...(tenant.settings ?? {}), ...patch };
    const { data, error: err } = await supabase
      .from('tenants')
      .update({ settings: merged, updated_at: new Date().toISOString() })
      .eq('id', tenant.id)
      .select()
      .maybeSingle();
    if (err) throw err;
    if (data) applyTenant(data as Tenant);
  };

  // Logo URL: sempre FLOW — lo slug/tenant non influisce sul branding visivo
  const tenantLogoUrl = '/icon-flow-final.png';

  return (
    <TenantContext.Provider
      value={{
        tenant,
        tenantId: tenant?.id ?? null,
        tenantSlug: slug,
        tenantSettings: tenant?.settings ?? {},
        tenantLogoUrl,
        isLoading,
        error,
        updateTenantConfig,
        updateTenantSettings,
        loadTenantBySlug,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}
