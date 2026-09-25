import { v } from 'convex/values'
import {
  attemptTransitionValue,
  attemptReleaseValue,
  authorityBindingValue,
  durableControlProjectionValue,
  durableAttemptOutcomeValue,
  executionActorValue,
} from '../../../../src/modules/action-execution/public'

const exactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const executionLimitsValue = v.record(v.string(), v.union(v.number(), exactAmountValue))

export const controlRow = v.object({
  executionRef: v.string(), executionVersion: v.number(), sourceRef: v.string(),
  sourceResultRef: v.optional(v.string()), sourceResultDigest: v.optional(v.string()),
  terminalBusinessOutcome: v.optional(v.string()),
  terminalResultReferenceable: v.optional(v.boolean()),
  control: durableControlProjectionValue,
  authorityBinding: v.optional(authorityBindingValue),
  preparedMaterialDigest: v.optional(v.string()), preparedTargetDigest: v.optional(v.string()),
  consequence: v.optional(v.string()), dataLimitSummary: v.optional(executionLimitsValue),
  authorityDecisionAt: v.optional(v.string()), currentAttemptRef: v.optional(v.string()),
  currentEffectGeneration: v.optional(v.number()), currentLeaseOwner: v.optional(v.string()),
  currentLeaseExpiresAt: v.optional(v.string()), updatedAt: v.string(),
})
export const attemptRow = v.object({
  executionRef: v.string(), attemptRef: v.string(), attemptNumber: v.number(),
  effectGeneration: v.number(), actor: executionActorValue,
  idempotency: v.object({
    operationKey: v.string(), materialInputDigest: v.string(), effectIdentity: v.string(),
  }),
  lease: v.object({ owner: v.string(), expiresAt: v.string() }),
  release: attemptReleaseValue, outcome: durableAttemptOutcomeValue,
  recordedAt: v.string(),
})
const historyFields = {
  executionRef: v.string(),
  commandId: v.string(),
  commandDigest: v.string(),
  commandResult: v.union(v.literal('applied'), v.literal('duplicate')),
  kind: v.string(),
  effectGeneration: v.optional(v.number()),
  actorRef: v.optional(v.string()),
  sourceEvidenceRef: v.optional(v.string()),
  observation: v.optional(v.object({
    kind: v.literal('release_observation'),
    release: v.union(v.literal('not_released'), v.literal('released'), v.literal('possibly_released')),
    evidenceDigest: v.string(),
  })),
  attemptTransition: v.optional(attemptTransitionValue),
}
const historyInput = v.object(historyFields)
export const historyRow = v.object({
  ...historyFields,
  executionVersion: v.number(),
  current: v.boolean(),
  recordedAt: v.string(),
})
export const persistControlResult = v.union(
  v.object({
    kind: v.union(v.literal('applied'), v.literal('duplicate')),
    executionVersion: v.number(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('stale_execution_version'),
      v.literal('effect_generation_stale'),
      v.literal('lease_not_current'),
      v.literal('command_identity_conflict'),
      v.literal('reconciliation_required'),
    ),
  }),
)
export const actionExecutionTransactArgs = {
  commandId: v.string(),
  commandDigest: v.string(),
  expectedExecutionVersion: v.union(v.number(), v.null()),
  expectedEffectGeneration: v.optional(v.number()),
  row: controlRow,
  currentAttemptWrite: v.optional(attemptRow),
  history: historyInput,
} as const
export const lateObservationArgs = {
  executionRef: v.string(),
  commandId: v.string(),
  effectGeneration: v.number(),
  actorRef: v.string(),
  sourceEvidenceRef: v.string(),
  release: v.union(v.literal('not_released'), v.literal('released'), v.literal('possibly_released')),
  evidenceDigest: v.string(),
  recordedAt: v.string(),
}
export const executionRefArgs = { executionRef: v.string() }
export const readExecutionAttemptsArgs = { executionRef: v.string(), limit: v.number() }
export const readExecutionAttemptArgs = { executionRef: v.string(), attemptRef: v.string() }
export const readExecutionHistoryArgs = { executionRef: v.string(), afterVersion: v.number(), limit: v.number() }
export const readExecutionHistoryCommandArgs = { executionRef: v.string(), commandId: v.string() }
export const readControlResult = v.union(controlRow, v.null())
export const readAttemptsResult = v.array(attemptRow)
export const readAttemptResult = v.union(attemptRow, v.null())
export const readHistoryResult = v.array(historyRow)
export const readHistoryCommandResult = v.union(historyRow, v.null())
