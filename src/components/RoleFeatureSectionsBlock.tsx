import { useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  ROLE_TEMPLATE_FEATURE_SECTIONS,
  ROLE_TEMPLATE_TAB_SHEET_GROUPS,
  roleTemplateSectionTitleKey,
  featureKeyTemplateSection,
  isFeatureKeyInTabSheetGroups,
  FEATURE_LABELS,
  FEATURE_LABELS_TAB_FIRST,
  type EnabledFeatureKey,
  type EnabledFeatures,
  type RoleTemplateSectionId,
  type RoleTemplateTabSheetGroupId,
} from '../utils/enabledFeatures';
import { getTranslations } from '../utils/translations';
import type { Language } from '../types';
import AdminRow from './ui/AdminRow';

/** Liste permessi: niente overflow-hidden sul contenitore (evita tagli verticali su testi lunghi). */
export const PERMISSION_SUMMARY_LIST_CLASS =
  'space-y-0 rounded-xl border border-slate-200/90 bg-white shadow-sm ring-1 ring-slate-100/70';

function rowLabel(sectionId: RoleTemplateSectionId, key: EnabledFeatureKey): string {
  if (sectionId === 'tabs_nav') return FEATURE_LABELS_TAB_FIRST[key];
  return FEATURE_LABELS[key];
}

type PropsBase = {
  features: EnabledFeatures;
  language: Language;
  /** Solo `mode: toggles'`: chiavi sempre attive, switch disabilitato (es. `home_tab`). */
  lockAlwaysOnFeatures?: readonly EnabledFeatureKey[];
};

type Props =
  | (PropsBase & {
      mode: 'toggles';
      onToggle: (key: EnabledFeatureKey) => void;
    })
  | (PropsBase & {
      mode: 'badges';
    });

export default function RoleFeatureSectionsBlock(props: Props) {
  const t = getTranslations(props.language);
  const tv = t as Record<string, string>;

  const [expandedTabs, setExpandedTabs] = useState<Partial<Record<RoleTemplateTabSheetGroupId, boolean>>>({});

  const toggleTabGroup = useCallback((id: RoleTemplateTabSheetGroupId) => {
    setExpandedTabs((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const renderFeatureRow = (key: EnabledFeatureKey) => {
    const sectionId = featureKeyTemplateSection(key);
    const lockedOn = props.mode === 'toggles' && props.lockAlwaysOnFeatures?.includes(key);
    const enabled = lockedOn ? true : props.features[key] === true;
    const label = rowLabel(sectionId, key);

    if (props.mode === 'badges') {
      return (
        <AdminRow
          key={key}
          className="!pl-8"
          label={<span className={enabled ? 'text-slate-800' : 'text-slate-600'}>{label}</span>}
          action={
            <span
              className={`shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                enabled ? 'bg-accent text-white shadow-sm' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {enabled ? (tv.role_template_yes ?? 'Sì') : (tv.role_template_no ?? 'No')}
            </span>
          }
        />
      );
    }

    const homeHint = key === 'home_tab' ? (tv.role_template_home_hint ?? '') : undefined;

    return (
      <AdminRow
        key={key}
        className="!pl-8"
        label={label}
        description={lockedOn ? homeHint : undefined}
        badge={
          lockedOn ? (
            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100 border border-slate-200 rounded-lg px-1.5 py-0.5">
              {tv.role_template_always_on ?? 'Sempre'}
            </span>
          ) : undefined
        }
        action={
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            disabled={lockedOn}
            aria-disabled={lockedOn}
            onClick={() => {
              if (lockedOn) return;
              props.onToggle(key);
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-accent/35 focus:ring-offset-2 ${
              lockedOn ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
            } ${enabled ? 'bg-accent' : 'bg-slate-200'}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                enabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        }
      />
    );
  };

  const renderTabSheetSection = () => {
    const sectionTitle = tv[roleTemplateSectionTitleKey('tabs_nav')] ?? 'tabs';

    if (props.mode === 'badges') {
      return (
        <div key="tab-sheets">
          <p className="ui-section-title mb-2">{sectionTitle}</p>
          <div className={PERMISSION_SUMMARY_LIST_CLASS}>
            {ROLE_TEMPLATE_TAB_SHEET_GROUPS.map((group) => (
              <div key={group.id} className="border-b border-gray-100 last:border-b-0">
                <div className="px-5 pt-3 pb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    {tv[group.titleKey] ?? group.id}
                  </span>
                </div>
                {group.keys.map((key) => renderFeatureRow(key))}
              </div>
            ))}
          </div>
        </div>
      );
    }

    return (
      <div key="tab-sheets">
        <p className="ui-section-title mb-2">{sectionTitle}</p>
        <div className={PERMISSION_SUMMARY_LIST_CLASS}>
          {ROLE_TEMPLATE_TAB_SHEET_GROUPS.map((group) => {
            const open = expandedTabs[group.id] === true;
            const panelId = `role-tab-sheet-panel-${group.id}`;
            const label = tv[group.titleKey] ?? group.id;
            return (
              <div key={group.id} className="border-b border-gray-100 last:border-b-0">
                <button
                  type="button"
                  id={`role-tab-sheet-trigger-${group.id}`}
                  aria-expanded={open}
                  aria-controls={panelId}
                  aria-label={`${tv.role_template_tab_expand_aria ?? ''} — ${label}`}
                  onClick={() => toggleTabGroup(group.id)}
                  className="flex w-full min-h-[56px] items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-gray-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-inset"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 font-bold leading-tight text-gray-900">{label}</span>
                </button>
                {open ? (
                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={`role-tab-sheet-trigger-${group.id}`}
                    className="border-t border-slate-100 bg-slate-50/40"
                  >
                    {group.keys.map((key) => renderFeatureRow(key))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderLegacySection = (section: (typeof ROLE_TEMPLATE_FEATURE_SECTIONS)[number]) => {
    const filteredRows = section.rows.filter((row) => !isFeatureKeyInTabSheetGroups(row.key));
    if (filteredRows.length === 0) return null;
    const titleKey = roleTemplateSectionTitleKey(section.id);
    const title = tv[titleKey] ?? titleKey;
    return (
      <div key={section.id}>
        <p className="ui-section-title mb-2">{title}</p>
        <div className={PERMISSION_SUMMARY_LIST_CLASS}>
          {filteredRows.map((row) => renderFeatureRow(row.key))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {renderTabSheetSection()}
      {ROLE_TEMPLATE_FEATURE_SECTIONS.map((section) => renderLegacySection(section))}
    </div>
  );
}
