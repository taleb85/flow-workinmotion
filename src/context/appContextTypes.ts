import type { Dispatch, SetStateAction } from 'react';
import type {
  User,
  Shift,
  HolidayRequest,
  PunchRecord,
  PunchRecordSource,
  Language,
  HolidayStatus,
  UserRole,
  UserStatus,
  Department,
} from '../types';
import type { FeatureFlags } from '../utils/featureFlags';
import type { RoleFeatureTemplatesOnDisk } from '../utils/roleFeatureTemplates';
import type { AdminModulesGlobalOnDisk } from '../utils/adminModulesGlobal';
import type { WorkRules } from '../utils/workRules';
import type { BreakRule } from '../utils/breakRules';
import type { GeofenceConfig } from '../utils/geofencePunch';
import type { PresenceVerificationConfig } from '../utils/presenceVerificationConfigStorage';

export interface AppContextType {
  /** True mentre `loadInitialData` non ha ancora terminato (sessione/dati da localStorage/DB). */
  isLoading: boolean;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  forceGlobalRefresh: () => Promise<void>;
  hardResetTestData: () => Promise<{ shifts: number; holidays: number; punchRecords: number; notifications?: number }>;
  /** Inserisce turni, timbrature, ferie e campi profilo di esempio per l’utente indicato (anteprima / test). */
  seedDemoProfileForUser: (userId: string) => Promise<{
    shifts: number;
    holidays: number;
    punchRecords: number;
    userUpdated: boolean;
    coworkerShifts: number;
  }>;
  silentRefreshData: (opts?: {
    pullRemoteConfig?: boolean;
    /** Non invocare `forceGlobalRefresh` se la revisione Storage è avanti (es. reload volontario dal server). */
    skipRemoteRevisionCheck?: boolean;
    /** Rilancia l’errore invece di limitarsi al log (es. `hardReloadFromDatabase`). */
    throwOnError?: boolean;
    /** Opzione legacy: il bundle non viene più scaricato da object Storage (solo JSON separati). */
    forceSettingsBundle?: boolean;
  }) => Promise<void>;
  /** Svuota cache turni locale, ricarica DB + Storage cloud, aggiorna ack revisione — senza lock PIN. */
  hardReloadFromDatabase: () => Promise<void>;
  isGlobalRefreshing: boolean;
  /** Messaggio descrittivo dello stadio corrente di sincronizzazione globale. */
  syncStage: string;
  /** True mentre `silentRefreshData` è in corso (lettura DB + eventuale Storage; senza overlay PIN). */
  dataSyncInProgress: boolean;
  postRefreshLocked: boolean;
  /** Dopo PIN OK: schermata «aggiornamento» e reload pagina (stato resetta al reload). */
  postUnlockReloadPending: boolean;
  unlockAfterRefresh: (pin: string) => Promise<boolean>;
  /** Sblocco con Face ID / Touch ID / impronta (se il dispositivo è stato collegato). */
  unlockAfterRefreshWithDevice: () => Promise<boolean>;
  /** Registra questo browser/dispositivo dopo verifica PIN a 4 cifre. */
  registerPinUnlockDevice: (pin: string) => Promise<{ ok: boolean; wrongPin: boolean }>;
  /** True se per l’utente corrente esiste già una credenziale WebAuthn su questo host. */
  pinUnlockDeviceRegistered: boolean;
  /** Rimuove la credenziale di questo dispositivo per l'utente corrente. */
  removePinUnlockDevice: () => boolean;
  cancelRefreshLock: () => void;
  /** Ordine in attesa di conferma PIN (mostra overlay e alla conferma salva su DB e aggiorna app). */
  pendingOrderIds: string[] | null;
  requestConfirmAndSaveOrder: (orderedIds: string[]) => void;
  /** Settimana in attesa di pubblicazione (PIN richiesto per confermare). */
  pendingPublishWeekStart: string | null;
  requestConfirmAndPublishWeek: (weekStart: Date) => void;
  forceLogoutRequested: boolean;
  clearForceLogoutRequest: () => void;
  /** Logout locale: tema guest, rimuove sessione, redirect a login profilo. */
  logout: () => void;
  /** Sessione PIN globale — quando impostata, tutti i PIN gate dell'app sono bypassati. */
  globalPinSessionId: string | null;
  setGlobalPinSessionId: (id: string | null) => void;
  currentUser: User | null;
  setCurrentUser: Dispatch<SetStateAction<User | null>>;
  users: User[];
  shifts: Shift[];
  holidays: HolidayRequest[];
  punchRecords: PunchRecord[];
  availability: HolidayRequest[];
  toggleAvailability: (userId: string, date: string) => Promise<void>;
  addShift: (shift: Omit<Shift, 'id'>) => Promise<Shift | null>;
  updateShift: (id: string, shift: Partial<Shift>) => void;
  approveShift: (shiftId: string, opts?: any) => Promise<void>;
  deleteShift: (id: string) => void;
  deleteShifts: (ids: string[]) => void;
  copyShift: (shift: Shift, newDate: string) => void;
  bulkCopyPreviousWeek: (currentWeekStart: Date) => Promise<number>;
  publishWeekShifts: (weekStart: Date) => void;
  publishDayShifts: (dateStr: string) => Promise<void>;
  addHolidayRequest: (request: Omit<HolidayRequest, 'id' | 'created_at' | 'status'>) => Promise<{ ok: boolean; emailSent?: boolean; error?: string }>;
  updateHolidayStatus: (id: string, status: HolidayStatus) => Promise<{ ok: boolean; emailSent?: boolean; error?: string }>;
  deleteHolidayRequest: (id: string) => Promise<boolean>;
  addPunchRecord: (
    userId: string,
    type: 'in' | 'out',
    options?: {
      timestamp?: string;
      shift_id?: string;
      presenceProof?: string;
      /** Se omesso: `manager` se un responsabile timbra per un altro utente, altrimenti `kiosk`. */
      source?: PunchRecordSource;
    }
  ) => Promise<
    | { error: string }
    | { record: PunchRecord; toggledToExit?: boolean }
    | void
  >;
  updatePunchRecord: (id: string, updates: { timestamp?: string; calculated_time?: string; clock_out_time?: string | null }) => Promise<void>;
  deletePunchRecordsForShift: (shiftId: string) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<boolean>;
  /** Inserisce un nuovo dipendente in `users` (gestione: admin, manager, assistente, capo). */
  createUser: (payload: {
    first_name: string;
    last_name?: string;
    email: string;
    role: UserRole;
    pin: string;
    status: UserStatus;
    department?: Department;
    hourly_rate_eur?: number | null;
    /** `yyyy-MM-dd` o null */
    employment_start_date?: string | null;
    employment_end_date?: string | null;
  }) => Promise<User | null>;
  deleteUser: (id: string) => Promise<boolean>;
  reorderUsers: (userId: string, direction: 'up' | 'down') => void;
  /** Applica l'ordine degli utenti solo nello stato (senza DB). Usato da Edit view Salva. */
  setUsersSortOrder: (orderedIds: string[]) => void;
  updateUserPreferences: (preferences: { language?: Language; theme?: 'light' | 'dark' }) => void;
  effectiveLanguage: Language;
  setLanguage: (lang: Language) => void;
  clearLanguage: () => void;
  featureFlags: FeatureFlags;
  setFeatureFlag: (name: string, enabled: boolean) => Promise<void>;
  /** Centro geofence effettivo (Storage/local + fallback .env); null se non configurato. */
  geofenceEffectiveConfig: GeofenceConfig | null;
  /** Salva `geofence.json` su Storage e aggiorna la cache locale (solo Admin da UI). */
  saveGeofenceConfig: (config: GeofenceConfig) => Promise<void>;
  /** Config verifica presenza QR (`presence_verification.json` + env). */
  presenceVerificationConfig: PresenceVerificationConfig;
  savePresenceVerificationConfig: (config: PresenceVerificationConfig) => Promise<void>;
  workRules: WorkRules;
  setWorkRules: (rules: WorkRules) => Promise<void>;
  breakRules: BreakRule[];
  setBreakRules: (rules: BreakRule[]) => Promise<void>;
  /** Revisione incrementata al caricamento/salvataggio template permessi ruolo (solo Admin). */
  roleTemplatesRevision: number;
  /** Salva template permessi (locale + Storage). Solo per pannello Admin. */
  saveRoleFeatureTemplates: (data: RoleFeatureTemplatesOnDisk) => Promise<void>;
  adminModulesRevision: number;
  /** Moduli scheda Impostazioni globali (locale + Storage). Solo Admin. */
  saveAdminModulesGlobal: (data: AdminModulesGlobalOnDisk) => Promise<void>;
  /** Incrementata dopo pull cloud o modifica reparti — chi legge `getDepartments()` deve dipendere da questo per ridisegnare. */
  departmentsRevision: number;
  /** Dopo modifica reparti (colori/etichette/custom): upload `departments.json` + bump revisione sync. */
  notifyDepartmentsChanged: () => Promise<void>;
  /** Salva il bundle completo su Storage + segnale Realtime (solo Admin da UI). */
  pushSettingsToCloud: () => Promise<void>;
  /** ISO timestamp ultimo pull/push riuscito del bundle impostazioni (null = mai). */
  settingsCloudLastSyncedAt: string | null;
  settingsCloudPushBusy: boolean;
  /**
   * True dopo modifiche locali ai dati operativi (es. push cloud / allineamento).
   * Si azzera dopo una `silentRefreshData` con `pullRemoteConfig: true` riuscita (o al logout).
   */
  managementDataTouchedSinceLastSync: boolean;
  /** True se l'utente ha eseguito l'accesso tramite PIN secondario (elevazione sessione). Si perde al refresh. */
  isSessionElevated: boolean;
  setIsSessionElevated: (v: boolean) => void;
  /**
   * Utente "impersonato" tramite Cambio Rapido da un Admin.
   * Null se nessuna sessione di impersonazione è attiva.
   */
  impersonatingAs: User | null;
  /**
   * Admin originale che ha avviato la sessione di impersonazione.
   * Null se nessuna sessione attiva.
   */
  originalAdminUser: User | null;
  /**
   * Avvia o termina una sessione di impersonazione.
   * Chiamare con (null, null) per ripristinare l'Admin originale.
   */
  setImpersonating: (targetUser: User | null, adminUser: User | null) => void;
}
