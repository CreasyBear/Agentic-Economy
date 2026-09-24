import { v } from 'convex/values'

export const armInteractiveCredentialExpiryResult = v.union(
  v.object({
    kind: v.literal('scheduled'),
    credentialGeneration: v.number(),
    expiresAt: v.number(),
    scheduleNonce: v.string(),
    scheduleRef: v.string(),
  }),
  v.object({
    kind: v.literal('duplicate'),
    credentialGeneration: v.number(),
    expiresAt: v.number(),
    scheduleNonce: v.string(),
    scheduleRef: v.string(),
  }),
  v.object({ kind: v.literal('expired') }),
  v.object({ kind: v.literal('duplicate_expired') }),
  v.object({ kind: v.literal('not_due') }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('credential_missing'),
      v.literal('credential_mismatch'),
      v.literal('binding_missing'),
      v.literal('binding_mismatch'),
      v.literal('credential_not_active'),
      v.literal('materialization_conflict'),
    ),
  }),
)

export const armInteractiveCredentialExpiryArgs = {
  bindingRef: v.string(),
  credentialRef: v.string(),
  expectedGeneration: v.number(),
} as const

export const expireInteractiveCredentialArgs = {
  ...armInteractiveCredentialExpiryArgs,
  expectedExpiresAt: v.number(),
  scheduleNonce: v.string(),
} as const

export type LifecycleArgs = Readonly<{
  bindingRef: string
  credentialRef: string
  expectedGeneration: number
}>

export type ExpireArgs = LifecycleArgs & Readonly<{
  expectedExpiresAt: number
  scheduleNonce: string
}>

export type ScheduledResult = Readonly<{
  kind: 'scheduled' | 'duplicate'
  credentialGeneration: number
  expiresAt: number
  scheduleNonce: string
  scheduleRef: string
}>

export type LifecycleResult =
  | ScheduledResult
  | Readonly<{ kind: 'expired' | 'duplicate_expired' | 'not_due' }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'credential_missing'
        | 'credential_mismatch'
        | 'binding_missing'
        | 'binding_mismatch'
        | 'credential_not_active'
        | 'materialization_conflict'
    }>

export const expireInteractiveCredentialResult = armInteractiveCredentialExpiryResult
