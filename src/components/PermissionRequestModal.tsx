/**
 * Modal che chiede notifiche + posizione al primo accesso.
 * Mostrato una volta sola per dispositivo (flag in localStorage).
 */
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, MapPin, CheckCircle, ChevronRight } from 'lucide-react';
import { markPermissionModalAsked } from './permissionModalEligibility';

function _isPermissionNeeded(p: NotificationPermission | PermissionState | undefined) {
  return p === 'default' || p === 'prompt' || p === undefined;
}

interface PermissionRequestModalProps {
  onDone: () => void;
}

export default function PermissionRequestModal({ onDone }: PermissionRequestModalProps) {
  const [notifStatus, setNotifStatus] = useState<NotificationPermission>('default');
  const [locationStatus, setLocationStatus] = useState<PermissionState | 'unsupported'>('prompt');
  const [notifLoading, setNotifLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    // Leggi stati correnti
    if ('Notification' in window) setNotifStatus(Notification.permission);
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(r => setLocationStatus(r.state)).catch(() => {});
    }
  }, []);

  const handleNotif = async () => {
    if (notifStatus === 'granted' || notifStatus === 'denied') return;
    setNotifLoading(true);
    try {
      const result = await Notification.requestPermission();
      setNotifStatus(result);
    } catch { /* ignore */ }
    setNotifLoading(false);
  };

  const handleLocation = () => {
    if (locationStatus === 'granted' || locationStatus === 'denied') return;
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      () => { setLocationStatus('granted'); setLocationLoading(false); },
      () => { setLocationStatus('denied'); setLocationLoading(false); },
      { enableHighAccuracy: false, timeout: 15000 },
    );
  };

  const handleContinua = () => {
    markPermissionModalAsked();
    onDone();
  };

  const notifGranted = notifStatus === 'granted';
  const notifDenied = notifStatus === 'denied';
  const locGranted = locationStatus === 'granted';
  const locDenied = locationStatus === 'denied';

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
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
            Per ricevere avvisi e usare il timbratore con posizione
          </p>
        </div>

        {/* Cards */}
        <div className="px-4 py-4 space-y-3">
          {/* Notifiche */}
          <button
            type="button"
            onClick={() => void handleNotif()}
            disabled={notifGranted || notifDenied || notifLoading}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all active:scale-[0.98] border
              ${notifGranted
                ? 'bg-emerald-500/20 border-emerald-500/40'
                : notifDenied
                ? 'bg-white/5 border-white/10 opacity-50 cursor-not-allowed'
                : 'bg-white/8 border-neutral-500 hover:bg-white/12 hover:border-white/25 cursor-pointer'
              }`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
              ${notifGranted ? 'bg-emerald-500/25' : 'bg-blue-500/20'}`}>
              {notifGranted
                ? <CheckCircle className="h-5 w-5 text-emerald-400" />
                : <Bell className="h-5 w-5 text-blue-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white/90">Notifiche</p>
              <p className="text-xs text-white/60 mt-0.5">
                {notifGranted ? 'Attivate' : notifDenied ? 'Bloccate — abilita dalle impostazioni' : notifLoading ? 'In attesa…' : 'Turni, messaggi e avvisi in tempo reale'}
              </p>
            </div>
            {!notifGranted && !notifDenied && (
              <ChevronRight className="h-4 w-4 text-white/50 shrink-0" />
            )}
          </button>

          {/* Posizione */}
          <button
            type="button"
            onClick={handleLocation}
            disabled={locGranted || locDenied || locationLoading}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3.5 text-left transition-all active:scale-[0.98] border
              ${locGranted
                ? 'bg-emerald-500/20 border-emerald-500/40'
                : locDenied
                ? 'bg-white/5 border-white/10 opacity-50 cursor-not-allowed'
                : 'bg-white/8 border-neutral-500 hover:bg-white/12 hover:border-white/25 cursor-pointer'
              } hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}
          >
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
              ${locGranted ? 'bg-emerald-500/25' : 'bg-emerald-500/20'}`}>
              {locGranted
                ? <CheckCircle className="h-5 w-5 text-emerald-400" />
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
        </div>

        {/* Footer */}
        <div className="px-4 pb-5">
          <button
            type="button"
            onClick={handleContinua}
            className="w-full rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] py-3 text-sm font-bold text-white transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          >
            Continua
          </button>
          <p className="text-center text-[11px] text-white/50 mt-2">
            Puoi modificare questi permessi in qualsiasi momento dalle impostazioni del dispositivo
          </p>
        </div>
      </motion.div>
    </div>
  );
}
