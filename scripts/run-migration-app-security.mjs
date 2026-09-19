/**
 * Applica le migrazioni di sicurezza accesso app, in ordine:
 *   1. supabase/migrations/20260919000000_user_devices.sql
 *   2. supabase/migrations/20260919000100_user_app_lock.sql
 * Uso: npm run db:migrate-app-security
 *
 * Connessione: DATABASE_POOLER_URL in .env.local, oppure supabase/.temp/pooler-url
 * + password da DATABASE_URL, altrimenti DATABASE_URL (direct, IPv6).
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  '20260919000000_user_devices.sql',
  '20260919000100_user_app_lock.sql',
];

function readEnvValue(key) {
  try {
    const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
    const match =
      env.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm')) ||
      env.match(new RegExp(`^${key}\\s*=\\s*'([^']+)'`, 'm')) ||
      env.match(new RegExp(`^${key}\\s*=\\s*(\\S+)`, 'm'));
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

/** Candidati di connessione, dal più affidabile (pooler IPv4) al direct. */
function connectionCandidates() {
  const out = [];

  const poolerExplicit = process.env.DATABASE_POOLER_URL || readEnvValue('DATABASE_POOLER_URL');
  if (poolerExplicit) out.push({ url: poolerExplicit, label: 'DATABASE_POOLER_URL' });

  const direct = process.env.DATABASE_URL || readEnvValue('DATABASE_URL');
  try {
    const poolerRaw = readFileSync(resolve(__dirname, '../supabase/.temp/pooler-url'), 'utf8').trim();
    if (poolerRaw && direct) {
      const u = new URL(poolerRaw);
      u.password = decodeURIComponent(new URL(direct).password);
      out.push({ url: u.toString(), label: 'pooler-url (.temp) + DATABASE_URL' });
    }
  } catch {
    /* pooler-url non disponibile */
  }

  if (direct) out.push({ url: direct, label: 'DATABASE_URL (direct)' });
  return out;
}

async function main() {
  const candidates = connectionCandidates();
  if (candidates.length === 0) {
    console.error('❌ Nessuna connection string: imposta DATABASE_POOLER_URL o DATABASE_URL in .env.local');
    process.exit(1);
  }

  const statements = MIGRATIONS.map((file) => ({
    file,
    sql: readFileSync(resolve(__dirname, `../supabase/migrations/${file}`), 'utf8'),
  }));

  const pg = (await import('pg')).default;
  let lastErr = null;

  for (const { url, label } of candidates) {
    const u = new URL(url);
    const client = new pg.Client({
      host: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '') || 'postgres',
      ssl: { rejectUnauthorized: false, servername: u.hostname },
      connectionTimeoutMillis: 15000,
    });
    try {
      await client.connect();
      for (const { file, sql } of statements) {
        await client.query(sql);
        console.log('✓', file);
      }
      await client.end();
      console.log(`\n✅ Migrazioni sicurezza accesso applicate su ${u.hostname} (via ${label}).`);
      return;
    } catch (err) {
      lastErr = err;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      console.warn(`⚠️  ${label} fallita: ${String(err.message).split('\n')[0]}`);
    }
  }

  console.error('❌ Tutti i tentativi di connessione sono falliti.');
  if (lastErr) console.error('   Ultimo errore:', lastErr.message);
  console.error('\n→ In alternativa incolla i file in Supabase → SQL Editor.');
  process.exit(1);
}

main();
