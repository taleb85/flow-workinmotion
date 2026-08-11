import { useState, useRef, ReactNode, useEffect, useCallback, useMemo } from 'react';
import { persistStoredUiLanguage, readStoredUiLanguage, clearStoredUiLanguage, getDeviceUiLanguage } from '../utils/uiLanguagePreference';
import {
  applyDocumentTheme,
  applyUnauthenticatedDocumentTheme,
} from '../utils/theme';
import {
  User,
  Shift,
  HolidayRequest,
  PunchRecord,
  PunchRecordSource,
  PunchAuditEntry,
  Language,
  HolidayStatus,
  UserRole,
  UserStatus,
  Department,
} from '../types';
import { format, addDays, parseISO, isValid } from 'date-fns';
import { database, formatSupabaseError } from '../lib/database';
import { supabase } from '../lib/supabase';
import { hasShiftConflictSameDay, computeEffectivePunchIn, calculateShiftMinutesGross } from '../utils/timeCalculations';
import { isShiftPayrollFrozen } from '../utils/timesheetFreezeCriteria';
import { AnimatePresence } from 'framer-motion';

// Set di ID turni congelati per cui il PIN è già stato verificato e l'eliminazione è autorizzata.
const _approvedFrozenDeleteIds = new Set<string>();
/** Chiamata dal componente dopo verifica PIN per autorizzare l'eliminazione di un turno congelato. */
export function authorizeFrozenDelete(shiftId: string) { _approvedFrozenDeleteIds.add(shiftId); }
function consumeFrozenDeleteAuth(shiftId: string): boolean {
  if (_approvedFrozenDeleteIds.has(shiftId)) { _approvedFrozenDeleteIds.delete(shiftId); return true; }
  return false;
}
import Toast from '../components/Toast';
import FlowWaveIcon from '../components/ui/FlowWaveIcon';
import { DevMissingEnvBanner } from '../components/DevMissingEnvBanner';
import { formatTrans, getTranslations } from '../utils/translations';
import { countUnreadNotifications } from '../utils/notifications';
import { setAppLauncherBadgeUnreadCountAsync } from '../utils/appIconBadge';
import { logHistory, logShiftEdit } from '../utils/scheduleHistory';
import { useTenant } from './TenantContext';
import { ToastProvider, useToast } from './ToastContext';
import { SessionProvider, useSession } from './SessionContext';

import {
  canOperateTeamSchedule,
  canEditTeamShifts,
  canApproveShiftActions,
  canPublishScheduleDrafts,
  isAdminOnly,
  wouldLeaveNoActiveAdmin,
  countActiveAdmins,
} from '../utils/permissions';
import {
  type FeatureFlags,
  getLocalFeatureFlags,
  saveLocalFeatureFlag,
  loadFeatureFlagsFromSupabase,
  updateFeatureFlagInSupabase,
  writeFeatureFlagsToStorage,
  writeAllFeatureFlagsToSupabase,
} from '../utils/featureFlags';
import {
  type RoleFeatureTemplatesOnDisk,
  loadRoleFeatureTemplatesFromSupabase,
  getLocalRoleFeatureTemplates,
  writeRoleFeatureTemplatesLocal,
  setRoleFeatureTemplatesCache,
  getRoleFeatureTemplatesCache,
  loadAndMergeRoleTemplates,
  saveRoleFeatureTemplatesToSupabase,
} from '../utils/roleFeatureTemplates';
import {
  type AdminModulesGlobalOnDisk,
  loadAdminModulesGlobalFromSupabase,
  getLocalAdminModulesGlobal,
  writeAdminModulesGlobalLocal,
  setAdminModulesGlobalCache,
  getAdminModulesGlobalCache,
  loadAndMergeAdminModulesGlobal,
  saveAdminModulesGlobalToSupabase,
} from '../utils/adminModulesGlobal';
import {
  type WorkRules,
  getWorkRules,
  saveWorkRules,
  saveWorkRulesToSupabase,
  DEFAULT_WORK_RULES,
  loadWorkRulesFromSupabase,
} from '../utils/workRules';
import {
  type BreakRule,
  getBreakRules,
  saveBreakRulesToSupabase,
  saveBreakRulesToLocalStorage,
  loadBreakRulesFromSupabase,
  getBreakMinutesForShift,
  getActiveBreakRules,
} from '../utils/breakRules';
import {
  mergeShiftsDeductExclusionsFromLocal,
  setLocalDeductExcludedRuleIds,
  clearLocalDeductExcludedRuleIds,
} from '../utils/shiftDeductExclusionsLocal';
import { loadTimesheetPeriodFromSupabase, applyRemoteTimesheetPeriod } from '../utils/timesheetPeriodSupabase';
import { userRowToSessionUser, defaultPermissionFieldsForNewUser } from '../utils/staffPermissionDefaults';
import { APP_SESSION_STORAGE_KEY } from '../constants/appSession';
import { PATH_PROFILO } from '../config/appPaths';
import { sendForceReloadPush } from '../utils/sendForceReloadPush';
import {
  bumpClientSyncRevisionOnSupabase,
  fetchClientSyncRevisionFromSupabase,
  getAckClientSyncRevision,
  writeAckClientSyncRevision,
} from '../utils/clientSyncRevision';
import { registerOsteriaBackgroundSync } from '../utils/backgroundSync';
import {
  readGeofenceEnvConfig,
  getCurrentPositionCoords,
  resolveEffectiveGeofenceConfig,
  type GeofenceConfig,
} from '../utils/geofencePunch';
import { isUserInRestaurantRange } from '../utils/geo';
import {
  getLocalGeofenceConfig,
  writeLocalGeofenceConfig,
  mergeGeofenceDiskLayers,
  loadGeofenceConfigFromSupabase,
  saveGeofenceConfigToSupabase,
} from '../utils/geofenceConfigStorage';
import {
  getLocalPresenceVerificationConfig,
  writeLocalPresenceVerificationConfig,
  mergePresenceVerificationLayers,
  loadPresenceVerificationFromSupabase,
  savePresenceVerificationToSupabase,
  type PresenceVerificationConfig,
} from '../utils/presenceVerificationConfigStorage';
import { resolveEffectiveVerificationToken } from '../utils/presenceVerificationPayload';
import { verifyPresenceProofScanned } from '../utils/presenceProofVerification';
import {
  fetchGlobalSettingsBundleFromSupabase,
  pullGlobalSettingsBundleOnAppBoot,
  uploadGlobalSettingsBundleToSupabase,
  buildGlobalSettingsBundleFromParts,
  bumpAppSettingsSyncSignal,
  type AppGlobalSettingsBundle,
} from '../utils/globalSettingsCloud';
import { withTimeout, TimeoutError } from '../utils/promiseTimeout';
import { authenticatePinUnlockCredential,
  hasPinUnlockCredential,
  registerPinUnlockCredential,
} from '../utils/pinUnlockWebAuthn';
import { pinMatchesStored, findActiveUserWithSamePin } from '../utils/loginIdentifier';
import { isAppCloudSyncEnabled } from '../utils/appCloudSync';
import { loadDepartmentsFromSupabase, saveDepartmentsToSupabase } from '../utils/departmentsCloud';
import {
  getDepartmentsCloudSnapshot,
  applyDepartmentsCloudSnapshot,
  type DepartmentsCloudV1,
} from '../utils/departments';
import { AppContext } from './appContextCore';
import type { AppContextType } from './appContextTypes';
import {
  UserSliceContext,
  DataSliceContext,
  ConfigSliceContext,
  OverlaySliceContext,
  type UserSlice,
  type DataSlice,
  type ConfigSlice,
  type OverlaySlice,
} from './appSliceContexts';

/** Dopo aver caricato `departments.json`, ignora merge da pull per questo intervallo (stesso browser). */
const DEPARTMENTS_OWN_PUSH_GRACE_MS = 20000;

/** Una tantum: flag geofence senza VITE_RESTAURANT_LAT/LNG. */
let geofenceMissingEnvWarned = false;

const staffDefaults = { language: 'it' as const, theme: 'light' as const, can_edit_staff_pins: false, can_manage_drafts: false, can_view_total_hours: false, can_create_shifts: false, can_approve_shifts: false };
const initialStaff: Omit<User, 'id'>[] = [
  { first_name: 'Gustavo', last_name: 'Ghetta', email: 'gustavo.ghetta@flow-app.com', role: 'manager', pin: '1111', status: 'active', sort_order: 1, ...staffDefaults },
  { first_name: 'Alexis', last_name: 'Man', email: 'alexis.man@flow-app.com', role: 'assistant_manager', pin: '2222', status: 'active', sort_order: 2, ...staffDefaults },
  { first_name: 'Taleb', last_name: 'Barikhan', email: 'taleb.barikhan@flow-app.com', role: 'admin', pin: '8888', status: 'active', sort_order: 3, ...staffDefaults, can_create_shifts: true, can_approve_shifts: true, can_manage_drafts: true, can_view_total_hours: true, can_edit_staff_pins: true },
  { first_name: 'Mauricio', last_name: 'Man', email: 'mauricio.man@flow-app.com', role: 'waiter', pin: '3333', status: 'active', sort_order: 4, ...staffDefaults },
  { first_name: 'Freddy', last_name: 'Junior', email: 'freddy.junior@flow-app.com', role: 'waiter', pin: '4444', status: 'active', sort_order: 5, ...staffDefaults },
  { first_name: 'Dany', last_name: 'Man', email: 'dany.man@flow-app.com', role: 'bartender', pin: '5555', status: 'active', sort_order: 6, ...staffDefaults },
  { first_name: 'Marco', last_name: 'Rossi', email: 'marco.rossi@flow-app.com', role: 'waiter', pin: '6666', status: 'active', sort_order: 7, ...staffDefaults },
  { first_name: 'Giulia', last_name: 'Bianchi', email: 'giulia.bianchi@flow-app.com', role: 'waiter', pin: '7777', status: 'active', sort_order: 8, ...staffDefaults },
  { first_name: 'Luca', last_name: 'Ferrari', email: 'luca.ferrari@flow-app.com', role: 'bartender', pin: '8889', status: 'active', sort_order: 9, ...staffDefaults },
  { first_name: 'Sofia', last_name: 'Romano', email: 'sofia.romano@flow-app.com', role: 'waiter', pin: '9999', status: 'active', sort_order: 10, ...staffDefaults },
  { first_name: 'Alessandro', last_name: 'Colombo', email: 'alessandro.colombo@flow-app.com', role: 'waiter', pin: '0001', status: 'active', sort_order: 11, ...staffDefaults },
  { first_name: 'Chiara', last_name: 'Ricci', email: 'chiara.ricci@flow-app.com', role: 'waiter', pin: '0002', status: 'active', sort_order: 12, ...staffDefaults },
  { first_name: 'Matteo', last_name: 'Marino', email: 'matteo.marino@flow-app.com', role: 'waiter', pin: '0003', status: 'active', sort_order: 13, ...staffDefaults },
  { first_name: 'Elena', last_name: 'Greco', email: 'elena.greco@flow-app.com', role: 'waiter', pin: '0004', status: 'active', sort_order: 14, ...staffDefaults },
  { first_name: 'Francesco', last_name: 'Conti', email: 'francesco.conti@flow-app.com', role: 'bartender', pin: '0005', status: 'active', sort_order: 15, ...staffDefaults },
  { first_name: 'Valentina', last_name: 'Galli', email: 'valentina.galli@flow-app.com', role: 'waiter', pin: '0006', status: 'active', sort_order: 16, ...staffDefaults },
  { first_name: 'Andrea', last_name: 'Barbieri', email: 'andrea.barbieri@flow-app.com', role: 'waiter', pin: '0007', status: 'active', sort_order: 17, ...staffDefaults },
  { first_name: 'Martina', last_name: 'Fontana', email: 'martina.fontana@flow-app.com', role: 'waiter', pin: '0008', status: 'active', sort_order: 18, ...staffDefaults },
  { first_name: 'Davide', last_name: 'Moretti', email: 'davide.moretti@flow-app.com', role: 'waiter', pin: '0009', status: 'active', sort_order: 19, ...staffDefaults },
  { first_name: 'Federica', last_name: 'Caruso', email: 'federica.caruso@flow-app.com', role: 'waiter', pin: '0010', status: 'active', sort_order: 20, ...staffDefaults },
];

const MAX_SHIFTS_PER_DAY = 2;

type SilentRefreshOpts = {
  pullRemoteConfig?: boolean;
  skipRemoteRevisionCheck?: boolean;
  throwOnError?: boolean;
  forceSettingsBundle?: boolean;
};

/** Unisce richieste di refresh sovrapposte (Realtime + focus + tab + polling) in un’unica esecuzione. */
function mergeSilentRefreshOpts(prev: SilentRefreshOpts | null, next?: SilentRefreshOpts): SilentRefreshOpts {
  const a = prev ?? {};
  const b = next ?? {};
  return {
    pullRemoteConfig: !!(a.pullRemoteConfig || b.pullRemoteConfig),
    /** Se un solo caller chiede di saltare il check revisione (es. Realtime dopo signal), va rispettato. */
    skipRemoteRevisionCheck: !!(a.skipRemoteRevisionCheck || b.skipRemoteRevisionCheck),
    throwOnError: !!(a.throwOnError || b.throwOnError),
    forceSettingsBundle: !!(a.forceSettingsBundle || b.forceSettingsBundle),
  };
}

/**
 * Dopo ogni fetch della tabella `users` (realtime, pull-to-refresh, sync in foreground):
 * stesso criterio ovunque — sessione valida solo se la riga esiste ed è `active`.
 */
function sessionUserFromLoadedUsersList(prev: User | null, loadedUsers: User[]): User | null {
  if (!prev) return null;
  const row = loadedUsers.find((u) => u.id === prev.id);
  if (!row || row.status !== 'active') {
    try {
      localStorage.removeItem(APP_SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }
  return userRowToSessionUser(row);
}

export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <SessionProvider>
        <AppProviderInner>{children}</AppProviderInner>
      </SessionProvider>
    </ToastProvider>
  );
}

function AppProviderInner({ children }: { children: ReactNode }) {
  const { showError, showSuccess, toastMessage, toastType, clearToast } = useToast();
  const {
    currentUser, setCurrentUser, users, setUsers,
    isSessionElevated, setIsSessionElevated,
    impersonatingAs, originalAdminUser, setImpersonating,
    forceLogoutRequested, setForceLogoutRequested, clearForceLogoutRequest,
    globalPinSessionId, setGlobalPinSessionId,
  } = useSession();
  const { isLoading: tenantIsLoading, tenantId, tenantSettings, tenant, loadTenantBySlug } = useTenant();
  const tenantSettingsRef = useRef(tenantSettings);
  const tenantRef = useRef(tenant);
  useEffect(() => {
    tenantRef.current = tenant;
  }, [tenant]);
  const currentUserRef = useRef<User | null>(null);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  const originalAdminUserRef = useRef<User | null>(null);
  useEffect(() => { originalAdminUserRef.current = originalAdminUser; }, [originalAdminUser]);

  const [appLanguage, setAppLanguage] = useState<Language>(() => {
    const stored = readStoredUiLanguage();
    if (stored) return stored;
    const nav = navigator.language || (navigator as { userLanguage?: string }).userLanguage || '';
    const code = nav.split('-')[0].toLowerCase();
    if (code === 'en') return 'en';
    if (code === 'es') return 'es';
    if (code === 'fr') return 'fr';
    if (code === 'it') return 'it';
    return 'it';
  });

  // Listener prefers-color-scheme: attivo solo quando non c'è preferenza esplicita in localStorage.
  // Dipende solo da currentUser?.id per non riattivarsi su ogni cambio di proprietà (es. lingua).
  useEffect(() => {
    applyDocumentTheme();
   
  }, [currentUser?.id]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [holidays, setHolidays] = useState<HolidayRequest[]>([]);
  const [punchRecords, setPunchRecords] = useState<PunchRecord[]>([]);
  const [availability, setAvailability] = useState<HolidayRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGlobalRefreshing, setIsGlobalRefreshing] = useState(false);
  const [syncStage, setSyncStage] = useState('');
  const [dataSyncInProgress, setDataSyncInProgress] = useState(false);
  const silentSyncDepthRef = useRef(0);
  /** Opzioni accumulate mentre un refresh è in coda (evita depth>1 e banner “infinito”). */
  const silentRefreshPendingOptsRef = useRef<SilentRefreshOpts | null>(null);
  const silentRefreshQueueRef = useRef(Promise.resolve());
  /** In browser `setTimeout` restituisce `number` (non `NodeJS.Timeout`). */
  const dataSyncBarDelayTimerRef = useRef<number | null>(null);
  const [postRefreshLocked, setPostRefreshLocked] = useState(false);
  const [postUnlockReloadPending, setPostUnlockReloadPending] = useState(false);
  /** Allineato a `postRefreshLocked` ma aggiornato subito (prima del commit React) per evitare race nei refresh in foreground. */
  const postRefreshLockedRef = useRef(false);
  useEffect(() => {
    postRefreshLockedRef.current = postRefreshLocked;
  }, [postRefreshLocked]);
  const [pendingOrderIds, setPendingOrderIds] = useState<string[] | null>(null);
  const [pendingPublishWeekStart, setPendingPublishWeekStart] = useState<string | null>(null);
  /** Forza ricalcolo credenziale WebAuthn PIN lock (localStorage) dopo registrazione. */
  const [pinUnlockDeviceTick, setPinUnlockDeviceTick] = useState(0);
  const [managementDataTouchedSinceLastSync, setManagementDataTouchedSinceLastSync] = useState(false);
  const markManagementDataTouched = useCallback(() => {
    setManagementDataTouchedSinceLastSync(true);
  }, []);
  const [isPunching, setIsPunching] = useState(false);
  const punchInFlightRef = useRef(false);
  const punchRecordsRef = useRef<PunchRecord[]>([]);
  useEffect(() => { punchRecordsRef.current = punchRecords; }, [punchRecords]);
  const [featureFlags, setFeatureFlagsState] = useState<FeatureFlags>(() => getLocalFeatureFlags());
  const [workRules, setWorkRulesState] = useState<WorkRules>(() => ({ ...DEFAULT_WORK_RULES }));
  const [breakRules, setBreakRulesState] = useState<BreakRule[]>(() => []);
  const [settingsCloudLastSyncedAt, setSettingsCloudLastSyncedAt] = useState<string | null>(null);
  const [settingsCloudPushBusy, setSettingsCloudPushBusy] = useState(false);
  const [roleTemplatesRevision, setRoleTemplatesRevision] = useState(0);
  const [adminModulesRevision, setAdminModulesRevision] = useState(0);
  const [departmentsRevision, setDepartmentsRevision] = useState(0);
  const [geofenceEffectiveConfig, setGeofenceEffectiveConfig] = useState<GeofenceConfig | null>(null);
  const geofenceEffectiveConfigRef = useRef<GeofenceConfig | null>(null);
  useEffect(() => {
    geofenceEffectiveConfigRef.current = geofenceEffectiveConfig;
  }, [geofenceEffectiveConfig]);

  const [presenceVerificationConfig, setPresenceVerificationConfig] = useState<PresenceVerificationConfig>(() =>
    mergePresenceVerificationLayers(null, getLocalPresenceVerificationConfig())
  );
  const presenceVerificationRef = useRef(presenceVerificationConfig);
  useEffect(() => {
    presenceVerificationRef.current = presenceVerificationConfig;
  }, [presenceVerificationConfig]);

  /** Snapshot per creare `settings_bundle.json` su Storage al login Admin (upload di backup). */
  const settingsBundleSeedDepsRef = useRef({
    workRules,
    breakRules,
    featureFlags,
    presenceVerificationConfig,
    roleFeatureTemplates: null as RoleFeatureTemplatesOnDisk | null,
    adminModulesGlobal: null as AdminModulesGlobalOnDisk | null,
  });
  settingsBundleSeedDepsRef.current = {
    workRules,
    breakRules,
    featureFlags,
    presenceVerificationConfig,
    roleFeatureTemplates: getRoleFeatureTemplatesCache() ?? getLocalRoleFeatureTemplates(),
    adminModulesGlobal: getAdminModulesGlobalCache() ?? getLocalAdminModulesGlobal(),
  };

  const refreshPresenceVerificationConfig = useCallback(async () => {
    const remote = await loadPresenceVerificationFromSupabase().catch(() => null);
    const local = getLocalPresenceVerificationConfig();
    const merged = mergePresenceVerificationLayers(remote, local);
    if (remote) writeLocalPresenceVerificationConfig(merged);
    setPresenceVerificationConfig(merged);
  }, []);

  const savePresenceVerificationConfig = useCallback(
    async (config: PresenceVerificationConfig) => {
      writeLocalPresenceVerificationConfig(config);
      await savePresenceVerificationToSupabase(config);
      await refreshPresenceVerificationConfig();
      markManagementDataTouched();
    },
    [refreshPresenceVerificationConfig, markManagementDataTouched]
  );

  const refreshGeofenceEffectiveConfig = useCallback(async () => {
    const remote = await loadGeofenceConfigFromSupabase().catch(() => null);
    const local = getLocalGeofenceConfig();
    const disk = mergeGeofenceDiskLayers(remote, local);
    if (remote) writeLocalGeofenceConfig(remote);
    const env = readGeofenceEnvConfig();
    setGeofenceEffectiveConfig(resolveEffectiveGeofenceConfig(disk, env));
  }, []);

  const applyAppSettingsBundle = useCallback((bundle: AppGlobalSettingsBundle) => {
    if (bundle.workRules) {
      const mergedWr = { ...DEFAULT_WORK_RULES, ...bundle.workRules };
      setWorkRulesState(mergedWr);
      saveWorkRules(mergedWr);
    }
    if (bundle.breakRules) {
      setBreakRulesState(bundle.breakRules);
    }
    if (bundle.geofence !== undefined && bundle.geofence !== null) {
      writeLocalGeofenceConfig(bundle.geofence);
    }
    if (bundle.featureFlags && typeof bundle.featureFlags === 'object') {
      const local = getLocalFeatureFlags();
      const merged = { ...local, ...bundle.featureFlags };
      setFeatureFlagsState(merged);
      writeFeatureFlagsToStorage(merged);
    }
    if (bundle.roleFeatureTemplates && Object.keys(bundle.roleFeatureTemplates).length > 0) {
      const merged = loadAndMergeRoleTemplates(bundle.roleFeatureTemplates, getLocalRoleFeatureTemplates());
      setRoleFeatureTemplatesCache(merged);
      if (merged) writeRoleFeatureTemplatesLocal(merged);
      setRoleTemplatesRevision((n) => n + 1);
    }
    if (bundle.adminModulesGlobal && Object.keys(bundle.adminModulesGlobal).length > 0) {
      const merged = loadAndMergeAdminModulesGlobal(bundle.adminModulesGlobal, getLocalAdminModulesGlobal());
      setAdminModulesGlobalCache(merged);
      if (merged) writeAdminModulesGlobalLocal(merged);
      setAdminModulesRevision((n) => n + 1);
    }
    if (bundle.presenceVerification) {
      const merged = mergePresenceVerificationLayers(bundle.presenceVerification, getLocalPresenceVerificationConfig());
      writeLocalPresenceVerificationConfig(merged);
      setPresenceVerificationConfig(merged);
    }
    setSettingsCloudLastSyncedAt(bundle.updatedAt);
  }, []);

  const departmentsOwnPushGraceUntilRef = useRef(0);

  const mergeDepartmentsRemoteAfterPull = useCallback((remote: DepartmentsCloudV1 | null) => {
    if (!remote) return;
    if (Date.now() < departmentsOwnPushGraceUntilRef.current) return;
    if (applyDepartmentsCloudSnapshot(remote)) {
      setDepartmentsRevision((n) => n + 1);
    }
  }, []);

  const beginDepartmentsOwnPushGracePeriod = useCallback(() => {
    departmentsOwnPushGraceUntilRef.current = Date.now() + DEPARTMENTS_OWN_PUSH_GRACE_MS;
  }, []);

  /** Permette a updateUser (definito prima) di innescare il refresh dopo permessi. */
  const silentRefreshDataRef = useRef<
    (opts?: {
      pullRemoteConfig?: boolean;
      skipRemoteRevisionCheck?: boolean;
      throwOnError?: boolean;
      /** Opzione legacy: il bundle non viene più scaricato da object Storage (solo JSON separati). */
      forceSettingsBundle?: boolean;
    }) => Promise<void>
  >(async () => {});
  /** Revisione Storage da accettare con PIN dopo `forceGlobalRefresh` (altri dispositivi). */
  const pendingClientSyncRevRef = useRef<number | null>(null);
  const forceGlobalRefreshRef = useRef<() => Promise<void>>(async () => {});
  /** Set di ID turno aggiunti localmente da pochi ms — evita che refresh asincroni li cancellino per race condition. */
  const recentlyAddedShiftIdsRef = useRef<Set<string>>(new Set());
  /** Sostituisce gli shifts con dati server, preservando i turni appena creati non ancora presenti nel DB remoto.
   *  Quando il server conferma l'esistenza di un turno, lo rimuove dalla protezione.
   *  Il turno resta protetto finché il server non lo conferma (nessun timeout arbitrario). */
  const setShiftsFromServer = useCallback((fromServer: Shift[]) => {
    const recentlyAdded = recentlyAddedShiftIdsRef.current;
    // Rimuovi dalla protezione i turni che il server ha già confermato
    for (const s of fromServer) {
      recentlyAdded.delete(s.id);
    }
    if (recentlyAdded.size === 0) { setShifts(fromServer); return; }
    setShifts(prev => {
      const freshIds = new Set(fromServer.map(s => s.id));
      const toMerge = prev.filter(s => recentlyAdded.has(s.id) && !freshIds.has(s.id));
      return toMerge.length === 0 ? fromServer : [...toMerge, ...fromServer];
    });
  }, []);

  /** Lingua profilo in sessione, altrimenti preferenza persistita (login/kiosk senza sessione allineati). */
  const effectiveLanguage: Language = useMemo(() => {
    if (currentUser?.language && ['it', 'en', 'es', 'fr'].includes(currentUser.language)) {
      return currentUser.language;
    }
    const fromDisk = typeof window !== 'undefined' ? readStoredUiLanguage() : null;
    if (fromDisk) return fromDisk;
    return appLanguage || getDeviceUiLanguage();
  }, [currentUser?.language, appLanguage]);

  useEffect(() => {
    document.documentElement.lang = effectiveLanguage;
  }, [effectiveLanguage]);

  const saveRoleFeatureTemplates = useCallback(async (data: RoleFeatureTemplatesOnDisk) => {
    const previous = getRoleFeatureTemplatesCache();
    setRoleFeatureTemplatesCache(data);
    writeRoleFeatureTemplatesLocal(data);
    // Subito: la matrice/tab è letta dalla cache modulare — serve un bump React prima dell’upload Storage.
    setRoleTemplatesRevision((n) => n + 1);
    try {
      await saveRoleFeatureTemplatesToSupabase(data);
      const rev = await bumpClientSyncRevisionOnSupabase();
      if (rev != null) writeAckClientSyncRevision(rev);
      markManagementDataTouched();
    } catch (e) {
      setRoleFeatureTemplatesCache(previous ?? null);
      try {
        if (previous && Object.keys(previous).length > 0) {
          writeRoleFeatureTemplatesLocal(previous);
        } else {
          localStorage.removeItem('osteria_role_feature_templates_v1');
        }
      } catch {
        /* ignore */
      }
      setRoleTemplatesRevision((n) => n + 1);
      throw e;
    }
  }, [markManagementDataTouched]);

  const saveAdminModulesGlobal = useCallback(async (data: AdminModulesGlobalOnDisk) => {
    const previous = getAdminModulesGlobalCache();
    setAdminModulesGlobalCache(data);
    writeAdminModulesGlobalLocal(data);
    setAdminModulesRevision((n) => n + 1);
    try {
      await saveAdminModulesGlobalToSupabase(data);
      const rev = await bumpClientSyncRevisionOnSupabase();
      if (rev != null) writeAckClientSyncRevision(rev);
      markManagementDataTouched();
    } catch (e) {
      setAdminModulesGlobalCache(previous ?? null);
      try {
        if (previous && Object.keys(previous).length > 0) {
          writeAdminModulesGlobalLocal(previous);
        } else {
          localStorage.removeItem('osteria_admin_sheet_modules_v1');
        }
      } catch {
        /* ignore */
      }
      setAdminModulesRevision((n) => n + 1);
      throw e;
    }
  }, [markManagementDataTouched]);

  useEffect(() => { tenantSettingsRef.current = tenantSettings; }, [tenantSettings]);

  useEffect(() => {
    applyDocumentTheme();
  }, []);

  useEffect(() => {
    // Aspetta che TenantContext abbia finito il primo caricamento (slug da env/subdomain/path).
    if (tenantIsLoading) return;
    if (tenantId) {
      void loadInitialData();
      return;
    }
    // Single-URL (Option B): nessun tenant finché LoginPage non chiama loadTenantBySlug — non bloccare l’UI:
    // prima si fixava `isLoading` a true per sempre → pagina bianca.
    setIsLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- si vuole eseguire quando il tenant è pronto o assente
  }, [tenantIsLoading, tenantId]);

  /** Sessioni salvate senza tenantSlug (pre-fix): recupera slug da Supabase e chiama loadTenantBySlug. */
  const sessionTenantBackfillUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (tenantId) return;
    if (tenantIsLoading) return;
    try {
      const raw = localStorage.getItem(APP_SESSION_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { userId?: string; email?: string; tenantSlug?: string };
      if (parsed.tenantSlug) return;
      const uid = parsed.userId?.trim();
      if (!uid) return;
      if (sessionTenantBackfillUserIdRef.current === uid) return;
      sessionTenantBackfillUserIdRef.current = uid;
      void (async () => {
        const { supabase } = await import('../lib/supabase');
        if (!supabase) return;
        const { data: row } = await supabase
          .from('users')
          .select('tenant_id')
          .eq('id', uid)
          .eq('status', 'active')
          .maybeSingle();
        if (!row?.tenant_id) return;
        const { data: ten } = await supabase
          .from('tenants')
          .select('slug')
          .eq('id', row.tenant_id)
          .eq('is_active', true)
          .maybeSingle();
        if (!ten?.slug) return;
        try {
          localStorage.setItem(
            APP_SESSION_STORAGE_KEY,
            JSON.stringify({
              userId: uid,
              email: parsed.email,
              tenantSlug: ten.slug,
            })
          );
        } catch {
          /* ignore */
        }
        void loadTenantBySlug(ten.slug);
      })();
    } catch {
      /* ignore */
    }
  }, [tenantId, tenantIsLoading, loadTenantBySlug]);

  useEffect(() => {
    applyDocumentTheme();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) setManagementDataTouchedSinceLastSync(false);
  }, [currentUser]);

  useEffect(() => {
    const unsubPunches = database.realtime.subscribeToPunchRecords(null, setPunchRecords);
    const unsubShifts = database.realtime.subscribeToShifts(null, setShiftsFromServer);
    const unsubUsers = database.realtime.subscribeToUsers((freshUsers) => {
      setUsers(freshUsers);
      setCurrentUser((prev) => sessionUserFromLoadedUsersList(prev, freshUsers));
    });
    const unsubHolidaysAvail = database.realtime.subscribeToHolidaysAndAvailability(setHolidays, setAvailability);
    const unsubSettingsSync = isAppCloudSyncEnabled()
      ? database.realtime.subscribeToAppSettingsSyncSignal(() => {
          void silentRefreshDataRef.current({
            pullRemoteConfig: true,
            skipRemoteRevisionCheck: true,
            forceSettingsBundle: true,
          });
        })
      : () => {};
    return () => {
      unsubPunches();
      unsubShifts();
      unsubUsers();
      unsubHolidaysAvail();
      unsubSettingsSync();
    };
  }, []);

  /** Ricalcola badge icona (notifiche lette, permesso iOS concesso, ritorno in app). */
  const [launcherBadgeTick, setLauncherBadgeTick] = useState(0);
  useEffect(() => {
    const onSeen = () => setLauncherBadgeTick((x) => x + 1);
    const onRecheck = () => setLauncherBadgeTick((x) => x + 1);
    window.addEventListener('notifications-seen', onSeen);
    window.addEventListener('app-badge-recheck', onRecheck);
    return () => {
      window.removeEventListener('notifications-seen', onSeen);
      window.removeEventListener('app-badge-recheck', onRecheck);
    };
  }, []);

  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === 'visible') setLauncherBadgeTick((x) => x + 1);
    };
    document.addEventListener('visibilitychange', bump);
    window.addEventListener('pageshow', bump);
    return () => {
      document.removeEventListener('visibilitychange', bump);
      window.removeEventListener('pageshow', bump);
    };
  }, []);

  /** Badge sull’icona PWA (Badging API): allineato alle notifiche in-app non lette. */
  useEffect(() => {
    if (!currentUser) {
      void setAppLauncherBadgeUnreadCountAsync(0);
      return;
    }
    const t = getTranslations(effectiveLanguage);
    const unread = countUnreadNotifications(currentUser, shifts, holidays, users, t, effectiveLanguage);
    void setAppLauncherBadgeUnreadCountAsync(unread);
  }, [currentUser, shifts, holidays, users, effectiveLanguage, launcherBadgeTick]);

  const loadInitialData = async () => {
    try {
      let getAllError = false;
      let loadedUsers = await database.users.getAll().catch(() => { getAllError = true; return []; });
      // Seed solo se il DB è genuinamente vuoto (non in caso di errore di rete)
      if (loadedUsers.length === 0 && !getAllError) {
        for (const staffMember of initialStaff) {
          await database.users.insert(staffMember).catch(() => null);
        }
        loadedUsers = await database.users.getAll().catch(() => []);
      }
      setUsers(loadedUsers);

      // Ripristina sessione se presente (login persistente)
      try {
        const saved = localStorage.getItem(APP_SESSION_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as { userId?: string; email?: string; tenantSlug?: string };
          const { userId, email: savedEmail } = parsed;
          let restored =
            userId != null && userId !== ''
              ? loadedUsers.find((u) => u.id === userId && u.status === 'active')
              : undefined;
          if (!restored && savedEmail) {
            const em = savedEmail.trim().toLowerCase();
            restored = loadedUsers.find(
              (u) => u.status === 'active' && (u.email || '').trim().toLowerCase() === em
            );
          }
          if (restored) {
            const safeUser = userRowToSessionUser(restored as User);
            setCurrentUser(safeUser);
            try {
              const slugPersist =
                tenantRef.current?.slug ?? (typeof parsed.tenantSlug === 'string' ? parsed.tenantSlug.trim() : '');
              localStorage.setItem(
                APP_SESSION_STORAGE_KEY,
                JSON.stringify({
                  userId: restored.id,
                  email: (restored.email || '').trim().toLowerCase() || undefined,
                  ...(slugPersist ? { tenantSlug: slugPersist } : {}),
                })
              );
            } catch {
              /* ignore */
            }
            // Se l'utente ha una lingua esplicita nel DB, la usa; altrimenti → AUTO (non tocca localStorage)
            if (safeUser.language && ['it', 'en', 'es', 'fr'].includes(safeUser.language)) {
              const lang = safeUser.language as Language;
              persistStoredUiLanguage(lang);
              setAppLanguage(lang);
            } else {
              // Nessuna preferenza → AUTO: pulisce localStorage e usa la lingua del dispositivo
              clearStoredUiLanguage();
              setAppLanguage(getDeviceUiLanguage());
            }
          } else if (userId || savedEmail) {
            localStorage.removeItem(APP_SESSION_STORAGE_KEY);
          }
        }
      } catch {
        localStorage.removeItem(APP_SESSION_STORAGE_KEY);
      }

      const [loadedShifts, loadedHolidays, loadedPunchRecords, loadedAvailability] = await Promise.all([
        database.shifts.getAll().catch(() => []),
        database.holidays.getAll().catch(() => []),
        database.punchRecords.getAll().catch(() => []),
        database.availability.getAll().catch(() => []),
      ]);
        setShifts(mergeShiftsDeductExclusionsFromLocal(loadedShifts));
        console.log('[loadInitialData] loadedShifts count:', loadedShifts.length, 'con tenant_id:', loadedShifts.filter(s => (s as any).tenant_id).length, 'date range:', loadedShifts.length > 0 ? `${loadedShifts[0].date}…${loadedShifts[loadedShifts.length-1].date}` : 'empty');
        setHolidays(loadedHolidays);
        setPunchRecords(loadedPunchRecords);
        setAvailability(loadedAvailability);

        // Rimuove flag legacy: versioni precedenti disattivavano per sempre i GET Storage dopo 404/rete, e il telefono non allineava mai al PC (localStorage non è condiviso tra dispositivi).
        try {
          localStorage.removeItem('osteria_features_storage_disabled');
          localStorage.removeItem('osteria_role_templates_storage_skip');
          localStorage.removeItem('osteria_admin_modules_storage_skip');
        } catch {
          /* ignore */
        }

        const bundle = await pullGlobalSettingsBundleOnAppBoot().catch(() => null);
        if (isAppCloudSyncEnabled()) {
          if (bundle) {
            if (!bundle.featureFlags) {
              const sbFlagsOnly = await loadFeatureFlagsFromSupabase().catch(() => null);
              if (sbFlagsOnly) {
                const local = getLocalFeatureFlags();
                const merged = { ...sbFlagsOnly, ...local };
                setFeatureFlagsState(merged);
                writeFeatureFlagsToStorage(merged);
              } else {
                // Fallback: tenant.settings.featureFlags dal Super Admin
                const ts = tenantSettingsRef.current;
                if (ts?.featureFlags && Object.keys(ts.featureFlags).length > 0) {
                  const local = getLocalFeatureFlags();
                  const merged = { ...ts.featureFlags, ...local };
                  setFeatureFlagsState(merged);
                  writeFeatureFlagsToStorage(merged);
                }
              }
            }
            applyAppSettingsBundle(bundle);
            await refreshGeofenceEffectiveConfig();
            if (!bundle.presenceVerification) {
              await refreshPresenceVerificationConfig();
            }
            const deptRemoteBoot = await loadDepartmentsFromSupabase().catch(() => null);
            mergeDepartmentsRemoteAfterPull(deptRemoteBoot);
          } else {
            const sbFlags = await loadFeatureFlagsFromSupabase().catch(() => null);
            if (sbFlags) {
              const local = getLocalFeatureFlags();
              const merged = { ...sbFlags, ...local };
              setFeatureFlagsState(merged);
              writeFeatureFlagsToStorage(merged);
            } else {
              // Fallback: tenant.settings.featureFlags dal Super Admin
              const ts = tenantSettingsRef.current;
              if (ts?.featureFlags && Object.keys(ts.featureFlags).length > 0) {
                const local = getLocalFeatureFlags();
                const merged = { ...ts.featureFlags, ...local };
                setFeatureFlagsState(merged);
                writeFeatureFlagsToStorage(merged);
              }
            }
            const rtRemote = await loadRoleFeatureTemplatesFromSupabase().catch(() => null);
            const rtLocal = getLocalRoleFeatureTemplates();
            const rtMerged = loadAndMergeRoleTemplates(rtRemote, rtLocal);
            setRoleFeatureTemplatesCache(rtMerged);
            if (rtMerged) writeRoleFeatureTemplatesLocal(rtMerged);
            setRoleTemplatesRevision((n) => n + 1);
            const amRemote = await loadAdminModulesGlobalFromSupabase().catch(() => null);
            const amLocal = getLocalAdminModulesGlobal();
            const amMerged = loadAndMergeAdminModulesGlobal(amRemote, amLocal);
            setAdminModulesGlobalCache(amMerged);
            if (amMerged) writeAdminModulesGlobalLocal(amMerged);
            setAdminModulesRevision((n) => n + 1);
            await refreshGeofenceEffectiveConfig();
            await refreshPresenceVerificationConfig();
            const [wrSb, brSb] = await Promise.all([
              loadWorkRulesFromSupabase().catch(() => null),
              loadBreakRulesFromSupabase().catch(() => null),
            ]);
            if (wrSb) {
              setWorkRulesState(wrSb);
              saveWorkRules(wrSb);
            } else {
              // Fallback: tenant.settings.workRules dal Super Admin
              const ts = tenantSettingsRef.current;
              const seedWr = ts?.workRules ? { ...DEFAULT_WORK_RULES, ...ts.workRules } : getWorkRules();
              setWorkRulesState(seedWr);
            }
            if (brSb) setBreakRulesState(brSb);
            else setBreakRulesState(getBreakRules());
            const deptRemoteBootElse = await loadDepartmentsFromSupabase().catch(() => null);
            mergeDepartmentsRemoteAfterPull(deptRemoteBootElse);
            setSettingsCloudLastSyncedAt(new Date().toISOString());
          }
        } else {
          await refreshGeofenceEffectiveConfig();
          await refreshPresenceVerificationConfig();
          const ts = tenantSettingsRef.current;
          // Usa tenant.settings come fallback se non c'è nulla in localStorage
          const localWr = getWorkRules();
          const hasLocalWr = localStorage.getItem('osteria_work_rules') !== null;
          setWorkRulesState(hasLocalWr ? localWr : (ts?.workRules ? { ...DEFAULT_WORK_RULES, ...ts.workRules } : localWr));
          setBreakRulesState(getBreakRules());
          if (ts?.featureFlags && Object.keys(ts.featureFlags).length > 0 && localStorage.getItem('osteria_app_features_v2') === null) {
            setFeatureFlagsState(ts.featureFlags as FeatureFlags);
            writeFeatureFlagsToStorage(ts.featureFlags as FeatureFlags);
          }
        }
    } catch (error) {
      console.error('Errore durante il caricamento iniziale:', error);
    } finally {
      setIsLoading(false);
    }
  };

  /** Pre-compila solo il fallback ≥6h sul DB; regole pausa attive restano calcolate a runtime (priorità assoluta). */
  const computePersistedAutoBreak = useCallback(
    (
      startTime: string,
      endTime: string,
      dateStr: string,
      deductBreak: boolean | undefined,
      existingBreak: number | undefined | null,
      userId: string
    ): { break_minutes: number; is_auto_break: true } | undefined => {
      if (deductBreak === false) return undefined;
      if (existingBreak != null && existingBreak > 0) return undefined;
      const user = users.find((u) => u.id === userId);
      if (user && getActiveBreakRules(breakRules).length > 0) return undefined;
      if (featureFlags.auto_breaks === false) return undefined;
      const partial = { start_time: startTime, end_time: endTime, date: dateStr, deduct_break: deductBreak };
      const gross = calculateShiftMinutesGross((startTime || '').slice(0, 5), (endTime || '').slice(0, 5));
      const mins = getBreakMinutesForShift(partial, gross, user, breakRules, { autoBreaksFeatureEnabled: true });
      if (mins <= 0) return undefined;
      return { break_minutes: mins, is_auto_break: true };
    },
    [users, breakRules, featureFlags]
  );

  const addShift = useCallback(async (shift: Omit<Shift, 'id'>) => {
    const op = currentUserRef.current;
    if (!op || !canEditTeamShifts(op)) {
      showError(getTranslations(effectiveLanguage).app_access_denied);
      return null;
    }
    const existingOnDate = shifts.filter((s) => s.user_id === shift.user_id && s.date === shift.date);
    if (existingOnDate.length >= MAX_SHIFTS_PER_DAY) {
      showError('Un dipendente non può avere più di 2 turni nello stesso giorno.');
      return null;
    }
    if (hasShiftConflictSameDay(existingOnDate, { start_time: shift.start_time, end_time: shift.end_time ?? '' })) {
      showError('Conflitto orario: il turno si sovrappone a uno esistente.');
      return null;
    }
    let endTime = shift.end_time ?? '';
    if ((shift.start_time || '').trim().slice(0, 5) === '10:00' && (!endTime || endTime.trim() === '')) {
      endTime = '16:00';
    }
    if (!String(endTime).trim()) {
      showError(getTranslations(effectiveLanguage).shift_end_time_required);
      return null;
    }
    const autoBreak = computePersistedAutoBreak(
      shift.start_time ?? '',
      endTime,
      shift.date,
      shift.deduct_break,
      shift.break_minutes,
      shift.user_id
    );
    const normalized = { ...shift, end_time: endTime, approval_status: 'draft' as const, ...autoBreak };
    const res = await database.shifts.insert(normalized);
    if (res) {
      setShifts(prev => [...prev, res]);
      recentlyAddedShiftIdsRef.current.add(res.id);
      const actor = currentUserRef.current?.first_name ?? 'Sistema';
      logHistory('create', actor, `Turno creato: ${shift.date} ${shift.start_time}–${endTime || '?'}`);
      markManagementDataTouched();
    } else {
      console.warn('[addShift] insert returned null (supabase non disponibile o inserimento fallito)', shift);
    }
    return res;
  }, [shifts, showError, computePersistedAutoBreak, effectiveLanguage, markManagementDataTouched]);

  const updateShift = useCallback(async (id: string, updates: Partial<Shift>) => {
    const existing = shifts.find((s) => s.id === id);
    if (!existing) return;

    // Blocca modifica su turni congelati (salvo sblocco esplicito o congelamento esplicito)
    const isUnfreezeOp = Object.keys(updates).length === 1 && updates.approval_status === 'confirmed';
    const isFreezeOp = Object.keys(updates).length === 1 && updates.approval_status === 'frozen';
    if (isShiftPayrollFrozen(existing) && !isUnfreezeOp && !isFreezeOp) {
      showError(getTranslations(effectiveLanguage).shift_delete_blocked_frozen);
      return;
    }

    const finalUserId = updates.user_id ?? existing.user_id;
    const finalDate = updates.date ?? existing.date;

    const otherShiftsOnDate = shifts.filter(
      (s) => s.id !== id && s.user_id === finalUserId && s.date === finalDate
    );
    if (updates.user_id !== undefined || updates.date !== undefined) {
      if (otherShiftsOnDate.length >= MAX_SHIFTS_PER_DAY) {
        showError(getTranslations(effectiveLanguage).max_two_shifts_same_day);
        return;
      }
    }
    if (updates.start_time !== undefined || updates.end_time !== undefined) {
      const finalStart = updates.start_time ?? existing.start_time;
      const finalEnd = updates.end_time ?? existing.end_time ?? '';
      if (hasShiftConflictSameDay(otherShiftsOnDate, { start_time: finalStart, end_time: finalEnd })) {
        showError(getTranslations(effectiveLanguage).shift_overlap_same_day);
        return;
      }
      const autoBreak = computePersistedAutoBreak(
        finalStart,
        finalEnd,
        finalDate,
        updates.deduct_break ?? existing.deduct_break,
        updates.break_minutes ?? existing.break_minutes,
        finalUserId
      );
      if (autoBreak) Object.assign(updates, autoBreak);
    }

    const isAbsentUpdate = updates.approval_status === 'absent';
    const merged: Shift =
      isAbsentUpdate
        ? {
            ...existing,
            ...updates,
            approval_status: 'absent' as const,
            // approved_* fields removed

          }
        : { ...existing, ...updates };

    /** Assenza: niente update ottimistico — altrimenti il drawer cambia layout (footer che sparisce) e al fallimento DB sembra un menu che si apre e chiude. */
    if (!isAbsentUpdate) {
      setShifts((prev) => prev.map((s) => (s.id === id ? merged : s)));
    }

    const isPublished = existing.approval_status === 'confirmed' || existing.approval_status === 'approved';
    const statusLabel: Record<string, string> = {
      draft: 'Bozza',
      confirmed: 'Pubblicato',
      approved: 'Approvato',
      absent: 'Non ha lavorato',
    };
    if (isPublished) {
      const actor = currentUserRef.current?.first_name ?? 'Sistema';
      const date = existing.date;
      if (updates.start_time !== undefined && updates.start_time !== existing.start_time) {
        logShiftEdit({ shiftId: id, actorName: actor, field: 'Inizio', oldValue: (existing.start_time || '').slice(0,5), newValue: (updates.start_time || '').slice(0,5), description: `${date} — orario inizio modificato` });
      }
      if (updates.end_time !== undefined && updates.end_time !== existing.end_time) {
        logShiftEdit({ shiftId: id, actorName: actor, field: 'Fine', oldValue: (existing.end_time || '').slice(0,5), newValue: (updates.end_time || '').slice(0,5), description: `${date} — orario fine modificato` });
      }
      if (
        updates.approval_status !== undefined &&
        updates.approval_status !== existing.approval_status &&
        !isAbsentUpdate
      ) {
        logShiftEdit({
          shiftId: id,
          actorName: actor,
          field: 'Stato',
          oldValue: statusLabel[existing.approval_status] ?? existing.approval_status,
          newValue: statusLabel[updates.approval_status] ?? updates.approval_status,
          description: `${date} — stato turno modificato`,
        });
      }
      if (updates.user_id !== undefined && updates.user_id !== existing.user_id) {
        logShiftEdit({ shiftId: id, actorName: actor, field: 'Dipendente', oldValue: existing.user_id, newValue: updates.user_id, description: `${date} — turno spostato a diverso dipendente` });
      }
      if (updates.date !== undefined && updates.date !== existing.date) {
        logShiftEdit({ shiftId: id, actorName: actor, field: 'Data', oldValue: existing.date, newValue: updates.date, description: `Turno spostato da ${existing.date} a ${updates.date}` });
      }
    }

    try {
      const res = isAbsentUpdate ? await database.shifts.markAbsent(id) : await database.shifts.update(id, updates);
      if (isAbsentUpdate) {
        const nextRow = (res ? { ...res, ...updates } : merged) as Shift;
        setShifts((prev) => prev.map((s) => (s.id === id ? nextRow : s)));
        setPunchRecords((prev) => prev.filter((p) => p.shift_id !== id));
        markManagementDataTouched();
        if (isPublished) {
          const actor = currentUserRef.current?.first_name ?? 'Sistema';
          const date = existing.date;
          logShiftEdit({
            shiftId: id,
            actorName: actor,
            field: 'Stato',
            oldValue: statusLabel[existing.approval_status] ?? existing.approval_status,
            newValue: statusLabel.absent,
            description: `${date} — stato turno modificato`,
          });
        }
      } else if (res) {
        if ('deduct_excluded_rule_ids' in updates) {
          clearLocalDeductExcludedRuleIds(id);
        }
        setShifts((prev) => prev.map((s) => (s.id === id ? { ...res, ...updates } : s)));
        markManagementDataTouched();
      } else if (!isAbsentUpdate) {
        /* UPDATE riuscito ma select() senza riga: mantieni stato ottimistico e segna toccato */
        markManagementDataTouched();
      }
    } catch (err) {
      const updateKeys = Object.keys(updates).filter(
        (k) => (updates as Record<string, unknown>)[k] !== undefined
      );
      const onlyDeductExclusion =
        !isAbsentUpdate &&
        updateKeys.length === 1 &&
        updateKeys[0] === 'deduct_excluded_rule_ids' &&
        Array.isArray(updates.deduct_excluded_rule_ids);
      if (onlyDeductExclusion) {
        setLocalDeductExcludedRuleIds(id, updates.deduct_excluded_rule_ids!);
        markManagementDataTouched();
        return;
      }
      if (!isAbsentUpdate) {
        setShifts((prev) => prev.map((s) => (s.id === id ? existing : s)));
      }
      throw err;
    }
  }, [shifts, showError, computePersistedAutoBreak, effectiveLanguage, markManagementDataTouched]);

  // approveShiftSoft rimosso (semplificazione - approvazione automatica via timbrature)

  // approveShift rimosso (semplificazione - approvazione automatica via timbrature)
  const approveShift = async (shiftId: string, _opts?: any) => {
    // Non serve più - i turni sono completati in base alla presenza di punch_records
    console.log('approveShift chiamato ma ignorato (semplificazione)', shiftId);
  };


  const deleteShift = useCallback(async (id: string) => {
    const op = currentUserRef.current;
    if (!op || !canEditTeamShifts(op)) {
      const msg = getTranslations(effectiveLanguage).app_access_denied;
      showError(msg);
      throw new Error(msg);
    }
    const existing = shifts.find(s => s.id === id);
    const isFullPrivilegeOp = op.role === 'admin' || op.role === 'manager' || op.role === 'assistant_manager';
    // Turno contrassegnato assente: bloccato per tutti
    if (existing && existing.approval_status === 'absent') {
      const msg = getTranslations(effectiveLanguage).shift_delete_blocked_frozen;
      showError(msg);
      throw new Error(msg);
    }
    // Turno congelato (stato 'frozen'): richiede PIN verificato — anche per management
    if (existing && existing.approval_status === 'frozen') {
      if (!consumeFrozenDeleteAuth(id)) {
        const msg = getTranslations(effectiveLanguage).shift_delete_blocked_frozen;
        showError(msg);
        throw new Error(msg);
      }
    } else if (existing && isShiftPayrollFrozen(existing) && !isFullPrivilegeOp) {
      const msg = getTranslations(effectiveLanguage).shift_delete_blocked_frozen;
      showError(msg);
      throw new Error(msg);
    }
    if (existing && !isFullPrivilegeOp) {
      const st = String(existing.approval_status ?? '').trim().toLowerCase();
      if (st !== 'draft' && st !== '') {
        const msg = getTranslations(effectiveLanguage).shift_delete_blocked_published;
        showError(msg);
        throw new Error(msg);
      }
    }
    try {
      await database.shifts.delete(id);
      setShifts(prev => prev.filter(s => s.id !== id));
      setPunchRecords(prev => prev.filter(pr => pr.shift_id !== id));
      markManagementDataTouched();
      if (existing) {
        const actor = currentUserRef.current?.first_name ?? 'Sistema';
        logHistory('delete', actor, `Turno eliminato: ${existing.date} ${existing.start_time}–${existing.end_time}`);
      }
    } catch (err) {
      console.error('[deleteShift]', id, err);
      const msg = getTranslations(effectiveLanguage).shift_delete_bulk_error ?? getTranslations(effectiveLanguage).error_generic;
      showError(msg);
      throw err;
    }
  }, [shifts, showError, effectiveLanguage, markManagementDataTouched]);

  const deleteShifts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const op = currentUserRef.current;
    if (!op || !canEditTeamShifts(op)) {
      showError(getTranslations(effectiveLanguage).app_access_denied);
      return;
    }
    const hasStrictFrozen = ids.some((id) => {
      const s = shifts.find((x) => x.id === id);
      return s?.approval_status === 'frozen';
    });
    // Turni con stato 'frozen': richiedono PIN autorizzato individualmente
    if (hasStrictFrozen) {
      const allAuthorized = ids.every((id) => {
        const s = shifts.find((x) => x.id === id);
        return s?.approval_status !== 'frozen' || consumeFrozenDeleteAuth(id);
      });
      if (!allAuthorized) {
        showError(getTranslations(effectiveLanguage).shift_delete_blocked_frozen);
        return;
      }
    }
    const blockedFrozen = ids.some((id) => {
      const s = shifts.find((x) => x.id === id);
      if (!s) return false;
      if (s.approval_status === 'absent') return true;
      return isShiftPayrollFrozen(s);
    });
    const isFullPrivilegeOp = op.role === 'admin' || op.role === 'manager' || op.role === 'assistant_manager';
    if (blockedFrozen && !isFullPrivilegeOp) {
      showError(getTranslations(effectiveLanguage).shift_delete_blocked_frozen);
      return;
    }
    if (!isFullPrivilegeOp) {
      const blockedPublished = ids.some((id) => {
        const s = shifts.find((x) => x.id === id);
        if (!s) return false;
        const st = String(s.approval_status ?? '').trim().toLowerCase();
        return st !== 'draft' && st !== '';
      });
      if (blockedPublished) {
        showError(getTranslations(effectiveLanguage).shift_delete_blocked_published);
        return;
      }
    }
    const actor = currentUserRef.current?.first_name ?? 'Sistema';
    logHistory('bulk_delete', actor, `${ids.length} turni eliminati`);
    // Salva snapshot per rollback in caso di errore
    const removedShifts = shifts.filter(s => ids.includes(s.id));
    const removedPunchRecords = punchRecords.filter(pr => pr.shift_id && ids.includes(pr.shift_id));
    // Optimistic: rimuovi subito dallo stato locale per feedback immediato
    setShifts(prev => prev.filter(s => !ids.includes(s.id)));
    setPunchRecords(prev => prev.filter(pr => !pr.shift_id || !ids.includes(pr.shift_id)));
    try {
      // deleteMany gestisce già la cascade sui punch_records — nessuna chiamata duplicata
      await database.shifts.deleteMany(ids);
      markManagementDataTouched();
    } catch (err: unknown) {
      console.error('Errore eliminazione turni su Supabase:', ids, err);
      // Rollback: ripristina stato locale
      setShifts(prev => [...prev, ...removedShifts]);
      setPunchRecords(prev => [...prev, ...removedPunchRecords]);
      showError(getTranslations(effectiveLanguage).shift_delete_bulk_error);
    }
  }, [shifts, punchRecords, showError, effectiveLanguage, markManagementDataTouched]);

  const copyShift = useCallback(
    (shift: Shift, newDate: string) => {
      const op = currentUserRef.current;
      if (!op || !canEditTeamShifts(op)) {
        showError(getTranslations(effectiveLanguage).app_access_denied);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- id excluded for new shift
      const { id, ...rest } = shift;
      void addShift({ ...rest, date: newDate, approval_status: 'draft' });
    },
    [addShift, showError, effectiveLanguage]
  );

  const bulkCopyPreviousWeek = useCallback(
    async (currentWeekStart: Date): Promise<number> => {
      const op = currentUserRef.current;
      if (!op || !canEditTeamShifts(op)) {
        showError(getTranslations(effectiveLanguage).app_access_denied);
        return 0;
      }
      const prevWeekStart = addDays(currentWeekStart, -7);
      const prevWeekEnd = addDays(currentWeekStart, -1);
      const prevStartStr = format(prevWeekStart, 'yyyy-MM-dd');
      const prevEndStr = format(prevWeekEnd, 'yyyy-MM-dd');
      const prevShifts = shifts.filter(
        (s) => s.date >= prevStartStr && s.date <= prevEndStr
      );
      let count = 0;
      for (const shift of prevShifts) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- id excluded for new shift
        const { id, ...rest } = shift;
        const newDate = format(addDays(parseISO(shift.date), 7), 'yyyy-MM-dd');
        const res = await addShift({ ...rest, date: newDate, approval_status: 'draft' });
        if (res) count++;
      }
      return count;
    },
    [shifts, addShift, showError, effectiveLanguage]
  );

  const publishWeekShifts = useCallback(async (weekStart: Date) => {
    const op = currentUserRef.current;
    if (!op || !canPublishScheduleDrafts(op)) {
      showError(getTranslations(effectiveLanguage).app_access_denied);
      return;
    }
    try {
      const weekEnd = addDays(weekStart, 7);
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
      const draftShifts = shifts.filter(
        (s) => s.approval_status === 'draft' && s.date >= weekStartStr && s.date < weekEndStr
      );
      for (const shift of draftShifts) {
        const res = await database.shifts.update(shift.id, { approval_status: 'confirmed' });
        if (res) setShifts((prev) => prev.map((s) => (s.id === shift.id ? res : s)));
      }
      if (draftShifts.length > 0) {
        const actor = currentUserRef.current?.first_name ?? 'Sistema';
        logHistory('publish', actor, `Settimana ${weekStartStr} pubblicata (${draftShifts.length} turni)`);
        markManagementDataTouched();
      }
    } catch (error) {
      console.error('Errore durante la pubblicazione dei turni della settimana:', error);
    }
  }, [shifts, showError, effectiveLanguage, markManagementDataTouched]);

  const publishDayShifts = useCallback(async (dateStr: string) => {
    const op = currentUserRef.current;
    if (!op || !canPublishScheduleDrafts(op)) {
      showError(getTranslations(effectiveLanguage).app_access_denied);
      return;
    }
    try {
      const draftShifts = shifts.filter((s) => s.approval_status === 'draft' && s.date === dateStr);
      for (const shift of draftShifts) {
        const res = await database.shifts.update(shift.id, { approval_status: 'confirmed' });
        if (res) setShifts((prev) => prev.map((s) => (s.id === shift.id ? res : s)));
      }
      if (draftShifts.length > 0) markManagementDataTouched();
    } catch (error) {
      console.error('Errore durante la pubblicazione dei turni del giorno:', error);
    }
  }, [shifts, showError, effectiveLanguage, markManagementDataTouched]);

  const addHolidayRequest = useCallback(async (req: Omit<HolidayRequest, 'id' | 'created_at' | 'status'>): Promise<{ ok: boolean; emailSent?: boolean; error?: string }> => {
    const payload = { ...req, status: 'pending' as const };
    const res = await database.holidays.insert(payload);
    if (res) {
      setHolidays(prev => [...prev, res]);
      markManagementDataTouched();
    }

    const requester = users.find(u => u.id === req.user_id);
    if (!requester || !supabase) return { ok: true, emailSent: false };

    const managers = users.filter(
      (u) => u.role === 'admin' && u.status === 'active' && u.email
    );

    let emailSent = false;
    for (const manager of managers) {
      try {
        const { data, error } = await supabase.functions.invoke('send-holiday-notification', {
          body: {
            email: manager.email,
            nome: `${requester.first_name} ${requester.last_name}`.trim(),
            start_date: req.start_date,
            end_date: req.end_date,
            status: 'pending',
            language: (manager as User).language ?? effectiveLanguage,
            reason: req.reason ?? '',
            requester_email: requester.email,
          },
        });
        if (!error && !data?.error) emailSent = true;
      } catch { /* silently ignore */ }
    }

    return { ok: true, emailSent };
  }, [users, effectiveLanguage, markManagementDataTouched]);

  const updateHolidayStatus = useCallback(async (id: string, status: HolidayStatus): Promise<{ ok: boolean; emailSent?: boolean; error?: string }> => {
    if (status === 'approved' || status === 'rejected') {
      const op = currentUserRef.current;
      if (!op || !canApproveShiftActions(op)) {
        return { ok: false, emailSent: false, error: getTranslations(effectiveLanguage).app_access_denied };
      }
    }
    const holiday = holidays.find((h) => h.id === id);
    const user = holiday ? users.find((u) => u.id === holiday.user_id) : null;

    const res = await database.holidays.update(id, { status });
    if (res) {
      setHolidays(prev => prev.map(h => h.id === id ? res : h));
      markManagementDataTouched();
    }

    if (!holiday || !user) return { ok: true };

    const payload = {
      email: user.email,
      nome: `${user.first_name} ${user.last_name}`.trim(),
      start_date: holiday.start_date,
      end_date: holiday.end_date,
      status: status as 'approved' | 'rejected',
      language: effectiveLanguage,
    };

    if (!supabase) return { ok: true, emailSent: false };

    try {
      const { data, error } = await supabase.functions.invoke('send-holiday-notification', { body: payload });
      if (error) {
        console.warn('[HolidayStatus] Invio email fallito:', error);
        return { ok: true, emailSent: false, error: error.message };
      }
      if (data?.error) {
        console.warn('[HolidayStatus] Resend error:', data.error);
        return { ok: true, emailSent: false, error: data.error };
      }
      return { ok: true, emailSent: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[HolidayStatus] Errore invio email:', msg);
      return { ok: true, emailSent: false, error: msg };
    }
  }, [holidays, users, effectiveLanguage, markManagementDataTouched]);

  const deleteHolidayRequest = useCallback(async (id: string): Promise<boolean> => {
    try {
      await database.holidays.delete(id);
      setHolidays(prev => prev.filter(h => h.id !== id));
      markManagementDataTouched();
      return true;
    } catch (err) {
      console.warn('[deleteHolidayRequest]', err);
      return false;
    }
  }, [markManagementDataTouched]);

  const addPunchRecord = useCallback(
    async (
      userId: string,
      type: 'in' | 'out',
      options?: { timestamp?: string; shift_id?: string; presenceProof?: string; source?: PunchRecordSource }
    ) => {
    const t = getTranslations(effectiveLanguage);
    if (punchInFlightRef.current || isPunching) return { error: t.punch_in_progress };
    if (!userId || typeof userId !== 'string') return;

    const shiftId = options?.shift_id;
    if (shiftId !== undefined && (!shiftId || typeof shiftId !== 'string')) {
      console.warn('shift_id non valido: record orfano evitato. Passare shift_id per timbratura collegata al turno.');
    }

    punchInFlightRef.current = true;
    setIsPunching(true);

    try {
      const actor = currentUserRef.current;
      const managerPunchingForSomeoneElse =
        !!(actor && actor.id !== userId && canOperateTeamSchedule(actor));

      // Blocca timbratura manuale su turni congelati
      if (options?.shift_id && options?.source === 'manual') {
        const shift = shifts.find(s => s.id === options.shift_id);
        if (shift && isShiftPayrollFrozen(shift)) {
          punchInFlightRef.current = false;
          setIsPunching(false);
          return { error: t.shift_delete_blocked_frozen };
        }
      }

      const resolvedSource: PunchRecordSource =
        options?.source ?? (managerPunchingForSomeoneElse ? 'manager' : 'kiosk');

      const manualTimestampIso =
        resolvedSource === 'manual' && options?.timestamp
          ? new Date(options.timestamp).toISOString()
          : null;

      // Toggle intelligente: niente due IN o due OUT di seguito (solo flussi chiosco/app, non manuale)
      let effectiveType: 'in' | 'out' = type;
      if (resolvedSource !== 'manual') {
        const forUser = punchRecordsRef.current
          .filter((p) => p.user_id === userId)
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        const last = forUser[0];
        const lastKind = last?.type;
        if (lastKind === 'in' && type === 'in') {
          effectiveType = 'out';
        } else if (lastKind === 'out' && type === 'out') {
          return { error: t.punch_timbratura_doppia };
        } else if (!last && type === 'out') {
          return { error: t.punch_uscita_senza_entrata };
        }
      }

      // Non richiedere geofence per punch manuali o per manager che punzionano per altri
      const shouldVerifyGeofence = resolvedSource !== 'manual' && !managerPunchingForSomeoneElse;

      const geoCfg = geofenceEffectiveConfigRef.current ?? readGeofenceEnvConfig();
      if (featureFlags['geofence_punch'] === true) {
        if (!geoCfg) {
          if (!geofenceMissingEnvWarned) {
            geofenceMissingEnvWarned = true;
            console.warn(
              '[geofence_punch] Attivo ma nessun centro configurato: salva lat/lng in Impostazioni (geofence.json) o imposta VITE_RESTAURANT_LAT/LNG nel build.'
            );
          }
        } else if (shouldVerifyGeofence) {
          try {
            const pos = await getCurrentPositionCoords();
            const { inRange, distanceM } = isUserInRestaurantRange(pos.lat, pos.lng, geoCfg);
            if (!inRange) {
              return {
                error: formatTrans(t.punch_geofence_outside_distance, {
                  meters: String(Math.round(distanceM)),
                }),
              };
            }
          } catch (e: unknown) {
            const err = e as { code?: number };
            const code = typeof err?.code === 'number' ? err.code : -1;
            if (code === 1) return { error: t.punch_geofence_denied };
            if (code === 3) return { error: t.punch_geofence_timeout };
            return { error: t.punch_geofence_unavailable };
          }
        }
      }

      const pv = presenceVerificationRef.current;
      const effectivePresenceToken = resolveEffectiveVerificationToken(pv);
      const shouldVerifyPresence =
        pv.requireVerification === true && !managerPunchingForSomeoneElse && resolvedSource !== 'manual';

      if (shouldVerifyPresence) {
        if (!effectivePresenceToken) {
          return { error: t.punch_presence_not_configured };
        }
        const proof = options?.presenceProof?.trim() ?? '';
        if (!proof) {
          return { error: t.punch_presence_proof_required };
        }
        const tenantSlug = tenantRef.current?.slug ?? '';
        const v = await verifyPresenceProofScanned(proof, effectivePresenceToken, tenantSlug);
        if (!v.ok) {
          const errMsg =
            v.reason === 'expired'
              ? t.punch_presence_qr_expired
              : t.punch_presence_proof_mismatch;
          return { error: errMsg };
        }
        if (import.meta.env.DEV) {
          console.info('[presence-proof] verifica superata', {
            method: v.method,
            tenantSlug: tenantSlug || '(default)',
          });
        }
      }

      const record: Record<string, unknown> = {
        user_id: userId,
        type: effectiveType,
        source: resolvedSource,
        // Se è attiva una sessione di impersonazione, traccia l'admin originale per audit legale
        ...(originalAdminUserRef.current ? { impersonated_by: originalAdminUserRef.current.id } : {}),
      };
      if (resolvedSource === 'manual' && manualTimestampIso) {
        record.timestamp = manualTimestampIso;
      }

      if (shiftId && typeof shiftId === 'string') {
        record.shift_id = shiftId;
        if (effectiveType === 'in' && resolvedSource === 'manual' && manualTimestampIso) {
          const relatedShift = shifts.find((s) => s.id === shiftId);
          if (relatedShift) {
            record.calculated_time = manualTimestampIso;
          }
        }
      }

      const res = await database.punchRecords.insert(record as Omit<PunchRecord, 'id'>);
      if (res) {
        let row: PunchRecord = res as PunchRecord;
        if (
          effectiveType === 'in' &&
          shiftId &&
          resolvedSource !== 'manual' &&
          typeof row.timestamp === 'string'
        ) {
          const relatedShift = shifts.find((s) => s.id === shiftId);
          if (relatedShift) {
            const ct = computeEffectivePunchIn(relatedShift, row.timestamp);
            if (ct && ct !== row.calculated_time) {
              const upd = await database.punchRecords.update(row.id, { calculated_time: ct });
              if (upd) row = { ...row, ...upd };
            }
          }
        }
        setPunchRecords((prev) => [row, ...prev]);
        markManagementDataTouched();
        return {
          record: row,
          toggledToExit: effectiveType === 'out' && type === 'in',
        };
      }
    } finally {
      punchInFlightRef.current = false;
      setIsPunching(false);
    }
  }, [isPunching, shifts, effectiveLanguage, featureFlags, markManagementDataTouched]);

  const updatePunchRecord = useCallback(async (id: string, updates: { timestamp?: string; calculated_time?: string; clock_out_time?: string | null }) => {
    // Legge il record corrente dal ref (senza dipendenza da punchRecords nello state)
    const existing = punchRecordsRef.current.find((p) => p.id === id);

    const res = await database.punchRecords.update(id, updates);
    if (res) {
      setPunchRecords((prev) => prev.map((p) => p.id === id ? { ...p, ...res } : p));

      // Audit log: registra ogni campo modificato su Supabase
      const actor = currentUserRef.current;
      if (actor && existing) {
        const actorName = [actor.first_name, actor.last_name].filter(Boolean).join(' ');
        const fieldsToAudit = ['timestamp', 'calculated_time', 'clock_out_time'] as const;
        for (const field of fieldsToAudit) {
          if (!(field in updates)) continue;
          const oldVal = existing[field as keyof PunchRecord] as string | null | undefined;
          const newVal = updates[field as keyof typeof updates] as string | null | undefined;
          if (oldVal !== newVal) {
            await database.punchAuditLog.insert({
              punch_record_id: id,
              actor_id: actor.id,
              actor_name: actorName,
              field,
              old_value: oldVal ?? undefined,
              new_value: newVal ?? undefined,
            } as Omit<PunchAuditEntry, 'id' | 'changed_at'>);
          }
        }
      }
      markManagementDataTouched();
    }
  }, [markManagementDataTouched]);

  const deletePunchRecordsForShift = useCallback(async (shiftId: string) => {
    await database.punchRecords.deleteByShiftId(shiftId);
    setPunchRecords(prev => prev.filter(p => p.shift_id !== shiftId));
    markManagementDataTouched();
  }, [markManagementDataTouched]);

  const updateUser = useCallback(async (id: string, updates: Partial<User>): Promise<boolean> => {
    const prevUser = users.find((u) => u.id === id);
    if (!prevUser) return false;

    const mergedStatus = updates.status !== undefined ? updates.status : prevUser.status;
    const mergedPinRaw = updates.pin !== undefined ? String(updates.pin) : String(prevUser.pin ?? '');
    if (mergedStatus === 'active' && mergedPinRaw.replace(/\D/g, '').length === 4) {
      const other = findActiveUserWithSamePin(users, mergedPinRaw, id);
      if (other) {
        const tr = getTranslations(effectiveLanguage);
        const name = `${other.first_name ?? ''} ${other.last_name ?? ''}`.trim() || other.email;
        showError(formatTrans(tr.employee_pin_taken_by_active, { name }));
        return false;
      }
    }

    const adminGuardPatch: Partial<Pick<User, 'role' | 'status'>> = {};
    if (updates.role !== undefined) adminGuardPatch.role = updates.role;
    if (updates.status !== undefined) adminGuardPatch.status = updates.status;
    if (
      Object.keys(adminGuardPatch).length > 0 &&
      wouldLeaveNoActiveAdmin(users, id, adminGuardPatch)
    ) {
      const tr = getTranslations(effectiveLanguage);
      showError(tr.settings_last_active_admin_block);
      return false;
    }

    // Aggiornamento ottimistico: l'UI si aggiorna subito
    const optimisticallyUpdated = { ...prevUser, ...updates };
    setUsers((prev) => prev.map((u) => (u.id === id ? optimisticallyUpdated : u)));
    if (currentUser?.id === id) setCurrentUser(userRowToSessionUser(optimisticallyUpdated as User));

    try {
      const res = await database.users.update(id, updates);
      if (res) {
        setUsers((prev) => prev.map((u) => (u.id === id ? res : u)));
        if (currentUser?.id === id) setCurrentUser(userRowToSessionUser(res as User));
      }
      markManagementDataTouched();
      const updatesRemoteConfig =
        'enabled_features' in updates ||
        'enabled_modules' in updates ||
        'ui_section_overrides' in updates ||
        'can_manage_drafts' in updates ||
        'can_approve_shifts' in updates ||
        'can_view_total_hours' in updates ||
        'can_create_shifts' in updates ||
        'can_edit_staff_pins' in updates ||
        'can_request_holidays' in updates ||
        'can_punch_from_app' in updates;
      const updatesProfileOrIdentity =
        'role' in updates ||
        'status' in updates ||
        'department' in updates ||
        'hide_from_team_schedule' in updates ||
        'language' in updates ||
        'theme' in updates ||
        'sort_order' in updates ||
        'first_name' in updates ||
        'last_name' in updates ||
        'email' in updates ||
        'phone' in updates ||
        'pin' in updates ||
        'hourly_rate_eur' in updates ||
        'monthly_confirmed' in updates;
      const needsSilentRefresh = updatesRemoteConfig || updatesProfileOrIdentity;
      const shouldBumpClientSyncRevision =
        updatesRemoteConfig ||
        'role' in updates ||
        'status' in updates ||
        'pin' in updates ||
        'department' in updates ||
        'hide_from_team_schedule' in updates;
      // Sempre refresh dopo salvataggio profilo/permessi: se PostgREST restituisce `res` null (es. RLS su SELECT dopo UPDATE),
      // senza questo gli altri dispositivi e la lista utenti non si allineano al DB.
      if (needsSilentRefresh) {
        if (shouldBumpClientSyncRevision) {
          const rev = await bumpClientSyncRevisionOnSupabase();
          if (rev != null) writeAckClientSyncRevision(rev);
        }
        const pullRemote =
          updatesRemoteConfig || shouldBumpClientSyncRevision;
        await silentRefreshDataRef.current(pullRemote ? { pullRemoteConfig: true } : undefined);
      }
      return true;
    } catch (err) {
      // Ripristino in caso di errore
      setUsers((prev) => prev.map((u) => (u.id === id ? prevUser : u)));
      if (currentUser?.id === id) setCurrentUser(userRowToSessionUser(prevUser as User));
      const detail = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : '';
      console.warn('[updateUser]', detail || err);
      const tr = getTranslations(effectiveLanguage);
      showError(
        detail
          ? formatTrans(tr.app_save_failed_detail, { detail: detail.slice(0, 120) })
          : tr.app_save_failed_profile
      );
      return false;
    }
  }, [currentUser, users, showError, effectiveLanguage, markManagementDataTouched]);

  const deleteUser = useCallback(
    async (id: string) => {
      const ALLOWED_DELETE_ROLES: UserRole[] = ['admin', 'manager', 'assistant_manager'];
      if (!currentUser || !ALLOWED_DELETE_ROLES.includes(currentUser.role)) {
        const tr = getTranslations(effectiveLanguage);
        showError(tr.profile_visibility_forbidden ?? 'Azione non consentita.');
        return false;
      }
      const victim = users.find((u) => u.id === id);
      if (
        victim?.role === 'admin' &&
        victim.status === 'active' &&
        countActiveAdmins(users) <= 1
      ) {
        const tr = getTranslations(effectiveLanguage);
        showError(tr.settings_last_active_admin_block);
        return false;
      }
      try {
        if (supabase) {
          const { error: rpcErr } = await supabase.rpc('delete_user_cascade', {
            target_user_id: id,
          });
          if (rpcErr) throw rpcErr;
        } else {
          await database.users.delete(id);
        }
      } catch (err) {
        const tr = getTranslations(effectiveLanguage);
        showError(tr.settings_delete_user_error ?? 'Impossibile eliminare il profilo.');
        console.error('[deleteUser]', err);
        return false;
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
      markManagementDataTouched();
      const rev = await bumpClientSyncRevisionOnSupabase();
      if (rev != null) writeAckClientSyncRevision(rev);
      return true;
    },
    [currentUser, users, effectiveLanguage, showError, markManagementDataTouched]
  );

  const createUser = useCallback(
    async (payload: {
      first_name: string;
      last_name?: string;
      email: string;
      role: UserRole;
      pin: string;
      status: UserStatus;
      department?: Department;
      hourly_rate_eur?: number | null;
      employment_start_date?: string | null;
      employment_end_date?: string | null;
    }): Promise<User | null> => {
      const tr = getTranslations(effectiveLanguage);
      if (!supabase) {
        showError(tr.create_employee_error_no_supabase);
        return null;
      }
      // Email opzionale: se non fornita, genera un placeholder unico
      if (!payload.email?.trim()) {
        const slug = payload.first_name.trim().toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '') || 'staff';
        payload = { ...payload, email: `${slug}.${payload.pin}@noreply.flow` };
      }
      const pinConflict = findActiveUserWithSamePin(users, payload.pin);
      if (pinConflict) {
        const name = `${pinConflict.first_name ?? ''} ${pinConflict.last_name ?? ''}`.trim() || pinConflict.email;
        showError(formatTrans(tr.employee_pin_taken_by_active, { name }));
        return null;
      }
      const maxOrder = users.reduce((m, u) => Math.max(m, u.sort_order ?? 0), 0);
      const perms = defaultPermissionFieldsForNewUser(payload.role);
      const lastName = payload.last_name?.trim() ?? '';
      const employmentStart =
        payload.employment_start_date && /^\d{4}-\d{2}-\d{2}$/.test(payload.employment_start_date)
          ? payload.employment_start_date
          : null;
      const employmentEndRaw =
        payload.employment_end_date && /^\d{4}-\d{2}-\d{2}$/.test(payload.employment_end_date)
          ? payload.employment_end_date
          : null;
      const employmentEnd =
        payload.status === 'active' ? null : employmentEndRaw;
      const newRow: Omit<User, 'id'> = {
        first_name: payload.first_name.trim(),
        /* Stringa vuota se assente: DB legacy con last_name NOT NULL. */
        last_name: lastName,
        email: payload.email.trim().toLowerCase(),
        role: payload.role,
        pin: payload.pin,
        status: payload.status,
        sort_order: maxOrder + 1,
        language: 'it',
        theme: 'light',
        ...perms,
        ...(payload.department ? { department: payload.department } : {}),
        ...(payload.hourly_rate_eur != null && Number.isFinite(payload.hourly_rate_eur)
          ? { hourly_rate_eur: payload.hourly_rate_eur }
          : {}),
        employment_start_date: employmentStart,
        employment_end_date: employmentEnd,
      };
      try {
        const res = await database.users.insert(newRow);
        if (!res) {
          showError(tr.create_employee_error_no_row);
          return null;
        }
        const created = res as User;
        setUsers((prev) => {
          const others = prev.filter((u) => u.id !== created.id);
          return [...others, created].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        });
        markManagementDataTouched();
        const rev = await bumpClientSyncRevisionOnSupabase();
        if (rev != null) writeAckClientSyncRevision(rev);
        try {
          await silentRefreshDataRef.current({
            pullRemoteConfig: true,
            skipRemoteRevisionCheck: true,
          });
        } catch (syncErr) {
          console.warn('[createUser] refresh dopo creazione', syncErr);
        }
        /* Il refresh può sostituire la lista prima che la replica esponga la nuova riga: reintegra il creato. */
        setUsers((prev) => {
          if (prev.some((u) => u.id === created.id)) return prev;
          return [...prev, created].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        });
        showSuccess(tr.create_employee_success);
        return created;
      } catch (err) {
        const full = formatSupabaseError(err);
        const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : '';
        const details =
          err && typeof err === 'object' && 'details' in err ? String((err as { details: string }).details) : '';
        const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
        const dup = code === '23505' || /unique|duplicate/i.test(msg + details + full);
        const rls =
          code === '42501' ||
          /row-level security|permission denied|rls|new row violates|policy/i.test(`${msg} ${details} ${full}`.toLowerCase());
        console.warn('[createUser]', full || err);
        const detailSlice = full.trim().slice(0, 220);
        showError(
          rls
            ? tr.create_employee_error_rls
            : dup
              ? tr.create_employee_error_duplicate
              : detailSlice
                ? detailSlice
                : tr.create_employee_error
        );
        return null;
      }
    },
    [users, effectiveLanguage, showError, showSuccess, markManagementDataTouched]
  );

  const reorderUsers = useCallback(async (userId: string, direction: 'up' | 'down') => {
    try {
      const sorted = [...users].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      const idx = sorted.findIndex((u) => u.id === userId);
      if (idx < 0) return;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= sorted.length) return;
      const userA = sorted[idx];
      const userB = sorted[swapIdx];
      const orderA = userA.sort_order ?? idx;
      const orderB = userB.sort_order ?? swapIdx;
      await database.users.update(userA.id, { sort_order: orderB });
      await database.users.update(userB.id, { sort_order: orderA });
      setUsers((prev) =>
        prev
          .map((u) =>
            u.id === userA.id ? { ...u, sort_order: orderB } : u.id === userB.id ? { ...u, sort_order: orderA } : u
          )
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      );
      markManagementDataTouched();
    } catch (error) {
      console.error('Errore durante il riordino del personale:', error);
    }
  }, [users, markManagementDataTouched]);

  /** Aggiorna solo lo stato: assegna sort_order 1,2,3,... in base a orderedIds. Nessuna chiamata al DB. */
  const setUsersSortOrder = useCallback((orderedIds: string[]) => {
    setUsers((prev) =>
      prev
        .map((u) => {
          const i = orderedIds.indexOf(u.id);
          if (i === -1) return u;
          return { ...u, sort_order: i + 1 };
        })
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    );
    markManagementDataTouched();
  }, [markManagementDataTouched]);

  const updateUserPreferences = useCallback((pref: { language?: Language; theme?: 'light' | 'dark' | null }) => {
    if (!currentUser) return;
    const dbPayload: Record<string, unknown> = {};
    if (pref.language) dbPayload.language = pref.language;
    if (Object.keys(dbPayload).length > 0) {
      updateUser(currentUser.id, dbPayload as Partial<User>);
    }
    setCurrentUser({
      ...currentUser,
      ...(pref.language ? { language: pref.language } : {}),
    });
  }, [currentUser, updateUser]);

  const setLanguage = useCallback((lang: Language) => {
    persistStoredUiLanguage(lang);
    setAppLanguage(lang);
    if (currentUser) {
      updateUser(currentUser.id, { language: lang });
      setCurrentUser({ ...currentUser, language: lang });
    }
  }, [currentUser, updateUser]);

  const clearLanguage = useCallback(() => {
    clearStoredUiLanguage();
    const deviceLang = getDeviceUiLanguage();
    setAppLanguage(deviceLang);
    if (currentUser) {
      updateUser(currentUser.id, { language: null as unknown as Language });
      setCurrentUser({ ...currentUser, language: undefined as unknown as Language });
    }
  }, [currentUser, updateUser]);

  /** Ritardo prima di mostrare il banner: sync veloci non lampeggiano (focus, tab, polling ravvicinati). */
  const DATA_SYNC_UI_DELAY_MS = 600;
  /** Se PostgREST/Storage non rispondono, senza timeout il `finally` non gira e il banner sync resta ore. */
  const SILENT_REFRESH_MAX_MS = 90_000;
  /** Evita loop se pending si riempie più velocemente di quanto si svuota (signal Realtime + mount Admin, ecc.). */
  const SILENT_REFRESH_MAX_ITERATIONS = 24;
  const PUSH_SETTINGS_CLOUD_MAX_MS = 120_000;

  const enterSilentDataSync = useCallback(() => {
    silentSyncDepthRef.current += 1;
    if (silentSyncDepthRef.current === 1 && dataSyncBarDelayTimerRef.current === null) {
      const tid = window.setTimeout(() => {
        dataSyncBarDelayTimerRef.current = null;
        if (silentSyncDepthRef.current > 0) setDataSyncInProgress(true);
      }, DATA_SYNC_UI_DELAY_MS);
      dataSyncBarDelayTimerRef.current = tid;
    }
  }, []);

  const leaveSilentDataSync = useCallback(() => {
    silentSyncDepthRef.current = Math.max(0, silentSyncDepthRef.current - 1);
    if (silentSyncDepthRef.current === 0) {
      if (dataSyncBarDelayTimerRef.current !== null) {
        clearTimeout(dataSyncBarDelayTimerRef.current);
        dataSyncBarDelayTimerRef.current = null;
      }
      setDataSyncInProgress(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (dataSyncBarDelayTimerRef.current !== null) clearTimeout(dataSyncBarDelayTimerRef.current);
    };
  }, []);

  /**
   * Refresh silenzioso: sempre DB + allineamento utente loggato.
   * Con `pullRemoteConfig: true` (dopo toggle permessi/flag/regole) ricarica anche Storage.
   * Feature flag: remoto vince sul local (allineamento multi-dispositivo); il toggle locale salva già su Storage prima del refresh.
   *
   * Le chiamate sovrapposte (Realtime, focus, tab, polling) vanno in **coda** con opzioni unite.
   * Un solo `enterSilentDataSync` / `leaveSilentDataSync` per ondata + ciclo che drena le richieste
   * arrivate durante il refresh: evita banner “infinito” e lampeggi intermittenti tra job in serie.
   */
  const silentRefreshData = useCallback(async (opts?: SilentRefreshOpts) => {
    silentRefreshPendingOptsRef.current = mergeSilentRefreshOpts(silentRefreshPendingOptsRef.current, opts);

    const queued = silentRefreshQueueRef.current.then(async () => {
      let merged = silentRefreshPendingOptsRef.current;
      silentRefreshPendingOptsRef.current = null;
      if (merged === null) return;

      enterSilentDataSync();
      const runSilentRefreshInner = async (iterationOpts: SilentRefreshOpts) => {
        const safeLoad = async <T,>(label: string, fn: () => Promise<T[]>): Promise<T[] | null> => {
          try {
            return await fn();
          } catch (e) {
            console.warn(`[silentRefreshData] ${label} non caricato, stato UI invariato`, e);
            return null;
          }
        };

        const [loadedUsers, loadedShifts, loadedHolidays, loadedPunchRecords, loadedAvailability] = await Promise.all([
          safeLoad('users', () => database.users.getAll()),
          safeLoad('shifts', () => database.shifts.getAll()),
          safeLoad('holidays', () => database.holidays.getAll()),
          safeLoad('punchRecords', () => database.punchRecords.getAll()),
          safeLoad('availability', () => database.availability.getAll()),
        ]);

        if (loadedUsers !== null) setUsers(loadedUsers);
        if (loadedShifts !== null) setShiftsFromServer(mergeShiftsDeductExclusionsFromLocal(loadedShifts));
        if (loadedHolidays !== null) setHolidays(loadedHolidays);
        if (loadedPunchRecords !== null) setPunchRecords(loadedPunchRecords);
        if (loadedAvailability !== null) setAvailability(loadedAvailability);

        if (loadedUsers !== null) {
          setCurrentUser((prev) => sessionUserFromLoadedUsersList(prev, loadedUsers));
        }

        const pullRemoteConfig = Boolean(iterationOpts.pullRemoteConfig && isAppCloudSyncEnabled());
        if (pullRemoteConfig) {
          const [sbFlags, periodRemote] = await Promise.all([
            loadFeatureFlagsFromSupabase().catch(() => null),
            loadTimesheetPeriodFromSupabase().catch(() => null),
          ]);
          if (periodRemote) {
            applyRemoteTimesheetPeriod(periodRemote);
          }

          const bundle = await fetchGlobalSettingsBundleFromSupabase({
            force: iterationOpts.forceSettingsBundle === true,
          }).catch(() => null);
          if (bundle) {
            if (!bundle.featureFlags) {
              const localFlags = getLocalFeatureFlags();
            const mergedFlags = sbFlags ? { ...sbFlags, ...localFlags } : localFlags;
            setFeatureFlagsState(mergedFlags);
            writeFeatureFlagsToStorage(mergedFlags);
          }
          applyAppSettingsBundle(bundle);
          await refreshGeofenceEffectiveConfig();
          if (!bundle.presenceVerification) {
            await refreshPresenceVerificationConfig();
          }
          const deptRemoteSr = await loadDepartmentsFromSupabase().catch(() => null);
          mergeDepartmentsRemoteAfterPull(deptRemoteSr);
        } else {
          const localFlags = getLocalFeatureFlags();
          const mergedFlags = sbFlags ? { ...sbFlags, ...localFlags } : localFlags;
            setFeatureFlagsState(mergedFlags);
            writeFeatureFlagsToStorage(mergedFlags);
            const rtRemote = await loadRoleFeatureTemplatesFromSupabase().catch(() => null);
            const rtLocal = getLocalRoleFeatureTemplates();
            const rtMerged = loadAndMergeRoleTemplates(rtRemote, rtLocal);
            setRoleFeatureTemplatesCache(rtMerged);
            if (rtMerged) writeRoleFeatureTemplatesLocal(rtMerged);
            setRoleTemplatesRevision((n) => n + 1);
            const amRemote = await loadAdminModulesGlobalFromSupabase().catch(() => null);
            const amLocal = getLocalAdminModulesGlobal();
            const amMerged = loadAndMergeAdminModulesGlobal(amRemote, amLocal);
            setAdminModulesGlobalCache(amMerged);
            if (amMerged) writeAdminModulesGlobalLocal(amMerged);
            setAdminModulesRevision((n) => n + 1);
            await refreshGeofenceEffectiveConfig();
            await refreshPresenceVerificationConfig();
            const [wrSb, brSb] = await Promise.all([
              loadWorkRulesFromSupabase().catch(() => null),
              loadBreakRulesFromSupabase().catch(() => null),
            ]);
            if (wrSb) {
              setWorkRulesState(wrSb);
              saveWorkRules(wrSb);
            }
            if (brSb) setBreakRulesState(brSb);
            const deptRemoteSrElse = await loadDepartmentsFromSupabase().catch(() => null);
            mergeDepartmentsRemoteAfterPull(deptRemoteSrElse);
            setSettingsCloudLastSyncedAt(new Date().toISOString());
          }
        }

        /* Cross-device: la revisione va controllata a ogni sync DB, non solo con pullRemoteConfig
           (altrimenti pull-to-refresh, mount, cambio tab non leggono mai Storage). */
        if (!iterationOpts.skipRemoteRevisionCheck && isAppCloudSyncEnabled()) {
          /* Evita loop: con rev remota > ack si apre overlay PIN; altre `silentRefreshData` in coda
             non devono richiamare `forceGlobalRefresh` di nuovo o la sync sembra non finire mai. */
          if (!postRefreshLockedRef.current && pendingClientSyncRevRef.current === null) {
            const remoteRev = await fetchClientSyncRevisionFromSupabase().catch(() => null);
            if (remoteRev != null && remoteRev > getAckClientSyncRevision()) {
              if (currentUserRef.current) {
                pendingClientSyncRevRef.current = remoteRev;
                await forceGlobalRefreshRef.current();
              } else {
                writeAckClientSyncRevision(remoteRev);
              }
            }
          }
        }
      };

      try {
        let iterationCount = 0;
        while (merged !== null) {
          iterationCount += 1;
          if (iterationCount > SILENT_REFRESH_MAX_ITERATIONS) {
            console.warn(
              '[silentRefreshData] interrotto dopo troppe iterazioni in coda; il resto viene riaccodato.'
            );
            const tail = silentRefreshPendingOptsRef.current;
            silentRefreshPendingOptsRef.current = null;
            if (tail) {
              window.setTimeout(() => {
                void silentRefreshDataRef.current(tail);
              }, 400);
            }
            break;
          }
          const iterationOpts = merged;
          try {
            await withTimeout(runSilentRefreshInner(iterationOpts), SILENT_REFRESH_MAX_MS, 'silentRefreshData');
            if (iterationOpts.pullRemoteConfig) {
              setManagementDataTouchedSinceLastSync(false);
            }
          } catch (err) {
            if (err instanceof TimeoutError) {
              console.warn('[silentRefreshData]', err.message, '— banner sync chiuso; controlla rete e credenziali Supabase.');
            } else {
              console.error('Errore durante il refresh silenzioso:', err);
            }
            if (iterationOpts.throwOnError) throw err;
            break;
          }
          merged = silentRefreshPendingOptsRef.current;
          silentRefreshPendingOptsRef.current = null;
        }
      } finally {
        leaveSilentDataSync();
      }
    });

    silentRefreshQueueRef.current = queued.catch(() => {});
    await queued;
  }, [
    enterSilentDataSync,
    leaveSilentDataSync,
    refreshGeofenceEffectiveConfig,
    refreshPresenceVerificationConfig,
    applyAppSettingsBundle,
    mergeDepartmentsRemoteAfterPull,
  ]);

  silentRefreshDataRef.current = silentRefreshData;

  const hardReloadFromDatabase = useCallback(async () => {
    const SLOW_WARN_MS = 6_000;
    const HARD_LIMIT_MS = 15_000;

    setIsGlobalRefreshing(true);
    try {
      setSyncStage('Pulizia cache locale…');
      const shiftCacheKeys = Object.keys(localStorage).filter(
        (k) => k.toLowerCase().includes('shift') || k.toLowerCase().includes('turni')
      );
      shiftCacheKeys.forEach((k) => localStorage.removeItem(k));

      setSyncStage('Caricamento dati dal server…');

      const slowTimer = window.setTimeout(
        () => setSyncStage('Connessione lenta, attendere…'),
        SLOW_WARN_MS,
      );

      const hardTimeout = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('SYNC_TIMEOUT')), HARD_LIMIT_MS),
      );

      await Promise.race([
        silentRefreshData({
          pullRemoteConfig: isAppCloudSyncEnabled(),
          skipRemoteRevisionCheck: true,
          throwOnError: true,
          forceSettingsBundle: true,
        }),
        hardTimeout,
      ]);

      clearTimeout(slowTimer);

      setSyncStage('Aggiornamento revisione…');
      pendingClientSyncRevRef.current = null;
      const rev = isAppCloudSyncEnabled()
        ? await fetchClientSyncRevisionFromSupabase().catch(() => null)
        : null;
      if (rev != null) writeAckClientSyncRevision(rev);
      showSuccess(getTranslations(effectiveLanguage).hard_reload_success);
    } catch (err) {
      console.error('[hardReloadFromDatabase]', err);
      showError(getTranslations(effectiveLanguage).hard_reload_error);
    } finally {
      setSyncStage('');
      setIsGlobalRefreshing(false);
    }
  }, [silentRefreshData, showError, showSuccess, effectiveLanguage]);

  /** Background Sync API: registra il tag in background; niente refresh automatico alla riconnessione (sync solo su comando). */
  useEffect(() => {
    const onOffline = () => {
      void registerOsteriaBackgroundSync();
    };
    window.addEventListener('offline', onOffline);
    if (!navigator.onLine) {
      void registerOsteriaBackgroundSync();
    }
    void navigator.serviceWorker?.ready.then(() => {
      if (!navigator.onLine) void registerOsteriaBackgroundSync();
    });

    return () => {
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const hardResetTestData = useCallback(async () => {
    const result = await database.hardResetTestData();
    setShifts([]);
    setHolidays([]);
    setPunchRecords([]);
    setAvailability([]);
    markManagementDataTouched();
    return result;
  }, [markManagementDataTouched]);

  const seedDemoProfileForUser = useCallback(
    async (userId: string) => {
      const result = await database.seedDemoProfileForUser(userId);
      markManagementDataTouched();
      await silentRefreshData({ skipRemoteRevisionCheck: true });
      return result;
    },
    [silentRefreshData, markManagementDataTouched]
  );

  const setFeatureFlag = useCallback(async (name: string, enabled: boolean) => {
    setFeatureFlagsState((prev) => ({ ...prev, [name]: enabled }));
    saveLocalFeatureFlag(name, enabled);
    markManagementDataTouched();
    await updateFeatureFlagInSupabase(name, enabled).catch(() => {});
    const rev = await bumpClientSyncRevisionOnSupabase();
    if (rev != null) writeAckClientSyncRevision(rev);
    // Non forziamo pullRemoteConfig: la scrittura è appena avvenuta e lo stato locale è già aggiornato.
    // silentRefreshData immediato causerebbe race condition (legge vecchio valore prima della propagazione).
  }, [markManagementDataTouched]);

  const saveGeofenceConfig = useCallback(
    async (config: GeofenceConfig) => {
      writeLocalGeofenceConfig(config);
      await saveGeofenceConfigToSupabase(config);
      await refreshGeofenceEffectiveConfig();
      markManagementDataTouched();
    },
    [refreshGeofenceEffectiveConfig, markManagementDataTouched]
  );

  const setWorkRules = useCallback(async (rules: WorkRules) => {
    setWorkRulesState(rules);
    saveWorkRules(rules);
    markManagementDataTouched();
    await saveWorkRulesToSupabase(rules).catch(() => {});
    const rev = await bumpClientSyncRevisionOnSupabase();
    if (rev != null) writeAckClientSyncRevision(rev);
  }, [markManagementDataTouched]);

  const setBreakRules = useCallback(async (rules: BreakRule[]) => {
    setBreakRulesState(rules);
    markManagementDataTouched();
    saveBreakRulesToLocalStorage(rules);
    await saveBreakRulesToSupabase(rules).catch(() => {});
    const rev = await bumpClientSyncRevisionOnSupabase();
    if (rev != null) writeAckClientSyncRevision(rev);
  }, [markManagementDataTouched]);

  const pushSettingsToCloud = useCallback(async () => {
    if (!isAppCloudSyncEnabled()) {
      showError(getTranslations(effectiveLanguage).settings_cloud_sync_paused);
      return;
    }
    setSettingsCloudPushBusy(true);
    try {
      await withTimeout(
        (async () => {
          const disk = getLocalGeofenceConfig();
          const rt = getRoleFeatureTemplatesCache() ?? getLocalRoleFeatureTemplates();
          const am = getAdminModulesGlobalCache() ?? getLocalAdminModulesGlobal();
          const bundle = buildGlobalSettingsBundleFromParts({
            workRules,
            breakRules,
            geofenceDisk: disk,
            featureFlags,
            roleFeatureTemplates: rt,
            adminModulesGlobal: am,
            presenceVerification: presenceVerificationConfig,
          });
          await uploadGlobalSettingsBundleToSupabase(bundle);
          await Promise.all([
            saveWorkRulesToSupabase(workRules),
            saveBreakRulesToSupabase(breakRules),
            writeAllFeatureFlagsToSupabase(featureFlags).catch(() => {}),
            savePresenceVerificationToSupabase(presenceVerificationConfig).catch(() => {}),
            disk ? saveGeofenceConfigToSupabase(disk).catch(() => {}) : Promise.resolve(),
            rt && Object.keys(rt).length > 0 ? saveRoleFeatureTemplatesToSupabase(rt).catch(() => {}) : Promise.resolve(),
            am && Object.keys(am).length > 0 ? saveAdminModulesGlobalToSupabase(am).catch(() => {}) : Promise.resolve(),
            saveDepartmentsToSupabase(getDepartmentsCloudSnapshot()).catch(() => {}),
          ]);
          beginDepartmentsOwnPushGracePeriod();
          await bumpAppSettingsSyncSignal();
          const rev = await bumpClientSyncRevisionOnSupabase();
          if (rev != null) writeAckClientSyncRevision(rev);
          setSettingsCloudLastSyncedAt(new Date().toISOString());
          markManagementDataTouched();
          showSuccess(getTranslations(effectiveLanguage).settings_cloud_save_all_success);
          // Invia notifica push force_reload a tutti gli altri dispositivi
          void sendForceReloadPush(currentUser?.id);
        })(),
        PUSH_SETTINGS_CLOUD_MAX_MS,
        'pushSettingsToCloud'
      );
    } catch (e) {
      if (e instanceof TimeoutError) {
        showError(getTranslations(effectiveLanguage).settings_cloud_save_all_timeout);
      } else {
        showError(
          e instanceof Error ? e.message : getTranslations(effectiveLanguage).settings_cloud_save_all_error
        );
      }
    } finally {
      setSettingsCloudPushBusy(false);
    }
  }, [
    workRules,
    breakRules,
    featureFlags,
    presenceVerificationConfig,
    effectiveLanguage,
    showSuccess,
    showError,
    markManagementDataTouched,
    beginDepartmentsOwnPushGracePeriod,
    currentUser?.id,
  ]);

  const notifyDepartmentsChanged = useCallback(async () => {
    setDepartmentsRevision((n) => n + 1);
    markManagementDataTouched();
    if (!isAppCloudSyncEnabled() || import.meta.env.VITE_APP_CONFIG_STORAGE_ENABLED === 'false') {
      return;
    }
    try {
      await saveDepartmentsToSupabase(getDepartmentsCloudSnapshot());
      beginDepartmentsOwnPushGracePeriod();
      await bumpAppSettingsSyncSignal().catch(() => {});
      const rev = await bumpClientSyncRevisionOnSupabase();
      if (rev != null) writeAckClientSyncRevision(rev);
    } catch (e) {
      console.error(e);
      showError(
        e instanceof Error ? e.message : getTranslations(effectiveLanguage).settings_cloud_save_all_error
      );
    }
  }, [markManagementDataTouched, showError, effectiveLanguage, beginDepartmentsOwnPushGracePeriod]);

  const toggleAvailability = useCallback(async (userId: string, date: string) => {
    const existing = availability.find(
      (a) => a.user_id === userId && a.start_date <= date && a.end_date >= date
    );
    const result = await database.availability.toggle(userId, date, existing);
    if (result === null && existing) {
      setAvailability((prev) => prev.filter((a) => a.id !== existing.id));
    } else if (result) {
      setAvailability((prev) => [...prev, result]);
    }
    markManagementDataTouched();
  }, [availability, markManagementDataTouched]);

  const forceGlobalRefresh = useCallback(async () => {
    const SLOW_WARN_MS = 6_000;
    const HARD_LIMIT_MS = 15_000;

    setIsGlobalRefreshing(true);
    try {
      setSyncStage('Pulizia cache locale…');
      const shiftCacheKeys = Object.keys(localStorage).filter(
        (k) => k.toLowerCase().includes('shift') || k.toLowerCase().includes('turni')
      );
      shiftCacheKeys.forEach((k) => localStorage.removeItem(k));

      setShiftsFromServer([]);
      setUsers([]);
      setPunchRecords([]);

      setSyncStage('Connessione al server…');

      const slowTimer = window.setTimeout(
        () => setSyncStage('Connessione lenta, attendere…'),
        SLOW_WARN_MS,
      );

      const hardTimeout = new Promise<never>((_, reject) =>
        window.setTimeout(() => reject(new Error('SYNC_TIMEOUT')), HARD_LIMIT_MS),
      );

      const [loadedUsers, loadedShifts, loadedPunchRecords, loadedHolidays, loadedAvailability] =
        await Promise.race([
          Promise.all([
            database.users.getAll().catch(() => []),
            database.shifts.getAll().catch(() => []),
            database.punchRecords.getAll().catch(() => []),
            database.holidays.getAll().catch(() => []),
            database.availability.getAll().catch(() => []),
          ]),
          hardTimeout,
        ]);

      clearTimeout(slowTimer);

      setSyncStage('Applicazione aggiornamenti…');
      setUsers(loadedUsers);
      setShiftsFromServer(mergeShiftsDeductExclusionsFromLocal(loadedShifts));
      setPunchRecords(loadedPunchRecords);
      setHolidays(loadedHolidays);
      setAvailability(loadedAvailability);
      setCurrentUser((prev) => sessionUserFromLoadedUsersList(prev, loadedUsers));
      setSyncStage('');
      setIsGlobalRefreshing(false);
      postRefreshLockedRef.current = true;
      setPostRefreshLocked(true);
    } catch (err) {
      console.error('Errore durante il refresh globale:', err);
      pendingClientSyncRevRef.current = null;
      showError(getTranslations(effectiveLanguage).app_sync_failed_retry);
      setSyncStage('');
      setIsGlobalRefreshing(false);
    }
  }, [showError, effectiveLanguage]);

  forceGlobalRefreshRef.current = forceGlobalRefresh;

  /**
   * Dopo login Admin: un upload `settings_bundle.json` mantiene il file su Storage (backup).
   * Il client non legge più quell'object (niente GET verso quel path); il pull usa i JSON separati.
   */
  const settingsBundleAutoSeedTriedRef = useRef(false);
  useEffect(() => {
    if (!currentUser?.id || !isAdminOnly(currentUser)) return;
    if (settingsBundleAutoSeedTriedRef.current) return;
    const timer = window.setTimeout(() => {
      void (async () => {
        if (settingsBundleAutoSeedTriedRef.current) return;
        if (!isAppCloudSyncEnabled()) {
          settingsBundleAutoSeedTriedRef.current = true;
          return;
        }
        if (!supabase || import.meta.env.VITE_APP_CONFIG_STORAGE_ENABLED === 'false') return;
        settingsBundleAutoSeedTriedRef.current = true;
        const d = settingsBundleSeedDepsRef.current;
        const bundle = buildGlobalSettingsBundleFromParts({
          workRules: d.workRules,
          breakRules: d.breakRules,
          geofenceDisk: getLocalGeofenceConfig(),
          featureFlags: d.featureFlags,
          roleFeatureTemplates: d.roleFeatureTemplates,
          adminModulesGlobal: d.adminModulesGlobal,
          presenceVerification: d.presenceVerificationConfig,
        });
        try {
          await uploadGlobalSettingsBundleToSupabase(bundle);
          await bumpAppSettingsSyncSignal().catch(() => {});
          setSettingsCloudLastSyncedAt(new Date().toISOString());
        } catch {
          settingsBundleAutoSeedTriedRef.current = false;
        }
      })();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [currentUser]);

  const runPostUnlockRefreshActions = useCallback(async (): Promise<boolean> => {
    try {
      if (pendingOrderIds && pendingOrderIds.length > 0) {
        for (let i = 0; i < pendingOrderIds.length; i++) {
          await database.users.update(pendingOrderIds[i], { sort_order: i + 1 });
        }
        setPendingOrderIds(null);
        markManagementDataTouched();
      }
      if (pendingPublishWeekStart) {
        const weekAnchor = parseISO(pendingPublishWeekStart);
        if (isValid(weekAnchor)) {
          const weekEnd = format(addDays(weekAnchor, 7), 'yyyy-MM-dd');
          const draftShifts = shifts.filter(
            (s) => s.approval_status === 'draft' && s.date >= pendingPublishWeekStart && s.date < weekEnd
          );
          for (const shift of draftShifts) {
            await database.shifts.update(shift.id, { approval_status: 'confirmed' });
          }
        }
        setPendingPublishWeekStart(null);
        showSuccess(getTranslations(effectiveLanguage).shifts_published);
        markManagementDataTouched();
      }
      const [loadedUsers, loadedShifts, loadedHolidays, loadedPunchRecords, loadedAvailability] = await Promise.all([
        database.users.getAll().catch(() => []),
        database.shifts.getAll().catch(() => []),
        database.holidays.getAll().catch(() => []),
        database.punchRecords.getAll().catch(() => []),
        database.availability.getAll().catch(() => []),
      ]);
      setUsers(loadedUsers);
      setShiftsFromServer(mergeShiftsDeductExclusionsFromLocal(loadedShifts));
      setHolidays(loadedHolidays);
      setPunchRecords(loadedPunchRecords);
      setAvailability(loadedAvailability);
      setCurrentUser((prev) => sessionUserFromLoadedUsersList(prev, loadedUsers));
    } catch (err) {
      console.error('Errore dopo conferma PIN:', err);
      showError(getTranslations(effectiveLanguage).app_save_unlock_failed);
      return false;
    }
    const revToAck = pendingClientSyncRevRef.current;
    if (revToAck != null) {
      writeAckClientSyncRevision(revToAck);
      pendingClientSyncRevRef.current = null;
    }
    /** Allinea Storage prima di togliere l’overlay: altrimenti sembra che «dopo il PIN non succeda nulla» mentre il pull è ancora in corso. */
    if (revToAck != null && isAppCloudSyncEnabled()) {
      try {
        await silentRefreshData({
          pullRemoteConfig: true,
          skipRemoteRevisionCheck: true,
          forceSettingsBundle: true,
        });
      } catch (e) {
        console.error('[runPostUnlockRefreshActions] silentRefreshData', e);
        showError(getTranslations(effectiveLanguage).app_sync_failed_retry);
      }
    }
    postRefreshLockedRef.current = false;
    setPostRefreshLocked(false);
    return true;
  }, [pendingOrderIds, pendingPublishWeekStart, shifts, effectiveLanguage, showError, showSuccess, silentRefreshData, markManagementDataTouched]);

  const unlockAfterRefresh = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!currentUser) return false;
      const freshUser = users.find((u) => u.id === currentUser.id);
      /** Stesso criterio del login: `pin` da PostgREST può arrivare come numero → `!==` falliva sempre. */
      if (!freshUser || freshUser.status !== 'active' || !pinMatchesStored(freshUser, pin)) return false;
      const ok = await runPostUnlockRefreshActions();
      if (ok) setPostUnlockReloadPending(true);
      return ok;
    },
    [currentUser, users, runPostUnlockRefreshActions]
  );

  const unlockAfterRefreshWithDevice = useCallback(async (): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      const ok = await authenticatePinUnlockCredential(currentUser.id);
      if (!ok) return false;
      const done = await runPostUnlockRefreshActions();
      if (done) setPostUnlockReloadPending(true);
      return done;
    } catch {
      return false;
    }
  }, [currentUser, runPostUnlockRefreshActions]);

  const registerPinUnlockDevice = useCallback(
    async (pin: string): Promise<{ ok: boolean; wrongPin: boolean }> => {
      if (!currentUser) return { ok: false, wrongPin: false };
      let freshUser: User | null = null;
      try {
        freshUser = await database.users.getById(currentUser.id);
      } catch {
        freshUser = users.find((u) => u.id === currentUser.id) ?? null;
      }
      if (!freshUser || !pinMatchesStored(freshUser, pin)) {
        return { ok: false, wrongPin: true };
      }
      if (freshUser.status !== 'active') {
        return { ok: false, wrongPin: false };
      }
      try {
        const displayName = `${freshUser.first_name} ${freshUser.last_name ?? ''}`.trim() || freshUser.email;
        const reg = await registerPinUnlockCredential(currentUser.id, displayName, freshUser.email);
        if (reg) setPinUnlockDeviceTick((n) => n + 1);
        return reg ? { ok: true, wrongPin: false } : { ok: false, wrongPin: false };
      } catch {
        return { ok: false, wrongPin: false };
      }
    },
    [currentUser, users]
  );

  const pinUnlockDeviceRegistered = useMemo(
    () => (currentUser ? hasPinUnlockCredential(currentUser.id) : false),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinUnlockDeviceTick busts memo dopo registrazione WebAuthn
    [currentUser, pinUnlockDeviceTick]
  );

  const requestConfirmAndSaveOrder = useCallback((orderedIds: string[]) => {
    setPendingOrderIds(orderedIds.length > 0 ? orderedIds : null);
    postRefreshLockedRef.current = true;
    setPostRefreshLocked(true);
  }, []);

  const requestConfirmAndPublishWeek = useCallback((weekStart: Date) => {
    setPendingPublishWeekStart(format(weekStart, 'yyyy-MM-dd'));
    postRefreshLockedRef.current = true;
    setPostRefreshLocked(true);
  }, []);

  const cancelRefreshLock = useCallback(() => {
    if (pendingOrderIds?.length || pendingPublishWeekStart) {
      setPendingOrderIds(null);
      setPendingPublishWeekStart(null);
      postRefreshLockedRef.current = false;
      setPostRefreshLocked(false);
    } else {
      setForceLogoutRequested(true);
    }
  }, [pendingOrderIds, pendingPublishWeekStart]);

  const logout = useCallback(() => {
    const u = currentUserRef.current;
    applyUnauthenticatedDocumentTheme();
    try {
      localStorage.removeItem(APP_SESSION_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (u?.language && ['it', 'en', 'es', 'fr'].includes(u.language)) {
      persistStoredUiLanguage(u.language);
    }
    setIsSessionElevated(false);
    setCurrentUser(null);
    window.location.assign(PATH_PROFILO);
  }, []);

  // ── Sub-context memoized values ───────────────────────────────────────────
  const userSlice = useMemo<UserSlice>(() => ({
    currentUser, setCurrentUser, users,
    isSessionElevated, setIsSessionElevated,
    impersonatingAs, originalAdminUser, setImpersonating,
    globalPinSessionId, setGlobalPinSessionId,
    forceLogoutRequested, clearForceLogoutRequest,
    isLoading, effectiveLanguage, setLanguage,
    updateUser, deleteUser, createUser, reorderUsers,
    logout, clearLanguage,
  }), [
    currentUser, setCurrentUser, users,
    isSessionElevated, setIsSessionElevated,
    impersonatingAs, originalAdminUser, setImpersonating,
    globalPinSessionId, setGlobalPinSessionId,
    forceLogoutRequested, clearForceLogoutRequest,
    isLoading, effectiveLanguage, setLanguage,
    updateUser, deleteUser, createUser, reorderUsers,
    logout, clearLanguage,
  ]);

  const dataSlice = useMemo<DataSlice>(() => ({
    shifts, punchRecords, holidays, availability,
    addShift, updateShift, deleteShift, deleteShifts, copyShift, bulkCopyPreviousWeek,
    publishWeekShifts, publishDayShifts, approveShift,
    addHolidayRequest, updateHolidayStatus, deleteHolidayRequest,
    addPunchRecord, updatePunchRecord, deletePunchRecordsForShift,
    seedDemoProfileForUser,
  }), [
    shifts, punchRecords, holidays, availability,
    addShift, updateShift, deleteShift, deleteShifts, copyShift, bulkCopyPreviousWeek,
    publishWeekShifts, publishDayShifts, approveShift,
    addHolidayRequest, updateHolidayStatus, deleteHolidayRequest,
    addPunchRecord, updatePunchRecord, deletePunchRecordsForShift,
  ]);

  // Regole pausa effettive: vuote se flag auto_breaks è off
  const effectiveBreakRules = useMemo(
    () => (featureFlags.auto_breaks ? breakRules : []),
    [featureFlags.auto_breaks, breakRules]
  );

  const configSlice = useMemo<ConfigSlice>(() => ({
    featureFlags, setFeatureFlag, workRules, setWorkRules,
    breakRules: effectiveBreakRules, setBreakRules,
    geofenceEffectiveConfig, presenceVerificationConfig,
    roleTemplatesRevision, adminModulesRevision, departmentsRevision,
    toggleAvailability,
    saveRoleFeatureTemplates, saveAdminModulesGlobal,
    saveGeofenceConfig, savePresenceVerificationConfig,
    pushSettingsToCloud, settingsCloudLastSyncedAt, settingsCloudPushBusy,
    notifyDepartmentsChanged,
  }), [
    featureFlags, setFeatureFlag, workRules, setWorkRules,
    effectiveBreakRules, setBreakRules,
    geofenceEffectiveConfig, presenceVerificationConfig,
    roleTemplatesRevision, adminModulesRevision, departmentsRevision,
    toggleAvailability,
    saveRoleFeatureTemplates, saveAdminModulesGlobal,
    saveGeofenceConfig, savePresenceVerificationConfig,
    pushSettingsToCloud, settingsCloudLastSyncedAt, settingsCloudPushBusy,
    notifyDepartmentsChanged,
  ]);

  const overlaySlice = useMemo<OverlaySlice>(() => ({
    isGlobalRefreshing, syncStage, dataSyncInProgress,
    postRefreshLocked, postUnlockReloadPending,
    showError, showSuccess,
    silentRefreshData, hardReloadFromDatabase,
    unlockAfterRefresh, unlockAfterRefreshWithDevice,
    cancelRefreshLock,
    registerPinUnlockDevice, pinUnlockDeviceRegistered,
    pendingOrderIds, pendingPublishWeekStart,
    requestConfirmAndSaveOrder, requestConfirmAndPublishWeek,
  }), [
    isGlobalRefreshing, syncStage, dataSyncInProgress,
    postRefreshLocked, postUnlockReloadPending,
    showError, showSuccess,
    silentRefreshData, hardReloadFromDatabase,
    unlockAfterRefresh, unlockAfterRefreshWithDevice,
    cancelRefreshLock,
    registerPinUnlockDevice, pinUnlockDeviceRegistered,
    pendingOrderIds, pendingPublishWeekStart,
    requestConfirmAndSaveOrder, requestConfirmAndPublishWeek,
  ]);

  const appContextValue = useMemo(() => ({
    isLoading,
    currentUser, setCurrentUser, users, shifts, holidays, punchRecords, availability, toggleAvailability,
    addShift, updateShift, approveShift, deleteShift, deleteShifts, copyShift, bulkCopyPreviousWeek,
    publishWeekShifts, publishDayShifts, addHolidayRequest, updateHolidayStatus, deleteHolidayRequest, addPunchRecord, updatePunchRecord, deletePunchRecordsForShift,
    updateUser, createUser, deleteUser, reorderUsers, setUsersSortOrder, updateUserPreferences, effectiveLanguage, setLanguage, clearLanguage, showError, showSuccess, forceGlobalRefresh, hardResetTestData, seedDemoProfileForUser, silentRefreshData, hardReloadFromDatabase, isGlobalRefreshing, syncStage, dataSyncInProgress,
    postRefreshLocked, postUnlockReloadPending, unlockAfterRefresh, unlockAfterRefreshWithDevice, registerPinUnlockDevice, pinUnlockDeviceRegistered, cancelRefreshLock, pendingOrderIds, requestConfirmAndSaveOrder, pendingPublishWeekStart, requestConfirmAndPublishWeek, forceLogoutRequested, clearForceLogoutRequest, logout, globalPinSessionId, setGlobalPinSessionId,
    featureFlags, setFeatureFlag, geofenceEffectiveConfig, saveGeofenceConfig,
    presenceVerificationConfig, savePresenceVerificationConfig,
    workRules, setWorkRules, breakRules, setBreakRules,
    roleTemplatesRevision, saveRoleFeatureTemplates,
    adminModulesRevision, saveAdminModulesGlobal,
    departmentsRevision, notifyDepartmentsChanged,
    pushSettingsToCloud, settingsCloudLastSyncedAt, settingsCloudPushBusy,
    managementDataTouchedSinceLastSync,
    isSessionElevated, setIsSessionElevated,
    impersonatingAs, originalAdminUser, setImpersonating,
  } satisfies AppContextType), [
    isLoading, currentUser, setCurrentUser, users, shifts, holidays, punchRecords, availability, toggleAvailability,
    addShift, updateShift, approveShift, deleteShift, deleteShifts, copyShift, bulkCopyPreviousWeek,
    publishWeekShifts, publishDayShifts, addHolidayRequest, updateHolidayStatus, deleteHolidayRequest, addPunchRecord, updatePunchRecord, deletePunchRecordsForShift,
    updateUser, createUser, deleteUser, reorderUsers, setUsersSortOrder, updateUserPreferences, effectiveLanguage, setLanguage, clearLanguage, showError, showSuccess, forceGlobalRefresh, hardResetTestData, seedDemoProfileForUser, silentRefreshData, hardReloadFromDatabase, isGlobalRefreshing, syncStage, dataSyncInProgress,
    postRefreshLocked, postUnlockReloadPending, unlockAfterRefresh, unlockAfterRefreshWithDevice, registerPinUnlockDevice, pinUnlockDeviceRegistered, cancelRefreshLock, pendingOrderIds, requestConfirmAndSaveOrder, pendingPublishWeekStart, requestConfirmAndPublishWeek, forceLogoutRequested, clearForceLogoutRequest, logout, globalPinSessionId, setGlobalPinSessionId,
    featureFlags, setFeatureFlag, geofenceEffectiveConfig, saveGeofenceConfig,
    presenceVerificationConfig, savePresenceVerificationConfig,
    workRules, setWorkRules, breakRules, setBreakRules,
    roleTemplatesRevision, saveRoleFeatureTemplates,
    adminModulesRevision, saveAdminModulesGlobal,
    departmentsRevision, notifyDepartmentsChanged,
    pushSettingsToCloud, settingsCloudLastSyncedAt, settingsCloudPushBusy,
    managementDataTouchedSinceLastSync,
    isSessionElevated, setIsSessionElevated,
    impersonatingAs, originalAdminUser, setImpersonating,
  ]);

  return (
    <AppContext.Provider value={appContextValue}>
      <UserSliceContext.Provider value={userSlice}>
        <DataSliceContext.Provider value={dataSlice}>
          <ConfigSliceContext.Provider value={configSlice}>
            <OverlaySliceContext.Provider value={overlaySlice}>
              {/* Splash durante boot: senza questo `#root` resta vuoto → “pagina bianca”. */}
              {isLoading ? (
                <div
                  className="fixed inset-0 z-[200] flex items-center justify-center font-sans"
                  style={{
                    background:
                      'radial-gradient(ellipse at 50% 30%, rgba(107,107,107,0.15) 0%, transparent 55%), #0a0a0c',
                  }}
                  aria-busy
                  aria-label="Caricamento"
                >
                  <FlowWaveIcon size={120} radius={34} />
                </div>
              ) : (
                children
              )}


              <DevMissingEnvBanner />

              <AnimatePresence mode="sync">
                {toastMessage && (
                  <Toast
                    key={`${toastType}:${toastMessage.slice(0, 80)}`}
                    message={toastMessage}
                    type={toastType || undefined}
                    onClose={clearToast}
                  />
                )}
              </AnimatePresence>
            </OverlaySliceContext.Provider>
          </ConfigSliceContext.Provider>
        </DataSliceContext.Provider>
      </UserSliceContext.Provider>
    </AppContext.Provider>
  );
}

/* Re-export da moduli stabili (Context non ricreato a ogni HMR di questo file). */
/* eslint-disable react-refresh/only-export-components */
export { useApp } from './appContextCore';
export type { AppContextType } from './appContextTypes';
export {
  useAppUser,
  useAppData,
  useAppShifts,
  useAppPunchRecords,
  useAppHolidays,
  useAppConfig,
  useAppOverlay,
} from './appSliceContexts';
export type {
  UserSlice,
  DataSlice,
  ConfigSlice,
  OverlaySlice,
} from './appSliceContexts';
/* eslint-enable react-refresh/only-export-components */
