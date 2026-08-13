import { useMemo, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Home,
  Calendar,
  ClipboardList,
  Clock,
  ShieldCheck,
  LayoutList,
  RotateCcw,
  X,
  Palmtree,
  ChevronDown,
  User as UserIconLucide,
} from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import type { User } from '../types';
import type { EnabledFeatures } from '../utils/enabledFeatures';
import { translateRole } from '../utils/roles';
import { isAdminOnly, isManagementRole } from '../utils/permissions';
import { FEATURE_LABELS, type EnabledFeatureKey } from '../utils/enabledFeatures';
import {
  getEnabledModules,
  ENABLED_MODULES,
  type AppNavTab,
  type EnabledModule,
} from '../utils/enabledModules';
import ProfileTabRichPreview from './profilePreview/ProfileTabRichPreview';
import {
  PROFILE_VISIBILITY_FEATURE_KEYS,
  getEffectiveFeaturesForUser,
  getTemplateBaselineFeatures,
  isFeatureExplicitlyOverridden,
  computeNextEnabledFeaturesOverride,
  toggleStaffModule,
  getModuleLabel,
  screenGroupToPreviewTab,
  featureKeyToPreviewTab,
  staffModuleToPreviewTab,
} from '../utils/profileVisibilityHub';
import {
  computeNextUiSectionOverrides,
  uiWidgetsByGroup,
  widgetAppliesToUser,
  type UiScreenWidgetDef,
} from '../utils/uiScreenWidgets';
import AdminRow from './ui/AdminRow';

const ACCENT = 'var(--brand)';

const PREVIEW_TAB_ICONS: Record<AppNavTab, typeof Home> = {
  home: Home,
  turni: Calendar,
  ferie: Palmtree,
  timesheet: ClipboardList,
  reports: Clock,
  profile: UserIconLucide,
  settings: ShieldCheck,
};

function NavPreviewBar({
  tabs,
  labels,
  size = 'compact',
  activeTab,
  onSelectTab,
}: {
  tabs: AppNavTab[];
  labels: Record<AppNavTab, string>;
  /** `hub` = overlay Permessi profilo: più compatto di fullscreen, più leggibile di compact. */
  size?: 'compact' | 'hub' | 'fullscreen';
  activeTab?: AppNavTab | null;
  onSelectTab?: (id: AppNavTab) => void;
}) {
  const fs = size === 'fullscreen';
  const hub = size === 'hub';
  const interactive = !!onSelectTab && activeTab != null;
  const pad = fs ? 'py-4 px-3 md:px-5' : hub ? 'py-2 px-2 md:px-3' : 'py-2 px-2';
  const rowMin = fs ? 'min-h-[72px] md:min-h-[88px]' : hub ? 'min-h-[48px] md:min-h-[52px]' : 'min-h-[44px]';
  const gap = fs ? 'gap-1.5 px-1' : hub ? 'gap-1 px-0.5' : 'gap-0.5 px-1';
  const iconSz = fs ? 'w-7 h-7 md:w-8 md:h-8' : hub ? 'w-[18px] h-[18px] md:w-5 md:h-5' : 'w-4 h-4';
  const labelSz = fs ? 'text-[11px] md:text-xs' : hub ? 'text-[11px] md:text-[11px]' : 'text-[11px]';
  return (
    <div className={`rounded-[1.25rem] border border-neutral-500 shadow-inner ${pad}`} style={{ backgroundColor: ACCENT }}>
      <div className={`flex justify-between items-stretch gap-1 md:gap-2 ${rowMin}`}>
        {tabs.map((id) => {
          const Icon = PREVIEW_TAB_ICONS[id];
          const selected = interactive && activeTab === id;
          const cls = `flex-1 min-w-0 flex flex-col items-center justify-center text-white/90 ${gap} rounded-xl transition-colors ${
            selected ? 'bg-white/20 ring-2 ring-white/80 shadow-inner' : ''
          }`;
          const label = (
            <>
              <Icon className={`${iconSz} opacity-95`} strokeWidth={1.5} aria-hidden />
              <span className={`font-semibold leading-tight text-center truncate w-full ${labelSz}`} title={labels[id]}>{labels[id]}</span>
            </>
          );
          if (interactive) {
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTab!(id)}
                className={`${cls} keep-white-glass cursor-pointer hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white active:bg-white/80`}
                aria-pressed={selected}
                aria-label={labels[id]}
              >
                {label}
              </button>
            );
          }
          return (
            <div key={id} className={cls}>
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  initialSelectedUserId?: string | null;
  onClose?: () => void;
};

export default function ProfileVisibilityHub({ initialSelectedUserId, onClose }: Props = {}) {
  const { users, currentUser, updateUser, deleteUser, effectiveLanguage, isSessionElevated } = useAppUser();
  const { featureFlags } = useAppConfig();
  const { showSuccess } = useAppOverlay();
  const t = useT();
  const tv = t as Record<string, string>;

  const canUseHub = useMemo(
    () => !!currentUser && (isAdminOnly(currentUser) || isSessionElevated || !!currentUser.elevated_role),
    [currentUser, isSessionElevated]
  );

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'staff' | 'management'>('all');
  const [showSuspended, setShowSuspended] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedUserId || null);
  const [activeHubTab, setActiveHubTab] = useState<AppNavTab>('home');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isDeleting, setIsStaffDeleting] = useState(false);

  // Local state for immediate preview updates without DB save
  const [localFeatures, setLocalFeatures] = useState<EnabledFeatures | null>(null);
  const [localModules, setLocalModules] = useState<EnabledModule[] | null>(null);
  const [localUiOverrides, setLocalUiOverrides] = useState<Record<string, boolean> | null>(null);

  // Keep track of original state to allow "Discard changes"
  const [originalState, setOriginalState] = useState<{
    features: EnabledFeatures;
    modules: EnabledModule[];
    ui: Record<string, boolean>;
  } | null>(null);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [users]);

  // Se l'utente corrente non è gestionale, può vedere solo sé stesso
  const filteredList = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!currentUser) return [];
    if (!isManagementRole(currentUser.role)) {
      return sortedUsers.filter((u) => u.id === currentUser.id);
    }
    return sortedUsers.filter((u) => {
      if (!showSuspended && u.status !== 'active') return false;
      if (roleFilter === 'staff' && isManagementRole(u.role)) return false;
      if (roleFilter === 'management' && !isManagementRole(u.role)) return false;
      if (!q) return true;
      const name = `${u.first_name ?? ''} ${u.last_name ?? ''} ${u.email ?? ''}`.toLowerCase();
      return name.includes(q);
    });
  }, [sortedUsers, search, roleFilter, showSuspended, currentUser]);

  // Se non gestionale, la selezione è forzata su currentUser
  const selected = useMemo(() => {
    if (!currentUser) return null;
    if (!isManagementRole(currentUser.role)) return currentUser;
    if (!selectedId) return null;
    return users.find((u) => u.id === selectedId) ?? null;
  }, [currentUser, selectedId, users]);

  useEffect(() => {
    if (selected) {
      const features = { ...selected.enabled_features } as EnabledFeatures;
      const modules = [...(selected.enabled_modules || [])] as import('../utils/enabledModules').EnabledModule[];
      const ui = { ...selected.ui_section_overrides };
      setOriginalState({ features, modules, ui });
      setLocalFeatures(features);
      setLocalModules(modules);
      setLocalUiOverrides(ui);
    } else {
      setOriginalState(null);
      setLocalFeatures(null);
      setLocalModules(null);
      setLocalUiOverrides(null);
    }
  }, [selected]);

  // Reset hasUnsavedChanges when user selection changes
  useEffect(() => {
    setHasUnsavedChanges(false);
  }, [selectedId]);

  useEffect(() => {
    if (initialSelectedUserId) setSelectedId(initialSelectedUserId);
  }, [initialSelectedUserId]);

  // Create a "preview user" that merges selected user with local overrides
  const previewUser = useMemo(() => {
    if (!selected) return null;
    return {
      ...selected,
      enabled_features: localFeatures ?? selected.enabled_features,
      enabled_modules: localModules ?? selected.enabled_modules,
      ui_section_overrides: localUiOverrides ?? selected.ui_section_overrides,
    };
  }, [selected, localFeatures, localModules, localUiOverrides]);

  const isSelectedAdmin = selected?.role === 'admin';
  // Forza isMgmt a false per vedere i widget dello staff se il ruolo non è gestionale
  const isMgmt = previewUser ? isManagementRole(previewUser.role) : false;

  const hubTabs = useMemo(() => {
    if (!previewUser) return [] as AppNavTab[];
    // Per l'anteprima "Cosa vede chi", mostriamo sempre tutte le tab potenziali 
    // per permettere all'admin di configurarle anche se al momento sono disattivate
    return ['home', 'turni', 'ferie', 'timesheet', 'reports', 'profile', 'settings'] as AppNavTab[];
  }, [previewUser]);

  useEffect(() => {
    if (!previewUser || hubTabs.length === 0) return;
    setActiveHubTab((prev) => (hubTabs.includes(prev) ? prev : hubTabs[0]!));
  }, [previewUser, hubTabs]);

  /** Pannello permessi: aperto di default così l’anteprima e i toggle sono visibili insieme. */
  const [permDetailsOpen, setPermDetailsOpen] = useState(true);
  useEffect(() => {
    setPermDetailsOpen(true);
  }, [previewUser?.id, activeHubTab]);

  const navLabels: Record<AppNavTab, string> = {
    home: t.sidebar_dashboard,
    turni: t.sidebar_shifts,
    ferie: t.sidebar_holidays,
    timesheet: t.sidebar_attendance,
    reports: t.sidebar_statistics,
    profile: (t as Record<string, string>).bottom_nav_profile ?? t.sidebar_profile,
    settings: (t as { bottom_nav_settings_short?: string }).bottom_nav_settings_short || t.sidebar_admin,
  };

  const handleFeatureToggle = useCallback(
    (u: User, key: EnabledFeatureKey, on: boolean) => {
      if (isSelectedAdmin) return;
      const next = computeNextEnabledFeaturesOverride(u, key, on);
      setLocalFeatures(next ?? {});
      setHasUnsavedChanges(true);
    },
    [isSelectedAdmin]
  );

  const handleModuleToggle = useCallback(
    (u: User, mod: EnabledModule, on: boolean) => {
      if (isSelectedAdmin || isManagementRole(u.role)) return;
      const next = toggleStaffModule(u, mod, on);
      setLocalModules(next);
      setHasUnsavedChanges(true);
    },
    [isSelectedAdmin]
  );

  const handleSmartRestore = useCallback(() => {
    if (!selected || isSelectedAdmin) return;

    if (hasUnsavedChanges && originalState) {
      // Discard unsaved changes: restore to original state
      setLocalFeatures({ ...originalState.features });
      setLocalModules([...originalState.modules]);
      setLocalUiOverrides({ ...originalState.ui });
      setHasUnsavedChanges(false);
      showSuccess?.(tv.profile_visibility_changes_discarded ?? 'Modifiche annullate.');
    } else {
      // No unsaved changes: reset everything to template defaults
      if (!window.confirm(tv.profile_visibility_reset_confirm ?? 'Rimuovere tutte le personalizzazioni e tornare al template di ruolo?')) return;
      
      setLocalFeatures({});
      setLocalModules([]);
      setLocalUiOverrides({});
      setHasUnsavedChanges(true);
      showSuccess?.(tv.profile_visibility_reset_done ?? 'Eccezioni rimosse: vale il template di ruolo.');
    }
  }, [selected, isSelectedAdmin, hasUnsavedChanges, originalState, showSuccess, tv]);

  const handleSaveAndApply = useCallback(async () => {
    if (!selected || !hasUnsavedChanges) return;
    const success = await updateUser(selected.id, {
      enabled_features: localFeatures ?? {},
      enabled_modules: localModules ?? [],
      ui_section_overrides: localUiOverrides ?? {},
    });
    if (success) {
      setHasUnsavedChanges(false);
      // Update original state to current state after save
      setOriginalState({
        features: { ...(localFeatures ?? {}) },
        modules: [...(localModules ?? [])],
        ui: { ...(localUiOverrides ?? {}) },
      });
      showSuccess?.(tv.profile_visibility_saved_hint ?? 'Modifiche salvate e applicate.');
    }
  }, [selected, hasUnsavedChanges, localFeatures, localModules, localUiOverrides, updateUser, showSuccess, tv.profile_visibility_saved_hint]);

  const handleDeleteUser = useCallback(async () => {
    if (!selected || isDeleting) return;
    
    const fullName = `${selected.first_name} ${selected.last_name ?? ''}`.trim();
    if (!window.confirm((tv.profile_visibility_delete_confirm ?? 'Sei sicuro di voler eliminare definitivamente {name}? Questa azione non è reversibile.').replace('{name}', fullName))) {
      return;
    }

    setIsStaffDeleting(true);
    try {
      const result = await deleteUser(selected.id);
      if (result !== false) {
        showSuccess?.((tv.profile_visibility_delete_success ?? 'Profilo di {name} eliminato.').replace('{name}', fullName));
        setSelectedId(null);
      }
    } finally {
      setIsStaffDeleting(false);
    }
  }, [selected, isDeleting, deleteUser, showSuccess, tv]);

  const uiGroups = useMemo(() => uiWidgetsByGroup(), []);

  const featuresForActiveTab = useMemo(() => {
    if (!previewUser) return [] as EnabledFeatureKey[];
    return PROFILE_VISIBILITY_FEATURE_KEYS.filter((key) => {
      if (featureKeyToPreviewTab(key) !== activeHubTab) return false;
      return true;
    });
  }, [previewUser, activeHubTab]);

  const layoutGroupsForActiveTab = useMemo((): { groupKey: string; widgets: UiScreenWidgetDef[] }[] => {
    if (!previewUser) return [];
    const out: { groupKey: string; widgets: UiScreenWidgetDef[] }[] = [];
    for (const [groupKey, widgets] of uiGroups.entries()) {
      const tab = screenGroupToPreviewTab(groupKey);
      if (tab !== 'all' && tab !== activeHubTab) continue;
      const applicable = widgets.filter((w) => widgetAppliesToUser(w, previewUser.role));
      if (applicable.length) out.push({ groupKey, widgets: applicable });
    }
    return out;
  }, [previewUser, activeHubTab, uiGroups]);

  const staffModulesForActiveTab = useMemo(() => {
    if (!previewUser || isManagementRole(previewUser.role)) return [] as EnabledModule[];
    return ENABLED_MODULES.filter((m) => staffModuleToPreviewTab(m, false) === activeHubTab);
  }, [previewUser, activeHubTab]);

  const activeTabPanelEmpty =
    featuresForActiveTab.length === 0 &&
    layoutGroupsForActiveTab.length === 0 &&
    staffModulesForActiveTab.length === 0;

  const showScreenMock =
    layoutGroupsForActiveTab.length > 0 || staffModulesForActiveTab.length > 0;

  const handleUiWidgetToggle = useCallback(
    (u: User, key: string, visible: boolean) => {
      if (isSelectedAdmin) return;
      const next = computeNextUiSectionOverrides(u, key, visible);
      setLocalUiOverrides(next ?? {});
      setHasUnsavedChanges(true);
    },
    [isSelectedAdmin]
  );

  const closePreview = useCallback(() => {
    if (onClose) {
      onClose();
    } else {
      setSelectedId(null);
    }
  }, [onClose]);

  useEffect(() => {
    if (!previewUser) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [previewUser, closePreview]);

  if (!currentUser) return null;

  if (!canUseHub) {
    return (
      <div className="pb-content pt-6 app-horizontal-pad">
        <p className="text-sm text-white/70">
          {tv.profile_visibility_forbidden ?? 'Non hai permesso di accedere a questa sezione.'}
        </p>
      </div>
    );
  }

  return (
    <>
    <div className="app-horizontal-pad font-sans mx-auto w-full max-w-7xl pb-content pt-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight text-white">
          {tv.profile_visibility_title ?? 'Cosa vede chi'}
        </h1>
        <p className="text-white/60 text-sm mt-1 max-w-2xl">
          {tv.profile_visibility_subtitle ??
            'Template di ruolo (tab Permessi ruoli) + eccezioni per singolo profilo. Scegli un utente, controlla l’anteprima della barra e attiva o disattiva i widget.'}
        </p>
      </div>

      <div className={`grid grid-cols-1 gap-6 md:gap-8 ${previewUser ? '' : 'md:grid-cols-12'}`}>
        {/* Lista profili */}
        <div className={`space-y-3 ${previewUser ? 'md:max-w-2xl' : 'md:col-span-4'}`}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tv.profile_visibility_search_ph ?? 'Cerca nome o email…'}
              className="w-full rounded-xl border border-slate-200 py-2.5 pr-3 pl-10 text-base text-white placeholder:text-white/50 outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {(['all', 'staff', 'management'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setRoleFilter(k)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
 roleFilter === k
 ? 'rounded-full border border-accent bg-accent text-white'
 : 'rounded-xl border border-neutral-500 !rounded-full text-white/70 surface-ghost-interactive hover:border-neutral-500'
 } active:brightness-95`}
              >
                {k === 'all'
                  ? tv.profile_visibility_filter_all ?? 'Tutti'
                  : k === 'staff'
                    ? tv.profile_visibility_filter_staff ?? 'Staff'
                    : tv.profile_visibility_filter_mgmt ?? 'Gestione'}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-white/70">
            <input
              type="checkbox"
              checked={showSuspended}
              onChange={(e) => setShowSuspended(e.target.checked)}
              className="rounded border-neutral-500 text-accent focus:ring-accent/30"
            />
            {tv.profile_visibility_show_suspended ?? 'Mostra sospesi / inattivi'}
          </label>

          <ul className="max-h-[min(52vh,28rem)] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-neutral-500">
            {filteredList.length === 0 && (
              <li className="px-4 py-8 text-center text-sm text-white/50">
                {tv.profile_visibility_empty_list ?? 'Nessun profilo corrisponde ai filtri.'}
              </li>
            )}
            {filteredList.map((u) => {
              const active = u.id === selectedId;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(u.id)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
 active ? 'bg-accent/8' : 'hover:bg-slate-50'
 } active:bg-slate-50'/80`}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-bold text-white/70">
                      {(u.first_name?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-semibold text-white"
                        title={`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()}
                      >
                        {u.first_name} {u.last_name ?? ''}
                      </p>
                      <p
                        className="text-[11px] text-white/60 truncate"
                        title={translateRole(u.role, currentUser.language)}
                      >
                        {translateRole(u.role, currentUser.language)}
                      </p>
                      {u.status !== 'active' && (
                        <span className="mt-1 inline-block rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 uppercase">
                          {u.status}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {!previewUser && (
        <div className="md:col-span-8 space-y-6">
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-16 text-center">
              <LayoutList className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="text-sm font-medium text-white/70">
                {tv.profile_visibility_pick_user ?? 'Seleziona un profilo dall’elenco.'}
              </p>
            </div>
        </div>
        )}
      </div>
    </div>

    {previewUser && createPortal(
        <div
          className="fixed inset-0 z-[10060] flex touch-manipulation flex-col overscroll-contain bg-slate-100/95 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-visibility-fs-title"
        >
          <header className="sticky top-0 z-[10070] safe-area-pad flex min-h-[72px] shrink-0 items-center gap-3 border-b border-slate-200/90 bg-white/90 px-4 py-3 pt-[max(12px,env(safe-area-inset-top,0px))] shadow-sm backdrop-blur-lg md:px-5">
            <button
              type="button"
              onClick={closePreview}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-white/80 transition-colors hover:bg-slate-100 active:bg-slate-100/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
              aria-label={tv.profile_visibility_close_preview ?? 'Chiudi anteprima'}
            >
              <X className="h-5 w-5 text-white/90" strokeWidth={2} />
            </button>
            <div className="min-w-0 flex-1">
              <p
                id="profile-visibility-fs-title"
                className="text-[11px] font-bold text-white/60 uppercase tracking-wider"
              >
                {tv.profile_visibility_fullscreen_title ?? 'Anteprima profilo'}
              </p>
              <p
                className="truncate text-base font-bold text-white"
                title={`${previewUser.first_name ?? ''} ${previewUser.last_name ?? ''}`.trim()}
              >
                {previewUser.first_name} {previewUser.last_name ?? ''}
              </p>
              <p
                className="text-[11px] text-white/60 truncate"
                title={translateRole(previewUser.role, currentUser.language)}
              >
                {translateRole(previewUser.role, currentUser.language)}
              </p>
            </div>
            {hasUnsavedChanges ? (
              <button
                type="button"
                onClick={handleSaveAndApply}
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-[11px] font-bold tracking-wider text-white uppercase shadow-sm transition-colors hover:bg-accent-hover hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
              >
                {tv.profile_visibility_save_apply ?? 'Salva e applica'}
              </button>
            ) : (
              <span className="shrink-0 rounded-lg border border-accent/20 bg-accent/10 px-2.5 py-1.5 text-[11px] font-bold tracking-wider text-accent uppercase">
                {tv.profile_visibility_readonly_preview ?? 'Solo lettura'}
              </span>
            )}
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto app-horizontal-pad py-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))]">
            <div className="mx-auto w-full max-w-7xl space-y-4">
              <div className="rounded-xl border border-neutral-500 overflow-hidden">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-bold text-white/60 uppercase tracking-wider">
                    {tv.profile_visibility_preview_banner ?? 'Anteprima navigazione'}
                  </p>
                </div>
                <div className="p-3 md:p-4 space-y-2">
                  {isSelectedAdmin && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-800">
                      {tv.profile_visibility_admin_note ??
                        'Profilo Amministratore: tutte le funzioni restano attive; non si applicano eccezioni qui.'}
                    </p>
                  )}
                  <p className="text-xs leading-snug text-white/70">
                    {tv.profile_visibility_pick_tab_hint ??
                      'Tocca una scheda nella barra: qui sotto compaiono solo i permessi e i blocchi di interfaccia collegati a quella schermata.'}{' '}
                    <span className="text-white/60">
                      {tv.profile_visibility_ferie_hint ??
                        'La scheda Ferie può non essere in barra: resta raggiungibile da Home quando è attiva.'}
                    </span>
                  </p>
                  <div className="w-full">
                    <NavPreviewBar
                      tabs={hubTabs}
                      labels={navLabels}
                      size="hub"
                      activeTab={activeHubTab}
                      onSelectTab={setActiveHubTab}
                    />
                  </div>
                </div>
              </div>

              {!isSelectedAdmin && (
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleSmartRestore}
className="inline-flex items-center gap-2 rounded-xl border border-neutral-500 px-3 py-2 text-xs font-semibold text-white/70 surface-ghost-interactive hover:text-white active:text-white transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {hasUnsavedChanges
                      ? (tv.profile_visibility_discard_changes ?? 'Annulla modifiche')
                      : (tv.profile_visibility_reset_all ?? 'Ripristina al template ruolo')}
                  </button>

                  {(isAdminOnly(currentUser) || isSessionElevated || !!currentUser?.elevated_role) && !hasUnsavedChanges && (
                    <button
                      type="button"
                      onClick={handleDeleteUser}
                      disabled={isDeleting}
className="inline-flex items-center gap-2 rounded-xl border border-neutral-500 px-3 py-2 text-xs font-semibold text-red-600 surface-ghost-interactive hover:bg-red-50 active:bg-red-50/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
                    >
                      {isDeleting ? (
                        <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                      {tv.profile_visibility_delete_user ?? 'Elimina dipendente'}
                    </button>
                  )}
                </div>
              )}

              <div className="space-y-4">
                  {activeTabPanelEmpty && (
                    <div className="rounded-xl border border-neutral-500 p-6 text-center">
                      <p className="text-sm text-white/60">
                        {tv.profile_visibility_tab_empty ??
                          'Nessun permesso o blocco configurabile per questa scheda. Scegli un’altra scheda o attiva prima il permesso della scheda (es. Tabellone team).'}
                      </p>
                    </div>
                  )}

                  {!activeTabPanelEmpty && (
                    <>
                      {showScreenMock && (
                        <>
                          <ProfileTabRichPreview
                            activeHubTab={activeHubTab}
                            isMgmt={isMgmt}
                            layoutGroups={layoutGroupsForActiveTab}
                            previewUser={previewUser}
                            language={effectiveLanguage}
                            isSelectedAdmin={isSelectedAdmin}
                            featureFlags={featureFlags}
                            onUiToggle={(key, vis) => handleUiWidgetToggle(previewUser, key, vis)}
                            navLabel={navLabels[activeHubTab]}
                          />
                          {staffModulesForActiveTab.length > 0 && (
                            <div className="space-y-1 border-t border-neutral-500/80 pt-1.5">
                              <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-white/60">
                                {tv.profile_visibility_tab_staff_modules ?? 'Moduli area personale'}
                              </p>
                              {staffModulesForActiveTab.map((mod) => {
                                const enabled = getEnabledModules(previewUser).includes(mod);
                                return (
                                  <div
                                    key={mod}
                                    className={`flex min-h-[44px] items-stretch gap-0 rounded-lg border-2 ${
 enabled
 ? 'border-slate-200 rounded-xl border border-neutral-500'
 : 'border-dashed border-neutral-500/70 bg-slate-300/40'
 }`}
                                  >
                                    <div
                                      className={`w-[3px] shrink-0 ${enabled ? 'bg-accent' : 'bg-slate-400'}`}
                                      aria-hidden
                                    />
                                    <div className="flex min-w-0 flex-1 items-center justify-between gap-2 py-1.5 pl-2 pr-1.5">
                                      <p
                                        className={`text-xs font-semibold ${
 enabled
 ? 'text-white'
 : 'text-white/60 line-through'
 }`}
                                      >
                                        {getModuleLabel(mod, effectiveLanguage)}
                                      </p>
                                      {!isSelectedAdmin && (
                                        <button
                                          type="button"
                                          role="switch"
                                          aria-checked={enabled}
                                          onClick={() => handleModuleToggle(previewUser, mod, !enabled)}
                                          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/35 focus:ring-offset-2 ${
 enabled ? 'bg-accent' : ''
 }`}
                                        >
                                          <span
                                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full toggle-knob transition-all duration-200 ease-in-out ${
 enabled ? 'translate-x-5' : 'translate-x-1'
 }`}
                                          />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}

                      {!showScreenMock && featuresForActiveTab.length > 0 && (
                        <p className="text-center text-xs text-white/60">
                          {tv.profile_visibility_mock_no_blocks ??
                            'Su questa scheda non ci sono blocchi layout da mostrare: solo i permessi di accesso (apri sotto).'}
                        </p>
                      )}

                      {featuresForActiveTab.length > 0 && (
                        <details
                          key={`perm-${previewUser.id}-${activeHubTab}`}
                          className="group rounded-xl border border-neutral-500 open:border-neutral-500/95 bg-slate-50/50 open:bg-slate-50/80"
                          open={permDetailsOpen}
                          onToggle={(e) => setPermDetailsOpen(e.currentTarget.open)}
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-bold text-white/90 [&::-webkit-details-marker]:hidden">
                            <span>
                              {(tv.profile_visibility_perm_expand ?? 'Permessi di accesso ({n})').replace(
                                '{n}',
                                String(featuresForActiveTab.length)
                              )}
                            </span>
                            <ChevronDown className="h-4 w-4 shrink-0 text-white/50 transition-transform group-open:rotate-180" />
                          </summary>
                          <p className="border-t border-slate-100 px-4 pt-2 text-[11px] text-white/60">
                            {tv.profile_visibility_tab_permissions_hint ??
                              'Attivano o disattivano funzioni e spesso la presenza della scheda in app.'}
                          </p>
                          <div className="flex flex-col gap-2 px-4 pb-4 pt-2">
                            {featuresForActiveTab.map((key) => {
                              const eff = getEffectiveFeaturesForUser(previewUser)[key] === true;
                              const overridden = isFeatureExplicitlyOverridden(previewUser, key);
                              const base = getTemplateBaselineFeatures(previewUser)[key] === true;
                              const desc = `${overridden
                                ? tv.profile_visibility_badge_custom ?? 'Personalizzato'
                                : tv.profile_visibility_badge_template ?? 'Dal template ruolo'}${
                                !overridden
                                  ? ` · ${base ? (tv.profile_visibility_on ?? 'On') : (tv.profile_visibility_off ?? 'Off')} ${tv.profile_visibility_in_template ?? 'nel template'}`
                                  : ''
                              }`;
                              return (
                                <AdminRow
                                  key={key}
                                  className={`rounded-lg border border-neutral-500 !border-b-0 !p-2 ${
 key === 'view_estimated_cost'
 ? '[&_.font-bold]:border-l-2 [&_.font-bold]:border-accent/30 [&_.font-bold]:pl-2'
 : ''
 }`}
                                  label={FEATURE_LABELS[key]}
                                  description={desc}
                                  action={
                                    <button
                                      type="button"
                                      role="switch"
                                      aria-checked={eff}
                                      aria-disabled={isSelectedAdmin}
                                      tabIndex={isSelectedAdmin ? -1 : 0}
                                      title={
                                        isSelectedAdmin ? (tv.profile_visibility_admin_switch_hint ?? '') : undefined
                                      }
                                      onClick={() => {
                                        if (!isSelectedAdmin) handleFeatureToggle(previewUser, key, !eff);
                                      }}
                                      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/35 focus:ring-offset-2 ${
 isSelectedAdmin ? 'cursor-default opacity-100' : 'cursor-pointer'
 } ${eff ? 'bg-accent' : ''}`}
                                    >
                                      <span
                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full toggle-knob transition-all duration-200 ease-in-out ${
 eff ? 'translate-x-5' : 'translate-x-1'
 }`}
                                      />
                                    </button>
                                  }
                                />
                              );
                            })}
                          </div>
                        </details>
                      )}
                    </>
                  )}
              </div>
            </div>
          </div>
        </div>,
        document.body
    )}
    </>
  );
}
