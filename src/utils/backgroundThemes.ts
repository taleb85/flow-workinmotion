export interface BackgroundTheme {
  id: string;
  label: Record<string, string>;
  appBg: string;
  previewGradient: string;
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

const THEMES: BackgroundTheme[] = [
  {
    id: 'slate',
    label: { it: 'Ardesia', en: 'Slate' },
    appBg: '#0a0a0e',
    previewGradient: 'radial-gradient(ellipse at 50% 0%, rgba(148,163,184,0.10) 0%, rgba(80,90,110,0.06) 30%, transparent 70%)',
    glows: [
      { color: '#94a3b8', opacity: 0.09, blur: 190, position: { top: '-5rem', left: '50%' }, size: '40rem 56rem' },
      { color: '#cbd5e1', opacity: 0.06, blur: 150, position: { top: '-2rem', right: '10%' }, size: '26rem 30rem' },
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
    id: 'paper',
    label: { it: 'Carta', en: 'Paper' },
    appBg: '#3a3d44',
    previewGradient: 'radial-gradient(ellipse at 50% 0%, rgba(148,163,184,0.12) 0%, rgba(100,112,130,0.06) 35%, rgba(80,90,105,0.02) 75%, rgba(58,61,68,0.00) 100%)',
    glows: [
      { color: '#94a3b8', opacity: 0.07, blur: 200, position: { top: '-6rem', left: '50%' }, size: '44rem 60rem' },
      { color: '#cbd5e1', opacity: 0.05, blur: 160, position: { top: '-3rem', right: '10%' }, size: '28rem 34rem' },
      { color: '#5eead4', opacity: 0.06, blur: 170, position: { bottom: '20%', right: '8%' }, size: '26rem 30rem' },
      { color: '#67e8f9', opacity: 0.04, blur: 150, position: { top: '25%', left: '-7rem' }, size: '22rem 26rem' },
      { color: '#a78bfa', opacity: 0.03, blur: 140, position: { bottom: '-5rem', left: '18%' }, size: '18rem 22rem' },
      { color: '#94a3b8', opacity: 0.03, blur: 130, position: { bottom: '8%', right: '-4rem' }, size: '14rem 18rem' },
    ],
    accentLine: 'rgba(148,163,184,0.06)',
    starColor: '148,163,184',
    waveOpacity: 0.04,
  },
];

function storageKey(userId?: string): string {
  return userId ? `flow_background_theme_${userId}` : 'flow_background_theme';
}

export function getBackgroundThemes(): BackgroundTheme[] {
  return THEMES;
}

export function getThemeById(id: string): BackgroundTheme {
  return THEMES.find(t => t.id === id) ?? THEMES[0];
}

export function getStoredTheme(userId?: string): BackgroundTheme {
  try {
    const stored = localStorage.getItem(storageKey(userId));
    if (stored) return getThemeById(stored);
  } catch { /* ignore */ }
  return THEMES[0];
}

export function storeTheme(id: string, userId?: string): void {
  try {
    localStorage.setItem(storageKey(userId), id);
  } catch { /* ignore */ }
}
