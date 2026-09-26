/**
 * Anteprima "Cosa vede chi" — Presenze staff.
 * Rispecchia src/components/mobile/MobileStatsCards.tsx +
 * src/components/mobile/ManagementMobileTimesheet.tsx (variant="embedded").
 * Testi `text-[0.625rem]` voluti: anteprima in scala ridotta.
 */
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import type { User, Language } from '../../types';
import { getTranslations } from '../../utils/translations';
import { WidgetChrome } from './WidgetChrome';

export default function StaffTimesheetPreview({
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
  const days = [
    { d: 'Lun', h: '10:00–16:00' },
    { d: 'Mar', h: '12:00–18:00' },
    { d: 'Mer', h: '—' },
    { d: 'Gio', h: '18:00–23:00' },
    { d: 'Ven', h: '10:00–16:00' },
    { d: 'Sab', h: '—' },
    { d: 'Dom', h: '—' },
  ];

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Intestazione: titolo + Presenze/Statistiche + barra periodo */}
      <WidgetChrome
        widgetKey="timesheet.header"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-white/[0.14] p-4">
          <h2 className="text-base font-bold text-white">{t.timesheet_title}</h2>

          {/* Selettore Presenze / Statistiche */}
          <div className="mt-3 flex items-center gap-1.5">
            <span className="inline-flex h-7 items-center rounded-full bg-white/15 px-3 text-[0.625rem] font-extrabold uppercase tracking-wider text-white">
              {t.tab_attendance ?? 'Presenze'}
            </span>
            <span className="inline-flex h-7 items-center rounded-full border border-white/20 bg-white/10 px-3 text-[0.625rem] font-extrabold uppercase tracking-wider text-white/60">
              {t.tab_statistics ?? 'Statistiche'}
            </span>
          </div>

          {/* Barra periodo settimana con frecce */}
          <div className="mt-3 flex items-center gap-1.5">
            <span className="inline-flex h-7 items-center rounded-xl border border-white/20 px-2 text-[0.625rem] font-black uppercase tracking-widest text-white/70">
              {t.today}
            </span>
            <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-white/20">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border-r border-white/10 text-white">
                <ChevronLeft className="h-3.5 w-3.5" />
              </span>
              <span className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2 text-[0.625rem] font-bold tabular-nums text-white">
                <Clock className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{t.stats_preset_current_week}</span>
              </span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center border-l border-white/10 text-white">
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        </div>
      </WidgetChrome>

      {/* Card ore settimana */}
      <WidgetChrome
        widgetKey="stats.staff_summary"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-white/[0.14] p-4">
          <p className="text-[0.625rem] font-medium uppercase text-white/50">{t.ts_period_week}</p>
          <p className="mb-2 mt-1 flex items-baseline gap-1.5 text-lg font-bold tabular-nums">
            <span className="text-white">32:00</span>
            <span className="font-medium text-white/40">/</span>
            <span style={{ color: 'var(--state-success)' }}>30:30</span>
          </p>
          <div className="h-1.5 w-full rounded-full bg-white/15">
            <div className="h-full w-[85%] rounded-full bg-white/40" />
          </div>
        </div>
      </WidgetChrome>

      {/* Riepilogo settimana con mini-righe giorni */}
      <WidgetChrome
        widgetKey="timesheet.staff_summary_box"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-white/[0.14] p-4">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[0.625rem] font-bold uppercase tracking-widest text-white/80">{t.timesheet_my_week}</p>
              <p className="mt-1 text-lg font-bold text-white">32:00</p>
            </div>
            <span className="text-[0.625rem] text-white/50">{t.shifts_week}</span>
          </div>
          <div className="mt-3 flex flex-col">
            {days.map((row) => (
              <div key={row.d} className="flex items-center justify-between border-b border-white/10 py-1.5 last:border-0">
                <span className="w-8 text-[0.6875rem] font-bold uppercase tracking-wide text-white/55">{row.d}</span>
                <span className={`text-[0.6875rem] font-semibold tabular-nums ${row.h === '—' ? 'text-white/35' : 'text-white/80'}`}>
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
