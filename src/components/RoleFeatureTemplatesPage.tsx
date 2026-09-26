import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Users, Info } from 'lucide-react';
import ToggleSwitch from './ui/toggle-switch-glass';
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
import { CenteredModalPortal } from './ui/CenteredModalPortal';
import { buildSettingsPermissionRows, defaultOperationalTemplateBase } from '../utils/settingsPermissionRows';
import {
  TIMESHEET_GRID_PLANNED_ONLY_KEY,
  getTimesheetGridPrivacyMode,
} from '../utils/timesheetGridPrivacy';
import { UI_SCREEN_WIDGETS, widgetAppliesToUser } from '../utils/uiScreenWidgets';
import type { User } from '../types';

export type RoleFeatureTemplatesPanelVariant = 'page' | 'embedded';

type Props = { variant?: RoleFeatureTemplatesPanelVariant };

/** Attesa prima dell'autosave dopo l'ultimo toggle (ms). */
const AUTOSAVE_DEBOUNCE_MS = 600;

/**
 * Payload utente del pannello: stesse chiavi per salvataggio manuale e autosave.
 * `enabled_features` ingloba anche il flag privacy presenze.
 */
function buildUserPermissionPayload(
  features: EnabledFeatures | undefined,
  op: Record<SettingsOperationalPermKey, boolean> | undefined,
  teamVisible: boolean,
  plannedOnly: boolean,
  uiSections?: Record<string, boolean>
): Partial<User> {
  const mergedFeatures: Record<string, boolean> = { ...(features ?? {}) };
  if (plannedOnly) mergedFeatures[TIMESHEET_GRID_PLANNED_ONLY_KEY] = true;
  else delete mergedFeatures[TIMESHEET_GRID_PLANNED_ONLY_KEY];
  // Solo le sezioni nascoste generano un override; visibile = chiave assente.
  const uiOverrides: Record<string, boolean> = {};
  if (uiSections) {
    for (const [k, visible] of Object.entries(uiSections)) {
      if (visible === false) uiOverrides[k] = false;
    }
  }
  return {
    hide_from_team_schedule: !teamVisible,
    ...((op ?? {}) as Partial<User>),
    enabled_features: mergedFeatures,
    ui_section_overrides: uiOverrides,
  };
}

/** Firma dello stato del pannello: usata per capire se ci sono modifiche pendenti. */
function panelStateSignature(
  features: Record<string, EnabledFeatures>,
  op: Record<string, Record<SettingsOperationalPermKey, boolean>>,
  teamVisible: Record<string, boolean>,
  plannedOnly: Record<string, boolean>,
  uiSections: Record<string, Record<string, boolean>>,
  mods: Record<AdminModuleKey, boolean>
): string {
  return JSON.stringify({ f: features, o: op, t: teamVisible, p: plannedOnly, u: uiSections, m: mods });
}

function roleColor(role: string): string {
  // Varianti scure (700/800) così il testo bianco sopra supera il contrasto AA
  if (role === 'manager') return '#047857';
  if (role === 'assistant_manager') return '#B45309';
  return '#047857';
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
 * Wrapper dei toggle, definito a livello di modulo (e non dentro il componente):
 * in questo modo la reference resta stabile tra i render e i toggle NON vengono
 * smontati/rimontati a ogni re-render (era la causa del flicker nella tabella).
 */
function MatrixToggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <ToggleSwitch
      isActive={enabled}
      onChange={onToggle}
      size="xs"
      darkMode
      className="inline-flex"
    />
  );
}

function MobileRow({ label, enabled, onToggle, sublabel }: {
  label: React.ReactNode; enabled: boolean; onToggle: () => void; sublabel?: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[0.8125rem] text-white/80 leading-snug">{label}</div>
        {sublabel && <div className="text-[0.6875rem] text-white/50 mt-0.5 leading-snug">{sublabel}</div>}
      </div>
      <ToggleSwitch
        isActive={enabled}
        onChange={onToggle}
        size="sm"
        darkMode
        className="shrink-0"
      />
    </div>
  );
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
  const tv = t as Record<string, string>;
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
  // Inizializzato "lazy" dai dati già presenti al primo render: evita che i
  // toggle partano spenti per poi scattare quando arriva lo stato (flicker
  // all'apertura della scheda).
  const computePermState = () => {
    const features: Record<string, EnabledFeatures> = {};
    const ops: Record<string, Record<SettingsOperationalPermKey, boolean>> = {};
    const teamVis: Record<string, boolean> = {};
    const plannedOnly: Record<string, boolean> = {};
    const uiSections: Record<string, Record<string, boolean>> = {};
    for (const u of nonAdminUsers) {
      features[u.id] = getEnabledFeatures(u);
      ops[u.id] = {
        can_punch_from_app: u.can_punch_from_app ?? false,
        can_create_shifts: u.can_create_shifts ?? false,
        can_manage_drafts: u.can_manage_drafts ?? false,
        can_approve_shifts: u.can_approve_shifts ?? false,
      };
      teamVis[u.id] = !(u.hide_from_team_schedule === true);
      plannedOnly[u.id] = getTimesheetGridPrivacyMode(u) === 'planned_only';
      const ov = u.ui_section_overrides;
      const map: Record<string, boolean> = {};
      for (const w of UI_SCREEN_WIDGETS) map[w.key] = ov?.[w.key] !== false;
      uiSections[u.id] = map;
    }
    return { features, ops, teamVis, plannedOnly, uiSections };
  };

  const initialPermState = useMemo(computePermState, [nonAdminUsers]);

  const [userFeatures, setUserFeatures] = useState<Record<string, EnabledFeatures>>(() => initialPermState.features);
  const [userOp, setUserOp] = useState<Record<string, Record<SettingsOperationalPermKey, boolean>>>(() => initialPermState.ops);
  const [userTeamVisible, setUserTeamVisible] = useState<Record<string, boolean>>(() => initialPermState.teamVis);
  const [userPlannedOnly, setUserPlannedOnly] = useState<Record<string, boolean>>(() => initialPermState.plannedOnly);
  const [userUiSections, setUserUiSections] = useState<Record<string, Record<string, boolean>>>(() => initialPermState.uiSections);

  // ─── Selezione utente mobile ─────────────────────────────────────────────
  const [mobileSelectedUserId, setMobileSelectedUserId] = useState<string | null>(null);
  const mobileUser = nonAdminUsers.find(u => u.id === (mobileSelectedUserId ?? nonAdminUsers[0]?.id)) ?? nonAdminUsers[0] ?? null;

  // ─── Admin modules (globale) ─────────────────────────────────────────────
  const [mods, setMods] = useState<Record<AdminModuleKey, boolean>>(() => buildMergedAdminModulesForAdminEditor());
  const [saving, setSaving] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  /** Stato mostrato nel footer: in salvataggio / salvato. */
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const templatePanelDirtyRef = useRef(false);
  /** Payload serializzato dell'ultimo salvataggio riuscito, per utente (= righe da non riscrivere). */
  const savedPayloadRef = useRef<Record<string, string>>({});
  const savedModsKeyRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  /** Firma dell'ultimo stato renderizzato: serve a capire se restano modifiche pendenti dopo un salvataggio. */
  const latestStateSignatureRef = useRef('');

  const markDirty = useCallback(() => {
    templatePanelDirtyRef.current = true;
    setAutosaveState('saving');
  }, []);

  useEffect(() => {
    latestStateSignatureRef.current = panelStateSignature(
      userFeatures, userOp, userTeamVisible, userPlannedOnly, userUiSections, mods
    );
  }, [userFeatures, userOp, userTeamVisible, userPlannedOnly, userUiSections, mods]);

  // Inizializza/riallinea stato dai dati utente (quando non ci sono modifiche pendenti)
  useEffect(() => {
    if (templatePanelDirtyRef.current) return;
    const { features, ops, teamVis, plannedOnly, uiSections } = computePermState();
    setUserFeatures(features);
    setUserOp(ops);
    setUserTeamVisible(teamVis);
    setUserPlannedOnly(plannedOnly);
    setUserUiSections(uiSections);
    // Snapshot = stato appena letto: l'autosave riscriverà solo ciò che cambia.
    const snapshot: Record<string, string> = {};
    for (const u of nonAdminUsers) {
      snapshot[u.id] = JSON.stringify(
        buildUserPermissionPayload(features[u.id], ops[u.id], teamVis[u.id] ?? true, plannedOnly[u.id] ?? false, uiSections[u.id])
      );
    }
    savedPayloadRef.current = snapshot;
    savedModsKeyRef.current = JSON.stringify(serializeAdminModulesForDisk(buildMergedAdminModulesForAdminEditor()));
    setAutosaveState('idle');
  }, [nonAdminUsers]);

  useEffect(() => {
    if (templatePanelDirtyRef.current) return;
    setMods(buildMergedAdminModulesForAdminEditor());
    savedModsKeyRef.current = JSON.stringify(serializeAdminModulesForDisk(buildMergedAdminModulesForAdminEditor()));
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

  const toggleUiSection = useCallback((userId: string, key: string) => {
    markDirty();
    setUserUiSections((prev) => {
      const cur = prev[userId] ?? {};
      // Default = visibile; il toggle inverte rispetto allo stato corrente.
      return { ...prev, [userId]: { ...cur, [key]: cur[key] === false } };
    });
  }, [markDirty]);

  const toggleMod = useCallback((key: AdminModuleKey) => {
    markDirty();
    setMods((m) => ({ ...m, [key]: !m[key] }));
  }, [markDirty]);

  const resetMods = useCallback(() => {
    markDirty();
    setMods(Object.fromEntries(ADMIN_MODULE_KEYS.map((k) => [k, true])) as Record<AdminModuleKey, boolean>);
  }, [markDirty]);

  // ─── Salva (autosave differenziale) ──────────────────────────────────────
  const handleSave = async () => {
    const signatureAtStart = panelStateSignature(
      userFeatures, userOp, userTeamVisible, userPlannedOnly, userUiSections, mods
    );
    const payloads = nonAdminUsers.map((u) => {
      const payload = buildUserPermissionPayload(
        userFeatures[u.id],
        userOp[u.id],
        userTeamVisible[u.id] ?? true,
        userPlannedOnly[u.id] ?? false,
        userUiSections[u.id]
      );
      return { id: u.id, payload, key: JSON.stringify(payload) };
    });
    // Autosave: scrive solo le righe effettivamente cambiate.
    const toSave = payloads.filter((p) => savedPayloadRef.current[p.id] !== p.key);
    const modsSerialized = serializeAdminModulesForDisk(mods);
    const modsKey = JSON.stringify(modsSerialized);
    const modsChanged = savedModsKeyRef.current !== modsKey;

    if (toSave.length === 0 && !modsChanged) {
      templatePanelDirtyRef.current = false;
      setAutosaveState('saved');
      return;
    }

    setSaving(true);
    setAutosaveState('saving');
    try {
      // Salvataggio in parallelo: più veloce e senza stato a metà se un utente fallisce.
      const results = await Promise.all(
        toSave.map(({ id, payload }) =>
          updateUser(id, payload).then(
            () => true,
            (err) => {
              console.error('[RoleFeatureTemplatesPanel] updateUser', id, err);
              return false;
            }
          )
        )
      );
      const failed = results.some((ok) => !ok);
      if (!failed) {
        for (const { id, key } of toSave) savedPayloadRef.current[id] = key;
      }
      if (modsChanged) {
        await saveAdminModulesGlobal(modsSerialized);
        savedModsKeyRef.current = modsKey;
      }
      if (failed) {
        setAutosaveState('idle');
        showError?.(t.role_templates_save_error);
        return;
      }
      // Restano modifiche pendenti se nel frattempo lo stato è cambiato di nuovo.
      if (latestStateSignatureRef.current === signatureAtStart) {
        templatePanelDirtyRef.current = false;
      }
      setAutosaveState(latestStateSignatureRef.current === signatureAtStart ? 'saved' : 'saving');
    } catch (e) {
      console.error(e);
      setAutosaveState('idle');
      showError?.(e instanceof Error ? e.message : t.role_templates_save_error);
    } finally {
      setSaving(false);
    }
  };

  // Autosave: debounce dopo l'ultima modifica pendente.
  useEffect(() => {
    if (!templatePanelDirtyRef.current) return;
    // Se un salvataggio è in corso si aspetta: l'effetto riparte quando `saving` torna false.
    if (saving) return;
    if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void handleSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- l'effetto deve ripartire a ogni cambio di stato del pannello
  }, [userFeatures, userOp, userTeamVisible, userPlannedOnly, userUiSections, mods, saving]);

  // ─── Azzera tutto ────────────────────────────────────────────────────────
  const handleResetAll = async () => {
    setConfirmResetOpen(false);
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
        await updateUser(u.id, { ...nullPayload, enabled_features: undefined, ui_section_overrides: {} } as Parameters<typeof updateUser>[1]);
      }

      // 4. Ricarica UI dai default codice
      const features: Record<string, EnabledFeatures> = {};
      const ops: Record<string, Record<SettingsOperationalPermKey, boolean>> = {};
      const teamVis: Record<string, boolean> = {};
      const uiSectionsReset: Record<string, Record<string, boolean>> = {};
      for (const u of nonAdminUsers) {
        const grp = u.role === 'manager' ? 'management'
          : u.role === 'assistant_manager' ? 'assistant_manager'
          : 'staff';
        features[u.id] = getCodeDefaultsForTemplateGroup(grp as RoleTemplateGroup);
        ops[u.id] = { ...defaultOp };
        teamVis[u.id] = true;
        const map: Record<string, boolean> = {};
        for (const w of UI_SCREEN_WIDGETS) map[w.key] = true;
        uiSectionsReset[u.id] = map;
      }
      const plannedOnlyReset: Record<string, boolean> = {};
      for (const u of nonAdminUsers) plannedOnlyReset[u.id] = false;
      setUserFeatures(features);
      setUserOp(ops);
      setUserTeamVisible(teamVis);
      setUserPlannedOnly(plannedOnlyReset);
      setUserUiSections(uiSectionsReset);
      setMods(Object.fromEntries(ADMIN_MODULE_KEYS.map((k) => [k, true])) as Record<AdminModuleKey, boolean>);

      // Snapshot allineato a quanto appena scritto: nessun autosave immediato dopo il reset.
      const snapshot: Record<string, string> = {};
      for (const u of nonAdminUsers) {
        snapshot[u.id] = JSON.stringify(
          buildUserPermissionPayload(features[u.id], ops[u.id], true, false, uiSectionsReset[u.id])
        );
      }
      savedPayloadRef.current = snapshot;
      savedModsKeyRef.current = JSON.stringify(
        serializeAdminModulesForDisk(
          Object.fromEntries(ADMIN_MODULE_KEYS.map((k) => [k, true])) as Record<AdminModuleKey, boolean>
        )
      );
      setAutosaveState('saved');
      templatePanelDirtyRef.current = false;
      showSuccess?.(tv.role_templates_reset_success ?? 'Permessi azzerati ai valori predefiniti.');
    } catch (e) {
      console.error(e);
      showError?.(e instanceof Error ? e.message : (tv.role_templates_reset_error ?? 'Errore durante il reset.'));
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

  const SectionHeader = ({ title, icon }: { title: string; icon?: React.ReactNode }) => (
    <tr className="bg-white/5">
      <td colSpan={colCount} className="px-4 py-2">
        <span className="flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-widest text-white/50">
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
          aria-label={tv.role_template_preview_show_aria ?? 'Mostra anteprima'}
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
                style={{
                  position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999,
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 32px 80px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                }}
                className="rounded-2xl border border-white/[0.14] p-3 w-[17.5rem] font-sans"
              >
                <p className="text-[0.5625rem] font-bold uppercase tracking-wider text-white/50 mb-2">
                  {tv.role_template_preview_title_prefix ?? 'Anteprima —'} {previewTitle}
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
      className={`rounded-lg border px-2.5 py-2 text-[0.625rem] leading-tight space-y-0.5 flex-1 ${
 active
 ? 'border-white/40 bg-white/5 text-white/85'
 : 'border-white/20 bg-white/10 text-white/50'
 }`}
    >
      {label && (
        <div className="text-[0.5625rem] font-bold uppercase tracking-wider text-white/50 mb-1">
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
        <div key={tab.key} className={`flex flex-col items-center px-1 py-0.5 rounded-lg flex-1 text-[0.5rem] ${
 tab.key === highlight ? 'bg-white/15 text-accent font-bold shadow-sm' : 'text-white/50'
 }`}>
          <span>{tab.icon}</span>
          <span className="truncate max-w-[1.75rem] text-center" title={tab.label}>{tab.label}</span>
        </div>
      ))}
    </div>
  );

  const NAV_TABS = [
    { key: 'home', icon: '🏠', label: tv.role_template_preview_nav_home ?? 'Home' },
    { key: 'team', icon: '📅', label: tv.role_template_preview_nav_shifts ?? 'Turni' },
    { key: 'ts', icon: '🕐', label: tv.role_template_preview_nav_timesheet ?? 'Pres.' },
    { key: 'ferie', icon: '🌴', label: tv.role_template_preview_nav_holidays ?? 'Ferie' },
  ];

  type PermKey = string;
  const PERM_PREVIEWS: Record<PermKey, { title: string; off: React.ReactNode; on: React.ReactNode }> = {
    // ── Schede ──
    team_view: {
      title: tv.role_template_preview_team_title ?? 'Scheda Turni',
      off: <PreviewCard label={tv.role_template_preview_off ?? 'Spento'}><MiniNav tabs={NAV_TABS.filter(t => t.key !== 'team')} /></PreviewCard>,
      on:  <PreviewCard label={tv.role_template_preview_on ?? 'Attivo'} active><MiniNav tabs={NAV_TABS} highlight="team" /></PreviewCard>,
    },
    // ── Operazioni Turni ──
    edit_shifts: {
      title: tv.role_template_preview_edit_shifts_title ?? 'Modifica Turni',
      off: <PreviewCard label={tv.role_template_preview_off ?? 'Spento'}><div className="font-semibold text-white/60">09:00 – 17:00</div><div className="text-[0.5rem] opacity-40 mt-0.5">✏️ {tv.role_template_preview_edit_absent ?? 'assente'}</div></PreviewCard>,
      on:  <PreviewCard label={tv.role_template_preview_on ?? 'Attivo'} active><div className="font-semibold">09:00 – 17:00</div><div className="rounded bg-white/20 text-accent text-[0.5rem] text-center py-0.5 font-bold mt-0.5">✏️ {tv.role_template_preview_edit_action ?? 'Modifica'}</div></PreviewCard>,
    },
    approve_shifts: {
      title: tv.role_template_preview_freeze_shifts_title ?? 'Congelamento Turni',
      off: <PreviewCard label={tv.role_template_preview_off ?? 'Spento'}><div className="font-semibold text-white/60">{tv.role_template_preview_shift ?? 'Turno'} ✓</div><div className="text-[0.5rem] opacity-40 mt-0.5">🔒 {tv.role_template_preview_readonly ?? 'Sola lettura'}</div></PreviewCard>,
      on:  <PreviewCard label={tv.role_template_preview_on ?? 'Attivo'} active><div className="font-semibold">{tv.role_template_preview_shift ?? 'Turno'} ✓</div><div className="text-[0.5rem] text-green-600 font-semibold mt-0.5">❄️ {tv.role_template_preview_freeze ?? 'Congela'}</div></PreviewCard>,
    },
    export_pdf: {
      title: tv.role_template_preview_export_pdf_title ?? 'Download PDF',
      off: <PreviewCard label={tv.role_template_preview_off ?? 'Spento'}><div className="text-[0.5rem] opacity-40 line-through mt-0.5">⬇️ {tv.role_template_preview_download_pdf ?? 'Scarica PDF'}</div><div className="text-[0.5rem]">{tv.role_template_preview_absent ?? 'Assente'}</div></PreviewCard>,
      on:  <PreviewCard label={tv.role_template_preview_on ?? 'Attivo'} active><div className="rounded border border-white/40 text-accent text-[0.5rem] text-center py-0.5 font-semibold mt-0.5">⬇️ {tv.role_template_preview_download_pdf ?? 'Scarica PDF'}</div></PreviewCard>,
    },
    // ── Altro ──
    view_stats: {
      title: tv.role_template_preview_view_stats_title ?? 'Ore nella scheda Presenze',
      off: <PreviewCard label={tv.role_template_preview_off ?? 'Spento'}><div>{tv.role_template_preview_tab_timesheet ?? 'Presenze'}</div><div className="text-[0.5rem] opacity-40 mt-0.5">{tv.role_template_preview_hours_section_hidden ?? 'Sezione Ore nascosta'}</div></PreviewCard>,
      on:  <PreviewCard label={tv.role_template_preview_on ?? 'Attivo'} active><div>{tv.role_template_preview_tab_timesheet ?? 'Presenze'}</div><div className="text-[0.5rem] font-semibold mt-0.5">📊 {tv.role_template_preview_hours_visible ?? 'Ore visibili'}</div></PreviewCard>,
    },
    // ── Permessi Operativi ──
    can_punch_from_app: {
      title: tv.role_template_preview_punch_title ?? 'Timbratura da App',
      off: <PreviewCard label={tv.role_template_preview_off ?? 'Spento'}><div>{tv.role_template_tab_group_dashboard ?? 'Dashboard'}</div><div className="text-[0.5rem] opacity-40 line-through mt-0.5">⏱ {tv.role_template_preview_punch ?? 'Timbra'}</div></PreviewCard>,
      on:  <PreviewCard label={tv.role_template_preview_on ?? 'Attivo'} active><div>{tv.role_template_tab_group_dashboard ?? 'Dashboard'}</div><div className="rounded bg-white/20 text-accent text-[0.5rem] text-center py-0.5 font-bold mt-0.5">⏱ {tv.role_template_preview_punch ?? 'Timbra'}</div></PreviewCard>,
    },
    can_create_shifts: {
      title: tv.role_template_preview_create_shifts_title ?? 'Crea Turni',
      off: <PreviewCard label={tv.role_template_preview_off ?? 'Spento'}><div>📅 {tv.role_template_preview_board ?? 'Tabellone'}</div><div className="text-[0.5rem] opacity-40 mt-0.5">{tv.role_template_preview_cell_locked ?? 'Cella bloccata'}</div></PreviewCard>,
      on:  <PreviewCard label={tv.role_template_preview_on ?? 'Attivo'} active><div>📅 {tv.role_template_preview_board ?? 'Tabellone'}</div><div className="text-[0.5rem] font-semibold text-accent mt-0.5">{tv.role_template_preview_new_shift ?? '+ Nuovo turno'}</div></PreviewCard>,
    },
    can_manage_drafts: {
      title: tv.role_template_preview_manage_drafts_title ?? 'Gestisci Bozze',
      off: <PreviewCard label={tv.role_template_preview_off ?? 'Spento'}><div>📋 {tv.role_template_preview_shift ?? 'Turno'}</div><div className="text-[0.5rem] opacity-40 mt-0.5">{tv.role_template_preview_drafts_hidden ?? 'Bozze nascoste'}</div></PreviewCard>,
      on:  <PreviewCard label={tv.role_template_preview_on ?? 'Attivo'} active><div>📋 {tv.role_template_preview_shift ?? 'Turno'}</div><div className="mt-0.5"><span className="bg-amber-100 text-amber-700 rounded px-0.5 text-[0.5rem] font-bold">{tv.role_template_preview_draft_badge ?? 'BOZZA'}</span></div></PreviewCard>,
    },
    can_approve_shifts: {
      title: tv.role_template_preview_approve_shifts_title ?? 'Approva Turni',
      off: <PreviewCard label={tv.role_template_preview_off ?? 'Spento'}><div>{tv.role_template_preview_shift ?? 'Turno'} ✓</div><div className="text-[0.5rem] opacity-40 mt-0.5">{tv.role_template_preview_not_approvable ?? 'Non approvabile'}</div></PreviewCard>,
      on:  <PreviewCard label={tv.role_template_preview_on ?? 'Attivo'} active><div>{tv.role_template_preview_shift ?? 'Turno'} ✓</div><div className="text-[0.5rem] font-semibold text-green-600 mt-0.5">✅ {tv.role_template_preview_approve ?? 'Approva'}</div></PreviewCard>,
    },
    team_schedule_visible: {
      title: tv.role_template_preview_board_visible_title ?? 'Visibile in tabellone',
      off: <PreviewCard label={tv.role_template_preview_off ?? 'Spento'}><div>📅 {tv.role_template_preview_board ?? 'Tabellone'}</div><div className="text-[0.5rem] opacity-40 mt-0.5">{tv.role_template_preview_row_hidden ?? 'Riga nascosta'}</div></PreviewCard>,
      on:  <PreviewCard label={tv.role_template_preview_on ?? 'Attivo'} active><div>📅 {tv.role_template_preview_board ?? 'Tabellone'}</div><div className="text-[0.5rem] font-semibold mt-0.5">{tv.role_template_preview_row_visible ?? 'Riga visibile'} ✓</div></PreviewCard>,
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
        className={`rounded-lg border px-2.5 py-2 text-[0.625rem] leading-tight space-y-0.5 transition-colors ${
 active
 ? 'border-white/40 bg-white/5'
 : 'border-white/20 bg-white/10'
 }`}
        style={{ minWidth: 110 }}
      >
        {/* header */}
        <div className="text-[0.5625rem] font-bold uppercase tracking-wider text-white/50 mb-1">
          {planned ? (tv.role_template_preview_on ?? 'Attivo') : (tv.role_template_preview_off ?? 'Spento')}
        </div>
        {/* orario pianificato — sempre visibile */}
        <div className="flex items-center gap-1 font-semibold text-white/80">
          <span className="text-[0.5625rem] text-green-500 font-bold">✓</span>
          09:00 – 17:00
        </div>
        {/* dati nascosti quando planned */}
        {!planned && (
          <>
            <div className="flex items-center gap-1 text-white/60">
              <span className="text-[0.5625rem]">⏱</span> 08:31 timb.
            </div>
            <div className="flex items-center gap-1 text-amber-600">
              <span className="text-[0.5625rem]">Δ</span> −29m
            </div>
            <div className="flex items-center gap-1 text-white/50">
              <span className="inline-block w-2 h-2 rounded-sm bg-purple-400/60 text-[0.4375rem] text-center leading-[0.5rem]">!</span>
              {tv.role_template_preview_audit_badge ?? 'badge audit'}
            </div>
          </>
        )}
        {planned && (
          <div className="text-white/50 text-[0.625rem] mt-0.5 italic">
            {tv.role_template_preview_delta_hidden ?? 'delta e timbrature nascosti'}
          </div>
        )}
      </div>
    );

    return (
      <div>
        {/* Label + hint */}
        <div className="flex items-center gap-1.5">
          <span className="text-[0.8125rem] text-white/80">
            {tv.admin_timesheet_grid_planned_only_label ?? 'Presenze: solo orario pianificato'}
          </span>
          {!anyActive && (
            <button
              ref={btnRef}
              type="button"
              onClick={handleOpen}
              className={`shrink-0 rounded-full p-0.5 transition-colors ${open ? 'text-accent' : 'text-white/50 hover:text-white/70'} active:text-white/70'} hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]`}
              aria-label={tv.role_template_preview_show_aria ?? 'Mostra anteprima'}
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="mt-0.5 max-w-[13.75rem]">
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
                <span className="text-[0.6875rem] text-white/50 leading-snug">
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
                <span className="text-[0.6875rem] text-white/50">
                  {tv.role_template_preview_privacy_hint_short ?? 'Nasconde timbrature, delta e totali grezzi'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          {!anyActive && (
            <button
              type="button"
              onClick={() => setHintExpanded(v => !v)}
              className="text-[0.625rem] font-semibold text-white/70 hover:text-accent transition-colors mt-0.5 leading-none active:text-accent"
            >
              {hintExpanded ? `↑ ${tv.role_template_preview_hint_less ?? 'meno'}` : `↓ ${tv.role_template_preview_hint_more ?? 'di più'}`}
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
                style={{
                  position: 'fixed', top: pos.top, left: pos.left, zIndex: 99999,
                  backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: '0 32px 80px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.08)',
                }}
                className="rounded-2xl border border-white/[0.14] p-3 w-[17.5rem] font-sans"
              >
                <p className="text-[0.625rem] font-bold uppercase tracking-wider text-white/60 mb-2">
                  {tv.role_template_preview_timesheet_cell_title ?? 'Anteprima cella presenze'}
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
  const MobileSectionHeader = ({ title }: { title: string }) => (
    <div className="px-4 py-2 bg-white/5 border-y border-white/10">
      <span className="text-[0.625rem] font-bold uppercase tracking-widest text-white/50">{title}</span>
    </div>
  );

  const renderMobileView = () => (
    <div className="md:hidden rounded-xl border border-white/20 overflow-hidden rounded-2xl">
      {/* User chips */}
      <div className="overflow-x-auto flex gap-2 px-3 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
        {nonAdminUsers.map(u => {
          const isSelected = (mobileSelectedUserId ?? nonAdminUsers[0]?.id) === u.id;
          const color = roleColor(u.role);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => setMobileSelectedUserId(u.id)}
              className={`flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border-2 transition-colors ${isSelected ? 'border-accent bg-white/20' : 'border border-white/20 bg-white/10'}`}
            >
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[0.6875rem] font-bold" style={{ backgroundColor: color }}>
                {initials(u)}
              </div>
              <span className="text-[0.6875rem] font-semibold text-white/80 leading-none">{u.first_name}</span>
              <span className="text-[0.5625rem] font-bold px-1.5 py-0.5 rounded-full text-white leading-none" style={{ backgroundColor: color }}>
                {roleBadgeLabel(u.role, t as Record<string, string>)}
              </span>
            </button>
          );
        })}
      </div>

      {mobileUser && (
        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.10)' }}>
          {/* Schede e Navigazione */}
          <MobileSectionHeader title={tv.role_template_section_tabs_nav ?? 'Schede e Navigazione'} />
          {ROLE_TEMPLATE_FEATURE_SECTIONS.find(s => s.id === 'tabs_nav')?.rows.map(({ key }) => (
            <MobileRow
              key={key}
              label={FEATURE_LABELS_TAB_FIRST[key]}
              enabled={(userFeatures[mobileUser.id]?.[key]) === true}
              onToggle={() => toggleFeature(mobileUser.id, key)}
            />
          ))}

          {/* Operazioni Turni */}
          <MobileSectionHeader title={tv.role_template_section_shift_ops ?? 'Operazioni Turni'} />
          {ROLE_TEMPLATE_FEATURE_SECTIONS.find(s => s.id === 'shift_ops')?.rows.map(({ key }) => (
            <MobileRow
              key={key}
              label={FEATURE_LABELS[key]}
              enabled={(userFeatures[mobileUser.id]?.[key]) === true}
              onToggle={() => toggleFeature(mobileUser.id, key)}
            />
          ))}

          {/* Altro */}
          <MobileSectionHeader title={tv.role_template_section_other ?? 'Altro'} />
          {ROLE_TEMPLATE_FEATURE_SECTIONS.find(s => s.id === 'other')?.rows.map(({ key }) => (
            <MobileRow
              key={key}
              label={FEATURE_LABELS[key]}
              enabled={(userFeatures[mobileUser.id]?.[key]) === true}
              onToggle={() => toggleFeature(mobileUser.id, key)}
            />
          ))}
          <MobileRow
            label={tv.admin_timesheet_grid_planned_only_label ?? 'Presenze: solo orario pianificato'}
            sublabel={tv.admin_timesheet_grid_planned_only_hint ?? 'Nasconde timbrature, delta e totali grezzi'}
            enabled={userPlannedOnly[mobileUser.id] ?? false}
            onToggle={() => togglePlannedOnly(mobileUser.id)}
          />

          {/* Permessi Operativi */}
          <MobileSectionHeader title={tv.role_templates_operational_heading ?? 'Permessi Operativi'} />
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
          <MobileSectionHeader title={tv.role_template_section_board_visibility ?? 'Visibilità nel Tabellone Turni'} />
          <MobileRow
            label={t.settings_visible_on_schedule_row}
            sublabel={tv.role_templates_team_visible_desc ?? 'Appare nel tabellone turni e nelle presenze di squadra'}
            enabled={userTeamVisible[mobileUser.id] ?? true}
            onToggle={() => toggleTeamVisible(mobileUser.id)}
          />

          {/* Sezioni interfaccia (visibilità per profilo) */}
          <MobileSectionHeader title={tv.role_templates_ui_sections_heading ?? 'Sezioni interfaccia (visibilità)'} />
          {UI_SCREEN_WIDGETS.filter((w) => widgetAppliesToUser(w, mobileUser.role)).map((w) => (
            <MobileRow
              key={w.key}
              label={w.label}
              sublabel={w.screenLabel}
              enabled={userUiSections[mobileUser.id]?.[w.key] !== false}
              onToggle={() => toggleUiSection(mobileUser.id, w.key)}
            />
          ))}
        </div>
      )}

      {/* Footer: indicatore autosave */}
      <div className="flex items-center justify-end gap-3 border-t border-white/10 bg-white/[0.06] px-4 py-3">
        <span
          aria-live="polite"
          className={`text-[0.6875rem] font-semibold uppercase tracking-wider ${
            autosaveState === 'saved' ? 'text-emerald-400' : 'text-white/60'
          }`}
        >
          {autosaveState === 'saving'
            ? (tv.role_templates_autosave_saving ?? 'Salvataggio…')
            : autosaveState === 'saved'
              ? (tv.role_templates_autosave_saved ?? 'Salvato')
              : ''}
        </span>
      </div>
    </div>
  );

  const renderMatrix = () => (
    <div className="hidden md:block rounded-2xl border border-white/[0.14]">
      <table className="perm-matrix-table table-fixed w-full text-sm">

        {/* Intestazione colonne: dipendenti — sticky sotto la barra dell'app, così i nomi non finiscono mai sotto l'header.
            Il vetro sta sulle singole celle: solo così gli angoli del pannello in sovrapposizione possono essere arrotondati. */}
        <thead className="sticky top-[var(--app-sticky-header-offset,5rem)] z-20">
          <tr>
            <th className="sticky left-0 z-30 bg-white/[0.06] backdrop-blur-xl px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-white/50"
              style={{ width: 200 }}
            >
              {tv.role_templates_col_permission ?? 'Permesso'}
            </th>
              {nonAdminUsers.map((u) => {
                const color = roleColor(u.role);
                const badge = roleBadgeLabel(u.role, t as Record<string, string>);
                return (
                  <th key={u.id} className="bg-white/[0.06] backdrop-blur-xl px-2 py-2 text-center">
                    <div className="flex min-w-0 flex-col items-center gap-1">
                      {/* Avatar */}
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[0.6875rem] font-bold shrink-0"
                        style={{ backgroundColor: color }}
                      >
                        {initials(u)}
                      </div>
                      {/* Nome */}
                      <span className="block w-full truncate text-[0.6875rem] font-semibold text-white/80 leading-tight text-center" title={u.first_name}>{u.first_name}
                      </span>
                      {/* Ruolo */}
                      <span
                        className="inline-block max-w-full truncate text-[0.5625rem] font-bold px-1.5 py-0.5 rounded-full text-white leading-none"
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

          <tbody>

            {/* ── Schede & Navigazione ── */}
            <SectionHeader title={tv.role_template_section_tabs_nav ?? 'Schede e Navigazione'} />
            {ROLE_TEMPLATE_FEATURE_SECTIONS.find((s) => s.id === 'tabs_nav')?.rows.map(({ key }) => (
              <tr key={key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/10 transition-colors active:bg-white/10">
                <td className="sticky left-0 z-10 px-4 py-2.5">
                  <div className="flex items-center gap-0.5 text-[0.8125rem] text-white/80">
                    {FEATURE_LABELS_TAB_FIRST[key]}
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

            {/* ── Operazioni Turni ── */}
            <SectionHeader title={tv.role_template_section_shift_ops ?? 'Operazioni Turni'} />
            {ROLE_TEMPLATE_FEATURE_SECTIONS.find((s) => s.id === 'shift_ops')?.rows.map(({ key }) => (
              <tr key={key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/10 transition-colors active:bg-white/10">
                <td className="sticky left-0 z-10 px-4 py-2.5">
                  <div className="flex items-center gap-0.5 text-[0.8125rem] text-white/80">
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
            <SectionHeader title={tv.role_template_section_other ?? 'Altro'} />
            {ROLE_TEMPLATE_FEATURE_SECTIONS.find((s) => s.id === 'other')?.rows.map(({ key }) => (
              <tr key={key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/10 transition-colors active:bg-white/10">
                <td className="sticky left-0 z-10 px-4 py-2.5">
                  <div className="flex items-center gap-0.5 text-[0.8125rem] text-white/80">
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
            <tr className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/10 transition-colors active:bg-white/10">
              <td className="sticky left-0 z-10 px-4 py-2.5">
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
            <SectionHeader title={tv.role_templates_operational_heading ?? 'Permessi Operativi'} />
            {permRows.map((perm) => (
              <tr key={perm.key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/10 transition-colors active:bg-white/10">
                <td className="sticky left-0 z-10 px-4 py-2.5">
                  <div className="flex items-center gap-0.5 text-[0.8125rem] text-white/80">
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
                    <div className="text-[0.6875rem] text-white/50 leading-snug mt-0.5 max-w-[13.75rem]">
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
            <SectionHeader title={tv.role_template_section_board_visibility ?? 'Visibilità nel Tabellone Turni'} icon={<Users className="h-3 w-3" />} />
            <tr className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/10 transition-colors active:bg-white/10">
              <td className="sticky left-0 z-10 px-4 py-2.5">
                <div className="flex items-center gap-0.5 text-[0.8125rem] text-white/80">
                  {t.settings_visible_on_schedule_row}
                  <PermInfoButton
                    previewTitle={PERM_PREVIEWS.team_schedule_visible.title}
                    off={PERM_PREVIEWS.team_schedule_visible.off}
                    on={PERM_PREVIEWS.team_schedule_visible.on}
                  />
                </div>
                <div className="text-[0.6875rem] text-white/50 leading-snug mt-0.5">
                  {tv.role_templates_team_visible_desc ?? 'Appare nel tabellone turni e nelle presenze di squadra'}
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

            {/* ── Sezioni interfaccia (visibilità per profilo) ── */}
            <SectionHeader title={tv.role_templates_ui_sections_heading ?? 'Sezioni interfaccia (visibilità)'} />
            {UI_SCREEN_WIDGETS.filter((w) => nonAdminUsers.some((u) => widgetAppliesToUser(w, u.role))).map((w) => (
              <tr key={w.key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/10 transition-colors active:bg-white/10">
                <td className="sticky left-0 z-10 px-4 py-2.5">
                  <div className="text-[0.8125rem] text-white/80">{w.label}</div>
                  <div className="text-[0.6875rem] text-white/50 leading-snug mt-0.5">{w.screenLabel}</div>
                </td>
                {nonAdminUsers.map((u) => (
                  <td key={u.id} className="px-2 py-2.5 text-center">
                    {widgetAppliesToUser(w, u.role) ? (
                      <MatrixToggle
                        enabled={userUiSections[u.id]?.[w.key] !== false}
                        onToggle={() => toggleUiSection(u.id, w.key)}
                      />
                    ) : (
                      <span className="text-[0.6875rem] text-white/25" aria-hidden>—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}

            {/* ── Moduli Scheda Admin (globale) ── */}
            <SectionHeader title={tv.role_templates_admin_modules_heading ?? 'Moduli Scheda Admin (globale)'} />
            {ADMIN_MODULE_KEYS.map((key) => (
              <tr key={key} className="odd:bg-transparent even:bg-white/[0.04] hover:bg-white/10 transition-colors active:bg-white/10">
                <td className="sticky left-0 z-10 px-4 py-2.5 text-[0.8125rem] text-white/85">
                  {getAdminModuleLabel(key, t as Record<string, string>)}
                </td>
                <td colSpan={nonAdminUsers.length} className="px-3 py-2.5">
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-[0.6875rem] text-white/50">{tv.role_templates_global_label ?? 'Globale'}</span>
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

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between bg-white/[0.06] px-4 py-3 gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetMods}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-2.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-white/60 hover:bg-white/10 transition-colors disabled:opacity-50 active:bg-white/10 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          >
            <RotateCcw className="w-3 h-3" />
            {tv.role_templates_reset_modules_btn ?? 'Reset moduli'}
          </button>
          <button
            type="button"
            onClick={() => setConfirmResetOpen(true)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 px-2.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-50 active:bg-red-500/80"
          >
            <RotateCcw className="w-3 h-3" />
            {tv.role_templates_reset_all_btn ?? 'Azzera tutto'}
          </button>
        </div>
        <span
          aria-live="polite"
          className={`text-[0.6875rem] font-semibold uppercase tracking-wider ${
            autosaveState === 'saved' ? 'text-emerald-400' : 'text-white/60'
          }`}
        >
          {autosaveState === 'saving'
            ? (tv.role_templates_autosave_saving ?? 'Salvataggio…')
            : autosaveState === 'saved'
              ? (tv.role_templates_autosave_saved ?? 'Salvato')
              : ''}
        </span>
      </div>
    </div>
  );

  const renderResetConfirm = () => (
    <CenteredModalPortal
      open={confirmResetOpen}
      onClose={() => setConfirmResetOpen(false)}
      ariaLabel={tv.role_templates_reset_confirm_title ?? 'Azzerare tutti i permessi?'}
    >
      <div className="space-y-4 p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
            <RotateCcw className="h-4 w-4 text-red-400" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white/90">
              {tv.role_templates_reset_confirm_title ?? 'Azzerare tutti i permessi?'}
            </p>
            <p className="mt-1 text-xs leading-snug text-white/60">
              {tv.role_templates_reset_confirm_body ?? ''}
            </p>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setConfirmResetOpen(false)}
            className="rounded-xl border border-white/20 px-4 py-2.5 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleResetAll()}
            className="rounded-xl bg-red-500/90 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-500 disabled:opacity-50"
          >
            {t.confirm}
          </button>
        </div>
      </div>
    </CenteredModalPortal>
  );

  if (variant === 'embedded') {
    return (
      <div className="pb-1">
        {/* miniature preview — intentional: text-[8–10px] nelle anteprime compatte / matrix */}
        {renderMobileView()}
        {renderMatrix()}
        {renderResetConfirm()}
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
      {renderResetConfirm()}
    </div>
  );
}
