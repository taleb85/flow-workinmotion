import { format, parseISO, subDays, isValid } from 'date-fns';
import type { Language, User, Shift, HolidayRequest } from '../types';
import { isManagementRole } from './permissions';
import { formatTrans, getDateLocale } from './translations';
import { safeFormatDate } from './safeDateFormat';

/** Se il manager ha un reparto, limita notifiche ai dipendenti dello stesso reparto (stesso `user.department`). Senza reparto = tutti. */
function matchesManagerDepartment(manager: User, employeeUserId: string, users: User[]): boolean {
  const md = manager.department?.trim();
  if (!md) return true;
  const u = users.find((x) => x.id === employeeUserId);
  const ed = u?.department?.trim();
  if (!ed) return true;
  return ed === md;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotifType =
  | 'new_shift'
  | 'holiday_pending'
  | 'holiday_approved'
  | 'holiday_rejected'
  | 'open_shift'
  | 'approval_needed';

export type NotifSeverity = 'info' | 'success' | 'warning';

export interface AppNotification {
  id: string;
  type: NotifType;
  title: string;
  body: string;
  severity: NotifSeverity;
  /** ISO date string for sorting (YYYY-MM-DD or full ISO) */
  timestamp: string;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

const KEY = (userId: string) => `notif_seen_${userId}`;
const FEED_KEY = (userId: string) => `notif_feed_${userId}`;

const MAX_FEED_ITEMS = 200;

function loadNotificationFeed(userId: string): AppNotification[] {
  try {
    const raw = localStorage.getItem(FEED_KEY(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is AppNotification =>
        x &&
        typeof x === 'object' &&
        typeof (x as AppNotification).id === 'string' &&
        typeof (x as AppNotification).title === 'string' &&
        typeof (x as AppNotification).body === 'string' &&
        typeof (x as AppNotification).timestamp === 'string'
    );
  } catch {
    return [];
  }
}

function saveNotificationFeed(userId: string, items: AppNotification[]): void {
  try {
    localStorage.setItem(FEED_KEY(userId), JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

/**
 * Unisce le notifiche appena calcolate con la cronologia salvata in localStorage
 * (stesso utente), così restano visibili dopo refresh anche se i criteri attuali
 * non generano più voci. Le voci con stesso `id` vengono aggiornate da `fresh`.
 */
export function syncNotificationFeed(userId: string, fresh: AppNotification[]): AppNotification[] {
  const persisted = loadNotificationFeed(userId);
  const map = new Map<string, AppNotification>();
  for (const p of persisted) map.set(p.id, p);
  for (const f of fresh) map.set(f.id, f);
  const merged = [...map.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const trimmed = merged.slice(0, MAX_FEED_ITEMS);
  saveNotificationFeed(userId, trimmed);
  return trimmed;
}

export function getSeenIds(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY(userId));
    return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set<string>();
  }
}

export function markAllSeen(userId: string, ids: string[]): void {
  try {
    const existing = getSeenIds(userId);
    ids.forEach((id) => existing.add(id));
    // Keep only the most recent 500 to avoid unbounded growth
    const arr = [...existing].slice(-500);
    localStorage.setItem(KEY(userId), JSON.stringify(arr));
  } catch {
    // ignore
  }
}

// ── Generator ─────────────────────────────────────────────────────────────────

/**
 * Genera l'elenco completo di notifiche rilevanti per l'utente corrente,
 * partendo dai dati già in memoria (zero richieste extra al DB).
 */
export function generateNotifications(
  currentUser: User,
  shifts: Shift[],
  holidays: HolidayRequest[],
  users: User[],
  t: Record<string, string>,
  language: Language
): AppNotification[] {
  const notifications: AppNotification[] = [];
  const isManager = isManagementRole(currentUser.role);
  const today = format(new Date(), 'yyyy-MM-dd');
  const twoWeeksAgo = format(subDays(new Date(), 14), 'yyyy-MM-dd');
  const dateLocale = getDateLocale(language);

  if (!isManager) {
    // Turni assegnati visibili (non draft, non open) negli ultimi 14 giorni o futuri
    const myShifts = shifts.filter(
      (s) =>
        s.user_id === currentUser.id &&
        s.date >= twoWeeksAgo &&
        !s.notes?.startsWith('__OPEN__') &&
        s.approval_status !== 'draft'
    );

    // Una notifica per turno (ID = shift_ + shift.id), così ogni nuovo turno appare sempre
    const sortedShifts = [...myShifts].sort((a, b) => a.date.localeCompare(b.date));
    for (const s of sortedShifts) {
      let day: string;
      try {
        const d = parseISO(s.date);
        day = isValid(d) ? safeFormatDate(s.date, 'EEE d MMM', { locale: dateLocale }) : s.date;
      } catch {
        day = s.date;
      }
      const start = (s.start_time || '').slice(0, 5);
      const end = (s.end_time || '').slice(0, 5);
      let body = `${day} ${start}–${end}`;
      if (s.break_minutes && s.break_minutes > 0) {
        body += ` · ${s.break_minutes}min pausa`;
      }
      notifications.push({
        id: `shift_${s.id}`,
        type: 'new_shift',
        title: t.notif_shift_assigned,
        body,
        severity: 'info',
        timestamp: s.date,
      });
    }

    const myHolidays = holidays.filter((h) => h.user_id === currentUser.id);
    for (const h of myHolidays) {
      if (h.status === 'approved') {
        notifications.push({
          id: `holiday_ok_${h.id}`,
          type: 'holiday_approved',
          title: t.notif_holiday_approved_title,
          body: `${h.start_date} → ${h.end_date}`,
          severity: 'success',
          timestamp: h.created_at,
        });
      } else if (h.status === 'rejected') {
        notifications.push({
          id: `holiday_ko_${h.id}`,
          type: 'holiday_rejected',
          title: t.notif_holiday_rejected_title,
          body: `${h.start_date} → ${h.end_date}`,
          severity: 'warning',
          timestamp: h.created_at,
        });
      }
    }
  } else {
    const pending = holidays.filter(
      (h) => h.status === 'pending' && matchesManagerDepartment(currentUser, h.user_id, users)
    );
    for (const h of pending) {
      const who = users.find((u) => u.id === h.user_id)?.first_name ?? t.notif_employee_fallback;
      notifications.push({
        id: `hol_pending_${h.id}`,
        type: 'holiday_pending',
        title: t.notif_holiday_request_title,
        body: `${who} · ${h.start_date} – ${h.end_date}`,
        severity: 'warning',
        timestamp: h.created_at,
      });
    }

    const openShifts = shifts.filter((s) => s.notes?.startsWith('__OPEN__') && s.date >= today);
    if (openShifts.length > 0) {
      const body =
        openShifts.length === 1
          ? t.notif_open_shifts_one
          : formatTrans(t.notif_open_shifts_many, { n: openShifts.length });
      // ID stabile basato sul conteggio: si rinnova solo quando il numero cambia
      notifications.push({
        id: `open_shifts_n${openShifts.length}`,
        type: 'open_shift',
        title: t.notif_open_shifts_title,
        body,
        severity: 'warning',
        timestamp: today,
      });
    }

    const needApproval = shifts.filter(
      (s) =>
        s.approval_status === 'confirmed' &&
        s.date <= today &&
        !s.notes?.startsWith('__OPEN__') &&
        matchesManagerDepartment(currentUser, s.user_id, users)
    );
    if (needApproval.length > 0) {
      const body =
        needApproval.length === 1
          ? t.notif_approval_one
          : formatTrans(t.notif_approval_many, { n: needApproval.length });
      // ID stabile basato sul conteggio: si rinnova solo quando il numero cambia
      notifications.push({
        id: `approvals_n${needApproval.length}`,
        type: 'approval_needed',
        title: t.notif_approval_title,
        body,
        severity: 'info',
        timestamp: today,
      });
    }
  }

  return notifications.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/** Conteggio non lette sul feed persistito + aggiornato (stessa logica di NotificationCenter). */
export function countUnreadNotifications(
  currentUser: User | null,
  shifts: Shift[],
  holidays: HolidayRequest[],
  users: User[],
  t: Record<string, string>,
  language: Language
): number {
  if (!currentUser) return 0;
  const fresh = generateNotifications(currentUser, shifts, holidays, users, t, language);
  // Aggiorna il feed storico ma conta solo le notifiche ANCORA rilevanti (fresh),
  // non quelle storiche persistite che potrebbero essere già risolte.
  syncNotificationFeed(currentUser.id, fresh);
  const seen = getSeenIds(currentUser.id);
  return fresh.filter((n) => !seen.has(n.id)).length;
}
