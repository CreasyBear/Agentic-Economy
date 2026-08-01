/// <reference types="vite/client" />

/**
 * Client-side mirror of the server local-E2E auth guard. The bypass is a
 * browser-test convenience only: it never creates a Clerk identity or grants
 * authority.
 */
export function isLocalE2EAuthBypassEnabled(): boolean {
  if (import.meta.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E !== 'true') {
    return false
  }

  if (import.meta.env.PROD) {
    throw new Error('VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E cannot be enabled in production builds.')
  }

  return true
}
