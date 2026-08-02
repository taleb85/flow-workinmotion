import { useEffect, useCallback, useState, useRef } from 'react';

/**
 * Chiave pubblica VAPID per Web Push.
 * La chiave privata è conservata come segreto Supabase (VAPID_PRIVATE_KEY).
 */
const VAPID_PUBLIC_KEY = 'BIcuwW889Xi8wQ_4s323vl86eCIYDxsjQNilZBY_q-XcDy-Nrjx3xPMq7TMJp1pbToofg7rk9zHOdctAlMrKB7k';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Salva una subscription push sul backend (edge function push-subscription). */
async function saveSubscriptionToBackend(userId: string, sub: PushSubscription): Promise<boolean> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    const keys = sub.toJSON().keys ?? {};

    const response = await fetch(`${supabaseUrl}/functions/v1/push-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: keys.p256dh ?? '',
        auth_key: keys.auth ?? '',
        user_agent: navigator.userAgent.slice(0, 200),
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.warn('[Push] Errore salvataggio:', response.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[Push] Errore salvataggio subscription:', err);
    return false;
  }
}

/**
 * Risolve una Promise con un valore di fallback dopo `ms` millisecondi:
 * evita che l'attesa del Service Worker resti appesa all'infinito.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

/**
 * Ottiene una ServiceWorkerRegistration attiva, con fallback:
 * 1) registrazione esistente  2) `ready` (con timeout)  3) registrazione esplicita di /sw.js
 */
async function getActiveRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const existing = await withTimeout(navigator.serviceWorker.getRegistration(), 3000, undefined as ServiceWorkerRegistration | undefined);
    if (existing) return existing;
  } catch { /* ignora */ }
  try {
    const ready = await withTimeout(navigator.serviceWorker.ready, 8000, null);
    if (ready) return ready;
  } catch { /* ignora */ }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js');
    await withTimeout(navigator.serviceWorker.ready, 8000, null);
    return reg;
  } catch (err) {
    console.error('[Push] Impossibile registrare il service worker:', err);
    return null;
  }
}

/**
 * Crea (se manca) e salva la subscription push per l'utente.
 * NON richiede il permesso: presuppone che sia già stato concesso.
 * Usata dal gate permessi all'avvio e dall'auto-iscrizione.
 */
export async function ensurePushSubscription(userId?: string): Promise<boolean> {
  if (typeof window === 'undefined' || !userId) return false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await getActiveRegistration();
    if (!reg) return false;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return true;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
    });
    return await saveSubscriptionToBackend(userId, subscription);
  } catch (err) {
    console.error('[Push] ensurePushSubscription:', err);
    return false;
  }
}

export type UsePushNotificationsOptions = {
  /** Se false, non richiede il permesso automaticamente dopo il login (es. banner con CTA manuale). Default: true. */
  enableAutoSubscribe?: boolean;
};

export function usePushNotifications(userId?: string, options?: UsePushNotificationsOptions) {
  const enableAutoSubscribe = options?.enableAutoSubscribe ?? true;
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const isPushNotificationSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // Controlla lo stato reale (permesso + subscription nel browser) e lo
  // mantiene aggiornato quando la finestra torna al focus (es. dopo il prompt
  // di sistema richiesto dal gate permessi all'avvio).
  useEffect(() => {
    if (!isPushNotificationSupported) return;
    const refresh = () => {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'granted') {
        navigator.serviceWorker.ready
          .then((reg) => reg.pushManager.getSubscription())
          .then((sub) => setIsSubscribed(!!sub))
          .catch(() => setIsSubscribed(false));
      }
    };
    refresh();
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isPushNotificationSupported]);

  // Auto-iscrizione: se il permesso è già stato concesso ma la subscription
  // manca, la crea e la salva automaticamente (nessun nuovo prompt).
  // Un solo tentativo per sessione per evitare loop se il subscribe fallisce.
  const autoSubscribeAttemptedRef = useRef(false);
  useEffect(() => {
    autoSubscribeAttemptedRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (!enableAutoSubscribe) return;
    if (!isPushNotificationSupported) return;
    if (!userId) return;
    if (Notification.permission !== 'granted') return;
    if (isSubscribed) return;
    if (autoSubscribeAttemptedRef.current) return;
    autoSubscribeAttemptedRef.current = true;

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const reg = await navigator.serviceWorker.ready;
        const existingSub = await reg.pushManager.getSubscription();
        if (existingSub) {
          if (!cancelled) {
            setIsSubscribed(true);
            setIsLoading(false);
          }
          return;
        }
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        });
        const saved = await saveSubscriptionToBackend(userId, subscription);
        if (cancelled) return;
        setSavedOk(saved);
        setIsSubscribed(true);
        setIsLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error('[Push] Auto-iscrizione fallita:', err);
        setError('Attivazione automatica non riuscita — premi "Attiva Notifiche"');
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPushNotificationSupported, enableAutoSubscribe, userId, isSubscribed]);

  /** Salva subscription nel backend */
  const saveSubscription = useCallback(async (sub: PushSubscription): Promise<boolean> => {
    if (!userId) {
      console.warn('[Push] userId mancante, subscription non salvata');
      return false;
    }
    return saveSubscriptionToBackend(userId, sub);
  }, [userId]);

  /** Attiva push: richiede permesso, forza nuova subscription, salva nel DB */
  const requestNotificationPermission = useCallback(async (): Promise<boolean> => {
    if (!isPushNotificationSupported) {
      setError('Notifiche push non supportate su questo browser/dispositivo');
      return false;
    }

    setIsLoading(true);
    setError(null);
    setSavedOk(false);

    try {
      // 1. Permesso browser
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission !== 'granted') {
        setError(
          permission === 'denied'
            ? 'Notifiche bloccate — riabilita in: Impostazioni browser → Sito → Notifiche'
            : 'Permesso notifiche non concesso'
        );
        setIsLoading(false);
        return false;
      }

      // 2. Forza nuova subscription (elimina quella vecchia se c'è, per evitare endpoint scaduti)
      const registration = await navigator.serviceWorker.ready;
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) {
        await existingSub.unsubscribe();
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });

      // 3. Salva nel DB
      const saved = await saveSubscription(subscription);
      setSavedOk(saved);

      if (!saved) {
        setError('Notifiche attivate nel browser ma non sincronizzate — riprova');
      }

      setIsSubscribed(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Errore: ${msg}`);
      console.error('[Push]', err);
      // Verifica lo stato reale della subscription: se il subscribe è fallito
      // ma esiste comunque una subscription (es. ripristinata dal browser),
      // riflette lo stato vero, altrimenti resta "Non iscritto".
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      } catch {
        setIsSubscribed(false);
      }
      setIsLoading(false);
      return false;
    }
  }, [isPushNotificationSupported, saveSubscription]);

  /** Disiscrive dal push */
  const unsubscribeFromPushNotifications = useCallback(async (): Promise<boolean> => {
    if (!isPushNotificationSupported) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

        await fetch(`${supabaseUrl}/functions/v1/push-subscription`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
          },
          body: JSON.stringify({ user_id: userId, endpoint: subscription.endpoint }),
        });

        await subscription.unsubscribe();
      }

      setIsSubscribed(false);
      setSavedOk(false);
      return true;
    } catch (err) {
      console.error('[Push] Errore unsubscribe:', err);
      return false;
    }
  }, [isPushNotificationSupported, userId]);

  return {
    notificationPermission,
    isSubscribed,
    isLoading,
    error,
    savedOk,
    requestNotificationPermission,
    unsubscribeFromPushNotifications,
    isPushNotificationSupported,
  };
}
