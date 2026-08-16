/**
 * Componente estratto da HomePage.tsx per rompere la dipendenza circolare:
 *   ManagementHomePreview → HomePage → MobileStaffDashboard → SettingsPage → ProfileVisibilityHub → … → ManagementHomePreview
 *
 * Importato sia da HomePage.tsx che da ManagementHomePreview.tsx.
 */
import { Moon, Sun, LogOut as LogOutIcon, Check } from 'lucide-react';
import { it } from 'date-fns/locale';
import { safeFormatDate } from '../utils/safeDateFormat';

export interface HomeManagementShiftCardProps {
  e: {
    shift: { id: string; start_time: string; end_time?: string | null; approval_status: string; date?: string };
    user?: { first_name?: string; department?: string; role?: string } | null;
    isDinner: boolean;
    punchIn?: { id: string } | null;
    actualStart: string | null;
    actualEnd: string | null;
    scheduledStart: string;
    scheduledEnd: string;
    scheduledMins: number;
    actualMins: number;
    deltaMins: number;
    isLate: boolean;
    hasMissingOut: boolean;
    isApproved: boolean;
    canApprove: boolean;
    canClose: boolean;
  };
  style: { border: string; bg: string; badge: string; dot: string; label: string };
  isManager: boolean;
  onClose: () => void;
  onApprove: () => void;
  approvingId: string | null;
  t: Record<string, string>;
}

function fmtHM(mins: number): string {
  if (!Number.isFinite(mins)) return '—';
  if (mins === 0) return '0h';
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  const sign = mins < 0 ? '-' : '+';
  return h > 0 ? `${sign}${h}h${m > 0 ? m + 'm' : ''}` : `${sign}${m}m`;
}

/** Bordo sinistro = colore dello stato del turno, mappato dalle classi `border-l-*` di getCardStyle. */
const STATUS_BORDER_COLORS: Array<[RegExp, string]> = [
  [/emerald/, '#10b981'],        // approvato
  [/\[#00C896\]/, '#00C896'],    // confermato (brand electric)
  [/rose/, '#f43f5e'],           // assente
  [/red/, '#ef4444'],            // anomalia
  [/amber/, '#f59e0b'],          // senza timbratura / da chiudere
  [/blue/, '#60a5fa'],           // bozza
  [/slate/, '#94a3b8'],          // bozza (legacy)
  [/white/, 'rgba(255,255,255,0.45)'], // in turno / da approvare / completato
];
function statusBorderColor(borderClass: string): string {
  return STATUS_BORDER_COLORS.find(([re]) => re.test(borderClass))?.[1] ?? 'rgba(255,255,255,0.45)';
}

/** Esportato per anteprima admin (Cosa vede chi) — stessa UI dei turni in Home gestionale. */
export function HomeManagementShiftCard({ e, style, isManager, onClose, onApprove, approvingId, t }: HomeManagementShiftCardProps) {
  const dateStr = e.shift.date
    ? safeFormatDate(e.shift.date, 'EEE d MMM', { locale: it })
    : null;
  const subLine = [e.user?.department ?? e.user?.role, dateStr].filter(Boolean).join(' · ');

  const actualTimeStr = e.actualStart
    ? `${e.actualStart} → ${e.actualEnd ?? '…'}`
    : null;

  const deltaLabel = e.actualMins > 0 ? fmtHM(e.deltaMins) : null;

  return (
    <div
      className={`rounded-xl border-l-4 ${style.border}`}
      style={{
        background: 'transparent',
        border: '1px solid rgba(255, 255, 255, 0.10)',
        borderLeft: '4px solid',
        borderLeftColor: statusBorderColor(style.border),
        borderRadius: '0.625rem',
        padding: '11px 12px',
        marginBottom: '0.4375rem',
      }}
    >
      {/* Riga principale: nome/reparto + orario/badge su una sola riga */}
      <div className="flex justify-between items-center gap-2">
        {/* Sinistra: nome + sottoriga inline */}
        <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
          <p className="text-[0.8125rem] font-semibold truncate min-w-0" style={{ color: 'white' }} title={e.user?.first_name ?? '—'}>{e.user?.first_name ?? '—'}
          </p>
          {subLine && (
            <p className="text-[0.6875rem] uppercase truncate min-w-0" style={{ color: 'rgba(255,255,255,0.50)' }} title={subLine}>{subLine}
            </p>
          )}
        </div>

        {/* Destra: orario + badge inline */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <p className="text-[0.75rem] font-semibold tabular-nums" style={{ color: 'white' }}>
            {e.scheduledStart}–{e.scheduledEnd}
          </p>
          <div className="flex items-center gap-1">
            {e.isDinner
              ? <Moon className="h-2.5 w-2.5 text-amber-400 opacity-70" />
              : <Sun className="h-2.5 w-2.5 text-amber-300 opacity-70" />
            }
            <span
              className={`text-[0.6875rem] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}
              style={style.label.toLowerCase().includes('approv') ? {
                background: 'rgba(16, 185, 129, 0.20)',
                color: '#6ee7b7',
                border: '1px solid rgba(16, 185, 129, 0.35)',
              } : undefined}
            >
              {style.label}
            </span>
          </div>
        </div>
      </div>

      {/* Orario effettivo / delta (se timbrato) */}
      {actualTimeStr && (
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-[0.6875rem] tabular-nums" style={{ color: 'rgba(255,255,255,0.50)' }}>
            ↳ {actualTimeStr}
          </span>
          {deltaLabel && (
            <span
              className="text-[0.6875rem] font-bold"
              style={{ color: e.deltaMins > 5 ? '#34d399' : e.deltaMins < -5 ? '#f87171' : 'rgba(255,255,255,0.40)' }}
            >
              {deltaLabel}
            </span>
          )}
        </div>
      )}

      {/* Azioni manager */}
      {isManager && (e.canClose || e.canApprove) && (
        <div className="flex gap-1.5 mt-2">
          {e.canClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-amber-500/80 hover:bg-amber-500 text-white text-[0.6875rem] font-bold transition-colors active:bg-amber-500/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            >
              <LogOutIcon className="w-3 h-3" /> {t.home_btn_close_shift}
            </button>
          )}
          {e.canApprove && (
            <button
              type="button"
              onClick={onApprove}
              disabled={approvingId === e.shift.id}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-accent/80 hover:bg-accent text-white text-[0.6875rem] font-bold transition-colors disabled:opacity-50 active:bg-accent/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            >
              <Check className="w-3 h-3" />
              {approvingId === e.shift.id ? '...' : t.home_btn_approve}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
