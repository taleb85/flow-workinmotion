import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Pencil, X, Eye, EyeOff, Trash2, Users, ToggleRight, ToggleLeft, UserPlus, Check,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { UserRole, UserStatus } from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<UserRole, string> = {
  admin:             'Amministratore',
  manager:           'Manager',
  assistant_manager: 'Assistente Manager',
  waiter:            'Cameriere',
  server:            'Server',
  bartender:         'Bartender',
  cook:              'Cuoco',
  chef:              'Chef',
  dishwasher:        'Lavapiatti',
};

const ROLE_OPTIONS: UserRole[] = [
  'admin', 'manager', 'assistant_manager',
  'waiter', 'server', 'bartender', 'cook', 'chef', 'dishwasher',
];

interface TenantUser {
  id: string;
  first_name: string;
  last_name?: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  department?: string;
  pin: string;
  sort_order: number;
  tenant_id?: string;
}

const EMPTY_USER: Omit<TenantUser, 'id' | 'sort_order'> = {
  first_name: '',
  last_name: '',
  email: '',
  role: 'waiter',
  status: 'active',
  department: '',
  pin: '',
};

// ---------------------------------------------------------------------------
// DipendentiTab
// ---------------------------------------------------------------------------

export default function DipendentiTab({ tenantId }: { tenantId: string }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Omit<TenantUser, 'id' | 'sort_order'>>(EMPTY_USER);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);
  const [clearingDemo, setClearingDemo] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  const demoUsers = users.filter((u) => u.email?.endsWith('@demo.local'));

  const handleClearDemo = async () => {
    if (!supabase || demoUsers.length === 0) return;
    setClearingDemo(true);
    try {
      const ids = demoUsers.map((u) => u.id);
      const { error: err } = await supabase.from('users').delete().in('id', ids);
      if (err) throw err;
      setConfirmClearDemo(false);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore rimozione dati demo');
    } finally {
      setClearingDemo(false);
    }
  };

  const loadUsers = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .from('users')
        .select('id,first_name,last_name,email,role,status,department,pin,sort_order,tenant_id')
        .eq('tenant_id', tenantId)
        .order('sort_order', { ascending: true });
      if (err) throw err;
      setUsers((data ?? []) as TenantUser[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore caricamento');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const openNew = () => {
    setForm({ ...EMPTY_USER });
    setEditingId('new');
    setShowPin(false);
    setError(null);
    setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const openEdit = (u: TenantUser) => {
    setForm({ first_name: u.first_name, last_name: u.last_name ?? '', email: u.email, role: u.role, status: u.status, department: u.department ?? '', pin: u.pin });
    setEditingId(u.id);
    setShowPin(false);
    setError(null);
  };

  const handleSave = async () => {
    if (!supabase) return;
    if (!form.first_name.trim()) { setError('Il nome è obbligatorio'); return; }
    if (form.pin.length !== 4 || !/^\d{4}$/.test(form.pin)) { setError('Il PIN deve essere di 4 cifre'); return; }
    setSaving(true);
    setError(null);
    try {
      if (editingId === 'new') {
        const maxOrder = users.length > 0 ? Math.max(...users.map((u) => u.sort_order)) + 1 : 0;
        const { error: err } = await supabase.from('users').insert({
          first_name: form.first_name.trim(),
          last_name: form.last_name?.trim() || null,
          email: form.email.trim() || '',
          role: form.role,
          status: form.status,
          department: form.department?.trim() || null,
          pin: form.pin,
          sort_order: maxOrder,
          tenant_id: tenantId,
          language: 'it',
          theme: 'light',
          can_create_shifts: false,
          can_approve_shifts: false,
          can_view_total_hours: false,
          can_edit_staff_pins: false,
          can_manage_drafts: false,
          can_request_holidays: true,
          can_punch_from_app: true,
        });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.from('users').update({
          first_name: form.first_name.trim(),
          last_name: form.last_name?.trim() || null,
          email: form.email.trim() || '',
          role: form.role,
          status: form.status,
          department: form.department?.trim() || null,
          pin: form.pin,
        }).eq('id', editingId!);
        if (err) throw err;
      }
      setEditingId(null);
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!supabase || !window.confirm('Eliminare questo dipendente? L\'azione è irreversibile.')) return;
    setDeleting(id);
    try {
      const { error: err } = await supabase.from('users').delete().eq('id', id);
      if (err) throw err;
      await loadUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore eliminazione');
    } finally {
      setDeleting(null);
    }
  };

  const toggleStatus = async (u: TenantUser) => {
    if (!supabase) return;
    const next: UserStatus = u.status === 'active' ? 'suspended' : 'active';
    try {
      await supabase.from('users').update({ status: next }).eq('id', u.id);
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, status: next } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore aggiornamento');
    }
  };

  const setF = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-3" ref={topRef}>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex gap-2 items-center">
          <X className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
<button type="button" onClick={() => setError(null)} aria-label="Chiudi messaggio" className="shrink-0 p-0 border-0 bg-transparent text-red-800 transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
            <X className="w-3 h-3" aria-hidden />
          </button>
        </div>
      )}

      {/* Form aggiunta/modifica */}
      <AnimatePresence>
        {editingId !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl border border-accent/30 bg-white/8 p-4 space-y-3 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-accent">
                {editingId === 'new' ? 'Nuovo dipendente' : 'Modifica dipendente'}
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="sa-dip-first" className="text-[11px] font-semibold text-white/55">Nome *</label>
                  <input id="sa-dip-first" value={form.first_name} onChange={(e) => setF('first_name', e.target.value)} placeholder="Mario"
                    className="w-full rounded-lg border border-neutral-500 bg-white/8 px-2.5 py-2 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40" />
                </div>
                <div className="space-y-1">
                  <label htmlFor="sa-dip-last" className="text-[11px] font-semibold text-white/55">Cognome</label>
                  <input id="sa-dip-last" value={form.last_name ?? ''} onChange={(e) => setF('last_name', e.target.value)} placeholder="Rossi"
                    className="w-full rounded-lg border border-neutral-500 bg-white/8 px-2.5 py-2 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40" />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="sa-dip-email" className="text-[11px] font-semibold text-white/55">Email</label>
                <input id="sa-dip-email" type="email" value={form.email} onChange={(e) => setF('email', e.target.value)} placeholder="mario@email.com"
                  className="w-full rounded-lg border border-neutral-500 bg-white/8 px-2.5 py-2 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="sa-dip-role" className="text-[11px] font-semibold text-white/55">Ruolo *</label>
                  <select id="sa-dip-role" value={form.role} onChange={(e) => setF('role', e.target.value as UserRole)}
                    className="w-full rounded-lg border border-neutral-500 bg-white/8 px-2.5 py-2 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40">
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="sa-dip-dept" className="text-[11px] font-semibold text-white/55">Reparto</label>
                  <input id="sa-dip-dept" value={form.department ?? ''} onChange={(e) => setF('department', e.target.value)} placeholder="sala, bar, cucina…"
                    className="w-full rounded-lg border border-neutral-500 bg-white/8 px-2.5 py-2 text-base text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40" />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="sa-dip-pin" className="text-[11px] font-semibold text-white/55">PIN (4 cifre) *</label>
                <div className="relative">
                  <input
                    id="sa-dip-pin"
                    type={showPin ? 'text' : 'password'}
                    value={form.pin}
                    onChange={(e) => setF('pin', e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    maxLength={4}
                    inputMode="numeric"
                    className="w-full rounded-lg border border-neutral-500 bg-white/8 px-2.5 py-2 pr-9 text-base font-mono text-white/90 focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((p) => !p)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-accent transition active:text-accent"
                    aria-label={showPin ? 'Nascondi PIN' : 'Mostra PIN'}
                    aria-pressed={showPin}
                  >
                    {showPin ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-white hover:bg-accent-hover transition disabled:opacity-40 active:scale-95 transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
                >
                  <Check className="w-4 h-4" />
                  {saving ? 'Salvataggio…' : 'Salva'}
                </button>
                <button type="button" onClick={() => { setEditingId(null); setError(null); }}
                  className="rounded-xl bg-white/10 px-3 py-2 text-sm font-bold text-white/70 hover:bg-white/14 transition active:scale-95">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista dipendenti */}
      {loading ? (
        <div className="py-6 text-center text-white/40 text-sm">
          <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-2" />
          Caricamento…
        </div>
      ) : users.length === 0 && editingId === null ? (
        <div className="py-6 text-center text-white/40 text-sm">
          <Users className="w-7 h-7 mx-auto mb-2 opacity-30" />
          Nessun dipendente ancora.
        </div>
      ) : (
        <div className="space-y-1.5">
          {users.map((u) => (
            <div key={u.id} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border transition ${u.status === 'active' ? 'border-white/12 bg-white/8' : 'border-white/12 bg-white/5 opacity-60'}`}>
              {/* Avatar iniziali */}
              <span className="w-8 h-8 rounded-full bg-accent/10 text-accent text-xs font-bold flex items-center justify-center shrink-0">
                {u.first_name.charAt(0)}{u.last_name?.charAt(0) ?? ''}
              </span>
              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white/90 truncate" title={u.first_name}>{u.first_name} {u.last_name}
                  {u.status !== 'active' && <span className="ml-1.5 text-[11px] font-bold text-red-400">(sospeso)</span>}
                </p>
                <p className="text-[11px] text-white/40 truncate" title={ROLE_LABELS[u.role]}>{ROLE_LABELS[u.role]}{u.department ? ` · ${u.department}` : ''}
                </p>
              </div>
              {/* Azioni */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => toggleStatus(u)} title={u.status === 'active' ? 'Sospendi' : 'Riattiva'}
                  className={`p-1.5 rounded-lg transition ${u.status === 'active' ? 'text-brand-500 hover:bg-brand-50' : 'text-white/40 hover:bg-white/10'} active:bg-brand-50'/80`}>
                  {u.status === 'active' ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                </button>
                <button onClick={() => openEdit(u)} title="Modifica"
                  className="p-1.5 rounded-lg text-white/40 hover:text-accent hover:bg-accent/10 transition active:text-accent">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(u.id)} title="Elimina" disabled={deleting === u.id}
                  className="p-1.5 rounded-lg text-white/40 hover:text-red-500 hover:bg-red-50 transition disabled:opacity-40 active:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Banner dati demo */}
      {demoUsers.length > 0 && editingId === null && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-950/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-400 text-xs">⚠</span>
            <p className="text-xs font-semibold text-amber-300">
              {demoUsers.length} dipendent{demoUsers.length === 1 ? 'e demo attivo' : 'i demo attivi'} — email <span className="font-mono">@demo.local</span>
            </p>
          </div>
          {!confirmClearDemo ? (
            <button
              type="button"
              onClick={() => setConfirmClearDemo(true)}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 transition active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Rimuovi dati demo
            </button>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] text-amber-400/80 text-center">
                Elimina {demoUsers.length} utenti demo? L'azione è irreversibile.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearDemo(false)}
                  className="flex-1 rounded-xl py-1.5 text-xs font-semibold bg-white/8 text-white/50 hover:bg-white/12 transition active:bg-white/80"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleClearDemo}
                  disabled={clearingDemo}
className="flex-1 rounded-xl py-1.5 text-xs font-bold bg-amber-600 text-white hover:bg-amber-500 transition disabled:opacity-50 active:bg-amber-500/80 transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
                >
                  {clearingDemo ? 'Rimozione…' : 'Sì, rimuovi'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pulsante aggiungi */}
      {editingId === null && (
        <button
          type="button"
          onClick={openNew}
className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-accent/30 py-2.5 text-sm font-semibold text-accent hover:bg-accent/5 transition active:scale-95 transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
        >
          <UserPlus className="w-4 h-4" />
          Aggiungi dipendente
        </button>
      )}
    </div>
  );
}
