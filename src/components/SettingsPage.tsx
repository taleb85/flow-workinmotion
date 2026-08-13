import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Pencil, X, Check, Wrench, Unlock, Coffee, Palmtree, Monitor, ShieldAlert, LayoutGrid, Building2, Zap, ChevronDown, MapPin, UserPlus, UserX, UserCheck, LocateFixed, QrCode, UploadCloud, RefreshCw, Mail, Lock, KeyRound, Copy, CalendarDays, BookTemplate, Link2, Bell } from 'lucide-react';
import { database } from '../lib/database';
import { supabase } from '../lib/supabase';
import { PinPadModal } from './ui/PinPadModal';
import { format, parseISO, addDays } from 'date-fns';
import {
  loadPeriodConfig,
  savePeriodConfig as persistPeriodConfig,
  getPeriodEndDate,
  getPeriodStartDate,
  dispatchPeriodConfigUpdated,
  currentPeriodConfig,
  periodConfigFromStartDate,
  type PeriodConfig,
} from '../utils/periodConfig';
import { saveTimesheetPeriodToSupabase } from '../utils/timesheetPeriodSupabase';
import DatePickerField from './DatePickerField';
import { useAppUser, useAppData, useAppConfig, useAppOverlay } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { useTenant } from '../context/TenantContext';
import type { User, UserRole } from '../types';
import { translateRole } from '../utils/roles';
import { getAdminModuleLabel, formatTrans, getFeatureStrings } from '../utils/translations';
import {
  canUserEdit,
  isAdminOnly,
  canViewSuspended,
  isPurelyManagementRole,
  isManagementRole,
  isUserVisibleOnTeamSchedule,
  canManageDelegatedStaff,
  isOperationalStaffRole,
} from '../utils/permissions';
import StaffOperationalPermissionsEditor from './StaffOperationalPermissionsEditor';
import { AdminTimesheetGridPrivacyEditor } from './UserProfile';
import { exportToJSON } from '../utils/exportData';
import { importDataToSupabase, clearAllData } from '../utils/importData';
import EditStaffModal from './EditStaffModal';
import { buildShortInviteLink } from '../config/appPaths';
import CreateStaffModal from './CreateStaffModal';
import { BreakRule, DayOfWeek } from '../utils/breakRules';
import {
  getDepartments,
  addDepartment,
  removeDepartment,
  updateDepartment,
  restoreBuiltinDepartment,
  getHiddenBuiltinValues,
  BUILTIN_DEPARTMENTS,
  DEPARTMENT_COLOR_PRESETS,
} from '../utils/departments';
import { translateDepartmentValue } from '../utils/departmentLabels';
import type { Department, PermissionCategory } from '../utils/departments';
import { FEATURE_DEFINITIONS } from '../utils/featureFlags';
import { TimeInputField } from './ui/TimeInputField';
import { getEnabledFeatures, ADMIN_MODULE_KEYS, getAdminModuleEnabled, isAdminModuleEnabled } from '../utils/enabledFeatures';
import RoleFeatureSectionsBlock, { PERMISSION_SUMMARY_LIST_CLASS } from './RoleFeatureSectionsBlock';
import AdminRow from './ui/AdminRow';
import { SettingsAccordionSection } from './ui/SettingsAccordionSection';
import { CenteredModalPortal } from './ui/CenteredModalPortal';
import { RoleFeatureTemplatesPanel } from './RoleFeatureTemplatesPage';
import ProfileVisibilityHub from './ProfileVisibilityHub';
import ElevatedAccessPanel from './ElevatedAccessPanel';
import type { WorkRules } from '../utils/workRules';
import { getCurrentPositionCoords } from '../utils/geo';
import { resolveEffectiveVerificationToken, generateRandomVerificationToken } from '../utils/presenceVerificationPayload';
import { generatePresenceQrDataUrl, openPresenceQrPrintWindow } from '../utils/qrPresence';
import { buildSignedPresenceQrPayload } from '../utils/presenceProofVerification';

const SETTINGS_TEAM_EXPANDED_KEY = 'osteria_settings_team_expanded';

function _readTeamSectionExpanded(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(SETTINGS_TEAM_EXPANDED_KEY) !== '0';
}

function DepartmentColorPicker({
  value,
  onChange,
  title,
}: {
  value: string;
  onChange: (hex: string) => void;
  title: string;
}) {
  const t = useT();
  const tv = t as Record<string, string>;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      if (modalRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className="relative h-9 w-9 shrink-0 rounded-full border-2 border-white shadow-[0_2px_10px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/90 outline-none transition-transform hover:ring-slate-300 focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2"
        style={{ backgroundColor: value }}
      />
      {open && (
        <CenteredModalPortal
          open
          onClose={() => setOpen(false)}
          panelRef={modalRef}
          backdropAriaLabel={tv.close ?? 'Chiudi'}
          ariaLabel={title}
          maxWidthClass="max-w-sm"
          panelClassName="p-3.5"
        >
          <p className="mb-3 px-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
            {title}
          </p>
          <div className="grid grid-cols-6 gap-2.5">
            {DEPARTMENT_COLOR_PRESETS.map((hex) => {
              const selected = value.toLowerCase() === hex.toLowerCase();
              return (
                <button
                  key={hex}
                  type="button"
                  title={hex}
                  onClick={() => {
                    onChange(hex);
                    setOpen(false);
                  }}
                  className={`h-9 w-9 shrink-0 rounded-full outline-none transition-transform focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-white ${
 selected
 ? 'ring-2 ring-offset-2 ring-accent ring-offset-slate-100 shadow-md'
 : 'ring-2 ring-slate-400/90 ring-offset-1 ring-offset-white shadow-[inset_0_0_0_1px_rgba(15,23,42,0.12)]'
 }`}
                  style={{ backgroundColor: hex }}
                />
              );
            })}
          </div>
        </CenteredModalPortal>
      )}
    </div>
  );
}

/** Card feature flag del Master Control Panel — componente con il proprio stato
 *  (useState non può essere chiamato dentro `.map()`: violerebbe le rules of hooks). */
function FeatureFlagCard({
  feature,
  t,
  enabled,
  isMaintenance,
  onToggle,
}: {
  feature: { slug: string };
  t: Record<string, string>;
  enabled: boolean;
  isMaintenance: boolean;
  onToggle: () => Promise<void>;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { label: featureLabel, description: featureDescription, detailLines } = getFeatureStrings(t, feature.slug);

  const iconMap: Record<string, React.ReactNode> = {
    maintenance_mode: <Wrench className="w-4 h-4" />,
    unlock_with_pin:  <Unlock className="w-4 h-4" />,
    auto_breaks:      <Coffee className="w-4 h-4" />,
    staff_requests:   <Palmtree className="w-4 h-4" />,
    kiosk_active:     <Monitor className="w-4 h-4" />,
    geofence_punch:   <MapPin className="w-4 h-4" />,
    visibility_management: <LayoutGrid className="w-4 h-4" />,
    department_creation: <Building2 className="w-4 h-4" />,
    violation_rules: <ShieldAlert className="w-4 h-4" />,
    master_control_panel: <Zap className="w-4 h-4" />,
  };

  return (
    <div
      className={`rounded-xl border border-neutral-500 flex h-full flex-col p-3.5 transition-colors surface-ghost-interactive hover:border-white/20 md:p-4 active:brightness-95 ${
        isMaintenance && enabled ? 'border-red-500/40 bg-red-500/15' : ''
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isMaintenance && enabled ? 'bg-red-500/20 text-red-400' : 'bg-accent/10 text-accent'
        }`}>
          <span className="w-[18px] h-[18px]">{iconMap[feature.slug]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-sm font-semibold leading-tight ${
                isMaintenance && enabled ? 'text-red-400' : 'text-white/90'
              }`}>{featureLabel}</p>
              <p className="text-[11px] md:text-xs text-white mt-1 leading-snug">{featureDescription}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={featureLabel}
              onClick={onToggle}
              className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/35 focus:ring-offset-2 ${
                isMaintenance ? (enabled ? 'bg-red-500' : '') : (enabled ? 'bg-accent' : '')
              }`}
            >
              <span className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full toggle-knob transition-all duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
          {detailLines.length > 0 && (
            <>
              <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)} className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-white transition-colors">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${detailsOpen ? 'rotate-180' : ''}`} />
                {t.impostazioni_detail_label || 'Dettagli'}
              </button>
              {detailsOpen && (
                <div className="rounded-xl border border-neutral-500 mt-2 bg-white/5 px-2.5 py-2">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60">{t.impostazioni_detail_label || 'Dettagli'}</p>
                  <ul className="list-disc space-y-1 pl-3.5 text-[11px] leading-relaxed text-white/70">
                    {detailLines.map((line, i) => (<li key={i}>{line}</li>))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage({ view }: { view?: 'profili' | 'regole' } = {}) {
  const { users, currentUser, effectiveLanguage, isSessionElevated, updateUser, deleteUser } = useAppUser();
  const { shifts, punchRecords, holidays } = useAppData();
  const {
    featureFlags, setFeatureFlag,
    workRules, setWorkRules,
    breakRules, setBreakRules,
    geofenceEffectiveConfig, presenceVerificationConfig,
    departmentsRevision,
    saveGeofenceConfig,
    savePresenceVerificationConfig,
    pushSettingsToCloud,
    settingsCloudLastSyncedAt,
    settingsCloudPushBusy,
    notifyDepartmentsChanged,
    } = useAppConfig();
    const { showSuccess, showError, hardReloadFromDatabase, dataSyncInProgress } = useAppOverlay();
  const { tenant } = useTenant();
  const t = useT();

  const [pullSyncBusy, setPullSyncBusy] = useState(false);
  const [pushSyncBusy, setPushSyncBusy] = useState(false);
  const [teamNotifyLoading, setTeamNotifyLoading] = useState(false);

  const handleNotifyTeam = useCallback(async () => {
    if (!supabase || !currentUser?.id) { showError?.(t.admin_notify_team_error); return; }
    setTeamNotifyLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('notify-team-next-week-shifts', { body: { operator_user_id: currentUser.id } });
      if (error) { showError?.(error.message || t.admin_notify_team_error); return; }
      if (data && typeof data === 'object' && 'error' in data && data.error) { showError?.(String(data.error)); return; }
      const rec = typeof (data as { recipients?: number }).recipients === 'number' ? (data as { recipients: number }).recipients : 0;
      const sent = typeof (data as { sent?: number }).sent === 'number' ? (data as { sent: number }).sent : 0;
      const ws = String((data as { week_start?: string }).week_start ?? '');
      const we = String((data as { week_end?: string }).week_end ?? '');
      if (rec === 0) { showSuccess?.(t.admin_notify_team_none); }
      else { showSuccess?.(formatTrans(t.admin_notify_team_success, { count: rec, sent, week_start: ws, week_end: we })); }
    } catch { showError?.(t.admin_notify_team_error); }
    finally { setTeamNotifyLoading(false); }
  }, [currentUser?.id, t, showError, showSuccess]);

  type ShiftTemplateMeta = { name: string; count: number; days: number[]; created_at?: string };
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplateMeta[]>([]);
  const [shiftTemplatesLoading, setShiftTemplatesLoading] = useState(false);
  const [shiftTemplateDeleting, setShiftTemplateDeleting] = useState<string | null>(null);

  const loadShiftTemplates = useCallback(async () => {
    setShiftTemplatesLoading(true);
    try {
      const tenantId = (currentUser as { tenant_id?: string } | null)?.tenant_id ?? undefined;
      const list = await database.shiftTemplates.listAllWithMeta(tenantId);
      setShiftTemplates(list);
    } catch {
      // ignora errori silenziosamente
    } finally {
      setShiftTemplatesLoading(false);
    }
  }, [currentUser]);

  const handleDeleteShiftTemplate = useCallback(async (name: string) => {
    if (!window.confirm(`Eliminare il template "${name}"? Questa azione non è reversibile.`)) return;
    setShiftTemplateDeleting(name);
    try {
      await database.shiftTemplates.delete(name);
      setShiftTemplates(prev => prev.filter(t => t.name !== name));
      showSuccess?.(`Template "${name}" eliminato`);
    } catch {
      showError?.('Errore durante l\'eliminazione del template');
    } finally {
      setShiftTemplateDeleting(null);
    }
  }, [showSuccess, showError]);

  const handlePullSync = async () => {
    if (pullSyncBusy || dataSyncInProgress) return;
    setPullSyncBusy(true);
    try {
      await hardReloadFromDatabase();
    } finally {
      setPullSyncBusy(false);
    }
  };

  const handlePushSync = async () => {
    if (pushSyncBusy || settingsCloudPushBusy || dataSyncInProgress) return;
    setPushSyncBusy(true);
    try {
      await pushSettingsToCloud();
      // Hard reload locale per allineare lo stato dopo il push
      await hardReloadFromDatabase();
    } finally {
      setPushSyncBusy(false);
    }
  };

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [expandedPermsUserId, setExpandedPermsUserId] = useState<string | null>(null);
  const [expandedVisibilityUserId, setExpandedVisibilityUserId] = useState<string | null>(null);
  const [shareMenuUserId, setShareMenuUserId] = useState<string | null>(null);
  const [showSuspended, setShowSuspended] = useState(false);
  const [deleteConfirmUserId, setDeleteConfirmUserId] = useState<string | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [teamSectionExpanded, setTeamSectionExpanded] = useState(false);
  const [cloudHintExpanded, setCloudHintExpanded] = useState(false);
  const [dataToolsLocked, setDataToolsLocked] = useState(true);
  const [showDataToolsPinPad, setShowDataToolsPinPad] = useState(false);
  const [dataToolsPin, setDataToolsPin] = useState('');
  const [dataToolsPinError, setDataToolsPinError] = useState('');
  const [geoLat, setGeoLat] = useState('');
  const [geoLng, setGeoLng] = useState('');
  const [geoRadius, setGeoRadius] = useState('120');
  const [geoSaving, setGeoSaving] = useState(false);
  const [geoAcquiring, setGeoAcquiring] = useState(false);
  const [presenceQrBusy, setPresenceQrBusy] = useState(false);

  // ── Email richieste ferie ─────────────────────────────────────────────────
  const HOLIDAY_EMAIL_KEY = 'osteria_holiday_request_email';
  const [holidayEmail, setHolidayEmail] = useState<string>(() => {
    try { return localStorage.getItem(HOLIDAY_EMAIL_KEY) ?? ''; } catch { return ''; }
  });
  const [holidayEmailDraft, setHolidayEmailDraft] = useState<string>(holidayEmail);
  const [holidayEmailSaved, setHolidayEmailSaved] = useState(false);

  const saveHolidayEmail = () => {
    try {
      localStorage.setItem(HOLIDAY_EMAIL_KEY, holidayEmailDraft.trim());
      setHolidayEmail(holidayEmailDraft.trim());
      setHolidayEmailSaved(true);
      setTimeout(() => setHolidayEmailSaved(false), 2000);
    } catch { /* ignore */ }
  };

  // ── Periodo Presenze ──────────────────────────────────────────────────────
  const [periodCfg, setPeriodCfg] = useState<PeriodConfig>(() => loadPeriodConfig());
  const [periodDraftStart, setPeriodDraftStart] = useState<string>(periodCfg.startDate);
  const [periodDraftWeeks, setPeriodDraftWeeks] = useState<4 | 5>(periodCfg.numWeeks);
  const [periodDraftDirty, setPeriodDraftDirty] = useState(false);
  const [periodSavingCloud, setPeriodSavingCloud] = useState(false);
  /** Regola di calcolo periodo: 'last_sunday' = ultima domenica del mese (auto); 'fixed_start' = primo giorno manuale */
  const [periodRuleMode, setPeriodRuleMode] = useState<'last_sunday' | 'fixed_start'>(() => {
    try { return (localStorage.getItem('osteria_period_rule') as 'last_sunday' | 'fixed_start') ?? 'last_sunday'; }
    catch { return 'last_sunday'; }
  });

  /** Aggiorna solo il draft (navigazione rapida) — NON salva. */
  const setDraftFromConfig = (cfg: PeriodConfig) => {
    setPeriodDraftStart(cfg.startDate);
    setPeriodDraftWeeks(cfg.numWeeks);
    setPeriodDraftDirty(true);
  };

  const applyPeriod = (cfg: PeriodConfig, rule?: 'last_sunday' | 'fixed_start') => {
    const ruleToSave = rule ?? periodRuleMode;
    try { localStorage.setItem('osteria_period_rule', ruleToSave); } catch { /* ignore */ }
    setPeriodRuleMode(ruleToSave);
    persistPeriodConfig(cfg);
    setPeriodCfg(cfg);
    setPeriodDraftStart(cfg.startDate);
    setPeriodDraftWeeks(cfg.numWeeks);
    setPeriodDraftDirty(false);
    dispatchPeriodConfigUpdated();
    setPeriodSavingCloud(true);
    void saveTimesheetPeriodToSupabase(cfg).finally(() => setPeriodSavingCloud(false));
    showSuccess?.(t.ts_period_saved);
  };

  useEffect(() => {
    if (geofenceEffectiveConfig) {
      setGeoLat(String(geofenceEffectiveConfig.lat));
      setGeoLng(String(geofenceEffectiveConfig.lng));
      setGeoRadius(String(geofenceEffectiveConfig.radiusM));
    }
  }, [geofenceEffectiveConfig]);
  const [editingBreakRule, setEditingBreakRule] = useState<BreakRule | null>(null);
  const [creatingBreakRule, setCreatingBreakRule] = useState(false);
  const [departments, setDepts] = useState<Department[]>(() => getDepartments());
  const [hiddenBuiltins, setHiddenBuiltins] = useState<string[]>(() => getHiddenBuiltinValues());
  useEffect(() => {
    setDepts(getDepartments());
    setHiddenBuiltins(getHiddenBuiltinValues());
  }, [departmentsRevision]);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptColor, setNewDeptColor] = useState('var(--brand)');
  const [editingDeptValue, setEditingDeptValue] = useState<string | null>(null);
  const [editDeptLabel, setEditDeptLabel] = useState('');
  const [editDeptColor, setEditDeptColor] = useState('var(--brand)');
  const [newDeptPermissionCategory, setNewDeptPermissionCategory] = useState<PermissionCategory | ''>('sala');
  const [editDeptPermissionCategory, setEditDeptPermissionCategory] = useState<PermissionCategory | ''>('');
  const [deletingDept, setDeletingDept] = useState<Department | null>(null);
  const [reassignMap, setReassignMap] = useState<Record<string, string>>({});
  const [isDeleting, setIsDeleting] = useState(false);
  const builtinValues = new Set(BUILTIN_DEPARTMENTS.map((d) => d.value));

  const deptPermissionCategorySelectClass =
    'w-full min-w-[10rem] max-w-[16rem] rounded-xl border border-neutral-500 bg-white/10 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

  const updateWorkRule = useCallback(<K extends keyof WorkRules>(key: K, value: WorkRules[K]) => {
    const next = { ...workRules, [key]: value };
    setWorkRules(next);
    showSuccess?.(t.settings_work_rule_synced);
  }, [workRules, setWorkRules, showSuccess, t.settings_work_rule_synced]);

  const handleSaveBreakRule = useCallback((rule: BreakRule) => {
    const exists = breakRules.some((r) => r.id === rule.id);
    const next = exists ? breakRules.map((r) => r.id === rule.id ? rule : r) : [...breakRules, rule];
    setBreakRules(next);
    setEditingBreakRule(null);
    setCreatingBreakRule(false);
  }, [breakRules, setBreakRules]);

  const handleDeleteBreakRule = useCallback((id: string) => {
    if (!window.confirm(t.settings_delete_break_rule_confirm)) return;
    setBreakRules(breakRules.filter((r) => r.id !== id));
  }, [breakRules, setBreakRules, t.settings_delete_break_rule_confirm]);

  useEffect(() => {
    if (!currentUser || !isManagementRole((currentUser as { role?: string }).role as UserRole)) return;
    loadShiftTemplates();
  }, [currentUser, loadShiftTemplates]);

  const toggleTeamSectionExpanded = useCallback(() => {
    setTeamSectionExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SETTINGS_TEAM_EXPANDED_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  if (!currentUser) return null;

  // Tratta l'utente come admin se è in sessione elevata o ha elevated_role
  const adminOnly = isAdminOnly(currentUser) || isSessionElevated || !!currentUser.elevated_role;
  const canEdit = canUserEdit(currentUser) || adminOnly;
  const canSeeSuspended = canViewSuspended(currentUser) || adminOnly;
  const isManager = isManagementRole(currentUser.role);

  const handleToggleStatus = (user: User) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    updateUser(user.id, { status: newStatus });
  };

  const displayUsers = users
    .filter((u) => {
      // Admin = profilo impostazioni puro: mai visibile nella lista team/dipendenti
      if (isPurelyManagementRole(u.role)) return false;
      if (u.status === 'active') return true;
      return showSuspended && canSeeSuspended && (u.status === 'suspended' || u.status === 'inactive');
    })
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const handleImportClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file?.type === 'application/json') {
        setImportFile(file);
        setShowImportConfirm(true);
      } else {
        setImportStatus({ type: 'error', message: t.select_valid_json });
        setTimeout(() => setImportStatus(null), 3000);
      }
    };
    input.click();
  };

  const handleConfirmImport = async () => {
    if (!importFile) return;
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      if (!data.users || !Array.isArray(data.users)) throw new Error(t.settings_import_invalid_format);
      setShowImportConfirm(false);
      await clearAllData();
      await importDataToSupabase({
        users: data.users,
        shifts: data.shifts || [],
        holidays: data.holidays || [],
        punchRecords: data.punchRecords || [],
      });
      setImportStatus({ type: 'success', message: t.data_restored });
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setImportStatus({ type: 'error', message: t.import_error });
      setShowImportConfirm(false);
      setTimeout(() => setImportStatus(null), 3000);
    }
  };

  if (!isManager) {
    return (
      <div className="pb-content pt-6 w-full app-horizontal-pad font-sans">
        <p className="text-sm text-white/70">{t.no_access_settings}</p>
      </div>
    );
  }

  const staffDelegationMode = canManageDelegatedStaff(currentUser) && !adminOnly;

  if (staffDelegationMode) {
    const displayUsersDelegated = users
      .filter((u) => {
        if (!isOperationalStaffRole(u.role)) return false;
        if (u.status === 'active') return true;
        return showSuspended && (u.status === 'suspended' || u.status === 'inactive');
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const handleDelegateSuspend = (user: User) => {
      const name = `${user.first_name} ${user.last_name ?? ''}`.trim() || user.email;
      if (!window.confirm(formatTrans(t.settings_delegated_suspend_confirm, { name }))) return;
      void updateUser(user.id, { status: 'suspended' });
      showSuccess?.(t.settings_delegated_suspended_toast);
    };

    const handleDelegateReactivate = (user: User) => {
      const name = `${user.first_name} ${user.last_name ?? ''}`.trim() || user.email;
      if (!window.confirm(formatTrans(t.settings_delegated_reactivate_confirm, { name }))) return;
      void updateUser(user.id, { status: 'active' });
      showSuccess?.(t.settings_delegated_reactivated_toast);
    };

    return (
      <div className="pb-content pt-6 w-full app-horizontal-pad font-sans">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <p className="mb-4 text-sm leading-relaxed text-white/70">
            {t.settings_delegated_intro}
          </p>
          <section className="mb-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/80">
                {t.settings_team_section_title}
              </h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSuspended(!showSuspended)}
                  className="rounded-xl border border-white/30 px-2 py-1 text-xs uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 hover:text-white active:text-white"
                >
                  {showSuspended ? t.hide_suspended : t.show_suspended}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateStaff(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/30 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 active:bg-white/5/80"
                >
                  <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t.admin_add_employee}
                </button>
              </div>
            </div>
            <div
              className="divide-y divide-white/10 overflow-hidden rounded-xl"
              style={
                { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }
              }
            >
              {displayUsersDelegated.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-white/55">
                  {t.settings_delegated_empty_list}
                </p>
              ) : (
                displayUsersDelegated.map((user) => {
                  const isActiveRow = user.status === 'active';
                  return (
                    <div
                      key={user.id}
                      className={`flex flex-wrap items-center justify-between gap-2 px-3 py-3 md:px-4 ${!isActiveRow ? 'opacity-70' : ''}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold uppercase text-white" title={user.first_name}>{user.first_name} {user.last_name ?? ''}
                        </p>
                        <p className="text-[11px] uppercase tracking-wider text-white/55">
                          {translateRole(user.role, currentUser.language)}
                          {!isActiveRow && (
                            <span className="ml-1.5 font-semibold text-amber-400">
                              ·{' '}
                              {user.status === 'suspended'
                                ? t.status_suspended
                                : t.status_inactive}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          title={(t as { copy_access_link?: string }).copy_access_link ?? 'Copia link accesso'}
                          onClick={async () => {
                            const link = buildShortInviteLink(user, users);
                            try {
                              await navigator.clipboard.writeText(link);
                              showSuccess?.((t as { admin_employee_access_link_copied?: string }).admin_employee_access_link_copied ?? 'Link copiato.');
                            } catch {
                              showError?.((t as { copy_failed?: string }).copy_failed ?? 'Copia non riuscita.');
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-500 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 active:bg-white/5/80"
                        >
                          <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Link accesso
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingUser(user)}
                          className="rounded-lg border border-neutral-500 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 active:bg-white/5/80"
                        >
                          {t.settings_delegated_view_profile}
                        </button>
                        {isActiveRow ? (
                          <button
                            type="button"
                            onClick={() => handleDelegateSuspend(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/15 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-red-400 transition-colors hover:bg-red-500/150/25 active:bg-red-500/150/80"
                          >
                            <UserX className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            {t.settings_delegated_suspend}
                          </button>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {deleteConfirmUserId === user.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmUserId(null)}
                                  className="rounded-lg border border-neutral-500 px-2 py-1 text-[11px] font-semibold text-white/55 hover:bg-white/10 active:bg-white/80"
                                >
                                  {t.cancel ?? 'Annulla'}
                                </button>
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    setDeleteConfirmUserId(null);
                                    await deleteUser(user.id);
                                    showSuccess?.(t.settings_delete_user_success);
                                  }}
                                  className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-700 active:bg-red-700/80"
                                >
                                  {t.settings_delete_user_title ?? 'Elimina'}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmUserId(user.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15 text-red-400 transition-colors hover:bg-red-500/150/25 active:bg-red-500/150/80"
                                title={t.settings_delete_user_title}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelegateReactivate(user)}
                              className="inline-flex items-center gap-1 rounded-lg border border-accent/35 bg-accent/10 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent transition-colors hover:bg-accent/15 active:bg-accent/80"
                            >
                              <UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                              {t.settings_delegated_reactivate}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </motion.div>

        {showCreateStaff && (
          <CreateStaffModal
            isOpen
            operationalRolesOnly
            onClose={() => setShowCreateStaff(false)}
          />
        )}
        {editingUser && (
          <EditStaffModal
            isOpen
            readOnly
            user={users.find((u) => u.id === editingUser.id) ?? editingUser}
            onClose={() => setEditingUser(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="pb-content pt-6 w-full app-horizontal-pad font-sans">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <AnimatePresence>
          {importStatus && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mb-4 rounded-xl border p-4 ${
 importStatus.type === 'success'
 ? 'border-accent/40 bg-accent/10 text-accent'
 : 'border-red-500/30 bg-red-500/15 text-red-400'
 }`}
            >
              {importStatus.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SEZIONE: Gestione Profili ── */}
        <div style={view === 'regole' ? { display: 'none' } : undefined}>
        <section className="mb-6">
          <div className="mb-3">
            <div className="flex w-full flex-row items-stretch gap-1.5 md:gap-2 mb-2">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowCreateStaff(true)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/30 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 active:bg-white/5/80"
                >
                  <UserPlus className="w-3.5 h-3.5" aria-hidden />
                  {t.admin_add_employee}
                </button>
              )}
              {canSeeSuspended && (
                <button
                  type="button"
                  onClick={() => setShowSuspended(!showSuspended)}
                  className="flex-1 rounded-xl border border-white/30 px-2 py-1 text-xs uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 hover:text-white active:text-white"
                >
                  {showSuspended ? t.hide_suspended : t.show_suspended}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={toggleTeamSectionExpanded}
              className="-ml-1 flex w-full items-center gap-2 rounded-xl border border-white/30 py-1.5 pl-1 pr-2 text-left transition-colors hover:bg-white/8 active:bg-white/8/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
              aria-expanded={teamSectionExpanded}
            >
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${teamSectionExpanded ? 'rotate-180' : ''}`}
                aria-hidden
              />
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-white/80">
                {t.settings_team_section_title}
              </h2>
            </button>
          </div>

          <AnimatePresence initial={false}>
            {teamSectionExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div
                  className="divide-y divide-white/10 overflow-hidden rounded-xl"
                  style={
                    { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }
                  }
                >
              {displayUsers.map((user) => {
                const isPermsOpen = expandedPermsUserId === user.id;
                return (
                  <div key={user.id} className={user.status !== 'active' ? 'opacity-60' : ''}>
                    {/* ── User row ── */}
                    <div className="flex items-center justify-between px-3 md:px-4 py-2.5 gap-2">
                      <button
                        type="button"
                        onClick={() => canEdit && setEditingUser(user)}
                        className={`flex-1 min-w-0 text-left ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <span className="block truncate text-sm font-semibold uppercase text-white" title={user.first_name ?? ''}>{user.first_name ?? ''} {user.last_name ?? ''}
                        </span>
                        <span className="text-white/55 text-[11px] uppercase tracking-wider">
                          {translateRole(user.role, currentUser.language)}
                          {!isPurelyManagementRole(user.role) && user.status === 'active' && !isUserVisibleOnTeamSchedule(user) && (
                            <span className="ml-1.5 text-amber-600 font-semibold normal-case">
                              · {t.settings_off_schedule_badge}
                            </span>
                          )}
                        </span>
                      </button>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Bottone condivisione unico con dropdown — nascosto */}
                        {/* eslint-disable-next-line no-constant-binary-expression */}
                        {false && canEdit && !isPurelyManagementRole(user.role) && (
                          <div className="relative">
                            <button
                              type="button"
                              title="Condividi accesso"
                              onClick={(e) => {
                                e.stopPropagation();
                                setShareMenuUserId(shareMenuUserId === user.id ? null : user.id);
                              }}
                              className={`p-1.5 rounded-md border transition-colors ${shareMenuUserId === user.id ? 'text-accent border-accent/30 bg-accent/5' : 'text-white/40 border-neutral-500 hover:text-accent hover:border-accent/30 hover:bg-accent/5'} active:text-accent`}
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </button>

                            <AnimatePresence>
                              {shareMenuUserId === user.id && (
                                <>
                                  {/* backdrop invisibile per chiudere */}
                                  <div
                                    className="fixed inset-0 z-[60]"
                                    onClick={(e) => { e.stopPropagation(); setShareMenuUserId(null); }}
                                  />
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.92, y: -4 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.92, y: -4 }}
                                    transition={{ duration: 0.13 }}
                                    className="absolute right-0 top-full mt-1.5 z-[61] w-52 rounded-xl border border-neutral-500 bg-white/10 shadow-lg overflow-hidden"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {/* Copia link accesso */}
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        const link = buildShortInviteLink(user, users);
                                        try {
                                          await navigator.clipboard.writeText(link);
                                          showSuccess?.(t.admin_employee_access_link_copied ?? 'Link copiato');
                                        } catch {
                                          showError?.(t.copy_failed ?? 'Copia non riuscita');
                                        }
                                        setShareMenuUserId(null);
                                      }}
                                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12px] font-medium text-white/80 hover:bg-white/5 transition-colors active:bg-white/5/80"
                                    >
                                      <Link2 className="w-3.5 h-3.5 shrink-0 text-white/40" />
                                      Copia link accesso
                                    </button>
                                    <div className="h-px bg-white/10" />
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </div>
                        )}

                        {/* Cosa vede */}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedVisibilityUserId(expandedVisibilityUserId === user.id ? null : user.id);
                              setExpandedPermsUserId(null);
                            }}
                            className={`px-2 py-1 text-[11px] font-bold uppercase rounded-md transition-colors border ${expandedVisibilityUserId === user.id ? 'bg-white/15 text-accent border-accent/30 shadow-sm' : 'text-white/55 border-transparent hover:text-white/80'} active:text-white/80'}`}
                          >
                            {t.what_sees}
                          </button>
                        )}


                        {/* Active toggle */}
                        {canEdit && (
                          <div className="flex items-center gap-1.5">
                            {user.status !== 'active' && (
                              deleteConfirmUserId === user.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmUserId(null)}
                                    className="rounded-lg border border-neutral-500 px-2 py-1 text-[11px] font-semibold text-white/55 hover:bg-white/10 active:bg-white/80"
                                  >
                                    {t.cancel ?? 'Annulla'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setDeleteConfirmUserId(null);
                                      await deleteUser(user.id);
                                      showSuccess?.(t.settings_delete_user_success);
                                    }}
                                    className="rounded-lg bg-red-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-700 active:bg-red-700/80"
                                  >
                                    {t.settings_delete_user_title ?? 'Elimina'}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmUserId(user.id)}
                                  className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/15 text-red-400 transition-colors hover:bg-red-500/150/25 active:bg-red-500/150/80"
                                  title={t.settings_delete_user_title}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )
                            )}
                            <button
                              type="button"
                              role="switch"
                              aria-checked={user.status === 'active'}
                              onClick={() => handleToggleStatus(user)}
                              className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 ${
 user.status === 'active' ? 'bg-accent' : ''
 }`}
                            >
                              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full toggle-knob transition-all duration-200 ease-in-out ${user.status === 'active' ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Permissions / Visibility panel */}
                    <AnimatePresence>
                      {(isPermsOpen || expandedVisibilityUserId === user.id) && canEdit && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="border-t border-white/10 px-4 py-4 space-y-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
                            {expandedVisibilityUserId === user.id && (
                              <ProfileVisibilityHub 
                                initialSelectedUserId={user.id} 
                                onClose={() => setExpandedVisibilityUserId(null)} 
                              />
                            )}
                            
                            {isPermsOpen && (
                              <>
                                {/* Matrice permessi: solo lettura (definita dal ruolo) */}
                            {!isPurelyManagementRole(user.role) && (
                              <div className="space-y-4">
                                <p className="text-[11px] text-white/55 leading-snug">
                                  {formatTrans(t.settings_perms_effective_intro, {
                                    name: user.first_name ?? '',
                                    role: translateRole(user.role, currentUser.language),
                                  })}
                                </p>
                                <div>
                                  <p className="ui-section-title mb-2">
                                    {formatTrans(t.settings_perms_tab_heading, { name: user.first_name ?? '' })}
                                  </p>
                                  <RoleFeatureSectionsBlock
                                    mode="badges"
                                    features={getEnabledFeatures(user)}
                                    language={effectiveLanguage}
                                  />
                                  <div className={`mt-3 ${PERMISSION_SUMMARY_LIST_CLASS}`}>
                                    <AdminRow
                                      className="!py-2.5 !px-4"
                                      label={
                                        <span
                                          className={
                                            isUserVisibleOnTeamSchedule(user)
                                              ? 'text-white'
                                              : 'text-white/70'
                                          }
                                        >
                                          {t.settings_visible_on_schedule_row}
                                        </span>
                                      }
                                      action={
                                        <span
                                          className={`shrink-0 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
 isUserVisibleOnTeamSchedule(user) ? 'bg-accent text-white shadow-sm' : 'bg-white/10 text-white/55'
 }`}
                                        >
                                          {isUserVisibleOnTeamSchedule(user) ? t.role_template_yes : t.role_template_no}
                                        </span>
                                      }
                                    />
                                  </div>
                                  <p className="text-[11px] text-white/60 mt-2 leading-snug">
                                    Template + pulsante Griglia in riga (override solo visibilità tabellone).
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Moduli scheda Impostazioni: globali, solo Admin modifica (Permessi ruoli) */}
                            {isManagementRole(user.role) && (
                              <div>
                                <p className="text-[11px] font-bold text-white/60 uppercase tracking-widest mb-2">
                                  {formatTrans(t.settings_admin_settings_modules_heading, { name: user.first_name ?? '' })}
                                </p>
                                <p className="text-[11px] text-white/55 mb-2">
                                  {t.settings_admin_settings_modules_body}
                                </p>
                                <div className={PERMISSION_SUMMARY_LIST_CLASS}>
                                  {ADMIN_MODULE_KEYS.map((key) => {
                                    const adminMods = getAdminModuleEnabled(user);
                                    const enabled = adminMods[key] === true;
                                    return (
                                      <AdminRow
                                        key={key}
                                        className="!py-2.5 !px-4"
                                        label={
                                          <span className={enabled ? 'text-white' : 'text-white/55'}>
                                            {getAdminModuleLabel(key, t as Record<string, string>)}
                                          </span>
                                        }
                                        action={
                                          <span
                                            className={`shrink-0 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
 enabled
 ? 'bg-accent text-white shadow-sm'
 : 'bg-white/10 text-white/55'
 }`}
                                        >
                                          {enabled ? t.role_template_yes : t.role_template_no}
                                          </span>
                                        }
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {adminOnly && (
                              <AdminTimesheetGridPrivacyEditor
                                user={users.find((u) => u.id === user.id) ?? user}
                              />
                            )}

                            {isPurelyManagementRole(user.role) ? (
                              <div className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3">
                                <p className="text-sm font-bold text-white">{t.settings_admin_perm_title}</p>
                                <p className="mt-1.5 text-[11px] leading-relaxed text-white/70">
                                  {t.settings_admin_perm_readonly_body}
                                </p>
                              </div>
                            ) : (
                                  <StaffOperationalPermissionsEditor user={user} currentUser={currentUser} />
                                )}
                              </>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Permessi per Ruolo — matrice (solo admin/elevati) */}
        {adminOnly && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_role_permissions"
            title={t.settings_role_permissions_title ?? 'Permessi per Ruolo'}
            subtitle={t.settings_role_permissions_subtitle ?? 'Configura le funzionalità accessibili per Manager, Capo e Staff'}
            defaultOpen={false}
            accentBorder="rgba(255,255,255,0.35)"
          >
            <RoleFeatureTemplatesPanel variant="embedded" />
          </SettingsAccordionSection>
        )}

        </div>{/* fine sezione Gestione Profili */}

        {/* ── SEZIONE: Gestione Regole ── */}
        <div style={view === 'profili' ? { display: 'none' } : undefined}>

        {/* Notifica team */}
        {adminOnly && (
          <div className="rounded-xl border border-neutral-500 p-4 mb-6">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="text-md font-bold flex items-center gap-2">
                <Bell className="w-4 h-4 text-accent" />
                {t.admin_notify_team_title}
              </h2>
              <button
                type="button"
                disabled={teamNotifyLoading}
                onClick={() => void handleNotifyTeam()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/12 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                <Bell className="w-3.5 h-3.5 opacity-80" />
                {teamNotifyLoading ? '…' : t.admin_notify_team_button}
              </button>
            </div>
            <p className="text-[11px] md:text-xs text-white/70 leading-relaxed">
              {t.admin_notify_team_desc}
            </p>
          </div>
        )}

        {/* Reparti (se abilitata in Impostazioni e profilo ha permesso) */}
        {(isAdminModuleEnabled(currentUser, 'department_creation') || adminOnly) && (featureFlags.department_creation ?? true) && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_departments"
            title={t.settings_departments_section_title}
            defaultOpen={false}
          >
            <div className="p-4 rounded-xl space-y-4 border border-neutral-500" style={{ background: 'transparent' }}>
              <p className="text-[11px] text-white/55 leading-snug">{t.settings_departments_cloud_hint}</p>
              {/* Lista reparti */}
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => {
                  const isBuiltin = builtinValues.has(d.value);
                  const badgeColor = d.color ?? 'var(--brand)';
                  const isEditingChip = editingDeptValue === d.value;
                  return (
                    <div
                      key={d.value}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold uppercase text-white transition-shadow ${
 isEditingChip
 ? 'shadow-md ring-2 ring-white/90 ring-offset-2 ring-offset-slate-100'
 : ''
 }`}
                      style={{ backgroundColor: badgeColor }}
                    >
                      <span className="truncate max-w-[10rem]" title={translateDepartmentValue(d.value, effectiveLanguage)}>{translateDepartmentValue(d.value, effectiveLanguage)}
                      </span>
                      {!isBuiltin && d.permissionCategory && (
                        <span
                          className="text-[11px] font-semibold normal-case opacity-90 border-l border-white/35 pl-1.5 shrink-0 max-w-[5.5rem] truncate"
                          title={t.settings_dept_permission_group}
                        >
                          {d.permissionCategory === 'sala_bar'
                            ? t.department_sala_bar
                            : d.permissionCategory === 'sala'
                              ? t.department_sala
                              : d.permissionCategory === 'kitchen'
                                ? t.department_kitchen
                                : t.department_bar}
                        </span>
                      )}
                      {isBuiltin && d.permissionCategory && (
                        <span
                          className="text-[11px] font-semibold normal-case opacity-90 border-l border-white/35 pl-1.5 shrink-0 max-w-[5.5rem] truncate"
                          title={t.settings_dept_permission_group}
                        >
                          {d.permissionCategory === 'sala_bar'
                            ? t.department_sala_bar
                            : d.permissionCategory === 'sala'
                              ? t.department_sala
                              : d.permissionCategory === 'kitchen'
                                ? t.department_kitchen
                                : t.department_bar}
                        </span>
                      )}
                      <button
                        type="button"
                        title={t.settings_dept_edit_title}
                        aria-label={t.settings_dept_edit_title}
                        onClick={() => {
                          setEditingDeptValue(d.value);
                          setEditDeptLabel(d.label);
                          setEditDeptColor(d.color ?? 'var(--brand)');
                          setEditDeptPermissionCategory(d.permissionCategory ?? '');
                        }}
                        className="text-white/75 hover:text-white transition-colors shrink-0 active:text-white"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        title={t.settings_dept_delete_title}
                        onClick={() => {
                          if (editingDeptValue === d.value) setEditingDeptValue(null);
                          const affected = users.filter(u => u.department === d.value);
                          const initMap: Record<string, string> = {};
                          affected.forEach(u => { initMap[u.id] = ''; });
                          setReassignMap(initMap);
                          setDeletingDept(d);
                        }}
                        className="text-white/70 hover:text-white transition-colors shrink-0 active:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Reparti built-in nascosti — pulsante ripristino */}
              {hiddenBuiltins.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-3 group/missing">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                    Nascosti
                  </span>
                  {hiddenBuiltins.map((v) => {
                    const builtin = BUILTIN_DEPARTMENTS.find((b) => b.value === v);
                    if (!builtin) return null;
                    return (
                      <button
                        key={v}
                        type="button"
                        title="Ripristina reparto"
                        onClick={() => {
                          const next = restoreBuiltinDepartment(v);
                          setDepts(next);
                          setHiddenBuiltins(getHiddenBuiltinValues());
                          void notifyDepartmentsChanged();
                        }}
                        className="flex items-center gap-1.5 rounded-xl border border-dashed border-white/20 px-3 py-1.5 text-xs font-semibold text-white/55 transition-colors opacity-0 group-hover/missing:opacity-100 hover:bg-white/10 hover:border-accent/50 hover:text-accent active:text-accent"
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: builtin.color }}
                        />
                        {builtin.label}
                      </button>
                    );
                  })}
                </div>
              )}

              <AnimatePresence>
                {editingDeptValue && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 rounded-xl border border-accent/25 bg-white/8 p-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-white/55">
                        {t.settings_dept_edit_title}
                      </p>
                      {builtinValues.has(editingDeptValue) && (
                        <p className="text-[11px] text-white/55 leading-snug">{t.settings_dept_builtin_edit_hint}</p>
                      )}
                      <div className="flex flex-col gap-3 md:flex-row md:items-end md:flex-wrap">
                        <DepartmentColorPicker
                          value={editDeptColor}
                          onChange={setEditDeptColor}
                          title={t.settings_dept_color_title}
                        />
                        <input
                          type="text"
                          value={editDeptLabel}
                          onChange={(e) => setEditDeptLabel(e.target.value)}
                          placeholder={t.settings_dept_label_placeholder}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editDeptLabel.trim() && editingDeptValue) {
                              const _isBuiltinEdit = builtinValues.has(editingDeptValue);
                              setDepts(
                                updateDepartment(editingDeptValue, {
                                  label: editDeptLabel.trim(),
                                  color: editDeptColor,
                                  permissionCategory: editDeptPermissionCategory,
                                })
                              );
                              showSuccess?.(t.settings_dept_saved);
                              setEditingDeptValue(null);
                              void notifyDepartmentsChanged();
                            }
                          }}
                          className="min-w-0 flex-1 rounded-xl border border-neutral-500 px-3 py-2 text-base text-white focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 md:min-w-[12rem]"
                        />
                        {!builtinValues.has(editingDeptValue) && (
                          <div>
                            <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1">
                              {t.settings_dept_permission_group}
                            </label>
                            <select
                              value={editDeptPermissionCategory}
                              onChange={(e) => setEditDeptPermissionCategory(e.target.value as PermissionCategory | '')}
                              className={deptPermissionCategorySelectClass}
                            >
                              <option value="">{t.settings_dept_permission_only}</option>
                              <option value="sala_bar">{t.department_sala_bar}</option>
                              <option value="sala">{t.department_sala}</option>
                              <option value="bar">{t.department_bar}</option>
                              <option value="kitchen">{t.department_kitchen}</option>
                            </select>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 md:ml-auto">
                          <button
                            type="button"
                            disabled={!editDeptLabel.trim()}
                            onClick={() => {
                              if (!editingDeptValue || !editDeptLabel.trim()) return;
                              const _isBuiltinEdit = builtinValues.has(editingDeptValue);
                              setDepts(
                                updateDepartment(editingDeptValue, {
                                  label: editDeptLabel.trim(),
                                  color: editDeptColor,
                                  permissionCategory: editDeptPermissionCategory,
                                })
                              );
                              showSuccess?.(t.settings_dept_saved);
                              setEditingDeptValue(null);
                              void notifyDepartmentsChanged();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-40 active:bg-accent-hover/80"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {t.save}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDeptValue(null)}
                            className="rounded-xl border border-neutral-500 px-3 py-2 text-xs font-semibold text-white/70 surface-ghost-interactive"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </div>
                      {!builtinValues.has(editingDeptValue) && (
                        <p className="text-[11px] text-white/55 leading-snug">{t.settings_dept_permission_group_hint}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Aggiunta nuovo reparto */}
              <div className="space-y-3 border-t border-white/10 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <DepartmentColorPicker
                    value={newDeptColor}
                    onChange={setNewDeptColor}
                    title={t.settings_dept_color_title}
                  />
                  <input
                    type="text"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newDeptName.trim()) {
                        setDepts(
                          addDepartment(newDeptName, newDeptColor, newDeptPermissionCategory || undefined)
                        );
                        setNewDeptName('');
                        setNewDeptColor('var(--brand)');
                        setNewDeptPermissionCategory('sala');
                        void notifyDepartmentsChanged();
                      }
                    }}
                    placeholder={t.settings_new_dept_placeholder}
                    className="min-w-[8rem] flex-1 px-3 py-2 rounded-xl border border-neutral-500 bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                  <button
                    type="button"
                    disabled={!newDeptName.trim()}
                    onClick={() => {
                      if (newDeptName.trim()) {
                        setDepts(
                          addDepartment(newDeptName, newDeptColor, newDeptPermissionCategory || undefined)
                        );
                        setNewDeptName('');
                        setNewDeptColor('var(--brand)');
                        setNewDeptPermissionCategory('sala');
                        void notifyDepartmentsChanged();
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40 active:bg-accent-hover/80"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t.settings_add_dept}
                  </button>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
                  <div className="shrink-0 md:w-56">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-white/40 mb-1">
                      {t.settings_dept_permission_group}
                    </label>
                    <select
                      value={newDeptPermissionCategory}
                      onChange={(e) => setNewDeptPermissionCategory(e.target.value as PermissionCategory | '')}
                      className={deptPermissionCategorySelectClass}
                    >
                      <option value="">{t.settings_dept_permission_only}</option>
                      <option value="sala">{t.department_sala}</option>
                      <option value="kitchen">{t.department_kitchen}</option>
                      <option value="bar">{t.department_bar}</option>
                    </select>
                  </div>
                  <p className="text-[11px] text-white/60 leading-snug flex-1 pt-0 md:pt-5">
                    {t.settings_dept_permission_group_hint}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-white/60">{t.settings_builtin_depts_hint}</p>
            </div>
          </SettingsAccordionSection>
        )}

        {/* ── REGOLE VIOLAZIONI (se abilitata in Impostazioni e profilo ha permesso) ───────── */}
        {(isAdminModuleEnabled(currentUser, 'violation_rules') || adminOnly) && (featureFlags.violation_rules ?? true) && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_violation_rules"
            title={t.settings_violation_rules_title}
            subtitle={t.settings_violation_rules_subtitle}
            defaultOpen={false}
          >
            <div className="fluid-grid fluid-grid-2 gap-3">
              {/* Critico */}
              <div className="rounded-xl border border-neutral-500 depth-card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">{t.wst_violation_critical}</h3>
                </div>
                <p className="text-[11px] text-white/55 leading-snug">{t.wst_violation_critical_sub}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-white/70">{t.settings_toggle_on}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={workRules.criticEnabled}
                    onClick={() => updateWorkRule('criticEnabled', !workRules.criticEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-all duration-200 ${workRules.criticEnabled ? 'bg-accent' : ''}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full toggle-knob transition-all duration-200 ease-in-out ${workRules.criticEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {workRules.criticEnabled && (
                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-white/55 mb-0.5">{t.settings_wr_max_shift_h}</label>
                      <input
                        type="number"
                        min={4}
                        max={14}
                        value={workRules.maxDailyHours}
                        onChange={(e) => updateWorkRule('maxDailyHours', Math.max(4, Math.min(14, +e.target.value || 9)))}
                        placeholder="0"
                        className="w-full rounded-xl border border-neutral-500 px-2 py-1 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/55 mb-0.5">{t.settings_wr_min_rest}</label>
                      <input
                        type="number"
                        min={6}
                        max={24}
                        value={workRules.minRestHours}
                        onChange={(e) => updateWorkRule('minRestHours', Math.max(6, Math.min(24, +e.target.value || 11)))}
                        placeholder="0"
                        className="w-full rounded-xl border border-neutral-500 px-2 py-1 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Attenzione */}
              <div className="rounded-xl border border-neutral-500 depth-card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">{t.wst_violation_attention}</h3>
                </div>
                <p className="text-[11px] text-white/55 leading-snug">{t.wst_violation_attention_sub}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-white/70">{t.settings_toggle_on}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={workRules.attentionEnabled}
                    onClick={() => updateWorkRule('attentionEnabled', !workRules.attentionEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-all duration-200 ${workRules.attentionEnabled ? 'bg-accent' : ''}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full toggle-knob transition-all duration-200 ease-in-out ${workRules.attentionEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {workRules.attentionEnabled && (
                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-white/55 mb-0.5">{t.settings_wr_max_day}</label>
                      <input
                        type="number"
                        min={4}
                        max={14}
                        value={workRules.maxDailyHours}
                        onChange={(e) => updateWorkRule('maxDailyHours', Math.max(4, Math.min(14, +e.target.value || 9)))}
                        placeholder="0"
                        className="w-full rounded-xl border border-neutral-500 px-2 py-1 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-white/55 mb-0.5">{t.settings_wr_max_week}</label>
                      <input
                        type="number"
                        min={20}
                        max={60}
                        value={workRules.maxWeeklyHours}
                        onChange={(e) => updateWorkRule('maxWeeklyHours', Math.max(20, Math.min(60, +e.target.value || 48)))}
                        placeholder="0"
                        className="w-full rounded-xl border border-neutral-500 px-2 py-1 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sovrapposizione */}
              <div className="rounded-xl border border-neutral-500 depth-card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/15 shadow-[0_0_6px_rgba(239,68,68,0.3)]">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">{t.wst_violation_overlap}</h3>
                </div>
                <p className="text-[11px] text-white/55 leading-snug">{t.wst_violation_overlap_sub}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-white/70">{t.settings_toggle_on}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={workRules.overlapEnabled}
                    onClick={() => updateWorkRule('overlapEnabled', !workRules.overlapEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-all duration-200 ${workRules.overlapEnabled ? 'bg-accent' : ''}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full toggle-knob transition-all duration-200 ease-in-out ${workRules.overlapEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>
          </SettingsAccordionSection>
        )}

        {/* ── Pause Automatiche (se abilitata in Impostazioni e profilo ha permesso) ───────── */}
        {(isAdminModuleEnabled(currentUser, 'auto_breaks') || adminOnly) && (featureFlags.auto_breaks ?? true) && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_auto_breaks"
            title={t.settings_auto_breaks_section}
            subtitle={
              breakRules.length > 0
                ? `${breakRules.length} regol${breakRules.length === 1 ? 'a' : 'e'} configurat${breakRules.length === 1 ? 'a' : 'e'}`
                : t.settings_break_empty
            }
            defaultOpen={false}
          >
            <div className="fluid-grid fluid-grid-2 gap-3">
              {breakRules.map((rule) => {
                const isEnabled = rule.enabled !== false;
                const toggle = () => {
                  const updated = breakRules.map((r) =>
                    r.id === rule.id ? { ...r, enabled: !isEnabled } : r
                  );
                  setBreakRules(updated);
                };
                return (
                  <div
                    key={rule.id}
                    className={`rounded-xl border border-neutral-500 flex flex-col gap-3 p-4 transition-colors ${
 isEnabled
 ? ''
 : 'border-white/10 opacity-70 bg-white/5'
 }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                        <Coffee className="w-4 h-4 text-amber-400" />
                      </span>
                      <h3
                        className={`flex-1 truncate text-xs font-bold uppercase tracking-wider ${isEnabled ? 'text-white' : 'text-white/40'}`}
                       title={rule.title}>{rule.title}
                      </h3>
                    </div>
                    <p className="text-[11px] text-white/55 leading-snug">
                      {rule.breakStart} – {rule.breakEnd}
                      {rule.minShiftDurationEnabled !== false ? (
                        <>
                          {' · '}min. {Math.round(rule.minShiftMinutes / 60 * 10) / 10}{t.settings_break_hours_suffix}
                        </>
                      ) : (
                        <span className="text-white/40"> · {t.settings_break_no_shift_threshold}</span>
                      )}
                      {' · '}
                      <span className={rule.paid ? 'text-accent' : 'text-amber-600'}>
                        {rule.paid ? t.settings_break_paid : t.settings_break_unpaid}
                      </span>
                    </p>
                    <div className="flex items-center justify-between pt-1 mt-auto">
                      <span className="text-[11px] font-medium text-white/70">{t.settings_toggle_on}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEnabled}
                          onClick={toggle}
                          title={isEnabled ? t.settings_break_toggle_disable : t.settings_break_toggle_enable}
                          className={`relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${isEnabled ? 'bg-accent' : ''}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full toggle-knob transition-all duration-200 ease-in-out ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <button type="button" onClick={() => setEditingBreakRule(rule)} className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors active:text-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDeleteBreakRule(rule.id)} className="p-1.5 rounded-xl hover:bg-red-500/15 text-white/40 hover:text-red-500 transition-colors active:text-red-500 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => setCreatingBreakRule(true)}
                className="rounded-xl border border-neutral-500 surface-ghost-interactive flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-neutral-500/90 p-4 text-white/55 transition-colors hover:border-accent hover:bg-accent/5 hover:text-accent active:text-accent"
              >
                <Plus className="w-6 h-6" />
                <span className="text-xs font-semibold">{t.settings_break_new_rule}</span>
              </button>
            </div>
          </SettingsAccordionSection>
        )}

        {/* ── Template Settimana ───────────────────────────────────────────── */}
        {isManager && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_shift_templates"
            title={t.settings_week_template_title ?? 'Template Settimana'}
            subtitle={
              shiftTemplatesLoading
                ? (t.loading ?? 'Caricamento…')
                : shiftTemplates.length > 0
                ? `${shiftTemplates.length} template`
                : (t.template_no_templates ?? 'Nessun template salvato')
            }
          >
            <div className="space-y-3">
              <p className="text-[12px] text-white/55 leading-relaxed">
                {t.settings_week_template_manage_hint ?? 'Gestisci i template di settimana salvati dal tabellone turni. Ogni template memorizza i turni assegnati per giorno e dipendente e può essere riapplicato in qualsiasi settimana.'}
              </p>

              {/* Refresh button */}
              <button
                type="button"
                onClick={loadShiftTemplates}
                disabled={shiftTemplatesLoading}
                className="flex items-center gap-1.5 text-[12px] text-blue-600 font-medium disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${shiftTemplatesLoading ? 'animate-spin' : ''}`} />
                {shiftTemplatesLoading ? 'Aggiornamento…' : 'Aggiorna lista'}
              </button>

              {/* Empty state */}
              {!shiftTemplatesLoading && shiftTemplates.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <CalendarDays className="h-8 w-8 text-white/30" />
                  <p className="text-[13px] text-white/40">{t.settings_no_templates_saved ?? 'Nessun template salvato.'}</p>
                  <p className="text-[11px] text-white/60">Salva una settimana dal tabellone turni usando il menu Template.</p>
                </div>
              )}

              {/* Template cards */}
              {shiftTemplates.length > 0 && (
                <div className="fluid-grid fluid-grid-2 gap-2.5">
                  {shiftTemplates.map((tmpl) => {
                    const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
                    const isDeletingThis = shiftTemplateDeleting === tmpl.name;
                    return (
                      <div
                        key={tmpl.name}
                        className="rounded-xl border border-neutral-500 rounded-lg p-3 flex items-start gap-3"
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-blue-50 flex items-center justify-center">
                          <BookTemplate className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate" title={tmpl.name}>{tmpl.name}</p>
                          <p className="text-[11px] text-white/55 mt-0.5">
                            {tmpl.count} turno{tmpl.count !== 1 ? 'i' : ''} · {tmpl.days.map(d => DAY_LABELS[d] ?? d).join(', ')}
                          </p>
                          {tmpl.created_at && (
                            <p className="text-[11px] text-white/60 mt-0.5">
                              {new Date(tmpl.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteShiftTemplate(tmpl.name)}
                          disabled={isDeletingThis}
                          className="flex-shrink-0 p-1.5 rounded-md text-white/40 hover:text-red-500 hover:bg-red-500/15 transition-colors disabled:opacity-40 active:text-red-500"
                          title={`Elimina template "${tmpl.name}"`}
                        >
                          {isDeletingThis
                            ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SettingsAccordionSection>
        )}

        {/* ── Periodi Presenze ─────────────────────────────────────────────── */}
        {isManager && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_period_rule"
            title={t.settings_attendance_periods_title ?? 'Periodi Presenze'}
            subtitle={(() => {
              const s = getPeriodStartDate(periodCfg);
              const e = getPeriodEndDate(periodCfg);
              return `${format(s, 'dd/MM/yy')} → ${format(e, 'dd/MM/yy')} · ${periodCfg.numWeeks} sett.`;
            })()}
            defaultOpen={false}
          >
            <div className="rounded-xl border border-neutral-500 depth-card p-4 space-y-4">

              {/* Periodo attivo + bozza */}
              <div className="grid grid-cols-2 gap-3">
                {/* Periodo attivo: mostra anteprima della regola selezionata */}
                {(() => {
                  const isLastSunday = periodRuleMode === 'last_sunday';
                  const previewStart = parseISO(periodCfg.startDate);
                  const previewEnd = getPeriodEndDate(periodCfg);
                  const ruleName = isLastSunday ? 'Ultima domenica' : 'Primo giorno';
                  const ruleColor = isLastSunday
                    ? 'text-accent'
                    : 'text-brand-deep';
                  const borderColor = isLastSunday
                    ? 'border-accent/25 border-l-accent'
                    : 'border-brand-deep/25 border-l-brand-deep';
                  return (
                    <div className={`rounded-xl border-2 border-l-4 ${borderColor} bg-transparent px-3 py-2.5`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                          Periodo attivo
                        </p>
                        <span className={`text-[11px] font-extrabold uppercase tracking-wide ${ruleColor}`}>
                          · {ruleName}
                        </span>
                      </div>
                      <p className="text-[13px] font-bold text-white tabular-nums">
                        {format(previewStart, 'dd/MM/yy')}
                        <span className="text-white/40 font-normal"> → </span>
                        {format(previewEnd, 'dd/MM/yy')}
                      </p>
                      <p className={`text-[11px] mt-0.5 ${ruleColor}`}>
                        {periodCfg.numWeeks} sett.
                      </p>
                    </div>
                  );
                })()}
                {/* Bozza (non ancora salvata) */}
                {periodDraftDirty ? (
                  <div className="rounded-xl border-2 border-l-4 border-amber-300/60 border-l-amber-500 bg-amber-50/80 px-3 py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-1">
                      Bozza non salvata
                    </p>
                    <p className="text-[13px] font-bold text-white tabular-nums">
                      {format(parseISO(periodDraftStart), 'dd/MM/yy')}
                      <span className="text-white/40 font-normal"> → </span>
                      {format(addDays(parseISO(periodDraftStart), periodDraftWeeks * 7 - 1), 'dd/MM/yy')}
                    </p>
                    <p className="text-[11px] text-amber-600 mt-0.5">
                      {periodDraftWeeks} sett. · premi Salva per confermare
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/10 bg-transparent px-3 py-2.5 flex items-center justify-center">
                    <p className="text-[11px] text-white/60 text-center leading-snug">
                      Nessuna modifica in bozza
                    </p>
                  </div>
                )}
              </div>

              {/* ── Selettore regola ────────────────────────────────────────── */}
              <div>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/40">
                  Regola di calcolo
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {/* Regola 1: Ultima domenica */}
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodRuleMode('last_sunday');
                      const cfg = currentPeriodConfig();
                      setDraftFromConfig(cfg);
                    }}
                    className={`flex flex-col items-start gap-1 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
 periodRuleMode === 'last_sunday'
 ? 'border-accent bg-accent/8'
 : 'border-neutral-500 bg-white/8 hover:border-white/20'
 } active:brightness-95`}
                  >
                    <span className={`text-[11px] font-extrabold uppercase tracking-wide ${periodRuleMode === 'last_sunday' ? 'text-accent' : 'text-white/70'}`}>
                      Ultima domenica
                    </span>
                    <span className="text-[11px] leading-snug text-white/40">
                      Il periodo termina sull'ultima dom. del mese
                    </span>
                  </button>
                  {/* Regola 2: Primo giorno */}
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodRuleMode('fixed_start');
                      const cfg = periodConfigFromStartDate(parseISO(periodDraftStart));
                      setDraftFromConfig(cfg);
                    }}
                    className={`flex flex-col items-start gap-1 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
 periodRuleMode === 'fixed_start'
 ? 'border-brand-deep bg-brand-deep/8'
 : 'border-neutral-500 bg-white/8 hover:border-white/20'
 } active:brightness-95`}
                  >
                    <span className={`text-[11px] font-extrabold uppercase tracking-wide ${periodRuleMode === 'fixed_start' ? 'text-brand-deep' : 'text-white/70'}`}>
                      Primo giorno
                    </span>
                    <span className="text-[11px] leading-snug text-white/40">
                      Imposti la data di inizio, il sistema calcola la fine
                    </span>
                  </button>
                </div>
              </div>

              {/* ── Configurazione in base alla regola selezionata ───────────── */}
              {periodRuleMode === 'fixed_start' && (
                /* Regola "Primo giorno": l'utente imposta la data di inizio */
                <div>
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-white/40">
                    Primo giorno del periodo
                  </p>
                  <DatePickerField
                    value={periodDraftStart}
                    onChange={(v) => {
                      setPeriodDraftStart(v);
                      setPeriodDraftDirty(true);
                      const cfg = periodConfigFromStartDate(parseISO(v));
                      setPeriodDraftWeeks(cfg.numWeeks);
                    }}
                    allowClear={false}
                    compact
                    aria-label="Primo giorno del periodo"
                    className="mb-3 w-full !border-neutral-500 !bg-white/8"
                  />
                  {/* Preview periodo calcolato dalla data scelta */}
                  {(() => {
                    const draftStart = parseISO(periodDraftStart || periodCfg.startDate);
                    const cfg = periodConfigFromStartDate(draftStart);
                    const endDate = addDays(draftStart, cfg.numWeeks * 7 - 1);
                    return (
                      <div className="flex items-center justify-between rounded-xl border border-brand-deep/22 bg-brand-deep/80/8 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold text-brand-deep">Primo giorno</span>
                          <span className="rounded-full bg-brand-deep/80/15 px-2 py-0.5 text-[11px] font-bold text-brand-deep">
                            {cfg.numWeeks} sett.
                          </span>
                        </div>
                        <span className="text-[11px] tabular-nums font-semibold text-white/70">
                          {format(draftStart, 'dd/MM/yy')} → {format(endDate, 'dd/MM/yy')}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Salva */}
              <button
                type="button"
                disabled={!periodDraftDirty || periodSavingCloud}
                onClick={() => applyPeriod({ startDate: periodDraftStart, numWeeks: periodDraftWeeks }, periodRuleMode)}
                className={`w-full rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
 !periodDraftDirty || periodSavingCloud
 ? 'cursor-not-allowed'
 : 'hover:opacity-90 '
 }`}
                style={!periodDraftDirty || periodSavingCloud
                  ? { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }
                  : { background: 'transparent', color: '#ffffff', border: '1px solid rgba(255,255,255,0.50)' }
                }
              >
                {periodSavingCloud ? 'Sincronizzazione…' : t.ts_save_period}
              </button>

            </div>
          </SettingsAccordionSection>
        )}

        {isManager && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_presence_qr"
            title={t.settings_presence_accordion_title}
            subtitle={t.settings_presence_accordion_subtitle}
            defaultOpen={true}
          >
            <div className="rounded-xl border border-neutral-500 depth-card p-4">
              <p className="text-[11px] text-white/55 mb-3 leading-snug">{t.settings_presence_section_hint}</p>
              {(() => {
                const effectiveTok = resolveEffectiveVerificationToken(presenceVerificationConfig);
                const diskTok = presenceVerificationConfig.verificationToken?.trim() ?? '';
                const preview =
                  effectiveTok.length > 20 ? `${effectiveTok.slice(0, 20)}…` : effectiveTok || '—';
                return (
                  <div className="rounded-xl border border-neutral-500 mb-3 space-y-1.5 px-3 py-2">
                    <p className="text-[11px] leading-snug text-white/80">
                      {effectiveTok
                        ? formatTrans(t.settings_presence_effective_token_preview, { preview })
                        : t.settings_presence_token_none}
                    </p>
                    {!diskTok && effectiveTok ? (
                      <p className="text-[11px] text-white/55 leading-snug">{t.settings_presence_token_env_only}</p>
                    ) : null}
                  </div>
                );
              })()}
              <div className="rounded-xl border border-neutral-500 mb-3 flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-xs font-semibold text-white">{t.settings_presence_require_label}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={presenceVerificationConfig.requireVerification === true}
                  onClick={async () => {
                    try {
                      await savePresenceVerificationConfig({
                        ...presenceVerificationConfig,
                        requireVerification: !presenceVerificationConfig.requireVerification,
                      });
                      showSuccess?.(t.settings_presence_saved);
                    } catch (e) {
                      showError?.(e instanceof Error ? e.message : t.settings_presence_save_error);
                    }
                  }}
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 ${
 presenceVerificationConfig.requireVerification ? 'bg-accent' : ''
 }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full toggle-knob transition-all duration-200 ease-in-out ${
 presenceVerificationConfig.requireVerification ? 'translate-x-5' : 'translate-x-0'
 }`}
                  />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={presenceQrBusy}
                  onClick={async () => {
                    setPresenceQrBusy(true);
                    try {
                      let token = resolveEffectiveVerificationToken(presenceVerificationConfig);
                      if (!token) {
                        token = generateRandomVerificationToken();
                        await savePresenceVerificationConfig({
                          ...presenceVerificationConfig,
                          verificationToken: token,
                        });
                      }
                      if (!token) {
                        showError?.(t.settings_presence_qr_need_token);
                        return;
                      }
                      const slug = (tenant?.slug ?? 'default').trim() || 'default';
                      const signed = await buildSignedPresenceQrPayload(token, slug);
                      const qrPayload = signed ?? token;
                      const dataUrl = await generatePresenceQrDataUrl(qrPayload);
                      openPresenceQrPrintWindow(dataUrl, t.settings_presence_qr_print_subtitle);
                    } catch (e) {
                      showError?.(e instanceof Error ? e.message : t.settings_presence_save_error);
                    } finally {
                      setPresenceQrBusy(false);
                    }
                  }}
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-60 active:bg-accent-hover/80"
                >
                  <QrCode className="h-4 w-4 shrink-0 text-white" aria-hidden />
                  {presenceQrBusy ? t.ui_ellipsis : t.settings_presence_generate_qr}
                </button>
              </div>
            </div>
          </SettingsAccordionSection>
        )}

        {/* ── Email richieste ferie ──────────────────────────────────────────── */}
        {isManager && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_holiday_email"
            title="Email richieste ferie"
            subtitle={holidayEmail ? holidayEmail : 'Nessuna email configurata'}
            defaultOpen={false}
          >
            <div className="rounded-xl border border-neutral-500 depth-card p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-mid/10 text-[#2255BB]">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white leading-tight">
                    Destinatario richieste ferie
                  </p>
                  <p className="mt-0.5 text-xs text-white/55 leading-snug">
                    Quando un dipendente invia una richiesta di ferie, la mail viene indirizzata a questo indirizzo.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white pointer-events-none" />
                  <input
                    type="email"
                    value={holidayEmailDraft}
                    onChange={(e) => setHolidayEmailDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveHolidayEmail(); }}
                    placeholder="es. direzione@azienda.it"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-transparent bg-transparent text-base text-white placeholder:text-white/60 outline-none transition-colors focus:border-transparent focus:ring-0 focus:shadow-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={saveHolidayEmail}
                  disabled={holidayEmailDraft.trim() === holidayEmail}
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: '#0a0a0c' }}
                >
                  {holidayEmailSaved ? (
                    <><Check className="h-3.5 w-3.5" />Salvata</>
                  ) : (
                    'Salva'
                  )}
                </button>
              </div>

              {holidayEmail && (
                <div className="flex items-center justify-between rounded-xl border border-brand-mid/20 bg-brand-mid/5 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#2255BB]" />
                    <span className="text-xs font-medium text-[#2255BB] truncate" title={holidayEmail}>{holidayEmail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setHolidayEmailDraft(''); setHolidayEmail(''); try { localStorage.removeItem(HOLIDAY_EMAIL_KEY); } catch { /* */ } }}
                    className="ml-2 flex-shrink-0 p-1 rounded-lg text-white/40 hover:text-red-500 hover:bg-red-500/15 transition-colors active:text-red-500"
                    title="Rimuovi email"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          </SettingsAccordionSection>
        )}

        {/* ── MASTER CONTROL PANEL (solo Admin — le funzioni si assegnano da Impostazioni e Permessi) ── */}
        {adminOnly && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_master_panel"
            title={t.settings_master_panel_title}
            subtitle={t.settings_master_panel_sub}
            defaultOpen={false}
          >
            {/* Feature flag cards */}
            <div className="fluid-grid fluid-grid-2 gap-3 mb-4">
              {FEATURE_DEFINITIONS.filter((f) => !['kiosk_active', 'staff_requests', 'unlock_with_pin'].includes(f.slug)).map((feature) => {
                const enabled = featureFlags[feature.slug] !== false;
                const isMaintenance = feature.slug === 'maintenance_mode';
                return (
                  <FeatureFlagCard
                    key={feature.slug}
                    feature={feature}
                    t={t}
                    enabled={enabled}
                    isMaintenance={isMaintenance}
                    onToggle={async () => {
                      await setFeatureFlag(feature.slug, !enabled);
                      showSuccess?.(formatTrans(enabled ? t.settings_feature_toggle_off : t.settings_feature_toggle_on, { name: getFeatureStrings(t, feature.slug).label }));
                    }}
                  />
                );
              })}
            </div>

            <div className="rounded-xl border border-neutral-500 mt-0 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4 flex-shrink-0 text-accent" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  {t.settings_geofence_editor_title}
                </h3>
              </div>
              <p className="text-[11px] text-white/55 mb-3 leading-snug">
                {t.settings_geofence_editor_hint}
              </p>
              {geofenceEffectiveConfig && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-brand-200/80 bg-brand-50/90 px-3 py-2">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-600" aria-hidden />
                  <p className="text-[11px] leading-snug text-brand-900">
                    {formatTrans(t.settings_geofence_active_summary, {
                      lat: geofenceEffectiveConfig.lat.toFixed(6),
                      lng: geofenceEffectiveConfig.lng.toFixed(6),
                      radius: String(Math.round(geofenceEffectiveConfig.radiusM)),
                    })}
                  </p>
                </div>
              )}
              <div className="fluid-grid fluid-grid-3 gap-2 mb-3">
                <label className="flex flex-col gap-1 text-[11px] font-medium text-white/70">
                  {t.settings_geofence_lat}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={geoLat}
                    onChange={(e) => setGeoLat(e.target.value)}
                    className="rounded-xl border border-neutral-500 bg-white/10 px-3 py-2 text-base text-white"
                    placeholder="45.123456"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-white/70">
                  {t.settings_geofence_lng}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={geoLng}
                    onChange={(e) => setGeoLng(e.target.value)}
                    className="rounded-xl border border-neutral-500 bg-white/10 px-3 py-2 text-base text-white"
                    placeholder="9.123456"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-white/70">
                  {t.settings_geofence_radius}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={geoRadius}
                    onChange={(e) => setGeoRadius(e.target.value)}
                    className="rounded-xl border border-neutral-500 bg-white/10 px-3 py-2 text-base text-white"
                    placeholder="120"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={geoAcquiring || geoSaving}
                  onClick={async () => {
                    setGeoAcquiring(true);
                    try {
                      const pos = await getCurrentPositionCoords();
                      const radiusM = Number.parseFloat(geoRadius.replace(',', '.'));
                      const r = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 120;
                      await saveGeofenceConfig({ lat: pos.lat, lng: pos.lng, radiusM: r });
                      setGeoLat(String(pos.lat));
                      setGeoLng(String(pos.lng));
                      showSuccess?.(t.settings_geofence_acquire_success);
                    } catch (e: unknown) {
                      const err = e as { code?: number };
                      const code = typeof err?.code === 'number' ? err.code : -1;
                      if (code === 1) {
                        showError?.(t.punch_geofence_denied);
                      } else {
                        showError?.(t.settings_geofence_acquire_error);
                      }
                    } finally {
                      setGeoAcquiring(false);
                    }
                  }}
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-neutral-500 px-4 text-xs font-bold uppercase tracking-wider text-white/80 surface-ghost-interactive disabled:opacity-60"
                >
                  <LocateFixed className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {geoAcquiring ? t.ui_ellipsis : t.settings_geofence_acquire_gps}
                </button>
                <button
                  type="button"
                  disabled={geoSaving || geoAcquiring}
                  onClick={async () => {
                    const lat = Number.parseFloat(geoLat.replace(',', '.'));
                    const lng = Number.parseFloat(geoLng.replace(',', '.'));
                    const radiusM = Number.parseFloat(geoRadius.replace(',', '.'));
                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                      showError?.(t.settings_geofence_invalid);
                      return;
                    }
                    const r = Number.isFinite(radiusM) && radiusM > 0 ? radiusM : 120;
                    setGeoSaving(true);
                    try {
                      await saveGeofenceConfig({ lat, lng, radiusM: r });
                      showSuccess?.(t.settings_geofence_saved);
                    } catch (e) {
                      showError?.(e instanceof Error ? e.message : t.settings_geofence_save_error);
                    } finally {
                      setGeoSaving(false);
                    }
                  }}
                  className="min-h-[40px] rounded-xl bg-accent px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-60 active:bg-accent-hover/80"
                >
                  {geoSaving ? t.ui_ellipsis : t.settings_geofence_save}
                </button>
              </div>
            </div>
          </SettingsAccordionSection>
        )}

        {adminOnly && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_admin_advanced"
            title={t.settings_advanced_tools_admin}
            defaultOpen={false}
          >
            <div className="rounded-xl border border-neutral-500 overflow-hidden">
              <div className="space-y-3 p-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/40">{t.settings_backup_data_section}</p>

                {dataToolsLocked ? (
                  /* ── Stato bloccato ── */
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-neutral-500 bg-white/5/80 py-5 px-4">
                    <Lock className="h-7 w-7 text-white/40" />
                    <p className="text-[12px] text-center text-white/55 leading-snug">
                      Sezione protetta.<br/>Inserisci il tuo PIN per sbloccare.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setDataToolsPin(''); setDataToolsPinError(''); setShowDataToolsPinPad(true); }}
                      className="flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-accent/90 transition-colors"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Sblocca con PIN
                    </button>
                  </div>
                ) : (
                  /* ── Stato sbloccato ── */
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                        <Unlock className="h-3 w-3" /> Sbloccato
                      </span>
                      <button
                        type="button"
                        onClick={() => setDataToolsLocked(true)}
                        className="text-[11px] text-white/60 hover:text-white/70 transition-colors active:text-white/70"
                      >
                        Blocca di nuovo
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleImportClick}
className="rounded-lg rounded-xl border border-neutral-500 px-3 py-2 text-xs font-medium uppercase text-white/70 surface-ghost-interactive transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                      >
                        {t.restore}
                      </button>
                      <button
                        type="button"
                        onClick={() => exportToJSON({ users, shifts, punchRecords, holidays })}
                        className="rounded-lg rounded-xl border border-neutral-500 px-3 py-2 text-xs font-medium uppercase text-white/70 surface-ghost-interactive"
                      >
                        {t.backup_json}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PIN pad per sblocco */}
            {showDataToolsPinPad && (
              <PinPadModal
                title="Sblocca strumenti dati"
                subtitle="Inserisci il tuo PIN amministratore"
                pinLabel="PIN"
                pin={dataToolsPin}
                onPinChange={(p) => { setDataToolsPin(p); setDataToolsPinError(''); }}
                onConfirm={() => {
                  if (dataToolsPin === currentUser?.pin || dataToolsPin === currentUser?.secondary_pin) {
                    setDataToolsLocked(false);
                    setShowDataToolsPinPad(false);
                    setDataToolsPin('');
                  } else {
                    setDataToolsPinError('PIN non corretto');
                    setDataToolsPin('');
                    setTimeout(() => setDataToolsPinError(''), 2000);
                  }
                }}
                onCancel={() => { setShowDataToolsPinPad(false); setDataToolsPin(''); }}
                error={dataToolsPinError}
                isLoading={false}
                confirmLabel="Sblocca"
                cancelLabel="Annulla"
                userId={currentUser?.id}
                userDisplayName={[currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ')}
                userEmail={currentUser?.email ?? ''}
                onBiometricSuccess={() => {
                  setDataToolsLocked(false);
                  setShowDataToolsPinPad(false);
                  setDataToolsPin('');
                }}
              />
            )}
          </SettingsAccordionSection>
        )}


        {adminOnly && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_elevated_access"
            title="Accesso scheda Admin"
            subtitle="Abilita il tab Admin nella navigazione del profilo"
            defaultOpen={false}
          >
            <div className="rounded-xl border border-neutral-500 overflow-hidden">
              <div className="p-4">
                <ElevatedAccessPanel />
              </div>
            </div>
          </SettingsAccordionSection>
        )}

        {/* ── Sincronizzazione cloud — in fondo alla scheda ─────────────────── */}
        {adminOnly && (
          <div className="rounded-2xl border border-accent/25 bg-accent/[0.04] p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15">
                <UploadCloud className="h-5 w-5 text-white" style={{ color: '#fff' }} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t.settings_cloud_sync_heading}</p>
                <button
                  type="button"
                  onClick={() => setCloudHintExpanded(!cloudHintExpanded)}
                  className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold transition-colors"
                  style={{ color: '#fff' }}
                >
                  <ChevronDown className={`w-3 h-3 transition-transform ${cloudHintExpanded ? 'rotate-180' : ''}`} />
                  {cloudHintExpanded ? 'Nascondi dettagli' : 'Dettagli'}
                </button>
                <AnimatePresence initial={false}>
                  {cloudHintExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="text-xs text-white/70 mt-1.5 leading-relaxed">{t.settings_cloud_sync_hint}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
                <p className="text-[11px] font-semibold mt-1.5" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  {settingsCloudLastSyncedAt
                    ? formatTrans(t.settings_cloud_synced_at, {
                        when: new Date(settingsCloudLastSyncedAt).toLocaleString(
                          effectiveLanguage === 'en' ? 'en-GB' : effectiveLanguage === 'es' ? 'es-ES' : effectiveLanguage === 'fr' ? 'fr-FR' : 'it-IT',
                          { dateStyle: 'short', timeStyle: 'short' }
                        ),
                      })
                    : t.settings_cloud_never}
                  {dataSyncInProgress ? ` · ${t.ui_ellipsis}` : ''}
                </p>
              </div>
            </div>
            <div className="flex flex-row gap-2 shrink-0">
              <button
                type="button"
                disabled={pullSyncBusy || pushSyncBusy || dataSyncInProgress}
                onClick={() => void handlePullSync()}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-accent-dark disabled:opacity-60 shadow-sm shadow-accent/30 transition-colors active:bg-accent-dark/80"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${pullSyncBusy ? 'animate-spin' : ''}`} />
                {pullSyncBusy ? t.ui_ellipsis : 'Sincronizza'}
              </button>
              <button
                type="button"
                disabled={pushSyncBusy || settingsCloudPushBusy || pullSyncBusy || dataSyncInProgress}
                onClick={() => void handlePushSync()}
                className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-accent-dark disabled:opacity-60 shadow-sm shadow-accent/30 transition-colors active:bg-accent-dark/80 whitespace-nowrap"
              >
                <UploadCloud className={`h-5 w-5 text-white ${pushSyncBusy ? 'animate-spin' : ''}`} style={{ color: '#fff' }} />
                {pushSyncBusy ? t.ui_ellipsis : 'Carica sul cloud'}
              </button>
            </div>
          </div>
        )}

        </div>{/* fine sezione Gestione Regole */}
      </motion.div>

      {showCreateStaff && (
        <CreateStaffModal
          isOpen
          onClose={() => setShowCreateStaff(false)}
          onCreated={(u) => setEditingUser(u)}
        />
      )}
      {editingUser && (
        <EditStaffModal
          isOpen={true}
          user={users.find((u) => u.id === editingUser.id) ?? editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}

      {(creatingBreakRule || editingBreakRule) && (
        <BreakRuleModal
          rule={editingBreakRule ?? undefined}
          onSave={handleSaveBreakRule}
          onClose={() => { setCreatingBreakRule(false); setEditingBreakRule(null); }}
        />
      )}

      {/* Modale eliminazione reparto con riassegnazione utenti */}
      {deletingDept && (
        <CenteredModalPortal
          open
          onClose={() => { if (!isDeleting) setDeletingDept(null); }}
          maxWidthClass="max-w-md"
        >
          <div className="p-1">
            {/* Header */}
            <div className="mb-4 flex items-start gap-3">
              <div
                className="mt-0.5 h-8 w-8 shrink-0 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: deletingDept.color ?? 'var(--brand)' }}
              >
                <Trash2 className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">
                  Elimina reparto
                </h3>
                <p className="mt-0.5 text-xs text-white/55">
                  <span
                    className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: deletingDept.color ?? 'var(--brand)' }}
                  >
                    {deletingDept.label}
                  </span>
                  {' '}verrà rimosso definitivamente.
                </p>
              </div>
            </div>

            {/* Lista utenti da riassegnare */}
            {(() => {
              const affected = users.filter(u => u.department === deletingDept.value);
              if (affected.length === 0) {
                return (
                  <p className="mb-4 rounded-xl bg-white/5 px-3 py-2.5 text-xs text-white/55">
                    Nessun profilo associato a questo reparto.
                  </p>
                );
              }
              return (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-semibold text-white/80">
                    {affected.length} {affected.length === 1 ? 'profilo associato' : 'profili associati'} — scegli il nuovo reparto:
                  </p>
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                    {affected.map(u => {
                      const initials = ((u.first_name?.[0] ?? '') + (u.last_name?.[0] ?? '')).toUpperCase() || '?';
                      return (
                        <div key={u.id} className="flex items-center gap-2 rounded-xl border border-neutral-500 bg-white/10 px-3 py-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">
                            {initials}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/80" title={u.first_name}>{u.first_name} {u.last_name}
                          </span>
                          <select
                            value={reassignMap[u.id] ?? ''}
                            onChange={e => setReassignMap(m => ({ ...m, [u.id]: e.target.value }))}
                            className="min-w-0 max-w-[130px] shrink rounded-lg border border-neutral-500 bg-white/5 px-2 py-1 text-base font-semibold text-white/80 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/30"
                          >
                            <option value="">— nessun reparto —</option>
                            {departments
                              .filter(dep => dep.value !== deletingDept.value)
                              .map(dep => (
                                <option key={dep.value} value={dep.value}>
                                  {translateDepartmentValue(dep.value, effectiveLanguage)}
                                </option>
                              ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* Bottoni */}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingDept(null)}
                className="flex-1 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-bold text-white/80 transition-colors hover:bg-white/15 disabled:opacity-50 active:bg-white/80"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    const affected = users.filter(u => u.department === deletingDept.value);
                    await Promise.all(
                      affected.map(u =>
                        updateUser(u.id, { department: (reassignMap[u.id] || undefined) as string | undefined })
                      )
                    );
                    const next = removeDepartment(deletingDept.value);
                    setDepts(next);
                    setHiddenBuiltins(getHiddenBuiltinValues());
                    void notifyDepartmentsChanged();
                    setDeletingDept(null);
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-50 active:bg-red-600/80"
              >
                {isDeleting ? 'Eliminazione…' : 'Conferma eliminazione'}
              </button>
            </div>
          </div>
        </CenteredModalPortal>
      )}

      {showImportConfirm && importFile && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="modal-glass-panel w-full max-w-sm rounded-2xl p-6">
            <h3 className="mb-2 text-sm font-semibold text-white">{t.attention}</h3>
            <p className="mb-4 text-sm text-white/80">{t.import_warning}</p>
            <p className="mb-4 break-all text-center font-sans text-xs tabular-nums text-white/70">{importFile.name}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmImport}
className="flex-1 rounded-xl bg-accent py-2.5 text-xs font-semibold uppercase text-white hover:bg-accent-hover active:bg-accent-hover/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
              >
                {t.confirm}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImportConfirm(false);
                  setImportFile(null);
                }}
                className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-semibold uppercase text-white/70 hover:bg-white/15 active:bg-white/80"
              >
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── BreakRuleModal ─────────────────────────────────────────────────────────────

const BREAK_MODAL_ROLE_VALUES: UserRole[] = ['waiter', 'server', 'bartender', 'cook', 'chef', 'dishwasher'];

function makeId() {
  return Math.random().toString(36).slice(2, 11);
}

function BreakRuleModal({
  rule,
  onSave,
  onClose,
}: {
  rule?: BreakRule;
  onSave: (rule: BreakRule) => void;
  onClose: () => void;
}) {
  const { effectiveLanguage } = useAppUser();
  const t = useT();
  const weekdayOptions = useMemo(() => {
    const labelByDay: Record<DayOfWeek, string> = {
      0: t.settings_weekday_short_0,
      1: t.settings_weekday_short_1,
      2: t.settings_weekday_short_2,
      3: t.settings_weekday_short_3,
      4: t.settings_weekday_short_4,
      5: t.settings_weekday_short_5,
      6: t.settings_weekday_short_6,
    };
    return ([1, 2, 3, 4, 5, 6, 0] as const).map((value) => ({
      value: value as DayOfWeek,
      label: labelByDay[value as DayOfWeek],
    }));
  }, [t]);

  const isEdit = !!rule;
  const [title, setTitle] = useState(rule?.title ?? '');
  const [breakStart, setBreakStart] = useState(rule?.breakStart ?? '12:00');
  const [breakEnd, setBreakEnd] = useState(rule?.breakEnd ?? '12:30');
  const [minHours, setMinHours] = useState(Math.round((rule?.minShiftMinutes ?? 240) / 60 * 10) / 10);
  const [minShiftThresholdOn, setMinShiftThresholdOn] = useState(rule?.minShiftDurationEnabled !== false);
  const [paid, setPaid] = useState(rule?.paid ?? false);
  const [departments, setDepartments] = useState<string[]>(rule?.departments ?? []);
  const [roles, setRoles] = useState<string[]>(rule?.roles ?? []);
  const [validFrom, setValidFrom] = useState(rule?.validFrom ?? '');
  const [validTo, setValidTo] = useState(rule?.validTo ?? '');
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>(rule?.daysOfWeek ?? []);

  const toggleChip = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !breakStart || !breakEnd) return;
    onSave({
      id: rule?.id ?? makeId(),
      title: title.trim(),
      breakStart,
      breakEnd,
      minShiftMinutes: Math.round(minHours * 60),
      minShiftDurationEnabled: minShiftThresholdOn,
      paid,
      departments,
      roles,
      validFrom: validFrom || undefined,
      validTo: validTo || undefined,
      daysOfWeek,
    });
  };

  const labelClass =
    'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55';
  const inputClass =
    'w-full rounded-xl border border-neutral-500 bg-white/10 px-3 py-2.5 text-base font-semibold text-white transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20';
  const chipClass = (active: boolean) =>
    `cursor-pointer px-2.5 py-1 text-xs font-semibold transition-colors ${
      active
        ? 'rounded-full border border-emerald-500 bg-emerald-500/20 text-emerald-400'
        : 'rounded-xl border border-neutral-500 !rounded-full text-white/70 surface-ghost-interactive hover:border-accent hover:text-accent'
    }`;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <motion.form
        initial={{ scale: 0.93, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="modal-glass-panel w-full max-w-4xl rounded-2xl font-sans"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-app-bg/80 px-5 pt-5 pb-4 backdrop-blur-md">
          <h2 className="text-base font-bold text-white">
            {isEdit ? t.settings_break_modal_edit_title : t.settings_break_modal_new_title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 transition-colors hover:bg-white/15 active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
            aria-label={t.close}
          >
            <X className="h-4 w-4 text-white/55" aria-hidden />
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="grid grid-cols-3 gap-6">
          {/* ── Generale ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-3">{t.settings_break_section_general}</p>
            <div className="space-y-3">
              {/* Titolo */}
              <div>
                <label className={labelClass}>{t.settings_break_label_title}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.toUpperCase())}
                  placeholder={t.settings_break_title_placeholder}
                  required
                  className={`${inputClass} uppercase`}
                />
              </div>

              {/* Finestra pausa */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t.settings_break_label_start}</label>
                  <TimeInputField
                    value={breakStart}
                    onChange={setBreakStart}
                    aria-label={t.settings_break_label_start}
                    className="w-full border-neutral-500 bg-white/8"
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.settings_break_label_end}</label>
                  <TimeInputField
                    value={breakEnd}
                    onChange={setBreakEnd}
                    aria-label={t.settings_break_label_end}
                    className="w-full border-neutral-500 bg-white/8"
                  />
                </div>
              </div>

              {/* Soglia turno: attivabile/disattivabile */}
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/5/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/80">{t.settings_break_shift_threshold_title}</p>
                    <p className="text-[11px] text-white/55 mt-0.5 leading-snug">
                      {minShiftThresholdOn ? t.settings_break_shift_threshold_on : t.settings_break_shift_threshold_off}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={minShiftThresholdOn}
                    onClick={() => setMinShiftThresholdOn((v) => !v)}
                    className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-all duration-200 ${minShiftThresholdOn ? 'bg-accent' : ''}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full toggle-knob transition-all duration-200 ease-in-out ${minShiftThresholdOn ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {minShiftThresholdOn && (
                  <div className="flex items-center gap-3 border-t border-white/10/90 pt-1">
                    <span className="shrink-0 text-[11px] font-semibold uppercase text-white/55">{t.settings_break_min_label}</span>
                    <button
                      type="button"
                      onClick={() => setMinHours((h) => Math.max(0.5, Math.round((h - 0.5) * 10) / 10))}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-500 font-bold text-white/80 surface-ghost-interactive"
                    >−</button>
                    <span className="w-16 text-center text-sm font-bold text-white">{minHours}h</span>
                    <button
                      type="button"
                      onClick={() => setMinHours((h) => Math.min(12, Math.round((h + 0.5) * 10) / 10))}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-500 font-bold text-white/80 surface-ghost-interactive"
                    >+</button>
                  </div>
                )}
              </div>

              {/* Retribuita / Non retribuita */}
              <div>
                <label className={labelClass}>{t.settings_break_type_label}</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPaid(false)} className={chipClass(!paid)}>
                    {t.settings_break_unpaid_btn}
                  </button>
                  <button type="button" onClick={() => setPaid(true)} className={chipClass(paid)}>
                    {t.settings_break_paid_btn}
                  </button>
                </div>
                <p className="text-[11px] text-white/60 mt-1.5">
                  {paid ? t.settings_break_paid_hint : t.settings_break_unpaid_hint}
                </p>
              </div>
            </div>
          </div>

          {/* ── Assegna a ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-3">{t.settings_break_assign_section}</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>
                  {t.settings_break_label_depts}{' '}
                  <span className="font-normal normal-case tracking-normal text-white/40">{t.settings_break_none_means_all}</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {getDepartments().map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDepartments((prev) => toggleChip(prev, d.value))}
                      className={chipClass(departments.includes(d.value))}
                    >
                      {translateDepartmentValue(d.value, effectiveLanguage)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>
                  {t.settings_break_label_roles}{' '}
                  <span className="font-normal normal-case tracking-normal text-white/40">{t.settings_break_none_means_all}</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {BREAK_MODAL_ROLE_VALUES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoles((prev) => toggleChip(prev, r))}
                      className={chipClass(roles.includes(r))}
                    >
                      {translateRole(r, effectiveLanguage)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Applica a ── */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 mb-3">{t.settings_break_apply_section}</p>
            <div className="space-y-3">
              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>
                    {t.settings_break_valid_from} <span className="font-normal">{t.settings_break_optional_paren}</span>
                  </label>
                  <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className={inputClass} placeholder="GG/MM/AAAA" />
                </div>
                <div>
                  <label className={labelClass}>
                    {t.settings_break_valid_to} <span className="font-normal">{t.settings_break_optional_paren}</span>
                  </label>
                  <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className={inputClass} placeholder="GG/MM/AAAA" />
                </div>
              </div>

              {/* Giorni settimana */}
              <div>
                <label className={labelClass}>
                  {t.settings_break_weekdays}{' '}
                  <span className="font-normal normal-case tracking-normal text-white/40">{t.settings_break_none_means_all}</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {weekdayOptions.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDaysOfWeek((prev) => toggleChip(prev, d.value))}
                      className={chipClass(daysOfWeek.includes(d.value))}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          </div>

          {/* Footer buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-sm transition-colors active:bg-accent-hover/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            >
              <Check className="w-4 h-4" />
              {isEdit ? t.settings_break_save_changes : t.settings_break_create_rule}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-white/10 px-4 py-3 text-sm font-bold text-white/80 transition-colors hover:bg-white/15 active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      </motion.form>
    </div>
  );
}
