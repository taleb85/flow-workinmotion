import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import UnifiedShiftGrid from './UnifiedShiftGrid';
import { useT } from '../hooks/useT';
import { useAppUser } from '../context/AppContext';

export default function UnifiedShiftsPage() {
  const _t = useT();
  const { currentUser, isSessionElevated } = useAppUser();

  if (!currentUser) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full h-full min-h-0 flex flex-col mx-auto px-4 pb-2 pt-3 font-sans overflow-hidden"
    >
      {/* Admin badge */}
      {isSessionElevated && (
        <div className="flex items-center gap-2 mb-2 shrink-0">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2 py-0.5 text-[9px] font-bold text-amber-300 uppercase tracking-wider">
            <Users className="h-2.5 w-2.5" />
            Admin
          </span>
        </div>
      )}

      {/* Unified Grid — riempie tutto lo spazio */}
      <div className="flex-1 min-h-0 rounded-xl border border-white/10 bg-transparent p-3 shadow-sm overflow-hidden flex flex-col">
        <UnifiedShiftGrid
          mode="realtime"
          onModeChange={() => {}}
        />
      </div>
    </motion.div>
  );
}
