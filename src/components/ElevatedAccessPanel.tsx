/**
 * ElevatedAccessPanel — toggle per utente "Accesso scheda Admin".
 * Quando attivo, mostra la scheda Admin nella navigazione del profilo senza PIN aggiuntivo.
 */

import { useState, useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { translateRole } from '../utils/roles';
export default function ElevatedAccessPanel() {
  const { users, updateUser, effectiveLanguage } = useAppUser();

  const eligibleUsers = useMemo(
    () => users.filter((u) => u.status === 'active' && u.role !== 'admin'),
    [users]
  );

  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const handleToggle = async (userId: string, currentlyEnabled: boolean) => {
    setSaving((prev) => ({ ...prev, [userId]: true }));
    try {
      await updateUser(userId, {
        elevated_role: currentlyEnabled ? null : 'manager',
        secondary_pin: null,
      });
    } finally {
      setSaving((prev) => ({ ...prev, [userId]: false }));
    }
  };

  if (eligibleUsers.length === 0) {
    return (
      <p className="text-xs text-white/55 px-1">
        Nessun dipendente non-admin attivo da configurare.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-white/55 leading-relaxed mb-3">
        Quando attivato, il dipendente vede la scheda <strong className="text-white/80">Admin</strong> nella navigazione e può accedere all'area gestionale senza PIN aggiuntivo.
      </p>

      {eligibleUsers.map((u) => {
        const enabled = !!u.elevated_role;
        const isSaving = saving[u.id] ?? false;

        return (
          <div
            key={u.id}
            className="flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors"
            style={{
              background: enabled ? 'rgba(51,102,204,0.12)' : 'rgba(255, 255, 255, 0.16)',
              borderColor: enabled ? 'rgba(51,102,204,0.35)' : 'rgba(255,255,255,0.12)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className={`h-4 w-4 shrink-0 ${enabled ? 'text-accent' : 'text-white/30'}`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate" title={u.first_name}>{u.first_name} {u.last_name ?? ''}
                </p>
                <p className="text-[11px] text-white/60 uppercase tracking-wide">
                  {translateRole(u.role, effectiveLanguage)}
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isSaving}
              onClick={() => handleToggle(u.id, enabled)}
              role="switch"
              aria-checked={enabled}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
 enabled ? 'bg-accent' : 'bg-white/20'
 }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${
 enabled ? 'translate-x-5' : 'translate-x-0'
 }`}
              />
            </button>
          </div>
        );
      })}
    </div>
  );
}
