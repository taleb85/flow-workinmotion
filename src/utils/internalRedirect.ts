/**
 * Dopo login: torna a `/app`, `/admin`, ecc. solo se path interno (no open redirect).
 */
export function safeInternalRedirectPath(state: unknown, fallback = '/app'): string {
  const pathname = (state as { from?: { pathname?: string } } | null)?.from?.pathname;
  if (
    typeof pathname === 'string' &&
    pathname.startsWith('/') &&
    !pathname.startsWith('//') &&
    !pathname.includes('://')
  ) {
    return pathname;
  }
  return fallback;
}
