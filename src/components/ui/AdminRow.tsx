import { memo } from 'react';
import type { ReactNode } from 'react';

export type AdminRowProps = {
  label: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  badge?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

/**
 * Riga permessi / impostazioni: altezza minima confortevole, nessuna altezza fissa da toolbar (evita sovrapposizioni testo).
 */
const AdminRow = memo(function AdminRow({
  label,
  description,
  action,
  badge,
  icon,
  className = '',
}: AdminRowProps) {
  return (
    <div
      className={`flex min-h-[3.5rem] items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-b-0 hover:bg-gray-50/50 ${className} active:bg-gray-50/80`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 pr-2">
        {icon != null ? <span className="shrink-0 text-white/60 [&_svg]:block">{icon}</span> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span
              className="truncate text-sm font-bold leading-tight text-white"
              title={typeof label === 'string' ? label : undefined}
            >
              {label}
            </span>
            {badge}
          </div>
          {description != null && description !== '' ? (
            <span className="mt-0.5 text-[0.6875rem] leading-snug text-white/60">{description}</span>
          ) : null}
        </div>
      </div>
      {action != null ? <div className="flex shrink-0 items-center scale-90 origin-right">{action}</div> : null}
    </div>
  );
});

export default AdminRow;
