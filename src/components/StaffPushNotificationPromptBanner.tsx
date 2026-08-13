import { useEffect, useState } from 'react';
import { useT } from '../hooks/useT';
import { Bell, Loader2 } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import type { Language } from '../types';

type Props = {
  userId: string;
  effectiveLanguage: Language;
};

export function StaffPushNotificationPromptBanner({ userId, effectiveLanguage: _effectiveLanguage }: Props) {
  const t = useT();
  const [perm, setPerm] = useState<NotificationPermission>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );

  const { requestNotificationPermission, isLoading, isPushNotificationSupported } = usePushNotifications(userId, {
    enableAutoSubscribe: false,
  });

  useEffect(() => {
    const sync = () => {
      if (typeof Notification !== 'undefined') setPerm(Notification.permission);
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  if (!isPushNotificationSupported) return null;
  if (perm === 'granted') return null;
  if (perm !== 'default' && perm !== 'denied') return null;

  const isDenied = perm === 'denied';

  return (
    <div
      role="status"
      className="mx-4 mb-3 flex items-start gap-2.5 rounded-xl px-3 py-2.5"
      style={{
        background: 'rgba(245,158,11,0.15)',
        border: '1px solid rgba(245,158,11,0.4)',
      }}
    >
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: 'rgba(245,158,11,0.2)', color: '#fbbf24' }}
      >
        <Bell className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="text-[11px] uppercase tracking-wide"
          style={{ color: '#fbbf24', fontWeight: 600 }}
        >
          {t.staff_push_banner_title}
        </p>
        <p
          className="mt-0.5 text-[11px] leading-snug"
          style={{ color: '#ffffff' }}
        >
          {isDenied ? t.staff_push_banner_body_denied : t.staff_push_banner_body_default}
        </p>
        {!isDenied && (
          <button
            type="button"
            disabled={isLoading}
            onClick={() => void requestNotificationPermission().then(() => {
              if (typeof Notification !== 'undefined') setPerm(Notification.permission);
            })}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white disabled:opacity-50 transition-opacity"
            style={{ background: 'rgba(245,158,11,0.55)' }}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
            {t.staff_push_banner_cta}
          </button>
        )}
      </div>
    </div>
  );
}
