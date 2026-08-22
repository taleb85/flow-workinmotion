-- Migration: revoca link di accesso condiviso per utente
-- Se true, i link condivisi (/i/:slug) NON autocompilano più le credenziali:
-- chi li apre viene mandato al login normale.
-- Da applicare via Supabase SQL Editor (come manual_paste_sql_editor_rls.sql).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS invite_revoked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.invite_revoked IS
  'Se true, i link di accesso condivisi non autocompilano più le credenziali (revoca link).';
