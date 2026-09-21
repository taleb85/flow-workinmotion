/**
 * ElevatedAccessPanel — toggle per utente "Accesso scheda Admin".
 * Quando attivo, mostra la scheda Admin nella navigazione del profilo senza PIN aggiuntivo.
 */

import { useState, useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { translateRole } from '../utils/roles';
import ToggleSwitch from './ui/toggle-switch-glass';
export default function ElevatedAccessPanel() {
  const { users, updateUser, effectiveLanguage } = useAppUser();
  const t = useT();

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
        {t.elevated_none_configurable}
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[0.6875rem] text-white/55 leading-relaxed mb-3">
        {t.elevated_desc}
      </p>

      {eligibleUsers.map((u) => {
        const enabled = !!u.elevated_role;
        const isSaving = saving[u.id] ?? false;

        return (
          <div
            key={u.id}
            className="flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors"
            style={{
              background: 'transparent',
              borderColor: enabled ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)',
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className={`h-4 w-4 shrink-0 ${enabled ? 'text-accent' : 'text-white/30'}`} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate" title={u.first_name}>{u.first_name} {u.last_name ?? ''}
                </p>
                <p className="text-[0.6875rem] uppercase tracking-wide elevated-role-label" style={{ color: '#ffffff' }}>
                  {translateRole(u.role, effectiveLanguage)}
                </p>
              </div>
            </div>

            <ToggleSwitch
              isActive={enabled}
              onChange={() => handleToggle(u.id, enabled)}
              disabled={isSaving}
              size="sm"
              darkMode
              className="shrink-0"
            />
          </div>
        );
      })}
    </div>
  );
}
