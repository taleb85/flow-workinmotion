import { useState, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import PullToRefresh from 'pulltorefreshjs';
import { useIsStandalone } from '../hooks/useIsStandalone';

const PULL_THRESHOLD = 60;
const RESISTANCE = 0.4;
/** Soglia minima pull (px) prima di preventDefault sul touchmove (browser). */
const PULL_PREVENT_DEFAULT_PX = 10;

/**
 * L'app scrolla su `#root`.
 */
function getAppScrollY(): number {
  const r = document.getElementById('root');
  const t = r?.scrollTop ?? 0;
  return Math.max(
    t,
    window.scrollY,
    document.documentElement?.scrollTop ?? 0,
    document.body?.scrollTop ?? 0
  );
}

function isAppAtScrollTop(threshold = 10): boolean {
  return getAppScrollY() <= threshold;
}

interface BodyPullToRefreshProps {
  onRefresh: () => Promise<void>;
  disabled?: boolean;
}

/**
 * Pull-to-refresh: in PWA standalone usa pulltorefreshjs (funziona su iOS),
 * nel browser usa implementazione custom con touch su document.
 */
export default function BodyPullToRefresh({ onRefresh, disabled }: BodyPullToRefreshProps) {
  const isStandalone = useIsStandalone();
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const pullDistanceRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  const disabledRef = useRef(disabled);
  onRefreshRef.current = onRefresh;
  disabledRef.current = disabled;
  pullDistanceRef.current = pullDistance;

  // PWA standalone: usa pulltorefreshjs (funziona su iOS dove il nativo è disabilitato)
  useEffect(() => {
    if (!isStandalone) return;

    (PullToRefresh as { setPassiveMode?: (passive: boolean) => void }).setPassiveMode?.(false);

    const ptr = PullToRefresh.init({
      mainElement: '#root',
      triggerElement: '#root',
      distThreshold: 60,
      distMax: 80,
      shouldPullToRefresh: () => {
        if (getAppScrollY() < 0) return true; /* iOS: overscroll in cima */
        return getAppScrollY() <= 10;
      },
      onRefresh: () => {
        if (disabledRef.current) return Promise.resolve();
        return onRefreshRef.current();
      },
      instructionsPullToRefresh: 'Tira per aggiornare',
      instructionsReleaseToRefresh: 'Rilascia per aggiornare',
      instructionsRefreshing: 'Aggiornamento…',
    });

    return () => {
      ptr.destroy();
    };
  }, [isStandalone]);

  // Browser (non standalone): implementazione custom — solo su dispositivi touch.
  // Su Windows desktop (pointer: fine) non ha senso registrare touchmove con passive:false.
  useEffect(() => {
    if (isStandalone) return;
    const isTouch = typeof window !== 'undefined'
      && window.matchMedia('(pointer: coarse)').matches;
    if (!isTouch) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (disabled || e.touches.length === 0) return;
      if (!isAppAtScrollTop(5)) return;
      startY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (disabled || e.touches.length === 0) return;
      if (!isAppAtScrollTop(5)) return;
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      if (diff > PULL_PREVENT_DEFAULT_PX && e.cancelable) {
        e.preventDefault();
      }
      if (diff > 0) {
        const resisted = Math.min(diff * RESISTANCE, PULL_THRESHOLD * 1.5);
        setPullDistance(resisted);
      }
    };

    const handleTouchEnd = () => {
      if (disabled) return;
      const currentPull = pullDistanceRef.current;
      setPullDistance(0);
      if (currentPull >= PULL_THRESHOLD) {
        setIsRefreshing(true);
        onRefreshRef.current()
          .catch(() => {})
          .finally(() => setIsRefreshing(false));
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [disabled, isStandalone]);

  // UI custom solo per browser (standalone usa quella di pulltorefreshjs)
  const showRefresher = !isStandalone && (pullDistance > 0 || isRefreshing);
  const refresherHeight = Math.max(pullDistance, isRefreshing ? PULL_THRESHOLD : 0);

  if (!showRefresher) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[90] flex items-center justify-center bg-app-bg/92 transition-[height] duration-200 ease-out safe-area-pad"
      style={{ height: refresherHeight }}
      aria-hidden
    >
      <Loader2 className="w-6 h-6 text-accent animate-spin flex-shrink-0" strokeWidth={2.5} />
    </div>
  );
}
