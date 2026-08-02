import { z } from 'zod'

import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  callSourceMutation,
  callSourceQuery,
  ConvexSourceError,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'

import {
  gardenerVerbSchema,
  workTreeApprovalAuthoritySchema,
  workTreeSchema,
  type GardenerVerb,
  type WorkTree,
} from './public'

export const workTreeLineageSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('customer_request'),
    requestRef: z.string().trim().min(1).max(200),
    revision: z.number().int().min(1),
  }),
  z.strictObject({
    kind: z.literal('standalone'),
  }),
])
export type WorkTreeLineage = z.infer<typeof workTreeLineageSchema>

export const workTreeCreateInputSchema = z.strictObject({
  idempotencyKey: z.string().trim().min(1).max(200),
  charterText: z.string().trim().min(1).max(4_000),
  lineage: workTreeLineageSchema,
  guestAssertion: z.string().trim().min(1).max(512).optional(),
})
export type WorkTreeCreateInput = z.infer<typeof workTreeCreateInputSchema>
export const workTreeInspectInputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(200),
  guestAssertion: z.string().trim().min(1).max(512).optional(),
})
export type WorkTreeInspectInput = z.infer<typeof workTreeInspectInputSchema>

export const workTreeClaimInputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(1).max(200),
  guestAssertion: z.string().trim().min(1).max(512),
})
export type WorkTreeClaimInput = z.infer<typeof workTreeClaimInputSchema>

const workTreeActorSchema = z.strictObject({
  principalId: z.string().min(1),
  ownerId: z.string().min(1),
  credentialId: z.string().min(1).optional(),
  source: z.enum(['human_source', 'browser_guest', 'customer_request_agent']).optional(),
})

const workTreeDecisionReadbackSchema = z.strictObject({
  projectId: z.string().min(1),
  revision: z.number().int().min(0),
})

const repeatGrantMoneySchema = z.strictObject({
  currency: z.string().regex(/^[A-Z]{3}$/u),
  amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
})

export const workTreeRepeatGrantSchema = z.strictObject({
  delegatedCredentialId: z.string().trim().min(1).max(300),
  occurrences: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  perUseSpend: repeatGrantMoneySchema,
  cumulativeSpend: repeatGrantMoneySchema,
  perUseDataAllocations: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  cumulativeDataAllocations: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  validUntil: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
}).superRefine((grant, context) => {
  if (grant.perUseSpend.currency !== grant.cumulativeSpend.currency) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['cumulativeSpend', 'currency'], message: 'currency_mismatch' })
  }
  if (grant.perUseSpend.amountMinor > grant.cumulativeSpend.amountMinor) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['cumulativeSpend', 'amountMinor'], message: 'per_use_exceeds_cumulative' })
  }
  if (grant.perUseDataAllocations > grant.cumulativeDataAllocations) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['cumulativeDataAllocations'], message: 'per_use_exceeds_cumulative' })
  }
})

export const workTreeStepUpSchema = z.strictObject({
  acknowledgedConsequence: z.literal(true),
  approvalKind: z.literal('per_item'),
  approvalRef: z.string().trim().min(1).max(256).optional(),
  authority: workTreeApprovalAuthoritySchema.optional(),
})
export type WorkTreeStepUp = z.infer<typeof workTreeStepUpSchema>

const workTreeDecisionRefusalCodeSchema = z.enum([
  'authentication_required',
  'stale_fence',
  'forbidden',
  'not_found',
  'digest_mismatch',
  'step_up_required',
  'live_money_gate_open',
  'stripe_setup_required',
  'approval_not_found',
  'approval_owner_mismatch',
  'approval_credential_mismatch',
  'approval_project_mismatch',
  'approval_node_mismatch',
  'approval_proposal_mismatch',
  'approval_authority_mismatch',
  'approval_amount_mismatch',
  'approval_expired',
  'approval_used',
  'approval_conflict',
])
export type WorkTreeDecisionRefusalCode = z.infer<typeof workTreeDecisionRefusalCodeSchema>

const workTreeDecisionAcceptedReceiptSchema = z.strictObject({
  kind: z.literal('accepted'),
  decision: z.enum(['lock', 'adjust', 'park']),
  projectId: z.string().min(1),
  nodeId: z.string().min(1),
  receiptId: z.string().min(1),
  generation: z.number().int().positive(),
  revision: z.number().int().positive(),
  disposition: z.enum(['locked', 'queued', 'adjusted', 'unchanged']),
  permissionRef: z.string().trim().min(1).max(300).optional(),
  actor: workTreeActorSchema.optional(),
  occurredAt: z.number().finite(),
  readback: workTreeDecisionReadbackSchema,
})
const workTreeDecisionReplayedReceiptSchema = z.strictObject({
  kind: z.literal('replayed'),
  decision: z.enum(['lock', 'adjust', 'park']),
  projectId: z.string().min(1),
  nodeId: z.string().min(1),
  receiptId: z.string().min(1),
  generation: z.number().int().positive(),
  revision: z.number().int().positive(),
  disposition: z.enum(['locked', 'queued', 'adjusted', 'unchanged']),
  actor: workTreeActorSchema.optional(),
  permissionRef: z.string().trim().min(1).max(300).optional(),
  occurredAt: z.number().finite(),
  readback: workTreeDecisionReadbackSchema,
})
const workTreeDecisionRefusedReceiptSchema = z.strictObject({
  kind: z.literal('refused'),
  decision: z.enum(['lock', 'adjust', 'park']),
  projectId: z.string().min(1),
  nodeId: z.string().min(1),
  receiptId: z.string().min(1),
  generation: z.number().int().min(0),
  revision: z.number().int().min(0),
  disposition: z.enum(['locked', 'queued', 'adjusted', 'unchanged']),
  actor: workTreeActorSchema.optional(),
  refusalCode: workTreeDecisionRefusalCodeSchema,
  occurredAt: z.number().finite(),
  readback: workTreeDecisionReadbackSchema,
})
const workTreeDecisionUnknownReceiptSchema = z.strictObject({
  kind: z.literal('unknown'),
  decision: z.enum(['lock', 'adjust', 'park']),
  projectId: z.string().min(1),
  nodeId: z.string().min(1),
  receiptId: z.string().min(1),
  generation: z.number().int().min(0),
  revision: z.number().int().min(0),
  disposition: z.enum(['locked', 'queued', 'adjusted', 'unchanged']),
  actor: workTreeActorSchema.optional(),
  refusalCode: workTreeDecisionRefusalCodeSchema.optional(),
  occurredAt: z.number().finite(),
  readback: workTreeDecisionReadbackSchema,
})

const workTreeFullDecisionReceiptSchema = z.discriminatedUnion('kind', [
  workTreeDecisionAcceptedReceiptSchema,
  workTreeDecisionReplayedReceiptSchema,
  workTreeDecisionRefusedReceiptSchema,
  workTreeDecisionUnknownReceiptSchema,
])
const workTreeDecisionAuthenticationRefusalSchema = z.strictObject({
  kind: z.literal('refused'),
  code: z.literal('authentication_required'),
  replayed: z.literal(false),
})

export const workTreeDecisionReceiptSchema = z.union([
  workTreeFullDecisionReceiptSchema,
  workTreeDecisionAuthenticationRefusalSchema,
])
export type WorkTreeDecisionReceipt = z.infer<typeof workTreeDecisionReceiptSchema>

const workTreeEventReadbackCommonShape = {
  operationKey: z.string(),
  seq: z.number().int().positive(),
  generation: z.number().int().positive(),
  revision: z.number().int().positive(),
  payloadDigest: z.string(),
  at: z.number().finite(),
  actor: workTreeActorSchema.optional(),
}

export const workTreeEventReadbackSchema = z.union([
  z.strictObject({
    kind: z.enum(['created', 'claimed', 'elaborated', 'study_started']),
    ...workTreeEventReadbackCommonShape,
  }),
  z.strictObject({
    kind: z.literal('decision_proposed'),
    ...workTreeEventReadbackCommonShape,
    targetNodeId: z.string().trim().min(1).optional(),
  }),
])
export type WorkTreeEventReadback = z.infer<typeof workTreeEventReadbackSchema>

export const workTreeReadbackSchema = z.strictObject({
  projectId: z.string(),
  treeId: z.string(),
  principalId: z.string(),
  lineage: workTreeLineageSchema,
  generation: z.number().int().positive(),
  revision: z.number().int().positive(),
  tree: workTreeSchema,
  events: z.array(workTreeEventReadbackSchema),
  receipts: z.array(workTreeDecisionReceiptSchema).max(64),
  hasMoreEvents: z.boolean(),
})
export type WorkTreeReadback = z.infer<typeof workTreeReadbackSchema>

export const workTreeCreationReceiptSchema = z.strictObject({
  receiptRef: z.string(),
  projectId: z.string(),
  treeId: z.string(),
  operationKey: z.string(),
  event: z.strictObject({
    kind: z.literal('created'),
    operationKey: z.string(),
    seq: z.literal(1),
  }),
  actor: workTreeActorSchema.optional(),
  generation: z.literal(1),
  revision: z.literal(1),
  payloadDigest: z.string(),
})
export type WorkTreeCreationReceipt = z.infer<typeof workTreeCreationReceiptSchema>

const workTreeRefusalCodeSchema = z.enum([
  'authentication_required',
  'lineage_not_found',
  'lineage_forbidden',
  'lineage_revision_conflict',
  'lineage_conflict',
  'idempotency_conflict',
  'claim_conflict',
  'forbidden',
  'not_found',
  'source_unavailable',
])
export type WorkTreeRefusalCode = z.infer<typeof workTreeRefusalCodeSchema>

const workTreeAcceptedResultSchema = z.strictObject({
  kind: z.literal('accepted'),
  code: z.literal('work_tree_created'),
  replayed: z.literal(false),
  readback: workTreeReadbackSchema,
  receipt: workTreeCreationReceiptSchema,
})
const workTreeReplayedResultSchema = z.strictObject({
  kind: z.literal('replayed'),
  code: z.enum(['work_tree_created', 'work_tree_resumed']),
  replayed: z.literal(true),
  readback: workTreeReadbackSchema,
  receipt: workTreeCreationReceiptSchema,
})
const workTreeRefusedResultSchema = z.strictObject({
  kind: z.literal('refused'),
  code: workTreeRefusalCodeSchema,
  replayed: z.literal(false),
})

export const workTreeCreateResultSchema = z.discriminatedUnion('kind', [
  workTreeAcceptedResultSchema,
  workTreeReplayedResultSchema,
  workTreeRefusedResultSchema,
])
export type WorkTreeCreateResult = z.infer<typeof workTreeCreateResultSchema>

const workTreeClaimReceiptSchema = z.strictObject({
  receiptRef: z.string(),
  projectId: z.string(),
  treeId: z.string(),
  operationKey: z.string(),
  event: z.strictObject({
    kind: z.literal('claimed'),
    operationKey: z.string(),
    seq: z.number().int().positive(),
  }),
  actor: workTreeActorSchema,
  generation: z.number().int().positive(),
  revision: z.number().int().positive(),
  payloadDigest: z.string(),
})
const workTreeClaimAcceptedResultSchema = z.strictObject({
  kind: z.literal('accepted'),
  code: z.literal('work_tree_claimed'),
  replayed: z.literal(false),
  readback: workTreeReadbackSchema,
  receipt: workTreeClaimReceiptSchema,
})
const workTreeClaimReplayedResultSchema = z.strictObject({
  kind: z.literal('replayed'),
  code: z.literal('work_tree_claimed'),
  replayed: z.literal(true),
  readback: workTreeReadbackSchema,
  receipt: workTreeClaimReceiptSchema,
})
const workTreeClaimRefusedResultSchema = z.strictObject({
  kind: z.literal('refused'),
  code: z.enum(['authentication_required', 'forbidden', 'not_found', 'claim_conflict', 'source_unavailable']),
  replayed: z.literal(false),
})
export const workTreeClaimResultSchema = z.discriminatedUnion('kind', [
  workTreeClaimAcceptedResultSchema,
  workTreeClaimReplayedResultSchema,
  workTreeClaimRefusedResultSchema,
])
export type WorkTreeClaimResult = z.infer<typeof workTreeClaimResultSchema>

const workTreeInspectAcceptedResultSchema = z.strictObject({
  kind: z.literal('accepted'),
  readback: workTreeReadbackSchema,
})
const workTreeInspectRefusedResultSchema = z.strictObject({
  kind: z.literal('refused'),
  code: z.enum(['authentication_required', 'forbidden', 'not_found', 'source_unavailable']),
})

export const workTreeInspectResultSchema = z.discriminatedUnion('kind', [
  workTreeInspectAcceptedResultSchema,
  workTreeInspectRefusedResultSchema,
])
export type WorkTreeInspectResult = z.infer<typeof workTreeInspectResultSchema>

const createWorkTreeSourceMutation = sourceMutation<WorkTreeCreateInput, WorkTreeCreateResult>('workTrees:create')
const claimWorkTreeSourceMutation = sourceMutation<WorkTreeClaimInput, WorkTreeClaimResult>('workTrees:claim')
const inspectWorkTreeSourceQuery = sourceQuery<WorkTreeInspectInput, WorkTreeInspectResult>('workTrees:inspect')

export async function createWorkTreeThroughSource(input: WorkTreeCreateInput): Promise<WorkTreeCreateResult> {
  try {
    const result = input.guestAssertion === undefined
      ? await callSourceMutation(createWorkTreeSourceMutation, input)
      : await callPublicSourceMutation(createWorkTreeSourceMutation, input)
    return workTreeCreateResultSchema.parse(result)
  } catch (error) {
    return workTreeRefusedFromSourceError(error)
  }
}

export async function inspectWorkTreeThroughSource(input: WorkTreeInspectInput): Promise<WorkTreeInspectResult> {
  try {
    const result = input.guestAssertion === undefined
      ? await callSourceQuery(inspectWorkTreeSourceQuery, input)
      : await callPublicSourceQuery(inspectWorkTreeSourceQuery, input)
    return workTreeInspectResultSchema.parse(result)
  } catch (error) {
    return workTreeInspectRefusedFromSourceError(error)
  }
}

export async function claimWorkTreeThroughSource(input: WorkTreeClaimInput): Promise<WorkTreeClaimResult> {
  try {
    const parsedInput = workTreeClaimInputSchema.parse(input)
    const result = await callSourceMutation(claimWorkTreeSourceMutation, parsedInput)
    return workTreeClaimResultSchema.parse(result)
  } catch (error) {
    if (error instanceof ConvexSourceError && error.code === 'missing_auth') {
      return { kind: 'refused', code: 'authentication_required', replayed: false }
    }
    return { kind: 'refused', code: 'source_unavailable', replayed: false }
  }
}

function workTreeRefusedFromSourceError(error: unknown): WorkTreeCreateResult {
  if (error instanceof ConvexSourceError && error.code === 'missing_auth') {
    return { kind: 'refused', code: 'authentication_required', replayed: false }
  }
  return { kind: 'refused', code: 'source_unavailable', replayed: false }
}

function workTreeInspectRefusedFromSourceError(error: unknown): WorkTreeInspectResult {
  if (error instanceof ConvexSourceError && error.code === 'missing_auth') {
    return { kind: 'refused', code: 'authentication_required' }
  }
  return { kind: 'refused', code: 'source_unavailable' }
}

export type { WorkTree }

export const workTreeApplyInputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(200),
  operationKey: z.string().trim().min(1).max(200),
  correlationId: z.string().trim().min(1).max(200),
  verb: gardenerVerbSchema,
  guestAssertion: z.string().trim().min(1).max(512).optional(),
})
export type WorkTreeApplyInput = z.infer<typeof workTreeApplyInputSchema>

export const workTreeRawApplyReceiptSchema = z.strictObject({
  kind: z.enum(['applied', 'replayed']),
  replayed: z.boolean(),
  projectId: z.string().min(1),
  tree: workTreeSchema,
  operationKey: z.string().min(1),
  seq: z.number().int().positive(),
  event: z.strictObject({
    kind: z.enum(['elaborated', 'study_started', 'decision_proposed']),
    operationKey: z.string().min(1),
    seq: z.number().int().positive(),
  }),
})
export type WorkTreeRawApplyReceipt = z.infer<typeof workTreeRawApplyReceiptSchema>

const workTreeRawApplyRefusedResultSchema = z.strictObject({
  kind: z.literal('refused'),
  code: z.enum(['authentication_required', 'forbidden']),
  replayed: z.literal(false),
})
type WorkTreeRawApplyRefusedResult = z.infer<typeof workTreeRawApplyRefusedResultSchema>
type WorkTreeRawApplySourceResult = WorkTreeRawApplyReceipt | WorkTreeRawApplyRefusedResult
const workTreeRawApplySourceResultSchema = z.discriminatedUnion('kind', [
  workTreeRawApplyReceiptSchema,
  workTreeRawApplyRefusedResultSchema,
])

const workTreeApplyAcceptedResultSchema = z.strictObject({
  kind: z.literal('accepted'),
  receipt: workTreeRawApplyReceiptSchema,
  readback: workTreeDecisionReadbackSchema,
})
const workTreeApplyReplayedResultSchema = z.strictObject({
  kind: z.literal('replayed'),
  receipt: workTreeRawApplyReceiptSchema,
  readback: workTreeDecisionReadbackSchema,
})
const workTreeApplyRefusedResultSchema = z.strictObject({
  kind: z.literal('refused'),
  reason: z.string().min(1),
})
const workTreeApplyUnknownResultSchema = z.strictObject({
  kind: z.literal('unknown'),
  reason: z.string().min(1),
})

export const workTreeApplyResultSchema = z.discriminatedUnion('kind', [
  workTreeApplyAcceptedResultSchema,
  workTreeApplyReplayedResultSchema,
  workTreeApplyRefusedResultSchema,
  workTreeApplyUnknownResultSchema,
])
export type WorkTreeApplyResult = z.infer<typeof workTreeApplyResultSchema>

export const workTreeDecisionInputSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(200),
  nodeId: z.string().trim().min(1).max(200),
  kind: z.enum(['lock', 'adjust', 'park']),
  expectedGeneration: z.number().int().min(1),
  expectedRevision: z.number().int().min(1),
  proposalDigest: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(1).max(200),
  stepUp: workTreeStepUpSchema.optional(),
  repeatGrant: workTreeRepeatGrantSchema.optional(),
  guestAssertion: z.string().trim().min(1).max(512).optional(),
})
export type WorkTreeDecisionInput = z.infer<typeof workTreeDecisionInputSchema>

const applyWorkTreeSourceMutation = sourceMutation<WorkTreeApplyInput, WorkTreeRawApplySourceResult>('workTrees:apply')
const decideWorkTreeSourceMutation = sourceMutation<WorkTreeDecisionInput, WorkTreeDecisionReceipt>('workTrees:decide')

export async function applyWorkTreeThroughSource(input: WorkTreeApplyInput): Promise<WorkTreeApplyResult> {
  try {
    const parsedInput = workTreeApplyInputSchema.parse(input)
    const sourceResult = parsedInput.guestAssertion === undefined
      ? await callSourceMutation(applyWorkTreeSourceMutation, parsedInput)
      : await callPublicSourceMutation(applyWorkTreeSourceMutation, parsedInput)
    const raw = workTreeRawApplySourceResultSchema.parse(sourceResult)
    if (raw.kind === 'refused') {
      return workTreeApplyResultSchema.parse({ kind: 'refused', reason: raw.code })
    }
    const kind = raw.kind === 'replayed' ? 'replayed' : 'accepted'
    return workTreeApplyResultSchema.parse({
      kind,
      receipt: raw,
      readback: { projectId: raw.projectId, revision: raw.tree.revision },
    })
  } catch (error) {
    const reason = sourceErrorReason(error)
    return workTreeApplyResultSchema.parse({
      kind: isSourceRefusal(error) ? 'refused' : 'unknown',
      reason,
    })
  }
}

export async function decideWorkTreeThroughSource(input: WorkTreeDecisionInput): Promise<WorkTreeDecisionReceipt> {
  const parsedInput = workTreeDecisionInputSchema.parse(input)
  try {
    const result = parsedInput.guestAssertion === undefined
      ? await callSourceMutation(decideWorkTreeSourceMutation, parsedInput)
      : await callPublicSourceMutation(decideWorkTreeSourceMutation, parsedInput)
    return workTreeDecisionReceiptSchema.parse(result)
  } catch (error) {
    return fallbackDecisionReceipt(parsedInput, isSourceRefusal(error) ? 'forbidden' : undefined)
  }
}

function fallbackDecisionReceipt(
  input: WorkTreeDecisionInput,
  refusalCode: WorkTreeDecisionRefusalCode | undefined,
): WorkTreeDecisionReceipt {
  return {
    kind: refusalCode === undefined ? 'unknown' : 'refused',
    decision: input.kind,
    projectId: input.projectId,
    nodeId: input.nodeId,
    receiptId: `unknown:${input.idempotencyKey}`,
    generation: input.expectedGeneration,
    revision: input.expectedRevision,
    disposition: 'unchanged',
    ...(refusalCode === undefined ? {} : { refusalCode }),
    occurredAt: Date.now(),
    readback: { projectId: input.projectId, revision: input.expectedRevision },
  } as WorkTreeDecisionReceipt
}

const sourceRefusalCodeSchema = z.enum([
  'authentication_required',
  'forbidden',
  'not_found',
  'digest_mismatch',
  'live_money_gate_open',
  'stripe_setup_required',
  'stale_fence',
  'step_up_required',
  'work_tree_target_not_found',
  'work_tree_target_not_frontier',
  'work_tree_target_kind_invalid',
  'work_tree_dependency_missing',
  'work_tree_parent_cycle',
  'work_tree_dependency_cycle',
  'work_tree_children_limit',
  'work_tree_node_limit',
  'work_tree_depth_limit',
  'work_tree_status_transition_invalid',
  'work_tree_revision_overflow',
  'work_tree_options_limit',
  'work_tree_revision_stale',
  'work_tree_generation_stale',
  'work_tree_proposal_digest_mismatch',
  'work_tree_operation_conflict',
  'work_tree_snapshot_too_large',
  'work_tree_event_limit',
  'work_tree_verb_invalid',
])

function isSourceRefusal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false
  const code = error.code
  return typeof code === 'string' && sourceRefusalCodeSchema.safeParse(code).success
}

function sourceErrorReason(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = error.code
    if (typeof code === 'string' && code.trim().length > 0) return code
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return 'work_tree_source_unavailable'
}
