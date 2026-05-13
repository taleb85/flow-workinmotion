import { useState, useRef, ReactNode, useEffect, useCallback, useMemo } from 'react';
import { persistStoredUiLanguage, readStoredUiLanguage } from '../utils/uiLanguagePreference';
import {
  User,
  Shift,
  HolidayRequest,
  PunchRecord,
  PunchAuditEntry,
  Language,
  HolidayStatus,
  UserRole,
  UserStatus,
  Department,
} from '../types';
import { format, addDays, parseISO } from 'date-fns';
import { database, formatSupabaseError } from '../lib/database';
import { supabase } from '../lib/supabase';
import { hasShiftConflictSameDay, computeEffectivePunchIn, calculateShiftMinutesGross } from '../utils/timeCalculations';
import { AnimatePresence } from 'framer-motion';
import Toast from '../components/Toast';
import { formatTrans, getTranslations } from '../utils/translations';
import { countUnreadNotifications } from '../utils/notifications';
import { setAppLauncherBadgeUnreadCountAsync } from '../utils/appIconBadge';
import { logHistory, logShiftEdit } from '../utils/scheduleHistory';
import {
  canOperateTeamSchedule,
  canApproveShiftActions,
  canPublishScheduleDrafts,
  isAdminOnly,
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
  saveWorkRulesToSupabase,
  DEFAULT_WORK_RULES,
  loadWorkRulesFromSupabase,
} from '../utils/workRules';
import {
  type BreakRule,
  getBreakRules,
  saveBreakRulesToSupabase,
  loadBreakRulesFromSupabase,
  getBreakMinutesForShift,
  getActiveBreakRules,
} from '../utils/breakRules';
import { loadTimesheetPeriodFromSupabase, applyRemoteTimesheetPeriod } from '../utils/timesheetPeriodSupabase';
import PwaGate from '../components/PwaGate';
import i18n from '../utils/i18n';
import { userRowToSessionUser, defaultPermissionFieldsForNewUser } from '../utils/staffPermissionDefaults';
import { APP_SESSION_STORAGE_KEY } from '../constants/appSession';
import {
  bumpClientSyncRevisionOnSupabase,
  fetchClientSyncRevisionFromSupabase,
  getAckClientSyncRevision,
  writeAckClientSyncRevision,
} from '../utils/clientSyncRevision';
import {
  OSTERIA_BACKGROUND_SYNC_MESSAGE,
  registerOsteriaBackgroundSync,
} from '../utils/backgroundSync';
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
import { resolveEffectiveVerificationToken, normalizePresenceProof } from '../utils/presenceVerificationPayload';
import {
  fetchGlobalSettingsBundleFromSupabase,
  pullGlobalSettingsBundleOnAppBoot,
  uploadGlobalSettingsBundleToSupabase,
  buildGlobalSettingsBundleFromParts,
  bumpAppSettingsSyncSignal,
  type AppGlobalSettingsBundle,
} from '../utils/globalSettingsCloud';

/** Una tantum: flag geofence senza VITE_RESTAURANT_LAT/LNG. */
let geofenceMissingEnvWarned = false;
import {
  authenticatePinUnlockCredential,
  hasPinUnlockCredential,
  registerPinUnlockCredential,
} from '../utils/pinUnlockWebAuthn';
import { getDefaultApprovalClockHHMM } from '../utils/shiftResolvedClockTimes';
import { pinMatchesStored, findActiveUserWithSamePin } from '../utils/loginIdentifier';
import { isAppCloudSyncEnabled } from '../utils/appCloudSync';
import { AppContext } from './appContextCore';

const staffDefaults = { language: 'it' as const, theme: 'light' as const, can_edit_staff_pins: false, can_manage_drafts: false, can_view_total_hours: false, can_create_shifts: false, can_approve_shifts: false };
const initialStaff: Omit<User, 'id'>[] = [
  { first_name: 'Gustavo', last_name: 'Ghetta', email: 'gustavo.ghetta@basilico.it', role: 'manager', pin: '1111', status: 'active', sort_order: 1, ...staffDefaults },
  { first_name: 'Alexis', last_name: 'Man', email: 'alexis.man@basilico.it', role: 'assistant_manager', pin: '2222', status: 'active', sort_order: 2, ...staffDefaults },
  { first_name: 'Taleb', last_name: 'Barikhan', email: 'taleb.barikhan@basilico.it', role: 'admin', pin: '8888', status: 'active', sort_order: 3, ...staffDefaults, can_create_shifts: true, can_approve_shifts: true, can_manage_drafts: true, can_view_total_hours: true, can_edit_staff_pins: true },
  { first_name: 'Mauricio', last_name: 'Man', email: 'mauricio.man@basilico.it', role: 'waiter', pin: '3333', status: 'active', sort_order: 4, ...staffDefaults },
  { first_name: 'Freddy', last_name: 'Junior', email: 'freddy.junior@basilico.it', role: 'waiter', pin: '4444', status: 'active', sort_order: 5, ...staffDefaults },
  { first_name: 'Dany', last_name: 'Man', email: 'dany.man@basilico.it', role: 'bartender', pin: '5555', status: 'active', sort_order: 6, ...staffDefaults },
  { first_name: 'Marco', last_name: 'Rossi', email: 'marco.rossi@basilico.it', role: 'waiter', pin: '6666', status: 'active', sort_order: 7, ...staffDefaults },
  { first_name: 'Giulia', last_name: 'Bianchi', email: 'giulia.bianchi@basilico.it', role: 'waiter', pin: '7777', status: 'active', sort_order: 8, ...staffDefaults },
  { first_name: 'Luca', last_name: 'Ferrari', email: 'luca.ferrari@basilico.it', role: 'bartender', pin: '8889', status: 'active', sort_order: 9, ...staffDefaults },
  { first_name: 'Sofia', last_name: 'Romano', email: 'sofia.romano@basilico.it', role: 'waiter', pin: '9999', status: 'active', sort_order: 10, ...staffDefaults },
  { first_name: 'Alessandro', last_name: 'Colombo', email: 'alessandro.colombo@basilico.it', role: 'waiter', pin: '0001', status: 'active', sort_order: 11, ...staffDefaults },
  { first_name: 'Chiara', last_name: 'Ricci', email: 'chiara.ricci@basilico.it', role: 'waiter', pin: '0002', status: 'active', sort_order: 12, ...staffDefaults },
  { first_name: 'Matteo', last_name: 'Marino', email: 'matteo.marino@basilico.it', role: 'waiter', pin: '0003', status: 'active', sort_order: 13, ...staffDefaults },
  { first_name: 'Elena', last_name: 'Greco', email: 'elena.greco@basilico.it', role: 'waiter', pin: '0004', status: 'active', sort_order: 14, ...staffDefaults },
  { first_name: 'Francesco', last_name: 'Conti', email: 'francesco.conti@basilico.it', role: 'bartender', pin: '0005', status: 'active', sort_order: 15, ...staffDefaults },
  { first_name: 'Valentina', last_name: 'Galli', email: 'valentina.galli@basilico.it', role: 'waiter', pin: '0006', status: 'active', sort_order: 16, ...staffDefaults },
  { first_name: 'Andrea', last_name: 'Barbieri', email: 'andrea.barbieri@basilico.it', role: 'waiter', pin: '0007', status: 'active', sort_order: 17, ...staffDefaults },
  { first_name: 'Martina', last_name: 'Fontana', email: 'martina.fontana@basilico.it', role: 'waiter', pin: '0008', status: 'active', sort_order: 18, ...staffDefaults },
  { first_name: 'Davide', last_name: 'Moretti', email: 'davide.moretti@basilico.it', role: 'waiter', pin: '0009', status: 'active', sort_order: 19, ...staffDefaults },
  { first_name: 'Federica', last_name: 'Caruso', email: 'federica.caruso@basilico.it', role: 'waiter', pin: '0010', status: 'active', sort_order: 20, ...staffDefaults },
];

const MAX_SHIFTS_PER_DAY = 2;

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
  const [users, setUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = useRef<User | null>(null);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
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
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [holidays, setHolidays] = useState<HolidayRequest[]>([]);
  const [punchRecords, setPunchRecords] = useState<PunchRecord[]>([]);
  const [availability, setAvailability] = useState<HolidayRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGlobalRefreshing, setIsGlobalRefreshing] = useState(false);
  const [dataSyncInProgress, setDataSyncInProgress] = useState(false);
  const silentSyncDepthRef = useRef(0);
  /** Serializza `silentRefreshData`: evita richieste sovrapposte e banner “sincronizzazione” bloccato. */
  const silentRefreshQueueRef = useRef(Promise.resolve());
  /** In browser `setTimeout` restituisce `number` (non `NodeJS.Timeout`). */
  const dataSyncBarDelayTimerRef = useRef<number | null>(null);
  const [postRefreshLocked, setPostRefreshLocked] = useState(false);
  const [pendingOrderIds, setPendingOrderIds] = useState<string[] | null>(null);
  const [pendingPublishWeekStart, setPendingPublishWeekStart] = useState<string | null>(null);
  const [forceLogoutRequested, setForceLogoutRequested] = useState(false);
  /** Forza ricalcolo credenziale WebAuthn PIN lock (localStorage) dopo registrazione. */
  const [pinUnlockDeviceTick, setPinUnlockDeviceTick] = useState(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'error' | 'success'>('error');
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
    },
    [refreshPresenceVerificationConfig]
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
      setWorkRulesState({ ...DEFAULT_WORK_RULES, ...bundle.workRules });
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

  /** Lingua profilo in sessione, altrimenti preferenza persistita (login/kiosk senza sessione allineati). */
  const effectiveLanguage: Language = useMemo(() => {
    if (currentUser?.language && ['it', 'en', 'es', 'fr'].includes(currentUser.language)) {
      return currentUser.language;
    }
    const fromDisk = typeof window !== 'undefined' ? readStoredUiLanguage() : null;
    if (fromDisk) return fromDisk;
    return appLanguage || 'it';
  }, [currentUser?.language, appLanguage]);

  useEffect(() => {
    document.documentElement.lang = effectiveLanguage;
  }, [effectiveLanguage]);

  const showError = useCallback((message: string) => {
    setToastType('error');
    setToastMessage(message);
  }, []);

  const showSuccess = useCallback((message: string) => {
    setToastType('success');
    setToastMessage(message);
  }, []);

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
  }, []);

  const saveAdminModulesGlobal = useCallback(async (data: AdminModulesGlobalOnDisk) => {
    const previous = getAdminModulesGlobalCache();
    setAdminModulesGlobalCache(data);
    writeAdminModulesGlobalLocal(data);
    setAdminModulesRevision((n) => n + 1);
    try {
      await saveAdminModulesGlobalToSupabase(data);
      const rev = await bumpClientSyncRevisionOnSupabase();
      if (rev != null) writeAckClientSyncRevision(rev);
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
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('userTheme');
    localStorage.removeItem('theme');
    loadInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once; loadInitialData omitted intentionally
  }, []);

  useEffect(() => {
    const unsubPunches = database.realtime.subscribeToPunchRecords(null, setPunchRecords);
    const unsubShifts = database.realtime.subscribeToShifts(null, setShifts);
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
    const BOOT_TIMEOUT_MS = 120_000;
    let bootTid: number | null = null;

    const bootWork = async () => {
      let loadedUsers = await database.users.getAll().catch(() => []);
      if (loadedUsers.length === 0) {
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
          const { userId } = JSON.parse(saved) as { userId?: string };
          if (userId) {
            const restored = loadedUsers.find((u) => u.id === userId && u.status === 'active');
            if (restored) {
              const safeUser = userRowToSessionUser(restored as User);
              setCurrentUser(safeUser);
              const lang = (safeUser.language && ['it', 'en', 'es', 'fr'].includes(safeUser.language)
                ? safeUser.language
                : 'it') as Language;
              persistStoredUiLanguage(lang);
              setAppLanguage(lang);
            } else {
              localStorage.removeItem(APP_SESSION_STORAGE_KEY);
            }
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
      setShifts(loadedShifts);
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
              const merged = { ...local, ...sbFlagsOnly };
              setFeatureFlagsState(merged);
              writeFeatureFlagsToStorage(merged);
            }
          }
          applyAppSettingsBundle(bundle);
          await refreshGeofenceEffectiveConfig();
          if (!bundle.presenceVerification) {
            await refreshPresenceVerificationConfig();
          }
        } else {
          const sbFlags = await loadFeatureFlagsFromSupabase().catch(() => null);
          if (sbFlags) {
            const local = getLocalFeatureFlags();
            const merged = { ...local, ...sbFlags };
            setFeatureFlagsState(merged);
            writeFeatureFlagsToStorage(merged);
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
          if (wrSb) setWorkRulesState(wrSb);
          else setWorkRulesState(getWorkRules());
          if (brSb) setBreakRulesState(brSb);
          else setBreakRulesState(getBreakRules());
          setSettingsCloudLastSyncedAt(new Date().toISOString());
        }
      } else {
        await refreshGeofenceEffectiveConfig();
        await refreshPresenceVerificationConfig();
        setWorkRulesState(getWorkRules());
        setBreakRulesState(getBreakRules());
      }
    };

    try {
      await Promise.race([
        bootWork(),
        new Promise<never>((_, rej) => {
          bootTid = window.setTimeout(() => rej(new Error('BOOT_TIMEOUT')), BOOT_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      const isBootTimeout = error instanceof Error && error.message === 'BOOT_TIMEOUT';
      if (isBootTimeout) {
        console.warn(
          '[loadInitialData] Timeout avvio (120s): splash chiuso; controlla rete o disattiva cloud sync se serve.'
        );
      } else {
        console.error('Errore durante il caricamento iniziale:', error);
      }
    } finally {
      if (bootTid !== null) clearTimeout(bootTid);
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
    if (!op || !canOperateTeamSchedule(op)) {
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
      const actor = currentUserRef.current?.first_name ?? 'Sistema';
      logHistory('create', actor, `Turno creato: ${shift.date} ${shift.start_time}–${endTime || '?'}`);
    }
    return res;
  }, [shifts, showError, computePersistedAutoBreak, effectiveLanguage]);

  const updateShift = useCallback(async (id: string, updates: Partial<Shift>) => {
    const existing = shifts.find((s) => s.id === id);
    if (!existing) return;

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

    const merged = { ...existing, ...updates };
    setShifts(prev => prev.map(s => s.id === id ? merged : s));

    // Logga le modifiche se il turno era già pubblicato
    const isPublished = existing.approval_status === 'confirmed' || existing.approval_status === 'approved';
    if (isPublished) {
      const actor = currentUserRef.current?.first_name ?? 'Sistema';
      const date = existing.date;
      if (updates.start_time !== undefined && updates.start_time !== existing.start_time) {
        logShiftEdit({ shiftId: id, actorName: actor, field: 'Inizio', oldValue: (existing.start_time || '').slice(0,5), newValue: (updates.start_time || '').slice(0,5), description: `${date} — orario inizio modificato` });
      }
      if (updates.end_time !== undefined && updates.end_time !== existing.end_time) {
        logShiftEdit({ shiftId: id, actorName: actor, field: 'Fine', oldValue: (existing.end_time || '').slice(0,5), newValue: (updates.end_time || '').slice(0,5), description: `${date} — orario fine modificato` });
      }
      if (updates.approval_status !== undefined && updates.approval_status !== existing.approval_status) {
        const statusLabel: Record<string, string> = { draft: 'Bozza', confirmed: 'Confermato', approved: 'Approvato' };
        logShiftEdit({ shiftId: id, actorName: actor, field: 'Stato', oldValue: statusLabel[existing.approval_status] ?? existing.approval_status, newValue: statusLabel[updates.approval_status] ?? updates.approval_status, description: `${date} — stato turno modificato` });
      }
      if (updates.user_id !== undefined && updates.user_id !== existing.user_id) {
        logShiftEdit({ shiftId: id, actorName: actor, field: 'Dipendente', oldValue: existing.user_id, newValue: updates.user_id, description: `${date} — turno spostato a diverso dipendente` });
      }
      if (updates.date !== undefined && updates.date !== existing.date) {
        logShiftEdit({ shiftId: id, actorName: actor, field: 'Data', oldValue: existing.date, newValue: updates.date, description: `Turno spostato da ${existing.date} a ${updates.date}` });
      }
    }

    try {
      const res = await database.shifts.update(id, updates);
      if (res) setShifts(prev => prev.map(s => s.id === id ? { ...res, ...updates } : s));
    } catch (err) {
      setShifts(prev => prev.map(s => s.id === id ? existing : s));
      throw err;
    }
  }, [shifts, showError, computePersistedAutoBreak, effectiveLanguage]);

  /**
   * Approva definitivamente un turno.
   * Scrive approved_at + approved_by sul record, e crea un entry audit per
   * il punch_record di entrata collegato (tracciabilità completa).
   */
  const approveShiftSoft = useCallback(async (shiftId: string) => {
    const op = currentUserRef.current;
    if (!op || !canApproveShiftActions(op)) return;
    const existing = shifts.find((s) => s.id === shiftId);
    if (!existing || existing.approval_status === 'approved') return;
    await updateShift(shiftId, { approval_status: 'approved' });
  }, [shifts, updateShift]);

  const approveShift = useCallback(async (shiftId: string, opts?: { approvedStart: string; approvedEnd: string }) => {
    const op = currentUserRef.current;
    if (!op || !canApproveShiftActions(op)) return;
    const existing = shifts.find((s) => s.id === shiftId);
    if (!existing || existing.approved_at) return;
    if (existing.approval_status !== 'confirmed' && existing.approval_status !== 'approved') return;

    const actor = currentUserRef.current;
    const approvedAt = new Date().toISOString();
    const approvedBy = actor ? `${actor.first_name} ${actor.last_name ?? ''}`.trim() : 'Manager';

    let startHH = opts?.approvedStart?.trim().slice(0, 5) ?? '';
    let endHH = opts?.approvedEnd?.trim().slice(0, 5) ?? '';
    if (!startHH || !endHH) {
      const def = getDefaultApprovalClockHHMM(existing, punchRecordsRef.current);
      startHH = def.start;
      endHH = def.end;
    }

    await updateShift(shiftId, {
      approval_status: 'approved',
      approved_at: approvedAt,
      approved_by: approvedBy,
      approved_start_time: startHH,
      approved_end_time: endHH,
    });

    const punchIn = punchRecordsRef.current.find(
      (p) => p.type === 'in' && (p.shift_id === shiftId || p.user_id === existing.user_id)
    );
    if (punchIn) {
      try {
        await database.punchAuditLog.insert({
          punch_record_id: punchIn.id,
          actor_id: actor?.id,
          actor_name: approvedBy,
          field: 'approvazione_turno',
          old_value: 'confirmed',
          new_value: `approved @ ${approvedAt}`,
        });
      } catch {
        // audit log non bloccante
      }
    }
  }, [shifts, updateShift, punchRecordsRef]);

  const deleteShift = useCallback(async (id: string) => {
    const op = currentUserRef.current;
    if (!op || !canOperateTeamSchedule(op)) {
      showError(getTranslations(effectiveLanguage).app_access_denied);
      return;
    }
    const existing = shifts.find(s => s.id === id);
    await database.shifts.delete(id);
    setShifts(prev => prev.filter(s => s.id !== id));
    if (existing) {
      const actor = currentUserRef.current?.first_name ?? 'Sistema';
      logHistory('delete', actor, `Turno eliminato: ${existing.date} ${existing.start_time}–${existing.end_time}`);
    }
  }, [shifts, showError, effectiveLanguage]);

  const deleteShifts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const op = currentUserRef.current;
    if (!op || !canOperateTeamSchedule(op)) {
      showError(getTranslations(effectiveLanguage).app_access_denied);
      return;
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
    } catch (err: unknown) {
      console.error('Errore eliminazione turni su Supabase:', ids, err);
      // Rollback: ripristina stato locale
      setShifts(prev => [...prev, ...removedShifts]);
      setPunchRecords(prev => [...prev, ...removedPunchRecords]);
      showError(getTranslations(effectiveLanguage).shift_delete_bulk_error);
    }
  }, [shifts, punchRecords, showError, effectiveLanguage]);

  const copyShift = useCallback(
    (shift: Shift, newDate: string) => {
      const op = currentUserRef.current;
      if (!op || !canOperateTeamSchedule(op)) {
        showError(getTranslations(effectiveLanguage).app_access_denied);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- id excluded for new shift
      const { id, ...rest } = shift;
      void addShift({ ...rest, date: newDate, approval_status: 'draft' });
    },
    [addShift, showError, effectiveLanguage]
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
      }
    } catch (error) {
      console.error('Errore durante la pubblicazione dei turni della settimana:', error);
    }
  }, [shifts, showError, effectiveLanguage]);

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
    } catch (error) {
      console.error('Errore durante la pubblicazione dei turni del giorno:', error);
    }
  }, [shifts, showError, effectiveLanguage]);

  const addHolidayRequest = useCallback(async (req: Omit<HolidayRequest, 'id' | 'created_at' | 'status'>): Promise<{ ok: boolean; emailSent?: boolean; error?: string }> => {
    const payload = { ...req, status: 'pending' as const };
    const res = await database.holidays.insert(payload);
    if (res) setHolidays(prev => [...prev, res]);

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
  }, [users, effectiveLanguage]);

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
    if (res) setHolidays(prev => prev.map(h => h.id === id ? res : h));

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
  }, [holidays, users, effectiveLanguage]);

  const addPunchRecord = useCallback(
    async (
      userId: string,
      type: 'in' | 'out',
      options?: { timestamp?: string; shift_id?: string; presenceProof?: string }
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

      const geoCfg = geofenceEffectiveConfigRef.current ?? readGeofenceEnvConfig();
      if (featureFlags['geofence_punch'] === true) {
        if (!geoCfg) {
          if (!geofenceMissingEnvWarned) {
            geofenceMissingEnvWarned = true;
            console.warn(
              '[geofence_punch] Attivo ma nessun centro configurato: salva lat/lng in Impostazioni (geofence.json) o imposta VITE_RESTAURANT_LAT/LNG nel build.'
            );
          }
        } else if (!managerPunchingForSomeoneElse) {
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
      if (pv.requireVerification === true && !managerPunchingForSomeoneElse) {
        if (!effectivePresenceToken) {
          return { error: t.punch_presence_not_configured };
        }
        const proof = options?.presenceProof?.trim() ?? '';
        if (!proof) {
          return { error: t.punch_presence_proof_required };
        }
        if (normalizePresenceProof(proof) !== normalizePresenceProof(effectivePresenceToken)) {
          return { error: t.punch_presence_proof_mismatch };
        }
      }

      const rawTimestamp = options?.timestamp ? new Date(options.timestamp).toISOString() : new Date().toISOString();

      const record: Record<string, unknown> = {
        user_id: userId,
        type,
        timestamp: rawTimestamp,
      };

      if (shiftId && typeof shiftId === 'string') {
        record.shift_id = shiftId;

        // Regola Inviolabile: per punch-IN calcola il calculated_time corretto.
        // Entrata anticipata → usa orario pianificato. Entrata in ritardo → usa orario reale.
        if (type === 'in') {
          const relatedShift = shifts.find((s) => s.id === shiftId);
          if (relatedShift) {
            record.calculated_time = computeEffectivePunchIn(relatedShift, rawTimestamp);
          }
        }
      }

      const res = await database.punchRecords.insert(record as Omit<PunchRecord, 'id'>);
      if (res) {
        setPunchRecords((prev) => [res, ...prev]);
      }
    } finally {
      punchInFlightRef.current = false;
      setIsPunching(false);
    }
  }, [isPunching, shifts, effectiveLanguage, featureFlags]);

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
    }
  }, []);

  const deletePunchRecordsForShift = useCallback(async (shiftId: string) => {
    await database.punchRecords.deleteByShiftId(shiftId);
    setPunchRecords(prev => prev.filter(p => p.shift_id !== shiftId));
  }, []);

  const updateUser = useCallback(async (id: string, updates: Partial<User>) => {
    const prevUser = users.find((u) => u.id === id);
    if (!prevUser) return;

    const mergedStatus = updates.status !== undefined ? updates.status : prevUser.status;
    const mergedPinRaw = updates.pin !== undefined ? String(updates.pin) : String(prevUser.pin ?? '');
    if (mergedStatus === 'active' && mergedPinRaw.replace(/\D/g, '').length === 4) {
      const other = findActiveUserWithSamePin(users, mergedPinRaw, id);
      if (other) {
        const tr = getTranslations(effectiveLanguage);
        const name = `${other.first_name ?? ''} ${other.last_name ?? ''}`.trim() || other.email;
        showError(formatTrans(tr.employee_pin_taken_by_active, { name }));
        return;
      }
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
    }
  }, [currentUser, users, showError, effectiveLanguage]);

  const deleteUser = useCallback(async (id: string) => {
    await database.users.delete(id);
    setUsers(prev => prev.filter(u => u.id !== id));
    const rev = await bumpClientSyncRevisionOnSupabase();
    if (rev != null) writeAckClientSyncRevision(rev);
  }, []);

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
    }): Promise<User | null> => {
      const tr = getTranslations(effectiveLanguage);
      if (!supabase) {
        showError(tr.create_employee_error_no_supabase);
        return null;
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
    [users, effectiveLanguage, showError, showSuccess]
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
    } catch (error) {
      console.error('Errore durante il riordino del personale:', error);
    }
  }, [users]);

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
  }, []);

  const updateUserPreferences = useCallback((pref: { language?: Language; theme?: 'light' | 'dark' }) => {
    if (!currentUser) return;
    const updates: Partial<User> = {};
    if (pref.language) updates.language = pref.language;
    if (pref.theme) updates.theme = pref.theme;
    if (Object.keys(updates).length > 0) {
      updateUser(currentUser.id, updates);
      setCurrentUser({ ...currentUser, ...updates });
    }
  }, [currentUser, updateUser]);

  const setLanguage = useCallback((lang: Language) => {
    persistStoredUiLanguage(lang);
    setAppLanguage(lang);
    if (currentUser) {
      updateUser(currentUser.id, { language: lang });
      setCurrentUser({ ...currentUser, language: lang });
    }
    i18n.changeLanguage(lang);
  }, [currentUser, updateUser]);

  const DATA_SYNC_UI_DELAY_MS = 220;

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
   */
  const silentRefreshData = useCallback(async (opts?: {
    pullRemoteConfig?: boolean;
    skipRemoteRevisionCheck?: boolean;
    throwOnError?: boolean;
    forceSettingsBundle?: boolean;
  }) => {
    const SYNC_TIMEOUT_MS = 75_000;

    const inner = async () => {
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
      if (loadedShifts !== null) setShifts(loadedShifts);
      if (loadedHolidays !== null) setHolidays(loadedHolidays);
      if (loadedPunchRecords !== null) setPunchRecords(loadedPunchRecords);
      if (loadedAvailability !== null) setAvailability(loadedAvailability);

      if (loadedUsers !== null) {
        setCurrentUser((prev) => sessionUserFromLoadedUsersList(prev, loadedUsers));
      }

      const pullRemoteConfig = Boolean(opts?.pullRemoteConfig && isAppCloudSyncEnabled());
      if (pullRemoteConfig) {
        const [sbFlags, periodRemote] = await Promise.all([
          loadFeatureFlagsFromSupabase().catch(() => null),
          loadTimesheetPeriodFromSupabase().catch(() => null),
        ]);
        if (periodRemote) {
          applyRemoteTimesheetPeriod(periodRemote);
        }

        const bundle = await fetchGlobalSettingsBundleFromSupabase({
          force: opts?.forceSettingsBundle === true,
        }).catch(() => null);
        if (bundle) {
          if (!bundle.featureFlags) {
            const localFlags = getLocalFeatureFlags();
            const mergedFlags = sbFlags ? { ...localFlags, ...sbFlags } : localFlags;
            setFeatureFlagsState(mergedFlags);
            writeFeatureFlagsToStorage(mergedFlags);
          }
          applyAppSettingsBundle(bundle);
          await refreshGeofenceEffectiveConfig();
          if (!bundle.presenceVerification) {
            await refreshPresenceVerificationConfig();
          }
        } else {
          const localFlags = getLocalFeatureFlags();
          const mergedFlags = sbFlags ? { ...localFlags, ...sbFlags } : localFlags;
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
          if (wrSb) setWorkRulesState(wrSb);
          if (brSb) setBreakRulesState(brSb);
          setSettingsCloudLastSyncedAt(new Date().toISOString());
        }
      }

      /* Cross-device: la revisione va controllata a ogni sync DB, non solo con pullRemoteConfig
         (altrimenti pull-to-refresh, mount, cambio tab non leggono mai Storage). */
      if (!opts?.skipRemoteRevisionCheck && isAppCloudSyncEnabled()) {
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
    };

    const queued = silentRefreshQueueRef.current.then(async () => {
      enterSilentDataSync();
      let timeoutId: number | null = null;
      try {
        await Promise.race([
          inner(),
          new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => reject(new Error('SILENT_SYNC_TIMEOUT')), SYNC_TIMEOUT_MS);
          }),
        ]);
      } catch (err) {
        const isTimeout = err instanceof Error && err.message === 'SILENT_SYNC_TIMEOUT';
        if (isTimeout) {
          console.warn(
            '[silentRefreshData] Timeout (rete o Supabase lento): sync interrotta, UI sbloccata.'
          );
          if (opts?.throwOnError) throw err;
        } else {
          console.error('Errore durante il refresh silenzioso:', err);
          if (opts?.throwOnError) throw err;
        }
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        leaveSilentDataSync();
      }
    });
    silentRefreshQueueRef.current = queued.catch(() => {});
    return queued;
  }, [
    enterSilentDataSync,
    leaveSilentDataSync,
    refreshGeofenceEffectiveConfig,
    refreshPresenceVerificationConfig,
    applyAppSettingsBundle,
  ]);

  silentRefreshDataRef.current = silentRefreshData;

  const hardReloadFromDatabase = useCallback(async () => {
    setIsGlobalRefreshing(true);
    try {
      const shiftCacheKeys = Object.keys(localStorage).filter(
        (k) => k.toLowerCase().includes('shift') || k.toLowerCase().includes('turni')
      );
      shiftCacheKeys.forEach((k) => localStorage.removeItem(k));
      await silentRefreshData({
        pullRemoteConfig: isAppCloudSyncEnabled(),
        skipRemoteRevisionCheck: true,
        throwOnError: true,
        forceSettingsBundle: true,
      });
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
      setIsGlobalRefreshing(false);
    }
  }, [silentRefreshData, showError, showSuccess, effectiveLanguage]);

  /**
   * Ritorno in primo piano (PWA ↔ browser, cambio app su mobile) e **rete di nuovo disponibile**:
   * - DB (turni, utenti, timbrature…): sempre refresh anche **senza login** (kiosk / login usano gli stessi dati).
   * - Storage (flag, template ruoli): throttling + **pull forzato** a ogni ritorno in primo piano (meno lag PC↔telefono).
   */
  useEffect(() => {
    let lastConfigPull = 0;
    /** Tra un pull Storage e l’altro mentre l’app resta in primo piano (evita burst su Supabase). */
    const CONFIG_PULL_THROTTLE_MS = 5_000;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const runForegroundSync = () => {
      if (document.visibilityState !== 'visible') {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        return;
      }
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        const now = Date.now();
        const pullRemote = isAppCloudSyncEnabled() && now - lastConfigPull >= CONFIG_PULL_THROTTLE_MS;
        if (pullRemote) lastConfigPull = now;
        void silentRefreshDataRef.current(pullRemote ? { pullRemoteConfig: true } : undefined);
      }, 200);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        lastConfigPull = 0;
      }
      runForegroundSync();
    };
    const onOnline = () => {
      lastConfigPull = 0;
      runForegroundSync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', runForegroundSync);
    window.addEventListener('online', onOnline);
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted || document.visibilityState === 'visible') {
        lastConfigPull = 0;
        runForegroundSync();
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', runForegroundSync);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, []);

  /** Background Sync API: dopo riconnessione lo SW può notificare le finestre (Chrome/Edge/Android). */
  const lastBackgroundSyncRefreshRef = useRef(0);
  useEffect(() => {
    const throttleMs = 4000;
    const onSwMessage = (event: MessageEvent) => {
      if (event.data?.type !== OSTERIA_BACKGROUND_SYNC_MESSAGE) return;
      const now = Date.now();
      if (now - lastBackgroundSyncRefreshRef.current < throttleMs) return;
      lastBackgroundSyncRefreshRef.current = now;
      if (isAppCloudSyncEnabled()) {
        void silentRefreshDataRef.current({ pullRemoteConfig: true });
      }
    };
    navigator.serviceWorker?.addEventListener('message', onSwMessage);

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
      navigator.serviceWorker?.removeEventListener('message', onSwMessage);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const hardResetTestData = useCallback(async () => {
    const result = await database.hardResetTestData();
    setShifts([]);
    setHolidays([]);
    setPunchRecords([]);
    setAvailability([]);
    return result;
  }, []);

  const seedDemoProfileForUser = useCallback(
    async (userId: string) => {
      const result = await database.seedDemoProfileForUser(userId);
      await silentRefreshData({ skipRemoteRevisionCheck: true });
      return result;
    },
    [silentRefreshData]
  );

  const setFeatureFlag = useCallback(async (name: string, enabled: boolean) => {
    setFeatureFlagsState((prev) => ({ ...prev, [name]: enabled }));
    saveLocalFeatureFlag(name, enabled);
    await updateFeatureFlagInSupabase(name, enabled).catch(() => {});
    const rev = await bumpClientSyncRevisionOnSupabase();
    if (rev != null) writeAckClientSyncRevision(rev);
    await silentRefreshData({ pullRemoteConfig: true });
  }, [silentRefreshData]);

  const saveGeofenceConfig = useCallback(
    async (config: GeofenceConfig) => {
      writeLocalGeofenceConfig(config);
      await saveGeofenceConfigToSupabase(config);
      await refreshGeofenceEffectiveConfig();
    },
    [refreshGeofenceEffectiveConfig]
  );

  const setWorkRules = useCallback(async (rules: WorkRules) => {
    setWorkRulesState(rules);
    await saveWorkRulesToSupabase(rules).catch(() => {});
    const rev = await bumpClientSyncRevisionOnSupabase();
    if (rev != null) writeAckClientSyncRevision(rev);
    await silentRefreshData({ pullRemoteConfig: true });
  }, [silentRefreshData]);

  const setBreakRules = useCallback(async (rules: BreakRule[]) => {
    setBreakRulesState(rules);
    await saveBreakRulesToSupabase(rules).catch(() => {});
    const rev = await bumpClientSyncRevisionOnSupabase();
    if (rev != null) writeAckClientSyncRevision(rev);
    await silentRefreshData({ pullRemoteConfig: true });
  }, [silentRefreshData]);

  const pushSettingsToCloud = useCallback(async () => {
    if (!isAppCloudSyncEnabled()) {
      showError(getTranslations(effectiveLanguage).settings_cloud_sync_paused);
      return;
    }
    setSettingsCloudPushBusy(true);
    try {
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
      ]);
      await bumpAppSettingsSyncSignal();
      const rev = await bumpClientSyncRevisionOnSupabase();
      if (rev != null) writeAckClientSyncRevision(rev);
      setSettingsCloudLastSyncedAt(new Date().toISOString());
      showSuccess(getTranslations(effectiveLanguage).settings_cloud_save_all_success);
    } catch (e) {
      showError(
        e instanceof Error ? e.message : getTranslations(effectiveLanguage).settings_cloud_save_all_error
      );
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
  ]);

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
  }, [availability]);

  const forceGlobalRefresh = useCallback(async () => {
    const GLOBAL_REFRESH_TIMEOUT_MS = 75_000;
    setIsGlobalRefreshing(true);
    let loadTimeoutId: number | null = null;
    try {
      const loadAll = Promise.all([
        database.users.getAll().catch(() => []),
        database.shifts.getAll().catch(() => []),
        database.punchRecords.getAll().catch(() => []),
        database.holidays.getAll().catch(() => []),
        database.availability.getAll().catch(() => []),
      ]) as Promise<[User[], Shift[], PunchRecord[], HolidayRequest[], HolidayRequest[]]>;

      const [loadedUsers, loadedShifts, loadedPunchRecords, loadedHolidays, loadedAvailability] =
        await Promise.race([
          loadAll,
          new Promise<never>((_, reject) => {
            loadTimeoutId = window.setTimeout(
              () => reject(new Error('FORCE_GLOBAL_REFRESH_TIMEOUT')),
              GLOBAL_REFRESH_TIMEOUT_MS
            );
          }),
        ]);

      if (loadTimeoutId !== null) {
        clearTimeout(loadTimeoutId);
        loadTimeoutId = null;
      }

      const shiftCacheKeys = Object.keys(localStorage).filter(
        (k) => k.toLowerCase().includes('shift') || k.toLowerCase().includes('turni')
      );
      shiftCacheKeys.forEach((k) => localStorage.removeItem(k));

      setUsers(loadedUsers);
      setShifts(loadedShifts);
      setPunchRecords(loadedPunchRecords);
      setHolidays(loadedHolidays);
      setAvailability(loadedAvailability);
      setCurrentUser((prev) => sessionUserFromLoadedUsersList(prev, loadedUsers));
      setIsGlobalRefreshing(false);
      setPostRefreshLocked(true);
    } catch (err) {
      if (loadTimeoutId !== null) {
        clearTimeout(loadTimeoutId);
        loadTimeoutId = null;
      }
      const isTimeout = err instanceof Error && err.message === 'FORCE_GLOBAL_REFRESH_TIMEOUT';
      if (isTimeout) {
        console.warn(
          '[forceGlobalRefresh] Timeout caricamento DB: overlay blur disattivato; riprova o controlla la rete.'
        );
      } else {
        console.error('Errore durante il refresh globale:', err);
      }
      pendingClientSyncRevRef.current = null;
      showError(getTranslations(effectiveLanguage).app_sync_failed_retry);
      setIsGlobalRefreshing(false);
    }
  }, [showError, effectiveLanguage]);

  forceGlobalRefreshRef.current = forceGlobalRefresh;

  const isGlobalRefreshingRef = useRef(false);
  const postRefreshLockedRef = useRef(false);
  useEffect(() => {
    isGlobalRefreshingRef.current = isGlobalRefreshing;
  }, [isGlobalRefreshing]);
  useEffect(() => {
    postRefreshLockedRef.current = postRefreshLocked;
  }, [postRefreshLocked]);

  /**
   * Sync periodico con sessione + schermo visibile: stesso percorso di `silentRefreshData({ pullRemoteConfig })`.
   * Così allineiamo **DB** (profili, permessi JSONB) e **Storage** (template ruoli, flag, periodo presenze…).
   * Il solo `users.getAll` non bastava: le matrici permesso vivono anche su `role_feature_templates.json`, ecc.
   */
  useEffect(() => {
    if (!currentUser?.id) return;
    const POLL_MS = 60_000;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      if (isGlobalRefreshingRef.current || postRefreshLockedRef.current) return;
      void silentRefreshDataRef.current(
        isAppCloudSyncEnabled() ? { pullRemoteConfig: true } : undefined
      );
    };
    const id = window.setInterval(check, POLL_MS);
    const t0 = window.setTimeout(check, 8_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(t0);
    };
  }, [currentUser?.id]);

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
      }
      if (pendingPublishWeekStart) {
        const weekEnd = format(addDays(parseISO(pendingPublishWeekStart), 7), 'yyyy-MM-dd');
        const draftShifts = shifts.filter(
          (s) => s.approval_status === 'draft' && s.date >= pendingPublishWeekStart && s.date < weekEnd
        );
        for (const shift of draftShifts) {
          await database.shifts.update(shift.id, { approval_status: 'confirmed' });
        }
        setPendingPublishWeekStart(null);
        showSuccess(getTranslations(effectiveLanguage).shifts_published);
      }
      const [loadedUsers, loadedShifts, loadedHolidays, loadedPunchRecords, loadedAvailability] = await Promise.all([
        database.users.getAll().catch(() => []),
        database.shifts.getAll().catch(() => []),
        database.holidays.getAll().catch(() => []),
        database.punchRecords.getAll().catch(() => []),
        database.availability.getAll().catch(() => []),
      ]);
      setUsers(loadedUsers);
      setShifts(loadedShifts);
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
    setPostRefreshLocked(false);
    return true;
  }, [pendingOrderIds, pendingPublishWeekStart, shifts, effectiveLanguage, showError, showSuccess, silentRefreshData]);

  const unlockAfterRefresh = useCallback(
    async (pin: string): Promise<boolean> => {
      if (!currentUser) return false;
      const freshUser = users.find((u) => u.id === currentUser.id);
      /** Stesso criterio del login: `pin` da PostgREST può arrivare come numero → `!==` falliva sempre. */
      if (!freshUser || freshUser.status !== 'active' || !pinMatchesStored(freshUser, pin)) return false;
      return runPostUnlockRefreshActions();
    },
    [currentUser, users, runPostUnlockRefreshActions]
  );

  const unlockAfterRefreshWithDevice = useCallback(async (): Promise<boolean> => {
    if (!currentUser) return false;
    try {
      const ok = await authenticatePinUnlockCredential(currentUser.id);
      if (!ok) return false;
      return runPostUnlockRefreshActions();
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
    setPostRefreshLocked(true);
  }, []);

  const requestConfirmAndPublishWeek = useCallback((weekStart: Date) => {
    setPendingPublishWeekStart(format(weekStart, 'yyyy-MM-dd'));
    setPostRefreshLocked(true);
  }, []);

  const cancelRefreshLock = useCallback(() => {
    if (pendingOrderIds?.length || pendingPublishWeekStart) {
      setPendingOrderIds(null);
      setPendingPublishWeekStart(null);
      setPostRefreshLocked(false);
    } else {
      setForceLogoutRequested(true);
    }
  }, [pendingOrderIds, pendingPublishWeekStart]);

  const clearForceLogoutRequest = useCallback(() => {
    setForceLogoutRequested(false);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#121212]">
        <div className="w-16 h-16 border-4 border-accent border-t-transparent rounded-xl animate-spin"></div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{
      currentUser, setCurrentUser, users, shifts, holidays, punchRecords, availability, toggleAvailability,
      addShift, updateShift, approveShift, approveShiftSoft, deleteShift, deleteShifts, copyShift,
      publishWeekShifts, publishDayShifts, addHolidayRequest, updateHolidayStatus, addPunchRecord, updatePunchRecord, deletePunchRecordsForShift,
      updateUser, createUser, deleteUser, reorderUsers, setUsersSortOrder, updateUserPreferences, effectiveLanguage, setLanguage, showError, showSuccess, forceGlobalRefresh, hardResetTestData, seedDemoProfileForUser, silentRefreshData, hardReloadFromDatabase, isGlobalRefreshing, dataSyncInProgress,
      postRefreshLocked, unlockAfterRefresh, unlockAfterRefreshWithDevice, registerPinUnlockDevice, pinUnlockDeviceRegistered, cancelRefreshLock, pendingOrderIds, requestConfirmAndSaveOrder, pendingPublishWeekStart, requestConfirmAndPublishWeek, forceLogoutRequested, clearForceLogoutRequest,
      featureFlags, setFeatureFlag, geofenceEffectiveConfig, saveGeofenceConfig,
      presenceVerificationConfig, savePresenceVerificationConfig,
      workRules, setWorkRules, breakRules, setBreakRules,
      roleTemplatesRevision, saveRoleFeatureTemplates,
      adminModulesRevision, saveAdminModulesGlobal,
      pushSettingsToCloud, settingsCloudLastSyncedAt, settingsCloudPushBusy,
    }}>
      <PwaGate>{children}</PwaGate>
      <AnimatePresence mode="sync">
        {toastMessage && (
          <Toast
            key={`${toastType}:${toastMessage.slice(0, 80)}`}
            message={toastMessage}
            type={toastType}
            onClose={() => setToastMessage(null)}
          />
        )}
      </AnimatePresence>
    </AppContext.Provider>
  );
}

/* Re-export da moduli stabili (Context non ricreato a ogni HMR di questo file). */
/* eslint-disable react-refresh/only-export-components */
export { useApp } from './appContextCore';
export type { AppContextType } from './appContextTypes';
/* eslint-enable react-refresh/only-export-components */