import { Plus, Palmtree } from 'lucide-react';
import type { User, Language } from '../../types';
import { getTranslations } from '../../utils/translations';
import { WidgetChrome } from './WidgetChrome';

export default function FerieMgmtPreview({
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
        widgetKey="ferie.header"
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
className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-bold text-white shadow-sm transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          >
            <Plus className="h-4 w-4" />
            {t.new_request}
          </button>
        </div>
      </WidgetChrome>

      <WidgetChrome
        widgetKey="ferie.calendar"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 p-3">
          <p className="mb-2 text-center text-xs font-bold text-white/70">Marzo 2026</p>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px]">
            {['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((d, i) => (
              <span key={`h-${i}`} className="font-bold text-white/50">
                {d}
              </span>
            ))}
            {Array.from({ length: 28 }, (_, i) => (
              <span
                key={i}
                className={`rounded-lg py-1 ${i === 10 ? 'bg-accent/20 font-bold text-accent-dark ring-1 ring-accent/30' : 'text-white/70'}`}
              >
                {i + 1}
              </span>
            ))}
          </div>
        </div>
      </WidgetChrome>

      <WidgetChrome
        widgetKey="ferie.list"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 overflow-hidden">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-bold text-white/70">
            {t.mod_vacation_requests}
          </div>
          <div className="divide-y divide-slate-50">
            <div className="flex items-center gap-3 px-3 py-3">
              <Palmtree className="h-8 w-8 shrink-0 text-accent/60" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white/90">Jean · Ferie</p>
                <p className="text-xs text-white/60">15–19 mar</p>
              </div>
              <span className="shrink-0 rounded-lg bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                {t.pending ?? 'In attesa'}
              </span>
            </div>
          </div>
        </div>
      </WidgetChrome>
    </div>
  );
}
