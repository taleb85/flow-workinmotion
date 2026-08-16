import { Calendar, Clock } from 'lucide-react';
import type { User, Language } from '../../types';
import { getTranslations } from '../../utils/translations';
import { WidgetChrome } from './WidgetChrome';

export default function StaffShiftsPreview({
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
        widgetKey="staff_shifts.summary"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 p-4 shadow-sm border border-slate-100" >
          <p className="text-[0.625rem] font-bold uppercase tracking-widest text-white/50">{t.approved_hours_summary}</p>
          <p className="mt-1 text-2xl font-bold text-white">24:00</p>
          <p className="mt-1 text-xs text-white/60">{t.hours_this_month}</p>
        </div>
      </WidgetChrome>

      <WidgetChrome
        widgetKey="staff_shifts.table"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-neutral-500 overflow-hidden shadow-sm border border-slate-100" >
          <div className="flex items-center gap-2 border-b border-slate-50 px-3 py-2.5">
            <Calendar className="h-4 w-4 text-white/50" />
            <span className="text-xs font-bold text-white/80">{t.sidebar_shifts}</span>
          </div>
          <div className="divide-y divide-slate-50 p-2">
            {[
              { d: 'Lun 10', h: '10:00 – 16:00' },
              { d: 'Mar 11', h: '18:00 – 23:00' },
              { d: 'Mer 12', h: '12:00 – 18:00' },
            ].map((row) => (
              <div key={row.d} className="flex items-center justify-between gap-2 px-2 py-2.5 text-sm">
                <span className="font-semibold text-white/90">{row.d}</span>
                <span className="flex items-center gap-1 text-white/70">
                  <Clock className="h-3.5 w-3.5" />
                  {row.h}
                </span>
              </div>
            ))}
          </div>
        </div>
      </WidgetChrome>
    </div>
  );
}
