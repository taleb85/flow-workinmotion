import { type BackgroundTheme } from '../utils/backgroundThemes';

export default function DeepAuroraShell({ theme }: { theme: BackgroundTheme }) {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Base gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: theme.previewGradient }}
      />

      {theme.glows.map((g, i) => (
        <div
          key={i}
          className="pointer-events-none absolute rounded-full"
          style={{
            backgroundColor: g.color,
            opacity: g.opacity,
            filter: `blur(${g.blur}px)`,
            width: g.size.split(' ')[1] ?? g.size,
            height: g.size.split(' ')[0] ?? g.size,
            ...g.position,
            transform: g.position.left && g.position.left !== '50%' ? undefined : g.position.left === '50%' ? 'translateX(-50%)' : undefined,
          }}
        />
      ))}

      {/* Stelle */}
      <div className="pointer-events-none absolute top-[6%] right-[18%] h-[3px] w-[3px] rounded-full shadow-[0_0_10px_rgba(var(--star-color),0.5)]" style={{ backgroundColor: `rgba(${theme.starColor},0.3)` }} />
      <div className="pointer-events-none absolute top-[15%] right-[38%] h-[4px] w-[4px] rounded-full shadow-[0_0_14px_rgba(var(--star-color),0.3)]" style={{ backgroundColor: `rgba(${theme.starColor},0.2)` }} />
      <div className="pointer-events-none absolute top-[32%] left-[6%] h-[3px] w-[3px] rounded-full shadow-[0_0_10px_rgba(var(--star-color),0.35)]" style={{ backgroundColor: `rgba(${theme.starColor},0.2)` }} />
      <div className="pointer-events-none absolute top-[50%] left-[18%] h-[4px] w-[4px] rounded-full shadow-[0_0_14px_rgba(var(--star-color),0.35)]" style={{ backgroundColor: `rgba(${theme.starColor},0.2)` }} />
      <div className="pointer-events-none absolute top-[65%] right-[12%] h-[3px] w-[3px] rounded-full shadow-[0_0_12px_rgba(var(--star-color),0.25)]" style={{ backgroundColor: `rgba(${theme.starColor},0.15)` }} />
      <div className="pointer-events-none absolute top-[78%] left-[32%] h-[3px] w-[3px] rounded-full shadow-[0_0_10px_rgba(var(--star-color),0.3)]" style={{ backgroundColor: `rgba(${theme.starColor},0.18)` }} />
      <div className="pointer-events-none absolute top-[42%] right-[52%] h-[3px] w-[3px] rounded-full shadow-[0_0_12px_rgba(var(--star-color),0.3)]" style={{ backgroundColor: `rgba(${theme.starColor},0.18)` }} />
      <div className="pointer-events-none absolute top-[88%] right-[40%] h-[3px] w-[3px] rounded-full shadow-[0_0_8px_rgba(var(--star-color),0.2)]" style={{ backgroundColor: `rgba(${theme.starColor},0.12)` }} />

      {/* Linee orizzonte */}
      <div className="pointer-events-none absolute top-[44%] left-[3%] right-[3%] h-[1px] bg-gradient-to-r from-transparent via-[rgba(var(--star-color),0.08)] to-transparent" />
      <div className="pointer-events-none absolute top-[73%] left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-[rgba(var(--star-color),0.04)] to-transparent" />

      {/* Onda */}
      <svg
        className="pointer-events-none absolute bottom-0 left-0 right-0 w-full h-[220px]"
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
