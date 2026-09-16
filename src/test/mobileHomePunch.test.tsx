import { describe, test, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MobileHome, { type MobileHomeProps } from '../components/mobile/MobileHome';
import { formatElapsedSince, groupShiftsByDay } from '../utils/timeCalculations';
import type { EnrichedShift } from '../hooks/useSmartPunchAction';
import type { Shift, PunchRecord } from '../types';

/** Contesto utente: usato da MobileHome e da useT(). */
vi.mock('../context/AppContext', () => ({
  useAppUser: () => ({ effectiveLanguage: 'it' }),
}));

/** Card colleghi: dipende da contesto/rete, non è oggetto di questi test. */
vi.mock('../components/HeaderTodayCoworkersCard', () => ({
  default: () => null,
}));

/** jsdom non implementa matchMedia: lo usa usePullToRefresh. */
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

afterEach(cleanup);

const TODAY = '2026-09-16';
const START_ISO = '2026-09-16T08:00:00';

const localMs = (iso: string) => new Date(iso).getTime();

const makeShift = (over: Partial<Shift> = {}): Shift => ({
  id: 'shift-1',
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  date: TODAY,
  start_time: '10:00',
  end_time: '16:00',
  type: 'lunch',
  approval_status: 'confirmed',
  department: 'sala',
  ...over,
});

const makePunchIn = (iso: string): PunchRecord => ({
  id: 'punch-1',
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  shift_id: 'shift-1',
  timestamp: iso,
  calculated_time: iso,
  type: 'in',
  source: 'kiosk',
});

/** Turno in corso: esiste una timbratura di entrata senza uscita. */
const makeInProgress = (iso: string): EnrichedShift => ({
  shift: makeShift(),
  isLunchSlot: true,
  punchIn: makePunchIn(iso),
  punchOut: undefined,
  actualStart: iso,
  actualEnd: null,
});

const baseProps = (over: Partial<MobileHomeProps> = {}): MobileHomeProps => ({
  greetingText: 'Ciao, MARIO!',
  todayLabel: 'mercoledì 16 settembre',
  todayStr: TODAY,
  inProgress: null,
  elapsedLabel: null,
  todayWorkShiftsCount: 0,
  noShiftsHint: 'Nessun turno oggi',
  tapStartHint: 'Tocca Inizia per timbrare',
  inProgressLabel: 'In turno',
  savingLabel: 'Salvo…',
  startLabel: 'Inizia',
  endLabel: 'Termina',
  canStart: false,
  canEnd: false,
  punchBusy: false,
  onStart: () => {},
  onEnd: () => {},
  todayWorkShifts: [],
  myShifts: [],
  ...over,
});

const elapsedNode = (container: HTMLElement) => container.querySelector('.punch-time');

describe('formatElapsedSince — calcolo del tempo trascorso', () => {
  test('formatta ore, minuti e secondi in HH:MM:SS', () => {
    expect(formatElapsedSince(START_ISO, localMs('2026-09-16T09:23:45'))).toBe('01:23:45');
  });

  test('timbratura appena effettuata → 00:00:00', () => {
    expect(formatElapsedSince(START_ISO, localMs(START_ISO))).toBe('00:00:00');
  });

  test('turno futuro (entrata nel futuro) → clampato a 00:00:00, mai negativo', () => {
    expect(formatElapsedSince(START_ISO, localMs('2026-09-16T07:00:00'))).toBe('00:00:00');
  });

  test('nessuna timbratura → null', () => {
    expect(formatElapsedSince(null)).toBeNull();
    expect(formatElapsedSince(undefined)).toBeNull();
    expect(formatElapsedSince('non-una-data')).toBeNull();
  });
});

describe('MobileHome — visibilità del cronometro e del badge entrata', () => {
  test('turno futuro senza timbratura: nessun cronometro e nessun badge Entrata', () => {
    const { container } = render(
      <MobileHome
        {...baseProps({
          inProgress: null,
          elapsedLabel: null,
          canStart: true,
          todayWorkShiftsCount: 1,
          todayWorkShifts: [makeShift()],
        })}
      />
    );

    expect(elapsedNode(container)).toBeNull();
    expect(screen.queryByText(/Entrata/)).toBeNull();
    expect(screen.getByText('In attesa')).toBeTruthy();
  });

  test('turno passato con timbratura già chiusa: nessun cronometro e nessun badge Entrata', () => {
    const { container } = render(
      <MobileHome
        {...baseProps({
          inProgress: null,
          elapsedLabel: null,
          canStart: false,
          todayWorkShiftsCount: 1,
          todayWorkShifts: [makeShift()],
        })}
      />
    );

    expect(elapsedNode(container)).toBeNull();
    expect(screen.queryByText(/Entrata/)).toBeNull();
    expect(screen.getByText('Nessun turno in corso')).toBeTruthy();
  });

  test('turno in corso con timbratura effettuata: cronometro e badge Entrata visibili', () => {
    const { container } = render(
      <MobileHome
        {...baseProps({
          inProgress: makeInProgress(START_ISO),
          elapsedLabel: formatElapsedSince(START_ISO, localMs('2026-09-16T09:23:45')),
          canEnd: true,
          todayWorkShiftsCount: 1,
          todayWorkShifts: [makeShift()],
        })}
      />
    );

    expect(elapsedNode(container)?.textContent).toBe('01:23:45');
    expect(screen.getByText('Entrata 08:00')).toBeTruthy();
    expect(screen.getByText('In turno · Pranzo')).toBeTruthy();
  });

  test('etichetta e stato sulla stessa riga, badge Entrata su una riga separata', () => {
    render(
      <MobileHome
        {...baseProps({
          inProgress: makeInProgress(START_ISO),
          elapsedLabel: '01:23:45',
          canEnd: true,
          todayWorkShiftsCount: 1,
          todayWorkShifts: [makeShift()],
        })}
      />
    );

    const label = screen.getByText('Timbratura');
    const status = screen.getByText('In turno · Pranzo');
    const badge = screen.getByText('Entrata 08:00');

    // Etichetta di sezione e stato condividono la stessa riga.
    expect(label.parentElement).toBe(status.parentElement);
    expect(status.parentElement?.className).toContain('flex');

    // Il badge Entrata non è affiancato allo stato: vive in un contenitore separato.
    expect(badge.parentElement).not.toBe(status.parentElement);
  });

  test('il cronometro si aggiorna in tempo reale quando il tempo trascorso cambia', () => {
    const t0 = localMs('2026-09-16T08:00:05');
    const props = (nowMs: number) =>
      baseProps({
        inProgress: makeInProgress(START_ISO),
        elapsedLabel: formatElapsedSince(START_ISO, nowMs),
        canEnd: true,
        todayWorkShiftsCount: 1,
        todayWorkShifts: [makeShift()],
      });

    const { container, rerender } = render(<MobileHome {...props(t0)} />);
    expect(elapsedNode(container)?.textContent).toBe('00:00:05');

    rerender(<MobileHome {...props(t0 + 1000)} />);
    expect(elapsedNode(container)?.textContent).toBe('00:00:06');

    rerender(<MobileHome {...props(t0 + 3600000)} />);
    expect(elapsedNode(container)?.textContent).toBe('01:00:05');
  });
});

describe('Prossimi turni — raggruppamento per giorno', () => {
  const DAY_2 = '2026-09-17';
  const DAY_3 = '2026-09-18';
  const DAY_4 = '2026-09-19';

  const twoShiftsOn = (date: string, key: string) => [
    makeShift({ id: `${key}-lunch`, date, start_time: '10:00', end_time: '16:00' }),
    makeShift({ id: `${key}-dinner`, date, start_time: '18:00', end_time: '23:00' }),
  ];

  test('groupShiftsByDay: stesso giorno in un gruppo, date diverse separate', () => {
    const groups = groupShiftsByDay([
      makeShift({ id: 'a', date: DAY_2, start_time: '10:00' }),
      makeShift({ id: 'b', date: DAY_2, start_time: '18:00' }),
      makeShift({ id: 'c', date: DAY_3, start_time: '11:00' }),
    ]);

    expect(groups.map((g) => g.date)).toEqual([DAY_2, DAY_3]);
    expect(groups[0].shifts.map((s) => s.id)).toEqual(['a', 'b']);
    expect(groups[1].shifts.map((s) => s.id)).toEqual(['c']);
  });

  test('il riconoscimento della stessa giornata non dipende dal fuso orario', () => {
    const originalTz = process.env.TZ;
    // Turni a cavallo della mezzanotte e di un cambio d'ora legale: se il
    // raggruppamento passasse da un `Date`, in qualche fuso finirebbero
    // in giorni diversi.
    const shifts = [
      makeShift({ id: 'x', date: '2026-10-25', start_time: '00:05' }),
      makeShift({ id: 'y', date: '2026-10-25', start_time: '23:55' }),
      makeShift({ id: 'z', date: '2026-10-26', start_time: '00:05' }),
    ];
    const shape = () =>
      groupShiftsByDay(shifts).map((g) => `${g.date}:${g.shifts.map((s) => s.id).join(',')}`);

    try {
      for (const tz of [
        'UTC',
        'Europe/London',
        'Europe/Rome',
        'America/Los_Angeles',
        'Pacific/Kiritimati',
        'Asia/Tokyo',
      ]) {
        process.env.TZ = tz;
        expect(shape(), `fuso ${tz}`).toEqual(['2026-10-25:x,y', '2026-10-26:z']);
      }
    } finally {
      process.env.TZ = originalTz;
    }
  });

  test('ogni giorno ha un blocco distinto con intestazione e conteggio', () => {
    const { container } = render(
      <MobileHome
        {...baseProps({
          myShifts: [...twoShiftsOn(DAY_2, 'd2'), ...twoShiftsOn(DAY_3, 'd3')],
        })}
      />
    );

    const blocks = container.querySelectorAll('[data-shift-day]');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].getAttribute('data-shift-day')).toBe(DAY_2);
    expect(blocks[1].getAttribute('data-shift-day')).toBe(DAY_3);

    // I due turni dello stesso giorno convivono nello stesso blocco.
    expect(blocks[0].textContent).toContain('10:00 – 16:00');
    expect(blocks[0].textContent).toContain('18:00 – 23:00');
    expect((blocks[0].textContent?.match(/–/g) ?? []).length).toBe(2);
    expect((blocks[1].textContent?.match(/–/g) ?? []).length).toBe(2);

    // Intestazione del giorno una sola volta per blocco.
    expect(screen.getAllByText('2 turni')).toHaveLength(2);
  });

  test('un giorno con un solo turno non mostra il conteggio', () => {
    render(
      <MobileHome
        {...baseProps({
          myShifts: [
            makeShift({ id: 'solo', date: DAY_2, start_time: '10:00', end_time: '16:00' }),
            ...twoShiftsOn(DAY_3, 'd3'),
          ],
        })}
      />
    );

    expect(screen.queryByText('1 turni')).toBeNull();
    expect(screen.getByText('2 turni')).toBeTruthy();
  });

  test('il limite dei turni mostrati non spezza l’ultimo giorno', () => {
    const { container } = render(
      <MobileHome
        {...baseProps({
          myShifts: [
            ...twoShiftsOn(DAY_2, 'd2'),
            ...twoShiftsOn(DAY_3, 'd3'),
            ...twoShiftsOn(DAY_4, 'd4'),
          ],
        })}
      />
    );

    // 6 turni su 3 giorni: il 5° taglierebbe il giorno 19 a metà.
    const blocks = container.querySelectorAll('[data-shift-day]');
    expect(blocks).toHaveLength(3);
    blocks.forEach((block) => {
      expect((block.textContent?.match(/–/g) ?? []).length).toBe(2);
    });
  });
});
