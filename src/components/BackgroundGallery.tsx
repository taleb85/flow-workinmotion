import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Palette, ChevronRight } from 'lucide-react';
import { getBackgroundThemes, getStoredTheme, storeTheme, type BackgroundTheme } from '../utils/backgroundThemes';
import { useT } from '../hooks/useT';

export default function BackgroundGallery({
  onSelect,
  userId,
  variant = 'button',
}: {
  onSelect?: (theme: BackgroundTheme) => void;
  userId?: string;
  /** `profile-row`: riga singola come accordion Lingua in Profilo */
  variant?: 'button' | 'profile-row';
}) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>(getStoredTheme(userId).id);
  const themes = getBackgroundThemes();
  const t = useT();

  useEffect(() => {
    if (open) {
      setActiveId(getStoredTheme(userId).id);
    }
  }, [open, userId]);

  const handleSelect = useCallback((theme: BackgroundTheme) => {
    setActiveId(theme.id);
    storeTheme(theme.id, userId);
    window.dispatchEvent(new CustomEvent('flow-bg-change', { detail: theme.id }));
    onSelect?.(theme);
  }, [onSelect, userId]);

  const activeTheme = themes.find(t => t.id === activeId) ?? themes[0];
  // Deriviamo una tonalità leggermente più chiara/scura per il modale dal colore active
  const modalBg = activeTheme.appBg;

  // Griglia opzioni sfondo — riusata sia inline (profile-row) sia nel modale (button)
  const galleryGrid = (
    <div className="grid grid-cols-2 gap-3 p-4">
      {themes.map((theme) => {
        const isActive = activeId === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            onClick={() => handleSelect(theme)}
            className={`group relative flex flex-col items-center gap-2 rounded-2xl p-3 transition-colors duration-200 ${
              isActive
                ? 'ring-2 ring-white/60 shadow-lg shadow-white/10 scale-[1.02]'
                : ' ring-1 ring-transparent hover:ring-white/20'
            }`}
            style={{ background: theme.appBg }}
          >
            {/* Preview glow */}
            <div
              className="relative w-full aspect-[16/10] rounded-xl overflow-hidden"
              style={{ background: theme.appBg }}
            >
              <div
                className="absolute inset-0"
                style={{ background: theme.previewGradient }}
              />
              {theme.glows.slice(0, 3).map((g, i) => (
                <div
                  key={i}
                  className="absolute rounded-full"
                  style={{
                    backgroundColor: g.color,
                    opacity: g.opacity * 1.5,
                    filter: `blur(${Math.round(g.blur * 0.3)}px)`,
                    width: '60%',
                    height: '60%',
                    ...g.position,
                  }}
                />
              ))}
              {/* Stelle miniature */}
              <div className="absolute top-[15%] right-[20%] h-[0.125rem] w-[0.125rem] rounded-full shadow-[0_0_4px_rgba(255,255,255,0.4)]" style={{ backgroundColor: `rgba(${theme.starColor},0.3)` }} />
              <div className="absolute top-[40%] left-[15%] h-[0.125rem] w-[0.125rem] rounded-full shadow-[0_0_4px_rgba(255,255,255,0.3)]" style={{ backgroundColor: `rgba(${theme.starColor},0.2)` }} />
              <div className="absolute top-[70%] right-[30%] h-[0.125rem] w-[0.125rem] rounded-full shadow-[0_0_4px_rgba(255,255,255,0.25)]" style={{ backgroundColor: `rgba(${theme.starColor},0.15)` }} />

              {/* Checkmark */}
              {isActive && (
                <div className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 shadow-lg">
                  <Check className="h-3.5 w-3.5 text-black" strokeWidth={3} />
                </div>
              )}
            </div>

            <span className={`text-xs font-semibold tracking-wide ${isActive ? 'text-white' : 'text-white/60 group-hover:text-white/90'}`}>
              {theme.label.it}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      {variant === 'profile-row' ? (
        <>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-label={t.bg_gallery_open ?? 'Sfondi'}
            className="w-full flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-white/10"
          >
            <span className="text-[0.8125rem] font-semibold text-white">{t.bg_gallery_btn ?? 'Sfondo'}</span>
            <ChevronRight className={`w-4 h-4 text-white/60 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} aria-hidden />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                key="bg-gallery-inline"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {galleryGrid}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t.bg_gallery_open ?? 'Sfondi'}
          className="inline-flex min-h-[2.75rem] w-full md:w-auto items-center justify-center gap-2 rounded-xl border border-neutral-500 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/15"
        >
          <Palette className="h-4 w-4" />
          {t.bg_gallery_btn ?? 'Sfondo app'}
        </button>
      )}

      {variant !== 'profile-row' && (
        <AnimatePresence>
          {open && (
            <motion.div
              key="bg-gallery-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[10090] flex items-center justify-center p-4 font-sans"
              style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }}
              onClick={() => setOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 20 }}
                transition={{ type: 'spring', stiffness: 380, damping: 30, mass: 0.9 }}
                className="relative w-full max-w-xs max-h-[85vh] overflow-y-auto rounded-3xl border border-white/10 shadow-2xl"
                style={{ background: modalBg }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 px-4 py-3 backdrop-blur-xl" style={{ background: modalBg }}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                      <Palette className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-white">{t.bg_gallery_title ?? 'Sfondo app'}</h2>
                      <p className="text-[0.6875rem] text-white/50">{t.bg_gallery_subtitle ?? 'Scegli lo sfondo che preferisci'}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {galleryGrid}

                {/* Footer */}
                <div className="border-t border-white/10 px-4 py-2.5 text-center">
                  <p className="text-[0.625rem] text-white/40">{t.bg_gallery_footer ?? 'Lo sfondo si aggiorna subito e rimane salvato'}</p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
