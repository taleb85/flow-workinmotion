import { type BackgroundTheme } from '../utils/backgroundThemes';

/* iOS: i blur enormi dell'aurora (fino a ~190px su elementi da 40rem) sono la
   causa più probabile del crash "Abnormally stopped" di Safari (memoria GPU).
   Su iPhone riduciamo blur e dimensioni dei bagliori: aspetto simile, costo
   di rendering molto più basso. */
const IS_IOS =
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent || '');

export default function DeepAuroraShell({ theme }: { theme: BackgroundTheme }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Base gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: theme.previewGradient }}
      />

      {theme.glows.map((g, i) => {
        const sizeTokens = g.size.split(' ');
        const glowWidth = sizeTokens[1] ?? g.size;
        const glowHeight = sizeTokens[0] ?? g.size;
        return (
          <div
            key={i}
            className="pointer-events-none absolute rounded-full"
            style={{
              backgroundColor: g.color,
              opacity: g.opacity,
              filter: `blur(${IS_IOS ? Math.min(g.blur, 60) : g.blur}px)`,
              width: IS_IOS ? `calc(${glowWidth} / 2)` : glowWidth,
              height: IS_IOS ? `calc(${glowHeight} / 2)` : glowHeight,
              ...g.position,
              transform: g.position.left && g.position.left !== '50%' ? undefined : g.position.left === '50%' ? 'translateX(-50%)' : undefined,
            }}
          />
        );
      })}

      {/* Stelle */}
      <div className="pointer-events-none absolute top-[6%] right-[18%] h-[0.1875rem] w-[0.1875rem] rounded-full shadow-[0_0_10px_rgba(var(--star-color),0.5)]" style={{ backgroundColor: `rgba(${theme.starColor},0.3)` }} />
      <div className="pointer-events-none absolute top-[15%] right-[38%] h-[0.25rem] w-[0.25rem] rounded-full shadow-[0_0_14px_rgba(var(--star-color),0.3)]" style={{ backgroundColor: `rgba(${theme.starColor},0.2)` }} />
      <div className="pointer-events-none absolute top-[32%] left-[6%] h-[0.1875rem] w-[0.1875rem] rounded-full shadow-[0_0_10px_rgba(var(--star-color),0.35)]" style={{ backgroundColor: `rgba(${theme.starColor},0.2)` }} />
      <div className="pointer-events-none absolute top-[50%] left-[18%] h-[0.25rem] w-[0.25rem] rounded-full shadow-[0_0_14px_rgba(var(--star-color),0.35)]" style={{ backgroundColor: `rgba(${theme.starColor},0.2)` }} />
      <div className="pointer-events-none absolute top-[65%] right-[12%] h-[0.1875rem] w-[0.1875rem] rounded-full shadow-[0_0_12px_rgba(var(--star-color),0.25)]" style={{ backgroundColor: `rgba(${theme.starColor},0.15)` }} />
      <div className="pointer-events-none absolute top-[78%] left-[32%] h-[0.1875rem] w-[0.1875rem] rounded-full shadow-[0_0_10px_rgba(var(--star-color),0.3)]" style={{ backgroundColor: `rgba(${theme.starColor},0.18)` }} />
      <div className="pointer-events-none absolute top-[42%] right-[52%] h-[0.1875rem] w-[0.1875rem] rounded-full shadow-[0_0_12px_rgba(var(--star-color),0.3)]" style={{ backgroundColor: `rgba(${theme.starColor},0.18)` }} />
      <div className="pointer-events-none absolute top-[88%] right-[40%] h-[0.1875rem] w-[0.1875rem] rounded-full shadow-[0_0_8px_rgba(var(--star-color),0.2)]" style={{ backgroundColor: `rgba(${theme.starColor},0.12)` }} />

      {/* Linee orizzonte */}
      <div className="pointer-events-none absolute top-[44%] left-[3%] right-[3%] h-[0.0625rem] bg-gradient-to-r from-transparent via-[rgba(var(--star-color),0.08)] to-transparent" />
      <div className="pointer-events-none absolute top-[73%] left-[10%] right-[10%] h-[0.0625rem] bg-gradient-to-r from-transparent via-[rgba(var(--star-color),0.04)] to-transparent" />

      {/* Onda */}
      <svg
        className="pointer-events-none absolute bottom-0 left-0 right-0 w-full h-[13.75rem]"
        style={{ opacity: theme.waveOpacity }}
        viewBox="0 0 1440 220"
        preserveAspectRatio="none"
      >
        <path
          fill={`rgba(${theme.starColor.split(',').slice(0,3).join(',')},0.5)`}
          d="M0,110 C240,200 400,30 720,110 C1040,200 1200,30 1440,110 L1440,220 L0,220 Z"
        />
      </svg>
    </div>
  );
}
