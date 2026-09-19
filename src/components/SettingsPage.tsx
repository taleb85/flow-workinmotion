import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Pencil, X, Check, Wrench, Unlock, Coffee, Palmtree, ShieldAlert, LayoutGrid, Building2, ChevronDown, MapPin, UserPlus, UserX, UserCheck, LocateFixed, QrCode, UploadCloud, RefreshCw, Mail, Lock, KeyRound, Copy, CalendarDays, BookTemplate, Link2, Bell, Timer, Sun, Moon, type LucideIcon } from 'lucide-react';
import { database } from '../lib/database';
import { supabase } from '../lib/supabase';
import { PinPadModal } from './ui/PinPadModal';
import ToggleSwitch from './ui/toggle-switch-glass';
import { format, parseISO, addDays } from 'date-fns';
import { getDateLocale } from '../utils/translations';
import {
  loadPeriodConfig,
  savePeriodConfig as persistPeriodConfig,
  getPeriodEndDate,
  getPeriodStartDate,
  dispatchPeriodConfigUpdated,
  currentPeriodConfig,
  periodConfigFromStartDate,
  loadCustomPeriodRules,
  saveCustomPeriodRules,
  loadSelectedPeriodRuleId,
  saveSelectedPeriodRuleId,
  createPeriodRuleId,
  isBuiltinPeriodRule,
  BUILTIN_PERIOD_RULES,
  PERIOD_RULES_UPDATED_EVENT,
  type PeriodConfig,
  type PeriodRule,
  type PeriodRuleType,
} from '../utils/periodConfig';
import { saveTimesheetPeriodToSupabase, savePeriodRulesToSupabase } from '../utils/timesheetPeriodSupabase';
import DatePickerField from './DatePickerField';
import { useAppUser, useAppData, useAppConfig, useAppOverlay } from '../context/AppContext';
import { useT } from '../hooks/useT';
import { useTenant } from '../context/TenantContext';
import type { User, UserRole } from '../types';
import { translateRole } from '../utils/roles';
import { formatTrans, getFeatureStrings, getTranslations } from '../utils/translations';
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
import { exportToJSON } from '../utils/exportData';
import { importDataToSupabase, clearAllData } from '../utils/importData';
import EditStaffModal from './EditStaffModal';
import { buildShortInviteLink } from '../config/appPaths';
import CreateStaffModal from './CreateStaffModal';
import { BreakRule, DayOfWeek, type AutoBreakTier } from '../utils/breakRules';
import {
  getDepartments,
  addDepartment,
  removeDepartment,
  updateDepartment,
  restoreBuiltinDepartment,
  getHiddenBuiltinValues,
  BUILTIN_DEPARTMENTS,
  DEPARTMENT_COLOR_PRESETS,
  ensureWhiteTextContrast,
} from '../utils/departments';
import { translateDepartmentValue } from '../utils/departmentLabels';
import type { Department, PermissionCategory } from '../utils/departments';
import { FEATURE_DEFINITIONS } from '../utils/featureFlags';
import { TimeInputField } from './ui/TimeInputField';
import { isAdminModuleEnabled } from '../utils/enabledFeatures';
import { SettingsAccordionSection } from './ui/SettingsAccordionSection';
import { CenteredModalPortal } from './ui/CenteredModalPortal';
import { GradientIconButton } from './ui/GradientIconButton';
import { RoleFeatureTemplatesPanel } from './RoleFeatureTemplatesPage';
import ProfileVisibilityHub from './ProfileVisibilityHub';
import ElevatedAccessPanel from './ElevatedAccessPanel';
import type { WorkRules } from '../utils/workRules';
import { getCurrentPositionCoords } from '../utils/geo';
import { resolveEffectiveVerificationToken, generateRandomVerificationToken } from '../utils/presenceVerificationPayload';
import { generatePresenceQrDataUrl, openPresenceQrPrintWindow } from '../utils/qrPresence';
import { buildSignedPresenceQrPayload } from '../utils/presenceProofVerification';

const SETTINGS_TEAM_EXPANDED_KEY = 'osteria_settings_team_expanded';

/* Icone disponibili per le regole pausa (pranzo = sole, cena = luna) */
const BREAK_RULE_ICONS: Record<string, LucideIcon> = {
  sun: Sun,
  moon: Moon,
};

function getBreakRuleIconLabel(key: string, t: Record<string, string>): string {
  return key === 'moon' ? (t.settings_break_icon_dinner ?? 'Cena') : (t.settings_break_icon_lunch ?? 'Pranzo');
}

function getBreakRuleIconComponent(iconKey?: string): LucideIcon {
  return (iconKey && BREAK_RULE_ICONS[iconKey]) || Sun;
}

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
        className="relative h-9 w-9 shrink-0 rounded-full border-2 border-white shadow-[0_2px_10px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/90 outline-none transition-transform hover:ring-slate-300 focus-visible:ring-2 focus-visible:ring-white/45 focus-visible:ring-offset-2"
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
          <p className="mb-3 px-0.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white">
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

/** Card feature flag del Master Control Panel — stato espansione dettagli condiviso
 *  dal padre (useState non può essere chiamato dentro `.map()`: violerebbe le rules of hooks). */
function FeatureFlagCard({
  feature,
  t,
  enabled,
  isMaintenance,
  onToggle,
  detailsOpen,
  onToggleDetails,
}: {
  feature: { slug: string };
  t: Record<string, string>;
  enabled: boolean;
  isMaintenance: boolean;
  onToggle: () => Promise<void>;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  const { label: featureLabel, description: featureDescription, detailLines } = getFeatureStrings(t, feature.slug);

  const iconMap: Record<string, React.ReactNode> = {
    maintenance_mode: <Wrench className="w-4 h-4" />,
    unlock_with_pin:  <Unlock className="w-4 h-4" />,
    auto_breaks:      <Coffee className="w-4 h-4" />,
    staff_requests:   <Palmtree className="w-4 h-4" />,
    geofence_punch:   <MapPin className="w-4 h-4" />,
    visibility_management: <LayoutGrid className="w-4 h-4" />,
    department_creation: <Building2 className="w-4 h-4" />,
    violation_rules: <ShieldAlert className="w-4 h-4" />,
  };

  return (
    <div
      className={`rounded-xl border border-white/[0.14] flex h-full flex-col p-3.5 transition-colors hover:border-white/[0.14] md:p-4 active:brightness-95 ${
        isMaintenance && enabled ? 'border-red-500/40 bg-red-500/15' : ''
      }`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
          isMaintenance && enabled ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white'
        }`}>
          <span className="w-[1.125rem] h-[1.125rem]">{iconMap[feature.slug]}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-sm font-semibold leading-tight ${
                isMaintenance && enabled ? 'text-red-400' : 'text-white/90'
              }`}>{featureLabel}</p>
              <p className="text-[0.6875rem] md:text-xs text-white mt-1 leading-snug">{featureDescription}</p>
            </div>
            <ToggleSwitch
              isActive={enabled}
              onChange={() => void onToggle()}
              colorTheme={isMaintenance ? 'danger' : 'default'}
              size="sm"
              darkMode
              className="mt-0.5 flex-shrink-0"
            />
          </div>
          {detailLines.length > 0 && (
            <>
              <button type="button" aria-expanded={detailsOpen} onClick={onToggleDetails} className="mt-2 flex items-center gap-1 text-[0.6875rem] font-semibold text-white transition-colors">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${detailsOpen ? 'rotate-180' : ''}`} />
                {t.impostazioni_detail_label || 'Dettagli'}
              </button>
              {detailsOpen && (
                <div className="rounded-xl border border-white/[0.14] mt-2 bg-white/5 px-2.5 py-2">
                  <p className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wider text-white/60">{t.impostazioni_detail_label || 'Dettagli'}</p>
                  <ul className="list-disc space-y-1 pl-3.5 text-[0.6875rem] leading-relaxed text-white/70">
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

/* ── Riga utente memoizzata (sezione Gestione Profili) ──────────────────────
 * Prima ogni riga era inline nel componente: espandere il pannello "Cosa vede"
 * o cambiare stato su UN utente ri-renderizzava TUTTE le righe della lista (e
 * ogni keystroke nei form della pagina). La riga è React.memo: si aggiorna solo
 * se cambiano le sue props. (Il blocco "matrice permessi" era codice morto —
 * `expandedPermsUserId` non veniva mai impostato — ed è stato rimosso.)
 */
type SettingsUserRowProps = {
  user: User;
  canEdit: boolean;
  isVisibilityOpen: boolean;
  isDeleteConfirm: boolean;
  shareMenuOpen: boolean;
  currentUser: User;
  t: ReturnType<typeof getTranslations>;
  users: User[];
  showSuccess?: (message: string) => void;
  showError?: (message: string) => void;
  onEdit: (user: User) => void;
  onToggleStatus: (user: User) => void;
  onSetDeleteConfirm: (id: string | null) => void;
  onDeleteUser: (id: string) => void | Promise<unknown>;
  onSetVisibility: (id: string | null) => void;
  onSetShareMenu: (id: string | null) => void;
};

const SettingsUserRow = memo(function SettingsUserRow({
  user, canEdit, isVisibilityOpen, isDeleteConfirm, shareMenuOpen,
  currentUser, t, users, showSuccess, showError,
  onEdit, onToggleStatus, onSetDeleteConfirm, onDeleteUser, onSetVisibility, onSetShareMenu,
}: SettingsUserRowProps) {
  return (
    <div className={user.status !== 'active' ? 'opacity-60' : ''}>
      {/* ── User row ── */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2.5 gap-2">
        <button
          type="button"
          onClick={() => canEdit && onEdit(user)}
          className={`flex-1 min-w-0 text-left ${canEdit ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <span className="block truncate text-sm font-semibold uppercase text-white" title={user.first_name ?? ''}>{user.first_name ?? ''} {user.last_name ?? ''}
          </span>
          <span className="text-white/55 text-[0.6875rem] uppercase tracking-wider">
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
                  onSetShareMenu(shareMenuOpen ? null : user.id);
                }}
                className={`p-1.5 rounded-md border transition-colors ${shareMenuOpen ? 'text-accent border-white/30 bg-white/5' : 'text-white/40 border-white/20 hover:text-accent hover:border-white/30 hover:bg-white/5'} active:text-accent`}
              >
                <Link2 className="w-3.5 h-3.5" />
              </button>

              <AnimatePresence>
                {shareMenuOpen && (
                  <>
                    {/* backdrop invisibile per chiudere */}
                    <div
                      className="fixed inset-0 z-[60]"
                      onClick={(e) => { e.stopPropagation(); onSetShareMenu(null); }}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.92, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.92, y: -4 }}
                      transition={{ duration: 0.13 }}
                      className="absolute right-0 top-full mt-1.5 z-[61] w-52 rounded-xl border border-white/[0.14] bg-white/10 shadow-lg overflow-hidden"
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
                          onSetShareMenu(null);
                        }}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[0.75rem] font-medium text-white/80 hover:bg-white/5 transition-colors active:bg-white/10"
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
                onSetVisibility(isVisibilityOpen ? null : user.id);
              }}
              className={`px-2 py-1 text-[0.6875rem] font-bold uppercase rounded-md transition-colors border ${isVisibilityOpen ? 'bg-white/20 text-accent border-white/30 shadow-sm' : 'text-white/55 border-transparent hover:text-white/80'} active:text-white/80'}`}
            >
              {t.what_sees}
            </button>
          )}

          {/* Active toggle */}
          {canEdit && (
            <div className="flex items-center gap-1.5">
              {user.status !== 'active' && (
                isDeleteConfirm ? (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSetDeleteConfirm(null)}
                      className="rounded-lg border border-white/20 px-2 py-1 text-[0.6875rem] font-semibold text-white/55 hover:bg-white/10 active:bg-white/80"
                    >
                      {t.cancel ?? 'Annulla'}
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        onSetDeleteConfirm(null);
                        await onDeleteUser(user.id);
                        showSuccess?.(t.settings_delete_user_success);
                      }}
                      className="rounded-lg bg-red-600 px-2 py-1 text-[0.6875rem] font-bold text-white hover:bg-red-700 active:bg-red-700/80"
                    >
                      {t.settings_delete_user_title ?? 'Elimina'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetDeleteConfirm(user.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/15 text-red-400 transition-colors hover:bg-red-500/25 active:bg-red-500/80"
                    title={t.settings_delete_user_title}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )
              )}
              <ToggleSwitch
                isActive={user.status === 'active'}
                onChange={() => onToggleStatus(user)}
                size="sm"
                darkMode
                className="flex-shrink-0"
              />
            </div>
          )}
        </div>
      </div>

      {/* Permissions / Visibility panel */}
      <AnimatePresence>
        {isVisibilityOpen && canEdit && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/10 px-4 py-4 space-y-4" style={{ background: 'rgba(255,255,255,0.03)' }}>
              {isVisibilityOpen && (
                <ProfileVisibilityHub
                  initialSelectedUserId={user.id}
                  onClose={() => onSetVisibility(null)}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

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
  /** Regole di calcolo personalizzate (le due regole di sistema sono sempre disponibili). */
  const [customPeriodRules, setCustomPeriodRules] = useState<PeriodRule[]>(() => loadCustomPeriodRules());
  /** Id della regola di calcolo selezionata. */
  const [periodRuleId, setPeriodRuleId] = useState<string>(() => loadSelectedPeriodRuleId());
  /** Form di creazione regola. */
  const [showPeriodRuleForm, setShowPeriodRuleForm] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleType, setNewRuleType] = useState<PeriodRuleType>('last_sunday');
  /** Regola in attesa di conferma eliminazione. */
  const [deletingPeriodRule, setDeletingPeriodRule] = useState<PeriodRule | null>(null);

  const periodRules = useMemo(
    () => [...BUILTIN_PERIOD_RULES, ...customPeriodRules],
    [customPeriodRules]
  );
  const activePeriodRule =
    periodRules.find((r) => r.id === periodRuleId) ?? BUILTIN_PERIOD_RULES[0];
  const periodRuleMode = activePeriodRule.type;

  /** Ricarica le regole quando arrivano dal cloud o cambiano in un'altra vista. */
  useEffect(() => {
    const reload = () => setCustomPeriodRules(loadCustomPeriodRules());
    window.addEventListener(PERIOD_RULES_UPDATED_EVENT, reload);
    return () => window.removeEventListener(PERIOD_RULES_UPDATED_EVENT, reload);
  }, []);

  const periodRulesPersist = (rules: PeriodRule[]) => {
    setCustomPeriodRules(rules);
    saveCustomPeriodRules(rules);
    void savePeriodRulesToSupabase(rules).catch(() => { /* il locale resta valido */ });
  };

  /** Salva il periodo in bozza (NON conferma): cambia solo l'anteprima. */
  const setDraftFromConfig = (cfg: PeriodConfig) => {
    setPeriodDraftStart(cfg.startDate);
    setPeriodDraftWeeks(cfg.numWeeks);
    setPeriodDraftDirty(true);
  };

  /** Scarta la bozza: torna al periodo attualmente salvato. */
  const discardPeriodDraft = () => {
    setPeriodDraftStart(periodCfg.startDate);
    setPeriodDraftWeeks(periodCfg.numWeeks);
    setPeriodDraftDirty(false);
  };

  /** Seleziona una regola e ricalcola la bozza in base al suo tipo di calcolo. */
  const selectPeriodRule = (rule: PeriodRule) => {
    setPeriodRuleId(rule.id);
    saveSelectedPeriodRuleId(rule.id);
    setDraftFromConfig(
      rule.type === 'last_sunday'
        ? currentPeriodConfig()
        : periodConfigFromStartDate(parseISO(periodDraftStart || periodCfg.startDate))
    );
  };

  const handleCreatePeriodRule = () => {
    const name = newRuleName.trim();
    if (!name) return;
    const rule: PeriodRule = { id: createPeriodRuleId(), name: name.slice(0, 40), type: newRuleType };
    periodRulesPersist([...customPeriodRules, rule]);
    setShowPeriodRuleForm(false);
    setNewRuleName('');
    setNewRuleType('last_sunday');
    selectPeriodRule(rule);
    showSuccess?.('Regola creata');
  };

  const handleDeletePeriodRule = (rule: PeriodRule) => {
    periodRulesPersist(customPeriodRules.filter((r) => r.id !== rule.id));
    setDeletingPeriodRule(null);
    if (periodRuleId === rule.id) {
      selectPeriodRule(BUILTIN_PERIOD_RULES[0]);
    }
    showSuccess?.('Regola eliminata');
  };

  const applyPeriod = (cfg: PeriodConfig, ruleId?: string) => {
    const ruleIdToSave = ruleId ?? periodRuleId;
    saveSelectedPeriodRuleId(ruleIdToSave);
    setPeriodRuleId(ruleIdToSave);
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
  /** Master Control Panel: i pannelli «Cosa fa questo interruttore» si aprono/chiudono tutti insieme. */
  const [masterDetailsOpen, setMasterDetailsOpen] = useState(false);
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
    'w-full min-w-[10rem] max-w-[16rem] rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:border-accent focus:outline-none focus:ring-2 focus:ring-white/30';

  const updateWorkRule = useCallback(<K extends keyof WorkRules>(key: K, value: WorkRules[K]) => {
    const next = { ...workRules, [key]: value };
    setWorkRules(next);
    showSuccess?.(t.settings_work_rule_synced);
  }, [workRules, setWorkRules, showSuccess, t.settings_work_rule_synced]);

  /* Fasce progressive pausa automatica (card Regole violazioni): ogni riga è
     "turno ≥ Xh → Y minuti di pausa"; si applica la fascia più alta coperta. */
  const autoBreakTiers = workRules.autoBreakTiers ?? [];
  const updateAutoBreakTier = useCallback((idx: number, patch: Partial<AutoBreakTier>) => {
    updateWorkRule('autoBreakTiers', autoBreakTiers.map((tier, i) => (i === idx ? { ...tier, ...patch } : tier)));
  }, [autoBreakTiers, updateWorkRule]);
  const removeAutoBreakTier = useCallback((idx: number) => {
    updateWorkRule('autoBreakTiers', autoBreakTiers.filter((_, i) => i !== idx));
  }, [autoBreakTiers, updateWorkRule]);
  const addAutoBreakTier = useCallback(() => {
    const last = autoBreakTiers[autoBreakTiers.length - 1];
    updateWorkRule('autoBreakTiers', [
      ...autoBreakTiers,
      {
        minShiftMinutes: Math.round(((last?.minShiftMinutes ?? 6 * 60) + 2 * 60) / 30) * 30,
        breakMinutes: last?.breakMinutes ?? 30,
      },
    ]);
  }, [autoBreakTiers, updateWorkRule]);

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

  // Tratta l'utente come admin se è in sessione elevata o ha elevated_role (null-safe: usato dagli hook sotto)
  const adminOnly = isAdminOnly(currentUser) || isSessionElevated || !!currentUser?.elevated_role;
  const canEdit = canUserEdit(currentUser) || adminOnly;
  const canSeeSuspended = canViewSuspended(currentUser) || adminOnly;

  const handleToggleStatus = useCallback((user: User) => {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    updateUser(user.id, { status: newStatus });
  }, [updateUser]);

  // Memoizzati: prima filter+sort sull'intero array utenti a OGNI render
  // (toggle di sezioni, keystroke nei form, espansione pannelli…).
  const displayUsers = useMemo(
    () => users
      .filter((u) => {
        // Admin = profilo impostazioni puro: mai visibile nella lista team/dipendenti
        if (isPurelyManagementRole(u.role)) return false;
        if (u.status === 'active') return true;
        return showSuspended && canSeeSuspended && (u.status === 'suspended' || u.status === 'inactive');
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [users, showSuspended, canSeeSuspended]
  );

  /** Lista per la modalità staff delegato. */
  const displayUsersDelegated = useMemo(
    () => users
      .filter((u) => {
        if (!isOperationalStaffRole(u.role)) return false;
        if (u.status === 'active') return true;
        return showSuspended && (u.status === 'suspended' || u.status === 'inactive');
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [users, showSuspended]
  );

  if (!currentUser) return null;

  const isManager = isManagementRole(currentUser.role);

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
      <div className="pb-content pt-6 w-full font-sans">
        <p className="text-sm text-white/70">{t.no_access_settings}</p>
      </div>
    );
  }

  const staffDelegationMode = canManageDelegatedStaff(currentUser) && !adminOnly;

  if (staffDelegationMode) {
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
      <div className="pb-content pt-6 w-full font-sans">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <p className="mb-4 text-sm leading-relaxed text-white/70">
            {t.settings_delegated_intro}
          </p>
          <section className="mb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[0.6875rem] font-semibold uppercase tracking-widest text-white/80">
                {t.settings_team_section_title}
              </h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSuspended(!showSuspended)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/20 px-2.5 py-1.5 text-xs uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 hover:text-white active:text-white"
                >
                  {showSuspended ? t.hide_suspended : t.show_suspended}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateStaff(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 active:bg-white/10"
                >
                  <UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t.admin_add_employee}
                </button>
              </div>
            </div>
            <div
              className="divide-y divide-white/10 overflow-hidden rounded-xl"
              style={
                { border: '1px solid rgba(255,255,255,0.14)' }
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
                        <p className="text-[0.6875rem] uppercase tracking-wider text-white/55">
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
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 px-2.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 active:bg-white/10"
                        >
                          <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          Link accesso
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingUser(user)}
                          className="rounded-lg border border-white/20 px-2.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 active:bg-white/10"
                        >
                          {t.settings_delegated_view_profile}
                        </button>
                        {isActiveRow ? (
                          <button
                            type="button"
                            onClick={() => handleDelegateSuspend(user)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/15 px-2.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-red-400 transition-colors hover:bg-red-500/25 active:bg-red-500/80"
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
                                  className="rounded-lg border border-white/20 px-2 py-1 text-[0.6875rem] font-semibold text-white/55 hover:bg-white/10 active:bg-white/80"
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
                                  className="rounded-lg bg-red-600 px-2 py-1 text-[0.6875rem] font-bold text-white hover:bg-red-700 active:bg-red-700/80"
                                >
                                  {t.settings_delete_user_title ?? 'Elimina'}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmUserId(user.id)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/15 text-red-400 transition-colors hover:bg-red-500/25 active:bg-red-500/80"
                                title={t.settings_delete_user_title}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelegateReactivate(user)}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/35 bg-white/10 px-2.5 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-accent transition-colors hover:bg-white/15 active:bg-white/80"
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
    <div className="pb-content pt-6 w-full font-sans">
        <AnimatePresence>
          {importStatus && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`mb-4 rounded-xl border p-4 ${
 importStatus.type === 'success'
 ? 'border-white/40 bg-white/10 text-accent'
 : 'border-red-500/30 bg-red-500/15 text-red-400'
 }`}
            >
              {importStatus.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── SEZIONE: Gestione Profili ── */}
        <div style={view === 'regole' ? { display: 'none' } : undefined}>
        <section className="mb-4">
          <div className="flex w-full flex-row items-stretch gap-1.5 md:gap-2 mb-4">
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowCreateStaff(true)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/20 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 active:bg-white/10"
              >
                <UserPlus className="w-3.5 h-3.5" aria-hidden />
                {t.admin_add_employee}
              </button>
            )}
            {canSeeSuspended && (
              <button
                type="button"
                onClick={() => setShowSuspended(!showSuspended)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/20 px-2.5 py-1.5 text-xs uppercase tracking-wider text-white/70 transition-colors hover:bg-white/5 hover:text-white active:text-white"
              >
                {showSuspended ? t.hide_suspended : t.show_suspended}
              </button>
            )}
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.14)' }}>
            <button
              type="button"
              onClick={toggleTeamSectionExpanded}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-white/10 active:bg-white/10"
              aria-expanded={teamSectionExpanded}
            >
              <h2 className="text-[0.6875rem] font-semibold uppercase tracking-widest text-white/80">
                {t.settings_team_section_title}
              </h2>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${teamSectionExpanded ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>

          <AnimatePresence initial={false}>
            {teamSectionExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="overflow-hidden"
              >
                <div className="border-t border-white/10">
                <div
                  className="divide-y divide-white/10"
                >
              {displayUsers.map((user) => (
                <SettingsUserRow
                  key={user.id}
                  user={user}
                  canEdit={canEdit}
                  isVisibilityOpen={expandedVisibilityUserId === user.id}
                  isDeleteConfirm={deleteConfirmUserId === user.id}
                  shareMenuOpen={shareMenuUserId === user.id}
                  currentUser={currentUser as User}
                  t={t}
                  users={users}
                  showSuccess={showSuccess}
                  showError={showError}
                  onEdit={setEditingUser}
                  onToggleStatus={handleToggleStatus}
                  onSetDeleteConfirm={setDeleteConfirmUserId}
                  onDeleteUser={deleteUser}
                  onSetVisibility={setExpandedVisibilityUserId}
                  onSetShareMenu={setShareMenuUserId}
                />
              ))}
                </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </section>

        {/* Permessi per Ruolo — matrice (solo admin/elevati).
            Sezione sempre aperta e senza contenitore: la scheda visibile è solo quella del pannello. */}
        {adminOnly && (
          <section className="mb-4">
            <div className="flex items-baseline gap-2 mb-3">
              <h2 className="text-[0.8rem] font-semibold uppercase tracking-[0.08em] text-white">
                {t.settings_role_permissions_title ?? 'Permessi per Ruolo'}
              </h2>
              <p className="text-[0.8rem] text-white/65">
                {t.settings_role_permissions_subtitle ?? 'Configura le funzionalità accessibili per Manager, Capo e Staff'}
              </p>
            </div>
            <RoleFeatureTemplatesPanel variant="embedded" />
          </section>
        )}

        </div>{/* fine sezione Gestione Profili */}

        {/* ── SEZIONE: Gestione Regole ── */}
        <div style={view === 'profili' ? { display: 'none' } : undefined}>

        {/* Notifica team */}
        {adminOnly && (
          <div className="rounded-xl border border-white/[0.14] p-4 mb-4">
            <div className="flex items-center justify-between gap-3 mb-1">
              <h2 className="text-md font-bold flex items-center gap-2">
                <Bell className="w-4 h-4 text-white" />
                {t.admin_notify_team_title}
              </h2>
              <button
                type="button"
                disabled={teamNotifyLoading}
                onClick={() => void handleNotifyTeam()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                <Bell className="w-3.5 h-3.5 opacity-80" />
                {teamNotifyLoading ? '…' : t.admin_notify_team_button}
              </button>
            </div>
            <p className="text-[0.6875rem] md:text-xs text-white/70 leading-relaxed">
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
            attached
          >
            <div className="p-4 space-y-4">
              <p className="text-[0.6875rem] text-white/55 leading-snug">{t.settings_departments_cloud_hint}</p>
              {/* Lista reparti */}
              <div className="flex flex-wrap gap-2">
                {departments.map((d) => {
                  const isBuiltin = builtinValues.has(d.value);
                  const badgeColor = d.color ?? 'var(--brand)';
                  const chipBg = ensureWhiteTextContrast(badgeColor);
                  const isEditingChip = editingDeptValue === d.value;
                  return (
                    <div
                      key={d.value}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold uppercase text-white transition-shadow ${
 isEditingChip
 ? 'shadow-md ring-2 ring-white/90 ring-offset-2 ring-offset-slate-100'
 : ''
 }`}
                      style={{ backgroundColor: chipBg }}
                    >
                      <span className="truncate max-w-[10rem]" title={translateDepartmentValue(d.value, effectiveLanguage)}>{translateDepartmentValue(d.value, effectiveLanguage)}
                      </span>
                      {!isBuiltin && d.permissionCategory && (
                        <span
                          className="text-[0.6875rem] font-semibold normal-case opacity-90 border-l border-white/10 pl-1.5 shrink-0 max-w-[5.5rem] truncate"
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
                          className="text-[0.6875rem] font-semibold normal-case opacity-90 border-l border-white/10 pl-1.5 shrink-0 max-w-[5.5rem] truncate"
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
                  <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-white/40">
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
                        className="flex items-center gap-1.5 rounded-xl border border-dashed border-white/20 px-3 py-1.5 text-xs font-semibold text-white/55 transition-colors opacity-0 group-hover/missing:opacity-100 hover:bg-white/10 hover:border-white/50 hover:text-accent active:text-accent"
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
                    <div className="space-y-3 rounded-xl border border-white/25 bg-white/10 p-3">
                      <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-white/55">
                        {t.settings_dept_edit_title}
                      </p>
                      {builtinValues.has(editingDeptValue) && (
                        <p className="text-[0.6875rem] text-white/55 leading-snug">{t.settings_dept_builtin_edit_hint}</p>
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
                          className="min-w-0 flex-1 rounded-xl border border-white/20 px-3 py-2 text-base text-white focus:border-accent focus:outline-none focus:ring-2 focus:ring-white/30 md:min-w-[12rem]"
                        />
                        {!builtinValues.has(editingDeptValue) && (
                          <div>
                            <label className="block text-[0.6875rem] font-bold uppercase tracking-wider text-white/40 mb-1">
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
                            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-hover transition-colors disabled:opacity-40 active:bg-white/80"
                          >
                            <Check className="w-3.5 h-3.5" />
                            {t.save}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingDeptValue(null)}
                            className="rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white/70 surface-ghost-interactive"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </div>
                      {!builtinValues.has(editingDeptValue) && (
                        <p className="text-[0.6875rem] text-white/55 leading-snug">{t.settings_dept_permission_group_hint}</p>
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
                    className="min-w-[8rem] flex-1 px-3 py-2 rounded-xl border border-white/20 bg-transparent text-base text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-accent"
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
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 text-white text-xs font-semibold hover:bg-white/25 transition-colors disabled:opacity-40 active:bg-white/80"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t.settings_add_dept}
                  </button>
                </div>
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:gap-4">
                  <div className="shrink-0 md:w-56">
                    <label className="block text-[0.6875rem] font-bold uppercase tracking-wider text-white/40 mb-1">
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
                  <p className="text-[0.6875rem] text-white/60 leading-snug flex-1 pt-0 md:pt-5">
                    {t.settings_dept_permission_group_hint}
                  </p>
                </div>
              </div>
              <p className="text-[0.6875rem] text-white/60">{t.settings_builtin_depts_hint}</p>
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
            attached
          >
            <div className="fluid-grid fluid-grid-2 gap-3">
              {/* Critico */}
              <div className="rounded-xl border border-white/[0.14] depth-card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">{t.wst_violation_critical}</h3>
                </div>
                <p className="text-[0.6875rem] text-white/55 leading-snug">{t.wst_violation_critical_sub}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[0.6875rem] font-medium text-white/70">{t.settings_toggle_on}</span>
                  <ToggleSwitch
                    isActive={workRules.criticEnabled}
                    onChange={() => updateWorkRule('criticEnabled', !workRules.criticEnabled)}
                    size="sm"
                    darkMode
                    className="flex-shrink-0"
                  />
                </div>
                {workRules.criticEnabled && (
                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
                    <div>
                      <label className="block text-[0.6875rem] font-semibold text-white/55 mb-0.5">{t.settings_wr_max_shift_h}</label>
                      <input
                        type="number"
                        min={4}
                        max={14}
                        value={workRules.maxDailyHours}
                        onChange={(e) => updateWorkRule('maxDailyHours', Math.max(4, Math.min(14, +e.target.value || 9)))}
                        placeholder="0"
                        className="w-full rounded-xl border border-white/20 px-2 py-1 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[0.6875rem] font-semibold text-white/55 mb-0.5">{t.settings_wr_min_rest}</label>
                      <input
                        type="number"
                        min={6}
                        max={24}
                        value={workRules.minRestHours}
                        onChange={(e) => updateWorkRule('minRestHours', Math.max(6, Math.min(24, +e.target.value || 11)))}
                        placeholder="0"
                        className="w-full rounded-xl border border-white/20 px-2 py-1 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Attenzione */}
              <div className="rounded-xl border border-white/20 depth-card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15">
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">{t.wst_violation_attention}</h3>
                </div>
                <p className="text-[0.6875rem] text-white/55 leading-snug">{t.wst_violation_attention_sub}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[0.6875rem] font-medium text-white/70">{t.settings_toggle_on}</span>
                  <ToggleSwitch
                    isActive={workRules.attentionEnabled}
                    onChange={() => updateWorkRule('attentionEnabled', !workRules.attentionEnabled)}
                    size="sm"
                    darkMode
                    className="flex-shrink-0"
                  />
                </div>
                {workRules.attentionEnabled && (
                  <div className="grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
                    <div>
                      <label className="block text-[0.6875rem] font-semibold text-white/55 mb-0.5">{t.settings_wr_max_day}</label>
                      <input
                        type="number"
                        min={4}
                        max={14}
                        value={workRules.maxDailyHours}
                        onChange={(e) => updateWorkRule('maxDailyHours', Math.max(4, Math.min(14, +e.target.value || 9)))}
                        placeholder="0"
                        className="w-full rounded-xl border border-white/20 px-2 py-1 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                    <div>
                      <label className="block text-[0.6875rem] font-semibold text-white/55 mb-0.5">{t.settings_wr_max_week}</label>
                      <input
                        type="number"
                        min={20}
                        max={60}
                        value={workRules.maxWeeklyHours}
                        onChange={(e) => updateWorkRule('maxWeeklyHours', Math.max(20, Math.min(60, +e.target.value || 48)))}
                        placeholder="0"
                        className="w-full rounded-xl border border-white/20 px-2 py-1 text-base font-semibold text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Sovrapposizione */}
              <div className="rounded-xl border border-white/20 depth-card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/15 shadow-[0_0_6px_rgba(239,68,68,0.3)]">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">{t.wst_violation_overlap}</h3>
                </div>
                <p className="text-[0.6875rem] text-white/55 leading-snug">{t.wst_violation_overlap_sub}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[0.6875rem] font-medium text-white/70">{t.settings_toggle_on}</span>
                  <ToggleSwitch
                    isActive={workRules.overlapEnabled}
                    onChange={() => updateWorkRule('overlapEnabled', !workRules.overlapEnabled)}
                    size="sm"
                    darkMode
                    className="flex-shrink-0"
                  />
                </div>
              </div>

              {/* Pausa automatica — fasce progressive (soglia durata turno) */}
              <div className="rounded-xl border border-white/20 depth-card flex flex-col gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15">
                    <Timer className="w-4 h-4 text-amber-400" />
                  </span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">{t.settings_wr_auto_break_card_title}</h3>
                </div>
                <p className="text-[0.6875rem] text-white/55 leading-snug">{t.settings_wr_auto_break_tiers_hint}</p>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[0.6875rem] font-medium text-white/70">{t.settings_toggle_on}</span>
                  <ToggleSwitch
                    isActive={workRules.autoBreakTiersEnabled !== false}
                    onChange={() => updateWorkRule('autoBreakTiersEnabled', workRules.autoBreakTiersEnabled === false)}
                    size="sm"
                    darkMode
                    className="flex-shrink-0"
                  />
                </div>
                {workRules.autoBreakTiersEnabled !== false && (
                  <div className="space-y-1.5 border-t border-white/10 pt-2">
                    {autoBreakTiers.length === 0 && (
                      <p className="text-[0.6875rem] italic leading-relaxed text-white/45">{t.settings_wr_auto_break_no_tiers}</p>
                    )}
                    {autoBreakTiers.map((tier, idx) => (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0}
                          max={24}
                          step={0.5}
                          value={Math.round(tier.minShiftMinutes / 30) / 2}
                          onChange={(e) =>
                            updateAutoBreakTier(idx, { minShiftMinutes: Math.round(Math.max(0, Math.min(24, +e.target.value || 0)) * 60) })
                          }
                          aria-label={t.settings_wr_auto_break_tier_min_shift}
                          className="w-14 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm font-semibold text-white focus:border-accent focus:outline-none focus:ring-2 focus:ring-white/20"
                        />
                        <span className="text-[0.625rem] font-semibold uppercase text-white/45">h</span>
                        <span className="text-white/45">→</span>
                        <input
                          type="number"
                          min={0}
                          max={180}
                          step={5}
                          value={tier.breakMinutes}
                          onChange={(e) =>
                            updateAutoBreakTier(idx, { breakMinutes: Math.max(0, Math.min(180, Math.round(+e.target.value || 0))) })
                          }
                          aria-label={t.settings_wr_auto_break_tier_break}
                          className="w-14 rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-sm font-semibold text-white focus:border-accent focus:outline-none focus:ring-2 focus:ring-white/20"
                        />
                        <span className="text-[0.625rem] font-semibold uppercase text-white/45">min</span>
                        <button
                          type="button"
                          onClick={() => removeAutoBreakTier(idx)}
                          aria-label={t.settings_wr_auto_break_remove_tier}
                          className="ml-auto flex h-6 w-6 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-red-500/15 hover:text-red-500 active:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addAutoBreakTier}
                      className="flex items-center gap-1 text-[0.6875rem] font-semibold text-accent transition-colors hover:text-white active:text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {t.settings_wr_auto_break_add_tier}
                    </button>
                  </div>
                )}
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
            attached
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
                    className={`rounded-xl border border-white/[0.14] flex flex-col gap-3 p-4 transition-colors ${
 isEnabled
 ? ''
 : 'border-white/[0.14] opacity-70 bg-white/5'
 }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${rule.icon === 'moon' ? 'bg-blue-500/15' : 'bg-yellow-500/15'}`}>
                        {(() => {
                          const RuleIcon = getBreakRuleIconComponent(rule.icon);
                          return <RuleIcon className={`w-4 h-4 ${rule.icon === 'moon' ? 'text-blue-400' : 'text-yellow-400'}`} />;
                        })()}
                      </span>
                      <h3
                        className={`flex-1 truncate text-xs font-bold uppercase tracking-wider ${isEnabled ? 'text-white' : 'text-white/40'}`}
                       title={rule.title}>{rule.title}
                      </h3>
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <span className="text-[0.6875rem] font-medium text-white/70">{t.settings_toggle_on}</span>
                        <ToggleSwitch
                          isActive={isEnabled}
                          onChange={toggle}
                          size="sm"
                          darkMode
                          className="flex-shrink-0"
                        />
                        <button type="button" onClick={() => setEditingBreakRule(rule)} className="p-1.5 rounded-xl hover:bg-white/10 text-white/40 hover:text-white/80 transition-colors active:text-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => handleDeleteBreakRule(rule.id)} className="p-1.5 rounded-xl hover:bg-red-500/15 text-white/40 hover:text-red-500 transition-colors active:text-red-500 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[0.6875rem] text-white/55 leading-snug">
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

                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => { setEditingBreakRule(null); setCreatingBreakRule((v) => !v); }}
                className="flex min-h-[3rem] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-white/20 p-2 text-white/55 transition-colors hover:border-white/30 hover:bg-white/5 hover:text-white active:text-white"
              >
                <Plus className="w-6 h-6" />
                <span className="text-xs font-semibold">{t.settings_break_new_rule}</span>
              </button>
            </div>

            {(creatingBreakRule || editingBreakRule) && (
              <BreakRuleForm
                key={editingBreakRule?.id ?? 'new'}
                rule={editingBreakRule ?? undefined}
                onSave={handleSaveBreakRule}
                onClose={() => { setCreatingBreakRule(false); setEditingBreakRule(null); }}
              />
            )}
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
            attached
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3 mt-2 px-[9px]">
                <p className="text-[0.75rem] text-white/55 leading-relaxed">
                  {t.settings_week_template_manage_hint ?? 'Template salvati dal tabellone turni, riapplicabili a qualsiasi settimana.'}
                </p>

                {/* Refresh button */}
                <button
                  type="button"
                  onClick={loadShiftTemplates}
                  disabled={shiftTemplatesLoading}
                  className="flex flex-shrink-0 items-center gap-1.5 text-[0.75rem] text-blue-600 font-medium disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${shiftTemplatesLoading ? 'animate-spin' : ''}`} />
                  {shiftTemplatesLoading ? 'Aggiornamento…' : 'Aggiorna lista'}
                </button>
              </div>

              {/* Empty state */}
              {!shiftTemplatesLoading && shiftTemplates.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  {/* `text-slate-400` (→ 0.50 bianco): il namespace `text-white/*` è forzato a ≥0.85, quindi non può rendere l'icona subordinata al testo. */}
                  <CalendarDays className="h-8 w-8 text-slate-400" />
                  <p className="text-[0.8125rem] text-white/40">{t.settings_no_templates_saved ?? 'Nessun template salvato.'}</p>
                  <p className="text-[0.6875rem] text-white/60">Salva una settimana dal tabellone turni usando il menu Template.</p>
                </div>
              )}

              {/* Template cards */}
              {shiftTemplates.length > 0 && (
                <div className="fluid-grid fluid-grid-2 gap-2.5">
                  {shiftTemplates.map((tmpl) => {
                    const tplLocale = getDateLocale(effectiveLanguage);
                    const tplDay = (d: number) => {
                      const n = format(new Date(2024, 0, 7 + d), 'EEE', { locale: tplLocale });
                      return n.charAt(0).toUpperCase() + n.slice(1);
                    };
                    const isDeletingThis = shiftTemplateDeleting === tmpl.name;
                    return (
                      <div
                        key={tmpl.name}
                        className="rounded-xl border border-white/[0.14] rounded-lg p-3 flex items-start gap-3"
                      >
                        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-black flex items-center justify-center">
                          <BookTemplate className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="flex-1 min-w-0 flex items-center gap-2">
                          <p className="text-[0.8125rem] font-semibold text-white truncate" title={tmpl.name}>{tmpl.name}</p>
                          <p className="text-[0.6875rem] text-white/55 whitespace-nowrap">
                            {tmpl.count} {tmpl.count !== 1 ? (t.shift_plural ?? 'turni') : (t.shift_singular ?? 'turno')} · {tmpl.days.map((d) => tplDay(d)).join(', ')}
                          </p>
                          {tmpl.created_at && (
                            <p className="text-[0.6875rem] text-white/60 whitespace-nowrap">
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
            attached
          >
            <div className="p-4 space-y-4">

              {/* Periodo attivo + bozza */}
              <div className="grid grid-cols-2 gap-3">
                {/* Periodo attivo: mostra anteprima della regola selezionata */}
                {(() => {
                  const previewStart = parseISO(periodCfg.startDate);
                  const previewEnd = getPeriodEndDate(periodCfg);
                  const ruleName = activePeriodRule.name;
                  return (
                    <div className="rounded-xl border-2 border-l-4 border-white/25 border-l-white/60 bg-transparent px-3 py-2.5">
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-white/40">
                          Periodo attivo
                        </p>
                        <span className="text-[0.6875rem] font-extrabold uppercase tracking-wide text-white">
                          · {ruleName}
                        </span>
                      </div>
                      <p className="text-[0.8125rem] font-bold text-white tabular-nums">
                        {format(previewStart, 'dd/MM/yy')}
                        <span className="text-white/40 font-normal"> → </span>
                        {format(previewEnd, 'dd/MM/yy')}
                      </p>
                      <p className="text-[0.6875rem] mt-0.5 text-white/70">
                        {periodCfg.numWeeks} sett.
                      </p>
                    </div>
                  );
                })()}
                {/* Bozza (non ancora salvata) */}
                {periodDraftDirty ? (
                  <div className="relative rounded-xl border-2 border-l-4 border-amber-400/40 border-l-amber-400 bg-amber-400/10 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={discardPeriodDraft}
                      title="Scarta bozza"
                      aria-label="Scarta bozza"
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md text-amber-300 transition-colors hover:bg-white/10 hover:text-white active:brightness-95"
                    >
                      <X className="h-3 w-3" aria-hidden />
                    </button>
                    <p className="mb-1 pr-6 text-[0.6875rem] font-bold uppercase tracking-wider text-amber-300">
                      Bozza non salvata
                    </p>
                    <p className="text-[0.8125rem] font-bold text-white tabular-nums">
                      {format(parseISO(periodDraftStart), 'dd/MM/yy')}
                      <span className="text-white/40 font-normal"> → </span>
                      {format(addDays(parseISO(periodDraftStart), periodDraftWeeks * 7 - 1), 'dd/MM/yy')}
                    </p>
                    <p className="text-[0.6875rem] text-amber-300 mt-0.5">
                      {periodDraftWeeks} sett. · premi Salva per confermare
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/[0.14] bg-transparent px-3 py-2.5 flex items-center justify-center">
                    <p className="text-[0.6875rem] text-white/60 text-center leading-snug">
                      Nessuna modifica in bozza
                    </p>
                  </div>
                )}
              </div>

              {/* ── Selettore regola ────────────────────────────────────────── */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-white/40">
                    Regola di calcolo
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowPeriodRuleForm((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/10 active:brightness-95"
                  >
                    <Plus className="h-3 w-3" aria-hidden />
                    Nuova regola
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {periodRules.map((rule) => {
                    const isSelected = rule.id === activePeriodRule.id;
                    const isLastSunday = rule.type === 'last_sunday';
                    return (
                      <div
                        key={rule.id}
                        className={`flex items-stretch rounded-xl border-2 transition-colors ${
                          isSelected ? 'border-white/60 bg-white/10' : 'border-white/20 bg-white/10'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => selectPeriodRule(rule)}
                          className="flex min-w-0 flex-1 flex-col items-start gap-1 rounded-l-xl px-3 py-2.5 text-left active:brightness-95"
                        >
                          <span
                            className={`break-words text-[0.6875rem] font-extrabold uppercase tracking-wide ${
                              isSelected ? 'text-white' : 'text-white/70'
                            }`}
                          >
                            {rule.name}
                          </span>
                          <span className="break-words text-[0.6875rem] leading-snug text-white/40">
                            {isLastSunday
                              ? "Il periodo termina sull'ultima dom. del mese"
                              : 'Imposti la data di inizio, il sistema calcola la fine'}
                          </span>
                        </button>
                        {!isBuiltinPeriodRule(rule.id) && (
                          <button
                            type="button"
                            onClick={() => setDeletingPeriodRule(rule)}
                            title="Elimina regola"
                            aria-label={`Elimina regola ${rule.name}`}
                            className="flex w-8 shrink-0 items-center justify-center rounded-r-xl text-white/40 transition-colors hover:bg-white/10 hover:text-white active:brightness-95"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Creazione regola personalizzata */}
                {showPeriodRuleForm && (
                  <div className="mt-2 space-y-2 rounded-xl border-2 border-dashed border-white/20 bg-white/5 p-3">
                    <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-white/40">
                      Nuova regola
                    </p>
                    <input
                      type="text"
                      value={newRuleName}
                      onChange={(e) => setNewRuleName(e.target.value)}
                      maxLength={40}
                      placeholder="Nome regola (es. Periodo estivo)"
                      aria-label="Nome della nuova regola"
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-white/40 focus:outline-none focus:ring-2 focus:ring-white/30"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      {BUILTIN_PERIOD_RULES.map((builtin) => (
                        <button
                          key={builtin.id}
                          type="button"
                          onClick={() => setNewRuleType(builtin.type)}
                          className={`rounded-xl border-2 px-3 py-2 text-left transition-colors ${
                            newRuleType === builtin.type
                              ? 'border-white/60 bg-white/10'
                              : 'border-white/20 bg-white/10'
                          } active:brightness-95`}
                        >
                          <span
                            className={`text-[0.6875rem] font-extrabold uppercase tracking-wide ${
                              newRuleType === builtin.type ? 'text-white' : 'text-white/70'
                            }`}
                          >
                            {builtin.name}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!newRuleName.trim()}
                        onClick={handleCreatePeriodRule}
                        className="flex-1 rounded-xl bg-[rgba(255,255,255,0.18)] py-2 text-[0.6875rem] font-bold uppercase tracking-wider text-white transition-colors hover:bg-[rgba(255,255,255,0.26)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Crea regola
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowPeriodRuleForm(false);
                          setNewRuleName('');
                          setNewRuleType('last_sunday');
                        }}
                        className="flex-1 rounded-xl border border-white/20 py-2 text-[0.6875rem] font-bold uppercase tracking-wider text-white/70 transition-colors hover:bg-white/10 active:brightness-95"
                      >
                        Annulla
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Configurazione in base alla regola selezionata ───────────── */}
              {periodRuleMode === 'fixed_start' && (
                /* Regola "Primo giorno": l'utente imposta la data di inizio */
                <div>
                  <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wider text-white/40">
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
                    className="mb-3 w-full !border-white/20 !bg-white/10"
                  />
                  {/* Preview periodo calcolato dalla data scelta */}
                  {(() => {
                    const draftStart = parseISO(periodDraftStart || periodCfg.startDate);
                    const cfg = periodConfigFromStartDate(draftStart);
                    const endDate = addDays(draftStart, cfg.numWeeks * 7 - 1);
                    return (
                      <div className="flex items-center justify-between rounded-xl border border-white/[0.14] bg-white/[0.06] px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[0.6875rem] font-bold text-white">Primo giorno</span>
                          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[0.6875rem] font-bold text-white/70">
                            {cfg.numWeeks} sett.
                          </span>
                        </div>
                        <span className="text-[0.6875rem] tabular-nums font-semibold text-white/70">
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
                onClick={() => applyPeriod({ startDate: periodDraftStart, numWeeks: periodDraftWeeks }, periodRuleId)}
                className={`w-full rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-colors ${
 !periodDraftDirty || periodSavingCloud
 ? 'cursor-not-allowed'
 : 'hover:opacity-90 '
 }`}
                style={!periodDraftDirty || periodSavingCloud
                  ? { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }
                  : { background: 'transparent', color: '#ffffff', border: '1px solid rgba(255,255,255,0.20)' }
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
            attached
          >
            <div className="p-4">
              <p className="text-[0.6875rem] text-white/55 mb-3 leading-snug">{t.settings_presence_section_hint}</p>
              {(() => {
                const effectiveTok = resolveEffectiveVerificationToken(presenceVerificationConfig);
                const diskTok = presenceVerificationConfig.verificationToken?.trim() ?? '';
                const preview =
                  effectiveTok.length > 20 ? `${effectiveTok.slice(0, 20)}…` : effectiveTok || '—';
                return (
                  <div className="rounded-xl border border-white/[0.14] mb-3 space-y-1.5 px-3 py-2">
                    <p className="text-[0.6875rem] leading-snug text-white/80">
                      {effectiveTok
                        ? formatTrans(t.settings_presence_effective_token_preview, { preview })
                        : t.settings_presence_token_none}
                    </p>
                    {!diskTok && effectiveTok ? (
                      <p className="text-[0.6875rem] text-white/55 leading-snug">{t.settings_presence_token_env_only}</p>
                    ) : null}
                  </div>
                );
              })()}
              <div className="rounded-xl border border-white/[0.14] mb-3 flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="text-xs font-semibold text-white">{t.settings_presence_require_label}</span>
                <ToggleSwitch
                  isActive={presenceVerificationConfig.requireVerification === true}
                  onChange={async (next) => {
                    try {
                      await savePresenceVerificationConfig({
                        ...presenceVerificationConfig,
                        requireVerification: next,
                      });
                      showSuccess?.(t.settings_presence_saved);
                    } catch (e) {
                      showError?.(e instanceof Error ? e.message : t.settings_presence_save_error);
                    }
                  }}
                  size="sm"
                  darkMode
                  className="flex-shrink-0"
                />
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
                  className="inline-flex min-h-[2.5rem] items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-accent-hover disabled:opacity-60 active:bg-white/80"
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
            attached
          >
            <div className="p-4 space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-mid/10 text-white">
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
                    className="w-full !pl-9 !pr-3 py-2.5 rounded-xl border border-transparent bg-transparent text-base text-white placeholder:text-white/60 outline-none transition-colors focus:border-transparent focus:ring-0 focus:shadow-none"
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
            attached
          >
            {/* Feature flag cards */}
            {/* Griglia feature flag: righe uniformi (auto-rows-fr) così tutte le card hanno la stessa altezza */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 auto-rows-fr">
              {FEATURE_DEFINITIONS.filter((f) => !['staff_requests', 'unlock_with_pin'].includes(f.slug)).map((feature) => {
                const enabled = featureFlags[feature.slug] !== false;
                const isMaintenance = feature.slug === 'maintenance_mode';
                return (
                  <FeatureFlagCard
                    key={feature.slug}
                    feature={feature}
                    t={t}
                    enabled={enabled}
                    isMaintenance={isMaintenance}
                    detailsOpen={masterDetailsOpen}
                    onToggleDetails={() => setMasterDetailsOpen((v) => !v)}
                    onToggle={async () => {
                      await setFeatureFlag(feature.slug, !enabled);
                      showSuccess?.(formatTrans(enabled ? t.settings_feature_toggle_off : t.settings_feature_toggle_on, { name: getFeatureStrings(t, feature.slug).label }));
                    }}
                  />
                );
              })}
            </div>

            <div className="rounded-xl border border-white/[0.14] mt-0 bg-white/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4 flex-shrink-0 text-white" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  {t.settings_geofence_editor_title}
                </h3>
              </div>
              <p className="text-[0.6875rem] text-white/55 mb-3 leading-snug">
                {t.settings_geofence_editor_hint}
              </p>
              {geofenceEffectiveConfig && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-brand-200/80 bg-brand-50/90 px-3 py-2">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-white" aria-hidden />
                  <p className="text-[0.6875rem] leading-snug text-brand-900">
                    {formatTrans(t.settings_geofence_active_summary, {
                      lat: geofenceEffectiveConfig.lat.toFixed(6),
                      lng: geofenceEffectiveConfig.lng.toFixed(6),
                      radius: String(Math.round(geofenceEffectiveConfig.radiusM)),
                    })}
                  </p>
                </div>
              )}
              <div className="fluid-grid fluid-grid-4 gap-2 mb-3">
                <label className="flex flex-col gap-1 text-[0.6875rem] font-medium text-white/70">
                  {t.settings_geofence_lat}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={geoLat}
                    onChange={(e) => setGeoLat(e.target.value)}
                    className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-base text-white"
                    placeholder="45.123456"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[0.6875rem] font-medium text-white/70">
                  {t.settings_geofence_lng}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={geoLng}
                    onChange={(e) => setGeoLng(e.target.value)}
                    className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-base text-white"
                    placeholder="9.123456"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[0.6875rem] font-medium text-white/70">
                  {t.settings_geofence_radius}
                  <input
                    type="text"
                    inputMode="numeric"
                    value={geoRadius}
                    onChange={(e) => setGeoRadius(e.target.value)}
                    className="rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-base text-white"
                    placeholder="120"
                  />
                </label>
                <button
                  type="button"
                  disabled={geoAcquiring}
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
                  className="inline-flex min-h-[2.5rem] items-center justify-center gap-2 rounded-xl border border-white/20 px-4 text-xs font-bold uppercase tracking-wider text-white/80 disabled:opacity-60"
                >
                  <LocateFixed className="h-4 w-4 shrink-0 text-white" aria-hidden />
                  {geoAcquiring ? t.ui_ellipsis : t.settings_geofence_acquire_gps}
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
            attached
          >
            <div className="space-y-3 p-4">
                <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-white/40">{t.settings_backup_data_section}</p>

                {dataToolsLocked ? (
                  /* ── Stato bloccato ── */
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.14] bg-white/5 py-3 px-3">
                    <Lock className="h-5 w-5 text-white/40" />
                    <p className="text-[0.75rem] text-center text-white/55 leading-snug">
                      Sezione protetta.<br/>Inserisci il tuo PIN per sbloccare.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setDataToolsPin(''); setDataToolsPinError(''); setShowDataToolsPinPad(true); }}
                      className="flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/15 px-4 py-2 text-[0.75rem] font-semibold text-white shadow-sm hover:bg-white/25 transition-colors"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Sblocca con PIN
                    </button>
                  </div>
                ) : (
                  /* ── Stato sbloccato ── */
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[0.6875rem] font-semibold text-emerald-600 flex items-center gap-1">
                        <Unlock className="h-3 w-3" /> Sbloccato
                      </span>
                      <button
                        type="button"
                        onClick={() => setDataToolsLocked(true)}
                        className="text-[0.6875rem] text-white/60 hover:text-white/70 transition-colors active:text-white/70"
                      >
                        Blocca di nuovo
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={handleImportClick}
className="rounded-lg rounded-xl border border-white/20 px-3 py-2 text-xs font-medium uppercase text-white/70 surface-ghost-interactive transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                      >
                        {t.restore}
                      </button>
                      <button
                        type="button"
                        onClick={() => exportToJSON({ users, shifts, punchRecords, holidays })}
                        className="rounded-lg rounded-xl border border-white/20 px-3 py-2 text-xs font-medium uppercase text-white/70 surface-ghost-interactive"
                      >
                        {t.backup_json}
                      </button>
                    </div>
                  </div>
                )}
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
            attached
          >
            <div className="p-4">
              <ElevatedAccessPanel />
            </div>
          </SettingsAccordionSection>
        )}

        {/* ── Sincronizzazione cloud — in fondo alla scheda ─────────────────── */}
        {adminOnly && (
          <div className="rounded-2xl border border-white/25 bg-white/5 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <UploadCloud className="h-5 w-5 text-white" style={{ color: '#fff' }} aria-hidden />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t.settings_cloud_sync_heading}</p>
                <button
                  type="button"
                  onClick={() => setCloudHintExpanded(!cloudHintExpanded)}
                  className="mt-0.5 flex items-center gap-1 text-[0.6875rem] font-semibold transition-colors"
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
                <p className="text-[0.6875rem] font-semibold mt-1.5" style={{ color: 'rgba(255,255,255,0.85)' }}>
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
            <div className="flex flex-col md:flex-row gap-2 md:shrink-0">
              <button
                type="button"
                disabled={pullSyncBusy || pushSyncBusy || dataSyncInProgress}
                onClick={() => void handlePullSync()}
                className="inline-flex w-full md:w-auto min-h-[2.5rem] items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-accent-dark disabled:opacity-60 shadow-sm shadow-white/30 transition-colors active:bg-white/80 whitespace-nowrap"
              >
                <RefreshCw className={`h-4 w-4 ${pullSyncBusy ? 'animate-spin' : ''}`} />
                {pullSyncBusy ? t.ui_ellipsis : 'Sincronizza'}
              </button>
              <button
                type="button"
                disabled={pushSyncBusy || settingsCloudPushBusy || pullSyncBusy || dataSyncInProgress}
                onClick={() => void handlePushSync()}
                className="inline-flex w-full md:w-auto min-h-[2.5rem] items-center justify-center gap-2 rounded-xl bg-accent px-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-accent-dark disabled:opacity-60 shadow-sm shadow-white/30 transition-colors active:bg-white/80 whitespace-nowrap"
              >
                <UploadCloud className={`h-4 w-4 text-white ${pushSyncBusy ? 'animate-spin' : ''}`} style={{ color: '#fff' }} />
                {pushSyncBusy ? t.ui_ellipsis : 'Carica sul cloud'}
              </button>
            </div>
          </div>
        )}

        </div>{/* fine sezione Gestione Regole */}

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

      {/* Modale eliminazione regola di calcolo periodo */}
      {deletingPeriodRule && (
        <CenteredModalPortal
          open
          onClose={() => setDeletingPeriodRule(null)}
          maxWidthClass="max-w-sm"
        >
          <div className="p-1">
            <div className="mb-4 flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                <Trash2 className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">Elimina regola</h3>
                <p className="mt-0.5 text-xs text-white/55">
                  La regola «{deletingPeriodRule.name}» verrà rimossa. Il periodo attivo non cambia.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleDeletePeriodRule(deletingPeriodRule)}
                className="flex-1 rounded-xl bg-white/[0.18] py-2.5 text-xs font-semibold uppercase text-white transition-colors hover:bg-white/25 active:bg-white/80"
              >
                Elimina
              </button>
              <button
                type="button"
                onClick={() => setDeletingPeriodRule(null)}
                className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-semibold uppercase text-white/70 transition-colors hover:bg-white/15 active:bg-white/80"
              >
                Annulla
              </button>
            </div>
          </div>
        </CenteredModalPortal>
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
                style={{ backgroundColor: ensureWhiteTextContrast(deletingDept.color) }}
              >
                <Trash2 className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-white">
                  Elimina reparto
                </h3>
                <p className="mt-0.5 text-xs text-white/55">
                  <span
                    className="inline-block rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold text-white"
                    style={{ backgroundColor: ensureWhiteTextContrast(deletingDept.color) }}
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
                        <div key={u.id} className="flex items-center gap-2 rounded-xl border border-white/[0.14] bg-white/10 px-3 py-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[0.6875rem] font-bold text-accent">
                            {initials}
                          </div>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-white/80" title={u.first_name}>{u.first_name} {u.last_name}
                          </span>
                          <select
                            value={reassignMap[u.id] ?? ''}
                            onChange={e => setReassignMap(m => ({ ...m, [u.id]: e.target.value }))}
                            className="min-w-0 max-w-[8.125rem] shrink rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-base font-semibold text-white/80 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-white/30"
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
        <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/40 p-4">
          <div className="modal-glass-panel w-full max-w-sm rounded-2xl p-6">
            <h3 className="mb-2 text-sm font-semibold text-white">{t.attention}</h3>
            <p className="mb-4 text-sm text-white/80">{t.import_warning}</p>
            <p className="mb-4 break-all text-center font-sans text-xs tabular-nums text-white/70">{importFile.name}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmImport}
className="flex-1 rounded-xl bg-accent py-2.5 text-xs font-semibold uppercase text-white hover:bg-accent-hover active:bg-white/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
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

// ── BreakRuleForm (pannello inline, come la creazione regola di periodo) ───────

const BREAK_MODAL_ROLE_VALUES: UserRole[] = ['waiter', 'server', 'bartender', 'cook', 'chef', 'dishwasher'];

function makeId() {
  return Math.random().toString(36).slice(2, 11);
}

function BreakRuleForm({
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

  /* Ruoli raggruppati per etichetta tradotta: waiter+server → "Cameriere", cook+chef → "Cuoco".
     Un solo chip per gruppo; selezionarlo attiva tutti i codici del gruppo. */
  const roleGroups = useMemo(() => {
    const byLabel = new Map<string, string[]>();
    for (const code of BREAK_MODAL_ROLE_VALUES) {
      const label = translateRole(code, effectiveLanguage);
      const group = byLabel.get(label) ?? [];
      group.push(code);
      byLabel.set(label, group);
    }
    return Array.from(byLabel.entries());
  }, [effectiveLanguage]);

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
  const [icon, setIcon] = useState(rule?.icon ?? 'coffee');

  /* Tab per sezione: il contenuto si espande con la tab attiva */
  const [activeTab, setActiveTab] = useState<'general' | 'assign' | 'apply'>('general');

  /* Altezza massima dei contenuti: la modale resta centrata e l'header fermo */
  const tabContentRef = useRef<HTMLDivElement>(null);
  const [maxTabContentHeight, setMaxTabContentHeight] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const el = tabContentRef.current;
      if (!el) return;
      const h = el.scrollHeight;
      setMaxTabContentHeight((prev) => (prev === null || h > prev ? h : prev));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [activeTab]);

  const tabOptions = [
    { id: 'general' as const, label: t.settings_break_section_general },
    { id: 'assign' as const, label: t.settings_break_assign_section },
    { id: 'apply' as const, label: t.settings_break_apply_section },
  ];

  const toggleChip = <T,>(arr: T[], val: T): T[] =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !breakStart || !breakEnd) {
      setActiveTab('general');
      return;
    }
    onSave({
      id: rule?.id ?? makeId(),
      title: title.trim(),
      icon,
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
    'w-full rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-base font-semibold text-white transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-white/20';
  const chipClass = (active: boolean) =>
    `cursor-pointer px-2.5 py-1 text-xs font-semibold transition-colors ${
      active
        ? 'rounded-full border border-white/60 bg-white/25 text-white'
        : 'rounded-xl border border-white/20 !rounded-full text-white/70 hover:border-white/45 hover:bg-white/10 hover:text-white'
    }`;

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 380 }}
      onSubmit={handleSubmit}
      className="mt-2 space-y-3 rounded-xl border-2 border-dashed border-white/20 bg-white/5 p-3 font-sans"
    >
        <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-white/40">
          {isEdit ? t.settings_break_save_changes : t.settings_break_new_rule}
        </p>
        {/* Tab + azioni in un unico elemento */}
        <div className="flex items-center gap-1 rounded-xl border border-white/20 bg-white/10 p-1">
            {tabOptions.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
                  activeTab === tab.id ? 'bg-white/25 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
            <div className="mx-1 h-5 w-px shrink-0 bg-white/20" aria-hidden />
            <GradientIconButton
              type="submit"
              label={isEdit ? t.settings_break_save_changes : t.settings_break_create_rule}
              gradientFrom="#94a3b8"
              gradientTo="#475569"
              className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30 active:brightness-95"
            >
              <Check className="h-4 w-4 shrink-0" />
            </GradientIconButton>
            <GradientIconButton
              label={t.close}
              onClick={onClose}
              gradientFrom="#94a3b8"
              gradientTo="#475569"
              className="rounded-lg bg-white/20 p-2 text-white/70 hover:bg-white/30 hover:text-white"
            >
              <X className="h-4 w-4 shrink-0" />
            </GradientIconButton>
          </div>

        {/* Contenuto — si apre come un cassetto al cambio tab (altezza minima = max contenuto) */}
        <div
          ref={tabContentRef}
          style={maxTabContentHeight !== null ? { minHeight: maxTabContentHeight } : undefined}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 28 }}
              transition={{ type: 'spring', damping: 30, stiffness: 380 }}
            >
              {activeTab === 'general' && (
            <div className="space-y-3">
              {/* Icona */}
              <div>
                <label className={labelClass}>{t.settings_break_icon_label}</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(BREAK_RULE_ICONS).map(([key, Icon]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setIcon(key)}
                      aria-label={getBreakRuleIconLabel(key, t)}
                      title={getBreakRuleIconLabel(key, t)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                        icon === key
                          ? 'border-white/60 bg-white/25 text-white'
                          : 'border-white/20 text-white/60 hover:border-white/45 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>
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
                    className="w-full border-white/20 bg-white/10"
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.settings_break_label_end}</label>
                  <TimeInputField
                    value={breakEnd}
                    onChange={setBreakEnd}
                    aria-label={t.settings_break_label_end}
                    className="w-full border-white/20 bg-white/10"
                  />
                </div>
              </div>

              {/* Retribuita / Non retribuita — tutto su una sola riga */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-white/55">{t.settings_break_type_label}</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setPaid(false)} className={chipClass(!paid)}>
                    {t.settings_break_unpaid_btn}
                  </button>
                  <button type="button" onClick={() => setPaid(true)} className={chipClass(paid)}>
                    {t.settings_break_paid_btn}
                  </button>
                </div>
                <p className="text-[0.6875rem] text-white/60">{paid ? t.settings_break_paid_hint : t.settings_break_unpaid_hint}</p>
              </div>
            </div>
          )}

          {activeTab === 'assign' && (
            <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
              <div className="flex-1 min-w-0">
                <label className="mb-1.5 flex items-baseline gap-1 text-xs font-semibold uppercase tracking-wide text-white/55">
                  {t.settings_break_label_depts}
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap font-normal normal-case tracking-normal text-white/40">{t.settings_break_none_means_all}</span>
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
              <div className="flex-[1.25] min-w-0">
                <label className="mb-1.5 flex items-baseline gap-1 text-xs font-semibold uppercase tracking-wide text-white/55">
                  {t.settings_break_label_roles}
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap font-normal normal-case tracking-normal text-white/40">{t.settings_break_none_means_all}</span>
                </label>
                <div className="flex flex-wrap gap-1">
                  {roleGroups.map(([label, codes]) => {
                    const groupSelected = codes.every((c) => roles.includes(c));
                    const toggleGroup = () =>
                      setRoles((prev) => {
                        const without = prev.filter((r) => !codes.includes(r));
                        return groupSelected ? without : [...without, ...codes];
                      });
                    return (
                      <button
                        key={codes.join(',')}
                        type="button"
                        onClick={toggleGroup}
                        className={`${chipClass(groupSelected)} !px-2`}
                        title={codes.join(', ')}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'apply' && (
            <div className="space-y-3">
              {/* Soglia turno: condizione di applicazione (durata minima del turno) */}
              <div className="space-y-3 rounded-xl border border-white/[0.14] bg-white/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/80">{t.settings_break_shift_threshold_title}</p>
                    <p className="text-[0.6875rem] text-white/55 mt-0.5 leading-snug">
                      {minShiftThresholdOn ? t.settings_break_shift_threshold_on : t.settings_break_shift_threshold_off}
                    </p>
                  </div>
                  <ToggleSwitch
                    isActive={minShiftThresholdOn}
                    onChange={() => setMinShiftThresholdOn((v) => !v)}
                    size="sm"
                    darkMode
                    className="flex-shrink-0"
                  />
                </div>
                {minShiftThresholdOn && (
                  <div className="flex items-center gap-3 border-t border-white/10 pt-1">
                    <span className="shrink-0 text-[0.6875rem] font-semibold uppercase text-white/55">{t.settings_break_min_label}</span>
                    <button
                      type="button"
                      onClick={() => setMinHours((h) => Math.max(0.5, Math.round((h - 0.5) * 10) / 10))}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 font-bold text-white/80 hover:border-white/45 hover:bg-white/10 hover:text-white"
                    >−</button>
                    <span className="w-16 text-center text-sm font-bold text-white">{minHours}h</span>
                    <button
                      type="button"
                      onClick={() => setMinHours((h) => Math.min(12, Math.round((h + 0.5) * 10) / 10))}
                      className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/20 font-bold text-white/80 hover:border-white/45 hover:bg-white/10 hover:text-white"
                    >+</button>
                  </div>
                )}
              </div>

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
                <label className="mb-1.5 flex items-baseline gap-1 text-xs font-semibold uppercase tracking-wide text-white/55">
                  {t.settings_break_weekdays}
                  <span className="min-w-0 flex-1 truncate whitespace-nowrap font-normal normal-case tracking-normal text-white/40">{t.settings_break_none_means_all}</span>
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
          )}
            </motion.div>
          </AnimatePresence>
        </div>
    </motion.form>
  );
}
