/**
 * Scheda Impostazioni — attiva/disattiva le funzioni disponibili per i profili.
 * Solo Admin. Le modifiche sono immediate e salvate in DB o localStorage.
 * NB: la UI effettiva delle impostazioni vive in SettingsPage; questo componente
 * è mantenuto solo per compatibilità con route legacy.
 */
import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAppUser } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { isAdminOnly } from '../utils/permissions';
import { translateRole } from '../utils/roles';

type ImpostazioniPageProps = {
  onOpenProfilesTab?: () => void;
};

export default function ImpostazioniPage({ onOpenProfilesTab: _onOpenProfilesTab }: ImpostazioniPageProps) {
  const { currentUser, effectiveLanguage, logout, isSessionElevated } = useAppUser();
  const t = useT();
  const [_howOpen, _setHowOpen] = useState(false);

  const hasFullAccess = useMemo(
    () => currentUser ? isAdminOnly(currentUser) || isSessionElevated || !!currentUser.elevated_role : false,
    [currentUser, isSessionElevated]
  );
  if (!currentUser) return null;
  if (!hasFullAccess) {
    return (
      <div className="pb-content pt-6 w-full app-horizontal-pad font-sans">
        <div className="rounded-xl border border-neutral-500 p-4 rounded-xl mb-6">
          <h2 className="text-lg font-bold mb-1">{t.settings_current_user || 'Utente attuale'}</h2>
          <div className="flex items-center gap-3">
            <span className="font-semibold text-accent">{currentUser.first_name} {currentUser.last_name}</span>
            <span className="text-xs bg-white/15 rounded px-2 py-0.5 ml-2 text-white/70">{translateRole(currentUser.role, effectiveLanguage as 'it' | 'en' | 'es' | 'fr')}</span>
          </div>
          <button
            className="mt-3 px-3 py-1.5 rounded-lg border border-red-500/50 bg-red-500/20 text-[#fca5a5] font-semibold hover:bg-red-500/30 transition-colors active:bg-red-500/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            onClick={logout}
          >
            {t.logout || 'Logout'}
          </button>
        </div>
        <p className="text-white/70 text-sm">{t.no_access_settings}</p>
      </div>
    );
  }

  return (
    <div className="pb-content pt-6 w-full app-horizontal-pad font-sans">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        className="w-full"
      >
        {/* Divider */}
        <div className="h-px bg-white/10 rounded my-6" />

      </motion.div>
    </div>
  );
}
