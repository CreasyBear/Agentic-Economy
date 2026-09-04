import { z } from 'zod'

export type ProviderOffboardingBlocker =
  | 'routeable_operations_remain'
  | 'calls_remain'
  | 'obligations_remain'
  | 'payout_resolution_required'
  | 'connections_remain'
  | 'provider_cleanup_pending'
  | 'retention_policy_unbound'

export type ProviderOffboardingState =
  | 'Cancelled'
  | 'Freezing'
  | 'Draining'
  | 'Waiting for obligations'
  | 'Revoking connections'
  | 'Verifying cleanup'
  | 'Action required'
  | 'Retired'

export type ProviderOffboardingStatus = Readonly<{
  schemaVersion: 'provider_offboarding:v1'
  caseRef: string
  businessRef: string
  providerRef: string
  revision: number
  state: ProviderOffboardingState
  routeabilityFrozen: boolean
  blockerCodes: readonly ProviderOffboardingBlocker[]
  observedAt: number
  retentionPolicyVersion: string
  continuation?: Readonly<{ action: 'supply.offboarding.status' | 'supply.offboarding.resume' }> | undefined
}>

export type ProviderOffboardingCompletionFacts = Readonly<{
  routeableOperationCount: number
  activeOrUnknownCallCount: number
  unresolvedObligationCount: number
  activeOrCleanupPendingConnectionCount: number
  retentionPolicyVersion?: string | undefined
}>

export function providerOffboardingCompletion(
  facts: ProviderOffboardingCompletionFacts,
): Readonly<{ kind: 'complete' }> | Readonly<{ kind: 'blocked'; blocker: ProviderOffboardingBlocker }> {
  if (facts.routeableOperationCount > 0) return { kind: 'blocked', blocker: 'routeable_operations_remain' }
  if (facts.activeOrUnknownCallCount > 0) return { kind: 'blocked', blocker: 'calls_remain' }
  if (facts.unresolvedObligationCount > 0) return { kind: 'blocked', blocker: 'obligations_remain' }
  if (facts.activeOrCleanupPendingConnectionCount > 0) return { kind: 'blocked', blocker: 'connections_remain' }
  if (facts.retentionPolicyVersion === undefined || facts.retentionPolicyVersion.trim() === '') {
    return { kind: 'blocked', blocker: 'retention_policy_unbound' }
  }
  return { kind: 'complete' }
}

const blockerSchema = z.enum([
  'routeable_operations_remain',
  'calls_remain',
  'obligations_remain',
  'payout_resolution_required',
  'connections_remain',
  'provider_cleanup_pending',
  'retention_policy_unbound',
])

export const providerOffboardingStatusSchema: z.ZodType<ProviderOffboardingStatus> = z.strictObject({
  schemaVersion: z.literal('provider_offboarding:v1'),
  caseRef: z.string().min(1),
  businessRef: z.string().min(1),
  providerRef: z.string().min(1),
  revision: z.number().int().positive(),
  state: z.enum(['Cancelled', 'Freezing', 'Draining', 'Waiting for obligations', 'Revoking connections', 'Verifying cleanup', 'Action required', 'Retired']),
  routeabilityFrozen: z.boolean(),
  blockerCodes: z.array(blockerSchema),
  observedAt: z.number(),
  retentionPolicyVersion: z.string().min(1),
  continuation: z.strictObject({
    action: z.enum(['supply.offboarding.status', 'supply.offboarding.resume']),
  }).optional(),
})
