import { useState, useEffect, lazy, Suspense } from 'react';

import SwUpdateOverlay from './components/SwUpdateOverlay';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { AppProvider } from './context/AppContext';
import { LayoutPresetProvider } from './context/LayoutPresetContext';
import { AppContent } from './components/AppShell';

/**
 * SuperAdminPanel — accessibile solo sul dominio super-admin, protetto da PIN.
 */
const SuperAdminPanel = lazy(() => import('./components/SuperAdminPanel'));

function App() {
  // Se il dominio è il progetto super-admin dedicato, reindirizza / → /super-admin
  const isSuperAdminDomain =
    typeof window !== 'undefined' &&
    window.location.hostname.includes('super-admin');

  // Overlay aggiornamento SW: mostrato quando viene rilevato un nuovo deploy
  const [swUpdating, setSwUpdating] = useState(false);

  const { updateServiceWorker } = useRegisterSW({
    immediate: true,
    onNeedRefresh() {
      void updateServiceWorker(true);
    },
    onOfflineReady() {},
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const tick = () => {
        if (registration.installing || !navigator.onLine) return;
        void registration.update();
      };
      const fast = window.setInterval(tick, 60 * 1000);
      window.setTimeout(() => window.clearInterval(fast), 15 * 60 * 1000);
      window.setInterval(tick, 5 * 60 * 1000);
    },
  });

  useEffect(() => {
    const onSwUpdate = () => setSwUpdating(true);
    window.addEventListener('sw-update', onSwUpdate);
    return () => window.removeEventListener('sw-update', onSwUpdate);
  }, []);

  // Priorità massima: se SW update in corso, mostra solo l'overlay
  if (swUpdating) return <SwUpdateOverlay />;

  return (
    <Routes>
      {/* SuperAdminPanel — attivo solo sul dominio super-admin, protetto da PIN */}
      <Route path="/super-admin" element={
        isSuperAdminDomain
          ? <Suspense fallback={<main role="main" aria-label="Caricamento Super Admin" className="min-h-screen flex items-center justify-center text-white/50 text-sm">Caricamento…</main>}>
              <SuperAdminPanel />
            </Suspense>
          : <main role="main" aria-label="Super Admin non disponibile" className="min-h-screen flex items-center justify-center text-white p-6 text-center" style={{ background: 'transparent' }}>
              <div className="rounded-2xl border border-neutral-500 p-8 max-w-sm" style={{ background: 'rgba(255, 255, 255, 0.16)' }}>
                <h1 className="text-2xl font-bold mb-2">SuperAdmin</h1>
                <p className="text-white/50 text-sm">Se il Super Admin è su un host dedicato, apri l’indirizzo configurato in produzione (stesso build)</p>
              </div>
            </main>
      } />
      {isSuperAdminDomain && (
        <Route path="/" element={<Navigate to="/super-admin" replace />} />
      )}
      {/* Tutto il resto: avvolto nei provider normali */}
      <Route
        path="*"
        element={
          <AppProvider>
            <LayoutPresetProvider>
              <AppContent />
            </LayoutPresetProvider>
          </AppProvider>
        }
      />
    </Routes>
  );
}

export default App;
