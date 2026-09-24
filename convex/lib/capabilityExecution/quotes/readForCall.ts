import { v, type Infer } from 'convex/values'

import { degradeBackend } from '@/lib/observability/degrade-backend'
import { isBoundedJsonValue } from '@/modules/capability-contract/public'
import { jsonObject } from '@/modules/capability-execution/convex'

import { principalValue } from '../callLifecycle/contracts'
import { invocationMaterial } from './contracts'
import type { QueryCtx } from '../../../_generated/server'

export const readForCallArgs = {
  principal: principalValue,
  quoteRef: v.string(),
  idempotencyKey: v.string(),
  now: v.number(),
}

export const readForCallResult = invocationMaterial

type ReadForCallArgs = {
  principal: Infer<typeof principalValue>
  quoteRef: string
  idempotencyKey: string
  now: number
}

export async function readForCallHandler(
  ctx: QueryCtx,
  args: ReadForCallArgs,
): Promise<Infer<typeof invocationMaterial>> {
  const row = await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', (query) => query.eq('quoteRef', args.quoteRef))
    .unique()
  if (row === null
    || row.principalId !== args.principal.principalId
    || row.accountRef !== args.principal.ownerId
    || row.credentialId !== args.principal.credentialId
    || row.applicationRef !== args.principal.applicationRef
    || row.environment !== args.principal.environment) return null
  if (row.state === 'consumed') {
    if (row.consumedCallRef === undefined) return null
    const consumedCallRef = row.consumedCallRef
    const call = await ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', consumedCallRef))
      .unique()
    if (call === null
      || call.quoteRef !== row.quoteRef
      || call.credentialId !== args.principal.credentialId
      || call.idempotencyKey !== args.idempotencyKey) return null
  } else {
    if (row.state !== 'issued' || row.expiresAt <= args.now) return null
    // An unused Quote binds the policy decision that created it. Refuse its
    // stale version before live Tool inspection; accepted replay above retains
    // the original purchase even after an owner changes future spending limits.
    const current = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', q => q.eq('principalId', row.principalId)).unique()
    if (current === null || current.lifecycle !== 'active'
      || current.ownerId !== row.accountRef || current.credentialId !== row.credentialId
      || current.grantGeneration !== row.grantGeneration
      || current.spendingPolicyDigest !== row.grantPolicyDigest) return null
  }
  try {
    const input = JSON.parse(row.normalizedInputJson) as unknown
    return isBoundedJsonValue(input) && typeof input === 'object' && input !== null && !Array.isArray(input)
      ? {
          ...(row.state === 'consumed' && row.consumedCallRef !== undefined ? { consumedCallRef: row.consumedCallRef } : {}),
          toolRef: row.toolRef,
          input: input as Record<string, Infer<typeof jsonObject>[string]>,
          decisionPrice: { currency: 'AUD' as const, exponent: 6 as const, units: row.decisionAudUnits },
          quoteRef: row.quoteRef,
          evidenceDigest: row.evidenceDigest,
          ...(row.x402RequirementDigest === undefined
            ? {}
            : { x402RequirementDigest: row.x402RequirementDigest }),
        }
      : null
  } catch (cause) {
    return degradeBackend(cause, null, { site: 'readForCall', reason: 'invalid_response' })
  }
}
