import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Users, Settings, LayoutList, RefreshCw, RotateCcw } from 'lucide-react';
import DataSyncBanner from './DataSyncBanner';
import { useApp } from '../context/AppContext';
import { isAdminOnly, canEditRoleFeatureTemplates } from '../utils/permissions';
import { getTranslations } from '../utils/translations';
import SettingsPage from './SettingsPage';
import ImpostazioniPage from './ImpostazioniPage';
import ProfileVisibilityHub from './ProfileVisibilityHub';

type AdminTab = 'profili' | 'visibilita' | 'impostazioni';

/** Stessa card dell’header principale (`App.tsx`): bordi e ombra allineati al resto dell’app. */
const adminHeaderCardClass =
  'w-full rounded-2xl border border-slate-100 bg-white/95 shadow-[0_4px_16px_-4px_rgba(45,90,39,0.14),0_2px_8px_-4px_rgba(15,23,42,0.08)] overflow-hidden supports-[backdrop-filter]:backdrop-blur-md';

export default function AdminLayout() {
  const navigate = useNavigate();
  const {
    currentUser,
    silentRefreshData,
    hardReloadFromDatabase,
    effectiveLanguage,
    showSuccess,
    isGlobalRefreshing,
    dataSyncInProgress,
  } = useApp();
  const t = getTranslations(effectiveLanguage);
  const [activeTab, setActiveTab] = useState<AdminTab>('profili');
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [hardReloading, setHardReloading] = useState(false);
  const fullAdminNav = currentUser && isAdminOnly(currentUser);
  const showAdminNav = fullAdminNav || (currentUser && canEditRoleFeatureTemplates(currentUser));
  const syncBusy = cloudSyncing || hardReloading || isGlobalRefreshing || dataSyncInProgress;

  const handleTabChange = useCallback((tab: AdminTab) => {
    setActiveTab(tab);
    /** Storage (template ruoli, moduli admin, flag): altrimenti telefono resta su localStorage vecchio ≠ PC. */
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
    if (activeTab === 'visibilita' || activeTab === 'impostazioni') {
      setActiveTab('profili');
    }
  }, [fullAdminNav, activeTab]);

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[#f8fafc] text-[#1a1a1a] font-sans antialiased flex flex-col safe-area-pad overflow-x-clip">
      <header className="sticky top-0 z-40 shrink-0 pt-[max(6px,env(safe-area-inset-top,0px))] px-4 sm:px-6 pb-2">
        <div className={adminHeaderCardClass}>
          <div className="flex items-center justify-between gap-3 sm:gap-4 px-3 sm:px-4 py-2.5">
            <button
              type="button"
              onClick={() => navigate('/app')}
              className="flex items-center gap-2 min-h-[44px] px-2 -ml-1 rounded-xl text-slate-600 hover:text-accent hover:bg-accent/[0.07] font-medium text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4 shrink-0 text-accent/80" />
              {t.admin_back_to_app}
            </button>
            {showAdminNav && (
              <nav className="flex flex-wrap items-center justify-end gap-1 rounded-xl bg-slate-100/90 border border-slate-200/70 p-1 max-w-[min(100%,46rem)]">
                {fullAdminNav && (
                  <>
                    <button
                      type="button"
                      disabled={syncBusy}
                      aria-busy={syncBusy}
                      onClick={async () => {
                        setCloudSyncing(true);
                        try {
                          await silentRefreshData({ pullRemoteConfig: true });
                          showSuccess?.(t.settings_cloud_sync_success);
                        } finally {
                          setCloudSyncing(false);
                        }
                      }}
                      className={`relative flex min-h-[44px] items-center gap-2 overflow-hidden rounded-lg border px-3 text-xs font-semibold transition-all duration-200 disabled:pointer-events-none ${
                        syncBusy
                          ? 'border-accent/25 bg-white text-slate-700 shadow-[inset_0_0_0_1px_rgba(45,90,39,0.08)]'
                          : 'border-transparent text-slate-600 hover:border-slate-200/80 hover:bg-white/90 hover:text-slate-900'
                      } disabled:opacity-60`}
                    >
                      {syncBusy && (
                        <span
                          className="pointer-events-none absolute inset-x-2 bottom-1 h-[3px] overflow-hidden rounded-full bg-slate-200/70"
                          aria-hidden
                        >
                          <span className="block h-full w-[42%] rounded-full bg-gradient-to-r from-accent/75 to-accent shadow-[0_0_8px_rgba(45,90,39,0.35)] animate-admin-sync-bar" />
                        </span>
                      )}
                      <RefreshCw
                        className={`relative z-[1] h-3.5 w-3.5 shrink-0 transition-transform ${cloudSyncing ? 'animate-spin text-accent' : ''}`}
                        aria-hidden
                      />
                      <span className="relative z-[1]">{t.settings_cloud_sync_button}</span>
                    </button>
                    <button
                      type="button"
                      disabled={syncBusy}
                      title={t.hard_reload_hint}
                      onClick={async () => {
                        if (!window.confirm(t.hard_reload_confirm)) return;
                        setHardReloading(true);
                        try {
                          await hardReloadFromDatabase();
                        } finally {
                          setHardReloading(false);
                        }
                      }}
                      className={`relative flex min-h-[44px] items-center gap-2 overflow-hidden rounded-lg border px-3 text-xs font-semibold transition-all duration-200 disabled:pointer-events-none ${
                        hardReloading
                          ? 'border-amber-300/80 bg-amber-50 text-amber-950 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.2)]'
                          : 'border-amber-200/90 bg-amber-50/95 text-amber-950 hover:bg-amber-100 hover:border-amber-300'
                      } disabled:opacity-60`}
                    >
                      <RotateCcw
                        className={`relative z-[1] h-3.5 w-3.5 shrink-0 ${hardReloading ? 'animate-spin' : ''}`}
                        aria-hidden
                      />
                      <span className="relative z-[1] max-w-[10rem] truncate sm:max-w-none">{t.hard_reload_button}</span>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleTabChange('profili')}
                  className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                    activeTab === 'profili'
                      ? 'bg-white text-accent shadow-sm ring-1 ring-accent/15'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                  }`}
                >
                  <Users className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'profili' ? 'text-accent' : ''}`} />
                  {t.admin_nav_profiles}
                </button>
                {fullAdminNav && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleTabChange('visibilita')}
                      className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                        activeTab === 'visibilita'
                          ? 'bg-white text-accent shadow-sm ring-1 ring-accent/15'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                      }`}
                    >
                      <LayoutList className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'visibilita' ? 'text-accent' : ''}`} />
                      {t.admin_nav_visibility}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTabChange('impostazioni')}
                      className={`flex items-center gap-2 min-h-[44px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                        activeTab === 'impostazioni'
                          ? 'bg-white text-accent shadow-sm ring-1 ring-accent/15'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-white/80'
                      }`}
                    >
                      <Settings className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'impostazioni' ? 'text-accent' : ''}`} />
                      {t.admin_nav_settings}
                    </button>
                  </>
                )}
              </nav>
            )}
          </div>
        </div>
      </header>

      {dataSyncInProgress && !isGlobalRefreshing && (
        <div className="shrink-0 px-4 sm:px-6 pt-1">
          <DataSyncBanner language={effectiveLanguage} />
        </div>
      )}

      <main className="flex-1 overflow-y-auto">
        {/* Montate tutte e tre: evita reset di stato non salvato cambiando tab o uscendo/entrando dalla stessa scheda */}
        <div className={activeTab === 'profili' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'profili'}>
          <SettingsPage />
        </div>
        <div className={activeTab === 'visibilita' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'visibilita'}>
          <ProfileVisibilityHub />
        </div>
        <div className={activeTab === 'impostazioni' ? 'block' : 'hidden'} aria-hidden={activeTab !== 'impostazioni'}>
          <ImpostazioniPage onOpenProfilesTab={() => handleTabChange('profili')} />
        </div>
      </main>
    </div>
  );
}
