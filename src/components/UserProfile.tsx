/**
 * Unificazione layout profilo e traduzioni.
 * - ProfileFormSelf: "Il mio profilo" — griglia Nome/Cognome, Email, Ruolo/PIN, Reparto (+ Telefono, Lingua). Tema: header app.
 * - ProfileFormAdmin: modale modifica dipendente (manager) — Nome, Cognome, Email, Ruolo, PIN, Reparto, Stato account, Permessi.
 * Layout: Reparto sopra Stato account (in admin). Tutte le etichette via t('chiave') per IT/EN/ES.
 * Persistenza: updateUser -> database.users.update (tabella `users`), campo `department` incluso.
 */
import { useMemo, useCallback, useState, useRef } from 'react';
import { User, Mail, Lock, Shield, CheckCircle, AlertTriangle, Euro, Copy, Share2, Phone, Calendar } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useAppConfig } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { getTranslations, formatTrans } from '../utils/translations';
import { buildProfiloAccessLink } from '../config/appPaths';
import { PUBLIC_APP_ORIGIN } from '../config/publicAppUrl';
import type { User as UserType, Language, Department } from '../types';
import { isPurelyManagementRole, isAdminOnly, isManagementRole, canUserEdit } from '../utils/permissions';
import {
  TIMESHEET_GRID_PLANNED_ONLY_KEY,
  TIMESHEET_GRID_SHIFT_TIMES_FEATURE_KEY,
  getTimesheetGridPrivacyMode,
} from '../utils/timesheetGridPrivacy';
import { translateRole } from '../utils/roles';
import { getDepartments } from '../utils/departments';
import { formatDepartmentDisplayForProfile, translateDepartmentValue } from '../utils/departmentLabels';
import { getRoleScopeHint } from '../utils/roleScopeHint';
import { DEFAULT_PHONE_PREFIX, PHONE_PREFIX_OPTIONS } from '../utils/phonePrefix';
import StaffOperationalPermissionsEditor from './StaffOperationalPermissionsEditor';
import { OPERATIONAL_STAFF_ROLES_FOR_DELEGATE } from '../utils/operationalStaffRoles';
const _LANGS: Language[] = ['it', 'en', 'es', 'fr'];

export type ProfileFormSelfData = {
  first_name: string;
  last_name: string;
  email: string;
  phone_prefix: string;
  phone_national: string;
  language: Language;
  department?: Department;
  role: UserType['role'];
  pin: string;
};

/** Form "Il mio profilo": Email, Telefono, Reparto, Lingua. Con `readOnly` i campi sono disabilitati (es. anteprima). */
const inputClassLight =
  'w-full px-3 py-2.5 rounded-xl bg-white/8 border border-white/18 text-white text-base focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition-colors placeholder:text-white/35';
const labelClassLight = 'block text-xs font-medium text-white/65 mb-1.5 whitespace-nowrap';

function roleSelectValue(role: UserType['role']): string {
  if (role === 'chef') return 'cook';
  if (role === 'waiter' || role === 'server') return 'server';
  return role;
}

function translatedRoleLabel(role: UserType['role'], t: ReturnType<typeof getTranslations>): string {
  const r = role === 'chef' ? 'cook' : role;
  const map: Record<string, string> = {
    server: t.waiter_role,
    waiter: t.waiter_role,
    cook: t.cook_role,
    chef: t.cook_role,
    bartender: t.bartender_role,
    dishwasher: t.dishwasher_role,
    assistant_manager: t.assistant_manager_role,
    manager: t.manager_role,
    admin: t.admin_role,
  };
  return map[r] ?? r;
}

export function ProfileFormSelf({
  formData,
  setFormData,
  onSave,
  isSaving,
  readOnly = false,
  appearance = 'dark',
  /** Se true: nome e cognome sono sola lettura (modificabili solo dal pannello admin). */
  nameLocked = false,
  /** Se true: mostra solo il reparto assegnato (sola lettura), senza cambiare opzioni. */
  departmentLocked = false,
  /** Se true: solo il ruolo è bloccato (es. tab Profilo); PIN e resto restano modificabili se !readOnly. */
  roleLocked = false,
}: {
  formData: ProfileFormSelfData;
  setFormData: React.Dispatch<React.SetStateAction<ProfileFormSelfData>>;
  onSave: (e: React.FormEvent) => void;
  isSaving: boolean;
  readOnly?: boolean;
  /** `light` = allineato al resto dell'app (card bianche / accent) */
  appearance?: 'dark' | 'light';
  nameLocked?: boolean;
  departmentLocked?: boolean;
  roleLocked?: boolean;
}) {
  const { effectiveLanguage, setLanguage, currentUser } = useAppUser();
  const { departmentsRevision } = useAppConfig();
  void departmentsRevision;
  const t = useT();

  const _applyLanguage = (l: Language) => {
    if (readOnly) return;
    setFormData((prev) => ({ ...prev, language: l }));
    setLanguage(l);
  };

  const inputClassDark = 'w-full px-3 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white text-sm focus:text-base focus:border-white/20 focus:outline-none focus:ring-0';
  const inputClass = appearance === 'light' ? inputClassLight : inputClassDark;
  const inputClassDisabled =
    inputClass +
    (appearance === 'light'
      ? ' opacity-60 cursor-not-allowed bg-white/5'
      : ' opacity-70 cursor-not-allowed');
  const labelClass = appearance === 'light' ? labelClassLight : 'block text-xs font-medium text-white/80 mb-1.5 whitespace-nowrap';
  const iconMuted = appearance === 'light' ? 'text-white/55' : 'text-white/40';

  const canEditName = !readOnly && !nameLocked;
  const canEditRole = !readOnly && !roleLocked;
  const canEditDepartment = !readOnly && !departmentLocked;
  const pinShownValue = readOnly ? (formData.pin.replace(/\D/g, '').length > 0 ? '••••' : '') : formData.pin;

  const phoneExample = useMemo(() => {
    const option = PHONE_PREFIX_OPTIONS.find(o => o.value === (formData.phone_prefix || DEFAULT_PHONE_PREFIX));
    return option?.example ?? '333 1234567';
  }, [formData.phone_prefix]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!readOnly) onSave(e); }} className="space-y-4">
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            <User className={`w-3.5 h-3.5 inline mr-1.5 ${iconMuted}`} aria-hidden />
            {t.first_name}
          </label>
          <input
            type="text"
            value={formData.first_name}
            onChange={(e) => canEditName && setFormData((prev) => ({ ...prev, first_name: e.target.value.toUpperCase() }))}
            readOnly={!canEditName}
            className={!canEditName ? inputClassDisabled : inputClass}
            placeholder={t.placeholder_first_name}
            required={canEditName}
          />
        </div>
        <div>
          <label className={labelClass}>
            <User className={`w-3.5 h-3.5 inline mr-1.5 ${iconMuted}`} aria-hidden />
            {t.last_name_optional}
          </label>
          <input
            type="text"
            value={formData.last_name}
            onChange={(e) => canEditName && setFormData((prev) => ({ ...prev, last_name: e.target.value.toUpperCase() }))}
            readOnly={!canEditName}
            className={!canEditName ? inputClassDisabled : inputClass}
            placeholder={t.placeholder_last_name}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>
          <Mail className={`w-4 h-4 inline mr-2 ${iconMuted}`} aria-hidden />
          {t.email}
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => !readOnly && setFormData((prev) => ({ ...prev, email: e.target.value }))}
          readOnly={readOnly}
          className={readOnly ? inputClassDisabled : inputClass}
          placeholder={(t as { email_placeholder?: string }).email_placeholder}
        />
      </div>

      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            <Shield className={`w-4 h-4 inline mr-2 ${iconMuted}`} aria-hidden />
            {t.role}
          </label>
          {canEditRole ? (
            <select
              value={roleSelectValue(formData.role)}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, role: e.target.value as UserType['role'] }))
              }
              className={inputClass}
              disabled={isPurelyManagementRole(formData.role) && currentUser ? !isAdminOnly(currentUser) : false}
            >
              <option value="server">{t.waiter_role}</option>
              <option value="cook">{t.cook_role}</option>
              <option value="bartender">{t.bartender_role}</option>
              <option value="dishwasher">{t.dishwasher_role}</option>
              <option value="assistant_manager">{t.assistant_manager_role}</option>
              {(currentUser?.role === 'admin' || currentUser?.role === 'manager') && (
                <option value="manager">{t.manager_role}</option>
              )}
              {currentUser && isAdminOnly(currentUser) && <option value="admin">{t.admin_role}</option>}
            </select>
          ) : (
            <input
              type="text"
              readOnly
              value={translatedRoleLabel(formData.role, t)}
              className={inputClassDisabled}
              aria-readonly
            />
          )}
        </div>
        <div>
          <label className={labelClass}>
            <Lock className={`w-3.5 h-3.5 inline mr-1.5 ${iconMuted}`} aria-hidden />
            {t.pin_4_digits}
          </label>
          {!readOnly ? (
            <input
              type="text"
              inputMode="numeric"
              value={formData.pin}
              onChange={(e) => {
                const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                setFormData((prev) => ({ ...prev, pin: value }));
              }}
              className={inputClass}
              placeholder="1234"
              maxLength={4}
              required
              pattern="\d{4}"
              title={t.pin_4_digits}
            />
          ) : (
            <input
              type="text"
              readOnly
              value={pinShownValue}
              className={inputClassDisabled}
              aria-readonly
            />
          )}
        </div>
      </div>

      {(() => {
        const tv = t as Record<string, string>;
        const scope = getRoleScopeHint(formData.role, tv);
        if (!scope) return null;
        return (
          <div className="rounded-xl border border-neutral-500 bg-white/8 px-3 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-white/45 mb-1">
              {tv.profile_role_scope_label}
            </p>
            <p className="text-[11px] text-white/70 leading-snug">{scope}</p>
          </div>
        );
      })()}

      <div>
        <label className={labelClass}>{t.department_label}</label>
        {!canEditDepartment ? (
          <input
            type="text"
            readOnly
            value={formatDepartmentDisplayForProfile(formData.department, effectiveLanguage)}
            className={inputClassDisabled}
            aria-readonly
          />
        ) : (
          <select
            value={formData.department ?? ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, department: e.target.value || undefined }))}
            className={inputClass}
          >
            <option value="">— {t.department_none} —</option>
            {getDepartments().map((d) => (
              <option key={d.value} value={d.value}>
                {translateDepartmentValue(d.value, effectiveLanguage)}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 min-[400px]:grid-cols-[7.25rem_1fr] gap-3 min-[400px]:gap-4">
        <div className="min-w-0">
          <label className={labelClass}>{t.phone_prefix}</label>
          <select
            value={formData.phone_prefix || DEFAULT_PHONE_PREFIX}
            onChange={(e) =>
              !readOnly &&
              setFormData((prev) => ({ ...prev, phone_prefix: e.target.value }))
            }
            disabled={readOnly}
            className={readOnly ? inputClassDisabled : inputClass}
          >
            {PHONE_PREFIX_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label className={labelClass}>
            <Phone className={`w-4 h-4 inline mr-2 ${iconMuted}`} aria-hidden />
            {t.phone}
          </label>
          <input
            type="text"
            inputMode="tel"
            autoComplete="tel-national"
            value={formData.phone_national}
            onChange={(e) =>
              !readOnly &&
              setFormData((prev) => ({
                ...prev,
                phone_national: e.target.value.replace(/[^\d\s]/g, ''),
              }))
            }
            readOnly={readOnly}
            className={readOnly ? inputClassDisabled : inputClass}
            placeholder={phoneExample}
          />
        </div>
      </div>


      {!readOnly && (
        <button
          type="submit"
          disabled={isSaving}
          className="w-full py-3 rounded-xl bg-accent text-white font-bold text-sm shadow-md shadow-accent/25 hover:bg-accent-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
        >
          {isSaving ? t.saving : t.save}
        </button>
      )}
    </form>
  );
}

/** Solo admin: limita la griglia Presenze dell’utente ai soli orari pianificati pubblicati/confermati. */
export function AdminTimesheetGridPrivacyEditor({ user }: { user: UserType }) {
  const { updateUser } = useAppUser();
  const { showSuccess, showError } = useAppOverlay();
  const t = useT();
  const tv = t as Record<string, string>;
  const plannedOnly = getTimesheetGridPrivacyMode(user) === 'planned_only';
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const handleToggle = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const fe: Record<string, boolean> = { ...(user.enabled_features ?? {}) };
      if (plannedOnly) {
        delete fe[TIMESHEET_GRID_PLANNED_ONLY_KEY];
      } else {
        fe[TIMESHEET_GRID_PLANNED_ONLY_KEY] = true;
        delete fe[TIMESHEET_GRID_SHIFT_TIMES_FEATURE_KEY];
      }
      await updateUser(user.id, { enabled_features: fe });
      showSuccess?.(tv.settings_operational_perm_saved ?? 'Salvato.');
    } catch (e) {
      console.error('[AdminTimesheetGridPrivacyEditor]', e);
      showError?.(tv.save_error_retry ?? 'Errore durante il salvataggio.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-500 bg-white/8 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">
            {tv.admin_timesheet_grid_planned_only_label}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-white/55">
            {tv.admin_timesheet_grid_planned_only_hint}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={plannedOnly}
          aria-label={tv.admin_timesheet_grid_planned_only_label}
          disabled={busy}
          onClick={() => void handleToggle()}
          className={`relative flex h-7 w-12 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 ${
 plannedOnly ? 'bg-accent' : 'bg-slate-300'
 }`}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
 plannedOnly ? 'translate-x-5' : 'translate-x-0.5'
 }`}
          />
        </button>
      </div>
    </div>
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
  /** yyyy-MM-dd o stringa vuota */
  employment_start_date: string;
  employment_end_date: string;
};

const inputClass =
  'w-full px-3 py-2 rounded-xl text-base bg-white/8 border border-white/18 text-white placeholder:text-white/35 focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none transition-colors font-sans disabled:opacity-60';
const labelClass =
  'block text-xs font-semibold text-white/65 mb-1 font-sans';

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
  readOnly = false,
  operationalRolesOnly = false,
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
  /** Solo consultazione (Manager/Assistant: scheda team delegata). */
  readOnly?: boolean;
  /** Creazione dipendente da delegato: solo ruoli operativi sala/cucina/bar. */
  operationalRolesOnly?: boolean;
}) {
  const { effectiveLanguage, users, isSessionElevated } = useAppUser();
  const { departmentsRevision } = useAppConfig();
  const { showSuccess, showError } = useAppOverlay();
  void departmentsRevision;
  const t = useT();
  const tv = t as Record<string, string>;
  // Translations in the employee's own language (for share messages sent to them)
  const rawLang = (user as { language?: string }).language ?? effectiveLanguage;
  const employeeLang = (['it', 'en', 'es', 'fr'] as const).includes(rawLang as 'it' | 'en' | 'es' | 'fr')
    ? (rawLang as import('../types').Language)
    : effectiveLanguage;
  const _te = getTranslations(employeeLang) as Record<string, string>;
  const layoutRole = variant === 'create' ? formData.role : user.role;
  const isSuspended =
    variant === 'edit' && (user.status === 'suspended' || user.status === 'inactive');
  const invitePinComplete = formData.pin.replace(/\D/g, '').length === 4;

  // Link breve leggibile: /i/<slug-utente> sull’origine in produzione (VITE_PUBLIC_APP_ORIGIN, default Pages)
  // Option B: InviteRedirect risolve lo slug globalmente, trova il tenant e codifica
  // il tenantSlug nel token → redirige a /profilo?t=<token-con-tenantSlug>.
  // Non serve includere il tenantSlug nel link breve: è InviteRedirect a gestirlo.
  const accessLink = useMemo(
    () =>
      buildProfiloAccessLink(
        user.id,
        { pin: formData.pin, displayName: `${formData.first_name} ${formData.last_name ?? ''}`.trim() },
        PUBLIC_APP_ORIGIN
      ),
    [user.id, formData.pin, formData.first_name, formData.last_name]
  );

  const handleCopyAccessLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(accessLink);
      showSuccess?.(tv.admin_employee_access_link_copied ?? 'Link copiato.');
    } catch {
      showError?.(tv.copy_failed ?? 'Copia non riuscita. Seleziona il link manualmente.');
    }
  }, [accessLink, showSuccess, showError, tv.admin_employee_access_link_copied, tv.copy_failed]);

  /** Condivisione: link con URL separato per AirDrop + WhatsApp/SMS/Telegram. */
  const handleShareInviteSimple = useCallback(async () => {
    const name = `${formData.first_name} ${formData.last_name ?? ''}`.trim();
    const shareText = `Ciao ${name}! 👋\n\nApri questo link per accedere subito all'app FLOW.`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'FLOW — La tua app',
          text: shareText,
          url: accessLink, // URL separato → AirDrop, WhatsApp, Safari lo riconoscono come link
        });
      } catch (err) {
        if ((err as DOMException).name !== 'AbortError') {
          showError?.(tv.copy_failed ?? 'Condivisione non riuscita.');
        }
      }
    } else {
      const fullText = `${shareText}\n${accessLink}`;
      try {
        await navigator.clipboard.writeText(fullText);
        showSuccess?.(tv.admin_employee_access_link_copied ?? 'Link copiato. Incollalo in un messaggio per il dipendente.');
      } catch {
        showError?.(tv.copy_failed ?? 'Copia non riuscita.');
      }
    }
  }, [formData.first_name, formData.last_name, accessLink, showError, showSuccess, tv]);

  const roleSelectDisabled =
    readOnly || (isPurelyManagementRole(user.role) && !isAdminOnly(currentUser));
  const showEmploymentEndField =
    formData.status === 'suspended' || formData.status === 'inactive';

  return (
    <>
      {readOnly && (
        <p className="mb-4 rounded-xl border border-neutral-500 bg-white/8 px-3 py-2 text-[11px] text-white/70 font-sans">
          {(t as { settings_delegated_readonly_hint?: string }).settings_delegated_readonly_hint ??
            'Solo lettura. Per modifiche contatta un amministratore.'}
        </p>
      )}
      {isSuspended && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
          <p className="text-sm font-medium font-sans">{t.employee_suspended_warning}</p>
        </div>
      )}
      <form
        onSubmit={readOnly ? (e) => e.preventDefault() : onSubmit}
        className="space-y-6"
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              <User className="w-3.5 h-3.5 inline mr-1.5 text-white/45" />
              {t.first_name}
            </label>
            <input
              type="text"
              value={formData.first_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, first_name: e.target.value.toUpperCase() }))}
              className={inputClass}
              placeholder={t.placeholder_first_name}
              required={!readOnly}
              disabled={readOnly}
            />
          </div>
          <div>
            <label className={labelClass}>
              <User className="w-3.5 h-3.5 inline mr-1.5 text-white/45" />
              {t.last_name_optional}
            </label>
            <input
              type="text"
              value={formData.last_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, last_name: e.target.value.toUpperCase() }))}
              className={inputClass}
              placeholder={t.placeholder_last_name}
              disabled={readOnly}
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>
            <Mail className="w-4 h-4 inline mr-2 text-white/45" />
            {t.email}
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            className={inputClass}
            placeholder={t.email_placeholder}
            disabled={readOnly}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>
              <Shield className="w-4 h-4 inline mr-2 text-white/45" />
              {t.role}
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value as UserType['role'] }))}
              className={inputClass}
              disabled={roleSelectDisabled}
            >
              {operationalRolesOnly
                ? OPERATIONAL_STAFF_ROLES_FOR_DELEGATE.map((r) => (
                    <option key={r} value={r}>
                      {translateRole(r, effectiveLanguage)}
                    </option>
                  ))
                : (
                <>
                  <option value="server">{t.waiter_role}</option>
                  <option value="cook">{t.cook_role}</option>
                  <option value="bartender">{t.bartender_role}</option>
                  <option value="dishwasher">{t.dishwasher_role}</option>
                  <option value="assistant_manager">{t.assistant_manager_role}</option>
                  {(currentUser.role === 'admin' || currentUser.role === 'manager' || currentUser.role === 'assistant_manager' || isSessionElevated || !!currentUser.elevated_role) && (
                    <option value="manager">{t.manager_role}</option>
                  )}
                  {isAdminOnly(currentUser) && <option value="admin">{t.admin_role}</option>}
                </>
                  )}
            </select>
          </div>
          <div>
            <label className={labelClass}>
              <Lock className="w-3.5 h-3.5 inline mr-1.5 text-white/45" />
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
              disabled={readOnly}
            />
            {activePinConflictMessage && !readOnly ? (
              <p className="mt-1.5 text-[11px] font-medium text-red-600 font-sans leading-snug">
                {activePinConflictMessage}
              </p>
            ) : null}
          </div>
        </div>

        {(() => {
          const tv = t as Record<string, string>;
          const scope = getRoleScopeHint(formData.role, tv);
          if (!scope) return null;
          return (
            <div className="rounded-xl border border-neutral-500 bg-white/8 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/45 mb-1">
                {tv.profile_role_scope_label}
              </p>
              <p className="text-[11px] text-white/70 leading-snug">{scope}</p>
            </div>
          );
        })()}

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
              disabled={readOnly}
            >
              <option value="">— {t.department_none} —</option>
              {getDepartments().map((d) => (
                <option key={d.value} value={d.value}>
                  {translateDepartmentValue(d.value, effectiveLanguage)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={labelClass}>
            <Euro className="w-3.5 h-3.5 inline mr-1.5 text-white/45" />
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
            disabled={readOnly}
          />
          <p className="text-[11px] text-white/55 mt-1 font-sans">
            {(t as { profile_hourly_rate_hint?: string }).profile_hourly_rate_hint ?? ''}
          </p>
        </div>

        <div>
          <label className={labelClass}>
            <CheckCircle className="w-3.5 h-3.5 inline mr-1.5 text-white/45" />
            {t.account_status}
          </label>
          <select
            value={formData.status}
            onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as UserType['status'] }))}
            className={inputClass}
            disabled={readOnly}
          >
            <option value="active">{t.status_active}</option>
            <option value="suspended">{t.status_suspended}</option>
            <option value="inactive">{t.status_inactive}</option>
          </select>
        </div>

        {variant === 'edit' && isAdminOnly(currentUser) && !readOnly && (
          <AdminTimesheetGridPrivacyEditor user={user} />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>
              <Calendar className="w-3.5 h-3.5 inline mr-1.5 text-white/45" />
              {tv.profile_employment_start_label}
            </label>
            <input
              type="date"
              value={formData.employment_start_date}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, employment_start_date: e.target.value }))
              }
              className={inputClass}
              disabled={readOnly}
              required={false}
              aria-required={false}
              placeholder="GG/MM/AAAA"
            />
            {tv.profile_employment_start_hint ? (
              <p className="text-[11px] text-white/55 mt-1 font-sans">
                {tv.profile_employment_start_hint}
              </p>
            ) : null}
          </div>
          {showEmploymentEndField ? (
            <div>
              <label className={labelClass}>
                <Calendar className="w-3.5 h-3.5 inline mr-1.5 text-white/45" />
                {tv.profile_employment_end_label}
              </label>
              <input
                type="date"
                value={formData.employment_end_date}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, employment_end_date: e.target.value }))
                }
                className={inputClass}
                disabled={readOnly}
                required={false}
                aria-required={false}
                placeholder="GG/MM/AAAA"
              />
              {tv.profile_employment_end_hint ? (
                <p className="text-[11px] text-white/55 mt-1 font-sans">
                  {tv.profile_employment_end_hint}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="hidden sm:block" aria-hidden />
          )}
        </div>

        {variant === 'edit' && !isPurelyManagementRole(layoutRole) && !readOnly && canUserEdit(currentUser) && (
          <div className="rounded-xl border border-neutral-500 bg-white/8 p-4">
            <StaffOperationalPermissionsEditor user={user} currentUser={currentUser} />
          </div>
        )}

        {variant === 'edit' && (!readOnly || isManagementRole(currentUser.role)) && (
          <div className="rounded-xl border border-neutral-500 bg-white/8 p-4 space-y-3">
            <p className="text-[12px] leading-relaxed text-white/70 font-sans text-center">
              {formatTrans(
                tv.admin_employee_access_link_hint_simple ??
                  'Invia il link a {name}. Aprendolo da telefono installerà l\'app in 30 secondi.',
                { name: formData.first_name || 'il dipendente' }
              )}
            </p>

            {/* Pulsante principale: invia via WhatsApp/SMS/Telegram */}
            <button
              type="button"
              onClick={handleShareInviteSimple}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold text-white font-sans transition-colors hover:opacity-95 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
              style={{ background: '#22c55e' }}
            >
              <Share2 className="w-5 h-5" aria-hidden />
              <span>Invia accesso</span>
            </button>

            {/* Pulsante secondario: solo copia link */}
            <button
              type="button"
              onClick={handleCopyAccessLink}
              className="flex w-full items-center justify-center gap-1.5 text-[11px] text-white/40 hover:text-white/60 transition-colors font-sans"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copia solo il link</span>
            </button>

            {!invitePinComplete && (
              <p className="text-[11px] text-amber-300/80 font-sans text-center">
                {tv.admin_employee_access_link_pin_incomplete ?? 'Aggiungi 4 cifre nel campo PIN per includerle nel link.'}
              </p>
            )}
          </div>
        )}

        {!readOnly && (
          <p className="text-[11px] text-white/55 mt-2">
            {(t as { permissions_in_settings?: string }).permissions_in_settings ??
              'Funzionalità, moduli e visibilità schede: Impostazioni → Team → Permessi sul dipendente (template ruoli + anteprima).'}
          </p>
        )}

        <div className="flex space-x-2 pt-3">
          <button
            type="button"
            onClick={onClose}
className="flex-1 rounded-xl border border-neutral-500 px-4 py-2 text-sm font-semibold text-white/80 surface-ghost-interactive font-sans transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
          >
            {readOnly ? t.close ?? t.cancel : t.cancel}
          </button>
          {!readOnly && (
            <button
              type="submit"
              disabled={isSaving || Boolean(activePinConflictMessage)}
              className="flex-1 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 font-sans active:bg-accent-hover/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
            >
              {isSaving ? t.saving : variant === 'create' ? t.create_employee_submit : t.save_changes}
            </button>
          )}
        </div>
      </form>
    </>
  );
}
