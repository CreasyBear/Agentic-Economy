import { v } from 'convex/values'
import { normalizedAgentAccessGrantValue } from '@/modules/agent-access/public'
import { serviceAssertion } from '../../../serviceAssertion'

export const environment = v.union(v.literal('sandbox'), v.literal('production'))
export const grantWriteResult = v.union(
  v.object({
    kind: v.literal('recorded'),
    grantRef: v.string(),
    generation: v.number(),
    spendingPolicyDigest: v.string(),
    lifecycle: v.union(v.literal('active'), v.literal('revoked'), v.literal('expired')),
    expiresAt: v.number(),
  }),
  v.object({
    kind: v.literal('replayed'),
    grantRef: v.string(),
    generation: v.number(),
    spendingPolicyDigest: v.string(),
    lifecycle: v.union(v.literal('active'), v.literal('revoked'), v.literal('expired')),
    expiresAt: v.number(),
  }),
  v.object({ kind: v.literal('conflict'), code: v.union(v.literal('grant_exists'), v.literal('generation_stale'), v.literal('grant_material_invalid')) }),
)
export const serverServiceAuth = serviceAssertion
export const serverAuthRefusal = v.object({
  kind: v.literal('refused'),
  code: v.literal('authentication_required'),
})
export const grantWriteForServerResult = v.union(grantWriteResult, serverAuthRefusal)
export const grantRevocationResult = v.union(
  v.object({ kind: v.literal('revoked'), grantRef: v.string(), generation: v.number() }),
  v.object({ kind: v.literal('already_revoked'), grantRef: v.string(), generation: v.number() }),
  v.object({ kind: v.literal('not_found'), grantRef: v.string() }),
  v.object({ kind: v.literal('binding_mismatch'), grantRef: v.string() }),
)


export const grantReadResult = v.union(normalizedAgentAccessGrantValue, v.null())
export const publicGrantReadback = v.object({
  principalId: v.string(),
  credentialId: v.string(),
  applicationRef: v.string(),
  environment,
  authorityMode: v.union(v.literal('read_only'), v.literal('approval_required'), v.literal('spending_policy'), v.literal('unrestricted_test_only')),
  toolAccess: v.union(v.literal('all_admitted'), v.literal('selected_tools')),
  toolRefs: v.array(v.string()),
  lifecycle: v.union(v.literal('active'), v.literal('revoked'), v.literal('expired')),
  expiresAt: v.number(),
  budget: v.object({
    maximumSpendPerCall: v.object({ currency: v.string(), units: v.string(), exponent: v.number() }),
    maximumDailySpend: v.object({ currency: v.string(), units: v.string(), exponent: v.number() }),
    maximumMonthlySpend: v.object({ currency: v.string(), units: v.string(), exponent: v.number() }),
    maximumConcurrentCalls: v.number(),
  }),
  rate: v.object({
    maximumCallsPerMinute: v.number(),
    maximumCallsPerHour: v.number(),
  }),
})
