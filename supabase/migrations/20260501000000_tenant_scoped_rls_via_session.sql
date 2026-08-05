/*
 * Tenant-scoped RLS via session variable `app.tenant_id`.
 *
 * Questo migration aggiunge RLS tenant-scoped alle tabelle operative.
 * L'app chiama `set_session_tenant(tenant_id)` dopo il login,
 * e le policy filtrano automaticamente per tenant_id.
 *
 * Replaces permissive `USING (true)` policies with tenant-scoped ones.
 */

-- ── Helper: imposta tenant_id nella sessione corrente ─────────────────────
CREATE OR REPLACE FUNCTION public.set_session_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, false);
END;
$$;

-- ── Helper: imposta utente_id nella sessione corrente ────────────────────
CREATE OR REPLACE FUNCTION public.set_session_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.user_id', p_user_id::text, false);
END;
$$;

-- ── Helper: clear session ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.clear_app_session()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', '', false);
  PERFORM set_config('app.user_id', '', false);
END;
$$;

-- ── Helper: read current session values ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_session_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v text := current_setting('app.tenant_id', true);
BEGIN
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_session_user_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v text := current_setting('app.user_id', true);
BEGIN
  IF v IS NULL OR v = '' THEN RETURN NULL; END IF;
  RETURN v::uuid;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;

-- ── TENANTS (public read, service all) ──────────────────────────────────
DROP POLICY IF EXISTS "tenants_public_read" ON public.tenants;
DROP POLICY IF EXISTS "tenants_service_all" ON public.tenants;

CREATE POLICY "tenants_public_read" ON public.tenants
  FOR SELECT USING (true);
CREATE POLICY "tenants_service_all" ON public.tenants
  FOR ALL USING (false);

-- ── USERS ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can select users" ON public.users;
DROP POLICY IF EXISTS "Anon can insert users" ON public.users;
DROP POLICY IF EXISTS "Anon can update users" ON public.users;
DROP POLICY IF EXISTS "Anon can delete users" ON public.users;
DROP POLICY IF EXISTS "anon_can_delete_users" ON public.users;

CREATE POLICY "users_select_own_or_tenant" ON public.users
  FOR SELECT USING (
    get_session_tenant_id() IS NULL
    OR tenant_id = get_session_tenant_id()
  );

CREATE POLICY "users_insert_own_tenant" ON public.users
  FOR INSERT WITH CHECK (
    tenant_id = get_session_tenant_id()
  );

CREATE POLICY "users_update_own_tenant" ON public.users
  FOR UPDATE USING (
    tenant_id = get_session_tenant_id()
  );

CREATE POLICY "users_delete_admin_only" ON public.users
  FOR DELETE USING (
    tenant_id = get_session_tenant_id()
    AND (-- solo admin: controllo via permission flags
      id = get_session_user_id()
      AND (
        SELECT can_create_shifts FROM public.users WHERE id = get_session_user_id()
      ) IS TRUE
    )
  );

-- ── SHIFTS ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can select shifts" ON public.shifts;
DROP POLICY IF EXISTS "Anon can insert shifts" ON public.shifts;
DROP POLICY IF EXISTS "Anon can update shifts" ON public.shifts;
DROP POLICY IF EXISTS "Anon can delete shifts" ON public.shifts;

CREATE POLICY "shifts_select_tenant" ON public.shifts
  FOR SELECT USING (
    get_session_tenant_id() IS NULL
    OR tenant_id = get_session_tenant_id()
  );

CREATE POLICY "shifts_insert_tenant" ON public.shifts
  FOR INSERT WITH CHECK (
    tenant_id = get_session_tenant_id()
  );

CREATE POLICY "shifts_update_tenant" ON public.shifts
  FOR UPDATE USING (
    tenant_id = get_session_tenant_id()
  );

CREATE POLICY "shifts_delete_tenant" ON public.shifts
  FOR DELETE USING (
    tenant_id = get_session_tenant_id()
  );

-- ── PUNCH RECORDS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can select punch records" ON public.punch_records;
DROP POLICY IF EXISTS "Anon can insert punch records" ON public.punch_records;
DROP POLICY IF EXISTS "Anon can update punch records" ON public.punch_records;
DROP POLICY IF EXISTS "Anon can delete punch records" ON public.punch_records;

CREATE POLICY "punch_records_select_tenant" ON public.punch_records
  FOR SELECT USING (
    get_session_tenant_id() IS NULL
    OR tenant_id = get_session_tenant_id()
  );

CREATE POLICY "punch_records_insert_tenant" ON public.punch_records
  FOR INSERT WITH CHECK (
    tenant_id = get_session_tenant_id()
  );

CREATE POLICY "punch_records_update_tenant" ON public.punch_records
  FOR UPDATE USING (
    tenant_id = get_session_tenant_id()
  );

CREATE POLICY "punch_records_delete_tenant" ON public.punch_records
  FOR DELETE USING (
    tenant_id = get_session_tenant_id()
  );

-- ── HOLIDAY REQUESTS ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can select holiday requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Anon can insert holiday requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Anon can update holiday requests" ON public.holiday_requests;
DROP POLICY IF EXISTS "Anon can delete holiday requests" ON public.holiday_requests;

CREATE POLICY "holiday_requests_select_tenant" ON public.holiday_requests
  FOR SELECT USING (
    get_session_tenant_id() IS NULL
    OR tenant_id = get_session_tenant_id()
  );

CREATE POLICY "holiday_requests_insert_tenant" ON public.holiday_requests
  FOR INSERT WITH CHECK (
    tenant_id = get_session_tenant_id()
  );

CREATE POLICY "holiday_requests_update_tenant" ON public.holiday_requests
  FOR UPDATE USING (
    tenant_id = get_session_tenant_id()
  );

CREATE POLICY "holiday_requests_delete_tenant" ON public.holiday_requests
  FOR DELETE USING (
    tenant_id = get_session_tenant_id()
  );

-- ── PUNCH AUDIT LOG ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'punch_audit_log') THEN
    DROP POLICY IF EXISTS "anon_all_punch_audit_log" ON public.punch_audit_log;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'punch_audit_log_select_tenant' AND tablename = 'punch_audit_log') THEN
      CREATE POLICY "punch_audit_log_select_tenant" ON public.punch_audit_log
        FOR SELECT USING (
          get_session_tenant_id() IS NULL
          OR tenant_id = get_session_tenant_id()
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'punch_audit_log_insert_tenant' AND tablename = 'punch_audit_log') THEN
      CREATE POLICY "punch_audit_log_insert_tenant" ON public.punch_audit_log
        FOR INSERT WITH CHECK (
          tenant_id = get_session_tenant_id()
        );
    END IF;
  END IF;
END $$;

-- ── NOTIFICATIONS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anon can select notifications" ON public.notifications;
DROP POLICY IF EXISTS "Anon can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Anon can update notifications" ON public.notifications;
DROP POLICY IF EXISTS "Anon can delete notifications" ON public.notifications;

DO $$
BEGIN
  -- Usa user_id (la colonna reale) invece di recipient_user_id
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_select_self' AND tablename = 'notifications') THEN
    CREATE POLICY "notifications_select_self" ON public.notifications
      FOR SELECT USING (
        get_session_user_id() IS NULL
        OR user_id = get_session_user_id()
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'notifications_insert_tenant' AND tablename = 'notifications') THEN
    CREATE POLICY "notifications_insert_tenant" ON public.notifications
      FOR INSERT WITH CHECK (
        get_session_tenant_id() IS NULL
        OR tenant_id = get_session_tenant_id()
      );
  END IF;
END $$;

-- ── APP SETTINGS SYNC SIGNAL ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'app_settings_sync_signal' AND column_name = 'tenant_id') THEN
    DROP POLICY IF EXISTS "app_settings_sync_signal_anon_select" ON public.app_settings_sync_signal;
    DROP POLICY IF EXISTS "app_settings_sync_signal_anon_insert" ON public.app_settings_sync_signal;
    DROP POLICY IF EXISTS "app_settings_sync_signal_anon_update" ON public.app_settings_sync_signal;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'app_settings_sync_signal_select_tenant' AND tablename = 'app_settings_sync_signal') THEN
      CREATE POLICY "app_settings_sync_signal_select_tenant" ON public.app_settings_sync_signal
        FOR SELECT USING (
          get_session_tenant_id() IS NULL
          OR tenant_id = get_session_tenant_id()
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'app_settings_sync_signal_insert_tenant' AND tablename = 'app_settings_sync_signal') THEN
      CREATE POLICY "app_settings_sync_signal_insert_tenant" ON public.app_settings_sync_signal
        FOR INSERT WITH CHECK (
          get_session_tenant_id() IS NULL
          OR tenant_id = get_session_tenant_id()
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'app_settings_sync_signal_update_tenant' AND tablename = 'app_settings_sync_signal') THEN
      CREATE POLICY "app_settings_sync_signal_update_tenant" ON public.app_settings_sync_signal
        FOR UPDATE USING (
          get_session_tenant_id() IS NULL
          OR tenant_id = get_session_tenant_id()
        );
    END IF;
  END IF;
END $$;

-- ── SHIFT TEMPLATES (global, no tenant_id) ───────────────────────────────
DROP POLICY IF EXISTS "anon_select_shift_templates" ON public.shift_templates;
DROP POLICY IF EXISTS "anon_insert_shift_templates" ON public.shift_templates;
DROP POLICY IF EXISTS "anon_update_shift_templates" ON public.shift_templates;
DROP POLICY IF EXISTS "anon_delete_shift_templates" ON public.shift_templates;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'shift_templates_all_anon' AND tablename = 'shift_templates') THEN
    CREATE POLICY "shift_templates_all_anon" ON public.shift_templates
      FOR ALL USING (true);
  END IF;
END $$;

-- ── SUPER ADMINS ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "super_admins_service_only" ON public.super_admins;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'super_admins_service_only' AND tablename = 'super_admins') THEN
    CREATE POLICY "super_admins_service_only" ON public.super_admins
      FOR ALL USING (false);
  END IF;
END $$;
