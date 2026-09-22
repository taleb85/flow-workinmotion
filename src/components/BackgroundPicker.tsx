import { useState } from 'react';
import { Check } from 'lucide-react';
import {
  getBackgroundThemes,
  getStoredTheme,
  storeTheme,
  type BackgroundTheme,
} from '../utils/backgroundThemes';
import { useT } from '../hooks/useT';
import type { Language } from '../types';

/** Etichetta del tema nella lingua corrente (fallback: inglese, poi italiano). */
function themeLabel(theme: BackgroundTheme, language: Language): string {
  return theme.label[language] ?? theme.label.en ?? theme.label.it;
}

/**
 * Scelta dello sfondo app: anteprima grande del tema selezionato e tap per applicarlo
 * subito (l'app cambia in tempo reale, nessuna griglia di miniature).
 */
export default function BackgroundPicker({ userId, language }: { userId?: string; language: Language }) {
  const t = useT();
  const themes = getBackgroundThemes();
  const [activeId, setActiveId] = useState(() => getStoredTheme(userId).id);
  const active = themes.find((theme) => theme.id === activeId) ?? themes[0]!;

  const select = (theme: BackgroundTheme) => {
    setActiveId(theme.id);
    storeTheme(theme.id, userId);
    window.dispatchEvent(new CustomEvent('flow-bg-change', { detail: theme.id }));
  };

  return (
    <div className="space-y-3">
      <p className="text-[0.6875rem] text-white/50">{t.bg_picker_hint}</p>

      {/* Anteprima del tema selezionato */}
      <div
        className="relative aspect-[16/10] overflow-hidden rounded-xl border border-white/[0.14]"
        style={{ background: active.appBg }}
      >
        <div className="absolute inset-0" style={{ background: active.previewGradient }} />
        {active.glows.map((glow, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              backgroundColor: glow.color,
              opacity: glow.opacity * 1.6,
              filter: `blur(${Math.round(glow.blur * 0.3)}px)`,
              width: '45%',
              height: '45%',
              ...glow.position,
            }}
          />
        ))}
        <svg
          className="absolute bottom-0 left-0 right-0 h-[22%] w-full"
          style={{ opacity: active.waveOpacity }}
          viewBox="0 0 1440 220"
          preserveAspectRatio="none"
        >
          <path
            fill={`rgba(${active.starColor},0.5)`}
            d="M0,110 C240,200 400,30 720,110 C1040,200 1200,30 1440,110 L1440,220 L0,220 Z"
          />
        </svg>
      </div>

      {/* Selezione */}
      <div className="flex flex-wrap gap-1.5">
        {themes.map((theme) => {
          const isActive = theme.id === activeId;
          return (
            <button
              key={theme.id}
              type="button"
              onClick={() => select(theme)}
              aria-pressed={isActive}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{
                color: isActive ? '#ffffff' : 'rgba(255,255,255,0.65)',
                background: isActive ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.06)',
                border: `1px solid ${isActive ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)'}`,
              }}
            >
              {isActive && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
              {themeLabel(theme, language)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
