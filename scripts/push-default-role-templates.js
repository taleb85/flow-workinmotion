/**
 * Carica su Storage `app-config/role_feature_templates.json` i default allineati al codice
 * (src/utils/enabledFeatures.ts + defaultOperationalTemplateBase in settingsPermissionRows.ts).
 *
 * Richiede: .env con VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_ROLE_KEY
 *
 * Uso:
 *   node scripts/push-default-role-templates.js           # upload
 *   node scripts/push-default-role-templates.js --dry-run # solo stampa JSON
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

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes('--dry-run');

/** Allineare a ENABLED_FEATURE_KEYS in enabledFeatures.ts */
const ENABLED_FEATURE_KEYS = [
  'team_view',
  'edit_shifts',
  'approve_shifts',
  'export_pdf',
  'view_stats',
  'view_estimated_cost',
  'desktop_access',
  'home_tab',
  'ferie_tab',
  'admin_tab',
  'timesheet_tab',
];

const DEFAULT_MANAGER_FEATURES = {
  home_tab: true,
  team_view: true,
  edit_shifts: false,
  approve_shifts: false,
  timesheet_tab: true,
  export_pdf: false,
  view_stats: false,
  view_estimated_cost: false,
  desktop_access: true,
  ferie_tab: true,
  admin_tab: false,
};

const DEFAULT_STAFF_FEATURES = {
  ...DEFAULT_MANAGER_FEATURES,
  team_view: false,
};

const OPERATIONAL_KEYS = [
  'can_request_holidays',
  'can_punch_from_app',
  'can_create_shifts',
  'can_manage_drafts',
  'can_approve_shifts',
  'can_view_total_hours',
  'can_edit_staff_pins',
];

const OPT_OUT = new Set(['can_request_holidays', 'can_punch_from_app']);

function defaultOperationalTemplateBase() {
  return Object.fromEntries(OPERATIONAL_KEYS.map((k) => [k, OPT_OUT.has(k)]));
}

function serializeGroup(features, teamScheduleVisible, operational) {
  const out = {};
  for (const k of ENABLED_FEATURE_KEYS) {
    out[k] = features[k] === true;
  }
  out.team_schedule_visible = teamScheduleVisible;
  for (const k of OPERATIONAL_KEYS) {
    out[k] = operational[k] === true;
  }
  return out;
}

function buildDiskPayload() {
  const op = defaultOperationalTemplateBase();
  return {
    management: serializeGroup(DEFAULT_MANAGER_FEATURES, true, op),
    capo: serializeGroup(DEFAULT_MANAGER_FEATURES, true, op),
    staff: serializeGroup(DEFAULT_STAFF_FEATURES, true, op),
  };
}

async function main() {
  const disk = buildDiskPayload();
  const json = JSON.stringify(disk);

  if (dryRun) {
    console.log(json);
    return;
  }

  if (!URL || !KEY) {
    console.error('❌ VITE_SUPABASE_URL e VITE_SUPABASE_SERVICE_ROLE_KEY richiesti in .env (oppure usa --dry-run)');
    process.exit(1);
  }

  const supabase = createClient(URL, KEY, { auth: { persistSession: false } });
  const blob = new Blob([json], { type: 'application/json' });
  const { error } = await supabase.storage.from('app-config').upload('role_feature_templates.json', blob, {
    upsert: true,
    contentType: 'application/json',
    cacheControl: '3600',
  });

  if (error) {
    console.error('❌ Upload fallito:', error.message);
    process.exit(1);
  }
  console.log('✅ role_feature_templates.json caricato su app-config.');
}

main();
