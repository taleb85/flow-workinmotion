import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  computeEffectiveLayoutFromWidth,
  computeViewportClass,
  LAYOUT_BREAKPOINT_PX,
  type LayoutEffective,
  type ViewportClass,
} from '../utils/layoutPreset';

export type { LayoutEffective, ViewportClass };

export function LayoutPresetProvider({ children }: { children: ReactNode }) {
  /** Usa sempre la dimensione più piccola (larghezza in verticale) anche in orizzontale,
   *  così l'app non si "trasforma" in versione desktop quando il telefono è ruotato. */
  const [width, setWidth] = useState(() =>
    typeof window !== 'undefined'
      ? Math.min(window.innerWidth, window.innerHeight)
      : LAYOUT_BREAKPOINT_PX,
  );
  /** Flag per rilevare il landscape reale (viewport più largo che alto) indipendentemente
   *  dalla larghezza calcolata — serve per forzare il viewport CSS. */
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false,
  );

  const effective = useMemo(() => computeEffectiveLayoutFromWidth(width), [width]);
  const viewportClass = useMemo(() => computeViewportClass(width), [width]);

  useEffect(() => {
    const update = () => {
      setWidth(Math.min(window.innerWidth, window.innerHeight));
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-layout-preset', 'auto');
    document.documentElement.setAttribute('data-layout-effective', effective);
    document.documentElement.setAttribute('data-viewport-class', viewportClass);
  }, [effective, viewportClass]);

  /** Quando il viewport è "phone" in orizzontale, disabilita i media query Tailwind
   *  che attiverebbero layout da tablet/desktop (md: e md:). In questo modo la
   *  grafica rimane quella mobile ma si adatta a tutta la larghezza disponibile. */
  useEffect(() => {
    const isLandscapePhone = viewportClass === 'phone' && isLandscape;

    // Trova tutti i CSSMediaRule con min-width: 640/768 (sm/md) e salva l'originale
    const sheet = document.styleSheets;
    const targets: { rule: CSSMediaRule; original: string }[] = [];
    for (let i = 0; i < sheet.length; i++) {
      try {
        const rules = sheet[i].cssRules;
        if (!rules) continue;
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          if (!(rule instanceof CSSMediaRule)) continue;
          const mt = rule.media.mediaText;
          // Scegli i breakpoint rilevanti (640=sm, 768=md, 1024=lg)
          if (/min-width:\s*(64[04]|768|1024)\s*px/.test(mt)) {
            targets.push({ rule, original: mt });
          }
        }
      } catch { /* cross-origin stylesheet — skip */ }
    }

    if (isLandscapePhone) {
      targets.forEach(({ rule }) => { rule.media.mediaText = '(min-width: 99999px)'; });
    } else {
      targets.forEach(({ rule, original }) => { rule.media.mediaText = original; });
    }

    return () => {
      // Cleanup: ripristina tutti i media query originali
      targets.forEach(({ rule, original }) => { rule.media.mediaText = original; });
    };
  }, [viewportClass, isLandscape]);

  return <>{children}</>;
}
