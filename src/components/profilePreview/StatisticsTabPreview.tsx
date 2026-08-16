import { BarChart3, Filter } from 'lucide-react';
import type { User, Language } from '../../types';
import { getTranslations } from '../../utils/translations';
import { uiWidgetKeyAppliesToUser } from '../../utils/uiScreenWidgets';
import { WidgetChrome } from './WidgetChrome';

export default function StatisticsTabPreview({
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
  const role = previewUser.role;
  const show = (key: string) => uiWidgetKeyAppliesToUser(role, key);

  return (
    <div className="flex flex-col gap-4 font-sans">
      {show('stats.title') && (
      <WidgetChrome
        widgetKey="stats.title"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <BarChart3 className="h-5 w-5 text-white/60" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white/90">{t.stats_title}</p>
            <p className="mt-0.5 text-[0.625rem] leading-relaxed text-white/60">
              {tv.profile_visibility_generic_widget_demo ?? 'Contenuto dimostrativo: in app qui compariranno i dati reali.'}
            </p>
          </div>
        </div>
      </WidgetChrome>
      )}

      {show('stats.mgmt_filters') && (
      <WidgetChrome
        widgetKey="stats.mgmt_filters"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
            <Filter className="h-5 w-5 text-white/60" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white/90">{t.stats_preset_period}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[0.625rem] font-semibold text-white/80">
                {t.stats_preset_current_month}
              </span>
              <span className="rounded-lg border border-slate-200 px-2 py-0.5 text-[0.625rem] font-semibold text-white/60">
                PDF Export
              </span>
            </div>
          </div>
        </div>
      </WidgetChrome>
      )}

      {show('stats.table') && (
      <WidgetChrome
        widgetKey="stats.table"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 overflow-hidden text-xs">
          <div className="grid grid-cols-3 gap-px bg-slate-200 font-bold text-white/70">
            <div className="bg-slate-50 px-2 py-2">{t.stats_preset_period}</div>
            <div className="bg-slate-50 px-2 py-2 text-center">Ore</div>
            <div className="bg-slate-50 px-2 py-2 text-center">Δ</div>
            <div className="bg-slate-50 px-2 py-2 text-white/90">W10</div>
            <div className="bg-slate-50 px-2 py-2 text-center text-white/90">40:00</div>
            <div className="bg-slate-50 px-2 py-2 text-center text-accent">+2</div>
          </div>
        </div>
      </WidgetChrome>
      )}

      {show('stats.staff_summary') && (
      <WidgetChrome
        widgetKey="stats.staff_summary"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 p-4">
          <p className="text-[0.625rem] font-bold uppercase tracking-wider text-white/50">{t.mod_stats_hours}</p>
          <p className="mt-1 text-2xl font-bold text-white">24:00</p>
          <p className="text-xs text-white/60">{t.stats_preset_current_week}</p>
        </div>
      </WidgetChrome>
      )}
    </div>
  );
}
