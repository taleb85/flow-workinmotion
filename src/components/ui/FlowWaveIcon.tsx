import { memo } from 'react';
import type React from 'react';
import FlowLogoSvg from '../FlowLogoSvg';

/**
 * FlowWaveIcon — icona brand FLOW (tre barre SVG), scalabile.
 * Usata in login, boot, PWA, profilo mobile, ecc.
 */
interface FlowWaveIconProps {
  /** Lato del quadrato contenitore (default 48) */
  size?: number;
  /** Raggio angoli wrapper (default size * 0.27) — il logo SVG ha già angoli arrotondati */
  radius?: number;
  className?: string;
  style?: React.CSSProperties;
}

const FlowWaveIcon = memo(function FlowWaveIcon({ size = 48, radius, className, style }: FlowWaveIconProps) {
  const r = radius ?? Math.round(size * 0.27);
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: r,
        flexShrink: 0,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        ...style,
      }}
    >
      <FlowLogoSvg
        variant="icon-only"
        color="orange"
        style={{ width: size, height: size, display: 'block', borderRadius: r, overflow: 'hidden' }}
      />
    </div>
  );
});

export default FlowWaveIcon;
