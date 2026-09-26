import { Bell, ChevronRight, Languages, Palette, Settings2, ShieldCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { User, Language } from '../../types';
import { getTranslations } from '../../utils/translations';
import { isManagementRole } from '../../utils/permissions';
import { translateRole } from '../../utils/roles';
import { WidgetChrome } from './WidgetChrome';

/**
 * Anteprima in miniatura della scheda "Profilo" (bottom bar).
 * Rispecchia ProfileNavTabPanel: hero (avatar + nome + email + badge ruolo) e
 * menu accordion. Testi `text-[…]` ridotti: voluti per la scala anteprima.
 */
export default function ProfileTabPanelPreview({
  previewUser,
  language,
  isSelectedAdmin,
  onUiToggle,
}: {
  previewUser: User;
  language: Language;
  isSelectedAdmin: boolean;
  onUiToggle: (key: string, visible: boolean) => void;
}) {
  const t = getTranslations(language);
  const tv = t as Record<string, string>;
  const hiddenBadge = tv.profile_visibility_ui_hidden_badge ?? 'Nascosto';

  const name = `${previewUser.first_name ?? ''} ${previewUser.last_name ?? ''}`.trim() || 'Utente';
  const initial = (previewUser.first_name?.[0] ?? '?').toUpperCase();
  const roleDisplay = translateRole(previewUser.role, language);

  const rows: { Icon: LucideIcon; label: string }[] = [
    { Icon: Settings2, label: t.profile_settings ?? 'Impostazioni profilo' },
    { Icon: Bell, label: t.profile_notifications ?? 'Notifiche' },
    { Icon: Languages, label: t.language ?? 'Lingua' },
    { Icon: Palette, label: t.bg_picker_row ?? 'Sfondo' },
    { Icon: ShieldCheck, label: t.pin_for_profile ?? 'Sicurezza' },
  ];
  if (isManagementRole(previewUser.role)) {
    rows.push({ Icon: Settings2, label: t.settings_panel_title ?? 'Pannello Admin' });
  }

  return (
    <div className="flex flex-col gap-4 font-sans">
      <WidgetChrome
        widgetKey="staff_profile.panel"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="overflow-hidden rounded-xl border border-white/[0.14]">
          {/* ── Hero: avatar + nome + email + badge ruolo ── */}
          <div className="border-b border-white/10 px-4 py-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div
                className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.14] text-xl font-bold"
                style={{ background: 'rgba(255,255,255,0.10)', color: '#a5b4fc' }}
              >
                {initial}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white" title={name}>{name}</p>
                <p className="truncate text-xs text-white/60" title={previewUser.email}>{previewUser.email ?? 'email@…'}</p>
              </div>
              <span
                className="text-[0.625rem] font-bold px-2.5 py-0.5 rounded-[var(--flow-radius-sm)] uppercase tracking-wider"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.20)',
                  color: 'rgba(255,255,255,0.65)',
                }}
              >
                {roleDisplay}
              </span>
            </div>
          </div>

          {/* ── Menu accordion (icone + etichetta + chevron) ── */}
          <div className="divide-y divide-white/10">
            {rows.map(({ Icon, label }, i) => (
              <div key={`${label}-${i}`} className="flex items-center gap-3 px-4 py-3">
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: 'rgba(99, 102, 241, 0.30)' }}
                >
                  <Icon className="h-4 w-4" style={{ color: '#a5b4fc' }} aria-hidden />
                </div>
                <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.92)' }} title={label}>
                  {label}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'rgba(165, 180, 252, 0.60)' }} aria-hidden />
              </div>
            ))}
          </div>
        </div>
      </WidgetChrome>
    </div>
  );
}
