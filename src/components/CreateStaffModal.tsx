import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { User as UserType } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '../context/AppContext';
import { getTranslations, formatTrans } from '../utils/translations';
import { findActiveUserWithSamePin } from '../utils/loginIdentifier';
import { ProfileFormAdmin, type ProfileFormAdminData } from './UserProfile';

const PHANTOM_USER: UserType = {
  id: '00000000-0000-4000-8000-000000000001',
  first_name: '',
  last_name: '',
  email: '',
  role: 'server',
  pin: '',
  status: 'active',
  sort_order: 0,
  language: 'it',
  theme: 'light',
  can_create_shifts: false,
  can_approve_shifts: false,
  can_view_total_hours: false,
  can_edit_staff_pins: false,
  can_manage_drafts: false,
};

const emptyForm = (): ProfileFormAdminData => ({
  first_name: '',
  last_name: '',
  email: '',
  role: 'server',
  pin: '',
  status: 'active',
  department: undefined,
  hourly_rate_eur: '',
});

interface CreateStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Dopo creazione: es. aprire modifica per copiare il link invito. */
  onCreated?: (user: UserType) => void;
}

export default function CreateStaffModal({ isOpen, onClose, onCreated }: CreateStaffModalProps) {
  const { createUser, currentUser, effectiveLanguage, showError, users } = useApp();
  const t = getTranslations(effectiveLanguage);
  const [formData, setFormData] = useState<ProfileFormAdminData>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setFormData(emptyForm());
      setIsSaving(false);
    }
  }, [isOpen]);

  const phantom = useMemo(() => ({ ...PHANTOM_USER, role: formData.role }), [formData.role]);

  const activePinConflictMessage = useMemo(() => {
    const pinDigits = formData.pin.replace(/\D/g, '');
    if (pinDigits.length !== 4) return null;
    const other = findActiveUserWithSamePin(users, pinDigits);
    if (!other) return null;
    const name = `${other.first_name ?? ''} ${other.last_name ?? ''}`.trim() || other.email;
    const tr = getTranslations(effectiveLanguage);
    return formatTrans(tr.employee_pin_taken_by_active, { name });
  }, [users, formData.pin, effectiveLanguage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pinDigits = formData.pin.replace(/\D/g, '');
    if (pinDigits.length !== 4) {
      showError?.(t.create_employee_pin_required);
      return;
    }
    if (activePinConflictMessage) {
      showError?.(activePinConflictMessage);
      return;
    }
    const first = formData.first_name.trim();
    if (!first) {
      showError?.(t.create_employee_name_required);
      return;
    }
    const email = formData.email.trim();
    if (!email) {
      showError?.(t.create_employee_email_required);
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
      const created = await createUser({
        first_name: first,
        last_name: formData.last_name.trim() || undefined,
        email,
        role: formData.role,
        pin: pinDigits,
        status: formData.status,
        department: formData.department,
        hourly_rate_eur,
      });
      if (created) {
        onClose();
        onCreated?.(created);
      }
    } finally {
      setIsSaving(false);
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
              <h2 className="text-base font-bold text-slate-900 tracking-wide font-sans">{t.create_employee_title}</h2>
              <p className="text-xs text-slate-500 mt-0.5 font-sans">{t.create_employee_subtitle}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors border border-slate-200"
            >
              <X className="w-4 h-4 text-slate-600" />
            </button>
          </div>

          <div className="px-5 py-4 overflow-y-auto max-h-[70vh]">
            <ProfileFormAdmin
              user={phantom}
              currentUser={currentUser}
              formData={formData}
              setFormData={setFormData}
              onSubmit={handleSubmit}
              onClose={onClose}
              isSaving={isSaving}
              variant="create"
              activePinConflictMessage={activePinConflictMessage}
            />
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
