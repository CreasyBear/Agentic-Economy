import { v } from 'convex/values'
import { agentAccessPrincipalValue } from '../../agentAccess/principals/verification'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'

export const savedIdentityValue = v.object({
  kind: v.union(v.literal('ae_callable'), v.literal('external_listing')),
  identityRef: v.string(),
})
export const savedRecordValue = v.object({ identity: savedIdentityValue, createdAt: v.number() })
export const savedListResultValue = v.union(
  v.object({ kind: v.literal('available'), items: v.array(savedRecordValue) }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)
export const savedSaveResultValue = v.union(
  v.object({ kind: v.union(v.literal('saved'), v.literal('already_saved')), identity: savedIdentityValue, createdAt: v.number() }),
  v.object({ kind: v.literal('refused'), code: v.union(v.literal('unauthenticated'), v.literal('limit_reached'), v.literal('invalid_identity'), v.literal('not_found'), v.literal('source_unavailable')) }),
)
export const savedRemoveResultValue = v.union(
  v.object({ kind: v.union(v.literal('removed'), v.literal('not_found')) }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)
export const agentSavedArgs = {
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const
