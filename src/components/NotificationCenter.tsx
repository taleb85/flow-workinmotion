import { useState, useEffect, useRef, useMemo } from 'react';
import { Bell, X, CheckCheck, Calendar, Clock, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { getTranslations } from '../utils/translations';
import { generateNotifications, getSeenIds, markAllSeen, AppNotification, NotifSeverity } from '../utils/notifications';

// ── Icon + colour helpers ─────────────────────────────────────────────────────

function severityRing(s: NotifSeverity): string {
  if (s === 'success') return 'bg-emerald-50 border-emerald-100';
  if (s === 'warning') return 'bg-amber-50 border-amber-100';
  return 'bg-accent/5 border-accent/10';
}

function SeverityIcon({ s }: { s: NotifSeverity }) {
  if (s === 'success') return <CheckCircle size={15} className="text-emerald-500 shrink-0" />;
  if (s === 'warning') return <AlertCircle size={15} className="text-amber-500 shrink-0" />;
  return <Info size={15} className="text-accent shrink-0" />;
}

function TypeIcon({ type }: { type: AppNotification['type'] }) {
  if (type === 'new_shift') return <Clock size={13} className="opacity-50" />;
  return <Calendar size={13} className="opacity-50" />;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface NotificationCenterProps {
  /** Pulsante campanella più compatto (es. header profilo PWA) */
  denseTrigger?: boolean;
}

export default function NotificationCenter({ denseTrigger = false }: NotificationCenterProps) {
  const { currentUser, shifts, holidays, users, effectiveLanguage } = useApp();
  const t = getTranslations(effectiveLanguage) as Record<string, string>;
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() =>
    currentUser ? getSeenIds(currentUser.id) : new Set()
  );
  const ref = useRef<HTMLDivElement>(null);

  // Re-sync seen IDs when user changes
  useEffect(() => {
    if (currentUser) setSeenIds(getSeenIds(currentUser.id));
    else setSeenIds(new Set());
  }, [currentUser]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const allNotifs = useMemo(() => {
    if (!currentUser) return [];
    return generateNotifications(currentUser, shifts, holidays, users, t, effectiveLanguage);
  }, [currentUser, shifts, holidays, users, t, effectiveLanguage]);

  const unread = useMemo(
    () => allNotifs.filter((n) => !seenIds.has(n.id)),
    [allNotifs, seenIds]
  );

  const handleOpen = () => {
    setOpen((v) => !v);
  };

  const handleMarkAll = () => {
    if (!currentUser) return;
    const ids = allNotifs.map((n) => n.id);
    markAllSeen(currentUser.id, ids);
    setSeenIds(new Set(ids));
  };

  if (!currentUser) return null;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      {/* Bell button */}
      <button
        type="button"
        onClick={handleOpen}
        aria-label="Notifiche"
        className={`relative flex items-center justify-center rounded-md border transition-colors ${
          denseTrigger ? 'min-h-[32px] min-w-[32px]' : 'min-h-[36px] min-w-[36px]'
        } ${
          open
            ? 'bg-accent/10 border-accent/20 text-accent'
            : 'border-slate-100 bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
        }`}
      >
        <Bell size={17} strokeWidth={2} />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-1.5rem)] bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-800">Notifiche</span>
              <div className="flex items-center gap-2">
                {unread.length > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAll}
                    title="Segna tutte come lette"
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-accent transition-colors"
                  >
                    <CheckCheck size={14} />
                    <span className="hidden sm:inline">Tutte lette</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-700 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto overscroll-contain">
              {allNotifs.length === 0 ? (
                <div className="py-10 text-center">
                  <Bell size={28} className="mx-auto mb-2 text-slate-200" />
                  <p className="text-sm text-slate-400">Nessuna notifica</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-50">
                  {allNotifs.map((n) => {
                    const isNew = !seenIds.has(n.id);
                    return (
                      <li
                        key={n.id}
                        className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                          isNew ? 'bg-slate-50/80' : 'bg-white'
                        }`}
                      >
                        <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${severityRing(n.severity)}`}>
                          <SeverityIcon s={n.severity} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className={`text-xs font-semibold text-slate-800 ${isNew ? '' : 'opacity-70'}`}>
                              {n.title}
                            </p>
                            {isNew && (
                              <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-accent" />
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                            <TypeIcon type={n.type} />
                            {n.body}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Footer */}
            {allNotifs.length > 0 && unread.length === 0 && (
              <div className="px-4 py-2.5 border-t border-slate-50 text-center">
                <p className="text-xs text-slate-400">Sei aggiornato ✓</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
