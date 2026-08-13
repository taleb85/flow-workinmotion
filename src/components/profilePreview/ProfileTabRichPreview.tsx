import type { ReactNode } from 'react';
import type { User, Language } from '../../types';
import type { FeatureFlags } from '../../utils/featureFlags';
import type { AppNavTab } from '../../utils/enabledModules';
import { isStaffRequestsFeatureEnabled } from '../../utils/enabledModules';
import type { UiScreenWidgetDef } from '../../utils/uiScreenWidgets';
import { getTranslations } from '../../utils/translations';
import ManagementHomePreview from '../ManagementHomePreview';
import GenericWidgetsColumn from './GenericWidgetsColumn';
import StaffHomePreview from './StaffHomePreview';
import TurniMgmtPreview from './TurniMgmtPreview';
import StaffShiftsPreview from './StaffShiftsPreview';
import FerieMgmtPreview from './FerieMgmtPreview';
import StaffHolidaysPreview from './StaffHolidaysPreview';
import TimesheetTabPreview from './TimesheetTabPreview';
import StatisticsTabPreview from './StatisticsTabPreview';
import SettingsTabPreview, { GlobalPopupsPreview } from './SettingsTabPreview';

const OMIT_STAFF_HOME = 'staff_home';
const OMIT_STAFF_TURNI = 'staff_shifts';
const OMIT_STAFF_FERIE = 'staff_holidays';

export default function ProfileTabRichPreview({
  activeHubTab,
  isMgmt,
  layoutGroups,
  previewUser,
  language,
  isSelectedAdmin,
  featureFlags,
  onUiToggle,
  navLabel,
  children,
}: {
  activeHubTab: AppNavTab;
  isMgmt: boolean;
  layoutGroups: { groupKey: string; widgets: UiScreenWidgetDef[] }[];
  previewUser: User;
  language: Language;
  isSelectedAdmin: boolean;
  featureFlags?: FeatureFlags | null;
  onUiToggle: (key: string, visible: boolean) => void;
  navLabel: string;
  children?: ReactNode;
}) {
  const t = getTranslations(language);
  const tv = t as Record<string, string>;
  const gm = new Map(layoutGroups.map((g) => [g.groupKey, g] as const));

  const omitKeys = new Set<string>();
  if (activeHubTab === 'home' && isMgmt && gm.has('home_mgmt')) omitKeys.add('home_mgmt');
  if (activeHubTab === 'home' && !isMgmt && gm.has('staff_home')) omitKeys.add(OMIT_STAFF_HOME);
  if (activeHubTab === 'turni' && isMgmt && gm.has('turni')) omitKeys.add('turni');
  if (activeHubTab === 'turni' && !isMgmt && gm.has('staff_shifts')) omitKeys.add(OMIT_STAFF_TURNI);
  if (activeHubTab === 'ferie' && isMgmt && gm.has('ferie')) omitKeys.add('ferie');
  if (activeHubTab === 'ferie' && !isMgmt && gm.has('staff_holidays')) omitKeys.add(OMIT_STAFF_FERIE);
  if (activeHubTab === 'timesheet' && gm.has('timesheet')) omitKeys.add('timesheet');
  if (activeHubTab === 'reports' && gm.has('stats')) omitKeys.add('stats');
  if ((activeHubTab === 'settings' || activeHubTab === 'profile') && gm.has('staff_profile')) omitKeys.add('staff_profile');
  
  // SEMPRE OMETTI global_popups e turni.shift_modal e timesheet.punch_modal
  // perché vengono renderizzati esplicitamente in fondo a ProfileTabRichPreview (o dentro i componenti preview)
  if (gm.has('global_popups')) omitKeys.add('global_popups');
  // turni.shift_modal è gestito dentro TurniMgmtPreview
  // timesheet.punch_modal è gestito dentro TimesheetTabPreview

  const remainder = layoutGroups.filter((g) => !omitKeys.has(g.groupKey));

  const blocks: ReactNode[] = [];

  if (activeHubTab === 'home' && isMgmt && gm.has('home_mgmt')) {
    blocks.push(
      <ManagementHomePreview
        key="home-mgmt"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        staffRequestsEnabled={isStaffRequestsFeatureEnabled(featureFlags)}
        onUiToggle={onUiToggle}
        embedded
      />
    );
  }
  if (activeHubTab === 'home' && !isMgmt && gm.has('staff_home')) {
    blocks.push(
      <StaffHomePreview
        key="staff-home"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
      />
    );
  }
  if (activeHubTab === 'turni' && isMgmt && gm.has('turni')) {
    blocks.push(
      <TurniMgmtPreview
        key="turni-mgmt"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
      />
    );
  }
  if (activeHubTab === 'turni' && !isMgmt && gm.has('staff_shifts')) {
    blocks.push(
      <StaffShiftsPreview
        key="staff-shifts"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
      />
    );
  }
  if (activeHubTab === 'ferie' && isMgmt && gm.has('ferie')) {
    blocks.push(
      <FerieMgmtPreview
        key="ferie-mgmt"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
      />
    );
  }
  if (activeHubTab === 'ferie' && !isMgmt && gm.has('staff_holidays')) {
    blocks.push(
      <StaffHolidaysPreview
        key="staff-ferie"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
      />
    );
  }
  if (activeHubTab === 'timesheet' && gm.has('timesheet')) {
    blocks.push(
      <TimesheetTabPreview
        key="ts"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
      />
    );
  }
  if (activeHubTab === 'reports' && gm.has('stats')) {
    blocks.push(
      <StatisticsTabPreview
        key="stats"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
      />
    );
  }
  if ((activeHubTab === 'settings' || activeHubTab === 'profile') && gm.has('staff_profile')) {
    blocks.push(
      <SettingsTabPreview
        key={activeHubTab === 'profile' ? 'profile' : 'settings'}
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
      />
    );
  }

  if (remainder.length > 0) {
    blocks.push(
      <GenericWidgetsColumn
        key="generic"
        groups={remainder}
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        language={language}
      />
    );
  }

  /** Vista come scheda app reale: niente cornice “telefono”, solo contenuto a tutta larghezza con dati dimostrativi. */
  return (
    <div className="w-full">
      <div className="rounded-xl border border-neutral-500 overflow-hidden ring-1 ring-slate-900/[0.04]">
        <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-3 md:px-5 md:py-3.5">
          <h3 className="text-base font-bold tracking-tight text-white md:text-lg">{navLabel}</h3>
          <p className="mt-1.5 text-xs leading-relaxed text-white/70 md:text-sm">
            {tv.profile_visibility_mock_hint_realistic ?? tv.profile_visibility_mock_hint ?? ''}
          </p>
        </div>
        <div className="bg-transparent app-horizontal-pad py-4 md:py-6">
          <div className="mx-auto w-full max-w-6xl space-y-5">
            {blocks}
            <GlobalPopupsPreview 
              previewUser={previewUser}
              isSelectedAdmin={isSelectedAdmin}
              onUiToggle={onUiToggle}
              hiddenBadge={tv.profile_visibility_ui_hidden_badge ?? 'Nascosto'}
            />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
