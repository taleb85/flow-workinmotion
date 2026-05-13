import type {
  User,
  Shift,
  HolidayRequest,
  PunchRecord,
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
  /** True mentre `silentRefreshData` è in corso (lettura DB + eventuale Storage; senza overlay PIN). */
  dataSyncInProgress: boolean;
  postRefreshLocked: boolean;
  unlockAfterRefresh: (pin: string) => Promise<boolean>;
  /** Sblocco con Face ID / Touch ID / impronta (se il dispositivo è stato collegato). */
  unlockAfterRefreshWithDevice: () => Promise<boolean>;
  /** Registra questo browser/dispositivo dopo verifica PIN a 4 cifre. */
  registerPinUnlockDevice: (pin: string) => Promise<{ ok: boolean; wrongPin: boolean }>;
  /** True se per l’utente corrente esiste già una credenziale WebAuthn su questo host. */
  pinUnlockDeviceRegistered: boolean;
  cancelRefreshLock: () => void;
  /** Ordine in attesa di conferma PIN (mostra overlay e alla conferma salva su DB e aggiorna app). */
  pendingOrderIds: string[] | null;
  requestConfirmAndSaveOrder: (orderedIds: string[]) => void;
  /** Settimana in attesa di pubblicazione (PIN richiesto per confermare). */
  pendingPublishWeekStart: string | null;
  requestConfirmAndPublishWeek: (weekStart: Date) => void;
  forceLogoutRequested: boolean;
  clearForceLogoutRequest: () => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  users: User[];
  shifts: Shift[];
  holidays: HolidayRequest[];
  punchRecords: PunchRecord[];
  availability: HolidayRequest[];
  toggleAvailability: (userId: string, date: string) => Promise<void>;
  addShift: (shift: Omit<Shift, 'id'>) => Promise<Shift | null>;
  updateShift: (id: string, shift: Partial<Shift>) => void;
  /**
   * Approva definitivamente un turno (congelo):
   * - approval_status = 'approved' + approved_at + approved_by + approved_start_time/end_time
   * - se già soft-approved, aggiunge solo congelo (approved_at + orari congelati)
   * - scrive punch_audit_log per tracciabilità
   */
  approveShift: (shiftId: string, opts?: { approvedStart: string; approvedEnd: string }) => Promise<void>;
  /** Approva il turno senza congelarlo (nessun approved_at/approved_by). Il congelo avviene separatamente nelle Presenze. */
  approveShiftSoft: (shiftId: string) => Promise<void>;
  deleteShift: (id: string) => void;
  deleteShifts: (ids: string[]) => void;
  copyShift: (shift: Shift, newDate: string) => void;
  publishWeekShifts: (weekStart: Date) => void;
  publishDayShifts: (dateStr: string) => Promise<void>;
  addHolidayRequest: (request: Omit<HolidayRequest, 'id' | 'created_at' | 'status'>) => Promise<{ ok: boolean; emailSent?: boolean; error?: string }>;
  updateHolidayStatus: (id: string, status: HolidayStatus) => Promise<{ ok: boolean; emailSent?: boolean; error?: string }>;
  addPunchRecord: (
    userId: string,
    type: 'in' | 'out',
    options?: { timestamp?: string; shift_id?: string; presenceProof?: string }
  ) => Promise<{ error?: string } | void>;
  updatePunchRecord: (id: string, updates: { timestamp?: string; calculated_time?: string; clock_out_time?: string | null }) => Promise<void>;
  deletePunchRecordsForShift: (shiftId: string) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => void;
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
  }) => Promise<User | null>;
  deleteUser: (id: string) => void;
  reorderUsers: (userId: string, direction: 'up' | 'down') => void;
  /** Applica l'ordine degli utenti solo nello stato (senza DB). Usato da Edit view Salva. */
  setUsersSortOrder: (orderedIds: string[]) => void;
  updateUserPreferences: (preferences: { language?: Language; theme?: 'light' | 'dark' }) => void;
  effectiveLanguage: Language;
  setLanguage: (lang: Language) => void;
  featureFlags: FeatureFlags;
  setFeatureFlag: (name: string, enabled: boolean) => Promise<void>;
  /** Centro geofence effettivo (Storage/local + fallback .env); null se non configurato. */
  geofenceEffectiveConfig: GeofenceConfig | null;
  /** Salva `geofence.json` su Storage e aggiorna la cache locale (solo Admin da UI). */
  saveGeofenceConfig: (config: GeofenceConfig) => Promise<void>;
  /** Config verifica presenza NFC/QR (`presence_verification.json` + env). */
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
  /** Salva il bundle completo su Storage + segnale Realtime (solo Admin da UI). */
  pushSettingsToCloud: () => Promise<void>;
  /** ISO timestamp ultimo pull/push riuscito del bundle impostazioni (null = mai). */
  settingsCloudLastSyncedAt: string | null;
  settingsCloudPushBusy: boolean;
}
