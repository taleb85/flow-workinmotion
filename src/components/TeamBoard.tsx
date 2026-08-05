import { memo } from 'react';
import { it } from 'date-fns/locale';
import { Megaphone, X, Pencil, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { safeFormatDate } from '../utils/safeDateFormat';

interface TeamBoardProps {
  t: Record<string, string>;
  boardNote: { text: string; author: string; updatedAt: string } | null;
  editingBoard: boolean;
  boardDraft: string;
  onBoardDraftChange: (v: string) => void;
  onStartEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onClear: () => void;
  canEdit: boolean;
  effectiveLanguage: string;
}

export default memo(function TeamBoard({
  t,
  boardNote,
  editingBoard,
  boardDraft,
  onBoardDraftChange,
  onStartEdit,
  onSave,
  onCancel,
  onClear,
  canEdit,
  effectiveLanguage: _effectiveLanguage,
}: TeamBoardProps) {
  return (
    <AnimatePresence>
      <motion.div
        key="board"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        className={`rounded-xl border border-neutral-500 px-4 py-3 ${boardNote ? 'border-amber-400/30 bg-amber-500/10' : ''}`}
      >
        <div className="flex items-start gap-3">
          <Megaphone size={15} className={`mt-0.5 shrink-0 ${boardNote ? 'text-amber-600' : 'text-white/55'}`} />
          <div className="flex-1 min-w-0">
            {editingBoard ? (
              <div className="flex flex-col gap-2">
                <textarea
                  autoFocus
                  value={boardDraft}
                  onChange={(e) => onBoardDraftChange(e.target.value)}
                  placeholder={t.home_board_placeholder}
                  rows={2}
                  className="w-full text-base text-white bg-amber-500/10 border border-amber-400/40 rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onSave}
className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 active:bg-amber-600/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
                  >
                    <Check size={12} /> {t.save}
                  </button>
                  <button
                    type="button"
                    onClick={onCancel}
className="px-3 py-1.5 rounded-xl bg-white/10 text-white/70 text-xs font-semibold hover:bg-white/15 active:bg-white/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.15)]"
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            ) : boardNote ? (
              <p className="text-sm text-amber-900 font-medium whitespace-pre-wrap leading-relaxed">{boardNote.text}</p>
            ) : canEdit ? (
              <button
                type="button"
                onClick={() => {
                  onBoardDraftChange('');
                  onStartEdit();
                }}
                className="text-left w-full text-xs italic hover:opacity-80 transition-opacity active:opacity-70"
                style={{ color: '#ffffff' }}
              >
                {t.home_board_empty}
              </button>
            ) : (
              <p className="text-xs italic" style={{ color: '#ffffff' }}>{t.home_board_empty}</p>
            )}
            {boardNote && !editingBoard && (
              <p className="text-[11px] text-amber-600 mt-1">
                Da {boardNote.author} · {safeFormatDate(boardNote.updatedAt, 'd MMM HH:mm', { locale: it })}
              </p>
            )}
          </div>
          {canEdit && !editingBoard && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onBoardDraftChange(boardNote?.text ?? '');
                  onStartEdit();
                }}
                className="p-1.5 rounded-xl hover:bg-amber-100 text-amber-600 active:bg-amber-100/80"
              >
                <Pencil size={13} />
              </button>
              {boardNote && (
                <button
                  type="button"
                  onClick={onClear}
className="p-1.5 rounded-xl hover:bg-red-50 text-red-400 active:bg-red-50/80 transition-colors hover:shadow-[inset_0_0_30px_rgba(255,255,255,0.25)]"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
});
