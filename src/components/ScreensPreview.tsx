/**
 * ScreensPreview — anteprima di tutte le schermate non-tab (dark + light).
 * Rotta: /screens-preview
 * Testi con text-[8–10]px: intenzionali (mock in scala ridotta / artefatti miniatura), non sottoposti al minimo 11px UI.
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Check, Loader2, Fingerprint, LogIn, Smartphone, Monitor, ChevronRight, Lock, ShieldCheck, Delete } from 'lucide-react';
import FlowLogoSvg from './FlowLogoSvg';
import ManagementHomePreview from './ManagementHomePreview';
import TurniMgmtPreview from './profilePreview/TurniMgmtPreview';
import TimesheetTabPreview from './profilePreview/TimesheetTabPreview';
import StaffHomePreview from './profilePreview/StaffHomePreview';
import StaffShiftsPreview from './profilePreview/StaffShiftsPreview';
import StaffHolidaysPreview from './profilePreview/StaffHolidaysPreview';
import StatisticsTabPreview from './profilePreview/StatisticsTabPreview';
import SettingsTabPreview from './profilePreview/SettingsTabPreview';
import MobileTimesheet from './mobile/MobileTimesheet';
import type { Language, Shift, User } from '../types';

const PREVIEW_USER_ID = 'preview-staff';
/** Turni dimostrativi per MobileTimesheet nelle anteprime (IDs fittizi). */
const MOCK_TIMESHEET_SHIFTS: Shift[] = [
  { id: 's1', user_id: PREVIEW_USER_ID, date: '2026-03-29', start_time: '10:00:00', end_time: '16:00:00', approval_status: 'confirmed', type: 'lunch' },
  { id: 's2', user_id: PREVIEW_USER_ID, date: '2026-03-28', start_time: '10:00:00', end_time: '16:00:00', approval_status: 'confirmed', type: 'lunch' },
  { id: 's3', user_id: PREVIEW_USER_ID, date: '2026-03-28', start_time: '18:00:00', end_time: '23:00:00', approval_status: 'confirmed', type: 'dinner' },
  { id: 's4', user_id: PREVIEW_USER_ID, date: '2026-03-27', start_time: '18:00:00', end_time: '23:00:00', approval_status: 'confirmed', type: 'dinner' },
  { id: 's5', user_id: PREVIEW_USER_ID, date: '2026-03-26', start_time: '10:00:00', end_time: '16:00:00', approval_status: 'confirmed', type: 'lunch' },
  { id: 's6', user_id: PREVIEW_USER_ID, date: '2026-03-26', start_time: '18:00:00', end_time: '23:00:00', approval_status: 'confirmed', type: 'dinner' },
];

/* ── Frame helper ─────────────────────────────────────────────────── */
const FW = 390; const FH = 760;

function MockFrame({ label, children, scale = 0.42 }: {
  label: string; children: React.ReactNode; scale?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</p>
      <div className="rounded-2xl overflow-hidden border border-white/10 shadow-lg mx-auto"
        style={{ width: FW * scale, height: FH * scale, position: 'relative' }}>
        <div style={{ width: FW, height: FH, transformOrigin: 'top left', transform: `scale(${scale})`, position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── NeonIcon (solo dark — effetto neon non esiste in light) ──────── */
const BG_DARK = 'transparent';
const ICON_C = ['#F72585', '#7B2FBE', '#4361EE'] as const;

function NeonIcon({ progress = 1 }: { progress?: number }) {
  const SIZE = 110; const PAD = 5; const SW = 2.5;
  const cx = SIZE / 2; const cy = SIZE / 2; const r = SIZE / 2 - PAD - SW / 2;
  const [c0, c1, c2] = ICON_C;
  const dashoffset = 1 - progress;
  const rot = `rotate(-90 ${cx} ${cy})`;

  return (
    <div className="relative" style={{ width: 112, height: 112 }}>
      <svg aria-hidden className="pointer-events-none absolute"
        style={{ inset: -(PAD + SW), width: SIZE + (PAD + SW) * 2, height: SIZE + (PAD + SW) * 2, overflow: 'visible', mixBlendMode: 'screen' }}
        viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id="prev-g" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c0} /><stop offset="50%" stopColor={c1} /><stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#prev-g)" strokeWidth={SW * 36} strokeDasharray="1" pathLength={1} strokeDashoffset={dashoffset} strokeLinecap="round" transform={rot} style={{ filter: 'blur(80px)', opacity: 1 }} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#prev-g)" strokeWidth={SW * 16} strokeDasharray="1" pathLength={1} strokeDashoffset={dashoffset} strokeLinecap="round" transform={rot} style={{ filter: 'blur(35px)', opacity: 1 }} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#prev-g)" strokeWidth={SW * 6}  strokeDasharray="1" pathLength={1} strokeDashoffset={dashoffset} strokeLinecap="round" transform={rot} style={{ filter: 'blur(10px)', opacity: 1 }} />
      </svg>
      <svg aria-hidden className="pointer-events-none absolute"
        style={{ inset: -(PAD + SW), width: SIZE + (PAD + SW) * 2, height: SIZE + (PAD + SW) * 2, overflow: 'visible' }}
        viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id="prev-s" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c0} /><stop offset="50%" stopColor={c1} /><stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={SW} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#prev-s)" strokeWidth={SW} strokeDasharray="1" pathLength={1} strokeDashoffset={dashoffset} strokeLinecap="round" transform={rot} />
      </svg>
      <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 80, height: 80, borderRadius: 18 }} />
    </div>
  );
}

/* ── Light ring (solo contorno, niente neon) ──────────────────────── */
function LightRing({ progress = 1 }: { progress?: number }) {
  const SIZE = 110; const PAD = 5; const SW = 2.5;
  const cx = SIZE / 2; const cy = SIZE / 2; const r = SIZE / 2 - PAD - SW / 2;
  const [c0, c1, c2] = ICON_C;
  const dashoffset = 1 - progress;
  const rot = `rotate(-90 ${cx} ${cy})`;

  return (
    <div className="relative" style={{ width: 112, height: 112 }}>
      <svg aria-hidden className="pointer-events-none absolute"
        style={{ inset: -(PAD + SW), width: SIZE + (PAD + SW) * 2, height: SIZE + (PAD + SW) * 2, overflow: 'visible' }}
        viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <defs>
          <linearGradient id="prev-sl" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={c0} /><stop offset="50%" stopColor={c1} /><stop offset="100%" stopColor={c2} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth={SW} />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="url(#prev-sl)" strokeWidth={SW} strokeDasharray="1" pathLength={1} strokeDashoffset={dashoffset} strokeLinecap="round" transform={rot} />
      </svg>
      <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 80, height: 80, borderRadius: 18 }} />
    </div>
  );
}

/* ── Boot / Sync ─────────────────────────────────────────────────── */
function BootMock({ dark }: { dark: boolean }) {
  if (dark) return (
    <div className="h-full flex flex-col items-center justify-center gap-6 font-sans" style={{ background: BG_DARK }}>
      <div className="flex flex-col items-center gap-6">
        <NeonIcon progress={0.6} />
        <div className="flex flex-col items-center gap-1 select-none">
          <span className="text-white font-extrabold tracking-[0.28em] text-xl leading-none uppercase">FLOW</span>
          <span className="text-white/55 font-semibold tracking-[0.18em] text-[11px] uppercase">Work in Motion</span>
        </div>
      </div>
    </div>
  );
  return (
    <div data-theme="light" className="h-full flex flex-col items-center justify-center gap-6 font-sans" style={{ background: 'transparent' }}>
      <div className="flex flex-col items-center gap-6">
        <LightRing progress={0.6} />
        <div className="flex flex-col items-center gap-1 select-none">
          <span className="text-slate-100 font-extrabold tracking-[0.28em] text-xl leading-none uppercase">FLOW</span>
          <span className="text-white/50 font-semibold tracking-[0.18em] text-[11px] uppercase">Work in Motion</span>
        </div>
      </div>
    </div>
  );
}

function SyncMock({ stage, progress, dark }: { stage: string; progress: number; dark: boolean }) {
  if (dark) return (
    <div className="h-full flex flex-col items-center justify-center gap-6 font-sans text-center px-4" style={{ background: BG_DARK }}>
      <div className="flex flex-col items-center gap-6">
        <NeonIcon progress={progress} />
        <div className="flex flex-col items-center gap-1 select-none">
          <span className="text-white font-extrabold tracking-[0.28em] text-xl leading-none uppercase">FLOW</span>
          <span className="text-white/60 font-semibold tracking-[0.18em] text-[11px] uppercase">Work in Motion</span>
        </div>
        <div className="flex flex-col items-center gap-1 min-h-[40px]">
          <p className="text-white/70 text-xs font-semibold uppercase tracking-widest">Sincronizzazione in corso</p>
          {stage && <p className="text-white/90 text-sm font-medium">{stage}</p>}
        </div>
      </div>
    </div>
  );
  return (
    <div data-theme="light" className="h-full flex flex-col items-center justify-center gap-6 font-sans text-center px-4" style={{ background: 'transparent' }}>
      <div className="flex flex-col items-center gap-6">
        <LightRing progress={progress} />
        <div className="flex flex-col items-center gap-1 select-none">
          <span className="text-slate-100 font-extrabold tracking-[0.28em] text-xl leading-none uppercase">FLOW</span>
          <span className="text-white/50 font-semibold tracking-[0.18em] text-[11px] uppercase">Work in Motion</span>
        </div>
        <div className="flex flex-col items-center gap-1 min-h-[40px]">
          <p className="text-white/60 text-xs font-semibold uppercase tracking-widest">Sincronizzazione in corso</p>
          {stage && <p className="text-slate-100 text-sm font-medium">{stage}</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Login ───────────────────────────────────────────────────────── */
function LoginMock({ dark }: { dark: boolean }) {
  const bg = dark ? BG_DARK : 'linear-gradient(135deg, #f8faff 0%, #ffffff 50%, #f0f4ff 100%)';

  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col items-center justify-center p-8 font-sans" style={{ background: bg }}>
      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-4">
          {dark ? <NeonIcon progress={1} /> : <LightRing progress={1} />}
          <span className={`text-xl font-extrabold tracking-[0.2em] uppercase ${dark ? 'text-white' : 'text-slate-800'}`}>FLOW</span>
          <span className={`text-xs tracking-widest uppercase font-semibold ${dark ? 'text-white/40' : 'text-slate-400'}`}>Work in Motion</span>
        </div>
        <div className="w-full flex flex-col gap-3">
          <input readOnly placeholder="Nome utente" className={`w-full rounded-xl px-4 py-3 text-base outline-none pointer-events-none ${dark ? 'border border-white/10 bg-white/5 text-white/70' : 'border border-slate-200 bg-white text-slate-700 shadow-sm'}`} />
          <input readOnly type="password" placeholder="Password" className={`w-full rounded-xl px-4 py-3 text-base outline-none pointer-events-none ${dark ? 'border border-white/10 bg-white/5 text-white/70' : 'border border-slate-200 bg-white text-slate-700 shadow-sm'}`} />
<button className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white flex items-center justify-center gap-2 pointer-events-none transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">
            <LogIn size={16} /> Accedi
          </button>
        </div>
        <div className={`flex items-center gap-2 w-full ${dark ? 'text-white/20' : 'text-slate-300'}`}>
          <div className={`flex-1 h-px ${dark ? 'bg-white/10' : 'bg-slate-200'}`} />
          <span className="text-xs">oppure</span>
          <div className={`flex-1 h-px ${dark ? 'bg-white/10' : 'bg-slate-200'}`} />
        </div>
<button className={`w-full rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 pointer-events-none ${dark ? 'border border-white/10 bg-white/5 text-white/70' : 'border-2 border-blue-100 bg-blue-50 text-blue-700'} transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}>
          <Fingerprint size={16} /> Accesso biometrico
        </button>
      </div>
    </div>
  );
}

/* ── PWA Install iOS ─────────────────────────────────────────────── */
function PwaIosMock({ dark }: { dark: boolean }) {
  const steps = [
    { icon: '···', title: 'Tocca i tre puntini', desc: 'In basso nella barra di Safari' },
    { icon: '↑',   title: 'Tocca «Condividi»',  desc: "Seleziona l'icona Condividi" },
    { icon: '+',   title: 'Aggiungi a schermo Home', desc: 'Poi tocca «Aggiungi»' },
  ];
  const bg = dark ? BG_DARK : 'linear-gradient(135deg, #e8f0ff 0%, #f0e8ff 50%, #e0eeff 100%)';

  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col items-center justify-center gap-8 font-sans px-8" style={{ background: bg }}>
      <div className="flex flex-col items-center gap-3">
        {dark ? <NeonIcon progress={1} /> : <LightRing progress={1} />}
        <p className={`font-bold text-lg ${dark ? 'text-white' : 'text-slate-800'}`}>Installa FLOW</p>
        <p className={`text-sm text-center ${dark ? 'text-white/60' : 'text-slate-500'}`}>Aggiungi l'app alla schermata Home</p>
      </div>
      <div className="w-full flex flex-col gap-3">
        {steps.map((s, i) => (
          <div key={i} className={`flex items-center gap-4 rounded-2xl px-4 py-3 backdrop-blur-sm ${dark ? 'bg-white/8 border border-neutral-500' : 'bg-white/70 border border-white shadow-sm'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${dark ? 'bg-white/15 text-white border border-white/20' : 'bg-blue-100 text-blue-700'}`}>{s.icon}</div>
            <div>
              <p className={`font-semibold text-sm ${dark ? 'text-white' : 'text-slate-800'}`}>{s.title}</p>
              <p className={`text-xs ${dark ? 'text-white/60' : 'text-slate-400'}`}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className={`flex items-center gap-2 rounded-full px-4 py-2 ${dark ? 'bg-white/8 border border-neutral-500' : 'bg-white/60 border border-white'}`}>
        <Smartphone size={14} className={dark ? 'text-white/60' : 'text-slate-400'} />
        <span className={`text-xs ${dark ? 'text-white/60' : 'text-slate-500'}`}>Safari su iPhone / iPad</span>
      </div>
    </div>
  );
}

/* ── PWA Install Android ─────────────────────────────────────────── */
function PwaAndroidMock({ dark }: { dark: boolean }) {
  const items = [
    { icon: '⋮', title: 'Tocca il menu ⋮', desc: 'In alto a destra in Chrome' },
    { icon: <Download size={20} />, title: 'Installa app', desc: '«Aggiungi a schermata Home»' },
  ];
  const bg = dark ? BG_DARK : 'linear-gradient(135deg, #e8f0ff 0%, #f0e8ff 50%, #e0eeff 100%)';

  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col items-center justify-center gap-8 font-sans px-8" style={{ background: bg }}>
      <div className="flex flex-col items-center gap-3">
        {dark ? <NeonIcon progress={1} /> : <LightRing progress={1} />}
        <p className={`font-bold text-lg ${dark ? 'text-white' : 'text-slate-800'}`}>Installa FLOW</p>
        <p className={`text-sm text-center ${dark ? 'text-white/60' : 'text-slate-500'}`}>Aggiungi l'app alla schermata Home</p>
      </div>
      <div className="w-full flex flex-col gap-3">
        {items.map((s, i) => (
          <div key={i} className={`flex items-center gap-4 rounded-2xl px-4 py-3 backdrop-blur-sm ${dark ? 'bg-white/8 border border-neutral-500' : 'bg-white/70 border border-white shadow-sm'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${dark ? 'bg-white/15 text-white border border-white/20' : 'bg-blue-100 text-blue-700'}`}>{s.icon}</div>
            <div>
              <p className={`font-semibold text-sm ${dark ? 'text-white' : 'text-slate-800'}`}>{s.title}</p>
              <p className={`text-xs ${dark ? 'text-white/60' : 'text-slate-400'}`}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
<button className={`w-full rounded-2xl py-4 font-bold flex items-center justify-center gap-2 pointer-events-none text-base ${dark ? 'bg-white text-slate-900' : 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'} transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}>
        <Download size={18} /> Installa ora
      </button>
    </div>
  );
}

/* ── SW Update ───────────────────────────────────────────────────── */
function _StepList({ steps, doneIdx, dark }: { steps: string[]; doneIdx: number; dark: boolean }) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {steps.map((label, i) => {
        const done = i < doneIdx; const active = i === doneIdx;
        return (
          <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${active ? (dark ? 'bg-white/10' : 'bg-blue-50') : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-500' : active ? (dark ? 'bg-white/20' : 'bg-blue-100') : (dark ? 'bg-white/5' : 'bg-slate-100')}`}>
              {done ? <Check size={16} className="text-white" /> : active ? <Loader2 size={16} className={`${dark ? 'text-white' : 'text-blue-600'} animate-spin`} /> : <span className={`text-xs font-bold ${dark ? 'text-white/30' : 'text-slate-400'}`}>{i + 1}</span>}
            </div>
            <span className={`text-sm font-medium ${done ? (dark ? 'text-white/50 line-through' : 'text-slate-400 line-through') : active ? (dark ? 'text-white' : 'text-slate-800') : (dark ? 'text-white/30' : 'text-slate-400')}`}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

const SW_STEPS = ['Nuova versione rilevata', 'Download aggiornamento', 'Pulizia cache', 'Riavvio…'] as const;

function SwUpdateMock({ dark, activeIdx, progress }: { dark: boolean; activeIdx: number; progress: number }) {
  const bg = dark ? BG_DARK : 'radial-gradient(circle at 50% 30%, #dbeafe 0%, transparent 60%), #f8faff';
  const Icon = dark ? NeonIcon : LightRing;
  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col items-center justify-center gap-6 font-sans text-center px-4" style={{ background: bg }}>
      <div className="flex flex-col items-center gap-6">
        <Icon progress={progress} />
        <div className="flex flex-col items-center gap-1 select-none">
          <span className={`font-extrabold tracking-[0.28em] text-xl leading-none uppercase ${dark ? 'text-white' : 'text-slate-800'}`}>FLOW</span>
          <span className={`font-semibold tracking-[0.18em] text-[11px] uppercase ${dark ? 'text-white/55' : 'text-slate-400'}`}>Work in Motion</span>
        </div>
        <div className="flex flex-col items-center gap-1 min-h-[40px]">
          <p className={`text-xs font-semibold uppercase tracking-widest ${dark ? 'text-white/70' : 'text-slate-500'}`}>Aggiornamento in corso</p>
          <p className={`text-sm font-medium ${dark ? 'text-white/90' : 'text-slate-700'}`}>{SW_STEPS[activeIdx]}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Post-unlock Restart ─────────────────────────────────────────── */
const PU_STEPS = ['Dati profilo salvati', 'Configurazione aggiornata', 'Cache sincronizzata', 'Riavvio in corso…'] as const;

function PostUnlockMock({ dark, activeIdx, progress }: { dark: boolean; activeIdx: number; progress: number }) {
  const bg = dark ? BG_DARK : 'radial-gradient(circle at 50% 30%, #dcfce7 0%, transparent 60%), #f8fff9';
  const Icon = dark ? NeonIcon : LightRing;
  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col items-center justify-center gap-6 font-sans text-center px-4" style={{ background: bg }}>
      <div className="flex flex-col items-center gap-6">
        <Icon progress={progress} />
        <div className="flex flex-col items-center gap-1 select-none">
          <span className={`font-extrabold tracking-[0.28em] text-xl leading-none uppercase ${dark ? 'text-white' : 'text-slate-800'}`}>FLOW</span>
          <span className={`font-semibold tracking-[0.18em] text-[11px] uppercase ${dark ? 'text-white/55' : 'text-slate-400'}`}>Work in Motion</span>
        </div>
        <div className="flex flex-col items-center gap-1 min-h-[40px]">
          <p className={`text-xs font-semibold uppercase tracking-widest ${dark ? 'text-white/70' : 'text-slate-500'}`}>Riavvio in corso</p>
          <p className={`text-sm font-medium ${dark ? 'text-white/90' : 'text-slate-700'}`}>{PU_STEPS[activeIdx]}</p>
        </div>
      </div>
    </div>
  );
}

/* ── Refresh Lock (PIN) ──────────────────────────────────────────── */
function RefreshLockMock({ dark }: { dark: boolean }) {
  const bg = dark ? BG_DARK : 'rgba(240,244,255,0.97)';
  const filledCount = 2;

  const border1 = '1px solid rgba(255,255,255,0.30)';
  const btnStyle    = { background: 'transparent', border: border1 } as React.CSSProperties;
  const bioStyle    = { background: 'transparent', border: border1 } as React.CSSProperties;
  const delStyle    = { background: 'transparent', border: border1 } as React.CSSProperties;
  const pinBoxStyle = { background: 'transparent', border: '1.5px solid rgba(255,255,255,0.30)' } as React.CSSProperties;
  const dotFilled = {
    background: 'rgba(255,255,255,0.92)',
    boxShadow: '0 0 8px 2px rgba(255,255,255,0.50)',
  };
  const dotEmpty = {
    background: 'rgba(255,255,255,0.20)',
    border: '1px solid rgba(255,255,255,0.30)',
  };

  return (
    <div
      data-theme={dark ? undefined : 'light'}
      className="h-full flex flex-col font-sans relative overflow-hidden"
      style={{ background: bg }}>

      {/* Header — in alto */}
      <div className="relative flex flex-col items-center text-center pt-16 pb-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4 shadow-lg"
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.30)' }}>
          <Lock className="w-6 h-6 text-white" strokeWidth={2.5} />
        </div>
        <h2 className="text-white font-bold uppercase tracking-widest text-base mb-1">Sblocca</h2>
        <p className="text-white/40 text-sm font-medium leading-tight px-4">Sincronizzazione completata</p>
      </div>

      {/* PIN display — centro */}
      <div className="relative flex flex-col items-center gap-2 px-8 mt-4">
        <div className="flex items-center gap-1.5 text-white/50 mb-1">
          <ShieldCheck className="w-4 h-4" strokeWidth={2.5} />
          <span className="text-[10px] font-bold uppercase tracking-widest">Il tuo PIN</span>
        </div>
        <div className="w-full h-14 rounded-2xl flex items-center justify-center" style={pinBoxStyle}>
          <div className="flex items-center gap-6">
            {[0,1,2,3].map(i => (
              <div key={i} className="w-4 h-4 rounded-full" style={i < filledCount ? dotFilled : dotEmpty} />
            ))}
          </div>
        </div>
      </div>

      {/* Numpad — occupa lo spazio centrale */}
      <div className="relative flex-1 flex flex-col justify-center px-8 gap-3 mt-4">
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <div key={n} className="h-16 rounded-2xl flex items-center justify-center font-bold text-2xl text-white pointer-events-none" style={btnStyle}>{n}</div>
          ))}
          <div className="h-16 rounded-2xl flex items-center justify-center text-white/70 pointer-events-none" style={bioStyle}>
            <Fingerprint className="w-7 h-7" />
          </div>
          <div className="h-16 rounded-2xl flex items-center justify-center font-bold text-2xl text-white pointer-events-none" style={btnStyle}>0</div>
          <div className="h-16 rounded-2xl flex items-center justify-center text-white/40 pointer-events-none" style={delStyle}>
            <Delete className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* Actions — in basso */}
      <div className="relative flex gap-3 px-8 pb-12">
        <div className="flex-1 h-14 rounded-2xl flex items-center justify-center font-bold text-sm text-white/60 pointer-events-none"
          style={{ background: 'transparent', border: border1 }}>Annulla</div>
        <div className="flex-1 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-sm pointer-events-none"
          style={{ background: 'transparent', border: border1 }}>Conferma</div>
      </div>
    </div>
  );
}

/* ── Kiosk Timbratura ────────────────────────────────────────────── */
function KioskMock({ dark }: { dark: boolean }) {
  const bg = dark ? BG_DARK : '#f9fafb';
  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col font-sans" style={{ background: bg }}>
      <div className="flex items-center justify-center pt-16 pb-2">
        {dark ? <NeonIcon progress={1} /> : <LightRing progress={1} />}
      </div>
      <div className="flex-1 flex flex-col items-center px-6">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-40 h-40 rounded-3xl bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-600/30">
            <span className="text-white font-black text-6xl">F</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className={`font-bold text-xl ${dark ? 'text-white' : 'text-slate-800'}`}>Buongiorno!</p>
            <p className={`text-sm ${dark ? 'text-white/40' : 'text-slate-500'}`}>Tocca per timbrare</p>
          </div>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs pb-10">
<button className="w-full rounded-2xl bg-blue-600 py-4 text-white font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 pointer-events-none transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">
            Entra <ChevronRight size={20} />
          </button>
<button className={`w-full rounded-2xl py-3 font-semibold text-base pointer-events-none ${dark ? 'border border-white/10 bg-white/5 text-white/50' : 'border border-slate-200 bg-white text-slate-500'} transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}>
            Esci
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Invite Redirect ─────────────────────────────────────────────── */
function InviteMock({ dark }: { dark: boolean }) {
  const bg = dark ? BG_DARK : 'linear-gradient(135deg, #e8f0ff 0%, #f5f0ff 50%, #e0eeff 100%)';

  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col items-center justify-center gap-6 font-sans px-8" style={{ background: bg }}>
      <div className="flex flex-col items-center gap-4 text-center">
        {dark ? <NeonIcon progress={1} /> : <LightRing progress={1} />}
        <div className="flex flex-col gap-1">
          <p className={`font-bold text-xl ${dark ? 'text-white' : 'text-slate-800'}`}>Sei stato invitato</p>
          <p className={`text-sm ${dark ? 'text-white/40' : 'text-slate-500'}`}>Accedi con le credenziali ricevute</p>
        </div>
      </div>
      <div className={`w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4 ${dark ? 'bg-white/5 border border-white/10' : 'bg-white/80 border border-white shadow-md'}`}>
        <div className="flex flex-col gap-2 text-sm">
          <div className={`flex items-center gap-2 p-3 rounded-xl ${dark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-100'}`}>
            <Check size={16} className="text-blue-500 flex-shrink-0" />
            <span className={dark ? 'text-white/70' : 'text-slate-700'}>Invito verificato</span>
          </div>
          <div className={`flex items-center gap-2 p-3 rounded-xl ${dark ? 'bg-white/5' : 'bg-slate-50'}`}>
            <Loader2 size={16} className={`animate-spin flex-shrink-0 ${dark ? 'text-white/30' : 'text-slate-400'}`} />
            <span className={dark ? 'text-white/40' : 'text-slate-500'}>Reindirizzamento al login…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── PWA Install Desktop ─────────────────────────────────────────── */
function PwaDesktopMock({ dark }: { dark: boolean }) {
  const steps = [
    { icon: '⊕', title: "Clicca l'icona di installazione", desc: 'Nella barra degli indirizzi, a destra' },
    { icon: <Download size={20} />, title: 'Clicca «Installa»', desc: 'Nel popup di Chrome / Edge / Brave' },
    { icon: <Check size={20} />, title: 'FLOW è pronto', desc: "Trovi l'icona sul desktop o nel menu Start" },
  ];
  const bg = dark ? BG_DARK : 'linear-gradient(135deg, #e8f0ff 0%, #f0e8ff 50%, #e0eeff 100%)';

  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col items-center justify-center gap-8 font-sans px-8" style={{ background: bg }}>
      <div className="flex flex-col items-center gap-3">
        {dark ? <NeonIcon progress={1} /> : <LightRing progress={1} />}
        <p className={`font-bold text-lg ${dark ? 'text-white' : 'text-slate-800'}`}>Installa FLOW</p>
        <p className={`text-sm text-center ${dark ? 'text-white/60' : 'text-slate-500'}`}>Aggiungi l'app al desktop per accesso rapido</p>
      </div>
      <div className="w-full flex flex-col gap-3">
        {steps.map((s, i) => (
          <div key={i} className={`flex items-center gap-4 rounded-2xl px-4 py-3 backdrop-blur-sm ${dark ? 'bg-white/8 border border-neutral-500' : 'bg-white/70 border border-white shadow-sm'}`}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg flex-shrink-0 ${dark ? 'bg-white/15 text-white border border-white/20' : 'bg-blue-100 text-blue-700'}`}>{s.icon}</div>
            <div>
              <p className={`font-semibold text-sm ${dark ? 'text-white' : 'text-slate-800'}`}>{s.title}</p>
              <p className={`text-xs ${dark ? 'text-white/60' : 'text-slate-400'}`}>{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className={`flex items-center gap-2 rounded-full px-4 py-2 ${dark ? 'bg-white/8 border border-neutral-500' : 'bg-white/60 border border-white'}`}>
        <Monitor size={14} className={dark ? 'text-white/60' : 'text-slate-400'} />
        <span className={`text-xs ${dark ? 'text-white/60' : 'text-slate-500'}`}>Chrome / Edge / Brave su PC</span>
      </div>
    </div>
  );
}

/* ── Shared tab chrome helpers ───────────────────────────────────── */
const BG_LIGHT_TAB = 'radial-gradient(ellipse at 70% 10%, #dbeafe 0%, #eff6ff 28%, #ffffff 62%, #f0f7ff 100%)';

function TabHeader({ dark, title, date = 'sabato 5 apr · 09:41' }: { dark: boolean; title: string; date?: string }) {
  return (
    <div className={`shrink-0 px-5 pt-8 pb-3 flex flex-col gap-0.5 border-b ${dark ? 'border-white/8' : 'border-black/5'}`}>
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-black tracking-[0.22em] uppercase ${dark ? 'text-white/90' : 'text-slate-700'}`}>{title}</span>
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${dark ? 'bg-white/10 text-white/60' : 'bg-slate-100 text-slate-500'}`}>T</div>
        </div>
      </div>
      <span className={`text-[9px] font-semibold capitalize ${dark ? 'text-white/35' : 'text-slate-400'}`}>{date}</span>
    </div>
  );
}

function Card({ dark, children, className = '' }: { dark: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${className} ${dark ? 'bg-white/6 border border-white/10' : 'bg-white border border-slate-100 shadow-sm'}`}>
      {children}
    </div>
  );
}

function BottomNav({ dark, active }: { dark: boolean; active: 'home' | 'turni' | 'timesheet' | 'ferie' | 'profilo' }) {
  const items = [
    { id: 'home', label: 'Panoramica' },
    { id: 'turni', label: 'Turni' },
    { id: 'timesheet', label: 'Presenze' },
    { id: 'ferie', label: 'Ferie' },
    { id: 'profilo', label: 'Profilo' },
  ];
  return (
    <div className={`shrink-0 flex items-center border-t pb-2 pt-1 ${dark ? 'border-white/8 bg-black/20' : 'border-slate-100 bg-white/80'}`}>
      {items.map(item => (
        <div key={item.id} className="flex-1 flex flex-col items-center gap-0.5 py-1">
          <div className={`w-5 h-5 rounded-md ${item.id === active
 ? (dark ? 'bg-[#7B2FBE]' : 'bg-blue-600')
 : (dark ? 'bg-white/15' : 'bg-slate-200')
 }`} />
          <span className={`text-[7px] font-semibold ${item.id === active
 ? (dark ? 'text-white' : 'text-blue-600')
 : (dark ? 'text-white/35' : 'text-slate-400')
 }`}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Panoramica ──────────────────────────────────────────────────── */
function PanoramicaMock({ dark }: { dark: boolean }) {
  const bg = dark ? BG_DARK : BG_LIGHT_TAB;
  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col font-sans" style={{ background: bg }}>
      <TabHeader dark={dark} title="Panoramica" />
      <div className="flex-1 overflow-hidden px-4 py-4 flex flex-col gap-3">
        {/* Turno oggi */}
        <Card dark={dark}>
          <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${dark ? 'text-white/40' : 'text-slate-400'}`}>Il tuo turno oggi</p>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>08:00 → 16:00</p>
              <p className={`text-[10px] ${dark ? 'text-white/50' : 'text-slate-500'}`}>Cucina · 8h</p>
            </div>
            <div className={`px-2.5 py-1 rounded-full text-[9px] font-bold ${dark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>In corso</div>
          </div>
        </Card>
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Ore mese', value: '142h' },
            { label: 'Ferie rimanenti', value: '12 gg' },
            { label: 'Straordinari', value: '+4h' },
            { label: 'Presenze', value: '18/20' },
          ].map((s, i) => (
            <Card dark={dark} key={i}>
              <p className={`text-[8px] font-bold uppercase tracking-widest ${dark ? 'text-white/35' : 'text-slate-400'}`}>{s.label}</p>
              <p className={`text-base font-black mt-0.5 ${dark ? 'text-white' : 'text-slate-800'}`}>{s.value}</p>
            </Card>
          ))}
        </div>
        {/* Colleghi */}
        <Card dark={dark}>
          <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${dark ? 'text-white/40' : 'text-slate-400'}`}>Colleghi oggi</p>
          <div className="flex gap-2">
            {['M', 'S', 'A', 'L'].map((l, i) => (
              <div key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${dark ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</div>
            ))}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${dark ? 'bg-white/8 text-white/40' : 'bg-slate-50 text-slate-400'}`}>+2</div>
          </div>
        </Card>
      </div>
      <BottomNav dark={dark} active="home" />
    </div>
  );
}

/* ── Turni ───────────────────────────────────────────────────────── */
function TurniMock({ dark }: { dark: boolean }) {
  const bg = dark ? BG_DARK : BG_LIGHT_TAB;
  const days = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  const nums = [31, 1, 2, 3, 4, 5, 6];
  const shifts = [null, '18–23', '18–23', null, '10–16', '18–23', null];
  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col font-sans" style={{ background: bg }}>
      <TabHeader dark={dark} title="Turni" />
      <div className="flex-1 overflow-hidden px-4 py-4 flex flex-col gap-3">
        {/* Week selector */}
        <div className={`flex items-center justify-between rounded-2xl px-4 py-2.5 ${dark ? 'bg-white/[0.04] border border-white/[0.09]' : 'bg-white border border-slate-100 shadow-sm'}`}>
          <div className={`text-xs ${dark ? 'text-white/40' : 'text-slate-400'}`}>‹</div>
          <span className={`text-[10px] font-bold ${dark ? 'text-white/80' : 'text-slate-700'}`}>31 mar – 6 apr 2026</span>
          <div className={`text-xs ${dark ? 'text-white/40' : 'text-slate-400'}`}>›</div>
        </div>
        {/* Days grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className={`text-[8px] font-bold ${dark ? 'text-white/35' : 'text-slate-400'}`}>{d}</span>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold ${i === 1 ? 'bg-brand-mid text-white' : (dark ? 'text-white/60' : 'text-slate-600')}`}>{nums[i]}</div>
              <div className={`w-full h-10 rounded-lg flex items-center justify-center ${shifts[i] ? (dark ? 'bg-brand-mid/25 border border-brand-mid/40' : 'bg-blue-50 border border-blue-100') : (dark ? 'bg-white/[0.03]' : 'bg-slate-50')}`}>
                {shifts[i] && <span className={`text-[7px] font-bold text-center leading-tight ${dark ? 'text-white/70' : 'text-blue-700'}`}>{shifts[i]}</span>}
              </div>
            </div>
          ))}
        </div>
        {/* Summary card */}
        <Card dark={dark}>
          <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${dark ? 'text-white/40' : 'text-slate-400'}`}>Riepilogo settimana</p>
          <div className="flex justify-between">
            {['Turni', 'Ore tot', 'Riposi'].map((l, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className={`text-base font-black ${dark ? 'text-white' : 'text-slate-800'}`}>{['5', '25h', '2'][i]}</span>
                <span className={`text-[8px] ${dark ? 'text-white/40' : 'text-slate-400'}`}>{l}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <BottomNav dark={dark} active="turni" />
    </div>
  );
}

/* ── Presenze ────────────────────────────────────────────────────── */
function PresenzeMock({ dark }: { dark: boolean }) {
  const bg = dark ? BG_DARK : BG_LIGHT_TAB;
  const rows = [
    { date: 'Lun 31 mar', in: '07:58', out: '16:05', h: '8h 07m', ok: true },
    { date: 'Mar 1 apr',  in: '08:02', out: '16:00', h: '7h 58m', ok: true },
    { date: 'Mer 2 apr',  in: '—',     out: '—',     h: 'Riposo', ok: false },
    { date: 'Gio 3 apr',  in: '10:00', out: '18:01', h: '8h 01m', ok: true },
    { date: 'Ven 4 apr',  in: '08:00', out: '—',     h: 'In corso', ok: true },
  ];
  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col font-sans" style={{ background: bg }}>
      <TabHeader dark={dark} title="Presenze" />
      <div className="flex-1 overflow-hidden px-4 py-4 flex flex-col gap-3">
        <Card dark={dark}>
          <p className={`text-[9px] font-bold uppercase tracking-widest mb-2 ${dark ? 'text-white/40' : 'text-slate-400'}`}>Aprile 2025</p>
          <div className="flex justify-between">
            {['Presenti', 'Assenti', 'Ore tot'].map((l, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className={`text-sm font-black ${dark ? 'text-white' : 'text-slate-800'}`}>{['18', '2', '142h'][i]}</span>
                <span className={`text-[8px] ${dark ? 'text-white/40' : 'text-slate-400'}`}>{l}</span>
              </div>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-1.5">
          {rows.map((r, i) => (
            <div key={i} className={`flex items-center justify-between rounded-xl px-3 py-2 ${dark ? 'bg-white/5 border border-white/8' : 'bg-white border border-slate-100'}`}>
              <span className={`text-[9px] font-semibold w-20 ${dark ? 'text-white/60' : 'text-slate-500'}`}>{r.date}</span>
              <span className={`text-[9px] font-mono ${dark ? 'text-white/50' : 'text-slate-400'}`}>{r.in}</span>
              <span className={`text-[9px] font-mono ${dark ? 'text-white/50' : 'text-slate-400'}`}>{r.out}</span>
              <span className={`text-[9px] font-bold ${r.h === 'Riposo' ? (dark ? 'text-white/25' : 'text-slate-300') : r.h === 'In corso' ? (dark ? 'text-emerald-400' : 'text-emerald-600') : (dark ? 'text-white/80' : 'text-slate-700')}`}>{r.h}</span>
            </div>
          ))}
        </div>
      </div>
      <BottomNav dark={dark} active="timesheet" />
    </div>
  );
}

/* ── Ferie ───────────────────────────────────────────────────────── */
function FerieMock({ dark }: { dark: boolean }) {
  const bg = dark ? BG_DARK : BG_LIGHT_TAB;
  const requests = [
    { range: '14–18 apr 2025', days: 5, status: 'Approvata', color: 'emerald' },
    { range: '23–25 lug 2025', days: 3, status: 'In attesa',  color: 'amber'   },
    { range: '18–29 ago 2025', days: 10, status: 'In attesa', color: 'amber'   },
  ];
  const colorMap: Record<string, { dark: string; light: string }> = {
    emerald: { dark: 'text-emerald-400 bg-emerald-500/15', light: 'text-emerald-700 bg-emerald-50' },
    amber:   { dark: 'text-amber-400 bg-amber-500/15',   light: 'text-amber-700 bg-amber-50' },
  };
  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col font-sans" style={{ background: bg }}>
      <TabHeader dark={dark} title="Ferie" />
      <div className="flex-1 overflow-hidden px-4 py-4 flex flex-col gap-3">
        <Card dark={dark}>
          <div className="flex justify-between">
            {['Disponibili', 'Usate', 'In attesa'].map((l, i) => (
              <div key={i} className="flex flex-col items-center gap-0.5">
                <span className={`text-sm font-black ${dark ? 'text-white' : 'text-slate-800'}`}>{['12', '8', '13'][i]}</span>
                <span className={`text-[8px] ${dark ? 'text-white/40' : 'text-slate-400'}`}>{l + ' gg'}</span>
              </div>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-2">
          {requests.map((r, i) => (
            <Card dark={dark} key={i}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-[10px] font-bold ${dark ? 'text-white/90' : 'text-slate-800'}`}>{r.range}</p>
                  <p className={`text-[9px] ${dark ? 'text-white/40' : 'text-slate-400'}`}>{r.days} giorni</p>
                </div>
                <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${dark ? colorMap[r.color].dark : colorMap[r.color].light}`}>{r.status}</span>
              </div>
            </Card>
          ))}
        </div>
<button className={`w-full rounded-2xl py-3 text-[11px] font-bold flex items-center justify-center gap-1.5 pointer-events-none ${dark ? 'bg-[#4361EE]/30 border border-[#4361EE]/40 text-white/70' : 'bg-blue-600 text-white'} transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}>
          + Richiedi ferie
        </button>
      </div>
      <BottomNav dark={dark} active="ferie" />
    </div>
  );
}

/* ── Profilo ─────────────────────────────────────────────────────── */
function ProfiloMock({ dark }: { dark: boolean }) {
  const bg = dark ? BG_DARK : BG_LIGHT_TAB;
  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex flex-col font-sans" style={{ background: bg }}>
      <div className={`shrink-0 px-5 pt-10 pb-5 flex flex-col items-center gap-3 border-b ${dark ? 'border-white/8' : 'border-black/5'}`}>
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black ${dark ? 'bg-white/12 text-white border border-neutral-500' : 'bg-blue-100 text-blue-600'}`}>M</div>
        <div className="flex flex-col items-center gap-0.5">
          <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>Marco Rossi</p>
          <p className={`text-[9px] ${dark ? 'text-white/40' : 'text-slate-400'}`}>Staff · Cucina</p>
        </div>
        <div className="flex gap-2">
          {['Manager', 'Attivo'].map((l, i) => (
            <span key={i} className={`text-[8px] font-bold px-2.5 py-0.5 rounded-full ${dark ? 'bg-white/10 border border-neutral-500 text-white/60' : 'bg-slate-100 text-slate-600'}`}>{l}</span>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden px-4 py-4 flex flex-col gap-2">
        {['Impostazioni profilo', 'Sicurezza & PIN', 'Notifiche', 'Tema & Lingua', 'Esci dall\'app'].map((label, i) => (
          <div key={i} className={`flex items-center justify-between rounded-xl px-4 py-3 ${dark ? 'bg-white/5 border border-white/8' : 'bg-white border border-slate-100 shadow-sm'}`}>
            <span className={`text-[10px] font-semibold ${i === 4 ? (dark ? 'text-red-400' : 'text-red-500') : (dark ? 'text-white/80' : 'text-slate-700')}`}>{label}</span>
            <span className={`text-[10px] ${dark ? 'text-white/25' : 'text-slate-300'}`}>›</span>
          </div>
        ))}
      </div>
      <BottomNav dark={dark} active="profilo" />
    </div>
  );
}

/* ── Desktop frame ────────────────────────────────────────────────── */
const FW_D = 1280; const FH_D = 720;

function DesktopMockFrame({ label, children, scale = 0.30 }: {
  label: string; children: React.ReactNode; scale?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-center text-[10px] font-bold uppercase tracking-widest text-white/30">{label}</p>
      <div className="rounded-2xl overflow-hidden border border-white/10 shadow-lg mx-auto"
        style={{ width: FW_D * scale, height: FH_D * scale, position: 'relative' }}>
        <div style={{ width: FW_D, height: FH_D, transformOrigin: 'top left', transform: `scale(${scale})`, position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Desktop sidebar shell ─────────────────────────────────────────── */
const SIDEBAR_W = 220;

function DesktopShell({ dark, active, children }: { dark: boolean; active: string; children: React.ReactNode }) {
  const bg = dark ? BG_DARK : BG_LIGHT_TAB;
  const navItems = [
    { id: 'home',       label: 'Panoramica' },
    { id: 'turni',      label: 'Turni' },
    { id: 'timesheet',  label: 'Presenze' },
    { id: 'ferie',      label: 'Ferie' },
    { id: 'profilo',    label: 'Profilo' },
  ];
  return (
    <div data-theme={dark ? undefined : 'light'} className="h-full flex font-sans" style={{ background: bg }}>
      {/* Sidebar */}
      <div className={`flex flex-col shrink-0 h-full border-r ${dark ? 'border-white/8 bg-black/20' : 'border-slate-100 bg-white/60'}`}
        style={{ width: SIDEBAR_W }}>
        {/* Logo */}
        <div className={`flex items-center gap-3 px-5 py-5 border-b ${dark ? 'border-white/8' : 'border-slate-100'}`}>
          <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 80, height: 80, borderRadius: 18 }} />
          <div>
            <p className={`text-xs font-black tracking-[0.18em] uppercase leading-none ${dark ? 'text-white' : 'text-slate-800'}`}>FLOW</p>
            <p className={`text-[9px] tracking-wider ${dark ? 'text-white/40' : 'text-slate-400'}`}>Work in Motion</p>
          </div>
        </div>
        {/* Nav */}
        <nav className="flex-1 flex flex-col gap-1 p-3 pt-4">
          {navItems.map(item => (
            <div key={item.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
 item.id === active
 ? (dark ? 'bg-[#4361EE]/25 text-white/70 border border-[#4361EE]/30' : 'bg-blue-600 text-white')
 : (dark ? 'text-white/50 hover:bg-white/5' : 'text-slate-500 hover:bg-slate-50')
 } active:bg-white/5'/80`}>
              <div className={`w-4 h-4 rounded ${item.id === active ? '' : (dark ? 'bg-white/20' : 'bg-slate-200')}`} />
              {item.label}
            </div>
          ))}
        </nav>
        {/* User */}
        <div className={`flex items-center gap-2.5 px-4 py-4 border-t ${dark ? 'border-white/8' : 'border-slate-100'}`}>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${dark ? 'bg-white/12 text-white' : 'bg-blue-100 text-blue-600'}`}>M</div>
          <div>
            <p className={`text-xs font-semibold leading-none ${dark ? 'text-white/80' : 'text-slate-700'}`}>Marco Rossi</p>
            <p className={`text-[9px] ${dark ? 'text-white/35' : 'text-slate-400'}`}>Manager</p>
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top bar */}
        <div className={`shrink-0 flex items-center justify-between px-8 py-4 border-b ${dark ? 'border-white/8' : 'border-slate-100'}`}>
          <span className={`text-sm font-black tracking-[0.16em] uppercase ${dark ? 'text-white/90' : 'text-slate-700'}`}>
            {navItems.find(n => n.id === active)?.label ?? ''}
          </span>
          <div className="flex items-center gap-3">
            <div className={`text-xs ${dark ? 'text-white/35' : 'text-slate-400'}`}>sab 5 apr · 09:41</div>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${dark ? 'bg-white/10 text-white/60' : 'bg-slate-100 text-slate-500'}`}>T</div>
          </div>
        </div>
        {/* Content */}
        <div className="flex-1 overflow-hidden p-8">
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Desktop mocks ────────────────────────────────────────────────── */
function DPanoramicaMock({ dark }: { dark: boolean }) {
  return (
    <DesktopShell dark={dark} active="home">
      <div className="grid grid-cols-4 gap-5 h-full">
        {/* Col 1-2: main */}
        <div className="col-span-2 flex flex-col gap-5">
          {/* Turno */}
          <Card dark={dark} className="flex items-center justify-between">
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${dark ? 'text-white/40' : 'text-slate-400'}`}>Il tuo turno oggi</p>
              <p className={`text-xl font-black ${dark ? 'text-white' : 'text-slate-800'}`}>08:00 → 16:00</p>
              <p className={`text-xs mt-0.5 ${dark ? 'text-white/50' : 'text-slate-500'}`}>Cucina · 8h · In corso</p>
            </div>
            <div className={`px-3 py-1.5 rounded-full text-xs font-bold ${dark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>In corso</div>
          </Card>
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            {[['Ore mese', '142h'], ['Ferie rimanenti', '12 gg'], ['Straordinari', '+4h'], ['Presenze', '18/20']].map(([l, v], i) => (
              <Card dark={dark} key={i}>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/35' : 'text-slate-400'}`}>{l}</p>
                <p className={`text-2xl font-black mt-1 ${dark ? 'text-white' : 'text-slate-800'}`}>{v}</p>
              </Card>
            ))}
          </div>
        </div>
        {/* Col 3-4: side */}
        <div className="col-span-2 flex flex-col gap-5">
          <Card dark={dark}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${dark ? 'text-white/40' : 'text-slate-400'}`}>Colleghi presenti oggi</p>
            <div className="flex flex-col gap-2">
              {[['Marco', 'Cucina', '08–16'], ['Sara', 'Sala', '10–18'], ['Andrea', 'Bar', '08–16'], ['Luca', 'Cucina', '16–24']].map(([n, r, t], i) => (
                <div key={i} className={`flex items-center justify-between py-1.5 ${i > 0 ? (dark ? 'border-t border-white/6' : 'border-t border-slate-50') : ''}`}>
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${dark ? 'bg-white/12 text-white' : 'bg-blue-100 text-blue-600'}`}>{n[0]}</div>
                    <span className={`text-xs font-semibold ${dark ? 'text-white/80' : 'text-slate-700'}`}>{n}</span>
                    <span className={`text-[10px] ${dark ? 'text-white/35' : 'text-slate-400'}`}>{r}</span>
                  </div>
                  <span className={`text-[10px] font-mono ${dark ? 'text-white/50' : 'text-slate-500'}`}>{t}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card dark={dark}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-2 ${dark ? 'text-white/40' : 'text-slate-400'}`}>Messaggi recenti</p>
            <div className="flex flex-col gap-2">
              {['Turno modificato per dom 7 apr', 'Approvata richiesta ferie 14–18 apr'].map((m, i) => (
                <div key={i} className={`text-xs rounded-lg px-3 py-2 ${dark ? 'bg-white/5 text-white/60' : 'bg-slate-50 text-slate-600'}`}>{m}</div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </DesktopShell>
  );
}

function DTurniMock({ dark }: { dark: boolean }) {
  const days = ['Lun 31', 'Mar 1', 'Mer 2', 'Gio 3', 'Ven 4', 'Sab 5', 'Dom 6'];
  const staff = ['Marco', 'Sara', 'Andrea', 'Luca', 'Giulia'];
  const grid = [
    ['08–16', '', '08–16', '', '10–18', '08–16', ''],
    ['10–18', '10–18', '', '08–16', '08–16', '', '10–18'],
    ['', '08–16', '08–16', '10–18', '', '08–16', '08–16'],
    ['08–16', '08–16', '', '', '08–16', '', ''],
    ['', '', '14–22', '14–22', '14–22', '08–16', ''],
  ];
  return (
    <DesktopShell dark={dark} active="turni">
      <div className="flex flex-col gap-4 h-full">
        <div className="flex items-center justify-between">
          <div className={`flex items-center gap-3 rounded-xl px-4 py-2 ${dark ? 'bg-white/[0.04] border border-white/[0.09]' : 'bg-white border border-slate-100 shadow-sm'}`}>
            <span className={`text-xs ${dark ? 'text-white/40' : 'text-slate-400'}`}>‹</span>
            <span className={`text-sm font-bold ${dark ? 'text-white/80' : 'text-slate-700'}`}>31 mar – 6 apr 2026</span>
            <span className={`text-xs ${dark ? 'text-white/40' : 'text-slate-400'}`}>›</span>
          </div>
          <div className="flex gap-2">
            {['Ore tot: 190h', '28 turni'].map((l, i) => (
              <div key={i} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${dark ? 'bg-white/[0.06] text-white/60' : 'bg-slate-100 text-slate-600'}`}>{l}</div>
            ))}
          </div>
        </div>
        <div className={`rounded-2xl overflow-hidden border ${dark ? 'border-white/[0.09]' : 'border-slate-100'} flex-1`}>
          <div className={`grid border-b ${dark ? 'bg-white/[0.04] border-white/[0.09]' : 'bg-slate-50 border-slate-100'}`}
            style={{ gridTemplateColumns: `140px repeat(7, 1fr)` }}>
            <div className="px-4 py-2.5" />
            {days.map((d, i) => (
              <div key={i} className={`px-2 py-2.5 text-center text-[10px] font-bold ${dark ? 'text-white/50' : 'text-slate-500'}`}>{d}</div>
            ))}
          </div>
          {staff.map((s, si) => (
            <div key={si} className={`grid border-b last:border-0 ${dark ? 'border-white/[0.06]' : 'border-slate-50'}`}
              style={{ gridTemplateColumns: `140px repeat(7, 1fr)` }}>
              <div className={`flex items-center gap-2 px-4 py-2 ${dark ? 'bg-white/[0.02]' : 'bg-slate-50/50'}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${dark ? 'bg-brand-mid/30 text-white/70' : 'bg-blue-100 text-blue-600'}`}>{s[0]}</div>
                <span className={`text-[10px] font-semibold ${dark ? 'text-white/70' : 'text-slate-700'}`}>{s}</span>
              </div>
              {grid[si].map((cell, ci) => (
                <div key={ci} className="px-1 py-2 flex items-center justify-center">
                  {cell && <div className={`w-full rounded-lg py-1 text-center text-[9px] font-bold ${dark ? 'bg-brand-mid/20 text-white/70 border border-brand-mid/30' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>{cell}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </DesktopShell>
  );
}

function DPresenzeMock({ dark }: { dark: boolean }) {
  const rows = [
    { date: 'Lun 31 mar', in: '07:58', out: '16:05', h: '8h 07m', note: '' },
    { date: 'Mar 1 apr',  in: '08:02', out: '16:00', h: '7h 58m', note: '' },
    { date: 'Mer 2 apr',  in: '—',     out: '—',     h: 'Riposo', note: 'Riposo' },
    { date: 'Gio 3 apr',  in: '10:00', out: '18:01', h: '8h 01m', note: '' },
    { date: 'Ven 4 apr',  in: '08:00', out: '—',     h: 'In corso', note: '' },
    { date: 'Sab 5 apr',  in: '—',     out: '—',     h: '—', note: 'Futuro' },
  ];
  return (
    <DesktopShell dark={dark} active="timesheet">
      <div className="flex flex-col gap-5 h-full">
        <div className="grid grid-cols-4 gap-4">
          {[['Presenti', '18'], ['Assenti', '2'], ['Ore totali', '142h'], ['Media giornaliera', '7h 54m']].map(([l, v], i) => (
            <Card dark={dark} key={i}>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/35' : 'text-slate-400'}`}>{l}</p>
              <p className={`text-2xl font-black mt-1 ${dark ? 'text-white' : 'text-slate-800'}`}>{v}</p>
            </Card>
          ))}
        </div>
        <Card dark={dark} className="flex-1">
          <div className={`grid text-[10px] font-bold uppercase tracking-wider pb-2 mb-2 border-b ${dark ? 'text-white/40 border-white/8' : 'text-slate-400 border-slate-100'}`}
            style={{ gridTemplateColumns: '1fr 80px 80px 100px 1fr' }}>
            {['Data', 'Entrata', 'Uscita', 'Ore', 'Note'].map(h => <div key={h} className="px-2">{h}</div>)}
          </div>
          {rows.map((r, i) => (
            <div key={i} className={`grid items-center py-2 ${i > 0 ? (dark ? 'border-t border-white/5' : 'border-t border-slate-50') : ''}`}
              style={{ gridTemplateColumns: '1fr 80px 80px 100px 1fr' }}>
              <span className={`px-2 text-xs font-semibold ${dark ? 'text-white/70' : 'text-slate-700'}`}>{r.date}</span>
              <span className={`px-2 text-xs font-mono ${dark ? 'text-white/50' : 'text-slate-500'}`}>{r.in}</span>
              <span className={`px-2 text-xs font-mono ${dark ? 'text-white/50' : 'text-slate-500'}`}>{r.out}</span>
              <span className={`px-2 text-xs font-bold ${r.h === 'Riposo' ? (dark ? 'text-white/25' : 'text-slate-300') : r.h === 'In corso' ? (dark ? 'text-emerald-400' : 'text-emerald-600') : (dark ? 'text-white/80' : 'text-slate-700')}`}>{r.h}</span>
              <span className={`px-2 text-[10px] ${dark ? 'text-white/30' : 'text-slate-400'}`}>{r.note}</span>
            </div>
          ))}
        </Card>
      </div>
    </DesktopShell>
  );
}

function DFerieMock({ dark }: { dark: boolean }) {
  const requests = [
    { range: '14–18 apr 2025', days: 5,  status: 'Approvata', color: 'emerald' },
    { range: '23–25 lug 2025', days: 3,  status: 'In attesa', color: 'amber'   },
    { range: '18–29 ago 2025', days: 10, status: 'In attesa', color: 'amber'   },
  ];
  const colorMap: Record<string, { dark: string; light: string }> = {
    emerald: { dark: 'text-emerald-400 bg-emerald-500/15', light: 'text-emerald-700 bg-emerald-50' },
    amber:   { dark: 'text-amber-400 bg-amber-500/15',   light: 'text-amber-700 bg-amber-50' },
  };
  return (
    <DesktopShell dark={dark} active="ferie">
      <div className="grid grid-cols-3 gap-5 h-full">
        <div className="col-span-2 flex flex-col gap-5">
          <div className="grid grid-cols-3 gap-4">
            {[['Disponibili', '12 gg'], ['Usate', '8 gg'], ['In attesa', '13 gg']].map(([l, v], i) => (
              <Card dark={dark} key={i}>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/35' : 'text-slate-400'}`}>{l}</p>
                <p className={`text-2xl font-black mt-1 ${dark ? 'text-white' : 'text-slate-800'}`}>{v}</p>
              </Card>
            ))}
          </div>
          <Card dark={dark} className="flex-1">
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${dark ? 'text-white/40' : 'text-slate-400'}`}>Richieste</p>
            <div className="flex flex-col gap-2">
              {requests.map((r, i) => (
                <div key={i} className={`flex items-center justify-between py-2.5 px-3 rounded-xl ${dark ? 'bg-white/5 border border-white/8' : 'bg-slate-50 border border-slate-100'}`}>
                  <div>
                    <p className={`text-sm font-bold ${dark ? 'text-white/90' : 'text-slate-800'}`}>{r.range}</p>
                    <p className={`text-xs ${dark ? 'text-white/40' : 'text-slate-400'}`}>{r.days} giorni</p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${dark ? colorMap[r.color].dark : colorMap[r.color].light}`}>{r.status}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="flex flex-col gap-4">
          <Card dark={dark}>
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${dark ? 'text-white/40' : 'text-slate-400'}`}>Nuova richiesta</p>
            <div className="flex flex-col gap-2">
              {['Dal', 'Al'].map(l => (
                <div key={l} className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${dark ? 'bg-white/6 border border-white/10' : 'bg-white border border-slate-200'}`}>
                  <span className={`text-xs ${dark ? 'text-white/40' : 'text-slate-400'}`}>{l}</span>
                  <span className={`text-xs font-bold ${dark ? 'text-white/60' : 'text-slate-500'}`}>Seleziona…</span>
                </div>
              ))}
<button className={`w-full rounded-xl py-2.5 text-xs font-bold mt-1 pointer-events-none ${dark ? 'bg-[#4361EE]/30 border border-[#4361EE]/40 text-white/70' : 'bg-blue-600 text-white'} transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]`}>
                Invia richiesta
              </button>
            </div>
          </Card>
        </div>
      </div>
    </DesktopShell>
  );
}

function DProfiloMock({ dark }: { dark: boolean }) {
  return (
    <DesktopShell dark={dark} active="profilo">
      <div className="grid grid-cols-3 gap-5 h-full">
        {/* Sidebar profilo */}
        <div className="flex flex-col gap-4">
          <Card dark={dark} className="flex flex-col items-center gap-3 py-5">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black ${dark ? 'bg-white/12 text-white border border-neutral-500' : 'bg-blue-100 text-blue-600'}`}>M</div>
            <div className="text-center">
              <p className={`text-sm font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>Marco Rossi</p>
              <p className={`text-xs ${dark ? 'text-white/40' : 'text-slate-400'}`}>Staff · Cucina</p>
            </div>
            <div className="flex gap-2">
              {['Manager', 'Attivo'].map((l, i) => (
                <span key={i} className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${dark ? 'bg-white/10 border border-neutral-500 text-white/60' : 'bg-slate-100 text-slate-600'}`}>{l}</span>
              ))}
            </div>
          </Card>
          <Card dark={dark}>
            <div className="flex flex-col gap-1">
              {['Impostazioni profilo', 'Sicurezza & PIN', 'Notifiche', 'Tema & Lingua', 'Esci dall\'app'].map((label, i) => (
                <div key={i} className={`flex items-center justify-between py-2 ${i > 0 ? (dark ? 'border-t border-white/6' : 'border-t border-slate-50') : ''}`}>
                  <span className={`text-xs font-semibold ${i === 4 ? (dark ? 'text-red-400' : 'text-red-500') : (dark ? 'text-white/70' : 'text-slate-700')}`}>{label}</span>
                  <span className={`text-xs ${dark ? 'text-white/20' : 'text-slate-300'}`}>›</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
        {/* Stats */}
        <div className="col-span-2 flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            {[['Ore totali', '142h'], ['Ferie rimaste', '12 gg'], ['Turni mese', '18']].map(([l, v], i) => (
              <Card dark={dark} key={i}>
                <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/35' : 'text-slate-400'}`}>{l}</p>
                <p className={`text-xl font-black mt-1 ${dark ? 'text-white' : 'text-slate-800'}`}>{v}</p>
              </Card>
            ))}
          </div>
          <Card dark={dark} className="flex-1">
            <p className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${dark ? 'text-white/40' : 'text-slate-400'}`}>Attività recente</p>
            <div className="flex flex-col gap-2">
              {[
                ['Timbratura entrata', '08:00 · ven 4 apr'],
                ['Turno confermato', 'sab 5 apr 08–16'],
                ['Richiesta ferie inviata', '23–25 lug'],
                ['Cambio turno approvato', 'mer 2 apr'],
              ].map(([ev, when], i) => (
                <div key={i} className={`flex items-center justify-between py-2 ${i > 0 ? (dark ? 'border-t border-white/5' : 'border-t border-slate-50') : ''}`}>
                  <span className={`text-xs font-semibold ${dark ? 'text-white/70' : 'text-slate-700'}`}>{ev}</span>
                  <span className={`text-[10px] ${dark ? 'text-white/30' : 'text-slate-400'}`}>{when}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </DesktopShell>
  );
}

/* ── Dati schermate ──────────────────────────────────────────────── */
type ScreenId = 'boot' | 'sync1' | 'sync2' | 'sync3' | 'login' | 'pwa-ios' | 'pwa-android' | 'pwa-desktop' | 'sw1' | 'sw2' | 'sw3' | 'pu1' | 'pu2' | 'pu3' | 'refresh-lock' | 'kiosk' | 'invite'
  | 'tab-panoramica' | 'tab-turni' | 'tab-presenze' | 'tab-ferie' | 'tab-profilo'
  | 'dtab-panoramica' | 'dtab-turni' | 'dtab-presenze' | 'dtab-ferie' | 'dtab-profilo'
  | 'full-app-preview' | 'mockup-cards' | 'home-mgmt' | 'turni-mgmt' | 'ts-mgmt' | 'staff-home' | 'staff-shifts' | 'staff-ferie' | 'staff-ts' | 'stats-preview' | 'settings-preview';

const SYSTEM_TABS: { id: ScreenId; label: string; defaultDark: boolean }[] = [
  { id: 'boot',         label: '① Avvio',         defaultDark: true  },
  { id: 'sync1',        label: '② Sync inizio',   defaultDark: true  },
  { id: 'sync2',        label: '② Sync metà',     defaultDark: true  },
  { id: 'sync3',        label: '② Sync fine',     defaultDark: true  },
  { id: 'login',        label: '③ Login',          defaultDark: true },
  { id: 'pwa-ios',      label: '④ PWA iOS',        defaultDark: true },
  { id: 'pwa-android',  label: '⑤ PWA Android',   defaultDark: true },
  { id: 'pwa-desktop',  label: '⑥ PWA Desktop',    defaultDark: true },
  { id: 'sw1',          label: '⑦ Update inizio',  defaultDark: true },
  { id: 'sw2',          label: '⑦ Update metà',    defaultDark: true },
  { id: 'sw3',          label: '⑦ Update fine',    defaultDark: true },
  { id: 'pu1',          label: '⑧ Riavvio inizio',  defaultDark: true },
  { id: 'pu2',          label: '⑧ Riavvio metà',   defaultDark: true },
  { id: 'pu3',          label: '⑧ Riavvio fine',   defaultDark: true },
  { id: 'refresh-lock', label: '⑨ Sblocco PIN',   defaultDark: true },
  { id: 'kiosk',        label: '⑩ Kiosk',          defaultDark: true },
  { id: 'invite',       label: '⑪ Invito',         defaultDark: true },
];

const APP_TABS: { id: ScreenId; label: string; defaultDark: boolean; isDesktop?: boolean }[] = [
  { id: 'tab-panoramica',  label: 'Panoramica', defaultDark: true },
  { id: 'tab-turni',       label: 'Turni',      defaultDark: true },
  { id: 'tab-presenze',    label: 'Presenze',   defaultDark: true },
  { id: 'tab-ferie',       label: 'Ferie',      defaultDark: true },
  { id: 'tab-profilo',     label: 'Profilo',    defaultDark: true },
  { id: 'dtab-panoramica', label: 'Panoramica', defaultDark: true, isDesktop: true },
  { id: 'dtab-turni',      label: 'Turni',      defaultDark: true, isDesktop: true },
  { id: 'dtab-presenze',   label: 'Presenze',   defaultDark: true, isDesktop: true },
  { id: 'dtab-ferie',      label: 'Ferie',      defaultDark: true, isDesktop: true },
  { id: 'dtab-profilo',    label: 'Profilo',    defaultDark: true, isDesktop: true },
  { id: 'full-app-preview', label: 'Anteprima Completa App', defaultDark: false },
  { id: 'mockup-cards',    label: 'Mockup delle Schede (Design)', defaultDark: true },
  { id: 'home-mgmt',       label: 'Home Gestionale', defaultDark: false },
  { id: 'turni-mgmt',      label: 'Turni Gestionale', defaultDark: false },
  { id: 'ts-mgmt',         label: 'Presenze Gestionale', defaultDark: false },
  { id: 'staff-home',      label: 'Home Staff', defaultDark: false },
  { id: 'staff-shifts',    label: 'Turni Staff', defaultDark: false },
  { id: 'staff-ferie',     label: 'Ferie Staff', defaultDark: false },
  { id: 'staff-ts',        label: 'Presenze Staff', defaultDark: false },
  { id: 'stats-preview',   label: 'Statistiche', defaultDark: false },
  { id: 'settings-preview',label: 'Impostazioni', defaultDark: false },
];

const TABS = [...SYSTEM_TABS, ...APP_TABS];

function screenFor(id: ScreenId, dark: boolean) {
  // Mock data for management previews
  const mockAdmin = {
    id: 'preview-admin',
    first_name: 'Admin',
    last_name: 'Osteria',
    role: 'admin',
    department: 'Direzione',
    status: 'active',
    email: 'admin@osteria.local',
  } as User;

  const mockStaff = {
    id: 'preview-staff',
    first_name: 'Marco',
    last_name: 'Rossi',
    role: 'waiter',
    department: 'Sala',
    status: 'active',
    email: 'marco@osteria.local',
  } as User;

  const mockLang: Language = 'it';

  switch (id) {
    case 'boot':         return <BootMock dark={dark} />;
    case 'sync1':        return <SyncMock stage="Pulizia cache locale…"  progress={0.20} dark={dark} />;
    case 'sync2':        return <SyncMock stage="Connessione al server…" progress={0.55} dark={dark} />;
    case 'sync3':        return <SyncMock stage="✓ Completata"           progress={1.0}  dark={dark} />;
    case 'login':        return <LoginMock dark={dark} />;
    case 'pwa-ios':      return <PwaIosMock dark={dark} />;
    case 'pwa-android':  return <PwaAndroidMock dark={dark} />;
    case 'pwa-desktop':  return <PwaDesktopMock dark={dark} />;
    case 'sw1':          return <SwUpdateMock activeIdx={0} progress={0.15} dark={dark} />;
    case 'sw2':          return <SwUpdateMock activeIdx={2} progress={0.60} dark={dark} />;
    case 'sw3':          return <SwUpdateMock activeIdx={3} progress={0.95} dark={dark} />;
    case 'pu1':          return <PostUnlockMock activeIdx={0} progress={0.15} dark={dark} />;
    case 'pu2':          return <PostUnlockMock activeIdx={2} progress={0.60} dark={dark} />;
    case 'pu3':          return <PostUnlockMock activeIdx={3} progress={0.95} dark={dark} />;
    case 'refresh-lock':    return <RefreshLockMock dark={dark} />;
    case 'kiosk':           return <KioskMock dark={dark} />;
    case 'invite':          return <InviteMock dark={dark} />;
    case 'tab-panoramica':  return <PanoramicaMock dark={dark} />;
    case 'tab-turni':       return <TurniMock dark={dark} />;
    case 'tab-presenze':    return <PresenzeMock dark={dark} />;
    case 'tab-ferie':       return <FerieMock dark={dark} />;
    case 'tab-profilo':     return <ProfiloMock dark={dark} />;
    case 'dtab-panoramica': return <DPanoramicaMock dark={dark} />;
    case 'dtab-turni':      return <DTurniMock dark={dark} />;
    case 'dtab-presenze':   return <DPresenzeMock dark={dark} />;
    case 'dtab-ferie':      return <DFerieMock dark={dark} />;
    case 'dtab-profilo':    return <DProfiloMock dark={dark} />;
    case 'mockup-cards':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-8 space-y-12" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <div className="max-w-md mx-auto space-y-8">
            <h2 className={`text-center text-xl font-black uppercase tracking-widest ${dark ? 'text-white/40' : 'text-slate-400'}`}>Mockup Design Schede</h2>
            
            <div className="space-y-4">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/20' : 'text-slate-400'}`}>1. Panoramica (Mobile)</p>
              <MockFrame label="Mobile" scale={1}>
                <PanoramicaMock dark={dark} />
              </MockFrame>
            </div>

            <div className="space-y-4">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/20' : 'text-slate-400'}`}>2. Turni (Mobile)</p>
              <MockFrame label="Mobile" scale={1}>
                <TurniMock dark={dark} />
              </MockFrame>
            </div>

            <div className="space-y-4">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/20' : 'text-slate-400'}`}>3. Presenze (Mobile)</p>
              <MockFrame label="Mobile" scale={1}>
                <PresenzeMock dark={dark} />
              </MockFrame>
            </div>

            <div className="space-y-4">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/20' : 'text-slate-400'}`}>4. Ferie (Mobile)</p>
              <MockFrame label="Mobile" scale={1}>
                <FerieMock dark={dark} />
              </MockFrame>
            </div>

            <div className="space-y-4">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/20' : 'text-slate-400'}`}>5. Profilo (Mobile)</p>
              <MockFrame label="Mobile" scale={1}>
                <ProfiloMock dark={dark} />
              </MockFrame>
            </div>
          </div>

          <div className="max-w-5xl mx-auto space-y-12 pt-12 border-t border-white/10">
            <h2 className={`text-center text-xl font-black uppercase tracking-widest ${dark ? 'text-white/40' : 'text-slate-400'}`}>Mockup Design Desktop</h2>
            
            <div className="space-y-4">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/20' : 'text-slate-400'}`}>Panoramica (Desktop)</p>
              <DesktopMockFrame label="Desktop" scale={0.8}>
                <DPanoramicaMock dark={dark} />
              </DesktopMockFrame>
            </div>

            <div className="space-y-4">
              <p className={`text-[10px] font-bold uppercase tracking-widest ${dark ? 'text-white/20' : 'text-slate-400'}`}>Turni (Desktop)</p>
              <DesktopMockFrame label="Desktop" scale={0.8}>
                <DTurniMock dark={dark} />
              </DesktopMockFrame>
            </div>
          </div>
        </div>
      );
    case 'full-app-preview':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-4 space-y-8" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <div className="space-y-4">
            <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>1. Home Gestionale</h2>
            <ManagementHomePreview previewUser={mockAdmin} language={mockLang} isSelectedAdmin={true} staffRequestsEnabled={true} onUiToggle={() => {}} embedded />
          </div>
          <div className="space-y-4">
            <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>2. Turni Gestionale</h2>
            <TurniMgmtPreview previewUser={mockAdmin} language={mockLang} isSelectedAdmin={true} onUiToggle={() => {}} />
          </div>
          <div className="space-y-4">
            <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>3. Presenze Gestionale</h2>
            <TimesheetTabPreview previewUser={mockAdmin} language={mockLang} isSelectedAdmin={true} onUiToggle={() => {}} />
          </div>
          <div className="space-y-4">
            <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>4. Home Staff</h2>
            <StaffHomePreview previewUser={mockStaff} language={mockLang} isSelectedAdmin={true} onUiToggle={() => {}} />
          </div>
          <div className="space-y-4">
            <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>5. Turni Staff</h2>
            <StaffShiftsPreview previewUser={mockStaff} language={mockLang} isSelectedAdmin={true} onUiToggle={() => {}} />
          </div>
          <div className="space-y-4">
            <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>6. Ferie Staff</h2>
            <StaffHolidaysPreview previewUser={mockStaff} language={mockLang} isSelectedAdmin={true} onUiToggle={() => {}} />
          </div>
          <div className="space-y-4">
            <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>7. Presenze Staff</h2>
            <div data-theme={dark ? undefined : 'light'} className="rounded-2xl overflow-hidden border border-white/10 shadow-lg" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
              <MobileTimesheet
                shifts={MOCK_TIMESHEET_SHIFTS}
                punchRecords={[]}
                user={mockStaff}
                breakRules={[]}
                breakComputeOpts={{}}
                language="it"
              />
            </div>
          </div>
          <div className="space-y-4">
            <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>8. Statistiche</h2>
            <StatisticsTabPreview previewUser={mockAdmin} language={mockLang} isSelectedAdmin={true} onUiToggle={() => {}} />
          </div>
          <div className="space-y-4">
            <h2 className={`text-lg font-bold ${dark ? 'text-white' : 'text-slate-800'}`}>9. Impostazioni</h2>
            <SettingsTabPreview previewUser={mockAdmin} language={mockLang} isSelectedAdmin={true} onUiToggle={() => {}} />
          </div>
        </div>
      );
    case 'home-mgmt':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-4" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <ManagementHomePreview
            previewUser={mockAdmin}
            language={mockLang}
            isSelectedAdmin={true}
            staffRequestsEnabled={true}
            onUiToggle={() => {}}
            embedded
          />
        </div>
      );
    case 'turni-mgmt':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-4" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <TurniMgmtPreview
            previewUser={mockAdmin}
            language={mockLang}
            isSelectedAdmin={true}
            onUiToggle={() => {}}
          />
        </div>
      );
    case 'ts-mgmt':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-4" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <TimesheetTabPreview
            previewUser={mockAdmin}
            language={mockLang}
            isSelectedAdmin={true}
            onUiToggle={() => {}}
          />
        </div>
      );
    case 'staff-home':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-4" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <StaffHomePreview
            previewUser={mockStaff}
            language={mockLang}
            isSelectedAdmin={true}
            onUiToggle={() => {}}
          />
        </div>
      );
    case 'staff-shifts':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-4" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <StaffShiftsPreview
            previewUser={mockStaff}
            language={mockLang}
            isSelectedAdmin={true}
            onUiToggle={() => {}}
          />
        </div>
      );
    case 'staff-ferie':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-4" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <StaffHolidaysPreview
            previewUser={mockStaff}
            language={mockLang}
            isSelectedAdmin={true}
            onUiToggle={() => {}}
          />
        </div>
      );
    case 'staff-ts':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-4" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <MobileTimesheet
            shifts={MOCK_TIMESHEET_SHIFTS}
            punchRecords={[]}
            user={mockStaff}
            breakRules={[]}
            breakComputeOpts={{}}
            language="it"
          />
        </div>
      );
    case 'stats-preview':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-4" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <StatisticsTabPreview
            previewUser={mockAdmin}
            language={mockLang}
            isSelectedAdmin={true}
            onUiToggle={() => {}}
          />
        </div>
      );
    case 'settings-preview':
      return (
        <div data-theme={dark ? undefined : 'light'} className="h-full overflow-y-auto p-4" style={{ background: dark ? '#0a0a0a' : '#f8fafc' }}>
          <SettingsTabPreview
            previewUser={mockAdmin}
            language={mockLang}
            isSelectedAdmin={true}
            onUiToggle={() => {}}
          />
        </div>
      );
  }
}

function isDesktopId(id: ScreenId) {
  return id.startsWith('dtab-');
}

/* ── Main ─────────────────────────────────────────────────────────── */
export default function ScreensPreview() {
  const [open, setOpen] = useState<ScreenId | null>(null);
  const [isDark, setIsDark] = useState(true);

  const openTab = TABS.find(t => t.id === open);

  const handleOpen = (id: ScreenId) => {
    const tab = TABS.find(t => t.id === id);
    setIsDark(tab?.defaultDark ?? true);
    setOpen(id);
  };

  return (
    <div className="h-full flex flex-col gap-6 p-6 font-sans overflow-y-auto bg-app-bg">
      {/* mock preview — intentional: text-[8–10px] sotto (scala ridotta) */}
      <h1 className="text-center text-sm font-bold uppercase tracking-widest text-white/30">
        Anteprima schermate — Dark · Light
      </h1>

      {/* Sezione 1: Schermate di sistema */}
      <div className="flex flex-col gap-3 max-w-6xl mx-auto w-full">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/20 pl-1">Schermate di sistema</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-5">
          {SYSTEM_TABS.map(t => (
            <motion.button
              key={t.id}
              whileHover={{ scale: 1.04, y: -2 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => handleOpen(t.id)}
              className="flex flex-col gap-1 cursor-pointer focus:outline-none rounded-2xl p-1.5 transition-colors hover:bg-white/5 active:bg-white/5/80"
            >
              <p className="text-center text-[9px] font-bold uppercase tracking-widest text-white/30 mb-0.5">{t.label}</p>
              <div className="flex gap-1 justify-center">
                <MockFrame label={t.defaultDark ? 'Dark' : 'Light'} scale={0.45}>
                  {screenFor(t.id, t.defaultDark)}
                </MockFrame>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div className="max-w-6xl mx-auto w-full h-px bg-white/8" />

      {/* Sezione 2: Anteprime UI (Nuove) */}
      <div className="flex flex-col gap-3 max-w-6xl mx-auto w-full">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/20 pl-1">Anteprime UI (Nuove)</p>
        
        {/* Pulsante Anteprima Completa */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleOpen('full-app-preview')}
            className="flex flex-col gap-2 cursor-pointer focus:outline-none rounded-2xl p-4 transition-colors bg-accent/10 border border-accent/20 hover:bg-accent/20 active:bg-accent/80"
          >
            <p className="text-center text-xs font-black uppercase tracking-[0.3em] text-accent">✨ Anteprima Completa App ✨</p>
            <p className="text-center text-[10px] text-accent/60 uppercase tracking-widest">Componenti reali dell'app</p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleOpen('mockup-cards')}
            className="flex flex-col gap-2 cursor-pointer focus:outline-none rounded-2xl p-4 transition-colors bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 active:bg-emerald-500/80"
          >
            <p className="text-center text-xs font-black uppercase tracking-[0.3em] text-emerald-500">🎨 Mockup delle Schede 🎨</p>
            <p className="text-center text-[10px] text-emerald-500/60 uppercase tracking-widest">Design statico e mockup grafici</p>
          </motion.button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
          {['home-mgmt', 'turni-mgmt', 'ts-mgmt', 'staff-home', 'staff-shifts', 'staff-ferie', 'staff-ts', 'stats-preview', 'settings-preview'].map(id => {
            const t = APP_TABS.find(x => x.id === id);
            if (!t) return null;
            return (
              <motion.button
                key={t.id}
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => handleOpen(t.id as ScreenId)}
                className="flex flex-col gap-2 cursor-pointer focus:outline-none rounded-2xl p-2 transition-colors hover:bg-white/5 active:bg-white/5/80"
              >
                <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">{t.label}</p>
                <div className="flex gap-1 justify-center">
                  <MockFrame label={t.defaultDark ? 'Dark' : 'Light'} scale={0.55}>
                    {screenFor(t.id as ScreenId, t.defaultDark)}
                  </MockFrame>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="max-w-6xl mx-auto w-full h-px bg-white/8" />

      {/* Sezione 3: Schede principali */}
      <div className="flex flex-col gap-3 max-w-6xl mx-auto w-full">
        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/20 pl-1">Schede principali</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {(['tab-panoramica', 'tab-turni', 'tab-presenze', 'tab-ferie', 'tab-profilo'] as ScreenId[]).map(tabId => {
            const deskId = tabId.replace('tab-', 'dtab-') as ScreenId;
            const label = APP_TABS.find(t => t.id === tabId)?.label ?? '';
            return (
              <div key={tabId} className="flex flex-col gap-2">
                <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-white/35">{label}</p>
                {/* Mobile */}
                <motion.button
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleOpen(tabId)}
                  className="flex flex-col gap-1 cursor-pointer focus:outline-none rounded-2xl p-1 hover:bg-white/5 transition-colors active:bg-white/5/80"
                >
                  <p className="text-center text-[9px] font-semibold uppercase tracking-widest text-white/25">📱 Mobile</p>
                  <MockFrame label="" scale={0.26}>
                    {screenFor(tabId, true)}
                  </MockFrame>
                </motion.button>
                {/* Desktop */}
                <motion.button
                  whileHover={{ scale: 1.03, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleOpen(deskId)}
                  className="flex flex-col gap-1 cursor-pointer focus:outline-none rounded-2xl p-1 hover:bg-white/5 transition-colors active:bg-white/5/80"
                >
                  <p className="text-center text-[9px] font-semibold uppercase tracking-widest text-white/25">🖥 Desktop</p>
                  <DesktopMockFrame label="" scale={0.155}>
                    {screenFor(deskId, true)}
                  </DesktopMockFrame>
                </motion.button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lightbox modal */}
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setOpen(null)}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            className="flex flex-col items-center gap-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Label + toggle dark/light */}
            <div className="flex items-center gap-3">
              <p className="text-white/50 text-xs font-bold uppercase tracking-widest">{openTab?.label}</p>
              <div className="flex rounded-full overflow-hidden border border-neutral-500 text-xs font-semibold">
                <button
                  onClick={() => setIsDark(true)}
                  className={`px-3 py-1 transition-colors ${isDark ? 'bg-neutral-700 text-white' : 'text-white/40 hover:text-white/60'} active:text-white/60'}`}
                >
                  Dark
                </button>
                <button
                  onClick={() => setIsDark(false)}
                  className={`px-3 py-1 transition-colors ${!isDark ? 'bg-white text-slate-800' : 'text-white/40 hover:text-white/60'} active:text-white/60'}`}
                >
                  Light
                </button>
              </div>
            </div>

            {isDesktopId(open) ? (
              <DesktopMockFrame label="" scale={0.52}>
                {screenFor(open, isDark)}
              </DesktopMockFrame>
            ) : (
              <MockFrame label="" scale={0.65}>
                {screenFor(open, isDark)}
              </MockFrame>
            )}

            {/* Navigazione interna */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const idx = TABS.findIndex(t => t.id === open);
                  handleOpen(TABS[(idx - 1 + TABS.length) % TABS.length].id);
                }}
                className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-white/60 hover:bg-white/20 transition-colors active:bg-white/80"
              >
                ← Precedente
              </button>
              <button
                onClick={() => setOpen(null)}
                className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-white/60 hover:bg-white/20 transition-colors active:bg-white/80"
              >
                ✕ Chiudi
              </button>
              <button
                onClick={() => {
                  const idx = TABS.findIndex(t => t.id === open);
                  handleOpen(TABS[(idx + 1) % TABS.length].id);
                }}
                className="px-4 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-white/60 hover:bg-white/20 transition-colors active:bg-white/80"
              >
                Successiva →
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
