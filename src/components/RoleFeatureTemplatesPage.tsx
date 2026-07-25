import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Save, Loader2, Users, Info } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { canEditRoleFeatureTemplates } from '../utils/permissions';
import {
  ADMIN_MODULE_KEYS,
  ROLE_TEMPLATE_FEATURE_SECTIONS,
  FEATURE_LABELS,
  FEATURE_LABELS_TAB_FIRST,
  type EnabledFeatures,
  type EnabledFeatureKey,
  type AdminModuleKey,
  buildMergedAdminModulesForAdminEditor,
  getEnabledFeatures,
  getCodeDefaultsForTemplateGroup,
  type SettingsOperationalPermKey,
} from '../utils/enabledFeatures';
import {
  type RoleTemplateGroup,
} from '../utils/roleFeatureTemplates';
import { serializeAdminModulesForDisk } from '../utils/adminModulesGlobal';
import { getAdminModuleLabel } from '../utils/translations';
import { buildSettingsPermissionRows, defaultOperationalTemplateBase } from '../utils/settingsPermissionRows';
import {
  TIMESHEET_GRID_PLANNED_ONLY_KEY,
  getTimesheetGridPrivacyMode,
} from '../utils/timesheetGridPrivacy';
import type { User } from '../types';

const ACCENT = 'var(--brand)';

export type RoleFeatureTemplatesPanelVariant = 'page' | 'embedded';

type Props = { variant?: RoleFeatureTemplatesPanelVariant };

function roleColor(role: string): string {
  if (role === 'manager') return '#6b6b6b';
  if (role === 'assistant_manager') return '#0284C7';
  return '#059669';
}

function roleBadgeLabel(role: string, t: Record<string, string>): string {
  if (role === 'manager') return t.role_manager ?? 'Manager';
  if (role === 'assistant_manager') return t.role_assistant_manager ?? 'Vice';
  if (role === 'waiter' || role === 'server') return t.role_waiter ?? 'Cameriere';
  if (role === 'cook') return t.role_cook ?? 'Cuoco';
  if (role === 'chef') return t.role_chef ?? 'Chef';
  if (role === 'bartender') return t.role_bartender ?? 'Barista';
  if (role === 'dishwasher') return t.role_dishwasher ?? 'Lavapiatti';
  return role;
}

function initials(user: User): string {
  const f = (user.first_name ?? '').trim()[0] ?? '';
  const l = (user.last_name ?? '').trim()[0] ?? '';
  return (f + l).toUpperCase() || '?';
}

/**
 * Template permessi per dipendente. Usabile in pagina dedicata o dentro Impostazioni.
 * nelle anteprime compatte, text-[8–10]px è voluto (mini-card).
 */
export function RoleFeatureTemplatesPanel({ variant = 'page' }: Props) {
  const { currentUser, users, updateUser, isSessionElevated } = useAppUser();
  const { saveRoleFeatureTemplates, saveAdminModulesGlobal, adminModulesRevision } = useAppConfig();
  const { showSuccess, showError } = useAppOverlay();
  const t = useT();
  const permRows = useMemo(() => buildSettingsPermissionRows(t as Record<string, string>), [t]);

  // ─── Utenti non-admin attivi come colonne ────────────────────────────────
  const nonAdminUsers = useMemo(() =>
    users
      .filter((u) => u.role !== 'admin' && u.status !== 'inactive')
      .sort((a, b) => {
        const order: Record<string, number> = { manager: 0, assistant_manager: 1 };
        return (order[a.role] ?? 3) - (order[b.role] ?? 3);
      }),
    [users]
  );

  // ─── Stato per-utente ────────────────────────────────────────────────────
  const [userFeatures, setUserFeatures] = useState<Record<string, EnabledFeatures>>({});
  const [userOp, setUserOp] = useState<Record<string, Record<SettingsOperationalPermKey, boolean>>>({});
  const [userTeamVisible, setUserTeamVisible] = useState<Record<string, boolean>>({});
  const [userPlannedOnly, setUserPlannedOnly] = useState<Record<string, boolean>>({});

  // ─── Selezione utente mobile ─────────────────────────────────────────────
  const [mobileSelectedUserId, setMobileSelectedUserId] = useState<string | null>(null);
  const mobileUser = nonAdminUsers.find(u => u.id === (mobileSelectedUserId ?? nonAdminUsers[0]?.id)) ?? nonAdminUsers[0] ?? null;

  // ─── Admin modules (globale) ─────────────────────────────────────────────
  const [mods, setMods] = useState<Record<AdminModuleKey, boolean>>(() => buildMergedAdminModulesForAdminEditor());
  const [saving, setSaving] = useState(false);

  const templatePanelDirtyRef = useRef(false);
  const markDirty = useCallback(() => { templatePanelDirtyRef.current = true; }, []);

  // Inizializza stato dai dati utente
  useEffect(() => {
    if (templatePanelDirtyRef.current) return;
    const features: Record<string, EnabledFeatures> = {};
    const ops: Record<string, Record<SettingsOperationalPermKey, boolean>> = {};
    const teamVis: Record<string, boolean> = {};
    const plannedOnly: Record<string, boolean> = {};
    for (const u of nonAdminUsers) {
      features[u.id] = getEnabledFeatures(u);
      ops[u.id] = {
        can_request_holidays: u.can_request_holidays ?? false,
        can_punch_from_app: u.can_punch_from_app ?? false,
        can_create_shifts: u.can_create_shifts ?? false,
        can_manage_drafts: u.can_manage_drafts ?? false,
        can_approve_shifts: u.can_approve_shifts ?? false,
        can_view_total_hours: u.can_view_total_hours ?? false,
        can_edit_staff_pins: u.can_edit_staff_pins ?? false,
      };
      teamVis[u.id] = !(u.hide_from_team_schedule === true);
      plannedOnly[u.id] = getTimesheetGridPrivacyMode(u) === 'planned_only';
    }
    setUserFeatures(features);
    setUserOp(ops);
    setUserTeamVisible(teamVis);
    setUserPlannedOnly(plannedOnly);
  }, [nonAdminUsers]);

  useEffect(() => {
    if (templatePanelDirtyRef.current) return;
    setMods(buildMergedAdminModulesForAdminEditor());
  }, [adminModulesRevision]);

  // ─── Toggle feature per utente ───────────────────────────────────────────
  const toggleFeature = useCallback((userId: string, key: EnabledFeatureKey) => {
    markDirty();
    setUserFeatures((prev) => {
      const cur = prev[userId] ?? {};
      return { ...prev, [userId]: { ...cur, [key]: !(cur[key] === true) } };
    });
  }, [markDirty]);

  const toggleOp = useCallback((userId: string, key: SettingsOperationalPermKey) => {
    markDirty();
    setUserOp((prev) => {
      const cur = prev[userId] ?? {};
      return { ...prev, [userId]: { ...cur, [key]: !(cur[key] === true) } };
    });
  }, [markDirty]);

  const toggleTeamVisible = useCallback((userId: string) => {
    markDirty();
    setUserTeamVisible((prev) => ({ ...prev, [userId]: !(prev[userId] ?? true) }));
  }, [markDirty]);

  const togglePlannedOnly = useCallback((userId: string) => {
    markDirty();
    setUserPlannedOnly((prev) => ({ ...prev, [userId]: !(prev[userId] ?? false) }));
  }, [markDirty]);

  const toggleMod = useCallback((key: AdminModuleKey) => {
    markDirty();
    setMods((m) => ({ ...m, [key]: !m[key] }));
  }, [markDirty]);

  const resetMods = useCallback(() => {
    markDirty();
    setMods(Object.fromEntries(ADMIN_MODULE_KEYS.map((k) => [k, true])) as Record<AdminModuleKey, boolean>);
  }, [markDirty]);

  // ─── Salva ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      for (const u of nonAdminUsers) {
        const features = userFeatures[u.id];
        const op = userOp[u.id] ?? {};
        const teamVis = userTeamVisible[u.id] ?? true;
        const plannedOnly = userPlannedOnly[u.id] ?? false;
        // Merge planned_only flag into enabled_features
        const mergedFeatures: Record<string, boolean> = { ...(features as Record<string, boolean>) };
        if (plannedOnly) {
          mergedFeatures[TIMESHEET_GRID_PLANNED_ONLY_KEY] = true;
        } else {
          delete mergedFeatures[TIMESHEET_GRID_PLANNED_ONLY_KEY];
        }
        const payload: Partial<User> = {
          hide_from_team_schedule: !teamVis,
          ...(op as Partial<User>),
          enabled_features: mergedFeatures,
        };
        await updateUser(u.id, payload);
      }
      await saveAdminModulesGlobal(serializeAdminModulesForDisk(mods));
      templatePanelDirtyRef.current = false;
      showSuccess?.(t.role_templates_save_success);
    } catch (e) {
      console.error(e);
      showError?.(e instanceof Error ? e.message : t.role_templates_save_error);
    } finally {
      setSaving(false);
    }
  };

  // ─── Azzera tutto ────────────────────────────────────────────────────────
  const handleResetAll = async () => {
    if (!window.confirm('Vuoi davvero azzerare tutti i permessi ai valori predefiniti? L\'operazione è irreversibile.')) return;
    setSaving(true);
    try {
      // 1. Svuota i template per ruolo (→ i default codice verranno usati)
      await saveRoleFeatureTemplates({});

      // 2. Riattiva tutti i moduli admin
      const allMods = Object.fromEntries(ADMIN_MODULE_KEYS.map((k) => [k, true]));
      await saveAdminModulesGlobal(serializeAdminModulesForDisk(allMods as Record<AdminModuleKey, boolean>));

      // 3. Reimposta override per-utente a null/default
      const defaultOp = defaultOperationalTemplateBase();
      for (const u of nonAdminUsers) {
        const nullPayload = Object.fromEntries(
          Object.keys(defaultOp).map((k) => [k, null])
        ) as Record<string, null>;
        await updateUser(u.id, { ...nullPayload, enabled_features: undefined } as Parameters<typeof updateUser>[1]);
      }

      // 4. Ricarica UI dai default codice
      const features: Record<string, EnabledFeatures> = {};
      const ops: Record<string, Record<SettingsOperationalPermKey, boolean>> = {};
      const teamVis: Record<string, boolean> = {};
      for (const u of nonAdminUsers) {
        const grp = u.role === 'manager' ? 'management'
          : u.role === 'assistant_manager' ? 'assistant_manager'
          : 'staff';
        features[u.id] = getCodeDefaultsForTemplateGroup(grp as RoleTemplateGroup);
        ops[u.id] = { ...defaultOp };
        teamVis[u.id] = true;
      }
      const plannedOnlyReset: Record<string, boolean> = {};
      for (const u of nonAdminUsers) plannedOnlyReset[u.id] = false;
      setUserFeatures(features);
      setUserOp(ops);
      setUserTeamVisible(teamVis);
      setUserPlannedOnly(plannedOnlyReset);
      setMods(Object.fromEntries(ADMIN_MODULE_KEYS.map((k) => [k, true])) as Record<AdminModuleKey, boolean>);

      templatePanelDirtyRef.current = false;
      showSuccess?.('Permessi azzerati ai valori predefiniti.');
    } catch (e) {
      console.error(e);
      showError?.(e instanceof Error ? e.message : 'Errore durante il reset.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Accesso ─────────────────────────────────────────────────────────────
  const hasTemplateAccess = canEditRoleFeatureTemplates(currentUser) || isSessionElevated || !!currentUser?.elevated_role;
  if (!hasTemplateAccess) {
    if (variant === 'embedded') return null;
    return (
      <div className="pb-content pt-6 app-horizontal-pad">
        <p className="text-sm text-white/70">{t.role_templates_forbidden_body}</p>
      </div>
    );
  }

  // ─── Componenti render ───────────────────────────────────────────────────
  const colCount = nonAdminUsers.length + 1;

  const MatrixToggle = ({
    enabled, onToggle, locked,
  }: { enabled: boolean; onToggle: () => void; locked?: boolean }) => (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={locked}
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40 ${
        enabled ? 'bg-accent' : 'bg-white/20'
      } hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}
    >
      <span
        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
        }`}
      />
    </button>
  );

  const SectionHeader = ({ title, icon }: { title: string; icon?: React.ReactNode }) => (
    <tr className="bg-white/5">
      <td colSpan={colCount} className="px-4 py-2 border-b border-white/10">
        <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/50">
          {icon}
          {title}
        </span>
      </td>
    </tr>
  );

  // ─── Sistema preview generico ─────────────────────────────────────────────

  /** Popover riutilizzabile per qualsiasi permesso — portale su document.body. */
  function PermInfoButton({ previewTitle, off, on }: {
    previewTitle: string;
    off: React.ReactNode;
    on: React.ReactNode;
  }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const popRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (popRef.current?.contains(e.target as Node)) return;
        if (btnRef.current?.contains(e.target as Node)) return;
        setOpen(false);
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleClick = () => {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        const left = r.right + 8 + 280 > window.innerWidth ? r.left - 288 : r.right + 8;
        const top = Math.min(r.top, window.innerHeight - 220);
        setPos({ top, left });
      }
      setOpen(v => !v);
    };

    return (
      <>
        <button
          ref={btnRef}
          type="button"
          onClick={handleClick}
          className={`shrink-0 rounded-full p-0.5 transition-colors ml-1 ${open ? 'text-accent' : 'text-slate-300 hover:text-white/60'} active:text-white/60'} hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]`}
          aria-label="Mostra anteprima"
        >
          <Info className="w-3 h-3" />
        </button>

        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={popRef}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
                className="rounded-2xl border border-neutral-500 bg-[#0d1f3c]/95 shadow-xl p-3 w-[280px] font-sans"
              >
                <p className="text-[9px] font-bold uppercase tracking-wider text-white/50 mb-2">
                  Anteprima — {previewTitle}
                </p>
                <div className="flex gap-2">
                  {off}
                  {on}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </>
    );
  }

  /** Mini card con etichetta inglobata — stile allineato a ShiftCell. */
  const PreviewCard = ({ children, active, label }: { children: React.ReactNode; active?: boolean; label?: string }) => (
    <div
      className={`rounded-lg border px-2.5 py-2 text-[10px] leading-tight space-y-0.5 flex-1 ${
        active
          ? 'border-accent/40 bg-accent/[0.06] text-white/85'
          : 'border-neutral-500 bg-white/8 text-white/50'
      }`}
    >
      {label && (
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/50 mb-1">
          {label}
        </div>
      )}
      {children}
    </div>
  );

  /** Mini barra di navigazione con tab selezionabili. */
  const MiniNav = ({ tabs, highlight }: { tabs: { icon: string; label: string; key: string }[]; highlight?: string }) => (
    <div className="flex items-center gap-0.5 rounded-xl bg-white/10 p-0.5">
      {tabs.map(tab => (
        <div key={tab.key} className={`flex flex-col items-center px-1 py-0.5 rounded-lg flex-1 text-[8px] ${
          tab.key === highlight ? 'bg-white/15 text-accent font-bold shadow-sm' : 'text-white/50'
        }`}>
          <span>{tab.icon}</span>
          <span className="truncate max-w-[28px] text-center" title={tab.label}>{tab.label}</span>
        </div>
      ))}
    </div>
  );

  const NAV_TABS = [
    { key: 'home', icon: '🏠', label: 'Home' },
    { key: 'team', icon: '📅', label: 'Turni' },
    { key: 'ts', icon: '🕐', label: 'Pres.' },
    { key: 'ferie', icon: '🌴', label: 'Ferie' },
  ];

  type PermKey = string;
  const PERM_PREVIEWS: Record<PermKey, { title: string; off: React.ReactNode; on: React.ReactNode }> = {
    // ── Schede ──
    home_tab: {
      title: 'Scheda Panoramica',
      off: <PreviewCard label="Spento"><div className="flex gap-1 items-center opacity-40"><span>🏠</span><span className="line-through">Panoramica</span></div><div className="text-[9px] mt-0.5">Tab assente</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div className="flex gap-1 items-center font-semibold"><span>🏠</span>Panoramica</div><div className="text-[9px] mt-0.5">Tab visibile</div></PreviewCard>,
    },
    team_view: {
      title: 'Scheda Turni',
      off: <PreviewCard label="Spento"><MiniNav tabs={NAV_TABS.filter(t => t.key !== 'team')} /></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><MiniNav tabs={NAV_TABS} highlight="team" /></PreviewCard>,
    },
    timesheet_tab: {
      title: 'Scheda Presenze',
      off: <PreviewCard label="Spento"><MiniNav tabs={NAV_TABS.filter(t => t.key !== 'ts')} /></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><MiniNav tabs={NAV_TABS} highlight="ts" /></PreviewCard>,
    },
    ferie_tab: {
      title: 'Scheda Ferie',
      off: <PreviewCard label="Spento"><MiniNav tabs={NAV_TABS.filter(t => t.key !== 'ferie')} /></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><MiniNav tabs={NAV_TABS} highlight="ferie" /></PreviewCard>,
    },
    // ── Operazioni Turni ──
    edit_shifts: {
      title: 'Modifica Turni',
      off: <PreviewCard label="Spento"><div className="font-semibold text-white/60">09:00 – 17:00</div><div className="text-[8px] opacity-40 mt-0.5">✏️ assente</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div className="font-semibold">09:00 – 17:00</div><div className="rounded bg-accent/20 text-accent text-[8px] text-center py-0.5 font-bold mt-0.5">✏️ Modifica</div></PreviewCard>,
    },
    approve_shifts: {
      title: 'Congelamento Turni',
      off: <PreviewCard label="Spento"><div className="font-semibold text-white/60">Turno ✓</div><div className="text-[8px] opacity-40 mt-0.5">🔒 Sola lettura</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div className="font-semibold">Turno ✓</div><div className="text-[8px] text-green-600 font-semibold mt-0.5">❄️ Congela</div></PreviewCard>,
    },
    export_pdf: {
      title: 'Download PDF',
      off: <PreviewCard label="Spento"><div className="text-[8px] opacity-40 line-through mt-0.5">⬇️ Scarica PDF</div><div className="text-[8px]">Assente</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div className="rounded border border-accent/40 text-accent text-[8px] text-center py-0.5 font-semibold mt-0.5">⬇️ Scarica PDF</div></PreviewCard>,
    },
    // ── Altro ──
    view_stats: {
      title: 'Ore nella scheda Presenze',
      off: <PreviewCard label="Spento"><div>Presenze</div><div className="text-[8px] opacity-40 mt-0.5">Sezione Ore nascosta</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>Presenze</div><div className="text-[8px] font-semibold mt-0.5">📊 Ore visibili</div></PreviewCard>,
    },
    view_estimated_cost: {
      title: 'Costo stimato lavoro',
      off: <PreviewCard label="Spento"><div>Ore totali</div><div className="text-[8px] opacity-40 line-through mt-0.5">€ — —</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>Ore totali</div><div className="text-[8px] font-bold text-green-600 mt-0.5">€ 1.240 stimato</div></PreviewCard>,
    },
    profile_readonly: {
      title: 'PC come telefono',
      off: <PreviewCard label="Spento"><div>🖥️ Browser</div><div className="text-[8px] mt-0.5">Tab standard</div><div className="text-[8px] text-blue-500">Tutte cliccabili</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>🖥️ Browser</div><div className="text-[8px] mt-0.5">Come telefono</div><div className="text-[8px] font-semibold">↑ Scorri schede</div></PreviewCard>,
    },
    // ── Permessi Operativi ──
    can_request_holidays: {
      title: 'Richiedi Ferie',
      off: <PreviewCard label="Spento"><div>🌴 Ferie</div><div className="text-[8px] opacity-40 mt-0.5">+ assente</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>🌴 Ferie</div><div className="text-[8px] font-semibold mt-0.5">+ Nuova richiesta</div></PreviewCard>,
    },
    can_punch_from_app: {
      title: 'Timbratura da App',
      off: <PreviewCard label="Spento"><div>Dashboard</div><div className="text-[8px] opacity-40 line-through mt-0.5">⏱ Timbra</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>Dashboard</div><div className="rounded bg-accent/20 text-accent text-[8px] text-center py-0.5 font-bold mt-0.5">⏱ Timbra</div></PreviewCard>,
    },
    can_create_shifts: {
      title: 'Crea Turni',
      off: <PreviewCard label="Spento"><div>📅 Tabellone</div><div className="text-[8px] opacity-40 mt-0.5">Cella bloccata</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>📅 Tabellone</div><div className="text-[8px] font-semibold text-accent mt-0.5">+ Nuovo turno</div></PreviewCard>,
    },
    can_manage_drafts: {
      title: 'Gestisci Bozze',
      off: <PreviewCard label="Spento"><div>📋 Turno</div><div className="text-[8px] opacity-40 mt-0.5">Bozze nascoste</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>📋 Turno</div><div className="mt-0.5"><span className="bg-amber-100 text-amber-700 rounded px-0.5 text-[8px] font-bold">BOZZA</span></div></PreviewCard>,
    },
    can_approve_shifts: {
      title: 'Approva Turni',
      off: <PreviewCard label="Spento"><div>Turno ✓</div><div className="text-[8px] opacity-40 mt-0.5">Non approvabile</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>Turno ✓</div><div className="text-[8px] font-semibold text-green-600 mt-0.5">✅ Approva</div></PreviewCard>,
    },
    can_view_total_hours: {
      title: 'Ore Totali Team',
      off: <PreviewCard label="Spento"><div>📊 Tabellone</div><div className="text-[8px] opacity-40 mt-0.5">Col. TOTALE nascosta</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>📊 Tabellone</div><div className="text-[8px] font-semibold mt-0.5">Col. TOTALE visibile</div></PreviewCard>,
    },
    can_edit_staff_pins: {
      title: 'Modifica PIN Staff',
      off: <PreviewCard label="Spento"><div>👤 Profilo</div><div className="text-[8px] opacity-40 line-through mt-0.5">Cambia PIN</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>👤 Profilo</div><div className="text-[8px] font-semibold mt-0.5">🔑 Cambia PIN</div></PreviewCard>,
    },
    team_schedule_visible: {
      title: 'Visibile in tabellone',
      off: <PreviewCard label="Spento"><div>📅 Tabellone</div><div className="text-[8px] opacity-40 mt-0.5">Riga nascosta</div></PreviewCard>,
      on:  <PreviewCard label="Attivo" active><div>📅 Tabellone</div><div className="text-[8px] font-semibold mt-0.5">Riga visibile ✓</div></PreviewCard>,
    },
  };

  // ─── Preview "Presenze: solo orario pianificato" ─────────────────────────
  function TimesheetPrivacyPreviewCell({ t: tv, anyActive = false }: { t: Record<string, string>; anyActive?: boolean }) {
    const [open, setOpen] = useState(false);
    const [hintExpanded, setHintExpanded] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });
    const btnRef = useRef<HTMLButtonElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!open) return;
      const handler = (e: MouseEvent) => {
        if (
          popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          btnRef.current && !btnRef.current.contains(e.target as Node)
        ) setOpen(false);
      };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const handleOpen = () => {
      if (btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setPos({ top: r.bottom + 8, left: r.left });
      }
      setOpen((v) => !v);
    };

    const ShiftCell = ({ planned, active }: { planned: boolean; active: boolean }) => (
      <div
        className={`rounded-lg border px-2.5 py-2 text-[10px] leading-tight space-y-0.5 transition-all ${
          active
            ? 'border-accent/40 bg-accent/[0.06]'
            : 'border-neutral-500 bg-white/8'
        }`}
        style={{ minWidth: 110 }}
      >
        {/* header */}
        <div className="text-[9px] font-bold uppercase tracking-wider text-white/50 mb-1">
          {planned ? 'Attivo' : 'Spento'}
        </div>
        {/* orario pianificato — sempre visibile */}
        <div className="flex items-center gap-1 font-semibold text-white/80">
          <span className="text-[9px] text-green-500 font-bold">✓</span>
          09:00 – 17:00
        </div>
        {/* dati nascosti quando planned */}
        {!planned && (
          <>
            <div className="flex items-center gap-1 text-white/60">
              <span className="text-[9px]">⏱</span> 08:31 timb.
            </div>
            <div className="flex items-center gap-1 text-amber-600">
              <span className="text-[9px]">Δ</span> −29m
            </div>
            <div className="flex items-center gap-1 text-white/50">
              <span className="inline-block w-2 h-2 rounded-sm bg-purple-400/60 text-[7px] text-center leading-[8px]">!</span>
              badge audit
            </div>
          </>
        )}
        {planned && (
          <div className="text-white/50 text-[10px] mt-0.5 italic">
            delta e timbrature nascosti
          </div>
        )}
      </div>
    );

    return (
      <div>
        {/* Label + hint */}
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] text-white/80">
            {tv.admin_timesheet_grid_planned_only_label ?? 'Presenze: solo orario pianificato'}
          </span>
          {!anyActive && (
            <button
              ref={btnRef}
              type="button"
              onClick={handleOpen}
              className={`shrink-0 rounded-full p-0.5 transition-colors ${open ? 'text-accent' : 'text-white/50 hover:text-white/70'} active:text-white/70'} hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]`}
              aria-label="Mostra anteprima"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="mt-0.5 max-w-[220px]">
          <AnimatePresence initial={false}>
            {hintExpanded ? (
              <motion.div
                key="expanded"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="overflow-hidden"
              >
                <span className="text-[11px] text-white/50 leading-snug">
                  {tv.admin_timesheet_grid_planned_only_hint ?? 'Nasconde timbrature, delta e totali grezzi: l\'utente vede solo orari pianificati pubblicati e, per turni congelati, le ore approvate.'}
                </span>
              </motion.div>
            ) : (
              <motion.div
                key="collapsed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12 }}
              >
                <span className="text-[11px] text-white/50">
                  Nasconde timbrature, delta e totali grezzi
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {!anyActive && (
            <button
              type="button"
              onClick={() => setHintExpanded(v => !v)}
              className="text-[10px] font-semibold text-accent/70 hover:text-accent transition-colors mt-0.5 leading-none active:text-accent"
            >
              {hintExpanded ? '↑ meno' : '↓ di più'}
            </button>
          )}
        </div>

        {/* Popover — portale su document.body per sfuggire a overflow-x-clip del root */}
        {typeof document !== 'undefined' && createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999 }}
                className="rounded-2xl border border-neutral-500 bg-[#0d1f3c]/95 shadow-xl p-3 w-[280px] font-sans"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/60 mb-2">
                  Anteprima cella presenze
                </p>
                <div className="flex gap-2">
                  <ShiftCell planned={false} active={false} />
                  <ShiftCell planned={true} active={true} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
      </div>
    );
  }

  // ─── Vista mobile: user chip + lista permessi ────────────────────────────
  const MobileRow = ({ label, enabled, onToggle, locked, sublabel }: {
    label: React.ReactNode; enabled: boolean; onToggle: () => void; locked?: boolean; sublabel?: string;
  }) => (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-white/80 leading-snug">{label}</div>
        {sublabel && <div className="text-[11px] text-white/50 mt-0.5 leading-snug">{sublabel}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={locked}
        onClick={onToggle}
        className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${enabled ? 'bg-accent' : 'bg-white/20'} hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}
      >
        <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );

  const MobileSectionHeader = ({ title }: { title: string }) => (
    <div className="px-4 py-2 bg-white/5 border-y border-white/10">
      <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">{title}</span>
    </div>
  );

  const renderMobileView = () => (
    <div className="sm:hidden rounded-xl border border-neutral-500 overflow-hidden rounded-2xl">
      {/* User chips */}
      <div className="overflow-x-auto flex gap-2 px-3 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.14)' }}>
        {nonAdminUsers.map(u => {
          const isSelected = (mobileSelectedUserId ?? nonAdminUsers[0]?.id) === u.id;
          const color = roleColor(u.role);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => setMobileSelectedUserId(u.id)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 transition-all ${isSelected ? 'border-accent bg-white/20' : 'border border-neutral-500 bg-white/8'}`}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-bold" style={{ backgroundColor: color }}>
                {initials(u)}
              </div>
              <span className="text-[11px] font-semibold text-white/80 leading-none">{u.first_name}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none" style={{ backgroundColor: color }}>
                {roleBadgeLabel(u.role, t as Record<string, string>)}
              </span>
            </button>
          );
        })}
      </div>

      {mobileUser && (
        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
          {/* Schede e Navigazione */}
          <MobileSectionHeader title="Schede e Navigazione" />
          {ROLE_TEMPLATE_FEATURE_SECTIONS.find(s => s.id === 'tabs_nav')?.rows.map(({ key }) => {
            const locked = key === 'home_tab' || (key === 'admin_tab' && (mobileUser.role === 'manager' || mobileUser.role === 'assistant_manager'));
            return (
              <MobileRow
                key={key}
                label={<>{FEATURE_LABELS_TAB_FIRST[key]}{key === 'home_tab' && <span className="ml-1 text-[10px] text-white/50"> sempre attiva</span>}</>}
                enabled={(userFeatures[mobileUser.id]?.[key]) === true}
                locked={locked}
                onToggle={() => toggleFeature(mobileUser.id, key)}
              />
            );
          })}

          {/* Operazioni Turni */}
          <MobileSectionHeader title="Operazioni Turni" />
          {ROLE_TEMPLATE_FEATURE_SECTIONS.find(s => s.id === 'shift_ops')?.rows.map(({ key }) => (
            <MobileRow
              key={key}
              label={FEATURE_LABELS[key]}
              enabled={(userFeatures[mobileUser.id]?.[key]) === true}
              onToggle={() => toggleFeature(mobileUser.id, key)}
            />
          ))}

          {/* Altro */}
          <MobileSectionHeader title="Altro" />
          {ROLE_TEMPLATE_FEATURE_SECTIONS.find(s => s.id === 'other')?.rows.map(({ key }) => (
            <MobileRow
              key={key}
              label={FEATURE_LABELS[key]}
              enabled={(userFeatures[mobileUser.id]?.[key]) === true}
              onToggle={() => toggleFeature(mobileUser.id, key)}
            />
          ))}
          <MobileRow
            label="Solo orario pianificato"
            sublabel="Nasconde orari effettivi nel foglio presenze"
            enabled={userPlannedOnly[mobileUser.id] ?? false}
            onToggle={() => togglePlannedOnly(mobileUser.id)}
          />

          {/* Permessi Operativi */}
          <MobileSectionHeader title="Permessi Operativi" />
          {permRows.map(perm => (
            <MobileRow
              key={perm.key}
              label={perm.label}
              sublabel={perm.description}
              enabled={(userOp[mobileUser.id]?.[perm.key]) === true}
              onToggle={() => toggleOp(mobileUser.id, perm.key)}
            />
          ))}

          {/* Visibilità nel tabellone */}
          <MobileSectionHeader title="Visibilità nel Tabellone Turni" />
          <MobileRow
            label={t.settings_visible_on_schedule_row}
            sublabel="Appare nel tabellone turni e nelle presenze di squadra"
            enabled={userTeamVisible[mobileUser.id] ?? true}
            onToggle={() => toggleTeamVisible(mobileUser.id)}
          />
        </div>
      )}

      {/* Footer salva */}
      <div className="flex items-center justify-end gap-3 border-t border-white/12 bg-white/6 px-4 py-3">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold shadow-md disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: ACCENT }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.role_templates_save_all}
        </button>
      </div>
    </div>
  );

  const renderMatrix = () => (
    <div className="hidden sm:block rounded-xl border border-neutral-500 overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm" style={{ minWidth: `${Math.max(640, 200 + nonAdminUsers.length * 90)}px`, width: '100%' }}>

          {/* Intestazione colonne: dipendenti */}
          <thead>
            <tr className="border-b" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
              <th
                className="sticky left-0 z-10 bg-[#0d1f3c] px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white/50"
                style={{ minWidth: 180 }}
              >
                Permesso
              </th>
              {nonAdminUsers.map((u) => {
                const color = roleColor(u.role);
                const badge = roleBadgeLabel(u.role, t as Record<string, string>);
                return (
                  <th key={u.id} className="px-2 py-2 text-center" style={{ minWidth: 80 }}>
                    <div className="flex flex-col items-center gap-1">
                      {/* Avatar */}
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {initials(u)}
                      </div>
                      {/* Nome */}
                      <span className="text-[11px] font-semibold text-white/80 leading-tight text-center max-w-[76px] truncate" title={u.first_name}>{u.first_name}
                      </span>
                      {/* Ruolo */}
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
                        style={{ backgroundColor: color }}
                      >
                        {badge}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>

            {/* ── Schede & Navigazione ── */}
            <SectionHeader title="Schede e Navigazione" />
            {ROLE_TEMPLATE_FEATURE_SECTIONS.find((s) => s.id === 'tabs_nav')?.rows.map(({ key }) => (
              <tr key={key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/8 transition-colors active:bg-white/8/80">
                <td className="sticky left-0 z-10 bg-[#0d1f3c] px-4 py-2.5">
                  <div className="flex items-center gap-0.5 text-[13px] text-white/80">
                    {FEATURE_LABELS_TAB_FIRST[key]}
                    {key === 'home_tab' && (
                      <span className="ml-1 text-[10px] text-white/50">sempre attiva</span>
                    )}
                    {PERM_PREVIEWS[key] && (
                      <PermInfoButton
                        previewTitle={PERM_PREVIEWS[key].title}
                        off={PERM_PREVIEWS[key].off}
                        on={PERM_PREVIEWS[key].on}
                      />
                    )}
                  </div>
                </td>
                {nonAdminUsers.map((u) => {
                  const locked = key === 'home_tab'
                    || (key === 'admin_tab' && (u.role === 'manager' || u.role === 'assistant_manager'));
                  return (
                    <td key={u.id} className="px-2 py-2.5 text-center">
                      <MatrixToggle
                        enabled={(userFeatures[u.id]?.[key]) === true}
                        locked={locked}
                        onToggle={() => toggleFeature(u.id, key)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* ── Operazioni Turni ── */}
            <SectionHeader title="Operazioni Turni" />
            {ROLE_TEMPLATE_FEATURE_SECTIONS.find((s) => s.id === 'shift_ops')?.rows.map(({ key }) => (
              <tr key={key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/8 transition-colors active:bg-white/8/80">
                <td className="sticky left-0 z-10 bg-[#0d1f3c] px-4 py-2.5">
                  <div className="flex items-center gap-0.5 text-[13px] text-white/80">
                    {FEATURE_LABELS[key]}
                    {PERM_PREVIEWS[key] && (
                      <PermInfoButton
                        previewTitle={PERM_PREVIEWS[key].title}
                        off={PERM_PREVIEWS[key].off}
                        on={PERM_PREVIEWS[key].on}
                      />
                    )}
                  </div>
                </td>
                {nonAdminUsers.map((u) => (
                  <td key={u.id} className="px-2 py-2.5 text-center">
                    <MatrixToggle
                      enabled={(userFeatures[u.id]?.[key]) === true}
                      onToggle={() => toggleFeature(u.id, key)}
                    />
                  </td>
                ))}
              </tr>
            ))}

            {/* ── Altro ── costo stimato, profilo su browser, presenze privacy ── */}
            <SectionHeader title="Altro" />
            {ROLE_TEMPLATE_FEATURE_SECTIONS.find((s) => s.id === 'other')?.rows.map(({ key }) => (
              <tr key={key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/8 transition-colors active:bg-white/8/80">
                <td className="sticky left-0 z-10 bg-[#0d1f3c] px-4 py-2.5">
                  <div className="flex items-center gap-0.5 text-[13px] text-white/80">
                    {FEATURE_LABELS[key]}
                    {PERM_PREVIEWS[key] && (
                      <PermInfoButton
                        previewTitle={PERM_PREVIEWS[key].title}
                        off={PERM_PREVIEWS[key].off}
                        on={PERM_PREVIEWS[key].on}
                      />
                    )}
                  </div>
                </td>
                {nonAdminUsers.map((u) => (
                  <td key={u.id} className="px-2 py-2.5 text-center">
                    <MatrixToggle
                      enabled={(userFeatures[u.id]?.[key]) === true}
                      onToggle={() => toggleFeature(u.id, key)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {/* Presenze: solo orario pianificato (privacy griglia) */}
            <tr className="transition-colors">
              <td className="sticky left-0 z-10 bg-[#0d1f3c] px-4 py-2.5">
                <TimesheetPrivacyPreviewCell
                  t={t as Record<string, string>}
                  anyActive={Object.values(userPlannedOnly).some(Boolean)}
                />
              </td>
              {nonAdminUsers.map((u) => (
                <td key={u.id} className="px-2 py-2.5 text-center">
                  <MatrixToggle
                    enabled={userPlannedOnly[u.id] ?? false}
                    onToggle={() => togglePlannedOnly(u.id)}
                  />
                </td>
              ))}
            </tr>

            {/* ── Permessi Operativi ── */}
            <SectionHeader title="Permessi Operativi" />
            {permRows.map((perm) => (
              <tr key={perm.key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/8 transition-colors active:bg-white/8/80">
                <td className="sticky left-0 z-10 bg-[#0d1f3c] px-4 py-2.5">
                  <div className="flex items-center gap-0.5 text-[13px] text-white/80">
                    {perm.label}
                    {PERM_PREVIEWS[perm.key] && (
                      <PermInfoButton
                        previewTitle={PERM_PREVIEWS[perm.key].title}
                        off={PERM_PREVIEWS[perm.key].off}
                        on={PERM_PREVIEWS[perm.key].on}
                      />
                    )}
                  </div>
                  {perm.description && (
                    <div className="text-[11px] text-white/50 leading-snug mt-0.5 max-w-[220px]">
                      {perm.description}
                    </div>
                  )}
                </td>
                {nonAdminUsers.map((u) => (
                  <td key={u.id} className="px-2 py-2.5 text-center">
                    <MatrixToggle
                      enabled={(userOp[u.id]?.[perm.key]) === true}
                      onToggle={() => toggleOp(u.id, perm.key)}
                    />
                  </td>
                ))}
              </tr>
            ))}

            {/* ── Visibilità Tabellone ── */}
            <SectionHeader title="Visibilità nel Tabellone Turni" icon={<Users className="h-3 w-3" />} />
            <tr className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/8 transition-colors active:bg-white/8/80">
              <td className="sticky left-0 z-10 bg-[#0d1f3c] px-4 py-2.5">
                <div className="flex items-center gap-0.5 text-[13px] text-white/80">
                  {t.settings_visible_on_schedule_row}
                  <PermInfoButton
                    previewTitle={PERM_PREVIEWS.team_schedule_visible.title}
                    off={PERM_PREVIEWS.team_schedule_visible.off}
                    on={PERM_PREVIEWS.team_schedule_visible.on}
                  />
                </div>
                <div className="text-[11px] text-white/50 leading-snug mt-0.5">
                  Appare nel tabellone turni e nelle presenze di squadra
                </div>
              </td>
              {nonAdminUsers.map((u) => (
                <td key={u.id} className="px-2 py-2.5 text-center">
                  <MatrixToggle
                    enabled={userTeamVisible[u.id] ?? true}
                    onToggle={() => toggleTeamVisible(u.id)}
                  />
                </td>
              ))}
            </tr>

            {/* ── Moduli Scheda Admin (globale) ── */}
            <SectionHeader title="Moduli Scheda Admin (globale)" />
            {ADMIN_MODULE_KEYS.map((key) => (
              <tr key={key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/8 transition-colors active:bg-white/8/80">
                <td className="sticky left-0 z-10 bg-[#0d1f3c] px-4 py-2.5 text-[13px] text-white/85">
                  {getAdminModuleLabel(key, t as Record<string, string>)}
                </td>
                <td colSpan={nonAdminUsers.length} className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-[11px] text-white/50">Globale</span>
                    <MatrixToggle
                      enabled={mods[key] === true}
                      onToggle={() => toggleMod(key)}
                    />
                  </div>
                </td>
              </tr>
            ))}

          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between border-t border-white/12 bg-white/6 px-4 py-3 gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetMods}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/60 hover:bg-white/8 transition-colors disabled:opacity-50 active:bg-white/8/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          >
            <RotateCcw className="w-3 h-3" />
            Reset moduli
          </button>
          <button
            type="button"
            onClick={() => void handleResetAll()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-50 active:bg-red-500/80"
          >
            <RotateCcw className="w-3 h-3" />
            Azzera tutto
          </button>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold shadow-md disabled:opacity-60 transition-opacity"
          style={{ backgroundColor: ACCENT }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.role_templates_save_all}
        </button>
      </div>
    </div>
  );

  if (variant === 'embedded') {
    return (
      <div className="pb-1">
        {/* miniature preview — intentional: text-[8–10px] nelle anteprime compatte / matrix */}
        {renderMobileView()}
        {renderMatrix()}
      </div>
    );
  }

  return (
    <div className="pb-content pt-6 w-full app-horizontal-pad font-sans">
      {/* miniature preview — intentional: text-[8–10px] nelle anteprime compatte / matrix */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        {renderMobileView()}
        {renderMatrix()}
      </motion.div>
    </div>
  );
}
