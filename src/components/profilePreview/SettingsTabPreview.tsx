import { Bell, Globe, ShieldCheck, User as UserIcon, Users } from 'lucide-react';
import type { User, Language } from '../../types';
import { getTranslations } from '../../utils/translations';
import { WidgetChrome } from './WidgetChrome';

export default function SettingsTabPreview({
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
  const name = `${previewUser.first_name ?? ''} ${previewUser.last_name ?? ''}`.trim() || 'Profilo';

  return (
    <div className="flex flex-col gap-4 font-sans">
      <WidgetChrome
        widgetKey="staff_profile.panel"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/15 text-lg font-bold text-accent">
                {(previewUser.first_name?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-white" title={name}>{name}</p>
                <p className="text-xs text-white/60">{previewUser.email ?? 'email@…'}</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {[
              { Icon: UserIcon, label: t.profile_settings },
              { Icon: Bell, label: t.profile_notifications },
              { Icon: Globe, label: t.language },
              { Icon: ShieldCheck, label: t.pin_for_profile },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-3 px-4 py-3">
                <Icon className="h-5 w-5 text-white/50" />
                <span className="text-sm font-medium text-white/90">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </WidgetChrome>
    </div>
  );
}

export function GlobalPopupsPreview({
  previewUser,
  isSelectedAdmin,
  onUiToggle,
  hiddenBadge,
}: {
  previewUser: User;
  isSelectedAdmin: boolean;
  onUiToggle: (key: string, visible: boolean) => void;
  hiddenBadge: string;
}) {
  return (
    <div className="space-y-2 mt-4 pt-4 border-t border-slate-200">
      <p className="px-1 text-[0.5625rem] font-bold uppercase tracking-wider text-white/60">Menu e Popup Globali</p>
      
      <WidgetChrome
        widgetKey="global.quick_switch"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <Users className="h-5 w-5 text-white/60" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white/90">Cambio rapido utente</p>
            <p className="mt-0.5 text-[0.625rem] leading-relaxed text-white/60">Pressione lunga sull'avatar</p>
          </div>
        </div>
      </WidgetChrome>

      <WidgetChrome
        widgetKey="global.notifications"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <Bell className="h-5 w-5 text-white/60" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white/90">Centro notifiche</p>
            <p className="mt-0.5 text-[0.625rem] leading-relaxed text-white/60">Icona campanella nell'header</p>
          </div>
        </div>
      </WidgetChrome>
    </div>
  );
}
