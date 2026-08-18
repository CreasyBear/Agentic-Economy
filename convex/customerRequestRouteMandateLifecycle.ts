import type { MutationCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

type RevocationReason = 'request_revised' | 'route_generation_superseded'

export async function supersedeCurrentRouteMandate(
  _db: MutationCtx['db'],
  _input: Readonly<{
    requestId: string
    nextRequestRevision: number
    nextGenerationRef?: string
    reason: RevocationReason
  }>,
): Promise<{ kind: 'not_active' } | { kind: 'already_revoked'; mandateRef: string } | {
  kind: 'revoked'
  mandateRef: string
  revocationRef: string
}> {
  return unlistedCustomerRequestTables()
}
