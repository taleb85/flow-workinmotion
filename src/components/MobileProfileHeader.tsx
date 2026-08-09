import FlowWaveIcon from './ui/FlowWaveIcon';
import { type ReactNode } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import { useAppUser } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { getDateLocale } from '../utils/translations';
// import { getRoleScopeHint } from '../utils/roleScopeHint'; // unused
import { getAppNavTabTitle, type AppNavTab } from '../utils/enabledModules';
import { UnifiedBellButton } from './UnifiedBellButton';
import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { it as itLocale } from 'date-fns/locale';
// import { isUiWidgetVisible } from '../utils/uiScreenWidgets'; // unused
// import { useMessages } from '../hooks/useMessages'; // unused
import { useMultisensorialFeedback } from '../hooks/useMultisensorialFeedback';
interface MobileProfileHeaderProps {
  onLogout?: () => void;
  /** Tab attiva: titolo come la dashboard (h1) in base alla scheda. */
  activeTab?: AppNavTab;
  /** Se true, mostra anche su desktop (layout unificato con bottom bar) */
  showOnDesktop?: boolean;
  /** Se true, mostra solo titolo e data (senza righe tipo scheda Profilo) */
  compact?: boolean;
  /** In MainApp sticky header: stessa card senza mb-2 (margine gestito da main). */
  embeddedInAppHeader?: boolean;
  /** Il genitore (es. MainApp) avvolge già la card con bordo/ombra — solo contenuto interno. */
  parentProvidesCardShell?: boolean;
  /** Se true, nasconde il pulsante Esci nell’header e lo lascia solo nel modale avatar (override raro). */
  hideHeaderLogout?: boolean;
  /** Se true, nasconde il pulsante profilo (es. non-admin: profilo solo in bottom bar). */
  hideToolbarAvatar?: boolean;
  rightExtra?: ReactNode;
}

export default function MobileProfileHeader({
  onLogout,
  activeTab = 'home',
  showOnDesktop = false,
  compact: _compact = false,
  embeddedInAppHeader: _embeddedInAppHeader = false,
  parentProvidesCardShell: _parentProvidesCardShell = false,
  hideHeaderLogout = false,
  hideToolbarAvatar: _hideToolbarAvatar = false,
  rightExtra,
}: MobileProfileHeaderProps) {
  const {
    currentUser,
    effectiveLanguage,
    isSessionElevated,
  } = useAppUser();

  // Animazioni on/off — persiste in localStorage
  const [animationsOn, _setAnimationsOn] = useState<boolean>(() => {
    try {
      return localStorage.getItem('flow-animations') !== 'off';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (animationsOn) {
      document.documentElement.classList.remove('no-motion');
      localStorage.setItem('flow-animations', 'on');
    } else {
      document.documentElement.classList.add('no-motion');
      localStorage.setItem('flow-animations', 'off');
    }
  }, [animationsOn]);
  // Applica anche al primo mount (se salvato come off)
  useEffect(() => {
    if (!animationsOn) document.documentElement.classList.add('no-motion');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { triggerHapticFeedback } = useMultisensorialFeedback();

  const wrapperRef = useRef<HTMLDivElement>(null);

  // Orologio live
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const dateLabel = format(now, 'EEE d MMM · HH:mm', { locale: getDateLocale(effectiveLanguage) ?? itLocale });

  const t = useT();
  if (!currentUser) return null;

  const _pageTitle = getAppNavTabTitle(t, activeTab);

  const shellClass = `w-full ${showOnDesktop ? '' : 'md:hidden'}`;

  const body = (
    <div className="relative" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }} ref={wrapperRef}>
    <div
      className="flow-brand-header px-4 flex items-center justify-between gap-3"
      style={{ height: 50 }}
    >
      {/* Sinistra: icona F + testo */}
      <div
        className="flex items-center gap-2.5 min-w-0"
      >
        <div
          role="button"
          tabIndex={0}
          style={{ width: 30, height: 30, flexShrink: 0, cursor: 'pointer' }}
          onClick={() => {
            if ('caches' in window) {
              caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).finally(() => {
                globalThis.location.reload();
              });
            } else {
              globalThis.location.reload();
            }
          }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.currentTarget.click(); }}
        >
          <FlowWaveIcon size={36} />
        </div>
        <div className="flex flex-col leading-none select-none">
          <span
            style={{ color: '#ffffff', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 18, fontWeight: 700, letterSpacing: '0.08em', lineHeight: 1 }}
          >
            FLOW
          </span>
          <span
            style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 10, fontWeight: 500, letterSpacing: '0.20em', textTransform: 'uppercase', marginTop: 3, lineHeight: 1 }}
          >
            Work in Motion <span style={{ color: 'rgba(255,255,255,0.25)', marginLeft: 2 }}>v{__APP_VERSION__}</span>
          </span>
        </div>
        {isSessionElevated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm">
            <ShieldCheck className="h-3 w-3" />
            Admin
          </span>
        )}
      </div>

      {/* Destra: live dot + data | separatore | azioni (extra + campanella + logout) — nascosto su mobile */}
      <div className="hidden md:flex shrink-0 items-center gap-2.5">
        {/* Status: live dot + data */}
        <span
          className="hidden sm:inline text-[13px] font-medium whitespace-nowrap capitalize tabular-nums"
          style={{ color: 'rgba(255,255,255,0.60)', letterSpacing: '0.01em' }}
        >
          {dateLabel}
        </span>

        {/* Separatore verticale */}
        <span className="w-px h-4 bg-white/15 shrink-0 mx-0.5" />

        {/* Slot azioni (sync + PIN dall'esterno) */}
        {rightExtra}

        {/* Campanella */}
        <UnifiedBellButton
          userId={currentUser?.id}
          effectiveLanguage={effectiveLanguage}
          onMessageClick={(messageId) => { void messageId; }}
        />

        {/* Logout */}
        {onLogout && !hideHeaderLogout && (
          <button
            type="button"
            onClick={() => { triggerHapticFeedback('click'); onLogout?.(); }}
            title={t.header_logout}
            aria-label={t.header_logout}
            style={{ width: 28, height: 28, borderRadius: 7, background: 'rgba(255, 255, 255, 0.16)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0 }}
            className="text-white/70 hover:bg-white/15 hover:text-white touch-manipulation"
          >
            <LogOut style={{ width: 13, height: 13 }} strokeWidth={2} aria-hidden />
          </button>
        )}
      </div>
    </div>
    </div>
  );

  return <div className={shellClass}>{body}</div>;
}
