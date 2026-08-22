import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, ChevronRight, Trash2, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppUser, useAppOverlay } from '../context/AppContext';
import { useProfileLeaveGuardRef } from '../context/ProfileLeaveGuardContext';
import { useT } from '../hooks/useT';
import { getDeviceUiLanguage, persistStoredUiLanguage, readStoredUiLanguage, clearStoredUiLanguage } from '../utils/uiLanguagePreference';
import { NotificationPermissionButton } from './NotificationPermissionButton';
import SavedToast from './ui/SavedToast';

import { isManagementRole, isAdminOnly } from '../utils/permissions';
import { translateRole } from '../utils/roles';
import { translateDepartmentValue } from '../utils/departmentLabels';
import { isFeatureEnabled } from '../utils/enabledFeatures';
import { PinPadModal } from './ui/PinPadModal';
// import { hasPinUnlockCredential, authenticatePinUnlockCredential } from '../utils/pinUnlockWebAuthn'; // unused
import { ProfileFormSelf, type ProfileFormSelfData } from './UserProfile';
import BackgroundGallery from './BackgroundGallery';
import ProfilePhotoSourceSheet from './profile/ProfilePhotoSourceSheet';
import ProfilePhotoCropperModal from './profile/ProfilePhotoCropperModal';
import {
  readProfileAvatarFromStorage,
  writeProfileAvatarToStorage,
  readAvatarFocus,
  writeAvatarFocus,
  avatarFocusToObjectPosition,
  uploadAvatarToStorage,
  deleteAvatarFromStorage,
  type AvatarFocus,
} from '../utils/profilePhotoStorage';
import { splitPhoneForForm, joinPhone, DEFAULT_PHONE_PREFIX } from '../utils/phonePrefix';
import type { Language } from '../types';
function serializeProfileForm(fd: ProfileFormSelfData): string {
  return JSON.stringify({
    email: fd.email.trim(),
    phone: joinPhone(fd.phone_prefix, fd.phone_national),
    language: fd.language,
    pin: fd.pin.replace(/\D/g, '').slice(0, 4),
  });
}

/**
 * Scheda bottom bar “Profilo”: hero + form impostazioni sempre visibile + riga Esci.
 */
export default function ProfileNavTabPanel({
  onLogout,
  onGoToSettings,
}: {
  onLogout: () => void;
  onGoToSettings?: () => void;
}) {
  const { currentUser, effectiveLanguage, setLanguage, clearLanguage, updateUser, isSessionElevated } = useAppUser();
  const { showError } = useAppOverlay();
  const profileLeaveGuardRef = useProfileLeaveGuardRef();
  const navigate = useNavigate();
  const t = useT();
  const tv = t as Record<string, string>;
  const [formData, setFormData] = useState<ProfileFormSelfData>({
    first_name: '',
    last_name: '',
    email: '',
    phone_prefix: DEFAULT_PHONE_PREFIX,
    phone_national: '',
    language: 'it',
    department: undefined,
    role: 'server',
    pin: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [_toastField, _setToastField] = useState<string | null>(null);
  const [toastAnchor, setToastAnchor] = useState<HTMLElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  // PIN gate per Area Gestionale
  const [showMgmtPinPad, setShowMgmtPinPad] = useState(false);
  const [mgmtPin, setMgmtPin] = useState('');
  const [mgmtPinError, setMgmtPinError] = useState('');

  const openMgmtArea = useCallback(() => {
    if (onGoToSettings) onGoToSettings();
    else navigate('/admin');
  }, [onGoToSettings, navigate]);

  const handleMgmtPinConfirm = useCallback(() => {
    if (!currentUser) return;
    if (mgmtPin === currentUser.pin) {
      setShowMgmtPinPad(false);
      setMgmtPin('');
      setMgmtPinError('');
      openMgmtArea();
    } else {
      setMgmtPinError('PIN non valido');
      setMgmtPin('');
      setTimeout(() => setMgmtPinError(''), 2000);
    }
  }, [currentUser, mgmtPin, openMgmtArea]);

  // Auto-submit a 4 cifre
  useEffect(() => {
    if (mgmtPin.length === 4) handleMgmtPinConfirm();
  }, [mgmtPin, handleMgmtPinConfirm]);
  const [photoSourceSheetOpen, setPhotoSourceSheetOpen] = useState(false);
  const [cropObjectUrl, setCropObjectUrl] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const filesInputRef = useRef<HTMLInputElement>(null);
  /** Telefono/tablet touch: un solo input senza `capture` → foglio nativo unico (evita doppia scelta). */
  const nativePickInputRef = useRef<HTMLInputElement>(null);
  const [preferNativePhotoPicker, setPreferNativePhotoPicker] = useState(false);
  const [avatarFocus, setAvatarFocus] = useState<AvatarFocus>({ x: 50, y: 50 });
  const focusRef = useRef<AvatarFocus>({ x: 50, y: 50 });
  const savedSnapshotRef = useRef('');
  const photoMenuWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser) return;
    const ph = splitPhoneForForm(currentUser.phone);
    const fd: ProfileFormSelfData = {
      first_name: currentUser.first_name ?? '',
      last_name: currentUser.last_name ?? '',
      email: currentUser.email ?? '',
      phone_prefix: ph.prefix,
      phone_national: ph.national,
      language: (currentUser.language ?? 'it') as Language,
      department: currentUser.department,
      role: currentUser.role,
      pin: currentUser.pin ?? '',
    };
    setFormData(fd);
    savedSnapshotRef.current = serializeProfileForm(fd);
  }, [currentUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- solo cambio utente (id), non ogni sync di currentUser

  // ── Auto-salvataggio con debounce ──────────────────────────────────────
  const mountedRef = useRef(false);
  const lastChangedRef = useRef<string | null>(null);
  const handleFieldChange = useCallback((field: string) => {
    lastChangedRef.current = field;
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (!currentUser) return;

    const field = lastChangedRef.current;
    const timer = setTimeout(() => {
      if (serializeProfileForm(formData) !== savedSnapshotRef.current) {
        void performProfileSave().then(() => {
          _setToastField(field);
          // Aggancia il fumetto al campo modificato
          if (field) {
            const el = document.querySelector(`[data-save-field="${field}"]`);
            if (el) {
              const input = el.querySelector('input, select') ?? el;
              setToastAnchor(input as HTMLElement);
            }
          }
          setShowSavedToast(true);
        });
      }
    }, 1200);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  // Tieni formData.language in sync con effectiveLanguage: evita che il salvataggio del profilo
  // sovrascriva nel DB la lingua scelta dall'accordion "Tema & Lingua"
  useEffect(() => {
    if (!effectiveLanguage) return;
    setFormData((prev) => {
      if (prev.language === effectiveLanguage) return prev;
      const next = { ...prev, language: effectiveLanguage as import('../types').Language };
      savedSnapshotRef.current = serializeProfileForm(next);
      return next;
    });
  }, [effectiveLanguage]);

  useEffect(() => {
    if (!currentUser?.id) return;
    const f = readAvatarFocus(currentUser.id);
    focusRef.current = f;
    setAvatarFocus(f);
  }, [currentUser?.id]);

  const resolvedAvatar =
    currentUser &&
    (readProfileAvatarFromStorage(currentUser.id) ?? currentUser.avatar_url ?? null);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const apply = () => setPreferNativePhotoPicker(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (preferNativePhotoPicker) setPhotoSourceSheetOpen(false);
  }, [preferNativePhotoPicker]);

  useEffect(() => {
    if (!photoSourceSheetOpen || preferNativePhotoPicker) return;
    const onDown = (e: PointerEvent) => {
      if (photoMenuWrapRef.current?.contains(e.target as Node)) return;
      setPhotoSourceSheetOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [photoSourceSheetOpen, preferNativePhotoPicker]);

  const onPickedFileForCrop = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file || !file.type.startsWith('image/')) {
        showError?.(tv.profile_tab_photo_error ?? 'Impossibile elaborare la foto.');
        return;
      }
      const url = URL.createObjectURL(file);
      setCropObjectUrl(url);
    },
    [showError, tv.profile_tab_photo_error]
  );

  const closePhotoCropper = useCallback(() => {
    setCropObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const persistCroppedAvatar = useCallback(
    async (dataUrl: string) => {
      if (!currentUser?.id) return;
      setPhotoBusy(true);
      try {
        // 1. Salva in localStorage per accesso immediato
        writeProfileAvatarToStorage(currentUser.id, dataUrl);
        const center: AvatarFocus = { x: 50, y: 50 };
        writeAvatarFocus(currentUser.id, center);
        focusRef.current = center;
        setAvatarFocus(center);

        // 2. Carica su Supabase Storage → ottieni URL pubblico permanente
        const publicUrl = await uploadAvatarToStorage(currentUser.id, dataUrl);

        // 3. Salva nel database: URL pubblico se upload riuscito, altrimenti data URL
        const avatarValue = publicUrl ?? dataUrl;
        const ok = await updateUser(currentUser.id, { avatar_url: avatarValue });
        if (!ok) throw new Error('avatar save failed');
      } finally {
        setPhotoBusy(false);
      }
    },
    [currentUser?.id, updateUser]
  );

  const onCropConfirm = useCallback(
    async (dataUrl: string) => {
      setCropObjectUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      try {
        await persistCroppedAvatar(dataUrl);
      } catch {
        showError?.(tv.profile_tab_photo_error ?? 'Impossibile elaborare la foto.');
      }
    },
    [persistCroppedAvatar, showError, tv.profile_tab_photo_error]
  );

  const handleRemovePhoto = useCallback(async () => {
    if (!currentUser?.id) return;
    setPhotoBusy(true);
    try {
      writeProfileAvatarToStorage(currentUser.id, null);
      await deleteAvatarFromStorage(currentUser.id);
      const ok = await updateUser(currentUser.id, { avatar_url: null });
      if (!ok) throw new Error('avatar removal failed');
    } catch {
      showError?.(tv.profile_tab_photo_error ?? 'Errore durante la rimozione della foto.');
    } finally {
      setPhotoBusy(false);
    }
  }, [currentUser?.id, updateUser, showError, tv]);

  const performProfileSave = useCallback(async () => {
    if (!currentUser) return;
    const pinDigits = formData.pin.replace(/\D/g, '').slice(0, 4);
    setIsSaving(true);
    try {
      const ok = await updateUser(currentUser.id, {
        email: formData.email,
        phone: joinPhone(formData.phone_prefix, formData.phone_national),
        language: formData.language,
        ...(pinDigits.length === 4 ? { pin: pinDigits } : {}),
      });
      if (!ok) throw new Error('save failed');
      savedSnapshotRef.current = serializeProfileForm(formData);
    } finally {
      setIsSaving(false);
    }
  }, [currentUser, formData, updateUser]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await performProfileSave();
    } catch {
      /* updateUser notifica */
    }
  };

  const isDirty = useCallback(
    () => serializeProfileForm(formData) !== savedSnapshotRef.current,
    [formData]
  );

  const _isProfileReadOnly = currentUser ? isFeatureEnabled(currentUser, 'profile_readonly') : false;

  useEffect(() => {
    const ref = profileLeaveGuardRef;
    if (!ref) return;
    ref.current = {
      isDirty,
      save: performProfileSave,
    };
    return () => {
      ref.current = null;
    };
  }, [profileLeaveGuardRef, isDirty, performProfileSave]);

  const [expanded, setExpanded] = useState<'settings' | 'notif' | 'lang' | null>(null);
  const toggleSection = (s: typeof expanded) => setExpanded(prev => prev === s ? null : s);

  const [savedLang, setSavedLang] = useState<import('../types').Language | null>(() => readStoredUiLanguage());
  const [pendingLang, setPendingLang] = useState<import('../types').Language | null>(() => readStoredUiLanguage());
  const [_langSaving, _setLangSaving] = useState(false);
  const [_langSaved, _setLangSaved] = useState(false);

  // ── Auto-salvataggio lingua con debounce ──────────────────────────────
  const langMountedRef = useRef(false);
  useEffect(() => {
    if (!langMountedRef.current) {
      langMountedRef.current = true;
      return;
    }
    if (pendingLang === savedLang) return;
    const timer = setTimeout(() => {
      if (pendingLang !== savedLang) {
        if (pendingLang === null) {
          clearLanguage();
          clearStoredUiLanguage();
        } else {
          persistStoredUiLanguage(pendingLang);
          setLanguage(pendingLang);
        }
        setSavedLang(pendingLang);
        _setLangSaved(true);
        setTimeout(() => _setLangSaved(false), 2000);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [pendingLang, savedLang]);

  // Fumetto "Salvato" anche per l'autosalvataggio della lingua (sotto il gruppo lingua)
  useEffect(() => {
    if (!_langSaved) return;
    const el = document.querySelector('[data-save-field="lang"]');
    if (el) {
      setToastAnchor(el as HTMLElement);
    }
    setShowSavedToast(true);
  }, [_langSaved]);

  if (!currentUser) return null;

  const fullName = [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ').trim()
    || currentUser.email?.split('@')[0] || 'Utente';
  const displayName = fullName;
  const profileInitial = (displayName.charAt(0) || '?').toUpperCase();
  const _isMgmt = isManagementRole(currentUser.role);
  const hasAdminAccess = isAdminOnly(currentUser) || isSessionElevated || !!currentUser.elevated_role;

  const changePhoto = tv.profile_tab_change_photo ?? 'Cambia foto';
  const logoutConfirm = tv.profile_logout_confirm ?? "Uscire dall'account?";

  const sourceLabels = {
    sheetAria: tv.profile_photo_source_sheet_aria ?? '',
    gallery: tv.profile_photo_source_gallery ?? 'Galleria',
    camera: tv.profile_photo_source_camera ?? 'Fotocamera',
    files: tv.profile_photo_source_files ?? 'File',
    remove: tv.profile_tab_remove_photo ?? 'Rimuovi foto',
  };
  const cropLabels = {
    close: tv.profile_photo_crop_close ?? 'Chiudi',
    title: tv.profile_photo_crop_title ?? 'Modifica foto',
    crop: tv.profile_photo_crop_action ?? 'Ritaglia',
    hint: tv.profile_photo_crop_hint ?? '',
  };

  const _confirmLogout = () => {
    if (window.confirm(logoutConfirm)) onLogout();
  };

  const _hasLangChanges = pendingLang !== savedLang;

  const _saveLang = async () => {
    _setLangSaving(true);
    if (pendingLang !== savedLang) {
      if (pendingLang === null) {
        clearLanguage();
      } else {
        setLanguage(pendingLang);
      }
      setSavedLang(pendingLang);
    }
    _setLangSaving(false);
    _setLangSaved(true);
    setTimeout(() => _setLangSaved(false), 2000);
  };

  const _menuRowBase = 'w-full flex items-center justify-between rounded-xl px-4 py-3.5 transition-colors  border border-neutral-500 hover:bg-white/10';
  const chevronCls = 'text-white/60';
  const rowLabelCls = 'text-[0.8125rem] font-semibold text-white';

  const deptLabel = currentUser.department
    ? translateDepartmentValue(currentUser.department, effectiveLanguage)
    : '';
  const roleDisplay = translateRole(currentUser.role ?? '', effectiveLanguage);

  return (
    <div className="w-full max-w-lg mx-auto pb-content font-sans h-[calc(var(--app-vh,100dvh)-var(--app-sticky-header-offset,5rem)-3rem)] md:h-[calc(var(--app-vh,100dvh)-var(--app-sticky-header-offset,5rem))] overflow-y-auto overscroll-contain scrollbar-none">
      {/* Photo crop modal */}
      {cropObjectUrl ? (
        <ProfilePhotoCropperModal
          imageSrc={cropObjectUrl}
          labels={cropLabels}
          onClose={closePhotoCropper}
          onConfirm={onCropConfirm}
        />
      ) : null}

      {/* Hidden file inputs */}
      <input ref={galleryInputRef} type="file" accept="image/*" className="sr-only" aria-hidden onChange={onPickedFileForCrop} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="user" className="sr-only" aria-hidden onChange={onPickedFileForCrop} />
      <input ref={filesInputRef} type="file" accept="image/*,.jpg,.jpeg,.png,.webp,.heic,.heif" className="sr-only" aria-hidden onChange={onPickedFileForCrop} />
      <input ref={nativePickInputRef} type="file" accept="image/*" className="sr-only" aria-hidden onChange={onPickedFileForCrop} />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>

        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <div
          className="flex flex-col items-center gap-3 pt-8 pb-6 px-5"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.12)' }}
        >
          {/* Avatar + photo button */}
          <div className="relative inline-block" ref={photoMenuWrapRef}>
            <div
              className="flex h-[9rem] w-[9rem] items-center justify-center overflow-hidden rounded-3xl border-2 border-slate-100 bg-brand-electric/6 text-[3.5rem] font-bold text-brand-electric"
            >
              {resolvedAvatar ? (
                <img
                  src={resolvedAvatar}
                  alt=""
                  role="presentation"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: avatarFocusToObjectPosition(avatarFocus) }}
                  draggable={false}
                />
              ) : profileInitial}
            </div>

            {/* Fotocamera — centrata in basso */}
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                if (preferNativePhotoPicker) { nativePickInputRef.current?.click(); return; }
                setPhotoSourceSheetOpen((o) => !o);
              }}
              disabled={photoBusy}
              aria-expanded={preferNativePhotoPicker ? undefined : photoSourceSheetOpen}
              aria-haspopup={preferNativePhotoPicker ? undefined : 'menu'}
              aria-controls={preferNativePhotoPicker ? undefined : 'profile-photo-source-menu'}
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white shadow-md outline-none transition-colors hover:opacity-90 disabled:opacity-50 touch-manipulation focus-visible:ring-2 focus-visible:ring-white/50"
              style={{ background: 'rgba(255,255,255,0.12)' }}
              title={changePhoto}
              aria-label={changePhoto}
            >
              <Camera className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            </button>

            {/* Cestino — angolo in alto a destra, visibile solo se c'è una foto */}
            {resolvedAvatar && (
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); void handleRemovePhoto(); }}
                disabled={photoBusy}
                className="absolute -top-2 -right-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white shadow-md outline-none transition-colors hover:opacity-90 disabled:opacity-50 touch-manipulation focus-visible:ring-2 focus-visible:ring-white/50"
                style={{ background: 'rgba(220,38,38,0.90)' }}
                title={tv.profile_tab_remove_photo_confirm ?? 'Rimuovi foto'}
                aria-label={tv.profile_tab_remove_photo_confirm ?? 'Rimuovi foto'}
              >
                <Trash2 className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              </button>
            )}

            {!preferNativePhotoPicker && (
              <ProfilePhotoSourceSheet
                open={photoSourceSheetOpen}
                labels={sourceLabels}
                onClose={() => setPhotoSourceSheetOpen(false)}
                onPickGallery={() => galleryInputRef.current?.click()}
                onPickCamera={() => cameraInputRef.current?.click()}
                onPickFiles={() => filesInputRef.current?.click()}
                onRemovePhoto={resolvedAvatar ? handleRemovePhoto : undefined}
                menuId="profile-photo-source-menu"
              />
            )}
          </div>

          {/* Name */}
          <div className="flex flex-col items-center gap-0.5">
            <h2 className="text-base font-bold tracking-tight" style={{ color: '#ffffff' }}>
              {displayName}
            </h2>
          </div>

          {/* Status badges: ruolo + reparto + attivo */}
          <div className="flex gap-2">
            {[roleDisplay, deptLabel !== roleDisplay ? deptLabel : null, t.status_active].filter(Boolean).map((label, i) => (
              <span
                key={i}
                className="text-[0.6875rem] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider"
                style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.20)', color: 'rgba(255,255,255,0.65)' }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Management area shortcut rimosso */}

        {/* ── Menu accordion ────────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 px-4 pt-4 pb-8">

          {/* Impostazioni profilo */}
          <div className="rounded-xl overflow-hidden border border-neutral-500">
            <button type="button" className="w-full flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-white/10 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]" onClick={() => toggleSection('settings')}>
              <span className={rowLabelCls}>{tv.profile_tab_group_settings ?? 'Impostazioni profilo'}</span>
              <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${chevronCls} ${expanded === 'settings' ? 'rotate-90' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {expanded === 'settings' && (
                <motion.div key="settings-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }} className="overflow-hidden">
                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.12)' }} className="px-4 py-4 text-white">
                    <ProfileFormSelf
                      formData={formData}
                      setFormData={setFormData}
                      onSave={handleProfileSave}
                      isSaving={isSaving}
                      readOnly={false}
                      appearance="light"
                      nameLocked={true}
                      departmentLocked={true}
                      roleLocked={true}
                      showSaveButton={false}
                      onFieldChange={handleFieldChange}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Notifiche */}
          <div className="rounded-xl overflow-hidden border border-neutral-500">
            <button type="button" className="w-full flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-white/10 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]" onClick={() => toggleSection('notif')}>
              <span className={rowLabelCls}>{tv.profile_notifications ?? 'Notifiche'}</span>
              <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${chevronCls} ${expanded === 'notif' ? 'rotate-90' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {expanded === 'notif' && (
                <motion.div key="notif-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }} className="overflow-hidden">
                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.12)' }} className="px-4 py-3">
                    <NotificationPermissionButton userId={currentUser?.id} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Lingua — bordo esterno solo quando il pannello è aperto (include il contenuto) */}
          <div className={expanded === 'lang' ? 'rounded-xl overflow-hidden border border-neutral-500' : 'overflow-hidden'}>
            <button type="button" className="w-full flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-white/10 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]" onClick={() => toggleSection('lang')}>
              <span className={rowLabelCls}>{t.language ?? 'Lingua'}</span>
              <ChevronRight className={`w-4 h-4 transition-transform duration-200 ${chevronCls} ${expanded === 'lang' ? 'rotate-90' : ''}`} />
            </button>
            <AnimatePresence initial={false}>
              {expanded === 'lang' && (
                <motion.div key="lang-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }} className="overflow-hidden">
                  <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.12)' }} className="px-4 py-3 space-y-3" data-save-field="lang">
                    <div className="flex gap-1 rounded-xl p-1 border border-neutral-500" style={{ background: 'transparent' }}>
                      {(() => {
                        const deviceLang = getDeviceUiLanguage();
                        const isAuto = pendingLang === null;
                        return (
                          <button
                            type="button"
                            onClick={() => setPendingLang(null)}
                            className="relative flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors"
                            style={isAuto ? { background: 'rgba(255,255,255,0.12)', color: '#ffffff', outline: 'none' } : { color: 'rgba(255,255,255,0.55)', outline: 'none' }}
                            title={`Auto → ${deviceLang.toUpperCase()}`}
                          >
                            Auto
                          </button>
                        );
                      })()}
                      {(['it', 'en', 'es', 'fr'] as const).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setPendingLang(l)}
                          className="relative flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-colors"
                          style={pendingLang === l ? { background: 'rgba(255,255,255,0.12)', color: '#ffffff', outline: 'none' } : { color: 'rgba(255,255,255,0.55)', outline: 'none' }}
                        >
                          {l.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sfondo */}
          <div className="rounded-xl overflow-hidden border border-neutral-500">
            <BackgroundGallery userId={currentUser?.id} variant="profile-row" />
          </div>

          {/* Pannello Admin — visibile solo per ruoli autorizzati */}
          {(hasAdminAccess || _isMgmt) && (
            <button
              type="button"
              onClick={() => setShowMgmtPinPad(true)}
              className="w-full md:hidden flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-colors"
              style={{
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.35)',
              }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(99, 102, 241, 0.30)' }}
              >
                <Settings2 className="w-4 h-4" style={{ color: '#a5b4fc' }} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.92)' }}>
                  {tv.settings_panel_title ?? 'Pannello Impostazioni'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(165, 180, 252, 0.75)' }}>
                  {tv.settings_panel_subtitle ?? 'Area gestionale riservata'}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'rgba(165, 180, 252, 0.60)' }} />
            </button>
          )}

        </div>
      </motion.div>

      {/* PIN pad modal Area Gestionale */}
      <AnimatePresence>
        {showMgmtPinPad && currentUser && (
          <PinPadModal
            title="Area Gestionale"
            subtitle="Inserisci il tuo PIN per accedere"
            pinLabel="PIN"
            pin={mgmtPin}
            onPinChange={(v) => { setMgmtPinError(''); setMgmtPin(v); }}
            error={mgmtPinError}
            onConfirm={handleMgmtPinConfirm}
            onCancel={() => { setShowMgmtPinPad(false); setMgmtPin(''); setMgmtPinError(''); }}
            confirmLabel="Accedi"
            userId={currentUser.id}
            userDisplayName={`${currentUser.first_name} ${currentUser.last_name ?? ''}`.trim()}
            userEmail={currentUser.email ?? ''}
            onBiometricSuccess={() => {
              setShowMgmtPinPad(false);
              setMgmtPin('');
              openMgmtArea();
            }}
          />
        )}
      </AnimatePresence>

      {/* Toast "Salvato" — fumetto verde agganciato al campo modificato, segue lo scroll */}
      <SavedToast
        open={showSavedToast}
        anchor={toastAnchor}
        message={t.wst_sync_saved ?? 'Salvato'}
        onClose={() => setShowSavedToast(false)}
      />
    </div>
  );
}
