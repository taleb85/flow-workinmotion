import { format, isValid } from 'date-fns';
import type { Shift } from '../types';

export type PunchRecordLike = {
  id?: string;
  shift_id?: string;
  user_id: string;
  timestamp: string;
  calculated_time?: string | null;
  clock_out_time?: string | null;
  type: 'in' | 'out';
};

export function punchTimeHHMM(ts: string | null | undefined): string | null {
  if (!ts) return null;
  try {
    const d = new Date(ts);
    if (!isValid(d)) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return null;
  }
}

/**
 * Trova la coppia di timbrature (entrata/uscita) per un turno.
 * Match per shift_id se presente, altrimenti stesso user + data + fascia (pranzo/cena).
 */
export function getPunchPairForShift(
  shift: { id: string; user_id: string; date: string; start_time?: string; end_time?: string },
  punchRecords: PunchRecordLike[]
): {
  punchIn: PunchRecordLike | undefined;
  punchOut: PunchRecordLike | undefined;
  plannedStart: string;
  plannedEnd: string;
  actualStart: string | null;
  actualEnd: string | null;
} {
  const dateStr = shift.date;
  const plannedStart = (shift.start_time || '').slice(0, 5);
  const plannedEnd = (shift.end_time || '').slice(0, 5);
  const shiftHour = parseInt(plannedStart.split(':')[0] ?? '0', 10);
  const isLunch = !Number.isNaN(shiftHour) && shiftHour < 16;

  const punchIn = punchRecords.find((p) => {
    if (p.type !== 'in') return false;
    if (shift.id && p.shift_id) return p.shift_id === shift.id;
    if (p.user_id !== shift.user_id) return false;
    const pDate = new Date(p.timestamp);
    if (!isValid(pDate)) return false;
    if (format(pDate, 'yyyy-MM-dd') !== dateStr) return false;
    return isLunch ? pDate.getHours() < 16 : pDate.getHours() >= 16;
  });

  // clock_out_time sul record di entrata, oppure record 'out' separato
  const clockOutRaw = punchIn?.clock_out_time ?? null;
  const punchOut = clockOutRaw
    ? undefined
    : punchRecords.find((p) => {
        if (p.type !== 'out') return false;
        if (shift.id && p.shift_id) return p.shift_id === shift.id;
        if (p.user_id !== shift.user_id) return false;
        const pDate = new Date(p.timestamp);
        if (!isValid(pDate)) return false;
        if (format(pDate, 'yyyy-MM-dd') !== dateStr) return false;
        return isLunch ? pDate.getHours() < 16 : pDate.getHours() >= 16;
      });

  // L'orario efficace dell'uscita è calculated_time quando presente (correzione manuale),
  // altrimenti timestamp (o clock_out_time salvato sull'entrata).
  const actualEndRaw = clockOutRaw ?? punchOut?.calculated_time ?? punchOut?.timestamp ?? null;

  const actualStart = punchIn
    ? punchTimeHHMM((punchIn.calculated_time || punchIn.timestamp) as string) ?? plannedStart
    : null;
  const actualEnd = actualEndRaw ? punchTimeHHMM(actualEndRaw) : null;

  return { punchIn, punchOut, plannedStart, plannedEnd, actualStart, actualEnd };
}

/**
 * Evidenza gialla tabellone: è passata l'ora di fine pianificata del turno
 * e non risulta alcuna timbratura di entrata.
 */
export function shiftPastPlannedEndWithoutClockIn(
  shift: Pick<Shift, 'id' | 'user_id' | 'date' | 'start_time' | 'end_time' | 'notes' | 'approval_status'>,
  punchRecords: PunchRecordLike[],
  now: Date = new Date()
): boolean {
  if ((shift.approval_status ?? '').toString().trim().toLowerCase() === 'absent') return false;
  if (shift.approval_status === 'draft') return false;
  const n = shift.notes ?? '';
  if (n.startsWith('__OPEN__') || n.startsWith('__OPEN_REQ__')) return false;

  const plannedEnd = (shift.end_time || '').trim().slice(0, 5);
  const plannedStart = (shift.start_time || '').trim().slice(0, 5);
  if (!plannedEnd || plannedEnd === plannedStart) return false;

  const [y, mo, d] = shift.date.split('-').map((v) => parseInt(v, 10));
  if (Number.isNaN(y) || Number.isNaN(mo) || Number.isNaN(d)) return false;
  const [eh, em] = plannedEnd.split(':');
  const h = parseInt(eh ?? '', 10);
  const minute = parseInt(em ?? '0', 10);
  if (Number.isNaN(h)) return false;
  const endLocal = new Date(y, mo - 1, d, h, Number.isNaN(minute) ? 0 : minute, 0, 0);
  if (now.getTime() <= endLocal.getTime()) return false;

  const { punchIn } = getPunchPairForShift(shift, punchRecords);
  return !punchIn;
}

export type ResolvedClockSource = 'punch' | 'planned' | 'frozen';

/**
 * Orari usati per ore nette / confronti.
 * Se il turno ha timbrature complete (entrata+uscita) usa quelle,
 * altrimenti usa gli orari pianificati.
 */
export function getResolvedStartEndForHours(
  shift: Pick<Shift, 'id' | 'user_id' | 'date' | 'start_time' | 'end_time' | 'approval_status'>,
  punchRecords: PunchRecordLike[]
): { start: string; end: string; source: ResolvedClockSource } {
  if ((shift.approval_status ?? '').toString().trim().toLowerCase() === 'absent') {
    return { start: '', end: '', source: 'planned' };
  }

  const { actualStart, actualEnd, plannedStart, plannedEnd } = getPunchPairForShift(shift, punchRecords);
  
  if (actualStart && actualEnd) {
    return { start: actualStart, end: actualEnd, source: 'punch' };
  }
  if (actualStart && plannedEnd) {
    return { start: actualStart, end: plannedEnd, source: 'punch' };
  }
  return {
    start: plannedStart,
    end: plannedEnd || plannedStart,
    source: 'planned',
  };
}
