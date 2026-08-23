import {
  ANSWER_OPERATION_CANDIDATE_LIMIT,
  AnswerOperationCandidateSchema,
  AnswerOperationComparisonSchema,
  AnswerOperationOutcomeSchema,
  AnswerOperationPlanSchema,
  AnswerOperationSelectionSchema,
  AnswerRequestedIntentsSchema,
  AnswerRequestInterpretationSchema,
} from '@/modules/answer/answer-schema'
import { isValidFrozenAnswerOperationArtifacts } from '@/modules/answer/answer-event-schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { safeJsonStringify } from '@/modules/common/safe-json-stringify'

import {
  AnswerToolIdValues,
  AnswerTurnCheckpointRouteValues,
  FollowUpIntentValues,
} from '../answer-thread.values'
import {
  AnswerContinuationSourceSchema,
  AnswerPendingDecisionSchema,
  type AnswerTurnCheckpoint,
  type AnswerTurnCheckpointRoute,
  type FollowUpIntent,
} from '../answer-thread.schema'
export const ANSWER_TURN_CHECKPOINT_SCHEMA_VERSION = 1 as const
export const MAX_ANSWER_TURN_CHECKPOINT_BYTES = 256 * 1024
const MAX_CHECKPOINT_TOOL_CALLS = 16
const MAX_CHECKPOINT_TOOL_DIGESTS = 16
const MAX_CHECKPOINT_MODEL_REQUESTS = 16

const MAX_CHECKPOINT_MESSAGES = 32
const MAX_CHECKPOINT_OPERATION_CANDIDATES = ANSWER_OPERATION_CANDIDATE_LIMIT
const encoder = new TextEncoder()


const FORBIDDEN_REPLAY_KEYS = /(?:api[_-]?key|authorization|bearer|credential|password|private[_-]?key|secret|token)/i

type SerializedCheckpoint = Readonly<{
  checkpointJson: string
  checkpointDigest: string
}>

export function serializeAnswerTurnCheckpoint(
  checkpoint: AnswerTurnCheckpoint,
): SerializedCheckpoint | null {
  if (!isAnswerTurnCheckpointShape(checkpoint)) return null
  const checkpointJson = safeJsonStringify(checkpoint)
  if (!isBoundedJson(checkpointJson)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(checkpointJson)
  } catch {
    return null
  }
  if (!isRecord(parsed) || hasForbiddenReplayKey(parsed)) return null
  return {
    checkpointJson,
    checkpointDigest: canonicalDigest(parsed).toString(),
  }
}

export function parseAnswerTurnCheckpoint(
  checkpointJson: string,
  checkpointDigest: string,
): AnswerTurnCheckpoint | null {
  if (!isBoundedJson(checkpointJson)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(checkpointJson)
  } catch {
    return null
  }
  if (!isAnswerTurnCheckpointShape(parsed) || hasForbiddenReplayKey(parsed)) return null
  try {
    if (canonicalDigest(parsed).toString() !== checkpointDigest) return null
  } catch {
    return null
  }
  return parsed
}

function isAnswerTurnCheckpointShape(value: unknown): value is AnswerTurnCheckpoint {
  if (!isRecord(value)) return false
  if (
    value.schemaVersion !== ANSWER_TURN_CHECKPOINT_SCHEMA_VERSION
    || typeof value.reservationKey !== 'string'
    || typeof value.requestDigest !== 'string'
    || typeof value.generation !== 'number'
    || !Number.isInteger(value.generation)
    || value.generation < 0
    || typeof value.threadId !== 'string'
    || typeof value.turnId !== 'string'
    || typeof value.turnSeq !== 'number'
    || !Number.isInteger(value.turnSeq)
    || value.turnSeq < 0
    || typeof value.stepOrdinal !== 'number'
    || !Number.isInteger(value.stepOrdinal)
    || value.stepOrdinal < 1
    || (value.parentCheckpointDigest !== undefined
      && (typeof value.parentCheckpointDigest !== 'string' || value.parentCheckpointDigest.length === 0))
    || (Object.hasOwn(value, 'route') && !isAnswerTurnCheckpointRoute(value.route))
    || (Object.hasOwn(value, 'intent') && !isFollowUpIntent(value.intent))
    || typeof value.query !== 'string'
    || !isStringArray(value.priorAllowedSlugs)
    || !isRecordArray(value.toolCalls)
    || value.toolCalls.length > MAX_CHECKPOINT_TOOL_CALLS
    || !isRecordArray(value.toolCallDigests)
    || value.toolCallDigests.length > MAX_CHECKPOINT_TOOL_DIGESTS
    || (value.operationCandidates !== undefined && !Array.isArray(value.operationCandidates))
    || (Array.isArray(value.operationCandidates) && value.operationCandidates.length > MAX_CHECKPOINT_OPERATION_CANDIDATES)
    || !isRecordArray(value.modelRequests)
    || value.modelRequests.length > MAX_CHECKPOINT_MODEL_REQUESTS
    || typeof value.replayMessagesJson !== 'string'
  ) {
    return false
  }

  if (value.reservationKey.length === 0 || value.requestDigest.length === 0
    || value.threadId.length === 0 || value.turnId.length === 0 || value.query.length === 0
    || (value.stepOrdinal === 1 && value.parentCheckpointDigest !== undefined)
    || (value.stepOrdinal > 1 && value.parentCheckpointDigest === undefined)
    || (value.selectedOperationRef !== undefined
      && (typeof value.selectedOperationRef !== 'string' || value.selectedOperationRef.length === 0))
    || (value.selectedToolId !== undefined
      && (!isAnswerToolId(value.selectedToolId) || value.selectedToolId.length === 0))
    || (value.descriptorDigest !== undefined
      && (typeof value.descriptorDigest !== 'string' || value.descriptorDigest.length === 0))
    || (value.selectedInputDigest !== undefined
      && (typeof value.selectedInputDigest !== 'string' || value.selectedInputDigest.length === 0))
    || (value.operationCandidatesDigest !== undefined
      && (typeof value.operationCandidatesDigest !== 'string' || value.operationCandidatesDigest.length === 0))
    || (value.resultDigest !== undefined
      && (typeof value.resultDigest !== 'string' || value.resultDigest.length === 0))
    || (value.operationCandidates !== undefined && value.operationCandidatesDigest === undefined)
    || (value.operationCandidatesDigest !== undefined && value.operationCandidates === undefined)
    || (value.selectedOperationRef !== undefined && value.descriptorDigest === undefined)
    || (value.interpretation !== undefined
      && !AnswerRequestInterpretationSchema.safeParse(value.interpretation).success)
    || (value.requestedIntents !== undefined
      && !isRequestedIntentArray(value.requestedIntents))
    || (value.continuationSource !== undefined
      && !AnswerContinuationSourceSchema.safeParse(value.continuationSource).success)
    || (value.pendingDecision !== undefined
      && !AnswerPendingDecisionSchema.safeParse(value.pendingDecision).success)) {
    return false
  }

  const parsedCandidates = value.operationCandidates === undefined
    ? undefined
    : AnswerOperationCandidateSchema.array().max(ANSWER_OPERATION_CANDIDATE_LIMIT).safeParse(value.operationCandidates)
  if (value.operationCandidates !== undefined
    && (parsedCandidates === undefined || !parsedCandidates.success)) {
    return false
  }
  const operationCandidates = parsedCandidates?.success ? parsedCandidates.data : undefined
  const operationCandidatesDigest =
    typeof value.operationCandidatesDigest === 'string'
      ? value.operationCandidatesDigest
      : undefined
  const parsedComparison = value.operationComparison === undefined
    ? undefined
    : AnswerOperationComparisonSchema.safeParse(value.operationComparison)
  if (value.operationComparison !== undefined
    && (parsedComparison === undefined || !parsedComparison.success)) {
    return false
  }
  const operationComparison = parsedComparison?.success ? parsedComparison.data : undefined
  const parsedPlan = value.operationPlan === undefined
    ? undefined
    : AnswerOperationPlanSchema.safeParse(value.operationPlan)
  if (value.operationPlan !== undefined
    && (parsedPlan === undefined || !parsedPlan.success)) {
    return false
  }
  const operationPlan = parsedPlan?.success ? parsedPlan.data : undefined
  if (
    operationComparison !== undefined
    && encoder.encode(JSON.stringify(operationComparison)).byteLength > MAX_ANSWER_TURN_CHECKPOINT_BYTES
    || operationPlan !== undefined
    && encoder.encode(JSON.stringify(operationPlan)).byteLength > MAX_ANSWER_TURN_CHECKPOINT_BYTES
  ) {
    return false
  }
  const parsedOutcome = value.operationOutcome === undefined
    ? undefined
    : AnswerOperationOutcomeSchema.safeParse(value.operationOutcome)
  if (value.operationOutcome !== undefined
    && (parsedOutcome === undefined || !parsedOutcome.success)) {
    return false
  }
  const operationOutcome = parsedOutcome?.success ? parsedOutcome.data : undefined
  const parsedSelection = value.operationSelection === undefined
    ? undefined
    : AnswerOperationSelectionSchema.safeParse(value.operationSelection)
  if (value.operationSelection !== undefined
    && (parsedSelection === undefined || !parsedSelection.success)) {
    return false
  }
  const operationSelection = parsedSelection?.success ? parsedSelection.data : undefined
  if (operationCandidates !== undefined) {
    for (const candidate of operationCandidates) {
      if (candidate.inputJsonSchema !== undefined
        && new TextEncoder().encode(JSON.stringify(candidate.inputJsonSchema)).byteLength
          > MAX_ANSWER_TURN_CHECKPOINT_BYTES) {
        return false
      }
    }
  }
  if (!isValidFrozenAnswerOperationArtifacts({
    candidates: operationCandidates,
    candidateSetDigest: operationCandidatesDigest,
    comparison: operationComparison,
    outcome: operationOutcome,
    plan: operationPlan,
    selection: operationSelection,
    toolCalls: value.toolCalls,
    requireToolEvidence: operationOutcome !== undefined,
  })) {
    return false
  }
  if (operationSelection !== undefined) {
    if (value.selectedOperationRef !== operationSelection.operationRef
      || value.selectedToolId !== operationSelection.toolId
      || (value.resultDigest !== undefined && operationSelection.resultDigest !== value.resultDigest)
      || (value.descriptorDigest !== undefined && operationSelection.descriptorDigest !== value.descriptorDigest)
      || (operationCandidatesDigest !== undefined
        && operationSelection.candidateSetDigest !== operationCandidatesDigest)) {
      return false
    }
  }
  if (operationOutcome !== undefined && operationSelection !== undefined
    && (
      operationOutcome.operationRef !== operationSelection.operationRef
      || operationOutcome.toolId !== operationSelection.toolId
      || operationOutcome.resultDigest !== operationSelection.resultDigest
    )) {
    return false
  }
  if (value.searchContext !== undefined && !isRecord(value.searchContext)) return false
  if (value.toolCallDigests.length !== value.toolCalls.length) return false
  for (let index = 0; index < value.toolCallDigests.length; index += 1) {
    const digest = value.toolCallDigests[index]
    const call = value.toolCalls[index]
    if (
      digest === undefined
      || call === undefined
      || digest.toolCallId !== call.toolCallId
    ) {
      return false
    }
  }
  if (!value.toolCallDigests.every((digest) =>
    typeof digest.toolCallId === 'string'
    && digest.toolCallId.length > 0
    && typeof digest.inputDigest === 'string'
    && digest.inputDigest.length > 0
    && typeof digest.resultDigest === 'string'
    && digest.resultDigest.length > 0)) return false

  let replayMessages: unknown
  try {
    replayMessages = JSON.parse(value.replayMessagesJson)
  } catch {
    return false
  }
  return isRecordArray(replayMessages)
    && replayMessages.length <= MAX_CHECKPOINT_MESSAGES
    && !hasForbiddenReplayKey(replayMessages)
    && !hasForbiddenReplayPayload(value.toolCalls)
}

function isBoundedJson(value: string): boolean {
  return encoder.encode(value).byteLength <= MAX_ANSWER_TURN_CHECKPOINT_BYTES
}

function isAnswerTurnCheckpointRoute(value: unknown): value is AnswerTurnCheckpointRoute {
  return typeof value === 'string'
    && AnswerTurnCheckpointRouteValues.some((route) => route === value)
}

function isFollowUpIntent(value: unknown): value is FollowUpIntent {
  return typeof value === 'string'
    && FollowUpIntentValues.some((intent) => intent === value)
}

function isAnswerToolId(value: unknown): value is AnswerTurnCheckpoint['selectedToolId'] & string {
  return typeof value === 'string'
    && AnswerToolIdValues.some((toolId) => toolId === value)
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value)
    && value.every((item: unknown): item is string => typeof item === 'string')
}

function isRecordArray(value: unknown): value is readonly Record<string, unknown>[] {
  return Array.isArray(value)
    && value.every((item: unknown): item is Record<string, unknown> => isRecord(item))
}


function hasForbiddenReplayPayload(value: readonly unknown[]): boolean {
  for (const item of value) {
    if (!isRecord(item)) return true
    for (const key of ['inputJson', 'resultSummaryJson', 'resultJson']) {
      const json = item[key]
      if (typeof json !== 'string') return true
      try {
        if (hasForbiddenReplayKey(JSON.parse(json))) return true
      } catch {
        return true
      }
    }
  }
  return false
}

function hasForbiddenReplayKey(value: unknown, seen = new Set<object>()): boolean {
  if (Array.isArray(value)) {
    if (seen.has(value)) return true
    seen.add(value)
    return value.some((item) => hasForbiddenReplayKey(item, seen))
  }
  if (!isRecord(value)) return false
  if (seen.has(value)) return true
  seen.add(value)
  return Object.entries(value).some(([key, item]) =>
    FORBIDDEN_REPLAY_KEYS.test(key) || hasForbiddenReplayKey(item, seen),
  )
}
function isRequestedIntentArray(value: unknown): boolean {
  return AnswerRequestedIntentsSchema.safeParse(value).success
}
