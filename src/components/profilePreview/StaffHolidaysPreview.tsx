import { Plus, Palmtree } from 'lucide-react';
import type { User, Language } from '../../types';
import { getTranslations } from '../../utils/translations';
import { WidgetChrome } from './WidgetChrome';

export default function StaffHolidaysPreview({
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

  return (
    <div className="flex flex-col gap-4 font-sans">
      <WidgetChrome
        widgetKey="staff_holidays.header_actions"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white">{t.sidebar_holidays}</h2>
            <p className="text-xs text-white/60">{t.holiday_management}</p>
          </div>
          <button
            type="button"
            tabIndex={-1}
className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-bold text-accent transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          >
            <Plus className="h-4 w-4" />
            {t.new_request}
          </button>
        </div>
      </WidgetChrome>

      <WidgetChrome
        widgetKey="staff_holidays.list"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 overflow-hidden">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold text-white/70">
            {t.mod_vacation_requests}
          </div>
          <div className="flex items-center gap-3 px-3 py-4">
            <Palmtree className="h-8 w-8 shrink-0 text-accent/50" />
            <div>
              <p className="text-sm font-semibold text-white/90">Ferie estive</p>
              <p className="text-xs text-white/60">1–7 ago · {t.approved ?? 'Approvata'}</p>
            </div>
          </div>
        </div>
      </WidgetChrome>
    </div>
  );
}
