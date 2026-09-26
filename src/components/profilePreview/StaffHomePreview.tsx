/**
 * Anteprima "Cosa vede chi" — Home personale staff.
 * Rispecchia src/components/mobile/MobileHome.tsx.
 * Testi `text-[0.625rem]` voluti: anteprima in scala ridotta.
 */
import { Play, LogOut, Users } from 'lucide-react';
import { format } from 'date-fns';
import type { User, Language } from '../../types';
import { getTranslations, getDateLocale } from '../../utils/translations';
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
  const locale = getDateLocale(language);
  const todayLabel = format(new Date(), 'EEEE d MMMM', { locale });

  // DATI DIMOSTRATIVI FISSI PER ANTEPRIMA
  const todayShifts = ['10:00 – 16:00', '18:00 – 23:00'];
  const upcoming = [
    { day: 'Mar', hours: '12:00 – 18:00' },
    { day: 'Gio', hours: '18:00 – 23:00' },
  ];
  const coworkers = [
    { name: 'Luca', hours: '11:30 – 16:00' },
    { name: 'Sara', hours: '19:00 – 23:30' },
  ];

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Saluto + data */}
      <WidgetChrome
        widgetKey="staff_home.greeting"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="mt-1">
          <h1 className="text-2xl font-bold text-white">{t.home_greeting.replace('{name}', name)}</h1>
          <p className="mt-0.5 text-[0.6875rem] font-semibold capitalize text-white/55">{todayLabel}</p>
        </div>
      </WidgetChrome>

      {/* Card timbratura dominante */}
      <WidgetChrome
        widgetKey="staff_home.punch_card"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-white/[0.14] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[0.625rem] font-bold uppercase tracking-widest text-white/55">{t.mobile_punch_section}</span>
            <span className="text-[0.6875rem] font-medium text-white/70">{t.pending}</span>
          </div>
          <button
            type="button"
            tabIndex={-1}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-black/20"
          >
            <Play className="h-4 w-4 fill-current" />
            {tv.mobile_dash_start ?? 'Entra'}
          </button>
          <button
            type="button"
            tabIndex={-1}
            className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-600/15 text-xs font-bold uppercase tracking-wider text-red-300"
          >
            <LogOut className="h-4 w-4" />
            {tv.mobile_dash_end ?? 'Esci'}
          </button>
        </div>
      </WidgetChrome>

      {/* Turno di oggi */}
      <WidgetChrome
        widgetKey="staff_home.today_shift"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-white/[0.14] p-4">
          <span className="text-[0.625rem] font-bold uppercase tracking-widest text-white/55">{t.mobile_today_shift}</span>
          <div className="mt-3 flex gap-2">
            {todayShifts.map((hours, i) => (
              <div
                key={hours}
                className={`flex min-w-0 flex-1 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl border px-3 py-2.5 ${
                  i === 0 ? 'border-white/30 bg-white/[0.06]' : 'border-white/[0.14]'
                }`}
              >
                <span className="text-sm font-semibold tabular-nums text-white">{hours}</span>
                {i === 0 && (
                  <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-white/70">
                    {t.legend_in_progress ?? 'In corso'}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </WidgetChrome>

      {/* Prossimi turni */}
      <WidgetChrome
        widgetKey="staff_home.upcoming"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-white/[0.14] p-4">
          <span className="text-[0.625rem] font-bold uppercase tracking-widest text-white/55">{t.upcoming_shifts}</span>
          <div className="mt-3 flex flex-col gap-2">
            {upcoming.map((g) => (
              <div key={g.day} className="overflow-hidden rounded-xl border border-white/[0.14]">
                <div className="border-b border-white/10 px-3 py-1.5 text-[0.625rem] font-bold uppercase tracking-wider text-white/55">
                  {g.day}
                </div>
                <div className="flex gap-2 p-2">
                  <div className="flex flex-1 min-w-0 items-center justify-center px-2 py-1.5">
                    <span className="text-sm font-semibold tabular-nums text-white">{g.hours}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </WidgetChrome>

      {/* Colleghi in turno oggi */}
      <WidgetChrome
        widgetKey="staff_home.coworkers"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-white/[0.14] p-4">
          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 shrink-0 text-white/60" />
            <span className="text-[0.625rem] font-bold uppercase tracking-widest text-white/55">
              {tv.header_coworkers_today_title ?? 'In turno oggi'}
            </span>
            <span className="ml-auto text-[0.625rem] font-bold tabular-nums text-white/70">
              {(tv.header_coworkers_today_summary ?? '{n} colleghi').replace('{n}', String(coworkers.length))}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {coworkers.map((c) => (
              <div
                key={c.name}
                className="flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.05] px-3.5 py-1.5"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-[0.625rem] font-bold text-white">
                  {c.name.charAt(0)}
                </div>
                <div className="flex min-w-0 flex-col">
                  <span className="text-xs font-bold uppercase leading-tight tracking-tight text-white/85">{c.name}</span>
                  <span className="text-[0.625rem] font-semibold tabular-nums leading-tight text-white/55">{c.hours}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </WidgetChrome>
    </div>
  );
}
