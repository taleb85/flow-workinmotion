import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { User as UserType } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { getTranslations, formatTrans } from '../utils/translations';
import { findActiveUserWithSamePin } from '../utils/loginIdentifier';
import { ProfileFormAdmin, type ProfileFormAdminData } from './UserProfile';

interface EditStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserType;
}

export default function EditStaffModal({ isOpen, onClose, user }: EditStaffModalProps) {
  const { updateUser, currentUser, effectiveLanguage, showError, users } = useApp();
  const t = getTranslations(effectiveLanguage);
  const hourlyStr =
    user.hourly_rate_eur != null && Number.isFinite(user.hourly_rate_eur)
      ? String(user.hourly_rate_eur).replace('.', ',')
      : '';

  const [formData, setFormData] = useState<ProfileFormAdminData>({
    first_name: user.first_name.toUpperCase(),
    last_name: (user.last_name ?? '').toUpperCase(),
    email: user.email,
    role: user.role,
    pin: user.pin || '',
    status: user.status,
    department: user.department,
    hourly_rate_eur: hourlyStr,
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
        role: user.role,
        pin: user.pin || '',
        status: user.status,
        department: user.department,
        hourly_rate_eur: hr,
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
    const tr = getTranslations(effectiveLanguage);
    return formatTrans(tr.employee_pin_taken_by_active, { name });
  }, [users, formData.pin, formData.status, user.id, effectiveLanguage]);

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
      await updateUser(user.id, {
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        role: formData.role,
        pin: formData.pin,
        status: formData.status,
        department: formData.department,
        hourly_rate_eur,
      });
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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="bg-white rounded-xl border border-slate-200 shadow-xl w-full max-w-md overflow-hidden"
        >
          <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 flex items-center justify-between z-10">
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-wide font-sans">
                {t.edit_employee_title}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-sans">
                <span className="font-semibold">{user.first_name}</span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors border border-slate-200"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          <div className="px-5 py-4 overflow-y-auto max-h-[70vh]">
            <ProfileFormAdmin
              user={user}
              currentUser={currentUser}
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              onClose={onClose}
              isSaving={isSaving}
              activePinConflictMessage={activePinConflictMessage}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}