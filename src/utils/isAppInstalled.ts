/**
 * Rileva se l'app è aperta come PWA installata (modalità standalone).
 * La pagina di installazione deve essere mostrata SOLO a chi non ha ancora
 * installato l'app: chi la apre da un'app installata va dritto al login.
 */
export function isAppInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches)
  );
}
