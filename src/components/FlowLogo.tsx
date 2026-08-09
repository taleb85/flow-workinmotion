import { memo } from 'react';
import FlowLogoSvg from './FlowLogoSvg';

/**
 * FlowLogo — icona vettoriale (FlowLogoSvg) + wordmark. Brand navy/arancio.
 */
interface FlowLogoProps {
  size?: number;
  showText?: boolean;
  showIcon?: boolean;
  subtitle?: string | false;
  className?: string;
  colorScheme?: 'blue' | 'white';
}

const FlowLogo = memo(function FlowLogo({
  size = 32,
  showText = true,
  showIcon = true,
  subtitle = 'Work in Motion',
  className = '',
  colorScheme = 'blue',
}: FlowLogoProps) {
  const isWhite = colorScheme === 'white';

  return (
    <div className={`flex items-center gap-2.5 leading-none select-none ${className}`}>
      {showIcon && (
        <FlowLogoSvg
          variant="icon-only"
          color="orange"
          className="shrink-0"
          style={{ width: size, height: size, display: 'block' }}
        />
      )}

      {/* Wordmark + subtitle opzionali */}
      {showText && (
        <div className="flex flex-col leading-none">
          <span
            style={{
              fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
              fontSize: size * 0.72,
              fontWeight: 800,
              letterSpacing: '-0.045em',
              lineHeight: 1,
              ...(isWhite
                ? { color: '#FFFFFF' }
                : { color: '#1A263E' }),
            }}
          >
            FLOW
          </span>
          {subtitle && (
            <span
              style={{
                fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                fontSize: size * 0.22,
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginTop: size * 0.07,
                ...(isWhite
                  ? { color: 'rgba(255,255,255,0.8)' }
                  : { color: '#64748b' }),
              }}
            >
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
});

export default FlowLogo;

/**
 * FlowMarkOnly — solo l'icona (senza testo), per badge e favicon in-app.
 */
export const FlowMarkOnly = memo(function FlowMarkOnly({ size = 24, className = '' }: { size?: number; className?: string }) {
  return <FlowLogo size={size} showText={false} className={className} />;
});
