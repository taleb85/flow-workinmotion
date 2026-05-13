/**
 * Unificazione layout profilo e traduzioni.
 * - ProfileFormSelf: "Il mio profilo" (dipendente) — Email, Telefono, Reparto, Lingua.
 * - ProfileFormAdmin: modale modifica dipendente (manager) — Nome, Cognome, Email, Ruolo, PIN, Reparto, Stato account, Permessi.
 * Layout: Reparto sopra Stato account (in admin). Tutte le etichette via t('chiave') per IT/EN/ES.
 * Persistenza: updateUser -> database.users.update (tabella `users`), campo `department` incluso.
 */
import { useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Lock, Shield, CheckCircle, AlertTriangle, Euro, Link2, Copy } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { getTranslations, formatTrans } from '../utils/translations';
import { buildProfiloAccessLink } from '../config/appPaths';
import type { User as UserType, Language, Department } from '../types';
import { isPurelyManagementRole, isAdminOnly } from '../utils/permissions';
import { getDepartments } from '../utils/departments';
import StaffOperationalPermissionsEditor from './StaffOperationalPermissionsEditor';

const LANGS: Language[] = ['it', 'en', 'es', 'fr'];

export type ProfileFormSelfData = {
  email: string;
  phone: string;
  language: Language;
  department?: Department;
};

/** Form "Il mio profilo" (dipendente): Email, Telefono, Reparto, Lingua. Se readOnly (non management) nessuna modifica possibile. */
const inputClassLight =
  'w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition-colors';
const labelClassLight = 'block text-xs font-medium text-slate-600 mb-1.5';

export function ProfileFormSelf({
  formData,
  setFormData,
  onSave,
  isSaving,
  readOnly = false,
  appearance = 'dark',
}: {
  formData: ProfileFormSelfData;
  setFormData: React.Dispatch<React.SetStateAction<ProfileFormSelfData>>;
  onSave: (e: React.FormEvent) => void;
  isSaving: boolean;
  readOnly?: boolean;
  /** `light` = allineato al resto dell’app (card bianche / accent) */
  appearance?: 'dark' | 'light';
}) {
  const { effectiveLanguage } = useApp();
  const t = getTranslations(effectiveLanguage);

  const inputClassDark = 'w-full px-3 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white text-sm focus:border-white/20 focus:outline-none focus:ring-0';
  const inputClass = appearance === 'light' ? inputClassLight : inputClassDark;
  const inputClassDisabled = inputClass + (appearance === 'light' ? ' opacity-70 cursor-not-allowed bg-slate-50' : ' opacity-70 cursor-not-allowed');
  const labelClass = appearance === 'light' ? labelClassLight : 'block text-xs font-medium text-white/80 mb-1.5';

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!readOnly) onSave(e); }} className="space-y-4">
      <div>
        <label className={labelClass}>{t.email}</label>
        <input
          type="text"
          value={formData.email}
          onChange={(e) => !readOnly && setFormData((prev) => ({ ...prev, email: e.target.value }))}
          readOnly={readOnly}
          className={readOnly ? inputClassDisabled : inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>{t.phone}</label>
        <input
          type="text"
          value={formData.phone}
          onChange={(e) => !readOnly && setFormData((prev) => ({ ...prev, phone: e.target.value }))}
          readOnly={readOnly}
          className={readOnly ? inputClassDisabled : inputClass}
        />
      </div>
      <div>
        <label className={labelClass}>{t.department_label}</label>
        <select
          value={formData.department ?? ''}
          onChange={(e) => !readOnly && setFormData((prev) => ({ ...prev, department: e.target.value || undefined }))}
          disabled={readOnly}
          className={readOnly ? inputClassDisabled : inputClass}
        >
          <option value="">— {t.department_none} —</option>
          {getDepartments().map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>{t.language}</label>
        {appearance === 'light' ? (
          <div className={`flex gap-1 rounded-xl bg-slate-100 border border-slate-200 p-1 ${readOnly ? 'pointer-events-none opacity-70' : ''}`}>
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => !readOnly && setFormData((prev) => ({ ...prev, language: l }))}
                disabled={readOnly}
                className="relative flex-1 min-w-0 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors font-sans"
              >
                {formData.language === l ? (
                  <span className="relative z-10 text-white">{l.toUpperCase()}</span>
                ) : (
                  <span className="text-slate-500 hover:text-slate-800 transition-colors">{l.toUpperCase()}</span>
                )}
                {formData.language === l && (
                  <motion.span
                    layoutId="lang-pill-bg-light"
                    className="absolute inset-0 bg-accent rounded-lg z-0 shadow-sm"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className={`flex rounded-xl bg-black/30 border border-white/10 overflow-hidden ${readOnly ? 'pointer-events-none opacity-70' : ''}`}>
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => !readOnly && setFormData((prev) => ({ ...prev, language: l }))}
                disabled={readOnly}
                className="relative flex-1 min-w-[3rem] py-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-colors duration-200 font-sans"
              >
                {formData.language === l ? (
                  <span className="relative z-10 text-black">{l.toUpperCase()}</span>
                ) : (
                  <span className="text-white/70 hover:text-white/90 transition-colors">{l.toUpperCase()}</span>
                )}
                {formData.language === l && (
                  <motion.span
                    layoutId="lang-pill-bg-dark"
                    className="absolute inset-0.5 bg-white rounded-xl z-0"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      {!readOnly && (
        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-3 rounded-xl bg-accent text-white font-bold text-sm shadow-md shadow-accent/25 hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSaving ? t.saving : t.save}
        </button>
      )}
    </form>
  );
}

export type ProfileFormAdminData = {
  first_name: string;
  last_name: string;
  email: string;
  role: UserType['role'];
  pin: string;
  status: UserType['status'];
  department?: Department;
  /** Stringa per input numerico €/h */
  hourly_rate_eur: string;
};

const inputClass =
  'w-full px-3 py-2 rounded-xl text-sm bg-white border border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20 focus:outline-none transition-colors font-sans';
const labelClass = 'block text-xs font-semibold text-slate-700 mb-1 font-sans';

/** Form modale "Modifica dipendente" (manager): layout con Reparto sopra Stato account. Tutte le etichette tradotte. */
export function ProfileFormAdmin({
  user,
  currentUser,
  formData,
  setFormData,
  onSubmit,
  onClose,
  isSaving,
  variant = 'edit',
  activePinConflictMessage = null,
}: {
  user: UserType;
  currentUser: UserType;
  formData: ProfileFormAdminData;
  setFormData: React.Dispatch<React.SetStateAction<ProfileFormAdminData>>;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
  isSaving: boolean;
  /** `create`: nessun blocco link invito (serve `id` dopo salvataggio). */
  variant?: 'edit' | 'create';
  /** Se valorizzato: stesso PIN di un altro dipendente attivo (blocco salvataggio + hint sotto il campo). */
  activePinConflictMessage?: string | null;
}) {
  const { effectiveLanguage, showSuccess, showError } = useApp();
  const t = getTranslations(effectiveLanguage);
  const tv = t as Record<string, string>;
  const layoutRole = variant === 'create' ? formData.role : user.role;
  const isSuspended =
    variant === 'edit' && (user.status === 'suspended' || user.status === 'inactive');
  const invitePinComplete = formData.pin.replace(/\D/g, '').length === 4;

  const accessLink = useMemo(
    () =>
      buildProfiloAccessLink(user.id, undefined, {
        displayName: `${formData.first_name} ${formData.last_name ?? ''}`.trim(),
        pin: formData.pin,
      }),
    [user.id, formData.first_name, formData.last_name, formData.pin]
  );

  const handleCopyAccessLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accessLink);
      showSuccess?.(tv.admin_employee_access_link_copied ?? 'Link copiato.');
    } catch {
      showError?.(tv.copy_failed ?? 'Copia non riuscita. Seleziona il link manualmente.');
    }
  }, [accessLink, showSuccess, showError, tv.admin_employee_access_link_copied, tv.copy_failed]);

  return (
    <>
      {isSuspended && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-700">
          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium font-sans">{t.employee_suspended_warning}</p>
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              <User className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
              {t.first_name}
            </label>
            <input
              type="text"
              value={formData.first_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, first_name: e.target.value.toUpperCase() }))}
              className={inputClass}
              placeholder={t.placeholder_first_name}
              required
            />
          </div>
          <div>
            <label className={labelClass}>
              <User className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
              {t.last_name_optional}
            </label>
            <input
              type="text"
              value={formData.last_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, last_name: e.target.value.toUpperCase() }))}
              className={inputClass}
              placeholder={t.placeholder_last_name}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>
            <Mail className="w-4 h-4 inline mr-2 text-slate-400" />
            {t.email}
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            className={inputClass}
            placeholder={t.email_placeholder}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              <Shield className="w-4 h-4 inline mr-2 text-slate-400" />
              {t.role}
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value as UserType['role'] }))}
              className={inputClass}
              disabled={isPurelyManagementRole(user.role) && !isAdminOnly(currentUser)}
            >
              <option value="server">{t.waiter_role}</option>
              <option value="cook">{t.cook_role}</option>
              <option value="bartender">{t.bartender_role}</option>
              <option value="dishwasher">{t.dishwasher_role}</option>
              <option value="capo">{t.capo_role}</option>
              <option value="assistant_manager">{t.assistant_manager_role}</option>
              {(currentUser.role === 'admin' || currentUser.role === 'manager') && (
                <option value="manager">{t.manager_role}</option>
              )}
              {isAdminOnly(currentUser) && <option value="admin">{t.admin_role}</option>}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              <Lock className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
              {t.pin_4_digits}
            </label>
            <input
              type="text"
              value={formData.pin}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                setFormData((prev) => ({ ...prev, pin: value }));
              }}
              className={`${inputClass} ${activePinConflictMessage ? 'border-red-400 ring-1 ring-red-200' : ''}`}
              placeholder="1234"
              maxLength={4}
              aria-invalid={activePinConflictMessage ? true : undefined}
            />
            {activePinConflictMessage ? (
              <p className="mt-1.5 text-[11px] font-medium text-red-600 font-sans leading-snug">
                {activePinConflictMessage}
              </p>
            ) : null}
          </div>
        </div>

        {/* Reparto sopra Stato account (nascosto solo per Admin — profilo puramente gestionale) */}
        {!isPurelyManagementRole(layoutRole) && (
          <div>
            <label className={labelClass}>{t.department_label}</label>
            <select
              value={formData.department ?? ''}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  department: e.target.value || undefined,
                }))
              }
              className={inputClass}
            >
              <option value="">— {t.department_none} —</option>
              {getDepartments().map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>
            <Euro className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
            {(t as { profile_hourly_rate_label?: string }).profile_hourly_rate_label ?? 'Tariffa oraria (€/h)'}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={formData.hourly_rate_eur}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.,]/g, '');
              setFormData((prev) => ({ ...prev, hourly_rate_eur: v }));
            }}
            className={inputClass}
            placeholder={(t as { profile_hourly_rate_placeholder?: string }).profile_hourly_rate_placeholder ?? 'es. 12,50'}
          />
          <p className="text-[11px] text-slate-500 mt-1 font-sans">
            {(t as { profile_hourly_rate_hint?: string }).profile_hourly_rate_hint ?? ''}
          </p>
        </div>

        <div>
          <label className={labelClass}>
            <CheckCircle className="w-3.5 h-3.5 inline mr-1.5 text-slate-400" />
            {t.account_status}
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as UserType['status'] }))}
            className={inputClass}
          >
            <option value="active">{t.status_active}</option>
            <option value="suspended">{t.status_suspended}</option>
            <option value="inactive">{t.status_inactive}</option>
          </select>
        </div>

        {variant === 'edit' && !isPurelyManagementRole(layoutRole) && (
          <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
            <StaffOperationalPermissionsEditor user={user} currentUser={currentUser} />
          </div>
        )}

        {variant === 'edit' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3 space-y-2">
            <button
              type="button"
              onClick={() => void handleCopyAccessLink()}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 transition-colors font-sans"
            >
              <Copy className="w-4 h-4 shrink-0 text-slate-500" aria-hidden />
              {tv.admin_employee_access_link_btn ?? 'Copia link accesso'}
            </button>
            <p className="text-[11px] text-slate-600 leading-snug font-sans flex gap-1.5">
              <Link2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" aria-hidden />
              <span>{tv.admin_employee_access_link_hint ?? ''}</span>
            </p>
            <p className="text-[11px] font-medium text-slate-800 font-sans pl-5">
              {formatTrans(tv.admin_employee_access_link_preview ?? 'Nome al login: {name}', {
                name: `${formData.first_name} ${formData.last_name ?? ''}`.trim() || '—',
              })}
            </p>
            {formData.status !== 'active' && (
              <p className="text-[11px] text-amber-800 font-medium font-sans pl-5">
                {tv.admin_employee_access_link_inactive ?? ''}
              </p>
            )}
            {!invitePinComplete && (
              <p className="text-[11px] text-amber-800 font-medium font-sans pl-5">
                {tv.admin_employee_access_link_pin_incomplete ?? ''}
              </p>
            )}
            <p className="text-[10px] text-slate-400 font-mono break-all pl-5">{accessLink}</p>
          </div>
        )}

        <p className="text-[11px] text-slate-500 mt-2">
          {(t as { permissions_in_settings?: string }).permissions_in_settings ??
            'Funzionalità, moduli e visibilità schede: Impostazioni → Team → Permessi sul dipendente (template ruoli + anteprima).'}
        </p>

        <div className="flex space-x-2 pt-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl text-sm bg-white border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors font-sans"
          >
            {t.cancel}
          </button>
          <button
            type="submit"
            disabled={isSaving || Boolean(activePinConflictMessage)}
            className="flex-1 px-4 py-2 rounded-xl text-sm bg-accent text-white font-semibold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-sans"
          >
            {isSaving ? t.saving : variant === 'create' ? t.create_employee_submit : t.save_changes}
          </button>
        </div>
      </form>
    </>
  );
}
