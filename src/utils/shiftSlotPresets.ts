export type ShiftTimePreset = { start: string; end: string };
export type ShiftSlot = 'lunch' | 'evening';

export const DEFAULT_LUNCH_PRESETS: ShiftTimePreset[] = [
  { start: '09:00', end: '14:00' },
  { start: '10:00', end: '15:00' },
  { start: '10:00', end: '16:00' },
  { start: '11:00', end: '16:00' },
  { start: '12:00', end: '16:00' },
];

export const DEFAULT_EVENING_PRESETS: ShiftTimePreset[] = [
  { start: '16:00', end: '22:00' },
  { start: '16:00', end: '23:00' },
  { start: '18:00', end: '23:00' },
  { start: '18:00', end: '00:00' },
  { start: '19:00', end: '01:00' },
];

const STORAGE_PREFIX = 'flow_slot_presets_';

export function loadShiftSlotPresets(slot: ShiftSlot): ShiftTimePreset[] {
  const defaults = slot === 'lunch' ? DEFAULT_LUNCH_PRESETS : DEFAULT_EVENING_PRESETS;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${slot}`);
    if (raw) {
      const custom = JSON.parse(raw) as ShiftTimePreset[];
      if (Array.isArray(custom) && custom.length > 0) {
        // Unisce custom + default, eliminando duplicati (stesso start+end).
        // I custom vengono prima, i default vengono dopo se non già presenti.
        const seen = new Set(custom.map((p) => `${p.start}|${p.end}`));
        const extras = defaults.filter((p) => !seen.has(`${p.start}|${p.end}`));
        return [...custom, ...extras];
      }
    }
  } catch {
    /* ignore */
  }
  return defaults;
}

export function saveShiftSlotPresets(slot: ShiftSlot, presets: ShiftTimePreset[]): void {
  localStorage.setItem(`${STORAGE_PREFIX}${slot}`, JSON.stringify(presets));
}

export function getShiftSlotFromStartTime(startTime: string): ShiftSlot {
  const hour = parseInt(startTime.slice(0, 5).split(':')[0], 10);
  return Number.isFinite(hour) && hour >= 16 ? 'evening' : 'lunch';
}

export function getShiftTypeFromStartTime(startTime: string): 'lunch' | 'dinner' {
  const hour = parseInt(startTime.slice(0, 5).split(':')[0], 10);
  return Number.isFinite(hour) && hour >= 17 ? 'dinner' : 'lunch';
}
