/**
 * Scheda Impostazioni — attiva/disattiva le funzioni disponibili per i profili.
 * Solo Admin. Le modifiche sono immediate e salvate in DB o localStorage.
 */
import { useState, useCallback, useEffect, memo, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid,
  Building2,
  ShieldAlert,
  Zap,
  Coffee,
  ChevronDown,
  MapPin,
} from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { getFeatureStrings, formatTrans } from '../utils/translations';
import { isAdminOnly } from '../utils/permissions';
import { translateRole } from '../utils/roles';
import { FEATURE_DEFINITIONS } from '../utils/featureFlags';
// import { RoleFeatureTemplatesPanel } from './RoleFeatureTemplatesPage'; // unused

const IMPOSTAZIONI_GROUPS: readonly {
  readonly titleKey: 'impostazioni_group_org' | 'impostazioni_group_rules' | 'impostazioni_group_tools';
  readonly slugs: readonly string[];
}[] = [
  { titleKey: 'impostazioni_group_org', slugs: ['department_creation'] },
  { titleKey: 'impostazioni_group_rules', slugs: ['auto_breaks'] },
];

const ADVANCED_SLUGS: readonly string[] = [
  'violation_rules',
  'geofence_punch',
  'visibility_management',
  'master_control_panel',
];

const SLUG_ICONS: Record<string, typeof LayoutGrid> = {
  visibility_management: LayoutGrid,
  department_creation: Building2,
  violation_rules: ShieldAlert,
  master_control_panel: Zap,
  auto_breaks: Coffee,
  geofence_punch: MapPin,
};

interface FeatureCardProps {
  slug: string;
  enabled: boolean;
  label: string;
  description: string;
  detailLines: string[];
  detailsExpanded: boolean;
  toggleDetailLabel: string;
  featureOnLabel: string;
  featureOffLabel: string;
  detailLabel: string;
  onToggle: () => void;
  onToggleDetail: () => void;
}

const FeatureCard = memo(function FeatureCard({
  slug,
  enabled,
  label,
  description,
  detailLines,
  detailsExpanded,
  toggleDetailLabel,
  featureOnLabel: _featureOnLabel,
  featureOffLabel: _featureOffLabel,
  detailLabel,
  onToggle,
  onToggleDetail,
}: FeatureCardProps) {
  const Icon = SLUG_ICONS[slug] ?? Zap;
  const hasDetails = detailLines.length > 0;
  return (
    <div className="rounded-xl border border-neutral-500 flex h-full flex-col p-3.5 transition-colors surface-ghost-interactive hover:border-white/20 sm:p-4 active:brightness-95">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
          <Icon className="w-[18px] h-[18px] text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight text-white/90">{label}</p>
              <p className="text-[11px] sm:text-xs text-white/60 mt-1 leading-snug">{description}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={label}
              onClick={onToggle}
              className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/35 focus:ring-offset-2 ${enabled ? 'bg-accent' : ''}`}
            >
              <span
                className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full toggle-knob transition-all duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </div>
          {hasDetails && (
            <>
              <button
                type="button"
                aria-expanded={detailsExpanded}
                onClick={onToggleDetail}
className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-white/70 transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${detailsExpanded ? 'rotate-180' : ''}`} />
                {toggleDetailLabel}
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
                    <div className="rounded-xl border border-neutral-500 mt-2 bg-white/5 px-2.5 py-2">
                      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60">
                        {detailLabel}
                      </p>
                      <ul className="list-disc space-y-1 pl-3.5 text-[11px] leading-relaxed text-white/70">
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
});

type ImpostazioniPageProps = {
  onOpenProfilesTab?: () => void;
};

export default function ImpostazioniPage({ onOpenProfilesTab: _onOpenProfilesTab }: ImpostazioniPageProps) {
  const { currentUser, effectiveLanguage, logout, isSessionElevated } = useAppUser();
  const { featureFlags, setFeatureFlag } = useAppConfig();
  const { showSuccess, showError } = useAppOverlay();
  const t = useT();
  const [_howOpen, _setHowOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Chiudi tutti i dettagli all'avvio per la modalità compatta
    setDetailOpen({});
  }, []);

  const toggleDetail = useCallback((slug: string) => {
    setDetailOpen((prev) => ({ ...prev, [slug]: !prev[slug] }));
  }, []);

  const renderCard = useCallback((slug: string) => {
    const def = FEATURE_DEFINITIONS.find((f) => f.slug === slug);
    const enabled = featureFlags[slug] ?? (def?.defaultEnabled ?? true);
    const { label, description, detailLines } = getFeatureStrings(t, slug);
    const detailsExpanded = detailOpen[slug] === true;
    return (
      <FeatureCard
        key={slug}
        slug={slug}
        enabled={enabled}
        label={label}
        description={description}
        detailLines={detailLines}
        detailsExpanded={detailsExpanded}
        toggleDetailLabel={t.impostazioni_toggle_details}
        featureOnLabel={t.settings_feature_toggle_on}
        featureOffLabel={t.settings_feature_toggle_off}
        detailLabel={t.impostazioni_detail_label}
        onToggle={async () => {
          const next = !enabled;
          await setFeatureFlag?.(slug, next);
          showSuccess?.(
            formatTrans(next ? t.settings_feature_toggle_on : t.settings_feature_toggle_off, { name: label })
          );
        }}
        onToggleDetail={() => toggleDetail(slug)}
      />
    );
  }, [featureFlags, detailOpen, t, setFeatureFlag, showSuccess, toggleDetail]);

  const hasFullAccess = useMemo(
    () => currentUser ? isAdminOnly(currentUser) || isSessionElevated || !!currentUser.elevated_role : false,
    [currentUser, isSessionElevated]
  );
  if (!currentUser) return null;
  if (!hasFullAccess) {
    return (
      <div className="pb-content pt-6 w-full app-horizontal-pad font-sans">
        <div className="rounded-xl border border-neutral-500 p-4 rounded-xl mb-6">
          <h2 className="text-lg font-bold mb-1">{t.settings_current_user || 'Utente attuale'}</h2>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-accent">{currentUser.first_name} {currentUser.last_name}</span>
            <span className="text-xs bg-white/15 rounded px-2 py-0.5 ml-2 text-white/70">{translateRole(currentUser.role, effectiveLanguage as 'it' | 'en' | 'es' | 'fr')}</span>
          </div>
          <button
            className="mt-3 px-3 py-1.5 rounded-lg border border-red-500/50 bg-red-500/20 text-[#fca5a5] font-semibold hover:bg-red-500/30 transition-colors active:bg-red-500/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            onClick={logout}
          >
            {t.logout || 'Logout'}
          </button>
        </div>
        <p className="text-white/70 text-sm">{t.no_access_settings}</p>
      </div>
    );
  }

  return (
    <div className="pb-content pt-6 w-full app-horizontal-pad font-sans">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full"
      >
        {/* Divider */}
        <div className="h-px bg-white/10 rounded my-6" />

      </motion.div>
    </div>
  );
}
