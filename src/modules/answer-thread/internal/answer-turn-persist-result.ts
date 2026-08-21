import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  stableAeSearchContextKey,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import type { AnswerSnapshot, AnswerWorkStep } from '@/modules/answer/public'
import { sanitizeAnswerOperationToolCallRecord } from '@/modules/answer/convex'
import type {
  HarnessModelRequestRecord,
  HarnessRunReport,
  HarnessRuntimeEvent,
} from '@/modules/harness/public'
import type {
  AnswerContinuationSource,
  AnswerPendingDecision,
  AnswerRequestInterpretation,
  AnswerRunGateSummary,
  AnswerToolCallRecord,
  AnswerTurnOperationArtifacts,
  AnswerTurnStatus,
  AnswerTurnTimingEntry,
  FollowUpIntent,
  FrozenTurnEvidence,
  FrozenTurnEvidenceDraft,
} from '../answer-thread.schema'
import { answerTurnFinalizationDigest } from './turn-digests'
import { buildAnswerHarnessOperationReport } from './answer-harness-operation'
import {
  buildAnswerRunReport,
  buildHarnessRunReportForAnswer,
} from './answer-run-summary'
import {
  buildArtifactKinds,
  buildFrozenEvidence,
  buildFrozenProse,
  emptyEvidence,
  emptyProse,
} from './answer-turn-evidence-freeze'

export type PersistAnswerTurnInput = {
  sessionId: string
  threadId: string
  isNewThread: boolean
  title: string
  reservationKey: string
  requestDigest: string
  expectedGeneration: number
  createdAt: number
  turnId: string
  turnSeq: number
  query: string
  intent: FollowUpIntent
  interpretation?: AnswerRequestInterpretation
  requestedIntents?: AnswerRequestInterpretation['requestedIntents']
  continuationSource?: AnswerContinuationSource
  pendingDecision?: AnswerPendingDecision
  selectedInputDigest?: string
  terminalCheckpointDigest?: string
  captured?: AnswerSnapshot
  errorCopyId?: string
  errorProblemJson?: string
  toolCalls: readonly AnswerToolCallRecord[]
  operationArtifacts?: AnswerTurnOperationArtifacts
  gate: AnswerRunGateSummary | undefined
  modelRequests?: readonly HarnessModelRequestRecord[]
  searchContext: AeSearchContext | undefined
  timings: readonly AnswerTurnTimingEntry[]
  workLog: readonly AnswerWorkStep[]
  allowedSlugs: ReadonlySet<string>
  sourceWriteRequest?: Request
  sourceWriteBody?: string | Uint8Array
  harnessRun?: HarnessRunReport
  harnessRuntimeEvents?: readonly HarnessRuntimeEvent[]
}

export type PersistAnswerTurnResult = {
  ok: boolean
  failure?: 'conflict' | 'unknown'
  status: Extract<AnswerTurnStatus, 'complete' | 'error'>
  snapshotHash: string
  finalizationDigest: string
  harnessRun: HarnessRunReport
  evidenceJson: string
}

export async function persistAnswerTurnWithResult(
  input: PersistAnswerTurnInput,
): Promise<PersistAnswerTurnResult> {
  const status =
    input.captured !== undefined ? ('complete' as const) : ('error' as const)
  const safeToolCalls = input.toolCalls.map(sanitizeAnswerOperationToolCallRecord)
  const baseEvidence =
    input.captured !== undefined
      ? buildFrozenEvidence(
          input.captured,
          input.allowedSlugs,
          safeToolCalls,
          input.searchContext,
          input.timings,
          input.workLog,
          input,
        )
      : emptyEvidence(
          input.searchContext,
          input.timings,
          input.workLog,
          input.allowedSlugs,
          safeToolCalls,
          input.operationArtifacts,
          input,
        )
  const prose =
    input.captured !== undefined
      ? buildFrozenProse(input.captured)
      : emptyProse()
  const snapshotHash = canonicalDigest({
    query: input.query,
    intent: input.intent,
    ...(input.searchContext === undefined
      ? {}
      : { searchContext: stableAeSearchContextKey(input.searchContext) }),
    ...(baseEvidence.operationCandidates === undefined
      ? {}
      : { operationCandidates: baseEvidence.operationCandidates }),
    ...(baseEvidence.operationComparison === undefined
      ? {}
      : { operationComparison: baseEvidence.operationComparison }),
    ...(baseEvidence.operationOutcome === undefined
      ? {}
      : { operationOutcome: baseEvidence.operationOutcome }),
    ...(baseEvidence.operationPlan === undefined
      ? {}
      : { operationPlan: baseEvidence.operationPlan }),
    ...(baseEvidence.operationSelection === undefined
      ? {}
      : { operationSelection: baseEvidence.operationSelection }),
    prose,
    ...(safeToolCalls.length === 0
      ? {}
      : { toolCalls: safeToolCalls.map((call) => call.resultHash) }),
  }).toString()
  const evidenceForSummary: FrozenTurnEvidenceDraft = baseEvidence
  const answerRun = buildAnswerRunReport({
    intent: input.intent,
    status,
    snapshotHash,
    evidence: evidenceForSummary,
    ...(input.gate === undefined ? {} : { gate: input.gate }),
  })
  const fallbackHarnessRun = buildHarnessRunReportForAnswer({
    runId: input.turnId,
    intent: input.intent,
    status,
    snapshotHash,
    evidence: evidenceForSummary,
    ...(input.gate === undefined ? {} : { gate: input.gate }),
  })
  const harnessRun =
    input.harnessRun ??
    (await buildAnswerHarnessOperationReport({
      runId: input.turnId,
      sessionId: input.sessionId,
      status,
      toolCalls: safeToolCalls,
      ...(input.modelRequests === undefined
        ? {}
        : { modelRequests: input.modelRequests }),
      fallbackReport: fallbackHarnessRun,
      ...(input.gate === undefined ? {} : { gate: input.gate }),
    }))
  const evidence: FrozenTurnEvidence = {
    ...evidenceForSummary,
    answerRun,
    harnessRunRef: input.turnId,
  }
  const turnRow = {
    reservationKey: input.reservationKey,
    requestDigest: input.requestDigest,
    sessionId: input.sessionId,
    threadId: input.threadId,
    turnId: input.turnId,
    turnSeq: input.turnSeq,
    createdAt: input.createdAt,
    query: input.query,
    intent: input.intent,
    evidenceJson: JSON.stringify(evidence),
    snapshotHash,
    proseJson: JSON.stringify(prose),
    artifactKindsJson: JSON.stringify(
      buildArtifactKinds(input.captured, input.operationArtifacts),
    ),
    finalStatus: status,
    ...(input.errorCopyId === undefined
      ? {}
      : { errorCopyId: input.errorCopyId }),
    ...(input.errorProblemJson === undefined
      ? {}
      : { errorProblemJson: input.errorProblemJson }),
    toolCalls: safeToolCalls.map((call) => ({
      toolCallId: call.toolCallId,
      seq: call.seq,
      toolId: call.toolId,
      inputJson: call.inputJson,
      resultSummaryJson: call.resultSummaryJson,
      resultJson: call.resultJson,
      resultHash: call.resultHash,
      status: call.status,
      createdAt: call.createdAt,
    })),
  }
  const finalizationDigest = answerTurnFinalizationDigest({
    expectedGeneration: input.expectedGeneration,
    turn: {
      turnId: input.turnId,
      threadId: input.threadId,
      seq: input.turnSeq,
      query: input.query,
      intent: input.intent,
      evidenceJson: turnRow.evidenceJson,
      snapshotHash: turnRow.snapshotHash,
      proseJson: turnRow.proseJson,
      artifactKindsJson: turnRow.artifactKindsJson,
      createdAt: input.createdAt,
      status,
      ...(input.errorCopyId === undefined
        ? {}
        : { errorCopyId: input.errorCopyId }),
      ...(input.errorProblemJson === undefined
        ? {}
        : { errorProblemJson: input.errorProblemJson }),
    },
    toolCalls: safeToolCalls,
  })

  return {
    ok: true,
    status,
    snapshotHash,
    finalizationDigest,
    harnessRun,
    evidenceJson: turnRow.evidenceJson,
  }
}
