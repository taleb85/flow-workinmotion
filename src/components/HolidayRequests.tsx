import { useState, useEffect } from 'react';
import { Calendar, Check, X, Palmtree } from 'lucide-react';
import { getTranslations } from '../utils/translations';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { canApproveShiftActions } from '../utils/permissions';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday } from 'date-fns';
import { it } from 'date-fns/locale';
import type { HolidayRequest } from '../types';

// ─── Status helpers ────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  approved: { label: 'Approvata',  dot: 'bg-accent', badge: 'bg-[#bbf7d0] text-[#1a1a1a]' },
  pending:  { label: 'In attesa',  dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-800'  },
  rejected: { label: 'Rifiutata',  dot: 'bg-red-500',     badge: 'bg-red-100 text-red-800'    },
} as const;

export default function HolidayRequests() {
  const { currentUser, holidays, users, addHolidayRequest, updateHolidayStatus, showSuccess, silentRefreshData, effectiveLanguage, featureFlags } = useApp();

  /** Auto-refresh silenzioso quando la scheda Ferie viene montata (utente ci clicca sopra). */
  useEffect(() => {
    silentRefreshData();
  }, [silentRefreshData]);

  const [showForm, setShowForm]       = useState(false);
  const [selectedH, setSelectedH]     = useState<HolidayRequest | null>(null);
  const [updatingId, setUpdatingId]   = useState<string | null>(null);
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [reason, setReason]           = useState('');

  if (!currentUser) return null;

  const t = getTranslations(effectiveLanguage);

  if (featureFlags['staff_requests'] === false) {
    return (
      <div className="pb-content w-full px-4 sm:px-6 font-sans min-h-[40vh] flex items-center justify-center">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-6 py-8 max-w-md text-center">
          <Palmtree className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-700 font-semibold text-sm">{t.staff_requests_feature_off}</p>
        </div>
      </div>
    );
  }

  const isAdmin = canApproveShiftActions(currentUser);
  const uiW = (key: string) => isUiWidgetVisible(currentUser, key);

  const myHolidays     = holidays.filter((h) => h.user_id === currentUser.id && h.type !== 'indisponibilita');
  const realHolidays   = holidays.filter((h) => h.type !== 'indisponibilita');
  const pendingAll     = realHolidays.filter((h) => h.status === 'pending');
  const approvedFuture = realHolidays.filter((h) => h.status === 'approved' && new Date(h.end_date) >= new Date());

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const now        = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const emptyDays   = Array.from({ length: getDay(monthStart) === 0 ? 6 : getDay(monthStart) - 1 });
  const weekDays    = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

  const calHolidays = isAdmin ? realHolidays : myHolidays;

  const getDayStatus = (day: Date): HolidayRequest['status'] | null => {
    const ds = format(day, 'yyyy-MM-dd');
    for (const h of calHolidays) {
      try {
        const days = eachDayOfInterval({ start: parseISO(h.start_date), end: parseISO(h.end_date) });
        if (days.some((d) => format(d, 'yyyy-MM-dd') === ds)) return h.status;
      } catch { /* skip */ }
    }
    return null;
  };

  const getHolidayForDay = (day: Date): HolidayRequest | null => {
    const ds = format(day, 'yyyy-MM-dd');
    for (const h of calHolidays) {
      try {
        const days = eachDayOfInterval({ start: parseISO(h.start_date), end: parseISO(h.end_date) });
        if (days.some((d) => format(d, 'yyyy-MM-dd') === ds)) return h;
      } catch { /* skip */ }
    }
    return null;
  };

  const formatDiscursiveDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = d.toLocaleString('en-US', { month: 'long' });
    const getSuffix = (n: number) => {
      if (n > 3 && n < 21) return 'th';
      switch (n % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };
    return `${day}${getSuffix(day)} of ${month}`;
  };

  const handleStatusChange = async (id: string, status: 'approved' | 'rejected') => {
    setUpdatingId(id);
    const request = holidays.find((h) => h.id === id);
    const user = request ? users.find((u) => u.id === request.user_id) : null;
    try {
      const result = await updateHolidayStatus(id, status);
      if (status === 'rejected' && request && (request.requester_email || user?.email)) {
        const employeeEmail = request.requester_email || user?.email || '';
        const displayStart = formatDiscursiveDate(request.start_date);
        const displayEnd = formatDiscursiveDate(request.end_date);
        const displayDates = `${displayStart} until ${displayEnd}`;
        const subject = encodeURIComponent('Update: Holiday Request');
        const body = encodeURIComponent(`Hi ${user?.first_name ?? 'there'},\n\nRegarding your request for ${displayDates}, it has been rejected.\n\nRegards,\nManagement`);
        try {
          window.location.href = `mailto:${employeeEmail}?subject=${subject}&body=${body}`;
        } catch (err) {
          console.warn('[HolidayRequests] mailto failed:', err);
        }
      }
      setSelectedH(null);
      showSuccess(result?.emailSent ? t.email_sent : t.holiday_saved_email_sent);
    } catch {
      setSelectedH(null);
    } finally {
      setUpdatingId(null);
    }
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    addHolidayRequest({
      user_id: currentUser.id,
      start_date: startDate,
      end_date: endDate,
      type: 'ferie',
      requester_email: currentUser.email ?? '',
      ...((reason ?? '').trim() && { reason: (reason ?? '').trim() }),
    });

    const displayStart = formatDiscursiveDate(startDate);
    const displayEnd = formatDiscursiveDate(endDate);
    // Se manca il cognome usa il nome; se mancano entrambi fallback 'Employee'
    const requesterName = (currentUser.first_name && currentUser.last_name)
      ? `${currentUser.first_name} ${currentUser.last_name}`.trim()
      : (currentUser.first_name || currentUser.last_name || 'Employee').trim();

    const mailSubject = encodeURIComponent(`Holiday Request - ${requesterName}`);
    const mailBody = encodeURIComponent(`Hi, hope you are well,\nI'd like to request a week of holiday that goes from the ${displayStart} until the ${displayEnd}.\nLooking forward to hear from you.\n\nKind Regards`);
    try {
      window.location.href = `mailto:info@osteriabasilico.co.uk?subject=${mailSubject}&body=${mailBody}`;
    } catch (err) {
      console.warn('[HolidayRequests] mailto failed:', err);
    }

    setStartDate(''); setEndDate(''); setReason('');
    setShowForm(false);
  };

  // ── Shared input style ────────────────────────────────────────────────────
  const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-500 focus:border-accent focus:ring-2 focus:ring-accent/20';
  const labelCls = 'block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1';

  return (
    <div className="pb-content pt-6 w-full max-w-full font-sans min-h-full">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {uiW('ferie.header') && (
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {isAdmin ? `${pendingAll.length} richieste in attesa` : `${myHolidays.length} richieste totali`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="ui-toolbar-accent gap-1.5 px-3 text-[11px] uppercase tracking-wider shadow-sm transition-transform hover:bg-accent-hover active:scale-[0.98]"
        >
          {t.request_holiday}
        </button>
      </div>
      )}

      {/* ── New request modal ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.form
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 12 }}
              onSubmit={handleSubmit}
              onClick={(e) => e.stopPropagation()}
              className="card-factorial p-6 w-full max-w-md bg-white"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-slate-900 font-semibold text-base">Nuova richiesta</h3>
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Data inizio</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Data fine</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required min={startDate} className={inputCls} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Motivazione <span className="text-slate-200 normal-case font-normal">(opzionale)</span></label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Es. Visita medica, ferie estive…"
                    className={`${inputCls} resize-none h-20`}
                  />
                </div>

                <button type="submit" className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-accent-hover">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  Invia richiesta
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Approve/reject modal (admin click on pending day) ─────────────── */}
      <AnimatePresence>
        {selectedH && selectedH.status === 'pending' && isAdmin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedH(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="card-factorial p-6 w-full max-w-sm bg-white"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-900 font-semibold">Richiesta in attesa</h3>
                <button type="button" onClick={() => setSelectedH(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {(() => {
                const u = users.find((u) => u.id === selectedH.user_id);
                return (
                  <>
                    <div className="bg-slate-50 rounded-xl p-4 mb-4">
                      <p className="text-slate-900 font-semibold text-sm">{u?.first_name} {u?.last_name}</p>
                      <p className="text-slate-600 text-xs mt-1">
                        {format(parseISO(selectedH.start_date), 'd MMM', { locale: it })} – {format(parseISO(selectedH.end_date), 'd MMM yyyy', { locale: it })}
                      </p>
                      {'reason' in selectedH && selectedH.reason && (
                        <p className="text-slate-500 text-xs mt-1 italic">{String(selectedH.reason)}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(selectedH.id, 'approved')}
                        disabled={updatingId === selectedH.id}
                        className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {updatingId === selectedH.id ? (
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                            Approva
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(selectedH.id, 'rejected')}
                        disabled={updatingId === selectedH.id}
                        className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-100 text-xs font-bold uppercase tracking-wider text-red-700 transition-colors hover:bg-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {updatingId === selectedH.id ? (
                          <span className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <X className="w-3.5 h-3.5" strokeWidth={3} />
                            Rifiuta
                          </>
                        )}
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Layout ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">

        {/* Left: calendar */}
        <div className="md:col-span-1 space-y-4">
          {uiW('ferie.calendar') && (
          <div className="card-factorial p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-slate-900 font-semibold text-xl">
                {format(now, 'MMMM yyyy', { locale: it })}
              </h3>
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />In attesa</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent inline-block" />Approvata</span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {weekDays.map((d, i) => (
                <div key={i} className="text-center text-xs font-semibold text-slate-600 uppercase">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {emptyDays.map((_, i) => <div key={`e${i}`} />)}
              {daysInMonth.map((day) => {
                const status = getDayStatus(day);
                const holiday = getHolidayForDay(day);
                const isPending = status === 'pending' && holiday;
                const today = isToday(day);
                return (
                  <div
                    key={day.toString()}
                    onClick={() => isPending && isAdmin && setSelectedH(holiday)}
                    className={`min-h-[44px] min-w-[44px] aspect-square rounded-xl flex items-center justify-center text-xs font-semibold transition-all select-none touch-target
                      ${isPending && isAdmin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}
                      ${status === 'approved' ? 'bg-[#bbf7d0] text-[#1a1a1a]' :
                        status === 'pending'  ? 'bg-amber-100 text-amber-700'  :
                        status === 'rejected' ? 'bg-red-100 text-red-700'    :
                        today                 ? 'bg-accent text-white'      :
                        'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {format(day, 'd')}
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* My requests list (staff only) */}
          {!isAdmin && uiW('ferie.list') && (
            <div className="card-factorial overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50">
                <h3 className="text-slate-900 font-semibold text-xl">Le mie richieste</h3>
              </div>
              <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                {myHolidays.length === 0 ? (
                  <p className="text-slate-600 text-sm text-center py-10">Nessuna richiesta</p>
                ) : myHolidays
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((h) => {
                      const cfg = STATUS_CONFIG[h.status];
                      return (
                        <div key={h.id} className="flex items-center justify-between px-5 py-3.5">
                          <div>
                            <p className="text-slate-900 text-[12px] font-medium">
                              {format(parseISO(h.start_date), 'd MMM', { locale: it })} – {format(parseISO(h.end_date), 'd MMM', { locale: it })}
                            </p>
                            <p className="text-slate-600 text-xs mt-0.5 uppercase tracking-wider">
                              {h.type ?? 'Ferie'}
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${cfg.badge}`}>
                            {cfg.label}
                          </span>
                        </div>
                      );
                    })}
              </div>
            </div>
          )}
        </div>

        {/* Right: admin panels */}
        <div className="md:col-span-2 space-y-4">

          {/* Pending (manager) */}
          {isAdmin && uiW('ferie.list') && pendingAll.length > 0 && (
            <div className="card-factorial overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
                <h3 className="text-slate-900 font-semibold text-xl">Richieste in attesa</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">{pendingAll.length}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {pendingAll.map((h) => {
                  const u = users.find((u) => u.id === h.user_id);
                  return (
                    <div key={h.id} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <p className="text-slate-900 text-sm font-semibold truncate">{u?.first_name} {u?.last_name}</p>
                          <p className="text-slate-600 text-xs">
                            {format(parseISO(h.start_date), 'd MMM', { locale: it })} – {format(parseISO(h.end_date), 'd MMM yyyy', { locale: it })}
                            {h.reason && ` · ${h.reason}`}
                          </p>
                        </div>
                      </div>
                      <div className="ml-3 flex flex-shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(h.id, 'approved')}
                          disabled={updatingId === h.id}
                          className="ui-toolbar-accent gap-1 text-[11px] uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updatingId === h.id ? (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <>
                              <Check className="h-3 w-3" strokeWidth={3} />
                              Approva
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(h.id, 'rejected')}
                          disabled={updatingId === h.id}
                          className="ui-toolbar-outline gap-1 border-slate-200 text-[11px] uppercase tracking-wider hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {updatingId === h.id ? (
                            <span className="w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <X className="w-3 h-3" strokeWidth={3} />
                              Rifiuta
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming approved */}
          {isAdmin && uiW('ferie.list') && approvedFuture.length > 0 && (
            <div className="card-factorial p-4 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-50">
                <h3 className="text-slate-900 font-semibold text-xl">Prossime ferie approvate</h3>
              </div>
              <div className="divide-y divide-slate-50 max-h-80 overflow-y-auto">
                {approvedFuture
                  .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                  .map((h) => {
                    const u = users.find((u) => u.id === h.user_id);
                    return (
                      <div key={h.id} className="flex items-center justify-between px-5 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <Palmtree className="w-4 h-4 text-accent flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-slate-900 text-sm font-semibold truncate">{u?.first_name} {u?.last_name}</p>
                            <p className="text-slate-600 text-xs">
                              {format(parseISO(h.start_date), 'd MMM', { locale: it })} – {format(parseISO(h.end_date), 'd MMM yyyy', { locale: it })}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-[#bbf7d0] text-[#1a1a1a] text-xs font-semibold uppercase">
                          Approvata
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {isAdmin && uiW('ferie.list') && pendingAll.length === 0 && approvedFuture.length === 0 && (
            <div className="card-factorial p-12 flex flex-col items-center justify-center text-center">
              <Palmtree className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-slate-600 text-sm">Nessuna richiesta di ferie</p>
            </div>
          )}

          {/* Staff: my upcoming approved */}
          {!isAdmin && uiW('ferie.list') && myHolidays.filter(h => h.status === 'approved' && new Date(h.end_date) >= new Date()).length > 0 && (
            <div className="card-factorial overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-50">
                <h3 className="text-slate-900 font-semibold text-xl">Prossime ferie</h3>
              </div>
              <div className="divide-y divide-slate-50">
                {myHolidays
                  .filter(h => h.status === 'approved' && new Date(h.end_date) >= new Date())
                  .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                  .map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-accent" />
                        <span className="text-slate-900 text-[12px] font-medium">
                          {format(parseISO(h.start_date), 'd MMM', { locale: it })} – {format(parseISO(h.end_date), 'd MMM yyyy', { locale: it })}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-[#bbf7d0] text-[#1a1a1a] text-xs font-semibold uppercase">Approvata</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </motion.div>
    </div>
  );
}
