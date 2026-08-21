import {
  collectAllowedSlugsFromToolResults,
  type AnswerSnapshot,
} from '@/modules/answer/public'
import { isRecord } from '@/modules/common/is-record'
import {
  buildAnswerTurnProblem,
  redactAnswerTurnProblem,
  type AnswerTurnProblem,
} from '@/lib/errors'
import type { HarnessRunStatus } from '@/modules/harness/public'
import {
  finalizeReservedAnswerTurnFromSource,
  getAnswerThreadWithTurns,
  reserveAnswerTurn,
  type AnswerHarnessFinalizationResult,
  type AnswerTurnReservationResult,
} from '../answer-thread.functions'
import type {
  AnswerRunGateSummary,
  AnswerTurnRecord,
  FrozenTurnProse,
} from '../answer-thread.schema'
import { buildThreadTitle } from './follow-up-intent'
import {
  persistAnswerTurnWithResult,
  type PersistAnswerTurnInput,
} from './answer-turn-persist-result'
import {
  answerHarnessFinalizationSucceeded,
  finalizePersistedAnswerTurnHarnessRun,
} from './answer-turn-harness-report'
import { parseFrozenEvidence } from './public-projection'
import { pendingDecisionFor, selectedInputDigestFor } from './answer-continuation-state'
import { toolCallRecordsToGateInput } from './tool-runner'
import type { LiveAnswerHarnessOperation } from './answer-harness-operation'
import { readOperationArtifacts } from './turns/agent'
import { makeCopyId, type TurnTimingCollector, type WorkStepEmitter } from './turns/types'
import type {
  StreamAnswerTurnInput,
  StreamAnswerTurnRuntimeState,
} from './turn-orchestrator'

type FinalizedAnswerTurnReadback =
  | { kind: 'complete'; answer: AnswerSnapshot }
  | { kind: 'error'; problem: AnswerTurnProblem }

export function harnessStatusForAnswerTurn(
  status: AnswerTurnRecord['status'],
  gate: AnswerRunGateSummary | undefined,
): HarnessRunStatus {
  if (gate !== undefined && !gate.ok) {
    return 'blocked'
  }
  return status === 'complete' ? 'ok' : 'error'
}

function answerHarnessRunAborted(input: {
  input: StreamAnswerTurnInput
  harness: LiveAnswerHarnessOperation
}): boolean {
  return (
    input.input.signal?.aborted === true ||
    input.harness.loop.snapshot().summary.run.status === 'aborted'
  )
}

export async function readFinalizedAnswerTurn(input: {
  threadId: string
  turnId: string
  sessionId: string
}): Promise<FinalizedAnswerTurnReadback> {
  const projection = await getAnswerThreadWithTurns(
    input.threadId,
    input.sessionId,
    { numItems: 25, cursor: null },
  )
  const turn = projection?.turns.page.find(
    (candidate) => candidate.turnId === input.turnId,
  )
  if (turn === undefined) {
    return {
      kind: 'error',
      problem: buildAnswerTurnProblem('answer_turn_failed'),
    }
  }
  if (turn.status === 'error') {
    if (turn.errorProblemJson !== undefined) {
      try {
        return {
          kind: 'error',
          problem: redactAnswerTurnProblem(
            JSON.parse(turn.errorProblemJson) as unknown,
          ),
        }
      } catch {
        // Fall through to the safe generic problem.
      }
    }
    return {
      kind: 'error',
      problem: buildAnswerTurnProblem('answer_turn_failed'),
    }
  }
  if (turn.status !== 'complete') {
    return {
      kind: 'error',
      problem: buildAnswerTurnProblem('answer_turn_failed'),
    }
  }
  try {
    const evidence = parseFrozenEvidence(turn.evidenceJson)
    const proseValue: unknown = JSON.parse(turn.proseJson)
    if (
      !isRecord(proseValue) ||
      typeof proseValue.oneLine !== 'string' ||
      typeof proseValue.summary !== 'string' ||
      typeof proseValue.nextStep !== 'string'
    ) {
      throw new Error('answer_prose_invalid')
    }
    const prose = proseValue as FrozenTurnProse
    return {
      kind: 'complete',
      answer: {
        query: turn.query,
        oneLine: prose.oneLine,
        providers: evidence.providers,
        ...(evidence.operationCandidates === undefined
          ? {}
          : { operationCandidates: evidence.operationCandidates }),
        ...(evidence.operationCandidatesDigest === undefined
          ? {}
          : { operationCandidatesDigest: evidence.operationCandidatesDigest }),
        ...(evidence.operationOutcome === undefined
          ? {}
          : { operationOutcome: evidence.operationOutcome }),
        ...(evidence.operationSelection === undefined
          ? {}
          : { operationSelection: evidence.operationSelection }),
        summary: prose.summary,
        nextStep: prose.nextStep,
        agentJsonUrl: evidence.agentJsonUrl,
        ...(prose.compactLayout === true ? { compactLayout: true } : {}),
        ...(prose.layoutProfile === undefined
          ? {}
          : { layoutProfile: prose.layoutProfile }),
      },
    }
  } catch {
    return {
      kind: 'error',
      problem: buildAnswerTurnProblem('answer_turn_failed'),
    }
  }
}

export function buildPersistAnswerTurnInput(input: {
  input: StreamAnswerTurnInput
  state: StreamAnswerTurnRuntimeState
  timings: TurnTimingCollector
  workLog: WorkStepEmitter
  harness: LiveAnswerHarnessOperation
}): PersistAnswerTurnInput {
  const finalTurnStatus =
    input.state.finalTurnStatus ??
    (input.state.captured === undefined ? 'error' : 'complete')
  const finalGate =
    input.state.finalGate ??
    ({
      ok: finalTurnStatus === 'complete',
      source: 'turn_status',
      ...(finalTurnStatus === 'error' ? { code: 'turn_error' } : {}),
    } satisfies AnswerRunGateSummary)
  const allowedSlugs =
    input.state.allowedSlugs ??
    collectAllowedSlugsFromToolResults(
      toolCallRecordsToGateInput(input.state.toolCalls),
    )
  const pendingDecision = pendingDecisionFor(
    input.state.operationArtifacts?.operationOutcome,
    input.state.operationArtifacts?.operationSelection,
    input.state.toolCalls,
  )
  const selectedInputDigest = selectedInputDigestFor(
    input.state.toolCalls,
    input.state.operationArtifacts?.operationSelection,
  )
  const interpretation = input.state.interpretation
  const continuationSource = input.state.continuationSource
  const terminalCheckpointDigest = input.state.checkpointDigestRef.value

  return {
    reservationKey: input.state.reservationKey,
    requestDigest: input.state.requestDigest,
    expectedGeneration: input.state.generation,
    sessionId: input.input.sessionId,
    threadId: input.state.threadId,
    isNewThread: input.state.isNewThread,
    createdAt: input.state.createdAt,
    query: input.state.query,
    intent: input.state.intent,
    ...(interpretation === undefined
      ? {}
      : {
          interpretation,
          requestedIntents: interpretation.requestedIntents,
        }),
    ...(continuationSource === undefined ? {} : { continuationSource }),
    ...(pendingDecision === undefined ? {} : { pendingDecision }),
    ...(selectedInputDigest === undefined ? {} : { selectedInputDigest }),
    ...(terminalCheckpointDigest === undefined
      ? {}
      : { terminalCheckpointDigest }),

    title: buildThreadTitle(input.state.query),
    turnId: input.state.turnId,
    turnSeq: input.state.turnSeq,
    ...(input.state.captured === undefined
      ? {}
      : { captured: input.state.captured }),
    ...(input.state.errorCopyId === undefined
      ? {}
      : { errorCopyId: input.state.errorCopyId }),
    ...(input.state.errorProblem === undefined
      ? {}
      : { errorProblemJson: JSON.stringify(input.state.errorProblem) }),
    ...(input.state.operationArtifacts === undefined
      ? {}
      : { operationArtifacts: input.state.operationArtifacts }),
    toolCalls: input.state.toolCalls,
    ...(input.state.modelRequests === undefined
      ? {}
      : { modelRequests: input.state.modelRequests }),
    gate: finalGate,
    searchContext: input.state.searchContext,
    timings: input.timings.entries(),
    workLog: input.workLog.entries(),
    allowedSlugs,
    ...(input.input.sourceWriteRequest === undefined
      ? {}
      : { sourceWriteRequest: input.input.sourceWriteRequest }),
    ...(input.input.sourceWriteBody === undefined
      ? {}
      : { sourceWriteBody: input.input.sourceWriteBody }),
    harnessRun: input.harness.loop.snapshot(
      harnessStatusForAnswerTurn(finalTurnStatus, finalGate),
    ),
    harnessRuntimeEvents: input.harness.events,
  }
}

export async function reportStreamAnswerTurnPhase(
  input: {
    input: StreamAnswerTurnInput
    timings: TurnTimingCollector
    workLog: WorkStepEmitter
    harness: LiveAnswerHarnessOperation
    stopLeaseHeartbeat: () => void
  },
  state: StreamAnswerTurnRuntimeState,
): Promise<StreamAnswerTurnRuntimeState> {
  // The turn lease ends at the persistence handoff. A finalizer may take
  // longer than one heartbeat; renewals after it settles would report a
  // false lease conflict and suppress the terminal complete frame.
  input.stopLeaseHeartbeat()
  let reportState: StreamAnswerTurnRuntimeState = state
  let persistInput = state.persistInput
  let persistResult = state.persistResult

  if (
    persistInput !== undefined &&
    persistResult?.failure === 'unknown' &&
    persistInput.sourceWriteRequest !== undefined &&
    persistInput.sourceWriteBody !== undefined &&
    !answerHarnessRunAborted(input)
  ) {
    const recoveredFinalization =
      await finalizePersistedAnswerTurnHarnessRun({
        input: persistInput,
        persistResult,
        harnessRun: input.harness.loop.snapshot(
          harnessStatusForAnswerTurn(
            state.finalTurnStatus ?? persistResult.status,
            state.finalGate ?? persistInput.gate,
          ),
        ),
        runtimeEvents: input.harness.events,
      })
    if (answerHarnessFinalizationSucceeded(recoveredFinalization)) {
      input.harness.loop.emitOperationEvent({
        type: 'answer.harness_finalization',
        status: recoveredFinalization.status,
      })
      return {
        ...state,
        persistResult: { ...persistResult, ok: true },
        finalizationResult: recoveredFinalization,
      }
    }
  }

  if (
    (persistInput === undefined || persistResult?.failure === 'unknown') &&
    !answerHarnessRunAborted(input)
  ) {
    const errorProblem = buildAnswerTurnProblem(
      'answer_turn_persist_failed',
    )
    const operationArtifacts = readOperationArtifacts(
      reportState.captured ?? persistInput?.captured,
    )
    const failedState: StreamAnswerTurnRuntimeState = {
      ...state,
      captured: undefined,
      ...(operationArtifacts === undefined ? {} : { operationArtifacts }),
      errorCopyId: makeCopyId(),
      errorProblem,
      errorProblemJson: JSON.stringify(errorProblem),
      finalGate: { ok: false, source: 'turn_status', code: 'turn_error' },
      finalTurnStatus: 'error',
    }
    const recoveryPersistInput = buildPersistAnswerTurnInput({
      input: input.input,
      state: failedState,
      timings: input.timings,
      workLog: input.workLog,
      harness: input.harness,
    })
    const recoveryPersistResult = await input.harness.persist(() =>
      persistAnswerTurnWithResult(recoveryPersistInput),
    )
    reportState = {
      ...failedState,
      persistInput: recoveryPersistInput,
      persistResult: recoveryPersistResult,
    }
    persistInput = recoveryPersistInput
    persistResult = recoveryPersistResult
  }

  if (
    persistResult?.ok !== true ||
    persistInput === undefined ||
    persistInput.sourceWriteRequest === undefined ||
    persistInput.sourceWriteBody === undefined
  ) {
    return reportState
  }

  const finalizationHarnessRun = input.harness.loop.snapshot(
    harnessStatusForAnswerTurn(
      reportState.finalTurnStatus ?? persistResult.status,
      reportState.finalGate ?? persistInput.gate,
    ),
  )
  const finalizationRuntimeEvents = input.harness.events.slice()
  let finalizationResult: AnswerHarnessFinalizationResult
  try {
    finalizationResult = await finalizePersistedAnswerTurnHarnessRun({
      input: persistInput,
      persistResult,
      harnessRun: finalizationHarnessRun,
      runtimeEvents: finalizationRuntimeEvents,
    })
  } catch (error) {
    finalizationResult = {
      status: 'denied',
      reason: 'source_write_failed',
      message: error instanceof Error ? error.message : String(error),
    }
  }
  input.harness.loop.emitOperationEvent({
    type: 'answer.harness_finalization',
    status: finalizationResult.status,
    ...(finalizationResult.status === 'accepted' ||
    finalizationResult.status === 'replayed'
      ? {}
      : { reason: finalizationResult.reason }),
  })
  if (
    !answerHarnessFinalizationSucceeded(finalizationResult) &&
    !(
      finalizationResult.status === 'conflict' &&
      finalizationResult.reason === 'stopped'
    ) &&
    !answerHarnessRunAborted(input)
  ) {
    let replayProbe: AnswerTurnReservationResult | undefined
    try {
      replayProbe = await reserveAnswerTurn({
        sessionId: persistInput.sessionId,
        ...(persistInput.isNewThread
          ? {}
          : { threadId: persistInput.threadId }),
        query: persistInput.query,
        requestDigest: persistInput.requestDigest,
        reservationKey: persistInput.reservationKey,
        title: persistInput.title,
        sourceWriteRequest: persistInput.sourceWriteRequest,
        sourceWriteBody: persistInput.sourceWriteBody,
      })
    } catch {
      replayProbe = undefined
    }

    if (
      replayProbe?.kind === 'replayed' &&
      replayProbe.state === 'stopped'
    ) {
      return {
        ...reportState,
        finalizationResult: {
          status: 'conflict',
          reason: 'stopped',
          message: 'Answer turn was stopped before finalization retry.',
        },
      }
    }
    if (
      replayProbe?.kind === 'replayed' &&
      replayProbe.state === 'finalized'
    ) {
      let exactRetry: AnswerHarnessFinalizationResult
      try {
        exactRetry = await finalizePersistedAnswerTurnHarnessRun({
          input: persistInput,
          persistResult,
          harnessRun: finalizationHarnessRun,
          runtimeEvents: finalizationRuntimeEvents,
          finalizer: async ({ request, ...args }) =>
            finalizeReservedAnswerTurnFromSource(request, args),
        })
      } catch (error) {
        exactRetry = {
          status: 'denied',
          reason: 'source_write_failed',
          message: error instanceof Error ? error.message : String(error),
        }
      }
      input.harness.loop.emitOperationEvent({
        type: 'answer.harness_finalization',
        status: exactRetry.status,
        ...(exactRetry.status === 'accepted' ||
        exactRetry.status === 'replayed'
          ? {}
          : { reason: exactRetry.reason }),
      })
      return {
        ...reportState,
        finalizationResult: exactRetry,
      }
    }

    const errorProblem = buildAnswerTurnProblem(
      'answer_turn_persist_failed',
    )
    const operationArtifacts = readOperationArtifacts(
      reportState.captured ?? persistInput?.captured,
    )
    const failedState: StreamAnswerTurnRuntimeState = {
      ...reportState,
      captured: undefined,
      ...(operationArtifacts === undefined ? {} : { operationArtifacts }),
      errorCopyId: makeCopyId(),
      errorProblem,
      errorProblemJson: JSON.stringify(errorProblem),
      finalGate: { ok: false, source: 'turn_status', code: 'turn_error' },
      finalTurnStatus: 'error',
    }
    const recoveryPersistInput = buildPersistAnswerTurnInput({
      input: input.input,
      state: failedState,
      timings: input.timings,
      workLog: input.workLog,
      harness: input.harness,
    })
    const recoveryPersistResult = await input.harness.persist(() =>
      persistAnswerTurnWithResult(recoveryPersistInput),
    )
    if (recoveryPersistResult.ok) {
      let recoveryFinalization: AnswerHarnessFinalizationResult
      try {
        recoveryFinalization = await finalizePersistedAnswerTurnHarnessRun({
          input: recoveryPersistInput,
          persistResult: recoveryPersistResult,
          harnessRun: input.harness.loop.snapshot(
            harnessStatusForAnswerTurn('error', failedState.finalGate),
          ),
          runtimeEvents: input.harness.events,
          finalizer: async ({ request, ...args }) =>
            finalizeReservedAnswerTurnFromSource(request, args),
        })
      } catch (error) {
        recoveryFinalization = {
          status: 'denied',
          reason: 'source_write_failed',
          message: error instanceof Error ? error.message : String(error),
        }
      }

      input.harness.loop.emitOperationEvent({
        type: 'answer.harness_finalization',
        status: recoveryFinalization.status,
        ...(recoveryFinalization.status === 'accepted' ||
        recoveryFinalization.status === 'replayed'
          ? {}
          : { reason: recoveryFinalization.reason }),
      })
      if (answerHarnessFinalizationSucceeded(recoveryFinalization)) {
        return {
          ...failedState,
          persistInput: recoveryPersistInput,
          persistResult: recoveryPersistResult,
          finalizationResult: recoveryFinalization,
        }
      }
    }
  }

  return {
    ...reportState,
    finalizationResult,
  }
}
