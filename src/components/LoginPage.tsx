import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { User as UserIcon, Lock, Loader2, Eye, EyeOff, Fingerprint, Mail, Phone, Save } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';

import { useAppConfig } from '../context/appSliceContexts';
import type { User as UserType, Language as LangType, Theme } from '../types';
import { database } from '../lib/database';
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
} from '../utils/loginIdentifier';
import { useTenant } from '../context/TenantContext';
import FlowWaveIcon from './ui/FlowWaveIcon';
import FlowLogoSvg from './FlowLogoSvg';
import {
  supportsPinUnlockWebAuthn,
  hasAnyPinUnlockCredentialOnDevice,
  authenticatePinUnlockAndResolveUserId,
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
  /** Link di accesso revocato dall'admin (?revoked=1) — nessuna autocompilazione. */
  const revokedLink = searchParams.get('revoked') === '1';
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
  const [showPinHelp, setShowPinHelp] = useState(false);
  const [pinFocused, setPinFocused] = useState(false);
  const [error, setError] = useState('');
  const [deviceSuccess, setDeviceSuccess] = useState('');
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
  const [showForm, setShowForm] = useState(false);
  // Credenziali in attesa che il tenant carichi (fallback Option B)
  const [pendingCreds, setPendingCreds] = useState<{ name: string; pin: string } | null>(null);

  const webAuthnOk = supportsPinUnlockWebAuthn();
  const hasDeviceLogin = hasAnyPinUnlockCredentialOnDevice();

  // true solo se il dispositivo ha biometria integrata (Face ID / Touch ID / Windows Hello)
  const [hasBiometric, setHasBiometric] = useState(false);

  // Invite onboarding — il nuovo dipendente compila i campi mancanti
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteOnboardLoading, setInviteOnboardLoading] = useState(false);
  const [inviteOnboardDone, setInviteOnboardDone] = useState(false);

  const handleInviteOnboard = useCallback(async () => {
    if (!inviteUserId || inviteOnboardLoading) return;
    setInviteOnboardLoading(true);
    setError('');
    try {
      // Aggiorna i dati utente (email, telefono, PIN)
      const patch: Record<string, string> = {};
      if (inviteEmail.trim()) patch.email = inviteEmail.trim();
      if (invitePhone.trim()) patch.phone = invitePhone.trim();
      const pinDigits = password.replace(/\D/g, '');
      if (pinDigits.length === 4) patch.pin = pinDigits;
      if (Object.keys(patch).length > 0) {
        await database.users.update(inviteUserId, patch as Partial<UserType>);
      }

      // Richiedi permessi notifiche (non bloccante: su iOS Safari nel browser
      // le notifiche web non sono supportate e requestPermission può fallire)
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch { /* ignora */ }
      }

      // Richiedi geolocalizzazione
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          () => {},
          () => {},
          { timeout: 5000, enableHighAccuracy: false }
        );
      }

      setInviteOnboardDone(true);
    } catch (err: unknown) {
      setError('Errore durante il salvataggio. Riprova.');
      console.error('Invite onboarding error:', err);
    } finally {
      setInviteOnboardLoading(false);
    }
  }, [inviteUserId, inviteEmail, invitePhone, inviteOnboardLoading]);
  useEffect(() => {
    hasPlatformBiometricAuthenticator().then(setHasBiometric).catch(() => setHasBiometric(false));
  }, []);

  const resolvedUser = useMemo(() => {
    const matches = findUsersMatchingName(users, staffName);
    return matches.length === 1 ? matches[0] : undefined;
  }, [users, staffName]);
  // L'attivazione Face ID / impronta avviene esclusivamente dal profilo di ogni utente:
  // la sezione qui sotto appare solo se il dispositivo ha già una credenziale salvata.
  const showDeviceSection = webAuthnOk && hasBiometric && hasDeviceLogin;

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
    if (invitePinFromUrl) {
      // Non pre-compilare il PIN — l'utente lo imposta nel form onboarding
      // setPassword(invitePinFromUrl);
    }
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
        finalizeSession(user, () => {});
      })();
    } else {
      setError('PIN non corretto. Riprova.');
      setPassword('');
      requestAnimationFrame(() => pinInputRef.current?.focus());
    }
  }, [users, pendingCreds, finalizeSession]);

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

  /** Auto‑login quando il PIN raggiunge 4 cifre (corretto o errato, per dare feedback immediato) */
  useEffect(() => {
    if (!showForm || !resolvedUser) return;
    if (password.length !== 4) return;
    if (isLoading || deviceLoading) return;
    if (autoLoginInFlightRef.current) return;
    autoLoginInFlightRef.current = true;
    const id = setTimeout(() => {
      handleLogin();
    }, 200);
    return () => {
      clearTimeout(id);
      autoLoginInFlightRef.current = false;
    };
  }, [password, resolvedUser, showForm, isLoading, deviceLoading, handleLogin]);

  const runBiometricLogin = useCallback(
    async (opts?: { silent?: boolean }): Promise<boolean> => {
      const silent = opts?.silent ?? false;
      if (!webAuthnOk || deviceLoading || isLoading) return false;
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
    [webAuthnOk, deviceLoading, isLoading, users, finalizeSession, t]
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
          className="pointer-events-none absolute left-4 right-4 top-[max(1rem,env(safe-area-inset-top))] z-30 rounded-xl border border-amber-400/35 bg-black/50 px-3 py-2 text-center text-[0.8125rem] leading-snug text-amber-100 backdrop-blur-sm"
        >
          {tenantBootstrapError}
        </div>
      ) : null}

      {/* F watermark di sfondo */}
      <div
        aria-hidden
        className="pointer-events-none select-none absolute inset-0 flex items-center justify-center"
      >
        <FlowLogoSvg
          variant="icon-only"
          color="orange"
          className="w-full max-w-[53.75rem] min-w-[20rem] h-auto overflow-x-hidden"
          style={{ opacity: 0.055, filter: 'saturate(0) brightness(0) blur(6px)' }}
        />
      </div>

      <div className="w-full max-w-lg flex flex-col items-center">
        <>
        {/* Schermata iniziale — identica al boot screen AppProvider */}
        {!showForm && (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center select-none cursor-pointer"
          onClick={() => { if (!showForm) setShowForm(true); }}
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
             className="mt-8 text-[0.6875rem] font-semibold tracking-[0.25em] uppercase select-none pointer-events-none animate-breathe"
            style={{ color: '#ffffff' }}
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
          <motion.div animate={shakeControls} className="w-full max-w-[17rem] space-y-3">

            {/* Invite onboarding — nuovo dipendente */}
            {isInviteLink && !inviteOnboardDone && (
              <div className="rounded-xl px-4 py-4 text-xs space-y-3" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <p className="text-sm font-bold text-white">
                  Benvenuto{linkedUser ? ` ${linkedUser.first_name}` : ''}! 👋
                </p>
                <p className="text-white/60 leading-relaxed">
                  Completa i tuoi dati per iniziare a usare FLOW.
                </p>

                {/* Email */}
                <div className="relative">
                  <Mail className="absolute left-3 top-[0.8125rem] w-4 h-4 text-accent" aria-hidden />
                  <input
                    type="email"
                    inputMode="email"
                    autoCapitalize="off"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="Email"
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-white text-sm focus:outline-none ring-2 ring-accent/60 transition-all"
                    style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)', WebkitAppearance: 'none', appearance: 'none', WebkitBoxShadow: '0 0 0 30px rgba(255,255,255,0.09) inset', WebkitTextFillColor: '#fff' }}
                  />
                </div>

                {/* PIN (pre-compilato) */}
                <div className="relative">
                  <Lock className="absolute left-3 top-[0.8125rem] w-4 h-4 text-accent" aria-hidden />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    value={password}
                    onChange={(e) => setPassword(e.target.value.replace(/\D/g, ''))}
                    placeholder="PIN (4 cifre)"
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-white text-sm font-bold tracking-[0.3em] focus:outline-none ring-2 ring-accent/60 transition-all"
                    style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)', WebkitAppearance: 'none', appearance: 'none', WebkitBoxShadow: '0 0 0 30px rgba(255,255,255,0.09) inset', WebkitTextFillColor: '#fff' }}
                  />
                </div>

                {/* Telefono */}
                <div className="relative">
                  <Phone className="absolute left-3 top-[0.8125rem] w-4 h-4 text-accent" aria-hidden />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    placeholder="Numero di telefono"
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-white text-sm focus:outline-none ring-2 ring-accent/60 transition-all"
                    style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)', WebkitAppearance: 'none', appearance: 'none', WebkitBoxShadow: '0 0 0 30px rgba(255,255,255,0.09) inset', WebkitTextFillColor: '#fff' }}
                  />
                </div>

                {/* Error */}
                {error && (
                  <p className="text-red-300 text-[0.6875rem] text-center rounded-lg px-3 py-1.5" style={{ background: 'rgba(255,80,80,0.16)' }}>{error}</p>
                )}

                <button
                  type="button"
                  onClick={handleInviteOnboard}
                  disabled={!password.trim() || inviteOnboardLoading}
                  className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{ background: '#FF9500', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  {inviteOnboardLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Salva e inizia
                </button>
              </div>
            )}

            {/* Invite done — mostra login normale */}
            {(!isInviteLink || inviteOnboardDone) && (
              <>
            {/* Invite banner (solo informativo, onboarding già fatto) */}
            {isInviteLink && (
              <div className="rounded-xl px-3 py-2.5 text-xs text-white/80 space-y-1" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }}>
                <p className="font-semibold text-white">✅ Dati salvati. Accedi con nome e PIN.</p>
              </div>
            )}

            {/* Link revocato — avviso (nessun invito attivo) */}
            {revokedLink && !isInviteLink && (
              <div className="rounded-xl px-3 py-2.5 text-xs text-white/80 space-y-1" style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
                <p className="font-semibold text-white/90">⚠️ {t.invite_revoked_banner ?? 'Questo link di accesso non è più valido. Contatta un amministratore.'}</p>
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
                className="w-full pl-10 pr-4 py-3.5 rounded-2xl text-white text-base uppercase placeholder:normal-case placeholder:text-white/35 placeholder:text-base focus:outline-none focus:ring-2 focus:ring-white/50 transition-colors"
                style={{ WebkitAppearance: 'none', appearance: 'none', backgroundColor: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)', WebkitBoxShadow: '0 0 0 30px rgba(255,255,255,0.09) inset', WebkitTextFillColor: '#fff' }}
              />
            </div>

            {/* Password / PIN */}
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35 z-10" aria-hidden />
              {/* Input nascosto per tastiera + PIN visivo a pallini */}
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                enterKeyHint="done"
                autoComplete="current-password"
                autoCorrect="off"
                spellCheck={false}
                maxLength={4}
                value={password}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  setPassword(digits);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                onFocus={() => setPinFocused(true)}
                onBlur={() => setPinFocused(false)}
                ref={pinInputRef}
                aria-label={t.login_password_label}
                className="absolute inset-0 opacity-0 z-20 cursor-default pointer-events-none"
                style={{ caretColor: 'transparent' }}
              />
              {/* Contenitore visivo */}
              <div
                className={`w-full pl-10 pr-10 py-3.5 rounded-2xl flex items-center justify-center gap-5 transition-all cursor-text ${pinFocused ? 'ring-2 ring-white/50' : ''}`}
                style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.15)' }}
                onClick={() => pinInputRef.current?.focus()}
              >
                {showPassword ? (
                  <span className="text-white text-base font-bold tracking-[0.3em]">{password || '\u00A0'}</span>
                ) : (
                  [0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="w-4 h-4 rounded-full transition-colors duration-200"
                      style={password.length > i
                        ? { background: '#ffffff', boxShadow: '0 0 10px 3px rgba(255,255,255,0.60)' }
                        : { background: 'rgba(255,255,255,0.35)' }}
                    />
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 transition-colors active:text-white/70 z-10"
                tabIndex={-1}
                aria-label={showPassword ? t.pin_toggle_hide : t.pin_toggle_show}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
              </button>
            </div>

            {/* Non ricordi il PIN? — aiuto recupero credenziali */}
            <div className="-mt-1 flex flex-col items-center">
              <button
                type="button"
                onClick={() => setShowPinHelp((v) => !v)}
                className="text-xs text-white/45 hover:text-white/80 transition-colors underline underline-offset-4 decoration-white/25 hover:decoration-white/70 focus:outline-none focus:ring-2 focus:ring-white/40 rounded px-1 py-0.5"
                aria-expanded={showPinHelp}
              >
                {t.login_forgot_pin ?? 'Non ricordi il PIN?'}
              </button>
              <AnimatePresence initial={false}>
                {showPinHelp && (
                  <motion.div
                    initial={{ opacity: 0, height: 0, y: -4 }}
                    animate={{ opacity: 1, height: 'auto', y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -4 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                    className="overflow-hidden w-full"
                  >
                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: 0.08 }}
                      className="mt-1.5 text-xs text-white/70 leading-snug text-center rounded-xl px-3 py-2.5"
                      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }}
                    >
                      {t.login_forgot_pin_hint}
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>
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
              disabled={!staffName.trim() || !password.trim() || isLoading || deviceLoading}
              className="w-full py-3.5 rounded-2xl text-white font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg"
              style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}
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

            {/* Sezione biometrico — visibile solo se il dispositivo ha già una credenziale salvata */}
            {showDeviceSection && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-2 text-white/30 text-[0.6875rem]">
                  <span className="h-px flex-1 bg-white/12" aria-hidden />
                  <span>{t.login_device_or ?? 'oppure'}</span>
                  <span className="h-px flex-1 bg-white/12" aria-hidden />
                </div>

                <button
                  type="button"
                  onClick={handleDeviceLogin}
                  disabled={deviceLoading || isLoading}
                  className="w-full py-3.5 rounded-2xl text-white/75 font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)' }}
                >
                  {deviceLoading ? (
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  ) : (
                    <Fingerprint className="w-4.5 h-4.5 shrink-0" strokeWidth={1.75} aria-hidden />
                  )}
                  <span>{t.login_device_btn}</span>
                </button>
              </div>
            )}
              </>
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
