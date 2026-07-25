import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2,
  User,
  Sun,
  Moon,
  Clock,
  Check,
  Smartphone,
  X,
} from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppData } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';

import { useWallAlignedMinuteClock } from '../hooks/useWallAlignedMinuteClock';
import type { User as UserType, Shift, Language } from '../types';
import { format } from 'date-fns';
import { getTranslations, getDateLocale } from '../utils/translations';
import { roundToNext5Minutes } from '../utils/timeCalculations';
import { applyUnauthenticatedDocumentTheme } from '../utils/theme';
import { isPurelyManagementRole, canOperateTeamSchedule } from '../utils/permissions';
import { usePunchPresenceVerification } from '../hooks/usePunchPresenceVerification';

import { PinPadModal } from './ui/PinPadModal';
import { FlowNeonIcon } from './ui/FlowNeonIcon';

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

/** Badge «CLOCK IN» e bordo evidenziazione: da 60 min prima dell’inizio turno (prima 15 min). */
const KIOSK_CLOCK_IN_LEAD_MINUTES = 60;

function startTimeToMinutes(hhmm: string): number {
  const [h, m] = (hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Con più turni ancora da timbrare (IN), ne mostra uno solo: quello con inizio più vicino all’ora attuale.
 * Restano sempre visibili: completati, pranzo in attesa di OUT, cena con IN già registrato (stato kiosk).
 * Se `showAll`, nessun filtro (es. dopo «Cambia turno»).
 */
function filterShiftsToClosestUnpunched(
  shifts: Shift[],
  now: Date,
  opts: {
    isPunched: (s: Shift) => boolean;
    isPunchedOut: (s: Shift) => boolean;
    isEmployeeDone: (s: Shift) => boolean;
  },
  showAll: boolean
): Shift[] {
  if (showAll || shifts.length <= 1) return shifts;

  const nowM = now.getHours() * 60 + now.getMinutes();

  const rows = shifts.map((shift) => {
    const punched = opts.isPunched(shift);
    const punchedOut = opts.isPunchedOut(shift);
    const done = opts.isEmployeeDone(shift);
    const awaitingLunchOut = shift.type === 'lunch' && punched && !punchedOut;
    const dinnerInProgress = shift.type === 'dinner' && punched;
    const unpunchedInCandidate = !done && !dinnerInProgress && !awaitingLunchOut && !punched;
    return { shift, done, awaitingLunchOut, dinnerInProgress, unpunchedInCandidate };
  });

  const unpunchedCandidates = rows.filter((r) => r.unpunchedInCandidate).map((r) => r.shift);
  if (unpunchedCandidates.length <= 1) return shifts;

  const closest = unpunchedCandidates.reduce((best, s) => {
    const dist = Math.abs(nowM - startTimeToMinutes(s.start_time.slice(0, 5)));
    const bestDist = Math.abs(nowM - startTimeToMinutes(best.start_time.slice(0, 5)));
    if (dist < bestDist) return s;
    if (dist > bestDist) return best;
    return startTimeToMinutes(s.start_time.slice(0, 5)) <= startTimeToMinutes(best.start_time.slice(0, 5))
      ? s
      : best;
  });

  return shifts.filter((s) => {
    const r = rows.find((x) => x.shift.id === s.id);
    if (!r) return true;
    if (r.done || r.awaitingLunchOut || r.dinnerInProgress) return true;
    if (r.unpunchedInCandidate) return s.id === closest.id;
    return true;
  });
}

/** Logo FLOW con ring neon — centrato, grande, per la testata del kiosk */
function StraightLogo() {
  return (
    <div className="flex flex-col items-center justify-center mt-4 sm:mt-6 gap-3">
      <FlowNeonIcon
        size={112}
        progress={1}
        transition={{ duration: 2.4, ease: 'easeInOut', repeat: Infinity, repeatType: 'loop', repeatDelay: 0.5 }}
        idPrefix="kiosk-header"
      />
    </div>
  );
}

/** Header centrato: FlowLogo + data/ora + eventuale azione sotto la data */
function GiantBrandHeader({ now, locale, children }: { now: Date; locale: ReturnType<typeof getDateLocale>; children?: React.ReactNode }) {
  return (
    <header className="flex flex-col items-center justify-center py-4 sm:py-6 flex-shrink-0">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1, transition: { duration: 0.5, ease: 'easeOut' } }}
        className="flex flex-col items-center w-full"
      >
        <StraightLogo />
        <p className="text-sm sm:text-base text-white/70 font-sans font-semibold tracking-tight mt-3">
          {format(now, 'EEEE d MMMM · HH:mm', { locale })}
        </p>
        {children && <div className="mt-3 flex justify-center">{children}</div>}
      </motion.div>
    </header>
  );
}

export default function PunchInKiosk({ onGoToLogin }: PunchInKioskProps) {
  const { users } = useAppUser();
  const { shifts, punchRecords, addPunchRecord } = useAppData();
  const { showError } = useAppOverlay();


  const { requestProof, modal: presenceModal } = usePunchPresenceVerification(KIOSK_UI_LANGUAGE);
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  /** 'in' = timbratura entrata, 'out' = timbratura uscita */
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
        if (s.approval_status !== 'confirmed') return false;
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
   * Richiede sia entrata che uscita per ogni tipo di turno.
   */
  const isEmployeeDone = useCallback(
    (shift: Shift) => {
      return isPunched(shift) && isPunchedOut(shift);
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

  /** In overlay: un solo turno «prossimo» salvo dopo «Cambia turno» (`userWantsShiftList`). */
  const shiftsForPickList = useMemo(
    () =>
      filterShiftsToClosestUnpunched(
        selectedUserShifts,
        now,
        { isPunched, isPunchedOut, isEmployeeDone },
        userWantsShiftList
      ),
    [selectedUserShifts, now, isPunched, isPunchedOut, isEmployeeDone, userWantsShiftList]
  );

  const unpunchedShifts = useMemo(
    () => selectedUserShifts.filter((s) => !isPunched(s)),
    [selectedUserShifts, isPunched]
  );
  /**
   * Turno "ovvio" e azione suggerita:
   * 1. Turno già timbrato IN ma non OUT → azione 'out' (priorità massima)
   * 2. Turno unpunched entro ±60 min dall'inizio → azione 'in'
   */
  const obviousShift = useMemo((): Shift | null => {
    if (!selectedUser) return null;
    const nowM = now.getHours() * 60 + now.getMinutes();
    const WINDOW_MIN = 60;

    // Priorità 1: turno in attesa di uscita
    const awaitingOut = selectedUserShifts.filter(
      (s) => isPunched(s) && !isPunchedOut(s)
    );
    if (awaitingOut.length > 0) return awaitingOut[0];

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
    applyUnauthenticatedDocumentTheme();
    // Il kiosk è un terminale condiviso: forza sempre la modalità dark.
    document.documentElement.classList.add('dark');
  }, []);

  /** Auto-selezione: se c'è un turno ovvio e l'utente non ha cliccato "Cambia turno", salta alla schermata PIN */
  useEffect(() => {
    if (selectedUser && obviousShift && !userWantsShiftList && !showWelcome) {
      setSelectedShift(obviousShift);
      // Determina la modalità in base allo stato del turno
      const isAwaitingOut = isPunched(obviousShift) && !isPunchedOut(obviousShift);
      setPunchMode(isAwaitingOut ? 'out' : 'in');
    }
  }, [selectedUser, obviousShift, userWantsShiftList, showWelcome, isPunched, isPunchedOut]);

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

  /** Registra la timbratura di USCITA tramite QR code. */
  const handlePunchOut = useCallback(
    async (user: UserType, shift: Shift) => {
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
    setShowWelcome(false);
    setUserWantsShiftList(false);
    setPunchMode('in');
    setPin('');
    setError('');
  };

  return (
    <div
      className="min-h-screen overflow-hidden text-neutral-100 flex flex-col p-6 sm:p-8 relative"
      style={{ background: 'transparent' }}
    >
      <GiantBrandHeader now={now} locale={dateLocale}>
        <button
          type="button"
          onClick={onGoToLogin}
className="group flex items-center gap-2 rounded-xl border-2 border-brand-deep/30 bg-brand-deep/8 px-4 py-2.5 text-xs font-semibold text-brand-deep shadow-[0_2px_8px_-2px_rgba(0,26,128,0.12)] transition-[color,background-color,border-color,box-shadow,transform] hover:border-brand-deep/60 hover:bg-brand-deep/15 hover:shadow-[0_4px_12px_-3px_rgba(0,26,128,0.2)] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
        >
          <User className="h-4 w-4 shrink-0 text-brand-deep" strokeWidth={2} />
          {t.area_personale}
        </button>
      </GiantBrandHeader>

      <motion.div
        className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto flex flex-col items-stretch justify-center px-2 sm:px-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-center min-h-0">
        {employeesWithShifts.length === 0 ? (
          <div className="flex flex-col items-center justify-center">
            <p className="text-sm font-sans font-semibold text-white/70">{t.waiting_publication}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 w-full max-w-md mx-auto">
            {employeesWithShifts.map(({ user, shifts: userShifts, allPunched }, i) => {
              const nowMinutes = now.getHours() * 60 + now.getMinutes();

              const visibleShifts = filterShiftsToClosestUnpunched(
                userShifts,
                now,
                { isPunched, isPunchedOut, isEmployeeDone },
                false
              );

              // Calcola stato per ogni turno (solo quelli mostrati in elenco)
              const shiftStatuses = visibleShifts.map((shift) => {
                const [sh, sm] = shift.start_time.split(':').map(Number);
                const [eh, em] = (shift.end_time || '00:00').split(':').map(Number);
                const startM = sh * 60 + (sm || 0);
                const endM = eh * 60 + (em || 0);
                const isOvernight = endM <= startM;
                const inProgress = isOvernight
                  ? nowMinutes >= startM || nowMinutes < endM
                  : nowMinutes >= startM && nowMinutes < endM;
                const nearStart =
                  nowMinutes >= startM - KIOSK_CLOCK_IN_LEAD_MINUTES && nowMinutes < startM + 5;
                const punched = isPunched(shift);
                const punchedOut = isPunchedOut(shift);
                // "done" per il dipendente: IN+OUT
                const done = isEmployeeDone(shift);
                const awaitingOut = punched && !punchedOut;
                const timeStr = `${shift.start_time.slice(0, 5)}–${shift.end_time ? shift.end_time.slice(0, 5) : '--:--'}`;
                return { shift, startM, endM, inProgress, nearStart, punched, done, awaitingOut, timeStr };
              });

              // Azione suggerita globale
              const awaitingOut = shiftStatuses.find((s) => s.awaitingOut);
              const nextShift = shiftStatuses.find((s) => !s.punched);
              const actionLabel = allPunched
                ? null
                : awaitingOut
                  ? {
                      label: t.punch_clock_out_label,
                      color:
                        'border-amber-200 bg-amber-50 text-amber-800',
                    }
                  : nextShift &&
                        nowMinutes >= nextShift.startM - KIOSK_CLOCK_IN_LEAD_MINUTES
                      ? { label: t.punch_clock_in_label, color: 'bg-accent/10 text-accent border-accent/20' }
                      : null;

              // Colore bordo sinistro
              const borderColor = allPunched
                ? 'border-l-accent'
                : awaitingOut
                  ? 'border-l-amber-400'
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
                  onClick={() => { setSelectedUser(user); setShowWelcome(true); }}
                  whileTap={{ scale: 0.98 }}
                  className={`rounded-xl border border-neutral-500 surface-ghost-interactive flex w-full flex-col border-l-4 px-5 py-3.5 font-sans text-left transition-colors ${borderColor}`}
                >
                  {/* Riga 1: nome + badge azione */}
                  <div className="flex items-center justify-between gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-base font-semibold uppercase text-white" title={user.first_name.toUpperCase()}>{user.first_name.toUpperCase()}
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
                    {shiftStatuses.map(({ shift, done, awaitingOut, inProgress, nearStart: ns, timeStr }) => {
                      const dotColor = done
                        ? 'bg-accent'
                        : awaitingOut
                          ? 'bg-amber-400 animate-pulse'
                          : inProgress || ns
                              ? 'bg-accent/50'
                              : 'bg-slate-200';
                      const textColor = done
                        ? 'text-accent'
                        : awaitingOut
                          ? 'text-amber-600'
                          : inProgress || ns
                              ? 'text-white/80'
                              : 'text-white/50';
                      return (
                        <span key={shift.id} className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                          <span className={`text-xs font-medium uppercase ${textColor}`}>{timeStr}</span>
                          {done && <Check className="w-3 h-3 text-accent flex-shrink-0" strokeWidth={2.5} />}
                          {awaitingOut && <span className="text-[11px] text-amber-500 font-semibold">{t.punch_exit_question}</span>}
                        </span>
                      );
                    })}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
        </div>
      </motion.div>

      {/* Schermata welcome full-screen per il dipendente selezionato */}
      <AnimatePresence>
        {selectedUser && showWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6 text-center"
            style={{ background: 'transparent' }}
          >
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 }}
              className="mb-8"
            >
              <FlowNeonIcon
                size={84}
                progress={0.9}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                idPrefix="kiosk-welcome"
              />
            </motion.div>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.18, type: 'spring', stiffness: 280, damping: 22 }}
              className="mb-6 flex h-24 w-24 items-center justify-center rounded-2xl text-4xl font-bold text-white shadow-xl shadow-black/40"
              style={{ background: '#0a0a0c' }}
            >
              {selectedUser.first_name[0].toUpperCase()}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="mb-1.5 text-2xl font-bold text-white tracking-tight"
            >
              {now.getHours() < 12 ? 'Buongiorno!' : now.getHours() < 18 ? 'Buon pomeriggio!' : 'Buonasera!'}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.34 }}
              className="mb-10 text-base text-neutral-400"
            >
              Tocca per timbrare
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.42 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowWelcome(false)}
              className="mb-4 w-full max-w-xs rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/30 flex items-center justify-center gap-2"
            >
              Entra
              <span aria-hidden>→</span>
            </motion.button>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              onClick={closeOverlay}
              className="text-sm text-white/60 hover:text-neutral-300 transition-colors active:text-neutral-300"
            >
              Esci
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlay: Selezione turno o PIN */}
      <AnimatePresence>
        {selectedUser && !showWelcome && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => !selectedShift && !isLoading && closeOverlay()}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
              className="modal-glass-panel w-full max-w-md overflow-hidden !p-0 rounded-2xl"
            >
              <div className="flex items-center justify-between p-4 border-b border-neutral-700/60">
                <h2 className="text-lg font-semibold text-neutral-100 uppercase font-sans tracking-wider">
                  {selectedUser.first_name.toUpperCase()}
                </h2>
                <button
                  onClick={closeOverlay}
                  disabled={isLoading}
                  className="p-2 rounded-xl text-neutral-400 hover:bg-white/10 transition-colors active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                  aria-label={t.cancel}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4">
                {!selectedShift ? (
                  /* Lista turni: mostra IN per turni non timbrati, OUT per turni in attesa */
                  <div className="space-y-2">
                    {shiftsForPickList.map((shift, i) => {
                      const punched = isPunched(shift);
                      const punchedOut = isPunchedOut(shift);
                      const done = isEmployeeDone(shift);
                      const awaitingOut = punched && !punchedOut;
                      const isSuggested = !done && (shift.id === suggestedShift?.id || awaitingOut);
                      const isDayShift = shift.type === 'lunch';
                      // Selezionabile: non completato
                      const isSelectable = !done;

                      return (
                        <motion.button
                          key={shift.id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.04 }}
                          onClick={() => {
                            if (!isSelectable) return;
                            setPunchMode(awaitingOut ? 'out' : 'in');
                            setSelectedShift(shift);
                          }}
                          disabled={!isSelectable}
                          className={`w-full px-4 py-3 rounded-xl flex items-center gap-3 text-left transition-all duration-300 border ${
                            done
                              ? 'bg-white/5 border-white/12 cursor-default'
                              : awaitingOut
                                  ? 'bg-amber-500/12 border-amber-500/30 cursor-pointer hover:bg-amber-500/22'
                                  : 'bg-white/8 border-neutral-500 hover:bg-white/12 cursor-pointer'
                          } ${isSuggested ? 'ring-2 ring-accent/40' : ''} active:bg-amber-500/22'/80`}
                        >
                          <span
                            className={`flex-shrink-0 ${done ? 'text-accent' : awaitingOut ? 'text-amber-500' : isDayShift ? 'text-amber-500' : 'text-white/50'}`}
                          >
                            {isDayShift ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                          </span>
                          <span className="flex flex-1 items-center gap-2 text-base font-medium text-white/80">
                            <Clock className="w-4 h-4 text-white/50" />
                            {shift.start_time.slice(0, 5)} — {shift.end_time ? shift.end_time.slice(0, 5) : '--:--'}
                          </span>
                          {done ? (
                            <Check className="w-5 h-5 text-accent flex-shrink-0" />
                          ) : awaitingOut ? (
                            <span className="text-xs font-semibold text-amber-600 uppercase flex-shrink-0">{t.punch_clock_out_label}</span>
                          ) : isSuggested ? (
                            <span className="text-xs font-medium text-accent uppercase flex-shrink-0">{t.punch_suggested}</span>
                          ) : null}
                        </motion.button>
                      );
                    })}
                  </div>
                ) : (
                  /* Tastierino PIN unificato */
                  <PinPadModal
                    title={t.sync_lock_title}
                    subtitle={punchMode === 'out' ? t.punch_clock_out_label : `${t.punch_for_shift_at} ${selectedShift.start_time.slice(0, 5)}${selectedShift.end_time ? ` — ${selectedShift.end_time.slice(0, 5)}` : ''}`}
                    pinLabel={t.pin_for_shift}
                    pin={pin}
                    onPinChange={(p) => (setPin(p), setError(''))}
                    onConfirm={() => {}} // Gestito da useEffect su pin.length === 4
                    onCancel={() => setSelectedShift(null)}
                    error={error}
                    isLoading={isLoading}
                    confirmLabel={t.confirm}
                    cancelLabel={t.cancel}
                    leftActionButton={
                      <button
                        type="button"
                        onClick={() => { setUserWantsShiftList(true); setSelectedShift(null); }}
                        disabled={isLoading}
                        className="flex flex-col items-center justify-center gap-0.5 text-white/50 active:scale-95 transition-transform"
                      >
                        <Smartphone className="w-5 h-5 text-[#455a3f]" />
                        <span className="text-[11px] font-black uppercase tracking-tighter leading-none">
                          {t.change_shift}
                        </span>
                      </button>
                    }
                  />
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
            className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24 }}
              className="modal-glass-panel rounded-2xl p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
              >
                <CheckCircle2 className="w-16 h-16 text-accent mx-auto mb-4" strokeWidth={2} />
              </motion.div>
              <p className="text-2xl font-semibold text-neutral-100 font-sans">
                {successPunchData?.type === 'out' ? t.punch_exit_registered_comma : t.good_work} {successUserName}!
              </p>
              {successPunchData && (
                <div className="mt-4 text-sm text-neutral-300 font-sans space-y-1">
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
