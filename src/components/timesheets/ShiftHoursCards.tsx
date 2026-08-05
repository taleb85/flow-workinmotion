import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import { formatTrans } from '../../utils/translations';
import type { PunchRecordSource } from '../../types';

interface ShiftData {
  id: string;
  status: string;
  plannedStart: string;
  plannedEnd: string;
  plannedMins: number;
  breakMinutes: number;
  breakMinutesActual: number;
  actualStart: string | null;
  actualEnd: string | null;
  actualEndFull?: string;
  actualMins: number;
  deltaMins: number;
  punched: boolean;
  isCrossDay?: boolean;
  nightRolloverOk?: boolean;
  punchInSource?: PunchRecordSource | null;
  punchOutSource?: PunchRecordSource | null;
}

interface ShiftHoursCardsProps {
  /** Dati shift */
  shift: ShiftData;
  
  /** Shift completo dal DB (per toggle deduct_break / pausa auto / esclusioni regole) */
  fullShift?: {
    id: string;
    deduct_break?: boolean;
    is_auto_break?: boolean;
    break_minutes?: number;
    deduct_excluded_rule_ids?: string[];
    approved_at?: string;
  } | null;
  
  /** Classi CSS per card pianificato */
  plannedCardBoxClass: string;
  plannedCardLabelCls: string;
  plannedCardMainCls: string;
  plannedCardSubCls: string;
  
  /** Colore delta ore (blu = +, rosso = -, grigio = neutro) */
  deltaColor: string;
  
  /** Review sheet settimanale (nasconde toggle pausa) */
  isEmployeeWeekReviewSheet: boolean;
  
  /** Permessi: può modificare settings turno */
  canTeamTimesheetOps: boolean;
  
  /** Turno congelato (payroll) */
  isFrozen: boolean;
  
  /** Turno absent */
  isAbsent: boolean;
  
  /** Saving state toggle */
  deductBreakSaving: boolean;
  
  /** Handler toggle deduct_break */
  onDeductBreakChange: (shiftId: string, newValue: boolean) => void;
  /** Attiva/detrazione per singola regola pausa (id regola) */
  onDeductPerRuleChange?: (shiftId: string, ruleId: string, applyDeduction: boolean) => void;
  /** Regole con detrazione disattivata (stesso set del turno) */
  deductExcludedRuleIds?: string[] | null;

  /** Pausa automatica (≥6h) — solo se non ci sono regole admin (Timesheets) */
  showAutoBreakSubToggle?: boolean;
  autoSubChecked?: boolean;
  onAutoBreakChange?: (shiftId: string, on: boolean) => void;
  /** Righe sotto l’interruttore: pranzo/cena/unica (≥6h) */
  autoBreakSubLineItems?: { title: string; minutes: number }[];
  /** Minuti se non ci sono righe (fallback) */
  defaultAutoBreakMinutes?: number;
  
  /** Funzione helper: formatta minuti → "Xh Ym" */
  fmtHM: (mins: number) => string;
  
  /** Funzione helper: formatta detrazione pausa "Xm" */
  fmtBreakDeductionShort: (mins: number) => string;
  
  /** Funzione helper: label sorgente timbratura */
  punchSourceLabel: (source: PunchRecordSource | null | undefined, t: Record<string, string>) => string;
  
  /** Traduzione */
  t: Record<string, string>;
  tv: Record<string, string>;
  
  /** Voci sotto l’interruttore; `ruleId` se da regole admin (interruttori per riga) */
  deductBreakLineItems?: { title: string; minutes: number; ruleId?: string }[];
}

/**
 * Cards riepilogo ore turno: pianificato vs timbrato + toggle "Deduci pausa".
 * 
 * Estratto da Timesheets.tsx (righe 4908-5080) per ridurre complessità drawer.
 */
export function ShiftHoursCards({
  shift: s,
  fullShift,
  plannedCardBoxClass: _plannedCardBoxClass,
  plannedCardLabelCls: _plannedCardLabelCls,
  plannedCardMainCls: _plannedCardMainCls,
  plannedCardSubCls: _plannedCardSubCls,
  deltaColor: _deltaColor,
  isEmployeeWeekReviewSheet,
  canTeamTimesheetOps,
  isFrozen,
  isAbsent,
  deductBreakSaving,
  onDeductBreakChange,
  onDeductPerRuleChange,
  deductExcludedRuleIds,
  showAutoBreakSubToggle = false,
  autoSubChecked = false,
  onAutoBreakChange,
  autoBreakSubLineItems,
  defaultAutoBreakMinutes = 30,
  fmtHM,
  fmtBreakDeductionShort,
  punchSourceLabel,
  t,
  tv,
  deductBreakLineItems,
}: ShiftHoursCardsProps) {
  const ruleExclusion = new Set(deductExcludedRuleIds ?? []);
  const excludedRuleIdsMerged = new Set<string>([
    ...(deductExcludedRuleIds ?? []),
    ...(Array.isArray(fullShift?.deduct_excluded_rule_ids) ? fullShift.deduct_excluded_rule_ids : []),
  ]);
  const frozenDeductLineItems = (deductBreakLineItems ?? []).filter(
    (it) => !it.ruleId || !excludedRuleIdsMerged.has(it.ruleId)
  );
  const frozenReadoutLines =
    frozenDeductLineItems.length > 0
      ? frozenDeductLineItems
      : fullShift != null &&
          (fullShift.break_minutes ?? 0) > 0 &&
          fullShift.approved_at
        ? [{ title: t.ts_deduct_break_from_shift, minutes: fullShift.break_minutes as number }]
        : [];
  const hasPerRuleSwitches = !!(
    onDeductPerRuleChange &&
    fullShift &&
    (deductBreakLineItems?.some((it) => Boolean(it.ruleId)) ?? false)
  );
  return (
    <div className="border-b border-white/10 px-5 py-7 sm:px-6 sm:py-8 shrink-0">
      <div className="mb-6 grid grid-cols-2 gap-6 items-stretch">
        {/* Card Pianificato (GLASSMORPHISM PREMIUM) */}
        <div className="rounded-2xl min-h-[130px] px-4 py-4"
          style={{ 
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.3)',
          }}
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/50">{t.ts_label_planned}</p>
          <div className="flex items-start gap-1.5">
            {(s.status === 'confirmed' || s.status === 'approved') && (
              <span className="shrink-0 mt-0.5">
                {s.status === 'approved' && (
                  <span className="text-base text-emerald-400">✓</span>
                )}
              </span>
            )}
            <div className="min-w-0">
              <p className="text-[1.15rem] font-bold tabular-nums leading-tight text-white" style={{ letterSpacing: '-0.02em' }}>
                {s.plannedStart}–{s.plannedEnd}
              </p>
              <p className="mt-1.5 text-sm font-medium text-white/65">
                {fmtHM(s.plannedMins)}
                {s.breakMinutes > 0 ? (
                  <span className="opacity-70">
                    {' '}(−{fmtBreakDeductionShort(s.breakMinutes)})
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        </div>
        
        {/* Card Timbrato (GLASSMORPHISM PREMIUM) */}
        <div
          className={`px-4 py-4 min-h-[130px] rounded-2xl ${
 s.punched && s.isCrossDay
 ? 'bg-red-500/10'
 : s.punched
 ? ''
 : 'bg-white/4 animate-pulse'
 }`}
          style={s.punched && !s.isCrossDay ? { 
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.3)',
          } : {
            border: '1px solid var(--border-color)',
            boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.25)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/50">{t.ts_label_punched}</p>
            {(s.punched && !s.actualEnd) || !s.punched ? (
              <span className="flex h-2 w-2 rounded-full bg-white animate-pulse" title={t.data_missing} />
            ) : null}
          </div>
          {s.punched ? (
            <>
              <p className="text-[1.15rem] font-bold tabular-nums leading-tight text-white" style={{ letterSpacing: '-0.02em' }}>
                {s.actualStart}
                {s.actualEnd ? `–${s.actualEnd}` : ''}
              </p>
              {s.isCrossDay && s.actualEndFull && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-300">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
                  {formatTrans(t.ts_crossday_out_label, {
                    time: format(new Date(s.actualEndFull), 'dd/MM HH:mm'),
                  })}
                </p>
              )}
              {s.nightRolloverOk && s.actualEndFull && (
                <p className="mt-2 text-xs font-medium text-white/60">
                  {formatTrans(t.ts_punch_out_next_calendar_day_hint, {
                    time: format(new Date(s.actualEndFull), 'dd/MM HH:mm'),
                  })}
                </p>
              )}
              <p
                className="mt-2 text-sm font-medium text-white/75"
              >
                {s.isCrossDay ? (
                  <>
                    {t.ts_fix_exit_time_label}
                    {s.breakMinutes > 0 ? (
                      <span className="mt-1 block font-medium text-white/60">
                        −{fmtBreakDeductionShort(s.breakMinutes)}
                      </span>
                    ) : null}
                  </>
                ) : s.actualMins > 0 ? (
                  <>
                    {s.breakMinutesActual > 0
                      ? `${fmtHM(s.actualMins)} (−${fmtBreakDeductionShort(s.breakMinutesActual)})`
                      : `${fmtHM(s.actualMins)} (${s.deltaMins >= 0 ? '+' : ''}${fmtHM(s.deltaMins)})`}
                  </>
                ) : (
                  <>
                    {t.ts_out_missing_short}
                    {s.breakMinutes > 0 ? (
                      <span className="mt-1 block font-medium text-white/60">
                        −{fmtBreakDeductionShort(s.breakMinutes)}
                      </span>
                    ) : null}
                  </>
                )}
              </p>
              <div className="mt-2 space-y-0.5 border-t border-neutral-500 pt-2">
                <p className="text-[11px] leading-snug text-white/55">
                  <span className="font-semibold text-white/45">{t.ts_punch_source_row_in}</span>{' '}
                  {punchSourceLabel(s.punchInSource, t)}
                </p>
                {s.actualEnd ? (
                  <p className="text-[11px] leading-snug text-white/55">
                    <span className="font-semibold text-white/45">{t.ts_punch_source_row_out}</span>{' '}
                    {punchSourceLabel(s.punchOutSource, t)}
                  </p>
                ) : null}
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold text-amber-200">{t.ts_status_unpunched}</p>
              {s.breakMinutes > 0 ? (
                <p className="text-[11px] font-semibold text-white/60">
                  −{fmtBreakDeductionShort(s.breakMinutes)}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Congelato: solo lettura — stesse voci del netto (esclude ruleId in deduct_excluded_rule_ids) */}
      {!isEmployeeWeekReviewSheet &&
        isFrozen &&
        fullShift &&
        fullShift.deduct_break !== false &&
        !isAbsent &&
        frozenReadoutLines.length > 0 && (
        <div className="mt-5 space-y-2 rounded-xl border border-white/12 bg-white/6 px-3 py-3">
          <p className="text-xs font-semibold text-white/85">{t.deduct_break_label}</p>
          {frozenReadoutLines.length > 1 ? (
            <p className="text-[11px] leading-snug text-white/50">{t.wst_drawer_breaks_deducted_list_intro}</p>
          ) : null}
          <ul className="list-none space-y-1.5 pl-0">
            {frozenReadoutLines.map((it) => (
              <li
                key={`${it.title}-${it.minutes}-${it.ruleId ?? ''}`}
                className="flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] tabular-nums text-white/75"
              >
                <span className="font-medium text-white/85">{it.title}</span>
                <span>−{fmtBreakDeductionShort(it.minutes)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Toggles: detrazione pausa + (opz.) pausa automatica ≥6h */}
      {!isEmployeeWeekReviewSheet &&
        fullShift &&
        canTeamTimesheetOps &&
        !isFrozen &&
        !isAbsent && (
        <div className="mt-5 space-y-3">
        <div>
        <label
          className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 transition-colors ${
 deductBreakSaving ? 'pointer-events-none opacity-50' : ''
 } ${
 fullShift.deduct_break !== false
 ? 'border-white/20 bg-white/8 hover:bg-white/12'
 : 'border-white/12 bg-white/5 hover:bg-white/8'
 }`}
        >
          <div className="relative shrink-0 mt-0.5">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={fullShift.deduct_break !== false}
              disabled={deductBreakSaving}
              onChange={() => onDeductBreakChange(s.id, !(fullShift.deduct_break !== false))}
            />
            <div className={`h-5 w-9 rounded-full transition-colors duration-200 ${fullShift.deduct_break !== false ? 'bg-accent' : 'bg-white/20'}`} />
            <div
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
 fullShift.deduct_break !== false ? 'translate-x-4' : 'translate-x-0'
 }`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-xs font-semibold ${fullShift.deduct_break !== false ? 'text-white' : 'text-white/70'}`}>{t.deduct_break_label}</p>
            {fullShift.deduct_break === false ? (
              <p className="mt-0.5 text-[11px] leading-snug text-white/50">
                {tv.wst_create_shift_no_deduct_badge}
              </p>
            ) : null}
          </div>
        </label>
        {fullShift.deduct_break !== false ? (
          hasPerRuleSwitches && deductBreakLineItems && deductBreakLineItems.length > 0 ? (
            <div className="mt-2 space-y-2 pl-[2.75rem] pr-1">
              {deductBreakLineItems.length > 1 ? (
                <p className="text-[11px] leading-snug text-white/50">{t.wst_drawer_breaks_deducted_list_intro}</p>
              ) : null}
              <div className="space-y-2">
                {deductBreakLineItems.map((it) =>
                  it.ruleId && onDeductPerRuleChange ? (
                    <label
                      key={it.ruleId}
                      htmlFor={`wst-deduct-rule-${s.id}-${it.ruleId}`}
                      aria-label={it.title}
                      className={`flex min-h-[40px] cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
 deductBreakSaving ? 'pointer-events-none opacity-50' : ''
 } ${
 !ruleExclusion.has(it.ruleId)
 ? 'border-white/18 bg-white/6 hover:bg-white/10'
 : 'border-white/10 bg-white/4 hover:bg-white/7'
 }`}
                    >
                      <div className="relative shrink-0">
                        <input
                          id={`wst-deduct-rule-${s.id}-${it.ruleId}`}
                          type="checkbox"
                          className="peer sr-only"
                          checked={!ruleExclusion.has(it.ruleId)}
                          disabled={deductBreakSaving}
                          onChange={() =>
                            it.ruleId != null &&
                            onDeductPerRuleChange(s.id, it.ruleId, ruleExclusion.has(it.ruleId))
                          }
                        />
                        <div
                          className={`h-5 w-9 rounded-full transition-colors duration-200 ${
 !ruleExclusion.has(it.ruleId) ? 'bg-accent' : 'bg-white/20'
 }`}
                        />
                        <div
                          className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
 !ruleExclusion.has(it.ruleId) ? 'translate-x-4' : 'translate-x-0'
 }`}
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2 tabular-nums">
                        <span
                          className={`text-[11px] font-medium ${
 !ruleExclusion.has(it.ruleId) ? 'text-white/85' : 'text-white/45 line-through'
 }`}
                        >
                          {it.title}
                        </span>
                        <span
                          className={`text-[11px] ${!ruleExclusion.has(it.ruleId) ? 'text-white/70' : 'text-white/35'}`}
                        >
                          −{fmtBreakDeductionShort(it.minutes)}
                        </span>
                      </div>
                    </label>
                  ) : (
                    <div
                      key={`${it.title}-${it.minutes}`}
                      className="flex flex-wrap items-baseline justify-between gap-x-2 pl-1 text-[11px] tabular-nums text-white/70"
                    >
                      <span className="font-medium text-white/80">{it.title}</span>
                      <span>−{fmtBreakDeductionShort(it.minutes)}</span>
                    </div>
                  )
                )}
              </div>
            </div>
          ) : (deductBreakLineItems && deductBreakLineItems.length > 1) ? (
            <div className="mt-2 space-y-1.5 pl-[2.75rem] text-[11px] leading-snug text-white/50 pr-1">
              <p>{t.wst_drawer_breaks_deducted_list_intro}</p>
              <ul className="list-none space-y-0.5 pl-0 text-white/70">
                {deductBreakLineItems.map((it) => (
                  <li key={`${it.title}-${it.minutes}`} className="flex flex-wrap items-baseline justify-between gap-x-2 tabular-nums">
                    <span className="font-medium text-white/80">{it.title}</span>
                    <span>−{fmtBreakDeductionShort(it.minutes)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (deductBreakLineItems && deductBreakLineItems.length === 1) ? (
            <div className="mt-2 space-y-0.5 pl-[2.75rem] text-[11px] leading-snug text-white/50 pr-1">
              <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-white/75 tabular-nums">
                <span className="font-medium text-white/85">{deductBreakLineItems[0].title}</span>
                <span>−{fmtBreakDeductionShort(deductBreakLineItems[0].minutes)}</span>
              </p>
              <p className="text-white/50">{tv.wst_drawer_break_deducted_readout}</p>
            </div>
          ) : !autoSubChecked && showAutoBreakSubToggle ? (
            <p className="mt-2 pl-[2.75rem] text-[11px] leading-snug text-white/45 pr-1">
              {t.ts_subtoggle_second_off_readout}
            </p>
          ) : (
            <p className="mt-2 pl-[2.75rem] text-[11px] leading-snug text-white/50 pr-1">
              {tv.wst_drawer_break_deducted_readout}
            </p>
          )
        ) : null}
        </div>
        {showAutoBreakSubToggle &&
          fullShift.deduct_break !== false &&
          onAutoBreakChange && (
          <label
            className={`flex min-h-[44px] cursor-pointer items-center gap-2.5 rounded-xl border-2 px-3 py-2.5 transition-colors ${
 deductBreakSaving ? 'pointer-events-none opacity-50' : ''
 } ${
 autoSubChecked
 ? 'border-white/20 bg-white/8 hover:bg-white/12'
 : 'border-white/12 bg-white/5 hover:bg-white/8'
 }`}
          >
            <div className="relative shrink-0 mt-0.5">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={autoSubChecked}
                disabled={deductBreakSaving}
                onChange={() => onAutoBreakChange(s.id, !autoSubChecked)}
              />
              <div className={`h-5 w-9 rounded-full transition-colors duration-200 ${autoSubChecked ? 'bg-accent' : 'bg-white/20'}`} />
              <div
                className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
 autoSubChecked ? 'translate-x-4' : 'translate-x-0'
 }`}
              />
            </div>
            <div className="min-w-0 flex-1">
              {autoBreakSubLineItems && autoBreakSubLineItems.length > 0 ? (
                <ul className="list-none space-y-1">
                  {autoBreakSubLineItems.map((it) => (
                    <li
                      key={`${it.title}-${it.minutes}`}
                      className={`flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-semibold tabular-nums ${
 autoSubChecked ? 'text-white' : 'text-white/70'
 }`}
                    >
                      <span className="min-w-0 font-semibold text-left">{it.title}</span>
                      <span>−{fmtBreakDeductionShort(it.minutes)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  className={`flex flex-wrap items-baseline gap-x-1.5 text-xs font-semibold ${
 autoSubChecked ? 'text-white' : 'text-white/70'
 }`}
                >
                  <span>{t.ts_deduct_break_auto}</span>
                  <span className="tabular-nums">−{fmtBreakDeductionShort(defaultAutoBreakMinutes)}</span>
                </p>
              )}
              <p className="mt-0.5 text-[11px] leading-snug text-white/50">
                {tv.wst_drawer_auto_break_hint}
              </p>
            </div>
          </label>
        )}
        </div>
      )}
    </div>
  );
}
