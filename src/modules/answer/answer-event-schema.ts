import { z } from 'zod'

import { parseAnswerTurnProblemStrict, type AnswerTurnProblem } from '@/lib/errors'

import {
  AnswerArtifactKindValues,
  AnswerArtifactSchema,
  AnswerSourceSchema,
  WebDiscoveryClaimSchema,
} from './answer-schema'
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
  summary: z.string(),
  nextStep: z.string(),
  agentJsonUrl: z.string(),
  compactLayout: z.boolean().exactOptional(),
  layoutProfile: z.enum(AnswerLayoutProfileValues).exactOptional(),
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
