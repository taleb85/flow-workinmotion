import type { User, Shift, PunchRecord, HolidayRequest } from '../types';

export const MOCK_USER: User = {
  id: 'user-1',
  tenant_id: 'tenant-1',
  first_name: 'MARIO',
  last_name: 'ROSSI',
  email: 'mario.rossi@test.com',
  phone: '+39 333 1234567',
  role: 'waiter',
  pin: '1234',
  status: 'active',
  sort_order: 1,
  language: 'it',
  theme: 'dark',
  can_create_shifts: false,
  can_approve_shifts: false,
  can_manage_drafts: false,
  can_punch_from_app: true,
  department: 'sala',
  hourly_rate_eur: 12.50,
};

export const MOCK_MANAGER: User = {
  ...MOCK_USER,
  id: 'user-2',
  first_name: 'ADMIN',
  last_name: 'TEST',
  role: 'admin',
  pin: '0000',
  can_create_shifts: true,
  can_approve_shifts: true,
  can_manage_drafts: true,
};

export const MOCK_SHIFT: Shift = {
  id: 'shift-1',
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  date: '2026-05-10',
  start_time: '10:00',
  end_time: '16:00',
  type: 'lunch',
  approval_status: 'confirmed',
  department: 'sala',
};

export const MOCK_PUNCH: PunchRecord = {
  id: 'punch-1',
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  shift_id: 'shift-1',
  timestamp: new Date().toISOString(),
  type: 'in',
  source: 'kiosk',
};

export const MOCK_HOLIDAY: HolidayRequest = {
  id: 'holiday-1',
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  start_date: '2026-06-01',
  end_date: '2026-06-05',
  type: 'ferie',
  status: 'pending',
  created_at: new Date().toISOString(),
};
