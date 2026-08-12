import type { PaginationOptions, PaginationResult } from 'convex/server'
import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import { isRecord } from '@/modules/common/is-record'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import {
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import type { AppendHarnessSessionEntrySourceInput } from '@/modules/harness/harness.functions'

import {
  ANSWER_TURN_EXECUTION_LEASE_MS,
  parsePublicThreadProjection,
  type AnswerThreadRecord,
  type AnswerTurnCheckpoint,
  type AnswerTurnRecord,
  type AnswerTurnReservationRecord,
  type AnswerTurnStatus,
  type FollowUpIntent,
  type PublicThreadProjection,
} from './answer-thread.schema'
import type { AnswerToolCallInputRow } from './internal/commands'
import {
  parseAnswerTurnCheckpoint,
  serializeAnswerTurnCheckpoint,
} from './internal/answer-turn-checkpoint'
import { mintAnswerThreadShareToken } from './internal/share-token'
import { isValidFrozenAnswerOperationArtifacts } from '@/modules/answer/answer-event-schema'
import { buildPublicThreadProjection } from './internal/public-projection'

type AnswerThreadSourceWriteRequestArgs = {
  sourceWriteRequest?: Request
  sourceWriteBody?: string | Uint8Array
}

type AnswerThreadSourceWriteMutationArgs = {
  operationKey: string
  correlationId: string
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}

export type ReserveAnswerTurnArgs = AnswerThreadSourceWriteRequestArgs & {
  sessionId: string
  threadId?: string
  query: string
  searchContextJson?: string
  requestDigest: string
  reservationKey: string
  title: string
}
type ReserveAnswerTurnMutationArgs =
  Omit<ReserveAnswerTurnArgs, 'sourceWriteRequest' | 'sourceWriteBody' | 'threadId'>
  & AnswerThreadSourceWriteMutationArgs
  & {
    requestedThreadScope: string
  }

export type AnswerTurnReservationResult =
  | {
      kind: 'reserved'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      generation: number
      isNewThread: boolean
    }
  | {
      kind: 'in_progress'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      generation: number
    }
  | {
      kind: 'replayed'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      generation: number
      state: AnswerTurnReservationRecord['state']
      finalStatus?: AnswerTurnReservationRecord['finalStatus']
    }
  | {
      kind: 'conflict'
      reason: 'request_digest_mismatch'
        | 'identity_mismatch'
        | 'checkpoint_conflict'
    }
  | {
      kind: 'refused'
      reason: 'thread_not_found' | 'thread_forbidden' | 'thread_turn_limit'
    }
export type RenewAnswerTurnLeaseArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
}

export type RenewAnswerTurnLeaseResult =
  | {
      kind: 'renewed'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      generation: number
    }
  | {
      kind: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'generation_mismatch'
        | 'stopped'
        | 'settled'
    }


export type PersistAnswerTurnCheckpointArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
  checkpoint: AnswerTurnCheckpoint
}

type PersistAnswerTurnCheckpointMutationArgs =
  Omit<PersistAnswerTurnCheckpointArgs, 'sourceWriteRequest' | 'sourceWriteBody' | 'checkpoint'>
  & AnswerThreadSourceWriteMutationArgs
  & {
    checkpointStep: number
    checkpointJson: string
    checkpointDigest: string
  }

export type PersistAnswerTurnCheckpointResult =
  | {
      kind: 'persisted' | 'replayed'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      generation: number
      checkpointDigest: string
    }
  | {
      kind: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'generation_mismatch'
        | 'checkpoint_invalid'
        | 'checkpoint_conflict'
        | 'stopped'
        | 'settled'
    }

export type ReadAnswerTurnCheckpointArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
}
type RenewAnswerTurnLeaseMutationArgs =
  Omit<RenewAnswerTurnLeaseArgs, 'sourceWriteRequest' | 'sourceWriteBody'>
  & AnswerThreadSourceWriteMutationArgs

type ReadAnswerTurnCheckpointQueryArgs =
  Omit<ReadAnswerTurnCheckpointArgs, 'sourceWriteRequest' | 'sourceWriteBody'>
  & AnswerThreadSourceWriteMutationArgs


export type ReadAnswerTurnCheckpointResult =
  | { kind: 'checkpoint'; checkpoint: AnswerTurnCheckpoint }
  | { kind: 'missing' }
  | {
      kind: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'generation_mismatch'
        | 'checkpoint_invalid'
        | 'stopped'
        | 'settled'
    }

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

export type DeleteAnswerThreadArgs = AnswerThreadSourceWriteRequestArgs & {
  threadId: string
  pseudonymousSessionId: string
}

type DeleteAnswerThreadMutationArgs = Omit<DeleteAnswerThreadArgs, 'sourceWriteRequest' | 'sourceWriteBody'> & AnswerThreadSourceWriteMutationArgs

export type IssueAnswerThreadShareArgs = AnswerThreadSourceWriteRequestArgs & {
  threadId: string
  pseudonymousSessionId: string
}

type IssueAnswerThreadShareMutationArgs =
  Omit<IssueAnswerThreadShareArgs, 'sourceWriteRequest' | 'sourceWriteBody'> & AnswerThreadSourceWriteMutationArgs

export type IssueAnswerThreadShareResult = {
  threadId: string
  shareToken: string
}

export type RevokeAnswerThreadShareArgs = IssueAnswerThreadShareArgs
type RevokeAnswerThreadShareMutationArgs =
  Omit<RevokeAnswerThreadShareArgs, 'sourceWriteRequest' | 'sourceWriteBody'> & AnswerThreadSourceWriteMutationArgs

export type RevokeAnswerThreadShareResult = {
  threadId: string
  revoked: boolean
}

export type AnswerThreadWithTurnCount = AnswerThreadRecord & {
  turnCount: number
}

export type AnswerThreadPage<Item> = Readonly<Pick<PaginationResult<Item>, 'page' | 'isDone' | 'continueCursor'>>

export type AnswerThreadWithTurns = {
  thread: AnswerThreadWithTurnCount
  turns: AnswerThreadPage<AnswerTurnRecord>
}

export type ListSessionThreadsResult = {
  threads: readonly AnswerThreadRecord[]
}

export const reserveAnswerTurnMutation = sourceMutation<ReserveAnswerTurnMutationArgs, AnswerTurnReservationResult>(
  'answerThreads:reserveAnswerTurn',
)
export const renewAnswerTurnLeaseMutation = sourceMutation<
  RenewAnswerTurnLeaseMutationArgs,
  RenewAnswerTurnLeaseResult
>('answerThreads:renewAnswerTurnLease')


export type ReadAnswerTurnCheckpointWireResult =
  | {
      kind: 'checkpoint'
      checkpointJson: string
      checkpointDigest: string
      generation: number
      checkpointStep: number
    }
  | { kind: 'missing' }
  | {
      kind: 'conflict'
      reason: Extract<ReadAnswerTurnCheckpointResult, { kind: 'conflict' }>['reason']
    }

export const persistAnswerTurnCheckpointMutation = sourceMutation<
  PersistAnswerTurnCheckpointMutationArgs,
  PersistAnswerTurnCheckpointResult
>('answerThreads:persistAnswerTurnCheckpoint')
export const readAnswerTurnCheckpointQuery = sourceQuery<
  ReadAnswerTurnCheckpointQueryArgs,
  ReadAnswerTurnCheckpointWireResult
>('answerThreads:readAnswerTurnCheckpoint')



export const stopAnswerTurnMutation = sourceMutation<StopAnswerTurnMutationArgs, StopAnswerTurnResult>(
  'answerThreads:stopAnswerTurn',
)

export const finalizeReservedAnswerTurnMutation = sourceMutation<
  FinalizeReservedAnswerTurnMutationArgs,
  AnswerHarnessFinalizationResult
>('harnessSessions:finalizeReservedAnswerTurn')

export const deleteAnswerThreadMutation = sourceMutation<DeleteAnswerThreadMutationArgs, { threadId: string }>(
  'answerThreads:deleteAnswerThread',
)

export const issueAnswerThreadShareMutation = sourceMutation<
  IssueAnswerThreadShareMutationArgs,
  IssueAnswerThreadShareResult
>('answerThreads:issueAnswerThreadShare')

export const revokeAnswerThreadShareMutation = sourceMutation<
  RevokeAnswerThreadShareMutationArgs,
  RevokeAnswerThreadShareResult
>('answerThreads:revokeAnswerThreadShare')

export const listSessionThreadsQuery = sourceQuery<
  { pseudonymousSessionId: string; limit?: number },
  ListSessionThreadsResult
>('answerThreads:listSessionThreads')

export const getAnswerThreadQuery = sourceQuery<
  { threadId: string; pseudonymousSessionId: string },
  AnswerThreadWithTurnCount | null
>('answerThreads:getAnswerThread')

export const getAnswerThreadWithTurnsQuery = sourceQuery<
  {
    threadId: string
    pseudonymousSessionId: string
    paginationOpts: PaginationOptions
  },
  AnswerThreadWithTurns | null
>('answerThreads:getAnswerThreadWithTurns')

export const getOwnedThreadProjectionQuery = sourceQuery<
  { threadId: string; pseudonymousSessionId: string },
  string | null
>('answerThreads:getOwnedThreadProjection')

export const getSharedThreadProjectionQuery = sourceQuery<
  { shareToken: string },
  string | null
>('answerThreads:getSharedThreadProjection')

export const getThreadTurnsQuery = sourceQuery<
  {
    threadId: string
    pseudonymousSessionId: string
    paginationOpts: PaginationOptions
  },
  AnswerThreadPage<AnswerTurnRecord>
>('answerThreads:getThreadTurns')

type AnswerThreadPort = {
  reserveAnswerTurn(args: ReserveAnswerTurnArgs): Promise<AnswerTurnReservationResult>
  renewAnswerTurnLease(args: RenewAnswerTurnLeaseArgs): Promise<RenewAnswerTurnLeaseResult>
  persistAnswerTurnCheckpoint(args: PersistAnswerTurnCheckpointArgs): Promise<PersistAnswerTurnCheckpointResult>
  readAnswerTurnCheckpoint(args: ReadAnswerTurnCheckpointArgs): Promise<ReadAnswerTurnCheckpointWireResult>
  stopAnswerTurn(args: StopAnswerTurnArgs): Promise<StopAnswerTurnResult>
  listSessionThreads(pseudonymousSessionId: string, limit?: number): Promise<ListSessionThreadsResult>
  getOwnedThreadProjection(threadId: string, pseudonymousSessionId: string): Promise<PublicThreadProjection | null>
  issueShare(args: IssueAnswerThreadShareArgs): Promise<IssueAnswerThreadShareResult>
  revokeShare(args: RevokeAnswerThreadShareArgs): Promise<RevokeAnswerThreadShareResult>
  getSharedThreadProjection(shareToken: string): Promise<PublicThreadProjection | null>
  getThreadTurns(
    threadId: string,
    pseudonymousSessionId: string,
    paginationOpts: PaginationOptions,
  ): Promise<AnswerThreadPage<AnswerTurnRecord>>
  deleteThread(args: DeleteAnswerThreadArgs): Promise<{ threadId: string }>
  getAnswerThread(threadId: string, pseudonymousSessionId: string): Promise<AnswerThreadWithTurnCount | null>
  getAnswerThreadWithTurns(
    threadId: string,
    pseudonymousSessionId: string,
    paginationOpts: PaginationOptions,
  ): Promise<AnswerThreadWithTurns | null>
  finalizeReservedAnswerTurn(args: FinalizeReservedAnswerTurnArgs): Promise<AnswerHarnessFinalizationResult>
}

let testPort: AnswerThreadPort | undefined
let localE2ePort: AnswerThreadPort | undefined

export function setAnswerThreadPortForTests(port: AnswerThreadPort | undefined): () => void {
  const previous = testPort
  testPort = port
  return () => {
    testPort = previous
  }
}

export async function reserveAnswerTurn(args: ReserveAnswerTurnArgs): Promise<AnswerTurnReservationResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.reserveAnswerTurn(args)
  }
  const operationKey = `answer_thread:reserve:${args.reservationKey}`
  const correlationId = operationKey
  const command: Omit<ReserveAnswerTurnMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    sessionId: args.sessionId,
    requestedThreadScope: args.threadId ?? 'new',
    query: args.query,
    ...(args.searchContextJson === undefined ? {} : { searchContextJson: args.searchContextJson }),
    requestDigest: args.requestDigest,
    reservationKey: args.reservationKey,
    title: args.title,
    operationKey,
    correlationId,
  }
  return callPublicSourceMutation(
    reserveAnswerTurnMutation,
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
export async function renewAnswerTurnLease(
  args: RenewAnswerTurnLeaseArgs,
): Promise<RenewAnswerTurnLeaseResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.renewAnswerTurnLease(args)
  }
  const operationKey = `answer_thread:lease:${args.reservationKey}:${args.generation}`
  const correlationId = operationKey
  const command: Omit<RenewAnswerTurnLeaseMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    reservationKey: args.reservationKey,
    requestDigest: args.requestDigest,
    sessionId: args.sessionId,
    threadId: args.threadId,
    turnId: args.turnId,
    turnSeq: args.turnSeq,
    generation: args.generation,
    operationKey,
    correlationId,
  }
  return callPublicSourceMutation(
    renewAnswerTurnLeaseMutation,
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


export async function persistAnswerTurnCheckpoint(
  args: PersistAnswerTurnCheckpointArgs,
): Promise<PersistAnswerTurnCheckpointResult> {
  const serialized = serializeAnswerTurnCheckpoint(args.checkpoint)
  if (serialized === null) {
    return { kind: 'conflict', reason: 'checkpoint_invalid' }
  }
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.persistAnswerTurnCheckpoint(args)
  }
  const operationKey = `answer_thread:checkpoint:${args.reservationKey}:${args.turnId}:${args.checkpoint.stepOrdinal}`
  const correlationId = operationKey
  const command: Omit<PersistAnswerTurnCheckpointMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    reservationKey: args.reservationKey,
    requestDigest: args.requestDigest,
    sessionId: args.sessionId,
    threadId: args.threadId,
    turnId: args.turnId,
    turnSeq: args.turnSeq,
    generation: args.generation,
    checkpointStep: args.checkpoint.stepOrdinal,
    checkpointJson: serialized.checkpointJson,
    checkpointDigest: serialized.checkpointDigest,
    operationKey,
    correlationId,
  }
  return callPublicSourceMutation(
    persistAnswerTurnCheckpointMutation,
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

export async function readAnswerTurnCheckpoint(
  args: ReadAnswerTurnCheckpointArgs,
): Promise<ReadAnswerTurnCheckpointResult> {
  const port = activeAnswerThreadPort()
  const operationKey = `answer_thread:checkpoint:read:${args.reservationKey}:${args.turnId}`
  const correlationId = operationKey
  const command: Omit<ReadAnswerTurnCheckpointQueryArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    reservationKey: args.reservationKey,
    requestDigest: args.requestDigest,
    sessionId: args.sessionId,
    threadId: args.threadId,
    turnId: args.turnId,
    turnSeq: args.turnSeq,
    generation: args.generation,
    operationKey,
    correlationId,
  }
  const result = port === undefined
    ? await callPublicSourceQuery(
        readAnswerTurnCheckpointQuery,
        await withAnswerThreadSourceWrite({
          request: args.sourceWriteRequest,
          body: args.sourceWriteBody,
          command,
          scope: 'answer_thread',
          operationKey,
          correlationId,
        }),
      )
    : await port.readAnswerTurnCheckpoint(args)
  if (result.kind !== 'checkpoint') return result
  const checkpoint = parseAnswerTurnCheckpoint(result.checkpointJson, result.checkpointDigest)
  if (
    checkpoint === null
    || checkpoint.generation !== result.generation
    || checkpoint.stepOrdinal !== result.checkpointStep
  ) {
    return { kind: 'conflict', reason: 'checkpoint_invalid' }
  }
  return { kind: 'checkpoint', checkpoint }
}

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
    selection: evidence.operationSelection,
    outcome: evidence.operationOutcome,
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

export async function listSessionThreads(
  pseudonymousSessionId: string,
  limit = 20,
): Promise<ListSessionThreadsResult> {
  const normalizedLimit = normalizeSessionThreadLimit(limit)
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.listSessionThreads(pseudonymousSessionId, normalizedLimit)
  }
  return callPublicSourceQuery(listSessionThreadsQuery, {
    pseudonymousSessionId,
    limit: normalizedLimit,
  })
}

export async function getAnswerThread(
  threadId: string,
  pseudonymousSessionId: string,
): Promise<AnswerThreadWithTurnCount | null> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.getAnswerThread(threadId, pseudonymousSessionId)
  }
  return callPublicSourceQuery(getAnswerThreadQuery, { threadId, pseudonymousSessionId })
}

export async function getAnswerThreadWithTurns(
  threadId: string,
  pseudonymousSessionId: string,
  paginationOpts: PaginationOptions,
): Promise<AnswerThreadWithTurns | null> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.getAnswerThreadWithTurns(threadId, pseudonymousSessionId, paginationOpts)
  }
  return callPublicSourceQuery(getAnswerThreadWithTurnsQuery, {
    threadId,
    pseudonymousSessionId,
    paginationOpts,
  })
}

export async function getOwnedThreadProjection(
  threadId: string,
  pseudonymousSessionId: string,
): Promise<PublicThreadProjection | null> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.getOwnedThreadProjection(threadId, pseudonymousSessionId)
  }
  return decodePublicThreadProjection(
    await callPublicSourceQuery(getOwnedThreadProjectionQuery, { threadId, pseudonymousSessionId }),
  )
}

export async function issueAnswerThreadShare(
  args: IssueAnswerThreadShareArgs,
): Promise<IssueAnswerThreadShareResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.issueShare(args)
  }
  const operationKey = `answer_thread:share:issue:${args.threadId}:${args.pseudonymousSessionId}`
  const correlationId = operationKey
  const command: Omit<IssueAnswerThreadShareMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    threadId: args.threadId,
    pseudonymousSessionId: args.pseudonymousSessionId,
    operationKey,
    correlationId,
  }
  return callPublicSourceMutation(
    issueAnswerThreadShareMutation,
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

export async function revokeAnswerThreadShare(
  args: RevokeAnswerThreadShareArgs,
): Promise<RevokeAnswerThreadShareResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.revokeShare(args)
  }
  const operationKey = `answer_thread:share:revoke:${args.threadId}:${args.pseudonymousSessionId}`
  const correlationId = operationKey
  const command: Omit<RevokeAnswerThreadShareMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    threadId: args.threadId,
    pseudonymousSessionId: args.pseudonymousSessionId,
    operationKey,
    correlationId,
  }
  return callPublicSourceMutation(
    revokeAnswerThreadShareMutation,
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

export async function getSharedThreadProjection(shareToken: string): Promise<PublicThreadProjection | null> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.getSharedThreadProjection(shareToken)
  }
  return decodePublicThreadProjection(
    await callPublicSourceQuery(getSharedThreadProjectionQuery, { shareToken }),
  )
}

function decodePublicThreadProjection(encoded: string | null): PublicThreadProjection | null {
  if (encoded === null) return null
  const projection = parsePublicThreadProjection(JSON.parse(encoded))
  if (projection === null) throw new Error('answer_thread_projection_invalid')
  return projection
}

export async function getThreadTurns(
  threadId: string,
  pseudonymousSessionId: string,
  paginationOpts: PaginationOptions,
): Promise<AnswerThreadPage<AnswerTurnRecord>> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.getThreadTurns(threadId, pseudonymousSessionId, paginationOpts)
  }
  return callPublicSourceQuery(getThreadTurnsQuery, { threadId, pseudonymousSessionId, paginationOpts })
}

export async function deleteAnswerThread(args: DeleteAnswerThreadArgs): Promise<{ threadId: string }> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.deleteThread(args)
  }
  const operationKey = `answer_thread:delete:${args.threadId}:${args.pseudonymousSessionId}`
  const correlationId = operationKey
  const command: Omit<DeleteAnswerThreadMutationArgs, 'sourceWrite' | 'sourceWriteRequest'> = {
    threadId: args.threadId,
    pseudonymousSessionId: args.pseudonymousSessionId,
    operationKey,
    correlationId,
  }
  return callPublicSourceMutation(
    deleteAnswerThreadMutation,
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

async function withAnswerThreadSourceWrite<Command extends Record<string, unknown>>(input: {
  request: Request | undefined
  body: string | Uint8Array | undefined
  command: Command
  scope: 'answer_thread' | 'harness_session'
  operationKey: string
  correlationId: string
}): Promise<Command & AnswerThreadSourceWriteMutationArgs> {
  if (input.request === undefined || input.body === undefined) {
    throw new Error('source_write_request_missing')
  }
  const sourceWrite = await sourceWriteAdmissionFromRequest({
    request: input.request,
    body: input.body,
    command: input.command,
    scope: input.scope,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
  })
  return {
    ...input.command,
    operationKey: input.operationKey,
    correlationId: input.correlationId,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
    sourceWrite,
  }
}

function activeAnswerThreadPort(): AnswerThreadPort | undefined {
  if (testPort !== undefined) {
    return testPort
  }
  if (!isLocalE2EAuthBypassEnabled()) {
    return undefined
  }
  localE2ePort ??= createLocalE2eAnswerThreadPort()
  return localE2ePort
}


function createLocalE2eAnswerThreadPort(): AnswerThreadPort {
  const threads = new Map<string, AnswerThreadRecord>()
  const turns = new Map<string, AnswerTurnRecord>()
  const toolCallsByTurn = new Map<string, readonly AnswerToolCallInputRow[]>()
  const reservations = new Map<string, AnswerTurnReservationRecord>()
  const checkpoints = new Map<string, AnswerTurnCheckpoint>()
  const generations = new Map<string, number>()
  const shares = new Map<string, { threadId: string; generation: number; shareToken: string; revoked: boolean }>()
  const localShareKeyring = {
    keyId: 'answer-thread-share-local-e2e-v1',
    secret: 'local-answer-thread-share-secret-for-e2e-only-32',
  }

  const turnsForThread = (threadId: string): AnswerTurnRecord[] => {
    const rows = [...turns.values()].filter((turn) => turn.threadId === threadId)
    for (const reservation of reservations.values()) {
      if (reservation.threadId !== threadId || reservation.state !== 'stopped' || turns.has(reservation.turnId)) {
        continue
      }
      rows.push({
        turnId: reservation.turnId,
        threadId,
        seq: reservation.seq,
        query: reservation.query,
        intent: 'refine_search',
        evidenceJson: JSON.stringify({
          providers: [],
          allowedSlugs: [],
          agentJsonUrl: '',
          toolCalls: [],
          timings: [],
          workLog: [],
          answerRun: {
            summary: {
              schemaVersion: 1,
              turn: { intent: 'refine_search', status: 'stopped' },
              tools: { total: 0, complete: 0, error: 0, refused: 0, totalDurationMs: 0, byName: {} },
              evidence: { providerCount: 0, allowedSlugCount: 0, resultHashes: [], snapshotHash: '' },
              workLog: { total: 0, complete: 0, running: 0, skipped: 0, error: 0, stopped: 0 },
              timings: { totalEntries: 0, totalDurationMs: 0, byName: {} },
              gates: { ok: false, source: 'turn_status', code: 'stopped' },
            },
            coverage: {
              toolsAvailable: [],
              toolsInvoked: [],
              toolsUnused: [],
              workLogPhases: [],
              hasProviders: false,
              hasAllowedSlugs: false,
              hasSnapshotHash: false,
            },
          },
        }),
        snapshotHash: '',
        proseJson: JSON.stringify({ oneLine: '', summary: '', nextStep: '' }),
        artifactKindsJson: '[]',
        status: 'stopped',
        createdAt: reservation.updatedAt,
      })
    }
    return rows.sort((left, right) => left.seq - right.seq)
  }

  const reservationFor = (reservationKey: string) => reservations.get(reservationKey)

  return {
    reserveAnswerTurn: async (args) => {
      const requestedThreadScope = args.threadId ?? 'new'
      const prior = reservationFor(args.reservationKey)
      if (prior !== undefined) {
        if (prior.sessionId !== args.sessionId || prior.requestedThreadScope !== requestedThreadScope) {
          return { kind: 'conflict', reason: 'identity_mismatch' }
        }
        if (prior.requestDigest !== args.requestDigest) {
          return { kind: 'conflict', reason: 'request_digest_mismatch' }
        }
        const timestamp = Date.now()
        const generation = generations.get(prior.reservationKey) ?? 0
        if (prior.state === 'reserved') {
          if (timestamp - prior.updatedAt < ANSWER_TURN_EXECUTION_LEASE_MS) {
            return {
              kind: 'in_progress',
              reservationKey: prior.reservationKey,
              threadId: prior.threadId,
              turnId: prior.turnId,
              turnSeq: prior.seq,
              generation,
            }
          }
          const nextGeneration = generation + 1
          const checkpoint = checkpoints.get(prior.reservationKey)
          if (checkpoint !== undefined) {
            const serialized = serializeAnswerTurnCheckpoint(checkpoint)
            if (
              serialized === null
              || checkpoint.reservationKey !== prior.reservationKey
              || checkpoint.requestDigest !== prior.requestDigest
              || checkpoint.generation !== generation
              || checkpoint.threadId !== prior.threadId
              || checkpoint.turnId !== prior.turnId
              || checkpoint.turnSeq !== prior.seq
            ) {
              return { kind: 'conflict', reason: 'checkpoint_conflict' }
            }
            const migrated = { ...checkpoint, generation: nextGeneration }
            if (serializeAnswerTurnCheckpoint(migrated) === null) {
              return { kind: 'conflict', reason: 'checkpoint_conflict' }
            }
            checkpoints.set(prior.reservationKey, migrated)
          }
          generations.set(prior.reservationKey, nextGeneration)
          reservations.set(prior.reservationKey, { ...prior, updatedAt: timestamp })
          return {
            kind: 'reserved',
            reservationKey: prior.reservationKey,
            threadId: prior.threadId,
            turnId: prior.turnId,
            turnSeq: prior.seq,
            generation: nextGeneration,
            isNewThread: false,
          }
        }
        return {
          kind: 'replayed',
          reservationKey: prior.reservationKey,
          threadId: prior.threadId,
          turnId: prior.turnId,
          turnSeq: prior.seq,
          generation,
          state: prior.state,
          ...(prior.finalStatus === undefined ? {} : { finalStatus: prior.finalStatus }),
        }
      }

      let thread: AnswerThreadRecord | undefined
      if (args.threadId !== undefined) {
        thread = threads.get(args.threadId)
        if (thread === undefined) return { kind: 'refused', reason: 'thread_not_found' }
        if (thread.pseudonymousSessionId !== args.sessionId && !isLocalE2EAuthBypassEnabled()) {
          return { kind: 'refused', reason: 'thread_forbidden' }
        }
      } else {
        const timestamp = Date.now()
        thread = {
          threadId: crypto.randomUUID(),
          pseudonymousSessionId: args.sessionId,
          title: args.title,
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        threads.set(thread.threadId, thread)
      }

      const existingIds = new Set(turnsForThread(thread.threadId).map((turn) => turn.turnId))
      const threadReservations = [...reservations.values()].filter((reservation) => reservation.threadId === thread.threadId)
      for (const reservation of threadReservations) {
        existingIds.add(reservation.turnId)
      }
      if (existingIds.size >= 25) return { kind: 'refused', reason: 'thread_turn_limit' }

      const turnSeq = Math.max(
        0,
        ...turnsForThread(thread.threadId).map((turn) => turn.seq),
        ...threadReservations.map((reservation) => reservation.seq),
      ) + 1
      const timestamp = Date.now()
      const reservation: AnswerTurnReservationRecord = {
        reservationKey: args.reservationKey,
        sessionId: args.sessionId,
        requestedThreadScope,
        requestDigest: args.requestDigest,
        threadId: thread.threadId,
        turnId: crypto.randomUUID(),
        seq: turnSeq,
        query: args.query,
        ...(args.searchContextJson === undefined ? {} : { searchContextJson: args.searchContextJson }),
        state: 'reserved',
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      generations.set(reservation.reservationKey, 0)
      reservations.set(reservation.reservationKey, reservation)
      threads.set(thread.threadId, { ...thread, updatedAt: timestamp })
      return {
        kind: 'reserved',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        generation: 0,
        isNewThread: requestedThreadScope === 'new',
      }
    },
    renewAnswerTurnLease: async (args) => {
      const reservation = reservationFor(args.reservationKey)
      if (reservation === undefined) return { kind: 'conflict', reason: 'reservation_not_found' }
      if (
        reservation.sessionId !== args.sessionId
        || reservation.threadId !== args.threadId
        || reservation.turnId !== args.turnId
        || reservation.seq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: 'conflict', reason: 'request_digest_mismatch' }
      }
      if (reservation.state === 'stopped') return { kind: 'conflict', reason: 'stopped' }
      if (reservation.state === 'finalized') return { kind: 'conflict', reason: 'settled' }
      const generation = generations.get(args.reservationKey) ?? 0
      if (generation !== args.generation) return { kind: 'conflict', reason: 'generation_mismatch' }
      reservations.set(args.reservationKey, { ...reservation, updatedAt: Date.now() })
      return {
        kind: 'renewed',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        generation,
      }
    },
    persistAnswerTurnCheckpoint: async (args) => {
      const serialized = serializeAnswerTurnCheckpoint(args.checkpoint)
      if (serialized === null) return { kind: 'conflict', reason: 'checkpoint_invalid' }
      const reservation = reservationFor(args.reservationKey)
      if (reservation === undefined) return { kind: 'conflict', reason: 'reservation_not_found' }
      if (
        reservation.sessionId !== args.sessionId
        || reservation.threadId !== args.threadId
        || reservation.turnId !== args.turnId
        || reservation.seq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: 'conflict', reason: 'request_digest_mismatch' }
      }
      if (reservation.state === 'stopped') return { kind: 'conflict', reason: 'stopped' }
      if (reservation.state === 'finalized') {
        return { kind: 'conflict', reason: 'settled' }
      }
      const generation = generations.get(args.reservationKey) ?? 0
      if (generation !== args.generation || args.checkpoint.generation !== generation) {
        return { kind: 'conflict', reason: 'generation_mismatch' }
      }
      const existing = checkpoints.get(args.reservationKey)
      if (existing !== undefined) {
        const existingSerialized = serializeAnswerTurnCheckpoint(existing)
        if (existingSerialized === null) return { kind: 'conflict', reason: 'checkpoint_invalid' }
        if (existingSerialized.checkpointDigest === serialized.checkpointDigest) {
          reservations.set(args.reservationKey, { ...reservation, updatedAt: Date.now() })
          return {
            kind: 'replayed',
            reservationKey: args.reservationKey,
            threadId: args.threadId,
            turnId: args.turnId,
            turnSeq: args.turnSeq,
            generation,
            checkpointDigest: serialized.checkpointDigest,
          }
        }
        if (
          args.checkpoint.stepOrdinal !== existing.stepOrdinal + 1
          || args.checkpoint.parentCheckpointDigest !== existingSerialized.checkpointDigest
        ) {
          return { kind: 'conflict', reason: 'checkpoint_conflict' }
        }
      } else if (args.checkpoint.stepOrdinal !== 1 || args.checkpoint.parentCheckpointDigest !== undefined) {
        return { kind: 'conflict', reason: 'checkpoint_conflict' }
      }
      reservations.set(args.reservationKey, { ...reservation, updatedAt: Date.now() })
      checkpoints.set(args.reservationKey, args.checkpoint)
      return {
        kind: 'persisted',
        reservationKey: args.reservationKey,
        threadId: args.threadId,
        turnId: args.turnId,
        turnSeq: args.turnSeq,
        generation,
        checkpointDigest: serialized.checkpointDigest,
      }
    },
    readAnswerTurnCheckpoint: async (args) => {
      const reservation = reservationFor(args.reservationKey)
      if (reservation === undefined) return { kind: 'missing' }
      if (
        reservation.sessionId !== args.sessionId
        || reservation.threadId !== args.threadId
        || reservation.turnId !== args.turnId
        || reservation.seq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: 'conflict', reason: 'request_digest_mismatch' }
      }
      if (reservation.state === 'stopped') return { kind: 'conflict', reason: 'stopped' }
      if (reservation.state === 'finalized') return { kind: 'conflict', reason: 'settled' }
      const generation = generations.get(args.reservationKey) ?? 0
      if (generation !== args.generation) return { kind: 'conflict', reason: 'generation_mismatch' }
      const checkpoint = checkpoints.get(args.reservationKey)
      if (checkpoint === undefined) return { kind: 'missing' }
      if (
        checkpoint.generation !== generation
        || checkpoint.reservationKey !== args.reservationKey
        || checkpoint.requestDigest !== args.requestDigest
        || checkpoint.threadId !== args.threadId
        || checkpoint.turnId !== args.turnId
        || checkpoint.turnSeq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'checkpoint_invalid' }
      }
      const serialized = serializeAnswerTurnCheckpoint(checkpoint)
      if (serialized === null) return { kind: 'conflict', reason: 'checkpoint_invalid' }
      return {
        kind: 'checkpoint',
        checkpointJson: serialized.checkpointJson,
        checkpointDigest: serialized.checkpointDigest,
        generation,
        checkpointStep: checkpoint.stepOrdinal,
      }
    },
    stopAnswerTurn: async (args) => {

      const reservation = [...reservations.values()].find(
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
      const generation = (generations.get(reservation.reservationKey) ?? 0) + 1
      generations.set(reservation.reservationKey, generation)
      reservations.set(reservation.reservationKey, { ...reservation, state: 'stopped', updatedAt: timestamp })
      const turn = turns.get(args.turnId)
      if (turn !== undefined) turns.set(args.turnId, { ...turn, status: 'stopped' })
      return { kind: 'stopped', threadId: args.threadId, turnId: args.turnId }
    },
    listSessionThreads: async (pseudonymousSessionId, limit = 20) => ({
      threads: [...threads.values()]
        .filter((thread) => thread.pseudonymousSessionId === pseudonymousSessionId)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, normalizeSessionThreadLimit(limit)),
    }),
    getOwnedThreadProjection: async (threadId, pseudonymousSessionId) => {
      const thread = threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== pseudonymousSessionId) return null
      return buildPublicThreadProjection(thread, turnsForThread(threadId))
    },
    issueShare: async (args) => {
      const thread = threads.get(args.threadId)
      if (thread === undefined) throw new Error('thread_not_found')
      if (thread.pseudonymousSessionId !== args.pseudonymousSessionId && !isLocalE2EAuthBypassEnabled()) {
        throw new Error('thread_forbidden')
      }
      const existing = shares.get(args.threadId)
      const generation = existing?.revoked === false ? existing.generation : (existing?.generation ?? 0) + 1
      const shareToken = mintAnswerThreadShareToken(
        { threadId: args.threadId, generation, keyId: localShareKeyring.keyId },
        localShareKeyring,
      )
      shares.set(args.threadId, { threadId: args.threadId, generation, shareToken, revoked: false })
      return { threadId: args.threadId, shareToken }
    },
    revokeShare: async (args) => {
      const thread = threads.get(args.threadId)
      if (thread === undefined) throw new Error('thread_not_found')
      if (thread.pseudonymousSessionId !== args.pseudonymousSessionId && !isLocalE2EAuthBypassEnabled()) {
        throw new Error('thread_forbidden')
      }
      const existing = shares.get(args.threadId)
      if (existing === undefined || existing.revoked) return { threadId: args.threadId, revoked: false }
      shares.set(args.threadId, { ...existing, revoked: true })
      return { threadId: args.threadId, revoked: true }
    },
    getSharedThreadProjection: async (shareToken) => {
      const grant = [...shares.values()].find((candidate) => candidate.shareToken === shareToken && !candidate.revoked)
      if (grant === undefined) return null
      const thread = threads.get(grant.threadId)
      return thread === undefined ? null : buildPublicThreadProjection(thread, turnsForThread(grant.threadId))
    },
    getThreadTurns: async (threadId, pseudonymousSessionId, paginationOpts) => {
      const thread = threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== pseudonymousSessionId) {
        return { page: [], isDone: true, continueCursor: '' }
      }
      const rows = turnsForThread(threadId)
      const start = paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor)
      const page = rows.slice(start, start + paginationOpts.numItems)
      return {
        page,
        isDone: start + page.length >= rows.length,
        continueCursor: String(start + page.length),
      }
    },
    getAnswerThread: async (threadId, pseudonymousSessionId) => {
      const thread = threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== pseudonymousSessionId) return null
      return { ...thread, turnCount: turnsForThread(threadId).length }
    },
    getAnswerThreadWithTurns: async (threadId, pseudonymousSessionId, paginationOpts) => {
      const thread = threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== pseudonymousSessionId) return null
      const rows = turnsForThread(threadId)
      const start = paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor)
      const page = rows.slice(start, start + paginationOpts.numItems)
      return {
        thread: { ...thread, turnCount: rows.length },
        turns: {
          page,
          isDone: start + page.length >= rows.length,
          continueCursor: String(start + page.length),
        },
      }
    },
    deleteThread: async (args) => {
      const thread = threads.get(args.threadId)
      if (thread === undefined) return { threadId: args.threadId }
      if (thread.pseudonymousSessionId !== args.pseudonymousSessionId && !isLocalE2EAuthBypassEnabled()) {
        throw new Error('thread_forbidden')
      }
      shares.delete(args.threadId)
      threads.delete(args.threadId)
      for (const turn of turnsForThread(args.threadId)) turns.delete(turn.turnId)
      for (const reservation of reservations.values()) {
        if (reservation.threadId !== args.threadId) continue
        reservations.delete(reservation.reservationKey)
        checkpoints.delete(reservation.reservationKey)
        generations.delete(reservation.reservationKey)
      }
      return { threadId: args.threadId }
    },
    finalizeReservedAnswerTurn: async (args) => {
      const reservation = reservationFor(args.reservationKey)
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
      const generation = generations.get(args.reservationKey) ?? 0
      if (generation !== args.expectedGeneration) {
        return {
          status: 'conflict',
          reason: 'generation_mismatch',
          message: 'Answer turn generation mismatch.',
        }
      }
      const thread = threads.get(args.threadId)
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

      const turn = turns.get(args.turnId)
      const existingToolCalls = toolCallsByTurn.get(args.turnId) ?? []
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
        turns.set(args.turnId, {
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
        toolCallsByTurn.set(args.turnId, incomingToolCalls)
      }
      reservations.set(args.reservationKey, {
        ...reservation,
        state: 'finalized',
        finalStatus: args.finalStatus,
        answerDigest: args.answerDigest,
        harnessFinalizationDigest: args.finalizationHash,
        updatedAt: timestamp,
      })
      threads.set(args.threadId, { ...thread, updatedAt: timestamp })
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

function normalizeSessionThreadLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 20
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 50)
}



function answerHarnessFinalizationOperationKey(args: Pick<
  FinalizeReservedAnswerTurnArgs,
  'turnId' | 'finalizationHash'
>): string {
  return `answer-turn-finalize:${args.turnId}:${args.finalizationHash}`
}
