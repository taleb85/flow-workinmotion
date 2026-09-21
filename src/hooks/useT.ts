/**
 * useT — wrapper unificato per le traduzioni Flow.
 *
 * Legge la lingua corrente da `useApp()` e restituisce l'oggetto `t` (Record)
 * come `getTranslations(effectiveLanguage)`.
 *
 * Uso:
 *   const t = useT();
 *   t.home
 *   t[dynamicKey as keyof typeof t]
 */
import { useMemo } from 'react';
import { useAppUser } from '../context/AppContext';
import { getTranslations } from '../utils/translations';
import { getDeviceUiLanguage, readStoredUiLanguage } from '../utils/uiLanguagePreference';

type Translations = ReturnType<typeof getTranslations>;

export function useT(): Translations {
  const { effectiveLanguage } = useAppUser();
  return useMemo(() => getTranslations(effectiveLanguage), [effectiveLanguage]);
}

/**
 * Traduzioni per componenti resi FUORI dall'AppProvider (es. console Super Admin su
 * dominio dedicato): la lingua arriva da localStorage, altrimenti dal dispositivo.
 */
export function getStaticTranslations(): Translations {
  return getTranslations(readStoredUiLanguage() ?? getDeviceUiLanguage());
}
