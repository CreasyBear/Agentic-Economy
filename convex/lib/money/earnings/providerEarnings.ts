import { v } from 'convex/values'
import { agentAccessPrincipalValue } from '../../../agentAccessPrincipals'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'

export const ownerProviderEarningsArgs = {}
export const ownerProviderEarningsResultValue = v.union(
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)
export const agentProviderEarningsArgs = {
  agentPrincipal: agentAccessPrincipalValue,
  currency: v.optional(v.string()),
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
}
export const agentProviderEarningsResultValue = v.object({
  kind: v.literal('error'),
  code: v.literal('source_unavailable'),
})

export async function readOwnerProviderEarningsHandler(ctx: QueryCtx) {
    const actor = await resolveBusinessActor(ctx)
    return actor.kind === 'authenticated_owner'
      ? { kind: 'not_found' as const }
      : { kind: 'error' as const, code: 'unauthenticated' as const }
}

export async function readAgentProviderEarningsHandler() {
  return { kind: 'error' as const, code: 'source_unavailable' as const }
}
