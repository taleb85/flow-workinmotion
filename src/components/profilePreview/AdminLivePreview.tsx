/**
 * Anteprima "Cosa vede chi" — scheda Admin (Impostazioni).
 *
 * Copia esatta: riusa il componente reale `SettingsPage` (accordion di
 * configurazione globali + "Permessi ruoli").
 *
 * Sola lettura: le impostazioni Admin sono globali e non devono poter essere
 * modificate dall'anteprima. Il wrapper disattiva le interazioni; così resta
 * anche impedita l'apertura del pannello per-utente che conterrebbe di nuovo
 * "Cosa vede chi" (nessuna ricorsione).
 *
 * `SettingsPage` è caricata in lazy per evitare un ciclo di import statico
 * (SettingsPage → ProfileVisibilityHub → ProfileTabRichPreview → qui).
 */
import { lazy, Suspense } from 'react';

const SettingsPage = lazy(() => import('../SettingsPage'));

export default function AdminLivePreview(_props: {
  previewUser: unknown;
  language: unknown;
  isSelectedAdmin: boolean;
  onUiToggle: (key: string, visible: boolean) => void;
}) {
  return (
    <div
      className="pointer-events-none select-none"
      aria-label="Anteprima scheda Admin (sola lettura)"
    >
      <Suspense fallback={null}>
        <SettingsPage />
      </Suspense>
    </div>
  );
}
