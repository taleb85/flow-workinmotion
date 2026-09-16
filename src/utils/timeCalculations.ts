/** Estrae ore e minuti da "HH:mm" o "HH:mm:ss"; segmenti mancanti → 0 (evita NaN su end_time vuoto o malformato). */
function hhmmParts(t: string): [number, number] {
  const s = String(t || '').trim().slice(0, 8);
  if (!s) return [0, 0];
  const [a, b] = s.split(':');
  const h = parseInt(a ?? '0', 10);
  const m = parseInt(b ?? '0', 10);
  return [(Number.isFinite(h) ? h : 0), (Number.isFinite(m) ? m : 0)];
}

/** Arrotonda per eccesso al multiplo di 5 minuti successivo. Es: 16:03->16:05, 16:07->16:10, 16:11->16:15. Se già multiplo di 5, invariato. */
export function roundToNext5Minutes(timeString: string): string {
  if (!timeString || timeString.trim() === '') return timeString;
  const parts = timeString.trim().slice(0, 5).split(':');
  const h = parseInt(parts[0] ?? '0', 10) || 0;
  const m = parseInt(parts[1] ?? '0', 10) || 0;
  let totalM = h * 60 + m;
  const remainder = totalM % 5;
  if (remainder === 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  totalM += (5 - remainder);
  const nh = Math.floor(totalM / 60) % 24;
  const nm = totalM % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/** Opzioni per il calcolo ore turno. */
export interface ShiftMinutesOptions {
  /** @deprecated Usare breakMinutes per la detrazione esplicita. */
  deductBreak?: boolean;
  /** Minuti di pausa da detrarre dal lordo. Formula: (End - Start) - breakMinutes = netto. */
  breakMinutes?: number;
}

/** Calcola i minuti lordi (senza detrazione pause) tra start e end. */
export function calculateShiftMinutesGross(startTime: string, endTime: string): number {
  const [startHour, startMin] = hhmmParts(startTime);
  const [endHour, endMin] = hhmmParts(endTime);
  let totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin);
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  return Number.isFinite(totalMinutes) ? totalMinutes : 0;
}

/** Fasce pausa pasto: 11:30-12:00 (pranzo), 17:00-17:30 (cena). Restituisce quali fasce sono coperte dal turno. */
export function getBreakLabels(startTime: string, endTime: string): ('lunch' | 'dinner')[] {
  if (!startTime || !endTime || startTime.trim() === '' || endTime.trim() === '') return [];
  const [startHour, startMin] = startTime.split(':').map((x) => parseInt(String(x), 10) || 0);
  const [endHour, endMin] = endTime.split(':').map((x) => parseInt(String(x), 10) || 0);
  let shiftEnd = endHour * 60 + endMin;
  if (shiftEnd < startHour * 60 + startMin) shiftEnd += 24 * 60;
  const shiftStart = startHour * 60 + startMin;
  const lunchBreakStart = 11 * 60 + 30;
  const lunchBreakEnd = 12 * 60;
  const dinnerBreakStart = 17 * 60;
  const dinnerBreakEnd = 17 * 60 + 30;
  const labels: ('lunch' | 'dinner')[] = [];
  if (shiftStart <= lunchBreakStart && shiftEnd >= lunchBreakEnd) labels.push('lunch');
  if (shiftStart <= dinnerBreakStart && shiftEnd >= dinnerBreakEnd) labels.push('dinner');
  return labels;
}

export function formatMinutesToHoursAndMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Tempo trascorso da una timbratura, in formato `HH:MM:SS`.
 * Restituisce `null` se non c'è un orario di partenza valido: in quel caso
 * il cronometro non va mostrato (turni futuri o non ancora timbrati).
 * Un orario di partenza nel futuro viene clampato a `00:00:00`.
 */
export function formatElapsedSince(startIso: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!startIso) return null;
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return null;
  const diff = Math.max(0, nowMs - start);
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

 
export function calculateRoundedPunchTime(actualTime: Date, _shiftStartTime?: string): Date {
  const minutes = actualTime.getMinutes();
  const roundedMinutes = Math.round(minutes / 10) * 10;

  const roundedTime = new Date(actualTime);
  roundedTime.setMinutes(roundedMinutes, 0, 0);

  return roundedTime;
}

export function getActualShiftTime(
  shift: { id?: string; user_id?: string; start_time?: string; end_time?: string; date?: string } | null | undefined,
  punchRecords: Array<{ shift_id?: string; user_id?: string; timestamp: string; calculated_time?: string; type: 'in' | 'out' }>
): { startTime: string; endTime: string; isActual: boolean; isCompleted: boolean; startTimeRounded?: string } {
  if (!shift || !shift.date || !shift.start_time) {
    return { startTime: '00:00', endTime: shift?.end_time ?? '00:00', isActual: false, isCompleted: false };
  }
  const shiftDate = shift.date;
  const startParts = String(shift.start_time).split(':');
  const shiftHour = parseInt(startParts[0], 10);
  const isLunchShift = !isNaN(shiftHour) && shiftHour < 16;

  const relevantPunchIn = punchRecords.find((record) => {
    if (record.type !== 'in') return false;
    if (shift.id && record.shift_id) return record.shift_id === shift.id;
    if (shift.user_id && record.user_id !== shift.user_id) return false;
    const recordDate = new Date(record.timestamp);
    const recordDateStr = recordDate.toISOString().split('T')[0];
    if (recordDateStr !== shiftDate) return false;
    const recordHour = recordDate.getHours();
    const isPunchDuringLunch = recordHour < 16;
    return isLunchShift === isPunchDuringLunch;
  });

  const hasActualStart = !!relevantPunchIn?.calculated_time;
  const isCompleted = !!relevantPunchIn;

  let startTimeStr = shift.start_time;
  const endTimeStr = (shift.end_time && String(shift.end_time).trim() !== '') ? shift.end_time : '';

  if (hasActualStart && relevantPunchIn?.calculated_time) {
    const calcTime = new Date(relevantPunchIn.calculated_time);
    startTimeStr = `${String(calcTime.getHours()).padStart(2, '0')}:${String(calcTime.getMinutes()).padStart(2, '0')}`;
  } else if (relevantPunchIn?.timestamp) {
    const punchTime = new Date(relevantPunchIn.timestamp);
    startTimeStr = `${String(punchTime.getHours()).padStart(2, '0')}:${String(punchTime.getMinutes()).padStart(2, '0')}`;
  }

  const startTimeRounded = isCompleted ? roundToNext5Minutes(startTimeStr) : startTimeStr;

  return {
    startTime: startTimeStr,
    endTime: endTimeStr,
    isActual: hasActualStart || !!relevantPunchIn,
    isCompleted,
    startTimeRounded,
  };
}

/** Ritorna il ritardo in minuti (punch in vs orario previsto). >0 = in ritardo. */
export function getPunchDelayMinutes(
  shift: { id?: string; user_id?: string; start_time?: string; date?: string } | null | undefined,
  punchRecords: Array<{ shift_id?: string; user_id?: string; timestamp: string; type: 'in' | 'out' }>
): number | null {
  if (!shift?.start_time || !shift?.date) return null;
  const [sh, sm] = String(shift.start_time).split(':').map((x) => parseInt(String(x), 10) || 0);
  const plannedStartM = sh * 60 + sm;

  const startParts = String(shift.start_time).split(':');
  const shiftHour = parseInt(startParts[0], 10);
  const isLunchShift = !isNaN(shiftHour) && shiftHour < 16;

  const punchIn = punchRecords.find((r) => {
    if (r.type !== 'in') return false;
    if (shift.id && r.shift_id) return r.shift_id === shift.id;
    if (shift.user_id && r.user_id !== shift.user_id) return false;
    const rd = new Date(r.timestamp);
    const rdStr = rd.toISOString().split('T')[0];
    if (rdStr !== shift.date) return false;
    const isPunchDuringLunch = rd.getHours() < 16;
    return isLunchShift === isPunchDuringLunch;
  });
  if (!punchIn?.timestamp) return null;

  const punchDate = new Date(punchIn.timestamp);
  const actualStartM = punchDate.getHours() * 60 + punchDate.getMinutes();
    return actualStartM - plannedStartM;
}

/**
 * Regola di arrotondamento FLOW — calcola il `calculated_time` da salvare al punch-IN.
 *
 * - Entrata ANTICIPATA (rawTimestamp < shift.start_time): usa l'orario ufficiale pianificato.
 *   Le ore non partono mai prima del turno.
 * - Entrata IN RITARDO (rawTimestamp > shift.start_time): usa il timestamp reale del click.
 *   Il ritardo viene registrato fedelmente.
 *
 * Restituisce sempre un ISO string pronto per essere salvato come `calculated_time`.
 */
export function computeEffectivePunchIn(
  shift: { start_time: string; date: string },
  rawTimestamp: string
): string {
  try {
    const punchDate = new Date(rawTimestamp);
    const punchMins = punchDate.getHours() * 60 + punchDate.getMinutes();

    const [sh, sm] = String(shift.start_time).split(':').map((x) => parseInt(String(x), 10) || 0);
    const scheduledMins = sh * 60 + sm;

    if (punchMins < scheduledMins) {
      // Anticipato: costruisce un Date dalla data del turno + orario pianificato
      const [year, month, day] = shift.date.split('-').map(Number);
      const effective = new Date(year, (month ?? 1) - 1, day ?? 1, sh, sm, 0, 0);
      return effective.toISOString();
    }

    // In ritardo o esatto: usa il timestamp grezzo
    return rawTimestamp;
  } catch {
    return rawTimestamp;
  }
}

/** Converte HH:mm in minuti da mezzanotte. */
function toMinutes(t: string): number {
  const parts = String(t || '').slice(0, 5).split(':');
  return (parseInt(parts[0] ?? '0', 10) || 0) * 60 + (parseInt(parts[1] ?? '0', 10) || 0);
}

/** Verifica se un turno (o modifica) crea conflitto con altri turni dello stesso dipendente nello stesso giorno.
 * Regola: l'orario di inizio deve essere sempre dopo l'orario di uscita del turno precedente.
 * shifts: turni esistenti per user+date (escludere quello in modifica se excludeId)
 * newShift: { start_time, end_time } del turno da creare/modificare
 */
export function hasShiftConflictSameDay(
  shifts: { id?: string; start_time: string; end_time: string; approval_status?: string | null }[],
  newShift: { start_time: string; end_time: string },
  excludeId?: string
): boolean {
  const others = shifts.filter((s) => {
    if (s.id === excludeId) return false;
    const st = (s.approval_status ?? '').toString().trim().toLowerCase();
    if (st === 'absent') return false;
    return true;
  });
  if (others.length === 0) return false;
  const all = [...others, { ...newShift }];
  all.sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));
  for (let i = 0; i < all.length - 1; i++) {
    const curr = all[i];
    const next = all[i + 1];
    const currEnd = curr.end_time && curr.end_time !== curr.start_time
      ? toMinutes(curr.end_time)
      : toMinutes(curr.start_time) + 360;
    const nextStart = toMinutes(next.start_time);
    if (nextStart < currEnd) return true;
  }
  return false;
}

/** Gruppo di turni che cadono nello stesso giorno di calendario. */
export interface ShiftDayGroup<T> {
  /** Data in formato `yyyy-MM-dd`: data di calendario, non un istante. */
  date: string;
  shifts: T[];
}

/**
 * Raggruppa turni consecutivi dello stesso giorno di calendario.
 *
 * La chiave è la stringa `date` del turno (data senza orario): non viene mai
 * creato un `Date`, quindi due turni finiscono nello stesso gruppo se e solo se
 * hanno la stessa data, senza slittamenti dovuti al fuso orario del browser.
 * Presuppone l'array già ordinato per data (gruppi consecutivi).
 */
export function groupShiftsByDay<T extends { date: string }>(shifts: T[]): ShiftDayGroup<T>[] {
  return shifts.reduce<ShiftDayGroup<T>[]>((groups, shift) => {
    const last = groups[groups.length - 1];
    if (last && last.date === shift.date) last.shifts.push(shift);
    else groups.push({ date: shift.date, shifts: [shift] });
    return groups;
  }, []);
}

/**
 * Normalizza testo orario libero (campi ore/minuti, incolla, solo ore) in HH:mm.
 * - "10:30", "9:5" → ore e minuti espliciti
 * - "14" o "9" → solo ore → minuti :00
 * - "1030" / prime 4 cifre → HH:mm compatto
 */
export function normalizeTimeInputToHHmm(val: string): string {
  const s = (val || '').trim();
  if (!s) return '';

  const colon = s.match(/^(\d{1,2}):(\d{0,2})$/);
  if (colon) {
    const h = Math.min(23, Math.max(0, parseInt(colon[1], 10) || 0));
    const mr = colon[2];
    let m = 0;
    if (mr.length >= 2) m = Math.min(59, parseInt(mr.slice(0, 2), 10) || 0);
    else if (mr.length === 1) m = Math.min(59, parseInt(mr, 10) || 0);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const digits = s.replace(/\D/g, '');
  if (digits.length >= 4) {
    const h = Math.min(23, parseInt(digits.slice(0, 2), 10) || 0);
    const m = Math.min(59, parseInt(digits.slice(2, 4), 10) || 0);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  if (/^\d{1,2}$/.test(s)) {
    const h = Math.min(23, parseInt(s, 10) || 0);
    return `${String(h).padStart(2, '0')}:00`;
  }

  return '';
}
