/**
 * Pulizia turni - FLOW — Work in Motion
 * CANCELLA tutti i record nella tabella shifts (nessuna cache, operazione diretta su Supabase).
 *
 * Uso: node scripts/clean-shifts.js
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

async function main() {
  const res = await fetch(`${URL}/rest/v1/shifts?select=id`, { headers });
  if (!res.ok) throw new Error(`shifts fetch: ${res.status} ${await res.text()}`);
  const shifts = await res.json();

  if (shifts.length === 0) {
    console.log('Nessun turno nella tabella. Tabella già pulita.');
    return;
  }

  const batch = 100;
  for (let i = 0; i < shifts.length; i += batch) {
    const chunk = shifts.slice(i, i + batch);
    const delRes = await fetch(`${URL}/rest/v1/shifts?id=in.(${chunk.map((s) => s.id).join(',')})`, {
      method: 'DELETE',
      headers,
    });
    if (!delRes.ok) throw new Error(`shifts delete: ${delRes.status} ${await delRes.text()}`);
  }

  console.log(`✅ Eliminati ${shifts.length} turni. Esegui: npm run seed:today per creare i turni di oggi.`);
}

main().catch((e) => {
  console.error('❌ Errore:', e.message);
  process.exit(1);
});
