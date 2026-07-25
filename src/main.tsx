import { StrictMode } from 'react';

if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

// Blocca orientamento orizzontale su mobile (PWA + browser supportati)
try {
  if ('orientation' in screen && 'lock' in (screen as any).orientation) {
    (screen as any).orientation.lock('portrait').catch(() => {});
  }
} catch { /* orientamento non supportato */ }

// Applica no-motion subito se salvato — prima del primo render
try {
  if (localStorage.getItem('flow-animations') === 'off') {
    document.documentElement.classList.add('no-motion');
  }
} catch { /* storage non disponibile */ }
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import { RootErrorBoundary } from './components/RootErrorBoundary';
import { TenantProvider } from './context/TenantContext';
import './index.css';

// ── Rilevamento aggiornamento Service Worker ─────────────────────────────────
// Quando un nuovo SW prende il controllo (dopo un deploy):
//   1. Blocca il reload silenzioso automatico di workbox-window
//   2. Notifica React tramite evento custom `sw-update`
//   3. SwUpdateOverlay mostra il progresso e reindirizza a /app
if ('serviceWorker' in navigator) {
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return; // Primo install — nessun overlay necessario
    }
    // Aggiornamento: blocca il reload automatico di workbox e delega a React
    try {
       
      Object.defineProperty(window.location, 'reload', { value: () => {}, writable: true, configurable: true });
    } catch { /* alcuni browser non permettono il monkey-patch */ }
    window.dispatchEvent(new CustomEvent('sw-update'));
  });
}

// Registrazione SW: `useRegisterSW` in `App.tsx` (un solo posto) + stessi controlli periodici lì.

function requestServiceWorkerUpdate() {
  void navigator.serviceWorker?.ready.then((r) => r.update());
}

// Torna in app / finestra -> controlla subito nuovo SW (dopo un deploy)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestServiceWorkerUpdate();
});
window.addEventListener('focus', requestServiceWorkerUpdate);
window.addEventListener('pageshow', (e) => {
  if (e.persisted) requestServiceWorkerUpdate();
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  const p = document.createElement('p');
  p.style.cssText = 'font-family:system-ui;padding:1rem';
  p.textContent = "Manca l'elemento #root in index.html.";
  document.body.appendChild(p);
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <RootErrorBoundary>
        <TenantProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </TenantProvider>
      </RootErrorBoundary>
    </StrictMode>
  );

  if (import.meta.env.DEV) {
    void (async () => {
      const { default: axe } = await import('@axe-core/react');
      const React = (await import('react')).default;
      const ReactDOM = (await import('react-dom')).default;
      axe(React, ReactDOM, 1000);
    })();
  }
}
