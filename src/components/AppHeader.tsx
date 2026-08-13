import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { LogOut, ChevronDown } from 'lucide-react';
import { useAppUser } from '../context/AppContext';
import { useTenant } from '../context/TenantContext';
import { useT } from '../hooks/useT';
import UserAvatarMenu from './UserAvatarMenu';
import NotificationCenter from './NotificationCenter';
import { CenteredModalPortal } from './ui/CenteredModalPortal';

/** Componente ultra-leggero: si re-renderizza ogni minuto per mostrare l'ora
 *  senza causare re-render del padre AppHeader. */
function ClockDisplay() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const msToNext = 60_000 - (Date.now() % 60_000);
    const t = window.setTimeout(() => {
      setNow(new Date());
      const i = window.setInterval(() => setNow(new Date()), 60_000);
      return () => window.clearInterval(i);
    }, msToNext);
    const onVis = () => { if (document.visibilityState === 'visible') setNow(new Date()); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return <>{format(now, 'HH:mm', { locale: it })}</>;
}

interface AppHeaderProps {
  onLogout?: () => void;
}

export default function AppHeader({ onLogout }: AppHeaderProps) {
  const { currentUser, effectiveLanguage, setLanguage } = useAppUser();
  const { tenant } = useTenant();
  const tenantName = tenant?.name ?? 'FLOW';
  const t = useT();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const langModalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!langOpen) return;
    const handler = (e: PointerEvent) => {
      const tgt = e.target as Node;
      if (langModalRef.current?.contains(tgt)) return;
      if (langRef.current?.contains(tgt)) return;
      setLangOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [langOpen]);

  const langLabels: Record<string, string> = { it: 'IT', en: 'EN', es: 'ES', fr: 'FR' };
  const langFlags: Record<string, string> = { it: '🇮🇹', en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷' };

  if (!currentUser) return null;

  return (
    <header className="sticky top-0 z-30 w-full border-b border-white/10 bg-[rgba(58,95,160,0.75)] backdrop-blur-md safe-area-pad pt-0">
      <div className="w-full px-3 md:px-6 py-1.5 md:py-2.5 flex items-center justify-between gap-2">
        {/* Logo — nascosto su desktop (gestito dalla Sidebar) */}
        <h1
          className="text-[35px] text-accent tracking-tight min-w-0 flex-1 truncate pr-2 leading-[33px] md:hidden"
          style={{ fontFamily: 'var(--brand-header-font)' }}
        >
          {tenantName}
        </h1>
        {/* Brand su desktop (la sidebar non ha più l'header) */}
        <div className="hidden md:flex flex-col justify-center min-w-0 flex-1">
          <h1
            className="text-[22px] text-accent tracking-tight leading-tight truncate"
            style={{ fontFamily: 'var(--brand-header-font)' }}
          >
            {tenantName}
          </h1>
          <p className="text-[11px] text-white/50 font-semibold uppercase tracking-widest leading-none">
            {t.header_tagline}
          </p>
        </div>

        {/* Destra: avatar + campanella + lingua + orario + logout mobile */}
        <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
          <UserAvatarMenu />
          <NotificationCenter />

          {/* Selettore lingua — dropdown singolo */}
          <div ref={langRef} className="relative">
            <button
              type="button"
              onClick={() => setLangOpen((v) => !v)}
              className="flex min-h-[36px] items-center gap-0.5 rounded-xl border border-neutral-500 px-2 py-1 text-xs font-semibold text-white/70 surface-ghost-interactive"
            >
              <span>{langFlags[effectiveLanguage]}</span>
              <span className="hidden md:inline ml-0.5">{langLabels[effectiveLanguage]}</span>
              <ChevronDown className="w-3 h-3 text-white/50" />
            </button>
            {langOpen && (
              <CenteredModalPortal
                open
                onClose={() => setLangOpen(false)}
                panelRef={langModalRef}
                backdropAriaLabel={t.close}
                ariaLabel={t.language}
                maxWidthClass="max-w-xs"
                panelClassName="py-1"
              >
                <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-white">{t.language}</p>
                {(['it', 'en', 'es', 'fr'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => {
                      setLanguage(lang);
                      setLangOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
 effectiveLanguage === lang
 ? 'bg-accent/10 font-semibold text-accent'
 : 'text-white/80 hover:bg-white/8'
 } active:bg-white/8'/80`}
                  >
                    <span>{langFlags[lang]}</span>
                    <span className="text-xs font-medium">{langLabels[lang]}</span>
                  </button>
                ))}
              </CenteredModalPortal>
            )}
          </div>

          {/* Logout — solo mobile (su desktop è nella sidebar) */}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title={t.header_logout}
className="flex min-h-[44px] min-w-[44px] flex-shrink-0 items-center justify-center rounded-xl border border-neutral-500 text-white/70 surface-ghost-interactive md:hidden transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
            >
              <LogOut className="w-4 h-4" strokeWidth={2} />
            </button>
          )}

          <span className="hidden md:block text-white/50 text-xs font-medium tabular-nums">
            <ClockDisplay />
          </span>
        </div>
      </div>
    </header>
  );
}
