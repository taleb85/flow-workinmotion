/**
 * Applica la migrazione della tabella shift_audit_log
 * (supabase/migrations/20260813000000_create_shift_audit_log.sql).
 * Uso: npm run db:migrate-shift-audit-log
 *
 * Connessione via Supabase Pooler (IPv4) — l'host direct db.*.supabase.co
 * risolve solo IPv6 (non raggiungibile da reti senza IPv6).
 * - DATABASE_POOLER_URL in .env.local (preferita, es. dal dashboard)
 * - oppure supabase/.temp/pooler-url + password da DATABASE_URL
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readEnvValue(key) {
  try {
    const env = readFileSync(resolve(__dirname, '../.env.local'), 'utf8');
    const match = env.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'))
      || env.match(new RegExp(`^${key}\\s*=\\s*'([^']+)'`, 'm'))
      || env.match(new RegExp(`^${key}\\s*=\\s*(\\S+)`, 'm'));
    return match ? match[1].trim() : null;
  } catch {
    return null;
  }
}

const sqlPath = resolve(__dirname, '../supabase/migrations/20260813000000_create_shift_audit_log.sql');
const sql = readFileSync(sqlPath, 'utf8');

async function main() {
  // 1) DATABASE_POOLER_URL esplicita (dal dashboard, IPv4)
  let connUrl = readEnvValue('DATABASE_POOLER_URL');
  let hostLabel = 'DATABASE_POOLER_URL (.env.local)';

  // 2) Fallback: pooler-url + password da DATABASE_URL
  if (!connUrl) {
    try {
      const poolerRaw = readFileSync(resolve(__dirname, '../supabase/.temp/pooler-url'), 'utf8').trim();
      const dbUrl = readEnvValue('DATABASE_URL');
      if (poolerRaw && dbUrl) {
        const u = new URL(poolerRaw);
        u.password = decodeURIComponent(new URL(dbUrl).password);
        connUrl = u.toString();
        hostLabel = 'pooler-url (.temp) + DATABASE_URL';
      }
    } catch {
      /* ignore */
    }
  }

  if (!connUrl) {
    console.error('❌ DATABASE_POOLER_URL non trovata in .env.local');
    process.exit(1);
  }

  try {
    const u = new URL(connUrl);
    const pg = (await import('pg')).default;
    const client = new pg.Client({
      host: u.hostname,
      port: Number(u.port || 5432),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ''),
      ssl: { rejectUnauthorized: false, servername: u.hostname },
    });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log(`✅ Tabella shift_audit_log creata su ${u.hostname} (via ${hostLabel}).`);
  } catch (err) {
    console.error('❌ Errore:', err.message);
    process.exit(1);
  }
}

main();
