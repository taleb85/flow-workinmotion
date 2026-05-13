import { useState, useEffect, useLayoutEffect, lazy, Suspense, useMemo, useCallback, useRef } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AppProvider, useApp } from './context/AppContext';
import { forceLightTheme } from './utils/theme';
import { getTranslations } from './utils/translations';
import BottomNav from './components/BottomNav';
import MobileProfileHeader from './components/MobileProfileHeader';
import HeaderTodayCoworkersCard from './components/HeaderTodayCoworkersCard';
import RefreshLockOverlay from './components/RefreshLockOverlay';
import BodyPullToRefresh from './components/BodyPullToRefresh';
import DataSyncBanner from './components/DataSyncBanner';
import HomePage from './components/HomePage';
import PunchInKiosk from './components/PunchInKiosk';
import LoginPage from './components/LoginPage';
import StaffPersonalDashboard from './components/StaffPersonalDashboard';
import { Wrench, MonitorOff } from 'lucide-react';
import { persistStoredUiLanguage } from './utils/uiLanguagePreference';
import { PATH_TIMBRATURA, PATH_PROFILO } from './config/appPaths';
import { APP_SESSION_STORAGE_KEY } from './constants/appSession';
import { getUnifiedNavTabs, getBottomNavTabsForMainApp, type AppNavTab } from './utils/enabledModules';
import {
  readMainViewState,
  writeMainViewState,
  clearMainViewState,
  applyWindowScrollY,
} from './utils/mainAppViewRestore';
import { isAdminOnly, isManagementRole } from './utils/permissions';
import AdminGate from './components/AdminGate';
import AdminLayout from './components/AdminLayout';

const WeeklyShiftsTable = lazy(() => import('./components/WeeklyShiftsTable'));
const HolidayRequests = lazy(() => import('./components/HolidayRequests'));
const Statistics = lazy(() => import('./components/Statistics'));
const SettingsPage = lazy(() => import('./components/SettingsPage'));
const Timesheets = lazy(() => import('./components/Timesheets'));

// ─── Maintenance Page ─────────────────────────────────────────────────────────
function MaintenancePage() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-50 px-6 text-center font-sans antialiased">
      <div className="w-20 h-20 rounded-2xl bg-amber-100 flex items-center justify-center mb-6 shadow-sm">
        <Wrench className="w-10 h-10 text-amber-500" />
      </div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2">In Manutenzione</h1>
      <p className="text-slate-500 text-base max-w-xs leading-relaxed mb-1">
        L'app è temporaneamente in manutenzione.
      </p>
      <p className="text-slate-400 text-sm mb-8">Torneremo attivi tra poco. 👨‍🍳</p>
      <div className="text-[11px] text-slate-300 bg-white border border-slate-100 rounded-xl px-4 py-2 shadow-xs">
        Per assistenza contatta il responsabile.
      </div>
    </div>
  );
}

// ─── Kiosk Disabled Page (/timbratura — sempre copy in inglese) ───────────────
function KioskOffPage() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-slate-900 px-6 text-center font-sans antialiased">
      <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center mb-6 shadow-inner">
        <MonitorOff className="w-10 h-10 text-slate-400" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">Terminal unavailable</h1>
      <p className="text-slate-400 text-base max-w-xs leading-relaxed">
        The punch clock terminal is temporarily disabled.
      </p>
      <p className="text-slate-500 text-sm mt-2">Contact a manager for assistance.</p>
    </div>
  );
}

// ─── Kiosk Route ──────────────────────────────────────────────────────────────
function KioskRoute() {
  const navigate = useNavigate();
  const { currentUser, featureFlags, dataSyncInProgress, isGlobalRefreshing, effectiveLanguage } = useApp();

  useEffect(() => {
    const prevLang = document.documentElement.lang;
    document.documentElement.lang = 'en';
    return () => {
      document.documentElement.lang = prevLang;
    };
  }, []);

  useEffect(() => {
    if (currentUser) navigate('/app', { replace: true });
  }, [currentUser, navigate]);

  if (featureFlags['kiosk_active'] === false) {
    return <KioskOffPage />;
  }

  return (
    <div className="min-h-screen w-full flex flex-col safe-area-pad bg-surface font-sans antialiased">
      {dataSyncInProgress && !isGlobalRefreshing && (
        <div className="shrink-0 px-4 pt-2">
          <DataSyncBanner language={effectiveLanguage} />
        </div>
      )}
      <PunchInKiosk onGoToLogin={() => navigate(PATH_PROFILO)} />
    </div>
  );
}

// ─── Login Route ───────────────────────────────────────────────────────────────
function LoginRoute() {
  const navigate = useNavigate();
  const { currentUser, dataSyncInProgress, isGlobalRefreshing, effectiveLanguage } = useApp();

  useEffect(() => {
    if (currentUser) navigate('/app', { replace: true });
  }, [currentUser, navigate]);

  const handleLogin = () => navigate('/app', { replace: true });
  const handleBack = () => navigate(PATH_TIMBRATURA, { replace: true });

  return (
    <>
      {dataSyncInProgress && !isGlobalRefreshing && (
        <div className="px-4 pt-[max(12px,env(safe-area-inset-top,0px))] pb-1 max-w-lg mx-auto w-full">
          <DataSyncBanner language={effectiveLanguage} />
        </div>
      )}
      <AnimatePresence mode="wait">
        <LoginPage key="login" onLogin={handleLogin} onBack={handleBack} />
      </AnimatePresence>
    </>
  );
}

// ─── App principale (gestione + staff): niente sidebar, bottom bar unificata ─
function MainApp({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  const {
    currentUser,
    effectiveLanguage,
    isGlobalRefreshing,
    dataSyncInProgress,
    postRefreshLocked,
    silentRefreshData,
    featureFlags,
    roleTemplatesRevision,
  } = useApp();

  const isManagement = currentUser ? isManagementRole(currentUser.role) : false;

  /** `roleTemplatesRevision` deve essere nelle dipendenze: `getEnabledFeatures` legge il template da cache modulo; dopo PIN/sync il memo altrimenti resta sulla lista schede vecchia. */
  const visibleNavTabs = useMemo((): AppNavTab[] => {
    void roleTemplatesRevision;
    if (!currentUser) return ['home'];
    return getUnifiedNavTabs(currentUser, isManagement, featureFlags);
  }, [currentUser, isManagement, featureFlags, roleTemplatesRevision]);

  /** Bottom bar: staff con ordine ferie → turni (Statistiche in barra se abilitata). */
  const bottomNavTabs = useMemo((): AppNavTab[] => {
    void roleTemplatesRevision;
    if (!currentUser) return ['home'];
    return getBottomNavTabsForMainApp(currentUser, isManagement, featureFlags);
  }, [currentUser, isManagement, featureFlags, roleTemplatesRevision]);

  const tr = getTranslations(effectiveLanguage);
  const noNavTabs = Boolean(currentUser && visibleNavTabs.length === 0);

  const appStickyHeaderRef = useRef<HTMLElement | null>(null);

  /** Altezza reale header sticky → `--app-sticky-header-offset` per barre interne (es. date turni). */
  useLayoutEffect(() => {
    const el = appStickyHeaderRef.current;
    if (!el) return;
    const setOffset = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty('--app-sticky-header-offset', `${h}px`);
    };
    setOffset();
    const ro = new ResizeObserver(setOffset);
    ro.observe(el);
    window.addEventListener('resize', setOffset);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', setOffset);
      document.documentElement.style.removeProperty('--app-sticky-header-offset');
    };
  }, []);

  const [activeTab, setActiveTab] = useState<AppNavTab>('home');
  const mainViewRestoredUserIdRef = useRef<string | null>(null);
  const pendingScrollRestoreRef = useRef<{ y: number; tab: AppNavTab } | null>(null);
  /** Allinea staff a Storage (template/flag) senza burst: stesso ordine di grandezza del throttle in AppContext. */
  const storagePullThrottleRef = useRef(0);
  const STORAGE_PULL_THROTTLE_MS = 5000;

  const handleTabChange = useCallback(
    (id: AppNavTab) => {
      if (isManagement && id === 'settings' && currentUser && isAdminOnly(currentUser)) {
        void silentRefreshData({ pullRemoteConfig: true });
        navigate('/admin');
        return;
      }
      setActiveTab(id);
      const now = Date.now();
      const pullRemote = now - storagePullThrottleRef.current >= STORAGE_PULL_THROTTLE_MS;
      if (pullRemote) storagePullThrottleRef.current = now;
      void silentRefreshData(pullRemote ? { pullRemoteConfig: true } : undefined);
    },
    [currentUser, isManagement, navigate, silentRefreshData]
  );

  useEffect(() => {
    silentRefreshData();
  }, [silentRefreshData]);

  useEffect(() => {
    if (!currentUser) return;
    if (visibleNavTabs.length === 0) return;
    if (!visibleNavTabs.includes(activeTab)) {
      setActiveTab(visibleNavTabs[0]!);
    }
  }, [currentUser, isManagement, featureFlags, visibleNavTabs, activeTab]);

  /** Dopo reload: ripristina tab e (subito dopo il paint) scroll salvati in sessionStorage. */
  useLayoutEffect(() => {
    if (!currentUser?.id || visibleNavTabs.length === 0) return;
    if (mainViewRestoredUserIdRef.current === currentUser.id) return;
    mainViewRestoredUserIdRef.current = currentUser.id;
    const s = readMainViewState(currentUser.id);
    if (s?.activeTab && visibleNavTabs.includes(s.activeTab as AppNavTab)) {
      const tab = s.activeTab as AppNavTab;
      setActiveTab(tab);
      pendingScrollRestoreRef.current = { y: s.scrollY, tab };
    } else {
      pendingScrollRestoreRef.current = null;
    }
  }, [currentUser?.id, visibleNavTabs]);

  useEffect(() => {
    const bundle = pendingScrollRestoreRef.current;
    if (!bundle || bundle.tab !== activeTab) return;
    if (isGlobalRefreshing || postRefreshLocked) return;
    pendingScrollRestoreRef.current = null;
    const y = bundle.y;
    const apply = () => applyWindowScrollY(y);
    apply();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      apply();
      raf2 = requestAnimationFrame(apply);
    });
    const t1 = window.setTimeout(apply, 80);
    const t2 = window.setTimeout(apply, 320);
    const t3 = window.setTimeout(apply, 800);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [activeTab, isGlobalRefreshing, postRefreshLocked]);

  const persistSkipFirstActiveTabRef = useRef(true);
  useEffect(() => {
    if (!currentUser?.id) return;
    const save = () => {
      writeMainViewState(currentUser.id, {
        activeTab,
        scrollY: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
      });
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') save();
    };
    window.addEventListener('pagehide', save);
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', save);
      window.removeEventListener('beforeunload', save);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [currentUser?.id, activeTab]);

  useEffect(() => {
    if (!currentUser?.id) return;
    if (persistSkipFirstActiveTabRef.current) {
      persistSkipFirstActiveTabRef.current = false;
      return;
    }
    writeMainViewState(currentUser.id, {
      activeTab,
      scrollY: window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0,
    });
  }, [currentUser?.id, activeTab]);

  /** Da NotificationCenter / Statistiche: apre tab (es. Presenze) e scroll ad ancoraggio. */
  useEffect(() => {
    const onNavigate = (e: Event) => {
      const ce = e as CustomEvent<{ tab?: AppNavTab; anchor?: string }>;
      const tab = ce.detail?.tab;
      const anchor = ce.detail?.anchor;
      if (!tab || !visibleNavTabs.includes(tab)) return;
      setActiveTab(tab);
      const now = Date.now();
      const pullRemote = now - storagePullThrottleRef.current >= STORAGE_PULL_THROTTLE_MS;
      if (pullRemote) storagePullThrottleRef.current = now;
      void silentRefreshData(pullRemote ? { pullRemoteConfig: true } : undefined);
      const scrollTo = () => {
        if (!anchor) return;
        document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      requestAnimationFrame(() => requestAnimationFrame(scrollTo));
      window.setTimeout(scrollTo, 400);
      window.setTimeout(scrollTo, 800);
    };
    window.addEventListener('osteria-navigate', onNavigate as EventListener);
    return () => window.removeEventListener('osteria-navigate', onNavigate as EventListener);
  }, [visibleNavTabs, isManagement, silentRefreshData]);

  const renderManagementContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <HomePage
            onNavigateToHolidays={() => setActiveTab('ferie')}
            onNavigateToShifts={() => setActiveTab('turni')}
            onNavigateToReports={() => setActiveTab('timesheet')}
          />
        );
      case 'turni':
        return <WeeklyShiftsTable />;
      case 'ferie':
        return <HolidayRequests />;
      case 'reports':
        return <Statistics />;
      case 'timesheet':
        return <Timesheets />;
      case 'settings':
        return <SettingsPage />;
      default:
        return null;
    }
  };

  const appHeaderCardClass =
    'w-full rounded-2xl border border-slate-100 bg-white/95 shadow-[0_4px_16px_-4px_rgba(45,90,39,0.14),0_2px_8px_-4px_rgba(15,23,42,0.08)] overflow-hidden supports-[backdrop-filter]:backdrop-blur-md';

  return (
    <div className="min-h-screen min-h-[100dvh] w-full bg-[#f8fafc] text-[#1a1a1a] font-sans antialiased overflow-x-clip safe-area-pad pt-0 flex flex-col">
      <BodyPullToRefresh
        onRefresh={() => silentRefreshData({ pullRemoteConfig: true })}
        disabled={!!(isGlobalRefreshing || postRefreshLocked)}
      />

      {/*
        Sticky: solo safe-area + padding come il main (px-4 sm:px-6). Un’unica card definisce i bordi visibili.
      */}
      <header
        ref={appStickyHeaderRef}
        className="sticky top-0 z-40 shrink-0 pt-[max(6px,env(safe-area-inset-top,0px))] px-4 sm:px-6 pb-2"
      >
        <div className={appHeaderCardClass}>
          <MobileProfileHeader
            onLogout={onLogout}
            activeTab={activeTab}
            showOnDesktop
            parentProvidesCardShell
            hideHeaderLogout={!isManagement}
          />
        </div>
        {currentUser && (
          <div className={`${appHeaderCardClass} mt-2`}>
            <HeaderTodayCoworkersCard />
          </div>
        )}
      </header>

      {currentUser && dataSyncInProgress && !isGlobalRefreshing && !postRefreshLocked && (
        <div className="shrink-0 z-30 px-4 sm:px-6 pt-1">
          <DataSyncBanner language={effectiveLanguage} />
        </div>
      )}

      <main
        className={`flex-1 flex flex-col w-full min-h-0 ${isGlobalRefreshing || postRefreshLocked ? 'blur-md pointer-events-none' : ''}`}
      >
        <div className="w-full flex-1 pt-3 sm:pt-4 pb-content px-4 sm:px-6">
          {noNavTabs ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-10 text-center text-sm text-amber-950 max-w-lg mx-auto">
              {(tr as Record<string, string>).app_all_nav_tabs_disabled}
            </div>
          ) : isManagement ? (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                className="w-full"
              >
                <Suspense
                  fallback={
                    <div className="flex items-center justify-center min-h-[200px]">
                      <div className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    </div>
                  }
                >
                  {renderManagementContent()}
                </Suspense>
              </motion.div>
            </AnimatePresence>
          ) : currentUser ? (
            <StaffPersonalDashboard
              user={currentUser}
              onLogout={onLogout}
              activeTab={activeTab}
              onTabChange={handleTabChange}
            />
          ) : null}
        </div>
      </main>

      {isGlobalRefreshing && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-accent font-sans text-center px-4">
          <div className="w-14 h-14 border-4 border-white border-t-transparent rounded-xl animate-spin mb-4" />
          <p className="text-white text-lg font-medium max-w-xs">
            {getTranslations(effectiveLanguage).sync_total_in_progress}
          </p>
        </div>
      )}

      <AnimatePresence mode="wait">{postRefreshLocked && <RefreshLockOverlay key="refresh-lock" />}</AnimatePresence>

      {!noNavTabs && (
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} visibleTabs={bottomNavTabs} />
      )}
    </div>
  );
}

// ─── Protected App Route ───────────────────────────────────────────────────────
function ProtectedApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, setCurrentUser, forceLogoutRequested, clearForceLogoutRequest, featureFlags, showError, effectiveLanguage } = useApp();

  useEffect(() => {
    const state = location.state as { accessDenied?: boolean } | null;
    if (state?.accessDenied) {
      showError?.(getTranslations(effectiveLanguage).app_access_denied);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, showError, effectiveLanguage]);

  const handleLogout = () => {
    forceLightTheme();
    try {
      localStorage.removeItem(APP_SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (currentUser?.language && ['it', 'en', 'es', 'fr'].includes(currentUser.language)) {
      persistStoredUiLanguage(currentUser.language);
    }
    setCurrentUser(null);
    navigate(PATH_TIMBRATURA, { replace: true });
  };

  useEffect(() => {
    if (forceLogoutRequested) {
      if (currentUser?.id) clearMainViewState(currentUser.id);
      forceLightTheme();
      try {
        localStorage.removeItem(APP_SESSION_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (currentUser?.language && ['it', 'en', 'es', 'fr'].includes(currentUser.language)) {
        persistStoredUiLanguage(currentUser.language);
      }
      setCurrentUser(null);
      clearForceLogoutRequest();
      navigate(PATH_TIMBRATURA, { replace: true });
    }
  }, [
    forceLogoutRequested,
    clearForceLogoutRequest,
    currentUser?.id,
    currentUser?.language,
    setCurrentUser,
    navigate,
  ]);

  if (!currentUser) {
    return <Navigate to={PATH_PROFILO} replace />;
  }

  if (featureFlags['maintenance_mode'] === true && currentUser.role !== 'admin') {
    return <MaintenancePage />;
  }

  return <MainApp onLogout={handleLogout} />;
}

// ─── Root App ─────────────────────────────────────────────────────────────────
function AppContent() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={PATH_TIMBRATURA} replace />} />
      <Route path={PATH_TIMBRATURA} element={<KioskRoute />} />
      <Route path="/kiosk" element={<Navigate to={PATH_TIMBRATURA} replace />} />
      <Route path={PATH_PROFILO} element={<LoginRoute />} />
      <Route path="/login" element={<Navigate to={PATH_PROFILO} replace />} />
      <Route path="/app" element={<ProtectedApp />} />
      <Route path="/app/*" element={<ProtectedApp />} />
      <Route path="/admin" element={<AdminGate><AdminLayout /></AdminGate>} />
      <Route path="/admin/*" element={<AdminGate><AdminLayout /></AdminGate>} />
      <Route path="*" element={<Navigate to={PATH_TIMBRATURA} replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
