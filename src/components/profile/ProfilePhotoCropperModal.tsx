import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Plus } from 'lucide-react';
import { lockBodyScroll, unlockBodyScroll } from '../../utils/bodyScrollLock';

const OUTPUT_SIZE = 400;
const JPEG_QUALITY = 0.82;

export type ProfilePhotoCropperLabels = {
  close: string;
  title: string;
  crop: string;
  hint: string;
};

type Props = {
  imageSrc: string;
  labels: ProfilePhotoCropperLabels;
  onClose: () => void;
  onConfirm: (jpegDataUrl: string) => void;
};

function clampPan(px: number, py: number, imgW: number, imgH: number, S: number) {
  const minX = S / 2 - imgW / 2;
  const maxX = imgW / 2 - S / 2;
  const minY = S / 2 - imgH / 2;
  const maxY = imgH / 2 - S / 2;
  const cx = minX <= maxX ? Math.min(maxX, Math.max(minX, px)) : 0;
  const cy = minY <= maxY ? Math.min(maxY, Math.max(minY, py)) : 0;
  return { x: cx, y: cy };
}

/**
 * Schermata a tutto schermo: riquadro quadrato fisso, foto spostabile e zoom, maschera scura.
 */
export default function ProfilePhotoCropperModal({ imageSrc, labels, onClose, onConfirm }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [cropSize, setCropSize] = useState(280);
  const [userScale, setUserScale] = useState(1);

  // Nasconde la sticky header mentre il cropper è aperto
  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ sx: number; sy: number; px: number; py: number } | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const S = Math.min(r.width, r.height) * 0.78;
      setCropSize(Math.max(160, Math.min(S, Math.min(r.width, r.height) - 24)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setNatural(null);
    setUserScale(1);
    setPan({ x: 0, y: 0 });
  }, [imageSrc]);

  const onImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img?.naturalWidth) return;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  const coverScale =
    natural && cropSize > 0 ? Math.max(cropSize / natural.w, cropSize / natural.h) : 0;
  const imgW = natural ? natural.w * coverScale * userScale : 0;
  const imgH = natural ? natural.h * coverScale * userScale : 0;

  useEffect(() => {
    if (!natural || !cropSize) return;
    setPan((p) => clampPan(p.x, p.y, imgW, imgH, cropSize));
  }, [natural, imgW, imgH, cropSize]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!natural) return;
      // Scoped all'elemento viewport del cropper: non interferisce con lo scroll pagina.
      // e.cancelable: alcune implementazioni browser ignorano preventDefault se passive.
      if (e.cancelable) e.preventDefault();
      const delta = e.deltaY > 0 ? -0.07 : 0.07;
      setUserScale((s) => Math.min(4, Math.max(1, s + delta)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [natural]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: pan.x, py: pan.y };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !natural) return;
    const nx = d.px + e.clientX - d.sx;
    const ny = d.py + e.clientY - d.sy;
    setPan(clampPan(nx, ny, imgW, imgH, cropSize));
  };

  const endPointer = (e: React.PointerEvent) => {
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* */
    }
    dragRef.current = null;
  };

  const applyCrop = useCallback(() => {
    const img = imgRef.current;
    const v = viewportRef.current;
    if (!img || !v || !natural) return;
    const vr = v.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const S = cropSize;
    const cx = vr.left + vr.width / 2;
    const cy = vr.top + vr.height / 2;
    const left = cx - S / 2;
    const top = cy - S / 2;
    if (ir.width < 2 || ir.height < 2) return;

    let sx = ((left - ir.left) / ir.width) * img.naturalWidth;
    let sy = ((top - ir.top) / ir.height) * img.naturalHeight;
    let sw = (S / ir.width) * img.naturalWidth;
    let sh = (S / ir.height) * img.naturalHeight;

    sx = Math.max(0, Math.min(img.naturalWidth - 1, sx));
    sy = Math.max(0, Math.min(img.naturalHeight - 1, sy));
    sw = Math.min(sw, img.naturalWidth - sx);
    sh = Math.min(sh, img.naturalHeight - sy);
    if (sw < 1 || sh < 1) return;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    onConfirm(dataUrl);
  }, [natural, cropSize, onConfirm]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex flex-col text-white"
      style={{ background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', paddingTop: 'max(8px, env(safe-area-inset-top, 0px))' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-crop-title"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2 py-2 md:px-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 touch-manipulation active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
        >
          {labels.close}
        </button>
        <h1 id="profile-crop-title" className="min-w-0 flex-1 truncate text-center text-base font-bold tracking-tight">
          {labels.title}
        </h1>
        <button
          type="button"
          onClick={applyCrop}
          className="rounded-full border border-white/20 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 touch-manipulation active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
        >
          {labels.crop}
        </button>
      </header>

      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        style={{ touchAction: 'none' }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
            <img
              ref={imgRef}
              key={imageSrc}
              src={imageSrc}
              alt=""
              draggable={false}
              onLoad={onImgLoad}
              className="max-w-none select-none"
              style={
                natural
                  ? {
                      width: imgW,
                      height: imgH,
                    }
                  : { maxWidth: '100%', maxHeight: '40vh', opacity: 0.3 }
              }
            />
          </div>
        </div>

        <div
          className="pointer-events-none absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.72)]"
          style={{
            width: cropSize,
            height: cropSize,
          }}
          aria-hidden
        />
      </div>

      <div className="flex shrink-0 items-center justify-center gap-6 border-t border-white/10 py-3">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/15 touch-manipulation active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          aria-label="Zoom out"
          onClick={() => setUserScale((s) => Math.max(1, s - 0.15))}
        >
          <Minus className="h-5 w-5" strokeWidth={2} />
        </button>
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-white/10 text-white transition-colors hover:bg-white/15 touch-manipulation active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          aria-label="Zoom in"
          onClick={() => setUserScale((s) => Math.min(4, s + 0.15))}
        >
          <Plus className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>

      <p className="shrink-0 px-4 pb-[max(12px,env(safe-area-inset-bottom,0px))] pt-1 text-center text-[0.6875rem] leading-snug text-white/50">
        {labels.hint}
      </p>
    </div>,
    document.body
  );
}
