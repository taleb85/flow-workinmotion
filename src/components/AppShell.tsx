import { useEffect, useLayoutEffect, lazy, Suspense, useMemo, useCallback, useRef, useState } from 'react';

import AdminSyncOverlay from '../components/AdminSyncOverlay';
import { RouteErrorBoundary } from '../components/RouteErrorBoundary';
import DeepAuroraShell from '../components/DeepAuroraShell';
import { getStoredTheme, getThemeById } from '../utils/backgroundThemes';
import type { BackgroundTheme } from '../utils/backgroundThemes';
import DesignAuditPreview from '../components/DesignAuditPreview';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
// AnimatePresence/motion mantenuti solo per overlay modali e PIN;
// le animazioni cambio tab sono state sostituite con CSS transitions (performance mobile).
import { useAppUser, useAppConfig, useAppOverlay } from '../context/AppContext';
import { ProfileLeaveGuardRefContext, type ProfileLeaveGuard } from '../context/ProfileLeaveGuardContext';
import { applyUnauthenticatedDocumentTheme } from '../utils/theme';
import { useT } from '../hooks/useT';
import TopTabBar from '../components/TopTabBar';
import MobileProfileHeader from '../components/MobileProfileHeader';
import FlowWaveIcon from '../components/ui/FlowWaveIcon';
import RefreshLockOverlay from '../components/RefreshLockOverlay';
import PostUnlockRestartOverlay from '../components/PostUnlockRestartOverlay';

import HomePage from '../components/HomePage';
import LoginPage from '../components/LoginPage';
import InviteRedirect from '../components/InviteRedirect';
import { RotateCw, Cloud, CloudOff, Lock, Unlock, ShieldCheck, ShieldOff, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { PinPadModal } from '../components/ui/PinPadModal';
import { lockBodyScroll, unlockBodyScroll } from '../utils/bodyScrollLock';
import { persistStoredUiLanguage } from '../utils/uiLanguagePreference';
import { PATH_PROFILO } from '../config/appPaths';
import { APP_SESSION_STORAGE_KEY } from '../constants/appSession';
import { getUnifiedNavTabs, getBottomNavTabsForMainApp, type AppNavTab } from '../utils/enabledModules';
import {
  readMainViewState,
  writeMainViewState,
  clearMainViewState,
  applyWindowScrollY,
  getAppRootScrollY,
} from '../utils/mainAppViewRestore';
import { useIsMobileViewport } from '../hooks/useIsMobileViewport';
import { isAdminOnly, isManagementRole, findFreezeVerifierById } from '../utils/permissions';
import AdminGate from '../components/AdminGate';
import { MaintenancePage } from '../components/MaintenancePage';

const StaffPersonalDashboard = lazy(() => import('../components/StaffPersonalDashboard'));
const ProfileNavTabPanel = lazy(() => import('../components/ProfileNavTabPanel'));
const AdminLayout = lazy(() => import('../components/AdminLayout'));
const OnboardingSetupModal = lazy(() => import('../components/OnboardingSetupModal'));
const PermissionRequestModal = lazy(() => import('../components/PermissionRequestModal').then(m => ({ default: m.default })));
const shouldShowPermissionModal = () =>
  import('../components/permissionModalEligibility').then((m) => m.shouldShowPermissionModal()).catch(() => false);

const HolidayRequests = lazy(() => import('../components/HolidayRequests'));
const SettingsPage = lazy(() => import('../components/SettingsPage'));
const UnifiedShiftsPage = lazy(() => import('../components/UnifiedShiftsPage'));

// NOTA: KioskRoute rimosso — /kiosk reindirizza sempre a /profilo in AppContent
/** Dopo login: torna a `/app`, `/admin`, ecc. solo se path interno (no open redirect). */
function safeInternalRedirectPath(state: unknown, fallback = '/app'): string {
  const pathname = (state as { from?: { pathname?: string } } | null)?.from?.pathname;
  if (
    typeof pathname === 'string' &&
    pathname.startsWith('/') &&
    !pathname.startsWith('//') &&
    !pathname.includes('://')
  ) {
    return pathname;
  }
  return fallback;
}

// ─── Login Route ───────────────────────────────────────────────────────────────
function LoginRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAppUser();
  const postAuthPath = useMemo(() => safeInternalRedirectPath(location.state), [location.state]);
  const [bgTheme, setBgTheme] = useState<BackgroundTheme>(getStoredTheme);

  useEffect(() => {
    if (currentUser) navigate(postAuthPath, { replace: true });
  }, [currentUser, navigate, postAuthPath]);

  useEffect(() => {
    const handler = (e: Event) => setBgTheme(getThemeById((e as CustomEvent<string>).detail));
    window.addEventListener('flow-bg-change', handler);
    return () => window.removeEventListener('flow-bg-change', handler);
  }, []);

  const handleLogin = () => navigate(postAuthPath, { replace: true });
  const handleBack = () => navigate(PATH_PROFILO, { replace: true });

  return (
    <RouteErrorBoundary sectionName="Login">
      <div role="region" aria-label="Accesso" className="relative min-h-screen min-h-[100dvh] w-full overflow-y-auto" style={{ background: bgTheme.appBg }}>
        <DeepAuroraShell theme={bgTheme} />
        <AnimatePresence mode="wait">
          <LoginPage key="login" onLogin={handleLogin} onBack={handleBack} />
        </AnimatePresence>
      </div>
    </RouteErrorBoundary>
  );
}

// ─── App principale (gestione + staff): niente sidebar, bottom bar unificata ─
function MainApp({ onLogout }: { onLogout: () => void }) {
  const navigate = useNavigate();
  const {
    currentUser,
    effectiveLanguage,
    users,
    globalPinSessionId,
    setGlobalPinSessionId,
    isSessionElevated,
    impersonatingAs,
    originalAdminUser,
    setImpersonating,
    setCurrentUser: setCtxCurrentUser,
    setIsSessionElevated,
  } = useAppUser();
  // (Rimosso il subscribe a useAppData qui: _shifts/_punchRecords non venivano usati,
  // ma facevano ri-renderizzare l'intero shell a ogni evento realtime su turni/timbrature.)
  const {
    featureFlags,
    roleTemplatesRevision,
  } = useAppConfig();
  const {
    isGlobalRefreshing,
    syncStage,
    postRefreshLocked,
    postUnlockReloadPending,
    silentRefreshData,
    hardReloadFromDatabase,
    dataSyncInProgress,
  } = useAppOverlay();
  const [bgTheme, setBgTheme] = useState<BackgroundTheme>(() => getStoredTheme(currentUser?.id));

  // Applica appBg a html e body così il colore del tema copre tutto lo schermo anche sotto il gradiente trasparente
  useEffect(() => {
    const bg = bgTheme.appBg;
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    // CSS custom property per header sticky opaco (vetro satinato) — RGB components
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

  const t = useT();
  const isManagement = useMemo(
    () => currentUser ? isManagementRole(currentUser.role) : false,
    [currentUser?.role]
  );
  const isMobileViewport = useIsMobileViewport();
  const staffMobileCompactHeader = !isManagement && isMobileViewport;

  // ── Onboarding obbligatorio: email o telefono mancanti ──────────────────────
  const needsOnboarding = Boolean(
    currentUser &&
    (!currentUser.email?.trim() || !currentUser.phone?.trim())
  );
  const [onboardingDone, setOnboardingDone] = useState(false);
  const showOnboarding = needsOnboarding && !onboardingDone;

  // ── Modal permessi (notifiche + posizione) al primo accesso ─────────────────
  const [showPermissions, setShowPermissions] = useState(false);

  useEffect(() => {
    if (!currentUser || showOnboarding) return;
    shouldShowPermissionModal().then(show => { if (show) setShowPermissions(true); });
  }, [currentUser, showOnboarding]);

  const [overlayOpen, setOverlayOpen] = useState(false);
  useEffect(() => {
    const check = () => setOverlayOpen(document.body.dataset.overlay === '1');
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.body, { attributes: true, attributeFilter: ['data-overlay'] });
    return () => obs.disconnect();
  }, []);

  // ── Clear PWA badge on app open + visibility change ──────────────────────
  useEffect(() => {
    const clearBadge = () => {
      if ('clearAppBadge' in navigator) {
        (navigator as Navigator & { clearAppBadge: () => Promise<void> })
          .clearAppBadge().catch(() => {});
      }
      // Also tell SW to clear its badge
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('CLEAR_BADGE');
      }
    };
    clearBadge();
    const onVisibility = () => { if (!document.hidden) clearBadge(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // ── Apre campanella se app avviata da push notification (app chiusa) ────
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('open=notifications')) {
      // Piccolo ritardo per dare tempo ai componenti di montarsi
      const t = setTimeout(() => {
        window.dispatchEvent(new CustomEvent('open-notification-center'));
        // Pulisci il parametro dall'URL senza ricaricare
        const url = new URL(window.location.href);
        url.searchParams.delete('open');
        window.history.replaceState({}, '', url.toString());
      }, 300);
      return () => clearTimeout(t);
    }
  }, []);

  const location = useLocation();

  const visibleNavTabs = useMemo((): AppNavTab[] => {
    void roleTemplatesRevision;
    if (!currentUser) return ['home'];
    return getUnifiedNavTabs(currentUser, isManagement, featureFlags);
  }, [currentUser, isManagement, featureFlags, roleTemplatesRevision]);

  const bottomNavTabs = useMemo((): AppNavTab[] => {
    void roleTemplatesRevision;
    if (!currentUser) return ['home'];
    return getBottomNavTabsForMainApp(currentUser, isManagement, featureFlags);
  }, [currentUser, isManagement, featureFlags, roleTemplatesRevision]);


  const noNavTabs = Boolean(currentUser && visibleNavTabs.length === 0);

  const appStickyHeaderRef = useRef<HTMLElement | null>(null);
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

  // Forza background trasparente per la griglia presenze in dark mode
  useEffect(() => {
    const grid = document.getElementById('timesheet-section-main-grid');
    if (grid) {
      if (document.documentElement.classList.contains('dark')) {
        grid.style.setProperty('background', 'transparent', 'important');
      } else {
        grid.style.removeProperty('background');
      }
    }
  }, [activeTab]);
  const prevTabRef = useRef<AppNavTab>('home');
  const tabNavDirection = useRef<1 | -1>(1); // 1 = destra→sinistra, -1 = sinistra→destra
  const mainViewRestoredUserIdRef = useRef<string | null>(null);
  const pendingScrollRestoreRef = useRef<{ y: number; tab: AppNavTab } | null>(null);
  const profileLeaveGuardRef = useRef<ProfileLeaveGuard | null>(null);

  const applyTabChange = useCallback(
    (id: AppNavTab) => {
      if (id === 'settings' && currentUser && (isAdminOnly(currentUser) || isSessionElevated || !!currentUser.elevated_role)) {
        navigate('/admin');
        return;
      }
      // Calcola direzione per l'animazione shared-axis
      const allTabs: AppNavTab[] = ['home', 'turni', 'timesheet', 'reports', 'ferie', 'profile', 'settings'];
      const fromIdx = allTabs.indexOf(prevTabRef.current);
      const toIdx = allTabs.indexOf(id);
      tabNavDirection.current = toIdx >= fromIdx ? 1 : -1;
      prevTabRef.current = id;
      setActiveTab(id);
    },
    [currentUser, navigate, isSessionElevated]
  );

  const handleTabChange = useCallback(
    (id: AppNavTab) => {
      void (async () => {
        const tv = t as Record<string, string>;
        if (activeTab === 'profile' && id !== 'profile') {
          const g = profileLeaveGuardRef.current;
          if (g?.isDirty()) {
            const msg =
              tv.profile_leave_unsaved_confirm ??
              'Ci sono modifiche non salvate nel profilo. OK per salvare e cambiare scheda, Annulla per restare.';
            if (!window.confirm(msg)) return;
            try {
              await g.save();
            } catch {
              return;
            }
          }
        }
        applyTabChange(id);
      })();
    },
    [activeTab, t, applyTabChange]
  );

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
    const u = new URL(window.location.href);
    const open = u.pathname.startsWith('/app') ? u.searchParams.get('open') : null;
    if (open === 'punch_exit' && visibleNavTabs.includes('timesheet')) {
      u.searchParams.delete('open');
      window.history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
      prevTabRef.current = 'timesheet';
      setActiveTab('timesheet');
    } else if (open === 'turni' && visibleNavTabs.includes('turni')) {
      u.searchParams.delete('open');
      window.history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
      prevTabRef.current = 'turni';
      setActiveTab('turni');
    } else {
      // Ripristina l'ultima tab attiva prima del refresh
      const saved = readMainViewState(currentUser.id);
      if (saved && visibleNavTabs.includes(saved.activeTab as AppNavTab)) {
        prevTabRef.current = saved.activeTab as AppNavTab;
        setActiveTab(saved.activeTab as AppNavTab);
        pendingScrollRestoreRef.current = { tab: saved.activeTab as AppNavTab, y: saved.scrollY };
      } else {
        setActiveTab('home');
      }
    }
  }, [currentUser?.id, visibleNavTabs]);

  useEffect(() => {
    const onSw = (event: MessageEvent) => {
      const t = event.data?.type;
      if (t === 'OPEN_PUNCH_EXIT') {
        if (!visibleNavTabs.includes('timesheet')) return;
        void handleTabChange('timesheet');
        return;
      }
      if (t === 'OPEN_TURNI') {
        if (!visibleNavTabs.includes('turni')) return;
        void handleTabChange('turni');
        return;
      }
      if (t === 'OPEN_NOTIFICATIONS') {
        // Apre la campanella notifiche ovunque ci si trovi
        window.dispatchEvent(new CustomEvent('open-notification-center'));
        return;
      }
    };
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', onSw);
    }
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onSw);
      }
    };
  }, [visibleNavTabs, handleTabChange]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const u = new URL(window.location.href);
    if (!u.pathname.startsWith('/app')) return;
    const o = u.searchParams.get('open');
    if (o === 'punch_exit' && visibleNavTabs.includes('timesheet')) {
      u.searchParams.delete('open');
      window.history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
      void handleTabChange('timesheet');
    } else if (o === 'turni' && visibleNavTabs.includes('turni')) {
      u.searchParams.delete('open');
      window.history.replaceState({}, '', u.pathname + (u.search || '') + u.hash);
      void handleTabChange('turni');
    }
  }, [location.search, currentUser?.id, visibleNavTabs, handleTabChange]);

  useEffect(() => {
    const bundle = pendingScrollRestoreRef.current;
    if (!bundle || bundle.tab !== activeTab) return;
    if (isGlobalRefreshing || postRefreshLocked || postUnlockReloadPending) return;
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
  }, [activeTab, isGlobalRefreshing, postRefreshLocked, postUnlockReloadPending]);

  const persistSkipFirstActiveTabRef = useRef(true);
  useEffect(() => {
    if (!currentUser?.id) return;
    const save = () => {
      writeMainViewState(currentUser.id, {
        activeTab,
        scrollY: getAppRootScrollY(),
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
      scrollY: getAppRootScrollY(),
    });
  }, [currentUser?.id, activeTab]);

  // Sincronizza settimana tra Turni e Presenze notificando il cambio tab
  useEffect(() => {
    if (activeTab === 'turni' || activeTab === 'timesheet') {
      window.dispatchEvent(
        new CustomEvent('osteria-tab-activated', { detail: activeTab })
      );
    }
  }, [activeTab]);

  /** Reindirizza reports → timesheet dopo il render (evita side effect in fase di render). */
  useEffect(() => {
    if (activeTab === 'reports') {
      applyTabChange('timesheet');
    }
  }, [activeTab, applyTabChange]);

  /** Da NotificationCenter / Ore: apre tab (es. Presenze) e scroll ad ancoraggio. */
  useEffect(() => {
    const onNavigate = (e: Event) => {
      const ce = e as CustomEvent<{ tab?: AppNavTab; anchor?: string }>;
      const tab = ce.detail?.tab;
      const anchor = ce.detail?.anchor;
      if (!tab || !visibleNavTabs.includes(tab)) return;
      void (async () => {
        const tv = t as Record<string, string>;
        if (activeTab === 'profile' && tab !== 'profile') {
          const g = profileLeaveGuardRef.current;
          if (g?.isDirty()) {
            const msg =
              tv.profile_leave_unsaved_confirm ??
              'Ci sono modifiche non salvate nel profilo. OK per salvare e cambiare scheda, Annulla per restare.';
            if (!window.confirm(msg)) return;
            try {
              await g.save();
            } catch {
              return;
            }
          }
        }
        setActiveTab(tab);
        const scrollTo = () => {
          if (!anchor) return;
          document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        };
        requestAnimationFrame(() => requestAnimationFrame(scrollTo));
        window.setTimeout(scrollTo, 400);
        window.setTimeout(scrollTo, 800);
      })();
    };
    window.addEventListener('osteria-navigate', onNavigate as EventListener);
    return () => window.removeEventListener('osteria-navigate', onNavigate as EventListener);
  }, [visibleNavTabs, activeTab, t]);

  const isSynced = !!featureFlags && Object.keys(featureFlags).length > 0;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const handleHardRefresh = useCallback(async () => {
    if (isRefreshing || dataSyncInProgress) return;
    setIsRefreshing(true);
    try {
      await hardReloadFromDatabase();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, dataSyncInProgress, hardReloadFromDatabase]);

  const [showPinMenu, setShowPinMenu] = useState(false);
  const [globalPinValue, setGlobalPinValue] = useState('');
  const [globalPinError, setGlobalPinError] = useState('');
  const closePinMenu = useCallback(() => {
    setShowPinMenu(false);
    setGlobalPinValue('');
    setGlobalPinError('');
    unlockBodyScroll();
  }, []);
  const handleGlobalPinSubmit = useCallback(async (pin: string) => {
    if (!currentUser) {
      setGlobalPinError('Sessione non disponibile');
      return;
    }
    // Verifica PIN dell'utente corrente (admin/manager) per sbloccare la sessione
    if (pin === currentUser.pin) {
      setGlobalPinSessionId(Date.now().toString());
      closePinMenu();
    } else {
      setGlobalPinError('PIN non riconosciuto');
    }
  }, [currentUser, setGlobalPinSessionId, closePinMenu]);
  useEffect(() => {
    if (showPinMenu) lockBodyScroll();
    else unlockBodyScroll();
    return () => unlockBodyScroll();
  }, [showPinMenu]);

  const renderManagementContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <RouteErrorBoundary sectionName="Home">
            <HomePage
              activeTab={activeTab}
              onNavigateToHolidays={() => {
                void handleTabChange('ferie');
              }}
              onNavigateToShifts={() => {
                void handleTabChange('turni');
              }}
              onNavigateToReports={() => {
                void handleTabChange('timesheet');
              }}
              onTabChange={(tab) => void handleTabChange(tab)}
            />
          </RouteErrorBoundary>
        );
      case 'turni':
      case 'timesheet':
        return (
          <RouteErrorBoundary sectionName="Turni/Presenze">
            <Suspense fallback={null}>
              <UnifiedShiftsPage />
            </Suspense>
          </RouteErrorBoundary>
        );
      case 'ferie':
        return (
          <RouteErrorBoundary sectionName="Ferie">
            <HolidayRequests />
          </RouteErrorBoundary>
        );
      case 'reports':
        return null;
      case 'settings':
        return (
          <RouteErrorBoundary sectionName="Impostazioni">
            <SettingsPage />
          </RouteErrorBoundary>
        );
      case 'profile':
        return (
          <RouteErrorBoundary sectionName="Profilo">
            <Suspense fallback={null}><ProfileNavTabPanel onLogout={onLogout} onGoToSettings={() => void handleTabChange('settings')} /></Suspense>
          </RouteErrorBoundary>
        );
      default:
        return null;
    }
  };

  // Overlay sync admin: mostrato quando un admin ha pushato nuove impostazioni via push notification
  const [adminSyncPending, setAdminSyncPending] = useState(false);
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'FORCE_DATA_RELOAD' && currentUser?.role !== 'admin') {
        setAdminSyncPending(true);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSwMessage);
    return () => navigator.serviceWorker.removeEventListener('message', handleSwMessage);
  }, [currentUser?.role]);

  /** `overflow-visible` così popover / menu non vengono tagliati dal bordo arrotondato della card. */

  return (
    <ProfileLeaveGuardRefContext.Provider value={profileLeaveGuardRef}>
    {/* Overlay aggiornamento dati admin: mostrato su tutti i dispositivi non-admin */}
    <AnimatePresence>
      {adminSyncPending && (
        <AdminSyncOverlay
          onReload={() => hardReloadFromDatabase()}
          onDone={() => setAdminSyncPending(false)}
        />
      )}
    </AnimatePresence>
    {/* Onboarding obbligatorio: blocca l'interfaccia finché email/telefono non sono configurati */}
    {showOnboarding && (
      <Suspense fallback={null}><OnboardingSetupModal onComplete={() => setOnboardingDone(true)} /></Suspense>
    )}
    <AnimatePresence>
      {showPermissions && !showOnboarding && (
        <Suspense fallback={null}><PermissionRequestModal key="perm-modal" userId={currentUser?.id} onDone={() => setShowPermissions(false)} /></Suspense>
      )}
    </AnimatePresence>
    <div
      role="region" aria-label="Applicazione"
      className="relative w-full min-h-dvh text-white font-sans antialiased safe-area-pad pt-0 flex flex-col"
      style={{ background: bgTheme.appBg }}
    >
      <DeepAuroraShell theme={bgTheme} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[600] focus:px-4 focus:py-2 focus:bg-white focus:text-app-bg focus:rounded focus:font-medium"
      >
        Vai al contenuto principale
      </a>


      {/* ── Banner Impersonazione (Cambio Rapido Admin) ── */}
      {impersonatingAs && originalAdminUser && (
        <div
          className="fixed left-0 right-0 z-[10039] flex items-center justify-between gap-2 px-4 py-2 text-sm font-semibold shadow-md"
          style={{
            top: 0,
            background: 'linear-gradient(90deg, #fef3c7 0%, #fde68a 100%)',
            borderBottom: '1px solid #f59e0b',
            color: '#92400e',
          }}
        >
          <span className="truncate">
            Sessione attiva come: <strong>{impersonatingAs.first_name}{impersonatingAs.last_name ? ` ${impersonatingAs.last_name}` : ''}</strong>
          </span>
          <button
            type="button"
            onClick={() => {
              setCtxCurrentUser(originalAdminUser);
              setIsSessionElevated(false);
              setImpersonating(null, null);
              void silentRefreshData?.();
            }}
            className="shrink-0 rounded-lg px-3 py-1 text-xs font-bold transition-colors hover:bg-amber-200"
            style={{ background: '#fcd34d', color: '#78350f' }}
          >
            Torna ad Admin
          </button>
        </div>
      )}

      {/* ── Header fisso unificato: topbar + tabbar ── */}
      <header
        ref={appStickyHeaderRef}
        aria-label="Navigazione principale"
        /* TEST NITIDEZZA: nessun backdrop-filter/filter/box-shadow nell'header
           (regola .app-header in index.css), sfondo SOLIDO #121212.
           Il padding sotto la tacca è gestito dal contenitore del logo. */
        className={`app-header sticky md:fixed top-0 left-0 right-0 z-[10050] shrink-0 border-b border-white/10 transition-[visibility,opacity] duration-150 ${
          overlayOpen ? 'invisible opacity-0 pointer-events-none' : ''
        } ${
          isGlobalRefreshing || postRefreshLocked || postUnlockReloadPending ? 'pointer-events-none' : ''
        }`}
        style={{
          backgroundColor: '#121212',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        <MobileProfileHeader
          onLogout={onLogout}
          activeTab={activeTab}
          showOnDesktop
          compact={staffMobileCompactHeader}
          hideToolbarAvatar={false}
          rightExtra={
            <div className="hidden md:flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleHardRefresh}
                disabled={isRefreshing || dataSyncInProgress}
                title={isRefreshing || dataSyncInProgress ? 'Sincronizzazione in corso...' : 'Sincronizza dati'}
                aria-label={isRefreshing || dataSyncInProgress ? 'Sincronizzazione in corso' : 'Sincronizza dati'}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold transition-colors duration-200 touch-manipulation liquid-glass ${
 isRefreshing || dataSyncInProgress
 ? 'text-amber-500 liquid-glass-amber'
 : isSynced
 ? 'text-emerald-500 liquid-glass-green'
 : 'text-slate-300'
 }`}
              >
                {isRefreshing || dataSyncInProgress ? (
                  <RotateCw className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} aria-hidden />
                ) : isSynced ? (
                  <span className="relative inline-flex" aria-hidden>
                    <Cloud className="h-3.5 w-3.5" strokeWidth={2.5} />
                    <span className="absolute -bottom-0.5 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-emerald-500 text-white" style={{ fontSize: 7 }}>✓</span>
                  </span>
                ) : (
                  <CloudOff className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                )}
              </button>
              {featureFlags['unlock_with_pin'] !== false && currentUser && isManagement && (
                <button
                  type="button"
                  onClick={() => setShowPinMenu(true)}
                  title={globalPinSessionId ? 'Sessione PIN attiva' : 'Sblocca sessione PIN'}
                  aria-label={globalPinSessionId ? 'Gestisci sessione PIN' : 'Sblocca sessione PIN'}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold transition-colors duration-200 touch-manipulation liquid-glass ${
 globalPinSessionId
 ? 'text-emerald-500 liquid-glass-green'
 : 'text-red-500 liquid-glass-red'
 }`}
                >
                  {globalPinSessionId
                    ? <Unlock className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    : <Lock className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />}
                </button>
              )}
            </div>
          }
        />
      </header>

      <main
        id="main-content"
        role="main"
        aria-label="Contenuto principale"
        className={`w-full flex-1 min-h-0 flex flex-col ${isGlobalRefreshing || postRefreshLocked || postUnlockReloadPending ? 'blur-md pointer-events-none' : ''}`}>
        <div className="w-full app-horizontal-pad pt-0 md:pt-[50px] flex-1 min-h-0 flex flex-col pb-[48px] md:pb-0">
          {/* PIN portals */}
          {createPortal(
            <AnimatePresence>
              {showPinMenu && !globalPinSessionId && currentUser && (
                <PinPadModal
                  key="global-pin-lock"
                  title={t.global_pin_unlock_title}
                  subtitle={t.global_pin_unlock_subtitle}
                  pinLabel="PIN"
                  pin={globalPinValue}
                  onPinChange={setGlobalPinValue}
                  error={globalPinError}
                  onConfirm={() => handleGlobalPinSubmit(globalPinValue)}
                  onCancel={closePinMenu}
                  confirmLabel={t.ts_drawer_unlock_btn}
                  userId={currentUser.id}
                  userDisplayName={[currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ')}
                  userEmail={currentUser.email ?? ''}
                  onBiometricSuccess={() => {
                    const verifier = findFreezeVerifierById(users, currentUser.id);
                    if (!verifier) { setGlobalPinError(t.global_pin_unlock_insufficient_role); return; }
                    setGlobalPinSessionId(Date.now().toString());
                    closePinMenu();
                  }}
                />
              )}
            </AnimatePresence>,
            document.body
          )}
          {createPortal(
            <AnimatePresence>
              {showPinMenu && !!globalPinSessionId && (
                <motion.div
                  key="global-pin-unlock"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="fixed inset-0 z-[10080] bg-black/40 backdrop-blur-md flex flex-col items-center justify-center"
                >
                  <button type="button" onClick={closePinMenu} className="absolute top-5 right-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors active:bg-white/80" aria-label={t.close}>
                    <X size={20} strokeWidth={2.5} />
                  </button>
                  <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.9 }} className="flex flex-col items-center w-full max-w-[320px] px-6">
                    <div className="flex flex-col items-center text-center mb-10">
                      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/20 border-2 border-accent/40 mb-5">
                        <ShieldCheck className="w-9 h-9 text-accent" strokeWidth={2} />
                      </div>
                      <h2 className="text-white font-bold uppercase tracking-widest text-base mb-2">Sessione sbloccata</h2>
                      <p className="text-white/60 text-sm font-medium leading-tight px-4">Tutte le operazioni protette da PIN sono accessibili in questa sessione.</p>
                    </div>
                    <button type="button" onClick={() => { setGlobalPinSessionId(null); closePinMenu(); }} className="w-full h-14 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold flex items-center justify-center gap-2.5 transition-colors mb-3">
                      <ShieldOff className="w-5 h-5" strokeWidth={2} />
                      Blocca sessione
                    </button>
                    <button type="button" onClick={closePinMenu} className="w-full h-14 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/70 font-bold transition-colors">Annulla</button>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body
          )}
          {noNavTabs ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-10 pb-content text-center text-sm text-amber-950 max-w-lg mx-auto">
              {(t as Record<string, string>).app_all_nav_tabs_disabled}
            </div>
          ) : isManagement ? (
            <div className="w-full flex-1 min-h-0 flex flex-col tab-content-fade-in" key={activeTab}>
              <Suspense fallback={null}>
                {renderManagementContent()}
              </Suspense>
            </div>
          ) : currentUser ? (
            <RouteErrorBoundary sectionName="Dashboard staff">
              <Suspense fallback={null}>
                <StaffPersonalDashboard
                  user={currentUser}
                  onLogout={onLogout}
                  activeTab={activeTab}
                  onTabChange={handleTabChange}
                />
              </Suspense>
            </RouteErrorBoundary>
          ) : null}
        </div>
      </main>

      {/* ── Bottom Tab Bar ── */}
      {!noNavTabs && (
        <div
          className="fixed bottom-0 left-0 right-0 z-[10040] shrink-0"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <TopTabBar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            visibleTabs={bottomNavTabs}
          />
        </div>
      )}

      {/* Sovrapposizione viola/indaco durante refresh globale */}
      {isGlobalRefreshing && (() => {
        // Sfondo loading: glass scuro molto trasparente per far intravedere lo sfondo sotto
        return (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 font-sans text-center px-4" style={{ background: 'rgba(2, 6, 23, 0.70)' }}>
            <div className="flex flex-col items-center gap-6">
              <motion.div
                animate={{
                  boxShadow: [
                    '0 0 32px rgba(255,149,0,0.70), 0 0 12px rgba(255,200,150,0.50)',
                    '0 0 56px rgba(255,149,0,1.00), 0 0 24px rgba(255,200,150,0.80)',
                    '0 0 32px rgba(255,149,0,0.70), 0 0 12px rgba(255,200,150,0.50)',
                  ],
                }}
                transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity }}
                style={{ borderRadius: 32 }}
              >
                <FlowWaveIcon size={120} radius={32} />
              </motion.div>
              <div className="flex flex-col items-center gap-1 min-h-[40px]">
                <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">
                  {t.sync_total_in_progress}
                </p>
                {syncStage ? (
                  <p className="text-white/90 text-sm font-medium">{syncStage}</p>
                ) : null}
              </div>
          </div>
          </div>
        );
      })()}

      <AnimatePresence mode="wait">
        {postRefreshLocked && <RefreshLockOverlay key="refresh-lock" />}
        {postUnlockReloadPending && !postRefreshLocked && (
          <PostUnlockRestartOverlay key="post-unlock-restart" language={effectiveLanguage} />
        )}
      </AnimatePresence>

    </div>
    </ProfileLeaveGuardRefContext.Provider>
  );
}

// ─── Protected App Route ───────────────────────────────────────────────────────
function ProtectedApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, isLoading: appIsLoading, setCurrentUser, forceLogoutRequested, clearForceLogoutRequest, setIsSessionElevated } = useAppUser();
  const { featureFlags } = useAppConfig();
  const { showError } = useAppOverlay();
  const t = useT();

  useEffect(() => {
    const state = location.state as { accessDenied?: boolean } | null;
    if (state?.accessDenied) {
      showError?.(t.app_access_denied);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate, showError, t]);

  const handleLogout = () => {
    applyUnauthenticatedDocumentTheme();
    try {
      localStorage.removeItem(APP_SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (currentUser?.language && ['it', 'en', 'es', 'fr'].includes(currentUser.language)) {
      persistStoredUiLanguage(currentUser.language);
    }
    setIsSessionElevated(false);
    setCurrentUser(null);
    navigate(PATH_PROFILO, { replace: true });
  };

  useEffect(() => {
    if (forceLogoutRequested) {
      if (currentUser?.id) clearMainViewState(currentUser.id);
      applyUnauthenticatedDocumentTheme();
      try {
        localStorage.removeItem(APP_SESSION_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      if (currentUser?.language && ['it', 'en', 'es', 'fr'].includes(currentUser.language)) {
        persistStoredUiLanguage(currentUser.language);
      }
      setIsSessionElevated(false);
      setCurrentUser(null);
      clearForceLogoutRequest();
      navigate(PATH_PROFILO, { replace: true });
    }
  }, [
    forceLogoutRequested,
    clearForceLogoutRequest,
    currentUser?.id,
    currentUser?.language,
    setCurrentUser,
    setIsSessionElevated,
    navigate,
  ]);

  // Aspetta che AppContext abbia finito il caricamento iniziale (sessione da localStorage).
  // Senza questo check, currentUser è null per ~100-300ms e il redirect scatta prima
  // che la sessione salvata venga ripristinata.
  if (appIsLoading) {
    return (
      <main role="main" aria-label="Caricamento in corso">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 flex items-center justify-center font-sans"
        style={{ background: 'rgba(2, 6, 23, 0.80)' }}
  >
        <motion.div
          initial={{ scale: 0.82, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            boxShadow: [
              '0 0 32px rgba(255,149,0,0.70), 0 0 12px rgba(255,200,150,0.50)',
              '0 0 56px rgba(255,149,0,1.00), 0 0 24px rgba(255,200,150,0.80)',
              '0 0 32px rgba(255,149,0,0.70), 0 0 12px rgba(255,200,150,0.50)',
            ],
          }}
          transition={{
            scale:     { duration: 0.6, ease: [0.34, 1.2, 0.64, 1] },
            opacity:   { duration: 0.5, ease: 'easeOut' },
            boxShadow: { duration: 2.4, ease: 'easeInOut', repeat: Infinity, delay: 0.5 },
          }}
          style={{ borderRadius: 38 }}
        >
          <FlowWaveIcon size={140} radius={38} />
        </motion.div>
      </motion.div>
    </main>
    );
  }

  if (!currentUser) {
    return <Navigate to={PATH_PROFILO} replace state={{ from: location }} />;
  }

  if (featureFlags['maintenance_mode'] === true && currentUser.role !== 'admin') {
    return <MaintenancePage />;
  }

  return <MainApp onLogout={handleLogout} />;
}

// ─── Root App Content ───────────────────────────────────────────────────────────
function AppContent() {
  return (
    <main role="main" aria-label="Contenuto principale">
      <Routes>
        <Route path="/i/:slug" element={<InviteRedirect />} />
        <Route path={PATH_PROFILO} element={<LoginRoute />} />
        <Route path="/login" element={<Navigate to={PATH_PROFILO} replace />} />
        <Route path="/" element={<Navigate to={PATH_PROFILO} replace />} />
        <Route path="/kiosk" element={<Navigate to={PATH_PROFILO} replace />} />
        <Route path="/timbratura" element={<Navigate to={PATH_PROFILO} replace />} />
        <Route path="/app" element={<ProtectedApp />} />
        <Route path="/app/*" element={<ProtectedApp />} />
        <Route path="/admin" element={<AdminGate><Suspense fallback={null}><AdminLayout /></Suspense></AdminGate>} />
        <Route path="/design-audit" element={<DesignAuditPreview />} />
        <Route path="/admin/*" element={<AdminGate><Suspense fallback={null}><AdminLayout /></Suspense></AdminGate>} />
        <Route path="*" element={<Navigate to={PATH_PROFILO} replace />} />
      </Routes>
    </main>
  );
}

export { LoginRoute, ProtectedApp, AppContent };
