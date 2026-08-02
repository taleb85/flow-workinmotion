/**
 * Percorsi pubblici: accesso profili staff/manager; rotte legacy (`/kiosk`, `/login`, `/timbratura`) reindirizzate in `App.tsx`.
 */
export const PATH_PROFILO = '/profilo';

export type ProfiloInviteLinkOptions = {
  /** Nome per il login (dal modulo admin; può differire dal DB finché non salvi). */
  displayName?: string;
  /** PIN a 4 cifre — incluso nel link codificato solo se completo. */
  pin?: string;
  /**
   * Slug della sede (tenant) — richiesto per Option B (single-URL multi-tenant).
   * Incluso nel token così LoginPage sa quale tenant caricare.
   */
  tenantSlug?: string;
};

/**
 * Genera un link diretto a /profilo con token base64 che codifica userId, PIN e tenantSlug.
 * Formato token: base64(JSON { u: userId, p: pin, s: tenantSlug })
 * LoginPage decodifica `?t=` via decodeProfiloAccessToken() e pre-compila nome e PIN.
 */
export function buildProfiloAccessLink(
  userId: string,
  options?: ProfiloInviteLinkOptions,
  origin?: string
): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const payload: { u: string; p?: string; s?: string } = { u: userId };
  if (options?.pin && options.pin.replace(/\D/g, '').length === 4) {
    payload.p = options.pin.replace(/\D/g, '');
  }
  if (options?.tenantSlug) {
    payload.s = options.tenantSlug;
  }
  const token = btoa(JSON.stringify(payload));
  return `${base}${PATH_PROFILO}?t=${encodeURIComponent(token)}`;
}

/**
 * Decodifica un token `t=` generato da buildProfiloAccessLink.
 * Supporta sia il formato nuovo JSON `{"u":...,"p":...,"s":...}`
 * sia il vecchio formato `userId|pin` per backward-compatibility.
 * Restituisce { userId, pin, tenantSlug } (campi vuoti se assenti).
 */
export function decodeProfiloAccessToken(token: string): {
  userId: string;
  pin: string;
  tenantSlug: string;
} {
  try {
    const decoded = atob(token);

    // Nuovo formato JSON
    if (decoded.startsWith('{')) {
      try {
        const parsed = JSON.parse(decoded) as Record<string, string>;
        const pin = (parsed.p ?? '').replace(/\D/g, '').slice(0, 4);
        return {
          userId: (parsed.u ?? '').trim(),
          pin: pin.length === 4 ? pin : '',
          tenantSlug: (parsed.s ?? '').trim(),
        };
      } catch {
        // fall through
      }
    }

    // Vecchio formato: userId|pin (o solo userId)
    const sep = decoded.indexOf('|');
    if (sep === -1) return { userId: decoded.trim(), pin: '', tenantSlug: '' };
    const pin = decoded.slice(sep + 1).replace(/\D/g, '').slice(0, 4);
    return {
      userId: decoded.slice(0, sep).trim(),
      pin: pin.length === 4 ? pin : '',
      tenantSlug: '',
    };
  } catch {
    return { userId: '', pin: '', tenantSlug: '' };
  }
}

/** Rotta per i link brevi invito staff: /i/:slug */
export const PATH_INVITE = '/i';

type SlimUser = { id: string; first_name?: string | null; last_name?: string | null };

function cleanSlug(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Restituisce uno slug leggibile per un dipendente (es. "alexis" o "alexis-r").
 * Se il nome è ambiguo aggiunge l'iniziale del cognome; se ancora ambiguo usa i primi 8 char dell'ID.
 */
export function buildUserInviteSlug(user: SlimUser, allUsers: SlimUser[]): string {
  const first = cleanSlug(user.first_name);
  if (!first) return user.id.slice(0, 8);

  const others = allUsers.filter((u) => u.id !== user.id);
  const sameFirst = others.filter((u) => cleanSlug(u.first_name) === first);
  if (sameFirst.length === 0) return first;

  const lastInit = cleanSlug(user.last_name).charAt(0);
  const withInit = lastInit ? `${first}-${lastInit}` : first;
  const sameWithInit = others.filter(
    (u) => `${cleanSlug(u.first_name)}-${cleanSlug(u.last_name).charAt(0)}` === withInit
  );
  if (sameWithInit.length === 0) return withInit;

  return user.id.slice(0, 8);
}

/**
 * Link breve: `<origin>/i/<slug>` — non contiene PIN nell'URL.
 * La pagina /i/:slug risolve slug → user → token e redirige a /profilo?t=...
 */
export function buildShortInviteLink(user: SlimUser, allUsers: SlimUser[], origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const slug = buildUserInviteSlug(user, allUsers);
  return `${base}${PATH_INVITE}/${slug}`;
}
