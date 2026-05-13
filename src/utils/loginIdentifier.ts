import type { User } from '../types';

/** Normalizza il nome digitato (minuscole, spazi). */
export function normalizeStaffName(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, ' ');
}

function fullNameNorm(u: User): string {
  return normalizeStaffName(`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim());
}

function firstNameNorm(u: User): string {
  return normalizeStaffName(u.first_name || '');
}

export function pinMatchesStored(u: User, typedPin: string): boolean {
  return String(u.pin ?? '').trim() === typedPin.trim();
}

/**
 * Utenti attivi il cui nome coincide con quanto digitato (nome completo o solo nome).
 * Usato per anteprima lingua / WebAuthn solo se c’è un solo risultato.
 */
export function findUsersMatchingName(users: User[], nameRaw: string): User[] {
  const id = normalizeStaffName(nameRaw);
  if (!id) return [];
  const active = users.filter((u) => u.status === 'active');
  const fullHits = active.filter((u) => fullNameNorm(u) === id);
  if (fullHits.length > 0) return fullHits;
  return active.filter((u) => firstNameNorm(u) === id);
}

/**
 * Login: nome + PIN (qualsiasi stato account). Usare poi `status === 'active'` per consentire la sessione.
 */
export function findUserByNameAndPinAnyStatus(users: User[], nameRaw: string, pin: string): User | undefined {
  const id = normalizeStaffName(nameRaw);
  if (!id || !pin.trim()) return undefined;
  const withPin = users.filter((u) => pinMatchesStored(u, pin));

  const fullHits = withPin.filter((u) => fullNameNorm(u) === id);
  if (fullHits.length === 1) return fullHits[0];
  if (fullHits.length > 1) return undefined;

  const firstHits = withPin.filter((u) => firstNameNorm(u) === id);
  if (firstHits.length === 1) return firstHits[0];
  return undefined;
}

/**
 * Login: nome + PIN. Preferisce nome e cognome esatto; se più omonimi con lo stesso solo nome, fallisce (serve cognome).
 * Solo dipendenti `active` (sospesi/inattivi esclusi).
 */
export function findUserByNameAndPin(users: User[], nameRaw: string, pin: string): User | undefined {
  const u = findUserByNameAndPinAnyStatus(users, nameRaw, pin);
  return u && u.status === 'active' ? u : undefined;
}

export type LoginNamePinFailureKind = 'no_name_match' | 'wrong_pin' | 'homonym_or_ambiguous';

/**
 * Per messaggi di errore mirati quando `findUserByNameAndPinAnyStatus` non trova un utente.
 */
export function getLoginNamePinFailureKind(
  users: User[],
  nameRaw: string,
  pin: string
): LoginNamePinFailureKind | 'empty_input' {
  const id = normalizeStaffName(nameRaw);
  if (!id || !pin.trim()) return 'empty_input';
  const matches = findUsersMatchingName(users, nameRaw);
  if (matches.length === 0) return 'no_name_match';
  if (matches.length === 1) return 'wrong_pin';
  return 'homonym_or_ambiguous';
}

/** Altro dipendente attivo con lo stesso PIN (conflitto login). */
export function findActiveUserWithSamePin(
  users: User[],
  pinRaw: string,
  excludeUserId?: string
): User | undefined {
  const pin = pinRaw.replace(/\D/g, '');
  if (pin.length !== 4) return undefined;
  return users.find(
    (u) =>
      u.id !== excludeUserId &&
      u.status === 'active' &&
      pinMatchesStored(u, pin)
  );
}
