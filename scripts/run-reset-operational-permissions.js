/**
 * Imposta i cinque flag gestionali solo per `admin` (stesso effetto della migration SQL).
 *
 * Ordine:
 * 1) Postgres se c’è DATABASE_POOLER_URL / DATABASE_URL
 * 2) In caso di errore di rete (es. IPv6) o senza URI: Supabase REST con VITE_SUPABASE_URL + VITE_SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso: node scripts/run-reset-operational-permissions.js
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const dbUrl = process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const sqlPath = resolve(__dirname, '../supabase/migrations/20260323200000_reset_non_admin_operational_permissions.sql');

const OFF = {
  can_create_shifts: false,
  can_approve_shifts: false,
  can_manage_drafts: false,
  can_view_total_hours: false,
  can_edit_staff_pins: false,
};
const ON = {
  can_create_shifts: true,
  can_approve_shifts: true,
  can_manage_drafts: true,
  can_view_total_hours: true,
  can_edit_staff_pins: true,
};

function isNetworkish(err) {
  const m = String(err?.message || '');
  const c = err?.code || '';
  return (
    m.includes('EHOSTUNREACH') ||
    m.includes('ENETUNREACH') ||
    m.includes('ETIMEDOUT') ||
    c === 'EHOSTUNREACH' ||
    c === 'ENETUNREACH' ||
    c === 'ETIMEDOUT'
  );
}

async function tryPostgres() {
  if (!dbUrl) return { skip: true };
  const pg = (await import('pg')).default;
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: true },
  });
  try {
    await client.connect();
    const sql = readFileSync(sqlPath, 'utf8').trim();
    await client.query(sql);
    await client.end();
    console.log('✅ Reset permessi operativi applicato (Postgres).');
    return { ok: true };
  } catch (err) {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return { ok: false, err };
  }
}

async function tryApi() {
  const URL = process.env.VITE_SUPABASE_URL;
  const KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  if (!URL || !KEY) {
    return { ok: false, err: new Error('Mancano VITE_SUPABASE_URL o VITE_SUPABASE_SERVICE_ROLE_KEY') };
  }
  const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error: e1 } = await supabase.from('users').update(OFF).neq('role', 'admin');
  if (e1) return { ok: false, err: e1 };
  const { error: e2 } = await supabase.from('users').update(ON).eq('role', 'admin');
  if (e2) return { ok: false, err: e2 };
  console.log('✅ Reset permessi operativi applicato (API Supabase).');
  return { ok: true };
}

async function main() {
  const pg = await tryPostgres();
  if (pg.ok) return;

  if (pg.err && !isNetworkish(pg.err) && dbUrl) {
    if (pg.err.message?.includes('EHOSTUNREACH') && process.env.DATABASE_URL && !process.env.DATABASE_POOLER_URL) {
      console.error('⚠️ Postgres: connessione non riuscita (spesso IPv6). Provo via API…\n');
    } else {
      console.error('❌ Postgres:', pg.err.message);
      if (!process.env.VITE_SUPABASE_SERVICE_ROLE_KEY) process.exit(1);
    }
  } else if (pg.skip && !dbUrl) {
    /* niente URI, solo API */
  } else if (pg.err && isNetworkish(pg.err)) {
    console.error('⚠️ Postgres non raggiungibile, provo via API Supabase…\n');
  }

  const api = await tryApi();
  if (api.ok) return;

  console.error('❌ API:', api.err?.message || api.err);
  if (!dbUrl) {
    console.error('\nAggiungi DATABASE_URL o DATABASE_POOLER_URL, oppure VITE_SUPABASE_URL + VITE_SUPABASE_SERVICE_ROLE_KEY nel .env');
  }
  process.exit(1);
}

main();
