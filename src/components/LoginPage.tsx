import { useState, useEffect, useCallback, useMemo, useRef, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User as UserIcon, Lock, Loader2, Eye, EyeOff, Clock, Fingerprint } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { User as UserType, Language as LangType, Theme } from '../types';
import { userRowToSessionUser } from '../utils/staffPermissionDefaults';
import { getTranslations } from '../utils/translations';
import { forceLightTheme } from '../utils/theme';
import { PATH_TIMBRATURA } from '../config/appPaths';
import { APP_SESSION_STORAGE_KEY } from '../constants/appSession';
import { getDeviceUiLanguage } from '../utils/uiLanguagePreference';
import {
  findUserByNameAndPinAnyStatus,
  findUsersMatchingName,
  getLoginNamePinFailureKind,
  pinMatchesStored,
} from '../utils/loginIdentifier';
import {
  supportsPinUnlockWebAuthn,
  registerPinUnlockCredential,
  hasAnyPinUnlockCredentialOnDevice,
  authenticatePinUnlockAndResolveUserId,
  hasPinUnlockCredential,
} from '../utils/pinUnlockWebAuthn';

interface LoginPageProps {
  onLogin: () => void;
  onBack: () => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const { users, setCurrentUser, setLanguage } = useApp();
  const [searchParams] = useSearchParams();
  const inviteUserId = searchParams.get('u')?.trim() ?? '';
  const inviteNameFromUrl = (searchParams.get('n') ?? '').trim();
  const invitePinFromUrl = useMemo(() => {
    const raw = searchParams.get('p') ?? '';
    const d = raw.replace(/\D/g, '').slice(0, 4);
    return d.length === 4 ? d : '';
  }, [searchParams]);
  const linkedUser = useMemo(
    () => (inviteUserId ? users.find((u) => u.id === inviteUserId) : undefined),
    [inviteUserId, users]
  );
  const isInviteLink = Boolean(inviteUserId || inviteNameFromUrl || invitePinFromUrl);
  const pinInputRef = useRef<HTMLInputElement>(null);
  const staffNameInputRef = useRef<HTMLInputElement>(null);
  const loginBtnRef = useRef<HTMLButtonElement>(null);
  const lastFocusedInviteRef = useRef<string | null>(null);
  /** /profilo: lingua da browser/OS (navigator.languages), non ultimo profilo in localStorage */
  const [loginLang, setLoginLang] = useState<LangType>(() => getDeviceUiLanguage());
  const t = getTranslations(loginLang);

  const [staffName, setStaffName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [deviceSuccess, setDeviceSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [linkDeviceLoading, setLinkDeviceLoading] = useState(false);

  const webAuthnOk = supportsPinUnlockWebAuthn();
  const hasDeviceLogin = hasAnyPinUnlockCredentialOnDevice();

  const resolvedUser = useMemo(() => {
    const matches = findUsersMatchingName(users, staffName);
    return matches.length === 1 ? matches[0] : undefined;
  }, [users, staffName]);
  const pinMatches = !!(resolvedUser && pinMatchesStored(resolvedUser, password));
  const canShowLinkDevice = webAuthnOk && pinMatches && resolvedUser && !hasPinUnlockCredential(resolvedUser.id);
  const showDeviceSection = webAuthnOk && (hasDeviceLogin || canShowLinkDevice);

  useEffect(() => {
    forceLightTheme();
  }, []);

  useEffect(() => {
    if (!inviteUserId && !inviteNameFromUrl && !invitePinFromUrl) {
      return;
    }
    if (inviteNameFromUrl) setStaffName(inviteNameFromUrl);
    else if (inviteUserId && linkedUser) {
      const nameForLogin = `${linkedUser.first_name} ${linkedUser.last_name ?? ''}`.trim();
      if (nameForLogin) setStaffName(nameForLogin);
    }
    if (invitePinFromUrl) setPassword(invitePinFromUrl);
  }, [inviteUserId, inviteNameFromUrl, invitePinFromUrl, linkedUser]);

  useEffect(() => {
    if (!inviteUserId && !inviteNameFromUrl && !invitePinFromUrl) {
      lastFocusedInviteRef.current = null;
      return;
    }
    const hasNameHint =
      Boolean(inviteNameFromUrl) ||
      Boolean(
        inviteUserId &&
          linkedUser &&
          `${linkedUser.first_name} ${linkedUser.last_name ?? ''}`.trim()
      );
    const sig = `${inviteUserId}|${invitePinFromUrl}|${inviteNameFromUrl}|${linkedUser?.id ?? ''}`;
    if (lastFocusedInviteRef.current === sig) return;
    lastFocusedInviteRef.current = sig;
    requestAnimationFrame(() => {
      if (invitePinFromUrl && hasNameHint) loginBtnRef.current?.focus();
      else if (invitePinFromUrl) pinInputRef.current?.focus();
      else staffNameInputRef.current?.focus();
    });
  }, [inviteUserId, inviteNameFromUrl, invitePinFromUrl, linkedUser]);

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
        localStorage.setItem(APP_SESSION_STORAGE_KEY, JSON.stringify({ userId: user.id }));
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
    [loginLang, setLanguage, setCurrentUser, onLogin]
  );

  const handleLogin = useCallback(async () => {
    if (!staffName.trim() || !password.trim() || isLoading) return;
    setError('');
    setDeviceSuccess('');
    setIsLoading(true);

    const user = findUserByNameAndPinAnyStatus(users, staffName, password);

    if (!user) {
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
      }, 600);
      return;
    }
    if (user.status !== 'active') {
      setTimeout(() => {
        setIsLoading(false);
        setError(t.login_account_not_active);
      }, 600);
      return;
    }
    finalizeSession(user, () => setIsLoading(false));
  }, [staffName, password, isLoading, users, finalizeSession, t]);

  const handleDeviceLogin = useCallback(async () => {
    if (!webAuthnOk || deviceLoading || isLoading || linkDeviceLoading) return;
    setError('');
    setDeviceSuccess('');
    setDeviceLoading(true);
    try {
      const userId = await authenticatePinUnlockAndResolveUserId();
      if (!userId) {
        setError(t.login_device_failed);
        setDeviceLoading(false);
        return;
      }
      const user = users.find((u) => u.id === userId && u.status === 'active');
      if (!user) {
        setError(t.login_device_no_user);
        setDeviceLoading(false);
        return;
      }
      finalizeSession(user, () => setDeviceLoading(false));
    } catch {
      setError(t.login_device_failed);
      setDeviceLoading(false);
    }
  }, [webAuthnOk, deviceLoading, isLoading, linkDeviceLoading, users, finalizeSession, t]);

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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-accent/5 flex flex-col items-center justify-center p-6 safe-area-pad font-sans antialiased"
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full max-w-lg"
      >
        {/* Logo — protagonista visivo: più spazio e tipografia grande */}
        <div className="flex flex-col items-center mb-5 sm:mb-6 min-h-[min(260px,46vh)] sm:min-h-[min(300px,50vh)] justify-center py-8 sm:py-10">
          <div className="w-[7.25rem] h-[7.25rem] sm:w-32 sm:h-32 rounded-[1.75rem] bg-accent/10 flex items-center justify-center mb-7 sm:mb-8 shadow-md ring-1 ring-accent/10">
            <Clock className="w-[2.35rem] h-[2.35rem] sm:w-16 sm:h-16 text-accent" strokeWidth={1.65} />
          </div>
          <h1 className="font-logo-snell text-[2.1rem] leading-none sm:text-6xl text-accent tracking-tight mb-3 sm:mb-4 text-center px-1">
            Osteria Basilico
          </h1>
          <p className="text-slate-500 text-lg sm:text-xl font-medium text-center px-3 max-w-md">
            {t.header_tagline ?? 'Staff Management'}
          </p>
        </div>

        {/* Scheda login — compatta e più stretta del blocco superiore */}
        <div className="w-full max-w-[17.5rem] sm:max-w-xs mx-auto bg-white rounded-xl shadow-md border border-slate-100/90 p-3 sm:p-3.5 space-y-2.5">

          <div className="mb-0">
            <h2 className="text-sm font-bold text-slate-800 leading-tight">
              {t.login_welcome ?? 'Bentornato'}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
              {t.login_subtitle ?? 'Accedi con le tue credenziali'}
            </p>
          </div>

          {isInviteLink && (
            <div className="rounded-lg border border-accent/25 bg-accent/5 px-2.5 py-2 text-xs text-slate-700 space-y-1">
              <p className="font-semibold text-slate-800">{t.login_invite_banner}</p>
              {inviteUserId && !linkedUser && users.length > 0 && (
                <p className="text-xs text-amber-800">
                  {(t as { login_invite_user_unknown?: string }).login_invite_user_unknown}
                </p>
              )}
              {linkedUser && linkedUser.status !== 'active' && (
                <p className="text-xs text-amber-800">
                  {(t as { admin_employee_access_link_inactive?: string }).admin_employee_access_link_inactive}
                </p>
              )}
            </div>
          )}

          {/* Nome */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
              {t.login_name_label}
            </label>
            <div className="relative">
              <UserIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" aria-hidden />
              <input
                ref={staffNameInputRef}
                type="text"
                inputMode="text"
                autoCapitalize="words"
                value={staffName}
                onChange={(e) => { setStaffName(e.target.value); setError(''); setDeviceSuccess(''); }}
                onKeyDown={handleKeyDown}
                placeholder={t.login_name_ph}
                autoComplete="name"
                autoFocus={!isInviteLink}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-xs placeholder:text-[11px] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50 transition-all"
              />
            </div>
          </div>

          {/* PIN */}
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-600 uppercase tracking-wide">
              {t.login_password_label ?? 'Password'}
            </label>
            <div className="relative">
              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
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
                placeholder="••••"
                style={!showPassword ? ({ WebkitTextSecurity: 'disc' } as CSSProperties) : undefined}
                className="w-full pl-9 pr-9 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800 text-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/25 focus:border-accent/50 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-600 text-[11px] font-medium text-center bg-red-50 rounded-lg px-2 py-1.5 leading-snug"
            >
              {error}
            </motion.p>
          )}

          {deviceSuccess && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-accent text-[11px] font-medium text-center bg-accent/10 rounded-lg px-2 py-1.5 border border-accent/20 leading-snug"
            >
              {deviceSuccess}
            </motion.p>
          )}

          {/* Login button */}
          <button
            ref={loginBtnRef}
            type="button"
            onClick={handleLogin}
            disabled={!staffName.trim() || !password.trim() || isLoading || deviceLoading || linkDeviceLoading}
            className="w-full py-2 rounded-lg bg-accent text-white font-semibold text-xs hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              t.login_btn ?? 'Accedi'
            )}
          </button>

          {showDeviceSection && (
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center gap-2 text-slate-400 text-[10px] font-semibold uppercase tracking-wider">
                <span className="h-px flex-1 bg-slate-200" aria-hidden />
                <span>{t.login_device_or}</span>
                <span className="h-px flex-1 bg-slate-200" aria-hidden />
              </div>

              {hasDeviceLogin && (
                <button
                  type="button"
                  onClick={handleDeviceLogin}
                  disabled={deviceLoading || isLoading || linkDeviceLoading}
                  className="w-full py-2 rounded-lg border-2 border-accent/35 bg-accent/5 text-accent font-semibold text-xs hover:bg-accent/10 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {deviceLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Fingerprint className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden />
                  )}
                  <span className="text-center leading-tight">{t.login_device_btn}</span>
                </button>
              )}

              {canShowLinkDevice && (
                <button
                  type="button"
                  onClick={handleLinkDevice}
                  disabled={linkDeviceLoading || isLoading || deviceLoading}
                  title={t.login_device_link_title}
                  className="w-full py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {linkDeviceLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : null}
                  {t.login_device_link_btn}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Kiosk link */}
        <p className="text-center text-xs text-slate-500 mt-4">
          {t.login_kiosk_hint ?? 'Stai timbrando?'}{' '}
          <Link
            to={PATH_TIMBRATURA}
            className="text-accent font-semibold hover:text-accent-hover transition-colors"
          >
            {t.login_kiosk_link ?? 'Vai al Kiosk →'}
          </Link>
        </p>
      </motion.div>
    </motion.div>
  );
}
