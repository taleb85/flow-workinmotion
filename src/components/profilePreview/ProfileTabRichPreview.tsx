import type { ReactNode } from 'react';
import type { User, Language } from '../../types';
import type { FeatureFlags } from '../../utils/featureFlags';
import type { AppNavTab } from '../../utils/enabledModules';
import { isUiWidgetVisible, widgetAppliesToUser, type UiScreenWidgetDef } from '../../utils/uiScreenWidgets';
import { getTranslations } from '../../utils/translations';
import GenericWidgetsColumn from './GenericWidgetsColumn';
import HomeLivePreview from './HomeLivePreview';
import TimesheetLivePreview from './TimesheetLivePreview';
import FerieLivePreview from './FerieLivePreview';
import ProfileTabPanelPreview from './ProfileTabPanelPreview';
import SettingsAdminPreview from './SettingsAdminPreview';
import { GlobalPopupsPreview } from './SettingsTabPreview';
import ToggleSwitch from '../ui/toggle-switch-glass';
import { previewWidgetLabel } from './previewWidgetLabel';
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

  // Blocchi della Panoramica realmente mostrati nella copia live: servono per
  // esporre i toggle sotto l'anteprima (stati da `ui_section_overrides`).
  const activeHomeScreenGroup = !isMgmt ? 'staff_home' : teamViewOn ? 'home_mgmt' : 'home_compact';
  const homeToggleWidgets: UiScreenWidgetDef[] =
    activeHubTab === 'home'
      ? layoutGroups
          .filter((g) => g.groupKey === activeHomeScreenGroup)
          .flatMap((g) => g.widgets)
          .filter((w) => widgetAppliesToUser(w, previewUser.role))
      : [];

  // Ogni scheda ha una vista dedicata (live per la Panoramica, mock per le
  // altre): i gruppi generici corrispondenti vengono omessi per non duplicare
  // i blocchi.
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
  // Copia esatta della schermata reale: i componenti veri (MobileHome /
  // HomeManagerView / HomeStaffView) sono alimentati con dati dimostrativi.
  if (activeHubTab === 'home') {
    blocks.push(
      <HomeLivePreview
        key="home-live"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        isMgmt={isMgmt}
      />
    );

    // Toggle dei blocchi mostrati: i componenti reali reagiscono dal vivo a
    // `ui_section_overrides` tramite `uiW`, qui l'admin li commuta.
    if (homeToggleWidgets.length > 0) {
      blocks.push(
        <div
          key="home-widget-toggles"
          className="rounded-xl border border-white/[0.14] px-3 py-3"
        >
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wider text-white/60">
            {tv.profile_visibility_home_blocks_title ?? 'Blocchi della Panoramica'}
          </p>
          <div className="flex flex-col gap-1.5">
            {homeToggleWidgets.map((w) => {
              const visible = isUiWidgetVisible(previewUser, w.key);
              return (
                <div key={w.key} className="flex items-center justify-between gap-3">
                  <span
                    className="min-w-0 flex-1 truncate text-xs text-white/80"
                    title={w.label}
                  >
                    {previewWidgetLabel(w.key)}
                  </span>
                  <ToggleSwitch
                    isActive={visible}
                    onChange={(next) => {
                      if (!isSelectedAdmin) onUiToggle(w.key, next);
                    }}
                    size="sm"
                    darkMode
                    className={`shrink-0 ${isSelectedAdmin ? 'pointer-events-none' : ''}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  }

  // ── Presenze (pianificazione + timbrature + ore) ────────────────────
  // Copia esatta della schermata reale: gestione → UnifiedShiftsPage,
  // staff → MobileStatsCards + ManagementMobileTimesheet (dati demo).
  if (activeHubTab === 'timesheet') {
    blocks.push(
      <TimesheetLivePreview
        key="timesheet-live"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        isMgmt={isMgmt}
      />
    );

    // Toggle dei blocchi realmente mostrati nella copia live.
    // Gestione → solo il tabellone (`turni`); staff → `timesheet` + `stats`.
    const timesheetToggleGroupKeys = isMgmt ? ['turni'] : ['timesheet', 'stats'];
    const timesheetToggleWidgets: UiScreenWidgetDef[] = layoutGroups
      .filter((g) => timesheetToggleGroupKeys.includes(g.groupKey))
      .flatMap((g) => g.widgets)
      .filter((w) => widgetAppliesToUser(w, previewUser.role));

    if (timesheetToggleWidgets.length > 0) {
      blocks.push(
        <div
          key="timesheet-widget-toggles"
          className="rounded-xl border border-white/[0.14] px-3 py-3"
        >
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wider text-white/60">
            {tv.profile_visibility_timesheet_blocks_title ?? 'Blocchi delle Presenze'}
          </p>
          <div className="flex flex-col gap-1.5">
            {timesheetToggleWidgets.map((w) => {
              const visible = isUiWidgetVisible(previewUser, w.key);
              return (
                <div key={w.key} className="flex items-center justify-between gap-3">
                  <span
                    className="min-w-0 flex-1 truncate text-xs text-white/80"
                    title={w.label}
                  >
                    {previewWidgetLabel(w.key)}
                  </span>
                  <ToggleSwitch
                    isActive={visible}
                    onChange={(next) => {
                      if (!isSelectedAdmin) onUiToggle(w.key, next);
                    }}
                    size="sm"
                    darkMode
                    disabled={isSelectedAdmin}
                    className="shrink-0"
                  />
                </div>
              );
            })}
          </div>
        </div>
      );
    }
  }

  // ── Ferie ───────────────────────────────────────────────────────────
  // Copia esatta della schermata reale: il componente vero `HolidayRequests`
  // (dentro `FerieLivePreview`) è alimentato con dati dimostrativi sia per la
  // gestione sia per lo staff.
  if (activeHubTab === 'ferie') {
    blocks.push(
      <FerieLivePreview
        key="ferie-live"
        previewUser={previewUser}
        language={language}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        isMgmt={isMgmt}
      />
    );

    // Toggle dei blocchi realmente mostrati nella copia live.
    // Gestione → gruppo `ferie`; staff → gruppo `staff_holidays`.
    const ferieToggleGroupKeys = isMgmt ? ['ferie'] : [OMIT_STAFF_FERIE];
    const ferieToggleWidgets: UiScreenWidgetDef[] = layoutGroups
      .filter((g) => ferieToggleGroupKeys.includes(g.groupKey))
      .flatMap((g) => g.widgets)
      .filter((w) => widgetAppliesToUser(w, previewUser.role));

    if (ferieToggleWidgets.length > 0) {
      blocks.push(
        <div
          key="ferie-widget-toggles"
          className="rounded-xl border border-white/[0.14] px-3 py-3"
        >
          <p className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wider text-white/60">
            {tv.profile_visibility_ferie_blocks_title ?? 'Blocchi delle Ferie'}
          </p>
          <div className="flex flex-col gap-1.5">
            {ferieToggleWidgets.map((w) => {
              const visible = isUiWidgetVisible(previewUser, w.key);
              return (
                <div key={w.key} className="flex items-center justify-between gap-3">
                  <span
                    className="min-w-0 flex-1 truncate text-xs text-white/80"
                    title={w.label}
                  >
                    {previewWidgetLabel(w.key)}
                  </span>
                  <ToggleSwitch
                    isActive={visible}
                    onChange={(next) => {
                      if (!isSelectedAdmin) onUiToggle(w.key, next);
                    }}
                    size="sm"
                    darkMode
                    disabled={isSelectedAdmin}
                    className="shrink-0"
                  />
                </div>
              );
            })}
          </div>
        </div>
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
