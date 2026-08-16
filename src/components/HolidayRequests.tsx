import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Check, X, Palmtree, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppUser } from '../context/appSliceContexts';
import { useAppData } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { canApproveShiftActions } from '../utils/permissions';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, isBefore, startOfDay } from 'date-fns';
import { getDateLocale } from '../utils/translations';
import type { HolidayRequest } from '../types';
import { safeFormatDate } from '../utils/safeDateFormat';
import DatePickerField from './DatePickerField';

// ─── Status helpers ────────────────────────────────────────────────────────────
// STATUS_CONFIG is built inside the component to use translations

export default function HolidayRequests({ embedded = false }: { embedded?: boolean } = {}) {
  const { currentUser, users, effectiveLanguage } = useAppUser();
  const { holidays, addHolidayRequest, updateHolidayStatus, deleteHolidayRequest } = useAppData();
  const { showSuccess, silentRefreshData } = useAppOverlay();
  const { featureFlags } = useAppConfig();

  /**
   * Aggiorna turni/ferie/timbrature da DB aprendo la scheda.
   * `skipRemoteRevisionCheck`: evita di innescare `forceGlobalRefresh` + overlay PIN / main `pointer-events-none`
   * solo perché la revisione cloud è avanti rispetto all’ack locale (comportamento da “app bloccata”).
   */
  useEffect(() => {
    void silentRefreshData({ skipRemoteRevisionCheck: true });
  }, [silentRefreshData]);

  const [showForm, setShowForm]       = useState(false);
  const [selectedH, setSelectedH]     = useState<HolidayRequest | null>(null);
  const [updatingId, setUpdatingId]   = useState<string | null>(null);
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [reason, setReason]           = useState('');

  const t = useT();

  if (!currentUser) return null;

  const STATUS_CONFIG = {
    approved: {
      label: t.status_approved,
      dot: 'bg-[#60a5fa]',
      badge: 'bg-neutral-500/15 text-white/70 border border-neutral-500/40',
    },
    pending: {
      label: t.pending,
      dot: 'bg-amber-400',
      badge: 'bg-amber-100 text-amber-800 border border-amber-200/80',
    },
    rejected: {
      label: t.rejected,
      dot: 'bg-red-500',
      badge: 'bg-red-100 text-red-800 border border-red-200/80',
    },
  } as const;

  if (featureFlags['staff_requests'] === false) {
    return (
      <div className={`app-horizontal-pad font-sans mx-auto flex min-h-[40vh] w-full max-w-7xl items-center justify-center ${embedded ? '' : 'pb-content'}`}>
        <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 max-w-md px-6 py-8 text-center">
          <Palmtree className="w-10 h-10 text-white/60 mx-auto mb-3 opacity-90" />
          <p className="text-white/80 font-semibold text-sm">{t.staff_requests_feature_off}</p>
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
  const rejectedAll    = realHolidays.filter((h) => h.status === 'rejected');

  // ── Calendar helpers ──────────────────────────────────────────────────────
  const now        = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const emptyDays   = Array.from({ length: getDay(monthStart) === 0 ? 6 : getDay(monthStart) - 1 });
  const calLocale = getDateLocale(effectiveLanguage);
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    format(new Date(2024, 0, 1 + i), 'EEEEE', { locale: calLocale }).toUpperCase()
  );

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
    const configuredEmail = (() => { try { return localStorage.getItem('osteria_holiday_request_email')?.trim() ?? ''; } catch { return ''; } })();
    const toEmail = configuredEmail || 'info@flow-workinmotion.com';
    try {
      window.location.href = `mailto:${toEmail}?subject=${mailSubject}&body=${mailBody}`;
    } catch (err) {
      console.warn('[HolidayRequests] mailto failed:', err);
    }

    setStartDate(''); setEndDate(''); setReason('');
    setShowForm(false);
  };

  // ── Shared input style ────────────────────────────────────────────────────
  const inputCls =
    'w-full rounded-lg px-3 py-2 text-base outline-none transition-colors bg-white/10 focus:bg-white/[0.15] focus:border-accent/50 focus:ring-2 focus:ring-accent/20';
  const inputStyle = {
    border: '1px solid rgba(255,255,255,0.20)',
    color: '#ffffff',
  } as React.CSSProperties;
  const labelCls = 'block text-xs font-bold uppercase tracking-wider mb-1';
  const labelStyle = { color: 'rgba(255,255,255,0.80)' } as React.CSSProperties;

  return (
    <div className={`font-sans flex h-[calc(var(--app-vh,100dvh)-var(--app-sticky-header-offset,5rem)-3rem)] md:h-[calc(var(--app-vh,100dvh)-var(--app-sticky-header-offset,5rem))] w-full flex-col pt-2 ${embedded ? '' : 'pb-content'}`}>
      <motion.div
        className="flex flex-col flex-1 min-h-0"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      {uiW('ferie.header') && (
      <div className="mb-5 mt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isAdmin && pendingAll.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[1.375rem] h-[1.375rem] px-1.5 rounded-full text-[0.6875rem] font-bold"
              style={{ background: 'rgba(245,158,11,0.25)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.35)' }}>
              {pendingAll.length}
            </span>
          )}
          <p className="ui-section-title">
            {isAdmin ? t.pending : `${myHolidays.length} ${t.request_holiday}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="gap-1.5 px-3 py-2 text-[0.6875rem] font-bold uppercase tracking-wider text-white transition-colors hover:opacity-80"
          style={{ background: 'transparent', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1.5px solid rgba(255,255,255,0.25)', borderRadius: '0.5rem' }}
        >
          {t.request_holiday}
        </button>
      </div>
      )}

      {/* ── New request modal ─────────────────────────────────────────────── */}
      {showForm && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/10 p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl border border-white/15 p-6 shadow-2xl bg-transparent"
              style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-white font-semibold text-base">{t.new_request}</h3>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10 active:bg-white/80"
                  style={{ color: 'rgba(255,255,255,0.60)' }}
                  aria-label={t.cancel ?? 'Chiudi'}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls} style={labelStyle}>{t.holiday_start_date ?? 'Data inizio'}</label>
                    <DatePickerField value={startDate} onChange={setStartDate} className="w-full" />
                  </div>
                  <div>
                    <label className={labelCls} style={labelStyle}>{t.holiday_end_date ?? 'Data fine'}</label>
                    <DatePickerField value={endDate} onChange={setEndDate} min={startDate} className="w-full" />
                  </div>
                </div>

                <div>
                  <label className={labelCls} style={labelStyle}>{t.holiday_request_reason} <span className="normal-case font-normal" style={{ color: 'rgba(255,255,255,0.40)' }}>{t.holiday_request_reason_optional}</span></label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t.holiday_request_reason_placeholder}
                    className={`${inputCls} resize-none h-20`}
                    style={inputStyle}
                  />
                </div>

                <button type="submit" className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-accent text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-accent/20 transition-colors hover:shadow-xl hover:shadow-accent/30 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">
                  <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  {t.request_holiday}
                </button>
              </div>
            </motion.form>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* ── Approve/reject modal (admin click on pending day) ─────────────── */}
      {selectedH && selectedH.status === 'pending' && isAdmin && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/10 p-4"
            onClick={() => setSelectedH(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-white/15 p-6 shadow-2xl bg-transparent"
              style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">{t.pending}</h3>
                <button
                  type="button"
                  onClick={() => setSelectedH(null)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-white/10 active:bg-white/80"
                  style={{ color: 'rgba(255,255,255,0.60)' }}
                  aria-label={t.cancel ?? 'Chiudi'}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
              {(() => {
                const u = users.find((u) => u.id === selectedH.user_id);
                return (
                  <>
                    <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 mb-4 p-4">
                      <p className="text-white font-semibold text-sm">{u?.first_name} {u?.last_name}</p>
                      <p className="text-xs mt-1" style={{ color: '#ffffff' }}>
                        {safeFormatDate(selectedH.start_date, 'd MMM', { locale: calLocale })} – {safeFormatDate(selectedH.end_date, 'd MMM yyyy', { locale: calLocale })}
                      </p>
                      {'reason' in selectedH && selectedH.reason && (
                        <p className="text-xs mt-1 italic" style={{ color: 'rgba(255,255,255,0.50)' }}>{String(selectedH.reason)}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleStatusChange(selectedH.id, 'approved')}
                        disabled={updatingId === selectedH.id}
                        className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 active:bg-accent-hover/80"
                      >
                        {updatingId === selectedH.id ? (
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                            {t.approve}
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStatusChange(selectedH.id, 'rejected')}
                        disabled={updatingId === selectedH.id}
                        className="flex h-10 items-center justify-center gap-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                        style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5' }}
                      >
                        {updatingId === selectedH.id ? (
                          <span className="w-4 h-4 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <X className="w-3.5 h-3.5" strokeWidth={3} />
                            {t.rejected}
                          </>
                        )}
                      </button>
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}

      {/* ── Layout ────────────────────────────────────────────────────────── */}
      <div className={`grid grid-cols-1 ${isAdmin ? 'md:grid-cols-3' : 'md:grid-cols-1 justify-items-center'} gap-6 md:gap-8 md:items-stretch flex-1`}>

        {/* Left: calendar + requests affiancati su desktop */}
        <div className={`${isAdmin ? 'md:col-span-1' : 'w-full max-w-xl'} flex flex-col md:flex-row md:gap-4 h-full`}>
          {uiW('ferie.calendar') && (
          <div className="group w-full rounded-xl border px-2 py-2 text-left border-neutral-500 flex-1">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-base" style={{ color: '#ffffff' }}>
                {format(now, 'MMMM yyyy', { locale: calLocale })}
              </h3>
              <div className="flex items-center gap-1.5 text-[0.625rem]" style={{ color: '#ffffff' }}>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />{t.pending}</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500 inline-block" />{t.status_approved}</span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px mb-0.5">
              {weekDays.map((d, i) => (
                <div key={i} className="text-center text-xs font-semibold uppercase" style={{ color: '#ffffff' }}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px">
              {emptyDays.map((_, i) => <div key={`e${i}`} />)}
              {daysInMonth.map((day) => {
                const status = getDayStatus(day);
                const holiday = getHolidayForDay(day);
                const isPending = status === 'pending' && holiday;
                const today = isToday(day);
                const isPast = !today && isBefore(day, startOfDay(new Date()));
                
                let dayStyle: React.CSSProperties = { color: isPast ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)' };
                
                if (status === 'approved') {
                  dayStyle = { background: 'rgba(16, 185, 129, 0.3)', color: '#34d399', fontWeight: 600 };
                } else if (status === 'pending') {
                  dayStyle = { background: 'rgba(245, 158, 11, 0.3)', color: '#fbbf24', fontWeight: 600 };
                } else if (status === 'rejected') {
                  dayStyle = { background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' };
                } else if (today) {
                  dayStyle = { background: 'transparent', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1.5px solid rgba(255,255,255,0.25)', color: '#ffffff', fontWeight: 700 };
                }
                
                return (
                  <div
                    key={day.toString()}
                    onClick={() => isPending && isAdmin && setSelectedH(holiday)}
                    className={`min-h-[2.75rem] min-w-[2.75rem] aspect-square rounded-xl flex items-center justify-center text-xs font-semibold transition-colors select-none touch-target
 ${isPending && isAdmin ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} active:opacity-70`}
                    style={dayStyle}
                    onMouseEnter={(e) => {
                      if (!status && !today) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                        e.currentTarget.style.color = '#ffffff';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!status && !today) {
                        e.currentTarget.style.background = '';
                        e.currentTarget.style.color = isPast ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.85)';
                      }
                    }}
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
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 overflow-hidden flex-1">
              <div className="px-5 py-4">
                <h3 className="text-white font-semibold text-xl">{(t as Record<string, string>).my_holiday_requests ?? 'Le mie richieste'}</h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {myHolidays.length === 0 ? (
                  <p className="text-white/70 text-sm text-center py-10">{t.no_holidays_yet}</p>
                ) : myHolidays
                    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .map((h) => {
                      const cfg = STATUS_CONFIG[h.status];
                      return (
                        <div key={h.id} className="flex items-center justify-between px-5 py-3.5">
                          <div>
                            <p className="text-white text-[0.75rem] font-medium">
                              {safeFormatDate(h.start_date, 'd MMM', { locale: calLocale })} – {safeFormatDate(h.end_date, 'd MMM', { locale: calLocale })}
                            </p>
                            <p className="text-white/70 text-xs mt-0.5 uppercase tracking-wider">
                              {h.type ?? 'Ferie'}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${cfg.badge}`}>
                              {cfg.label}
                            </span>
                            {h.status === 'rejected' && (
                              <button
                                type="button"
                                onClick={() => void deleteHolidayRequest(h.id)}
                                disabled={updatingId === h.id}
                                className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 active:bg-red-500/80"
                                title="Elimina richiesta"
                              >
                                <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
              </div>
            </div>
          )}
        </div>

        {/* Right: admin panels */}
        <div className="md:col-span-2 space-y-4 h-full">

          {/* Pending (manager) */}
          {isAdmin && uiW('ferie.list') && pendingAll.length > 0 && (
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 overflow-hidden h-full">
              <div className="px-5 py-4 flex items-center justify-between">
                <h3 className="text-white font-semibold text-xl">{t.pending}</h3>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200/80">{pendingAll.length}</span>
              </div>
              <div>
                {pendingAll.map((h) => {
                  const u = users.find((u) => u.id === h.user_id);
                  return (
                    <div key={h.id} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-semibold truncate" title={u?.first_name}>{u?.first_name} {u?.last_name}</p>
                          <p className="text-white/70 text-xs">
                            {safeFormatDate(h.start_date, 'd MMM', { locale: calLocale })} – {safeFormatDate(h.end_date, 'd MMM yyyy', { locale: calLocale })}
                            {h.reason && ` · ${h.reason}`}
                          </p>
                        </div>
                      </div>
                      <div className="ml-3 flex flex-shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(h.id, 'approved')}
                          disabled={updatingId === h.id}
                          className="gap-1 inline-flex items-center rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-50 transition-colors hover:opacity-90"
                          style={{ background: '#10b981' }}
                        >
                          {updatingId === h.id ? (
                            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          ) : (
                            <>
                              <Check className="h-3 w-3" strokeWidth={3} />
                              {t.approve}
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(h.id, 'rejected')}
                          disabled={updatingId === h.id}
                          className="gap-1 inline-flex items-center rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-50 transition-colors hover:opacity-90"
                          style={{ background: '#ef4444' }}
                        >
                          {updatingId === h.id ? (
                            <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <X className="w-3 h-3" strokeWidth={3} />
                              {t.rejected}
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
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 overflow-hidden">
              <div className="px-4 py-3">
                <h3 className="text-white font-semibold text-xl">{t.home_upcoming_holidays}</h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {approvedFuture
                  .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                  .map((h) => {
                    const u = users.find((u) => u.id === h.user_id);
                    return (
                      <div key={h.id} className="flex items-center justify-between px-5 py-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <Palmtree className="w-4 h-4 text-white/60 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-white text-sm font-semibold truncate" title={u?.first_name}>{u?.first_name} {u?.last_name}</p>
                            <p className="text-white/70 text-xs">
                              {safeFormatDate(h.start_date, 'd MMM', { locale: calLocale })} – {safeFormatDate(h.end_date, 'd MMM yyyy', { locale: calLocale })}
                            </p>
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-neutral-500/15 text-white/70 text-xs font-semibold uppercase border border-neutral-500/40">
                          {t.status_approved}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Rejected (admin) */}
          {isAdmin && uiW('ferie.list') && rejectedAll.length > 0 && (
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between">
                <h3 className="text-white font-semibold text-xl">{t.rejected}</h3>
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold border border-red-200/80">{rejectedAll.length}</span>
              </div>
              <div>
                {rejectedAll
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                  .map((h) => {
                    const u = users.find((u) => u.id === h.user_id);
                    return (
                      <div key={h.id} className="flex items-center justify-between px-5 py-3.5">
                        <div className="min-w-0">
                          <p className="text-white text-sm font-semibold truncate" title={u?.first_name}>{u?.first_name} {u?.last_name}</p>
                          <p className="text-white/70 text-xs">
                            {safeFormatDate(h.start_date, 'd MMM', { locale: calLocale })} – {safeFormatDate(h.end_date, 'd MMM yyyy', { locale: calLocale })}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteHolidayRequest(h.id)}
                          className="ml-3 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 active:bg-red-500/80"
                          title="Elimina richiesta"
                        >
                          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </button>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {isAdmin && uiW('ferie.list') && pendingAll.length === 0 && approvedFuture.length === 0 && (
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 p-12 flex flex-col items-center justify-center text-center">
              <Palmtree className="w-10 h-10 text-white/60 mb-3 opacity-90" />
              <p className="text-white/70 text-sm">{t.no_holidays_yet}</p>
            </div>
          )}

          {/* Staff: my upcoming approved */}
          {!isAdmin && uiW('ferie.list') && myHolidays.filter(h => h.status === 'approved' && new Date(h.end_date) >= new Date()).length > 0 && (
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500 overflow-hidden">
              <div className="px-5 py-4">
                <h3 className="text-white font-semibold text-xl">{t.home_upcoming_holidays}</h3>
              </div>
              <div>
                {myHolidays
                  .filter(h => h.status === 'approved' && new Date(h.end_date) >= new Date())
                  .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                  .map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-white/60" />
                        <span className="text-white text-[0.75rem] font-medium">
                          {safeFormatDate(h.start_date, 'd MMM', { locale: calLocale })} – {safeFormatDate(h.end_date, 'd MMM yyyy', { locale: calLocale })}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-neutral-500/15 text-white/70 text-xs font-semibold uppercase border border-neutral-500/40">{t.status_approved}</span>
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
