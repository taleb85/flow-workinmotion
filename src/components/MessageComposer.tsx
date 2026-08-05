import { useState, useRef } from 'react';
import { Send, Loader2, Users, User } from 'lucide-react';
import { useMessages } from '../hooks/useMessages';
import { useMultisensorialFeedback } from '../hooks/useMultisensorialFeedback';
import { useT } from '../hooks/useT';

interface MessageComposerProps {
  userId: string;
  userName: string;
  allUsers: Array<{ id: string; first_name: string; last_name: string }>;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * Composer per messaggi staff - Versione FULL-SCREEN.
 * Ottimizzato per la visibilità e l'uso su mobile.
 */
export function MessageComposer({
  userId,
  userName: _userName,
  allUsers,
  onClose: _onClose,
  onSuccess,
}: MessageComposerProps) {
  const { sendMessage } = useMessages(userId);
  const { triggerHapticFeedback } = useMultisensorialFeedback();
  const t = useT();

  const [messageType, setMessageType] = useState<'broadcast' | 'private'>('broadcast');
  const [selectedRecipientId, setSelectedRecipientId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [successMessage, setSuccessMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyInputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = async () => {
    if (!subject.trim()) {
      setError('Inserisci un oggetto');
      return;
    }

    if (!body.trim()) {
      setError('Inserisci un messaggio');
      return;
    }

    if (messageType === 'private' && !selectedRecipientId) {
      setError('Seleziona un destinatario');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const success = await sendMessage(
        subject.trim(),
        body.trim(),
        messageType === 'private' ? selectedRecipientId : undefined
      );

      if (success) {
        triggerHapticFeedback('success');
        setSuccessMessage(true);

        setTimeout(() => {
          setSuccessMessage(false);
          setSubject('');
          setBody('');
          setSelectedRecipientId('');
          setMessageType('broadcast');
          if (onSuccess) onSuccess();
        }, 1500);
      } else {
        setError('Errore nell\'invio del messaggio');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-200">
      {/* Feedback Successo */}
      {successMessage && (
        <div className="flex items-center justify-center gap-3 rounded-[24px] bg-brand-500 p-5 text-white shadow-lg shadow-brand-500/20">
          <div className="flex h-10 w-10 animate-bounce items-center justify-center rounded-full bg-white text-brand-500">
            <Send className="h-5 w-5" />
          </div>
          <span className="font-black uppercase tracking-widest text-sm">Inviato! ✅</span>
        </div>
      )}

      {/* Errore */}
      {error && (
        <div className="rounded-2xl bg-red-50 p-4 text-xs font-bold text-red-600 border border-red-100">
          ⚠️ {error}
        </div>
      )}

      {/* Tipo Destinatario */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMessageType('broadcast')}
          className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-4 transition-colors ${
 messageType === 'broadcast'
 ? 'border-accent bg-accent/10 text-accent'
 : 'border-neutral-500 bg-white/8 text-white/50'
 }`}
        >
          <Users className="h-5 w-5" />
          <span className="text-[11px] font-black uppercase tracking-widest">Tutti (Staff)</span>
        </button>
        <button
          type="button"
          onClick={() => setMessageType('private')}
          className={`flex items-center justify-center gap-2 rounded-2xl border-2 py-4 transition-colors ${
 messageType === 'private'
 ? 'border-accent bg-accent/10 text-accent'
 : 'border-neutral-500 bg-white/8 text-white/50'
 }`}
        >
          <User className="h-5 w-5" />
          <span className="text-[11px] font-black uppercase tracking-widest">Privato</span>
        </button>
      </div>

      {/* Selezione Destinatario Privato */}
      {messageType === 'private' && (
        <select
          value={selectedRecipientId}
          onChange={(e) => setSelectedRecipientId(e.target.value)}
          className="w-full h-14 rounded-2xl border-2 border-neutral-500 bg-white/8 px-4 text-base font-bold text-white outline-none focus:border-accent appearance-none"
        >
          <option value="">Seleziona dipendente...</option>
          {allUsers
            .filter((u) => u.id !== userId)
            .sort((a, b) => a.first_name.localeCompare(b.first_name))
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.first_name.toUpperCase()} {u.last_name.toUpperCase()}
              </option>
            ))}
        </select>
      )}

      {/* Oggetto */}
      <input
        type="text"
        placeholder="OGGETTO..."
        value={subject}
        onChange={(e) => setSubject(e.target.value.toUpperCase())}
        className="w-full h-14 rounded-2xl border-2 border-neutral-500 bg-white/8 px-4 text-base font-black tracking-widest text-white outline-none focus:border-accent"
      />

      {/* Corpo Messaggio */}
      <textarea
        ref={bodyInputRef}
        placeholder={t.messages_compose_placeholder ?? 'SCRIVI IL MESSAGGIO...'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        className="w-full resize-none rounded-[24px] border-2 border-neutral-500 bg-white/8 p-5 text-base font-medium leading-relaxed text-white outline-none focus:border-accent"
      />

      {/* Pulsante Invia stile PinPad */}
      <button
        type="button"
        onClick={handleSend}
        disabled={isSending || successMessage}
        className="w-full h-16 flex items-center justify-center gap-3 rounded-[24px] bg-accent text-white font-black uppercase tracking-[0.2em] text-sm shadow-xl shadow-accent/20 transition-colors hover:bg-accent-hover disabled:opacity-50 disabled:grayscale hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
      >
        {isSending ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Send className="h-6 w-6" />
        )}
        {isSending ? (t.messages_sending ?? 'Invio...') : (t.messages_send_btn ?? 'Invia Messaggio')}
      </button>
    </div>
  );
}
