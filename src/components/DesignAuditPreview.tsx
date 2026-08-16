import { useState } from 'react';
import FlowLogoSvg from './FlowLogoSvg';
import FlowWaveIcon from './ui/FlowWaveIcon';
import { FlowNeonIcon } from './ui/FlowNeonIcon';

const BG_OVERLAYS = [
  { id: 'splash', label: 'Splash boot / Update / Restart', gradient: 'radial-gradient(ellipse at 50% 30%, rgba(107,107,107,0.15) 0%, transparent 55%), #0a0a0c' },
  { id: 'install', label: 'Installa PWA', gradient: 'radial-gradient(ellipse at 50% 30%, rgba(107,107,107,0.12) 0%, transparent 60%)' },
  { id: 'app-bg', label: 'bg-app-bg', color: '#0a0a0c' },
  { id: 'admin-card', label: 'Admin card', gradient: 'linear-gradient(110deg, rgb(82, 82, 82), rgb(55, 65, 81))' },
  { id: 'kiosk-btn', label: 'Kiosk button', gradient: 'linear-gradient(135deg, rgb(107, 107, 107), rgb(55, 65, 81))' },
  { id: 'mobile-home', label: 'MobileHome card', gradient: 'linear-gradient(120deg, #9c9c9c, #ffffff, #525252)' },
  { id: 'table-header', label: 'Tabella header', gradient: 'linear-gradient(135deg, #525252, #374151)' },
  { id: 'table-green', label: 'Riga approvata', gradient: 'linear-gradient(90deg, #e8f4e8, #f0faf0)' },
  { id: 'surface-glass', label: 'surface-glass', css: 'rgba(5,14,60,0.45)' },
  { id: 'popover-solid', label: 'bg-popover-solid', color: 'rgb(21,40,72)' },
  { id: 'grid-bg', label: 'Griglia turni', color: '#0a1628' },
  { id: 'row-bg', label: 'Riga dispari', color: '#0d1b2a' },
];

const LOGOS = [
  { id: 'logosvg-full', label: 'FlowLogoSvg — full', render: () => <FlowLogoSvg variant="full" color="orange" style={{ maxWidth: 300 }} /> },
  { id: 'logosvg-icon', label: 'FlowLogoSvg — icon-only', render: () => <FlowLogoSvg variant="icon-only" color="orange" style={{ width: '5rem', height: '5rem' }} /> },
  { id: 'logosvg-header', label: 'FlowLogoSvg — header', render: () => <FlowLogoSvg variant="header" color="orange" style={{ maxWidth: 200 }} /> },
  { id: 'waveicon', label: 'FlowWaveIcon (120px)', render: () => <FlowWaveIcon size={80} radius={22} /> },
  { id: 'waveicon-small', label: 'FlowWaveIcon (30px)', render: () => <FlowWaveIcon size={30} /> },
  { id: 'neonicon', label: 'FlowNeonIcon (80px)', render: () => <FlowNeonIcon size={80} /> },
  { id: 'png-final', label: 'icon-flow-final.png', render: () => <img src="/icon-flow-final.png" alt="FLOW" className="w-20 h-20 rounded-2xl object-cover" /> },
  { id: 'png-192', label: 'icon-192.png (PWA)', render: () => <img src="/icon-192.png" alt="FLOW 192" className="w-20 h-20 object-contain" /> },
  { id: 'png-512', label: 'icon-512.png (PWA)', render: () => <img src="/icon-512.png" alt="FLOW 512" className="w-20 h-20 object-contain" /> },
];

export default function DesignAuditPreview() {
  const [selectedLogos, setSelectedLogos] = useState<Set<string>>(new Set(LOGOS.map(l => l.id)));
  const [selectedBgs, setSelectedBgs] = useState<Set<string>>(new Set(BG_OVERLAYS.map(b => b.id)));

  const toggleLogo = (id: string) => {
    setSelectedLogos(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleBg = (id: string) => {
    setSelectedBgs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const removedLogos = LOGOS.filter(l => !selectedLogos.has(l.id));
  const removedBgs = BG_OVERLAYS.filter(b => !selectedBgs.has(b.id));

  return (
    <main className="min-h-screen bg-app-bg text-white p-6 font-sans">
      <h1 className="text-xl font-black mb-2">Audit Design — Loghi & Sfondi</h1>
      <p className="text-sm text-white/50 mb-6">Seleziona gli elementi da mantenere. Quelli non selezionati verranno rimossi.</p>

      {/* Loghi */}
      <h2 className="text-base font-bold text-white/80 mb-3 uppercase tracking-wider">Loghi / Icone</h2>
      <div className="fluid-grid fluid-grid-3 gap-4 mb-8">
        {LOGOS.map(logo => {
          const kept = selectedLogos.has(logo.id);
          return (
            <div
              key={logo.id}
              onClick={() => toggleLogo(logo.id)}
              className={`rounded-xl border-2 p-4 flex flex-col items-center justify-center gap-3 min-h-[8.75rem] cursor-pointer transition-colors ${
 kept ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-rose-500/30 bg-rose-500/5 opacity-50'
 }`}
            >
              <div className="flex items-center justify-center min-h-[3.75rem]">
                {logo.render()}
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2 ${kept ? 'bg-emerald-400 border-emerald-400' : 'border-rose-400'}`}>
                  {kept && <div className="w-full h-full flex items-center justify-center text-[0.5rem] text-white font-bold">✓</div>}
                </div>
                <span className={`text-[0.6875rem] font-bold ${kept ? 'text-white' : 'text-rose-300'}`}>{logo.label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sfondi */}
      <h2 className="text-base font-bold text-white/80 mb-3 uppercase tracking-wider">Sfondi / Gradient</h2>
      <div className="fluid-grid fluid-grid-3 gap-4 mb-8">
        {BG_OVERLAYS.map(bg => {
          const kept = selectedBgs.has(bg.id);
          return (
            <div
              key={bg.id}
              onClick={() => toggleBg(bg.id)}
              className={`rounded-xl border-2 p-4 flex flex-col items-center justify-center gap-2 min-h-[7.5rem] cursor-pointer transition-colors ${
 kept ? 'border-emerald-500/50' : 'border-rose-500/30 opacity-50'
 }`}
              style={{
                background: bg.gradient || bg.color || bg.css,
                ...(bg.css ? { background: bg.css } : {}),
              }}
            >
              <span className={`text-[0.6875rem] font-bold text-center px-2 py-1 rounded ${
 bg.id === 'table-green' ? 'text-gray-800' : 'text-white'
 }`}>{bg.label}</span>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-2">
        <h3 className="text-sm font-bold text-white/80">Riepilogo</h3>
        <p className="text-xs text-white/50">
          <span className="text-emerald-400 font-bold">{selectedLogos.size}</span> loghi mantenuti / <span className="text-rose-400 font-bold">{removedLogos.length}</span> da rimuovere
        </p>
        {removedLogos.length > 0 && (
          <p className="text-xs text-rose-300">Loghi da rimuovere: {removedLogos.map(l => l.label).join(', ')}</p>
        )}
        <p className="text-xs text-white/50">
          <span className="text-emerald-400 font-bold">{selectedBgs.size}</span> sfondi mantenuti / <span className="text-rose-400 font-bold">{removedBgs.length}</span> da rimuovere
        </p>
        {removedBgs.length > 0 && (
          <p className="text-xs text-rose-300">Sfondi da rimuovere: {removedBgs.map(b => b.label).join(', ')}</p>
        )}
      </div>
    </main>
  );
}
