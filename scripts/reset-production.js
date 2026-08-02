/**
 * Reset Produzione - FLOW — Work in Motion
 * Cancella tutti i turni, timbrature e richieste ferie. Disattiva utenti Test/Guest.
 *
 * Uso: node scripts/reset-production.js
 * Richiede: .env con VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '../.env');
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('❌ VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_ROLE_KEY richiesti in .env');
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

async function fetchAll(table, select = 'id') {
  const res = await fetch(`${URL}/rest/v1/${table}?select=${select}`, { headers });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function deleteByIds(table, ids) {
  if (ids.length === 0) return;
  const batch = 100;
  for (let i = 0; i < ids.length; i += batch) {
    const chunk = ids.slice(i, i + batch);
    const res = await fetch(`${URL}/rest/v1/${table}?id=in.(${chunk.join(',')})`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(`${table} delete: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  console.log('🔄 Reset produzione in corso...\n');

  const [shifts, punches, holidays, users] = await Promise.all([
    fetchAll('shifts'),
    fetchAll('punch_records'),
    fetchAll('holiday_requests'),
    fetchAll('users', 'id,first_name,status'),
  ]);

  console.log(`   Turni: ${shifts.length}`);
  console.log(`   Timbrature: ${punches.length}`);
  console.log(`   Richieste ferie: ${holidays.length}`);

  await Promise.all([
    deleteByIds('shifts', shifts.map((s) => s.id)),
    deleteByIds('punch_records', punches.map((p) => p.id)),
    deleteByIds('holiday_requests', holidays.map((h) => h.id)),
  ]);

  const testUsers = users.filter(
    (u) =>
      (u.first_name?.toLowerCase?.() === 'test' ||
        u.first_name?.toLowerCase?.() === 'guest' ||
        (u.first_name?.toLowerCase?.().includes('test') && u.last_name?.toLowerCase?.() === 'user')) &&
      u.status !== 'suspended'
  );

  for (const u of testUsers) {
    const res = await fetch(`${URL}/rest/v1/users?id=eq.${u.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ status: 'suspended' }),
    });
    if (!res.ok) throw new Error(`users update: ${res.status}`);
    console.log(`   Disattivato: ${u.first_name}`);
  }

  console.log('\n✅ Reset completato.');
  console.log('   Aggiungi i turni da calendario nell\'app o tramite import dati.');
}

main().catch((e) => {
  console.error('❌ Errore:', e.message);
  process.exit(1);
});
