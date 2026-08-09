/**
 * OnboardingSetupModal – modale di prima configurazione obbligatoria.
 * Appare quando l'utente è loggato ma email o telefono sono vuoti.
 * Non può essere chiusa senza completare tutti i campi.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, Lock, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useMultisensorialFeedback } from '../hooks/useMultisensorialFeedback';
import FlowLogo from './FlowLogo';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function isValidPhone(v: string) {
  return /^[+\d\s\-().]{6,20}$/.test(v.trim());
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingSetupModalProps {
  onComplete: () => void;
}

export default function OnboardingSetupModal({ onComplete }: OnboardingSetupModalProps) {
  const { currentUser, updateUser, effectiveLanguage } = useAppUser();
  const { triggerHapticFeedback, playNotificationSound } = useMultisensorialFeedback();

  const [email, setEmail] = useState(currentUser?.email ?? '');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const [touched, setTouched] = useState({ email: false, phone: false, pin: false, confirmPin: false });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const emailRef = useRef<HTMLInputElement>(null);

  // Focus automatico al primo campo
  useEffect(() => {
    const t = setTimeout(() => emailRef.current?.focus(), 400);
    return () => clearTimeout(t);
  }, []);

  // ── Validazioni ──────────────────────────────────────────────────────────────

  const emailError = touched.email && !isValidEmail(email)
    ? email.trim() === '' ? 'Inserisci la tua email personale' : 'Formato email non valido'
    : '';

  const phoneError = touched.phone && !isValidPhone(phone)
    ? phone.trim() === '' ? 'Inserisci il tuo numero di telefono' : 'Numero non valido (min 6 cifre)'
    : '';

  const pinError = touched.pin && newPin.replace(/\D/g, '').length !== 4
    ? 'Il PIN deve essere di 4 cifre'
    : touched.pin && newPin === currentUser?.pin
    ? 'Scegli un PIN diverso da quello iniziale'
    : '';

  const confirmPinError = touched.confirmPin && confirmPin !== newPin
    ? 'I PIN non coincidono'
    : '';

  const pinDigits = newPin.replace(/\D/g, '');
  const isFormValid =
    isValidEmail(email) &&
    isValidPhone(phone) &&
    pinDigits.length === 4 &&
    newPin !== currentUser?.pin &&
    confirmPin === newPin;

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handlePinInput = useCallback((val: string, setter: (v: string) => void) => {
    const digits = val.replace(/\D/g, '').slice(0, 4);
    setter(digits);
  }, []);

  const handleSave = useCallback(async () => {
    setTouched({ email: true, phone: true, pin: true, confirmPin: true });
    if (!isFormValid || !currentUser) return;

    setSaving(true);
    setSaveError('');

    try {
      const ok = await updateUser(currentUser.id, {
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        pin: pinDigits,
      });

      if (ok) {
        setSaved(true);
        triggerHapticFeedback('success');
        await playNotificationSound();
        // Piccola pausa per mostrare il feedback visivo
        setTimeout(() => onComplete(), 1200);
      } else {
        setSaveError('Errore nel salvataggio. Riprova.');
        triggerHapticFeedback('error');
      }
    } catch {
      setSaveError('Errore di rete. Controlla la connessione.');
      triggerHapticFeedback('error');
    } finally {
      setSaving(false);
    }
  }, [isFormValid, currentUser, email, phone, pinDigits, updateUser, triggerHapticFeedback, playNotificationSound, onComplete]);

  // Enter su ultimo campo → salva
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isFormValid) handleSave();
  }, [isFormValid, handleSave]);

  // ── UI ────────────────────────────────────────────────────────────────────────

  const firstName = currentUser?.first_name ?? '';
  const lang = effectiveLanguage;
  const greeting = lang === 'it' ? `Ciao, ${firstName}!`
    : lang === 'es' ? `¡Hola, ${firstName}!`
    : lang === 'fr' ? `Bonjour, ${firstName} !`
    : `Welcome, ${firstName}!`;

  const subtitle = lang === 'it'
    ? 'Completa il tuo profilo per accedere all\'app. Questi dati sono richiesti una sola volta.'
    : lang === 'es'
    ? 'Completa tu perfil para acceder a la app. Estos datos se solicitan solo una vez.'
    : lang === 'fr'
    ? 'Complète ton profil pour accéder à l\'app. Ces données ne sont demandées qu\'une seule fois.'
    : 'Complete your profile to access the app. This is required only once.';

  const ctaLabel = lang === 'it' ? 'CONFIGURA ACCOUNT'
    : lang === 'es' ? 'CONFIGURAR CUENTA'
    : lang === 'fr' ? 'CONFIGURER LE COMPTE'
    : 'SET UP ACCOUNT';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[11000] flex flex-col items-center justify-start overflow-y-auto font-sans"
      style={{
        background: 'transparent',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="relative mx-auto flex w-full max-w-7xl flex-col min-h-full px-4 py-safe">
        <div className="mx-auto w-full max-w-md flex flex-col min-h-full">
        {/* Header FLOW */}
        <div className="bg-white rounded-3xl shadow-2xl shadow-black/30 p-6 -mb-6 text-center relative z-10">
          {/* Logo FLOW */}
          <div className="mb-6 flex justify-center">
            <FlowLogo size={38} subtitle="Work in Motion" colorScheme="white" />
          </div>

          <h1 className="text-2xl font-bold tracking-tight mb-2 text-gray-900">{greeting}</h1>
          <p className="text-sm text-gray-600 leading-relaxed max-w-xs mx-auto">{subtitle}</p>
        </div>

        {/* Card form */}
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
          className="bg-white rounded-3xl shadow-2xl shadow-black/30 p-6 mb-8"
        >
          {saved ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center justify-center gap-4 py-8 text-center"
            >
              <div className="w-16 h-16 rounded-full bg-brand-deep/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-brand-deep" strokeWidth={2} />
              </div>
              <p className="text-lg font-bold text-white">
                {lang === 'it' ? 'Profilo configurato!' : lang === 'es' ? '¡Perfil configurado!' : lang === 'fr' ? 'Profil configuré !' : 'Profile set up!'}
              </p>
              <p className="text-sm text-white/60">
                {lang === 'it' ? 'Accesso in corso…' : 'Loading…'}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-5">
              {/* EMAIL */}
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">
                  <Mail className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-brand-deep" />
                  {lang === 'it' ? 'Email personale' : lang === 'es' ? 'Email personal' : lang === 'fr' ? 'Email personnelle' : 'Personal email'}
                </label>
                <input
                  ref={emailRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, email: true }))}
                  onKeyDown={handleKeyDown}
                  placeholder={lang === 'it' ? 'Inserisci la tua email…' : 'Enter your email…'}
                  className={`w-full rounded-xl border px-4 py-3 text-base font-medium transition-colors outline-none bg-white/10 text-white placeholder:text-white/40 focus:ring-2 focus:ring-accent/30 focus:border-accent ${
 emailError ? 'border-red-400 bg-red-50/50' : 'border-white/20'
 }`}
                />
                {emailError && (
                  <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {emailError}
                  </p>
                )}
              </div>

              {/* TELEFONO */}
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">
                  <Phone className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-brand-deep" />
                  {lang === 'it' ? 'Numero di telefono' : lang === 'es' ? 'Número de teléfono' : lang === 'fr' ? 'Numéro de téléphone' : 'Phone number'}
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setTouched((p) => ({ ...p, phone: true }))}
                  onKeyDown={handleKeyDown}
                  placeholder={lang === 'it' ? 'Es. +39 333 1234567' : lang === 'es' ? 'Ej. +34 600 000000' : '+1 555 000 0000'}
                  className={`w-full rounded-xl border px-4 py-3 text-base font-medium transition-colors outline-none bg-white/10 text-white placeholder:text-white/40 focus:ring-2 focus:ring-accent/30 focus:border-accent ${
 phoneError ? 'border-red-400 bg-red-50/50' : 'border-white/20'
 }`}
                />
                {phoneError && (
                  <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {phoneError}
                  </p>
                )}
              </div>

              {/* DIVIDER */}
              <div className="border-t border-white/10" />

              {/* NUOVO PIN */}
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">
                  <Lock className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-brand-deep" />
                  {lang === 'it' ? 'Nuovo PIN (4 cifre)' : lang === 'es' ? 'Nuevo PIN (4 dígitos)' : lang === 'fr' ? 'Nouveau PIN (4 chiffres)' : 'New PIN (4 digits)'}
                </label>
                <div className="flex gap-2.5 justify-center">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 text-xl font-bold transition-colors select-none ${
 pinDigits.length > i
 ? 'border-brand-deep bg-brand-deep/8 text-brand-deep'
 : pinError
 ? 'border-red-300 bg-red-50/50'
 : 'border-white/20 bg-white/10'
 }`}
                    >
                      {pinDigits.length > i ? '●' : ''}
                    </div>
                  ))}
                </div>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => { handlePinInput(e.target.value, setNewPin); setTouched((p) => ({ ...p, pin: true })); }}
                  onKeyDown={handleKeyDown}
                  className="sr-only"
                  aria-label="Nuovo PIN"
                />
                {/* Tastiera numerica visuale */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      disabled={!k}
                      onClick={() => {
                        if (k === '⌫') {
                          setNewPin((p) => p.slice(0, -1));
                        } else if (k && pinDigits.length < 4) {
                          const next = pinDigits + k;
                          setNewPin(next);
                          setTouched((p) => ({ ...p, pin: true }));
                        }
                      }}
                      className={`flex h-11 items-center justify-center rounded-xl text-base font-semibold transition-colors touch-manipulation select-none ${
 !k
 ? 'pointer-events-none opacity-0'
 : k === '⌫'
 ? 'bg-white/10 text-white/70 hover:bg-white/20'
 : 'bg-white/10 text-white hover:bg-accent/20 hover:text-accent'
 }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                {pinError && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1 justify-center">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {pinError}
                  </p>
                )}
              </div>

              {/* CONFERMA PIN */}
              <div>
                <label className="block text-xs font-semibold text-white/60 uppercase tracking-wide mb-1.5">
                  <Lock className="inline w-3.5 h-3.5 mr-1 -mt-0.5 text-white/45" />
                  {lang === 'it' ? 'Conferma PIN' : lang === 'es' ? 'Confirmar PIN' : lang === 'fr' ? 'Confirmer le PIN' : 'Confirm PIN'}
                </label>
                <div className="flex gap-2.5 justify-center">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl border-2 text-xl font-bold transition-colors select-none ${
 confirmPin.length > i
 ? confirmPin === newPin.slice(0, confirmPin.length)
 ? 'border-[#00C896] bg-[#00C896]/8 text-[#00C896]'
 : 'border-red-400 bg-red-50/50 text-red-500'
 : confirmPinError
 ? 'border-red-300 bg-red-50/50'
 : 'border-white/20 bg-white/10'
 }`}
                    >
                      {confirmPin.length > i ? '●' : ''}
                    </div>
                  ))}
                </div>
                {/* Tastiera numerica conferma */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      disabled={!k}
                      onClick={() => {
                        if (k === '⌫') {
                          setConfirmPin((p) => p.slice(0, -1));
                        } else if (k && confirmPin.length < 4) {
                          setConfirmPin(confirmPin + k);
                          setTouched((t) => ({ ...t, confirmPin: true }));
                        }
                      }}
                      className={`flex h-11 items-center justify-center rounded-xl text-base font-semibold transition-colors touch-manipulation select-none ${
 !k
 ? 'pointer-events-none opacity-0'
 : k === '⌫'
 ? 'bg-white/10 text-white/70 hover:bg-white/20'
 : 'bg-white/10 text-white hover:bg-[#00C896]/20 hover:text-[#00C896]'
 }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
                {confirmPinError && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1 justify-center">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    {confirmPinError}
                  </p>
                )}
              </div>

              {/* Errore salvataggio */}
              {saveError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {saveError}
                </div>
              )}

              {/* CTA Button */}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !isFormValid}
                className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 text-sm font-bold tracking-wide uppercase text-white transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: isFormValid
                    ? 'linear-gradient(135deg, rgb(0, 26, 128) 0%, #001266 100%)'
                    : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
                  boxShadow: isFormValid ? '0 4px 20px rgba(0,26,128,0.35)' : 'none',
                }}
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    {ctaLabel}
                  </>
                )}
              </button>

              {/* Note privacy */}
              <p className="text-center text-[11px] text-white/45 leading-relaxed">
                {lang === 'it'
                  ? 'I tuoi dati sono cifrati e utilizzati solo per identificarti nell\'app.'
                  : lang === 'es'
                  ? 'Tus datos están cifrados y solo se usan para identificarte en la app.'
                  : 'Your data is encrypted and used only to identify you in the app.'}
              </p>
            </div>
          )}
        </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
