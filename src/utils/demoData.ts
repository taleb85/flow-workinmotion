/**
 * Modalità anteprima con dati di test per le KPI della home staff.
 * Attivazione: parametro ?demoKpi nell'URL oppure localStorage 'flow-demo-kpi' = '1'.
 */
export function isDemoMode(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem('flow-demo-kpi') === '1' || new URLSearchParams(window.location.search).has('demoKpi');
  } catch {
    return false;
  }
}
