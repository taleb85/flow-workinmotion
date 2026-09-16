import type { Language } from '../types';

/** Chiave storica (Impostazioni / setLanguage). */
export const LANG_STORAGE_KEY = 'appLanguage';

/**
 * Ultima lingua UI usata da un profilo (login, sessione, logout).
 * Serve alle rotte pubbliche senza sessione: stessa lingua dell’area autenticata.
 */
export const LAST_PROFILE_LANG_KEY = 'osteria_last_profile_language';

export function clearStoredUiLanguage(): void {
  try {
    localStorage.removeItem(LANG_STORAGE_KEY);
    localStorage.removeItem(LAST_PROFILE_LANG_KEY);
  } catch { /* ignore */ }
}

export function persistStoredUiLanguage(lang: Language): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
    localStorage.setItem(LAST_PROFILE_LANG_KEY, lang);
  } catch {
    /* ignore */
  }
}

export function readStoredUiLanguage(): Language | null {
  try {
    const last = localStorage.getItem(LAST_PROFILE_LANG_KEY) as Language | null;
    if (last && ['it', 'en', 'es', 'fr'].includes(last)) return last;
    const ap = localStorage.getItem(LANG_STORAGE_KEY) as Language | null;
    if (ap && ['it', 'en', 'es', 'fr'].includes(ap)) return ap;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Lingua UI da browser/OS (`navigator.languages` + `navigator.language`).
 * Usata su /profilo (login) senza sessione, così non resta agganciata all’ultimo profilo.
 */
export function getDeviceUiLanguage(): Language {
  if (typeof navigator === 'undefined') return 'it';
  const candidates = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  for (const raw of candidates) {
    const code = String(raw).split('-')[0].toLowerCase();
    if (code === 'en') return 'en';
    if (code === 'es') return 'es';
    if (code === 'fr') return 'fr';
    if (code === 'it') return 'it';
  }
  return 'it';
}
