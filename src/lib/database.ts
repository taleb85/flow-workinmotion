import { supabase } from './supabase';
import { User, Shift, HolidayRequest, PunchRecord, PunchAuditEntry } from '../types';

// ---------------------------------------------------------------------------
// Multi-tenant: tenant_id corrente (impostato da TenantContext al bootstrap)
// ---------------------------------------------------------------------------
let _tenantId: string | null = null;

/** Chiamato da TenantProvider appena il tenant è stato caricato. */
export function setDatabaseTenant(tenantId: string): void {
  _tenantId = tenantId;
}

/** Aggiunge il filtro tenant_id alla query se il tenant è stato impostato. */
function withTenant<T extends { eq: (col: string, val: unknown) => T }>(query: T): T {
  return _tenantId ? query.eq('tenant_id', _tenantId) : query;
}

/** Aggiunge tenant_id al payload di insert/update se il tenant è impostato. */
function withTenantPayload(payload: Record<string, unknown>): Record<string, unknown> {
  if (_tenantId && !payload.tenant_id) {
    return { ...payload, tenant_id: _tenantId };
  }
  return payload;
}
import { sanitizeUiSectionOverrides } from '../utils/uiScreenWidgets';
import { buildDemoCoworkerShiftsToday, buildDemoProfileData, punchRecordsFromSpecs } from '../utils/seedDemoProfileData';
import { isUserVisibleOnTeamSchedule } from '../utils/permissions';
import { isAppSettingsSyncSignalRestSkipped } from '../utils/globalSettingsCloud';
import { isAppCloudSyncEnabled } from '../utils/appCloudSync';

/** Evita 400 su jsonb / tipi non validi. */
function sanitizeUserUpdatePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  if ('enabled_modules' in out) {
    const m = out.enabled_modules;
    if (Array.isArray(m)) {
      out.enabled_modules = [...new Set(m.filter((x): x is string => typeof x === 'string'))];
    } else {
      delete out.enabled_modules;
    }
  }
  if (
    'enabled_features' in out &&
    out.enabled_features &&
    typeof out.enabled_features === 'object' &&
    !Array.isArray(out.enabled_features)
  ) {
    const o = out.enabled_features as Record<string, unknown>;
    const clean: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'boolean') clean[k] = v;
    }
    out.enabled_features = clean;
  }
  if (
    'hourly_rate_eur' in out &&
    typeof out.hourly_rate_eur === 'number' &&
    (!Number.isFinite(out.hourly_rate_eur) || out.hourly_rate_eur < 0)
  ) {
    delete out.hourly_rate_eur;
  }
  if ('ui_section_overrides' in out) {
    const cleaned = sanitizeUiSectionOverrides(out.ui_section_overrides);
    out.ui_section_overrides = cleaned && Object.keys(cleaned).length > 0 ? cleaned : {};
  }
  return out;
}

function isMissingColumnError(error: unknown): boolean {
  const e = error as { message?: string; details?: string; code?: string };
  const t = `${e.message || ''} ${e.details || ''}`.toLowerCase();
  return (
    e.code === '42703' ||
    /column .* does not exist|could not find the .* column|schema cache|unknown column/i.test(t)
  );
}

/** Rimuove dal body la colonna citata nell’errore PostgREST (DB senza migrazione). */
function omitUndefinedRecord(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Colonne “sicure” per insert dipendente se il DB non ha tutte le colonne dell’app. */
const USER_INSERT_CORE_KEYS = [
  'first_name',
  'last_name',
  'email',
  'role',
  'pin',
  'status',
  'sort_order',
  'language',
  'theme',
] as const;

function pickInsertKeys(obj: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in obj && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

/** Campi da applicare dopo l’INSERT (UPDATE), non nel primo insert. */
const USER_INSERT_PATCH_KEYS = [
  'can_create_shifts',
  'can_approve_shifts',
  'can_view_total_hours',
  'can_edit_staff_pins',
  'can_manage_drafts',
  'department',
  'hourly_rate_eur',
  'employment_start_date',
  'employment_end_date',
  'secondary_pin',
  'elevated_role',
] as const;

export function formatSupabaseError(err: unknown): string {
  const e = err as { message?: string; details?: string; hint?: string };
  return [e.message, e.details, e.hint].filter(Boolean).join(' — ');
}

function stripMissingUserColumns(payload: Record<string, unknown>, error: unknown): Record<string, unknown> | null {
  const msg = `${(error as { message?: string }).message || ''} ${(error as { details?: string }).details || ''}`;
  const out = { ...payload };
  const theColumn = msg.match(/the\s+['"]([a-z_][a-z0-9_]*)['"]\s+column/i);
  const quoted = msg.match(/['"]([a-z_][a-z0-9_]*)['"]\s+column/i);
  const backtick = msg.match(/`([a-z_][a-z0-9_]*)`/i);
  const name = theColumn?.[1] || quoted?.[1] || backtick?.[1];
  if (name && name in out) {
    delete out[name];
    return Object.keys(out).length ? out : null;
  }
  return null;
}

/** Solo queste colonne su INSERT: `approved_*` va impostato con `shifts.update` (altrimenti 400 se colonne assenti o vincoli). */
const SHIFT_INSERT_ALLOW: (keyof Omit<Shift, 'id'>)[] = [
  'user_id',
  'date',
  'start_time',
  'end_time',
  'type',
  'approval_status',
  'notes',
  'deduct_break',
  'break_minutes',
  'is_auto_break',
  'admin_note',
  'skills',
];

function pickShiftInsertPayload(shift: Omit<Shift, 'id'>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of SHIFT_INSERT_ALLOW) {
    const v = shift[key];
    if (v !== undefined) out[key as string] = v;
  }
  return out;
}

export const database = {
  users: {
    async getAll() {
      if (!supabase) return [];
      const base = supabase.from('users').select('*');
      const scoped = withTenant(base);
      const { data, error } = await scoped.order('sort_order', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    /** Una riga completa (es. PIN per sblocco sync — `getAll` in cache può essere incoerente con RLS/view). */
    async getById(id: string): Promise<User | null> {
      if (!supabase) return null;
      const { data, error } = await withTenant(
        supabase!.from('users').select('*').eq('id', id)
      ).maybeSingle();
      if (error) throw error;
      return (data as User) ?? null;
    },

    async insert(user: Omit<User, 'id'>) {
      if (!supabase) return null;
      const payload = omitUndefinedRecord(user as Record<string, unknown>);
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      if (!email) return null;

      const runInsert = async (body: Record<string, unknown>) =>
        supabase!.from('users').insert(withTenantPayload(body));

      /*
       * 1) Solo colonne “core” nell’INSERT: molti 400/RLS strani vengono da colonne extra nel primo write.
       * 2) Permessi / reparto / tariffa → UPDATE (stessa logica resilient di users.update).
       */
      let coreBody = pickInsertKeys(payload, [...USER_INSERT_CORE_KEYS]);
      /* DB con last_name nullable: meglio omettere che inviare "". */
      if (coreBody.last_name === '') {
        delete coreBody.last_name;
      }
      let { error } = await runInsert(coreBody);

      if (error && isMissingColumnError(error)) {
        const stripped = stripMissingUserColumns(coreBody, error);
        if (stripped && Object.keys(stripped).length < Object.keys(coreBody).length) {
          const second = await runInsert(stripped);
          error = second.error;
          coreBody = stripped;
        }
      }

      if (error) {
        // 409 = conflitto unico (utente già esistente): non è un errore critico nel seed
        if (error.code === '23505' || (error as { status?: number }).status === 409) {
          console.warn('[database.users.insert] utente già esistente, skip', error.message);
          return null;
        }
        console.error('[database.users.insert] insert core fallito', error);
        throw error;
      }

      const fetchInserted = async (): Promise<User | null> => {
        const ordered = await supabase!
          .from('users')
          .select('*')
          .eq('email', email)
          .order('created_at', { ascending: false })
          .limit(1);

        if (!ordered.error && ordered.data?.[0]) {
          return ordered.data[0] as User;
        }
        if (ordered.error && !isMissingColumnError(ordered.error)) {
          throw ordered.error;
        }

        const plain = await supabase!.from('users').select('*').eq('email', email).limit(1);
        if (plain.error) throw plain.error;
        if (plain.data?.[0]) return plain.data[0] as User;

        const all = await supabase!.from('users').select('*').order('sort_order', { ascending: true });
        if (all.error) {
          console.warn('[database.users.insert] nessuna riga per email; getAll fallito', all.error);
          return null;
        }
        const found = all.data?.find((u: { email?: string }) => String(u.email ?? '').toLowerCase() === email);
        return (found as User) ?? null;
      };

      let row = await fetchInserted();
      if (!row) {
        console.error('[database.users.insert] insert ok ma riga non leggibile (email)', email);
        return null;
      }

      const patch: Partial<User> = {};
      for (const k of USER_INSERT_PATCH_KEYS) {
        if (k in payload && payload[k] !== undefined) {
          (patch as Record<string, unknown>)[k] = payload[k];
        }
      }

      if (Object.keys(patch).length > 0) {
        try {
          const updated = await database.users.update(row.id, patch);
          if (updated) row = updated as User;
          else {
            const again = await database.users.getById(row.id);
            if (again) row = again;
          }
        } catch (patchErr) {
          console.warn('[database.users.insert] patch permessi/reparto fallito (riga creata)', patchErr);
        }
      }

      return row;
    },

    async update(id: string, updates: Partial<User>) {
      const safeKeys: (keyof User)[] = [
        'first_name', 'last_name', 'email', 'phone', 'role', 'pin', 'status', 'sort_order',
        'language', 'theme', 'department', 'hourly_rate_eur', 'monthly_confirmed', 'enabled_modules', 'enabled_features', 'ui_section_overrides',
        'can_create_shifts', 'can_approve_shifts', 'can_view_total_hours',
        'can_edit_staff_pins', 'can_manage_drafts',
        'can_request_holidays', 'can_punch_from_app',
        'hide_from_team_schedule',
        'avatar_url',
        'employment_start_date',
        'employment_end_date',
        'secondary_pin',
        'elevated_role',
      ];
      const rawPayload: Record<string, unknown> = {};
      for (const key of safeKeys) {
        if (key in updates && updates[key as keyof User] !== undefined) {
          rawPayload[key] = updates[key as keyof User];
        }
      }
      if (Object.keys(rawPayload).length === 0) return null;

      const payload = sanitizeUserUpdatePayload(rawPayload);

      const permKeys = ['can_request_holidays', 'can_punch_from_app', 'can_edit_staff_pins', 'can_create_shifts', 'can_approve_shifts', 'can_view_total_hours', 'can_manage_drafts'];
      const optionalCols = [
        'enabled_modules',
        'enabled_features',
        'ui_section_overrides',
        'monthly_confirmed',
        'hourly_rate_eur',
        'hide_from_team_schedule',
        'avatar_url',
        'employment_start_date',
        'employment_end_date',
        'secondary_pin',
        'elevated_role',
      ];

      const onlyOptionalCols = (keys: string[]) =>
        keys.every((k) => permKeys.includes(k) || optionalCols.includes(k));

      const tryUpdate = async (body: Record<string, unknown>) =>
        supabase!.from('users').update(body).eq('id', id).select().maybeSingle();

      let { data, error } = await tryUpdate(payload);

      // DB senza migrazione: colonna sconosciuta → 400 (PostgREST). Riprova senza la colonna citata o senza `phone`.
      if (error && isMissingColumnError(error)) {
        let stripped = stripMissingUserColumns(payload, error);
        if (!stripped && 'phone' in payload) {
          const { phone, ...rest } = payload;
          void phone;
          stripped = Object.keys(rest).length ? rest : null;
        }
        if (stripped && Object.keys(stripped).length > 0 && Object.keys(stripped).length < Object.keys(payload).length) {
          const second = await tryUpdate(stripped);
          data = second.data;
          error = second.error;
        }
      }

      // Fallback: se 400 o colonna mancante e aggiorniamo solo colonne opzionali, merge locale (senza persistenza)
      if (error && onlyOptionalCols(Object.keys(payload))) {
        const { data: current } = await supabase!.from('users').select('*').eq('id', id).maybeSingle();
        if (current) {
          data = { ...current, ...payload } as User;
          error = null;
        }
      }

      if (error) {
        console.warn('[database.users.update]', id, (error as { message?: string; code?: string }).message ?? error);
        throw error;
      }
      return data;
    },

    async delete(id: string) {
      if (!supabase) return;
      const { error } = await supabase!
        .from('users')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },

    async bulkUpdate(users: User[]) {
      if (!supabase) return;
      const { error } = await supabase!
        .from('users')
        .upsert(users);
      if (error) throw error;
    },
  },

  shifts: {
    async getAll() {
      if (!supabase) return [];
      const base = supabase.from('shifts').select('*');
      const scoped = withTenant(base);
      const { data, error } = await scoped.order('date', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async getByUserId(userId: string) {
      if (!supabase) return [];
      const base = supabase.from('shifts').select('*').eq('user_id', userId);
      const scoped = withTenant(base);
      const { data, error } = await scoped.order('date', { ascending: true });
      if (error) throw error;
      return data || [];
    },

    async insert(shift: Omit<Shift, 'id'>) {
      if (!supabase) return null;
      const payload = withTenantPayload(pickShiftInsertPayload(shift));
      const { data, error } = await supabase!
        .from('shifts')
        .insert(payload)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async insertMany(shifts: Omit<Shift, 'id'>[]) {
      if (!supabase || shifts.length === 0) return [];
      const payloads = shifts.map((s) => withTenantPayload(pickShiftInsertPayload(s)));
      const { data, error } = await supabase!
        .from('shifts')
        .insert(payloads)
        .select();
      if (error) throw error;
      return (data || []) as Shift[];
    },

    /**
     * Presenze «non ha lavorato»: elimina timbrature con shift_id, azzera metadati congelamento, poi stato absent.
     * Passi separati sul DB riducono conflitti con constraint/trigger rispetto a un solo UPDATE grande.
     */
    async markAbsent(id: string): Promise<Shift | null> {
      if (!supabase) return null;
      try {
        const { data: punchRows } = await supabase.from('punch_records').select('id').eq('shift_id', id);
        if (punchRows && punchRows.length > 0) {
          const { error: delErr } = await supabase
            .from('punch_records')
            .delete()
            .in(
              'id',
              (punchRows as { id: string }[]).map((r) => r.id)
            );
          if (delErr) console.warn('[database.shifts.markAbsent] punch delete', delErr);
        }
      } catch (e) {
        console.warn('[database.shifts.markAbsent] punch cleanup', e);
      }
      const clearFreeze: Partial<Shift> = {
        approved_at: undefined,
        approved_by: undefined,
        approved_start_time: undefined,
        approved_end_time: undefined,
      };
      const { error: clearErr } = await supabase.from('shifts').update(clearFreeze).eq('id', id);
      if (clearErr) console.warn('[database.shifts.markAbsent] clear freeze', clearErr);
      return database.shifts.update(id, { approval_status: 'absent', ...clearFreeze });
    },

    async update(id: string, updates: Partial<Shift>) {
      // approved_at / approved_by sono colonne opzionali: incluse ma con fallback graceful
      const allowedKeys: (keyof Shift)[] = [
        'user_id', 'date', 'start_time', 'end_time', 'type', 'approval_status',
        'notes', 'deduct_break', 'break_minutes', 'is_auto_break', 'deduct_excluded_rule_ids', 'admin_note', 'skills', 'approved_at', 'approved_by',
        'approved_start_time', 'approved_end_time',
      ];
      const payload: Record<string, unknown> = {};
      for (const key of allowedKeys) {
        // null è incluso esplicitamente (svuota campi come approved_at/approved_by)
        if (key in updates && updates[key] !== undefined) payload[key] = updates[key];
      }
      let { data, error } = await supabase!
        .from('shifts')
        .update(payload)
        .eq('id', id)
        .select()
        .maybeSingle();
      // Fallback progressivo: rimuove le colonne opzionali finché il server accetta
      if (error) {
        const optionalKeys = [
          'approved_at',
          'approved_by',
          'approved_start_time',
          'approved_end_time',
          'deduct_break',
          'break_minutes',
          'is_auto_break',
          'deduct_excluded_rule_ids',
          'notes',
          'admin_note',
          'skills',
        ] as const;
        for (const key of optionalKeys) {
          if (!error || payload[key] === undefined) continue;
          const fallback = { ...payload };
          delete fallback[key];
          if (Object.keys(fallback).length > 0) {
            const res = await supabase!.from('shifts').update(fallback).eq('id', id).select().maybeSingle();
            if (!res.error) { data = res.data; error = null; break; }
          }
        }
        // Ultimo tentativo: solo campi core garantiti nello schema base
        if (error && Object.keys(payload).length > 0) {
          const core: Record<string, unknown> = {};
          for (const k of ['user_id', 'date', 'start_time', 'end_time', 'type', 'approval_status'] as const) {
            if (payload[k] !== undefined) core[k] = payload[k];
          }
          if (Object.keys(core).length > 0) {
            const res = await supabase!.from('shifts').update(core).eq('id', id).select().maybeSingle();
            if (!res.error) { data = res.data; error = null; }
          }
        }
      }
      /* UPDATE + SELECT in un solo round-trip può fallire (RLS/policy su SELECT) pur avendo scritto la riga. */
      if (error && Object.keys(payload).length > 0) {
        const { error: noSelectErr } = await supabase!.from('shifts').update(payload).eq('id', id);
        if (!noSelectErr) {
          const refetch = await supabase!.from('shifts').select('*').eq('id', id).maybeSingle();
          if (!refetch.error && refetch.data) {
            return refetch.data as Shift;
          }
        }
      }
      if (error) throw error;
      return data;
    },

    async delete(id: string) {
      const { data: punches } = await supabase!
        .from('punch_records')
        .select('id')
        .eq('shift_id', id);
      if (punches && punches.length > 0) {
        const { error: punchErr } = await supabase!
          .from('punch_records')
          .delete()
          .in('id', (punches as { id: string }[]).map(r => r.id));
        if (punchErr) throw punchErr;
      }
      const { error } = await supabase!
        .from('shifts')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },

    async deleteMany(ids: string[]) {
      if (ids.length === 0) return;
      // Pulizia cascade: elimina prima i punch_records collegati per evitare FK violations
      const { data: punches } = await supabase!
        .from('punch_records')
        .select('id')
        .in('shift_id', ids);
      if (punches && punches.length > 0) {
        await supabase!
          .from('punch_records')
          .delete()
          .in('id', (punches as { id: string }[]).map(r => r.id));
      }
      const { error } = await supabase!
        .from('shifts')
        .delete()
        .in('id', ids);
      if (error) throw error;
    },

    async deleteByDateRange(startDate: string, endDate: string) {
      if (!supabase) return;
      const base = supabase.from('shifts').select('id');
      const scoped = withTenant(base);
      const { data, error } = await scoped.gte('date', startDate).lte('date', endDate);
      if (error) throw error;
      const ids = (data || []).map((s: { id: string }) => s.id);
      if (ids.length > 0) {
        await supabase!.from('punch_records').delete().in('shift_id', ids);
        const { error: delError } = await supabase!.from('shifts').delete().in('id', ids);
        if (delError) throw delError;
      }
      return ids.length;
    },

    /** Eliminazione diretta con filtro date (con cascade punch_records) */
    async deleteByDateRangeDirect(startDate: string, endDate: string) {
      if (!supabase) return;
      const base = supabase.from('shifts').select('id');
      const scoped = withTenant(base);
      const { data } = await scoped.gte('date', startDate).lte('date', endDate);
      const ids = (data || []).map((s: { id: string }) => s.id);
      if (ids.length > 0) {
        await supabase!.from('punch_records').delete().in('shift_id', ids);
        const { error } = await supabase!.from('shifts').delete().in('id', ids);
        if (error) throw error;
      }
    },

    /** Restituisce gli id dei turni nel range date (per pulizia a cascata) */
    async getIdsByDateRange(startDate: string, endDate: string): Promise<string[]> {
      if (!supabase) return [];
      const base = supabase.from('shifts').select('id');
      const scoped = withTenant(base);
      const { data, error } = await scoped.gte('date', startDate).lte('date', endDate);
      if (error) throw error;
      return (data || []).map((s: { id: string }) => s.id);
    },
  },

  punchRecords: {
    async getAll() {
      if (!supabase) return [];
      const base = supabase.from('punch_records').select('*');
      const scoped = withTenant(base);
      const { data, error } = await scoped.order('timestamp', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async getByUserId(userId: string) {
      if (!supabase) return [];
      const base = supabase.from('punch_records').select('*').eq('user_id', userId);
      const scoped = withTenant(base);
      const { data, error } = await scoped.order('timestamp', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async insert(record: Omit<PunchRecord, 'id'>) {
      if (!supabase) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let payload: Record<string, any> = withTenantPayload({ ...record });
      // Mai inviare `timestamp` dal client se non è inserimento manuale: il trigger DB usa clock_timestamp().
      if (payload.source !== 'manual') {
        delete payload.timestamp;
      }
      let lastError: { message?: string; details?: string } | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await supabase!
          .from('punch_records')
          .insert(payload)
          .select()
          .maybeSingle();
        if (!error) return data;
        lastError = error as { message?: string; details?: string };
        const msg = lastError.message ?? '';
        if (msg.includes('source') && 'source' in payload) {
          const { source: _s, ...rest } = payload;
          void _s;
          payload = rest;
          continue;
        }
        if (msg.includes('impersonated_by') && 'impersonated_by' in payload) {
          const { impersonated_by: _ib, ...rest } = payload;
          void _ib;
          payload = rest;
          continue;
        }
        if (
          (msg.includes('calculated_time') || msg.includes('clock_out_time')) &&
          ('calculated_time' in payload || 'clock_out_time' in payload)
        ) {
          const { calculated_time: _ct, clock_out_time: _cot, ...rest } = payload;
          void _ct;
          void _cot;
          payload = rest;
          continue;
        }
        console.error('ERRORE SUPABASE:', error.message, (error as { details?: string }).details);
        throw error;
      }
      console.error('ERRORE SUPABASE (punch_records insert):', lastError?.message, lastError?.details);
      throw lastError ?? new Error('punch_records insert failed');
    },

    async update(id: string, updates: { timestamp?: string; calculated_time?: string; clock_out_time?: string | null }) {
      if (!supabase) return null;
      /** Normalizza a ISO completo per timestamptz (es. 2025-03-10T10:00:00 → 2025-03-10T10:00:00.000Z) */
      const toIso = (s: string): string => {
        const t = s.trim();
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(t)) return '';
        if (/Z$|\.\d{3}Z?$/.test(t)) return t;
        return t.replace(/(:\d{2})(?:\.[\d.]+)?$/, '$1.000Z');
      };
      const payload: Record<string, string | null> = {};
      if (updates.timestamp != null && updates.timestamp !== '') {
        const ts = toIso(String(updates.timestamp));
        if (ts) payload.timestamp = ts;
      }
      if (updates.calculated_time != null && updates.calculated_time !== '') {
        const ct = toIso(String(updates.calculated_time));
        if (ct) payload.calculated_time = ct;
      }
      if ('clock_out_time' in updates) {
        payload.clock_out_time = updates.clock_out_time != null
          ? toIso(String(updates.clock_out_time)) || updates.clock_out_time
          : null;
      }
      if (Object.keys(payload).length === 0) return null;
      let { data, error } = await supabase!
        .from('punch_records')
        .update(payload)
        .eq('id', id)
        .select()
        .maybeSingle();
      // Fallback progressivo: rimuove colonne opzionali una alla volta fino a successo
      if (error) {
        const msg = (error as { message?: string }).message ?? '';
        const optionalCols = ['clock_out_time', 'calculated_time'] as const;
        for (const col of optionalCols) {
          if (!error) break;
          if (payload[col] === undefined) continue;
          if (!msg.includes(col) && !msg.includes('schema cache') && !msg.includes('column')) continue;
          const fallback = { ...payload };
          delete fallback[col];
          if (Object.keys(fallback).length === 0) { error = null; break; }
          const res = await supabase!.from('punch_records').update(fallback).eq('id', id).select().maybeSingle();
          if (!res.error) { data = res.data; error = null; }
          else error = res.error;
        }
        // Ultimo tentativo: solo timestamp (campo garantito)
        if (error && payload.timestamp) {
          const res = await supabase!.from('punch_records').update({ timestamp: payload.timestamp }).eq('id', id).select().maybeSingle();
          if (!res.error) { data = res.data; error = null; }
        }
      }
      if (error) {
        console.error('punch_records.update error:', (error as { message?: string }).message, (error as { details?: string }).details);
        throw error;
      }
      return data;
    },

    async deleteForDate(dateStr: string) {
      if (!supabase) return;
      const dayStart = `${dateStr}T00:00:00.000Z`;
      const nextDay = new Date(dayStart);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const dayEnd = nextDay.toISOString();
      const { data } = await supabase!
        .from('punch_records')
        .select('id')
        .gte('timestamp', dayStart)
        .lt('timestamp', dayEnd);
      if (data && data.length > 0) {
        const ids = (data as { id: string }[]).map((r) => r.id);
        await supabase!.from('punch_records').delete().in('id', ids);
      }
    },

    async deleteForUserAndDate(userId: string, dateStr: string) {
      if (!supabase) return;
      const dayStart = `${dateStr}T00:00:00.000Z`;
      const nextDay = new Date(dayStart);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const dayEnd = nextDay.toISOString();
      const { data } = await supabase!
        .from('punch_records')
        .select('id')
        .eq('user_id', userId)
        .gte('timestamp', dayStart)
        .lt('timestamp', dayEnd);
      if (data && data.length > 0) {
        const ids = (data as { id: string }[]).map((r) => r.id);
        await supabase!.from('punch_records').delete().in('id', ids);
      }
    },

    async deleteByShiftId(shiftId: string) {
      if (!supabase) return;
      const { data } = await supabase!.from('punch_records').select('id').eq('shift_id', shiftId);
      if (data && data.length > 0) {
        await supabase!.from('punch_records').delete().in('id', data.map((r: { id: string }) => r.id));
      }
    },

    /** Elimina tutti i punch_records che hanno shift_id in una lista */
    async deleteByShiftIds(shiftIds: string[]) {
      if (!supabase || shiftIds.length === 0) return;
      const { data, error } = await supabase!
        .from('punch_records')
        .select('id')
        .in('shift_id', shiftIds);
      if (error) throw error;
      const ids = (data || []).map((r: { id: string }) => r.id);
      if (ids.length > 0) {
        const { error: delError } = await supabase!.from('punch_records').delete().in('id', ids);
        if (delError) throw delError;
      }
    },
  },

  /**
   * Audit log persistente per le modifiche manuali ai punch_records.
   * Richiede la tabella `punch_audit_log` su Supabase (vedere piano regola-inviolabile).
   * Tutte le funzioni gestiscono gracefully l'assenza della tabella (catch silenzioso).
   */
  punchAuditLog: {
    async insert(entry: Omit<PunchAuditEntry, 'id' | 'changed_at'>) {
      if (!supabase) return null;
      try {
        const { data, error } = await supabase!
          .from('punch_audit_log')
          .insert(entry)
          .select()
          .maybeSingle();
        if (error) {
          console.warn('punch_audit_log.insert error (tabella assente?):', error.message);
          return null;
        }
        return data as PunchAuditEntry | null;
      } catch (_e) {
        return null;
      }
    },

    async getByPunchId(punchRecordId: string): Promise<PunchAuditEntry[]> {
      if (!supabase) return [];
      try {
        const { data, error } = await supabase!
          .from('punch_audit_log')
          .select('*')
          .eq('punch_record_id', punchRecordId)
          .order('changed_at', { ascending: true });
        if (error) { console.warn('punch_audit_log.getByPunchId error:', error.message); return []; }
        return (data || []) as PunchAuditEntry[];
      } catch (_e) { return []; }
    },

    /** Carica in batch tutti gli audit entries per una lista di punch_record_id. */
    async getByPunchIds(punchRecordIds: string[]): Promise<PunchAuditEntry[]> {
      if (!supabase || punchRecordIds.length === 0) return [];
      try {
        const { data, error } = await supabase!
          .from('punch_audit_log')
          .select('*')
          .in('punch_record_id', punchRecordIds)
          .order('changed_at', { ascending: true });
        if (error) { console.warn('punch_audit_log.getByPunchIds error:', error.message); return []; }
        return (data || []) as PunchAuditEntry[];
      } catch (_e) { return []; }
    },
  },

  holidays: {
    async getAll() {
      if (!supabase) return [];
      const base = supabase.from('holiday_requests').select('*');
      const scoped = withTenant(base);
      const { data, error } = await scoped.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async getByUserId(userId: string) {
      if (!supabase) return [];
      const base = supabase.from('holiday_requests').select('*').eq('user_id', userId);
      const scoped = withTenant(base);
      const { data, error } = await scoped.order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async insert(request: Omit<HolidayRequest, 'id' | 'created_at'>) {
      // requester_email is a frontend-only field; strip it before sending to DB
       
      const { requester_email: _ignored, ...dbPayload } = request as typeof request & { requester_email?: string };
      const { data, error } = await supabase!
        .from('holiday_requests')
        .insert(withTenantPayload(dbPayload as Record<string, unknown>))
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async update(id: string, updates: Partial<HolidayRequest>) {
      const { data, error } = await supabase!
        .from('holiday_requests')
        .update(updates)
        .eq('id', id)
        .select()
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async delete(id: string) {
      if (!supabase) return;
      const { error } = await supabase!
        .from('holiday_requests')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
  },

  /** Disponibilità: alias di holiday_requests con type='indisponibilita'. */
  availability: {
    async getAll() {
      if (!supabase) return [];
      const base = supabase.from('holiday_requests').select('*').eq('type', 'indisponibilita');
      const scoped = withTenant(base);
      const { data, error } = await scoped.order('start_date', { ascending: true });
      if (error) throw error;
      return (data || []) as HolidayRequest[];
    },

    async getByUserId(userId: string) {
      if (!supabase) return [];
      const base = supabase
        .from('holiday_requests')
        .select('*')
        .eq('user_id', userId)
        .eq('type', 'indisponibilita');
      const scoped = withTenant(base);
      const { data, error } = await scoped.order('start_date', { ascending: true });
      if (error) throw error;
      return (data || []) as HolidayRequest[];
    },

    async toggle(userId: string, date: string, existing?: HolidayRequest): Promise<HolidayRequest | null> {
      if (!supabase) return null;
      // Se esiste già un record per questo giorno, eliminalo (toggle off)
      if (existing) {
        await supabase!.from('holiday_requests').delete().eq('id', existing.id);
        return null;
      }
      // Altrimenti crealo
      const { data, error } = await supabase!
        .from('holiday_requests')
        .insert({
          user_id: userId,
          start_date: date,
          end_date: date,
          type: 'indisponibilita',
          status: 'approved',
        })
        .select()
        .maybeSingle();
      if (error) throw error;
      return data as HolidayRequest;
    },
  },

  /**
   * Svuota turni, richieste ferie/indisponibilità, timbrature e notifiche (tutto il dataset operativo collegato).
   * NON tocca: users, shift_templates, ruoli o impostazioni app.
   * Ordine: prima punch_records (FK su shifts), poi shifts, holiday_requests, eventuale notifications.
   */
  async hardResetTestData(): Promise<{ shifts: number; holidays: number; punchRecords: number; notifications?: number }> {
    if (!supabase) {
      return { shifts: 0, holidays: 0, punchRecords: 0 };
    }
    const neverMatch = '00000000-0000-0000-0000-000000000000'; // nessun id reale è uguale → match tutti

    // 1. Attendance (Presenze) — prima per FK su shifts
    const { error: punchErr } = await supabase!.from('punch_records').delete().neq('id', neverMatch);
    if (punchErr) throw punchErr;

    // 2. Shifts (Turni)
    const { error: shiftErr } = await supabase!.from('shifts').delete().neq('id', neverMatch);
    if (shiftErr) throw shiftErr;

    // 3. HolidayRequests (Ferie)
    const { error: holidayErr } = await supabase!.from('holiday_requests').delete().neq('id', neverMatch);
    if (holidayErr) throw holidayErr;

    // 4. Notifications (se la tabella esiste)
    try {
      await supabase!.from('notifications').delete().neq('id', neverMatch);
    } catch (_e) {
      // Tabella assente o altro: ignoro
    }

    return { shifts: 0, holidays: 0, punchRecords: 0 };
  },

  /**
   * Inserisce dati di esempio per un dipendente (turni approvati/confermati, timbrature, ferie, campi profilo).
   * Non elimina nulla: chiamate ripetute duplicano i record.
   */
  async seedDemoProfileForUser(userId: string): Promise<{
    shifts: number;
    holidays: number;
    punchRecords: number;
    userUpdated: boolean;
    coworkerShifts: number;
  }> {
    if (!supabase) {
      throw new Error('Supabase non configurato');
    }
    const built = buildDemoProfileData(new Date(), userId);
    let coworkerShiftsBuilt: Omit<Shift, 'id'>[] = [];
    try {
      const allUsers = await database.users.getAll();
      const coworkers = (allUsers as User[])
        .filter((u) => u.id !== userId && isUserVisibleOnTeamSchedule(u))
        .slice(0, 4);
      coworkerShiftsBuilt = buildDemoCoworkerShiftsToday(new Date(), coworkers.map((c) => c.id));
    } catch (_e) {
      /* nessun elenco utenti: solo turni del profilo demo */
    }
    const shiftsToInsert = [...built.shifts, ...coworkerShiftsBuilt];
    /** Solo chiavi esplicite: mai `approved_*` nell’INSERT (batch PostgREST = unione colonne; oggetti “Shift” portano chiavi extra). */
    const shiftRowsFull = shiftsToInsert.map((s) => {
      const row: Record<string, string | boolean> = {
        user_id: s.user_id,
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time || '',
        type: s.type,
        approval_status: s.approval_status,
        deduct_break: s.deduct_break !== false,
      };
      if (s.notes && String(s.notes).trim()) row.notes = String(s.notes).trim();
      return row;
    });
    const shiftRowsMinimal = shiftsToInsert.map((s) => ({
      user_id: s.user_id,
      date: s.date,
      start_time: s.start_time,
      end_time: s.end_time || '',
      type: s.type,
      approval_status: s.approval_status,
    }));

    let insertedShifts: Shift[];
    const runInsert = async (rows: Record<string, string | boolean>[]) => {
      const { data, error } = await supabase!.from('shifts').insert(rows).select();
      if (error) throw error;
      return (data || []) as Shift[];
    };
    try {
      insertedShifts = await runInsert(shiftRowsFull);
    } catch (_e) {
      try {
        const noNotes = shiftRowsFull.map((r) => {
          const { notes: _n, ...rest } = r;
          void _n;
          return rest;
        });
        insertedShifts = await runInsert(noNotes);
      } catch (_e) {
        insertedShifts = await runInsert(shiftRowsMinimal);
      }
    }
    for (const orig of built.shifts) {
      if (!orig.approved_at) continue;
      const row = insertedShifts.find(
        (r) =>
          r.date === orig.date && (r.start_time || '').slice(0, 5) === (orig.start_time || '').slice(0, 5)
      );
      if (!row) continue;
      try {
        await database.shifts.update(row.id, {
          approved_at: orig.approved_at ?? undefined,
          approved_by: orig.approved_by ?? undefined,
          approved_start_time: orig.approved_start_time ?? undefined,
          approved_end_time: orig.approved_end_time ?? undefined,
        });
      } catch (_e) {
        /* DB senza colonne approved_*: il turno resta comunque creato */
      }
    }
    let punchCount = 0;
    for (const spec of built.punchSpecs) {
      const shift = insertedShifts.find(
        (s) => s.date === spec.date && (s.start_time || '').slice(0, 5) === spec.startTime
      );
      if (!shift) continue;
      for (const pr of punchRecordsFromSpecs(userId, shift.id, spec)) {
        await database.punchRecords.insert(pr);
        punchCount += 1;
      }
    }
    for (const h of built.holidays) {
      await database.holidays.insert(h);
    }
    let userUpdated = false;
    if (Object.keys(built.userPatch).length > 0) {
      await database.users.update(userId, built.userPatch);
      userUpdated = true;
    }
    return {
      shifts: insertedShifts.length,
      holidays: built.holidays.length,
      punchRecords: punchCount,
      userUpdated,
      coworkerShifts: coworkerShiftsBuilt.length,
    };
  },

  shiftTemplates: {
    async save(name: string, entries: Array<{ day_of_week: number; user_id: string; start_time: string; end_time: string; type: string }>) {
      if (!supabase) throw new Error('Supabase non configurato');
      const key = name.trim();
      const row = { name: key, data: entries };
      let { data, error } = await supabase!
        .from('shift_templates')
        .upsert(row, { onConflict: 'name' })
        .select()
        .maybeSingle();
      // DB senza UNIQUE su name → Postgres 42P10: fallback update / insert
      const errCode = (error as { code?: string })?.code;
      const errMsg = String((error as { message?: string })?.message || '');
      if (error && (errCode === '42P10' || errMsg.includes('42P10') || errMsg.includes('ON CONFLICT'))) {
        const { data: existing } = await supabase!.from('shift_templates').select('id').eq('name', key).maybeSingle();
        if (existing?.id) {
          ({ data, error } = await supabase!
            .from('shift_templates')
            .update({ data: entries })
            .eq('name', key)
            .select()
            .maybeSingle());
        } else {
          ({ data, error } = await supabase!.from('shift_templates').insert(row).select().maybeSingle());
        }
      }
      if (error) throw error;
      return data;
    },

    async load(name: string) {
      if (!supabase) return null;
      const { data, error } = await supabase!
        .from('shift_templates')
        .select('data')
        .eq('name', name)
        .maybeSingle();
      if (error) throw error;
      type TemplateRow = { data: Array<{ day_of_week: number; user_id: string; start_time: string; end_time: string; type: string }> };
      return data ? (data as TemplateRow).data : null;
    },

    async listAll(): Promise<string[]> {
      if (!supabase) return [];
      const { data, error } = await supabase!
        .from('shift_templates')
        .select('name')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []).map((r: { name: string }) => r.name);
    },

    /** `tenantId` riservato per allineamento API; `shift_templates` non è filtrato per tenant. */
    async listAllWithMeta(_tenantId?: string): Promise<Array<{ name: string; count: number; days: number[]; created_at?: string }>> {
      void _tenantId;
      if (!supabase) return [];
      // shift_templates non ha colonna tenant_id: nessun filtro per tenant
      const { data, error } = await supabase!
        .from('shift_templates')
        .select('name,data,created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      type Row = { name: string; data: Array<{ day_of_week: number }>; created_at?: string };
      return (data || []).map((r: Row) => {
        const entries = Array.isArray(r.data) ? r.data : [];
        const days = [...new Set(entries.map(e => e.day_of_week))].sort();
        return { name: r.name, count: entries.length, days, created_at: r.created_at };
      });
    },

    async delete(name: string) {
      if (!supabase) return;
      const { error } = await supabase!
        .from('shift_templates')
        .delete()
        .eq('name', name);
      if (error) throw error;
    },
  },

  realtime: {
    subscribeToShifts(userId: string | null, callback: (shifts: Shift[]) => void) {
      if (!supabase) return () => {};
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const topic = `shifts:${userId ?? 'all'}:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
      const pull = async () => {
        try {
          const data = userId ? await database.shifts.getByUserId(userId) : await database.shifts.getAll();
          callback(data);
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[realtime shifts] refetch failed', e);
        }
      };
      const channel = supabase!
        .channel(topic)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void pull();
          }, 200);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void pull();
          else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && import.meta.env.DEV) {
            console.warn('[realtime shifts]', status, topic);
          }
        });
      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        supabase!.removeChannel(channel);
      };
    },
    subscribeToHolidays(userId: string | null, callback: (holidays: HolidayRequest[]) => void) {
      if (!supabase) return () => {};
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const topic = `holidays:${userId ?? 'all'}:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
      const pull = async () => {
        try {
          const data = userId ? await database.holidays.getByUserId(userId) : await database.holidays.getAll();
          callback(data);
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[realtime holidays] refetch failed', e);
        }
      };
      const channel = supabase!
        .channel(topic)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'holiday_requests' }, () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void pull();
          }, 200);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void pull();
          else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && import.meta.env.DEV) {
            console.warn('[realtime holidays]', status, topic);
          }
        });
      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        supabase!.removeChannel(channel);
      };
    },
    subscribeToPunchRecords(userId: string | null, callback: (records: PunchRecord[]) => void) {
      if (!supabase) return () => {};
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      /** Nome univoco: due iscrizioni (AppProvider + StaffPersonalDashboard) non devono condividere lo stesso channel. */
      const topic = `punch-records:${userId ?? 'all'}:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
      const pull = async () => {
        try {
          const data = userId ? await database.punchRecords.getByUserId(userId) : await database.punchRecords.getAll();
          callback(data);
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[realtime punch_records] refetch failed', e);
        }
      };
      const channel = supabase!
        .channel(topic)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'punch_records' }, () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void pull();
          }, 200);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void pull();
          else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && import.meta.env.DEV) {
            console.warn('[realtime punch_records]', status, topic);
          }
        });
      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        supabase!.removeChannel(channel);
      };
    },
    subscribeToUsers(callback: (users: User[]) => void) {
      if (!supabase) return () => {};
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const topic = `users:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
      const pull = async () => {
        try {
          const data = await database.users.getAll();
          callback(data);
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[realtime users] refetch failed', e);
        }
      };
      const channel = supabase!
        .channel(topic)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void pull();
          }, 300);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void pull();
          else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && import.meta.env.DEV) {
            console.warn('[realtime users]', status, topic);
          }
        });
      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        supabase!.removeChannel(channel);
      };
    },
    /** Sincronizza holidays e availability quando holiday_requests cambia (web/mobile/app). */
    subscribeToHolidaysAndAvailability(
      onHolidays: (holidays: HolidayRequest[]) => void,
      onAvailability: (availability: HolidayRequest[]) => void
    ) {
      if (!supabase) return () => {};
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const topic = `holidays-avail:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
      const pull = async () => {
        try {
          const [holidays, avail] = await Promise.all([
            database.holidays.getAll(),
            database.availability.getAll(),
          ]);
          onHolidays(holidays);
          onAvailability(avail);
        } catch (e) {
          if (import.meta.env.DEV) console.warn('[realtime holidays+availability] refetch failed', e);
        }
      };
      const channel = supabase!
        .channel(topic)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'holiday_requests' }, () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void pull();
          }, 200);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void pull();
          else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && import.meta.env.DEV) {
            console.warn('[realtime holidays+availability]', status, topic);
          }
        });
      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        supabase!.removeChannel(channel);
      };
    },
    /** Dopo push del bundle impostazioni su Storage: altri client eseguono pull config. */
    subscribeToAppSettingsSyncSignal(onSignal: () => void) {
      if (!supabase || !isAppCloudSyncEnabled() || isAppSettingsSyncSignalRestSkipped()) return () => {};
      let debounceTimer: ReturnType<typeof setTimeout> | null = null;
      const topic = `app-settings-sync:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
      const channel = supabase!
        .channel(topic)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_settings_sync_signal' },
          () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              debounceTimer = null;
              onSignal();
            }, 900);
          }
        )
        .subscribe((status) => {
          if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && import.meta.env.DEV) {
            console.warn('[realtime app_settings_sync_signal]', status, topic);
          }
        });
      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        supabase!.removeChannel(channel);
      };
    },
  },

  // Feature flags are now stored in Supabase Storage (app-config/features.json)
  // via src/utils/featureFlags.ts — no DB table needed.
};
