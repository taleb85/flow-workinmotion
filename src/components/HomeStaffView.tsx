import { memo, useRef } from 'react';
import { it } from 'date-fns/locale';
import { Clock, Moon, Sun, Palmtree, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { safeFormatDate } from '../utils/safeDateFormat';
import { getDateLocale } from '../utils/translations';
import MobileStaffDashboard from './mobile/MobileStaffDashboard';
import TeamBoard from './TeamBoard';
import type { User, Shift, HolidayRequest, Language, PunchRecord } from '../types';
import type { AppNavTab } from '../utils/enabledModules';

interface HomeStaffViewProps {
  currentUser: User;
  effectiveLanguage: Language;
  t: Record<string, string>;
  now: Date;
  todayStr: string;
  myShifts: Shift[];
  punchRecords: PunchRecord[];
  myApprovedHolidays: HolidayRequest[];
  upcomingShifts: Shift[];
  todayShiftsMine: Shift[];
  weeklyMinutes: number;
  monthlyMinutes: number;
  monthDaysWorked: number;
  getDateLabel: (dateStr: string) => string;
  getPunchForShift: (shiftId: string, userId: string, dateStr: string, isLunchShift: boolean) => { punchIn?: any; punchOut?: any };
  staffRequestsEnabled: boolean;
  isMgmtUser: boolean;
  canEditTeamBoard: boolean;
  // Board props
  boardNote: { text: string; author: string; updatedAt: string } | null;
  editingBoard: boolean;
  boardDraft: string;
  onBoardDraftChange: (v: string) => void;
  onStartEditBoard: () => void;
  onSaveBoard: () => void;
  onCancelEditBoard: () => void;
  onClearBoard: () => void;
  // Navigation
  onNavigateToHolidays?: () => void;
  onNavigateToShifts?: () => void;
  onTabChange?: (tab: AppNavTab) => void;
  activeTab?: AppNavTab;
  // Filters
  uiW: (key: string) => boolean;
  // Clock helpers used in JSX
  punchTimeHHMM: (ts: string | null | undefined) => string | null;
  timeToMins: (t: string) => number;
}

export default memo(function HomeStaffView({
  currentUser,
  effectiveLanguage,
  t,
  now,
  todayStr,
  myShifts,
  myApprovedHolidays,
  upcomingShifts,
  todayShiftsMine,
  weeklyMinutes,
  monthlyMinutes,
  monthDaysWorked,
  getDateLabel,
  getPunchForShift,
  staffRequestsEnabled,
  isMgmtUser,
  canEditTeamBoard,
  boardNote,
  editingBoard,
  boardDraft,
  onBoardDraftChange,
  onStartEditBoard,
  onSaveBoard,
  onCancelEditBoard,
  onClearBoard,
  onNavigateToHolidays: _onNavigateToHolidays,
  onNavigateToShifts,
  onTabChange,
  activeTab,
  uiW,
  punchRecords,
  punchTimeHHMM: _punchTimeHHMM,
  timeToMins,
}: HomeStaffViewProps) {
  const shiftsListRef = useRef<HTMLDivElement>(null);
  const locale = getDateLocale(effectiveLanguage) ?? it;

  return (
    <div className="pb-content pt-6 w-full app-horizontal-pad font-sans md:!pb-32">
      <div className="mx-auto w-full max-w-7xl">
      <div className="block md:hidden space-y-4">
        <MobileStaffDashboard
          user={currentUser}
          language={effectiveLanguage}
          todayStr={todayStr}
          now={now}
          myShifts={myShifts}
          punchRecords={punchRecords}
          weeklyMinutes={weeklyMinutes}
          monthlyMinutes={monthlyMinutes}
          monthDaysWorked={monthDaysWorked}
          weekCapMinutes={40 * 60}
          onTabChange={onTabChange}
          greetingText={t.home_greeting.replace('{name}', currentUser.first_name ?? '')}
          activeTab={activeTab ?? 'home'}
        />
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mx-auto hidden max-w-lg flex-col gap-4 md:flex md:flex-col"
      >
        {/* Saluto */}
        {uiW('home_compact.greeting') && (
        <div className="pt-3 md:pt-6">
          <h1 className="text-white font-bold text-2xl">{t.home_greeting.replace('{name}', currentUser.first_name)}</h1>
        </div>
        )}

        {/* Bacheca team (gestionale senza team_view sulla Home) */}
        {uiW('home_compact.board') && isMgmtUser && (
          <TeamBoard
            t={t}
            boardNote={boardNote}
            editingBoard={editingBoard}
            boardDraft={boardDraft}
            onBoardDraftChange={onBoardDraftChange}
            onStartEdit={onStartEditBoard}
            onSave={onSaveBoard}
            onCancel={onCancelEditBoard}
            onClear={onClearBoard}
            canEdit={canEditTeamBoard}
            effectiveLanguage={effectiveLanguage}
          />
        )}

        {/* Turni di oggi – staff view */}
        {uiW('home_compact.today_shifts') && todayShiftsMine.length > 0 && (
          <div className="flex flex-col gap-2" data-tour="punch">
            <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">{t.home_today}</h2>
            {todayShiftsMine.map((s) => {
              const isDinner = timeToMins((s.start_time || '').slice(0, 5)) >= 16 * 60;
              const { punchIn } = getPunchForShift(s.id, s.user_id, todayStr, !isDinner);
              const punched = !!punchIn;
              return (
                <div key={s.id} className={`rounded-2xl border-l-4 p-4 shadow-sm ${punched ? 'border-l-slate-300' : 'border-l-amber-400 bg-amber-900/20'}`}
                  style={punched ? { 
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderLeft: '4px solid rgb(203 213 225)',
                    boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.3)',
                  } : undefined}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {isDinner ? <Moon className="w-4 h-4 text-amber-600" /> : <Sun className="w-4 h-4 text-amber-500" />}
                      <span className="text-[0.6875rem] font-bold uppercase tracking-wide text-white/55">{isDinner ? t.dinner : t.lunch}</span>
                    </div>
                    <span className={`text-[0.6875rem] font-bold px-2.5 py-0.5 rounded-full border ${punched ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40' : 'bg-amber-500/15 text-amber-200 border-amber-400/50'}`}>
                      {punched ? t.home_punched : t.home_not_punched}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-white tabular-nums">
                    {s.start_time.slice(0, 5)} → {s.end_time?.slice(0, 5) ?? '…'}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Prossimo turno */}
        {uiW('home_compact.next_shift') && upcomingShifts.filter((s) => s.date !== todayStr)[0] && (() => {
          const next = upcomingShifts.filter((s) => s.date !== todayStr)[0];
          return (
            <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500">
              <p className="text-[0.6875rem] font-bold text-white/55 uppercase tracking-wider mb-2">{t.home_next_shift}</p>
              <p className="text-lg font-bold text-white mb-1">{getDateLabel(next.date)}</p>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-white/60" />
                <span className="text-xl font-bold text-white tabular-nums">{next.start_time.slice(0, 5)} → {next.end_time?.slice(0, 5) ?? '…'}</span>
              </div>
            </div>
          );
        })()}

        {/* Lista turni */}
        {uiW('home_compact.shift_list') && (
        <div ref={shiftsListRef} className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold text-white/55 uppercase tracking-wider">{t.home_my_shifts}</h3>
<button type="button" onClick={() => onNavigateToShifts?.()} className="text-xs font-semibold text-white/70 flex items-center gap-1 hover:underline active:brightness-95 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
              {t.home_see_all} <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-0">
            {upcomingShifts.slice(0, 10).length === 0 ? (
              <p className="text-white/55 text-sm text-center py-4">{t.no_shifts_scheduled}</p>
            ) : (() => {
              const grouped: Record<string, typeof upcomingShifts> = {};
              upcomingShifts.slice(0, 10).forEach((s) => { if (!grouped[s.date]) grouped[s.date] = []; grouped[s.date].push(s); });
              return Object.keys(grouped).sort().slice(0, 7).map((dateStr, idx) => (
                <motion.div key={dateStr} initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 + idx * 0.04 }}
                  className="flex items-center py-2.5 border-b border-slate-50 last:border-0 gap-3">
                  <p className="text-white/55 font-semibold text-xs uppercase tracking-wide w-[4.5rem] flex-shrink-0">
                    {safeFormatDate(dateStr, 'EEE d', { locale })}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {grouped[dateStr].sort((a, b) => a.start_time.localeCompare(b.start_time)).map((s) => (
                      <span key={s.id} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${s.approval_status === 'draft' ? 'bg-blue-500/20 text-blue-200 border-blue-400/40' : 'bg-white/15 text-white border-white/30'}`}>
                        {s.start_time.slice(0, 5)}–{s.end_time?.slice(0, 5) ?? '…'}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ));
            })()}
          </div>
        </div>
        )}

        {/* Ferie approvate */}
        {uiW('home_compact.approved_holidays') && staffRequestsEnabled && myApprovedHolidays.length > 0 && (
          <div className="group w-full rounded-xl border px-3 py-2.5 text-left border-neutral-500">
            <h3 className="text-xs font-bold text-white/55 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Palmtree className="w-4 h-4 text-white/60" /> {t.home_upcoming_holidays}
            </h3>
            {myApprovedHolidays.map((h) => (
              <div key={h.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                <span className="text-white/70 text-xs font-medium">
                  {safeFormatDate(h.start_date, 'd MMM', { locale })} – {safeFormatDate(h.end_date, 'd MMM yyyy', { locale })}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 text-xs font-bold border border-white/20">{t.home_holiday_approved}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
      </div>
    </div>
  );
});
