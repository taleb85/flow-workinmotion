import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader2,
  CheckCircle2,
  User,
  Sun,
  Moon,
  Clock,
  Check,
  Delete,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useWallAlignedMinuteClock } from '../hooks/useWallAlignedMinuteClock';
import type { User as UserType, Shift, Language } from '../types';
import { format } from 'date-fns';
import { getTranslations, getDateLocale } from '../utils/translations';
import { roundToNext5Minutes } from '../utils/timeCalculations';
import { forceLightTheme } from '../utils/theme';
import { isPurelyManagementRole, canOperateTeamSchedule } from '../utils/permissions';
import { usePunchPresenceVerification } from '../hooks/usePunchPresenceVerification';

/** Terminale /timbratura: UI sempre in inglese (dispositivo condiviso in sala). */
const KIOSK_UI_LANGUAGE: Language = 'en';

interface PunchInKioskProps {
  onGoToLogin: () => void;
}

const cardVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { delay: i * 0.04, duration: 0.25 },
  }),
};

/** Logo Osteria Basilico - layout orizzontale (per overlay) */
function BrandLogo({ className = '', light }: { className?: string; light?: boolean }) {
  const textClass = light ? 'text-white' : 'text-slate-900';
  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1, transition: { duration: 0.4, ease: 'easeOut' } }}
        className={`flex-shrink-0 ${textClass}`}
      >
        <Clock className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={2} />
      </motion.div>
      <span className={`font-logo-snell text-xl sm:text-2xl font-medium tracking-tight ${textClass}`}>
        Osteria Basilico
      </span>
    </div>
  );
}

/** Logo Osteria Basilico - Snell Roundhand Bold, extra large, centrato (font preservato) + ombra nera chic */
function StraightLogo() {
  return (
    <h1 className="font-logo-snell text-7xl sm:text-8xl text-accent text-center mt-6 sm:mt-8 tracking-tight w-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.15)] [text-shadow:0_2px_8px_rgba(0,0,0,0.2),0_4px_16px_rgba(0,0,0,0.12)]">
      Osteria Basilico
    </h1>
  );
}

/** Header centrato: Logo + data/ora + eventuale azione sotto la data (font logo preservato) */
function GiantBrandHeader({ now, locale, children }: { now: Date; locale: ReturnType<typeof getDateLocale>; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col items-center justify-center py-4 sm:py-6 flex-shrink-0">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' } }}
        className="flex flex-col items-center w-full"
      >
        <StraightLogo />
        <p className="text-sm sm:text-base text-slate-600 font-sans font-semibold tracking-tight mt-2">
          {format(now, 'EEEE d MMMM · HH:mm', { locale })}
        </p>
        {children && <div className="mt-3 flex justify-center">{children}</div>}
      </motion.div>
    </header>
  );
}

export default function PunchInKiosk({ onGoToLogin }: PunchInKioskProps) {
  const { users, shifts, punchRecords, addPunchRecord, showError } = useApp();
  const { requestProof, modal: presenceModal } = usePunchPresenceVerification(KIOSK_UI_LANGUAGE);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  /** 'in' = timbratura entrata, 'out' = timbratura uscita (solo turni pranzo) */
  const [punchMode, setPunchMode] = useState<'in' | 'out'>('in');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successUserName, setSuccessUserName] = useState('');
  const [successPunchData, setSuccessPunchData] = useState<{ realTime: string; roundedTime: string; type: 'in' | 'out' } | null>(null);
  const hasAttemptedPunchRef = useRef(false);
  const [userWantsShiftList, setUserWantsShiftList] = useState(false);

  const t = getTranslations(KIOSK_UI_LANGUAGE);
  const dateLocale = getDateLocale(KIOSK_UI_LANGUAGE);

  const now = useWallAlignedMinuteClock();
  const todayStr = format(now, 'yyyy-MM-dd');

  const todayShifts = useMemo(
    () =>
      shifts.filter((s) => {
        if (s.approval_status !== 'approved' && s.approval_status !== 'confirmed') return false;
        return s.date === todayStr;
      }),
    [shifts, todayStr]
  );

  const isPunched = useCallback(
    (shift: Shift) =>
      punchRecords.some(
        (r) =>
          r.type === 'in' &&
          (r.shift_id === shift.id || (r.user_id === shift.user_id && r.timestamp.startsWith(shift.date)))
      ),
    [punchRecords]
  );

  /** Controlla se esiste una timbratura di uscita per questo turno. */
  const isPunchedOut = useCallback(
    (shift: Shift) =>
      punchRecords.some(
        (r) =>
          r.type === 'out' &&
          (r.shift_id === shift.id || (r.user_id === shift.user_id && r.timestamp.startsWith(shift.date)))
      ),
    [punchRecords]
  );

  /**
   * "Completato" dal punto di vista del dipendente al kiosk:
   * - Turno PRANZO: richiede sia entrata che uscita.
   * - Turno CENA: solo entrata (l'uscita è inserita dal Manager).
   */
  const isEmployeeDone = useCallback(
    (shift: Shift) => {
      if (!isPunched(shift)) return false;
      if (shift.type === 'dinner') return true;
      return isPunchedOut(shift);
    },
    [isPunched, isPunchedOut]
  );

  const employeesWithShifts = useMemo(() => {
    const byUser = new Map<string, { user: UserType; shifts: Shift[] }>();
    for (const shift of todayShifts) {
      const user = users.find((u) => u.id === shift.user_id);
      if (!user || isPurelyManagementRole(user.role) || user.status !== 'active') continue;
      if (!byUser.has(user.id)) byUser.set(user.id, { user, shifts: [] });
      byUser.get(user.id)!.shifts.push(shift);
    }
    return Array.from(byUser.values())
      .sort((a, b) => (a.user.sort_order ?? 0) - (b.user.sort_order ?? 0))
      .map(({ user, shifts: s }) => ({
        user,
        shifts: s.sort((a, b) => new Date(`${a.date}T${a.start_time}`).getTime() - new Date(`${b.date}T${b.start_time}`).getTime()),
        // "Completato" = tutti i turni hanno le timbrature richieste dal dipendente
        allPunched: s.every((sh) => isEmployeeDone(sh)),
      }));
  }, [todayShifts, users, isEmployeeDone]);

  const selectedUserShifts = useMemo(() => {
    if (!selectedUser) return [];
    return todayShifts
      .filter((s) => s.user_id === selectedUser.id)
      .sort((a, b) => new Date(`${a.date}T${a.start_time}`).getTime() - new Date(`${b.date}T${b.start_time}`).getTime());
  }, [selectedUser, todayShifts]);

  const unpunchedShifts = useMemo(
    () => selectedUserShifts.filter((s) => !isPunched(s)),
    [selectedUserShifts, isPunched]
  );
  /**
   * Turno "ovvio" e azione suggerita:
   * 1. Pranzo già timbrato IN ma non OUT → azione 'out' (priorità massima)
   * 2. Turno unpunched entro ±60 min dall'inizio → azione 'in'
   */
  const obviousShift = useMemo((): Shift | null => {
    if (!selectedUser) return null;
    const nowM = now.getHours() * 60 + now.getMinutes();
    const WINDOW_MIN = 60;

    // Priorità 1: pranzo in attesa di uscita
    const lunchAwaitingOut = selectedUserShifts.filter(
      (s) => s.type === 'lunch' && isPunched(s) && !isPunchedOut(s)
    );
    if (lunchAwaitingOut.length > 0) return lunchAwaitingOut[0];

    // Priorità 2: turno non ancora timbrato nella finestra temporale
    const inWindow = unpunchedShifts.filter((s) => {
      const [sh, sm] = s.start_time.split(':').map(Number);
      const startM = sh * 60 + (sm || 0);
      return Math.abs(nowM - startM) <= WINDOW_MIN;
    });
    if (inWindow.length > 0) {
      if (inWindow.length === 1) return inWindow[0];
      return inWindow.reduce((best, s) => {
        const [sh, sm] = s.start_time.split(':').map(Number);
        const startM = sh * 60 + (sm || 0);
        const dist = Math.abs(nowM - startM);
        const [bh, bm] = best.start_time.split(':').map(Number);
        const bestDist = Math.abs(nowM - (bh * 60 + (bm || 0)));
        return dist < bestDist ? s : best;
      });
    }

    return null;
  }, [selectedUser, selectedUserShifts, unpunchedShifts, now, isPunched, isPunchedOut]);

  useEffect(() => {
    forceLightTheme();
  }, []);

  /** Auto-selezione: se c'è un turno ovvio e l'utente non ha cliccato "Cambia turno", salta alla schermata PIN */
  useEffect(() => {
    if (selectedUser && obviousShift && !userWantsShiftList) {
      setSelectedShift(obviousShift);
      // Determina la modalità in base allo stato del turno
      const isLunchAwaitingOut = obviousShift.type === 'lunch' && isPunched(obviousShift) && !isPunchedOut(obviousShift);
      setPunchMode(isLunchAwaitingOut ? 'out' : 'in');
    }
  }, [selectedUser, obviousShift, userWantsShiftList, isPunched, isPunchedOut]);

  const suggestedShift = useMemo(() => {
    if (unpunchedShifts.length === 0) return null;
    if (unpunchedShifts.length === 1) return unpunchedShifts[0];
    const nowM = now.getHours() * 60 + now.getMinutes();
    return unpunchedShifts.reduce((best, s) => {
      const [sh, sm] = s.start_time.split(':').map(Number);
      const startM = sh * 60 + (sm || 0);
      const dist = Math.abs(nowM - startM);
      const [bh, bm] = best.start_time.split(':').map(Number);
      const bestDist = Math.abs(nowM - (bh * 60 + (bm || 0)));
      return dist < bestDist ? s : best;
    });
  }, [unpunchedShifts, now]);

  const validatePinForShift = useCallback(
    (pinValue: string, shift: Shift): { user: UserType } | { error: string } => {
      const user = users.find((u) => u.pin === pinValue);
      if (!user) return { error: t.pin_invalid };
      if (user.status !== 'active') return { error: t.user_suspended_punch };
      const canPunchForOthers = canOperateTeamSchedule(user);
      if (!canPunchForOthers && user.id !== shift.user_id) return { error: t.pin_mismatch };
      return { user };
    },
    [users, t.pin_mismatch, t.pin_invalid, t.user_suspended_punch]
  );

  const handlePunchIn = useCallback(
    async (user: UserType, shift: Shift) => {
      if (!shift?.id || !shift?.start_time || !shift?.user_id || !user?.id) {
        setError(t.punch_error);
        showError(t.punch_save_error);
        setTimeout(() => setError(''), 2500);
        return;
      }
      if (isPunched(shift)) {
        setError(t.already_punched);
        setTimeout(() => { setError(''); setPin(''); setSelectedShift(null); }, 1500);
        return;
      }
      const employeeId = shift.user_id;
      const clickTimestamp = new Date().toISOString();
      setIsLoading(true);
      setError('');
      try {
        let presenceProof: string | undefined;
        try {
          const proof = await requestProof(employeeId);
          presenceProof = proof || undefined;
        } catch (e) {
          if (e instanceof Error && e.message === 'presence_cancelled') {
            setError(t.punch_presence_cancelled);
            showError(t.punch_presence_cancelled);
            setPin('');
            setTimeout(() => setError(''), 3500);
            return;
          }
          throw e;
        }
        const geoIn = await addPunchRecord(employeeId, 'in', {
          timestamp: clickTimestamp,
          shift_id: shift.id,
          presenceProof,
        });
        if (geoIn && typeof geoIn === 'object' && 'error' in geoIn && geoIn.error) {
          setError(geoIn.error);
          showError(geoIn.error);
          setPin('');
          setTimeout(() => setError(''), 3500);
          return;
        }
        const clickDate = new Date(clickTimestamp);
        const realTimeStr = `${String(clickDate.getHours()).padStart(2, '0')}:${String(clickDate.getMinutes()).padStart(2, '0')}`;
        const roundedTimeStr = roundToNext5Minutes(realTimeStr);
        const employee = users.find((u) => u.id === employeeId);
        setSuccessUserName((employee?.first_name ?? user.first_name).toUpperCase());
        setSuccessPunchData({ realTime: realTimeStr, roundedTime: roundedTimeStr, type: 'in' });
        setSelectedShift(null);
        setSelectedUser(null);
        setPin('');
        setTimeout(() => {
          setSuccessUserName('');
          setSuccessPunchData(null);
        }, 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : t.punch_error;
        const is400 = String(err).includes('400') || String(err).includes('Bad Request');
        const isRls = String(err).includes('permission') || String(err).includes('RLS') || String(err).includes('row-level');
        const toastMsg = is400
          ? t.punch_db_error_400
          : isRls
            ? t.punch_db_error_rls
            : t.punch_save_error;
        setError(is400 ? toastMsg : msg);
        showError(toastMsg);
        setPin('');
        setTimeout(() => setError(''), 2500);
      } finally {
        setIsLoading(false);
      }
    },
    [
      t.punch_error,
      t.punch_save_error,
      t.already_punched,
      t.punch_db_error_400,
      t.punch_db_error_rls,
      t.punch_presence_cancelled,
      addPunchRecord,
      requestProof,
      showError,
      users,
      isPunched,
    ]
  );

  /** Registra la timbratura di USCITA per i turni PRANZO. La cena è manager-only. */
  const handlePunchOut = useCallback(
    async (user: UserType, shift: Shift) => {
      if (shift.type !== 'lunch') {
        setError(t.punch_dinner_exit_contact_manager);
        setTimeout(() => setError(''), 2500);
        return;
      }
      const employeeId = shift.user_id;
      const clickTimestamp = new Date().toISOString();
      setIsLoading(true);
      setError('');
      try {
        let presenceProof: string | undefined;
        try {
          const proof = await requestProof(employeeId);
          presenceProof = proof || undefined;
        } catch (e) {
          if (e instanceof Error && e.message === 'presence_cancelled') {
            setError(t.punch_presence_cancelled);
            showError(t.punch_presence_cancelled);
            setPin('');
            setTimeout(() => setError(''), 3500);
            return;
          }
          throw e;
        }
        const geoOut = await addPunchRecord(employeeId, 'out', {
          timestamp: clickTimestamp,
          shift_id: shift.id,
          presenceProof,
        });
        if (geoOut && typeof geoOut === 'object' && 'error' in geoOut && geoOut.error) {
          setError(geoOut.error);
          showError(geoOut.error);
          setPin('');
          setTimeout(() => setError(''), 3500);
          return;
        }
        const clickDate = new Date(clickTimestamp);
        const realTimeStr = `${String(clickDate.getHours()).padStart(2, '0')}:${String(clickDate.getMinutes()).padStart(2, '0')}`;
        const roundedTimeStr = roundToNext5Minutes(realTimeStr);
        const employee = users.find((u) => u.id === employeeId);
        setSuccessUserName((employee?.first_name ?? user.first_name).toUpperCase());
        setSuccessPunchData({ realTime: realTimeStr, roundedTime: roundedTimeStr, type: 'out' });
        setPunchMode('in');
        setSelectedShift(null);
        setSelectedUser(null);
        setPin('');
        setTimeout(() => {
          setSuccessUserName('');
          setSuccessPunchData(null);
        }, 3000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : t.punch_error;
        setError(msg);
        showError(t.punch_save_error);
        setPin('');
        setTimeout(() => setError(''), 2500);
      } finally {
        setIsLoading(false);
      }
    },
    [
      addPunchRecord,
      requestProof,
      showError,
      users,
      t.punch_error,
      t.punch_save_error,
      t.punch_dinner_exit_contact_manager,
      t.punch_presence_cancelled,
    ]
  );

  useEffect(() => {
    if (hasAttemptedPunchRef.current) return;
    if (pin.length === 4 && !isLoading && selectedShift && selectedUser) {
      const result = validatePinForShift(pin, selectedShift);
      if ('user' in result) {
        hasAttemptedPunchRef.current = true;
        if (punchMode === 'out') {
          handlePunchOut(result.user, selectedShift);
        } else {
          handlePunchIn(result.user, selectedShift);
        }
      } else {
        setError(result.error);
        setTimeout(() => {
          setPin('');
          setError('');
        }, 1500);
      }
    }
  }, [pin, isLoading, selectedShift, selectedUser, validatePinForShift, handlePunchIn, handlePunchOut, punchMode]);

  useEffect(() => {
    hasAttemptedPunchRef.current = false;
  }, [pin]);

  const closeOverlay = () => {
    setSelectedUser(null);
    setSelectedShift(null);
    setUserWantsShiftList(false);
    setPunchMode('in');
    setPin('');
    setError('');
  };

  return (
    <div className="min-h-screen overflow-hidden bg-surface flex flex-col p-6 sm:p-8 relative">
      <GiantBrandHeader now={now} locale={dateLocale}>
        <button
          type="button"
          onClick={onGoToLogin}
          className="group flex items-center gap-2 rounded-xl border-2 border-slate-300 bg-transparent px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08),0_1px_3px_-1px_rgba(15,23,42,0.05)] transition-[color,background-color,border-color,box-shadow,transform] hover:border-accent/60 hover:bg-accent/10 hover:text-accent hover:shadow-[0_4px_12px_-3px_rgba(15,23,42,0.1),0_2px_5px_-2px_rgba(45,90,39,0.06)] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2"
        >
          <User className="h-4 w-4 shrink-0 text-slate-500 transition-colors group-hover:text-accent" strokeWidth={2} />
          {t.area_personale}
        </button>
      </GiantBrandHeader>

      <motion.div
        className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto flex flex-col items-center justify-center px-2 sm:px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        {employeesWithShifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center">
            <p className="text-sm font-sans font-semibold text-slate-600">{t.waiting_publication}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 w-full max-w-md mx-auto">
            {employeesWithShifts.map(({ user, shifts: userShifts, allPunched }, i) => {
              const nowMinutes = now.getHours() * 60 + now.getMinutes();

              // Calcola stato per ogni turno
              const shiftStatuses = userShifts.map((shift) => {
                const [sh, sm] = shift.start_time.split(':').map(Number);
                const [eh, em] = (shift.end_time || '00:00').split(':').map(Number);
                const startM = sh * 60 + (sm || 0);
                const endM = eh * 60 + (em || 0);
                const isOvernight = endM <= startM;
                const inProgress = isOvernight
                  ? nowMinutes >= startM || nowMinutes < endM
                  : nowMinutes >= startM && nowMinutes < endM;
                const nearStart = nowMinutes >= startM - 15 && nowMinutes < startM + 5;
                const punched = isPunched(shift);
                const punchedOut = isPunchedOut(shift);
                // "done" per il dipendente: pranzo = IN+OUT, cena = solo IN
                const done = isEmployeeDone(shift);
                const awaitingLunchOut = shift.type === 'lunch' && punched && !punchedOut;
                const dinnerInProgress = shift.type === 'dinner' && punched && !punchedOut;
                const timeStr = `${shift.start_time.slice(0, 5)}–${shift.end_time ? shift.end_time.slice(0, 5) : '--:--'}`;
                return { shift, startM, endM, inProgress, nearStart, punched, done, awaitingLunchOut, dinnerInProgress, timeStr };
              });

              // Azione suggerita globale
              const lunchAwaitingOut = shiftStatuses.find((s) => s.awaitingLunchOut);
              const dinnerActive = shiftStatuses.find((s) => s.dinnerInProgress);
              const nextShift = shiftStatuses.find((s) => !s.punched);
              const actionLabel = allPunched
                ? null
                : lunchAwaitingOut
                  ? { label: t.punch_clock_out_label, color: 'bg-amber-50 text-amber-700 border-amber-200' }
                  : dinnerActive
                    ? { label: t.punch_in_shift_label, color: 'bg-blue-50 text-blue-700 border-blue-200' }
                    : nextShift
                      ? { label: t.punch_clock_in_label, color: 'bg-accent/10 text-accent border-accent/20' }
                      : null;

              // Colore bordo sinistro
              const borderColor = allPunched
                ? 'border-l-accent'
                : lunchAwaitingOut
                  ? 'border-l-amber-400'
                  : dinnerActive
                    ? 'border-l-blue-400'
                    : nextShift?.nearStart || nextShift?.inProgress
                      ? 'border-l-accent'
                      : 'border-l-slate-200';

              return (
                <motion.button
                  key={user.id}
                  custom={i}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                  onClick={() => setSelectedUser(user)}
                  whileTap={{ scale: 0.98 }}
                  className={`w-full flex flex-col px-5 py-3.5 rounded-2xl bg-white border border-slate-100 border-l-4 ${borderColor} shadow-sm hover:shadow-md transition-all cursor-pointer font-sans text-left`}
                >
                  {/* Riga 1: nome + badge azione */}
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-slate-900 uppercase truncate text-base">
                        {user.first_name.toUpperCase()}
                      </span>
                      {allPunched && (
                        <Check className="w-4 h-4 flex-shrink-0 text-accent" strokeWidth={2.5} />
                      )}
                    </div>
                    {actionLabel && (
                      <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide ${actionLabel.color}`}>
                        {actionLabel.label}
                      </span>
                    )}
                    {allPunched && (
                      <span className="flex-shrink-0 px-2.5 py-0.5 rounded-full border border-accent/20 bg-accent/10 text-accent text-[11px] font-semibold uppercase tracking-wide">
                        {t.punch_completed_badge}
                      </span>
                    )}
                  </div>

                  {/* Riga 2: turni con stato */}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {shiftStatuses.map(({ shift, done, awaitingLunchOut, dinnerInProgress, inProgress, nearStart: ns, timeStr }) => {
                      const dotColor = done
                        ? 'bg-accent'
                        : awaitingLunchOut
                          ? 'bg-amber-400 animate-pulse'
                          : dinnerInProgress
                            ? 'bg-blue-400 animate-pulse'
                            : inProgress || ns
                              ? 'bg-accent/50'
                              : 'bg-slate-200';
                      const textColor = done
                        ? 'text-accent'
                        : awaitingLunchOut
                          ? 'text-amber-600'
                          : dinnerInProgress
                            ? 'text-blue-600'
                            : inProgress || ns
                              ? 'text-slate-700'
                              : 'text-slate-400';
                      return (
                        <span key={shift.id} className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                          <span className={`text-xs font-medium uppercase ${textColor}`}>{timeStr}</span>
                          {done && <Check className="w-3 h-3 text-accent flex-shrink-0" strokeWidth={2.5} />}
                          {awaitingLunchOut && <span className="text-[10px] text-amber-500 font-semibold">{t.punch_exit_question}</span>}
                          {dinnerInProgress && <span className="text-[10px] text-blue-500 font-semibold">{t.punch_in_shift_small}</span>}
                        </span>
                      );
                    })}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Overlay: Selezione turno o PIN */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4"
            onClick={() => !selectedShift && !isLoading && closeOverlay()}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md card-factorial overflow-hidden !p-0"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-50">
                <h2 className="text-lg font-semibold text-slate-900 uppercase font-sans tracking-wider">
                  {selectedUser.first_name.toUpperCase()}
                </h2>
                <button
                  onClick={closeOverlay}
                  disabled={isLoading}
                  className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
                  aria-label={t.cancel}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4">
                {!selectedShift ? (
                  /* Lista turni: mostra IN per turni non timbrati, OUT per pranzo in attesa, blocca cena in corso */
                  <div className="space-y-2">
                    {selectedUserShifts.map((shift, i) => {
                      const punched = isPunched(shift);
                      const punchedOut = isPunchedOut(shift);
                      const done = isEmployeeDone(shift);
                      const awaitingLunchOut = shift.type === 'lunch' && punched && !punchedOut;
                      const dinnerInProgress = shift.type === 'dinner' && punched;
                      const isSuggested = !done && !dinnerInProgress && (shift.id === suggestedShift?.id || awaitingLunchOut);
                      const isDayShift = shift.type === 'lunch';
                      // Selezionabile: non completato E non cena in corso
                      const isSelectable = !done && !dinnerInProgress;

                      return (
                        <motion.button
                          key={shift.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          onClick={() => {
                            if (!isSelectable) return;
                            if (awaitingLunchOut) {
                              setPunchMode('out');
                            } else {
                              setPunchMode('in');
                            }
                            setSelectedShift(shift);
                          }}
                          disabled={!isSelectable}
                          className={`w-full px-4 py-3 rounded-xl flex items-center gap-3 text-left transition-all duration-300 border ${
                            done
                              ? 'bg-slate-50 border-slate-100 cursor-default'
                              : dinnerInProgress
                                ? 'bg-blue-50 border-blue-100 cursor-default'
                                : awaitingLunchOut
                                  ? 'bg-amber-50 border-amber-200 cursor-pointer hover:bg-amber-100'
                                  : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                          } ${isSuggested ? 'ring-2 ring-accent/40' : ''}`}
                        >
                          <span className={`flex-shrink-0 ${done ? 'text-accent' : awaitingLunchOut ? 'text-amber-500' : dinnerInProgress ? 'text-blue-400' : isDayShift ? 'text-amber-500' : 'text-slate-400'}`}>
                            {isDayShift ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                          </span>
                          <span className="flex items-center gap-2 flex-1 text-base font-medium text-slate-700">
                            <Clock className="w-4 h-4 text-slate-400" />
                            {shift.start_time.slice(0, 5)} — {shift.end_time ? shift.end_time.slice(0, 5) : '--:--'}
                          </span>
                          {done ? (
                            <Check className="w-5 h-5 text-accent flex-shrink-0" />
                          ) : awaitingLunchOut ? (
                            <span className="text-xs font-semibold text-amber-600 uppercase flex-shrink-0">{t.punch_clock_out_label}</span>
                          ) : dinnerInProgress ? (
                            <span className="text-xs font-medium text-blue-500 flex-shrink-0">{t.punch_in_shift_label}</span>
                          ) : isSuggested ? (
                            <span className="text-xs font-medium text-accent uppercase flex-shrink-0">{t.punch_suggested}</span>
                          ) : null}
                        </motion.button>
                      );
                    })}
                  </div>
                ) : (
                  /* Tastierino PIN con design vetro */
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                  >
                    <motion.div
                      initial={{ opacity: 0, y: -12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05, type: 'spring', stiffness: 400, damping: 28 }}
                      className="flex justify-center mb-2"
                    >
                      <BrandLogo className="flex-shrink-0" light={false} />
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1, type: 'spring', stiffness: 400, damping: 28 }}
                      className="flex items-center justify-between"
                    >
                      <button
                        onClick={() => setSelectedShift(null)}
                        disabled={isLoading}
                        className="flex items-center gap-2 text-slate-600 hover:text-slate-900 text-sm font-medium font-sans"
                      >
                        <X className="w-4 h-4" />
                        {t.cancel}
                      </button>
                      <button
                        onClick={() => { setUserWantsShiftList(true); setSelectedShift(null); }}
                        disabled={isLoading}
                        className="text-slate-500 hover:text-slate-700 text-xs font-medium font-sans underline"
                      >
                        {t.change_shift}
                      </button>
                    </motion.div>
                    <motion.p
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15, type: 'spring', stiffness: 400, damping: 28 }}
                      className="text-slate-900 font-semibold text-base text-center font-sans w-full"
                    >
                      {punchMode === 'out' ? t.punch_clock_out_label : t.punch_for_shift_at} {selectedShift.start_time.slice(0, 5)}
                      {selectedShift.end_time ? ` — ${selectedShift.end_time.slice(0, 5)}` : ''}
                    </motion.p>
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2, type: 'spring', stiffness: 400, damping: 28 }}
                      className="flex flex-col items-center gap-2"
                    >
                      <div className="flex items-center gap-2 text-slate-600">
                        <ShieldCheck className="w-5 h-5 text-accent" />
                        <span className="text-xs font-medium uppercase tracking-wider font-sans">{t.pin_for_shift}</span>
                      </div>
                      <div className="relative w-full">
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: 0.22, type: 'spring', stiffness: 400, damping: 28 }}
                          className="relative"
                        >
                          <motion.div
                            animate={pin.length === 4 ? { scale: [1, 1.02, 1] } : {}}
                            transition={{ duration: 0.3 }}
                            className="relative"
                          >
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          value={pin}
                          onChange={(e) => (setPin(e.target.value), setError(''))}
                          disabled={isLoading}
                          autoFocus
                          className="w-full px-6 py-5 rounded-xl bg-white border border-slate-200 focus:ring-2 focus:ring-accent/25 focus:border-accent outline-none font-medium text-4xl text-center tracking-[0.5em] text-slate-900 transition-all"
                          placeholder="••••"
                        />
                        {isLoading && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/90 backdrop-blur">
                            <Loader2 className="w-10 h-10 text-accent animate-spin" />
                          </div>
                        )}
                          </motion.div>
                        </motion.div>
                      </div>
                    </motion.div>
                    <motion.div
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25, type: 'spring', stiffness: 400, damping: 28 }}
                      className="grid grid-cols-3 gap-2"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'].map((n, idx) => (
                        <motion.button
                          key={idx}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            if (n === 'del') {
                              setPin((p) => p.slice(0, -1));
                              setError('');
                            } else if (typeof n === 'number' && pin.length < 4) {
                              setPin((p) => p + String(n));
                              setError('');
                            }
                          }}
                          disabled={isLoading || (typeof n === 'number' && pin.length >= 4)}
                          className={`aspect-square rounded-xl flex items-center justify-center font-medium text-xl transition-all font-sans ${
                            n === 'del'
                              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                              : 'bg-white border border-slate-200 text-slate-900 hover:bg-slate-50'
                          }`}
                        >
                          {n === 'del' ? <Delete className="w-6 h-6" /> : n}
                        </motion.button>
                      ))}
                    </motion.div>
                    {error && (
                      <p className="text-red-500 text-sm font-medium text-center font-sans">{error}</p>
                    )}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay Success */}
      <AnimatePresence>
        {successUserName && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-[110] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="card-factorial p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
              >
                <CheckCircle2 className="w-16 h-16 text-accent mx-auto mb-4" strokeWidth={2} />
              </motion.div>
              <p className="text-2xl font-semibold text-slate-900 font-sans">
                {successPunchData?.type === 'out' ? t.punch_exit_registered_comma : t.good_work} {successUserName}!
              </p>
              {successPunchData && (
                <div className="mt-4 text-sm text-slate-600 font-sans space-y-1">
                  <p>{t.registered_at} {successPunchData.realTime}</p>
                  {successPunchData.type === 'in' && (
                    <p>{t.hours_calc_from}: {successPunchData.roundedTime}</p>
                  )}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {presenceModal}
    </div>
  );
}
