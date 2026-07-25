import { format } from 'date-fns';
import { History, ShieldAlert, Lock, ChevronDown, ArrowRight } from 'lucide-react';
import type { PunchAuditEntry } from '../../types';
import type { HistoryEntry } from '../../utils/scheduleHistory';

interface ShiftHistoryCardProps {
  /** Storico modifiche turno (start_time, end_time, etc.) */
  shiftEdits: HistoryEntry[];
  
  /** Storico audit timbrature (calculated_time modifiche) */
  punchAuditEntries: PunchAuditEntry[];
  
  /** Storico sbloccato (dopo PIN) */
  isUnlocked: boolean;
  
  /** Stato expanded/collapsed */
  isExpanded: boolean;
  
  /** Toggle expand/collapse */
  onToggleExpand: () => void;
  
  /** Request unlock (mostra PIN gate) */
  onRequestUnlock: () => void;
  
  /** Non richiedere PIN durante review queue */
  skipPinDuringReview?: boolean;
  
  /** Helper: umanizza nome campo (start_time → "Orario inizio") */
  humanizeFieldName: (field: string) => string;
  
  /** Helper: formatta valore audit (null → "—", date → readable) */
  fmtAuditValue: (val: unknown) => string;
  
  /** Traduzione */
  t: Record<string, string>;
}

/**
 * Scheda collassabile storico modifiche turno + audit timbrature.
 * 
 * Richiede PIN per reveal (tranne durante review queue).
 * Estratto da Timesheets.tsx (righe 4931-5060) per ridurre complessità drawer.
 */
export function ShiftHistoryCard({
  shiftEdits,
  punchAuditEntries,
  isUnlocked,
  isExpanded,
  onToggleExpand,
  onRequestUnlock,
  skipPinDuringReview = false,
  humanizeFieldName,
  fmtAuditValue,
  t,
}: ShiftHistoryCardProps) {
  const totalCount = shiftEdits.length + punchAuditEntries.length;
  
  const title =
    shiftEdits.length > 0 && punchAuditEntries.length > 0
      ? `${t.ts_drawer_shift_edits} · ${t.ts_drawer_punch_edits}`
      : shiftEdits.length > 0
        ? t.ts_drawer_shift_edits
        : t.ts_drawer_punch_edits;

  const handleClick = () => {
    if (!isUnlocked && !skipPinDuringReview) {
      onRequestUnlock();
      return;
    }
    onToggleExpand();
  };

  return (
    <div className="border-b border-white/10 p-3 sm:p-5">
      <div className="overflow-hidden rounded-xl border-2 border-amber-400/50 bg-amber-500/10 shadow-sm">
        <button
          type="button"
          aria-expanded={isUnlocked && isExpanded}
          aria-controls="timesheet-drawer-combined-history"
          onClick={handleClick}
          className="flex w-full min-h-[2.75rem] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-amber-500/15 active:bg-amber-500/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
        >
          {shiftEdits.length === 0 && punchAuditEntries.length > 0 ? (
            <ShieldAlert className="h-4 w-4 shrink-0 text-orange-400" aria-hidden />
          ) : (
            <History className="h-4 w-4 shrink-0 text-amber-400" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-white" title={title}>{title}
            </span>
            {!isUnlocked ? (
              <span className="mt-0.5 block truncate text-[11px] font-medium text-amber-200/80" title={t.ts_enter_manager_pin}>{t.ts_enter_manager_pin}
              </span>
            ) : null}
          </div>
          <span className="shrink-0 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-bold text-amber-200">
            {totalCount}
          </span>
          {isUnlocked ? (
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-white/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          ) : (
            <Lock className="h-4 w-4 shrink-0 text-amber-300/80" aria-hidden />
          )}
        </button>
        
        {isUnlocked && isExpanded && (
          <div
            id="timesheet-drawer-combined-history"
            className="flex max-h-[min(24vh,200px)] flex-col gap-2 overflow-y-auto overscroll-contain border-t border-amber-400/30 px-3 pb-3 pt-2.5"
          >
            {/* Storico modifiche turno */}
            {shiftEdits.length > 0 && (
              <div className="flex flex-col gap-2">
                {punchAuditEntries.length > 0 && (
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-300/90">
                    <History className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
                    {t.ts_drawer_shift_edits}
                  </p>
                )}
                {shiftEdits.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-2.5"
                  >
                    <div className="mb-1 flex items-center justify-between text-[11px] text-white/50">
                      <span className="font-semibold text-amber-300">
                        {humanizeFieldName(e.field || '')}
                      </span>
                      <span>{format(new Date(e.timestamp), 'dd/MM HH:mm')}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-lg bg-red-500/15 px-1.5 py-0.5 text-red-300 line-through">
                        {fmtAuditValue(e.oldValue)}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-white/40" />
                      <span className="rounded-lg bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-300">
                        {fmtAuditValue(e.newValue)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/50">{t.edited_by_prefix} {e.actorName}</p>
                  </div>
                ))}
              </div>
            )}
            
            {/* Storico audit timbrature */}
            {punchAuditEntries.length > 0 && (
              <div className="flex flex-col gap-2">
                {shiftEdits.length > 0 && (
                  <>
                    <div
                      className="my-1 border-t border-white/10"
                      role="separator"
                    />
                    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-orange-300/90">
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t.ts_drawer_punch_edits}
                    </p>
                  </>
                )}
                {punchAuditEntries.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-lg border border-orange-400/25 bg-orange-500/10 p-2.5"
                  >
                    <div className="mb-1 flex items-center justify-between text-[11px] text-white/50">
                      <span className="font-semibold text-orange-300">
                        {humanizeFieldName(e.field || '')}
                      </span>
                      <span>{e.changed_at ? format(new Date(e.changed_at), 'dd/MM HH:mm') : '—'}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="rounded-lg bg-red-500/15 px-1.5 py-0.5 text-red-300 line-through">
                        {fmtAuditValue(e.old_value)}
                      </span>
                      <ArrowRight className="h-3 w-3 shrink-0 text-white/40" />
                      <span className="rounded-lg bg-emerald-500/15 px-1.5 py-0.5 font-semibold text-emerald-300">
                        {fmtAuditValue(e.new_value)}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/50">{t.edited_by_prefix} {e.actor_name}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
