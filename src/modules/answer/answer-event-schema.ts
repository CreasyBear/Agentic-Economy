import { z } from 'zod'

import { parseAnswerTurnProblemStrict, type AnswerTurnProblem } from '@/lib/errors'

import {
  ANSWER_OPERATION_CANDIDATE_LIMIT,
  AnswerArtifactKindValues,
  AnswerArtifactSchema,
  AnswerOperationCandidateSchema,
  AnswerOperationOutcomeSchema,
  AnswerOperationSelectionSchema,
  AnswerSourceSchema,
  answerOperationCandidateSetDigest,
  WebDiscoveryClaimSchema,
} from './answer-schema'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import {
  AnswerResponseModeValues,
  AnswerWorkStepPhaseValues,
  AnswerWorkStepStatusValues,
  type AnswerEvent,
} from './answer-synthesizer'
import type { AnswerTurnFrame } from './answer-ui-stream'
import { AnswerLayoutProfileValues } from './internal/answer-layout-profile'
export { AnswerLayoutProfileValues }
export type { AnswerLayoutProfile } from './internal/answer-layout-profile'

const nonEmptyString = z.string().min(1)
const finiteNumber = z.number().finite()
const nonnegativeInteger = finiteNumber.int().nonnegative()
export type FrozenOperationToolEvidenceRecord = Readonly<{
  toolCallId: string
  toolId: string
  inputJson: string
  resultSummaryJson: string
  resultJson: string
  resultHash: string
  status: 'complete' | 'error' | 'refused'
}>

export function isValidFrozenAnswerOperationArtifacts(input: {
  candidates?: unknown
  candidateSetDigest?: unknown
  selection?: unknown
  outcome?: unknown
  toolCalls: readonly unknown[]
  requireToolEvidence?: boolean
}): boolean {
  const parsedCandidates = input.candidates === undefined
    ? undefined
    : z.array(AnswerOperationCandidateSchema).safeParse(input.candidates)
  if (parsedCandidates !== undefined && !parsedCandidates.success) return false
  const candidates = parsedCandidates !== undefined && parsedCandidates.success
    ? parsedCandidates.data
    : undefined
  const candidateSetDigest = input.candidateSetDigest
  if (candidates === undefined) {
    if (candidateSetDigest !== undefined || input.selection !== undefined || input.outcome !== undefined) return false
  } else if (
    typeof candidateSetDigest !== 'string'
    || answerOperationCandidateSetDigest(candidates) !== candidateSetDigest
  ) {
    return false
  }

  const parsedSelection = input.selection === undefined
    ? undefined
    : AnswerOperationSelectionSchema.safeParse(input.selection)
  if (parsedSelection !== undefined && !parsedSelection.success) return false
  const selection = parsedSelection !== undefined && parsedSelection.success
    ? parsedSelection.data
    : undefined
  const candidate = selection === undefined || candidates === undefined
    ? undefined
    : candidates.find((item) => item.operationRef === selection.operationRef)
  if (selection !== undefined) {
    if (candidate === undefined
      || selection.descriptorDigest !== candidate.descriptorDigest
      || selection.candidateSetDigest !== candidateSetDigest) {
      return false
    }
  }

  const parsedOutcome = input.outcome === undefined
    ? undefined
    : AnswerOperationOutcomeSchema.safeParse(input.outcome)
  if (parsedOutcome !== undefined && !parsedOutcome.success) return false
  const outcome = parsedOutcome !== undefined && parsedOutcome.success
    ? parsedOutcome.data
    : undefined
  if (outcome === undefined) return true
  if (selection === undefined
    || candidate === undefined
    || outcome.operationRef !== selection.operationRef
    || outcome.toolId !== selection.toolId
    || outcome.resultDigest !== selection.resultDigest) {
    return false
  }
  if (input.requireToolEvidence !== true && input.toolCalls.length === 0) return true

  for (const value of input.toolCalls) {
    if (!isRecord(value)
      || value.toolId !== outcome.toolId
      || value.resultHash !== outcome.toolCallDigest
      || typeof value.toolCallId !== 'string'
      || value.toolCallId.length === 0
      || typeof value.inputJson !== 'string'
      || typeof value.resultSummaryJson !== 'string'
      || typeof value.resultJson !== 'string'
      || typeof value.status !== 'string') {
      continue
    }
    let parsedInput: unknown
    let parsedResult: unknown
    try {
      parsedInput = JSON.parse(value.inputJson)
      parsedResult = JSON.parse(value.resultJson)
      if (
        canonicalDigest({
          toolId: value.toolId,
          input: value.inputJson,
          summary: value.resultSummaryJson,
          resultJson: value.resultJson,
          status: value.status,
        }).toString() !== value.resultHash
        || canonicalDigest(parsedResult).toString() !== outcome.resultDigest
      ) {
        continue
      }
    } catch {
      continue
    }
    if (!isRecord(parsedInput) || parsedInput.operationRef !== outcome.operationRef) continue
    if (isRecord(parsedResult)
      && typeof parsedResult.operationRef === 'string'
      && parsedResult.operationRef !== outcome.operationRef) {
      continue
    }
    const expectedStatus = outcome.toolId === 'operation.execute'
      ? outcome.result.kind === 'ok' ? 'complete' : outcome.result.kind === 'refused' ? 'refused' : 'error'
      : outcome.result.kind === 'refused' ? 'refused' : 'complete'
    if (value.status !== expectedStatus) continue
    return true
  }
  return false
}


export const AnswerWorkStepSchema = z.strictObject({
  id: nonEmptyString,
  phase: z.enum(AnswerWorkStepPhaseValues),
  status: z.enum(AnswerWorkStepStatusValues),
  title: z.string(),
  summary: z.string().exactOptional(),
  detailRows: z.array(z.strictObject({ label: z.string(), value: z.string() })).exactOptional(),
  relatedProviderSlugs: z.array(z.string()).exactOptional(),
  startedAtMs: finiteNumber.exactOptional(),
  completedAtMs: finiteNumber.exactOptional(),
  durationMs: finiteNumber.nonnegative().exactOptional(),
})

export const AnswerSnapshotSchema = z.strictObject({
  query: z.string(),
  oneLine: z.string(),
  providers: z.array(AnswerSourceSchema),
  importedClaims: z.array(WebDiscoveryClaimSchema).max(5).exactOptional(),
  selectedProvider: AnswerSourceSchema.exactOptional(),
  operationCandidates: z.array(AnswerOperationCandidateSchema).max(ANSWER_OPERATION_CANDIDATE_LIMIT).exactOptional(),
  operationCandidatesDigest: z.string().exactOptional(),
  operationOutcome: AnswerOperationOutcomeSchema.exactOptional(),
  operationSelection: AnswerOperationSelectionSchema.exactOptional(),
  summary: z.string(),
  nextStep: z.string(),
  agentJsonUrl: z.string(),
  compactLayout: z.boolean().exactOptional(),
  layoutProfile: z.enum(AnswerLayoutProfileValues).exactOptional(),
}).superRefine((snapshot, context) => {
  if (!isValidFrozenAnswerOperationArtifacts({
    candidates: snapshot.operationCandidates,
    candidateSetDigest: snapshot.operationCandidatesDigest,
    selection: snapshot.operationSelection,
    outcome: snapshot.operationOutcome,
    toolCalls: [],
  })) {
    context.addIssue({
      code: 'custom',
      path: ['operationSelection'],
      message: 'answer_operation_artifacts_invalid',
    })
  }
})
export const AnswerPlanEventSchema = z.strictObject({
  type: z.literal('plan'),
  mode: z.enum(AnswerResponseModeValues),
  layoutProfile: z.enum(AnswerLayoutProfileValues),
  providerBudget: z.strictObject({
    searchLimit: nonnegativeInteger,
    visibleLimit: nonnegativeInteger,
  }),
  artifactBudget: z.strictObject({
    layoutProfile: z.enum(AnswerLayoutProfileValues),
    allowedKinds: z.array(z.enum(AnswerArtifactKindValues)),
    maxArtifactCount: nonnegativeInteger,
    maxProviderCards: nonnegativeInteger,
  }),
})

const answerTurnProblemSchema: z.ZodType<AnswerTurnProblem> = z.custom<AnswerTurnProblem>(
  (value) => parseAnswerTurnProblemStrict(value) !== undefined,
)

export const AnswerEventSchema: z.ZodType<AnswerEvent> = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('thread'),
    threadId: nonEmptyString,
    turnId: nonEmptyString,
    turnSeq: nonnegativeInteger,
  }),
  z.strictObject({ type: z.literal('work-step'), step: AnswerWorkStepSchema }),
  z.strictObject({
    type: z.literal('thinking'),
    step: z.enum(['search', 'read', 'write']).exactOptional(),
    label: z.string().exactOptional(),
  }),
  AnswerPlanEventSchema,
  z.strictObject({ type: z.literal('one-line'), oneLine: z.string() }),
  z.strictObject({ type: z.literal('sources'), providers: z.array(AnswerSourceSchema) }),
  z.strictObject({ type: z.literal('summary-delta'), delta: z.string() }),
  z.strictObject({ type: z.literal('next-step'), nextStep: z.string() }),
  z.strictObject({ type: z.literal('artifact'), artifact: AnswerArtifactSchema }),
  z.strictObject({ type: z.literal('complete'), answer: AnswerSnapshotSchema }),
  z.strictObject({ type: z.literal('pending') }),
  z.strictObject({ type: z.literal('stopped') }),
  z.strictObject({ type: z.literal('error'), problem: answerTurnProblemSchema }),
])

export const AnswerTurnFrameSchema: z.ZodType<AnswerTurnFrame> = z.strictObject({
  seq: nonnegativeInteger,
  event: AnswerEventSchema,
})

export type AnswerEventSchemaOutput = z.infer<typeof AnswerEventSchema>
export type AnswerSnapshotSchemaOutput = z.infer<typeof AnswerSnapshotSchema>
