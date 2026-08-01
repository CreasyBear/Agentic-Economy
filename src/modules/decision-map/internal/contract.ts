import { z } from 'zod'

export const DECISION_MAP_VERSION = 'decisionMap_v1' as const

export const DECISION_MAP_STATUS_VALUES = ['locked', 'ready', 'queued', 'fog'] as const
export const DECISION_MAP_CHOICE_VALUES = ['lock', 'park'] as const
export const DECISION_MAP_ASSUMPTION_SOURCE_VALUES = ['inferred', 'default'] as const

const idSchema = z.string().trim().min(1).max(80)
const textSchema = z.string().trim().min(1).max(500)
const shortTextSchema = z.string().trim().min(1).max(240)
const timestampSchema = z.number().finite()
const generationSchema = z.number().int().nonnegative()
const revisionSchema = z.number().int().positive()

export const decisionMapStatusSchema = z.enum(DECISION_MAP_STATUS_VALUES)
export const decisionMapChoiceSchema = z.enum(DECISION_MAP_CHOICE_VALUES)
export const decisionMapAssumptionSourceSchema = z.enum(DECISION_MAP_ASSUMPTION_SOURCE_VALUES)

export const decisionMapAssumptionSchema = z.strictObject({
  id: idSchema,
  label: shortTextSchema,
  value: textSchema,
  source: decisionMapAssumptionSourceSchema,
})

export const decisionMapOptionSchema = z.strictObject({
  id: idSchema,
  label: shortTextSchema,
  summary: textSchema,
})

const nodeRefsSchema = {
  dependsOn: z.array(idSchema).max(10).default([]),
  constraintRefs: z.array(idSchema).max(5).default([]),
}

export const decisionMapAreaNodeSchema = z.strictObject({
  id: idSchema,
  kind: z.literal('area'),
  label: shortTextSchema,
  summary: textSchema.optional(),
  status: decisionMapStatusSchema.default('queued'),
  parentId: idSchema.nullable().optional(),
  ...nodeRefsSchema,
})

export const decisionMapDecisionNodeSchema = z.strictObject({
  id: idSchema,
  kind: z.literal('decision'),
  label: shortTextSchema,
  summary: textSchema.optional(),
  status: decisionMapStatusSchema,
  parentId: idSchema,
  ...nodeRefsSchema,
  options: z.array(decisionMapOptionSchema).min(2).max(4),
  recommendedOptionId: idSchema,
  reason: textSchema,
  unlocks: z.array(idSchema).max(10).default([]),
  parkTrigger: textSchema,
})

export const decisionMapNodeSchema = z.discriminatedUnion('kind', [
  decisionMapAreaNodeSchema,
  decisionMapDecisionNodeSchema,
])

export const decisionMapDraftSchema = z.strictObject({
  version: z.literal(DECISION_MAP_VERSION),
  goalText: textSchema,
  summary: textSchema,
  assumptions: z.array(decisionMapAssumptionSchema).min(1).max(5),
  nodes: z.array(decisionMapNodeSchema).min(5).max(10),
})

export const decisionMapDecisionRecordSchema = z.strictObject({
  decisionId: idSchema,
  choice: decisionMapChoiceSchema,
  recommendedOptionId: idSchema,
  selectedOptionId: idSchema.optional(),
  parkTrigger: textSchema.optional(),
  operationKey: idSchema,
  generation: generationSchema,
  revision: revisionSchema,
  at: timestampSchema,
})

export const decisionMapChangeReportSchema = z.strictObject({
  changedAssumptionId: idSchema,
  changedDetail: textSchema,
  preservedNodeIds: z.array(idSchema),
  affectedNodeIds: z.array(idSchema),
  reopenedNodeIds: z.array(idSchema),
  operationKey: idSchema,
  generation: generationSchema,
  revision: revisionSchema,
})

export const decisionMapOperationRecordSchema = z.strictObject({
  operationKey: idSchema,
  kind: z.enum(['choice', 'constraint_change']),
  payloadDigest: z.string().min(1),
  generation: generationSchema,
  revision: revisionSchema,
  resultDigest: z.string().min(1),
})

export const decisionMapSnapshotSchema = decisionMapDraftSchema.extend({
  projectId: idSchema,
  threadId: idSchema,
  generation: generationSchema,
  revision: revisionSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  decisionRecords: z.array(decisionMapDecisionRecordSchema),
  operationRecords: z.array(decisionMapOperationRecordSchema).default([]),
  lastChangeReport: decisionMapChangeReportSchema.optional(),
})

export const decisionMapChoiceInputSchema = z.strictObject({
  projectId: idSchema.optional(),
  threadId: idSchema.optional(),
  expectedGeneration: generationSchema,
  expectedRevision: revisionSchema,
  decisionId: idSchema,
  choice: decisionMapChoiceSchema,
  operationKey: idSchema,
  at: timestampSchema.optional(),
})

export const decisionMapConstraintChangeInputSchema = z.strictObject({
  projectId: idSchema.optional(),
  threadId: idSchema.optional(),
  expectedGeneration: generationSchema,
  expectedRevision: revisionSchema,
  assumptionId: idSchema,
  value: textSchema,
  operationKey: idSchema,
  at: timestampSchema.optional(),
})

export type DecisionMapStatus = z.infer<typeof decisionMapStatusSchema>
export type DecisionMapChoice = z.infer<typeof decisionMapChoiceSchema>
export type DecisionMapAssumptionSource = z.infer<typeof decisionMapAssumptionSourceSchema>
export type DecisionMapAssumption = z.infer<typeof decisionMapAssumptionSchema>
export type DecisionMapOption = z.infer<typeof decisionMapOptionSchema>
export type DecisionMapAreaNode = z.infer<typeof decisionMapAreaNodeSchema>
export type DecisionMapDecisionNode = z.infer<typeof decisionMapDecisionNodeSchema>
export type DecisionMapNode = z.infer<typeof decisionMapNodeSchema>
export type DecisionMapDraft = z.infer<typeof decisionMapDraftSchema>
export type DecisionMapDecisionRecord = z.infer<typeof decisionMapDecisionRecordSchema>
export type DecisionMapChangeReport = z.infer<typeof decisionMapChangeReportSchema>
export type DecisionMapOperationRecord = z.infer<typeof decisionMapOperationRecordSchema>
export type DecisionMapSnapshot = z.infer<typeof decisionMapSnapshotSchema>
export type DecisionMapChoiceInput = z.infer<typeof decisionMapChoiceInputSchema>
export type DecisionMapConstraintChangeInput = z.infer<typeof decisionMapConstraintChangeInputSchema>

export type DecisionMapAuthorInput = Readonly<{
  projectId: string
  threadId: string
  draft: DecisionMapDraft
  generation?: number
  revision?: number
  createdAt?: number
  updatedAt?: number
  now?: number
  authoredAt?: number
}>

export type DecisionMapValidationOptions = Readonly<{
  initial?: boolean
  requireReady?: boolean
}>

export type DecisionMapValidationIssue = Readonly<{
  code:
  | 'duplicate_id'
  | 'missing_reference'
  | 'invalid_parent'
  | 'cycle'
  | 'invalid_depth'
  | 'invalid_root_count'
  | 'invalid_branch'
  | 'invalid_ready'
  | 'invalid_status'
  | 'invalid_option_reference'
  | 'invalid_constraint_reference'
  message: string
  path?: readonly (string | number)[]
}>

export class DecisionMapInvariantError extends Error {
  readonly code = 'invalid_decision_map' as const
  readonly issues: readonly DecisionMapValidationIssue[]

  constructor(issues: readonly DecisionMapValidationIssue[]) {
    super(issues.map((issue) => issue.message).join('; '))
    this.name = 'DecisionMapInvariantError'
    this.issues = issues
  }
}

export type DecisionMapKernelErrorCode =
  | 'stale_generation'
  | 'stale_revision'
  | 'operation_conflict'
  | 'decision_not_found'
  | 'decision_not_ready'
  | 'assumption_not_found'
  | 'project_mismatch'
  | 'thread_mismatch'

export class DecisionMapKernelError extends Error {
  readonly code: DecisionMapKernelErrorCode
  readonly expectedGeneration: number | undefined
  readonly actualGeneration: number | undefined
  readonly expectedRevision: number | undefined
  readonly actualRevision: number | undefined

  constructor(
    code: DecisionMapKernelErrorCode,
    message: string,
    details: Readonly<{
      expectedGeneration?: number
      actualGeneration?: number
      expectedRevision?: number
      actualRevision?: number
    }> = {},
  ) {
    super(message)
    this.name = 'DecisionMapKernelError'
    this.code = code
    this.expectedGeneration = details.expectedGeneration
    this.actualGeneration = details.actualGeneration
    this.expectedRevision = details.expectedRevision
    this.actualRevision = details.actualRevision
  }
}
