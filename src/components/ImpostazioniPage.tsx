/**
 * Scheda Impostazioni — attiva/disattiva le funzioni disponibili per i profili.
 * Solo Admin. Le modifiche sono immediate e salvate in DB o localStorage.
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid,
  Building2,
  ShieldAlert,
  Zap,
  Coffee,
  ChevronDown,
  Users,
  MapPin,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getTranslations, getFeatureStrings, formatTrans } from '../utils/translations';
import { isAdminOnly, isPurelyManagementRole } from '../utils/permissions';
import { FEATURE_DEFINITIONS } from '../utils/featureFlags';

const IMPOSTAZIONI_GROUPS: readonly {
  readonly titleKey: 'impostazioni_group_org' | 'impostazioni_group_rules' | 'impostazioni_group_tools';
  readonly slugs: readonly string[];
}[] = [
  { titleKey: 'impostazioni_group_org', slugs: ['department_creation'] },
  { titleKey: 'impostazioni_group_rules', slugs: ['violation_rules', 'auto_breaks', 'geofence_punch'] },
  { titleKey: 'impostazioni_group_tools', slugs: ['visibility_management', 'master_control_panel'] },
];

const SLUG_ICONS: Record<string, typeof LayoutGrid> = {
  visibility_management: LayoutGrid,
  department_creation: Building2,
  violation_rules: ShieldAlert,
  master_control_panel: Zap,
  auto_breaks: Coffee,
  geofence_punch: MapPin,
};

type ImpostazioniPageProps = {
  onOpenProfilesTab?: () => void;
};

const demoProfileSelectClass =
  'w-full max-w-md px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent';

export default function ImpostazioniPage({ onOpenProfilesTab }: ImpostazioniPageProps) {
  const {
    currentUser,
    users,
    featureFlags,
    setFeatureFlag,
    effectiveLanguage,
    showSuccess,
    showError,
    silentRefreshData,
    hardReloadFromDatabase,
    isGlobalRefreshing,
    dataSyncInProgress,
    seedDemoProfileForUser,
  } = useApp();
  const t = getTranslations(effectiveLanguage);
  const [howOpen, setHowOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<Record<string, boolean>>({});
  const [cloudSyncing, setCloudSyncing] = useState(false);
  const [hardReloading, setHardReloading] = useState(false);
  const syncBusy = cloudSyncing || hardReloading || isGlobalRefreshing || dataSyncInProgress;

  const toggleDetail = useCallback((slug: string) => {
    setDetailOpen((prev) => ({ ...prev, [slug]: !prev[slug] }));
  }, []);

  const demoProfileCandidates = useMemo(
    () =>
      users
        .filter((u) => u.status === 'active' && !isPurelyManagementRole(u.role))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [users]
  );

  const [demoProfileTargetUserId, setDemoProfileTargetUserId] = useState('');
  const [seedingDemoProfile, setSeedingDemoProfile] = useState(false);

  useEffect(() => {
    const valid =
      demoProfileTargetUserId &&
      demoProfileCandidates.some((u) => u.id === demoProfileTargetUserId);
    if (valid) return;
    setDemoProfileTargetUserId(demoProfileCandidates[0]?.id ?? '');
  }, [demoProfileCandidates, demoProfileTargetUserId]);

  if (!currentUser) return null;
  if (!isAdminOnly(currentUser)) {
    return (
      <div className="pb-content pt-6 w-full px-4 sm:px-6 font-sans min-h-full">
        <p className="text-slate-600 text-sm">{t.no_access_settings}</p>
      </div>
    );
  }

  const renderCard = (slug: string) => {
    const def = FEATURE_DEFINITIONS.find((f) => f.slug === slug);
    const enabled = featureFlags[slug] ?? (def?.defaultEnabled ?? true);
    const Icon = SLUG_ICONS[slug] ?? Zap;
    const { label, description, detailLines } = getFeatureStrings(t, slug);
    const detailsExpanded = detailOpen[slug] === true;
    const hasDetails = detailLines.length > 0;

    return (
      <div
        key={slug}
        className="rounded-xl border border-slate-200 bg-white p-3.5 sm:p-4 shadow-sm hover:border-slate-300/90 transition-colors h-full flex flex-col"
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-[18px] h-[18px] text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 leading-tight">{label}</p>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1 leading-snug">{description}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label={label}
                onClick={async () => {
                  const next = !enabled;
                  await setFeatureFlag?.(slug, next);
                  showSuccess?.(
                    formatTrans(next ? t.settings_feature_toggle_on : t.settings_feature_toggle_off, {
                      name: label,
                    })
                  );
                }}
                className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 mt-0.5 ${enabled ? 'bg-accent' : 'bg-slate-200'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </div>

            {hasDetails && (
              <>
                <button
                  type="button"
                  aria-expanded={detailsExpanded}
                  onClick={() => toggleDetail(slug)}
                  className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-accent hover:text-accent/80"
                >
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${detailsExpanded ? 'rotate-180' : ''}`}
                  />
                  {t.impostazioni_toggle_details}
                </button>
                <AnimatePresence initial={false}>
                  {detailsExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-lg border border-slate-100 bg-slate-50/90 px-2.5 py-2 mt-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          {t.impostazioni_detail_label}
                        </p>
                        <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-3.5 leading-relaxed">
                          {detailLines.map((line, i) => (
                            <li key={i}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="pb-content pt-6 w-full px-4 sm:px-6 font-sans min-h-full">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="max-w-5xl"
      >
        <header className="mb-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">
            {t.impostazioni_page_subtitle}
          </p>
          <h1 className="text-slate-800 text-xl font-semibold tracking-tight">{t.settings_title}</h1>
          <p className="text-slate-600 text-sm mt-2 leading-relaxed max-w-3xl">{t.impostazioni_page_lead}</p>

          <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-2 sm:gap-3 max-w-3xl">
            <p className="text-xs text-slate-500">{t.impostazioni_duplicate_hint}</p>
            {onOpenProfilesTab && (
              <button
                type="button"
                onClick={onOpenProfilesTab}
                className="inline-flex items-center gap-1.5 self-start rounded-lg border border-accent/25 bg-accent/[0.07] px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent/12 transition-colors"
              >
                <Users className="w-3.5 h-3.5 opacity-80" />
                {t.impostazioni_open_profiles}
              </button>
            )}
            <button
              type="button"
              disabled={syncBusy}
              onClick={async () => {
                setCloudSyncing(true);
                try {
                  await silentRefreshData({ pullRemoteConfig: true });
                  showSuccess?.(t.settings_cloud_sync_success);
                } finally {
                  setCloudSyncing(false);
                }
              }}
              className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-50 disabled:pointer-events-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cloudSyncing ? 'animate-spin' : ''}`} aria-hidden />
              {t.settings_cloud_sync_button}
            </button>
            <button
              type="button"
              disabled={syncBusy}
              onClick={async () => {
                if (!window.confirm(t.hard_reload_confirm)) return;
                setHardReloading(true);
                try {
                  await hardReloadFromDatabase();
                } finally {
                  setHardReloading(false);
                }
              }}
              className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-900 hover:bg-amber-100/90 hover:border-amber-300 disabled:opacity-50 disabled:pointer-events-none"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${hardReloading ? 'animate-spin' : ''}`} aria-hidden />
              {t.hard_reload_button}
            </button>
          </div>
          <p className="text-[11px] text-slate-500 mt-2 max-w-3xl leading-relaxed">{t.hard_reload_hint}</p>
          {onOpenProfilesTab && (
            <p className="text-[11px] text-slate-400 mt-1.5 max-w-3xl">{t.impostazioni_master_panel_scroll_hint}</p>
          )}

          <div className="mt-4 max-w-3xl rounded-xl border border-slate-200/90 bg-white/80 overflow-hidden">
            <button
              type="button"
              aria-expanded={howOpen}
              onClick={() => setHowOpen((o) => !o)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50/80 transition-colors"
            >
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {t.impostazioni_page_how_title}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${howOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {howOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                  className="overflow-hidden border-t border-slate-100"
                >
                  <p className="px-3 py-3 text-[12px] text-slate-600 leading-relaxed">{t.impostazioni_page_how_body}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        <div className="space-y-6">
          {IMPOSTAZIONI_GROUPS.map((group) => (
            <section key={group.titleKey}>
              <h2 className="ui-section-title mb-2.5 text-slate-400">
                {t[group.titleKey]}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{group.slugs.map((slug) => renderCard(slug))}</div>
            </section>
          ))}
        </div>

        <section
          className="mt-8 rounded-xl border-2 border-emerald-400/90 bg-emerald-50/90 p-4 sm:p-5 space-y-3 shadow-sm"
          aria-label={t.impostazioni_demo_profile_title}
        >
          <h2 className="text-sm font-bold text-emerald-950 uppercase tracking-wide">
            {t.impostazioni_demo_profile_title}
          </h2>
          <p className="text-xs text-emerald-900/85 leading-relaxed max-w-2xl">{t.impostazioni_demo_profile_lead}</p>
          <div className="space-y-2 max-w-md">
            <label
              htmlFor="osteria-demo-profile-user-impostazioni"
              className="block text-[10px] font-bold uppercase tracking-wider text-emerald-900/80"
            >
              {t.settings_seed_demo_profile_pick_user}
            </label>
            {demoProfileCandidates.length === 0 ? (
              <p className="text-xs text-amber-900 bg-amber-100 border border-amber-300/80 rounded-lg px-3 py-2">
                {t.settings_seed_demo_profile_no_staff}
              </p>
            ) : (
              <select
                id="osteria-demo-profile-user-impostazioni"
                value={demoProfileTargetUserId}
                onChange={(e) => setDemoProfileTargetUserId(e.target.value)}
                className={demoProfileSelectClass}
              >
                {demoProfileCandidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {[u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              disabled={
                seedingDemoProfile ||
                !demoProfileTargetUserId ||
                demoProfileCandidates.length === 0
              }
              onClick={async () => {
                if (!window.confirm(t.settings_seed_demo_profile_confirm)) return;
                setSeedingDemoProfile(true);
                try {
                  await seedDemoProfileForUser(demoProfileTargetUserId);
                  showSuccess?.(t.settings_seed_demo_profile_done);
                } catch (e) {
                  showError?.(e instanceof Error ? e.message : t.settings_seed_demo_profile_error);
                } finally {
                  setSeedingDemoProfile(false);
                }
              }}
              className="w-full px-3 py-3 rounded-xl bg-emerald-600 border border-emerald-700 text-white text-xs font-bold uppercase tracking-wider hover:bg-emerald-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              {seedingDemoProfile ? t.ui_ellipsis : t.settings_seed_demo_profile_btn}
            </button>
          </div>
        </section>
      </motion.div>
    </div>
  );
}
