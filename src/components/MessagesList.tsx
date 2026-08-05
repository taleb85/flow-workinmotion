import { useState } from 'react';
import { MessageCircle, Mail, Dot, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { it } from 'date-fns/locale';
import { Message } from '../hooks/useMessages';

interface MessagesListProps {
  messages: Message[];
  onMarkAsRead: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  compact?: boolean;
}

/**
 * Componente per visualizzare la lista dei messaggi.
 * Supporta:
 * - Badge rosso per messaggi non letti
 * - Espansione inline per leggere il contenuto completo
 * - Icone per distinguere broadcast vs privati
 * - Dark mode support
 */
export function MessagesList({
  messages,
  onMarkAsRead,
  onDelete,
  compact: _compact = false,
}: MessagesListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
        <MessageCircle className="h-6 w-6 text-slate-300" />
        <p className="text-xs text-white/60">
          Nessun messaggio
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {messages.map((message) => {
        const isExpanded = expandedId === message.id;
        const isUnread = !message.is_read;
        const createdDate = parseISO(message.created_at);
        const isBroadcast = message.message_type === 'broadcast';

        return (
          <div
            key={message.id}
            className={`rounded-lg border transition-colors ${
 isUnread
 ? 'border-accent/30 bg-accent/5'
 : 'border-slate-200 bg-slate-50/50'
 }`}
          >
            {/* Row compatta */}
            <button
              type="button"
              onClick={() => {
                if (isUnread) {
                  onMarkAsRead(message.id);
                }
                setExpandedId(isExpanded ? null : message.id);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
 isExpanded ? 'rounded-t-lg' : 'rounded-lg'
 } hover:bg-slate-100/50 active:bg-slate-100/80`}
            >
              {/* Icona tipo messaggio */}
              <div className="flex-shrink-0">
                {isBroadcast ? (
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-brand-100 text-brand-700 text-xs font-bold">
                    📢
                  </div>
                ) : (
                  <div className="flex h-5 w-5 items-center justify-center rounded bg-accent/10">
                    <Mail className="h-3 w-3 text-accent" />
                  </div>
                )}
              </div>

              {/* Contenuto */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white truncate" title={message.sender_name || 'Sconosciuto'}>{message.sender_name || 'Sconosciuto'}
                  </span>
                  {isUnread && (
                    <Dot className="h-4 w-4 flex-shrink-0 text-red-500 fill-red-500" />
                  )}
                </div>
                <p className="text-xs text-white/70 truncate" title={message.subject}>{message.subject}
                </p>
              </div>

              {/* Data */}
              <div className="flex-shrink-0 text-[11px] text-white/60">
                {format(createdDate, 'd MMM', { locale: it })}
              </div>

              {/* Chevron */}
              <div className="flex-shrink-0">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-white/70" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-white/70" />
                )}
              </div>
            </button>

            {/* Contenuto Espanso */}
            {isExpanded && (
              <div className="space-y-2 border-t border-inherit bg-white/50 px-3 py-2 rounded-b-lg">
                {/* Metadati */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <p className="font-semibold text-white/70">
                      Da:
                    </p>
                    <p className="text-white">
                      {message.sender_name || 'Sconosciuto'}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-white/70">
                      Data:
                    </p>
                    <p className="text-white">
                      {format(createdDate, 'd MMM HH:mm', { locale: it })}
                    </p>
                  </div>
                </div>

                {/* Corpo messaggio */}
                <div>
                  <p className="mb-1 text-xs font-semibold text-white/70">
                    Messaggio:
                  </p>
                  <div className="rounded bg-slate-50 p-2 text-xs leading-relaxed text-white whitespace-pre-wrap break-words">
                    {message.body}
                  </div>
                </div>

                {/* Azioni */}
                <div className="flex gap-2 pt-2">
                  {isUnread && (
                    <button
                      type="button"
                      onClick={() => onMarkAsRead(message.id)}
                      className="flex-1 rounded bg-accent/10 px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/20 transition-colors active:bg-accent/80"
                    >
                      Marca come letto
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(message.id)}
                      className="flex-shrink-0 p-1.5 rounded hover:bg-red-100 transition-colors active:bg-red-100/80"
                      title="Elimina messaggio"
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
