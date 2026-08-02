/**
 * seedTenantFromTemplate
 *
 * Copia utenti (anonimizzati) e turni della settimana corrente dal tenant
 * template (default: slug del tenant sorgente) verso un tenant appena creato.
 * Aggiorna anche le impostazioni operative del nuovo tenant preservando
 * accent_color, header_font e azzerando geofence (coordinata fisica locale).
 */
import { SupabaseClient } from '@supabase/supabase-js';
import type { Tenant, TenantSettings, User, Shift } from '../types';

/** Restituisce la data YYYY-MM-DD del lunedì della settimana corrente (locale). */
function getWeekStart(): string {
  const today = new Date();
  const day = today.getDay(); // 0=Dom, 1=Lun…
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff);
  return mon.toISOString().slice(0, 10);
}

/** Aggiunge N giorni a una data YYYY-MM-DD → YYYY-MM-DD. */
function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Giorno della settimana (0=Lun…6=Dom) per una data YYYY-MM-DD. */
function weekdayIndex(date: string): number {
  const d = new Date(date + 'T00:00:00');
  return (d.getDay() + 6) % 7; // trasforma Dom(0)→6, Lun(1)→0 …
}

export async function seedTenantFromTemplate(
  supabase: SupabaseClient,
  newTenantId: string,
  templateSlug = 'osteria-basilico',
): Promise<void> {
  // ── 1. Fetch tenant template ────────────────────────────────────────────────
  const { data: templateTenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('*')
    .eq('slug', templateSlug)
    .maybeSingle();

  if (tenantErr) throw new Error(`Errore fetch tenant template: ${tenantErr.message}`);
  if (!templateTenant) throw new Error(`Tenant template "${templateSlug}" non trovato.`);

  const tpl = templateTenant as Tenant;

  // ── 2. Fetch impostazioni correnti del nuovo tenant (per preservare header_font) ──
  const { data: newTenantRow } = await supabase
    .from('tenants')
    .select('settings')
    .eq('id', newTenantId)
    .maybeSingle();

  const newSettings = (newTenantRow as { settings: TenantSettings } | null)?.settings ?? {};

  // Merge: copia tutto da OB tranne i campi di branding e la geofence fisica
  const mergedSettings: TenantSettings = {
    ...tpl.settings,
    header_font: newSettings.header_font ?? tpl.settings?.header_font ?? 'parisienne',
    geofence: null, // coordinate fisiche di OB non applicabili ad altri locali
  };

  const { error: settingsErr } = await supabase
    .from('tenants')
    .update({ settings: mergedSettings })
    .eq('id', newTenantId);

  if (settingsErr) throw new Error(`Errore aggiornamento settings: ${settingsErr.message}`);

  // ── 3. Fetch utenti attivi del template ─────────────────────────────────────
  const { data: templateUsers, error: usersErr } = await supabase
    .from('users')
    .select('*')
    .eq('tenant_id', tpl.id)
    .eq('status', 'active')
    .order('sort_order', { ascending: true });

  if (usersErr) throw new Error(`Errore fetch utenti template: ${usersErr.message}`);
  const tplUsers = (templateUsers ?? []) as User[];

  if (tplUsers.length === 0) return; // nessun utente — fine

  // ── 4. Costruisci utenti anonimizzati ───────────────────────────────────────
  const newUsers = tplUsers.map((u, i) => ({
    tenant_id:               newTenantId,
    first_name:              'Dipendente',
    last_name:               String(i + 1),
    email:                   `dipendente${i + 1}@demo.local`,
    pin:                     String(1000 + i + 1),
    role:                    u.role,
    status:                  'active' as const,
    sort_order:              u.sort_order,
    language:                u.language,
    theme:                   u.theme,
    department:              u.department ?? null,
    can_create_shifts:       u.can_create_shifts,
    can_approve_shifts:      u.can_approve_shifts,
    can_view_total_hours:    u.can_view_total_hours,
    can_edit_staff_pins:     u.can_edit_staff_pins,
    can_manage_drafts:       u.can_manage_drafts,
    can_request_holidays:    u.can_request_holidays ?? false,
    can_punch_from_app:      u.can_punch_from_app ?? false,
    hourly_rate_eur:         u.hourly_rate_eur ?? null,
    hide_from_team_schedule: u.hide_from_team_schedule ?? false,
    enabled_features:        u.enabled_features ?? null,
    // Non copiare: monthly_confirmed, employment_start/end, ui_section_overrides
    employment_start_date:   null,
    employment_end_date:     null,
  }));

  const { data: insertedUsers, error: usersInsertErr } = await supabase
    .from('users')
    .insert(newUsers)
    .select('id');

  if (usersInsertErr) throw new Error(`Errore insert utenti: ${usersInsertErr.message}`);
  const inserted = (insertedUsers ?? []) as { id: string }[];

  // ── 5. Mappa oldId → newId ──────────────────────────────────────────────────
  const idMap = new Map<string, string>();
  tplUsers.forEach((u, i) => {
    if (inserted[i]?.id) idMap.set(u.id, inserted[i].id);
  });

  // ── 6 & 7. Fetch turni template – settimana corrente, fallback ±14 giorni ───
  const weekStart = getWeekStart();
  const weekEnd   = addDays(weekStart, 6);

  const { data: templateShiftsData, error: shiftsErr } = await supabase
    .from('shifts')
    .select('*')
    .eq('tenant_id', tpl.id)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  if (shiftsErr) throw new Error(`Errore fetch turni: ${shiftsErr.message}`);

  let templateShifts = templateShiftsData;

  // Fallback: ultimi 14 giorni → remap al giorno della settimana corrente
  if (!templateShifts || templateShifts.length === 0) {
    const past14 = addDays(weekStart, -14);
    const res = await supabase
      .from('shifts')
      .select('*')
      .eq('tenant_id', tpl.id)
      .gte('date', past14)
      .lt('date', weekStart);
    if (res.error) throw new Error(`Errore fetch turni fallback: ${res.error.message}`);
    templateShifts = res.data ?? [];
  }

  if (!templateShifts || templateShifts.length === 0) return; // nessun turno

  // ── 8. Remap turni ──────────────────────────────────────────────────────────
  const newShifts = (templateShifts as Shift[])
    .filter((s) => idMap.has(s.user_id))
    .map((s) => {
      const dow  = weekdayIndex(s.date);          // 0=Lun…6=Dom
      const newDate = addDays(weekStart, dow);     // stessa posizione nella settimana corrente
      return {
        tenant_id:       newTenantId,
        user_id:         idMap.get(s.user_id)!,
        date:            newDate,
        start_time:      s.start_time,
        end_time:        s.end_time,
        type:            s.type,
        approval_status: 'draft' as const,
        notes:           s.notes ?? null,
        deduct_break:    s.deduct_break ?? true,
        break_minutes:   s.break_minutes ?? null,
        is_auto_break:   s.is_auto_break ?? false,
        department:      s.department ?? null,
        skills:          s.skills ?? null,
        // Non copiare: admin_note
      };
    });

  if (newShifts.length === 0) return;

  // Evita duplicati per stesso utente+data: teniamo il primo occorrente per coppia
  const seen = new Set<string>();
  const deduped = newShifts.filter((s) => {
    const key = `${s.user_id}|${s.date}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const { error: shiftsInsertErr } = await supabase
    .from('shifts')
    .insert(deduped);

  if (shiftsInsertErr) throw new Error(`Errore insert turni: ${shiftsInsertErr.message}`);
}
