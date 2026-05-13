import { createContext, useContext } from 'react';
import type { AppContextType } from './appContextTypes';

/** Istanza stabile: non ricreare in `AppContext.tsx` così React Fast Refresh non desincronizza Provider e consumatori. */
export const AppContext = createContext<AppContextType | undefined>(undefined);

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (ctx === undefined) {
    throw new Error('useApp must be used within AppProvider');
  }
  return ctx;
}
