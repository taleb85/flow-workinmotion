-- ============================================================
-- MIGRATION 001: Multi-tenant support
-- Eseguire su Supabase SQL Editor come superuser / service role
-- ============================================================

-- 1. Tabella sedi (tenants)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,          -- es. "osteria-basilico"
  name        text NOT NULL,                 -- es. "Osteria Basilico"
  accent_color text NOT NULL DEFAULT '#2D5A27',
  logo_url    text,
  plan        text NOT NULL DEFAULT 'basic', -- 'basic' | 'pro' | 'enterprise'
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed: sede di default (Osteria Basilico)
INSERT INTO public.tenants (slug, name, accent_color)
VALUES ('osteria-basilico', 'Osteria Basilico', '#2D5A27')
ON CONFLICT (slug) DO NOTHING;

-- 2. Aggiunta colonna tenant_id a tutte le tabelle dati
-- ============================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.punch_records
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- punch_audit_log potrebbe non esistere: usiamo IF EXISTS
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'punch_audit_log') THEN
    ALTER TABLE public.punch_audit_log
      ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.holiday_requests
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE public.shift_templates
  ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;

-- 3. Migrazione dati esistenti → tenant di default
-- ============================================================
DO $$
DECLARE
  default_tenant_id uuid;
BEGIN
  SELECT id INTO default_tenant_id FROM public.tenants WHERE slug = 'osteria-basilico';

  UPDATE public.users          SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.shifts         SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.punch_records  SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'punch_audit_log') THEN
    UPDATE public.punch_audit_log SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  END IF;
  UPDATE public.holiday_requests SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.notifications  SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
  UPDATE public.shift_templates SET tenant_id = default_tenant_id WHERE tenant_id IS NULL;
END $$;

-- 4. Indici per performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_users_tenant          ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_tenant         ON public.shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_punch_records_tenant  ON public.punch_records(tenant_id);
-- idx_punch_audit_tenant: la tabella punch_audit_log potrebbe non esistere
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'punch_audit_log') THEN
    CREATE INDEX IF NOT EXISTS idx_punch_audit_tenant ON public.punch_audit_log(tenant_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_holidays_tenant       ON public.holiday_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant  ON public.notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shift_templates_tenant ON public.shift_templates(tenant_id);

-- 5. RLS – Row Level Security
-- ============================================================
-- Strategia: l'app passa sempre tenant_id esplicitamente nelle query
-- RLS aggiunge un layer di sicurezza usando il claim JWT custom "tenant_id"
-- che viene iniettato dal TenantContext via supabase.rpc('set_tenant_claim', ...)
-- PER ORA: RLS permissivo (anon vede tutto) — il filtro è a livello applicativo.
-- Hardening RLS con JWT claim è lo step successivo (002_rls_tenant_claims.sql).

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenants_public_read' AND tablename = 'tenants') THEN
    CREATE POLICY "tenants_public_read" ON public.tenants
      FOR SELECT TO anon USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenants_service_all' AND tablename = 'tenants') THEN
    CREATE POLICY "tenants_service_all" ON public.tenants
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Tabella super_admins: utenti con accesso a tutti i tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS public.super_admins (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  pin_hash   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Accesso solo via service_role
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'super_admins_service_only' AND tablename = 'super_admins') THEN
    CREATE POLICY "super_admins_service_only" ON public.super_admins
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. Funzione updated_at automatico per tenants
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tenants_updated_at ON public.tenants;
CREATE TRIGGER tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
