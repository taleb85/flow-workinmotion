import { useMemo } from 'react';
import { format } from 'date-fns';
import { Users } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppData } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { formatTrans } from '../utils/translations';
import { isUserVisibleOnTeamSchedule } from '../utils/permissions';
import {
  readProfileAvatarFromStorage,
  readAvatarFocus,
  avatarFocusToObjectPosition,
} from '../utils/profilePhotoStorage';
import type { Shift } from '../types';
import { isDemoMode } from '../utils/demoData';

function startMinutes(s: Shift): number {
  const t = (s.start_time || '00:00').slice(0, 5);
  const [hs, ms] = t.split(':');
  const h = parseInt(hs || '0', 10);
  const m = parseInt(ms || '0', 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/** Inizio strettamente dopo le 16:00 → cambio guardia (es. 16:01–23:59). */
function isCambioGuardiaShift(s: Shift): boolean {
  return startMinutes(s) > 16 * 60;
}

/** Allinea al tabellone: tipo da `shift.type`, altrimenti da ora di inizio (solo turni “di giorno”). */
function effectiveShiftType(s: Shift): 'lunch' | 'dinner' {
  if (s.type === 'lunch' || s.type === 'dinner') return s.type;
  const h = parseInt((s.start_time || '12:00').slice(0, 2), 10);
  return !Number.isNaN(h) && h >= 17 ? 'dinner' : 'lunch';
}

function shiftRingTitle(
  shifts: Shift[],
  lunchLabel: string,
  dinnerLabel: string,
  cambioLabel: string
): string {
  const early = shifts.filter((s) => !isCambioGuardiaShift(s));
  const late = shifts.filter((s) => isCambioGuardiaShift(s));
  const parts: string[] = [];
  if (early.length) {
    const types = new Set(early.map(effectiveShiftType));
    if (types.has('lunch') && types.has('dinner')) {
      parts.push(`${lunchLabel} + ${dinnerLabel}`);
    } else if (types.has('dinner')) {
      parts.push(dinnerLabel);
    } else {
      parts.push(lunchLabel);
    }
  }
  if (late.length) {
    parts.push(cambioLabel);
  }
  return parts.join(' · ');
}

type Row = { userId: string; name: string; shifts: Shift[]; sortOrder: number };

/** Intervalli orari come nella tabella turni: "16:00 – 23:00"; più turni separati da " · ". */
function shiftTimeIntervals(shifts: Shift[]): string {
  if (shifts.length === 0) return '';
  const intervals = shifts
    .map((s) => {
      const a = (s.start_time || '').slice(0, 5);
      const b = (s.end_time || '').slice(0, 5);
      return a && b ? `${a} – ${b}` : a || b || '';
    })
    .filter(Boolean);
  return [...new Set(intervals)].join(' · ');
}

/**
 * Striscia sotto l’header: titolo e subito dopo l’elenco orizzontale colleghi in turno oggi.
 */
export default function HeaderTodayCoworkersCard() {
  const { currentUser, users } = useAppUser();
  const { shifts } = useAppData();
  const { featureFlags } = useAppConfig();
  const t = useT();
  const tv = t as Record<string, string>;

  const isVisibleByAdmin = featureFlags?.visibility_management !== false;

  const demoMode = isDemoMode();

  const rows = useMemo(() => {
    if (!currentUser || !isVisibleByAdmin) return [];
    const todayStr = format(new Date(), 'yyyy-MM-dd');

    // ── Anteprima demo: colleghi reali con turni di esempio ────────────
    if (demoMode) {
      const others = users
        .filter((u) => u.id !== currentUser.id && isUserVisibleOnTeamSchedule(u))
        .slice(0, 3);
      const mkShift = (id: string, userId: string, start: string, end: string, type: 'lunch' | 'dinner'): Shift => ({
        id,
        user_id: userId,
        date: todayStr,
        start_time: start,
        end_time: end,
        type,
        approval_status: 'confirmed',
      });
      return others.map((u, i) => {
        const shifts: Shift[] = [
          mkShift(`demo-cw-${u.id}-1`, u.id, i % 2 === 0 ? '08:00' : '11:30', i % 2 === 0 ? '13:30' : '16:00', i % 2 === 0 ? 'lunch' : 'dinner'),
        ];
        if (i % 2 === 0) {
          shifts.push(mkShift(`demo-cw-${u.id}-2`, u.id, '19:00', '23:30', 'dinner'));
        }
        const name = (u.first_name ?? '').trim() || u.email?.split('@')[0] || '—';
        return { userId: u.id, name, shifts, sortOrder: u.sort_order ?? 0 };
      });
    }

    const byUser = new Map<string, Shift[]>();
    for (const s of shifts) {
      if (s.date !== todayStr) continue;
      if (s.approval_status === 'absent') continue;
      if (s.approval_status !== 'confirmed') continue;
      if (s.notes?.startsWith('__OPEN__')) continue;
      if (s.user_id === currentUser.id) continue;
      const u = users.find((x) => x.id === s.user_id);
      if (!u || !isUserVisibleOnTeamSchedule(u)) continue;
      const list = byUser.get(s.user_id) ?? [];
      list.push(s);
      byUser.set(s.user_id, list);
    }
    const out: Row[] = [];
    for (const [userId, list] of byUser) {
      const u = users.find((x) => x.id === userId);
      if (!u) continue;
      const sorted = [...list].sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
      const name = (u.first_name ?? '').trim() || u.email?.split('@')[0] || '—';
      out.push({ userId, name, shifts: sorted, sortOrder: u.sort_order ?? 0 });
    }
    // Ordina come la tabella ruota: per sort_order (poi per nome).
    out.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
    return out;
  }, [demoMode, currentUser, shifts, users, isVisibleByAdmin]);

  if (!currentUser || !isVisibleByAdmin) return null;

  const title = tv.header_coworkers_today_title ?? 'In turno oggi';
  const empty = tv.header_coworkers_today_empty ?? 'Nessun altro collega in turno oggi';
  const summaryTpl = tv.header_coworkers_today_summary ?? '{n}';
  const lunchL = t.lunch ?? 'Pranzo';
  const dinnerL = t.dinner ?? 'Cena';
  const cambioL = tv.header_coworkers_cambio_guardia ?? 'Cambio guardia';

  return (
    <section className="w-full px-3 py-2 md:px-4 md:py-3" aria-label={title}>
      {rows.length === 0 ? (
        <div className="flex items-start gap-1.5 px-1">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/60" strokeWidth={2} aria-hidden />
          <p className="min-w-0 text-[0.6875rem] leading-snug text-white/60">{empty}</p>
        </div>
      ) : (
        <div className="flex w-full min-w-0 flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-[0.6875rem] font-bold text-white/60 uppercase tracking-widest">
              <span className="text-white/60 mr-1">
                {formatTrans(summaryTpl, { n: String(rows.length) })}
              </span>
              · {title}
            </p>
          </div>

          <ul
            id="header-coworkers-today-list"
            aria-label={title}
            className="smooth-scroll flex min-w-0 flex-1 flex-nowrap gap-2 overflow-x-auto overscroll-contain pb-2 no-scrollbar"
          >
            {rows.map((r) => {
              const u = users.find((x) => x.id === r.userId);
              const avatarSrc =
                (u && (readProfileAvatarFromStorage(r.userId) ?? u.avatar_url ?? null)) || null;
              const focus = readAvatarFocus(r.userId);
              const initial = (r.name.charAt(0) || '?').toUpperCase();
              const ringTitle = shiftRingTitle(r.shifts, lunchL, dinnerL, cambioL);
              const intervals = shiftTimeIntervals(r.shifts);

              return (
                <li
                  key={r.userId}
                  className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] py-1 pl-1 pr-3"
                  title={`${ringTitle}${intervals ? ` · ${intervals}` : ''}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-50">
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt=""
                        role="presentation"
                        className="h-full w-full object-cover"
                        style={{ objectPosition: avatarFocusToObjectPosition(focus) }}
                        draggable={false}
                      />
                    ) : (
                      <span className="text-base font-bold text-white/60" aria-hidden>
                        {initial}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex flex-col">
                    <span className="block max-w-[5.5rem] truncate text-[0.6875rem] font-black uppercase tracking-tight leading-tight text-white/80" title={r.name}>{r.name}
                    </span>
                    {intervals ? (
                      <span className="block max-w-[5.5rem] truncate text-[0.625rem] font-bold tabular-nums leading-tight text-white/50" title={intervals}>{intervals}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
