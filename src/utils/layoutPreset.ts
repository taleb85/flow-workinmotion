/** Compact vs comfortable: allineare a `LayoutPresetProvider` / `index.html`. */
export const LAYOUT_BREAKPOINT_PX = 1000;

/** Larghezza &lt; questo valore ⇒ `phone` (allineato a Tailwind `sm` = 640px e a `index.html`). */
export const VIEWPORT_PHONE_MAX_PX = 640;

/** Larghezza &lt; questo valore ⇒ `tablet` se già ≥ phone; altrimenti `desktop`. */
export const VIEWPORT_TABLET_MAX_PX = 1000;

export type ViewportClass = 'phone' | 'tablet' | 'desktop';

export type LayoutEffective = 'compact' | 'comfortable';

/** Sempre da larghezza finestra: &lt; 1000px compatto, altrimenti comodo. */
export function computeEffectiveLayoutFromWidth(innerWidth: number): LayoutEffective {
  return innerWidth < LAYOUT_BREAKPOINT_PX ? 'compact' : 'comfortable';
}

export function computeViewportClass(innerWidth: number): ViewportClass {
  if (innerWidth < VIEWPORT_PHONE_MAX_PX) return 'phone';
  if (innerWidth < VIEWPORT_TABLET_MAX_PX) return 'tablet';
  return 'desktop';
}

/** Larghezza &lt; questo valore ⇒ layout mobile (allineato a Tailwind `md` = 768px). */
export const MOBILE_VIEWPORT_MAX_PX = 768;

/* ── Override di sviluppo: anteprima mobile su pannello IDE largo ─────────────
   `?view=mobile` forza il layout telefono, `?view=desktop` lo disattiva.
   La scelta è memorizzata in sessionStorage perché il redirect dopo il login
   naviga a `/app` senza query string. In produzione non è mai attivo
   (`import.meta.env.DEV` è sostituito con `false` al build). */
const DEV_VIEW_MOBILE_KEY = 'flow-dev-view-mobile';
let devMobileOverrideCache: boolean | null = null;

export function isDevMobileOverrideActive(): boolean {
  if (!import.meta.env.DEV) return false;
  if (devMobileOverrideCache === null) {
    try {
      const view = new URLSearchParams(window.location.search).get('view');
      if (view === 'mobile') sessionStorage.setItem(DEV_VIEW_MOBILE_KEY, '1');
      else if (view === 'desktop') sessionStorage.removeItem(DEV_VIEW_MOBILE_KEY);
      devMobileOverrideCache = sessionStorage.getItem(DEV_VIEW_MOBILE_KEY) === '1';
    } catch {
      devMobileOverrideCache = false;
    }
  }
  return devMobileOverrideCache;
}

/** Layout mobile: viewport stretto oppure override di sviluppo attivo. */
export function isMobileLayout(): boolean {
  return isDevMobileOverrideActive() || window.innerWidth < MOBILE_VIEWPORT_MAX_PX;
}
