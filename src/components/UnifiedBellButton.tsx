import { useState, useRef, useEffect, useMemo } from 'react';
import { useMessages } from '../hooks/useMessages';
import { useMultisensorialFeedback } from '../hooks/useMultisensorialFeedback';
import { useAppUser, useAppData } from '../context/AppContext';
import { NotificationModal } from './NotificationModal';
import { countUnreadNotifications } from '../utils/notifications';
import { getTranslations } from '../utils/translations';

interface UnifiedBellButtonProps {
  userId?: string;
  effectiveLanguage?: string;
  onMessageClick?: (messageId: string) => void;
}

/**
 * Campanella unificata per notifiche.
 * Apre il centro messaggi al click.
 */
export function UnifiedBellButton({
  userId,
  onMessageClick,
}: UnifiedBellButtonProps) {
  const { triggerHapticFeedback } = useMultisensorialFeedback();
  const { currentUser, users, effectiveLanguage } = useAppUser();
  const { shifts, holidays } = useAppData();
  const isAdmin = currentUser?.role === 'admin';
  const { messages, unreadCount: msgUnread, markAsRead, markAllAsRead, loadMessages, error, sendMessage, deleteMessage } = useMessages(userId, isAdmin);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Conteggio unificato: messaggi non letti + notifiche turni/ferie non lette
  const shiftNotifUnread = useMemo(() => {
    if (!currentUser) return 0;
    const t = getTranslations(effectiveLanguage);
    return countUnreadNotifications(currentUser, shifts, holidays, users, t, effectiveLanguage);
  }, [currentUser, shifts, holidays, users, effectiveLanguage]);

  const totalUnread = msgUnread + shiftNotifUnread;

  // Apri il modal notifiche quando l'utente clicca su una push notification
  useEffect(() => {
    // Caso 1: app già aperta → il SW invia un postMessage
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_NOTIFICATIONS') {
        setIsModalOpen(true);
        markAllAsRead();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSWMessage);
    }

    // Caso 2: app era chiusa → aperta con ?open=notifications nell'URL
    if (typeof window !== 'undefined' && window.location.search.includes('open=notifications')) {
      setIsModalOpen(true);
      markAllAsRead();
      // Rimuovi il parametro dall'URL senza ricaricare la pagina
      const url = new URL(window.location.href);
      url.searchParams.delete('open');
      window.history.replaceState({}, '', url.toString());
    }

    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    if (userId && typeof loadMessages === 'function') {
      loadMessages(userId);
    }
  };

  // Per ora lo teniamo sempre attivo per test, o comunque non bloccato da caricamento
  const isDisabled = !!error;

  return (
    <div className="relative shrink-0">
      {/* Pulsante Campanella */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!isDisabled) {
            // Richiedi permesso notifiche al primo click (gesto utente obbligatorio)
            if ('Notification' in window && Notification.permission === 'default') {
              Notification.requestPermission();
            }
            setIsModalOpen(true);
            triggerHapticFeedback('click');
            // Azzera badge: marca tutti i messaggi non letti come letti
            markAllAsRead();
          }
        }}
        disabled={isDisabled}
        title={
          error
            ? `Errore caricamento notifiche: ${error}`
            : `Notifiche${totalUnread > 0 ? ` (${totalUnread} non lette)` : ''}`
        }
        aria-label={
          error
            ? `Errore caricamento notifiche`
            : `Campanella notifiche${totalUnread > 0 ? ` con ${totalUnread} nuovi messaggi` : ''}`
        }
        className={`group relative flex items-center gap-0 overflow-hidden rounded-xl p-2 transition-all duration-200 touch-manipulation liquid-glass text-accent hover:gap-1.5 hover:pr-2.5 ${
          isDisabled
            ? 'opacity-50 cursor-not-allowed'
            : ' '
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 md:h-3.5 md:w-3.5 shrink-0"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        <span className="min-w-0 max-w-0 overflow-hidden whitespace-nowrap text-[0.625rem] font-bold uppercase tracking-wider transition-all duration-200 group-hover:max-w-[5.5rem]">
          {(getTranslations(effectiveLanguage) as Record<string, string>).notifications ?? 'Notifiche'}
        </span>

        {/* Badge numero notifiche non lette - Rosso acceso con numero bianco */}
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[0.5rem] font-black text-white" style={{ background: 'linear-gradient(135deg,#f87171,#dc2626)', boxShadow: 'inset 0 1.5px 0 rgba(255,255,255,0.45), inset 0 -1px 0 rgba(0,0,0,0.18), 0 2px 8px rgba(220,38,38,0.55)', border: '1.5px solid rgba(255,255,255,0.55)' }}>
            {totalUnread > 9 ? '9+' : totalUnread}
          </span>
        )}
      </button>

      {/* Modal Notifiche Centrato */}
      <NotificationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        messages={messages}
        unreadCount={totalUnread}
        onMessageClick={(messageId) => {
          markAsRead(messageId);
          triggerHapticFeedback('success');
          if (onMessageClick) onMessageClick(messageId);
        }}
        userId={userId}
        userName={currentUser?.first_name}
        onRefresh={handleRefresh}
        currentUser={currentUser ?? undefined}
        sendMessage={sendMessage}
        deleteMessage={deleteMessage}
      />
    </div>
  );
}
