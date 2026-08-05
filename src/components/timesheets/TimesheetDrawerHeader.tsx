import type { Locale } from 'date-fns';
import {
  ChevronRight, ChevronLeft, X, Lock, Unlock, UserX,
  Calendar, Clock, History, UserCheck, ChevronDown, ChevronUp,
} from 'lucide-react';
import { safeFormatDate } from '../../utils/safeDateFormat';
import { getDeptColor } from '../../utils/departments';
import { translateDepartmentValue } from '../../utils/departmentLabels';
import { formatTrans } from '../../utils/translations';
import type { Language } from '../../types';
import type { CSSProperties } from 'react';

/**
 * Pill reparto: sfondo colore reparto, testo bianco (scurisce il rgb se troppo chiaro per il contrasto).
 * Copiato da Timesheets.tsx (departmentChipStyle).
 */
function departmentChipStyle(hex: string): CSSProperties {
  const raw = hex.replace('#', '').trim();
  const six = raw.length === 6 && /^[0-9a-fA-F]{6}$/.test(raw) ? raw : '6b6b6b';
  let r = parseInt(six.slice(0, 2), 16);
  let g = parseInt(six.slice(2, 4), 16);
  let b = parseInt(six.slice(4, 6), 16);
  const lin = (x: number) => {
    const c = x / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const relLum = () => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  for (let i = 0; i < 10 && relLum() > 0.48; i++) {
    r = Math.max(0, Math.floor(r * 0.82));
    g = Math.max(0, Math.floor(g * 0.82));
    b = Math.max(0, Math.floor(b * 0.82));
  }
  return {
    backgroundColor: `rgb(${r},${g},${b})`,
    borderColor: 'rgba(255,255,255,0.25)',
    color: '#ffffff',
  };
}

interface TimesheetDrawerHeaderProps {
  /** Nome dipendente (uppercase nel render) */
  employeeName: string;
  /** Data turno 'yyyy-MM-dd' */
  dateStr: string;
  /** Reparto (opzionale) */
  department?: string;
  /** Lingua UI corrente */
  effectiveLanguage: string;
  /** Locale date-fns */
  locale: Locale;
  
  /** Classi CSS per styling header (border, bg, ring) */
  border: string;
  bg: string;
  ring: string;
  
  /** Label stato turno (es. "Congelato", "Pubblicato") */
  label: string;
  /** Classe CSS label (colore testo) */
  labelCls: string;
  
  /** Turno congelato (payroll approved) */
  isFrozen: boolean;
  /** Turno approvato (alias di isFrozen) */
  isApproved: boolean;
  
  /** Permessi azioni */
  canMarkAbsent: boolean;
  canTimesheetApprove: boolean;
  
  /** Saving states */
  markAbsentSaving: boolean;
  
  /** Sorgente apertura drawer: determina tipo navigazione */
  drawerOpenSource: 'name' | 'date' | 'turno' | null;
  
  /** Coda review attiva (opzionale) */
  drawerReviewQueue?: {
    reviewScope?: 'day' | 'employee_week';
    currentIdx: number;
    items: unknown[];
  } | null;
  
  /** Navigazione contestuale (frecce ←→ o ↑↓) */
  navigation?: {
    canPrev: boolean;
    canNext: boolean;
    onNavigate: (delta: 1 | -1) => void;
  };
  
  /** Navigazione review day (frecce ↑↓) */
  navigationReviewDay?: {
    canPrev: boolean;
    canNext: boolean;
    onNavigate: (delta: 1 | -1) => void;
  };
  
  /** Chiusura con conferma se ci sono modifiche non salvate */
  hasUnsavedChanges: boolean;
  onCloseRequest: () => void;
  onShowCloseConfirm: () => void;
  
  /** Azioni drawer */
  onMarkAbsent: () => void;
  onUnlockFrozen: () => void;
  onFreezeShift: () => void;
  
  /** Traduzione */
  t: Record<string, string>;
}

/**
 * Header del drawer dettaglio turno: nome, metadati, azioni (congela/sblocca/segna assente), navigazione.
 * 
 * Estratto da Timesheets.tsx (righe 4717-5009) per migliorare manutenibilità.
 */
export function TimesheetDrawerHeader({
  employeeName,
  dateStr,
  department,
  effectiveLanguage,
  locale,
  border,
  bg,
  ring,
  label,
  labelCls,
  isFrozen,
  isApproved,
  canMarkAbsent,
  canTimesheetApprove,
  markAbsentSaving,
  drawerOpenSource,
  drawerReviewQueue,
  navigation,
  navigationReviewDay,
  hasUnsavedChanges,
  onCloseRequest,
  onShowCloseConfirm,
  onMarkAbsent,
  onUnlockFrozen,
  onFreezeShift,
  t,
}: TimesheetDrawerHeaderProps) {
  const isEmployeeWeekReviewSheet = drawerReviewQueue?.reviewScope === 'employee_week';

  const handleClose = () => {
    if (hasUnsavedChanges) {
      onShowCloseConfirm();
    } else {
      onCloseRequest();
    }
  };

  return (
    <div className={`border-l-4 ${border} ${bg} ${ring} shrink-0`}>
      <div className="px-4 pt-2.5 pb-2 sm:px-5 sm:pt-3 sm:pb-2.5">
        {/* Riga 1: nome + (sm: azioni) + nav/close */}
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 flex-1 truncate text-[13px] sm:text-base font-bold leading-tight text-white" title={employeeName.toUpperCase()}>{employeeName.toUpperCase()}
          </h3>
          
          {/* Bottoni azione: visibili su sm+, su mobile nella riga 3 */}
          <div className="hidden sm:flex shrink-0 items-center gap-2">
            {/* Segna: non ha lavorato */}
            {canMarkAbsent && (
              <button
                type="button"
                disabled={markAbsentSaving}
                onClick={onMarkAbsent}
                className="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]" style={{ background: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.5)", color: "#fca5a5" }}
                title={t.shift_mark_absent}
              >
                {markAbsentSaving ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                ) : (
                  <UserX className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">{t.shift_mark_absent}</span>
              </button>
            )}
            
            {/* Bottone Congela / Sblocca */}
            {canTimesheetApprove && (
              isFrozen ? (
                <button
                  type="button"
                  onClick={onUnlockFrozen}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
                  title={t.ts_drawer_unlock_title}
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{t.ts_drawer_unlock_btn}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onFreezeShift}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0B3573] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:opacity-90 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                  title={t.ts_drawer_freeze_title}
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{t.ts_drawer_freeze_btn}</span>
                </button>
              )
            )}
          </div>
          
          {/* Nav + Close — sempre visibili, ridotti su mobile */}
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {/* Navigazione review day (↑↓) o contestuale (←→) */}
            {(!drawerReviewQueue || drawerReviewQueue.reviewScope === 'day') && (
              <>
                {/* Review day: frecce SU/GIÙ */}
                {navigationReviewDay && drawerReviewQueue?.reviewScope === 'day' && (
                  <>
                    <button
                      type="button"
                      disabled={!navigationReviewDay.canPrev}
                      onClick={() => navigationReviewDay.onNavigate(-1)}
                      className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl p-0 transition-colors hover:bg-accent/10 disabled:opacity-30 active:bg-accent/80"
                      aria-label={t.nav_up || t.prev}
                    >
                      <ChevronUp className="h-4 w-4 text-white/70" />
                    </button>
                    <button
                      type="button"
                      disabled={!navigationReviewDay.canNext}
                      onClick={() => navigationReviewDay.onNavigate(1)}
                      className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl p-0 transition-colors hover:bg-accent/10 disabled:opacity-30 active:bg-accent/80"
                      aria-label={t.nav_down || t.next}
                    >
                      <ChevronDown className="h-4 w-4 text-white/70" />
                    </button>
                  </>
                )}
                
                {/* Navigazione contestuale: frecce SINISTRA/DESTRA (aperto da nome) */}
                {navigation && drawerOpenSource === 'name' && (navigation.canPrev || navigation.canNext) && (
                  <>
                    <button
                      type="button"
                      disabled={!navigation.canPrev}
                      onClick={() => navigation.onNavigate(-1)}
                      className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl p-0 transition-colors hover:bg-accent/10 disabled:opacity-30 active:bg-accent/80"
                      aria-label={t.nav_prev || t.prev}
                    >
                      <ChevronLeft className="h-4 w-4 text-white/70" />
                    </button>
                    <button
                      type="button"
                      disabled={!navigation.canNext}
                      onClick={() => navigation.onNavigate(1)}
                      className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl p-0 transition-colors hover:bg-accent/10 disabled:opacity-30 active:bg-accent/80"
                      aria-label={t.nav_next || t.next}
                    >
                      <ChevronRight className="h-4 w-4 text-white/70" />
                    </button>
                  </>
                )}
              </>
            )}
            
            <button
              type="button"
              onClick={handleClose}
              className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl p-0 transition-colors hover:bg-accent/10 active:bg-accent/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
              aria-label={t.close}
            >
              <X className="h-4 w-4 text-white/70" />
            </button>
          </div>
        </div>
        
        {/* Riga 2: metadati — no wrap, scroll orizzontale su mobile */}
        <div className="mt-1 flex flex-nowrap items-center gap-x-1.5 overflow-x-auto [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:gap-x-2 sm:gap-y-1">
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-white/55">
            <Calendar className="h-3 w-3 shrink-0" />
            <span className="sm:hidden">{safeFormatDate(dateStr, 'EEE d MMM', { locale })}</span>
            <span className="hidden sm:inline">{safeFormatDate(dateStr, 'EEE d MMM yyyy', { locale })}</span>
          </span>
          <span className="shrink-0 text-white/30">·</span>
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-white/55">
            {drawerOpenSource === 'name' && <UserCheck className="h-3 w-3 shrink-0" />}
            {drawerOpenSource === 'turno' && <Clock className="h-3 w-3 shrink-0" />}
            {(drawerOpenSource === 'date' || !drawerOpenSource) && <History className="h-3 w-3 shrink-0" />}
          </span>
          <span className="shrink-0 text-white/30">·</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${labelCls}`}>{label}</span>
          {department && (
            <span className="shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold" style={departmentChipStyle(getDeptColor(department))}>
              {translateDepartmentValue(department, effectiveLanguage as Language)}
            </span>
          )}
          {isApproved && <Lock className="h-3 w-3 shrink-0 text-emerald-400" />}
          {isEmployeeWeekReviewSheet && drawerReviewQueue && (
            <span className="shrink-0 text-[11px] font-semibold text-white/55">
              {formatTrans(t.ts_employee_week_review_progress, { current: String(drawerReviewQueue.currentIdx + 1), total: String(drawerReviewQueue.items.length) })}
            </span>
          )}
        </div>
        
        {/* Riga 3 (solo mobile): bottoni azione visibili su sm+ nella Riga 1 */}
        {(canMarkAbsent || canTimesheetApprove) && (
          <div className="mt-1.5 flex sm:hidden items-center gap-2 flex-wrap">
            {canMarkAbsent && (
              <button
                type="button"
                disabled={markAbsentSaving}
                onClick={onMarkAbsent}
                className="flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]" style={{ background: "rgba(239,68,68,0.15)", borderColor: "rgba(239,68,68,0.5)", color: "#fca5a5" }}
                title={t.shift_mark_absent}
              >
                {markAbsentSaving ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <UserX className="w-3.5 h-3.5" />}
                <span>{t.shift_mark_absent}</span>
              </button>
            )}
            {canTimesheetApprove && (
              isFrozen ? (
                <button
                  type="button"
                  onClick={onUnlockFrozen}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>{t.ts_drawer_unlock_btn}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onFreezeShift}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#0B3573] hover:opacity-90 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{t.ts_drawer_freeze_btn}</span>
                </button>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
