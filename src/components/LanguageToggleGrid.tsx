import { memo } from 'react';
import type { Language } from '../types';
import { getDeviceUiLanguage } from '../utils/uiLanguagePreference';

const LANGS: Language[] = ['it', 'en', 'es', 'fr'];

const FLAGS: Record<Language, string> = { it: '🇮🇹', en: '🇬🇧', es: '🇪🇸', fr: '🇫🇷' };
const LABELS: Record<Language, string> = {
  it: 'Italiano',
  en: 'English',
  es: 'Español',
  fr: 'Français',
};

/** Etichette ultra-brevi sotto la bandiera (PWA compatto) */
const LABELS_SHORT: Record<Language, string> = {
  it: 'ITA',
  en: 'EN',
  es: 'ES',
  fr: 'FR',
};

interface LanguageToggleGridProps {
  effectiveLanguage: Language;
  setLanguage: (lang: Language) => void;
  /** Layout più compatto per PWA / header mobile */
  dense?: boolean;
}

/** Stessa griglia lingue della scheda Profilo staff — riutilizzabile nell'header gestionale. */
const LanguageToggleGrid = memo(function LanguageToggleGrid({ effectiveLanguage, setLanguage, dense = false }: LanguageToggleGridProps) {
  const deviceLang = getDeviceUiLanguage();

  if (dense) {
    return (
      <div className="grid grid-cols-5 gap-1.5">
        {/* AUTO — usa lingua dispositivo */}
        <button
          type="button"
          onClick={() => setLanguage(deviceLang)}
          title={`Auto → ${deviceLang.toUpperCase()}`}
          aria-label={`Auto (${deviceLang.toUpperCase()})`}
          className="flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 rounded-lg font-semibold transition-colors min-h-[2.75rem] min-w-0 bg-slate-100 text-white/70 active:bg-slate-200"
        >
          <span className="text-[0.8125rem] leading-none" aria-hidden>⚙︎</span>
          <span className="text-[0.6875rem] leading-tight text-center truncate w-full tracking-tight">AUTO</span>
        </button>
        {LANGS.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => setLanguage(lang)}
            title={LABELS[lang]}
            aria-label={LABELS[lang]}
            className={`flex flex-col items-center justify-center gap-0.5 py-1.5 px-0.5 rounded-lg font-semibold transition-colors min-h-[2.75rem] min-w-0 ${
 effectiveLanguage === lang ? 'bg-accent text-white' : 'bg-slate-100 text-white/70 active:bg-slate-200'
 }`}
          >
            <span className="text-[0.9375rem] leading-none" aria-hidden>
              {FLAGS[lang]}
            </span>
            <span className="text-[0.6875rem] leading-tight text-center truncate w-full tracking-tight" title={LABELS_SHORT[lang]}>{LABELS_SHORT[lang]}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {/* AUTO — usa lingua dispositivo */}
      <button
        type="button"
        onClick={() => setLanguage(deviceLang)}
        title={`Auto → ${deviceLang.toUpperCase()}`}
        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[2.75rem] bg-slate-100 text-white/70 hover:bg-slate-200 active:bg-slate-200/80"
      >
        <span className="text-xs font-bold">AUTO</span>
      </button>
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => setLanguage(lang)}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium transition-colors min-h-[2.75rem] ${
 effectiveLanguage === lang ? 'bg-accent text-white' : 'bg-slate-100 text-white/70 hover:bg-slate-200'
 } active:bg-slate-200'/80`}
        >
          <span>{FLAGS[lang]}</span>
          <span className="text-xs">{LABELS[lang]}</span>
        </button>
      ))}
    </div>
  );
});

export default LanguageToggleGrid;
