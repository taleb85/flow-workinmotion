import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { translateRole } from '../utils/roles';
import { getEnabledFeatures } from '../utils/enabledFeatures';
import RoleFeatureSectionsBlock from './RoleFeatureSectionsBlock';

const ACCENT = '#2D5A27';

export default function GestioneProfiliPage() {
  const { users, currentUser, effectiveLanguage } = useApp();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const displayUsers = users
    .filter((u) => u.status === 'active' || u.status === 'suspended' || u.status === 'inactive')
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  return (
    <div className="pb-content pt-6 w-full px-4 sm:px-6 font-sans min-h-full">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${ACCENT}20` }}>
            <Shield className="w-5 h-5" style={{ color: ACCENT }} />
          </div>
          <div>
            <h1 className="text-slate-800 text-xl font-bold leading-tight">Gestione Profili</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              Anteprima permessi (ruolo + template). Ruolo singolo: Impostazioni → team. Template{' '}
              <strong>Manager·Assistant</strong> / <strong>Capo</strong> / <strong>Staff</strong> e moduli scheda Admin globali: tab{' '}
              <strong>Permessi ruoli</strong> (solo Admin).
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
            <h2 className="text-xs font-bold text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <Users className="w-4 h-4" />
              Dipendenti
            </h2>
          </div>

          <div className="divide-y divide-slate-100">
            {displayUsers.map((user) => {
              const isExpanded = expandedUserId === user.id;
              const features = getEnabledFeatures(user);

              return (
                <div key={user.id} className="">
                  <button
                    type="button"
                    onClick={() => setExpandedUserId(isExpanded ? null : user.id)}
                    className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-slate-50/80 transition-colors"
                  >
                    <div>
                      <span className="font-semibold text-slate-800 block">
                        {user.first_name} {user.last_name}
                      </span>
                      <span className="text-xs text-slate-500 uppercase tracking-wider">
                        {translateRole(user.role, currentUser?.language)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase">Permessi</span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-0 bg-slate-50/50 border-t border-slate-100 space-y-3">
                          {user.role === 'admin' && (
                            <p className="text-xs text-slate-600 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                              <strong>Amministratore:</strong> tutti i permessi sono sempre attivi (ruolo fisso).
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500 px-1">
                            Ruolo: <strong>{translateRole(user.role, currentUser?.language)}</strong> — stessi permessi per tutti con questo ruolo.
                          </p>
                          <div className="rounded-xl bg-white border border-slate-200 p-4">
                            <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">Permessi e schede</h3>
                            <RoleFeatureSectionsBlock mode="badges" features={features} language={effectiveLanguage} />
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
