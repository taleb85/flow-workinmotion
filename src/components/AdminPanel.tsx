import { useState, useRef } from 'react';
import { ChevronUp, ChevronDown, Edit2, Trash2, UserX, UserCheck, Download, Upload, UserPlus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppUser } from '../context/appSliceContexts';
import { useAppData } from '../context/appSliceContexts';
import { useT } from '../hooks/useT';
import { User } from '../types';
import { canUserEdit, isAdminOnly, canViewSuspended } from '../utils/permissions';
import { exportToJSON } from '../utils/exportData';
import { importDataToSupabase, clearAllData } from '../utils/importData';
import { translateRole } from '../utils/roles';
import EditStaffModal from './EditStaffModal';
import CreateStaffModal from './CreateStaffModal';

export default function AdminPanel() {
  const { users, currentUser, updateUser, deleteUser, reorderUsers } = useAppUser();
  const { shifts, punchRecords, holidays } = useAppData();
  const t = useT();
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreateStaff, setShowCreateStaff] = useState(false);
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showSuspended, setShowSuspended] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!currentUser) return null;

  const canEdit = canUserEdit(currentUser);
  const adminOnly = isAdminOnly(currentUser);
  const canSeeSuspended = canViewSuspended(currentUser);

  const handleExportJSON = () => {
    exportToJSON({ users, shifts, punchRecords, holidays });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/json') {
      setImportFile(file);
      setShowImportConfirm(true);
    } else {
      setImportStatus({ type: 'error', message: t.select_valid_json });
      setTimeout(() => setImportStatus(null), 3000);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importFile) return;
    try {
      const text = await importFile.text();
      const data = JSON.parse(text);
      if (!data.users || !Array.isArray(data.users)) {
        throw new Error('Formato file non valido');
      }
      setShowImportConfirm(false);
      await clearAllData();
      await importDataToSupabase({
        users: data.users,
        shifts: data.shifts || [],
        holidays: data.holidays || [],
        punchRecords: data.punchRecords || [],
      });
      setImportStatus({ type: 'success', message: t.data_restored });
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setImportStatus({ type: 'error', message: t.import_error });
      setShowImportConfirm(false);
      setTimeout(() => setImportStatus(null), 3000);
    }
  };

  const handleCancelImport = () => {
    setShowImportConfirm(false);
    setImportFile(null);
  };

  const handleToggleStatus = (user: User) => {
    updateUser(user.id, {
      status: user.status === 'active' ? 'suspended' : 'active',
    });
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm(t.delete_employee_confirm)) {
      deleteUser(userId);
    }
  };

  return (
    <div className="pb-32 px-4 pt-6 max-w-7xl mx-auto text-white min-h-screen">
      <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-2">
          <h1 className="sr-only">{t.administration}</h1>
        </div>

        <AnimatePresence>
          {importStatus && (
            <div className={`mb-4 rounded-2xl p-4 border ${importStatus.type === 'success' ? 'bg-accent/15 text-accent border-accent/30' : 'bg-red-100 text-red-700 border-red-200'} text-center font-medium`}>
              {importStatus.message}
            </div>
          )}
        </AnimatePresence>

        <div className={`grid gap-4 mb-8 ${adminOnly ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-1'}`}>
          {adminOnly && (
            <>
              <button onClick={handleImportClick} className="bg-black/15 backdrop-blur-xl rounded-[24px] p-5 border-2 border-white/30 hover:bg-black/25 transition-all active:bg-black/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                <Upload className="w-6 h-6 text-white mx-auto mb-2" />
                <span className="text-white text-[11px] font-medium uppercase tracking-widest block font-sans">{t.restore}</span>
              </button>
              <button onClick={handleExportJSON} className="bg-black/15 backdrop-blur-xl rounded-[24px] p-5 border-2 border-white/30 hover:bg-black/25 transition-all active:bg-black/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                <Download className="w-6 h-6 text-white mx-auto mb-2" />
                <span className="text-white text-[11px] font-medium uppercase tracking-widest block font-sans">{t.backup_json}</span>
              </button>
            </>
          )}
        </div>

        <div className="bg-black/15 backdrop-blur-md rounded-[32px] border-2 border-white/30 overflow-hidden shadow-2xl">
          <div className="p-4 border-b border-white/20 flex items-center justify-between gap-3 flex-wrap">
            {canEdit && (
              <button
                type="button"
                onClick={() => setShowCreateStaff(true)}
                className="keep-white-glass inline-flex items-center gap-2 rounded-2xl border-2 border-white/35 bg-white/10 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-white hover:bg-white/15 transition-colors font-sans active:bg-white/80"
              >
                <UserPlus className="w-4 h-4" aria-hidden />
                {t.admin_add_employee}
              </button>
            )}
            <div className="flex-1 min-w-[1rem]" />
            {canSeeSuspended && (
              <button
                onClick={() => setShowSuspended(!showSuspended)}
                className="text-xs font-medium text-white/80 hover:text-white uppercase tracking-wider font-sans active:text-white"
              >
                {showSuspended ? t.hide_suspended : t.show_suspended}
              </button>
            )}
          </div>

          <div className="divide-y divide-white/20">
            {users
              .filter((u) => (u.status === 'active' || (showSuspended && canSeeSuspended && (u.status === 'suspended' || u.status === 'inactive'))) && (u.role !== 'admin' || adminOnly))
              .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
              .map((user, index) => (
                <div key={user.id} className={`p-5 flex items-center justify-between hover:bg-black/25 transition-colors ${user.status === 'suspended' ? 'opacity-50 grayscale' : ''} active:bg-black/80`}>
                  <div className="flex items-center space-x-5 flex-1">
                    <div className="flex flex-col space-y-1">
                      <button onClick={() => reorderUsers(user.id, 'up')} disabled={index === 0} className="w-7 h-7 rounded-xl bg-black/15 backdrop-blur-xl border border-white/30 flex items-center justify-center hover:bg-black/25 disabled:opacity-20 transition-all active:bg-black/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"><ChevronUp className="w-4 h-4 text-white" /></button>
                      <button onClick={() => reorderUsers(user.id, 'down')} disabled={index === users.length - 1} className="w-7 h-7 rounded-xl bg-black/15 backdrop-blur-xl border border-white/30 flex items-center justify-center hover:bg-black/25 disabled:opacity-20 transition-all active:bg-black/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"><ChevronDown className="w-4 h-4 text-white" /></button>
                    </div>

                    <div>
                      <p className="text-white font-bold text-base uppercase font-sans">{user.first_name}</p>
                      <p className="text-white text-[11px] font-medium uppercase tracking-wider font-sans">
                        {translateRole(user.role, currentUser?.language ?? 'it')} • {t.pin}: {user.pin}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    {canEdit && (
                      <>
                        <button onClick={() => handleToggleStatus(user)} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all bg-black/15 backdrop-blur-sm border-2 border-white/30 hover:bg-black/25 ${user.status === 'suspended' ? 'text-accent-light' : 'text-red-300'} active:bg-black/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]`}>
                          {user.status === 'suspended' ? <UserCheck className="w-5 h-5" /> : <UserX className="w-5 h-5" />}
                        </button>
                        <button onClick={() => setEditingUser(user)} className="w-10 h-10 rounded-xl bg-black/15 backdrop-blur-xl border border-white/30 flex items-center justify-center hover:bg-black/25 text-white transition-all active:bg-black/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {adminOnly && (
                          <button onClick={() => handleDeleteUser(user.id)} className="w-10 h-10 rounded-xl bg-black/15 backdrop-blur-xl border border-white/30 flex items-center justify-center hover:bg-red-500/30 text-white transition-all active:bg-red-500/80 hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      </motion.div>

      {showCreateStaff && (
        <CreateStaffModal
          isOpen
          onClose={() => setShowCreateStaff(false)}
          onCreated={(u) => setEditingUser(u)}
        />
      )}
      {editingUser && <EditStaffModal isOpen={true} user={users.find((u) => u.id === editingUser.id) ?? editingUser} onClose={() => setEditingUser(null)} />}
      {showImportConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="modal-glass-panel w-full max-w-md overflow-hidden rounded-[40px]">
            <div className="bg-red-600 p-8 text-center text-white">
              <h2 className="text-2xl font-medium uppercase tracking-tighter">{t.attention}</h2>
            </div>
            <div className="p-8 space-y-6 text-center">
              <p className="text-white/70 font-medium">{t.import_warning}</p>
              <div className="rounded-xl border border-neutral-500 p-4">
                <p className="text-white font-sans text-xs break-all text-center">{importFile?.name}</p>
              </div>
              <div className="flex space-x-3 pt-4">
<button onClick={handleConfirmImport} className="flex-1 bg-red-600 text-white rounded-2xl py-4 font-medium uppercase tracking-widest text-xs transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">{t.confirm}</button>
<button onClick={handleCancelImport} className="flex-1 bg-slate-200 text-white/80 rounded-2xl py-4 font-medium uppercase tracking-widest text-xs transition-all hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]">{t.cancel}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}