import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import FlowLogoSvg from './FlowLogoSvg';

const BG = 'transparent';

const SYNC_STAGES: { label: string; duration: number }[] = [
  { label: 'Pulizia cache locale…',       duration: 1400 },
  { label: 'Connessione al server…',       duration: 2500 },
  { label: 'Applicazione aggiornamenti…',  duration: 1200 },
  { label: 'Quasi pronto…',                duration: 600  },
];

/** Progresso cumulativo: ogni stadio avanza sempre in avanti */
function stageToProgress(stage: string): number {
  if (!stage) return 0.02;
  if (stage.includes('Pulizia'))                                                              return 0.20;
  if (stage.includes('lenta'))                                                               return 0.58;
  if (stage.includes('Connessione') || stage.includes('Caricamento'))                        return 0.55;
  if (stage.includes('Applicazione') || stage.includes('Aggiornamento'))                     return 0.85;
  if (stage.includes('pronto') || stage.includes('Completata'))                              return 1.00;
  return 0.02;
}

function stageToDuration(stage: string): number {
  if (stage.includes('Pulizia'))                                                              return 0.6;
  if (stage.includes('lenta'))                                                               return 3.0;
  if (stage.includes('Connessione') || stage.includes('Caricamento'))                        return 2.5;
  if (stage.includes('Applicazione') || stage.includes('Aggiornamento'))                     return 0.8;
  if (stage.includes('pronto') || stage.includes('Completata'))                              return 0.5;
  return 1.0;
}

/** Colori icona FLOW: rosa shocking → viola profondo → blu elettrico */
const ICON_COLORS: [string, string, string] = ['#F72585', '#7B2FBE', '#4361EE'];

function stageToColors(_stage: string): [string, string, string] {
  return ICON_COLORS;
}

/* ── Anello SVG ── */
function RingIcon({
  stage, gradientId, size = 80, iconClass: _iconClass = 'w-20 h-20 rounded-2xl',
}: {
  stage: string; gradientId: string; size?: number; iconClass?: string;
}) {
  const isLoop = stage === '';
  const progress = stageToProgress(stage);
  const duration = isLoop ? 2.0 : stageToDuration(stage);
  const [c0, c1, c2] = stageToColors(stage);
  const PAD = 4; const SW = 2.5;
  const VIEW = size;
  const cx = VIEW / 2; const cy = VIEW / 2;
  const r = VIEW / 2 - PAD - SW / 2;
  const rot = `rotate(-90 ${cx} ${cy})`;

  const sharedTransition = isLoop
    ? { duration, ease: 'easeInOut' as const, repeat: Infinity, repeatType: 'loop' as const, repeatDelay: 0.3 }
    : { duration, ease: 'easeOut' as const };
  const sharedAnim = { strokeDashoffset: isLoop ? 0 : 1 - progress };
  const sharedInit = isLoop ? { strokeDashoffset: 1 } : undefined;

  return (
    <div className="relative" style={{ width: size, height: size }}>

      {/* ── GLOW ── */}
      <svg aria-hidden className="pointer-events-none absolute"
        style={{ inset: -(PAD + SW), width: VIEW + (PAD + SW) * 2, height: VIEW + (PAD + SW) * 2, overflow: 'visible', mixBlendMode: 'screen' }}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
      >
        <defs>
          <linearGradient id={`${gradientId}-g`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={c0} />
            <stop offset="50%"  stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <motion.circle cx={cx} cy={cy} r={r}
          fill="none" stroke={`url(#${gradientId}-g)`} strokeWidth={SW * 36}
          strokeLinecap="round" pathLength={1} strokeDasharray="1"
          initial={sharedInit} animate={sharedAnim} transition={sharedTransition}
          transform={rot} style={{ filter: 'blur(80px)', opacity: 1 }}
        />
        <motion.circle cx={cx} cy={cy} r={r}
          fill="none" stroke={`url(#${gradientId}-g)`} strokeWidth={SW * 16}
          strokeLinecap="round" pathLength={1} strokeDasharray="1"
          initial={sharedInit} animate={sharedAnim} transition={sharedTransition}
          transform={rot} style={{ filter: 'blur(35px)', opacity: 1 }}
        />
        <motion.circle cx={cx} cy={cy} r={r}
          fill="none" stroke={`url(#${gradientId}-g)`} strokeWidth={SW * 6}
          strokeLinecap="round" pathLength={1} strokeDasharray="1"
          initial={sharedInit} animate={sharedAnim} transition={sharedTransition}
          transform={rot} style={{ filter: 'blur(10px)', opacity: 1 }}
        />
      </svg>

      {/* ── RING NITIDO ── circle parte alle 12 in punto, gap invisibile ── */}
      <svg aria-hidden className="pointer-events-none absolute"
        style={{ inset: -(PAD + SW), width: VIEW + (PAD + SW) * 2, height: VIEW + (PAD + SW) * 2, overflow: 'visible' }}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={c0} />
            <stop offset="50%"  stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r}
          fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={SW} />
        <motion.circle cx={cx} cy={cy} r={r}
          fill="none" stroke={`url(#${gradientId})`} strokeWidth={SW}
          strokeLinecap="round" pathLength={1} strokeDasharray="1"
          initial={sharedInit} animate={sharedAnim} transition={sharedTransition}
          transform={rot}
        />
      </svg>

      {/* ── ICONA in primo piano ── */}
      <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 80, height: 80, borderRadius: 18 }} />
    </div>
  );
}

/* ── Schermata 1: Caricamento iniziale ── */
function BootScreen() {
  return (
    <div className="flex-1 flex flex-col gap-3">
      <p className="text-center text-[11px] font-bold uppercase tracking-widest text-white/60">
        1 · Caricamento iniziale
      </p>
      <div className="flex flex-col items-center justify-center gap-6 rounded-2xl flex-1" style={{ background: BG, minHeight: 420 }}>
        <RingIcon stage="" gradientId="ring-boot-prev" size={144} iconClass="w-36 h-36 rounded-3xl" />
        <div className="flex flex-col items-center gap-1 select-none mt-4">
          <span className="text-white font-extrabold tracking-[0.28em] text-xl leading-none uppercase">FLOW</span>
          <span className="text-white/55 font-semibold tracking-[0.18em] text-[11px] uppercase">Work in Motion</span>
        </div>
      </div>
    </div>
  );
}

/* ── Schermata 2: Sincronizzazione globale (live) ── */
function SyncScreen() {
  const [phase, setPhase] = useState<'boot' | 'sync' | 'done'>('boot');
  const [stageIdx, setStageIdx] = useState(-1);

  useEffect(() => {
    const t = setTimeout(() => { setPhase('sync'); setStageIdx(0); }, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase !== 'sync' || stageIdx < 0) return;
    if (stageIdx >= SYNC_STAGES.length) {
      setPhase('done');
      const r = setTimeout(() => {
        setPhase('boot');
        setStageIdx(-1);
        setTimeout(() => { setPhase('sync'); setStageIdx(0); }, 1500);
      }, 1500);
      return () => clearTimeout(r);
    }
    const t = setTimeout(() => setStageIdx((i) => i + 1), SYNC_STAGES[stageIdx].duration);
    return () => clearTimeout(t);
  }, [phase, stageIdx]);

  const currentStage =
    phase === 'sync' && stageIdx >= 0 && stageIdx < SYNC_STAGES.length
      ? SYNC_STAGES[stageIdx].label
      : phase === 'done' ? '✓ Completata' : '';

  return (
    <div className="flex-1 flex flex-col gap-3">
      <p className="text-center text-[11px] font-bold uppercase tracking-widest text-white/60">
        2 · Sincronizzazione globale
      </p>
      <div className="flex flex-col items-center justify-center gap-6 rounded-2xl flex-1" style={{ background: BG, minHeight: 420 }}>
        <RingIcon stage={currentStage} gradientId="ring-sync-prev" size={144} iconClass="w-36 h-36 rounded-3xl" />
        <div className="flex flex-col items-center gap-1 select-none mt-4">
          <span className="text-white font-extrabold tracking-[0.28em] text-xl leading-none uppercase">FLOW</span>
          <span className="text-white/60 font-semibold tracking-[0.18em] text-[11px] uppercase">Work in Motion</span>
        </div>
        <div className="flex flex-col items-center gap-1 min-h-[44px]">
          {phase !== 'done' && (
            <p className="text-white/70 text-[11px] font-semibold uppercase tracking-widest">
              Sincronizzazione in corso
            </p>
          )}
          {currentStage ? (
            <p className="text-white/90 text-sm font-medium text-center px-4">{currentStage}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── Pagina ── */
export default function LoadingPreview() {
  return (
    <div className="min-h-screen bg-app-bg flex flex-col items-center justify-center gap-8 p-8 font-sans">
      <h1 className="text-white/70 text-lg font-bold tracking-widest uppercase">
        Anteprima schermate di caricamento
      </h1>
      <div className="flex flex-col md:flex-row gap-6 w-full max-w-3xl">
        <BootScreen />
        <SyncScreen />
      </div>
    </div>
  );
}
