import { Image as ImageIcon, Camera, FolderOpen, Trash2 } from 'lucide-react';

export type ProfilePhotoSourceLabels = {
  sheetAria: string;
  gallery: string;
  camera: string;
  files: string;
  remove?: string;
};

type Props = {
  open: boolean;
  labels: ProfilePhotoSourceLabels;
  onClose: () => void;
  onPickGallery: () => void;
  onPickCamera: () => void;
  onPickFiles: () => void;
  onRemovePhoto?: () => void;
  /** id per aria-controls dal pulsante fotocamera */
  menuId?: string;
};

/**
 * Menu compatto sotto la fotocamera: tema chiaro/scuro (html.dark).
 */
export default function ProfilePhotoSourceSheet({
  open,
  labels,
  onClose,
  onPickGallery,
  onPickCamera,
  onPickFiles,
  onRemovePhoto,
  menuId = 'profile-photo-source-menu',
}: Props) {
  if (!open) return null;

  return (
    <ul
      id={menuId}
      role="menu"
      aria-label={labels.sheetAria}
      className="absolute right-0 top-[calc(100%+4px)] z-[80] min-w-[10.25rem] max-w-[min(14rem,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-slate-200/90 bg-white/95 py-0.5 shadow-lg backdrop-blur-xl"
    >
      <li role="none">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[0.6875rem] font-medium leading-tight text-white/90 transition-colors hover:bg-slate-50 active:bg-slate-100 touch-manipulation hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          onClick={() => {
            onPickGallery();
            onClose();
          }}
        >
          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-white/70" strokeWidth={2} aria-hidden />
          <span className="leading-snug">{labels.gallery}</span>
        </button>
      </li>
      <li role="none">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[0.6875rem] font-medium leading-tight text-white/90 transition-colors hover:bg-slate-50 active:bg-slate-100 touch-manipulation hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          onClick={() => {
            onPickCamera();
            onClose();
          }}
        >
          <Camera className="h-3.5 w-3.5 shrink-0 text-white/70" strokeWidth={2} aria-hidden />
          <span className="leading-snug">{labels.camera}</span>
        </button>
      </li>
      <li role="none">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[0.6875rem] font-medium leading-tight text-white/90 transition-colors hover:bg-slate-50 active:bg-slate-100 touch-manipulation hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
          onClick={() => {
            onPickFiles();
            onClose();
          }}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-white/70" strokeWidth={2} aria-hidden />
          <span className="leading-snug">{labels.files}</span>
        </button>
      </li>
      {onRemovePhoto && (
        <li role="none" className="border-t border-slate-100 mt-0.5 pt-0.5">
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[0.6875rem] font-medium leading-tight text-red-600 transition-colors hover:bg-red-50 active:bg-red-100 touch-manipulation hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            onClick={() => {
              onRemovePhoto();
              onClose();
            }}
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            <span className="leading-snug">{labels.remove ?? 'Rimuovi foto'}</span>
          </button>
        </li>
      )}
    </ul>
  );
}
