import type { ReactNode } from 'react';
import type { User, Language } from '../../types';
import type { FeatureFlags } from '../../utils/featureFlags';
import type { AppNavTab } from '../../utils/enabledModules';
import { isStaffRequestsFeatureEnabled } from '../../utils/enabledModules';
import type { UiScreenWidgetDef } from '../../utils/uiScreenWidgets';
import { getTranslations } from '../../utils/translations';
import ManagementHomePreview from '../ManagementHomePreview';
import GenericWidgetsColumn from './GenericWidgetsColumn';
import CompactHomePreview from './CompactHomePreview';
import StaffHomePreview from './StaffHomePreview';
import TurniMgmtPreview from './TurniMgmtPreview';
import FerieMgmtPreview from './FerieMgmtPreview';
import StaffHolidaysPreview from './StaffHolidaysPreview';
import TimesheetTabPreview from './TimesheetTabPreview';
import StaffTimesheetPreview from './StaffTimesheetPreview';
import StatisticsTabPreview from './StatisticsTabPreview';
import ProfileTabPanelPreview from './ProfileTabPanelPreview';
import SettingsAdminPreview from './SettingsAdminPreview';
import { GlobalPopupsPreview } from './SettingsTabPreview';
import { getEffectiveFeaturesForUser } from '../../utils/profileVisibilityHub';

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

  const teamViewOn = getEffectiveFeaturesForUser(previewUser)['team_view'] === true;

  // Ogni scheda ha un mock dedicato (in base al ruolo): i gruppi generici
  // corrispondenti vengono omessi per non duplicare i blocchi.
  const omitKeys = new Set<string>();
  if (activeHubTab === 'home') {
    if (isMgmt) {
      omitKeys.add('home_mgmt');
      omitKeys.add('home_compact');
    } else {
      omitKeys.add(OMIT_STAFF_HOME);
    }
  }
  if (activeHubTab === 'ferie') {
    omitKeys.add('ferie');
    omitKeys.add(OMIT_STAFF_FERIE);
  }
  // Presenze unifica pianificazione (ex Turni), timbrature e ore (ex Statistiche).
  if (activeHubTab === 'timesheet') {
    omitKeys.add('turni');
    omitKeys.add(OMIT_STAFF_TURNI);
    omitKeys.add('timesheet');
    omitKeys.add('stats');
  }
  if (activeHubTab === 'profile' || activeHubTab === 'settings') {
    omitKeys.add('staff_profile');
  }
  // global_popups è sempre renderizzato in fondo (GlobalPopupsPreview).
  omitKeys.add('global_popups');

  const remainder = layoutGroups.filter((g) => !omitKeys.has(g.groupKey));

  const blocks: ReactNode[] = [];

  // ── Panoramica (Home) ───────────────────────────────────────────────
  if (activeHubTab === 'home') {
    if (!isMgmt) {
      blocks.push(
        <StaffHomePreview
          key="staff-home"
          previewUser={previewUser}
          language={language}
          isSelectedAdmin={isSelectedAdmin}
          onUiToggle={onUiToggle}
        />
      );
    } else if (teamViewOn) {
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
    } else {
      blocks.push(
        <CompactHomePreview
          key="home-compact"
          previewUser={previewUser}
          language={language}
          isSelectedAdmin={isSelectedAdmin}
          onUiToggle={onUiToggle}
        />
      );
    }
  }

  // ── Presenze (pianificazione + timbrature + ore) ────────────────────
  if (activeHubTab === 'timesheet') {
    if (isMgmt) {
      blocks.push(
        <TurniMgmtPreview
          key="turni-mgmt"
          previewUser={previewUser}
          language={language}
          isSelectedAdmin={isSelectedAdmin}
          onUiToggle={onUiToggle}
        />
      );
      blocks.push(
        <TimesheetTabPreview
          key="ts"
          previewUser={previewUser}
          language={language}
          isSelectedAdmin={isSelectedAdmin}
          onUiToggle={onUiToggle}
        />
      );
      blocks.push(
        <StatisticsTabPreview
          key="stats"
          previewUser={previewUser}
          language={language}
          isSelectedAdmin={isSelectedAdmin}
          onUiToggle={onUiToggle}
        />
      );
    } else {
      blocks.push(
        <StaffTimesheetPreview
          key="staff-ts"
          previewUser={previewUser}
          language={language}
          isSelectedAdmin={isSelectedAdmin}
          onUiToggle={onUiToggle}
        />
      );
    }
  }

  // ── Ferie ───────────────────────────────────────────────────────────
  if (activeHubTab === 'ferie') {
    if (isMgmt) {
      blocks.push(
        <FerieMgmtPreview
          key="ferie-mgmt"
          previewUser={previewUser}
          language={language}
          isSelectedAdmin={isSelectedAdmin}
          onUiToggle={onUiToggle}
        />
      );
    } else {
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
  }

  // ── Profilo ─────────────────────────────────────────────────────────
  if (activeHubTab === 'profile') {
    blocks.push(
      <ProfileTabPanelPreview
        key="profile"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
      />
    );
  }

  // ── Admin (Impostazioni, globale) ───────────────────────────────────
  if (activeHubTab === 'settings') {
    blocks.push(
      <SettingsAdminPreview
        key="settings"
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
      <div className="rounded-xl border border-white/[0.14] overflow-hidden ring-1 ring-slate-900/[0.04]">
        <div className="border-b border-white/10 bg-slate-50/90 px-4 py-3 md:px-5 md:py-3.5">
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
              language={language}
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
