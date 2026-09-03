/**
 * Tema fisso: l'app usa esclusivamente il tema scuro.
 * L'attributo `data-theme="dark"` (impostato in index.html e guidato dalle
 * regole CSS scure) determina l'aspetto; la classe `dark` viene rimossa per
 * non alterare i token brand.
 */

/** Rimuove la classe `dark` e mantiene il tema scuro guidato da `data-theme`. */
export function applyDocumentTheme(): void {
  document.documentElement.classList.remove('dark');
}

export function applyUnauthenticatedDocumentTheme(): void {
  applyDocumentTheme();
}
