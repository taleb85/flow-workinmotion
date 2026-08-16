import { Bell, BellOff, Loader2, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { useT } from '../hooks/useT';

interface NotificationPermissionButtonProps {
  compact?: boolean;
  userId?: string;
}

export function NotificationPermissionButton({
  compact = false,
  userId,
}: NotificationPermissionButtonProps) {
  const t = useT();
  const {
    notificationPermission,
    isSubscribed,
    isLoading,
    error,
    savedOk,
    requestNotificationPermission,
    unsubscribeFromPushNotifications,
    isPushNotificationSupported,
  } = usePushNotifications(userId);

  // Browser che non supporta push (es. Safari < 16, Firefox su iOS)
  if (!isPushNotificationSupported) {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 text-xs font-medium text-white/60 bg-slate-50 rounded-lg border border-slate-100">
        <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        <span>{t.notif_push_not_supported}</span>
      </div>
    );
  }

  // Permesso bloccato esplicitamente dall'utente
  if (notificationPermission === 'denied') {
    return (
      <div className="flex items-start gap-2 px-3 py-2.5 text-xs font-semibold text-red-700 bg-red-50 rounded-lg border border-red-200">
        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <span>{t.notif_push_blocked}</span>
          <span className="font-normal text-red-600">
            {t.notif_push_blocked_hint}
          </span>
        </div>
      </div>
    );
  }

  const handleToggle = async () => {
    if (isSubscribed) {
      await unsubscribeFromPushNotifications();
    } else {
      await requestNotificationPermission();
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        title={isSubscribed ? t.notif_push_active_title : t.notif_push_activate_title}
        className={`inline-flex items-center justify-center h-10 w-10 rounded-lg transition-colors disabled:opacity-50 ${
 isSubscribed
 ? 'bg-brand-100 text-brand-700'
 : 'bg-slate-100 text-white/80'
 } hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : isSubscribed ? (
          <Bell className="h-5 w-5" />
        ) : (
          <BellOff className="h-5 w-5" />
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isLoading}
        className={`flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
 isSubscribed
 ? 'bg-brand-50 text-brand-700 border-brand-200'
 : 'bg-slate-100 text-white/80 border-slate-200 hover:bg-slate-200'
 } active:bg-slate-200'/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isSubscribed ? (
          <Bell className="h-4 w-4" />
        ) : (
          <BellOff className="h-4 w-4" />
        )}
        <span>{isSubscribed ? (t.notif_push_deactivate ?? 'Disattiva Notifiche') : (t.notif_push_activate ?? 'Attiva Notifiche')}</span>
        {isSubscribed && savedOk && (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 ml-auto" />
        )}
      </button>

      {/* Stato corrente */}
      <div className="flex items-center gap-3 px-1">
        {/* Permesso browser (qui non è mai "denied": già gestito sopra) */}
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full flex-shrink-0 ${
 notificationPermission === 'granted' ? 'bg-green-500' : 'bg-amber-400'
 }`}
          />
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-white/50">
            {notificationPermission === 'granted'
              ? (t.notif_permission_granted ?? 'Permesso concesso')
              : (t.notif_permission_not_requested ?? 'Permesso non richiesto')}
          </span>
        </div>
        <span className="text-slate-200 text-xs">·</span>
        {/* Iscrizione push */}
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${isSubscribed ? 'bg-green-500' : 'bg-slate-300'}`} />
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-white/50">
            {isSubscribed
              ? (t.notif_subscribed ?? 'Iscritto')
              : (t.notif_not_subscribed ?? 'Non iscritto')}
          </span>
        </div>
      </div>

      {/* Conferma salvataggio */}
      {isSubscribed && savedOk && (
        <div className="flex items-center gap-1.5 text-[0.6875rem] font-medium text-green-600">
          <CheckCircle2 className="h-3 w-3" />
          <span>{t.notif_push_saved}</span>
        </div>
      )}

      {/* Errore */}
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Suggerimento iniziale */}
      {notificationPermission === 'default' && !isSubscribed && (
        <p className="text-[0.6875rem] text-white/60 leading-relaxed">
          {t.notif_push_hint}
        </p>
      )}
    </div>
  );
}
