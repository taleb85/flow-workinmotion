import { Wrench } from 'lucide-react';
import { useT } from '../hooks/useT';

/**
 * Pagina di manutenzione — mostrata quando il feature flag `maintenance_mode` è attivo
 * per tutti gli utenti non-admin.
 */
export function MaintenancePage() {
  const t = useT();
  return (
    <main role="main" aria-label={t.maintenance_aria}>
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-app-bg px-6 text-center font-sans antialiased">
        <div className="w-20 h-20 rounded-2xl bg-amber-100 flex items-center justify-center mb-6 shadow-sm">
          <Wrench className="w-10 h-10 text-amber-500" />
        </div>
        <h1 className="text-2xl font-bold text-white/90 mb-2">{t.maintenance_title}</h1>
        <p className="text-white/60 text-base max-w-xs leading-relaxed mb-1">
          {t.maintenance_body}
        </p>
        <p className="text-white/50 text-sm mb-8">{t.maintenance_back_soon}</p>
        <div className="rounded-xl border border-white/20 px-4 py-2 text-[0.6875rem] text-white/60">
          {t.maintenance_contact}
        </div>
      </div>
    </main>
  );
}
