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
import { stableHash, type StableHashValue } from '@/modules/common/stable-hash'
import {
  appendHarnessSessionEntryToSourceFromRequest,
  type AppendHarnessSessionEntryResult,
  type AppendHarnessSessionEntrySourceInput,
} from '@/modules/harness/harness.functions'
import type {
  HarnessModelRequestRecord,
  HarnessRunReport,
  HarnessRuntimeEvent,
  HarnessRunStatus,
  HarnessSessionEntryKind,
} from '@/modules/harness/public'

import type {
  AnswerRunGateSummary,
  AnswerToolCallRecord,
  AnswerTurnRecord,
  AnswerTurnStatus,
  AnswerTurnTimingEntry,
  FollowUpIntent,
  FrozenTurnEvidence,
  FrozenTurnProse,
} from '../answer-thread.schema'
import {
  appendAnswerTurnWithThreadAndToolCalls,
  appendAnswerTurnWithToolCalls,
  finalizeAnswerTurnHarnessRunFromRequest,
  getThreadTurns,
  type AnswerHarnessFinalizationResult,
  type FinalizeAnswerTurnHarnessRunArgs,
} from '../answer-thread.functions'
import { buildAnswerHarnessOperationReport } from './answer-harness-operation'
import { buildAnswerRunReport, buildHarnessRunReportForAnswer } from './answer-run-summary'
import { parseFrozenEvidence } from './public-projection'

export type AnswerTurnRecordLite = Pick<AnswerTurnRecord, 'evidenceJson' | 'query' | 'seq' | 'status'>

export async function readPriorCompleteTurns(threadId: string | undefined): Promise<AnswerTurnRecordLite[]> {
  if (threadId === undefined) {
    return []
  }

  try {
    return (await getThreadTurns(threadId)).turns.filter((turn) => turn.status === 'complete')
  } catch {
    return []
  }
}

export type PersistAnswerTurnInput = {
  sessionId: string
  threadId: string
  isNewThread: boolean
  title: string
  turnId: string
  turnSeq: number
  query: string
  intent: FollowUpIntent
  captured: AnswerSnapshot | undefined
  errorCopyId: string | undefined
  toolCalls: readonly AnswerToolCallRecord[]
  gate: AnswerRunGateSummary | undefined
  modelRequests?: readonly HarnessModelRequestRecord[]
  searchContext: AeSearchContext | undefined
  timings: readonly AnswerTurnTimingEntry[]
  workLog: readonly AnswerWorkStep[]
  allowedSlugs: ReadonlySet<string>
  sourceWriteRequest?: Request
  harnessRun?: HarnessRunReport
  harnessRuntimeEvents?: readonly HarnessRuntimeEvent[]
  skipHarnessSessionJournal?: boolean
}

export type AnswerHarnessSessionJournalWriteInput = {
  request: Request
  entry: AppendHarnessSessionEntrySourceInput
}

export type AnswerHarnessSessionJournalWriter = (
  input: AnswerHarnessSessionJournalWriteInput
) => Promise<AppendHarnessSessionEntryResult>

export type AnswerHarnessFinalizerInput = FinalizeAnswerTurnHarnessRunArgs & {
  request: Request
}

export type AnswerHarnessFinalizer = (
  input: AnswerHarnessFinalizerInput
) => Promise<AnswerHarnessFinalizationResult>

let answerHarnessSessionJournalWriter: AnswerHarnessSessionJournalWriter = async (input) =>
  appendHarnessSessionEntryToSourceFromRequest(input)

let answerHarnessFinalizer: AnswerHarnessFinalizer = async (input) => {
  const { request, ...args } = input
  return finalizeAnswerTurnHarnessRunFromRequest(request, args)
}

export function setAnswerHarnessSessionJournalWriterForTests(
  writer: AnswerHarnessSessionJournalWriter,
): () => void {
  const previous = answerHarnessSessionJournalWriter
  answerHarnessSessionJournalWriter = writer
  return () => {
    answerHarnessSessionJournalWriter = previous
  }
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

export async function persistAnswerTurn(input: PersistAnswerTurnInput): Promise<boolean> {
  return (await persistAnswerTurnWithResult(input)).ok
}

export type PersistAnswerTurnResult = {
  ok: boolean
  status: AnswerTurnStatus
  snapshotHash: string
  harnessRun: HarnessRunReport
  evidenceJson: string
}


export async function persistAnswerTurnWithResult(input: PersistAnswerTurnInput): Promise<PersistAnswerTurnResult> {
  const status = input.captured !== undefined ? ('complete' as const) : ('error' as const)
  const baseEvidence = input.captured !== undefined
    ? buildFrozenEvidence(input.captured, input.allowedSlugs, input.toolCalls, input.searchContext, input.timings, input.workLog)
    : emptyEvidence(input.searchContext, input.timings, input.workLog)
  const prose = input.captured !== undefined ? buildFrozenProse(input.captured) : emptyProse()
  const snapshotHash = stableHash({
    query: input.query,
    intent: input.intent,
    ...(input.searchContext === undefined ? {} : { searchContext: stableAeSearchContextKey(input.searchContext) }),
    providers: baseEvidence.providers.map((provider) => provider.slug),
    offeringSources: (baseEvidence.offeringSources ?? []).map((source) => ({
      slug: source.business.slug,
      offerings: source.offerings.map((offering) => ({
        offeringRef: offering.offeringRef,
        revision: offering.revision,
        profileId: offering.comparison?.profile.profileId ?? null,
      })),
    })),
    prose,
    ...(input.toolCalls.length === 0 ? {} : { toolCalls: input.toolCalls.map((call) => call.resultHash) }),
  }).toString()
  const evidenceForSummary: FrozenTurnEvidence =
    baseEvidence.toolCalls !== undefined || input.toolCalls.length === 0
      ? baseEvidence
      : { ...baseEvidence, toolCalls: input.toolCalls }
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
  const harnessRun = input.harnessRun ?? await buildAnswerHarnessOperationReport({
      runId: input.turnId,
      sessionId: input.sessionId,
      status,
      toolCalls: input.toolCalls,
      ...(input.modelRequests === undefined ? {} : { modelRequests: input.modelRequests }),
      fallbackReport: fallbackHarnessRun,
      ...(input.gate === undefined ? {} : { gate: input.gate }),
    })
  const evidence: FrozenTurnEvidence = {
    ...evidenceForSummary,
    answerRun,
    harnessRun,
  }
  const turnRow = {
    turnId: input.turnId,
    threadId: input.threadId,
    pseudonymousSessionId: input.sessionId,
    seq: input.turnSeq,
    query: input.query,
    intent: input.intent,
    evidenceJson: JSON.stringify(evidence),
    snapshotHash,
    proseJson: JSON.stringify(prose),
    artifactKindsJson: JSON.stringify(
      input.captured === undefined ? [] : buildArtifactsFromSnapshot(input.captured).map((artifact) => artifact.kind),
    ),
    status,
    ...(input.errorCopyId === undefined ? {} : { errorCopyId: input.errorCopyId }),
    ...(input.sourceWriteRequest === undefined ? {} : { sourceWriteRequest: input.sourceWriteRequest }),
    toolCalls: input.toolCalls.map((call) => ({
      toolCallId: call.toolCallId,
      seq: call.seq,
      toolId: call.toolId,
      inputJson: call.inputJson,
      resultSummaryJson: call.resultSummaryJson,
      resultJson: call.resultJson,
      resultHash: call.resultHash,
      status: call.status,
    })),
  }

  try {
    if (input.isNewThread) {
      await appendAnswerTurnWithThreadAndToolCalls({
        ...turnRow,
        title: input.title,
      })
      if (input.skipHarnessSessionJournal !== true) {
        await appendAnswerHarnessSessionJournal({
          input,
          harnessRun,
          snapshotHash,
          status,
          ...(input.harnessRuntimeEvents === undefined ? {} : { runtimeEvents: input.harnessRuntimeEvents }),
        })
      }
      return { ok: true, status, snapshotHash, harnessRun, evidenceJson: turnRow.evidenceJson }
    }

    await appendAnswerTurnWithToolCalls(turnRow)
    if (input.skipHarnessSessionJournal !== true) {
      await appendAnswerHarnessSessionJournal({
        input,
        harnessRun,
        snapshotHash,
        status,
        ...(input.harnessRuntimeEvents === undefined ? {} : { runtimeEvents: input.harnessRuntimeEvents }),
      })
    }
    return { ok: true, status, snapshotHash, harnessRun, evidenceJson: turnRow.evidenceJson }
  } catch {
    return { ok: false, status, snapshotHash, harnessRun, evidenceJson: turnRow.evidenceJson }
  }
}

export async function finalizePersistedAnswerTurnHarnessRun(args: {
  input: PersistAnswerTurnInput
  persistResult: PersistAnswerTurnResult
  harnessRun: HarnessRunReport
  runtimeEvents?: readonly HarnessRuntimeEvent[]
}): Promise<AnswerHarnessFinalizationResult> {
  const request = args.input.sourceWriteRequest
  if (request === undefined) {
    return {
      status: 'error',
      reason: 'source_write_failed',
      message: 'source_write_request_missing',
    }
  }

  const entries = buildAnswerHarnessSessionJournalEntries({
    input: args.input,
    harnessRun: args.harnessRun,
    snapshotHash: args.persistResult.snapshotHash,
    status: args.persistResult.status,
    ...(args.runtimeEvents === undefined ? {} : { runtimeEvents: args.runtimeEvents }),
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

  return answerHarnessFinalizer({
    request,
    turnId: args.input.turnId,
    snapshotHash: args.persistResult.snapshotHash,
    evidenceJson: finalizedEvidence,
    finalizationHash,
    entries,
  })
}

export function answerHarnessFinalizationSucceeded(
  result: AnswerHarnessFinalizationResult | undefined,
): result is Extract<AnswerHarnessFinalizationResult, { status: 'accepted' | 'replayed' }> {
  return result?.status === 'accepted' || result?.status === 'replayed'
}

function finalizeEvidenceJson(input: {
  evidenceJson: string
  harnessRun: HarnessRunReport
  finalizationHash: string
  journalEntryCount: number
}): string {
  const evidence = parseFrozenEvidence(input.evidenceJson)
  const finalized: FrozenTurnEvidence = {
    ...evidence,
    harnessRun: input.harnessRun,
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
  return stableHash({
    schemaVersion: 1,
    turnId: input.input.turnId,
    threadId: input.input.threadId,
    sessionId: input.input.sessionId,
    snapshotHash: input.persistResult.snapshotHash,
    run: stableHashValue(input.harnessRun),
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

function stableHashValue(value: unknown): StableHashValue {
  return structuredClone(value) as StableHashValue
}


export function collectLatestFrozenProviders(priorTurns: readonly AnswerTurnRecordLite[]): AnswerSource[] {
  return readLatestFrozenEvidence(priorTurns)?.providers.slice() ?? []
}

export function collectLatestFrozenAllowedSlugs(priorTurns: readonly AnswerTurnRecordLite[]): string[] {
  return [...(readLatestFrozenEvidence(priorTurns)?.allowedSlugs ?? [])]
}

function readLatestFrozenEvidence(priorTurns: readonly AnswerTurnRecordLite[]): FrozenTurnEvidence | undefined {
  const sorted = priorTurns.slice().sort((left, right) => right.seq - left.seq)
  for (const turn of sorted) {
    try {
      return parseFrozenEvidence(turn.evidenceJson)
    } catch {
      // Skip malformed legacy evidence and keep looking for the latest usable turn.
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
): FrozenTurnEvidence {
  return {
    providers: snapshot.providers,
    ...(snapshot.offeringSources === undefined ? {} : { offeringSources: snapshot.offeringSources }),
    allowedSlugs: [...allowedSlugs],
    agentJsonUrl: snapshot.agentJsonUrl,
    ...(searchContext === undefined ? {} : { searchContext }),
    ...(toolCalls.length === 0 ? {} : { toolCalls }),
    ...(timings.length === 0 ? {} : { timings }),
    ...(workLog.length === 0 ? {} : { workLog }),
  }
}

function buildFrozenProse(snapshot: AnswerSnapshot): FrozenTurnProse {
  return {
    oneLine: snapshot.oneLine,
    summary: snapshot.summary,
    nextStep: snapshot.nextStep,
    ...(snapshot.compactLayout === true ? { compactLayout: true } : {}),
    ...(snapshot.layoutProfile === undefined ? {} : { layoutProfile: snapshot.layoutProfile }),
  }
}

function emptyEvidence(
  searchContext?: AeSearchContext,
  timings: readonly AnswerTurnTimingEntry[] = [],
  workLog: readonly AnswerWorkStep[] = [],
): FrozenTurnEvidence {
  return {
    providers: [],
    allowedSlugs: [],
    agentJsonUrl: '',
    ...(searchContext === undefined ? {} : { searchContext }),
    ...(timings.length === 0 ? {} : { timings }),
    ...(workLog.length === 0 ? {} : { workLog }),
  }
}

function emptyProse(): FrozenTurnProse {
  return { oneLine: '', summary: '', nextStep: '' }
}

async function appendAnswerHarnessSessionJournal(args: {
  input: PersistAnswerTurnInput
  harnessRun: HarnessRunReport
  snapshotHash: string
  status: AnswerTurnStatus
  runtimeEvents?: readonly HarnessRuntimeEvent[]
}): Promise<void> {
  if (args.input.sourceWriteRequest === undefined) {
    return
  }

  const entries = buildAnswerHarnessSessionJournalEntries(args)
  for (const entry of entries) {
    try {
      await answerHarnessSessionJournalWriter({
        request: args.input.sourceWriteRequest,
        entry,
      })
    } catch {
      return
    }
  }
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
  const queryHash = stableHash(args.input.query).toString()
  const gate = args.input.gate ?? { ok: args.status === 'complete', source: 'turn_status' }
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

    entries.push(answerHarnessJournalEntry({
      ...args.shared,
      createdAt: runtimeEventAt(event) ?? args.createdAt,
      kind: mapped.kind,
      status: mapped.status,
      entryIdSuffix: `${String(index).padStart(4, '0')}-${mapped.kind.replaceAll('.', '-')}`,
      idempotencyKeySuffix: `${String(index).padStart(4, '0')}-${mapped.kind}`,
      payload: mapped.payload,
      publicSummary: mapped.publicSummary,
      ...(mapped.privatePayload === undefined ? {} : { privatePayload: mapped.privatePayload }),
    }))
  })

  if (!entries.some((entry) => entry.kind === 'run.reported')) {
    entries.push(answerHarnessJournalEntry({
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
    }))
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
): {
  kind: HarnessSessionEntryKind
  status: HarnessRunStatus
  payload: unknown
  publicSummary: unknown
  privatePayload?: unknown
} | undefined {
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
          queryHash: stableHash(context.input.query).toString(),
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
        status: event.status ?? (event.type === 'tool.completed' ? 'ok' : runtimeFailureStatus(event.errorCode)),
        payload: { runtimeEvent: event },
        publicSummary: { tool: event.type === 'tool.completed' ? 'completed' : 'failed' },
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
        status: event.type === 'model.completed' ? 'ok' : runtimeFailureStatus(event.errorCode),
        payload: { runtimeEvent: event },
        publicSummary: { model: event.type === 'model.completed' ? 'completed' : 'failed' },
      }
    case 'gate.evaluated':
      return {
        kind: 'gate.evaluated',
        status: event.ok ? 'ok' : runtimeFailureStatus(event.errorCode ?? context.gate.code),
        payload: { runtimeEvent: event, gate: context.gate },
        publicSummary: { checks: event.ok ? 'passed' : 'blocked' },
      }
    case 'persist.completed':
    case 'persist.failed':
      return {
        kind: event.type === 'persist.completed' ? 'turn.persisted' : 'turn.error',
        status: event.type === 'persist.completed' ? context.runStatus : runtimeFailureStatus(event.errorCode),
        payload: {
          runtimeEvent: event,
          threadId: context.input.threadId,
          snapshotHash: context.snapshotHash,
          turnStatus: context.status,
        },
        publicSummary: event.type === 'persist.completed'
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
  if (errorCode === 'grounding_failed' || errorCode === 'turn_error' || errorCode?.includes('blocked') === true) {
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
    ...(input.privatePayload === undefined ? {} : { privatePayloadJson: JSON.stringify(input.privatePayload) }),
  }
}

function answerHarnessSessionOwnerKey(sessionId: string): string {
  return `owner:${sessionId}`
}
