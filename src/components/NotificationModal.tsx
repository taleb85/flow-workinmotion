import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useMultisensorialFeedback } from '../hooks/useMultisensorialFeedback';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { DirectMessagesPanel } from './DirectMessagesPanel';
import type { Message } from '../hooks/useMessages';
import type { User } from '../types';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  unreadCount: number;
  onMessageClick: (messageId: string) => void;
  userId?: string;
  userName?: string;
  onRefresh?: () => void;
  currentUser?: User;
  sendMessage?: (subject: string, body: string, recipientId?: string) => Promise<boolean>;
  deleteMessage?: (messageId: string) => Promise<boolean>;
}

/**
 * Modal messaggi — apre il pannello DM direttamente dalla campanella.
 */
export function NotificationModal({ isOpen, onClose }: NotificationModalProps) {
  const { triggerHapticFeedback, playNotificationSound } = useMultisensorialFeedback();

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      triggerHapticFeedback('click');
      try { playNotificationSound(); } catch { /* bloccato dal browser */ }
    }
  }, [isOpen, triggerHapticFeedback, playNotificationSound]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const modalContent = (
    <AnimatePresence mode="wait">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto overflow-x-hidden p-4 font-sans"
      >
        {/* Overlay */}
        <button
          type="button"
className="absolute inset-0 bg-black/40 w-screen h-screen transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          aria-label="Chiudi"
          onClick={onClose}
        />

        {/* Card */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative my-auto flex w-full max-w-[92vw] min-h-0 flex-col overflow-hidden rounded-2xl border border-white/[0.14] md:max-w-2xl z-[201]"
          style={{
            height: 'min(88vh, 680px)',
            maxHeight: 'min(88vh, 680px)',
            background: 'transparent',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 32px 80px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <DirectMessagesPanel onClose={onClose} />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
}
