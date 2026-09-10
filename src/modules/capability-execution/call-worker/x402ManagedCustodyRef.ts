/**
 * Shared with x402Route.ts (which exports it as part of the call-worker's
 * public transport surface) and x402Authorization.ts (which uses it to
 * identify the managed custody credential). Kept in its own leaf file so
 * neither of those two needs to import the other for it.
 */

/** The only production x402 credential locator. It identifies the CDP account name, not a secret. */
export const X402_MANAGED_CUSTODY_REF = 'env:AE_X402_CDP_ACCOUNT_NAME' as const
