/**
 * SuperAdminPanel — Pannello di gestione multi-sede.
 * Accessibile su /super-admin (route protetta da PIN super-admin).
 * Permette di creare, modificare, configurare e disattivare sedi (tenant).
 *
 * ISOLATO: non usa AppContext né TenantContext. Ha il proprio PIN gate.
 */
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Pencil, Check, X, Building2, Palette, Globe,
  ToggleLeft, ToggleRight, Copy, Settings, ChevronDown,
  ExternalLink,
  Trash2, ChevronRight, ShieldCheck, Delete, LogOut,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Tenant, TenantSettings } from '../types';
// import { HEADER_FONTS } from '../context/TenantContext'; // unused
import { seedTenantFromTemplate } from '../utils/seedTenantFromTemplate';
import { PUBLIC_APP_ORIGIN } from '../config/publicAppUrl';
import SettingsConfigPanel, { Toggle } from './SuperAdminSettingsPanel';
import ImportStorico from './SuperAdminImportStorico';

// ---------------------------------------------------------------------------
// Costanti PIN
// ---------------------------------------------------------------------------

const SUPER_ADMIN_PIN = import.meta.env.VITE_SUPER_ADMIN_PIN ?? '310559';
const SESSION_KEY = 'sa_unlocked';

// ---------------------------------------------------------------------------
// PIN Gate
// ---------------------------------------------------------------------------

function SuperAdminPinGate({ onUnlocked }: { onUnlocked: () => void }) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleDigit = (d: string) => {
    if (digits.length >= 6) return;
    const next = digits + d;
    setDigits(next);
    setError(false);
    if (next.length === SUPER_ADMIN_PIN.length) {
      if (next === SUPER_ADMIN_PIN) {
        sessionStorage.setItem(SESSION_KEY, '1');
        onUnlocked();
      } else {
        setShake(true);
        setError(true);
        setTimeout(() => { setDigits(''); setShake(false); }, 600);
      }
    }
  };

  const handleDelete = () => setDigits((d) => d.slice(0, -1));

  const PAD = [
    ['1','2','3'],
    ['4','5','6'],
    ['7','8','9'],
    ['','0','⌫'],
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) handleDigit(e.key);
      else if (e.key === 'Backspace') handleDelete();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-6 select-none overflow-hidden"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        background: 'transparent',
      }}
    >
      {/* Logo / icona */}
      <div className="mb-8 flex flex-col items-center gap-3 relative">
        <img
          src="/icon-192.png?v=3"
          alt="FLOW"
          width={84}
          height={84}
          style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 24px rgba(255,255,255,0.65)) drop-shadow(0 0 8px rgba(255,255,255,0.40))' }}
          draggable={false}
        />
        <div className="text-center">
          <h1 className="text-lg font-bold text-white tracking-tight">Super Admin</h1>
          <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>Inserisci il PIN per accedere</p>
        </div>
      </div>

      {/* Indicatore cifre */}
      <motion.div
        animate={shake ? { x: [0, -8, 8, -6, 6, 0] } : {}}
        transition={{ duration: 0.4 }}
        className="flex gap-3 mb-8"
      >
        {Array.from({ length: SUPER_ADMIN_PIN.length }).map((_, i) => (
          <div
            key={i}
            className="w-3 h-3 rounded-full transition-colors duration-150"
            style={i < digits.length
              ? { background: '#0a0a0c', boxShadow: error ? '0 0 8px rgba(248,113,113,0.5)' : '0 0 8px rgba(107,107,107,0.55)' }
              : { background: 'rgba(10, 10, 12, 0.85)' }
            }
          />
        ))}
      </motion.div>

      {/* Tastierino numerico */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[16.25rem] relative">
        {PAD.flat().map((key, i) => {
          if (key === '') return <div key={i} />;
          const isDelete = key === '⌫';
          return (
            <button
              key={i}
              onClick={() => isDelete ? handleDelete() : handleDigit(key)}
              className={`h-14 rounded-2xl text-lg font-bold transition-colors ${
 isDelete ? 'bg-transparent text-white/40 hover:text-white/70' : 'text-white'
 }`}
              style={isDelete ? undefined : {
                background: '#0a0a0c',
                border: '1px solid rgba(255,255,255,0.10)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
              onMouseEnter={e => { if (!isDelete) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(107,107,107,0.55)'; }}
              onMouseLeave={e => { if (!isDelete) (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(107,107,107,0.25)'; }}
            >
              {isDelete ? <Delete className="w-5 h-5 mx-auto" /> : key}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-6 text-sm text-red-400 font-medium">PIN non corretto</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const _ACCENT_PRESETS = [
  { label: 'Verde oliva',  value: 'var(--brand)' },
  { label: 'Rosso',        value: '#B91C1C' },
  { label: 'Blu marino',   value: '#1D4ED8' },
  { label: 'Arancio',      value: '#C2410C' },
  { label: 'Viola',        value: '#6D28D9' },
  { label: 'Grigio scuro', value: '#374151' },
  { label: 'Teal',         value: '#0F766E' },
  { label: 'Rosa',         value: '#BE185D' },
];

const DEFAULT_SETTINGS: TenantSettings = {
  timezone: 'Europe/Rome',
  defaultLanguage: 'it',
  featureFlags: {},
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

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// TenantForm
// ---------------------------------------------------------------------------

interface TenantFormProps {
  initial?: Partial<Tenant>;
  onSave: (data: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  /** Solo per nuova sede: se true, popola con dati demo del tenant template */
  seedDemo?: boolean;
  onSeedDemoChange?: (v: boolean) => void;
}

function TenantForm({ initial, onSave, onCancel, saving, seedDemo = true, onSeedDemoChange }: TenantFormProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [slugManual, setSlugManual] = useState(!!initial?.slug);

  useEffect(() => {
    if (!slugManual) setSlug(slugify(name));
  }, [name, slugManual]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      name: name.trim(),
      slug: slug.trim(),
      // Branding sempre FLOW — colore e font non configurabili per sede
      accent_color: '#ffffff',
      plan: 'basic',
      is_active: initial?.is_active ?? true,
      logo_url: null,
      settings: { ...(initial?.settings ?? DEFAULT_SETTINGS), header_font: 'inter' },
    });
  };

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      onSubmit={handleSubmit}
      className="space-y-4 p-5 bg-white/8 rounded-2xl border border-neutral-500 shadow-sm"
    >
      <p className="text-xs font-bold uppercase tracking-wider text-white/40">{initial?.id ? 'Modifica sede' : 'Nuova sede'}</p>

      {/* Nome */}
      <div className="space-y-1">
        <label htmlFor="sa-tenant-name" className="text-xs font-semibold text-white/70">Nome sede *</label>
        <input
          id="sa-tenant-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Es. Ristorante Mario"
          className="w-full rounded-xl border border-neutral-500 bg-white/8 px-3 py-2.5 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40 transition"
        />
      </div>

      {/* Slug */}
      <div className="space-y-1">
        <label htmlFor="sa-tenant-slug" className="text-xs font-semibold text-white/70">Slug (sottodominio) *</label>
        <div className="flex gap-2 items-center">
          <input
            id="sa-tenant-slug"
            required
            value={slug}
            onChange={(e) => { setSlug(slugify(e.target.value)); setSlugManual(true); }}
            placeholder="es-ristorante-mario"
            pattern="[a-z0-9\-]+"
            className="flex-1 rounded-xl border border-neutral-500 bg-white/8 px-3 py-2.5 text-base font-mono text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40 transition"
          />
<button type="button" onClick={() => { setSlugManual(false); setSlug(slugify(name)); }} className="text-xs text-accent hover:underline shrink-0 active:brightness-95 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">Auto</button>
        </div>
        <p className="text-[0.6875rem] text-white/40">Sarà il sottodominio: <span className="font-mono">{slug || '…'}.tuodominio.com</span></p>
      </div>

      {/* Nota branding — colore e logo fissi FLOW */}
      <div className="rounded-xl border border-neutral-500 bg-white/6 px-3.5 py-2.5 flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-full bg-brand-deep flex items-center justify-center shrink-0">
          <span className="text-white text-[0.6875rem] font-bold">F</span>
        </div>
        <p className="text-[0.6875rem] text-white/55">
          Colore, font e logo sono fissi — brand FLOW per tutte le sedi.
        </p>
      </div>

      {/* Dati demo — solo per nuova sede */}
      {!initial?.id && onSeedDemoChange && (
        <div className="rounded-xl border border-neutral-500 bg-white/6 px-3.5 py-3 flex items-start gap-3">
          <Toggle value={seedDemo} onChange={onSeedDemoChange} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/80 leading-snug">
              Carica dati demo
            </p>
            <p className="text-[0.6875rem] text-white/40 leading-snug mt-0.5">
              Dipendenti anonimizzati + turni settimana corrente dal template demo
            </p>
          </div>
        </div>
      )}

      {/* Bottoni */}
      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !name.trim() || !slug.trim()}
className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-white hover:bg-accent-hover transition disabled:opacity-40 active:bg-accent-hover/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
        >
          <Check className="w-4 h-4" />
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
<button type="button" onClick={onCancel} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold text-white/80 hover:bg-white/14 transition active:bg-white/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.form>
  );
}

// ---------------------------------------------------------------------------
// SuperAdminPanel (main)
// ---------------------------------------------------------------------------

export default function SuperAdminPanel() {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === '1');

  // Reset brand neutro: sovrascrive le CSS var del tenant con valori fissi
  useEffect(() => {
    const root = document.documentElement;
    const prev: Record<string, string> = {};
    const neutralVars: Record<string, string> = {
      '--brand': '#ffffff',
      '--brand-hover': '#003ACC',
      '--accent': '#ffffff',
      '--accent-hover':'#003ACC',
    };
    Object.entries(neutralVars).forEach(([k, v]) => {
      prev[k] = root.style.getPropertyValue(k);
      root.style.setProperty(k, v);
    });
    return () => {
      Object.entries(prev).forEach(([k, v]) => root.style.setProperty(k, v));
    };
  }, []);

  if (!unlocked) {
    return <SuperAdminPinGate onUnlocked={() => setUnlocked(true)} />;
  }

  return <SuperAdminPanelInner />;
}

/** Credenziali admin create automaticamente alla nascita di una sede. */
interface NewAdminCredentials {
  tenantName: string;
  firstName: string;
  pin: string;
}

function NewAdminCredentialsModal({ creds, onClose }: { creds: NewAdminCredentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const text = `Sede: ${creds.tenantName}\nNome: ${creds.firstName}\nPIN: ${creds.pin}\nRuolo: Admin`;

  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/35 backdrop-blur-sm p-4">
      <div className="bg-white/8 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Admin creato automaticamente</p>
            <p className="text-xs text-white/55">Salva queste credenziali in un posto sicuro</p>
          </div>
        </div>

        <div className="bg-white/5 rounded-xl p-4 space-y-2 font-mono text-sm">
          <div className="flex justify-between">
            <span className="text-white/55 text-xs font-sans">Sede</span>
            <span className="font-semibold text-white/90">{creds.tenantName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/55 text-xs font-sans">Nome login</span>
            <span className="font-semibold text-white/90">{creds.firstName}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-white/55 text-xs font-sans">PIN</span>
            <span className="text-2xl font-bold tracking-widest text-accent">{creds.pin}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-white/55 text-xs font-sans">Ruolo</span>
            <span className="font-semibold text-emerald-600">Admin</span>
          </div>
        </div>

        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
          ⚠ Cambia il PIN subito dopo il primo accesso tramite il profilo utente nell'app.
        </p>

        <div className="flex gap-2">
          <button
            onClick={handleCopy}
className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-neutral-500 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/5 active:bg-white/10 transition transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiato!' : 'Copia'}
          </button>
          <button
            onClick={onClose}
className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-bold text-white hover:bg-accent-hover active:brightness-95 transition transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          >
            Ho salvato
          </button>
        </div>
      </div>
    </div>
  );
}

function SuperAdminPanelInner() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedSettings, setExpandedSettings] = useState<string | null>(null);
  const [seedDemo, setSeedDemo] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [newAdminCreds, setNewAdminCreds] = useState<NewAdminCredentials | null>(null);

  // Modalità chiara per il pannello admin
  useEffect(() => {
    const wasDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.remove('dark');
    return () => {
      if (wasDark) document.documentElement.classList.add('dark');
    };
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchTenants = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error: err } = await supabase.from('tenants').select('*').order('created_at', { ascending: true });
      if (err) throw err;
      setTenants((data ?? []) as Tenant[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore caricamento sedi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const handleCreate = async (data: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>) => {
    if (!supabase) return;
    setSaving(true);
    try {
      // Recupera l'id della sede appena creata per il seeding dei dati demo
      const { data: created, error: err } = await supabase
        .from('tenants')
        .insert({ ...data })
        .select('id')
        .maybeSingle();
      if (err) throw err;

      if (!created?.id) throw new Error('ID sede non ricevuto dal server.');

      // ── Crea automaticamente un profilo Admin con PIN casuale ────────────────
      const adminPin = String(Math.floor(1000 + Math.random() * 9000)); // 4 cifre casuali
      const adminFirstName = 'Admin';
      const adminLastName = data.name; // usa il nome della sede come cognome
      const { error: adminErr } = await supabase.from('users').insert({
        tenant_id:            created.id,
        first_name:           adminFirstName,
        last_name:            adminLastName,
        email:                `admin@${data.slug}.local`,
        pin:                  adminPin,
        role:                 'admin',
        status:               'active',
        sort_order:           0,
        language:             'it',
        theme:                'light',
        can_create_shifts:    true,
        can_approve_shifts:   true,
        can_view_total_hours: true,
        can_edit_staff_pins:  true,
        can_manage_drafts:    true,
        can_request_holidays: false,
        can_punch_from_app:   true,
        hide_from_team_schedule: false,
        department:           null,
        hourly_rate_eur:      null,
        enabled_features:     null,
        employment_start_date: null,
        employment_end_date:   null,
      });
      if (adminErr) {
        // Non blocca la creazione sede — segnala solo
        setError(`Sede creata, ma errore creazione admin: ${adminErr.message}`);
      } else {
        setNewAdminCreds({ tenantName: data.name, firstName: adminFirstName, pin: adminPin });
      }

      if (seedDemo) {
        try {
          await seedTenantFromTemplate(supabase, created.id);
          showToast('Sede creata con dati demo!');
        } catch (seedErr) {
          setError(`Sede creata, ma errore dati demo: ${seedErr instanceof Error ? seedErr.message : String(seedErr)}`);
          showToast('Sede creata (dati demo parziali).');
        }
      } else {
        showToast('Sede creata!');
      }

      setShowForm(false);
      setSeedDemo(true); // reset per la prossima creazione
      await fetchTenants();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore creazione.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: Omit<Tenant, 'id' | 'created_at' | 'updated_at'>) => {
    if (!supabase || !editingTenant) return;
    setSaving(true);
    try {
      const { error: err } = await supabase.from('tenants').update({ ...data, updated_at: new Date().toISOString() }).eq('id', editingTenant.id);
      if (err) throw err;
      showToast('Sede aggiornata!');
      setEditingTenant(null);
      await fetchTenants();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore aggiornamento.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTenant = async (tenant: Tenant) => {
    if (!supabase) return;
    setDeleting(true);
    try {
      // Elimina prima gli utenti collegati, poi la sede
      await supabase.from('users').delete().eq('tenant_id', tenant.id);
      const { error: err } = await supabase.from('tenants').delete().eq('id', tenant.id);
      if (err) throw err;
      setConfirmDeleteId(null);
      setExpandedSettings(null);
      showToast(`Sede "${tenant.name}" eliminata.`);
      await fetchTenants();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore eliminazione sede.');
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (tenant: Tenant) => {
    if (!supabase) return;
    try {
      await supabase.from('tenants').update({ is_active: !tenant.is_active, updated_at: new Date().toISOString() }).eq('id', tenant.id);
      showToast(tenant.is_active ? 'Sede disattivata.' : 'Sede attivata.');
      await fetchTenants();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore toggle.');
    }
  };

  const copySlug = (slug: string) => {
    navigator.clipboard.writeText(slug).then(() => showToast('Slug copiato!'));
  };

  const handleLogout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    window.location.reload();
  };

  return (
    <div className="min-h-screen min-h-dvh font-sans text-white"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', background: 'transparent' }}
    >
      {/* Modal credenziali admin create automaticamente */}
      {newAdminCreds && (
        <NewAdminCredentialsModal creds={newAdminCreds} onClose={() => setNewAdminCreds(null)} />
      )}

      {/* Sticky header */}
      <header className="sticky top-0 z-30 backdrop-blur-md border-b border-white/10"
        style={{ background: 'rgba(8, 18, 52, 0.82)', paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6 md:py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src="/icon-192.png?v=3"
              alt="FLOW"
              width={36}
              height={36}
              style={{ objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.50))' }}
              draggable={false}
            />
            <div className="min-w-0">
              <h1 className="text-base font-bold text-white leading-tight truncate">Super Admin</h1>
              <p className="text-[0.6875rem] text-[#2255BB] leading-tight hidden md:block">Gestione sedi</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => { setShowImport(!showImport); setShowForm(false); setEditingTenant(null); }}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 md:px-4 md:py-2.5 text-sm font-bold transition ${showImport ? 'bg-amber-100 text-amber-700' : 'bg-white/10 text-white/55 hover:bg-white/14 hover:text-white/90'}`}
            >
              <ChevronRight className="w-4 h-4 rotate-90" />
              <span className="hidden md:inline">Importa storico</span>
              <span className="md:hidden">Import</span>
            </button>
            <button
              onClick={() => { setShowForm(true); setEditingTenant(null); setShowImport(false); }}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 md:px-4 md:py-2.5 text-sm font-bold text-white transition"
              style={{ background: '#0a0a0c' }}
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Nuova sede</span>
              <span className="md:hidden">Nuova</span>
            </button>
            <button
              onClick={handleLogout}
              title="Esci da Super Admin"
              aria-label="Esci da Super Admin"
className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-red-50 hover:text-red-500 text-white/40 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            >
              <LogOut className="w-4 h-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 md:px-6 py-4 md:py-6 space-y-4"
        style={{ paddingLeft: 'max(1rem, env(safe-area-inset-left))', paddingRight: 'max(1rem, env(safe-area-inset-right))' }}
      >

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex gap-2 items-start">
            <X className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-red-400 hover:text-red-600 shrink-0 p-1 active:text-red-600"
              aria-label="Chiudi messaggio"
            >
              <X className="w-3.5 h-3.5" aria-hidden />
            </button>
          </div>
        )}

        {/* Import storico turni */}
        <AnimatePresence>
          {showImport && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <ImportStorico tenants={tenants} onClose={() => setShowImport(false)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form nuova sede */}
        <AnimatePresence>
          {showForm && !editingTenant && (
            <TenantForm
              onSave={handleCreate}
              onCancel={() => setShowForm(false)}
              saving={saving}
              seedDemo={seedDemo}
              onSeedDemoChange={setSeedDemo}
            />
          )}
        </AnimatePresence>

        {/* Lista sedi */}
          {loading ? (
          <div className="text-center py-16 text-white/40">
            <div className="w-8 h-8 border-2 border-brand-mid/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
            Caricamento…
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-16 text-white/40">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
            Nessuna sede configurata.
          </div>
        ) : (
          <div className="space-y-3">
            {tenants.map((t) => (
              <motion.div
                key={t.id}
                layout
                className={`rounded-2xl border shadow-sm ${t.is_active ? 'border-neutral-500 bg-white/8' : 'border-neutral-500 bg-white/5 opacity-60'} overflow-hidden`}
              >
                <AnimatePresence mode="wait">
                  {editingTenant?.id === t.id ? (
                    <div key="edit" className="p-4">
                      <TenantForm
                        initial={t}
                        onSave={handleUpdate}
                        onCancel={() => setEditingTenant(null)}
                        saving={saving}
                      />
                    </div>
                  ) : (
                    <motion.div key="view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      {/* Card principale */}
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                        {/* Logo / swatch colore */}
                        <span className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center mt-0.5 overflow-hidden" style={{ backgroundColor: t.accent_color }}>
                          {t.logo_url
                            ? <img src={t.logo_url} alt={t.name} className="w-full h-full object-cover" />
                            : <Palette className="w-5 h-5 text-white/80" />}
                        </span>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white text-sm">{t.name}</span>
                              {!t.is_active && <span className="text-[0.6875rem] font-bold uppercase px-2 py-0.5 rounded-full bg-red-50 text-red-500 border border-red-200">Inattiva</span>}
                            </div>

                            {/* Slug */}
                            <div className="flex items-center gap-1 mt-1">
                              <Globe className="w-3 h-3 text-white/40 shrink-0" />
                              <span className="text-xs font-mono text-white/40 truncate" title={t.slug}>{t.slug}</span>
<button onClick={() => copySlug(t.slug)} className="text-slate-300 hover:text-[#2255BB] transition p-0.5 shrink-0 active:text-[#2255BB] transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]" title="Copia slug">
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>

                            {/* URL sito */}
                            <div className="flex items-center gap-1 mt-0.5">
                              <a
                                href={PUBLIC_APP_ORIGIN}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-[#2255BB] hover:underline font-medium min-w-0 active:brightness-95"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span className="truncate">{new URL(PUBLIC_APP_ORIGIN).host}</span>
                              </a>
                              <button
                                onClick={() => navigator.clipboard.writeText(PUBLIC_APP_ORIGIN).then(() => showToast('URL copiato!'))}
                                className="text-slate-300 hover:text-[#2255BB] transition p-0.5 shrink-0 active:text-[#2255BB]"
                                title="Copia URL"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Barra azioni */}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/10">
                          <button
                            onClick={() => setExpandedSettings(expandedSettings === t.id ? null : t.id)}
                            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition ${
 expandedSettings === t.id
 ? 'bg-brand-mid/10 text-[#2255BB]'
 : 'bg-white/10 text-white/55 hover:bg-brand-mid/8 hover:text-[#2255BB]'
 }`}
                          >
                            <Settings className="w-3.5 h-3.5" />
                            Impostazioni
                          </button>
                          <button
                            onClick={() => { setEditingTenant(t); setShowForm(false); setExpandedSettings(null); }}
                            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 bg-white/10 text-white/55 hover:bg-white/14 hover:text-white/90 text-xs font-semibold transition"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Modifica
                          </button>
                          <button
                            onClick={() => toggleActive(t)}
                            className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition ${
 t.is_active
 ? 'bg-brand-mid/10 text-[#2255BB] hover:bg-red-50 hover:text-red-500'
 : 'bg-white/10 text-white/40 hover:bg-brand-mid/8 hover:text-[#2255BB]'
 }`}
                          >
                            {t.is_active ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                            {t.is_active ? 'Attiva' : 'Inattiva'}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(confirmDeleteId === t.id ? null : t.id)}
                            className="flex items-center justify-center rounded-xl py-2 px-2.5 bg-white/10 text-white/40 hover:bg-red-50 hover:text-red-500 transition"
                            title="Elimina sede"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Pannello conferma eliminazione */}
                        <AnimatePresence>
                          {confirmDeleteId === t.id && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
                                <p className="text-xs font-semibold text-red-600 text-center">
                                  Eliminare <span className="font-bold text-red-700">"{t.name}"</span>?
                                </p>
                                <p className="text-[0.6875rem] text-red-500/80 text-center">
                                  Questa azione è irreversibile. Verranno eliminati tutti i dipendenti e i dati della sede.
                                </p>
                                <div className="flex gap-2 pt-1">
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="flex-1 rounded-xl py-2 text-xs font-semibold bg-white/10 text-white/55 hover:bg-white/14 transition active:bg-white/80"
                                  >
                                    Annulla
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTenant(t)}
                                    disabled={deleting}
                                    className="flex-1 rounded-xl py-2 text-xs font-bold bg-red-600 text-white hover:bg-red-500 transition disabled:opacity-50 active:bg-red-500/80"
                                  >
                                    {deleting ? 'Eliminazione…' : 'Sì, elimina sede'}
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Settings panel espandibile */}
                      <AnimatePresence>
                        {expandedSettings === t.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden border-t border-white/10"
                          >
                            <div className="px-4 pt-3 pb-1 flex items-center gap-1.5">
                              <ChevronDown className="w-3.5 h-3.5 text-[#2255BB]/50" />
                              <span className="text-xs font-bold text-[#2255BB]/70 uppercase tracking-wider">Impostazioni sede</span>
                            </div>
                            <div className="px-4 pb-4">
                              <SettingsConfigPanel
                                tenantId={t.id}
                                initial={t.settings ?? {}}
                                onSaved={(settings) => {
                                  setTenants((prev) => prev.map((x) => x.id === t.id ? { ...x, settings } : x));
                                  showToast('Impostazioni salvate!');
                                }}
                              />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        )}

        {/* Spazio bottom per safe area */}
        <div className="h-6" />
      </main>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-sm font-semibold px-5 py-2.5 rounded-full shadow-lg z-50 whitespace-nowrap"
            style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
