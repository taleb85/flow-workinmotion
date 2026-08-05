import React, { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Variant = 'toolbar' | 'overlay';

export type HorizontalScrollWeekNav = {
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
};

export type HorizontalScrollNavState = {
  canLeft: boolean;
  canRight: boolean;
  onPrev: () => void;
  onNext: () => void;
};

type Props = {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
  /** Ricalcola overflow quando cambia il contenuto (es. settimana). */
  remeasureKey?: unknown;
  ariaLabelPrev: string;
  ariaLabelNext: string;
  /**
   * Se impostato (es. Presenze vista settimana), le frecce cambiano settimana nel periodo
   * invece di scorrere orizzontalmente.
   */
  weekNav?: HorizontalScrollWeekNav;
  delta?: number;
  /** Classi Tailwind sulla riga dei pulsanti (solo `variant="toolbar"`). */
  navRowClassName?: string;
  /**
   * `toolbar`: riga pulsanti sopra lo scroll (default).
   * `overlay`: pulsanti tondi sui bordi (senza fascia gradiente, evita artefatti verticali).
   */
  variant?: Variant;
  /**
   * Callback chiamata ogni volta che cambia lo stato dei bottoni nav.
   * Permette al genitore di renderizzare i bottoni altrove (es. nella toolbar).
   * Se impostato con `variant="overlay"`, i bottoni overlay NON vengono renderizzati internamente.
   */
  onNavStateChange?: (state: HorizontalScrollNavState) => void;
  /** Espone il div scroll interno al genitore (per sincronizzare header mirror). */
  scrollSyncRef?: React.RefObject<HTMLDivElement | null>;
};

const overlayBtnClass =
  'absolute top-0 bottom-0 z-30 flex w-6 items-center justify-center text-white/50 transition-[opacity,color,background] duration-200 opacity-0 group-hover:opacity-100 hover:text-brand-deep disabled:pointer-events-none disabled:opacity-0';

export function HorizontalScrollArea({
  children,
  className = '',
  scrollClassName = 'overflow-x-auto-safe',
  remeasureKey,
  ariaLabelPrev,
  ariaLabelNext,
  weekNav,
  delta = 280,
  navRowClassName = '',
  variant = 'toolbar',
  onNavStateChange,
  scrollSyncRef,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  const onNavStateChangeRef = useRef(onNavStateChange);
  onNavStateChangeRef.current = onNavStateChange;

  const scrollBy = (dx: number) => {
    scrollRef.current?.scrollBy({ left: dx, behavior: 'smooth' });
  };

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 1;
    const newCanLeft = overflow && scrollLeft > 2;
    const newCanRight = overflow && scrollLeft < scrollWidth - clientWidth - 2;
    setCanLeft(newCanLeft);
    setCanRight(newCanRight);
  }, []);

  useEffect(() => {
    update();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [update, remeasureKey]);

  // Notifica il genitore ogni volta che cambia lo stato nav
  useEffect(() => {
    if (!onNavStateChangeRef.current) return;
    const useWeekNavEffect = weekNav != null;
    onNavStateChangeRef.current({
      canLeft: useWeekNavEffect ? weekNav!.canPrev : canLeft,
      canRight: useWeekNavEffect ? weekNav!.canNext : canRight,
      onPrev: useWeekNavEffect ? weekNav!.onPrev : () => scrollBy(-delta),
      onNext: useWeekNavEffect ? weekNav!.onNext : () => scrollBy(delta),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canLeft, canRight, weekNav?.canPrev, weekNav?.canNext, delta]);

  useEffect(() => {
    if (!weekNav) return;
    const el = scrollRef.current;
    if (el) el.scrollLeft = 0;
  }, [remeasureKey, weekNav]);

  const useWeekNav = weekNav != null;
  const showNav = useWeekNav ? weekNav.canPrev || weekNav.canNext : canLeft || canRight;
  const prevDisabled = useWeekNav ? !weekNav.canPrev : !canLeft;
  const nextDisabled = useWeekNav ? !weekNav.canNext : !canRight;
  const onPrevClick = useWeekNav ? weekNav.onPrev : () => scrollBy(-delta);
  const onNextClick = useWeekNav ? weekNav.onNext : () => scrollBy(delta);

  const rootClass =
    variant === 'overlay'
      ? `group relative ${className}`.trim()
      : className;

  return (
    <div className={rootClass}>
      {variant === 'toolbar' && showNav && (
        <div className={`flex justify-end gap-1 pb-2 ${navRowClassName}`}>
          <button
            type="button"
            disabled={prevDisabled}
            onClick={onPrevClick}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-500 text-white/70 transition-colors surface-ghost-interactive disabled:pointer-events-none disabled:opacity-35 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
            aria-label={ariaLabelPrev}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={nextDisabled}
            onClick={onNextClick}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-neutral-500 text-white/70 transition-colors surface-ghost-interactive disabled:pointer-events-none disabled:opacity-35 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
            aria-label={ariaLabelNext}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
      <div ref={(el) => { (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = el; if (scrollSyncRef) (scrollSyncRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }} onScroll={update} className={scrollClassName}>
        {children}
      </div>
      {variant === 'overlay' && showNav && !onNavStateChange && (
        <>
          <button
            type="button"
            disabled={prevDisabled}
            onClick={onPrevClick}
className={`left-0 rounded-l-[inherit] bg-gradient-to-r from-white/70 to-transparent hover:from-brand-deep/40 ${overlayBtnClass} active:brightness-95 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]`}
            aria-label={ariaLabelPrev}
          >
            <ChevronLeft className="h-5 w-5 shrink-0 drop-shadow-sm" strokeWidth={2} aria-hidden />
          </button>
          <button
            type="button"
            disabled={nextDisabled}
            onClick={onNextClick}
className={`right-0 rounded-r-[inherit] bg-gradient-to-l from-white/70 to-transparent hover:from-brand-deep/40 ${overlayBtnClass} active:brightness-95 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]`}
            aria-label={ariaLabelNext}
          >
            <ChevronRight className="h-5 w-5 shrink-0 drop-shadow-sm" strokeWidth={2} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
