import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureException } from '../utils/monitoring';
import { getTranslations } from '../utils/translations';
import { getDeviceUiLanguage, readStoredUiLanguage } from '../utils/uiLanguagePreference';

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
      const t = getTranslations(readStoredUiLanguage() ?? getDeviceUiLanguage());
      return (
        <div className="min-h-screen bg-app-bg p-6 text-white/90 font-sans">
          <h1 className="text-lg font-semibold mb-2">{t.root_error_title}</h1>
          <p className="text-sm text-white/70 mb-4">
            {t.root_error_reload_hint}{' '}
            <code className="rounded bg-slate-200 px-1">?nocache=1</code> {t.root_error_cache_hint}
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
