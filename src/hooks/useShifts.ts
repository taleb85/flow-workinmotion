import { useState, useCallback } from 'react';
import type { Shift } from '../types';
import { database } from '../lib/database';

export interface UseShiftsReturn {
  shifts: Shift[];
  setShifts: (shifts: Shift[]) => void;
  loadShifts: (userId?: string) => Promise<void>;
  addShift: (shift: Omit<Shift, 'id'>) => Promise<Shift | null>;
  updateShift: (id: string, updates: Partial<Shift>) => Promise<Shift | null>;
  deleteShift: (id: string) => Promise<void>;
  deleteShifts: (ids: string[]) => Promise<void>;
  copyShift: (shift: Shift, newDate: string) => Promise<Shift | null>;
  publishWeekShifts: (weekStart: Date) => void;
  publishDayShifts: (dateStr: string) => Promise<void>;
  approveShift: (shiftId: string, opts?: {
    approvedStart?: string;
    approvedEnd?: string;
    actorOverride?: User;
    promoteFromDraft?: boolean;
  }) => Promise<void>;
}

import type { User } from '../types';

export function useShifts(): UseShiftsReturn {
  const [shifts, setShifts] = useState<Shift[]>([]);

  const loadShifts = useCallback(async (userId?: string) => {
    try {
      const data = userId
        ? await database.shifts.getByUserId(userId)
        : await database.shifts.getAll();
      setShifts(data);
    } catch (e) {
      console.error('[useShifts] loadShifts error:', e);
    }
  }, []);

  const addShift = useCallback(async (shift: Omit<Shift, 'id'>): Promise<Shift | null> => {
    try {
      const data = await database.shifts.insert(shift);
      if (data) {
        setShifts((prev) => [...prev, data]);
      }
      return data;
    } catch (e) {
      console.error('[useShifts] addShift error:', e);
      return null;
    }
  }, []);

  const updateShift = useCallback(async (id: string, updates: Partial<Shift>): Promise<Shift | null> => {
    try {
      const data = await database.shifts.update(id, updates);
      if (data) {
        setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
      }
      return data;
    } catch (e) {
      console.error('[useShifts] updateShift error:', e);
      return null;
    }
  }, []);

  const deleteShift = useCallback(async (id: string) => {
    try {
      await database.shifts.delete(id);
      setShifts((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      console.error('[useShifts] deleteShift error:', e);
    }
  }, []);

  const deleteShifts = useCallback(async (ids: string[]) => {
    try {
      await database.shifts.deleteMany(ids);
      setShifts((prev) => prev.filter((s) => !ids.includes(s.id)));
    } catch (e) {
      console.error('[useShifts] deleteShifts error:', e);
    }
  }, []);

  const copyShift = useCallback(async (shift: Shift, newDate: string): Promise<Shift | null> => {
    try {
      const newShift: Omit<Shift, 'id'> = {
        ...shift,
        date: newDate,
        approval_status: 'draft',
        approved_at: undefined,
        approved_by: undefined,
        approved_start_time: undefined,
        approved_end_time: undefined,
      };
      return await addShift(newShift);
    } catch (e) {
      console.error('[useShifts] copyShift error:', e);
      return null;
    }
  }, [addShift]);

  const publishWeekShifts = useCallback((_weekStart: Date) => {
    // Placeholder — logica da implementare con PIN confirmation
    console.warn('[useShifts] publishWeekShifts not fully implemented');
  }, []);

  const publishDayShifts = useCallback(async (dateStr: string) => {
    // Placeholder — logica da implementare
    console.warn('[useShifts] publishDayShifts not fully implemented', dateStr);
  }, []);

  const approveShift = useCallback(async (shiftId: string, opts?: {
    approvedStart?: string;
    approvedEnd?: string;
    actorOverride?: User;
    promoteFromDraft?: boolean;
  }) => {
    try {
      const updates: Partial<Shift> = {
        approval_status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: opts?.actorOverride?.first_name ?? 'admin',
        approved_start_time: opts?.approvedStart,
        approved_end_time: opts?.approvedEnd,
      };
      await database.shifts.update(shiftId, updates);
      setShifts((prev) =>
        prev.map((s) => (s.id === shiftId ? { ...s, ...updates } : s))
      );
    } catch (e) {
      console.error('[useShifts] approveShift error:', e);
    }
  }, []);

  return {
    shifts,
    setShifts,
    loadShifts,
    addShift,
    updateShift,
    deleteShift,
    deleteShifts,
    copyShift,
    publishWeekShifts,
    publishDayShifts,
    approveShift,
  };
}
