import {
  callPublicSourceMutation,
  sourceMutation,
} from '@/lib/server/convex-source'
import { isRecord } from '@/modules/common/is-record'
import { isValidFrozenAnswerOperationArtifacts } from '@/modules/answer/answer-event-schema'
import type { AppendHarnessSessionEntrySourceInput } from '@/modules/harness/harness.functions'
import type { AnswerToolCallInputRow } from './commands'
import type {
  AnswerTurnStatus,
  FollowUpIntent,
} from '../answer-thread.schema'
import {
  activeAnswerThreadPort,
  withAnswerThreadSourceWrite,
  type AnswerThreadSourceWriteMutationArgs,
  type AnswerThreadSourceWriteRequestArgs,
  type LocalE2eAnswerThreadState,
} from './answer-thread-reads'

export type FinalizeReservedAnswerTurnArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  expectedGeneration: number
  createdAt: number
  answerDigest: string
  query: string
  intent: FollowUpIntent
  finalStatus: Extract<AnswerTurnStatus, 'complete' | 'error'>
  snapshotHash: string
  evidenceJson: string
  proseJson: string
  artifactKindsJson: string
  errorCopyId?: string
  errorProblemJson?: string
  finalizationHash: string
  toolCalls: readonly AnswerToolCallInputRow[]
  entries: readonly AppendHarnessSessionEntrySourceInput[]
}

type FinalizeReservedAnswerTurnMutationArgs = Omit<
  FinalizeReservedAnswerTurnArgs,
  'sourceWriteRequest' | 'sourceWriteBody'
> &
  AnswerThreadSourceWriteMutationArgs

export type AnswerHarnessFinalizationResult =
  | {
      status: 'accepted'
      turnId: string
      finalizationHash: string
      entriesAccepted: number
      entriesReplayed: number
      activeLeafEntryId?: string
    }
  | {
      status: 'replayed'
      turnId: string
      finalizationHash: string
      entriesAccepted: 0
      entriesReplayed: number
      activeLeafEntryId?: string
    }
  | {
      status: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'generation_mismatch'
        | 'turn_not_found'
        | 'turn_conflict'
        | 'snapshot_mismatch'
        | 'evidence_conflict'
        | 'answer_digest_conflict'
        | 'tool_call_conflict'
        | 'entry_identity_mismatch'
        | 'entry_id_conflict'
        | 'idempotency_conflict'
        | 'parent_conflict'
        | 'stopped'
      message: string
      activeLeafEntryId?: string
    }
  | {
      status: 'denied'
      reason: string
      message: string
    }

export type StopAnswerTurnArgs = AnswerThreadSourceWriteRequestArgs & {
  sessionId: string
  threadId: string
  turnId: string
}

type StopAnswerTurnMutationArgs = Omit<StopAnswerTurnArgs, 'sourceWriteRequest' | 'sourceWriteBody'> & AnswerThreadSourceWriteMutationArgs

export type StopAnswerTurnResult =
  | { kind: 'stopped'; threadId: string; turnId: string }
  | { kind: 'already_settled'; threadId: string; turnId: string; status: 'complete' | 'error' | 'stopped' }
  | { kind: 'not_found' }

export const stopAnswerTurnMutation = sourceMutation<StopAnswerTurnMutationArgs, StopAnswerTurnResult>(
  'answerThreads:stopAnswerTurn',
)

export const finalizeReservedAnswerTurnMutation = sourceMutation<
  FinalizeReservedAnswerTurnMutationArgs,
  AnswerHarnessFinalizationResult
>('harnessSessions:finalizeReservedAnswerTurn')

export async function stopAnswerTurn(args: StopAnswerTurnArgs): Promise<StopAnswerTurnResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.stopAnswerTurn(args)
  }
  const operationKey = `answer_thread:stop:${args.threadId}:${args.turnId}`
  const correlationId = operationKey
  const command: Omit<StopAnswerTurnMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    sessionId: args.sessionId,
    threadId: args.threadId,
    turnId: args.turnId,
    operationKey,
    correlationId,
  }
  return callPublicSourceMutation(
    stopAnswerTurnMutation,
    await withAnswerThreadSourceWrite({
      request: args.sourceWriteRequest,
      body: args.sourceWriteBody,
      command,
      scope: 'answer_thread',
      operationKey,
      correlationId,
    }),
  )
}

export async function finalizeReservedAnswerTurnFromRequest(
  request: Request,
  args: FinalizeReservedAnswerTurnArgs,
): Promise<AnswerHarnessFinalizationResult> {
  return finalizeReservedAnswerTurnFromSource(request, args)
}

/**
 * Bypass the injectable harness finalizer and write directly to the active source.
 * Recovery must use this path so a failed primary finalizer cannot suppress the
 * durable error terminal row.
 */
export async function finalizeReservedAnswerTurnFromSource(
  request: Request,
  args: FinalizeReservedAnswerTurnArgs,
): Promise<AnswerHarnessFinalizationResult> {
  let evidence: unknown
  try {
    evidence = JSON.parse(args.evidenceJson)
  } catch {
    return {
      status: 'conflict',
      reason: 'evidence_conflict',
      message: 'Answer turn evidence is not valid JSON.',
    }
  }
  if (!isRecord(evidence) || !isValidFrozenAnswerOperationArtifacts({
    candidates: evidence.operationCandidates,
    candidateSetDigest: evidence.operationCandidatesDigest,
    comparison: evidence.operationComparison,
    outcome: evidence.operationOutcome,
    plan: evidence.operationPlan,
    selection: evidence.operationSelection,
    toolCalls: args.toolCalls,
    requireToolEvidence: true,
  })) {
    return {
      status: 'conflict',
      reason: 'evidence_conflict',
      message: 'Answer turn operation evidence is inconsistent with frozen tool records.',
    }
  }

  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.finalizeReservedAnswerTurn({
      ...args,
      sourceWriteRequest: request,
    })
  }

  const operationKey = answerHarnessFinalizationOperationKey(args)
  const correlationId = args.turnId
  const {
    sourceWriteRequest: _sourceWriteRequest,
    sourceWriteBody,
    ...commandWithoutSourceWrite
  } = args
  const command: Omit<FinalizeReservedAnswerTurnMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    ...commandWithoutSourceWrite,
    operationKey,
    correlationId,
  }

  try {
    return await callPublicSourceMutation(
      finalizeReservedAnswerTurnMutation,
      await withAnswerThreadSourceWrite({
        request,
        body: sourceWriteBody,
        command,
        scope: 'harness_session',
        operationKey,
        correlationId,
      }),
    )
  } catch (error) {
    return {
      status: 'denied',
      reason: 'source_write_failed',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function createLocalE2eFinalizeHandlers(state: LocalE2eAnswerThreadState) {
  return {
    stopAnswerTurn: async (args: StopAnswerTurnArgs): Promise<StopAnswerTurnResult> => {
      const reservation = [...state.reservations.values()].find(
        (candidate) =>
          candidate.threadId === args.threadId &&
          candidate.turnId === args.turnId &&
          candidate.sessionId === args.sessionId,
      )
      if (reservation === undefined) return { kind: 'not_found' }
      if (reservation.state === 'finalized') {
        return {
          kind: 'already_settled',
          threadId: args.threadId,
          turnId: args.turnId,
          status: reservation.finalStatus ?? 'error',
        }
      }
      if (reservation.state === 'stopped') {
        return { kind: 'already_settled', threadId: args.threadId, turnId: args.turnId, status: 'stopped' }
      }
      const timestamp = Date.now()
      const generation = (state.generations.get(reservation.reservationKey) ?? 0) + 1
      state.generations.set(reservation.reservationKey, generation)
      state.reservations.set(reservation.reservationKey, { ...reservation, state: 'stopped', updatedAt: timestamp })
      const turn = state.turns.get(args.turnId)
      if (turn !== undefined) state.turns.set(args.turnId, { ...turn, status: 'stopped' })
      return { kind: 'stopped', threadId: args.threadId, turnId: args.turnId }
    },
    finalizeReservedAnswerTurn: async (
      args: FinalizeReservedAnswerTurnArgs,
    ): Promise<AnswerHarnessFinalizationResult> => {
      const reservation = state.reservationFor(args.reservationKey)
      if (reservation === undefined) {
        return {
          status: 'conflict',
          reason: 'reservation_not_found',
          message: 'Answer turn reservation does not exist.',
        }
      }
      if (
        reservation.sessionId !== args.sessionId
        || reservation.threadId !== args.threadId
        || reservation.turnId !== args.turnId
        || reservation.seq !== args.turnSeq
      ) {
        return {
          status: 'conflict',
          reason: 'reservation_identity_mismatch',
          message: 'Answer turn reservation identity mismatch.',
        }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return {
          status: 'conflict',
          reason: 'request_digest_mismatch',
          message: 'Answer turn request digest mismatch.',
        }
      }
      if (reservation.state === 'stopped') {
        return { status: 'conflict', reason: 'stopped', message: 'Answer turn was stopped.' }
      }
      const generation = state.generations.get(args.reservationKey) ?? 0
      if (generation !== args.expectedGeneration) {
        return {
          status: 'conflict',
          reason: 'generation_mismatch',
          message: 'Answer turn generation mismatch.',
        }
      }
      const thread = state.threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.sessionId) {
        return {
          status: 'conflict',
          reason: 'parent_conflict',
          message: 'Answer thread parent is not available for finalization.',
        }
      }
      if (args.entries.some((entry) =>
        entry.sessionId !== args.sessionId
        || entry.runId !== args.turnId
        || entry.turnId !== args.turnId
      )) {
        return {
          status: 'conflict',
          reason: 'entry_identity_mismatch',
          message: 'Finalization journal entries must match the answer turn identity.',
        }
      }

      const turn = state.turns.get(args.turnId)
      const existingToolCalls = state.toolCallsByTurn.get(args.turnId) ?? []
      const incomingToolCalls = [...args.toolCalls]
      const turnMatches = turn !== undefined
        && turn.threadId === args.threadId
        && turn.seq === args.turnSeq
        && turn.query === args.query
        && turn.intent === args.intent
        && turn.evidenceJson === args.evidenceJson
        && turn.snapshotHash === args.snapshotHash
        && turn.proseJson === args.proseJson
        && turn.artifactKindsJson === args.artifactKindsJson
        && turn.status === args.finalStatus
        && turn.createdAt === args.createdAt
        && turn.errorCopyId === args.errorCopyId
        && turn.errorProblemJson === args.errorProblemJson
      const sameToolCalls = JSON.stringify(existingToolCalls) === JSON.stringify(incomingToolCalls)
      if (reservation.state === 'finalized') {
        if (reservation.answerDigest !== args.answerDigest) {
          return {
            status: 'conflict',
            reason: 'answer_digest_conflict',
            message: 'Answer turn answer digest mismatch.',
          }
        }
        if (reservation.harnessFinalizationDigest !== args.finalizationHash) {
          return {
            status: 'conflict',
            reason: 'evidence_conflict',
            message: 'Answer turn finalization conflict.',
          }
        }
        if (!turnMatches) {
          return {
            status: 'conflict',
            reason: 'turn_conflict',
            message: 'Answer turn replay does not match finalized material.',
          }
        }
        if (!sameToolCalls) {
          return {
            status: 'conflict',
            reason: 'tool_call_conflict',
            message: 'Answer tool-call replay does not match finalized material.',
          }
        }
        return {
          status: 'replayed',
          turnId: args.turnId,
          finalizationHash: args.finalizationHash,
          entriesAccepted: 0,
          entriesReplayed: args.entries.length,
        }
      }
      if (turn !== undefined && !turnMatches) {
        return {
          status: 'conflict',
          reason: 'turn_conflict',
          message: 'Answer turn already exists with different finalization material.',
        }
      }
      if (turn !== undefined && !sameToolCalls) {
        return {
          status: 'conflict',
          reason: 'tool_call_conflict',
          message: 'Answer tool-call rows already exist with different finalization material.',
        }
      }

      const timestamp = Date.now()
      if (turn === undefined) {
        state.turns.set(args.turnId, {
          turnId: args.turnId,
          threadId: args.threadId,
          seq: args.turnSeq,
          query: args.query,
          intent: args.intent,
          evidenceJson: args.evidenceJson,
          snapshotHash: args.snapshotHash,
          proseJson: args.proseJson,
          artifactKindsJson: args.artifactKindsJson,
          status: args.finalStatus,
          ...(args.errorCopyId === undefined ? {} : { errorCopyId: args.errorCopyId }),
          ...(args.errorProblemJson === undefined ? {} : { errorProblemJson: args.errorProblemJson }),
          createdAt: args.createdAt,
        })
        state.toolCallsByTurn.set(args.turnId, incomingToolCalls)
      }
      state.reservations.set(args.reservationKey, {
        ...reservation,
        state: 'finalized',
        finalStatus: args.finalStatus,
        answerDigest: args.answerDigest,
        harnessFinalizationDigest: args.finalizationHash,
        updatedAt: timestamp,
      })
      state.threads.set(args.threadId, { ...thread, updatedAt: timestamp })
      const activeLeafEntryId = args.entries.at(-1)?.entryId
      return {
        status: 'accepted',
        turnId: args.turnId,
        finalizationHash: args.finalizationHash,
        entriesAccepted: args.entries.length,
        entriesReplayed: 0,
        ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
      }
    },
  }
}

function answerHarnessFinalizationOperationKey(args: Pick<
  FinalizeReservedAnswerTurnArgs,
  'turnId' | 'finalizationHash'
>): string {
  return `answer-turn-finalize:${args.turnId}:${args.finalizationHash}`
}
