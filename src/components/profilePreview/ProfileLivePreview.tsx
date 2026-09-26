/**
 * Anteprima "Cosa vede chi" — scheda Profilo.
 *
 * Copia esatta: riusa il componente reale `ProfileNavTabPanel` renderizzato
 * come l'utente selezionato (`overrideUser`).
 *
 * Sola lettura: salvataggio profilo, avatar, lingua, sicurezza/PIN non devono
 * poter modificare dati reali dall'anteprima.
 */
import type { User } from '../../types';
import ProfileNavTabPanel from '../ProfileNavTabPanel';

const noop = () => {};

export default function ProfileLivePreview({
  previewUser,
}: {
  previewUser: User;
  language: unknown;
  isSelectedAdmin: boolean;
  onUiToggle: (key: string, visible: boolean) => void;
}) {
  return (
    <div
      role="group"
      className="pointer-events-none select-none"
      aria-label="Anteprima scheda Profilo (sola lettura)"
    >
      <ProfileNavTabPanel onLogout={noop} overrideUser={previewUser} />
    </div>
  );
}
