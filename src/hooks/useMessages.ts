import { useEffect, useState, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
// import { database } from '../lib/database'; // unused

export interface Message {
  id: string;
  sender_id: string;
  sender_name?: string;
  recipient_id?: string;
  message_type: 'broadcast' | 'private';
  subject: string;
  body: string;
  created_at: string;
  is_read: boolean;
  read_at?: string;
}

export interface Conversation {
  contactId: string;
  messages: Message[];
  lastMessage: Message;
  unreadCount: number;
}

/**
 * Raggruppa i messaggi privati in conversazioni per coppia utente.
 * Ogni conversazione rappresenta il thread con un singolo contatto.
 */
export function groupIntoConversations(messages: Message[], myId: string): Conversation[] {
  const map = new Map<string, Message[]>();

  for (const msg of messages) {
    if (msg.message_type !== 'private') continue;
    const otherId = msg.sender_id === myId ? msg.recipient_id : msg.sender_id;
    if (!otherId) continue;
    if (!map.has(otherId)) map.set(otherId, []);
    map.get(otherId)!.push(msg);
  }

  const conversations: Conversation[] = [];
  for (const [contactId, msgs] of map.entries()) {
    const sorted = [...msgs].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const unread = sorted.filter((m) => !m.is_read && m.sender_id !== myId).length;
    conversations.push({
      contactId,
      messages: sorted,
      lastMessage: sorted[sorted.length - 1],
      unreadCount: unread,
    });
  }

  return conversations.sort(
    (a, b) =>
      new Date(b.lastMessage.created_at).getTime() -
      new Date(a.lastMessage.created_at).getTime()
  );
}

/**
 * Hook per gestire i messaggi dell'utente.
 * Fornisce lista messaggi, filtri, e funzioni per marcare come letti.
 */
export function useMessages(userId?: string, isAdmin = false) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [, setSubscription] = useState<RealtimeChannel | null>(null);

  const loadMessages = useCallback(
    async (uid: string, opts?: { silent?: boolean }) => {
      if (!uid) return;
      try {
        // Ricariche "silenziosa" (eventi realtime): niente flicker dello spinner.
        if (!opts?.silent) setIsLoading(true);
        setError(null);

        // Validazione di sicurezza: verifica che supabase sia disponibile
        if (!supabase) {
          setMessages([]);
          setUnreadCount(0);
          return;
        }

        // Admin vede tutti i messaggi; altri vedono solo i propri
        let query = supabase
          .from('staff_messages')
          .select('*');

        if (!isAdmin) {
          query = query.or(`recipient_id.is.null,recipient_id.eq.${uid},sender_id.eq.${uid}`);
        }

        const { data, error: supabaseError } = await query
          .order('created_at', { ascending: false });

        // Gestione errori Supabase
        if (supabaseError) {
          if (supabaseError.code === 'PGRST116' || supabaseError.code === '42501') {
            setMessages([]);
            setUnreadCount(0);
            return;
          }
          throw supabaseError;
        }

        if (!data) {
          setMessages([]);
          setUnreadCount(0);
          return;
        }

        if (!Array.isArray(data)) {
          throw new Error('Invalid messages array in response');
        }

        // Non contare come "da leggere" i messaggi inviati dall'utente stesso
        const unread = data.filter((m) => !m.is_read && m.sender_id !== uid).length;
        setMessages(data as Message[]);
        setUnreadCount(unread);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Errore sconosciuto';
        setError(errorMsg);
      } finally {
        setIsLoading(false);
      }
    },
    [isAdmin]
  );

  // Carica messaggi iniziali
  useEffect(() => {
    if (!supabase || !userId) {
      if (!userId) setIsLoading(false);
      return;
    }
    loadMessages(userId);
  }, [userId, isAdmin, loadMessages]);

  // Sottoscrizione real-time ai messaggi
  useEffect(() => {
    if (!userId || !supabase) return;

    // Nome canale univoco per ISTANZA: il nome fisso "staff_messages_changes" faceva
    // collidere le istanze multiple dell'hook (header + modale + composer) → handler
    // duplicati e doppi fetch a ogni evento realtime.
    const channelNameRef = `staff_messages_changes_${userId}_${Math.random().toString(36).slice(2, 10)}`;

    // Debounce: una raffica di eventi (INSERT/UPDATE/DELETE ravvicinati) produce
    // un solo reload invece di N query complete, evitando anche race tra risposte.
    let reloadTimer: ReturnType<typeof setTimeout> | null = null;

    try {
      const channel = supabase
        .channel(channelNameRef)
        .on(
          'postgres_changes',
          {
            event: '*', // Ascolta tutti gli eventi (INSERT, UPDATE, DELETE)
            schema: 'public',
            table: 'staff_messages',
          },
          (payload) => {
            if (import.meta.env.DEV) console.log('[useMessages] Change detected:', payload);
            const msg = (payload.new || payload.old) as Message;
            
            // Admin ricarica sempre; altri solo se il messaggio li riguarda
            if (isAdmin || !msg.recipient_id || msg.recipient_id === userId || msg.sender_id === userId) {
              if (reloadTimer) clearTimeout(reloadTimer);
              reloadTimer = setTimeout(() => {
                void loadMessages(userId, { silent: true });
              }, 300);

              // Mostra notifica browser su nuovo messaggio che non abbiamo inviato noi
              if (
                payload.eventType === 'INSERT' &&
                msg.sender_id !== userId &&
                'Notification' in window &&
                Notification.permission === 'granted'
              ) {
                try {
                  const notif = new Notification(msg.subject || 'Nuovo messaggio', {
                    body: msg.body?.slice(0, 120) || '',
                    icon: '/icon-192.png',
                    badge: '/icon-192.png',
                    tag: `msg-${msg.id}`,
                  });
                  notif.onclick = () => {
                    window.focus();
                    notif.close();
                  };
                } catch {
                  // Notification API non disponibile (es. iframe, Firefox strict)
                }
              }
            }
          }
        )
        .subscribe((status) => {
          if (import.meta.env.DEV) console.log('[useMessages] Subscription status:', status);
        });

      setSubscription(channel);

      return () => {
        if (reloadTimer) clearTimeout(reloadTimer);
        if (supabase) supabase.removeChannel(channel);
      };
    } catch (err) {
      console.error('[useMessages] Real-time error:', err);
      return undefined;
    }
  }, [userId, isAdmin, loadMessages]);

  /**
   * Marca un singolo messaggio come letto.
   */
  const markAsRead = useCallback(
    async (messageId: string) => {
      if (!userId) return false;

      try {
        if (!supabase) {
          console.warn('[useMessages] Supabase client not initialized');
          return false;
        }

        const { error: supabaseError } = await supabase
          .from('staff_messages')
          .update({ is_read: true, read_at: new Date().toISOString() })
          .eq('id', messageId);

        if (supabaseError) {
          if (supabaseError.code === 'PGRST116' || supabaseError.code === '42501') {
            console.warn('[useMessages] Permission denied (RLS) marking as read');
            return false;
          }
          throw supabaseError;
        }

        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, is_read: true } : m))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        return true;
      } catch (err) {
        console.error('[useMessages] Error marking as read:', err);
        return false;
      }
    },
    [userId]
  );

  /**
   * Marca tutti i messaggi non letti (ricevuti) come letti in una sola query.
   * Viene chiamata quando l'utente apre il modal notifiche.
   */
  const markAllAsRead = useCallback(async () => {
    if (!userId || !supabase) return false;

    // IDs di tutti i messaggi non letti ricevuti dall'utente corrente
    const unreadIds = messages
      .filter((m) => !m.is_read && m.sender_id !== userId)
      .map((m) => m.id);

    if (unreadIds.length === 0) return true;

    try {
      const { error: supabaseError } = await supabase
        .from('staff_messages')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .in('id', unreadIds);

      if (supabaseError) {
        if (supabaseError.code === 'PGRST116' || supabaseError.code === '42501') {
          console.warn('[useMessages] Permission denied (RLS) marking all as read');
          return false;
        }
        throw supabaseError;
      }

      // Aggiorna lo stato locale senza ricaricare tutto
      setMessages((prev) =>
        prev.map((m) =>
          unreadIds.includes(m.id) ? { ...m, is_read: true } : m
        )
      );
      setUnreadCount(0);
      return true;
    } catch (err) {
      console.error('[useMessages] Error marking all as read:', err);
      return false;
    }
  }, [userId, messages]);

  /**
   * Invia un nuovo messaggio.
   */
  const sendMessage = useCallback(
    async (subject: string, body: string, recipientId?: string) => {
      if (!userId) return false;

      try {
        // Validazione di sicurezza
        if (!supabase) {
          console.warn('[useMessages] Supabase client not initialized');
          return false;
        }

        const messageType = recipientId ? 'private' : 'broadcast';

        // Insert messaggio in Supabase
        const { error: supabaseError } = await supabase
          .from('staff_messages')
          .insert({
            sender_id: userId,
            message_type: messageType,
            subject,
            body,
            recipient_id: recipientId || null,
            is_read: false,
            created_at: new Date().toISOString(),
          });

        // Gestione errori Supabase
        if (supabaseError) {
          // Gestione RLS errors (403)
          if (supabaseError.code === 'PGRST116' || supabaseError.code === '42501') {
            console.warn('[useMessages] Permission denied (RLS) sending message');
            return false;
          }

          throw supabaseError;
        }

        // Ricarica messaggi per riflettere il nuovo
        await loadMessages(userId);
        return true;
      } catch (err) {
        console.error('[useMessages] Error sending message:', err);
        return false;
      }
    },
    [userId, loadMessages]
  );

  /**
   * Elimina un messaggio (solo Admin).
   */
  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!userId || !supabase) return false;

      try {
        const { error: supabaseError } = await supabase
          .from('staff_messages')
          .delete()
          .eq('id', messageId);

        if (supabaseError) throw supabaseError;

        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return true;
      } catch (err) {
        console.error('[useMessages] Error deleting message:', err);
        return false;
      }
    },
    [userId]
  );

  /**
   * Elimina un'intera conversazione (tutti i messaggi privati tra due utenti).
   * Accessibile sia ad admin che a utenti normali per la propria conversazione.
   */
  const deleteConversation = useCallback(
    async (contactId: string) => {
      if (!userId || !supabase) return false;

      try {
        const { error: supabaseError } = await supabase
          .from('staff_messages')
          .delete()
          .or(
            `and(sender_id.eq.${userId},recipient_id.eq.${contactId}),and(sender_id.eq.${contactId},recipient_id.eq.${userId})`
          );

        if (supabaseError) throw supabaseError;

        setMessages((prev) =>
          prev.filter(
            (m) =>
              !(
                m.message_type === 'private' &&
                ((m.sender_id === userId && m.recipient_id === contactId) ||
                  (m.sender_id === contactId && m.recipient_id === userId))
              )
          )
        );
        return true;
      } catch (err) {
        console.error('[useMessages] Error deleting conversation:', err);
        return false;
      }
    },
    [userId]
  );

  /**
   * Filtra messaggi broadcast.
   */
  const broadcastMessages = messages.filter((m) => m.message_type === 'broadcast');

  /**
   * Filtra messaggi privati.
   */
  const privateMessages = messages.filter((m) => m.message_type === 'private');

  /**
   * Filtra messaggi non letti (esclude quelli inviati dall'utente corrente).
   */
  const unreadMessages = messages.filter((m) => !m.is_read && m.sender_id !== userId);

  return {
    messages,
    broadcastMessages,
    privateMessages,
    unreadMessages,
    isLoading,
    error,
    unreadCount,
    markAsRead,
    markAllAsRead,
    sendMessage,
    deleteMessage,
    deleteConversation,
    loadMessages,
  };
}
