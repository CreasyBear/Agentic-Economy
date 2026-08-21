import type { AeSearchContext } from '@/modules/answer/search-context'
import {
  buildAnswerTurnProblem,
  type AnswerTurnProblem,
} from '@/lib/errors'
import type {
  AnswerTurnCheckpoint,
  AnswerTurnOperationArtifacts,
  PublicThreadProjection,
} from '../answer-thread.schema'
import {
  getOwnedThreadProjection,
  readAnswerTurnCheckpoint,
  type AnswerTurnReservationResult,
} from '../answer-thread.functions'
import {
  persistAnswerTurnWithResult,
  type PersistAnswerTurnInput,
} from './answer-turn-persist-result'
import {
  answerHarnessFinalizationSucceeded,
  finalizePersistedAnswerTurnHarnessRun,
  setAnswerHarnessFinalizerForTests,
} from './answer-turn-harness-report'

export type { AnswerTurnRecordLite } from './answer-turn-evidence-freeze'
export {
  collectLatestFrozenAllowedSlugs,
  collectLatestFrozenOperationCandidates,
  collectLatestFrozenProviders,
  collectLatestFrozenSelectedOperationRef,
  readPriorCompleteTurns,
} from './answer-turn-evidence-freeze'
export type {
  PersistAnswerTurnInput,
  PersistAnswerTurnResult,
} from './answer-turn-persist-result'
export { persistAnswerTurnWithResult }
export type {
  AnswerHarnessFinalizer,
  AnswerHarnessFinalizerInput,
} from './answer-turn-harness-report'
export {
  answerHarnessFinalizationSucceeded,
  finalizePersistedAnswerTurnHarnessRun,
  setAnswerHarnessFinalizerForTests,
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
        ...(checkpoint.operationComparison === undefined
          ? {}
          : { operationComparison: checkpoint.operationComparison }),
        ...(checkpoint.operationOutcome === undefined
          ? {}
          : { operationOutcome: checkpoint.operationOutcome }),
        ...(checkpoint.operationPlan === undefined
          ? {}
          : { operationPlan: checkpoint.operationPlan }),
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
