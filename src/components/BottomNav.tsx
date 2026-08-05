import { useLayoutEffect, useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Home, Calendar, ClipboardList, ShieldCheck, Palmtree, User as UserIcon, Search, X, Fingerprint, Settings } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useAppUser } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { formatTrans } from '../utils/translations';
import { useT } from '../hooks/useT';
import type { User } from '../types';
import type { AppNavTab } from '../utils/enabledModules';
import { useMultisensorialFeedback } from '../hooks/useMultisensorialFeedback';
import {
  readProfileAvatarFromStorage,
  readAvatarFocus,
  avatarFocusToObjectPosition,
} from '../utils/profilePhotoStorage';
import { isAdminOnly } from '../utils/permissions';
import { CenteredModalPortal } from './ui/CenteredModalPortal';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';

import { PinPadModal } from './ui/PinPadModal';
import { createPortal } from 'react-dom';
import { hasPinUnlockCredential, authenticatePinUnlockCredential } from '../utils/pinUnlockWebAuthn';

interface BottomNavProps {
  activeTab: AppNavTab;
  onTabChange: (tab: AppNavTab) => void;
  /** Tab visibili (ordine: dashboard, turni, ore, presenze, ferie, impostazioni). */
  visibleTabs: AppNavTab[];
  /** Classi aggiuntive sul `<nav>` (es. `max-md:hidden` per sostituire con nav dedicata). */
  navClassName?: string;
}

export default function BottomNav({ activeTab, onTabChange, visibleTabs, navClassName }: BottomNavProps) {
  const navRef = useRef<HTMLElement>(null);
  const { currentUser, users, setCurrentUser, setIsSessionElevated, isSessionElevated, setImpersonating } = useAppUser();
  const { featureFlags } = useAppConfig();
  const { silentRefreshData } = useAppOverlay();
  const { triggerHapticFeedback } = useMultisensorialFeedback();
  /** Contenuto che scorre sotto la nav fissa → vetro trasparente; altrimenti tinta piena FLOW blue. */
  const [_navOverContent, _setNavOverContent] = useState(false);

  // Stato per il cambio rapido utente
  const [isQuickSwitchOpen, setIsQuickSwitchOpen] = useState(false);
  const [quickSwitchSearch, setQuickSwitchSearch] = useState('');
  const [pendingSwitchUser, setPendingSwitchUser] = useState<User | null>(null);
  const [switchPin, setSwitchPin] = useState('');
  const [switchError, setSwitchError] = useState('');
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  /** Utente che ha aperto la modale (catturato all'apertura per rilevare se è admin). */
  const [switchingFromUser, setSwitchingFromUser] = useState<typeof currentUser>(null);

  const t = useT();

  const handleLongPressStart = useCallback((id: AppNavTab) => {
    if (id !== 'profile' || !currentUser) return;
    
    // Controllo visibilità widget per il cambio rapido
    if (!isUiWidgetVisible(currentUser, 'global.quick_switch')) return;
    
    longPressTimerRef.current = setTimeout(() => {
      setSwitchingFromUser(currentUser); // cattura l'attore prima del cambio
      setIsQuickSwitchOpen(true);
      setQuickSwitchSearch('');
      setPendingSwitchUser(null);
      setSwitchPin('');
      setSwitchError('');
    }, 600);
  }, [currentUser]);

  const handleLongPressEnd = useCallback((_e?: React.MouseEvent | React.TouchEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleSelectUserForSwitch = (user: User) => {
    const actor = switchingFromUser ?? currentUser;
    const isAdminActor = isAdminOnly(actor);
    const isKioskMode = featureFlags['kiosk_active'] === true;

    // Admin in modalità normale → cambio diretto senza PIN
    if (isAdminActor && !isKioskMode) {
      setImpersonating(user, actor);
      setIsSessionElevated(false);
      setCurrentUser(user);
      setIsQuickSwitchOpen(false);
      setPendingSwitchUser(null);
      void silentRefreshData?.();
      return;
    }

    // Kiosk o non-admin → richiedi PIN
    setPendingSwitchUser(user);
    setSwitchPin('');
    setSwitchError('');
  };

  const handleVerifyPinAndSwitch = useCallback(() => {
    if (!pendingSwitchUser) return;
    const actor = switchingFromUser ?? currentUser;
    const isAdminActor = isAdminOnly(actor);

    if (switchPin === pendingSwitchUser.pin) {
      setIsSessionElevated(false);
      // Admin che usa flusso PIN (es. kiosk) → traccia impersonazione
      if (isAdminActor) setImpersonating(pendingSwitchUser, actor);
      setCurrentUser(pendingSwitchUser);
      setIsQuickSwitchOpen(false);
      setPendingSwitchUser(null);
      setSwitchPin('');
      void silentRefreshData?.();
    } else if (
      pendingSwitchUser.secondary_pin &&
      pendingSwitchUser.elevated_role &&
      switchPin === pendingSwitchUser.secondary_pin
    ) {
      // PIN secondario: eleva ruolo per la sessione (nessuna impersonazione)
      setIsSessionElevated(true);
      setCurrentUser({ ...pendingSwitchUser, role: pendingSwitchUser.elevated_role });
      setIsQuickSwitchOpen(false);
      setPendingSwitchUser(null);
      setSwitchPin('');
      void silentRefreshData?.();
    } else {
      setSwitchError(t.pin_invalid || 'PIN non valido');
      setSwitchPin('');
      setTimeout(() => setSwitchError(''), 2000);
    }
  }, [pendingSwitchUser, switchPin, switchingFromUser, currentUser, setCurrentUser, setIsSessionElevated, setImpersonating, silentRefreshData, t.pin_invalid]);

  useEffect(() => {
    if (switchPin.length === 4 && pendingSwitchUser) {
      handleVerifyPinAndSwitch();
    }
  }, [switchPin, pendingSwitchUser, handleVerifyPinAndSwitch]);

  // Auto-trigger biometric switch if device is registered for the pending user
  useEffect(() => {
    if (pendingSwitchUser && isQuickSwitchOpen && hasPinUnlockCredential(pendingSwitchUser.id)) {
      const actor = switchingFromUser ?? currentUser;
      const runBiometric = async () => {
        try {
          const ok = await authenticatePinUnlockCredential(pendingSwitchUser.id);
          if (ok) {
            if (isAdminOnly(actor)) setImpersonating(pendingSwitchUser, actor);
            setCurrentUser(pendingSwitchUser);
            setIsQuickSwitchOpen(false);
            setPendingSwitchUser(null);
            setSwitchPin('');
            void silentRefreshData?.();
          }
        } catch (err) {
          console.error('Biometric switch failed:', err);
        }
      };
      void runBiometric();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSwitchUser, isQuickSwitchOpen, setCurrentUser]);

  const filteredUsers = useMemo(() => {
    const q = quickSwitchSearch.toLowerCase().trim();
    return users
      .filter(u => u.status === 'active' && u.role !== 'admin')
      .filter(u => {
        if (!q) return true;
        const fullName = `${u.first_name ?? ''} ${u.last_name ?? ''}`.toLowerCase();
        return fullName.includes(q) || (u.email ?? '').toLowerCase().includes(q);
      })
      .sort((a, b) => (a.first_name ?? '').localeCompare(b.first_name ?? ''));
  }, [users, quickSwitchSearch]);

  const updateNavOverlapMode = useCallback(() => {
    if (typeof window === 'undefined') return;
    const root = document.getElementById('root');
    const scrollY = root?.scrollTop ?? window.scrollY;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    const docH = root?.scrollHeight ?? document.documentElement.scrollHeight;
    const epsilon = 16;
    const scrollBottom = scrollY + vh;
    const notScrollable = docH <= vh + epsilon;
    const atDocumentBottom = scrollBottom >= docH - epsilon;
    const nextOver = !notScrollable && !atDocumentBottom;
    _setNavOverContent((prev) => (prev !== nextOver ? nextOver : prev));
  }, []);

  /** Altezza barra → `--app-bottom-nav-offset` per toast / overlay sopra la bottom nav. */
  useLayoutEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const apply = () => {
      const h = Math.ceil(el.getBoundingClientRect().height);
      // Con `max-md:hidden` l’altezza è 0: non sovrascrivere — altra barra (es. mobile home staff) imposta l’offset.
      if (h < 8) return;
      document.documentElement.style.setProperty('--app-bottom-nav-offset', `${h}px`);
      requestAnimationFrame(() => updateNavOverlapMode());
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    window.addEventListener('resize', apply);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', apply);
      document.documentElement.style.removeProperty('--app-bottom-nav-offset');
    };
  }, [updateNavOverlapMode, navClassName]);

  useEffect(() => {
    updateNavOverlapMode();
    const onScroll = () => updateNavOverlapMode();
    const root = document.getElementById('root');
    root?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.visualViewport?.addEventListener('resize', updateNavOverlapMode);
    const roTarget = root ?? document.documentElement;
    const docRo = new ResizeObserver(() => updateNavOverlapMode());
    docRo.observe(roTarget);
    return () => {
      root?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll);
      window.visualViewport?.removeEventListener('resize', updateNavOverlapMode);
      docRo.disconnect();
    };
  }, [updateNavOverlapMode]);

  const profileThumb =
    currentUser &&
    (readProfileAvatarFromStorage(currentUser.id) ?? currentUser.avatar_url ?? null);
  const profileThumbFocus = currentUser ? readAvatarFocus(currentUser.id) : { x: 50, y: 50 };

  const visible = new Set(visibleTabs);
  const tv = t as Record<string, string>;
  const profileNavLabel = currentUser
    ? (currentUser.first_name ?? '').trim() || currentUser.email
    : '';
  const profileFullName =
    currentUser &&
    [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ').trim();
  const profileTabTitle =
    currentUser && profileNavLabel
      ? profileFullName
        ? `${t.sidebar_profile}: ${profileFullName} (${currentUser.email})`
        : `${t.sidebar_profile}: ${currentUser.email}`
      : '';

  const profileDisplayName =
    (currentUser?.first_name?.trim() || currentUser?.email?.split('@')[0] || 'Utente').trim() || 'Utente';
  const profileInitialNav = (profileDisplayName.charAt(0) || '?').toUpperCase();

  const isAdminSettings = useMemo(
    () => isAdminOnly(currentUser) || isSessionElevated || !!currentUser?.elevated_role,
    [currentUser, isSessionElevated]
  );

  const defs: { id: AppNavTab; icon: typeof Home; label: string }[] = [
    { id: 'home', icon: Home, label: t.sidebar_dashboard },
    { id: 'turni', icon: Calendar, label: t.sidebar_shifts },
    { id: 'timesheet', icon: ClipboardList, label: t.sidebar_attendance },
    // 'reports' removed — Statistiche now lives as sub-tab inside 'timesheet'
    { id: 'ferie', icon: Palmtree, label: t.sidebar_holidays },
    { id: 'profile', icon: UserIcon, label: tv.bottom_nav_profile_short ?? t.sidebar_profile },
    {
      id: 'settings' as AppNavTab,
      icon: isAdminSettings ? ShieldCheck : Settings,
      label: t.sidebar_admin,
    },
  ];

  const tabs = defs.filter((d) => visible.has(d.id));
  const settingsShort = (t as { bottom_nav_settings_short?: string }).bottom_nav_settings_short;
  // Tab Admin aggiuntivo per utenti con accesso elevato (non-admin con elevated_role)
  const hasElevatedAdminTab = !!currentUser?.elevated_role && currentUser.role !== 'admin' && !visible.has('settings');

  return (
    <nav
      data-tour="nav"
      ref={navRef}
      className={`fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none font-sans ${navClassName ?? ''}`}
      style={{
        paddingBottom: 'max(10px, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(var(--layout-app-px), env(safe-area-inset-left, 0px))',
        paddingRight: 'max(var(--layout-app-px), env(safe-area-inset-right, 0px))',
      }}
      aria-label="Navigazione principale"
    >
      <div className="w-full max-w-screen-xl mx-auto pointer-events-auto pb-safe">
        {/* Barra flottante vetro sul brand — `.bottom-nav-glass` in index.css */}
        <div className="bottom-nav-glass w-full rounded-2xl px-1 py-2 sm:px-2.5 sm:py-2.5">
          <div className="flex items-center justify-around gap-1 sm:gap-1.5">
            {tabs.map(({ id, icon: Icon, label }) => {
              const isActive = activeTab === id;
              const displayLabel =
                id === 'settings' && settingsShort
                  ? settingsShort
                  : id === 'profile' && profileNavLabel
                    ? profileNavLabel
                    : label;
              const showProfilePic = id === 'profile' && profileThumb;
              const showProfileInitial = id === 'profile' && currentUser && !profileThumb;
              const buttonTitle =
                id === 'profile' && profileTabTitle ? profileTabTitle : displayLabel;
              const ariaLabel =
                id === 'profile' && profileNavLabel
                  ? `${t.sidebar_profile}, ${profileNavLabel}`
                  : displayLabel;
              const over = false;

              return (
                <button
                  key={id}
                  type="button"
                  data-tour={id === 'profile' ? 'profile' : undefined}
                  onClick={() => { triggerHapticFeedback('click'); onTabChange(id); }}
                  onMouseDown={() => handleLongPressStart(id)}
                  onMouseUp={handleLongPressEnd}
                  onMouseLeave={handleLongPressEnd}
                  onTouchStart={(_e) => {
                    // Impedisce il menu contestuale di sistema su iOS durante il long press
                    // Non chiamare e.preventDefault() qui altrimenti il click normale non funziona,
                    // ma il long press su iOS è gestito dal sistema se non si usa -webkit-touch-callout: none
                    handleLongPressStart(id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                  }}
                  onTouchEnd={handleLongPressEnd}
                  onTouchMove={handleLongPressEnd}
                  title={buttonTitle}
                  aria-label={ariaLabel}
                  className={`keep-white-glass flex ${id === 'profile' ? 'h-[46px] sm:h-[52px] px-2 sm:px-2.5 min-w-[46px] sm:min-w-[52px] lg:px-3 gap-2' : 'h-[46px] w-[46px] sm:h-[52px] sm:w-[52px]'} shrink-0 rounded-xl sm:rounded-2xl transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 items-center justify-center ${
 over
 ? isActive
 ? 'bg-white shadow-[0_0_6px_1px_rgba(0,26,128,0.22),0_0_14px_3px_rgba(51,102,204,0.12)] text-accent focus-visible:ring-accent/45 focus-visible:ring-offset-transparent'
 : 'bg-white/60 text-accent/55 hover:bg-white hover:text-accent focus-visible:ring-accent/45 focus-visible:ring-offset-transparent'
 : isActive
 ? 'bg-white/22 text-white focus-visible:ring-white/35 focus-visible:ring-offset-transparent'
 : 'bg-white/8 text-white/45 hover:bg-white/18 hover:text-white focus-visible:ring-white/35 focus-visible:ring-offset-transparent'
 }`}
                >
                  {showProfilePic ? (
                    <span
                      className={`flex h-[22px] w-[22px] sm:h-6 sm:w-6 shrink-0 items-center justify-center overflow-hidden rounded-md transition-colors duration-200 ${
 isActive ? 'opacity-100' : 'opacity-65'
 }`}
                    >
                      <img
                        src={profileThumb}
                        alt=""
                        role="presentation"
                        className="h-full w-full object-cover"
                        style={{ objectPosition: avatarFocusToObjectPosition(profileThumbFocus) }}
                        draggable={false}
                      />
                    </span>
                  ) : showProfileInitial ? (
                    <span
                      className={`flex h-[22px] w-[22px] sm:h-6 sm:w-6 shrink-0 items-center justify-center overflow-hidden rounded-md text-[11px] sm:text-xs font-bold transition-colors duration-200 ${
 over
 ?`bg-accent/10 ${isActive ? 'text-accent' : 'text-accent/65'}`
                          : `bg-white/15 ${isActive ? 'text-white' : 'text-white/45'}`
                      }`}
                      aria-hidden
                    >
                      {profileInitialNav}
                    </span>
                  ) : (
                    <Icon
                      className={`h-[22px] w-[22px] sm:h-6 sm:w-6 flex-shrink-0 transition-[color,filter] duration-200 ${
 !over ? (isActive ? 'nav-icon-3d-active' : 'nav-icon-3d') : ''
 } ${
 over
 ? isActive ? 'text-accent' : 'text-accent/55'
 : isActive ? 'text-white' : 'text-white/45'
 }`}
                      strokeWidth={isActive ? 1.75 : 1.2}
                      aria-hidden
                    />
                  )}
                  {id === 'profile' && (
                    <span className="hidden lg:block text-xs font-semibold truncate max-w-[80px] transition-[color,opacity] duration-200" style={{ color: '#ffffff' }} title={profileDisplayName}>{profileDisplayName}
                    </span>
                  )}
                </button>
              );
            })}
            {hasElevatedAdminTab && (
              <button
                type="button"
                onClick={() => { triggerHapticFeedback('click'); onTabChange('settings'); }}
                title="Admin"
                aria-label="Scheda Admin"
                className={`keep-white-glass flex h-[46px] w-[46px] sm:h-[52px] sm:w-[52px] shrink-0 rounded-xl sm:rounded-2xl transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent items-center justify-center ${
 activeTab === 'settings'
 ? 'bg-white/22 text-white'
 : 'bg-white/8 text-white/45 hover:bg-white/18 hover:text-white'
 }`}
              >
                <ShieldCheck
                  className={`h-[22px] w-[22px] sm:h-6 sm:w-6 flex-shrink-0 transition-[color,filter] duration-200 ${
 activeTab === 'settings' ? 'nav-icon-3d-active text-white' : 'nav-icon-3d text-white/45'
 }`}
                  strokeWidth={activeTab === 'settings' ? 1.75 : 1.2}
                  aria-hidden
                />
              </button>
            )}
          </div>
        </div>
        <span className="sr-only" title={t.version}>
          v{__APP_VERSION__}
        </span>
      </div>

      <CenteredModalPortal
        open={isQuickSwitchOpen && !pendingSwitchUser}
        onClose={() => setIsQuickSwitchOpen(false)}
        ariaLabel="Cambio rapido utente"
        maxWidthClass="max-w-md"
        panelClassName="p-0"
        panelStyle={{ background: 'rgba(17,34,64,0.95)', border: '1px solid rgba(255,255,255,0.12)' }}
      >
        <div className="flex flex-col h-full max-h-[80vh]">
          <div className="p-4 border-b border-white/10 sticky top-0 z-10 rounded-t-2xl" style={{ background: 'rgba(255, 255, 255, 0.16)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-white uppercase tracking-tight">
                {tv.quick_switch_title ?? 'Cambio rapido utente'}
              </h3>
              <button
                type="button"
                onClick={() => setIsQuickSwitchOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors active:text-white"
                aria-label="Chiudi"
              >
                <X className="w-5 h-5" aria-hidden />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="search"
                autoFocus
                value={quickSwitchSearch}
                onChange={(e) => setQuickSwitchSearch(e.target.value)}
                placeholder={tv.quick_switch_search_placeholder ?? 'Cerca dipendente...'}
                aria-label={tv.quick_switch_search_placeholder ?? 'Cerca dipendente'}
                className="w-full pl-9 pr-4 py-2 rounded-xl text-base focus:ring-2 focus:ring-accent/30 outline-none"
                style={{ background: 'rgba(255, 255, 255, 0.16)', border: '1px solid rgba(255,255,255,0.12)', color: '#ffffff' }}
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredUsers.map((u) => {
              const uThumb = readProfileAvatarFromStorage(u.id) ?? u.avatar_url ?? null;
              const uThumbFocus = readAvatarFocus(u.id);
              const uInitial = (u.first_name?.[0] || '?').toUpperCase();
              
              return (
                <button
                  key={u.id}
                  onClick={() => handleSelectUserForSwitch(u)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
 currentUser?.id === u.id 
 ? 'bg-accent/12 text-accent ring-1 ring-accent/20' 
 : 'hover:bg-white/8 text-white/80 hover:text-white'
 } active:text-white'`}
                >
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg shadow-sm transition-transform duration-200 ${
 currentUser?.id === u.id
 ? 'border border-accent/40 bg-accent/15 text-accent ring-1 ring-accent/30'
 : 'border border-neutral-500'
 }`}
                  style={currentUser?.id !== u.id ? { background: 'rgba(15, 35, 90, 0.82)', color: 'rgba(255,255,255,0.7)' } : undefined}
                  >
                    {uThumb ? (
                      <img
                        src={uThumb}
                        alt=""
                        role="presentation"
                        className="h-full w-full object-cover pointer-events-none select-none"
                        style={{ objectPosition: avatarFocusToObjectPosition(uThumbFocus) }}
                        draggable={false}
                      />
                    ) : (
                      <span className="text-sm font-bold">
                        {uInitial}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-sm font-semibold truncate"
                      title={`${u.first_name} ${u.last_name ?? ''}`.trim()}
                    >
                      {u.first_name} {u.last_name}
                    </p>
                  </div>
                  {currentUser?.id === u.id && (
                    <ShieldCheck className="w-4 h-4 shrink-0 opacity-80" />
                  )}
                </button>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="p-8 text-center text-white/40 text-sm">
                {tv.quick_switch_no_employee_found ?? 'Nessun dipendente trovato'}
              </div>
            )}
          </div>
        </div>
      </CenteredModalPortal>

      {isQuickSwitchOpen && pendingSwitchUser && createPortal(
        <AnimatePresence>
          <PinPadModal
            title={tv.quick_switch_title ?? 'Cambio rapido utente'}
            subtitle={(tv.quick_switch_pin_prompt ?? 'Inserisci PIN per {name}').replace('{name}', pendingSwitchUser.first_name)}
            pinLabel={formatTrans(tv.pin_for_profile_named ?? t.pin_for_profile, { name: `${pendingSwitchUser.first_name} ${pendingSwitchUser.last_name}` })}
            pin={switchPin}
            onPinChange={(p) => (setSwitchPin(p), setSwitchError(''))}
            onConfirm={() => {}} // Gestito da useEffect su switchPin.length === 4
            onCancel={() => setPendingSwitchUser(null)}
            error={switchError}
            isLoading={false}
            confirmLabel={t.confirm}
            cancelLabel={t.cancel}
            userId={pendingSwitchUser?.id}
            userDisplayName={[pendingSwitchUser?.first_name, pendingSwitchUser?.last_name].filter(Boolean).join(' ')}
            userEmail={pendingSwitchUser?.email ?? ''}
            onBiometricSuccess={async () => {
              const actor = switchingFromUser ?? currentUser;
              if (actor && isAdminOnly(actor)) setImpersonating(pendingSwitchUser, actor);
              setCurrentUser(pendingSwitchUser);
              setIsQuickSwitchOpen(false);
              setPendingSwitchUser(null);
              setSwitchPin('');
              void silentRefreshData?.();
            }}
            leftActionButton={
              hasPinUnlockCredential(pendingSwitchUser.id) ? (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await authenticatePinUnlockCredential(pendingSwitchUser.id);
                    if (ok) {
                      const actor = switchingFromUser ?? currentUser;
                      if (isAdminOnly(actor)) setImpersonating(pendingSwitchUser, actor);
                      setCurrentUser(pendingSwitchUser);
                      setIsQuickSwitchOpen(false);
                      setPendingSwitchUser(null);
                      setSwitchPin('');
                      void silentRefreshData?.();
                    }
                  }}
                  className="flex flex-col items-center justify-center gap-1 text-[#455a3f] transition-transform"
                >
                  <Fingerprint className="w-6 h-6" />
                </button>
              ) : null
            }
          />
        </AnimatePresence>,
        document.body
      )}
    </nav>
  );
}
