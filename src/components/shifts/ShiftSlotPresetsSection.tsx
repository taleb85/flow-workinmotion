import { useMemo, useRef, useState } from 'react';
import { TimeInputField } from '../ui/TimeInputField';
import { useT } from '../../hooks/useT';
import {
  getShiftSlotFromStartTime,
  loadShiftSlotPresets,
  saveShiftSlotPresets,
  type ShiftSlot,
  type ShiftTimePreset,
} from '../../utils/shiftSlotPresets';

type Props = {
  startTime: string;
  endTime: string;
  onApply: (start: string, end: string) => void;
  /** Se specificato, forza la fascia oraria ignorando l'auto‑rilevamento da startTime */
  slotOverride?: ShiftSlot;
  /** Se fornita, il click su un preset applica l'orario E crea automaticamente il turno con i valori appena selezionati. */
  onAutoCreate?: (start: string, end: string) => void;
};

export function ShiftSlotPresetsSection({ startTime, endTime: _endTime, onApply, slotOverride, onAutoCreate }: Props) {
  const t = useT();
  const tv = t as Record<string, string>;
  const [editMode, setEditMode] = useState(false);
  const [revision, setRevision] = useState(0);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragOverIndexRef = useRef<number | null>(null);

  const slot = slotOverride ?? getShiftSlotFromStartTime(startTime);
  const presets = useMemo(() => loadShiftSlotPresets(slot), [slot, revision]);

  const persist = (next: ShiftTimePreset[]) => {
    saveShiftSlotPresets(slot, next);
    setRevision((n) => n + 1);
  };

  const slotLabel =
    slot === 'lunch'
      ? (tv.wst_preset_lunch ?? 'Preset pranzo')
      : (tv.wst_preset_dinner ?? 'Preset cena');

  const addPreset = () => {
    const start = newStart.trim().slice(0, 5);
    const end = newEnd.trim().slice(0, 5);
    if (!start || !end) return;
    persist([...presets, { start, end }]);
    setNewStart('');
    setNewEnd('');
  };

  const removePreset = (index: number) => {
    persist(presets.filter((_, i) => i !== index));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverIndexRef.current = index;
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndex;
    setDragIndex(null);
    dragOverIndexRef.current = null;
    if (fromIndex === null || fromIndex === dropIndex) return;
    const next = [...presets];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(dropIndex, 0, moved);
    persist(next);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    dragOverIndexRef.current = null;
  };

  const isDraggingOver = (index: number) => dragIndex !== null && dragOverIndexRef.current === index && dragIndex !== index;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">{slotLabel}</p>
        <button
          type="button"
          onClick={() => {
            setEditMode((v) => !v);
            setNewStart('');
            setNewEnd('');
          }}
          className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
            editMode
              ? 'bg-accent/20 text-accent'
              : 'bg-white/10 text-white/60 hover:text-white'
          }`}
        >
          {editMode ? (tv.done ?? 'Fatto') : (tv.edit ?? 'Modifica')}
        </button>
      </div>

      {editMode ? (
        <div className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-2">
          {presets.length === 0 ? (
            <p className="py-1 text-center text-[10px] text-white/40">
              {tv.no_presets ?? 'Nessun orario salvato'}
            </p>
          ) : (
            presets.map(({ start, end }, i) => (
              <div
                key={`${start}-${end}-${i}`}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, i)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDragEnter={handleDragEnter}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-1.5 rounded-lg transition-colors ${
                  isDraggingOver(i) ? 'bg-white/10 ring-1 ring-white/30' : ''
                } ${dragIndex === i ? 'opacity-40' : ''}`}
              >
                <span className="flex shrink-0 cursor-grab active:cursor-grabbing px-1 text-[11px] text-white/30 hover:text-white/50" aria-hidden="true">
                  ⠿
                </span>
                <span className="flex-1 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white">
                  {start}–{end}
                </span>
                <button
                  type="button"
                  onClick={() => removePreset(i)}
                  aria-label={tv.delete ?? 'Elimina'}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-500/15 text-[11px] font-bold text-red-300 hover:bg-red-500/25"
                >
                  ✕
                </button>
              </div>
            ))
          )}
          <div className="border-t border-white/10 pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {tv.add_preset ?? 'Aggiungi orario'}
            </p>
            <div className="mb-2 flex items-center gap-1.5">
              <TimeInputField
                value={newStart}
                onChange={setNewStart}
                size="md"
                className="min-w-0 flex-1 border-white/20 bg-white/10"
              />
              <span className="text-[11px] text-white/40">–</span>
              <TimeInputField
                value={newEnd}
                onChange={setNewEnd}
                size="md"
                className="min-w-0 flex-1 border-white/20 bg-white/10"
              />
            </div>
            <button
              type="button"
              onClick={addPreset}
              disabled={!newStart.trim() || !newEnd.trim()}
              className="w-full rounded-lg bg-accent/20 py-1.5 text-[11px] font-bold text-accent transition-colors hover:bg-accent/30 disabled:opacity-40 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            >
              + {tv.add ?? 'Aggiungi'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          {presets.map(({ start, end }, i) => {
            const isActive = selectedIdx === i;
            return (
              <button
                key={`${start}-${end}-${i}`}
                type="button"
                onClick={() => {
                  setSelectedIdx(i);
                  onApply(start, end);
                  onAutoCreate?.(start, end);
                }}
                className={`rounded-lg px-4 py-2 text-[12px] font-bold tabular-nums transition-all duration-200 border ${
                  isActive
                    ? 'border-[3px] border-white bg-white/15 text-white shadow-[0_0_8px_#fff]'
                    : 'border-transparent bg-white/15 text-white hover:bg-white/20'
                }`}
              >
                {start}–{end}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
