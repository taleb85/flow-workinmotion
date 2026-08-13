import { FileText, Wallet } from 'lucide-react';
import { hapticLight as lightHaptic } from '../../utils/haptics';

const cardShadow =
  'shadow-[0_8px_30px_-12px_rgba(255,255,255,0.12),0_2px_8px_-4px_rgba(15,23,42,0.06)])]';

export interface MobileProfileStatsProps {
  monthHoursLabel: string;
  hoursFormatted: string;
  shiftsInMonth: number;
  shiftsLabel: string;
  documentsLabel: string;
  payslipLabel: string;
  onDocumentsTap?: () => void;
  onPayslipTap?: () => void;
}

export default function MobileProfileStats({
  monthHoursLabel,
  hoursFormatted,
  shiftsInMonth,
  shiftsLabel,
  documentsLabel,
  payslipLabel,
  onDocumentsTap,
  onPayslipTap,
}: MobileProfileStatsProps) {
  const docs = () => {
    lightHaptic();
    onDocumentsTap?.();
  };
  const payslip = () => {
    lightHaptic();
    onPayslipTap?.();
  };

  return (
    <div className="space-y-4">
      <div
        className={`rounded-3xl border px-5 py-6 ${cardShadow}`}
        style={typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
          ? { background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', boxShadow: 'none' }
          : { background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(241,245,249,0.80)' }}
      >
        <p className="text-center text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
          {monthHoursLabel}
        </p>
        <p className="mt-2 text-center text-4xl font-bold tabular-nums tracking-tight text-white">
          {hoursFormatted}
        </p>
        <p className="mt-1 text-center text-sm text-white/60">
          {shiftsInMonth} {shiftsLabel}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={docs}
          className={`flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-3xl border px-3 py-4 text-center transition ${cardShadow}`}
          style={typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
            ? { background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', boxShadow: 'none' }
            : { background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(241,245,249,0.80)' }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white/70">
            <FileText className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-white/80">
            {documentsLabel}
          </span>
        </button>
        <button
          type="button"
          onClick={payslip}
          className={`flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-3xl border px-3 py-4 text-center transition ${cardShadow}`}
          style={typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
            ? { background: 'transparent', borderColor: 'rgba(255,255,255,0.08)', boxShadow: 'none' }
            : { background: 'rgba(255,255,255,0.95)', borderColor: 'rgba(241,245,249,0.80)' }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white/70">
            <Wallet className="h-5 w-5" strokeWidth={2} />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-wide text-white/80">
            {payslipLabel}
          </span>
        </button>
      </div>
    </div>
  );
}
