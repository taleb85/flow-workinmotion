import { useState, useRef, useEffect, useMemo } from 'react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, LogOut } from 'lucide-react';
import { useAppUser } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { ProfileFormSelf, type ProfileFormSelfData } from './UserProfile';
import { splitPhoneForForm, joinPhone, DEFAULT_PHONE_PREFIX } from '../utils/phonePrefix';
import type { Language } from '../types';
import { isManagementRole } from '../utils/permissions';
interface UserAvatarMenuProps {
  /** `pill` = sidebar/desktop; `profileRow` = riga lista; `toolbar` = icona affiancata a ora/notifiche; `modalOnly` = solo modale (trigger esterno). */
  variant?: 'pill' | 'profileRow' | 'toolbar' | 'modalOnly';
  /** Tipografia e padding ridotti (header PWA compatto) */
  dense?: boolean;
  /** Se impostato, il pulsante «Esci» appare nel modal profilo (non nell’header). */
  onLogout?: () => void;
  /** Incrementare (es. `setSeq((n) => n + 1)`) per aprire il modale da un altro componente. */
  openRequestId?: number;
}

export default function UserAvatarMenu({
  variant = 'pill',
  dense = false,
  onLogout,
  openRequestId,
}: UserAvatarMenuProps) {
  const { currentUser, updateUser } = useAppUser();
  const t = useT();
  const _isManagement = useMemo(
    () => currentUser ? isManagementRole(currentUser.role) : false,
    [currentUser?.role]
  );
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  const [showPortal, setShowPortal] = useState(false);
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
  const menuRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const lastOpenRequestRef = useRef(0);

  useEffect(() => {
    if (openRequestId === undefined || openRequestId <= 0) return;
    if (openRequestId === lastOpenRequestRef.current) return;
    lastOpenRequestRef.current = openRequestId;
    setIsOpen(true);
  }, [openRequestId]);

  const roleKeyMap: Record<string, string> = {
    admin: 'Admin', proprietario: 'Manager', manager: 'Manager', assistant_manager: 'Ass. Manager',
    waiter: 'Sala', server: 'Sala', cook: 'Cucina', chef: 'Cucina',
    bartender: 'Bar', dishwasher: 'Pulizie',
  };
  const displayName = (currentUser?.first_name?.trim() || currentUser?.email?.split('@')[0] || 'Utente').trim() || 'Utente';
  const displayRole = roleKeyMap[(currentUser?.role || '').toLowerCase().trim()] ?? currentUser?.role ?? '';
  /** Iniziale per avatar compatto (toolbar mobile): prima lettera nome o email. */
  const profileInitial = (displayName.charAt(0) || '?').toUpperCase();

  const currentLang = (currentUser?.language ?? 'it') as Language;

  useEffect(() => {
    if (isOpen) setShowPortal(true);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && currentUser) {
      const ph = splitPhoneForForm(currentUser.phone);
      setFormData({
        first_name: currentUser.first_name ?? '',
        last_name: currentUser.last_name ?? '',
        email: currentUser.email ?? '',
        phone_prefix: ph.prefix,
        phone_national: ph.national,
        language: currentLang,
        department: currentUser.department,
        role: currentUser.role,
        pin: currentUser.pin ?? '',
      });
    }
  }, [isOpen, currentUser, currentLang]);

  useEffect(() => {
    const handleClickOutside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (modalRef.current?.contains(target)) return;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('pointerdown', handleClickOutside);
    }
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [isOpen]);

  if (!currentUser) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUser) return;
    setIsSaving(true);
    try {
      const pinDigits = formData.pin.replace(/\D/g, '').slice(0, 4);
      await updateUser(currentUser.id, {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim() || undefined,
        email: formData.email,
        phone: joinPhone(formData.phone_prefix, formData.phone_national),
        language: formData.language,
        department: formData.department || undefined,
        role: formData.role,
        pin: pinDigits.length === 4 ? pinDigits : currentUser.pin,
      });
      setIsOpen(false);
    } catch (err) {
      console.error('Errore salvataggio profilo:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const titleHint = displayRole ? `${displayName} · ${displayRole}` : displayName;

  return (
    <div
      className={`relative ${variant === 'modalOnly' ? 'hidden' : variant === 'toolbar' ? 'shrink-0' : 'min-w-0'}`}
      ref={menuRef}
    >
      {variant === 'modalOnly' ? null : variant === 'toolbar' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          title={titleHint}
          aria-label={`${t.sidebar_profile}: ${titleHint}`}
          className="relative flex h-9 w-9 sm:h-10 sm:w-10 flex-col items-center justify-center gap-0.5 rounded-xl border border-neutral-500 px-1.5 text-white/80 surface-ghost-interactive hover:text-white touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-accent/25 active:text-white"
        >
          <span className="text-[14px] font-bold leading-none select-none" aria-hidden>
            {profileInitial}
          </span>
          {displayRole ? (
            <span
              className="w-full text-center text-[11px] font-semibold uppercase leading-tight text-white/60 truncate select-none"
              aria-hidden
             title={displayRole}>{displayRole}
            </span>
          ) : null}
        </button>
      ) : variant === 'profileRow' ? (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          title={titleHint}
          aria-label={titleHint}
          className={`flex items-center justify-end min-w-0 max-w-full min-h-[44px] hover:bg-slate-50 active:bg-slate-100/80 transition-colors touch-manipulation outline-none focus-visible:ring-2 focus-visible:ring-accent/25 focus-visible:ring-offset-1 ${
 dense ? 'gap-1 py-0.5 pl-1 rounded-lg' : 'gap-2 py-1 pl-2 rounded-xl'
 }`}
        >
          <div className="flex flex-col items-end min-w-0 text-right">
            <span
              className={`font-semibold text-white uppercase tracking-wide truncate max-w-[200px] ${
 dense ? 'text-xs' : 'text-sm'
 }`}
             title={displayName}>{displayName}
            </span>
            {displayRole ? (
              <span
                className={`font-medium text-white/60 truncate max-w-[200px] ${dense ? 'text-[11px]' : 'text-[11px]'}`}
               title={displayRole}>{displayRole}
              </span>
            ) : null}
          </div>
          <ChevronRight className={`text-white/50 shrink-0 ${dense ? 'w-4 h-4' : 'w-5 h-5'}`} strokeWidth={2} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-label={titleHint}
          className="flex items-center gap-1.5 sm:gap-2 min-w-0 rounded-xl border border-accent/30 bg-accent hover:bg-accent-hover transition-colors outline-none focus:outline-none focus:ring-2 focus:ring-accent/30 focus:ring-offset-2 min-h-[44px] touch-manipulation pl-3 pr-3"
        >
          <div className="flex flex-col items-start min-w-0 overflow-hidden text-left">
            <span className="text-xs font-semibold text-white truncate w-full uppercase tracking-wide leading-tight" title={displayName}>{displayName}
            </span>
            <span className="text-xs text-white/90 truncate w-full uppercase tracking-widest leading-tight hidden sm:block" title={displayRole}>{displayRole}
            </span>
          </div>
        </button>
      )}

      {showPortal &&
        createPortal(
          <AnimatePresence onExitComplete={() => setShowPortal(false)}>
            {isOpen && (
              <motion.div
                key="profile-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 flex items-center justify-center z-[200]"
              >
                <div
                  onClick={() => setIsOpen(false)}
                  className="fixed inset-0 bg-black/35 backdrop-blur-sm z-[9998]"
                />
                <motion.div
                  ref={modalRef}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => e.stopPropagation()}
                  className="relative z-[201] mx-4 w-full max-w-sm overflow-visible rounded-2xl modal-glass-panel p-5 font-sans"
                >
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                    <h3 className="text-base font-bold text-white">{t.profile_settings}</h3>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="w-9 h-9 flex items-center justify-center rounded-xl text-white/60 hover:text-white/90 hover:bg-slate-100 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/30 active:text-white/90"
                      aria-label={t.close}
                    >
                      <span className="text-xl leading-none">×</span>
                    </button>
                  </div>

                  <ProfileFormSelf
                    formData={formData}
                    setFormData={setFormData}
                    onSave={handleSave}
                    isSaving={isSaving}
                    readOnly={false}
                    appearance="light"
                  />

                  {onLogout && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          setIsOpen(false);
                          onLogout();
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-red-200 bg-red-50 text-red-700 font-semibold text-sm hover:bg-red-100 transition-colors"
                      >
                        <LogOut className="w-4 h-4 shrink-0" strokeWidth={2} />
                        {t.header_logout}
                      </button>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
