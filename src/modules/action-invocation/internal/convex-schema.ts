import { defineTable } from 'convex/server'
import { v } from 'convex/values'

export const actionInvocationOriginValue = v.union(
  v.object({ kind: v.literal('request_owned'), requestRef: v.string(), revision: v.number() }),
  v.object({ kind: v.literal('standalone'), callerRef: v.string(), principalRef: v.string() }),
)

export const invocationActorValue = v.object({ callerRef: v.string(), principalRef: v.string() })
export const invocationFreshnessValue = v.union(
  v.object({ state: v.literal('not_observed') }),
  v.object({ state: v.literal('current'), observedAt: v.string() }),
)
export const invocationControlValue = v.union(
  v.object({ state: v.literal('awaiting_authority') }),
  v.object({ state: v.literal('authorized'), decidedAt: v.string() }),
  v.object({
    state: v.literal('leased'), attemptRef: v.string(), leaseOwner: v.string(),
    effectGeneration: v.number(), leaseExpiresAt: v.string(),
    release: v.union(v.literal('not_started'), v.literal('not_released'), v.literal('possibly_released')),
  }),
  v.object({ state: v.literal('in_progress') }),
  v.object({ state: v.literal('retryable'), reason: v.literal('pre_release_failure') }),
  v.object({ state: v.literal('reconciliation_required'), attemptRef: v.string() }),
  v.object({ state: v.literal('terminal') }),
  v.object({ state: v.literal('cancelled'), effect: v.literal('not_released') }),
  v.object({ state: v.literal('invalidated'), reason: v.string() }),
)
export const attemptReleaseValue = v.union(
  v.object({ state: v.literal('not_released') }),
  v.object({ state: v.literal('released'), observedAt: v.string() }),
  v.object({ state: v.literal('possibly_released') }),
)
export const durableAttemptOutcomeValue = v.union(
  v.object({ state: v.literal('running') }),
  v.object({
    state: v.literal('returned'),
    businessOutcome: v.union(
      v.literal('queued_communication'), v.literal('refused'),
      v.literal('not_found'), v.literal('completed'),
    ),
  }),
  v.object({
    state: v.literal('failed'), retry: v.literal('safe_before_release'),
    errorDigest: v.optional(v.string()),
  }),
  v.object({
    state: v.literal('uncertain'), retry: v.literal('reconcile_before_retry'),
    errorDigest: v.optional(v.string()), reconciliationRequiredAt: v.string(),
  }),
  v.object({
    state: v.literal('timed_out'), timeoutMs: v.number(),
    retry: v.literal('reconcile_before_retry'), reconciliationRequiredAt: v.string(),
  }),
  v.object({ state: v.literal('reconciled_not_released'), retry: v.literal('safe_after_reconciliation'), observedAt: v.string() }),
  v.object({ state: v.literal('reconciled_released'), externalOutcome: v.literal('unknown'), observedAt: v.string() }),
)
export const attemptTransitionValue = v.object({
  attemptRef: v.string(),
  effectGeneration: v.number(),
  priorDigest: v.string(),
  nextDigest: v.string(),
  priorReleaseState: v.union(
    v.literal('not_released'), v.literal('released'), v.literal('possibly_released'),
  ),
  nextReleaseState: v.union(
    v.literal('not_released'), v.literal('released'), v.literal('possibly_released'),
  ),
  priorOutcomeState: v.union(
    v.literal('running'), v.literal('returned'), v.literal('failed'), v.literal('uncertain'),
    v.literal('timed_out'), v.literal('reconciled_not_released'), v.literal('reconciled_released'),
  ),
  nextOutcomeState: v.union(
    v.literal('running'), v.literal('returned'), v.literal('failed'), v.literal('uncertain'),
    v.literal('timed_out'), v.literal('reconciled_not_released'), v.literal('reconciled_released'),
  ),
})
export const authorityBindingValue = v.object({
  reference: v.string(), invocationRef: v.string(), actor: invocationActorValue, origin: actionInvocationOriginValue,
  invocationVersion: v.number(), actionId: v.string(), contractVersion: v.string(),
  digest: v.string(), targetDigest: v.string(), consequence: v.string(),
  limits: v.record(v.string(), v.number()), expiresAt: v.string(),
})
export const durableControlProjectionValue = v.object({
  invocationRef: v.string(), invocationVersion: v.number(),
  environment: v.literal('MOCK/DEVELOPMENT ONLY'), persistence: v.literal('durable_control'),
  origin: actionInvocationOriginValue, owner: invocationActorValue,
  action: v.object({ id: v.string(), contractVersion: v.string() }),
  desired: v.object({ state: v.literal('invoke') }),
  authority: v.optional(v.object({ reference: v.string(), expiresAt: v.string() })),
  freshness: invocationFreshnessValue, control: invocationControlValue,
})

export const actionInvocationTables = {
  actionInvocationControls: defineTable({
    invocationRef: v.string(),
    invocationVersion: v.number(),
    control: durableControlProjectionValue,
    sourceRef: v.string(),
    sourceResultRef: v.optional(v.string()),
    sourceResultDigest: v.optional(v.string()),
    terminalBusinessOutcome: v.optional(v.string()),
    preparedMaterialDigest: v.optional(v.string()),
    preparedTargetDigest: v.optional(v.string()),
    consequence: v.optional(v.string()),
    dataLimitSummary: v.optional(v.record(v.string(), v.number())),
    authorityReference: v.optional(v.string()),
    authorityBinding: v.optional(authorityBindingValue),
    authorityDecisionAt: v.optional(v.string()),
    currentAttemptRef: v.optional(v.string()),
    currentEffectGeneration: v.optional(v.number()),
    currentLeaseOwner: v.optional(v.string()),
    currentLeaseExpiresAt: v.optional(v.string()),
    updatedAt: v.string(),
  })
    .index('by_invocationRef', ['invocationRef'])
    .index('by_control_owner_principalRef_and_invocationRef', ['control.owner.principalRef', 'invocationRef'])
    .index('by_sourceRef_and_invocationRef', ['sourceRef', 'invocationRef']),

  actionInvocationAttempts: defineTable({
    invocationRef: v.string(),
    attemptRef: v.string(),
    attemptNumber: v.number(),
    effectGeneration: v.number(),
    actor: invocationActorValue,
    idempotency: v.object({
      operationKey: v.string(), materialInputDigest: v.string(), effectIdentity: v.string(),
    }),
    lease: v.object({ owner: v.string(), expiresAt: v.string() }),
    release: attemptReleaseValue,
    outcome: durableAttemptOutcomeValue,
    recordedAt: v.string(),
  })
    .index('by_invocationRef_and_attemptNumber', ['invocationRef', 'attemptNumber'])
    .index('by_invocationRef_and_attemptRef', ['invocationRef', 'attemptRef'])
    .index('by_idempotency_effectIdentity_and_attemptRef', ['idempotency.effectIdentity', 'attemptRef']),

  actionInvocationHistory: defineTable({
    invocationRef: v.string(),
    commandId: v.string(),
    commandDigest: v.string(),
    commandResult: v.union(v.literal('applied'), v.literal('duplicate')),
    invocationVersion: v.number(),
    effectGeneration: v.optional(v.number()),
    kind: v.string(),
    current: v.boolean(),
    actorRef: v.optional(v.string()),
    sourceEvidenceRef: v.optional(v.string()),
    observation: v.optional(v.object({
      kind: v.literal('release_observation'),
      release: v.union(v.literal('not_released'), v.literal('released'), v.literal('possibly_released')),
      evidenceDigest: v.string(),
    })),
    attemptTransition: v.optional(attemptTransitionValue),
    recordedAt: v.string(),
  })
    .index('by_invocationRef_and_commandId', ['invocationRef', 'commandId'])
    .index('by_invocationRef_and_invocationVersion', ['invocationRef', 'invocationVersion'])
    .index('by_invocationRef_and_effectGeneration', ['invocationRef', 'effectGeneration']),
} as const
