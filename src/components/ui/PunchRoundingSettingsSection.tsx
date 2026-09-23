/**
 * Sezione Impostazioni — Arrotondamento degli orari di timbratura.
 *
 * Permette all'Admin di configurare soglie, direzione, orari di riferimento ed
 * eccezioni dell'arrotondamento, con salvataggio su cloud (`app-config`), reset ai
 * valori predefiniti e anteprima su un orario di esempio.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, RotateCcw } from 'lucide-react';
import { useAppConfig, useAppOverlay, useAppUser } from '../../context/AppContext';
import { useT } from '../../hooks/useT';
import { formatTrans } from '../../utils/translations';
import {
  DEFAULT_PUNCH_ROUNDING_RULES,
  ROUNDING_STEP_MAX,
  ROUNDING_STEP_MIN,
  ROUNDING_STEP_PRESETS,
  previewPunchRounding,
  sanitizePunchRoundingRules,
  validatePunchRoundingRules,
  type PunchRoundingRules,
  type RoundingAnchor,
  type RoundingDirection,
  type RoundingPreviewResult,
} from '../../utils/punchRoundingRules';
import { translateRole } from '../../utils/roles';
import { getDepartments } from '../../utils/departments';
import { translateDepartmentValue } from '../../utils/departmentLabels';
import type { UserRole } from '../../types';
import { SettingsAccordionSection } from './SettingsAccordionSection';
import ToggleSwitch from './toggle-switch-glass';
import { GradientIconButton } from './GradientIconButton';

const ROUNDING_ROLES: UserRole[] = [
  'admin',
  'manager',
  'assistant_manager',
  'waiter',
  'server',
  'bartender',
  'cook',
  'chef',
  'dishwasher',
];

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Esempio di turno e di orari reali usato per l'anteprima dentro le card. */
const PREVIEW_SHIFT_START = '18:00';
const PREVIEW_SHIFT_END = '23:00';
const PREVIEW_IN_TIME = '18:07';
const PREVIEW_OUT_TIME = '23:07';

const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-white/55';
const cardClass = 'space-y-3 rounded-xl border border-white/[0.14] bg-white/5 p-3';

function chipClass(active: boolean): string {
  return `cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
    active
      ? 'border border-white/60 bg-white/25 text-white'
      : 'border border-white/20 text-white/70 hover:border-white/45 hover:bg-white/10 hover:text-white'
  }`;
}

function toStep(value: string): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : 0;
}

function StepPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ROUNDING_STEP_PRESETS.map((s) => (
        <button key={s} type="button" onClick={() => onChange(s)} className={chipClass(value === s)}>
          {s}′
        </button>
      ))}
      <input
        type="number"
        min={ROUNDING_STEP_MIN}
        max={ROUNDING_STEP_MAX}
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(toStep(e.target.value))}
        aria-label={t.settings_rounding_step_custom}
        className="w-16 rounded-xl border border-white/20 bg-white/10 px-2 py-1 text-center text-sm font-semibold text-white transition-colors focus:border-accent focus:outline-none"
      />
    </div>
  );
}

function DirectionPicker({ value, onChange }: { value: RoundingDirection; onChange: (v: RoundingDirection) => void }) {
  const t = useT();
  const options: Array<{ value: RoundingDirection; label: string }> = [
    { value: 'up', label: t.settings_rounding_dir_up },
    { value: 'down', label: t.settings_rounding_dir_down },
    { value: 'nearest', label: t.settings_rounding_dir_nearest },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={chipClass(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AnchorPicker({ value, onChange }: { value: RoundingAnchor; onChange: (v: RoundingAnchor) => void }) {
  const t = useT();
  const options: Array<{ value: RoundingAnchor; label: string }> = [
    { value: 'shiftStart', label: t.settings_rounding_anchor_shift_start },
    { value: 'shiftEnd', label: t.settings_rounding_anchor_shift_end },
    { value: 'midnight', label: t.settings_rounding_anchor_midnight },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={chipClass(value === o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function InlinePreview({
  label,
  result,
  message,
}: {
  label: string;
  result: RoundingPreviewResult;
  message: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-[0.6875rem] font-bold uppercase tracking-wider text-white/40">{label}</span>
        <span className="text-sm font-bold text-white/50 line-through">{result.rawHHMM}</span>
        <span className="text-white/40">→</span>
        <span className="text-sm font-bold text-white">{result.effectiveHHMM}</span>
      </div>
      <p className="mt-0.5 text-[0.6875rem] leading-snug text-white/60">{message}</p>
    </div>
  );
}

export function PunchRoundingSettingsSection() {
  const t = useT();
  const { effectiveLanguage } = useAppUser();
  const { punchRoundingRules, setPunchRoundingRules } = useAppConfig();
  const { showSuccess, showError } = useAppOverlay();

  const [draft, setDraft] = useState<PunchRoundingRules>(() => sanitizePunchRoundingRules(punchRoundingRules));
  const [activeTab, setActiveTab] = useState<'rules' | 'exceptions'>('rules');

  useEffect(() => {
    setDraft(sanitizePunchRoundingRules(punchRoundingRules));
  }, [punchRoundingRules]);

  const issues = useMemo(() => validatePunchRoundingRules(draft), [draft]);
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(sanitizePunchRoundingRules(punchRoundingRules)),
    [draft, punchRoundingRules]
  );

  const setClockIn = (patch: Partial<PunchRoundingRules['clockIn']>) =>
    setDraft((d) => ({ ...d, clockIn: { ...d.clockIn, ...patch } }));
  const setClockOut = (patch: Partial<PunchRoundingRules['clockOut']>) =>
    setDraft((d) => ({ ...d, clockOut: { ...d.clockOut, ...patch } }));
  const setBreakStart = (patch: Partial<PunchRoundingRules['breakStart']>) =>
    setDraft((d) => ({ ...d, breakStart: { ...d.breakStart, ...patch } }));
  const setBreakEnd = (patch: Partial<PunchRoundingRules['breakEnd']>) =>
    setDraft((d) => ({ ...d, breakEnd: { ...d.breakEnd, ...patch } }));

  const toggleIn = <T,>(arr: T[], val: T): T[] => (arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

  const handleSave = async () => {
    if (issues.length > 0) {
      showError?.(issues[0].message);
      return;
    }
    await setPunchRoundingRules(draft);
    showSuccess?.(t.settings_rounding_saved);
  };

  const handleReset = () => {
    if (!window.confirm(t.settings_rounding_reset_confirm)) return;
    setDraft(sanitizePunchRoundingRules(DEFAULT_PUNCH_ROUNDING_RULES));
    showSuccess?.(t.settings_rounding_reset_done);
  };

  const directionLabel = useCallback(
    (d: RoundingDirection) =>
      d === 'up' ? t.settings_rounding_dir_up : d === 'down' ? t.settings_rounding_dir_down : t.settings_rounding_dir_nearest,
    [t]
  );

  const subtitle = useMemo(() => {
    if (!punchRoundingRules.enabled) return t.settings_rounding_subtitle_off;
    const parts: string[] = [];
    if (punchRoundingRules.clockIn.enabled) {
      parts.push(`${t.settings_rounding_clock_in} ${punchRoundingRules.clockIn.stepMinutes}′ ${directionLabel(punchRoundingRules.clockIn.direction)}`);
    }
    if (punchRoundingRules.clockOut.enabled) {
      parts.push(`${t.settings_rounding_clock_out} ${punchRoundingRules.clockOut.stepMinutes}′ ${directionLabel(punchRoundingRules.clockOut.direction)}`);
    }
    return parts.length > 0 ? parts.join(' · ') : t.settings_rounding_subtitle_off;
  }, [punchRoundingRules, t, directionLabel]);

  const weekdayOptions = useMemo(
    () =>
      WEEKDAY_ORDER.map((value) => ({
        value,
        label: t[`settings_weekday_short_${value}` as keyof typeof t] as string,
      })),
    [t]
  );

  /* Ruoli raggruppati per etichetta tradotta: waiter+server → "Cameriere", cook+chef → "Cuoco".
     Un solo chip per gruppo; selezionarlo attiva tutti i codici del gruppo. */
  const roleGroups = useMemo(() => {
    const byLabel = new Map<string, string[]>();
    for (const code of ROUNDING_ROLES) {
      const label = translateRole(code, effectiveLanguage);
      const group = byLabel.get(label) ?? [];
      group.push(code);
      byLabel.set(label, group);
    }
    return Array.from(byLabel.values());
  }, [effectiveLanguage]);

  const shiftDate = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, []);

  /**
   * Anteprima "come se fosse attiva": l'interruttore generale e quello della regola
   * vengono forzati a ON, così il risultato è visibile anche mentre l'arrotondamento
   * è disattivato. `isActive` dice se nella configurazione corrente si applicherebbe.
   */
  const isActive = (type: 'in' | 'out') =>
    draft.enabled && (type === 'in' ? draft.clockIn.enabled : draft.clockOut.enabled);

  const previewIn = useMemo(
    () =>
      previewPunchRounding({
        rules: { ...draft, enabled: true, clockIn: { ...draft.clockIn, enabled: true } },
        type: 'in',
        timeHHMM: PREVIEW_IN_TIME,
        shiftDate,
        shiftStart: PREVIEW_SHIFT_START,
        shiftEnd: PREVIEW_SHIFT_END,
      }),
    [draft, shiftDate]
  );

  const previewOut = useMemo(
    () =>
      previewPunchRounding({
        rules: { ...draft, enabled: true, clockOut: { ...draft.clockOut, enabled: true } },
        type: 'out',
        timeHHMM: PREVIEW_OUT_TIME,
        shiftDate,
        shiftStart: PREVIEW_SHIFT_START,
        shiftEnd: PREVIEW_SHIFT_END,
      }),
    [draft, shiftDate]
  );

  const explainPreview = useCallback(
    (p: RoundingPreviewResult, active: boolean): string => {
      let message: string;
      if (p.skippedReason === 'exception') message = t.settings_rounding_prev_exception;
      else if (!p.rounded) message = formatTrans(t.settings_rounding_prev_aligned, { time: p.effectiveHHMM });
      else
        message = formatTrans(t.settings_rounding_prev_rounded, {
          delta: `${p.deltaMinutes > 0 ? '+' : ''}${p.deltaMinutes}`,
          step: p.appliedRule?.stepMinutes ?? 0,
          direction: p.appliedRule ? directionLabel(p.appliedRule.direction) : '',
        });
      return active ? message : `${message} · ${t.settings_rounding_prev_inactive}`;
    },
    [t, directionLabel]
  );

  const tabOptions = [
    { id: 'rules' as const, label: t.settings_rounding_tab_rules },
    { id: 'exceptions' as const, label: t.settings_rounding_tab_exceptions },
  ];

  return (
    <SettingsAccordionSection
      storageKey="osteria_settings_acc_punch_rounding"
      title={t.settings_rounding_section}
      subtitle={subtitle}
      defaultOpen={false}
      attached
    >
      {/* Tab + azioni */}
      <div className="m-3 flex items-center gap-1 rounded-xl border border-white/20 bg-white/10 p-1">
        {tabOptions.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${
              activeTab === tab.id ? 'bg-white/25 text-white' : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <div className="mx-1 h-5 w-px shrink-0 bg-white/20" aria-hidden />
        <GradientIconButton
          label={t.settings_rounding_reset}
          onClick={handleReset}
          gradientFrom="#94a3b8"
          gradientTo="#475569"
          className="rounded-lg bg-white/20 p-2 text-white/70 hover:bg-white/30 hover:text-white"
        >
          <RotateCcw className="h-4 w-4 shrink-0" />
        </GradientIconButton>
        <GradientIconButton
          label={t.settings_rounding_save}
          onClick={() => void handleSave()}
          gradientFrom="#94a3b8"
          gradientTo="#475569"
          className={`rounded-lg p-2 text-white transition-colors ${
            issues.length > 0 ? 'bg-white/10 text-white/40' : 'bg-white/25 hover:bg-white/35'
          }`}
        >
          <Check className="h-4 w-4 shrink-0" />
        </GradientIconButton>
      </div>

      {issues.length > 0 && (
        <p className="mx-3 mb-3 text-[0.6875rem] font-semibold text-amber-400">{issues[0].message}</p>
      )}
      {dirty && issues.length === 0 && (
        <p className="mx-3 mb-3 text-[0.6875rem] font-semibold text-white/50">{t.settings_rounding_unsaved}</p>
      )}

      <div className="px-3 pb-3">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 30, stiffness: 380 }}
          >
            {activeTab === 'rules' && (
              <div className="space-y-3">
                {/* Interruttore generale */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.14] bg-white/5 p-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white/80">{t.settings_rounding_master_label}</p>
                    <p className="mt-0.5 text-[0.6875rem] leading-snug text-white/55">
                      {draft.enabled ? t.settings_rounding_master_hint_on : t.settings_rounding_master_hint_off}
                    </p>
                  </div>
                  <ToggleSwitch
                    isActive={draft.enabled}
                    onChange={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
                    size="sm"
                    darkMode
                    className="flex-shrink-0"
                  />
                </div>

                {/* Entrata */}
                <div className={cardClass}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/80">{t.settings_rounding_clock_in}</p>
                    <ToggleSwitch
                      isActive={draft.clockIn.enabled}
                      onChange={() => setClockIn({ enabled: !draft.clockIn.enabled })}
                      size="sm"
                      darkMode
                      className="flex-shrink-0"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t.settings_rounding_step_label}</label>
                    <StepPicker value={draft.clockIn.stepMinutes} onChange={(v) => setClockIn({ stepMinutes: v })} />
                  </div>
                  <div>
                    <label className={labelClass}>{t.settings_rounding_direction_label}</label>
                    <DirectionPicker value={draft.clockIn.direction} onChange={(v) => setClockIn({ direction: v })} />
                  </div>
                  <div>
                    <label className={labelClass}>{t.settings_rounding_anchor_label}</label>
                    <AnchorPicker value={draft.clockIn.anchor} onChange={(v) => setClockIn({ anchor: v })} />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-2">
                    <div className="min-w-0">
                      <p className="text-[0.75rem] font-semibold text-white/80">{t.settings_rounding_never_before}</p>
                      <p className="mt-0.5 text-[0.6875rem] leading-snug text-white/55">{t.settings_rounding_never_before_hint}</p>
                    </div>
                    <ToggleSwitch
                      isActive={draft.clockIn.neverBeforeShiftStart}
                      onChange={() => setClockIn({ neverBeforeShiftStart: !draft.clockIn.neverBeforeShiftStart })}
                      size="sm"
                      darkMode
                      className="flex-shrink-0"
                    />
                  </div>
                  <InlinePreview
                    label={t.settings_rounding_preview_result}
                    result={previewIn}
                    message={explainPreview(previewIn, isActive('in'))}
                  />
                </div>

                {/* Uscita */}
                <div className={cardClass}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-white/80">{t.settings_rounding_clock_out}</p>
                    <ToggleSwitch
                      isActive={draft.clockOut.enabled}
                      onChange={() => setClockOut({ enabled: !draft.clockOut.enabled })}
                      size="sm"
                      darkMode
                      className="flex-shrink-0"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t.settings_rounding_step_label}</label>
                    <StepPicker value={draft.clockOut.stepMinutes} onChange={(v) => setClockOut({ stepMinutes: v })} />
                  </div>
                  <div>
                    <label className={labelClass}>{t.settings_rounding_direction_label}</label>
                    <DirectionPicker value={draft.clockOut.direction} onChange={(v) => setClockOut({ direction: v })} />
                  </div>
                  <div>
                    <label className={labelClass}>{t.settings_rounding_anchor_label}</label>
                    <AnchorPicker value={draft.clockOut.anchor} onChange={(v) => setClockOut({ anchor: v })} />
                  </div>
                  <InlinePreview
                    label={t.settings_rounding_preview_result}
                    result={previewOut}
                    message={explainPreview(previewOut, isActive('out'))}
                  />
                </div>

                {/* Finestra pausa */}
                <div className={cardClass}>
                  <p className="text-xs font-bold uppercase tracking-wider text-white/80">{t.settings_rounding_break_window}</p>
                  <p className="text-[0.6875rem] leading-snug text-white/55">{t.settings_rounding_break_hint}</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.75rem] font-semibold text-white/80">{t.settings_rounding_break_start}</span>
                        <ToggleSwitch
                          isActive={draft.breakStart.enabled}
                          onChange={() => setBreakStart({ enabled: !draft.breakStart.enabled })}
                          size="sm"
                          darkMode
                          className="flex-shrink-0"
                        />
                      </div>
                      <StepPicker value={draft.breakStart.stepMinutes} onChange={(v) => setBreakStart({ stepMinutes: v })} />
                      <DirectionPicker value={draft.breakStart.direction} onChange={(v) => setBreakStart({ direction: v })} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[0.75rem] font-semibold text-white/80">{t.settings_rounding_break_end}</span>
                        <ToggleSwitch
                          isActive={draft.breakEnd.enabled}
                          onChange={() => setBreakEnd({ enabled: !draft.breakEnd.enabled })}
                          size="sm"
                          darkMode
                          className="flex-shrink-0"
                        />
                      </div>
                      <StepPicker value={draft.breakEnd.stepMinutes} onChange={(v) => setBreakEnd({ stepMinutes: v })} />
                      <DirectionPicker value={draft.breakEnd.direction} onChange={(v) => setBreakEnd({ direction: v })} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'exceptions' && (
              <div className="space-y-3">
                <p className="rounded-xl border border-white/[0.14] bg-white/5 p-3 text-[0.6875rem] leading-snug text-white/55">
                  {t.settings_rounding_exceptions_hint}
                </p>

                <div>
                  <label className={labelClass}>{t.settings_rounding_exc_weekdays}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {weekdayOptions.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            exceptions: { ...prev.exceptions, weekdays: toggleIn(prev.exceptions.weekdays, d.value) },
                          }))
                        }
                        className={chipClass(draft.exceptions.weekdays.includes(d.value))}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 flex items-baseline gap-1 text-xs font-semibold uppercase tracking-wide text-white/55">
                    {t.settings_rounding_exc_roles}
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap font-normal normal-case tracking-normal text-white/40">
                      {t.settings_break_none_means_all}
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {roleGroups.map((codes) => {
                      const selected = codes.every((c) => draft.exceptions.roles.includes(c));
                      return (
                        <button
                          key={codes.join(',')}
                          type="button"
                          onClick={() =>
                            setDraft((prev) => {
                              const without = prev.exceptions.roles.filter((r) => !codes.includes(r));
                              return {
                                ...prev,
                                exceptions: {
                                  ...prev.exceptions,
                                  roles: selected ? without : [...without, ...codes],
                                },
                              };
                            })
                          }
                          title={codes.join(', ')}
                          className={chipClass(selected)}
                        >
                          {translateRole(codes[0], effectiveLanguage)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 flex items-baseline gap-1 text-xs font-semibold uppercase tracking-wide text-white/55">
                    {t.settings_rounding_exc_departments}
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap font-normal normal-case tracking-normal text-white/40">
                      {t.settings_break_none_means_all}
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {getDepartments().map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            exceptions: { ...prev.exceptions, departments: toggleIn(prev.exceptions.departments, d.value) },
                          }))
                        }
                        className={chipClass(draft.exceptions.departments.includes(d.value))}
                      >
                        {translateDepartmentValue(d.value, effectiveLanguage)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </SettingsAccordionSection>
  );
}

export default PunchRoundingSettingsSection;
