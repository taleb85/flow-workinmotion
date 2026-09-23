import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  computeEffectiveLayoutFromWidth,
  computeViewportClass,
  isDevMobileOverrideActive,
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

  /** Override di sviluppo (`?view=mobile`): forza il layout telefono anche su viewport larghi. */
  const devMobileOverride = useMemo(() => isDevMobileOverrideActive(), []);

  const effective = useMemo(
    () => (devMobileOverride ? 'compact' : computeEffectiveLayoutFromWidth(width)),
    [width, devMobileOverride],
  );
  const viewportClass = useMemo(
    () => (devMobileOverride ? 'phone' : computeViewportClass(width)),
    [width, devMobileOverride],
  );

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
   *  che attiverebbero layout da tablet/desktop (sm/md/lg). In questo modo la
   *  grafica rimane quella mobile ma si adatta a tutta la larghezza disponibile.
   *  In sviluppo l'override `?view=mobile` attiva lo stesso comportamento su
   *  qualunque viewport (anteprima mobile nel pannello IDE largo). */
  useEffect(() => {
    const suppressDesktopMediaQueries =
      devMobileOverride || (viewportClass === 'phone' && isLandscape);

    // Regole neutralizzate, con il testo media originale (chiave = regola CSS).
    // Il registro non viene azzerato: una regola già riscritta a `99999px` non
    // corrisponderebbe più al pattern e non potrebbe più essere ripristinata.
    const originals = new Map<CSSMediaRule, string>();

    const scan = () => {
      const sheet = document.styleSheets;
      for (let i = 0; i < sheet.length; i++) {
        try {
          const rules = sheet[i].cssRules;
          if (!rules) continue;
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j];
            if (!(rule instanceof CSSMediaRule)) continue;
            const mt = rule.media.mediaText;
            // Scegli i breakpoint rilevanti (640=sm, 768=md, 1024=lg)
            if (/min-width:\s*(64[04]|768|1024)\s*px/.test(mt) && !originals.has(rule)) {
              originals.set(rule, mt);
            }
          }
        } catch { /* cross-origin stylesheet — skip */ }
      }
    };

    const apply = () => {
      scan();
      originals.forEach((original, rule) => {
        rule.media.mediaText = suppressDesktopMediaQueries ? '(min-width: 99999px)' : original;
      });
    };

    apply();

    // Solo con l'override: i componenti lazy iniettano nuovo CSS dopo il mount,
    // senza un nuovo scan le loro regole `md:` resterebbero attive.
    let observer: MutationObserver | null = null;
    if (devMobileOverride) {
      observer = new MutationObserver(apply);
      observer.observe(document.head, { childList: true, subtree: true });
    }

    return () => {
      observer?.disconnect();
      // Cleanup: ripristina tutti i media query originali
      originals.forEach((original, rule) => { rule.media.mediaText = original; });
    };
  }, [viewportClass, isLandscape, devMobileOverride]);

  return <>{children}</>;
}
