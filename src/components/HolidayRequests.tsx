import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, Check, X, Palmtree, Trash2, AlertCircle, CheckCircle2, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppUser } from '../context/appSliceContexts';
import { useAppData } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { canApproveShiftActions } from '../utils/permissions';
import { isUiWidgetVisible } from '../utils/uiScreenWidgets';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday, isBefore, startOfDay, addMonths, subMonths } from 'date-fns';
import { getDateLocale } from '../utils/translations';
import type { HolidayRequest, User } from '../types';
import { safeFormatDate } from '../utils/safeDateFormat';
import DatePickerField from './DatePickerField';

// ─── Status helpers ────────────────────────────────────────────────────────────
// STATUS_CONFIG is built inside the component to use translations

export default function HolidayRequests({
  embedded = false,
  overrideUser,
  overrideHolidays,
  skipAutoRefresh,
}: {
  embedded?: boolean;
  overrideUser?: User;
  overrideHolidays?: HolidayRequest[];
  skipAutoRefresh?: boolean;
} = {}) {
  const { currentUser: ctxUser, users, effectiveLanguage } = useAppUser();
  const { holidays: ctxHolidays, addHolidayRequest, updateHolidayStatus, deleteHolidayRequest } = useAppData();
  const { showSuccess, silentRefreshData } = useAppOverlay();
  const { featureFlags } = useAppConfig();

  // Shadowing: i due alias `ctxUser`/`ctxHolidays` permettono di alimentare
  // l'anteprima "Cosa vede chi" con un utente/elenco dimostrativi senza toccare
  // il resto del componente, che continua a riferirsi a `currentUser`/`holidays`.
  const currentUser = overrideUser ?? ctxUser;
  const holidays = overrideHolidays ?? ctxHolidays;

  /**
   * Aggiorna turni/ferie/timbrature da DB aprendo la scheda.
   * `skipRemoteRevisionCheck`: evita di innescare `forceGlobalRefresh` + overlay PIN / main `pointer-events-none`
   * solo perché la revisione cloud è avanti rispetto all’ack locale (comportamento da “app bloccata”).
   * `skipAutoRefresh`: l'anteprima amministrativa è di sola lettura e con dati demo → nessun refresh reale.
   */
  useEffect(() => {
    if (skipAutoRefresh) return;
    void silentRefreshData({ skipRemoteRevisionCheck: true });
  }, [silentRefreshData, skipAutoRefresh]);

  const [showForm, setShowForm]       = useState(false);
  const [selectedH, setSelectedH]     = useState<HolidayRequest | null>(null);
  const [updatingId, setUpdatingId]   = useState<string | null>(null);
  const [startDate, setStartDate]     = useState('');
  const [endDate, setEndDate]         = useState('');
  const [reason, setReason]           = useState('');
  /** KPI selezionata: apre il dropdown con l'elenco delle richieste di quello stato. */
  const [openKpi, setOpenKpi]         = useState<'pending' | 'approved' | 'rejected' | null>(null);
  /** Mese visualizzato nel calendario (navigazione indipendente). */
  const [viewMonth, setViewMonth]     = useState<Date>(() => startOfMonth(new Date()));

  const t = useT();

  if (!currentUser) return null;

  const STATUS_CONFIG = {
    approved: {
      label: t.status_approved,
      dot: 'bg-[#60a5fa]',
      badge: 'bg-neutral-500/15 text-white/70 border border-white/20',
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
      <div className={`font-sans mx-auto flex min-h-[40vh] w-full max-w-[96rem] items-center justify-center ${embedded ? '' : 'pb-content'}`}>
        <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-white/[0.14] max-w-md px-6 py-8 text-center">
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

  // ── Calendar helpers ──────────────────────────────────────────────────────
  // `viewMonth` guida il mese mostrato (navigazione con le frecce); di default è il mese corrente.
  const monthStart = startOfMonth(viewMonth);
  const monthEnd   = endOfMonth(viewMonth);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const emptyDays   = Array.from({ length: getDay(monthStart) === 0 ? 6 : getDay(monthStart) - 1 });
  const calLocale = getDateLocale(effectiveLanguage);
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    format(new Date(2024, 0, 1 + i), 'EEE', { locale: calLocale }).replace(/\./g, '').toUpperCase()
  );

  const calHolidays = isAdmin ? realHolidays : myHolidays;

  // KPI per stato. Scope = stesso della vista: tutte le richieste per chi approva
  // (Admin / can_approve_shifts), le proprie per lo staff.
  const HOLIDAY_KPI = [
    { key: 'pending',  label: t.holidays_kpi_pending,  count: calHolidays.filter((h) => h.status === 'pending').length,  icon: AlertCircle,  color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30' },
    { key: 'approved', label: t.holidays_kpi_approved, count: calHolidays.filter((h) => h.status === 'approved').length, icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
    { key: 'rejected', label: t.holidays_kpi_rejected, count: calHolidays.filter((h) => h.status === 'rejected').length, icon: XCircle,      color: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/30' },
  ] as const;

  /** KPI attualmente selezionata (apre il dropdown con l'elenco). */
  const activeKpi = HOLIDAY_KPI.find((k) => k.key === openKpi);
  /** Richieste della KPI selezionata (stesso scope della vista), in ordine di data inizio. */
  const kpiList = openKpi
    ? calHolidays
        .filter((h) => h.status === openKpi)
        .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    : [];

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
    'w-full rounded-lg px-3 py-2 text-base outline-none transition-colors bg-white/10 focus:bg-white/[0.15] focus:border-white/50 focus:ring-2 focus:ring-white/20';
  const inputStyle = {
    border: '1px solid rgba(255,255,255,0.20)',
    color: '#ffffff',
  } as React.CSSProperties;
  const labelCls = 'block text-xs font-bold uppercase tracking-wider mb-1';
  const labelStyle = { color: 'rgba(255,255,255,0.80)' } as React.CSSProperties;

  return (
    <div className={`font-sans flex min-h-[calc(var(--app-vh,100dvh)-var(--app-sticky-header-offset,5rem)-3rem)] md:min-h-[calc(var(--app-vh,100dvh)-var(--app-sticky-header-offset,5rem))] w-full flex-col pt-2 ${embedded ? '' : 'pb-content'}`}>
      {/* Titolo pagina per screen reader */}
      <h1 className="sr-only">
        {(t as Record<string, string>).sidebar_holidays ?? 'Ferie'}
      </h1>
      <motion.div
        className="flex flex-col flex-1 min-h-0"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      >
      {/* ── New request modal ─────────────────────────────────────────────── */}
      {showForm && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.form
              initial={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              onSubmit={handleSubmit}
              onClick={(e) => e.stopPropagation()}
              className="modal-glass-panel w-full max-w-md rounded-2xl p-6"
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

                <button type="submit" className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white/20 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-white/20 transition-colors hover:bg-white/30 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">
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
            className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4"
            onClick={() => setSelectedH(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-white/[0.14] p-6 shadow-2xl bg-transparent"
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
                    <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-white/[0.14] mb-4 p-4">
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
                        className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-accent text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60 active:bg-white/80"
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

      {/* ── Layout: schede disposte verticalmente ─────────────────────────── */}
      <div className={`grid grid-cols-1 content-start ${isAdmin ? '' : 'justify-items-center'} gap-4 flex-1`}>

        {/* Calendario + richieste (in colonna) */}
        <div className={`${isAdmin ? 'w-full' : 'w-full max-w-xl'} flex flex-col gap-4`}>
          {uiW('ferie.calendar') && (
          <div className="group w-full rounded-xl border px-2 py-2 text-left border-white/[0.14]">
            {/* Intestazione calendario: pulsante a sinistra, mese centrato con navigazione, legenda a destra */}
            <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {/* Sinistra: nuova richiesta */}
              {uiW(isAdmin ? 'ferie.header' : 'staff_holidays.header_actions') && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="order-1 shrink-0 px-3 py-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white transition-colors hover:opacity-80"
                  style={{ background: 'transparent', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.20)', borderRadius: '0.5rem' }}
                >
                  {t.request_holiday}
                </button>
              )}

              {/* Destra: legenda stato */}
              <div className="order-2 ml-auto flex shrink-0 items-center gap-1.5 text-[0.625rem] sm:order-3" style={{ color: '#ffffff' }}>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />{t.pending}</span>
                <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-cyan-500 inline-block" />{t.status_approved}</span>
              </div>

              {/* Centro: navigazione mese (frecce verso i bordi, mese sempre centrato) */}
              <div className="order-3 flex w-full items-center justify-between gap-1 sm:order-2 sm:w-auto sm:flex-1">
                <button
                  type="button"
                  onClick={() => setViewMonth((m) => subMonths(m, 1))}
                  aria-label={t.month_prev}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white active:bg-white/80"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden />
                </button>
                <h2 className="flex-1 whitespace-nowrap px-1 text-center font-semibold text-base uppercase" style={{ color: '#ffffff' }}>
                  {format(monthStart, 'MMMM yyyy', { locale: calLocale })}
                </h2>
                <button
                  type="button"
                  onClick={() => setViewMonth((m) => addMonths(m, 1))}
                  aria-label={t.month_next}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white active:bg-white/80"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </button>
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
                  dayStyle = { background: 'transparent', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.20)', color: '#ffffff', fontWeight: 700 };
                }
                
                return (
                  <div
                    key={day.toString()}
                    onClick={() => isPending && isAdmin && setSelectedH(holiday)}
                    className={`min-h-[2.75rem] min-w-[2.75rem] rounded-xl flex items-center justify-center text-xs font-semibold transition-colors select-none touch-target
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

          {/* ── KPI per stato (sotto il calendario) ────────────────────────── */}
          {uiW(isAdmin ? 'ferie.header' : 'staff_holidays.header_actions') && (
          <div className="mt-3 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {HOLIDAY_KPI.map((kpi) => {
                const isOpen = openKpi === kpi.key;
                return (
                  <button
                    type="button"
                    key={kpi.key}
                    onClick={() => setOpenKpi((v) => (v === kpi.key ? null : kpi.key))}
                    aria-expanded={isOpen}
                    className={`flex items-center justify-center gap-1.5 overflow-hidden rounded-2xl border px-2 py-2.5 transition-all ${kpi.bg} ${kpi.border} ${
                      isOpen ? 'ring-2 ring-white/40' : 'hover:brightness-110'
                    }`}
                  >
                    {/* Ordine richiesto: icona → numero → etichetta */}
                    <kpi.icon className={`h-4 w-4 shrink-0 ${kpi.color}`} aria-hidden />
                    <span className="text-base font-black leading-none text-white tabular-nums">{kpi.count}</span>
                    <span className={`whitespace-nowrap text-[0.5625rem] font-bold uppercase leading-none tracking-tight ${kpi.color}`}>
                      {kpi.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Dropdown: elenco richieste dello stato selezionato */}
            <AnimatePresence initial={false}>
              {activeKpi && (
                <motion.div
                  key={activeKpi.key}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="overflow-hidden rounded-2xl border border-white/[0.14] bg-white/[0.04]">
                    <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
                      <span className={`text-[0.6875rem] font-bold uppercase tracking-wider ${activeKpi.color}`}>
                        {activeKpi.label} · {activeKpi.count}
                      </span>
                      <button
                        type="button"
                        onClick={() => setOpenKpi(null)}
                        aria-label={t.close ?? 'Chiudi'}
                        className="flex h-6 w-6 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    {kpiList.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-white/60">{t.no_holidays_yet}</p>
                    ) : (
                      <div className="max-h-72 divide-y divide-white/5 overflow-y-auto">
                        {kpiList.map((h) => {
                          const u = users.find((x) => x.id === h.user_id);
                          return (
                            <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-3">
                              <div className="min-w-0">
                                {isAdmin && (
                                  <p className="truncate text-sm font-semibold text-white">
                                    {`${u?.first_name ?? ''} ${u?.last_name ?? ''}`.trim() || '—'}
                                  </p>
                                )}
                                <p className="text-xs text-white/70">
                                  {safeFormatDate(h.start_date, 'd MMM', { locale: calLocale })} – {safeFormatDate(h.end_date, 'd MMM yyyy', { locale: calLocale })}
                                  {h.reason && ` · ${h.reason}`}
                                </p>
                              </div>
                              {/* Azioni Approva/Rifiuta solo per le richieste in attesa e per chi approva */}
                              {isAdmin && activeKpi.key === 'pending' && (
                                <div className="ml-3 flex flex-shrink-0 items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(h.id, 'approved')}
                                    disabled={updatingId === h.id}
                                    aria-label={t.approve}
                                    className="gap-1 inline-flex items-center rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
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
                                    aria-label={t.rejected}
                                    className="gap-1 inline-flex items-center rounded-lg px-2.5 py-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                                    style={{ background: '#ef4444' }}
                                  >
                                    {updatingId === h.id ? (
                                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    ) : (
                                      <>
                                        <X className="h-3 w-3" strokeWidth={3} />
                                        {t.rejected}
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}

          {/* My requests list (staff only) */}
          {!isAdmin && uiW('staff_holidays.list') && (
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-white/[0.14] overflow-hidden">
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
                                title={t.holiday_delete_request}
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

        {/* Elenco staff (in colonna) */}
        <div className="w-full space-y-4">

          {/* Staff: my upcoming approved */}
          {!isAdmin && uiW('staff_holidays.list') && myHolidays.filter(h => h.status === 'approved' && new Date(h.end_date) >= new Date()).length > 0 && (
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-white/[0.14] overflow-hidden">
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
                      <span className="px-2 py-0.5 rounded-full bg-neutral-500/15 text-white/70 text-xs font-semibold uppercase border border-white/20">{t.status_approved}</span>
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
