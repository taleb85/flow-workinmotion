/**
 * Contenitore anteprima in miniatura (profilePreview/): testi `text-[8–10px]`
 * sono voluti per scala ridotta; round2: miniature preview — intentional.
 */
import { memo } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../../types';
import { isUiWidgetVisible } from '../../utils/uiScreenWidgets';
import { previewWidgetLabel } from './previewWidgetLabel';
import ToggleSwitch from '../ui/toggle-switch-glass';

export const WidgetChrome = memo(function WidgetChrome({
  widgetKey,
  previewUser,
  isSelectedAdmin,
  onUiToggle,
  children,
  hiddenBadge,
}: {
  widgetKey: string;
  previewUser: User;
  isSelectedAdmin: boolean;
  onUiToggle: (key: string, visible: boolean) => void;
  children: ReactNode;
  hiddenBadge: string;
}) {
  const visible = isUiWidgetVisible(previewUser, widgetKey);
  return (
    <div className="relative z-[220]">
      {!isSelectedAdmin && (
        <div className="mb-1 flex items-center justify-end gap-2">
          <span className="hidden max-w-[55%] truncate text-right text-[0.5625rem] font-medium text-white/50 md:inline" title={previewWidgetLabel(widgetKey)}>{previewWidgetLabel(widgetKey)}
          </span>
          <ToggleSwitch
            isActive={visible}
            onChange={(next) => onUiToggle(widgetKey, next)}
            size="sm"
            darkMode
            className="shrink-0"
          />
        </div>
      )}
      <div className="relative">
        <div className={visible ? '' : 'pointer-events-none select-none opacity-[0.32]'}>{children}</div>
        {!visible && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl border-2 border-dashed border-amber-400/70 bg-white/50 backdrop-blur-[0.0625rem]">
            <span className="rounded-lg border border-amber-200 bg-white/95 px-2 py-1 text-[0.625rem] font-bold uppercase tracking-wide text-amber-900 shadow-sm">
              {hiddenBadge}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});
