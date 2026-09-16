import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '../utils/monitoring';

/** Evita pagina bianca se un componente lancia in render: messaggio + log console. */
export class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary]', error, info.componentStack);
    captureException(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-app-bg p-6 text-white/90 font-sans">
          <h1 className="text-lg font-semibold mb-2">Errore di avvio</h1>
          <p className="text-sm text-white/70 mb-4">
            Ricarica la pagina. Se l’app era installata come PWA, apri una volta con{' '}
            <code className="rounded bg-slate-200 px-1">?nocache=1</code> per svuotare cache e service worker.
          </p>
          <pre className="rounded-xl border border-white/[0.14] max-w-2xl overflow-auto p-3 text-xs">
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
