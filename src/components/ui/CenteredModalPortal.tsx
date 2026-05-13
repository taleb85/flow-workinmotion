import { type ReactNode, type RefObject, type LegacyRef } from 'react';
import { createPortal } from 'react-dom';

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
  /** classi extra sul pannello (es. py-1) */
  panelClassName?: string;
  /** Per `isDatePickerPortalClick`: attributo sull’overlay root. */
  markDatePickerPortal?: boolean;
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
  panelClassName = '',
  markDatePickerPortal = false,
}: CenteredModalPortalProps) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 font-sans"
      role="presentation"
      {...(markDatePickerPortal ? { 'data-osteria-date-picker-portal': '' } : {})}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label={backdropAriaLabel}
        onClick={onClose}
      />
      <div
        ref={panelRef as LegacyRef<HTMLDivElement> | undefined}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`relative z-10 w-full ${maxWidthClass} ${maxHeightClass} overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white shadow-2xl ${panelClassName}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
