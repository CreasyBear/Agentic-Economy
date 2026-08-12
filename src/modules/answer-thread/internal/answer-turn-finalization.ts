import {
  buildArtifactsFromSnapshot,
  type AnswerSnapshot,
  type AnswerSource,
  type AnswerWorkStep,
} from '@/modules/answer/public'
import {
  stableAeSearchContextKey,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { AppendHarnessSessionEntrySourceInput } from '@/modules/harness/harness.functions'
import type {
  HarnessModelRequestRecord,
  HarnessRunReport,
  HarnessRuntimeEvent,
  HarnessRunStatus,
  HarnessSessionEntryKind,
} from '@/modules/harness/public'

import {
  buildAnswerTurnProblem,
  type AnswerTurnProblem,
} from '@/lib/errors'
import type {
  AnswerRunGateSummary,
  AnswerToolCallRecord,
  AnswerTurnCheckpoint,
  AnswerTurnOperationArtifacts,
  AnswerTurnRecord,
  AnswerTurnStatus,
  AnswerTurnTimingEntry,
  FollowUpIntent,
  PublicThreadProjection,
  FrozenTurnEvidence,
  FrozenTurnEvidenceDraft,
  FrozenTurnProse,
} from '../answer-thread.schema'
import type { AnswerOperationCandidate } from '@/modules/answer/answer-schema'
import {
  finalizeReservedAnswerTurnFromRequest,
  getOwnedThreadProjection,
  getThreadTurns,
  readAnswerTurnCheckpoint,
  type AnswerHarnessFinalizationResult,
  type AnswerTurnReservationResult,
  type FinalizeReservedAnswerTurnArgs,
} from '../answer-thread.functions'
import { buildAnswerHarnessOperationReport } from './answer-harness-operation'
import {
  buildAnswerRunReport,
  buildHarnessRunReportForAnswer,
} from './answer-run-summary'
import { answerTurnFinalizationDigest } from './turn-digests'
import { parseFrozenEvidence } from './public-projection'

export type AnswerTurnRecordLite = Pick<
  AnswerTurnRecord,
  'evidenceJson' | 'query' | 'seq' | 'status'
>

export async function readPriorCompleteTurns(
  threadId: string | undefined,
  pseudonymousSessionId: string,
): Promise<AnswerTurnRecordLite[]> {
  if (threadId === undefined) {
    return []
  }

  try {
    // Answer-thread writes cap a thread at 25 turns, so one bounded native page is complete.
    const page = await getThreadTurns(threadId, pseudonymousSessionId, {
      cursor: null,
      numItems: 25,
    })
    return page.page.filter(
      (turn: AnswerTurnRecord) => turn.status === 'complete',
    )
  } catch {
    return []
  }
}

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

export type AnswerHarnessFinalizerInput = FinalizeReservedAnswerTurnArgs & {
  request: Request
}

export type AnswerHarnessFinalizer = (
  input: AnswerHarnessFinalizerInput,
) => Promise<AnswerHarnessFinalizationResult>

let answerHarnessFinalizer: AnswerHarnessFinalizer = async (input) => {
  const { request, ...args } = input
  return finalizeReservedAnswerTurnFromRequest(request, args)
}

export function setAnswerHarnessFinalizerForTests(
  finalizer: AnswerHarnessFinalizer,
): () => void {
  const previous = answerHarnessFinalizer
  answerHarnessFinalizer = finalizer
  return () => {
    answerHarnessFinalizer = previous
  }
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
  const baseEvidence =
    input.captured !== undefined
      ? buildFrozenEvidence(
          input.captured,
          input.allowedSlugs,
          input.toolCalls,
          input.searchContext,
          input.timings,
          input.workLog,
        )
      : emptyEvidence(
          input.searchContext,
          input.timings,
          input.workLog,
          input.allowedSlugs,
          input.toolCalls,
          input.operationArtifacts,
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
    providers: baseEvidence.providers.map((provider) => provider.slug),
    ...(baseEvidence.operationCandidates === undefined
      ? {}
      : { operationCandidates: baseEvidence.operationCandidates }),
    ...(baseEvidence.operationOutcome === undefined
      ? {}
      : { operationOutcome: baseEvidence.operationOutcome }),
    ...(baseEvidence.operationSelection === undefined
      ? {}
      : { operationSelection: baseEvidence.operationSelection }),
    prose,
    ...(input.toolCalls.length === 0
      ? {}
      : { toolCalls: input.toolCalls.map((call) => call.resultHash) }),
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
      toolCalls: input.toolCalls,
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
    toolCalls: input.toolCalls.map((call) => ({
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
    toolCalls: input.toolCalls,
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
export async function finalizePersistedAnswerTurnHarnessRun(args: {
  input: PersistAnswerTurnInput
  persistResult: PersistAnswerTurnResult
  harnessRun: HarnessRunReport
  runtimeEvents?: readonly HarnessRuntimeEvent[]
  finalizer?: AnswerHarnessFinalizer
}): Promise<AnswerHarnessFinalizationResult> {
  const request = args.input.sourceWriteRequest
  const body = args.input.sourceWriteBody
  if (request === undefined || body === undefined) {
    return {
      status: 'denied',
      reason: 'source_write_failed',
      message: 'source_write_request_missing',
    }
  }

  const entries = buildAnswerHarnessSessionJournalEntries({
    input: args.input,
    harnessRun: args.harnessRun,
    snapshotHash: args.persistResult.snapshotHash,
    status: args.persistResult.status,
    ...(args.runtimeEvents === undefined
      ? {}
      : { runtimeEvents: args.runtimeEvents }),
  })
  const finalizationHash = buildAnswerHarnessFinalizationHash({
    input: args.input,
    persistResult: args.persistResult,
    harnessRun: args.harnessRun,
    entries,
  })
  const finalizedEvidence = finalizeEvidenceJson({
    evidenceJson: args.persistResult.evidenceJson,
    harnessRun: args.harnessRun,
    finalizationHash,
    journalEntryCount: entries.length,
  })
  return (args.finalizer ?? answerHarnessFinalizer)({
    request,
    sourceWriteBody: body,
    reservationKey: args.input.reservationKey,
    requestDigest: args.input.requestDigest,
    sessionId: args.input.sessionId,
    threadId: args.input.threadId,
    turnId: args.input.turnId,
    turnSeq: args.input.turnSeq,
    expectedGeneration: args.input.expectedGeneration,
    createdAt: args.input.createdAt,
    answerDigest: args.persistResult.finalizationDigest,
    query: args.input.query,
    intent: args.input.intent,
    finalStatus: args.persistResult.status,
    snapshotHash: args.persistResult.snapshotHash,
    evidenceJson: finalizedEvidence,
    proseJson: JSON.stringify(
      args.input.captured === undefined
        ? emptyProse()
        : buildFrozenProse(args.input.captured),
    ),
    artifactKindsJson: JSON.stringify(
      buildArtifactKinds(args.input.captured, args.input.operationArtifacts),
    ),
    ...(args.input.errorCopyId === undefined
      ? {}
      : { errorCopyId: args.input.errorCopyId }),
    ...(args.input.errorProblemJson === undefined
      ? {}
      : { errorProblemJson: args.input.errorProblemJson }),
    finalizationHash,
    toolCalls: args.input.toolCalls.map((call) => ({
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
    entries,
  })
}

export function answerHarnessFinalizationSucceeded(
  result: AnswerHarnessFinalizationResult | undefined,
): result is Extract<
  AnswerHarnessFinalizationResult,
  { status: 'accepted' | 'replayed' }
> {
  return result?.status === 'accepted' || result?.status === 'replayed'
}

type AdmittedAnswerTurnReservation = Extract<
  AnswerTurnReservationResult,
  { reservationKey: string }
>

export type FinalizeReservedAnswerTurnErrorResult =
  | { kind: 'error'; problem: AnswerTurnProblem }
  | { kind: 'stopped' }
  | { kind: 'unavailable' }

export async function finalizeReservedAnswerTurnError(input: {
  request: Request
  sourceWriteBody: string | Uint8Array
  admission: AdmittedAnswerTurnReservation
  sessionId: string
  requestDigest: string
  query: string
  searchContext?: AeSearchContext
  isNewThread: boolean
}): Promise<FinalizeReservedAnswerTurnErrorResult> {
  let projection: PublicThreadProjection | null
  try {
    projection = await getOwnedThreadProjection(
      input.admission.threadId,
      input.sessionId,
    )
  } catch {
    return { kind: 'unavailable' }
  }
  if (projection === null) {
    return { kind: 'unavailable' }
  }
  const existing = projection?.turns.find(
    (turn) => turn.turnId === input.admission.turnId,
  )
  if (existing?.status === 'error') {
    return {
      kind: 'error',
      problem: existing.problem ?? buildAnswerTurnProblem('answer_turn_failed'),
    }
  }
  if (existing?.status === 'stopped') {
    return { kind: 'stopped' }
  }
  if (input.admission.kind === 'in_progress') {
    return { kind: 'unavailable' }
  }
  if (existing?.status !== 'pending' || existing.createdAt === undefined) {
    return { kind: 'unavailable' }
  }

  let checkpoint: AnswerTurnCheckpoint | undefined
  try {
    const checkpointResult = await readAnswerTurnCheckpoint({
      reservationKey: input.admission.reservationKey,
      requestDigest: input.requestDigest,
      sessionId: input.sessionId,
      threadId: input.admission.threadId,
      turnId: input.admission.turnId,
      turnSeq: input.admission.turnSeq,
      generation: input.admission.generation,
      sourceWriteRequest: input.request,
      sourceWriteBody: input.sourceWriteBody,
    })
    if (checkpointResult.kind === 'checkpoint') {
      checkpoint = checkpointResult.checkpoint
    } else if (checkpointResult.kind !== 'missing') {
      return checkpointResult.reason === 'stopped'
        ? { kind: 'stopped' }
        : { kind: 'unavailable' }
    }
  } catch {
    return { kind: 'unavailable' }
  }

  const problem = buildAnswerTurnProblem('answer_turn_failed')
  const operationArtifacts = checkpoint === undefined
    ? undefined
    : {
        ...(checkpoint.operationCandidates === undefined
          ? {}
          : { operationCandidates: checkpoint.operationCandidates }),
        ...(checkpoint.operationCandidatesDigest === undefined
          ? {}
          : { operationCandidatesDigest: checkpoint.operationCandidatesDigest }),
        ...(checkpoint.operationOutcome === undefined
          ? {}
          : { operationOutcome: checkpoint.operationOutcome }),
        ...(checkpoint.operationSelection === undefined
          ? {}
          : { operationSelection: checkpoint.operationSelection }),
      } satisfies AnswerTurnOperationArtifacts
  const persistInput: PersistAnswerTurnInput = {
    sessionId: input.sessionId,
    threadId: input.admission.threadId,
    isNewThread: input.isNewThread,
    title: projection.title,
    reservationKey: input.admission.reservationKey,
    requestDigest: input.requestDigest,
    expectedGeneration: input.admission.generation,
    createdAt: existing.createdAt,
    turnId: input.admission.turnId,
    turnSeq: input.admission.turnSeq,
    query: checkpoint?.query ?? input.query,
    intent: checkpoint?.intent ?? existing.intent,
    errorProblemJson: JSON.stringify(problem),
    toolCalls: checkpoint?.toolCalls ?? [],
    ...(operationArtifacts === undefined ? {} : { operationArtifacts }),
    gate: undefined,
    ...(checkpoint?.modelRequests === undefined
      ? {}
      : { modelRequests: checkpoint.modelRequests }),
    searchContext: checkpoint?.searchContext ?? input.searchContext,
    timings: [],
    workLog: [],
    allowedSlugs: new Set(checkpoint?.priorAllowedSlugs ?? []),
    sourceWriteRequest: input.request,
    sourceWriteBody: input.sourceWriteBody,
  }

  try {
    const persistResult = await persistAnswerTurnWithResult(persistInput)
    const finalized = await finalizePersistedAnswerTurnHarnessRun({
      input: persistInput,
      persistResult,
      harnessRun: persistResult.harnessRun,
    })
    if (answerHarnessFinalizationSucceeded(finalized)) {
      return { kind: 'error', problem }
    }
    return finalized.status === 'conflict' && finalized.reason === 'stopped'
      ? { kind: 'stopped' }
      : { kind: 'unavailable' }
  } catch {
    return { kind: 'unavailable' }
  }
}

function finalizeEvidenceJson(input: {
  evidenceJson: string
  harnessRun: HarnessRunReport
  finalizationHash: string
  journalEntryCount: number
}): string {
  const evidence = parseFrozenEvidence(input.evidenceJson)
  // Spread preserves `harnessRunRef`; the full report stays in `harnessSessionEntries`.
  const finalized: FrozenTurnEvidence = {
    ...evidence,
    harnessFinalization: {
      schemaVersion: 1,
      status: 'accepted',
      finalizationHash: input.finalizationHash,
      journalEntryCount: input.journalEntryCount,
      finalizedAt: input.harnessRun.summary.run.endedAt ?? Date.now(),
    },
  }
  return JSON.stringify(finalized)
}

function buildAnswerHarnessFinalizationHash(input: {
  input: PersistAnswerTurnInput
  persistResult: PersistAnswerTurnResult
  harnessRun: HarnessRunReport
  entries: readonly AppendHarnessSessionEntrySourceInput[]
}): string {
  return canonicalDigest({
    schemaVersion: 1,
    turnId: input.input.turnId,
    threadId: input.input.threadId,
    sessionId: input.input.sessionId,
    snapshotHash: input.persistResult.snapshotHash,
    run: cloneStableValue(input.harnessRun),
    entries: input.entries.map((entry) => ({
      entryId: entry.entryId,
      idempotencyKey: entry.idempotencyKey ?? entry.entryId,
      kind: entry.kind,
      runId: entry.runId,
      turnId: entry.turnId ?? null,
      payloadJson: entry.payloadJson,
      publicSummaryJson: entry.publicSummaryJson ?? null,
      privatePayloadJson: entry.privatePayloadJson ?? null,
    })),
  }).toString()
}

function cloneStableValue(value: unknown): StableHashValue {
  return structuredClone(value) as StableHashValue
}

export function collectLatestFrozenProviders(
  priorTurns: readonly AnswerTurnRecordLite[],
): AnswerSource[] {
  return readLatestFrozenEvidence(priorTurns)?.providers.slice() ?? []
}

export function collectLatestFrozenAllowedSlugs(
  priorTurns: readonly AnswerTurnRecordLite[],
): string[] {
  return [...(readLatestFrozenEvidence(priorTurns)?.allowedSlugs ?? [])]
}
export function collectLatestFrozenOperationCandidates(
  priorTurns: readonly AnswerTurnRecordLite[],
): AnswerOperationCandidate[] {
  return (
    readLatestFrozenEvidence(priorTurns)?.operationCandidates?.slice() ?? []
  )
}

function readLatestFrozenEvidence(
  priorTurns: readonly AnswerTurnRecordLite[],
): FrozenTurnEvidence | undefined {
  const sorted = priorTurns.toSorted((left, right) => right.seq - left.seq)
  for (const turn of sorted) {
    try {
      return parseFrozenEvidence(turn.evidenceJson)
    } catch {
      // Skip malformed evidence and keep looking for the latest usable turn.
    }
  }
  return undefined
}

function buildFrozenEvidence(
  snapshot: AnswerSnapshot,
  allowedSlugs: ReadonlySet<string>,
  toolCalls: readonly AnswerToolCallRecord[],
  searchContext: AeSearchContext | undefined,
  timings: readonly AnswerTurnTimingEntry[],
  workLog: readonly AnswerWorkStep[],
): FrozenTurnEvidenceDraft {
  return {
    providers: snapshot.providers,
    ...(snapshot.operationCandidates === undefined
      ? {}
      : { operationCandidates: snapshot.operationCandidates }),
    ...(snapshot.operationCandidatesDigest === undefined
      ? {}
      : { operationCandidatesDigest: snapshot.operationCandidatesDigest }),
    ...(snapshot.operationOutcome === undefined
      ? {}
      : { operationOutcome: snapshot.operationOutcome }),
    ...(snapshot.operationSelection === undefined
      ? {}
      : { operationSelection: snapshot.operationSelection }),
    ...(snapshot.importedClaims === undefined ||
    snapshot.importedClaims.length === 0
      ? {}
      : { importedClaims: snapshot.importedClaims }),
    allowedSlugs: [...allowedSlugs],
    agentJsonUrl: snapshot.agentJsonUrl,
    ...(searchContext === undefined ? {} : { searchContext }),
    toolCalls,
    timings,
    workLog,
  }
}

function buildFrozenProse(snapshot: AnswerSnapshot): FrozenTurnProse {
  return {
    oneLine: snapshot.oneLine,
    summary: snapshot.summary,
    nextStep: snapshot.nextStep,
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    ...(snapshot.layoutProfile === undefined
      ? {}
      : { layoutProfile: snapshot.layoutProfile }),
  }
}

function emptyEvidence(
  searchContext: AeSearchContext | undefined,
  timings: readonly AnswerTurnTimingEntry[],
  workLog: readonly AnswerWorkStep[],
  allowedSlugs: ReadonlySet<string>,
  toolCalls: readonly AnswerToolCallRecord[],
  operationArtifacts?: AnswerTurnOperationArtifacts,
): FrozenTurnEvidenceDraft {
  return {
    providers: [],
    ...(operationArtifacts?.operationCandidates === undefined
      ? {}
      : { operationCandidates: operationArtifacts.operationCandidates }),
    ...(operationArtifacts?.operationCandidatesDigest === undefined
      ? {}
      : {
          operationCandidatesDigest:
            operationArtifacts.operationCandidatesDigest,
        }),
    ...(operationArtifacts?.operationOutcome === undefined
      ? {}
      : { operationOutcome: operationArtifacts.operationOutcome }),
    ...(operationArtifacts?.operationSelection === undefined
      ? {}
      : { operationSelection: operationArtifacts.operationSelection }),
    allowedSlugs: [...allowedSlugs],
    agentJsonUrl: '',
    ...(searchContext === undefined ? {} : { searchContext }),
    toolCalls,
    timings,
    workLog,
  }
}

function buildArtifactKinds(
  captured: AnswerSnapshot | undefined,
  operationArtifacts: AnswerTurnOperationArtifacts | undefined,
): string[] {
  if (captured !== undefined) {
    return buildArtifactsFromSnapshot(captured).map((artifact) => artifact.kind)
  }
  return [
    ...(operationArtifacts?.operationCandidates === undefined ||
    operationArtifacts.operationCandidates.length === 0
      ? []
      : ['operation-candidates']),
    ...(operationArtifacts?.operationOutcome === undefined
      ? []
      : ['operation-outcome']),
  ]
}

function emptyProse(): FrozenTurnProse {
  return { oneLine: '', summary: '', nextStep: '' }
}

function buildAnswerHarnessSessionJournalEntries(args: {
  input: PersistAnswerTurnInput
  harnessRun: HarnessRunReport
  snapshotHash: string
  status: AnswerTurnStatus
  runtimeEvents?: readonly HarnessRuntimeEvent[]
}): AppendHarnessSessionEntrySourceInput[] {
  const createdAt = Date.now()
  const ownerKey = answerHarnessSessionOwnerKey(args.input.sessionId)
  const runStatus = args.harnessRun.summary.run.status
  const queryHash = canonicalDigest(args.input.query).toString()
  const gate = args.input.gate ?? {
    ok: args.status === 'complete',
    source: 'turn_status',
  }
  const shared = {
    ownerKey,
    sessionId: args.input.sessionId,
    runId: args.input.turnId,
    turnId: args.input.turnId,
    createdAt,
  } satisfies {
    ownerKey: string
    sessionId: string
    runId: string
    turnId: string
    createdAt: number
  }

  if (args.runtimeEvents !== undefined && args.runtimeEvents.length > 0) {
    return buildRuntimeAnswerHarnessSessionJournalEntries({
      input: args.input,
      harnessRun: args.harnessRun,
      snapshotHash: args.snapshotHash,
      status: args.status,
      runtimeEvents: args.runtimeEvents,
      shared,
      createdAt,
      ownerKey,
      runStatus,
      gate,
    })
  }

  return [
    answerHarnessJournalEntry({
      ...shared,
      kind: 'turn.started',
      status: runStatus,
      payload: {
        threadId: args.input.threadId,
        turnSeq: args.input.turnSeq,
        isNewThread: args.input.isNewThread,
        intent: args.input.intent,
        queryHash,
      },
      publicSummary: {
        turn: args.input.turnSeq,
        state: 'started',
      },
    }),
    answerHarnessJournalEntry({
      ...shared,
      kind: 'gate.evaluated',
      status: gate.ok ? 'ok' : runStatus,
      payload: {
        gate,
      },
      publicSummary: {
        checks: gate.ok ? 'passed' : 'blocked',
      },
    }),
    answerHarnessJournalEntry({
      ...shared,
      kind: 'turn.persisted',
      status: runStatus,
      payload: {
        threadId: args.input.threadId,
        snapshotHash: args.snapshotHash,
        turnStatus: args.status,
      },
      publicSummary: {
        stored: true,
      },
    }),
    answerHarnessJournalEntry({
      ...shared,
      kind: 'run.reported',
      status: runStatus,
      payload: {
        summary: args.harnessRun.summary,
        coverage: args.harnessRun.coverage,
      },
      privatePayload: {
        harnessRun: args.harnessRun,
        runtimeEvent: {
          type: 'run.reported',
          runId: args.input.turnId,
          report: args.harnessRun,
        },
      },
      publicSummary: {
        status: runStatus,
        tools: args.harnessRun.summary.tools.total,
        checks: args.harnessRun.summary.gates?.total ?? 0,
        elapsedMs: args.harnessRun.summary.run.durationMs,
      },
    }),
  ]
}

function buildRuntimeAnswerHarnessSessionJournalEntries(args: {
  input: PersistAnswerTurnInput
  harnessRun: HarnessRunReport
  snapshotHash: string
  status: AnswerTurnStatus
  runtimeEvents: readonly HarnessRuntimeEvent[]
  shared: {
    ownerKey: string
    sessionId: string
    runId: string
    turnId: string
    createdAt: number
  }
  createdAt: number
  ownerKey: string
  runStatus: HarnessRunStatus
  gate: AnswerRunGateSummary
}): AppendHarnessSessionEntrySourceInput[] {
  const entries: AppendHarnessSessionEntrySourceInput[] = []

  args.runtimeEvents.forEach((event, index) => {
    const mapped = mapRuntimeEventToJournalEntry(event, args)
    if (mapped === undefined) {
      return
    }

    entries.push(
      answerHarnessJournalEntry({
        ...args.shared,
        createdAt: runtimeEventAt(event) ?? args.createdAt,
        kind: mapped.kind,
        status: mapped.status,
        entryIdSuffix: `${String(index).padStart(4, '0')}-${mapped.kind.replaceAll('.', '-')}`,
        idempotencyKeySuffix: `${String(index).padStart(4, '0')}-${mapped.kind}`,
        payload: mapped.payload,
        publicSummary: mapped.publicSummary,
        ...(mapped.privatePayload === undefined
          ? {}
          : { privatePayload: mapped.privatePayload }),
      }),
    )
  })

  if (!entries.some((entry) => entry.kind === 'run.reported')) {
    entries.push(
      answerHarnessJournalEntry({
        ...args.shared,
        kind: 'run.reported',
        status: args.runStatus,
        entryIdSuffix: `${String(args.runtimeEvents.length).padStart(4, '0')}-run-reported`,
        idempotencyKeySuffix: `${String(args.runtimeEvents.length).padStart(4, '0')}-run.reported`,
        payload: {
          summary: args.harnessRun.summary,
          coverage: args.harnessRun.coverage,
        },
        privatePayload: {
          harnessRun: args.harnessRun,
          runtimeEvent: {
            type: 'run.reported',
            runId: args.input.turnId,
            report: args.harnessRun,
          },
        },
        publicSummary: {
          status: args.runStatus,
          tools: args.harnessRun.summary.tools.total,
          checks: args.harnessRun.summary.gates?.total ?? 0,
          elapsedMs: args.harnessRun.summary.run.durationMs,
        },
      }),
    )
  }

  return entries
}

function mapRuntimeEventToJournalEntry(
  event: HarnessRuntimeEvent,
  context: {
    input: PersistAnswerTurnInput
    harnessRun: HarnessRunReport
    snapshotHash: string
    status: AnswerTurnStatus
    runStatus: HarnessRunStatus
    gate: AnswerRunGateSummary
  },
):
  | {
      kind: HarnessSessionEntryKind
      status: HarnessRunStatus
      payload: unknown
      publicSummary: unknown
      privatePayload?: unknown
    }
  | undefined {
  switch (event.type) {
    case 'run.started':
      return {
        kind: 'turn.started',
        status: 'ok',
        payload: {
          runtimeEvent: event,
          threadId: context.input.threadId,
          turnSeq: context.input.turnSeq,
          isNewThread: context.input.isNewThread,
          intent: context.input.intent,
          queryHash: canonicalDigest(context.input.query).toString(),
        },
        publicSummary: {
          turn: context.input.turnSeq,
          state: 'started',
        },
      }
    case 'phase.completed':
      if (event.phase === 'context') {
        return {
          kind: 'context.loaded',
          status: 'ok',
          payload: { runtimeEvent: event },
          publicSummary: { context: 'loaded' },
        }
      }
      if (event.phase === 'intent' || event.phase === 'route') {
        return {
          kind: 'intent.routed',
          status: 'ok',
          payload: { runtimeEvent: event },
          publicSummary: { route: 'selected' },
        }
      }
      return undefined
    case 'phase.failed':
      return {
        kind: 'turn.error',
        status: runtimeFailureStatus(event.errorCode),
        payload: { runtimeEvent: event },
        publicSummary: { status: 'error' },
      }
    case 'tool.started':
      return {
        kind: 'tool.started',
        status: 'ok',
        payload: { runtimeEvent: event },
        publicSummary: { tool: 'started' },
      }
    case 'tool.completed':
    case 'tool.failed':
      return {
        kind: event.type,
        status:
          event.status ??
          (event.type === 'tool.completed'
            ? 'ok'
            : runtimeFailureStatus(event.errorCode)),
        payload: { runtimeEvent: event },
        publicSummary: {
          tool: event.type === 'tool.completed' ? 'completed' : 'failed',
        },
      }
    case 'model.started':
      return {
        kind: 'model.started',
        status: 'ok',
        payload: { runtimeEvent: event },
        publicSummary: { model: 'started' },
      }
    case 'model.completed':
    case 'model.failed':
      return {
        kind: event.type,
        status:
          event.type === 'model.completed'
            ? 'ok'
            : runtimeFailureStatus(event.errorCode),
        payload: { runtimeEvent: event },
        publicSummary: {
          model: event.type === 'model.completed' ? 'completed' : 'failed',
        },
      }
    case 'gate.evaluated':
      return {
        kind: 'gate.evaluated',
        status: event.ok
          ? 'ok'
          : runtimeFailureStatus(event.errorCode ?? context.gate.code),
        payload: { runtimeEvent: event, gate: context.gate },
        publicSummary: { checks: event.ok ? 'passed' : 'blocked' },
      }
    case 'persist.completed':
    case 'persist.failed':
      return {
        kind:
          event.type === 'persist.completed' ? 'turn.persisted' : 'turn.error',
        status:
          event.type === 'persist.completed'
            ? context.runStatus
            : runtimeFailureStatus(event.errorCode),
        payload: {
          runtimeEvent: event,
          threadId: context.input.threadId,
          snapshotHash: context.snapshotHash,
          turnStatus: context.status,
        },
        publicSummary:
          event.type === 'persist.completed'
            ? { stored: true }
            : { stored: false },
      }
    case 'run.completed':
      return {
        kind: 'run.reported',
        status: event.report.summary.run.status,
        payload: {
          summary: event.report.summary,
          coverage: event.report.coverage,
        },
        privatePayload: {
          harnessRun: context.harnessRun,
          runtimeEvent: event,
        },
        publicSummary: {
          status: event.report.summary.run.status,
          tools: event.report.summary.tools.total,
          checks: event.report.summary.gates?.total ?? 0,
          elapsedMs: event.report.summary.run.durationMs,
        },
      }
    case 'phase.started':
    case 'persist.started':
    case 'operation.event':
      return undefined
  }
}

function runtimeEventAt(event: HarnessRuntimeEvent): number | undefined {
  if ('at' in event) {
    return event.at
  }
  if (event.type === 'run.started') {
    return event.startedAt
  }
  return undefined
}

function runtimeFailureStatus(errorCode: string | undefined): HarnessRunStatus {
  if (errorCode === 'run_aborted' || errorCode === 'tool_aborted') {
    return 'aborted'
  }
  if (errorCode === 'run_timeout' || errorCode === 'tool_timeout') {
    return 'timeout'
  }
  if (errorCode === 'tool_refused') {
    return 'refused'
  }
  if (
    errorCode === 'grounding_failed' ||
    errorCode === 'turn_error' ||
    errorCode?.includes('blocked') === true
  ) {
    return 'blocked'
  }
  return 'error'
}

function answerHarnessJournalEntry(input: {
  ownerKey: string
  sessionId: string
  runId: string
  turnId: string
  createdAt: number
  kind: HarnessSessionEntryKind
  status: HarnessRunStatus
  payload: unknown
  publicSummary: unknown
  privatePayload?: unknown
  entryIdSuffix?: string
  idempotencyKeySuffix?: string
}): AppendHarnessSessionEntrySourceInput {
  const idSuffix = input.entryIdSuffix ?? input.kind.replaceAll('.', '-')
  const idempotencyKey = `answer-turn:${input.turnId}:${input.idempotencyKeySuffix ?? input.kind}`
  return {
    ownerKey: input.ownerKey,
    entryId: `${input.turnId}:${idSuffix}`,
    sessionId: input.sessionId,
    runId: input.runId,
    turnId: input.turnId,
    kind: input.kind,
    status: input.status,
    idempotencyKey,
    createdAt: input.createdAt,
    payloadJson: JSON.stringify(input.payload),
    publicSummaryJson: JSON.stringify(input.publicSummary),
    ...(input.privatePayload === undefined
      ? {}
      : { privatePayloadJson: JSON.stringify(input.privatePayload) }),
  }
}

function answerHarnessSessionOwnerKey(sessionId: string): string {
  return `owner:${sessionId}`
}
