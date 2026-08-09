/**
 * InstallPage — Pagina di installazione PWA.
 * Su Apple (iPhone/iPad): mostra direttamente la guida iOS con .mobileconfig.
 * Altri dispositivi: scelta manuale con passaggi per Android / Computer.
 */
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useT } from '../hooks/useT';
import { formatTrans } from '../utils/translations';
import { PATH_PROFILO } from '../config/appPaths';
import FlowLogoSvg from './FlowLogoSvg';

function isAppleDevice(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream;
}

function StepRow({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-4 py-3.5"
      style={{
        background: 'rgba(40, 32, 24, 0.82)',
        border: '1px solid rgba(255,255,255,0.15)',
      }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: 'rgba(59,130,246,0.30)',
        }}
      >
        <span className="text-white/70 text-[11px] font-bold">{icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-white font-semibold text-sm leading-tight">{title}</p>
      </div>
    </div>
  );
}

function DeviceButton({
  emoji,
  label,
  desc,
  onClick,
}: {
  emoji: string;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-4 rounded-2xl px-5 py-4 text-left transition-colors"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <span className="text-2xl">{emoji}</span>
      <div>
        <p className="text-white font-semibold text-sm">{label}</p>
        <p className="text-white/50 text-xs mt-0.5">{desc}</p>
      </div>
    </button>
  );
}

function OsButton({
  emoji,
  label,
  onClick,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-center gap-3 rounded-xl py-4 font-semibold text-[0.95rem] transition-colors duration-200"
      style={{
        background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
        color: '#fff',
        boxShadow: '0 8px 24px rgba(99, 102, 241, 0.35)',
      }}
    >
      <span className="text-xl">{emoji}</span>
      {label}
    </button>
  );
}

export default function InstallPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const t = useT() as Record<string, string>;
  const tr = (key: string) => t[key] ?? key;

  const userId = searchParams.get('userId') ?? '';
  const firstName = searchParams.get('firstName') ?? '';
  const pin = searchParams.get('pin') ?? '';

  // Su Apple: vai direttamente alla vista iOS (salta scelta dispositivo)
  const appleDevice = isAppleDevice();
  const [selectedDevice, setSelectedDevice] = useState<'ios' | 'android' | 'computer' | null>(
    appleDevice ? 'ios' : null
  );
  const [selectedOs, setSelectedOs] = useState<'mac' | 'win' | null>(null);

  const handleContinue = () => {
    if (userId && pin.length === 4) {
      // Login diretto con token pre-compilato
      const payload = { u: userId, p: pin };
      const token = btoa(JSON.stringify(payload));
      navigate(`${PATH_PROFILO}?t=${encodeURIComponent(token)}`, { replace: true });
    } else if (userId) {
      navigate(`${PATH_PROFILO}?userId=${userId}`, { replace: true });
    } else {
      navigate(PATH_PROFILO, { replace: true });
    }
  };

  const handleBackToDevices = () => {
    setSelectedOs(null);
    setSelectedDevice(null);
  };

  const handleBackFromOs = () => {
    setSelectedOs(null);
  };

  /* ─── Scelta dispositivo ─── */
  const renderDeviceChooser = () => (
    <>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-5"
      >
        <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 80, height: 80, borderRadius: 18 }} />
      </motion.div>

      <h1 className="text-xl font-bold text-white tracking-tight mb-1.5 text-center">
        {firstName ? formatTrans(tr('install_welcome_name'), { name: firstName }) : tr('install_welcome')}
      </h1>

      <p className="text-sm text-white/50 text-center leading-relaxed mb-6">
        {tr('install_choose_device')}
      </p>

      <div className="w-full space-y-3">
        <DeviceButton
          emoji="📱"
          label={`${tr('install_ios_btn')} / iPad`}
          desc={tr('install_ios_desc')}
          onClick={() => setSelectedDevice('ios')}
        />
        <DeviceButton
          emoji="🤖"
          label={tr('install_android_btn')}
          desc={tr('install_android_desc')}
          onClick={() => setSelectedDevice('android')}
        />
        <DeviceButton
          emoji="💻"
          label="Computer"
          desc="Mac o Windows"
          onClick={() => setSelectedDevice('computer')}
        />
      </div>

      <button
        type="button"
        onClick={handleContinue}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 mt-6 text-sm font-semibold transition-colors"
        style={{
          background: 'rgba(102,153,255,0.2)',
          border: '1px solid rgba(102,153,255,0.4)',
          color: 'rgb(199, 210, 255)',
        }}
      >
        {tr('install_open_app')}
      </button>
    </>
  );

  /* ─── Passaggi iOS ─── */
  const renderIOS = () => (
    <>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-5"
      >
        <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 80, height: 80, borderRadius: 18 }} />
      </motion.div>

      <h1 className="text-xl font-bold text-white tracking-tight mb-1.5 text-center">
        {firstName ? formatTrans(tr('install_welcome_name'), { name: firstName }) : tr('install_welcome')}
      </h1>

      <p className="text-sm text-white/50 text-center leading-relaxed mb-6">
        {tr('install_ios_title')}
      </p>

      {/* Opzione rapida: .mobileconfig */}
      <a
        href="/FLOW.mobileconfig"
        download
        className="w-full flex items-center justify-center gap-3 rounded-2xl py-3.5 mb-4 text-sm font-semibold transition-colors"
        style={{
          background: 'linear-gradient(135deg, #007AFF 0%, #0056CC 100%)',
          color: '#fff',
          boxShadow: '0 8px 24px rgba(0, 122, 255, 0.35)',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Installa con 1 tocco (consigliato)
      </a>

      <p className="text-[11px] text-white/40 text-center leading-relaxed mb-3">
        Scarica il profilo e vai su <strong>Impostazioni → Generali → Gestione dispositivo → FLOW → Installa</strong>
      </p>

      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[10px] text-white/30 uppercase tracking-wider">oppure manualmente</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <div className="w-full space-y-2 mb-6">
        <StepRow icon={<span className="text-white font-bold text-xs">1</span>} title={tr('invite_install_ios_1')} />
        <StepRow icon={<span className="text-white font-bold text-xs">2</span>} title={tr('invite_install_ios_2')} />
        <StepRow icon={<span className="text-white font-bold text-xs">3</span>} title={tr('invite_install_ios_3')} />
      </div>

      <button
        type="button"
        onClick={handleBackToDevices}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 mb-3 text-sm font-medium transition-colors"
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.50)',
        }}
      >
        ← {tr('install_choose_device')}
      </button>

      <button
        type="button"
        onClick={handleContinue}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-colors"
        style={{
          background: 'rgba(102,153,255,0.2)',
          border: '1px solid rgba(102,153,255,0.4)',
          color: 'rgb(199, 210, 255)',
        }}
      >
        {tr('install_open_app')}
      </button>
    </>
  );

  /* ─── Passaggi Android ─── */
  const renderAndroid = () => (
    <>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-5"
      >
        <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 80, height: 80, borderRadius: 18 }} />
      </motion.div>

      <h1 className="text-xl font-bold text-white tracking-tight mb-1.5 text-center">
        {firstName ? formatTrans(tr('install_welcome_name'), { name: firstName }) : tr('install_welcome')}
      </h1>

      <p className="text-sm text-white/50 text-center leading-relaxed mb-6">
        {tr('install_android_title')}
      </p>

      <div className="w-full space-y-2 mb-6">
        <StepRow icon={<span className="text-white font-bold text-xs">1</span>} title={tr('invite_install_android_1')} />
        <StepRow icon={<span className="text-white font-bold text-xs">2</span>} title={tr('invite_install_android_2')} />
        <StepRow icon={<span className="text-white font-bold text-xs">3</span>} title={tr('invite_install_android_3')} />
      </div>

      <button
        type="button"
        onClick={handleBackToDevices}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 mb-3 text-sm font-medium transition-colors"
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.50)',
        }}
      >
        ← {tr('install_choose_device')}
      </button>

      <button
        type="button"
        onClick={handleContinue}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-colors"
        style={{
          background: 'rgba(102,153,255,0.2)',
          border: '1px solid rgba(102,153,255,0.4)',
          color: 'rgb(199, 210, 255)',
        }}
      >
        {tr('install_open_app')}
      </button>
    </>
  );

  /* ─── Scelta SO Computer ─── */
  const renderOsChooser = () => (
    <>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-5"
      >
        <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 80, height: 80, borderRadius: 18 }} />
      </motion.div>

      <h1 className="text-xl font-bold text-white tracking-tight mb-1.5 text-center">
        {firstName ? formatTrans(tr('install_welcome_name'), { name: firstName }) : tr('install_welcome')}
      </h1>

      <p className="text-sm text-white/50 text-center leading-relaxed mb-6">
        Scegli il tuo sistema operativo
      </p>

      <div className="w-full space-y-3">
        <OsButton emoji="🍎" label="Mac" onClick={() => setSelectedOs('mac')} />
        <OsButton emoji="🪟" label="Windows" onClick={() => setSelectedOs('win')} />
      </div>

      <button
        type="button"
        onClick={handleBackToDevices}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 mt-4 mb-3 text-sm font-medium transition-colors"
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.50)',
        }}
      >
        ← {tr('install_choose_device')}
      </button>

      <button
        type="button"
        onClick={handleContinue}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-colors"
        style={{
          background: 'rgba(102,153,255,0.2)',
          border: '1px solid rgba(102,153,255,0.4)',
          color: 'rgb(199, 210, 255)',
        }}
      >
        {tr('install_open_app')}
      </button>
    </>
  );

  /* ─── Passaggi Mac ─── */
  const renderMac = () => (
    <>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-5"
      >
        <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 80, height: 80, borderRadius: 18 }} />
      </motion.div>

      <h1 className="text-xl font-bold text-white tracking-tight mb-1.5 text-center">
        {firstName ? formatTrans(tr('install_welcome_name'), { name: firstName }) : tr('install_welcome')}
      </h1>

      <p className="text-sm text-white/50 text-center leading-relaxed mb-6">
        Installa FLOW su Mac
      </p>

      <div className="w-full space-y-2 mb-6">
        <StepRow icon={<span className="text-white font-bold text-xs">1</span>} title={tr('invite_install_mac_1')} />
        <StepRow icon={<span className="text-white font-bold text-xs">2</span>} title={tr('invite_install_mac_2')} />
        <StepRow icon={<span className="text-white font-bold text-xs">3</span>} title={tr('invite_install_mac_3')} />
      </div>

      <button
        type="button"
        onClick={handleBackFromOs}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 mb-3 text-sm font-medium transition-colors"
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.50)',
        }}
      >
        ← Scegli sistema operativo
      </button>

      <button
        type="button"
        onClick={handleContinue}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-colors"
        style={{
          background: 'rgba(102,153,255,0.2)',
          border: '1px solid rgba(102,153,255,0.4)',
          color: 'rgb(199, 210, 255)',
        }}
      >
        {tr('install_open_app')}
      </button>
    </>
  );

  /* ─── Passaggi Windows ─── */
  const renderWin = () => (
    <>
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="mb-5"
      >
        <FlowLogoSvg variant="icon-only" color="orange" style={{ width: 80, height: 80, borderRadius: 18 }} />
      </motion.div>

      <h1 className="text-xl font-bold text-white tracking-tight mb-1.5 text-center">
        {firstName ? formatTrans(tr('install_welcome_name'), { name: firstName }) : tr('install_welcome')}
      </h1>

      <p className="text-sm text-white/50 text-center leading-relaxed mb-6">
        Installa FLOW su Windows
      </p>

      <div className="w-full space-y-2 mb-6">
        <StepRow icon={<span className="text-white font-bold text-xs">1</span>} title={tr('invite_install_win_1')} />
        <StepRow icon={<span className="text-white font-bold text-xs">2</span>} title={tr('invite_install_win_2')} />
        <StepRow icon={<span className="text-white font-bold text-xs">3</span>} title={tr('invite_install_win_3')} />
      </div>

      <button
        type="button"
        onClick={handleBackFromOs}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-2.5 mb-3 text-sm font-medium transition-colors"
        style={{
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.10)',
          color: 'rgba(255,255,255,0.50)',
        }}
      >
        ← Scegli sistema operativo
      </button>

      <button
        type="button"
        onClick={handleContinue}
        className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold transition-colors"
        style={{
          background: 'rgba(102,153,255,0.2)',
          border: '1px solid rgba(102,153,255,0.4)',
          color: 'rgb(199, 210, 255)',
        }}
      >
        {tr('install_open_app')}
      </button>
    </>
  );

  /* ─── Determina quale schermata mostrare ─── */
  let content;
  if (selectedDevice === 'ios') {
    content = renderIOS();
  } else if (selectedDevice === 'android') {
    content = renderAndroid();
  } else if (selectedDevice === 'computer') {
    if (selectedOs === 'mac') {
      content = renderMac();
    } else if (selectedOs === 'win') {
      content = renderWin();
    } else {
      content = renderOsChooser();
    }
  } else {
    content = renderDeviceChooser();
  }

  return (
    <div role="main"
      className="min-h-screen min-h-[100dvh] w-full flex flex-col items-center justify-center px-6 font-sans"
      style={{ background: 'transparent' }}
    >
      <div className="mx-auto flex w-full max-w-sm flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full rounded-3xl overflow-hidden px-6 py-8"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow:
              '0 32px 64px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset',
          }}
        >
          {content}
        </motion.div>
        <p className="mt-8 text-white/20 text-xs font-semibold tracking-[0.2em] uppercase select-none">FLOW</p>
      </div>
    </div>
  );
}
