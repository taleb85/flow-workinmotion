import { supabase } from '../lib/supabase';

/** Solo `import.meta.env.DEV`: avvisa se il client Supabase non è configurato (variabili `VITE_*` mancanti). */
export function DevMissingEnvBanner() {
  if (!import.meta.env.DEV || supabase !== null) return null;

  return (
    <div
      role="status"
      className="fixed bottom-0 left-0 right-0 z-[350] border-t border-amber-500/50 bg-amber-950/95 px-3 py-2 text-center text-[0.75rem] leading-snug text-amber-100 shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
    >
      <strong className="font-semibold text-amber-50">Dev locale:</strong>{' '}
      mancano le variabili Supabase. Copia{' '}
      <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.6875rem]">.env.example</code>
      {' '}in{' '}
      <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.6875rem]">.env</code>
      {' '}o{' '}
      <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.6875rem]">.env.local</code>
      {' '}e imposta{' '}
      <code className="font-mono text-[0.6875rem]">VITE_SUPABASE_URL</code>
      {' '}e{' '}
      <code className="font-mono text-[0.6875rem]">VITE_SUPABASE_ANON_KEY</code>
      {' '}(o{' '}
      <code className="font-mono text-[0.6875rem]">VITE_SUPABASE_PUBLISHABLE_KEY</code>
      ). Riavvia{' '}
      <code className="font-mono text-[0.6875rem]">npm run dev</code>.
    </div>
  );
}
