import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, MessageCircle, Bell, BellOff, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMessages } from '../hooks/useMessages';
import { useAppUser } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { supabase } from '../lib/supabase';
import type { User } from '../types';
import { readProfileAvatarFromStorage } from '../utils/profilePhotoStorage';
import { getIntlLocale } from '../utils/translations';

const BRAND = '#525252';

function formatTime(iso: string, locale?: string) {
  return new Date(iso).toLocaleTimeString(locale ?? 'it-IT', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function UserAvatar({ user, size = 40 }: { user?: User; size?: number }) {
  const initial = (user?.first_name?.charAt(0) ?? '?').toUpperCase();
  const colors = ['#6b6b6b', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];
  const colorIndex = user ? (user.first_name?.charCodeAt(0) ?? 0) : 0;
  const bg = colors[colorIndex % colors.length];
  const radius = Math.round(size * 0.28);

  // Foto: localStorage ha priorità, poi avatar_url dal db
  const localPhoto = user?.id ? readProfileAvatarFromStorage(user.id) : null;
  const photoSrc = localPhoto ?? user?.avatar_url ?? null;

  if (photoSrc) {
    return (
      <img
        src={photoSrc}
        alt=""
        role="presentation"
        style={{ width: size, height: size, borderRadius: radius, objectFit: 'cover', flexShrink: 0 }}
        draggable={false}
      />
    );
  }
  return (
    <div
      className="flex items-center justify-center flex-shrink-0 text-white font-bold select-none"
      style={{ width: size, height: size, borderRadius: radius, background: bg, fontSize: size * 0.38 }}
    >
      {initial}
    </div>
  );
}

// ─── Broadcast List ────────────────────────────────────────────────────────
function BroadcastList({
  messages,
  currentUserId,
  users,
  onClose,
  intlLocale,
  t = {},
}: {
  messages: ReturnType<typeof useMessages>['broadcastMessages'];
  currentUserId: string;
  users: User[];
  onClose?: () => void;
  intlLocale?: string;
  t?: Record<string, string>;
}) {
  const sorted = [...messages].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <motion.div
      key="broadcast-list"
      initial={{ x: '-100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '-100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="absolute inset-0 flex min-h-0 flex-col rounded-[inherit]"
      style={{ background: 'transparent' }}
    >
      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain p-3 [-webkit-overflow-scrolling:touch]">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-10 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'rgba(0, 82, 255, 0.20)' }}>
              <MessageCircle className="w-8 h-8" style={{ color: BRAND }} />
            </div>
            <p className="text-sm font-semibold text-white">Nessuna comunicazione</p>
            <p className="text-xs text-white/50">I messaggi del management appariranno qui</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {sorted.map((msg) => {
              const sender = users.find((u) => u.id === msg.sender_id);
              const isMine = msg.sender_id === currentUserId;
              const name = sender
                ? `${sender.first_name} ${sender.last_name ?? ''}`.trim()
                : 'Management';
              return (
                <div
                  key={msg.id}
                  className="rounded-2xl p-4 border border-white/10 transition-colors hover:bg-white/5"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <UserAvatar user={sender} size={28} />
                      <div>
                        <p className="text-sm font-bold text-white">
                          {isMine ? 'Tu' : name}
                          <span className="ml-1.5 text-[10px] font-medium text-white/40 uppercase bg-white/10 rounded-full px-2 py-0.5">Broadcast</span>
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-white/40 shrink-0">
                      {formatTime(msg.created_at, intlLocale)}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white/90 mb-1">{msg.subject}</h3>
                  <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Notifications View ──────────────────────────────────────────────────────
type DbNotification = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
};

function NotificationsView({
  onClose,
  t = {},
}: {
  onClose?: () => void;
  t?: Record<string, string>;
}) {
  const { currentUser } = useAppUser();
  const [notifs, setNotifs] = useState<DbNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Carica notifiche dal database
  useEffect(() => {
    if (!currentUser || !supabase) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase!
          .from('notifications')
          .select('*')
          .eq('user_id', currentUser.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (err) {
          // Se la tabella non esiste o non ha RLS, mostra errore leggibile
          setError('Nessuna notifica personale disponibile');
        } else {
          setNotifs(data || []);
        }
      } catch {
        setError('Errore nel caricamento notifiche');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [currentUser]);

  // Marca come lette quando apri
  useEffect(() => {
    if (!currentUser || !supabase || notifs.length === 0) return;

    const unread = notifs.filter((n) => !n.is_read).map((n) => n.id);
    if (unread.length === 0) return;

    supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unread)
      .then(() => {
        setNotifs((prev) =>
          prev.map((n) => (unread.includes(n.id) ? { ...n, is_read: true } : n))
        );
        window.dispatchEvent(new CustomEvent('notifications-seen'));
      })
      .catch(() => {});
  }, [currentUser, notifs]);

  // Formatta data relativa
  function formatRelativeDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();

    // Aggiusta per fuso orario italiano
    const pad = (n: number) => String(n).padStart(2, '0');
    const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`;

    // Stesso giorno
    if (d.toDateString() === now.toDateString()) {
      return `Oggi, ${timeStr}`;
    }

    // Ieri
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return `Ieri, ${timeStr}`;
    }

    // Meno di 7 giorni fa
    const days = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
    if (diffDays < 7) {
      return `${days[d.getDay()]}, ${timeStr}`;
    }

    // Data completa
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${timeStr}`;
  }

  const getIcon = (_type: string) => {
    switch (_type) {
      case 'shift_change':
      case 'shift_assigned':
        return <CheckCircle2 className="h-4 w-4 text-brand-500" />;
      case 'holiday_approved':
        return <CheckCircle2 className="h-4 w-4 text-brand-500" />;
      case 'holiday_rejected':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'message_received':
        return <Bell className="h-4 w-4 text-accent" />;
      default:
        return <Info className="h-4 w-4 text-accent" />;
    }
  };

  return (
    <motion.div
      key="notifications"
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="absolute inset-0 flex min-h-0 flex-col rounded-[inherit]"
      style={{ background: 'transparent' }}
    >
      {/* Feed */}
      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain p-2 [-webkit-overflow-scrolling:touch]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND }} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <BellOff className="h-8 w-8 text-white/30" />
            </div>
            <p className="text-sm font-medium text-white/60">{error}</p>
          </div>
        ) : notifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
              <BellOff className="h-8 w-8 text-white/30" />
            </div>
            <p className="text-sm font-medium text-white/60">{t.notif_empty_state ?? 'Nessuna notifica'}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {notifs.map((n) => (
              <div
                key={n.id}
                className={`relative flex gap-3 rounded-2xl p-4 transition-colors ${
                  !n.is_read ? 'bg-accent/[0.06]' : 'hover:bg-white/8'
                } active:bg-white/8/80`}
              >
                <div className="mt-0.5 shrink-0">{getIcon(n.type)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-white">{n.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/70">{n.message}</p>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-white/50">
                    {formatRelativeDate(n.created_at)}
                  </p>
                </div>
                {!n.is_read && (
                  <div className="absolute top-4 right-4 h-2 w-2 rounded-full bg-red-500" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function DirectMessagesPanel({ onClose }: { onClose?: () => void } = {}) {
  const { currentUser, users, effectiveLanguage } = useAppUser();
  const t = useT();
  const intlLocale = getIntlLocale(effectiveLanguage);
  const { broadcastMessages, isLoading } = useMessages(
    currentUser?.id,
    currentUser?.role === 'admin'
  );

  const [activeTab, setActiveTab] = useState<'messages' | 'notifications'>('messages');

  const handleTabChange = (tab: 'messages' | 'notifications') => {
    setActiveTab(tab);
  };

  if (!currentUser) return null;

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden mx-auto">
      {/* Tab bar — sempre visibile in cima, in tutte le viste */}
      <div className="relative flex shrink-0 border-b border-white/10" style={{ background: BRAND }}>
        <button
          onClick={() => handleTabChange('messages')}
          className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${
            activeTab === 'messages'
              ? 'text-white border-white'
              : 'text-white/50 border-transparent hover:text-white/80'
          }`}
        >
          Messaggi
        </button>
        <button
          onClick={() => handleTabChange('notifications')}
          className={`flex-1 py-3 text-sm font-bold transition-colors border-b-2 ${
            activeTab === 'notifications'
              ? 'text-white border-white'
              : 'text-white/50 border-transparent hover:text-white/80'
          }`}
        >
          Notifiche
        </button>
        {/* Pulsante chiudi — overlay assoluto a destra */}
        {onClose && (
          <div className="absolute inset-y-0 right-0 flex items-center gap-1 px-2" style={{ background: BRAND }}>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
              title={t.close}
            >
              <X className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="relative flex-1 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND }} />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'notifications' ? (
              <NotificationsView
                key="notifications-view"
                onClose={onClose}
                t={t as Record<string, string>}
              />
            ) : (
              <BroadcastList
                key="broadcast-list"
                messages={broadcastMessages}
                currentUserId={currentUser.id}
                users={users}
                onClose={onClose}
                intlLocale={intlLocale}
                t={t as Record<string, string>}
              />
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
