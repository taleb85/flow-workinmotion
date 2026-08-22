import { createContext, useContext } from 'react';
import type { User, Shift, HolidayRequest, PunchRecord } from '../types';
import type { FeatureFlags } from '../utils/featureFlags';
import type { WorkRules } from '../utils/workRules';
import type { BreakRule } from '../utils/breakRules';
import type { GeofenceConfig } from '../utils/geofencePunch';
import type { PresenceVerificationConfig } from '../utils/presenceVerificationConfigStorage';

// ────────────────────────────────────────────────────────────────────
// USER / SESSION SLICE
// ────────────────────────────────────────────────────────────────────
export interface UserSlice {
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  users: User[];
  isSessionElevated: boolean;
  impersonatingAs: User | null;
  originalAdminUser: User | null;
  setImpersonating: (targetUser: User | null, adminUser: User | null) => void;
  globalPinSessionId: string | null;
  setGlobalPinSessionId: (id: string | null) => void;
  forceLogoutRequested: boolean;
  clearForceLogoutRequest: () => void;
  isLoading: boolean;
  setIsSessionElevated: (v: boolean) => void;
  effectiveLanguage: import('../types').Language;
  setLanguage: (lang: import('../types').Language) => void;
  updateUser: (id: string, updates: Partial<User>) => Promise<boolean>;
  deleteUser: (id: string) => Promise<boolean>;
  createUser: (payload: {
    first_name: string;
    last_name?: string;
    email: string;
    role: import('../types').UserRole;
    pin: string;
    status: import('../types').UserStatus;
    department?: import('../types').Department;
    hourly_rate_eur?: number | null;
    employment_start_date?: string | null;
    employment_end_date?: string | null;
  }) => Promise<User | null>;
  reorderUsers: (userId: string, direction: 'up' | 'down') => void;
  logout: () => void;
  clearLanguage: () => void;
}

export const UserSliceContext = createContext<UserSlice | undefined>(undefined);
export function useAppUser(): UserSlice {
  const ctx = useContext(UserSliceContext);
  if (!ctx) throw new Error('useAppUser must be used within AppUserProvider');
  return ctx;
}

// ────────────────────────────────────────────────────────────────────
// DATA SLICE (shifts, punchRecords, holidays — changes frequently)
// ────────────────────────────────────────────────────────────────────
export interface DataSlice {
  shifts: Shift[];
  punchRecords: PunchRecord[];
  holidays: HolidayRequest[];
  availability: HolidayRequest[];
  addShift: (shift: Omit<Shift, 'id'>) => Promise<Shift | null>;
  updateShift: (id: string, shift: Partial<Shift>) => void;
  deleteShift: (id: string) => void;
  deleteShifts: (ids: string[]) => void;
  copyShift: (shift: Shift, newDate: string) => void;
  bulkCopyPreviousWeek: (currentWeekStart: Date) => Promise<number>;
  publishWeekShifts: (weekStart: Date) => void;
  publishDayShifts: (dateStr: string) => Promise<void>;
  approveShift: (shiftId: string, opts?: any) => Promise<void>;
  addHolidayRequest: (request: Omit<HolidayRequest, 'id' | 'created_at' | 'status'>) => Promise<{ ok: boolean; emailSent?: boolean; error?: string }>;
  updateHolidayStatus: (id: string, status: import('../types').HolidayStatus) => Promise<{ ok: boolean; emailSent?: boolean; error?: string }>;
  deleteHolidayRequest: (id: string) => Promise<boolean>;
  addPunchRecord: (
    userId: string,
    type: 'in' | 'out',
    options?: {
      timestamp?: string;
      shift_id?: string;
      presenceProof?: string;
      source?: import('../types').PunchRecordSource;
    }
  ) => Promise<
    | { error: string }
    | { record: PunchRecord; toggledToExit?: boolean }
    | void
  >;
  updatePunchRecord: (id: string, updates: { timestamp?: string; calculated_time?: string; clock_out_time?: string | null }) => Promise<void>;
  deletePunchRecordsForShift: (shiftId: string) => Promise<void>;
  seedDemoProfileForUser: (userId: string) => Promise<{
    shifts: number;
    holidays: number;
    punchRecords: number;
    userUpdated: boolean;
    coworkerShifts: number;
  }>;
}

export const DataSliceContext = createContext<DataSlice | undefined>(undefined);
export function useAppData(): DataSlice {
  const ctx = useContext(DataSliceContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}

// Convenience hooks for individual data types
export function useAppShifts(): Shift[] {
  return useAppData().shifts;
}
export function useAppPunchRecords(): PunchRecord[] {
  return useAppData().punchRecords;
}
export function useAppHolidays(): HolidayRequest[] {
  return useAppData().holidays;
}

// ────────────────────────────────────────────────────────────────────
// CONFIG SLICE (featureFlags, workRules, breakRules — changes rarely)
// ────────────────────────────────────────────────────────────────────
export interface ConfigSlice {
  featureFlags: FeatureFlags;
  setFeatureFlag: (name: string, enabled: boolean) => Promise<void>;
  workRules: WorkRules;
  setWorkRules: (rules: WorkRules) => Promise<void>;
  breakRules: BreakRule[];
  setBreakRules: (rules: BreakRule[]) => Promise<void>;
  geofenceEffectiveConfig: GeofenceConfig | null;
  presenceVerificationConfig: PresenceVerificationConfig;
  roleTemplatesRevision: number;
  adminModulesRevision: number;
  departmentsRevision: number;
  toggleAvailability: (userId: string, date: string) => Promise<void>;
  saveRoleFeatureTemplates: (data: import('../utils/roleFeatureTemplates').RoleFeatureTemplatesOnDisk) => Promise<void>;
  saveAdminModulesGlobal: (data: import('../utils/adminModulesGlobal').AdminModulesGlobalOnDisk) => Promise<void>;
  saveGeofenceConfig: (config: GeofenceConfig) => Promise<void>;
  savePresenceVerificationConfig: (config: PresenceVerificationConfig) => Promise<void>;
  pushSettingsToCloud: () => Promise<void>;
  settingsCloudLastSyncedAt: string | null;
  settingsCloudPushBusy: boolean;
  notifyDepartmentsChanged: () => Promise<void>;
}

export const ConfigSliceContext = createContext<ConfigSlice | undefined>(undefined);
export function useAppConfig(): ConfigSlice {
  const ctx = useContext(ConfigSliceContext);
  if (!ctx) throw new Error('useAppConfig must be used within AppConfigProvider');
  return ctx;
}

// ────────────────────────────────────────────────────────────────────
// OVERLAY / UI STATE SLICE (refresh, sync state — fast-changing)
// ────────────────────────────────────────────────────────────────────
export interface OverlaySlice {
  isGlobalRefreshing: boolean;
  syncStage: string;
  dataSyncInProgress: boolean;
  postRefreshLocked: boolean;
  postUnlockReloadPending: boolean;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
  silentRefreshData: (opts?: {
    pullRemoteConfig?: boolean;
    skipRemoteRevisionCheck?: boolean;
    throwOnError?: boolean;
    forceSettingsBundle?: boolean;
  }) => Promise<void>;
  hardReloadFromDatabase: () => Promise<void>;
  unlockAfterRefresh: (pin: string) => Promise<boolean>;
  unlockAfterRefreshWithDevice: () => Promise<boolean>;
  cancelRefreshLock: () => void;
  registerPinUnlockDevice: (pin: string) => Promise<{ ok: boolean; wrongPin: boolean }>;
  pinUnlockDeviceRegistered: boolean;
  removePinUnlockDevice: () => boolean;
  pendingOrderIds: string[] | null;
  pendingPublishWeekStart: string | null;
  requestConfirmAndSaveOrder: (orderedIds: string[]) => void;
  requestConfirmAndPublishWeek: (weekStart: Date) => void;
}

export const OverlaySliceContext = createContext<OverlaySlice | undefined>(undefined);
export function useAppOverlay(): OverlaySlice {
  const ctx = useContext(OverlaySliceContext);
  if (!ctx) throw new Error('useAppOverlay must be used within AppOverlayProvider');
  return ctx;
}
