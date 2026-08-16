import { useMemo, useState, useCallback, useRef } from 'react';
import type { User } from '../types';
import { useAppUser } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { formatTrans } from '../utils/translations';
import { canUserEdit, isAdminOnly } from '../utils/permissions';
import { isUserPermissionEffective, toggledPermissionDbValue } from '../utils/staffPermissionDefaults';
import { buildSettingsPermissionRows, type SettingsOperationalPermKey } from '../utils/settingsPermissionRows';
import AdminRow from './ui/AdminRow';
import { PERMISSION_SUMMARY_LIST_CLASS } from './RoleFeatureSectionsBlock';

type Props = {
  user: User;
  currentUser: User;
};

/**
 * Permessi operativi (DB) modificabili per singolo dipendente.
 * I flag `adminOnly` sono editabili solo da Admin; gli altri anche da Manager/Assistente/Capo.
 */
export default function StaffOperationalPermissionsEditor({ user, currentUser }: Props) {
  const { updateUser } = useAppUser();
  const { showSuccess, showError } = useAppOverlay();
  const t = useT();
  const tv = t as Record<string, string>;
  const rows = useMemo(() => buildSettingsPermissionRows(t), [t]);
  const [busyKey, setBusyKey] = useState<SettingsOperationalPermKey | null>(null);
  const inFlightRef = useRef<SettingsOperationalPermKey | null>(null);

  const canEditAny = canUserEdit(currentUser);

  const canTogglePerm = useCallback(
    (adminOnly?: boolean) => canEditAny && (!adminOnly || isAdminOnly(currentUser)),
    [canEditAny, currentUser]
  );

  const handleToggle = useCallback(
    async (key: SettingsOperationalPermKey, adminOnly?: boolean) => {
      if (!canTogglePerm(adminOnly) || inFlightRef.current) return;
      inFlightRef.current = key;
      setBusyKey(key);
      try {
        const next = toggledPermissionDbValue(user, key);
        await updateUser(user.id, { [key]: next });
        showSuccess?.(tv.settings_operational_perm_saved ?? 'Permesso aggiornato.');
      } catch (e) {
        console.error('[StaffOperationalPermissionsEditor]', e);
        showError?.(tv.save_error_retry ?? 'Errore durante il salvataggio.');
      } finally {
        inFlightRef.current = null;
        setBusyKey(null);
      }
    },
    [user, updateUser, showSuccess, showError, canTogglePerm, tv]
  );

  if (!canEditAny) return null;

  return (
    <div>
      <p className="ui-section-title mb-2 text-white/50">
        {formatTrans(t.settings_operational_perms_heading, { name: user.first_name ?? '' })}
      </p>
      <p className="text-[0.6875rem] text-white/60 mb-2 leading-snug">{t.settings_operational_perms_editable_hint}</p>
      <div className={PERMISSION_SUMMARY_LIST_CLASS}>
        {rows.map((perm) => {
          const enabled = isUserPermissionEffective(user, perm.key);
          const interactive = canTogglePerm(perm.adminOnly);
          return (
            <AdminRow
              key={perm.key}
              className="!py-2.5 !px-4"
              label={
                <span
                  className={
                    enabled ? 'text-white/90' : 'text-white/60'
                  }
                >
                  {perm.label}
                </span>
              }
              description={perm.description}
              badge={
                perm.adminOnly ? (
                  <span className="text-[0.6875rem] font-bold text-accent border border-accent/30 bg-accent/8 rounded-xl px-1.5 py-0.5 uppercase tracking-wider">
                    {t.settings_badge_admin}
                  </span>
                ) : undefined
              }
              action={
                interactive ? (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={perm.label}
                    disabled={busyKey !== null}
                    onClick={() => void handleToggle(perm.key, perm.adminOnly)}
                    className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-all duration-200 ${
 enabled ? 'bg-accent' : ''
 } ${busyKey !== null ? 'cursor-wait opacity-60' : ''}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full toggle-knob transition-all duration-200 ease-in-out ${
 enabled ? 'translate-x-5' : 'translate-x-0'
 }`}
                    />
                  </button>
                ) : (
                  <span
                    className={`shrink-0 text-[0.6875rem] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
 enabled ? 'bg-accent text-white shadow-sm' : 'bg-slate-100 text-white/60'
 }`}
                  >
                    {enabled ? t.role_template_yes : t.role_template_no}
                  </span>
                )
              }
            />
          );
        })}
      </div>
    </div>
  );
}
