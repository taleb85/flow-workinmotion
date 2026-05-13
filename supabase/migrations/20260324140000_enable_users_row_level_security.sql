/*
  Allinea lo stato RLS alla presenza delle policy su `public.users`.

  L’advisor Supabase segnala policy definite (es. anon_can_*_users_for_pin_app) con RLS
  disattivato: in quel caso PostgreSQL **non applica** quelle policy e valgono solo i GRANT.

  Le migrazioni storiche (create_osteria_basilico_schema, implement_secure_rls_policies_v2)
  abilitano già RLS; questa migrazione è idempotente e corregge drift (RLS spento da SQL
  manuale o tabella ricreata senza ENABLE).
*/

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
