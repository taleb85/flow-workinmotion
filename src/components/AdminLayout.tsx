import { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Settings } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { isAdminOnly } from '../utils/permissions';
import { getStoredTheme, getThemeById } from '../utils/backgroundThemes';
import type { BackgroundTheme } from '../utils/backgroundThemes';
import DeepAuroraShell from './DeepAuroraShell';
import SettingsPage from './SettingsPage';

type AdminTab = 'profili' | 'impostazioni';

const adminHeaderCardClass =
  'w-full rounded-2xl border border-white/12 overflow-visible backdrop-blur-[1.25rem] shadow-[0_4px_16px_-4px_rgba(0,0,0,0.3)]';

interface TabDef {
  key: AdminTab;
  icon: typeof Users;
  label: string;
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const { currentUser, isSessionElevated } = useAppUser();
  const { silentRefreshData } = useAppOverlay();
  const t = useT();
  const fullAdminNav = !!(currentUser && (isAdminOnly(currentUser) || isSessionElevated || currentUser.elevated_role));
  const [activeTab, setActiveTab] = useState<AdminTab>('profili');
  const [bgTheme, setBgTheme] = useState<BackgroundTheme>(() => getStoredTheme(currentUser?.id));

  // Applica appBg a html e body così il colore del tema copre tutto lo schermo
  useEffect(() => {
    const bg = bgTheme.appBg;
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    const r = parseInt(bg.slice(1, 3), 16);
    const g = parseInt(bg.slice(3, 5), 16);
    const b = parseInt(bg.slice(5, 7), 16);
    document.documentElement.style.setProperty('--app-bg-r', String(r));
    document.documentElement.style.setProperty('--app-bg-g', String(g));
    document.documentElement.style.setProperty('--app-bg-b', String(b));
  }, [bgTheme]);

  useEffect(() => {
    const handler = (e: Event) => setBgTheme(getThemeById((e as CustomEvent<string>).detail));
    window.addEventListener('flow-bg-change', handler);
    return () => window.removeEventListener('flow-bg-change', handler);
  }, []);

  const handleTabChange = useCallback((tab: AdminTab) => {
    setActiveTab(tab);
    void silentRefreshData({ pullRemoteConfig: true });
  }, [silentRefreshData]);

  useEffect(() => {
    void silentRefreshData({ pullRemoteConfig: true });
  }, [silentRefreshData]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void silentRefreshData({ pullRemoteConfig: true });
      }
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onVis);
    };
  }, [silentRefreshData]);

  useEffect(() => {
    if (fullAdminNav) return;
    if (activeTab !== 'profili') {
      setActiveTab('profili');
    }
  }, [fullAdminNav, activeTab]);

  const tabs: TabDef[] = useMemo(() => [
    { key: 'profili', icon: Users, label: t.admin_tab_profiles },
    { key: 'impostazioni', icon: Settings, label: t.settings_title },
  ], [t]);

  return (
    <div className="relative min-h-screen min-h-[100dvh] w-full text-white font-sans antialiased flex flex-col safe-area-pad overflow-x-clip overflow-y-auto page-depth-bg" style={{ background: bgTheme.appBg }}>
      <DeepAuroraShell theme={bgTheme} />
      <header className="sticky top-0 z-40 shrink-0 pt-[max(64px,env(safe-area-inset-top,0px))] md:pt-[max(6px,env(safe-area-inset-top,0px))] app-horizontal-pad pb-2">
        <div className={`${adminHeaderCardClass}`}>
          <div className="flex items-center justify-between gap-2 px-3 md:px-4 py-2">
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="flex items-center gap-1.5 min-h-[2.25rem] px-2 -ml-1 rounded-xl text-white/70 hover:text-white hover:bg-white/10 font-medium text-sm transition-colors shrink-0 active:text-white"
            >
              <ArrowLeft className="w-4 h-4 shrink-0 text-accent/70" />
              <span className="hidden md:inline">{t.admin_back_to_app}</span>
            </button>

            <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar" aria-label="Sezioni pannello admin">
              {tabs.map(({ key, icon: Icon, label }) => {
                const isActive = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTabChange(key)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
 isActive
 ? 'bg-accent text-white shadow-sm'
 : 'text-white/60 hover:bg-white/10 hover:text-white active:text-white'
 }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 text-white" aria-hidden />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-6">
        <div className="mx-auto w-full max-w-7xl">
          {activeTab === 'profili' && (
            <SettingsPage view="profili" />
          )}
          {activeTab === 'impostazioni' && (
            <div className="space-y-6">
              {fullAdminNav && (
                <div className="rounded-2xl border border-white/12 overflow-hidden">
                  <div className="px-4 pt-3 pb-1">
                    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-widest text-white/50">
                      {t.admin_tab_rules}
                    </h2>
                  </div>
                  <SettingsPage view="regole" />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
