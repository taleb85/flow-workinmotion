import { type ReactNode, type RefObject, type LegacyRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

type CenteredModalPortalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** ref sul pannello bianco (per click-outside combinato col trigger). */
  panelRef?: RefObject<HTMLDivElement | null>;
  /** aria sul backdrop (es. «Chiudi»). */
  backdropAriaLabel?: string;
  /** aria sul dialog */
  ariaLabel?: string;
  maxWidthClass?: string;
  maxHeightClass?: string;
  /** default `w-full` — `w-max min-w-0` per pannelli larghi quanto il contenuto (es. calendario). */
  panelWidthClass?: string;
  /** classi extra sul pannello (es. py-1) */
  panelClassName?: string;
  /** stili inline extra sul pannello */
  panelStyle?: CSSProperties;
  /** Per `isDatePickerPortalClick`: attributo sull’overlay root. */
  markDatePickerPortal?: boolean;
  /** Sopra bottom bar (z-50), overlay sync header, ecc. */
  overlayZClass?: string;
  /** Se true, il click sul backdrop NON chiude il modale. */
  disableBackdropClose?: boolean;
  /** Se true, l’overlay inizia sotto l’header app (`--app-sticky-header-offset`) così la toolbar non resta sotto al dialog. */
  reserveHeaderOffset?: boolean;
};

/**
 * Overlay fullscreen + card centrata (stesso linguaggio di UserAvatarMenu / NotificationCenter).
 */
export function CenteredModalPortal({
  open,
  onClose,
  children,
  panelRef,
  backdropAriaLabel = 'Chiudi',
  ariaLabel,
  maxWidthClass = 'max-w-md',
  maxHeightClass = 'max-h-[min(90dvh,720px)]',
  panelWidthClass = 'w-full',
  panelClassName = '',
  panelStyle,
  markDatePickerPortal = false,
  /** Stesso strato del layout app: sotto non va o l’header `z-[10040]` resta sopra l’overlay. */
  overlayZClass = 'z-[10050]',
  disableBackdropClose = true,
  reserveHeaderOffset = false,
}: CenteredModalPortalProps) {
  useBodyScrollLock(open);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={
            reserveHeaderOffset
              ? `fixed left-0 right-0 bottom-0 top-[var(--app-sticky-header-offset,5rem)] ${overlayZClass} flex items-center justify-center overflow-hidden overscroll-none p-4 font-sans`
              : `fixed inset-0 ${overlayZClass} flex items-center justify-center overflow-hidden overscroll-none p-4 font-sans`
          }
          role="presentation"
          {...(markDatePickerPortal ? { 'data-osteria-date-picker-portal': '' } : {})}
        >
          <button
            type="button"
className={`absolute inset-0 bg-black/40 backdrop-blur-md ${disableBackdropClose ? 'cursor-default' : ''} transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]`}
            aria-label={backdropAriaLabel}
            onClick={disableBackdropClose ? undefined : onClose}
          />
          <motion.div
            ref={panelRef as LegacyRef<HTMLDivElement> | undefined}
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            initial={{ scale: 0.85, opacity: 0, y: 40 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28, mass: 0.8 }}
            className={`relative z-10 ${panelWidthClass} ${maxWidthClass} ${maxHeightClass} overflow-y-auto overscroll-contain rounded-2xl modal-glass-panel ${panelClassName}`.trim()}
            style={panelStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
