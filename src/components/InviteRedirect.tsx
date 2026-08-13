/**
 * Risolve /i/:slug → dipendente, salva nome + PIN,
 * poi reindirizza:
 * - Su iOS (iPhone/iPad): alla pagina /install con userId e firstName
 * - Altri dispositivi: direttamente al login via /profilo?t=TOKEN
 */
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { buildUserInviteSlug, buildProfiloAccessLink, PATH_PROFILO } from '../config/appPaths';

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
          // Login diretto con token
          const pin = matched.pin?.replace(/\D/g, '').slice(0, 4);
          const tokenUrl = buildProfiloAccessLink(matched.id, {
            pin: pin && pin.length === 4 ? pin : undefined,
            displayName: `${matched.first_name ?? ''} ${matched.last_name ?? ''}`.trim(),
          });
          if (!cancelled && !redirected) {
            redirected = true;
            window.location.href = tokenUrl;
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
