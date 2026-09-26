/**
 * Anteprima "Cosa vede chi" — scheda Ferie.
 *
 * A differenza dei vecchi mock statici (`FerieMgmtPreview` /
 * `StaffHolidaysPreview`, che restano nel repo), questa anteprima riusa il
 * componente VERO `HolidayRequests`, alimentato con dati dimostrativi tramite
 * gli override `overrideUser` / `overrideHolidays` e `skipAutoRefresh`.
 *
 * La visibilità dei blocchi resta pilotata da `isUiWidgetVisible(previewUser,
 * key)` dentro `HolidayRequests` (via `uiW`), esattamente come nell'app reale;
 * l'admin la commuta dai toggle esposti in `ProfileTabRichPreview`.
 *
 * Il contenitore è di sola lettura (`pointer-events-none select-none`): la vista
 * gestionale espone pulsanti approva/rifiuta/elimina che non devono poter
 * modificare dati reali.
 */
import { addDays, format } from 'date-fns';
import type { HolidayRequest, Language, User } from '../../types';
import { getTranslations } from '../../utils/translations';
import { useAppUser } from '../../context/appSliceContexts';
import HolidayRequests from '../HolidayRequests';

interface FerieLivePreviewProps {
  previewUser: User;
  language: Language;
  isSelectedAdmin: boolean;
  onUiToggle: (key: string, visible: boolean) => void;
  isMgmt: boolean;
}

export default function FerieLivePreview({
  previewUser,
  language,
  isMgmt,
  isSelectedAdmin: _isSelectedAdmin,
  onUiToggle: _onUiToggle,
}: FerieLivePreviewProps) {
  const t = getTranslations(language) as Record<string, string>;
  const { users } = useAppUser();

  const now = new Date();
  const createdAt = now.toISOString();
  /** Data futura coerente a `offset` giorni da oggi (`yyyy-MM-dd`). */
  const take = (offset: number) => format(addDays(now, offset), 'yyyy-MM-dd');

  // Colleghi "dimostrativi" per la vista gestionale: si preferiscono utenti
  // reali (così l'anteprima mostra i nomi nei pannelli), con fallback su id demo
  // dedicati quando il team non ha altri profili.
  const colleagueIds = users
    .filter((u) => u.id !== previewUser.id)
    .slice(0, 2)
    .map((u) => u.id);
  const colleagueA = colleagueIds[0] ?? 'pv-ferie-demo-marco';
  const colleagueB = colleagueIds[1] ?? 'pv-ferie-demo-giulia';

  const demoHolidays: HolidayRequest[] = [
    // ── Richieste dell'utente in anteprima (una pending, una approved) ──
    {
      id: 'pv-ferie-own-pending',
      user_id: previewUser.id,
      start_date: take(21),
      end_date: take(25),
      type: 'ferie',
      status: 'pending',
      created_at: createdAt,
      reason: 'Ferie estive',
      requester_email: previewUser.email ?? '',
    },
    {
      id: 'pv-ferie-own-approved',
      user_id: previewUser.id,
      start_date: take(45),
      end_date: take(49),
      type: 'ferie',
      status: 'approved',
      created_at: createdAt,
      requester_email: previewUser.email ?? '',
    },
    // ── Richieste di altri dipendenti: fanno comparire le sezioni
    //    "in attesa / approvate / rifiutate" della vista gestionale ──
    {
      id: 'pv-ferie-colleague-pending',
      user_id: colleagueA,
      start_date: take(10),
      end_date: take(12),
      type: 'ferie',
      status: 'pending',
      created_at: createdAt,
      reason: 'Permesso familiare',
    },
    {
      id: 'pv-ferie-colleague-approved',
      user_id: colleagueB,
      start_date: take(30),
      end_date: take(33),
      type: 'ferie',
      status: 'approved',
      created_at: createdAt,
    },
    {
      id: 'pv-ferie-colleague-rejected',
      user_id: colleagueA,
      start_date: take(5),
      end_date: take(6),
      type: 'ferie',
      status: 'rejected',
      created_at: createdAt,
    },
  ];

  return (
    <div
      className="pointer-events-none select-none"
      aria-label={t.profile_visibility_readonly_preview ?? 'Solo lettura'}
    >
      <HolidayRequests
        embedded={!isMgmt}
        overrideUser={previewUser}
        overrideHolidays={demoHolidays}
        skipAutoRefresh
      />
    </div>
  );
}
