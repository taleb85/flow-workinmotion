import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Plus, X, Loader2, MessageCircle } from 'lucide-react';
import { useMessages, groupIntoConversations } from '../hooks/useMessages';
import { useAppUser } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { isManagementRole, isPurelyManagementRole } from '../utils/permissions';
import { translateRole } from '../utils/roles';
import type { User, Language } from '../types';
import { readProfileAvatarFromStorage } from '../utils/profilePhotoStorage';
import { getIntlLocale } from '../utils/translations';

const BRAND = '#525252';

function formatTime(iso: string, locale?: string) {
  return new Date(iso).toLocaleTimeString(locale ?? 'it-IT', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatDateLabel(iso: string, todayLabel: string, yesterdayLabel: string, locale?: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return todayLabel;
  if (d.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  return d.toLocaleDateString(locale ?? 'it-IT', { day: '2-digit', month: 'short' });
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

// ─── New chat picker overlay ──────────────────────────────────────────────────
function NewChatPicker({
  users,
  currentUserId,
  currentUserIsManagement,
  onSelect,
  onClose,
  effectiveLanguage,
  t = {},
}: {
  users: User[];
  currentUserId: string;
  currentUserIsManagement: boolean;
  onSelect: (user: User) => void;
  onClose: () => void;
  effectiveLanguage: Language;
  t?: Record<string, string>;
}) {
  const [search, setSearch] = useState('');
  const filtered = users
    .filter(
      (u) =>
        u.id !== currentUserId &&
        u.status === 'active' &&
        !isPurelyManagementRole(u.role) &&
        // Dipendenti non-gestionali possono scrivere solo a manager/admin
        (currentUserIsManagement || isManagementRole(u.role)) &&
        `${u.first_name} ${u.last_name ?? ''}`.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => (a.first_name ?? '').localeCompare(b.first_name ?? ''));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex min-h-0 flex-col rounded-[inherit]" style={{ background: "transparent" }}
    >
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/10 transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          aria-label={t.cancel ?? 'Chiudi'}
        >
          <X className="w-4 h-4" aria-hidden />
        </button>
        <h3 className="text-sm font-bold text-white flex-1">{t.messages_new_conversation ?? 'Nuova conversazione'}</h3>
      </div>
      <div className="px-4 pt-3 pb-2">
        <input
          type="search"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t.messages_search_employee ?? 'Cerca dipendente...'}
          aria-label={t.messages_search_employee ?? 'Cerca dipendente'}
          className="w-full rounded-xl border border-neutral-500 bg-white/8 px-3 py-2 text-base text-white outline-none focus:border-brand-electric focus-visible:ring-2 focus-visible:ring-white/50 transition-colors"
        />
      </div>
      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-2 pb-4 [-webkit-overflow-scrolling:touch]">
        {filtered.length === 0 ? (
          <p className="text-center text-xs text-white/50 py-8">{t.quick_switch_no_employee_found ?? 'Nessun dipendente trovato'}</p>
        ) : (
          filtered.map((u) => (
            <button
              key={u.id}
              onClick={() => onSelect(u)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/8 transition-colors text-left active:bg-white/8/80"
            >
              <UserAvatar user={u} size={38} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate" title={u.first_name}>{u.first_name} {u.last_name ?? ''}
                </p>
                <p className="text-[11px] text-white/50 uppercase tracking-wide">{translateRole(u.role, effectiveLanguage as 'it' | 'en' | 'es' | 'fr')}</p>
              </div>
            </button>
          ))
        )}
      </div>
    </motion.div>
  );
}

// ─── Chat bubble ──────────────────────────────────────────────────────────────
function ChatBubble({ body, time, isMine }: { body: string; time: string; isMine: boolean }) {
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] px-4 py-2.5 rounded-2xl shadow-sm ${
          isMine
            ? 'rounded-br-[4px]'
            : 'bg-white/15 rounded-bl-[4px]'
        }`}
        style={isMine ? { background: BRAND, borderBottomRightRadius: 4 } : undefined}
      >
        <p
          className={`text-sm leading-snug whitespace-pre-wrap break-words ${
            isMine ? 'text-white' : 'text-white'
          }`}
        >
          {body}
        </p>
        <p
          className={`text-[11px] mt-1 text-right ${
            isMine ? 'text-white/65' : 'text-white/50'
          }`}
        >
          {time}
        </p>
      </div>
    </div>
  );
}

// ─── Chat View ────────────────────────────────────────────────────────────────
function ChatView({
  contactId,
  currentUserId,
  onBack,
  messages,
  sendMessage,
  markAsRead,
  users,
  t = {},
  intlLocale,
}: {
  contactId: string;
  currentUserId: string;
  onBack: () => void;
  messages: ReturnType<typeof useMessages>['messages'];
  sendMessage: ReturnType<typeof useMessages>['sendMessage'];
  markAsRead: ReturnType<typeof useMessages>['markAsRead'];
  users: User[];
  t?: Record<string, string>;
  intlLocale?: string;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const contact = users.find((u) => u.id === contactId);

  const threadMessages = useMemo(
    () =>
      messages
        .filter(
          (m) =>
            m.message_type === 'private' &&
            ((m.sender_id === currentUserId && m.recipient_id === contactId) ||
              (m.sender_id === contactId && m.recipient_id === currentUserId))
        )
        .sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [messages, currentUserId, contactId]
  );

  // Mark unread incoming messages as read when thread opens
  useEffect(() => {
    const unread = threadMessages.filter(
      (m) => !m.is_read && m.sender_id === contactId
    );
    unread.forEach((m) => markAsRead(m.id));
  }, [contactId, threadMessages, markAsRead]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [threadMessages.length]);

  // Group messages by date for separators
  const grouped = useMemo(() => {
    const result: { label: string; msgs: typeof threadMessages }[] = [];
    let lastLabel = '';
    for (const msg of threadMessages) {
      const label = formatDateLabel(msg.created_at, t.messages_today ?? 'Oggi', t.messages_yesterday ?? 'Ieri', intlLocale);
      if (label !== lastLabel) {
        result.push({ label, msgs: [] });
        lastLabel = label;
      }
      result[result.length - 1].msgs.push(msg);
    }
    return result;
  }, [threadMessages, intlLocale, t?.messages_today, t?.messages_yesterday]);

  const handleSend = useCallback(async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    try {
      await sendMessage(body.slice(0, 40) || 'Messaggio', body, contactId);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [text, sending, sendMessage, contactId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      key="chat"
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="absolute inset-0 flex min-h-0 flex-col rounded-[inherit]"
      style={{ background: 'transparent' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-3 shrink-0 border-b border-white/10"
        style={{ background: BRAND }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:bg-white/15 transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          aria-label={t.notif_aria_back ?? 'Indietro'}
        >
          <ArrowLeft className="w-5 h-5" aria-hidden />
        </button>
        <UserAvatar user={contact} size={34} />
        <div className="min-w-0 flex-1">
          <p
            className="text-sm font-bold text-white truncate leading-tight"
            title={contact ? `${contact.first_name} ${contact.last_name ?? ''}`.trim() : '—'}
          >
            {contact ? `${contact.first_name} ${contact.last_name ?? ''}`.trim() : '—'}
          </p>
          <p className="text-[11px] text-white/60 uppercase tracking-wide leading-none mt-0.5">
            {contact?.role ?? ''}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-4 py-4 space-y-1 [-webkit-overflow-scrolling:touch]">
        {grouped.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-white/50">
            <MessageCircle className="w-10 h-10 opacity-20" />
            <p className="text-xs">Inizia la conversazione</p>
          </div>
        )}
        {grouped.map(({ label, msgs }) => (
          <div key={label}>
            <div className="flex items-center justify-center my-3">
              <span className="px-3 py-1 rounded-full bg-white/10 text-[11px] font-semibold text-white/50 uppercase tracking-wide">
                {label}
              </span>
            </div>
            <div className="space-y-1.5">
              {msgs.map((m) => (
                <ChatBubble
                  key={m.id}
                  body={m.body}
                  time={formatTime(m.created_at, intlLocale)}
                  isMine={m.sender_id === currentUserId}
                />
              ))}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-white/10 shrink-0" style={{ background: 'rgba(10,10,10,0.60)' }}>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              const el = e.target as HTMLTextAreaElement;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={t.messages_write_placeholder ?? 'Scrivi un messaggio...'}
            aria-label={t.messages_write_placeholder ?? 'Scrivi un messaggio'}
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-neutral-500 bg-white/8 px-4 py-2.5 text-base text-white outline-none focus:border-brand-electric focus-visible:ring-2 focus-visible:ring-white/50 transition-colors"
            style={{ maxHeight: 120, overflowY: 'auto' }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition-all active:scale-90 disabled:opacity-40"
            style={{ background: BRAND }}
            aria-label={t.messages_send_btn ?? 'Invia messaggio'}
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <Send className="w-4 h-4" aria-hidden />
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Conversation List ────────────────────────────────────────────────────────
function ConversationList({
  conversations,
  users,
  currentUserId,
  currentUserIsManagement,
  onSelect,
  onNewChat,
  onClose,
  intlLocale,
  t = {},
}: {
  conversations: ReturnType<typeof groupIntoConversations>;
  users: User[];
  currentUserId: string;
  currentUserIsManagement: boolean;
  onSelect: (contactId: string) => void;
  onNewChat: () => void;
  onClose?: () => void;
  intlLocale?: string;
  t?: Record<string, string>;
}) {
  return (
    <motion.div
      key="list"
      initial={{ x: '-100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '-100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="absolute inset-0 flex min-h-0 flex-col rounded-[inherit]"
      style={{ background: 'transparent' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4 shrink-0 border-b border-white/10"
        style={{ background: BRAND }}
      >
        <h2 className="text-base font-bold text-white tracking-tight">{t.messages_title}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewChat}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
            title={t.messages_new_chat}
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25 transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
              title={t.close}
            >
              <X className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-10 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: 'rgba(0, 82, 255, 0.20)' }}
            >
              <MessageCircle className="w-8 h-8" style={{ color: BRAND }} />
            </div>
            <p className="text-sm font-semibold text-white">Nessuna conversazione</p>
            <p className="text-xs text-white/50">
              {currentUserIsManagement
                ? <>Tocca <span className="font-bold">+</span> per scrivere a un collega</>
                : 'Puoi scrivere solo ai tuoi responsabili'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {conversations.map((conv) => {
              const contact = users.find((u) => u.id === conv.contactId);
              const preview = conv.lastMessage.body;
              const isMine = conv.lastMessage.sender_id === currentUserId;
              return (
                <button
                  key={conv.contactId}
                  onClick={() => onSelect(conv.contactId)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/8 transition-colors text-left active:bg-white/8/80"
                >
                  <UserAvatar user={contact} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p
                        className="text-sm font-bold truncate text-white"
                      >
                        {contact
                          ? `${contact.first_name} ${contact.last_name ?? ''}`.trim()
                          : '—'}
                      </p>
                      <span className="text-[11px] text-white/50 shrink-0">
                        {formatTime(conv.lastMessage.created_at, intlLocale)}
                      </span>
                    </div>
                    <p
                      className={`text-xs truncate mt-0.5 ${
                        conv.unreadCount > 0
                          ? 'font-semibold text-white'
                          : 'text-white/50'
                      }`}
                      title={`${isMine ? 'Tu: ' : ''}${preview}`}
                    >
                      {isMine ? 'Tu: ' : ''}
                      {preview}
                    </p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <div
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black text-white"
                      style={{ background: '#EF4444' }}
                    >
                      {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                    </div>
                  )}
                </button>
              );
            })}
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
  const { messages, sendMessage, markAsRead, isLoading } = useMessages(
    currentUser?.id,
    currentUser?.role === 'admin'
  );

  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);

  const isMgmt = isManagementRole(currentUser?.role ?? '');

  const conversations = useMemo(
    () => (currentUser ? groupIntoConversations(messages, currentUser.id) : []),
    [messages, currentUser]
  );

  const handleSelectContact = (contactId: string) => {
    setSelectedContactId(contactId);
    setShowNewChat(false);
  };

  const handleNewChatSelect = (user: User) => {
    setShowNewChat(false);
    setSelectedContactId(user.id);
  };

  if (!currentUser) return null;

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND }} />
      </div>
    );
  }

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden mx-auto">
      <AnimatePresence mode="wait">
        {showNewChat ? (
          <NewChatPicker
            key="new-chat"
            users={users}
            currentUserId={currentUser.id}
            currentUserIsManagement={isMgmt}
            onSelect={handleNewChatSelect}
            onClose={() => setShowNewChat(false)}
            effectiveLanguage={effectiveLanguage}
            t={t as Record<string, string>}
          />
        ) : selectedContactId ? (
          <ChatView
            key={`chat-${selectedContactId}`}
            contactId={selectedContactId}
            currentUserId={currentUser.id}
            onBack={() => setSelectedContactId(null)}
            messages={messages}
            sendMessage={sendMessage}
            markAsRead={markAsRead}
            users={users}
            t={t as Record<string, string>}
            intlLocale={intlLocale}
          />
        ) : (
          <ConversationList
            key="list"
            conversations={conversations}
            users={users}
            currentUserId={currentUser.id}
            currentUserIsManagement={isMgmt}
            onSelect={handleSelectContact}
            onNewChat={() => setShowNewChat(true)}
            onClose={onClose}
            intlLocale={intlLocale}
            t={t as Record<string, string>}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
