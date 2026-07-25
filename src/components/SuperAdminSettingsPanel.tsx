import { useState } from 'react';
import { Users, Layers, Clock, MapPin, Languages, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Tenant, TenantSettings } from '../types';
import DipendentiTab from './SuperAdminDipendentiTab';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMEZONES = [
  { value: 'Europe/Rome',   label: 'Roma (CET/CEST)' },
  { value: 'Europe/London', label: 'Londra (GMT/BST)' },
  { value: 'Europe/Paris',  label: 'Parigi (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Berlino (CET/CEST)' },
  { value: 'Europe/Madrid', label: 'Madrid (CET/CEST)' },
  { value: 'America/New_York', label: 'New York (ET)' },
  { value: 'America/Chicago', label: 'Chicago (CT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PT)' },
  { value: 'UTC', label: 'UTC' },
];

const LANGUAGES = [
  { value: 'it', label: '🇮🇹 Italiano' },
  { value: 'en', label: '🇬🇧 English' },
  { value: 'es', label: '🇪🇸 Español' },
  { value: 'fr', label: '🇫🇷 Français' },
];

const FEATURE_DEFS: { slug: string; label: string; defaultEnabled: boolean; dangerous?: boolean }[] = [
  { slug: 'auto_breaks',          label: 'Pause automatiche',       defaultEnabled: true },
  { slug: 'staff_requests',       label: 'Richieste ferie / turni', defaultEnabled: true },
  { slug: 'kiosk_active',         label: 'Modalità kiosk',          defaultEnabled: true },
  { slug: 'geofence_punch',       label: 'Geofence timbrature',     defaultEnabled: false },
  { slug: 'visibility_management',label: 'Gestione visibilità',     defaultEnabled: true },
  { slug: 'department_creation',  label: 'Gestione reparti',        defaultEnabled: true },
  { slug: 'violation_rules',      label: 'Regole violazioni',       defaultEnabled: true },
  { slug: 'master_control_panel', label: 'Pannello di controllo',   defaultEnabled: true },
  { slug: 'unlock_with_pin',      label: 'Sblocco con PIN',         defaultEnabled: true },
  { slug: 'maintenance_mode',     label: 'Modalità manutenzione',   defaultEnabled: false, dangerous: true },
];

const DEFAULT_SETTINGS: TenantSettings = {
  timezone: 'Europe/Rome',
  defaultLanguage: 'it',
  featureFlags: Object.fromEntries(FEATURE_DEFS.map((f) => [f.slug, f.defaultEnabled])),
  workRules: {
    maxDailyHours: 9,
    maxDailyHoursEnabled: true,
    maxWeeklyHours: 48,
    maxWeeklyHoursEnabled: true,
    minRestHours: 11,
    minRestHoursEnabled: true,
    lateThresholdMinutes: 10,
    lateThresholdEnabled: true,
    criticEnabled: true,
    attentionEnabled: true,
    overlapEnabled: true,
  },
  geofence: null,
  modules: {
    timesheets: true,
    shifts: true,
    holidays: true,
    statistics: true,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeSettings(base: TenantSettings, overrides: TenantSettings): TenantSettings {
  return {
    ...base,
    ...overrides,
    featureFlags: { ...(base.featureFlags ?? {}), ...(overrides.featureFlags ?? {}) },
    workRules: { ...(base.workRules ?? {}), ...(overrides.workRules ?? {}) },
    modules: { ...(base.modules ?? {}), ...(overrides.modules ?? {}) },
  };
}

// ---------------------------------------------------------------------------
// Small reusable components
// ---------------------------------------------------------------------------

export function Toggle({ value, onChange, danger }: { value: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 shrink-0 ${
        value
          ? danger ? 'bg-red-500' : 'bg-accent'
          : 'bg-white/20'
      }`}
      style={{ minWidth: '2.5rem', height: '1.375rem' }}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          value ? 'translate-x-[1.125rem]' : 'translate-x-0'
        }`}
        style={{ width: '1.125rem', height: '1.125rem' }}
      />
    </button>
  );
}

function RuleRow({ label, enabled, onToggle, children }: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Toggle value={enabled} onChange={onToggle} />
      <span className={`text-sm flex-1 ${enabled ? 'text-white/80' : 'text-white/40'}`}>{label}</span>
      <div className={`transition-opacity ${enabled ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
        {children}
      </div>
    </div>
  );
}

function NumberInput({ value, min, max, onChange, suffix }: {
  value: number; min: number; max: number; onChange: (v: number) => void; suffix: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number" min={min} max={max}
        value={value}
        onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
        placeholder="0"
        className="w-16 rounded-lg border border-neutral-500 bg-white/8 px-2 py-1 text-base text-center text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      <span className="text-xs text-white/40">{suffix}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsConfigPanel
// ---------------------------------------------------------------------------

type SettingsTab = 'features' | 'workrules' | 'geofence' | 'locale' | 'staff';

interface SettingsConfigPanelProps {
  tenantId: string;
  initial: TenantSettings;
  onSaved: (settings: TenantSettings) => void;
}

export default function SettingsConfigPanel({ tenantId, initial, onSaved }: SettingsConfigPanelProps) {
  const [tab, setTab] = useState<SettingsTab>('features');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [settings, setSettings] = useState<TenantSettings>(() => mergeSettings(DEFAULT_SETTINGS, initial));
  const [dirty, setDirty] = useState(false);

  const set = <K extends keyof TenantSettings>(key: K, value: TenantSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setSaved(false);
  };

  const setFlag = (slug: string, enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      featureFlags: { ...(prev.featureFlags ?? {}), [slug]: enabled },
    }));
    setDirty(true);
    setSaved(false);
  };

  const setWorkRule = <K extends keyof NonNullable<TenantSettings['workRules']>>(
    key: K, value: NonNullable<TenantSettings['workRules']>[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      workRules: { ...(prev.workRules ?? {}), [key]: value },
    }));
    setDirty(true);
    setSaved(false);
  };

  const setModule = (key: keyof NonNullable<TenantSettings['modules']>, value: boolean) => {
    setSettings((prev) => ({
      ...prev,
      modules: { ...(prev.modules ?? {}), [key]: value },
    }));
    setDirty(true);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!supabase) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .update({ settings, updated_at: new Date().toISOString() })
        .eq('id', tenantId)
        .select()
        .maybeSingle();
      if (error) throw error;
      if (data) onSaved((data as Tenant).settings ?? settings);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'staff',     label: 'Dipendenti',   icon: <Users className="w-3.5 h-3.5" /> },
    { id: 'features',  label: 'Funzionalità', icon: <Layers className="w-3.5 h-3.5" /> },
    { id: 'workrules', label: 'Regole turni', icon: <Clock className="w-3.5 h-3.5" /> },
    { id: 'geofence',  label: 'Geofence',     icon: <MapPin className="w-3.5 h-3.5" /> },
    { id: 'locale',    label: 'Lingua/Fuso',  icon: <Languages className="w-3.5 h-3.5" /> },
  ];

  const wr = settings.workRules ?? {};
  const mods = settings.modules ?? {};
  const flags = settings.featureFlags ?? {};

  return (
    <div className="mt-3 rounded-xl border border-white/12 bg-white/5 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-neutral-500 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'text-accent border-b-2 border-accent bg-white/8'
                : 'text-white/55 hover:text-white/80'
            } active:text-white/80'`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {/* TAB: Dipendenti */}
        {tab === 'staff' && (
          <DipendentiTab tenantId={tenantId} />
        )}

        {/* TAB: Funzionalità */}
        {tab === 'features' && (
          <>
            <p className="text-[11px] text-white/40 mb-3">Abilita o disabilita i moduli per questa sede.</p>

            <div className="space-y-1 mb-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">Moduli principali</p>
              {([
                { key: 'timesheets', label: 'Presenze (timbrature)' },
                { key: 'shifts',     label: 'Turni (tabellone)' },
                { key: 'holidays',   label: 'Ferie e richieste' },
                { key: 'statistics', label: 'Statistiche ore' },
              ] as { key: keyof NonNullable<TenantSettings['modules']>; label: string }[]).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <span className="text-sm text-white/80">{label}</span>
                  <Toggle value={mods[key] !== false} onChange={(v) => setModule(key, v)} />
                </div>
              ))}
            </div>

            <div className="border-t border-neutral-500 pt-3 space-y-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-2">Funzionalità avanzate</p>
              {FEATURE_DEFS.map((f) => (
                <div key={f.slug} className="flex items-center justify-between py-1.5">
                  <span className={`text-sm ${f.dangerous ? 'text-red-600' : 'text-white/80'}`}>
                    {f.label}
                  </span>
                  <Toggle value={flags[f.slug] !== false ? (flags[f.slug] ?? f.defaultEnabled) : false} onChange={(v) => setFlag(f.slug, v)} danger={f.dangerous} />
                </div>
              ))}
            </div>
          </>
        )}

        {/* TAB: Regole turni */}
        {tab === 'workrules' && (
          <div className="space-y-4">
            <p className="text-[11px] text-white/40">Valori predefiniti per le regole di lavoro. L'admin della sede può modificarli.</p>

            <RuleRow
              label="Ore max giornaliere"
              enabled={wr.maxDailyHoursEnabled !== false}
              onToggle={(v) => setWorkRule('maxDailyHoursEnabled', v)}
            >
              <NumberInput value={wr.maxDailyHours ?? 9} min={4} max={16} onChange={(v) => setWorkRule('maxDailyHours', v)} suffix="h" />
            </RuleRow>

            <RuleRow
              label="Ore max settimanali"
              enabled={wr.maxWeeklyHoursEnabled !== false}
              onToggle={(v) => setWorkRule('maxWeeklyHoursEnabled', v)}
            >
              <NumberInput value={wr.maxWeeklyHours ?? 48} min={20} max={80} onChange={(v) => setWorkRule('maxWeeklyHours', v)} suffix="h" />
            </RuleRow>

            <RuleRow
              label="Riposo minimo tra turni"
              enabled={wr.minRestHoursEnabled !== false}
              onToggle={(v) => setWorkRule('minRestHoursEnabled', v)}
            >
              <NumberInput value={wr.minRestHours ?? 11} min={6} max={24} onChange={(v) => setWorkRule('minRestHours', v)} suffix="h" />
            </RuleRow>

            <RuleRow
              label="Soglia ritardo tollerato"
              enabled={wr.lateThresholdEnabled !== false}
              onToggle={(v) => setWorkRule('lateThresholdEnabled', v)}
            >
              <NumberInput value={wr.lateThresholdMinutes ?? 10} min={0} max={60} onChange={(v) => setWorkRule('lateThresholdMinutes', v)} suffix="min" />
            </RuleRow>

            <div className="border-t border-neutral-500 pt-3 space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1">Alert automatici</p>
              {([
                { key: 'criticEnabled',    label: 'Alert critico (turno lungo + riposo insufficiente)' },
                { key: 'attentionEnabled', label: 'Alert attenzione (ore oltre limite)' },
                { key: 'overlapEnabled',   label: 'Alert sovrapposizione turni' },
              ] as { key: keyof NonNullable<TenantSettings['workRules']>; label: string }[]).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between py-1">
                  <span className="text-sm text-white/80 pr-4">{label}</span>
                  <Toggle value={(wr[key] as boolean | undefined) !== false} onChange={(v) => setWorkRule(key, v as never)} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: Geofence */}
        {tab === 'geofence' && (
          <div className="space-y-3">
            <p className="text-[11px] text-white/40">
              Coordinate GPS del locale per la funzione geofence (timbratura entro un raggio).
              Richiede di abilitare "Geofence timbrature" nelle Funzionalità.
            </p>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm font-semibold text-white/80">Geofence attiva</span>
              <Toggle
                value={settings.geofence != null}
                onChange={(v) => set('geofence', v ? { lat: 41.9028, lng: 12.4964, radiusM: 100 } : null)}
              />
            </div>
            {settings.geofence != null && (
              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label htmlFor="sa-geo-lat" className="text-xs font-semibold text-white/55">Latitudine</label>
                    <input
                      id="sa-geo-lat"
                      type="number" step="0.000001"
                      value={settings.geofence.lat}
                      onChange={(e) => set('geofence', { ...settings.geofence!, lat: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full rounded-lg border border-neutral-500 bg-white/8 px-3 py-2 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="sa-geo-lng" className="text-xs font-semibold text-white/55">Longitudine</label>
                    <input
                      id="sa-geo-lng"
                      type="number" step="0.000001"
                      value={settings.geofence.lng}
                      onChange={(e) => set('geofence', { ...settings.geofence!, lng: parseFloat(e.target.value) || 0 })}
                      placeholder="0"
                      className="w-full rounded-lg border border-neutral-500 bg-white/8 px-3 py-2 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label htmlFor="sa-geo-radius" className="text-xs font-semibold text-white/55">Raggio (metri)</label>
                  <input
                    id="sa-geo-radius"
                    type="number" min={10} max={5000}
                    value={settings.geofence.radiusM}
                    onChange={(e) => set('geofence', { ...settings.geofence!, radiusM: parseInt(e.target.value) || 100 })}
                    placeholder="0"
                    className="w-full rounded-lg border border-neutral-500 bg-white/8 px-3 py-2 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                </div>
                <p className="text-[11px] text-white/40">
                  Lat {settings.geofence.lat.toFixed(5)} · Lng {settings.geofence.lng.toFixed(5)} · R {settings.geofence.radiusM}m
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB: Locale */}
        {tab === 'locale' && (
          <div className="space-y-4">
            <p className="text-[11px] text-white/40">Lingua predefinita e fuso orario della sede.</p>

            <div className="space-y-1">
              <label htmlFor="sa-locale-lang" className="text-xs font-semibold text-white/70">Lingua predefinita</label>
              <select
                id="sa-locale-lang"
                value={settings.defaultLanguage ?? 'it'}
                onChange={(e) => set('defaultLanguage', e.target.value as 'it' | 'en' | 'es' | 'fr')}
                className="w-full rounded-xl border border-neutral-500 bg-white/8 px-3 py-2.5 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                {LANGUAGES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="sa-locale-tz" className="text-xs font-semibold text-white/70">Fuso orario</label>
              <select
                id="sa-locale-tz"
                value={settings.timezone ?? 'Europe/Rome'}
                onChange={(e) => set('timezone', e.target.value)}
                className="w-full rounded-xl border border-neutral-500 bg-white/8 px-3 py-2.5 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                {TIMEZONES.map((tz) => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Salva impostazioni — sempre visibile, disabilitato nel tab Dipendenti (salvataggio inline per-utente) */}
        <div className="pt-2 border-t border-neutral-500 space-y-1.5">
          {dirty && !saving && (
            <p className="text-center text-[11px] font-semibold text-amber-500">
              ● Modifiche non salvate
            </p>
          )}
          {saved && (
            <p className="text-center text-[11px] font-semibold text-emerald-600">
              ✓ Impostazioni salvate
            </p>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || tab === 'staff'}
className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white hover:bg-accent-hover transition disabled:opacity-40 active:bg-accent-hover/80 transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          >
            <Check className="w-4 h-4" />
            {saving ? 'Salvataggio…' : tab === 'staff' ? 'Salvataggio inline per dipendente' : 'Salva impostazioni sede'}
          </button>
        </div>
      </div>
    </div>
  );
}
