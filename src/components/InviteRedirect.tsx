/**
 * Risolve /i/:slug → dipendente, salva il nome per il login,
 * poi reindirizza alla pagina di installazione PWA (/install).
 */
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { buildUserInviteSlug } from '../config/appPaths';
import { FLOW_INVITE_NAME_STORAGE_KEY } from '../constants/appSession';

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
  const navigate = useNavigate();

  useEffect(() => {
    const installPathBase = '/install';

    if (!slug) {
      window.location.href = installPathBase;
      return;
    }

    let cancelled = false;
    let redirected = false;

    async function resolve() {
      try {
        if (!supabase) {
          if (!cancelled) window.location.href = installPathBase;
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
            try {
              localStorage.setItem(FLOW_INVITE_NAME_STORAGE_KEY, loginName);
            } catch { /* ignore */ }
          }
          // Redirect to install page with user info
          const params = new URLSearchParams({ userId: matched.id, firstName: matched.first_name ?? '' });
          if (!cancelled && !redirected) {
            redirected = true;
            window.location.href = `${installPathBase}?${params.toString()}`;
          }
          return;
        }

        if (!cancelled && !redirected) {
          redirected = true;
          window.location.href = installPathBase;
        }
      } catch {
        if (!cancelled) window.location.href = installPathBase;
      }
    }

    void resolve();
    return () => { cancelled = true; };
  }, [slug, navigate]);

  return null;
}
