import { useState, useEffect, useMemo } from 'react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { X } from 'lucide-react';
import { User as UserType } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppUser } from '../context/appSliceContexts';
import { useAppOverlay } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { formatTrans } from '../utils/translations';
import { findActiveUserWithSamePin } from '../utils/loginIdentifier';
import { ProfileFormAdmin, type ProfileFormAdminData } from './UserProfile';

function userDateToInput(d: string | null | undefined): string {
  if (!d) return '';
  return d.slice(0, 10);
}

function dateToDbYmd(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

interface EditStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
  /** Profilo dipendente solo consultazione (Manager / Assistant manager delegati). */
  readOnly?: boolean;
}

export default function EditStaffModal({ isOpen, onClose, user, readOnly = false }: EditStaffModalProps) {
  useBodyScrollLock(isOpen);
  const { updateUser, currentUser, users } = useAppUser();
  const { showError } = useAppOverlay();
  const t = useT();
  const hourlyStr =
    user.hourly_rate_eur != null && Number.isFinite(user.hourly_rate_eur)
      ? String(user.hourly_rate_eur).replace('.', ',')
      : '';

  // Normalizza valori legacy: 'waiter' → 'server', 'chef' → 'cook'
  // Il DB seed usava 'waiter'; il form salva 'server'. Allineiamo al valore canonico del dropdown.
  const normalizeRole = (r: string): string => {
    if (r === 'waiter') return 'server';
    if (r === 'chef') return 'cook';
    return r;
  };

  const [formData, setFormData] = useState<ProfileFormAdminData>({
    first_name: user.first_name.toUpperCase(),
    last_name: (user.last_name ?? '').toUpperCase(),
    email: user.email,
    role: normalizeRole(user.role) as ProfileFormAdminData['role'],
    pin: user.pin || '',
    status: user.status,
    department: user.department,
    hourly_rate_eur: hourlyStr,
    employment_start_date: userDateToInput(user.employment_start_date),
    employment_end_date: userDateToInput(user.employment_end_date),
  });

  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const hr =
        user.hourly_rate_eur != null && Number.isFinite(user.hourly_rate_eur)
          ? String(user.hourly_rate_eur).replace('.', ',')
          : '';
      setFormData({
        first_name: user.first_name.toUpperCase(),
        last_name: (user.last_name ?? '').toUpperCase(),
        email: user.email,
        role: normalizeRole(user.role) as ProfileFormAdminData['role'],
        pin: user.pin || '',
        status: user.status,
        department: user.department,
        hourly_rate_eur: hr,
        employment_start_date: userDateToInput(user.employment_start_date),
        employment_end_date: userDateToInput(user.employment_end_date),
      });
    }
  }, [isOpen, user]);

  const activePinConflictMessage = useMemo(() => {
    const pinDigits = formData.pin.replace(/\D/g, '');
    if (pinDigits.length !== 4) return null;
    if (formData.status !== 'active') return null;
    const other = findActiveUserWithSamePin(users, pinDigits, user.id);
    if (!other) return null;
    const name = `${other.first_name ?? ''} ${other.last_name ?? ''}`.trim() || other.email;
    return formatTrans(t.employee_pin_taken_by_active, { name });
  }, [users, formData.pin, formData.status, user.id, t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activePinConflictMessage) {
      showError?.(activePinConflictMessage);
      return;
    }
    setIsSaving(true);
    try {
      const raw = formData.hourly_rate_eur.replace(',', '.').trim();
      let hourly_rate_eur: number | null = null;
      if (raw !== '') {
        const n = parseFloat(raw);
        hourly_rate_eur = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
      }
      const ok = await updateUser(user.id, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        role: formData.role,
        pin: formData.pin,
        status: formData.status,
        department: formData.department,
        hourly_rate_eur,
        employment_start_date: dateToDbYmd(formData.employment_start_date),
        employment_end_date:
          formData.status === 'active' ? null : dateToDbYmd(formData.employment_end_date),
      });
      if (!ok) {
        setIsSaving(false);
        return;
      }
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 500);
    } catch (error) {
      console.error('[EditStaffModal] Error updating user:', error);
      setIsSaving(false);
      showError?.(t.save_error_retry);
    }
  };

  if (!isOpen || !currentUser) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/35 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="modal-glass-panel w-full max-w-md overflow-hidden rounded-xl"
        >
          <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4" style={{ background: 'rgba(255, 255, 255, 0.14)' }}>
            <div>
              <h2 className="text-base font-bold tracking-wide text-white font-sans">
                {readOnly
                  ? ((t as { settings_delegated_view_title?: string }).settings_delegated_view_title ??
                    t.edit_employee_title)
                  : t.edit_employee_title}
              </h2>
              <p className="text-xs text-white/60 mt-0.5 font-sans">
                <span className="font-semibold">{user.first_name}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={t.close}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-500 bg-white/10 transition-colors hover:bg-white/15 active:bg-white/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
            >
              <X className="h-4 w-4 text-white/70" aria-hidden />
            </button>
          </div>

          <div className="px-5 py-4 overflow-y-auto overflow-x-hidden max-h-[70vh] border-t border-neutral-500">
            <ProfileFormAdmin
              user={user}
              currentUser={currentUser}
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              onClose={onClose}
              isSaving={isSaving}
              activePinConflictMessage={activePinConflictMessage}
              readOnly={readOnly}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}