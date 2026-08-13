import { motion } from 'framer-motion';

const ANIMATIONS = [
  {
    id: 1,
    label: '1 · Flip orizzontale',
    animate: { rotateY: [0, 360] },
    transition: { duration: 4.5, ease: 'easeInOut' as const, repeat: Infinity, repeatDelay: 1 },
  },
  {
    id: 2,
    label: '2 · Rotazione 2D',
    animate: { rotate: [0, 360] },
    transition: { duration: 3, ease: 'linear' as const, repeat: Infinity },
  },
  {
    id: 3,
    label: '3 · Respiro / pulsazione',
    animate: { scale: [1, 1.22, 1] },
    transition: { duration: 1.8, ease: 'easeInOut' as const, repeat: Infinity },
  },
  {
    id: 4,
    label: '4 · Levitazione',
    animate: { y: [0, -12, 0] },
    transition: { duration: 2.5, ease: 'easeInOut' as const, repeat: Infinity },
  },
  {
    id: 5,
    label: '5 · Wobble elastico',
    animate: { rotate: [0, -14, 14, -8, 8, -3, 0], scale: [1, 1.1, 1] },
    transition: { duration: 0.8, ease: 'easeInOut' as const, repeat: Infinity, repeatDelay: 1.5 },
  },
  {
    id: 6,
    label: '6 · Lampeggio luminoso',
    animate: { filter: ["drop-shadow(0 0 2px rgba(255,255,255,0.4))", "drop-shadow(0 0 22px rgba(255,255,255,1))", "drop-shadow(0 0 2px rgba(255,255,255,0.4))"], scale: [1, 1.12, 1] },
    transition: { duration: 0.9, ease: 'easeInOut' as const, repeat: Infinity, repeatDelay: 1.2 },
  },
  {
    id: 7,
    label: '7 · Flip verticale',
    animate: { rotateX: [0, 360] },
    transition: { duration: 3.5, ease: 'easeInOut' as const, repeat: Infinity, repeatDelay: 1 },
  },
  {
    id: 8,
    label: '8 · Rimbalzo laterale',
    animate: { x: [0, 10, -10, 5, -5, 0], rotate: [0, 6, -6, 3, -3, 0] },
    transition: { duration: 0.9, ease: 'easeInOut' as const, repeat: Infinity, repeatDelay: 1.5 },
  },
];

export default function AnimPreview() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-6 font-sans" style={{ background: 'transparent' }}>
      <h1 className="text-white text-xl font-bold tracking-widest uppercase mb-2">
        Anteprima animazioni logo F
      </h1>
      <p className="text-white/60 text-xs mb-6 uppercase tracking-wider">
        Vai su <span className="text-white font-semibold">/anim-preview</span> · scegli un numero e dimmelo
      </p>
      <div className="fluid-grid fluid-grid-4 gap-6 w-full max-w-3xl">
        {ANIMATIONS.map((anim) => (
          <div
            key={anim.id}
            className="flex flex-col items-center gap-3 rounded-2xl bg-white/10 p-5 border border-white/20"
          >
            <motion.img
              src="/icon-flow-final.png"
              alt="F"
              draggable={false}
              animate={anim.animate as Parameters<typeof motion.img>[0]['animate']}
              transition={anim.transition}
              style={{ width: 56, height: 62, flexShrink: 0 }}
            />
            <span className="text-white/80 text-[11px] font-semibold text-center leading-tight">
              {anim.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
