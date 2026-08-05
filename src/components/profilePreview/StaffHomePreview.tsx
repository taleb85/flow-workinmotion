import { Clock, Palmtree, ChevronRight, TrendingUp } from 'lucide-react';
import type { User, Language } from '../../types';
import { getTranslations } from '../../utils/translations';
import { WidgetChrome } from './WidgetChrome';

export default function StaffHomePreview({
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
  const name = previewUser.first_name?.trim() || t.profile_visibility_filter_staff;

  return (
    <div className="flex flex-col gap-4 font-sans">
      <WidgetChrome
        widgetKey="staff_home.header_kpi"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100" >
          <h2 className="text-xl font-bold text-white">
            {t.home_greeting.replace('{name}', name)}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-xl border border-neutral-500 !rounded-full px-3 py-1 text-xs font-semibold text-white/70 border border-slate-100">
              24h {t.approved_hours_summary?.toLowerCase() ?? 'approvate'}
            </span>
            <span className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-bold text-accent">
              3 {t.upcoming_shifts?.toLowerCase() ?? 'turni'}
            </span>
          </div>
        </div>
      </WidgetChrome>

      <WidgetChrome
        widgetKey="staff_home.month_hours"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 flex items-center justify-between p-4 shadow-sm border border-slate-100" >
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50">{t.hours_this_month}</p>
            <p className="text-2xl font-bold text-white">32:00</p>
          </div>
          <TrendingUp className="h-8 w-8 text-accent/40" />
        </div>
      </WidgetChrome>

      <WidgetChrome
        widgetKey="staff_home.today_shift"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-2xl bg-accent p-5 shadow-md">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">{t.scheduled_today}</p>
          <p className="mt-1 text-2xl font-bold text-white">10:00 – 16:00</p>
          <p className="mt-2 flex items-center gap-1 text-xs text-white/70">
            <Clock className="h-3.5 w-3.5" /> {t.lunch}
          </p>
        </div>
      </WidgetChrome>

      <WidgetChrome
        widgetKey="staff_home.upcoming"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-xs font-bold uppercase tracking-wider text-white/70">{t.upcoming_shifts}</span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </div>
          <div className="divide-y divide-slate-50 px-4 py-2 text-sm text-white/80">
            <p className="py-2">Mar 12:00–18:00</p>
            <p className="py-2">Gio 18:00–23:00</p>
          </div>
        </div>
      </WidgetChrome>

      <WidgetChrome
        widgetKey="staff_home.holidays_button"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <button
          type="button"
          tabIndex={-1}
className="rounded-xl border border-neutral-500 surface-ghost-interactive flex min-h-[52px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
              <Palmtree className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-white/80">{t.sidebar_holidays}</p>
              <p className="text-sm text-white/60">{t.holiday_management}</p>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-slate-300" />
        </button>
      </WidgetChrome>
    </div>
  );
}
