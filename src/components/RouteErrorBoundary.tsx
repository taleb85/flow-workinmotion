import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { useAppUser } from '../context/AppContext';
import { getTranslations, formatTrans } from '../utils/translations';
import type { Language } from '../types';

interface Props {
  children: ReactNode;
  /** Nome leggibile della sezione (es. "Turni", "Presenze", "Profilo") */
  sectionName?: string;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/** Nomi di sezione localizzati per il titolo dell'errore */
const SECTION_NAMES: Record<string, Partial<Record<Language, string>>> = {
  Login: { it: 'Accesso', en: 'Login', es: 'Inicio de sesión', fr: 'Connexion' },
  Home: { it: 'Home', en: 'Home', es: 'Inicio', fr: 'Accueil' },
  'Turni/Presenze': { it: 'Turni/Presenze', en: 'Shifts/Attendance', es: 'Turnos/Presencias', fr: 'Services/Présences' },
  Ferie: { it: 'Ferie', en: 'Holidays', es: 'Vacaciones', fr: 'Congés' },
  Impostazioni: { it: 'Impostazioni', en: 'Settings', es: 'Configuración', fr: 'Réglages' },
  Profilo: { it: 'Profilo', en: 'Profile', es: 'Perfil', fr: 'Profil' },
  'Dashboard staff': { it: 'Dashboard staff', en: 'Staff dashboard', es: 'Panel del personal', fr: 'Tableau de bord du personnel' },
};

function translateSection(name: string | undefined, lang: Language): string {
  if (!name) return '';
  return SECTION_NAMES[name]?.[lang] ?? name;
}

interface InnerProps extends Props {
  t: Record<string, string>;
  lang: Language;
}

/**
 * Error Boundary per-sezione: isola il crash a un singolo tab/pannello
 * senza compromettere il resto dell'app.
 *
 * Uso:
 *   <RouteErrorBoundary sectionName="Timesheet">
 *     <TimesheetGrid />
 *   </RouteErrorBoundary>
 */
class RouteErrorBoundaryInner extends Component<InnerProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[RouteErrorBoundary:${this.props.sectionName || '?'}]`, error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;

      const { t, sectionName, lang } = this.props;
      const name = translateSection(sectionName, lang) || (t.route_section_generic ?? 'questa sezione');

      return (
        <div
          role="alert"
          className="mx-auto mt-6 max-w-md rounded-2xl border border-red-500/30 p-5 text-center"
          style={{
            background: 'rgba(239, 68, 68, 0.06)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="mb-3 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15">
              <AlertTriangle className="h-6 w-6 text-red-400" strokeWidth={1.5} />
            </div>
          </div>
          <h3 className="mb-1 text-sm font-semibold text-white/90">
            {formatTrans(t.route_error_title ?? 'Errore in {name}', { name })}
          </h3>
          <p className="mb-4 text-xs text-white/50 leading-relaxed">
            {this.state.error.message || (t.route_error_unexpected ?? 'Errore imprevisto nel caricamento.')}
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white/80 transition-colors hover:bg-white/20"
          >
            <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
            {t.retry ?? 'Riprova'}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export function RouteErrorBoundary(props: Props) {
  const { effectiveLanguage } = useAppUser();
  const t = getTranslations(effectiveLanguage);
  return <RouteErrorBoundaryInner {...props} t={t} lang={effectiveLanguage} />;
}
