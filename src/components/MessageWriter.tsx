import { useState } from 'react';
import { Send, Loader2, AlertCircle, Users, User } from 'lucide-react';
import { User as UserType } from '../types';
import { useT } from '../hooks/useT';

interface MessageWriterProps {
  currentUser: UserType;
  allUsers: UserType[];
  onSend: (subject: string, body: string, recipientId?: string) => Promise<boolean>;
  onCancel?: () => void;
  compact?: boolean;
}

/**
 * Componente per permettere ai manager di inviare messaggi.
 * Consente di scegliere tra:
 * - Messaggio broadcast a tutti
 * - Messaggio privato a un singolo utente
 */
export function MessageWriter({
  currentUser,
  allUsers,
  onSend,
  onCancel,
  compact = false,
}: MessageWriterProps) {
  const t = useT();
  const [messageType, setMessageType] = useState<'broadcast' | 'private'>('broadcast');
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSend = async () => {
    // Validazione
    if (!subject.trim()) {
      setError(t.messages_enter_subject ?? 'Inserisci un oggetto');
      return;
    }
    if (!body.trim()) {
      setError(t.messages_enter_body ?? 'Inserisci il messaggio');
      return;
    }
    if (messageType === 'private' && !selectedRecipientId) {
      setError(t.messages_select_recipient ?? 'Seleziona un destinatario');
      return;
    }

    setError(null);
    setIsSending(true);

    try {
      const success = await onSend(
        subject.trim(),
        body.trim(),
        messageType === 'private' ? selectedRecipientId : undefined
      );

      if (success) {
        setSuccess(true);
        setSubject('');
        setBody('');
        setMessageType('broadcast');
        setSelectedRecipientId('');

        // Mostra messaggio di successo per 2 secondi
        setTimeout(() => setSuccess(false), 2000);
      } else {
        setError('Errore invio messaggio');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore sconosciuto');
    } finally {
      setIsSending(false);
    }
  };

  if (compact) {
    return (
      <div className="space-y-3 rounded-lg border-2 border-amber-300/80 bg-amber-50/80 p-3">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-amber-700" />
          <h3 className="text-xs font-bold text-amber-900">
            {t.messages_write_title ?? 'Scrivi Messaggio'}
          </h3>
        </div>

        {/* Tipo messaggio */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold text-amber-900">
            {t.messages_recipient_label ?? 'Destinatario:'}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setMessageType('broadcast');
                setSelectedRecipientId('');
              }}
              className={`flex-1 flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                messageType === 'broadcast'
                  ? 'bg-amber-300 text-amber-900'
                  : 'bg-white/70 text-amber-700 hover:bg-white'
              } active:bg-white'/80`}
            >
              <Users className="h-3 w-3" />
              {t.messages_recipient_all ?? 'Tutti'}
            </button>
            <button
              type="button"
              onClick={() => setMessageType('private')}
              className={`flex-1 flex items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-semibold transition-colors ${
                messageType === 'private'
                  ? 'bg-amber-300 text-amber-900'
                  : 'bg-white/70 text-amber-700 hover:bg-white'
              } active:bg-white'/80`}
            >
              <User className="h-3 w-3" />
              {t.messages_recipient_private ?? 'Privato'}
            </button>
          </div>
        </div>

        {/* Seleziona destinatario (se privato) */}
        {messageType === 'private' && (
          <div>
            <label className="text-[11px] font-semibold text-amber-900">
              {t.messages_recipient_to ?? 'A chi:'}
            </label>
            <select
              value={selectedRecipientId}
              onChange={(e) => setSelectedRecipientId(e.target.value)}
              className="mt-1 w-full rounded border border-amber-400/30 bg-white/8 px-2 py-1.5 text-base"
            >
              <option value="">{t.messages_recipient_select ?? 'Seleziona utente...'}</option>
              {allUsers
                .filter((u) => u.id !== currentUser.id)
                .map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* Oggetto */}
        <div>
          <input
            type="text"
            placeholder={t.messages_subject_placeholder ?? 'Oggetto...'}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={100}
            className="w-full rounded border border-amber-400/30 bg-white/8 px-2 py-1.5 text-base placeholder-amber-400/60"
          />
        </div>

        {/* Corpo messaggio */}
        <div>
          <textarea
            placeholder={t.messages_body_placeholder ?? 'Messaggio...'}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded border border-amber-400/30 bg-white/8 px-2 py-1.5 text-base placeholder-amber-400/60 resize-none"
          />
          <p className="mt-1 text-[11px] text-amber-700/70">
            {body.length}/500
          </p>
        </div>

        {/* Errore */}
        {error && (
          <div className="flex gap-2 rounded bg-red-100 p-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-700" />
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Successo */}
        {success && (
          <div className="rounded bg-brand-100 p-2 text-xs font-semibold text-brand-700">
            {t.messages_sent_ok_short ?? '✓ Messaggio inviato!'}
          </div>
        )}

        {/* Pulsanti */}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-2 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-60 active:bg-amber-700/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          >
            {isSending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Send className="h-3 w-3" />
            )}
            Invia
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-amber-300 px-2 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-50 active:bg-amber-50/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            >
              {t.cancel ?? 'Annulla'}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Versione full (non compact)
  return (
    <div className="space-y-4 rounded-lg border-2 border-accent/50 bg-accent/5 p-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-accent">
        <Send className="h-5 w-5" />
        {t.messages_write_title ?? 'Scrivi Messaggio'}
      </h3>

      {/* Tipo messaggio - Full */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-accent">
          {t.messages_recipient_label ?? 'Destinatario:'}
        </label>
        <div className="flex gap-3">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="msgType"
              value="broadcast"
              checked={messageType === 'broadcast'}
              onChange={(e) => {
                setMessageType(e.target.value as 'broadcast' | 'private');
                setSelectedRecipientId('');
              }}
              className="h-4 w-4"
            />
            <span className="text-sm text-accent">📢 {t.messages_recipient_all ?? 'Tutti'}</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="msgType"
              value="private"
              checked={messageType === 'private'}
              onChange={(e) => setMessageType(e.target.value as 'broadcast' | 'private')}
              className="h-4 w-4"
            />
            <span className="text-sm text-accent">✉️ {t.messages_recipient_private ?? 'Privato'}</span>
          </label>
        </div>
      </div>

      {/* Seleziona destinatario - Full */}
      {messageType === 'private' && (
        <div>
          <label className="block text-sm font-semibold text-accent">
            {t.messages_recipient_to ?? 'A chi:'}
          </label>
          <select
            value={selectedRecipientId}
            onChange={(e) => setSelectedRecipientId(e.target.value)}
            className="mt-2 w-full rounded-lg border border-accent/30 bg-white/8 px-3 py-2 text-base"
          >
            <option value="">{t.messages_recipient_select ?? 'Seleziona utente...'}</option>
            {allUsers
              .filter((u) => u.id !== currentUser.id)
              .map((user) => (
                <option key={user.id} value={user.id}>
                  {user.first_name} {user.last_name}
                </option>
              ))}
          </select>
        </div>
      )}

      {/* Oggetto - Full */}
      <div>
        <label className="block text-sm font-semibold text-accent">
          {t.messages_subject_label ?? 'Oggetto:'}
        </label>
        <input
          type="text"
          placeholder="Es. Cambio Turno Domani"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={100}
          className="mt-2 w-full rounded-lg border border-accent/30 bg-white/8 px-3 py-2 text-base placeholder-accent/40"
        />
      </div>

      {/* Corpo - Full */}
      <div>
        <label className="block text-sm font-semibold text-accent">
          {t.messages_body_label ?? 'Messaggio:'}
        </label>
        <textarea
          placeholder="Scrivi il tuo messaggio..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={500}
          rows={4}
          className="mt-2 w-full rounded-lg border border-accent/30 bg-white/8 px-3 py-2 text-base placeholder-accent/40 resize-none"
        />
        <p className="mt-1 text-xs text-white/50">
          {body.length}/500 {t.messages_chars_count ?? 'caratteri'}
        </p>
      </div>

      {error && (
        <div className="flex gap-2 rounded-lg bg-red-100 p-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-700" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-lg bg-brand-100 p-3 text-sm font-semibold text-brand-700">
          {t.messages_sent_ok ?? '✓ Messaggio inviato con successo!'}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={handleSend}
          disabled={isSending}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-accent-hover disabled:opacity-60 active:bg-accent-hover/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {t.messages_send_btn ?? 'Invia Messaggio'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-accent/30 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 active:bg-accent/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          >
            {t.cancel ?? 'Annulla'}
          </button>
        )}
      </div>
    </div>
  );
}
