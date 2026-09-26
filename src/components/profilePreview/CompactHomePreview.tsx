/**
 * Anteprima "Cosa vede chi" — Home compatta (gestionale senza team_view).
 * Rispecchia src/components/HomeStaffView.tsx (vista desktop compatta).
 * Testi `text-[0.625rem]` voluti: anteprima in scala ridotta.
 */
import { Clock, Moon, Sun, Palmtree, Megaphone, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import type { User, Language } from '../../types';
import { getTranslations, getDateLocale } from '../../utils/translations';
import { WidgetChrome } from './WidgetChrome';

export default function CompactHomePreview({
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
  const todayShifts = [
    { key: 'lunch', label: t.lunch, start: '10:00', end: '16:00', punched: true },
    { key: 'dinner', label: t.dinner, start: '18:00', end: '23:00', punched: false },
  ];
  const shiftRows = [
    { d: 'Lun 10', h: '10:00–16:00' },
    { d: 'Mar 11', h: '18:00–23:00' },
  ];

  return (
    <div className="flex flex-col gap-4 font-sans">
      {/* Saluto + data odierna */}
      <WidgetChrome
        widgetKey="home_compact.greeting"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="pt-1">
          <h1 className="text-2xl font-bold text-white">{t.home_greeting.replace('{name}', name)}</h1>
          <p className="mt-0.5 text-[0.6875rem] font-medium capitalize text-white/55">{todayLabel}</p>
        </div>
      </WidgetChrome>

      {/* Bacheca team (placeholder) */}
      <WidgetChrome
        widgetKey="home_compact.board"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="flex items-start gap-3 rounded-xl border border-white/[0.14] px-4 py-3">
          <Megaphone size={15} className="mt-0.5 shrink-0 text-white/55" />
          <p className="min-w-0 flex-1 text-[0.6875rem] italic leading-relaxed text-white/60">{t.home_board_empty}</p>
        </div>
      </WidgetChrome>

      {/* Turni di oggi */}
      <WidgetChrome
        widgetKey="home_compact.today_shifts"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="flex flex-col gap-2">
          <h2 className="text-[0.625rem] font-bold uppercase tracking-wider text-white/55">{t.home_today}</h2>
          {todayShifts.map((s) => {
            const Icon = s.key === 'dinner' ? Moon : Sun;
            return (
              <div
                key={s.key}
                className={`rounded-xl border border-white/[0.14] border-l-4 p-3 ${
                  s.punched ? 'border-l-slate-300' : 'border-l-amber-400 bg-amber-900/20'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[0.625rem] font-bold uppercase tracking-wide text-white/55">
                    <Icon className={`h-3.5 w-3.5 ${s.key === 'dinner' ? 'text-amber-600' : 'text-amber-500'}`} />
                    {s.label}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[0.625rem] font-bold ${
                      s.punched
                        ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-300'
                        : 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                    }`}
                  >
                    {s.punched ? t.home_punched : t.home_not_punched}
                  </span>
                </div>
                <p className="text-xl font-bold tabular-nums text-white">
                  {s.start} → {s.end}
                </p>
              </div>
            );
          })}
        </div>
      </WidgetChrome>

      {/* Prossimo turno */}
      <WidgetChrome
        widgetKey="home_compact.next_shift"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-white/[0.14] px-3 py-2.5">
          <p className="mb-1.5 text-[0.625rem] font-bold uppercase tracking-wider text-white/55">{t.home_next_shift}</p>
          <p className="mb-1 text-base font-bold text-white">Mer 12</p>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-white/60" />
            <span className="text-lg font-bold tabular-nums text-white">10:00 → 16:00</span>
          </div>
        </div>
      </WidgetChrome>

      {/* Lista "I miei turni" */}
      <WidgetChrome
        widgetKey="home_compact.shift_list"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-white/[0.14] px-3 py-2.5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[0.625rem] font-bold uppercase tracking-wider text-white/55">{t.home_my_shifts}</h3>
            <span className="flex items-center gap-1 text-[0.6875rem] font-semibold text-white/70">
              {t.home_see_all} <ChevronRight className="h-3 w-3" />
            </span>
          </div>
          {shiftRows.map((row) => (
            <div key={row.d} className="flex items-center gap-3 border-b border-white/10 py-2 last:border-0">
              <p className="w-[4.5rem] shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-white/55">{row.d}</p>
              <span className="rounded-full border border-white/20 bg-white/15 px-2 py-0.5 text-[0.6875rem] font-semibold tabular-nums text-white">
                {row.h}
              </span>
            </div>
          ))}
        </div>
      </WidgetChrome>

      {/* Prossime ferie approvate */}
      <WidgetChrome
        widgetKey="home_compact.approved_holidays"
        previewUser={previewUser}
        isSelectedAdmin={isSelectedAdmin}
        onUiToggle={onUiToggle}
        hiddenBadge={hiddenBadge}
      >
        <div className="rounded-xl border border-white/[0.14] px-3 py-2.5">
          <h3 className="mb-2 flex items-center gap-2 text-[0.625rem] font-bold uppercase tracking-wider text-white/55">
            <Palmtree className="h-4 w-4 text-white/60" /> {t.home_upcoming_holidays}
          </h3>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[0.6875rem] font-medium text-white/70">1 – 7 ago</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[0.6875rem] font-bold text-white/70">
              {t.home_holiday_approved}
            </span>
          </div>
        </div>
      </WidgetChrome>
    </div>
  );
}
