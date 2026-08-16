import { Calendar, ClipboardList, Clock, Home, Info, Layout, MousePointer2, ShieldCheck } from 'lucide-react';
import type { User, Language } from '../../types';
import { getTranslations } from '../../utils/translations';
import { widgetAppliesToUser, type UiScreenWidgetDef } from '../../utils/uiScreenWidgets';
import { WidgetChrome } from './WidgetChrome';

function getWidgetIcon(key: string, group: string) {
  if (key.includes('modal') || key.includes('popup')) return MousePointer2;
  if (group === 'global_popups') return Layout;
  if (group.startsWith('home_mgmt')) return Home;
  if (group.startsWith('home_compact')) return Home;
  if (group.startsWith('staff_home')) return Home;
  if (group.startsWith('turni')) return Calendar;
  if (group.startsWith('timesheet')) return ClipboardList;
  if (group.startsWith('ferie')) return Calendar;
  if (group.startsWith('stats')) return Clock;
  if (group.startsWith('staff_profile')) return ShieldCheck;
  return Info;
}

export default function GenericWidgetsColumn({
  groups,
  previewUser,
  isSelectedAdmin,
  onUiToggle,
  language,
}: {
  groups: { groupKey: string; widgets: UiScreenWidgetDef[] }[];
  previewUser: User;
  isSelectedAdmin: boolean;
  onUiToggle: (key: string, visible: boolean) => void;
  language: Language;
}) {
  const t = getTranslations(language);
  const tv = t as Record<string, string>;
  const hiddenBadge = tv.profile_visibility_ui_hidden_badge ?? 'Nascosto';

  return (
    <div className="flex flex-col gap-4">
      {groups.map(({ groupKey, widgets: applicable }) => {
        const sub = applicable[0]?.screenLabel ?? groupKey;
        return (
          <div key={groupKey} className="space-y-2">
            <p className="px-1 text-[0.5625rem] font-bold uppercase tracking-wider text-white/60">{sub}</p>
            <div className="space-y-3">
              {applicable
                .filter((w) => widgetAppliesToUser(w, previewUser.role))
                .map((w) => {
                  const Icon = getWidgetIcon(w.key, groupKey);
                  return (
                    <WidgetChrome
                      key={w.key}
                      widgetKey={w.key}
                      previewUser={previewUser}
                      isSelectedAdmin={isSelectedAdmin}
                      onUiToggle={onUiToggle}
                      hiddenBadge={hiddenBadge}
                    >
                      <div
                        className="rounded-xl border border-neutral-500 flex items-center gap-3 px-4 py-3"
                        title={w.key}
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                          <Icon className="h-5 w-5 text-white/60" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white/90">{w.label}</p>
                          <p className="mt-0.5 text-[0.625rem] leading-relaxed text-white/60">
                            {tv.profile_visibility_generic_widget_demo ??
                              'Contenuto dimostrativo: in app qui compariranno i dati reali.'}
                          </p>
                        </div>
                      </div>
                    </WidgetChrome>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
