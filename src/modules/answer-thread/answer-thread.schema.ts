
import { z } from 'zod'
import {
  AnswerToolCallStatusValues,
  AnswerToolIdValues,
  AnswerTurnCheckpointRouteValues,
  AnswerTurnReservationStateValues,
  AnswerTurnStatusValues,
  FollowUpIntentValues,
} from './answer-thread.values'
import type {
  AnswerToolCallStatus,
  AnswerTurnCheckpointRoute,
} from './answer-thread.values'

import { parseAnswerTurnProblemStrict, type AnswerTurnProblem } from '@/lib/errors'

import {
  AnswerLayoutProfileValues,
  AnswerWorkStepSchema,
  type AnswerLayoutProfile,
} from '@/modules/answer/answer-event-schema'
import {
  AnswerArtifactSchema,
  AnswerRequestedIntentsSchema,
  type AnswerArtifact,
  type AnswerOperationCandidate,
  type AnswerOperationComparison,
  type AnswerOperationOutcome,
  type AnswerOperationPlan,
  type AnswerOperationSelection,
  type AnswerRequestedIntent,
  type AnswerRequestInterpretation,
} from '@/modules/answer/answer-schema'
import { parseAnswerOperationSelectionRecognition } from './internal/turn-digests'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import type { OperationInvokeService } from '@/modules/capability-execution/operation-invoke'
import type {
  AnswerSource,
  AnswerWorkStep,
} from '@/modules/answer/answer-synthesizer'
import type { WebDiscoveryClaim } from '@/modules/storefront/public'
import type { HarnessModelRequestRecord, HarnessRunReport } from '@/modules/harness/public'
import {
  AeSearchContextSchema,
  NeedTimingValues,
  type AeSearchContext,
} from '@/modules/answer/search-context'
export {
  AnswerToolCallStatusValues,
  AnswerToolIdValues,
  AnswerTurnCheckpointRouteValues,
  AnswerTurnReservationStateValues,
  AnswerTurnStatusValues,
  FollowUpIntentValues,
}
export type {
  AnswerRequestInterpretation,
  AnswerToolCallStatus,
  AnswerTurnCheckpointRoute,
}


export type FollowUpIntent = (typeof FollowUpIntentValues)[number]

export type AnswerTurnStatus = (typeof AnswerTurnStatusValues)[number]


export type AnswerTurnReservationState = (typeof AnswerTurnReservationStateValues)[number]

/** Bounded ownership window for an active answer turn execution. */
export const ANSWER_TURN_EXECUTION_LEASE_MS = 30_000

export type AnswerToolId = (typeof AnswerToolIdValues)[number]

// Read-only model tools. `operation.execute` stays out: dynamic capability tools
// bind one strict operation schema instead of exposing a free-form record tool.
export const ANSWER_READ_TOOL_IDS = [
  'registry.search',
  'registry.detail',
  'web.discover',
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
] as const satisfies readonly AnswerToolId[]

const ThinkingStepValues = ['search', 'read', 'write'] as const
export type ThinkingStep = (typeof ThinkingStepValues)[number]

export type AnswerThreadRecord = {
  threadId: string
  pseudonymousSessionId: string
  title: string
  createdAt: number
  updatedAt: number
}

export type AnswerTurnRecord = {
  turnId: string
  threadId: string
  seq: number
  query: string
  intent: FollowUpIntent
  evidenceJson: string
  snapshotHash: string
  proseJson: string
  artifactKindsJson: string
  status: AnswerTurnStatus
  errorCopyId?: string
  errorProblemJson?: string
  createdAt: number
}

export type AnswerTurnReservationRecord = {
  reservationKey: string
  sessionId: string
  requestedThreadScope: string
  requestDigest: string
  threadId: string
  turnId: string
  seq: number
  query: string
  searchContextJson?: string
  state: AnswerTurnReservationState
  finalStatus?: Extract<AnswerTurnStatus, 'complete' | 'error'>
  answerDigest?: string
  harnessFinalizationDigest?: string
  createdAt: number
  updatedAt: number
}
export type AnswerOperationInvokeContext = Readonly<{
  service: OperationInvokeService
  principal: AgentAccessPrincipal
  correlationId: string
  /** Filled from the authoritative Answer reservation before execution. */
  reservationKey?: string
  generation?: number
}>

const answerPendingOriginSchema = z.strictObject({
  originTurnId: z.string().min(1),
  originGeneration: z.number().int().nonnegative(),
  terminalCheckpointDigest: z.string().min(1),
})

export const AnswerPendingDecisionSchema = z.strictObject({
  kind: z.enum([
    'confirmation_required',
    'authority_required',
    'operation_pending',
    'reconciliation_required',
  ]),
  operationRef: z.string().min(1),
  toolId: z.enum(['operation.execute', 'operation.invoke']),
  candidateSetDigest: z.string().min(1).exactOptional(),
  descriptorDigest: z.string().min(1).exactOptional(),
  inputDigest: z.string().min(1).exactOptional(),
  decisionDigest: z.string().min(1).exactOptional(),
  origin: answerPendingOriginSchema.exactOptional(),
})
export type AnswerPendingDecision = z.infer<typeof AnswerPendingDecisionSchema>

export const AnswerContinuationSourceSchema = z.strictObject({
  priorTurnId: z.string().min(1),
  priorTurnSeq: z.number().int().nonnegative(),
  priorSnapshotHash: z.string().min(1),
  priorTerminalCheckpointDigest: z.string().min(1),
})
export type AnswerContinuationSource = z.infer<typeof AnswerContinuationSourceSchema>

export type AnswerTurnOperationArtifacts = Readonly<{
  operationCandidates?: readonly AnswerOperationCandidate[]
  operationCandidatesDigest?: string
  operationComparison?: AnswerOperationComparison
  operationOutcome?: AnswerOperationOutcome
  operationPlan?: AnswerOperationPlan
  operationSelection?: AnswerOperationSelection
}>

export type AnswerTurnCheckpointToolDigest = Readonly<{
  toolCallId: string
  inputDigest: string
  resultDigest: string
}>

export type AnswerTurnCheckpoint = {
  schemaVersion: 1
  reservationKey: string
  requestDigest: string
  generation: number
  threadId: string
  turnId: string
  turnSeq: number
  stepOrdinal: number
  parentCheckpointDigest?: string
  route: AnswerTurnCheckpointRoute
  intent: FollowUpIntent
  interpretation?: AnswerRequestInterpretation
  requestedIntents?: AnswerRequestInterpretation['requestedIntents']
  continuationSource?: AnswerContinuationSource
  pendingDecision?: AnswerPendingDecision
  query: string
  priorTurnCount: number
  searchContext?: AeSearchContext
  priorProviders: readonly AnswerSource[]
  priorAllowedSlugs: readonly string[]
  toolCalls: readonly AnswerToolCallRecord[]
  toolCallDigests: readonly AnswerTurnCheckpointToolDigest[]
  operationCandidates?: readonly AnswerOperationCandidate[]
  operationCandidatesDigest?: string
  operationComparison?: AnswerOperationComparison
  operationOutcome?: AnswerOperationOutcome
  operationPlan?: AnswerOperationPlan
  operationSelection?: AnswerOperationSelection
  resultDigest?: string
  modelRequests: readonly HarnessModelRequestRecord[]
  selectedInputDigest?: string
  replayMessagesJson: string
  selectedOperationRef?: string
  selectedToolId?: AnswerToolId
  descriptorDigest?: string
}
export type AnswerToolCallResultSummary = {
  slugs: readonly string[]
  count: number
  /** Present only on error/refused records. */
  errorCode?: string
}

export type AnswerToolCallRecord = {
  toolCallId: string
  turnId: string
  seq: number
  toolId: AnswerToolId
  inputJson: string
  resultSummaryJson: string
  resultJson: string
  resultHash: string
  status: AnswerToolCallStatus
  /** False only when the requested call was rejected before any dispatch. */
  executed?: boolean
  createdAt: number
}


export type AnswerTurnTimingEntry = {
  name: string
  durationMs: number
  atMs: number
  metadata?: Record<string, string | number | boolean | null>
}

export type AnswerRunToolCounters = {
  total: number
  complete: number
  error: number
  refused: number
  totalDurationMs: number
}

export type AnswerRunWorkLogCounters = {
  total: number
  complete: number
  running: number
  skipped: number
  error: number
  stopped: number
}

export type AnswerRunTimingCounters = {
  count: number
  totalDurationMs: number
}

export type AnswerRunGateSummary = {
  ok: boolean
  source: 'answer_gate' | 'turn_status'
  code?: string
}

export type AnswerRunSummary = {
  schemaVersion: 1
  turn: {
    intent: FollowUpIntent
    status: AnswerTurnStatus
  }
  tools: {
    total: number
    complete: number
    error: number
    refused: number
    totalDurationMs: number
    byName: Partial<Record<AnswerToolId, AnswerRunToolCounters>>
  }
  evidence: {
    providerCount: number
    allowedSlugCount: number
    resultHashes: readonly string[]
    snapshotHash: string
  }
  workLog: AnswerRunWorkLogCounters
  timings: {
    totalEntries: number
    totalDurationMs: number
    byName: Record<string, AnswerRunTimingCounters>
  }
  gates: AnswerRunGateSummary
}

export type AnswerRunCoverage = {
  toolsAvailable: readonly AnswerToolId[]
  toolsInvoked: readonly AnswerToolId[]
  toolsUnused: readonly AnswerToolId[]
  workLogPhases: readonly string[]
  hasProviders: boolean
  hasAllowedSlugs: boolean
  hasSnapshotHash: boolean
}

export type AnswerRunReport = {
  summary: AnswerRunSummary
  coverage: AnswerRunCoverage
}

export type PublicAnswerCheckSummary = {
  catalogSearches: number
  listingsRead: number
  listedBusinesses: number
  checksPassed: number
  checksFailed: number
  elapsedMs: number
}

export type PublicThreadTurn = {
  turnId: string
  seq: number
  query: string
  intent: FollowUpIntent
  requestedIntents?: readonly AnswerRequestedIntent[]
  status: AnswerTurnStatus
  problem?: AnswerTurnProblem
  workLog: readonly AnswerWorkStep[]
  artifacts: readonly AnswerArtifact[]
  oneLine: string
  layoutProfile?: AnswerLayoutProfile
  answerCheckSummary?: PublicAnswerCheckSummary
  timing?: AeSearchContext['timing']
  timingDate?: string
  createdAt?: number
}

export type PublicThreadProjection = {
  threadId: string
  title: string
  turns: readonly PublicThreadTurn[]
}

const publicFiniteNumber = z.number().finite()
const publicNonnegativeInteger = publicFiniteNumber.int().nonnegative()
const publicAnswerTurnProblemSchema = z
  .unknown()
  .transform((value, context) => {
    const problem = parseAnswerTurnProblemStrict(value)
    if (problem === undefined) {
      context.addIssue({ code: 'custom', message: 'Invalid answer turn problem.' })
      return z.NEVER
    }
    return problem
  })

export const PublicAnswerCheckSummarySchema = z.strictObject({
  catalogSearches: publicNonnegativeInteger,
  listingsRead: publicNonnegativeInteger,
  listedBusinesses: publicNonnegativeInteger,
  checksPassed: publicNonnegativeInteger,
  checksFailed: publicNonnegativeInteger,
  elapsedMs: publicNonnegativeInteger,
})

export const PublicThreadTurnSchema = z.strictObject({
  turnId: z.string().min(1),
  seq: publicNonnegativeInteger,
  query: z.string(),
  intent: z.enum(FollowUpIntentValues),
  requestedIntents: AnswerRequestedIntentsSchema.optional(),
  status: z.enum(AnswerTurnStatusValues),
  problem: publicAnswerTurnProblemSchema.optional(),
  workLog: z.array(AnswerWorkStepSchema),
  artifacts: z.array(AnswerArtifactSchema),
  oneLine: z.string(),
  layoutProfile: z.enum(AnswerLayoutProfileValues).optional(),
  answerCheckSummary: PublicAnswerCheckSummarySchema.optional(),
  timing: z.enum(NeedTimingValues).optional(),
  timingDate: z.iso.date().optional(),
  createdAt: publicFiniteNumber.optional(),
}).superRefine((turn, context) => {
  if (turn.status === 'error' && turn.problem === undefined) {
    context.addIssue({ code: 'custom', path: ['problem'], message: 'Error turns require a problem.' })
  }
  if (turn.status !== 'error' && turn.problem !== undefined) {
    context.addIssue({ code: 'custom', path: ['problem'], message: 'Only error turns may carry a problem.' })
  }
  if (
    (turn.status === 'pending' || turn.status === 'stopped')
    && (turn.workLog.length > 0 || turn.artifacts.length > 0 || turn.oneLine !== '')
  ) {
    context.addIssue({ code: 'custom', message: 'Pending and stopped turns cannot carry answer content.' })
  }
})

export const PublicThreadProjectionSchema = z.strictObject({
  threadId: z.string().min(1),
  title: z.string(),
  turns: z.array(PublicThreadTurnSchema),
}).superRefine((projection, context) => {
  for (let index = 1; index < projection.turns.length; index += 1) {
    const previous = projection.turns[index - 1]
    const current = projection.turns[index]
    if (previous !== undefined && current !== undefined && current.seq <= previous.seq) {
      context.addIssue({ code: 'custom', path: ['turns', index, 'seq'], message: 'Turn sequence must increase.' })
    }
  }
})

export function parsePublicThreadProjection(
  value: unknown,
  expectedThreadId?: string,
): PublicThreadProjection | null {
  const parsed = PublicThreadProjectionSchema.safeParse(value)
  if (!parsed.success || expectedThreadId !== undefined && parsed.data.threadId !== expectedThreadId) {
    return null
  }
  return {
    threadId: parsed.data.threadId,
    title: parsed.data.title,
    turns: parsed.data.turns.map((turn) => ({
      turnId: turn.turnId,
      seq: turn.seq,
      query: turn.query,
      intent: turn.intent,
      status: turn.status,
      ...(turn.requestedIntents === undefined
        ? {}
        : { requestedIntents: turn.requestedIntents }),
      ...(turn.problem === undefined ? {} : { problem: turn.problem }),
      workLog: turn.workLog,
      artifacts: turn.artifacts,
      oneLine: turn.oneLine,
      ...(turn.layoutProfile === undefined ? {} : { layoutProfile: turn.layoutProfile }),
      ...(turn.answerCheckSummary === undefined ? {} : { answerCheckSummary: turn.answerCheckSummary }),
      ...(turn.timing === undefined ? {} : { timing: turn.timing }),
      ...(turn.timingDate === undefined ? {} : { timingDate: turn.timingDate }),
      ...(turn.createdAt === undefined ? {} : { createdAt: turn.createdAt }),
    })),
  }
}

export type AnswerTurnRequest = {
  threadId?: string
  query: string
  searchContext?: AeSearchContext
}
export const answerTurnRequestSchema = z.object({
  threadId: z.string().trim().min(1).optional(),
  query: z.string().trim().min(1).superRefine((query, context) => {
    const normalQuery = query.length <= 200
    const operationInput = parseAnswerOperationSelectionRecognition(query).kind === 'valid'
    if (!normalQuery && !operationInput) {
      context.addIssue({ code: 'custom', message: 'answer_turn_query_too_large' })
    }
  }),
  searchContext: AeSearchContextSchema.optional(),
})

export type FrozenTurnEvidence = {
  providers: readonly AnswerSource[]
  importedClaims?: readonly WebDiscoveryClaim[]
  operationCandidates?: readonly AnswerOperationCandidate[]
  operationCandidatesDigest?: string
  operationComparison?: AnswerOperationComparison
  operationOutcome?: AnswerOperationOutcome
  operationPlan?: AnswerOperationPlan
  operationSelection?: AnswerOperationSelection
  interpretation?: AnswerRequestInterpretation
  requestedIntents?: AnswerRequestInterpretation['requestedIntents']
  continuationSource?: AnswerContinuationSource
  pendingDecision?: AnswerPendingDecision
  selectedInputDigest?: string
  terminalCheckpointDigest?: string
  allowedSlugs: readonly string[]
  agentJsonUrl: string
  searchContext?: AeSearchContext
  toolCalls: readonly AnswerToolCallRecord[]
  /** Internal timing trace for answer quality/performance audits. */
  timings: readonly AnswerTurnTimingEntry[]
  /** Public work log persisted so replay shows the same visible process as the live stream. */
  workLog: readonly AnswerWorkStep[]
  /** Private OMP-style rollup used for debugging/evals; public projection exposes only sanitized counts. */
  answerRun: AnswerRunReport
  /** Durable pointer to the replayed harness run (runId === turnId), which lives in `harnessSessionEntries`. */
  harnessRunRef?: string
  /**
   * Internal reusable harness rollup; never exposed through public thread projection.
   * READ-SIDE REHYDRATION ONLY: the answer turn no longer persists this inline. The admin
   * run-viewer re-injects it from `harnessSessionEntries` (by `harnessRunRef`) before projecting.
   */
  harnessRun?: HarnessRunReport
  /** Private source-write receipt proving the final harness report and replay journal landed together. */
  harnessFinalization?: {
    schemaVersion: 1
    status: 'accepted' | 'replayed'
    finalizationHash: string
    journalEntryCount: number
    finalizedAt: number
  }
}

/** Evidence assembled before the persisted answer-run report is attached. */
export type FrozenTurnEvidenceDraft = Omit<FrozenTurnEvidence, 'answerRun'>

export type FrozenTurnProse = {
  oneLine: string
  summary: string
  nextStep: string
  compactLayout?: boolean
  layoutProfile?: AnswerLayoutProfile
}
