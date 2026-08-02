/**
 * Modal gate bloccante: richiede notifiche + posizione all'avvio.
 * Non si può proseguire finché i permessi necessari non sono concessi:
 * se manca un consenso, l'app non si avvia.
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, MapPin, CheckCircle, ChevronRight, Settings, ShieldAlert } from 'lucide-react';
import { markPermissionModalAsked } from './permissionModalEligibility';
import { ensurePushSubscription } from '../hooks/usePushNotifications';

interface PermissionRequestModalProps {
  onDone: () => void;
  userId?: string;
}

export default function PermissionRequestModal({ onDone, userId }: PermissionRequestModalProps) {
  const [notifStatus, setNotifStatus] = useState<NotificationPermission>('default');
  const [locationStatus, setLocationStatus] = useState<PermissionState | 'unsupported'>('prompt');
  const [notifLoading, setNotifLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushSubLoading, setPushSubLoading] = useState(false);
  const [pushSubError, setPushSubError] = useState<string | null>(null);

  // Supporto browser: permessi non supportati NON bloccano l'avvio
  const notifSupported = 'Notification' in window;
  const locSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    if (notifSupported) setNotifStatus(Notification.permission);
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(r => setLocationStatus(r.state)).catch(() => {});
    }
  }, [notifSupported]);

  // All'apertura: se il permesso è GIÀ concesso ma la subscription manca,
  // avviala subito (senza dover cliccare nulla). Questo copre il caso
  // "Permesso concesso" + "Non iscritto" che lasciava l'utente bloccato.
  useEffect(() => {
    if (!notifSupported || !userId) return;
    if (Notification.permission !== 'granted') return;
    let cancelled = false;
    setPushSubLoading(true);
    setPushSubError(null);
    ensurePushSubscription(userId)
      .then((ok) => {
        if (cancelled) return;
        setPushSubscribed(ok);
        if (!ok) setPushSubError('Iscrizione non riuscita — tocca la card per riprovare');
      })
      .catch(() => {
        if (!cancelled) setPushSubError('Iscrizione non riuscita — tocca la card per riprovare');
      })
      .finally(() => {
        if (!cancelled) setPushSubLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notifSupported, userId]);

  const handleNotif = async () => {
    if (!notifSupported || notifStatus === 'denied') return;
    setNotifLoading(true);
    setPushSubError(null);
    try {
      // 1. Permesso: se non è ancora concesso, richiedilo
      if (notifStatus !== 'granted') {
        const result = await Notification.requestPermission();
        setNotifStatus(result);
        if (result !== 'granted') {
          setNotifLoading(false);
          return;
        }
      }
      // 2. Permesso ok (appena concesso o già dato) → crea la subscription
      if (userId) {
        setPushSubLoading(true);
        const ok = await ensurePushSubscription(userId);
        setPushSubscribed(ok);
        if (!ok) setPushSubError('Iscrizione non riuscita — riprova');
        setPushSubLoading(false);
      }
    } catch {
      setPushSubError('Errore durante l’attivazione — riprova');
    }
    setNotifLoading(false);
  };

  const handleLocation = () => {
    if (!locSupported || locationStatus === 'granted' || locationStatus === 'denied') return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      () => { setLocationStatus('granted'); setLocationLoading(false); },
      () => { setLocationStatus('denied'); setLocationLoading(false); },
      { enableHighAccuracy: false, timeout: 15000 },
    );
  };

  const notifGranted = !notifSupported || notifStatus === 'granted';
  const notifDenied = notifSupported && notifStatus === 'denied';
  const locGranted = !locSupported || locationStatus === 'granted';
  const locDenied = locSupported && locationStatus === 'denied';

  // Su iPhone le notifiche web richiedono l'app installata (PWA): senza,
  // il prompt non appare mai → guidiamo all'installazione.
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  const isStandalone =
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
  const notifNeedsInstall = notifSupported && !notifGranted && isIOS && !isStandalone;

  // La subscription push è necessaria solo se le notifiche sono supportate e c'è un utente
  const pushRequired = notifSupported && !!userId;
  const pushActive = !pushRequired || pushSubscribed;

  // Tutti i permessi necessari concessi → si può proseguire
  const canProceed = notifGranted && locGranted && pushActive;

  const handleContinua = () => {
    if (!canProceed) return;
    markPermissionModalAsked();
    onDone();
  };

  const missingCount = [notifGranted, locGranted, pushActive].filter((ok) => !ok).length;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-app-bg/95 shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 pt-6 pb-4 text-center border-b border-white/10">
          <p className="text-xs font-semibold text-white/50 uppercase tracking-widest mb-1">Prima di iniziare</p>
          <h2 className="text-base font-bold text-white/90 font-sans">
            Abilita le funzionalità
          </h2>
          <p className="text-xs text-white/60 mt-1">
            Per continuare devi consentire notifiche e posizione
          </p>
        </div>

        {/* Cards */}
        <div className="px-4 py-4 space-y-3">
          {/* Notifiche */}
          <button
            type="button"
            onClick={() => void handleNotif()}
            disabled={notifDenied || notifLoading || pushSubLoading || (notifGranted && pushActive)}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all active:scale-[0.98] border
              ${notifGranted && pushActive
                ? 'bg-emerald-500/20 border-emerald-500/40'
                : notifDenied
                ? 'bg-rose-500/10 border-rose-500/40'
                : 'bg-white/8 border-neutral-500 hover:bg-white/12 hover:border-white/25 cursor-pointer'
              }`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
              ${notifGranted && pushActive ? 'bg-emerald-500/25' : notifDenied ? 'bg-rose-500/25' : 'bg-blue-500/20'}`}>
              {notifGranted && pushActive
                ? <CheckCircle className="h-5 w-5 text-emerald-400" />
                : notifDenied
                ? <ShieldAlert className="h-5 w-5 text-rose-400" />
                : <Bell className="h-5 w-5 text-blue-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/90">Notifiche</p>
              <p className="text-xs text-white/60 mt-0.5">
                {notifGranted && pushActive
                  ? 'Attivate · Iscritto'
                  : notifDenied
                  ? 'Bloccate — abilita dalle impostazioni'
                  : notifLoading
                  ? 'In attesa…'
                  : pushSubLoading
                  ? 'Attivazione in corso…'
                  : notifGranted && pushRequired
                  ? 'Permesso dato — tocca per completare l’iscrizione'
                  : notifGranted
                  ? 'Attivate'
                  : 'Turni, messaggi e avvisi in tempo reale'}
              </p>
            </div>
            {!notifGranted && !notifDenied && (
              <ChevronRight className="h-4 w-4 text-white/50 shrink-0" />
            )}
            {notifGranted && pushRequired && !pushActive && !pushSubLoading && (
              <ChevronRight className="h-4 w-4 text-white/50 shrink-0" />
            )}
          </button>

          {/* Errore iscrizione */}
          {pushSubError && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5">
              <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-rose-200/90">{pushSubError}</p>
            </div>
          )}

          {/* Posizione */}
          <button
            type="button"
            onClick={handleLocation}
            disabled={locGranted || locDenied || locationLoading}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all active:scale-[0.98] border
              ${locGranted
                ? 'bg-emerald-500/20 border-emerald-500/40'
                : locDenied
                ? 'bg-rose-500/10 border-rose-500/40'
                : 'bg-white/8 border-neutral-500 hover:bg-white/12 hover:border-white/25 cursor-pointer'
              } hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
              ${locGranted ? 'bg-emerald-500/25' : locDenied ? 'bg-rose-500/25' : 'bg-emerald-500/20'}`}>
              {locGranted
                ? <CheckCircle className="h-5 w-5 text-emerald-400" />
                : locDenied
                ? <ShieldAlert className="h-5 w-5 text-rose-400" />
                : <MapPin className="h-5 w-5 text-emerald-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/90">Posizione</p>
              <p className="text-xs text-white/60 mt-0.5">
                {locGranted ? 'Consentita' : locDenied ? 'Bloccata — abilita dalle impostazioni' : locationLoading ? 'In attesa…' : 'Necessaria per il timbratore con verifica area'}
              </p>
            </div>
            {!locGranted && !locDenied && (
              <ChevronRight className="h-4 w-4 text-white/50 shrink-0" />
            )}
          </button>

          {/* Avviso permessi bloccati o installazione richiesta */}
          {(notifDenied || locDenied || notifNeedsInstall) && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
              <Settings className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[11px] leading-relaxed text-amber-200/90">
                {notifNeedsInstall ? (
                  <>
                    Per ricevere le notifiche su iPhone devi installare l’app: Safari → <b>Condividi</b> → <b>Aggiungi alla schermata Home</b>. Poi riapri l’app da lì e dai il consenso alle notifiche.
                  </>
                ) : (
                  <>
                    {notifDenied && locDenied
                      ? 'Notifiche e posizione sono bloccate. '
                      : notifDenied
                      ? 'Le notifiche sono bloccate. '
                      : 'La posizione è bloccata. '}
                    Vai nelle impostazioni del dispositivo (Safari/Chrome → Impostazioni sito web o Notifiche) e abilita {notifDenied && locDenied ? 'entrambi' : 'il permesso'}, poi torna qui.
                  </>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 pb-5">
          <button
            type="button"
            onClick={handleContinua}
            disabled={!canProceed}
            className={`w-full rounded-xl py-3 text-sm font-bold text-white transition-all active:scale-[0.98]
              ${canProceed
                ? 'bg-blue-600 hover:bg-blue-500 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]'
                : 'bg-white/10 text-white/40 cursor-not-allowed'
              }`}
          >
            {canProceed ? 'Continua' : missingCount > 1 ? 'Consenti i 2 permessi per continuare' : 'Consenti il permesso per continuare'}
          </button>
          <p className="text-center text-[11px] text-white/50 mt-2">
            {canProceed
              ? 'Ora puoi entrare nell’app'
              : 'L’app non si avvia finché notifiche e posizione non sono consentite'}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
