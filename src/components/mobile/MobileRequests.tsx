import { Palmtree, Plus, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import type { HolidayRequest } from '../../types';
import { safeFormatDate } from '../../utils/safeDateFormat';
import { getDateLocale } from '../../utils/translations';
import { useAppUser } from '../../context/AppContext';

interface MobileRequestsProps {
  requests: HolidayRequest[];
  onRequestNew: () => void;
  t?: Record<string, string>;
}

export default function MobileRequests({ requests, onRequestNew, t = {} }: MobileRequestsProps) {
  const { effectiveLanguage } = useAppUser();
  const locale = getDateLocale(effectiveLanguage);

  const STATUS_CONFIG = {
    approved: {
      label: t.holiday_status_approved ?? 'Approvata',
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/15',
      border: 'border-emerald-500/30',
    },
    pending: {
      label: t.holiday_status_pending ?? 'In attesa',
      icon: AlertCircle,
      color: 'text-amber-400',
      bg: 'bg-amber-500/15',
      border: 'border-amber-500/30',
    },
    rejected: {
      label: t.holiday_status_rejected ?? 'Rifiutata',
      icon: XCircle,
      color: 'text-red-400',
      bg: 'bg-red-500/15',
      border: 'border-red-500/30',
    },
  } as const;

  if (requests.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
          <Palmtree className="w-8 h-8 text-white/50" />
        </div>
        <p className="text-white/60 font-medium uppercase tracking-wider text-xs">{t.no_requests_made ?? 'Nessuna richiesta effettuata'}</p>
        <button
          onClick={onRequestNew}
          className="mt-6 flex items-center gap-2 px-6 py-3 rounded-full bg-white/15 text-white font-bold uppercase tracking-wider shadow-lg transition-colors"
        >
          <Plus className="w-5 h-5" />
          {t.new_request ?? 'Nuova Richiesta'}
        </button>
      </div>
    );
  }

  return (
    <div className="relative min-h-[60vh] px-4 pb-32">
      <div className="flex flex-col gap-3">
        {requests.map((req) => {
          const config = STATUS_CONFIG[req.status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
          const Icon = config.icon;
          
          return (
            <div 
              key={req.id}
              className="rounded-3xl p-5 border flex flex-col gap-4"
              style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', boxShadow: 'none' }}
            >
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <p className="text-[11px] font-black text-white/50 uppercase tracking-[0.2em] mb-1">
                    {safeFormatDate(req.created_at, 'd MMM yyyy', { locale })}
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-xl font-bold text-white">
                      {safeFormatDate(req.start_date, 'd MMM', { locale })} – {safeFormatDate(req.end_date, 'd MMM', { locale })}
                    </p>
                  </div>
                </div>
                
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border ${config.bg} ${config.border} ${config.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-black uppercase tracking-wider">
                    {config.label}
                  </span>
                </div>
              </div>

              {req.reason && (
                <div className="pt-3 border-t border-white/8">
                  <p className="text-xs text-white/60 leading-relaxed italic">
                    "{req.reason}"
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={onRequestNew}
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full bg-white/15 text-white shadow-2xl flex items-center justify-center transition-transform z-40"
        aria-label={t.new_request ?? 'Nuova richiesta'}
      >
        <Plus className="w-7 h-7" strokeWidth={3} />
      </button>
    </div>
  );
}
