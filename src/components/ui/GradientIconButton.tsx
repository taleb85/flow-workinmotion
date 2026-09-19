import { memo, type CSSProperties, type ReactNode } from 'react';

export interface GradientIconButtonProps {
  /** Testo della pill mostrata sotto al pulsante al hover (usato come aria-label se non diverso). */
  label: string;
  /** aria-label esplicito, quando il testo della pill non basta a descrivere l'azione. */
  ariaLabel?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Classi del pulsante: forma, sfondo, colore, spaziatura. */
  className?: string;
  /** Colore iniziale del gradiente della pill. */
  gradientFrom: string;
  /** Colore finale del gradiente della pill. */
  gradientTo: string;
  children: ReactNode;
}

/**
 * Pulsante a icona: al hover appare sotto una pill con l'etichetta.
 * Il pulsante non cambia dimensione, quindi gli altri comandi non si spostano.
 *
 * Attenzione: la pill sborda sotto il pulsante, quindi il contenitore non deve
 * avere `overflow-hidden`.
 */
export const GradientIconButton = memo(function GradientIconButton({
  label,
  ariaLabel,
  onClick,
  type = 'button',
  disabled,
  className = '',
  gradientFrom,
  gradientTo,
  children,
}: GradientIconButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? label}
      style={{ '--gradient-from': gradientFrom, '--gradient-to': gradientTo } as CSSProperties}
      className={`group relative flex shrink-0 items-center justify-center transition-colors duration-300 hover:z-20 ${className}`}
    >
      <span className="relative z-10 flex shrink-0 items-center justify-center">
        {children}
      </span>
      {/* Pill con l'etichetta: appare sotto il pulsante */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-full z-30 flex justify-center pt-2"
      >
        <span className="origin-top scale-90 whitespace-nowrap rounded-full bg-[linear-gradient(45deg,var(--gradient-from),var(--gradient-to))] px-3 py-1 text-[0.625rem] font-bold uppercase tracking-wider text-white opacity-0 shadow-lg transition-all duration-300 group-hover:scale-100 group-hover:opacity-100">
          {label}
        </span>
      </span>
    </button>
  );
});
