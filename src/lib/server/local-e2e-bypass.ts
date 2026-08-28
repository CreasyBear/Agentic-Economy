/**
 * Canonical server-side check for the local end-to-end Clerk-auth bypass
 * flag. Every server file (server functions, module `*.functions.ts`
 * seams, API routes) that needs to know whether local E2E auth bypass is
 * active MUST call this helper instead of reading
 * `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` directly, so the fail-loud
 * production guard below is enforced everywhere, not just at a few
 * call sites.
 *
 * Returns `true` only when `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'`
 * and the process is not running in production. If the flag is enabled
 * while `NODE_ENV === 'production'`, this throws rather than silently
 * bypassing authentication in a production deployment.
 *
 * `src/routes/__root.tsx` is client-rendered and must NOT import this
 * module; it keeps its own `import.meta.env`-based check that mirrors
 * this helper's semantics for the browser bundle.
 */
/**
 * Fixed principal every local-E2E bypass surface impersonates, so bypass
 * identity stays one shared seam instead of per-file literals.
 */
export const LOCAL_E2E_OPERATOR_PRINCIPAL = 'local-e2e-operator' as const

export function isLocalE2EAuthBypassEnabled(): boolean {
  if (process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E !== 'true') {
    return false
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E cannot be enabled in production.')
  }

  return true
}
