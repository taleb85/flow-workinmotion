/**
 * Ripristino tab + scroll verticale dopo soft/hard reload (sessionStorage, per utente).
 */

const STORAGE_PREFIX = 'osteria_main_view_v1';

export function mainViewStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

export interface MainViewStoredState {
  activeTab: string;
  scrollY: number;
}

export function readMainViewState(userId: string): MainViewStoredState | null {
  try {
    const raw = sessionStorage.getItem(mainViewStorageKey(userId));
    if (!raw) return null;
    const p = JSON.parse(raw) as { activeTab?: unknown; scrollY?: unknown };
    if (typeof p.activeTab !== 'string' || !p.activeTab) return null;
    const scrollY =
      typeof p.scrollY === 'number' && Number.isFinite(p.scrollY) ? Math.max(0, Math.round(p.scrollY)) : 0;
    return { activeTab: p.activeTab, scrollY };
  } catch {
    return null;
  }
}

export function writeMainViewState(userId: string, payload: MainViewStoredState): void {
  try {
    sessionStorage.setItem(mainViewStorageKey(userId), JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

export function clearMainViewState(userId: string): void {
  try {
    sessionStorage.removeItem(mainViewStorageKey(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Scroll verticale effettivo: l'app usa `#root` come contenitore scrollabile.
 */
export function getAppRootScrollY(): number {
  const r = document.getElementById('root');
  if (r) return r.scrollTop;
  return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
}

/** Applica lo scroll su `#root`. */
export function applyWindowScrollY(y: number): void {
  const top = Math.max(0, y);
  const r = document.getElementById('root');
  if (r) {
    r.scrollTop = top;
  }
  window.scrollTo(0, top);
  document.documentElement.scrollTop = top;
  document.body.scrollTop = top;
}
