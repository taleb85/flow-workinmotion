import { useState, useEffect, useCallback, useMemo, useRef, memo, type CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { User as UserIcon, Lock, Loader2, Eye, EyeOff, Fingerprint, X } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';

/** Evento beforeinstallprompt (PWA install su Chrome/Edge/Android) */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
import { useAppConfig } from '../context/appSliceContexts';
import type { User as UserType, Language as LangType, Theme } from '../types';
import { userRowToSessionUser } from '../utils/staffPermissionDefaults';
import { getTranslations } from '../utils/translations';
import { applyUnauthenticatedDocumentTheme } from '../utils/theme';
import { decodeProfiloAccessToken } from '../config/appPaths';
import { APP_SESSION_STORAGE_KEY, FLOW_INVITE_NAME_STORAGE_KEY, FLOW_INVITE_PIN_STORAGE_KEY } from '../constants/appSession';
import { getDeviceUiLanguage } from '../utils/uiLanguagePreference';
import {
  findUserByNameAndPinAnyStatus,
  findUserByNameAndSecondaryPin,
  findUsersMatchingName,
  getLoginNamePinFailureKind,
  pinMatchesStored,
} from '../utils/loginIdentifier';
import { useTenant } from '../context/TenantContext';
import FlowWaveIcon from './ui/FlowWaveIcon';
import FlowLogoSvg from './FlowLogoSvg';
import {
  supportsPinUnlockWebAuthn,
  registerPinUnlockCredential,
  hasAnyPinUnlockCredentialOnDevice,
  authenticatePinUnlockAndResolveUserId,
  hasPinUnlockCredential,
  hasPlatformBiometricAuthenticator,
} from '../utils/pinUnlockWebAuthn';

interface LoginPageProps {
  onLogin: () => void;
  onBack: () => void;
}

export default memo(function LoginPage({ onLogin }: LoginPageProps) {
  const { users, setCurrentUser, setLanguage, setIsSessionElevated } = useAppUser();
  const { featureFlags } = useAppConfig();
  const _kioskEnabled = featureFlags['kiosk_active'] !== false;
  const { tenant, loadTenantBySlug, error: tenantBootstrapError } = useTenant();
  const [searchParams] = useSearchParams();

  // Nuovo formato: ?t=<base64 JSON> con tenantSlug — retrocompatibile con vecchi ?u=&n=&p=
  const { inviteUserId, inviteNameFromUrl, invitePinFromUrl, inviteTenantSlug } = useMemo(() => {
    const tokenParam = searchParams.get('t');
    if (tokenParam) {
      const { userId, pin, tenantSlug } = decodeProfiloAccessToken(tokenParam);
      return {
        inviteUserId: userId,
        inviteNameFromUrl: '',
        invitePinFromUrl: pin,
        inviteTenantSlug: tenantSlug,
      };
    }
    const u = searchParams.get('u')?.trim() ?? '';
    const n = (searchParams.get('n') ?? '').trim();
    const rawP = searchParams.get('p') ?? '';
    const p = rawP.replace(/\D/g, '').slice(0, 4);
    return {
      inviteUserId: u,
      inviteNameFromUrl: n,
      invitePinFromUrl: p.length === 4 ? p : '',
      inviteTenantSlug: '',
    };
  }, [searchParams]);

  // Option B — carica il tenant dal token se non già caricato
  useEffect(() => {
    if (inviteTenantSlug) loadTenantBySlug(inviteTenantSlug);
  }, [inviteTenantSlug, loadTenantBySlug]);

  const linkedUser = useMemo(
    () => (inviteUserId ? users.find((u) => u.id === inviteUserId) : undefined),
    [inviteUserId, users]
  );
  const isInviteLink = Boolean(inviteUserId || inviteNameFromUrl || invitePinFromUrl);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const staffNameInputRef = useRef<HTMLInputElement>(null);
  const loginBtnRef = useRef<HTMLButtonElement>(null);
  /** Un solo tentativo di login biometrico silenzioso per apertura form (device già registrato). */
  const autoBiometricAttemptedRef = useRef(false);
  /** Impedisce auto-login multipli simultanei */
  const autoLoginInFlightRef = useRef(false);
  /** /profilo: lingua da browser/OS (navigator.languages), non ultimo profilo in localStorage */
  const [loginLang, setLoginLang] = useState<LangType>(() => getDeviceUiLanguage());
  const t = getTranslations(loginLang);

  const [staffName, setStaffName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [deviceSuccess, setDeviceSuccess] = useState('');
  /** Evento install PWA nativo (Chrome/Android) — catturato e riesposto come bottone. */
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const isIOS = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /iPhone|iPad|iPod/.test(navigator.userAgent);
  }, []);
  const isSafari = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const ua = navigator.userAgent;
    return /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|mercury/.test(ua);
  }, []);
  const isStandalone = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (navigator as Navigator & { standalone?: boolean }).standalone === true
      || window.matchMedia('(display-mode: standalone)').matches;
  }, []);
  /** Banner installazione — iOS Safari non-standalone (guida visiva) o Android Chrome (bottone install) */
  const showInstallBanner = !isStandalone && ((isIOS && isSafari) || deferredPrompt !== null);
  /** Banner installazione iOS — guida visiva con freccia verso la barra indirizzi */
  const [showIosInstallHint, setShowIosInstallHint] = useState(() => {
    if (typeof window === 'undefined') return false;
    return isIOS && isSafari && !isStandalone;
  });

  // Cattura beforeinstallprompt (Chrome/Android, Edge, etc.)
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  /** Su Chrome/Android: mostra il dialog nativo di installazione PWA. */
  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    } catch {
      // user dismissed
    }
  };
  const shakeControls = useAnimation();
  useEffect(() => {
    if (!error) return;
    void shakeControls.start({
      x: [0, -11, 11, -8, 8, -5, 5, -2, 2, 0],
      transition: { duration: 0.45, ease: 'easeInOut' },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);
  const [isLoading, setIsLoading] = useState(false);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [linkDeviceLoading, setLinkDeviceLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // Credenziali in attesa che il tenant carichi (fallback Option B)
  const [pendingCreds, setPendingCreds] = useState<{ name: string; pin: string } | null>(null);

  const webAuthnOk = supportsPinUnlockWebAuthn();
  const hasDeviceLogin = hasAnyPinUnlockCredentialOnDevice();

  // true solo se il dispositivo ha biometria integrata (Face ID / Touch ID / Windows Hello)
  const [hasBiometric, setHasBiometric] = useState(false);
  useEffect(() => {
    hasPlatformBiometricAuthenticator().then(setHasBiometric).catch(() => setHasBiometric(false));
  }, []);

  const resolvedUser = useMemo(() => {
    const matches = findUsersMatchingName(users, staffName);
    return matches.length === 1 ? matches[0] : undefined;
  }, [users, staffName]);
  const pinMatches = !!(resolvedUser && pinMatchesStored(resolvedUser, password));
  const canShowLinkDevice = webAuthnOk && hasBiometric && pinMatches && resolvedUser && !hasPinUnlockCredential(resolvedUser.id);
  const showDeviceSection = webAuthnOk && hasBiometric && (hasDeviceLogin || canShowLinkDevice);

  useEffect(() => {
    applyUnauthenticatedDocumentTheme();
    // La pagina di login usa sempre il design dark (come da preview).
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    if (!inviteUserId && !inviteNameFromUrl && !invitePinFromUrl) {
      return;
    }
    if (inviteNameFromUrl) setStaffName(inviteNameFromUrl.toUpperCase());
    else if (inviteUserId && linkedUser) {
      const nameForLogin = `${linkedUser.first_name} ${linkedUser.last_name ?? ''}`.trim();
      if (nameForLogin) setStaffName(nameForLogin.toUpperCase());
    }
    if (invitePinFromUrl) setPassword(invitePinFromUrl);
  }, [inviteUserId, inviteNameFromUrl, invitePinFromUrl, linkedUser]);

  useEffect(() => {
    if (inviteUserId || inviteNameFromUrl || invitePinFromUrl) return;
    try {
      const storedName = localStorage.getItem(FLOW_INVITE_NAME_STORAGE_KEY);
      const storedPin = localStorage.getItem(FLOW_INVITE_PIN_STORAGE_KEY);
      if (storedName) {
        setStaffName(storedName.toUpperCase());
        localStorage.removeItem(FLOW_INVITE_NAME_STORAGE_KEY);
      }
      if (storedPin) {
        setPassword(storedPin);
        localStorage.removeItem(FLOW_INVITE_PIN_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [inviteUserId, inviteNameFromUrl, invitePinFromUrl]);

  /**
   * Quando il form diventa visibile (dopo "Tap to start"), sposta il focus sull'input giusto.
   * Prima gli input non sono montati: autoFocus da solo non basta, soprattutto su iOS.
   */
  useEffect(() => {
    if (!showForm) return;
    if (isInviteLink) return;
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        staffNameInputRef.current?.focus();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [showForm, isInviteLink]);

  useEffect(() => {
    if (!showForm || !isInviteLink) return;
    const hasNameHint =
      Boolean(inviteNameFromUrl) ||
      Boolean(
        inviteUserId &&
          linkedUser &&
          `${linkedUser.first_name} ${linkedUser.last_name ?? ''}`.trim()
      );
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (invitePinFromUrl && hasNameHint) loginBtnRef.current?.focus();
        else if (invitePinFromUrl) pinInputRef.current?.focus();
        else staffNameInputRef.current?.focus();
      });
    });
    return () => cancelAnimationFrame(id);
  }, [showForm, isInviteLink, inviteUserId, inviteNameFromUrl, invitePinFromUrl, linkedUser]);

  useEffect(() => {
    const sync = () => setLoginLang(getDeviceUiLanguage());
    window.addEventListener('languagechange', sync);
    return () => window.removeEventListener('languagechange', sync);
  }, []);

  useEffect(() => {
    document.documentElement.lang = loginLang === 'en' ? 'en' : loginLang === 'es' ? 'es' : loginLang === 'fr' ? 'fr' : 'it';
  }, [loginLang]);

  const maybeRegisterDeviceAfterPinLogin = useCallback(
    async (user: UserType) => {
      if (!webAuthnOk || !hasBiometric) return;
      if (hasPinUnlockCredential(user.id)) return;
      const displayName =
        `${user.first_name} ${user.last_name ?? ''}`.trim() || user.email || user.id;
      try {
        await registerPinUnlockCredential(user.id, displayName, user.email ?? '');
      } catch {
        /* annullo Face ID / Touch ID o errore runtime */
      }
    },
    [webAuthnOk, hasBiometric]
  );

  const finalizeSession = useCallback(
    (user: UserType, clearLoading: () => void) => {
      const userLang = (user.language || loginLang) as LangType;
      setLanguage(userLang);
      try {
        localStorage.setItem(
          APP_SESSION_STORAGE_KEY,
          JSON.stringify({
            userId: user.id,
            email: (user.email || '').trim().toLowerCase() || undefined,
            ...(tenant?.slug ? { tenantSlug: tenant.slug } : {}),
          })
        );
      } catch {
        /* ignore */
      }
      const safeUser = userRowToSessionUser({
        ...user,
        language: userLang,
        theme: (user.theme ?? 'light') as Theme,
      } as UserType);
      setCurrentUser(safeUser);
      setTimeout(() => {
        clearLoading();
        onLogin();
      }, 300);
    },
    [loginLang, setLanguage, setCurrentUser, onLogin, tenant?.slug]
  );

  // Retry automatico dopo caricamento tenant (fallback Option B)
  // NOTA: deve stare DOPO la dichiarazione di finalizeSession per evitare TDZ
  useEffect(() => {
    if (!pendingCreds || users.length === 0) return;
    const creds = pendingCreds;
    setPendingCreds(null);
    setIsLoading(false);
    const user = findUserByNameAndPinAnyStatus(users, creds.name, creds.pin);
    if (user && user.status === 'active') {
      setError('');
      void (async () => {
        await maybeRegisterDeviceAfterPinLogin(user);
        finalizeSession(user, () => {});
      })();
    } else {
      setError('PIN non corretto. Riprova.');
    }
  }, [users, pendingCreds, finalizeSession, maybeRegisterDeviceAfterPinLogin]);

  const handleLogin = useCallback(async () => {
    if (!staffName.trim() || !password.trim() || isLoading) return;
    setError('');
    setDeviceSuccess('');
    setIsLoading(true);

    const user = findUserByNameAndPinAnyStatus(users, staffName, password);

    if (!user) {
      // Controlla PIN secondario (elevazione sessione temporanea)
      const elevatedUser = findUserByNameAndSecondaryPin(users, staffName, password);
      if (elevatedUser?.elevated_role) {
        const asElevated = { ...elevatedUser, role: elevatedUser.elevated_role };
        setIsSessionElevated(true);
        finalizeSession(asElevated as UserType, () => setIsLoading(false));
        return;
      }

      // Fallback Option B: se users è vuota (nessun tenant caricato),
      // cerca globalmente per nome+PIN → carica tenant → retry automatico via useEffect
      if (users.length === 0) {
        const { supabase } = await import('../lib/supabase');
        if (!supabase) {
          setIsLoading(false);
          setError('Nessun dipendente trovato. Controlla nome e PIN.');
          setPassword('');
          requestAnimationFrame(() => pinInputRef.current?.focus());
          return;
        }
        try {
          const firstName = staffName.trim().split(/\s+/)[0];
          const { data: globalUsers } = await supabase
            .from('users')
            .select('id, first_name, last_name, pin, status, tenant_id')
            .ilike('first_name', `%${firstName}%`)
            .eq('status', 'active');

          if (globalUsers && globalUsers.length > 0) {
            // Cerca per nome completo prima, poi solo per PIN
            const nameNorm = staffName.trim().toLowerCase();
            const matched =
              globalUsers.find((u) =>
                `${u.first_name} ${u.last_name ?? ''}`.trim().toLowerCase() === nameNorm &&
                u.pin === password
              ) ??
              globalUsers.find((u) =>
                u.first_name.toLowerCase() === nameNorm &&
                u.pin === password
              ) ??
              globalUsers.find((u) => u.pin === password);

            if (matched?.tenant_id) {
              const { data: tenantData } = await supabase
                .from('tenants')
                .select('slug')
                .eq('id', matched.tenant_id)
                .maybeSingle();
              if (tenantData?.slug) {
                // Salva credenziali e carica tenant — l'useEffect farà il retry
                setPendingCreds({ name: staffName, pin: password });
                setError('');
                await loadTenantBySlug(tenantData.slug);
                // isLoading rimane true finché l'effect non completa
                return;
              }
            }
          }
        } catch {
          // ignora errori nella ricerca globale
        }
        setIsLoading(false);
        setError('Nessun dipendente trovato. Controlla nome e PIN o usa il tuo link personale.');
        setPassword('');
        requestAnimationFrame(() => pinInputRef.current?.focus());
        return;
      }

      const kind = getLoginNamePinFailureKind(users, staffName, password);
      const msg =
        kind === 'no_name_match'
          ? t.login_error_name_not_found
          : kind === 'wrong_pin'
            ? t.login_error_wrong_pin
            : kind === 'homonym_or_ambiguous'
              ? t.login_error_homonym_login
              : (t.login_invalid_credentials ?? 'Nome o PIN non corretti. Riprova.');
      setTimeout(() => {
        setIsLoading(false);
        setError(msg);
        setPassword('');
        requestAnimationFrame(() => pinInputRef.current?.focus());
      }, 600);
      return;
    }
    if (user.status !== 'active') {
      setTimeout(() => {
        setIsLoading(false);
        setError(t.login_account_not_active);
        setPassword('');
        requestAnimationFrame(() => pinInputRef.current?.focus());
      }, 600);
      return;
    }
    void (async () => {
      await maybeRegisterDeviceAfterPinLogin(user);
      finalizeSession(user, () => setIsLoading(false));
    })();
  }, [
    staffName,
    password,
    isLoading,
    users,
    finalizeSession,
    t,
    loadTenantBySlug,
    setIsSessionElevated,
    maybeRegisterDeviceAfterPinLogin,
  ]);

  /** Auto‑focus sul campo PIN quando il nome è riconosciuto univocamente */
  useEffect(() => {
    if (!showForm || !resolvedUser || isLoading) return;
    if (password.length > 0) return;
    const id = requestAnimationFrame(() => {
      pinInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [resolvedUser, showForm, isLoading, password.length]);

  /** Auto‑login quando il PIN di 4 cifre corrisponde */
  useEffect(() => {
    if (!showForm || !resolvedUser || !pinMatches) return;
    if (password.length !== 4) return;
    if (isLoading || deviceLoading || linkDeviceLoading) return;
    if (autoLoginInFlightRef.current) return;
    autoLoginInFlightRef.current = true;
    const id = setTimeout(() => {
      handleLogin();
    }, 200);
    return () => {
      clearTimeout(id);
      autoLoginInFlightRef.current = false;
    };
  }, [password, resolvedUser, pinMatches, showForm, isLoading, deviceLoading, linkDeviceLoading, handleLogin]);

  const runBiometricLogin = useCallback(
    async (opts?: { silent?: boolean }): Promise<boolean> => {
      const silent = opts?.silent ?? false;
      if (!webAuthnOk || deviceLoading || isLoading || linkDeviceLoading) return false;
      if (!silent) {
        setError('');
        setDeviceSuccess('');
      }
      setDeviceLoading(true);
      try {
        const userId = await authenticatePinUnlockAndResolveUserId();
        if (!userId) {
          if (!silent) setError(t.login_device_failed);
          setDeviceLoading(false);
          return false;
        }
        const user = users.find((u) => u.id === userId && u.status === 'active');
        if (!user) {
          if (!silent) setError(t.login_device_no_user);
          setDeviceLoading(false);
          return false;
        }
        finalizeSession(user, () => setDeviceLoading(false));
        return true;
      } catch {
        if (!silent) setError(t.login_device_failed);
        setDeviceLoading(false);
        return false;
      }
    },
    [webAuthnOk, deviceLoading, isLoading, linkDeviceLoading, users, finalizeSession, t]
  );

  const handleDeviceLogin = useCallback(() => runBiometricLogin({ silent: false }), [runBiometricLogin]);

  useEffect(() => {
    if (!showForm) autoBiometricAttemptedRef.current = false;
  }, [showForm]);

  useEffect(() => {
    if (!showForm || !webAuthnOk || !hasBiometric || !hasDeviceLogin || isInviteLink) return;
    if (users.length === 0) return;
    if (autoBiometricAttemptedRef.current) return;
    autoBiometricAttemptedRef.current = true;
    void runBiometricLogin({ silent: true });
  }, [showForm, webAuthnOk, hasBiometric, hasDeviceLogin, isInviteLink, users.length, runBiometricLogin]);

  const handleLinkDevice = useCallback(async () => {
    if (!webAuthnOk || !resolvedUser || !pinMatches || linkDeviceLoading || isLoading || deviceLoading) return;
    setError('');
    setDeviceSuccess('');
    setLinkDeviceLoading(true);
    try {
      const displayName =
        `${resolvedUser.first_name} ${resolvedUser.last_name ?? ''}`.trim() || resolvedUser.email;
      const ok = await registerPinUnlockCredential(resolvedUser.id, displayName, resolvedUser.email);
      if (ok) setDeviceSuccess(t.login_device_linked_ok);
      else setError(t.login_device_register_failed);
    } catch {
      setError(t.login_device_register_failed);
    } finally {
      setLinkDeviceLoading(false);
    }
  }, [webAuthnOk, resolvedUser, pinMatches, linkDeviceLoading, isLoading, deviceLoading, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleLogin();
    },
    [handleLogin]
  );

  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={() => { if (!showForm) setShowForm(true); }}
      role="main"
      aria-label="Login"
      className="fixed inset-0 z-20 w-full flex flex-col items-center justify-center p-6 safe-area-pad font-sans antialiased text-neutral-100 overflow-y-auto"
      style={{
        background: 'transparent',
        bottom: '-60px',
      }}
    >
      {tenantBootstrapError ? (
        <div
          role="alert"
          className="pointer-events-none absolute left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 rounded-xl border border-amber-400/35 bg-black/50 px-3 py-2 text-center text-[13px] leading-snug text-amber-100 backdrop-blur-sm"
        >
          {tenantBootstrapError}
        </div>
      ) : null}

      {/* Banner installazione PWA */}
      {showIosInstallHint && (
        isIOS ? (
          /* iOS Safari: guida visiva — "Aggiungi a Home" è nel menu pagina ☰ */
          <div className="absolute left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 rounded-xl border border-orange-400/25 bg-orange-500/10 backdrop-blur-lg px-3 py-2.5">
            <p className="text-[13px] leading-snug text-white font-semibold text-center mb-0.5">
              📲 Installa l'app sulla Home
            </p>
            <p className="text-[11px] text-white/50 text-center leading-relaxed">
              Tocca <span className="inline-flex items-center justify-center w-4 h-4 rounded bg-white/15 text-white text-[10px] font-bold">☰</span> nella barra indirizzi di Safari (in alto o in basso)
              <br />poi <span className="text-white/70 font-semibold">Aggiungi a Schermata Home</span>
            </p>
          </div>
          </div>
        ) : deferredPrompt !== null ? (
          /* Chrome/Android/Edge: bottone che apre il dialog nativo di installazione */
          <div className="absolute left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 rounded-xl border border-green-400/20 bg-green-500/10 backdrop-blur-lg px-3 py-2.5">
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-2 text-[13px] font-semibold text-white"
            >
              📲 Installa l'app sulla Home
            </button>
          </div>
        ) : null
      )}

      {/* F watermark di sfondo */}
      <div
        aria-hidden
        className="pointer-events-none select-none absolute inset-0 flex items-center justify-center"
      >
        <FlowLogoSvg
          variant="icon-only"
          color="orange"
          className="w-full max-w-[860px] min-w-[320px] h-auto overflow-x-hidden"
          style={{ opacity: 0.055, filter: 'saturate(0) brightness(0) blur(6px)' }}
        />
      </div>

      <div className="w-full max-w-lg flex flex-col items-center">
        <>
        {/* Schermata iniziale — identica al boot screen AppProvider */}
        {!showForm && (
        <div
          className="relative flex flex-col items-center select-none"
          onPointerDown={() => { if (!showForm) setShowForm(true); }}
        >
          <button
            type="button"
            aria-label="Apri form di accesso"
            onClick={() => setShowForm(true)}
            onPointerDown={() => { if (!showForm) setShowForm(true); }}
            className="focus:outline-none cursor-pointer touch-manipulation [-webkit-tap-highlight-color:transparent]"
          >
            {/*
              pointer-events-none sui figli: iOS a volte non sintetizza il click se il target è div/SVG/motion sotto al button
            */}
            <span className="pointer-events-none inline-flex" aria-hidden>
            <div className="animate-pulse-glow" style={{ borderRadius: 28 }}>
              <FlowWaveIcon size={112} radius={28} />
            </div>
            </span>
          </button>
          <p
             className="mt-8 text-[11px] font-semibold tracking-[0.25em] uppercase select-none pointer-events-none animate-breathe"
            style={{ color: 'rgba(255,255,255,0.75)' }}
          >
            Tap to start
          </p>
        </div>
        )}

        {/* Popup login — overlay centrato */}
        {/* Form stato — schermata intera, stile preview */}
        <AnimatePresence>
        {showForm && (
        <motion.div
          key="loginscreen"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.32, ease: [0.25, 0.1, 0.25, 1] }}
          className="w-full flex flex-col items-center"
        >
          {/* Logo + brand */}
          <div className="flex flex-col items-center mb-8">
            <div className="animate-pulse-glow-sm" style={{ borderRadius: 26 }}>
              <FlowWaveIcon size={96} radius={26} />
            </div>
          </div>

          {/* Form fields */}
          <motion.div animate={shakeControls} className="w-full max-w-[272px] space-y-3">

            {/* Invite banner */}
            {isInviteLink && (
              <div className="rounded-xl px-3 py-2.5 text-xs text-white/80 space-y-1" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid #525252' }}>
                <p className="font-semibold text-white">{t.login_invite_banner}</p>
                {inviteUserId && !linkedUser && users.length > 0 && (
                  <p className="text-xs text-amber-300">
                    {(t as { login_invite_user_unknown?: string }).login_invite_user_unknown}
                  </p>
                )}
                {linkedUser && linkedUser.status !== 'active' && (
                  <p className="text-xs text-amber-300">
                    {(t as { admin_employee_access_link_inactive?: string }).admin_employee_access_link_inactive}
                  </p>
                )}
              </div>
            )}

            {/* Nome utente */}
            <div className="relative">
              <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" aria-hidden />
              <input
                ref={staffNameInputRef}
                type="text"
                inputMode="text"
                autoCapitalize="words"
                value={staffName}
                onChange={(e) => { setStaffName(e.target.value); setError(''); setDeviceSuccess(''); }}
                onKeyDown={handleKeyDown}
                placeholder={t.login_name_ph ?? 'Nome utente'}
                aria-label={t.login_name_label}
                autoComplete="name"
                className="w-full pl-10 pr-4 py-3.5 rounded-2xl text-white text-base uppercase placeholder:normal-case placeholder:text-white/35 placeholder:text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 transition-all"
                style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid #525252' }}
              />
            </div>

            {/* Password / PIN */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" aria-hidden />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                autoComplete="current-password"
                autoCorrect="off"
                spellCheck={false}
                value={password}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setPassword(digits);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                ref={pinInputRef}
                placeholder={t.login_password_label ?? 'Password'}
                aria-label={t.login_password_label}
                style={!showPassword
                  ? ({ WebkitTextSecurity: 'disc', background: 'rgba(255,255,255,0.09)', border: '1px solid #525252' } as CSSProperties)
                  : { background: 'rgba(255,255,255,0.09)', border: '1px solid #525252' }}
                className="w-full pl-10 pr-10 py-3.5 rounded-2xl text-white text-base placeholder:text-white/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors active:text-white/70"
                tabIndex={-1}
                aria-label={showPassword ? t.pin_toggle_hide : t.pin_toggle_show}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
              </button>
            </div>

            {/* Error */}
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-300 text-xs font-medium text-center rounded-xl px-3 py-2 leading-snug"
                style={{ background: 'rgba(255,80,80,0.16)', border: '1px solid rgba(255,100,100,0.22)' }}
              >
                {error}
              </motion.p>
            )}

            {deviceSuccess && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-emerald-300 text-xs font-medium text-center rounded-xl px-3 py-2 leading-snug"
                style={{ background: 'rgba(0,200,120,0.12)', border: '1px solid rgba(0,200,120,0.22)' }}
              >
                {deviceSuccess}
              </motion.p>
            )}

            {/* Accedi */}
            <button
              ref={loginBtnRef}
              type="button"
              onClick={handleLogin}
              disabled={!staffName.trim() || !password.trim() || isLoading || deviceLoading || linkDeviceLoading}
              className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
              style={{ background: '#525252', border: '1px solid #6b6b6b' }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span aria-hidden className="text-base leading-none">→</span>
                  <span>{t.login_btn ?? 'Accedi'}</span>
                </>
              )}
            </button>

            {/* Sezione biometrico */}
            {showDeviceSection && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2 text-white/30 text-[11px]">
                  <span className="h-px flex-1 bg-white/12" aria-hidden />
                  <span>{t.login_device_or ?? 'oppure'}</span>
                  <span className="h-px flex-1 bg-white/12" aria-hidden />
                </div>

                {hasDeviceLogin && (
                  <button
                    type="button"
                    onClick={handleDeviceLogin}
                    disabled={deviceLoading || isLoading || linkDeviceLoading}
                    className="w-full py-3.5 rounded-2xl text-white/75 font-medium text-sm active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid #525252' }}
                  >
                    {deviceLoading ? (
                      <Loader2 className="w-4.5 h-4.5 animate-spin" />
                    ) : (
                      <Fingerprint className="w-4.5 h-4.5 shrink-0" strokeWidth={1.75} aria-hidden />
                    )}
                    <span>{t.login_device_btn}</span>
                  </button>
                )}

                {canShowLinkDevice && (
                  <button
                    type="button"
                    onClick={handleLinkDevice}
                    disabled={linkDeviceLoading || isLoading || deviceLoading}
                    title={t.login_device_link_title}
                    className="w-full py-2.5 rounded-xl text-white/45 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
                    style={{ background: 'rgba(255, 255, 255, 0.12)', border: '1px solid #525252' }}
                  >
                    {linkDeviceLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    {t.login_device_link_btn}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </motion.div>
        )}
        </AnimatePresence>

        {/* Kiosk link rimosso — la timbratura avviene via QR Code */}
        </>
      </div>
    </motion.div>
  );
})
