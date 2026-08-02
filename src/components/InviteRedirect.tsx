/**
 * Risolve /i/:slug → dipendente, salva nome + PIN,
 * poi reindirizza direttamente al login (l'app si usa subito in Safari, 
 * l'utente la installerà sulla Home quando Safari lo propone).
 */
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { buildUserInviteSlug } from '../config/appPaths';
import { FLOW_INVITE_NAME_STORAGE_KEY, FLOW_INVITE_PIN_STORAGE_KEY } from '../constants/appSession';
import { PATH_PROFILO } from '../config/appPaths';

function cleanSlug(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type SlimUser = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  pin?: string | null;
  tenant_id?: string | null;
};

export default function InviteRedirect() {
  const { slug } = useParams<{ slug: string }>();

  useEffect(() => {
    if (!slug) {
      window.location.href = PATH_PROFILO;
      return;
    }

    let cancelled = false;
    let redirected = false;

    async function resolve() {
      try {
        if (!supabase) {
          if (!cancelled) window.location.href = PATH_PROFILO;
          return;
        }

        const usersRes = await supabase
          .from('users')
          .select('id, first_name, last_name, pin, tenant_id')
          .eq('status', 'active');

        if (cancelled) return;

        const allUsers: SlimUser[] = usersRes.data ?? [];

        const usersByTenant = new Map<string, SlimUser[]>();
        for (const u of allUsers) {
          const tid = u.tenant_id ?? '_none';
          if (!usersByTenant.has(tid)) usersByTenant.set(tid, []);
          usersByTenant.get(tid)!.push(u);
        }

        let matched: SlimUser | undefined;

        for (const [, tenantUsers] of usersByTenant) {
          const found = tenantUsers.find(
            (u) => buildUserInviteSlug(u, tenantUsers) === cleanSlug(slug)
          );
          if (found) {
            matched = found;
            break;
          }
        }

        if (matched) {
          const loginName = `${matched.first_name ?? ''} ${matched.last_name ?? ''}`.trim();
          if (loginName) {
            try { localStorage.setItem(FLOW_INVITE_NAME_STORAGE_KEY, loginName); } catch { /* ignore */ }
          }
          // Salva anche il PIN se presente così il login è istantaneo
          if (matched.pin && matched.pin.replace(/\D/g, '').length === 4) {
            try { localStorage.setItem(FLOW_INVITE_PIN_STORAGE_KEY, matched.pin.replace(/\D/g, '')); } catch { /* ignore */ }
          }
          if (!cancelled && !redirected) {
            redirected = true;
            window.location.href = PATH_PROFILO;
          }
          return;
        }

        if (!cancelled && !redirected) {
          redirected = true;
          window.location.href = PATH_PROFILO;
        }
      } catch {
        if (!cancelled) window.location.href = PATH_PROFILO;
      }
    }

    void resolve();
    return () => { cancelled = true; };
  }, [slug]);

  return null;
}
