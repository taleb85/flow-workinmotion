import { memo, useId, type CSSProperties } from 'react';

// ── Palette (da FlowLogoSvg in brand guide / Downloads) ────────────────────
const FACE = {
  bg1: '#253660',
  bg2: '#1a2744',
  bg3: '#111c36',
  gloss1: 'rgba(255,255,255,0.18)',
  gloss2: 'rgba(255,255,255,0.03)',
  track: '#3a2e35',
} as const;

type Fill3 = { short: string; mid1: string; mid2: string };
type FillsKey = { a: Fill3; b: Fill3 };

const FILLS = {
  orange: {
    a: { short: '#ffcc00', mid1: '#ff9900', mid2: '#e07800' },
    b: { short: '#ffd700', mid1: '#ffaa00', mid2: '#e08800' },
  },
  teal: {
    a: { short: '#5dcaa5', mid1: '#0f6e56', mid2: '#0f6e56' },
    b: { short: '#9fe1cb', mid1: '#1d9e75', mid2: '#1d9e75' },
  },
  purple: {
    a: { short: '#afa9ec', mid1: '#534ab7', mid2: '#534ab7' },
    b: { short: '#cecbf6', mid1: '#7f77dd', mid2: '#7f77dd' },
  },
  green: {
    a: { short: '#97c459', mid1: '#3b6d11', mid2: '#3b6d11' },
    b: { short: '#c0dd97', mid1: '#639922', mid2: '#639922' },
  },
} satisfies Record<string, FillsKey>;

export type FlowLogoSvgColor = keyof typeof FILLS;

const APP = { W: 160, br: 28, tw: 118, th: 22, gap: 10, fw: [86, 118, 60] as const } as const;
const FULL = { W: 195, H: 235, br: 34, tw: 135, th: 23, gap: 9, barsTop: 28, fw: [100, 135, 70] as const } as const;

function fillGrad(id: string, c: Fill3) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
      <stop offset="0%" stopColor={c.short} />
      <stop offset="60%" stopColor={c.mid1} />
      <stop offset="100%" stopColor={c.mid2} />
    </linearGradient>
  );
}

function fillsForColor(color: FlowLogoSvgColor) {
  return FILLS[color] ?? FILLS.orange;
}

export type FlowLogoSvgVariant = 'full' | 'icon-only' | 'header';

export interface FlowLogoSvgProps {
  variant?: FlowLogoSvgVariant;
  color?: FlowLogoSvgColor;
  className?: string;
  style?: CSSProperties;
  wordmark?: 'onLight' | 'onDark';
  headerBar?: boolean;
  /** Solo `icon-only`: lato in px (default 160). */
  size?: number;
}

function IconApp160({
  uid,
  color,
  s = 160,
  r = 1,
}: {
  uid: string;
  color: FlowLogoSvgColor;
  s?: number;
  r?: number;
}) {
  const { a, b } = fillsForColor(color);
  const { tw: tw0, th: th0, gap: gap0, br: br0, fw: fw0 } = APP;
  const tw = tw0 * r;
  const th = th0 * r;
  const gap = gap0 * r;
  const br = br0 * r;
  const pillR = th / 2;
  const fw: [number, number, number] = [fw0[0] * r, fw0[1] * r, fw0[2] * r];
  const totalH = 3 * th + 2 * gap;
  const startY = (s - totalH) / 2;
  const startX = (s - tw) / 2;
  const glossH = s * 0.52;

  return (
    <>
      <defs>
        {fillGrad(`${uid}-face`, { short: FACE.bg1, mid1: FACE.bg2, mid2: FACE.bg3 })}
        {fillGrad(`${uid}-fa`, a)}
        {fillGrad(`${uid}-fb`, b)}
        <linearGradient id={`${uid}-gloss`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor={FACE.gloss1} />
          <stop offset="100%" stopColor={FACE.gloss2} />
        </linearGradient>
        <clipPath id={`${uid}-ic`}>
          <rect width={s} height={s} rx={br} />
        </clipPath>
      </defs>
      <rect width={s} height={s} rx={br} fill={`url(#${uid}-face)`} />
      {[0, 1, 2].map((i) => {
        const y = startY + i * (th + gap);
        const gradId = i === 1 ? `${uid}-fb` : `${uid}-fa`;
        return (
          <g key={i}>
            <rect x={startX} y={y} width={tw} height={th} rx={pillR} fill={FACE.track} />
            <rect x={startX} y={y} width={fw[i]} height={th} rx={pillR} fill={`url(#${gradId})`} />
          </g>
        );
      })}
      <rect x="0" y="0" width={s} height={glossH} fill={`url(#${uid}-gloss)`} clipPath={`url(#${uid}-ic)`} />
    </>
  );
}

function FullLogo195({
  uid,
  color,
  wordmark,
}: {
  uid: string;
  color: FlowLogoSvgColor;
  wordmark: 'onLight' | 'onDark';
}) {
  const { a, b } = fillsForColor(color);
  const { W, H, br, tw, th, gap, barsTop, fw } = FULL;
  const r = th / 2;
  const startX = (W - tw) / 2;
  const totalBarsH = 3 * th + 2 * gap;
  const glossH = H * 0.48;
  const tFlow = wordmark === 'onLight' ? '#1a2744' : '#ffffff';
  const tSub = wordmark === 'onLight' ? 'rgba(26, 39, 68, 0.85)' : '#7a8fad';

  return (
    <>
      <defs>
        {fillGrad(`${uid}-face`, { short: FACE.bg1, mid1: FACE.bg2, mid2: FACE.bg3 })}
        {fillGrad(`${uid}-fa`, a)}
        {fillGrad(`${uid}-fb`, b)}
        <linearGradient id={`${uid}-gloss`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor={FACE.gloss1} />
          <stop offset="100%" stopColor={FACE.gloss2} />
        </linearGradient>
        <clipPath id={`${uid}-fc`}>
          <rect width={W} height={H} rx={br} />
        </clipPath>
      </defs>
      <rect width={W} height={H} rx={br} fill={`url(#${uid}-face)`} />
      {[0, 1, 2].map((i) => {
        const y = barsTop + i * (th + gap);
        const gradId = i === 1 ? `${uid}-fb` : `${uid}-fa`;
        return (
          <g key={i}>
            <rect x={startX} y={y} width={tw} height={th} rx={r} fill={FACE.track} />
            <rect x={startX} y={y} width={fw[i]} height={th} rx={r} fill={`url(#${gradId})`} />
          </g>
        );
      })}
      <text
        x={W / 2}
        y={barsTop + totalBarsH + 42}
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="900"
        fontSize="32"
        letterSpacing="4"
        fill={tFlow}
      >
        FLOW
      </text>
      <text
        x={W / 2}
        y={barsTop + totalBarsH + 66}
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="500"
        fontSize="12"
        letterSpacing="3"
        fill={tSub}
      >
        WORK IN
      </text>
      <text
        x={W / 2}
        y={barsTop + totalBarsH + 82}
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontWeight="500"
        fontSize="12"
        letterSpacing="3"
        fill={tSub}
      >
        MOTION
      </text>
      <rect x="0" y="0" width={W} height={glossH} fill={`url(#${uid}-gloss)`} clipPath={`url(#${uid}-fc)`} />
    </>
  );
}

/**
 * FlowLogoSvg — allineato a `FlowLogoSvg.tsx` (Downloads): traccia + fill, gloss sopra.
 * API: `variant` + `color` (compatibile col resto dell’app).
 */
const FlowLogoSvg = memo(function FlowLogoSvg({
  variant = 'full',
  color = 'orange',
  className = '',
  style,
  wordmark = 'onDark',
  headerBar = false,
  size,
}: FlowLogoSvgProps) {
  const rawId = useId().replace(/:/g, '');
  const c = (color in FILLS ? color : 'orange') as FlowLogoSvgColor;
  const uid = `${rawId}-fl`;
  const uidH = `${rawId}-fh`;

  if (variant === 'icon-only') {
    const s = size ?? 160;
    const r = s / 160;
    return (
      <svg
        width={s}
        height={s}
        viewBox={`0 0 ${s} ${s}`}
        className={className}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="FLOW"
        style={{ maxWidth: '100%', height: 'auto', display: 'block', lineHeight: 0, ...style }}
      >
        <title>FLOW</title>
        <IconApp160 uid={uid} color={c} s={s} r={r} />
      </svg>
    );
  }

  if (variant === 'header') {
    const headerTextFill = wordmark === 'onLight' ? '#1a2744' : '#FFFFFF';
    const svg = (
      <svg
        width={300}
        height={60}
        viewBox="0 0 300 60"
        className={headerBar ? undefined : className}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="FLOW"
        style={{ maxWidth: '100%', height: 'auto', display: 'block', lineHeight: 0, ...style }}
      >
        <title>FLOW</title>
        <svg x="0" y="0" width="60" height="60" viewBox="0 0 160 160" role="presentation">
          <IconApp160 uid={uidH} color={c} />
        </svg>
        <text
          x="80"
          y="40"
          fill={headerTextFill}
          fontFamily="system-ui, -apple-system, sans-serif"
          fontWeight="bold"
          fontSize="24"
          letterSpacing="2"
        >
          FLOW
        </text>
      </svg>
    );
    if (headerBar) {
      return (
        <div className={`inline-flex max-w-full rounded-[0.625rem] bg-[#1a2744] px-3 py-1.5 ${className}`.trim()}>
          {svg}
        </div>
      );
    }
    return svg;
  }

  return (
    <svg
      width={FULL.W}
      height={FULL.H}
      viewBox={`0 0 ${FULL.W} ${FULL.H}`}
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={`${rawId}-ft`}
      style={{ maxWidth: '100%', height: 'auto', display: 'block', lineHeight: 0, ...style }}
    >
      <title id={`${rawId}-ft`}>FLOW — Work in Motion</title>
      <FullLogo195 uid={uid} color={c} wordmark={wordmark} />
    </svg>
  );
});

export default FlowLogoSvg;
