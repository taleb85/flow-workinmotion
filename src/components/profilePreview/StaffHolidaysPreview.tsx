/**
 * Anteprima "Cosa vede chi" — Ferie personali staff.
 * Rispecchia src/components/mobile/MobileRequests.tsx.
 * Testi `text-[0.625rem]` voluti: anteprima in scala ridotta.
 */
import { Plus, CheckCircle2, AlertCircle } from 'lucide-react';
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

  // DATI DIMOSTRATIVI FISSI PER ANTEPRIMA
  const requests = [
    {
      key: 'approved',
      created: '28 lug 2026',
      range: '1 – 7 ago',
      statusLabel: t.holiday_status_approved ?? 'Approvata',
      reason: 'Vacanze estive',
    },
    {
      key: 'pending',
      created: '10 set 2026',
      range: '18 – 20 set',
      statusLabel: t.holiday_status_pending ?? 'In attesa',
      reason: '',
    },
  ];

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Intestazione + nuova richiesta */}
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
            <p className="text-[0.6875rem] text-white/60">{t.holiday_management}</p>
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/40 bg-white/10 px-3 py-2 text-xs font-bold text-accent"
          >
            <Plus className="h-4 w-4" />
            {t.new_request ?? 'Nuova richiesta'}
          </button>
        </div>
      </WidgetChrome>

      {/* Elenco richieste */}
      <WidgetChrome
        widgetKey="staff_holidays.list"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="flex flex-col gap-3">
          {requests.map((req) => {
            const approved = req.key === 'approved';
            const Icon = approved ? CheckCircle2 : AlertCircle;
            return (
              <div key={req.key} className="flex flex-col gap-3 rounded-xl border border-white/[0.14] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <p className="mb-1 text-[0.625rem] font-black uppercase tracking-[0.2em] text-white/50">
                      {req.created}
                    </p>
                    <p className="text-lg font-bold text-white">{req.range}</p>
                  </div>
                  <span
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 ${
                      approved
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
                        : 'border-amber-500/30 bg-amber-500/15 text-amber-400'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="text-[0.625rem] font-black uppercase tracking-wider">{req.statusLabel}</span>
                  </span>
                </div>
                {req.reason && (
                  <div className="border-t border-white/10 pt-3">
                    <p className="text-xs italic leading-relaxed text-white/60">"{req.reason}"</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </WidgetChrome>
    </div>
  );
}
