import { addDays, format } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { User, Shift, type Language } from '../types';
import { getNetShiftMinutes, type BreakMinutesComputeOptions, type BreakRule } from './breakRules';
import { isPurelyManagementRole } from './permissions';
import { getResolvedStartEndForHours, type PunchRecordLike } from './shiftResolvedClockTimes';

const BLACK: [number, number, number] = [0, 0, 0];
const WHITE: [number, number, number] = [255, 255, 255];
const GRAY_STRIPE: [number, number, number] = [242, 242, 242];
const GRID_COLOR: [number, number, number] = [119, 119, 119];
const SEP_MID: [number, number, number] = [187, 187, 187];

const PAGE_W = 297;
const MARGIN = 8;
const NAME_W = 22;
const TOT_W = 14;
const HEADER_ROW = 9;
/** pt → mm (jsPDF `unit: 'mm'`, `fontSize` in pt). */
const PT_TO_MM = 0.352778;
function lineHeightMm(fontSizePt: number): number {
  return fontSizePt * PT_TO_MM;
}
/**
 * Y della baseline per centrare verticalmente una riga in [yTop, yBottom] (mm, Y verso il basso).
 * Evita di mettere "solo pranzo" in alto e "solo cena" in basso: stessa altezza visiva tra colonne.
 */
function vCenterBaselineInBand(yTop: number, yBottom: number, fontSizePt: number): number {
  const mid = (yTop + yBottom) / 2;
  return mid + lineHeightMm(fontSizePt) * 0.28;
}

function getHour(shift: Shift): number {
  const t = (shift.start_time || '').trim();
  return parseInt(t.split(':')[0] ?? '0', 10) || 0;
}

function isShiftAbsent(s: Shift): boolean {
  return String(s.approval_status).toLowerCase() === 'absent';
}

function cleanTimeFormat(time: string): string {
  if (!time) return '—';
  let cleaned = time.replace(/:+/g, ':').trim();
  if (/^\d{4}$/.test(cleaned)) {
    cleaned = `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
  }
  return /^\d{2}:\d{2}$/.test(cleaned) ? cleaned : '—';
}

function dayHeaderLabel(d: Date): string {
  return format(d, 'EEE d', { locale: enUS }).toUpperCase();
}

function formatShift(shift: Shift, punchRecords: PunchRecordLike[]): string {
  const { start, end } = getResolvedStartEndForHours(shift, punchRecords);
  return `${cleanTimeFormat(start)}–${cleanTimeFormat(end)}`;
}

function layoutForEmployeeCount(count: number): {
  rowHeight: number;
  shiftFontSize: number;
  nameFontSize: number;
} {
  if (count <= 10) return { rowHeight: 18, shiftFontSize: 11, nameFontSize: 9 };
  if (count <= 14) return { rowHeight: 14, shiftFontSize: 9, nameFontSize: 8 };
  if (count <= 18) return { rowHeight: 11, shiftFontSize: 7.5, nameFontSize: 7 };
  return { rowHeight: 9, shiftFontSize: 6.5, nameFontSize: 6 };
}

function totalWeekMinutesToHHmm(
  shifts: Shift[],
  user: User,
  breakRules: BreakRule[],
  breakComputeOpts: BreakMinutesComputeOptions | undefined,
  punchRecords: PunchRecordLike[]
): string {
  const mins = shifts.reduce((sum, s) => {
    const { start, end } = getResolvedStartEndForHours(s, punchRecords);
    return sum + getNetShiftMinutes(s, start, end, user, breakRules, breakComputeOpts);
  }, 0);
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function exportSchedulePDF(
  weekStart: Date,
  weekDays: Date[],
  activeUsers: User[],
  shifts: Shift[],
  options: {
    restaurantName?: string;
    filterLabel?: string;
    includeOpen?: boolean;
    breakRules?: BreakRule[];
    breakComputeOpts?: BreakMinutesComputeOptions;
    punchRecords?: PunchRecordLike[];
    language?: Language;
  } = {}
): Promise<void> {
  const {
    restaurantName = '',
    filterLabel = '',
    includeOpen = false,
    breakRules = [],
    breakComputeOpts,
    punchRecords = [],
  } = options;
  const { jsPDF } = await import('jspdf');

  // L'admin (ruolo puramente gestionale) compare nel PDF solo se ha turni assegnati
  // nel periodo esportato — coerente con la visibilità nella griglia (isUserVisibleOnTeamSchedule).
  const weekRangeStartStr = weekDays.length > 0 ? format(weekDays[0], 'yyyy-MM-dd') : null;
  const weekRangeEndStr =
    weekDays.length > 0
      ? format(addDays(weekDays[weekDays.length - 1], 1), 'yyyy-MM-dd')
      : null;
  const userIdsWithShiftsInWeek = new Set<string>(
    weekRangeStartStr && weekRangeEndStr
      ? shifts
          .filter((s) => s.date >= weekRangeStartStr && s.date < weekRangeEndStr)
          .map((s) => s.user_id)
      : []
  );
  const scheduleUsers = activeUsers.filter(
    (u) => !isPurelyManagementRole(u.role) || userIdsWithShiftsInWeek.has(u.id)
  );
  const { rowHeight, shiftFontSize, nameFontSize } = layoutForEmployeeCount(scheduleUsers.length);

  const weekChunks: Date[][] = [];
  for (let i = 0; i < weekDays.length; i += 7) {
    weekChunks.push(weekDays.slice(i, i + 7));
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const usable = PAGE_W - MARGIN * 2 - NAME_W - TOT_W;

  weekChunks.forEach((weekDaysChunk, chunkIdx) => {
    if (chunkIdx > 0) {
      doc.addPage();
    }

    const chunkStart = weekDaysChunk[0];
    const numDays = weekDaysChunk.length;
    const chunkEnd = addDays(chunkStart, numDays);
    const chunkStartStr = format(chunkStart, 'yyyy-MM-dd');
    const chunkEndStr = format(chunkEnd, 'yyyy-MM-dd');
    const weekShifts = shifts.filter(
      (s) =>
        s.date >= chunkStartStr &&
        s.date < chunkEndStr &&
        (includeOpen || !s.notes?.startsWith('__OPEN__'))
    );

    const dayCol =
      numDays === 7 ? usable / 7 : usable / Math.max(1, numDays);
    if (dayCol <= 0) {
      return;
    }

    const startLabel = format(chunkStart, 'd MMM yyyy', { locale: enUS });
    const endLabel = format(addDays(chunkEnd, -1), 'd MMM yyyy', { locale: enUS });
    const topParts: string[] = [];
    if (restaurantName) topParts.push(restaurantName);
    topParts.push(`${startLabel} – ${endLabel}`);
    if (filterLabel) topParts.push(filterLabel);
    const topLine = topParts.join(' · ');

    doc.setTextColor(...BLACK);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(topLine, MARGIN, 12);

    const tableTopY = 20;
    const totColumnLeftX = MARGIN + NAME_W + numDays * dayCol;

    doc.setFillColor(...BLACK);
    doc.rect(MARGIN, tableTopY, NAME_W + numDays * dayCol + TOT_W, HEADER_ROW, 'F');
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    const headMidY = tableTopY + HEADER_ROW * 0.58 + 0.5;
    doc.text('EMPLOYEE', MARGIN + 1, headMidY);
    weekDaysChunk.forEach((day, i) => {
      const cellLeft = MARGIN + NAME_W + i * dayCol;
      const label = dayHeaderLabel(day);
      doc.text(label, cellLeft + dayCol / 2, headMidY, { align: 'center' });
    });
    doc.text('TOT', totColumnLeftX + TOT_W / 2, headMidY, { align: 'center' });

    let y = tableTopY + HEADER_ROW;

    scheduleUsers.forEach((user, rowIdx) => {
      const cellY = y;
      const isStripe = rowIdx % 2 === 0;
      doc.setFillColor(...(isStripe ? GRAY_STRIPE : WHITE));
      doc.rect(MARGIN, cellY, NAME_W + numDays * dayCol + TOT_W, rowHeight, 'F');

      const employeeName =
        [user.first_name, user.last_name]
          .map((s) => (s ?? '').trim())
          .filter((s) => s.length > 0)
          .join(' ') || '—';
      doc.setTextColor(...BLACK);
      doc.setFontSize(nameFontSize);
      doc.setFont('helvetica', 'bold');
      const nameInner = NAME_W - 3.5;
      const nameLines = doc.splitTextToSize(employeeName, nameInner) as string[];
      const nameLineH = nameFontSize * 0.42;
      const linesToDraw = nameLines.slice(0, 2);
      const nameBlockH = linesToDraw.length * nameLineH;
      const nameY0 = cellY + (rowHeight - nameBlockH) / 2 + nameLineH * 0.85;
      linesToDraw.forEach((ln, i) => {
        doc.text(ln, MARGIN + 2, nameY0 + i * nameLineH);
      });

      const userShifts: Shift[] = [];
      weekDaysChunk.forEach((day, i) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayShifts = weekShifts.filter(
          (s) => s.user_id === user.id && s.date === dateStr
        );
        userShifts.push(...dayShifts);

        const cellX = MARGIN + NAME_W + i * dayCol;
        const work = dayShifts.filter((s) => !isShiftAbsent(s));
        const morning = work.find((s) => getHour(s) < 16);
        const evening = work.find((s) => getHour(s) >= 16);
        const centerX = cellX + dayCol / 2;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(shiftFontSize);
        doc.setTextColor(...BLACK);
        const yMid = cellY + rowHeight / 2;
        if (morning && evening) {
          const yM = vCenterBaselineInBand(cellY, yMid, shiftFontSize);
          doc.text(formatShift(morning, punchRecords), centerX, yM, { align: 'center' });
          doc.setDrawColor(...SEP_MID);
          doc.setLineWidth(0.2);
          doc.line(cellX, yMid, cellX + dayCol, yMid);
          const yE = vCenterBaselineInBand(yMid, cellY + rowHeight, shiftFontSize);
          doc.text(formatShift(evening, punchRecords), centerX, yE, { align: 'center' });
        } else if (morning) {
          const y = vCenterBaselineInBand(cellY, cellY + rowHeight, shiftFontSize);
          doc.text(formatShift(morning, punchRecords), centerX, y, { align: 'center' });
        } else if (evening) {
          const y = vCenterBaselineInBand(cellY, cellY + rowHeight, shiftFontSize);
          doc.text(formatShift(evening, punchRecords), centerX, y, { align: 'center' });
        }

        const shown = (morning ? 1 : 0) + (evening ? 1 : 0);
        const extraToShow = Math.max(0, work.length - shown);
        if (extraToShow > 0) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(Math.max(6, shiftFontSize - 1.5));
          doc.setTextColor(...GRID_COLOR);
          const tag = `+${extraToShow}`;
          const tw = doc.getTextWidth(tag);
          doc.text(tag, cellX + dayCol - 1 - tw, cellY + rowHeight - 1);
        }
      });

      const weekTotal = totalWeekMinutesToHHmm(
        userShifts,
        user,
        breakRules,
        breakComputeOpts,
        punchRecords
      );
      if (weekTotal) {
        doc.setTextColor(...BLACK);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(shiftFontSize);
        const vert = vCenterBaselineInBand(cellY, cellY + rowHeight, shiftFontSize);
        doc.text(weekTotal, totColumnLeftX + TOT_W / 2, vert, { align: 'center' });
      }

      y += rowHeight;
    });

    const tableBottomY = y;
    const tableH = tableBottomY - tableTopY;
    const tableW = NAME_W + numDays * dayCol + TOT_W;

    doc.setDrawColor(...GRID_COLOR);
    doc.setLineWidth(0.3);
    doc.rect(MARGIN, tableTopY, tableW, tableH, 'S');
    for (let v = 0; v <= numDays; v++) {
      const vx = MARGIN + NAME_W + v * dayCol;
      doc.line(vx, tableTopY, vx, tableBottomY);
    }
    doc.line(MARGIN + tableW, tableTopY, MARGIN + tableW, tableBottomY);

    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.8);
    doc.line(totColumnLeftX, tableTopY, totColumnLeftX, tableBottomY);
    for (let r = 0; r < scheduleUsers.length; r++) {
      const hy = tableTopY + HEADER_ROW + r * rowHeight;
      doc.setDrawColor(...GRID_COLOR);
      doc.setLineWidth(0.3);
      doc.line(MARGIN, hy, MARGIN + tableW, hy);
    }
  });

  const anchorDate = weekDays[0] ?? weekStart;
  const fileName = `${format(anchorDate, 'dd-MM-yyyy')}.pdf`;
  doc.save(fileName);
}
