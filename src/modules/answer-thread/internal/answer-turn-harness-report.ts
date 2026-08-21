import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import type { AppendHarnessSessionEntrySourceInput } from '@/modules/harness/harness.functions'
import type {
  HarnessRunReport,
  HarnessRuntimeEvent,
  HarnessRunStatus,
  HarnessSessionEntryKind,
} from '@/modules/harness/public'
import { sanitizeAnswerOperationToolCallRecord } from '@/modules/answer/convex'
import type {
  AnswerRunGateSummary,
  AnswerTurnStatus,
} from '../answer-thread.schema'
import {
  finalizeReservedAnswerTurnFromRequest,
  type AnswerHarnessFinalizationResult,
  type FinalizeReservedAnswerTurnArgs,
} from '../answer-thread.functions'
import {
  buildArtifactKinds,
  buildFrozenProse,
  emptyProse,
  finalizeEvidenceJson,
} from './answer-turn-evidence-freeze'
import type {
  PersistAnswerTurnInput,
  PersistAnswerTurnResult,
} from './answer-turn-persist-result'

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

export function answerHarnessFinalizationSucceeded(
  result: AnswerHarnessFinalizationResult | undefined,
): result is Extract<
  AnswerHarnessFinalizationResult,
  { status: 'accepted' | 'replayed' }
> {
  return result?.status === 'accepted' || result?.status === 'replayed'
}

export async function finalizePersistedAnswerTurnHarnessRun(args: {
  input: PersistAnswerTurnInput
  persistResult: PersistAnswerTurnResult
  harnessRun: HarnessRunReport
  runtimeEvents?: readonly HarnessRuntimeEvent[]
  finalizer?: AnswerHarnessFinalizer
}): Promise<AnswerHarnessFinalizationResult> {
  const safeToolCalls = args.input.toolCalls.map(
    sanitizeAnswerOperationToolCallRecord,
  )
  const safeInput = { ...args.input, toolCalls: safeToolCalls }
  const request = safeInput.sourceWriteRequest
  const body = safeInput.sourceWriteBody
  if (request === undefined || body === undefined) {
    return {
      status: 'denied',
      reason: 'source_write_failed',
      message: 'source_write_request_missing',
    }
  }

  const entries = buildAnswerHarnessSessionJournalEntries({
    input: safeInput,
    harnessRun: args.harnessRun,
    snapshotHash: args.persistResult.snapshotHash,
    status: args.persistResult.status,
    ...(args.runtimeEvents === undefined
      ? {}
      : { runtimeEvents: args.runtimeEvents }),
  })
  const finalizationHash = buildAnswerHarnessFinalizationHash({
    input: safeInput,
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
    reservationKey: safeInput.reservationKey,
    requestDigest: safeInput.requestDigest,
    sessionId: safeInput.sessionId,
    threadId: safeInput.threadId,
    turnId: safeInput.turnId,
    turnSeq: safeInput.turnSeq,
    expectedGeneration: safeInput.expectedGeneration,
    createdAt: safeInput.createdAt,
    answerDigest: args.persistResult.finalizationDigest,
    query: safeInput.query,
    intent: safeInput.intent,
    finalStatus: args.persistResult.status,
    snapshotHash: args.persistResult.snapshotHash,
    evidenceJson: finalizedEvidence,
    proseJson: JSON.stringify(
      safeInput.captured === undefined
        ? emptyProse()
        : buildFrozenProse(safeInput.captured),
    ),
    artifactKindsJson: JSON.stringify(
      buildArtifactKinds(safeInput.captured, safeInput.operationArtifacts),
    ),
    ...(safeInput.errorCopyId === undefined
      ? {}
      : { errorCopyId: safeInput.errorCopyId }),
    ...(safeInput.errorProblemJson === undefined
      ? {}
      : { errorProblemJson: safeInput.errorProblemJson }),
    finalizationHash,
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
    entries,
  })
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
    default: {
      const _exhaustive: never = event
      return _exhaustive
    }
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
