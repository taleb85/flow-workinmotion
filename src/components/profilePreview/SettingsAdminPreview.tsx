import { ChevronDown, Info } from 'lucide-react';
import type { User, Language } from '../../types';
import { getTranslations } from '../../utils/translations';

/**
 * Anteprima STATICA della scheda "Admin / Impostazioni" (pannello gestionale).
 * Rispecchia SettingsPage: elenco delle sezioni accordion reali, nello stesso
 * ordine. Nessun WidgetChrome: sono impostazioni globali, non toggle per-utente.
 */
export default function SettingsAdminPreview({
  previewUser: _previewUser,
  language,
  isSelectedAdmin: _isSelectedAdmin,
  onUiToggle: _onUiToggle,
}: {
  previewUser: User;
  language: Language;
  isSelectedAdmin: boolean;
  onUiToggle: (key: string, visible: boolean) => void;
}) {
  const t = getTranslations(language);

  const sections: { title: string; subtitle?: string }[] = [
    { title: t.settings_team_section_title ?? 'Team' },
    { title: t.settings_departments_section_title ?? 'Reparti' },
    { title: t.settings_violation_rules_title ?? 'Regole violazioni', subtitle: t.settings_violation_rules_subtitle },
    { title: t.settings_auto_breaks_section ?? 'Pause automatiche' },
    { title: t.settings_week_template_title ?? 'Template Settimana' },
    { title: t.settings_attendance_periods_title ?? 'Periodi Presenze' },
    { title: t.settings_presence_accordion_title ?? 'Presenze', subtitle: t.settings_presence_accordion_subtitle },
    { title: 'Email ferie', subtitle: 'Nessuna email configurata' },
    { title: t.settings_master_panel_title ?? 'Master Panel', subtitle: t.settings_master_panel_sub },
    { title: t.settings_advanced_tools_admin ?? 'Strumenti avanzati' },
    { title: t.settings_admin_tab_access ?? 'Accesso scheda Admin', subtitle: t.settings_admin_tab_access_sub },
  ];

  return (
    <div className="flex flex-col gap-4 font-sans">
      <div className="overflow-hidden rounded-xl border border-white/[0.14]">
        {/* Intestazione pannello */}
        <div className="border-b border-white/10 px-4 py-3">
          <p className="text-sm font-bold text-white">{t.settings_panel_title ?? 'Pannello Admin'}</p>
          <p className="mt-0.5 text-[0.625rem] text-white/55">Area gestionale riservata</p>
        </div>

        {/* Sezioni accordion (statiche) */}
        <div className="divide-y divide-white/10">
          {sections.map(({ title, subtitle }, i) => (
            <div key={`${title}-${i}`} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.8125rem] font-semibold uppercase tracking-wide text-white" title={title}>
                  {title}
                </p>
                {subtitle ? (
                  <p className="mt-0.5 truncate text-[0.625rem] leading-snug text-white/55" title={subtitle}>
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
            </div>
          ))}
        </div>

        {/* Nota: impostazioni globali, non del singolo utente */}
        <div className="flex items-start gap-2 border-t border-white/10 px-4 py-3">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/50" aria-hidden />
          <p className="text-[0.625rem] leading-relaxed text-white/55">
            Impostazioni globali Admin: valide per tutta l&apos;app, non per il singolo utente.
          </p>
        </div>
      </div>
    </div>
  );
}
