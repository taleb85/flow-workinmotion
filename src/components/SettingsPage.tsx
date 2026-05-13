import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Pencil, X, Check, Wrench, Unlock, Coffee, Palmtree, Monitor, AlertTriangle, ShieldAlert, LayoutGrid, Building2, Zap, ChevronDown, Users, MapPin, UserPlus, LocateFixed, Nfc, QrCode, UploadCloud } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { User, UserRole } from '../types';
import { translateRole } from '../utils/roles';
import { getAdminModuleLabel, getTranslations, formatTrans, getFeatureStrings } from '../utils/translations';
import { canUserEdit, isAdminOnly, canViewSuspended, isPurelyManagementRole, isManagementRole, isUserVisibleOnTeamSchedule, canEditRoleFeatureTemplates } from '../utils/permissions';
import StaffOperationalPermissionsEditor from './StaffOperationalPermissionsEditor';
import { exportToJSON, exportToCSV } from '../utils/exportData';
import { importDataToSupabase, clearAllData } from '../utils/importData';
import EditStaffModal from './EditStaffModal';
import CreateStaffModal from './CreateStaffModal';
import { BreakRule, DayOfWeek } from '../utils/breakRules';
import {
  getDepartments,
  addDepartment,
  removeDepartment,
  updateDepartment,
  BUILTIN_DEPARTMENTS,
  DEPARTMENT_COLOR_PRESETS,
} from '../utils/departments';
import type { Department, PermissionCategory } from '../utils/departments';
import { FEATURE_DEFINITIONS } from '../utils/featureFlags';
import { getEnabledFeatures, ADMIN_MODULE_KEYS, getAdminModuleEnabled, isAdminModuleEnabled } from '../utils/enabledFeatures';
import RoleFeatureSectionsBlock, { PERMISSION_SUMMARY_LIST_CLASS } from './RoleFeatureSectionsBlock';
import AdminRow from './ui/AdminRow';
import { SettingsAccordionSection } from './ui/SettingsAccordionSection';
import { CenteredModalPortal } from './ui/CenteredModalPortal';
import { RoleFeatureTemplatesPanel } from './RoleFeatureTemplatesPage';
import type { WorkRules } from '../utils/workRules';
import { getCurrentPositionCoords } from '../utils/geo';
import { readNfcTagOnce } from '../utils/nfc';
import { resolveEffectiveVerificationToken, generateRandomVerificationToken } from '../utils/presenceVerificationPayload';
import { generatePresenceQrDataUrl, openPresenceQrPrintWindow } from '../utils/qrPresence';

const SETTINGS_TEAM_EXPANDED_KEY = 'osteria_settings_team_expanded';

function readTeamSectionExpanded(): boolean {
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
  const { effectiveLanguage } = useApp();
  const t = getTranslations(effectiveLanguage);
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
        className="relative h-9 w-9 shrink-0 rounded-full border-2 border-white shadow-[0_2px_10px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/90 outline-none transition-transform hover:ring-slate-300 focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 active:scale-[0.96]"
        style={{ backgroundColor: value }}
      />
      {open && (
        <CenteredModalPortal
          open
          onClose={() => setOpen(false)}
          panelRef={modalRef}
          backdropAriaLabel={tv.close ?? 'Chiudi'}
          ariaLabel={title}
          maxWidthClass="max-w-xs"
          panelClassName="p-3"
        >
          <p className="mb-2.5 px-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{title}</p>
          <div className="grid grid-cols-6 gap-2">
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
                  className={`h-8 w-8 rounded-full border-2 border-white shadow-sm outline-none transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
                    selected ? 'ring-2 ring-accent ring-offset-2' : 'ring-1 ring-slate-200/70'
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

export default function SettingsPage() {
  const {
    users,
    shifts,
    punchRecords,
    holidays,
    currentUser,
    updateUser,
    effectiveLanguage,
    hardResetTestData,
    seedDemoProfileForUser,
    showSuccess,
    showError,
    featureFlags,
    setFeatureFlag,
    workRules,
    setWorkRules,
    breakRules,
    setBreakRules,
    geofenceEffectiveConfig,
    saveGeofenceConfig,
    presenceVerificationConfig,
    savePresenceVerificationConfig,
    silentRefreshData,
    pushSettingsToCloud,
    settingsCloudLastSyncedAt,
    settingsCloudPushBusy,
    dataSyncInProgress,
  } = useApp();
  const t = getTranslations(effectiveLanguage);

  useEffect(() => {
    if (!currentUser || !isAdminOnly(currentUser)) return;
    void silentRefreshData({ pullRemoteConfig: true });
  }, [currentUser, silentRefreshData]);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [expandedPermsUserId, setExpandedPermsUserId] = useState<string | null>(null);
  const [showSuspended, setShowSuspended] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [teamSectionExpanded, setTeamSectionExpanded] = useState(readTeamSectionExpanded);
  const [resettingData, setResettingData] = useState(false);
  const [seedingDemoProfile, setSeedingDemoProfile] = useState(false);
  const [geoLat, setGeoLat] = useState('');
  const [geoLng, setGeoLng] = useState('');
  const [geoRadius, setGeoRadius] = useState('120');
  const [geoSaving, setGeoSaving] = useState(false);
  const [geoAcquiring, setGeoAcquiring] = useState(false);
  const [presenceNfcBusy, setPresenceNfcBusy] = useState(false);
  const [presenceQrBusy, setPresenceQrBusy] = useState(false);

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
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptColor, setNewDeptColor] = useState('#2D5A27');
  const [editingDeptValue, setEditingDeptValue] = useState<string | null>(null);
  const [editDeptLabel, setEditDeptLabel] = useState('');
  const [editDeptColor, setEditDeptColor] = useState('#2D5A27');
  const [newDeptPermissionCategory, setNewDeptPermissionCategory] = useState<PermissionCategory | ''>('sala');
  const [editDeptPermissionCategory, setEditDeptPermissionCategory] = useState<PermissionCategory | ''>('');
  const builtinValues = new Set(BUILTIN_DEPARTMENTS.map((d) => d.value));

  const deptPermissionCategorySelectClass =
    'w-full min-w-[10rem] max-w-[16rem] px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent';

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

  const demoProfileCandidates = useMemo(
    () =>
      users
        .filter((u) => u.status === 'active' && !isPurelyManagementRole(u.role))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [users]
  );

  const [demoProfileTargetUserId, setDemoProfileTargetUserId] = useState('');

  useEffect(() => {
    const valid =
      demoProfileTargetUserId &&
      demoProfileCandidates.some((u) => u.id === demoProfileTargetUserId);
    if (valid) return;
    setDemoProfileTargetUserId(demoProfileCandidates[0]?.id ?? '');
  }, [demoProfileCandidates, demoProfileTargetUserId]);

  if (!currentUser) return null;

  const canEdit = canUserEdit(currentUser);
  const adminOnly = isAdminOnly(currentUser);
  const canSeeSuspended = canViewSuspended(currentUser);
  const isManager = isManagementRole(currentUser.role);

  const handleToggleStatus = (user: User) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    updateUser(user.id, { status: newStatus });
  };

  const displayUsers = users
    .filter((u) => {
      if (isPurelyManagementRole(u.role) && !adminOnly) return false;
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
      <div className="pb-content pt-6 w-full px-4 sm:px-6 font-sans min-h-full">
        <p className="text-slate-600 text-sm">{t.no_access_settings}</p>
      </div>
    );
  }

  return (
    <div className="pb-content pt-6 w-full px-4 sm:px-6 font-sans min-h-full">
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
              className={`mb-4 rounded-xl p-4 border ${
                importStatus.type === 'success'
                  ? 'bg-accent/10 text-accent border-accent/40'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {importStatus.message}
            </motion.div>
          )}
        </AnimatePresence>

        {canEditRoleFeatureTemplates(currentUser) && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_role_templates"
            title={t.role_templates_page_title}
            subtitle={t.role_templates_embedded_collapsed_hint}
            defaultOpen
          >
            <RoleFeatureTemplatesPanel variant="embedded" />
          </SettingsAccordionSection>
        )}

        {/* Gestione Team */}
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={toggleTeamSectionExpanded}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-transparent py-1.5 pl-1 pr-2 text-left transition-colors hover:bg-slate-100/80 -ml-1"
              aria-expanded={teamSectionExpanded}
            >
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${teamSectionExpanded ? 'rotate-180' : ''}`}
                aria-hidden
              />
              <h2 className="text-slate-700 text-[11px] font-semibold uppercase tracking-widest">
                {t.settings_team_section_title}
              </h2>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setShowCreateStaff(true)}
                  className="inline-flex items-center gap-1.5 text-slate-600 text-xs font-semibold uppercase tracking-wider border border-slate-200 rounded-xl px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" aria-hidden />
                  {t.admin_add_employee}
                </button>
              )}
              {canSeeSuspended && (
                <button
                  type="button"
                  onClick={() => setShowSuspended(!showSuspended)}
                  className="text-slate-400 text-xs uppercase tracking-wider hover:text-slate-700 border border-slate-200 rounded-xl px-2 py-1 hover:bg-slate-50 transition-colors"
                >
                  {showSuspended ? t.hide_suspended : t.show_suspended}
                </button>
              )}
            </div>
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
                <div className="panel rounded-xl shadow-none overflow-hidden divide-y divide-slate-100">
              {displayUsers.map((user) => {
                const isPermsOpen = expandedPermsUserId === user.id;
                return (
                  <div key={user.id} className={user.status !== 'active' ? 'opacity-60' : ''}>
                    {/* ── User row ── */}
                    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 gap-2">
                      <button
                        type="button"
                        onClick={() => canEdit && setEditingUser(user)}
                        className={`flex-1 min-w-0 text-left ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <span className="text-slate-900 font-semibold text-sm uppercase block truncate">
                          {user.first_name ?? ''} {user.last_name ?? ''}
                        </span>
                        <span className="text-slate-500 text-[10px] uppercase tracking-wider">
                          {translateRole(user.role, currentUser.language)}
                          {!isPurelyManagementRole(user.role) && user.status === 'active' && !isUserVisibleOnTeamSchedule(user) && (
                            <span className="ml-1.5 text-amber-600 font-semibold normal-case">
                              · {t.settings_off_schedule_badge}
                            </span>
                          )}
                        </span>
                      </button>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Permessi toggle */}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setExpandedPermsUserId(isPermsOpen ? null : user.id)}
                            title={t.settings_user_perms_title_attr}
                            className={`px-2 py-1 rounded-lg border text-[10px] font-semibold transition-colors ${
                              isPermsOpen
                                ? 'bg-accent text-white border-accent'
                                : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            {t.settings_user_perms_button}
                          </button>
                        )}

                        {/* Griglia: override per-utente (template in Permessi ruoli sopra) */}
                        {canEdit && !isPurelyManagementRole(user.role) && user.status === 'active' && (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isUserVisibleOnTeamSchedule(user)}
                            title={
                              isUserVisibleOnTeamSchedule(user)
                                ? t.settings_grid_visible_title
                                : t.settings_grid_hidden_title
                            }
                            onClick={() => {
                              const willBeHidden = isUserVisibleOnTeamSchedule(user);
                              updateUser(user.id, { hide_from_team_schedule: willBeHidden });
                              showSuccess?.(
                                willBeHidden
                                  ? t.settings_toast_hidden_from_grid
                                  : t.settings_toast_visible_on_grid
                              );
                            }}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-semibold transition-colors ${
                              isUserVisibleOnTeamSchedule(user)
                                ? 'border-accent/30 bg-accent/10 text-accent'
                                : 'border-slate-200 bg-slate-50 text-slate-400'
                            }`}
                          >
                            <Users className="w-3 h-3 shrink-0 opacity-70" />
                            <span className="hidden min-[380px]:inline">{t.settings_grid_short}</span>
                          </button>
                        )}

                        {/* Active toggle */}
                        {canEdit && (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={user.status === 'active'}
                            onClick={() => handleToggleStatus(user)}
                            className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
                              user.status === 'active' ? 'bg-accent' : 'bg-slate-200'
                            }`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${user.status === 'active' ? 'translate-x-5' : 'translate-x-0'}`} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* ── Permissions panel ── */}
                    <AnimatePresence>
                      {isPermsOpen && canEdit && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="bg-slate-50 border-t border-slate-100 px-4 py-4 space-y-4">
                            {/* Matrice permessi: solo lettura (definita dal ruolo) */}
                            {!isPurelyManagementRole(user.role) && (
                              <div className="space-y-4">
                                <p className="text-[11px] text-slate-500 leading-snug">
                                  {formatTrans(t.settings_perms_effective_intro, {
                                    name: user.first_name ?? '',
                                    role: translateRole(user.role, currentUser.language),
                                  })}
                                </p>
                                <div>
                                  <p className="ui-section-title mb-2 text-slate-400">
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
                                        <span className={isUserVisibleOnTeamSchedule(user) ? 'text-slate-800' : 'text-slate-600'}>
                                          {t.settings_visible_on_schedule_row}
                                        </span>
                                      }
                                      action={
                                        <span
                                          className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                                            isUserVisibleOnTeamSchedule(user) ? 'bg-accent text-white shadow-sm' : 'bg-slate-100 text-slate-500'
                                          }`}
                                        >
                                          {isUserVisibleOnTeamSchedule(user) ? t.role_template_yes : t.role_template_no}
                                        </span>
                                      }
                                    />
                                  </div>
                                  <p className="text-[10px] text-slate-400 mt-2 leading-snug">
                                    Template + pulsante Griglia in riga (override solo visibilità tabellone).
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Moduli scheda Impostazioni: globali, solo Admin modifica (Permessi ruoli) */}
                            {isManagementRole(user.role) && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                  {formatTrans(t.settings_admin_settings_modules_heading, { name: user.first_name ?? '' })}
                                </p>
                                <p className="text-[11px] text-slate-500 mb-2">
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
                                          <span className={enabled ? 'text-slate-800' : 'text-slate-500'}>
                                            {getAdminModuleLabel(key, t as Record<string, string>)}
                                          </span>
                                        }
                                        action={
                                          <span
                                            className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                                              enabled ? 'bg-accent text-white shadow-sm' : 'bg-slate-100 text-slate-500'
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

                            {isPurelyManagementRole(user.role) ? (
                              <div className="rounded-xl border border-accent/25 bg-accent/5 px-4 py-3">
                                <p className="text-sm font-bold text-slate-800">
                                  {t.settings_admin_perm_title}
                                </p>
                                <p className="mt-1.5 text-[11px] text-slate-600 leading-relaxed">
                                  {t.settings_admin_perm_readonly_body}
                                </p>
                              </div>
                            ) : (
                              <StaffOperationalPermissionsEditor user={user} currentUser={currentUser} />
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

        {/* Reparti (se abilitata in Impostazioni e profilo ha permesso) */}
        {isAdminModuleEnabled(currentUser, 'department_creation') && (featureFlags.department_creation ?? true) && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_departments"
            title={t.settings_departments_section_title}
            defaultOpen={false}
          >
            <div className="panel p-4 rounded-xl space-y-4">
              {/* Lista reparti */}
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => {
                  const isBuiltin = builtinValues.has(d.value);
                  const badgeColor = d.color ?? '#2D5A27';
                  const isEditingChip = editingDeptValue === d.value;
                  return (
                    <div
                      key={d.value}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold uppercase text-white transition-shadow ${
                        isEditingChip ? 'ring-2 ring-white/90 ring-offset-2 ring-offset-slate-100 shadow-md' : ''
                      }`}
                      style={{ backgroundColor: badgeColor }}
                    >
                      <span className="truncate max-w-[10rem]">{d.label}</span>
                      {!isBuiltin && d.permissionCategory && (
                        <span
                          className="text-[9px] font-semibold normal-case opacity-90 border-l border-white/35 pl-1.5 shrink-0 max-w-[5.5rem] truncate"
                          title={t.settings_dept_permission_group}
                        >
                          {d.permissionCategory === 'sala'
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
                          setEditDeptColor(d.color ?? '#2D5A27');
                          setEditDeptPermissionCategory(isBuiltin ? '' : (d.permissionCategory ?? ''));
                        }}
                        className="text-white/75 hover:text-white transition-colors shrink-0"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      {!isBuiltin && (
                        <button
                          type="button"
                          title={t.settings_dept_delete_title}
                          onClick={() => {
                            if (editingDeptValue === d.value) setEditingDeptValue(null);
                            setDepts(removeDepartment(d.value));
                          }}
                          className="text-white/70 hover:text-white transition-colors shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <AnimatePresence>
                {editingDeptValue && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-accent/25 bg-slate-50/90 p-3 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {t.settings_dept_edit_title}
                      </p>
                      {builtinValues.has(editingDeptValue) && (
                        <p className="text-[11px] text-slate-500 leading-snug">{t.settings_dept_builtin_edit_hint}</p>
                      )}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
                        <DepartmentColorPicker
                          value={editDeptColor}
                          onChange={setEditDeptColor}
                          title={t.settings_dept_color_title}
                        />
                        <input
                          type="text"
                          value={editDeptLabel}
                          onChange={(e) => setEditDeptLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && editDeptLabel.trim() && editingDeptValue) {
                              const isBuiltinEdit = builtinValues.has(editingDeptValue);
                              setDepts(
                                updateDepartment(editingDeptValue, {
                                  label: editDeptLabel.trim(),
                                  color: editDeptColor,
                                  ...(!isBuiltinEdit ? { permissionCategory: editDeptPermissionCategory } : {}),
                                })
                              );
                              showSuccess?.(t.settings_dept_saved);
                              setEditingDeptValue(null);
                            }
                          }}
                          className="min-w-0 flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent sm:min-w-[12rem]"
                        />
                        {!builtinValues.has(editingDeptValue) && (
                          <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                              {t.settings_dept_permission_group}
                            </label>
                            <select
                              value={editDeptPermissionCategory}
                              onChange={(e) => setEditDeptPermissionCategory(e.target.value as PermissionCategory | '')}
                              className={deptPermissionCategorySelectClass}
                            >
                              <option value="">{t.settings_dept_permission_only}</option>
                              <option value="sala">{t.department_sala}</option>
                              <option value="kitchen">{t.department_kitchen}</option>
                              <option value="bar">{t.department_bar}</option>
                            </select>
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                          <button
                            type="button"
                            disabled={!editDeptLabel.trim()}
                            onClick={() => {
                              if (!editingDeptValue || !editDeptLabel.trim()) return;
                              const isBuiltinEdit = builtinValues.has(editingDeptValue);
                              setDepts(
                                updateDepartment(editingDeptValue, {
                                  label: editDeptLabel.trim(),
                                  color: editDeptColor,
                                  ...(!isBuiltinEdit ? { permissionCategory: editDeptPermissionCategory } : {}),
                                })
                              );
                              showSuccess?.(t.settings_dept_saved);
                              setEditingDeptValue(null);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {t.save}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDeptValue(null)}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </div>
                      {!builtinValues.has(editingDeptValue) && (
                        <p className="text-[11px] text-slate-500 leading-snug">{t.settings_dept_permission_group_hint}</p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Aggiunta nuovo reparto */}
              <div className="space-y-3 pt-1 border-t border-slate-100">
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
                        setNewDeptColor('#2D5A27');
                        setNewDeptPermissionCategory('sala');
                      }
                    }}
                    placeholder={t.settings_new_dept_placeholder}
                    className="min-w-[8rem] flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
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
                        setNewDeptColor('#2D5A27');
                        setNewDeptPermissionCategory('sala');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-accent text-white text-xs font-semibold hover:bg-accent-hover transition-colors disabled:opacity-40"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t.settings_add_dept}
                  </button>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-4">
                  <div className="shrink-0 sm:w-56">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
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
                  <p className="text-[11px] text-slate-400 leading-snug flex-1 pt-0 sm:pt-5">
                    {t.settings_dept_permission_group_hint}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400">{t.settings_builtin_depts_hint}</p>
            </div>
          </SettingsAccordionSection>
        )}

        {/* ── REGOLE VIOLAZIONI (se abilitata in Impostazioni e profilo ha permesso) ───────── */}
        {isAdminModuleEnabled(currentUser, 'violation_rules') && (featureFlags.violation_rules ?? true) && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_violation_rules"
            title={t.settings_violation_rules_title}
            subtitle={t.settings_violation_rules_subtitle}
            defaultOpen={false}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Critico */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                  </span>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t.wst_violation_critical}</h3>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{t.wst_violation_critical_sub}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-slate-600">{t.settings_toggle_on}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={workRules.criticEnabled}
                    onClick={() => updateWorkRule('criticEnabled', !workRules.criticEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${workRules.criticEnabled ? 'bg-accent' : 'bg-slate-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${workRules.criticEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {workRules.criticEnabled && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">{t.settings_wr_max_shift_h}</label>
                      <input
                        type="number"
                        min={4}
                        max={14}
                        value={workRules.maxDailyHours}
                        onChange={(e) => updateWorkRule('maxDailyHours', Math.max(4, Math.min(14, +e.target.value || 9)))}
                        className="w-full px-2 py-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">{t.settings_wr_min_rest}</label>
                      <input
                        type="number"
                        min={6}
                        max={24}
                        value={workRules.minRestHours}
                        onChange={(e) => updateWorkRule('minRestHours', Math.max(6, Math.min(24, +e.target.value || 11)))}
                        className="w-full px-2 py-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Attenzione */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  </span>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t.wst_violation_attention}</h3>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{t.wst_violation_attention_sub}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-slate-600">{t.settings_toggle_on}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={workRules.attentionEnabled}
                    onClick={() => updateWorkRule('attentionEnabled', !workRules.attentionEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${workRules.attentionEnabled ? 'bg-accent' : 'bg-slate-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${workRules.attentionEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {workRules.attentionEnabled && (
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">{t.settings_wr_max_day}</label>
                      <input
                        type="number"
                        min={4}
                        max={14}
                        value={workRules.maxDailyHours}
                        onChange={(e) => updateWorkRule('maxDailyHours', Math.max(4, Math.min(14, +e.target.value || 9)))}
                        className="w-full px-2 py-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">{t.settings_wr_max_week}</label>
                      <input
                        type="number"
                        min={20}
                        max={60}
                        value={workRules.maxWeeklyHours}
                        onChange={(e) => updateWorkRule('maxWeeklyHours', Math.max(20, Math.min(60, +e.target.value || 48)))}
                        className="w-full px-2 py-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sovrapposizione */}
              <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shadow-[0_0_6px_rgba(239,68,68,0.3)]">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
                  </span>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">{t.wst_violation_overlap}</h3>
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">{t.wst_violation_overlap_sub}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] font-medium text-slate-600">{t.settings_toggle_on}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={workRules.overlapEnabled}
                    onClick={() => updateWorkRule('overlapEnabled', !workRules.overlapEnabled)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${workRules.overlapEnabled ? 'bg-accent' : 'bg-slate-200'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${workRules.overlapEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>
            </div>
          </SettingsAccordionSection>
        )}

        {/* ── Pause Automatiche (se abilitata in Impostazioni e profilo ha permesso) ───────── */}
        {isAdminModuleEnabled(currentUser, 'auto_breaks') && (featureFlags.auto_breaks ?? true) && (
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
                    className={`rounded-2xl border p-4 flex flex-col gap-3 transition-all ${isEnabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50 opacity-70'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                        <Coffee className="w-4 h-4 text-amber-600" />
                      </span>
                      <h3 className={`text-xs font-bold uppercase tracking-wider truncate flex-1 ${isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                        {rule.title}
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {rule.breakStart} – {rule.breakEnd}
                      {rule.minShiftDurationEnabled !== false ? (
                        <>
                          {' · '}min. {Math.round(rule.minShiftMinutes / 60 * 10) / 10}{t.settings_break_hours_suffix}
                        </>
                      ) : (
                        <span className="text-slate-400"> · {t.settings_break_no_shift_threshold}</span>
                      )}
                      {' · '}
                      <span className={rule.paid ? 'text-accent' : 'text-amber-600'}>
                        {rule.paid ? t.settings_break_paid : t.settings_break_unpaid}
                      </span>
                    </p>
                    <div className="flex items-center justify-between pt-1 mt-auto">
                      <span className="text-[11px] font-medium text-slate-600">{t.settings_toggle_on}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isEnabled}
                          onClick={toggle}
                          title={isEnabled ? t.settings_break_toggle_disable : t.settings_break_toggle_enable}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${isEnabled ? 'bg-accent' : 'bg-slate-200'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                        <button type="button" onClick={() => setEditingBreakRule(rule)} className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDeleteBreakRule(rule.id)} className="p-1.5 rounded-xl hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
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
                className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 p-4 flex flex-col items-center justify-center gap-2 text-slate-500 hover:border-accent hover:text-accent hover:bg-accent/5 transition-colors min-h-[120px]"
              >
                <Plus className="w-6 h-6" />
                <span className="text-xs font-semibold">{t.settings_break_new_rule}</span>
              </button>
            </div>
          </SettingsAccordionSection>
        )}

        {isManager && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_presence_nfc_qr"
            title={t.settings_presence_accordion_title}
            subtitle={t.settings_presence_accordion_subtitle}
            defaultOpen={true}
          >
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-[11px] text-slate-500 mb-3 leading-snug">{t.settings_presence_section_hint}</p>
              {(() => {
                const effectiveTok = resolveEffectiveVerificationToken(presenceVerificationConfig);
                const diskTok = presenceVerificationConfig.verificationToken?.trim() ?? '';
                const preview =
                  effectiveTok.length > 20 ? `${effectiveTok.slice(0, 20)}…` : effectiveTok || '—';
                return (
                  <div className="mb-3 space-y-1.5 rounded-xl border border-slate-200/90 bg-white/90 px-3 py-2">
                    <p className="text-[11px] text-slate-700 leading-snug">
                      {effectiveTok
                        ? formatTrans(t.settings_presence_effective_token_preview, { preview })
                        : t.settings_presence_token_none}
                    </p>
                    {!diskTok && effectiveTok ? (
                      <p className="text-[10px] text-slate-500 leading-snug">{t.settings_presence_token_env_only}</p>
                    ) : null}
                    {presenceVerificationConfig.nfcLastRegisteredAt ? (
                      <p className="text-[10px] text-slate-500">
                        {formatTrans(t.settings_presence_nfc_last, {
                          date: new Date(presenceVerificationConfig.nfcLastRegisteredAt).toLocaleString(),
                        })}
                      </p>
                    ) : null}
                  </div>
                );
              })()}
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 mb-3">
                <span className="text-xs font-semibold text-slate-800">{t.settings_presence_require_label}</span>
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
                  className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
                    presenceVerificationConfig.requireVerification ? 'bg-accent' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      presenceVerificationConfig.requireVerification ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={presenceNfcBusy}
                  onClick={async () => {
                    setPresenceNfcBusy(true);
                    try {
                      const res = await readNfcTagOnce();
                      if (!res.ok) {
                        showError?.(t.settings_presence_nfc_error);
                        return;
                      }
                      const text = res.text.trim();
                      if (!text) {
                        showError?.(t.settings_presence_nfc_error);
                        return;
                      }
                      await savePresenceVerificationConfig({
                        ...presenceVerificationConfig,
                        verificationToken: text,
                        nfcLastRegisteredAt: new Date().toISOString(),
                      });
                      showSuccess?.(t.settings_presence_nfc_saved);
                    } catch (e) {
                      showError?.(e instanceof Error ? e.message : t.settings_presence_nfc_error);
                    } finally {
                      setPresenceNfcBusy(false);
                    }
                  }}
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Nfc className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {presenceNfcBusy ? t.ui_ellipsis : t.settings_presence_register_nfc}
                </button>
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
                      const dataUrl = await generatePresenceQrDataUrl(token);
                      openPresenceQrPrintWindow(dataUrl, t.settings_presence_qr_print_subtitle);
                    } catch (e) {
                      showError?.(e instanceof Error ? e.message : t.settings_presence_save_error);
                    } finally {
                      setPresenceQrBusy(false);
                    }
                  }}
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-60"
                >
                  <QrCode className="h-4 w-4 shrink-0 text-white" aria-hidden />
                  {presenceQrBusy ? t.ui_ellipsis : t.settings_presence_generate_qr}
                </button>
              </div>
            </div>
          </SettingsAccordionSection>
        )}

        {adminOnly && (
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                <UploadCloud className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.settings_cloud_sync_heading}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">{t.settings_cloud_sync_hint}</p>
                <p className="text-[11px] font-medium text-emerald-800/90 dark:text-emerald-300/90 mt-1.5">
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
            <button
              type="button"
              disabled={settingsCloudPushBusy}
              onClick={() => void pushSettingsToCloud()}
              className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-emerald-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {settingsCloudPushBusy ? t.ui_ellipsis : t.settings_cloud_save_all_devices}
            </button>
          </div>
        )}

        {/* ── MASTER CONTROL PANEL (solo Admin — le funzioni si assegnano da Impostazioni e Permessi) ── */}
        {adminOnly && (
          <SettingsAccordionSection
            storageKey="osteria_settings_acc_master_panel"
            title={t.settings_master_panel_title}
            subtitle={t.settings_master_panel_sub}
            defaultOpen={false}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FEATURE_DEFINITIONS.map((feature) => {
                const { label: featureLabel, description: featureDescription } = getFeatureStrings(t, feature.slug);
                const enabled = featureFlags[feature.slug] !== false;
                const isMaintenance = feature.slug === 'maintenance_mode';

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
                    key={feature.slug}
                    className={`relative rounded-2xl border p-4 flex flex-col gap-3 transition-all duration-200 ${
                      isMaintenance
                        ? enabled
                          ? 'border-red-300 bg-red-50 shadow-[0_0_0_3px_rgba(239,68,68,0.12)]'
                          : 'border-amber-200 bg-amber-50/60'
                        : 'border-slate-100 bg-white shadow-sm'
                    }`}
                  >
                    {/* Card top */}
                    <div className="flex items-start justify-between gap-3">
                      {/* Icon + label */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          isMaintenance
                            ? enabled ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                            : enabled ? 'bg-accent/10 text-accent' : 'bg-slate-100 text-slate-400'
                        }`}>
                          {iconMap[feature.slug]}
                        </div>
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold leading-tight ${
                            isMaintenance
                              ? enabled ? 'text-red-700' : 'text-amber-700'
                              : enabled ? 'text-slate-800' : 'text-slate-400'
                          }`}>
                            {featureLabel}
                          </p>
                          {isMaintenance && enabled && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 mt-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {t.settings_maintenance_active_badge}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        onClick={async () => {
                          await setFeatureFlag(feature.slug, !enabled);
                          showSuccess?.(formatTrans(enabled ? t.settings_feature_toggle_off : t.settings_feature_toggle_on, { name: featureLabel }));
                        }}
                        className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${
                          isMaintenance
                            ? enabled ? 'bg-red-500' : 'bg-slate-200'
                            : enabled ? 'bg-accent' : 'bg-slate-200'
                        }`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    {/* Description */}
                    <p className={`text-[11px] leading-snug ${
                      isMaintenance
                        ? enabled ? 'text-red-500' : 'text-amber-600/80'
                        : 'text-slate-400'
                    }`}>
                      {featureDescription}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-accent flex-shrink-0" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  {t.settings_geofence_editor_title}
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mb-3 leading-snug">
                {t.settings_geofence_editor_hint}
              </p>
              {geofenceEffectiveConfig && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/90 px-3 py-2">
                  <Check className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" aria-hidden />
                  <p className="text-[11px] text-emerald-900 leading-snug">
                    {formatTrans(t.settings_geofence_active_summary, {
                      lat: geofenceEffectiveConfig.lat.toFixed(6),
                      lng: geofenceEffectiveConfig.lng.toFixed(6),
                      radius: String(Math.round(geofenceEffectiveConfig.radiusM)),
                    })}
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
                <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                  {t.settings_geofence_lat}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={geoLat}
                    onChange={(e) => setGeoLat(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder="45.123456"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                  {t.settings_geofence_lng}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={geoLng}
                    onChange={(e) => setGeoLng(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                    placeholder="9.123456"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] font-medium text-slate-600">
                  {t.settings_geofence_radius}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={geoRadius}
                    onChange={(e) => setGeoRadius(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
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
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-60"
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
                  className="min-h-[40px] rounded-xl bg-accent px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-60"
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
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="p-4 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t.settings_backup_data_section}</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleImportClick}
                          className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium uppercase hover:bg-slate-50"
                        >
                          {t.restore}
                        </button>
                        <button
                          type="button"
                          onClick={() => exportToJSON({ users, shifts, punchRecords, holidays })}
                          className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium uppercase hover:bg-slate-50"
                        >
                          {t.backup_json}
                        </button>
                        <button
                          type="button"
                          onClick={() => exportToCSV({ users, shifts, punchRecords, holidays })}
                          className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium uppercase hover:bg-slate-50"
                        >
                          {t.report_csv}
                        </button>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 space-y-3">
                        <button
                          type="button"
                          disabled={resettingData}
                          onClick={async () => {
                            if (!window.confirm(t.settings_reset_data_confirm)) return;
                            setResettingData(true);
                            try {
                              await hardResetTestData();
                              showSuccess(t.settings_reset_done);
                              setImportStatus({ type: 'success', message: t.settings_dashboard_cleared });
                              setTimeout(() => setImportStatus(null), 4000);
                            } catch (e) {
                              showError(e instanceof Error ? e.message : t.settings_reset_error);
                              setImportStatus({ type: 'error', message: t.settings_reset_data_error_detail });
                              setTimeout(() => setImportStatus(null), 3000);
                            } finally {
                              setResettingData(false);
                            }
                          }}
                          className="w-full px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium uppercase hover:bg-amber-100 disabled:opacity-60 text-center"
                        >
                          {resettingData ? t.ui_ellipsis : t.settings_reset_test_data_btn}
                        </button>
                        <div className="space-y-2">
                          <label htmlFor="osteria-demo-profile-user-settings" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            {t.settings_seed_demo_profile_pick_user}
                          </label>
                          {demoProfileCandidates.length === 0 ? (
                            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                              {t.settings_seed_demo_profile_no_staff}
                            </p>
                          ) : (
                            <select
                              id="osteria-demo-profile-user-settings"
                              value={demoProfileTargetUserId}
                              onChange={(e) => setDemoProfileTargetUserId(e.target.value)}
                              className={deptPermissionCategorySelectClass}
                            >
                              {demoProfileCandidates.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {[u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            disabled={
                              seedingDemoProfile ||
                              resettingData ||
                              !demoProfileTargetUserId ||
                              demoProfileCandidates.length === 0
                            }
                            onClick={async () => {
                              if (!window.confirm(t.settings_seed_demo_profile_confirm)) return;
                              setSeedingDemoProfile(true);
                              try {
                                await seedDemoProfileForUser(demoProfileTargetUserId);
                                showSuccess(t.settings_seed_demo_profile_done);
                                setImportStatus({
                                  type: 'success',
                                  message: t.settings_seed_demo_profile_done,
                                });
                                setTimeout(() => setImportStatus(null), 4000);
                              } catch (e) {
                                showError(e instanceof Error ? e.message : t.settings_seed_demo_profile_error);
                                setImportStatus({
                                  type: 'error',
                                  message: t.settings_seed_demo_profile_error,
                                });
                                setTimeout(() => setImportStatus(null), 3000);
                              } finally {
                                setSeedingDemoProfile(false);
                              }
                            }}
                            className="w-full px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium uppercase hover:bg-emerald-100 disabled:opacity-60 text-center"
                          >
                            {seedingDemoProfile ? t.ui_ellipsis : t.settings_seed_demo_profile_btn}
                          </button>
                          <p className="text-[10px] text-slate-500 leading-relaxed">{t.settings_seed_demo_profile_hint}</p>
                        </div>
                      </div>
                    </div>
                  </div>
          </SettingsAccordionSection>
        )}

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

      {showImportConfirm && importFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="panel w-full max-w-sm p-6">
            <h3 className="text-slate-900 font-semibold text-sm mb-2">{t.attention}</h3>
            <p className="text-slate-700 text-sm mb-4">{t.import_warning}</p>
            <p className="text-slate-600 text-xs font-sans mb-4 break-all text-center tabular-nums">{importFile.name}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmImport}
                className="flex-1 py-2.5 rounded-xl bg-accent text-white text-xs font-semibold uppercase hover:bg-accent-hover"
              >
                {t.confirm}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowImportConfirm(false);
                  setImportFile(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold uppercase"
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

const BREAK_MODAL_ROLE_VALUES: UserRole[] = ['waiter', 'server', 'capo', 'bartender', 'cook', 'chef', 'dishwasher'];

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
  const { effectiveLanguage } = useApp();
  const t = getTranslations(effectiveLanguage);
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

  const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';
  const inputClass = 'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-colors';
  const chipClass = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
      active ? 'bg-accent text-white border-accent' : 'bg-white text-slate-600 border-slate-200 hover:border-accent hover:text-accent'
    }`;

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <motion.form
        initial={{ scale: 0.93, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto font-sans"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white px-5 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between z-10">
          <h2 className="text-base font-bold text-slate-900">
            {isEdit ? t.settings_break_modal_edit_title : t.settings_break_modal_new_title}
          </h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* ── Generale ── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">{t.settings_break_section_general}</p>
            <div className="space-y-3">
              {/* Titolo */}
              <div>
                <label className={labelClass}>{t.settings_break_label_title}</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.settings_break_title_placeholder}
                  required
                  className={inputClass}
                />
              </div>

              {/* Finestra pausa */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>{t.settings_break_label_start}</label>
                  <input type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} required className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>{t.settings_break_label_end}</label>
                  <input type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} required className={inputClass} />
                </div>
              </div>

              {/* Soglia turno: attivabile/disattivabile */}
              <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700">{t.settings_break_shift_threshold_title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {minShiftThresholdOn ? t.settings_break_shift_threshold_on : t.settings_break_shift_threshold_off}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={minShiftThresholdOn}
                    onClick={() => setMinShiftThresholdOn((v) => !v)}
                    className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ${minShiftThresholdOn ? 'bg-accent' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${minShiftThresholdOn ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {minShiftThresholdOn && (
                  <div className="flex items-center gap-3 pt-1 border-t border-slate-100/90">
                    <span className="text-[10px] font-semibold text-slate-500 uppercase shrink-0">{t.settings_break_min_label}</span>
                    <button
                      type="button"
                      onClick={() => setMinHours((h) => Math.max(0.5, Math.round((h - 0.5) * 10) / 10))}
                      className="w-8 h-8 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center font-bold text-slate-700"
                    >−</button>
                    <span className="w-16 text-center font-bold text-slate-800 text-sm">{minHours}h</span>
                    <button
                      type="button"
                      onClick={() => setMinHours((h) => Math.min(12, Math.round((h + 0.5) * 10) / 10))}
                      className="w-8 h-8 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 flex items-center justify-center font-bold text-slate-700"
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
                <p className="text-[11px] text-slate-400 mt-1.5">
                  {paid ? t.settings_break_paid_hint : t.settings_break_unpaid_hint}
                </p>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100" />

          {/* ── Assegna a ── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">{t.settings_break_assign_section}</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>
                  {t.settings_break_label_depts}{' '}
                  <span className="font-normal normal-case tracking-normal text-slate-400">{t.settings_break_none_means_all}</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {getDepartments().map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => setDepartments((prev) => toggleChip(prev, d.value))}
                      className={chipClass(departments.includes(d.value))}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>
                  {t.settings_break_label_roles}{' '}
                  <span className="font-normal normal-case tracking-normal text-slate-400">{t.settings_break_none_means_all}</span>
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

          <div className="border-t border-slate-100" />

          {/* ── Applica a ── */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-3">{t.settings_break_apply_section}</p>
            <div className="space-y-3">
              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>
                    {t.settings_break_valid_from} <span className="font-normal">{t.settings_break_optional_paren}</span>
                  </label>
                  <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>
                    {t.settings_break_valid_to} <span className="font-normal">{t.settings_break_optional_paren}</span>
                  </label>
                  <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} className={inputClass} />
                </div>
              </div>

              {/* Giorni settimana */}
              <div>
                <label className={labelClass}>
                  {t.settings_break_weekdays}{' '}
                  <span className="font-normal normal-case tracking-normal text-slate-400">{t.settings_break_none_means_all}</span>
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

          {/* Footer buttons */}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold text-sm transition-colors"
            >
              <Check className="w-4 h-4" />
              {isEdit ? t.settings_break_save_changes : t.settings_break_create_rule}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm transition-colors"
            >
              {t.cancel}
            </button>
          </div>
        </div>
      </motion.form>
    </div>
  );
}
