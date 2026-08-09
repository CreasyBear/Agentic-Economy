import type { PaginationOptions, PaginationResult } from 'convex/server'
import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'
import type { AppendHarnessSessionEntrySourceInput } from '@/modules/harness/harness.functions'

import type {
  AnswerThreadRecord,
  AnswerTurnCheckpoint,
  AnswerTurnRecord,
  AnswerTurnReservationRecord,
  AnswerTurnStatus,
  FollowUpIntent,
  PublicThreadProjection,
} from './answer-thread.schema'
import { parseAnswerTurnCheckpoint } from './answer-thread.schema'
import type { AnswerToolCallInputRow } from './internal/commands'
import { mintAnswerThreadShareToken } from './internal/share-token'
import { buildPublicThreadProjection } from './internal/public-projection'

type AnswerThreadSourceWriteRequestArgs = {
  sourceWriteRequest?: Request
}

type AnswerThreadSourceWriteMutationArgs = {
  operationKey?: string
  correlationId?: string
  sourceWrite?: SourceWriteAdmission
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

type ReserveAnswerTurnMutationArgs = Omit<ReserveAnswerTurnArgs, 'sourceWriteRequest' | 'threadId'> &
  AnswerThreadSourceWriteMutationArgs & {
    requestedThreadScope: string
  }

export type AnswerTurnReservationResult =
  | {
      kind: 'reserved'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      isNewThread: boolean
    }
  | {
      kind: 'replayed'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      state: AnswerTurnReservationRecord['state']
      finalStatus?: AnswerTurnReservationRecord['finalStatus']
    }
  | {
      kind: 'conflict'
      reason: 'request_digest_mismatch' | 'identity_mismatch'
    }
  | {
      kind: 'refused'
      reason: 'thread_not_found' | 'thread_forbidden' | 'thread_turn_limit'
    }

export type AnswerTurnResumeLeaseArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  leaseOwner: string
  mode: 'initial' | 'resume'
  expectedGeneration?: number
}

export type AnswerTurnResumeLeaseResult =
  | {
      kind: 'acquired'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      query: string
      searchContextJson?: string
      generation: number
      leaseOwner: string
      leaseExpiresAt: number
      checkpoint?: AnswerTurnCheckpoint
      checkpointDigest?: string
      checkpointStep?: number
    }
  | {
      kind: 'pending'
      reservationKey: string
      threadId: string
      turnId: string
      leaseExpiresAt?: number
    }
  | {
      kind: 'settled'
      reservationKey: string
      threadId: string
      turnId: string
      status: 'complete' | 'error' | 'stopped'
    }
  | {
      kind: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'stopped'
        | 'finalized'
        | 'non_resumable'
        | 'generation_mismatch'
        | 'lease_active'
    }

export type RenewAnswerTurnResumeLeaseArgs = Omit<AnswerTurnResumeLeaseArgs, 'mode'> & {
  generation: number
}

export type WriteAnswerTurnCheckpointArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
  leaseOwner: string
  checkpoint: AnswerTurnCheckpoint
}

export type WriteAnswerTurnCheckpointResult =
  | {
      kind: 'checkpointed' | 'replayed'
      reservationKey: string
      threadId: string
      turnId: string
      generation: number
      checkpointDigest: string
      checkpointStep: number
    }
  | {
      kind: 'stopped'
      reservationKey: string
      threadId: string
      turnId: string
    }
  | {
      kind: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'stopped'
        | 'finalized'
        | 'non_resumable'
        | 'generation_mismatch'
        | 'lease_owner_mismatch'
        | 'lease_expired'
        | 'checkpoint_invalid'
        | 'checkpoint_digest_mismatch'
        | 'checkpoint_conflict'
        | 'checkpoint_step_stale'
    }

export type PersistReservedAnswerTurnArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
  leaseOwner: string
  answerDigest: string
  query: string
  intent: FollowUpIntent
  evidenceJson: string
  snapshotHash: string
  proseJson: string
  artifactKindsJson: string
  finalStatus?: Extract<AnswerTurnStatus, 'complete' | 'error'>
  errorCopyId?: string
  errorProblemJson?: string
  toolCalls: readonly AnswerToolCallInputRow[]
}

type PersistReservedAnswerTurnMutationArgs = Omit<PersistReservedAnswerTurnArgs, 'sourceWriteRequest'> &
  AnswerThreadSourceWriteMutationArgs

export type PersistReservedAnswerTurnResult =
  | {
      kind: 'persisted' | 'replayed'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
    }
  | {
      kind: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'answer_digest_conflict'
        | 'turn_conflict'
        | 'tool_call_conflict'
        | 'stopped'
        | 'generation_mismatch'
        | 'lease_owner_mismatch'
        | 'lease_expired'
    }

export type FailPersistedAnswerTurnArgs = AnswerThreadSourceWriteRequestArgs & {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
  leaseOwner: string
  answerDigest: string
  errorCopyId?: string
  errorProblemJson: string
}

type FailPersistedAnswerTurnMutationArgs = Omit<FailPersistedAnswerTurnArgs, 'sourceWriteRequest'> &
  AnswerThreadSourceWriteMutationArgs

export type FailPersistedAnswerTurnResult =
  | {
      kind: 'failed'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
    }
  | {
      kind: 'replayed'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
      status: Extract<AnswerTurnStatus, 'complete' | 'error'>
    }
  | {
      kind: 'stopped'
      reservationKey: string
      threadId: string
      turnId: string
      turnSeq: number
    }
  | {
      kind: 'conflict'
      reason:
        | 'reservation_not_found'
        | 'reservation_identity_mismatch'
        | 'request_digest_mismatch'
        | 'answer_digest_conflict'
        | 'turn_not_found'
        | 'not_persisted'
        | 'generation_mismatch'
        | 'lease_owner_mismatch'
        | 'lease_expired'
    }
export type FinalizeAnswerTurnHarnessRunArgs = {
  reservationKey: string
  requestDigest: string
  sessionId: string
  threadId: string
  turnId: string
  turnSeq: number
  generation: number
  leaseOwner: string
  finalStatus: Extract<AnswerTurnStatus, 'complete' | 'error'>
  snapshotHash: string
  evidenceJson: string
  finalizationHash: string
  entries: readonly AppendHarnessSessionEntrySourceInput[]
}

export type FinalizeAnswerTurnHarnessRunMutationArgs = FinalizeAnswerTurnHarnessRunArgs & {
  operationKey: string
  correlationId: string
  sourceWrite?: SourceWriteAdmission
}
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
        | 'turn_not_found'
        | 'snapshot_mismatch'
        | 'evidence_conflict'
        | 'entry_identity_mismatch'
        | 'entry_id_conflict'
        | 'idempotency_conflict'
        | 'parent_conflict'
        | 'stopped'
        | 'generation_mismatch'
        | 'lease_owner_mismatch'
        | 'lease_expired'
      message: string
      activeLeafEntryId?: string
    }
  | {
      status: 'denied'
      reason: 'missing_csrf' | 'foreign_origin'
      message: string
    }
  | {
      status: 'error'
      reason: 'source_write_failed'
      message: string
    }

export type StopAnswerTurnArgs = AnswerThreadSourceWriteRequestArgs & {
  sessionId: string
  threadId: string
  turnId: string
}

type StopAnswerTurnMutationArgs = Omit<StopAnswerTurnArgs, 'sourceWriteRequest'> & AnswerThreadSourceWriteMutationArgs

export type StopAnswerTurnResult =
  | { kind: 'stopped'; threadId: string; turnId: string }
  | { kind: 'already_settled'; threadId: string; turnId: string; status: 'complete' | 'error' | 'stopped' }
  | { kind: 'not_found' }

export type DeleteAnswerThreadArgs = AnswerThreadSourceWriteRequestArgs & {
  threadId: string
  pseudonymousSessionId: string
}

type DeleteAnswerThreadMutationArgs = Omit<DeleteAnswerThreadArgs, 'sourceWriteRequest'> & AnswerThreadSourceWriteMutationArgs

export type IssueAnswerThreadShareArgs = AnswerThreadSourceWriteRequestArgs & {
  threadId: string
  pseudonymousSessionId: string
}

type IssueAnswerThreadShareMutationArgs =
  Omit<IssueAnswerThreadShareArgs, 'sourceWriteRequest'> & AnswerThreadSourceWriteMutationArgs

export type IssueAnswerThreadShareResult = {
  threadId: string
  shareToken: string
}

export type RevokeAnswerThreadShareArgs = IssueAnswerThreadShareArgs
type RevokeAnswerThreadShareMutationArgs =
  Omit<RevokeAnswerThreadShareArgs, 'sourceWriteRequest'> & AnswerThreadSourceWriteMutationArgs

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

export const acquireAnswerTurnResumeLeaseMutation = sourceMutation<
  Omit<AnswerTurnResumeLeaseArgs, 'sourceWriteRequest'> & AnswerThreadSourceWriteMutationArgs,
  AnswerTurnResumeLeaseResult
>('answerThreads:acquireAnswerTurnResumeLease')

export const renewAnswerTurnResumeLeaseMutation = sourceMutation<
  Omit<RenewAnswerTurnResumeLeaseArgs, 'sourceWriteRequest'> & AnswerThreadSourceWriteMutationArgs,
  AnswerTurnResumeLeaseResult
>('answerThreads:renewAnswerTurnResumeLease')

export const writeAnswerTurnCheckpointMutation = sourceMutation<
  Omit<WriteAnswerTurnCheckpointArgs, 'sourceWriteRequest' | 'checkpoint'> & AnswerThreadSourceWriteMutationArgs & {
    checkpointJson: string
    checkpointDigest: string
    checkpointStep: number
  },
  WriteAnswerTurnCheckpointResult
>('answerThreads:writeAnswerTurnCheckpoint')

export const persistReservedAnswerTurnMutation = sourceMutation<
  PersistReservedAnswerTurnMutationArgs,
  PersistReservedAnswerTurnResult
>('answerThreads:persistReservedAnswerTurn')
export const failPersistedAnswerTurnMutation = sourceMutation<
  FailPersistedAnswerTurnMutationArgs,
  FailPersistedAnswerTurnResult
>('answerThreads:failPersistedAnswerTurn')


export const stopAnswerTurnMutation = sourceMutation<StopAnswerTurnMutationArgs, StopAnswerTurnResult>(
  'answerThreads:stopAnswerTurn',
)

export const finalizeAnswerTurnHarnessRunMutation = sourceMutation<
  FinalizeAnswerTurnHarnessRunMutationArgs,
  Exclude<AnswerHarnessFinalizationResult, { status: 'error' }>
>('harnessSessions:finalizeAnswerTurnHarnessRun')

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
  PublicThreadProjection | null
>('answerThreads:getOwnedThreadProjection')

export const getSharedThreadProjectionQuery = sourceQuery<
  { shareToken: string },
  PublicThreadProjection | null
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
  acquireAnswerTurnResumeLease?(
    args: AnswerTurnResumeLeaseArgs,
  ): Promise<AnswerTurnResumeLeaseResult>
  renewAnswerTurnResumeLease?(
    args: RenewAnswerTurnResumeLeaseArgs,
  ): Promise<AnswerTurnResumeLeaseResult>
  writeAnswerTurnCheckpoint?(
    args: WriteAnswerTurnCheckpointArgs,
  ): Promise<WriteAnswerTurnCheckpointResult>
  persistReservedAnswerTurn(args: PersistReservedAnswerTurnArgs): Promise<PersistReservedAnswerTurnResult>
  failPersistedAnswerTurn(args: FailPersistedAnswerTurnArgs): Promise<FailPersistedAnswerTurnResult>
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
  finalizeTurnHarnessRun(args: FinalizeAnswerTurnHarnessRunArgs): Promise<AnswerHarnessFinalizationResult>
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

  const prepared = await withAnswerThreadSourceWrite(
    args,
    `answer_thread:reserve:${args.reservationKey}`,
  )
  const { threadId, ...mutationArgs } = prepared
  return callPublicSourceMutation(reserveAnswerTurnMutation, {
    ...mutationArgs,
    requestedThreadScope: threadId ?? 'new',
  })
}

export async function acquireAnswerTurnResumeLease(
  args: AnswerTurnResumeLeaseArgs,
): Promise<AnswerTurnResumeLeaseResult | undefined> {
  const port = activeAnswerThreadPort()
  if (port?.acquireAnswerTurnResumeLease !== undefined) {
    return port.acquireAnswerTurnResumeLease(args)
  }
  if (port !== undefined) return undefined
  const prepared = await withAnswerThreadSourceWrite(
    args,
    `answer_thread:lease:${args.mode}:${args.reservationKey}:${args.turnId}:${args.leaseOwner}`,
  )
  return toAnswerTurnResumeLeaseResult(await callPublicSourceMutation(
    acquireAnswerTurnResumeLeaseMutation,
    prepared,
  ))
}

export async function renewAnswerTurnResumeLease(
  args: RenewAnswerTurnResumeLeaseArgs,
): Promise<AnswerTurnResumeLeaseResult | undefined> {
  const port = activeAnswerThreadPort()
  if (port?.renewAnswerTurnResumeLease !== undefined) {
    return port.renewAnswerTurnResumeLease(args)
  }
  if (port !== undefined) return undefined
  const prepared = await withAnswerThreadSourceWrite(
    args,
    `answer_thread:lease-renew:${args.reservationKey}:${args.turnId}:${args.generation}:${args.leaseOwner}`,
  )
  return toAnswerTurnResumeLeaseResult(await callPublicSourceMutation(
    renewAnswerTurnResumeLeaseMutation,
    prepared,
  ))
}

export async function writeAnswerTurnCheckpoint(
  args: WriteAnswerTurnCheckpointArgs,
): Promise<WriteAnswerTurnCheckpointResult | undefined> {
  const checkpoint = parseAnswerTurnCheckpoint(args.checkpoint)
  if (checkpoint === null) {
    return {
      kind: 'conflict',
      reason: 'checkpoint_invalid',
    }
  }
  const port = activeAnswerThreadPort()
  if (port?.writeAnswerTurnCheckpoint !== undefined) {
    return port.writeAnswerTurnCheckpoint({ ...args, checkpoint })
  }
  if (port !== undefined) return undefined
  const checkpointJson = JSON.stringify(checkpoint)
  const checkpointDigest = canonicalDigest(checkpoint)
  const prepared = await withAnswerThreadSourceWrite(
    {
      ...args,
      checkpointJson,
      checkpointDigest,
      checkpointStep: checkpoint.stepIndex,
    },
    `answer_thread:checkpoint:${args.reservationKey}:${args.turnId}:${args.generation}:${checkpoint.stepIndex}`,
  )
  const { checkpoint: _checkpoint, ...mutationArgs } = prepared as typeof prepared & { checkpoint?: unknown }
  return callPublicSourceMutation(writeAnswerTurnCheckpointMutation, mutationArgs)
}

function toAnswerTurnResumeLeaseResult(value: unknown): AnswerTurnResumeLeaseResult {
  if (!isRecord(value) || value.kind !== 'acquired') {
    return value as AnswerTurnResumeLeaseResult
  }
  const checkpointJson = value.checkpointJson
  if (checkpointJson === undefined) {
    return value as AnswerTurnResumeLeaseResult
  }
  if (typeof checkpointJson !== 'string') {
    return { kind: 'conflict', reason: 'non_resumable' }
  }
  try {
    const checkpoint = parseAnswerTurnCheckpoint(JSON.parse(checkpointJson))
    if (checkpoint === null) return { kind: 'conflict', reason: 'non_resumable' }
    return {
      ...(value as Omit<Extract<AnswerTurnResumeLeaseResult, { kind: 'acquired' }>, 'checkpoint'>),
      checkpoint,
    }
  } catch {
    return { kind: 'conflict', reason: 'non_resumable' }
  }
}
export async function persistReservedAnswerTurn(
  args: PersistReservedAnswerTurnArgs,
): Promise<PersistReservedAnswerTurnResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.persistReservedAnswerTurn(args)
  }
  return callPublicSourceMutation(
    persistReservedAnswerTurnMutation,
    await withAnswerThreadSourceWrite(args, `answer_thread:persist:${args.reservationKey}:${args.turnId}`),
  )
}
export async function failPersistedAnswerTurn(
  args: FailPersistedAnswerTurnArgs,
): Promise<FailPersistedAnswerTurnResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.failPersistedAnswerTurn(args)
  }
  return callPublicSourceMutation(
    failPersistedAnswerTurnMutation,
    await withAnswerThreadSourceWrite(args, `answer_thread:fail:${args.reservationKey}:${args.turnId}`),
  )
}


export async function stopAnswerTurn(args: StopAnswerTurnArgs): Promise<StopAnswerTurnResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.stopAnswerTurn(args)
  }
  return callPublicSourceMutation(
    stopAnswerTurnMutation,
    await withAnswerThreadSourceWrite(args, `answer_thread:stop:${args.threadId}:${args.turnId}`),
  )
}

export async function finalizeAnswerTurnHarnessRunFromRequest(
  request: Request,
  args: FinalizeAnswerTurnHarnessRunArgs,
): Promise<AnswerHarnessFinalizationResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.finalizeTurnHarnessRun(args)
  }

  const operationKey = answerHarnessFinalizationOperationKey(args)
  const correlationId = args.turnId

  try {
    return await callPublicSourceMutation(finalizeAnswerTurnHarnessRunMutation, {
      ...args,
      operationKey,
      correlationId,
      sourceWrite: await sourceWriteAdmissionFromRequest({
        request,
        scope: 'harness_session',
        operationKey,
        correlationId,
      }),
    })
  } catch (error) {
    return {
      status: 'error',
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
  return callPublicSourceQuery(getOwnedThreadProjectionQuery, { threadId, pseudonymousSessionId })
}

export async function issueAnswerThreadShare(
  args: IssueAnswerThreadShareArgs,
): Promise<IssueAnswerThreadShareResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.issueShare(args)
  }
  return callPublicSourceMutation(
    issueAnswerThreadShareMutation,
    await withAnswerThreadSourceWrite(args, `answer_thread:share:issue:${args.threadId}:${args.pseudonymousSessionId}`),
  )
}

export async function revokeAnswerThreadShare(
  args: RevokeAnswerThreadShareArgs,
): Promise<RevokeAnswerThreadShareResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.revokeShare(args)
  }
  return callPublicSourceMutation(
    revokeAnswerThreadShareMutation,
    await withAnswerThreadSourceWrite(args, `answer_thread:share:revoke:${args.threadId}:${args.pseudonymousSessionId}`),
  )
}

export async function getSharedThreadProjection(shareToken: string): Promise<PublicThreadProjection | null> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.getSharedThreadProjection(shareToken)
  }
  return callPublicSourceQuery(getSharedThreadProjectionQuery, { shareToken })
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
  return callPublicSourceMutation(
    deleteAnswerThreadMutation,
    await withAnswerThreadSourceWrite(args, `answer_thread:delete:${args.threadId}:${args.pseudonymousSessionId}`),
  )
}

async function withAnswerThreadSourceWrite<Args extends AnswerThreadSourceWriteRequestArgs>(
  args: Args,
  operationKey: string,
): Promise<Omit<Args, 'sourceWriteRequest'> & AnswerThreadSourceWriteMutationArgs> {
  const { sourceWriteRequest, ...serializableArgs } = args
  if (sourceWriteRequest === undefined) {
    return serializableArgs as Omit<Args, 'sourceWriteRequest'> & AnswerThreadSourceWriteMutationArgs
  }
  const correlationId = operationKey
  return {
    ...serializableArgs,
    operationKey,
    correlationId,
    sourceWrite: await sourceWriteAdmissionFromRequest({
      request: sourceWriteRequest,
      scope: 'answer_thread',
      operationKey,
      correlationId,
    }),
  } as Omit<Args, 'sourceWriteRequest'> & AnswerThreadSourceWriteMutationArgs
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

function clearReservationPrivateState(
  reservation: AnswerTurnReservationRecord,
): AnswerTurnReservationRecord {
  const cleared = { ...reservation }
  delete cleared.leaseOwner
  delete cleared.leaseExpiresAt
  delete cleared.checkpoint
  delete cleared.checkpointDigest
  delete cleared.checkpointStep
  return cleared
}

function createLocalE2eAnswerThreadPort(): AnswerThreadPort {
  const threads = new Map<string, AnswerThreadRecord>()
  const turns = new Map<string, AnswerTurnRecord>()
  const reservations = new Map<string, AnswerTurnReservationRecord>()
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
        return {
          kind: 'replayed',
          reservationKey: prior.reservationKey,
          threadId: prior.threadId,
          turnId: prior.turnId,
          turnSeq: prior.seq,
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
      reservations.set(reservation.reservationKey, reservation)
      threads.set(thread.threadId, { ...thread, updatedAt: timestamp })
      return {
        kind: 'reserved',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        isNewThread: requestedThreadScope === 'new',
      }
    },
    acquireAnswerTurnResumeLease: async (args) => {
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
      if (args.mode === 'resume' && (
        args.expectedGeneration === undefined
        || reservation.runGeneration !== args.expectedGeneration
      )) {
        return { kind: 'conflict', reason: 'generation_mismatch' }
      }
      const thread = threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.sessionId) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.state === 'stopped') {
        return {
          kind: 'settled',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          status: 'stopped',
        }
      }
      if (reservation.state === 'finalized') {
        return {
          kind: 'settled',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          status: reservation.finalStatus ?? 'error',
        }
      }
      if (reservation.state === 'answer_persisted') {
        if (args.mode !== 'resume') {
          return {
            kind: 'pending',
            reservationKey: reservation.reservationKey,
            threadId: reservation.threadId,
            turnId: reservation.turnId,
          }
        }
        const currentGeneration = reservation.runGeneration
        const currentLeaseOwner = reservation.leaseOwner
        const currentLeaseExpiresAt = reservation.leaseExpiresAt
        const finalStatus = reservation.finalStatus
        if (
          currentGeneration === undefined
          || currentLeaseOwner === undefined
          || currentLeaseExpiresAt === undefined
          || finalStatus === undefined
        ) {
          return { kind: 'conflict', reason: 'non_resumable' }
        }
        const timestamp = Date.now()
        const leaseActive = currentLeaseExpiresAt > timestamp
        if (leaseActive && currentLeaseOwner !== args.leaseOwner) {
          return {
            kind: 'pending',
            reservationKey: reservation.reservationKey,
            threadId: reservation.threadId,
            turnId: reservation.turnId,
            leaseExpiresAt: currentLeaseExpiresAt,
          }
        }
        const generation = leaseActive ? currentGeneration : currentGeneration + 1
        const turn = turns.get(args.turnId)
        if (turn === undefined) return { kind: 'conflict', reason: 'non_resumable' }
        if (turn.status === 'stopped') {
          reservations.set(args.reservationKey, {
            ...clearReservationPrivateState(reservation),
            state: 'stopped',
            updatedAt: timestamp,
          })
          return {
            kind: 'settled',
            reservationKey: reservation.reservationKey,
            threadId: reservation.threadId,
            turnId: reservation.turnId,
            status: 'stopped',
          }
        }
        if (turn.status !== finalStatus) turns.set(args.turnId, { ...turn, status: finalStatus })
        reservations.set(args.reservationKey, {
          ...clearReservationPrivateState(reservation),
          state: 'finalized',
          finalStatus,
          runGeneration: generation,
          updatedAt: timestamp,
        })
        return {
          kind: 'settled',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          status: finalStatus,
        }
      }
      if (args.mode === 'resume') {
        const resumableReserved = reservation.state === 'reserved'
          && reservation.checkpoint === undefined
          && reservation.checkpointDigest === undefined
          && reservation.checkpointStep === undefined
        const resumableCheckpoint = reservation.state === 'checkpointed'
          && reservation.runGeneration !== undefined
          && reservation.checkpoint !== undefined
          && reservation.checkpointDigest !== undefined
          && reservation.checkpointStep !== undefined
        if (!resumableReserved && !resumableCheckpoint) {
          return { kind: 'conflict', reason: 'non_resumable' }
        }
      }
      const timestamp = Date.now()
      const leaseActive = reservation.leaseOwner !== undefined
        && reservation.leaseExpiresAt !== undefined
        && reservation.leaseExpiresAt > timestamp
      if (leaseActive && reservation.leaseOwner !== args.leaseOwner) {
        return {
          kind: 'pending',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          ...(reservation.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: reservation.leaseExpiresAt }),
        }
      }
      const currentGeneration = reservation.runGeneration
      if (args.mode === 'resume' && currentGeneration === undefined) {
        return { kind: 'conflict', reason: 'non_resumable' }
      }
      const generation = currentGeneration === undefined
        ? 0
        : leaseActive || reservation.leaseOwner === undefined
          ? currentGeneration
          : currentGeneration + 1
      const leaseExpiresAt = timestamp + 60_000
      reservations.set(args.reservationKey, {
        ...reservation,
        runGeneration: generation,
        leaseOwner: args.leaseOwner,
        leaseExpiresAt,
        updatedAt: timestamp,
      })
      return {
        kind: 'acquired',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        query: reservation.query,
        ...(reservation.searchContextJson === undefined ? {} : { searchContextJson: reservation.searchContextJson }),
        generation,
        leaseOwner: args.leaseOwner,
        leaseExpiresAt,
        ...(reservation.checkpoint === undefined ? {} : { checkpoint: reservation.checkpoint }),
        ...(reservation.checkpointDigest === undefined ? {} : { checkpointDigest: reservation.checkpointDigest }),
        ...(reservation.checkpointStep === undefined ? {} : { checkpointStep: reservation.checkpointStep }),
      }
    },
    renewAnswerTurnResumeLease: async (args) => {
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
      if (reservation.state === 'stopped') {
        return {
          kind: 'settled',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          status: 'stopped',
        }
      }
      if (reservation.state === 'finalized') {
        return {
          kind: 'settled',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          status: reservation.finalStatus ?? 'error',
        }
      }
      if (reservation.runGeneration !== args.generation) {
        return { kind: 'conflict', reason: 'generation_mismatch' }
      }
      if (reservation.leaseOwner !== args.leaseOwner) {
        return { kind: 'conflict', reason: 'lease_active' }
      }
      if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
        return { kind: 'conflict', reason: 'lease_active' }
      }
      const leaseExpiresAt = Date.now() + 60_000
      reservations.set(args.reservationKey, { ...reservation, leaseExpiresAt, updatedAt: Date.now() })
      return {
        kind: 'acquired',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
        query: reservation.query,
        ...(reservation.searchContextJson === undefined ? {} : { searchContextJson: reservation.searchContextJson }),
        generation: args.generation,
        leaseOwner: args.leaseOwner,
        leaseExpiresAt,
        ...(reservation.checkpoint === undefined ? {} : { checkpoint: reservation.checkpoint }),
        ...(reservation.checkpointDigest === undefined ? {} : { checkpointDigest: reservation.checkpointDigest }),
        ...(reservation.checkpointStep === undefined ? {} : { checkpointStep: reservation.checkpointStep }),
      }
    },
    writeAnswerTurnCheckpoint: async (args) => {
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
      if (reservation.state === 'stopped') {
        return {
          kind: 'stopped',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
        }
      }
      if (reservation.state === 'finalized' || reservation.state === 'answer_persisted') {
        return { kind: 'conflict', reason: 'finalized' }
      }
      if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
        return { kind: 'conflict', reason: 'generation_mismatch' }
      }
      if (reservation.leaseOwner !== args.leaseOwner) {
        return { kind: 'conflict', reason: 'lease_owner_mismatch' }
      }
      if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
        return { kind: 'conflict', reason: 'lease_expired' }
      }
      const checkpointDigest = canonicalDigest(args.checkpoint).toString()
      if (reservation.checkpointDigest === checkpointDigest && reservation.checkpointStep === args.checkpoint.stepIndex) {
        return {
          kind: 'replayed',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          generation: args.generation,
          checkpointDigest,
          checkpointStep: args.checkpoint.stepIndex,
        }
      }
      if (reservation.checkpointStep !== undefined && args.checkpoint.stepIndex < reservation.checkpointStep) {
        return { kind: 'conflict', reason: 'checkpoint_step_stale' }
      }
      if (
        reservation.checkpointStep === args.checkpoint.stepIndex
        && reservation.checkpointDigest !== undefined
        && reservation.checkpointDigest !== checkpointDigest
      ) {
        return { kind: 'conflict', reason: 'checkpoint_conflict' }
      }
      reservations.set(args.reservationKey, {
        ...reservation,
        state: 'checkpointed',
        checkpoint: args.checkpoint,
        checkpointDigest,
        checkpointStep: args.checkpoint.stepIndex,
        updatedAt: Date.now(),
      })
      return {
        kind: 'checkpointed',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        generation: args.generation,
        checkpointDigest,
        checkpointStep: args.checkpoint.stepIndex,
      }
    },
    persistReservedAnswerTurn: async (args) => {
      const reservation = reservationFor(args.reservationKey)
      if (reservation === undefined) return { kind: 'conflict', reason: 'reservation_not_found' }
      if (
        reservation.sessionId !== args.sessionId ||
        reservation.threadId !== args.threadId ||
        reservation.turnId !== args.turnId ||
        reservation.seq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: 'conflict', reason: 'request_digest_mismatch' }
      }
      if (reservation.state === 'stopped') return { kind: 'conflict', reason: 'stopped' }
      if (reservation.state !== 'answer_persisted' && reservation.state !== 'finalized') {
        if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
          return { kind: 'conflict', reason: 'generation_mismatch' }
        }
        if (reservation.leaseOwner !== args.leaseOwner) {
          return { kind: 'conflict', reason: 'lease_owner_mismatch' }
        }
        if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
          return { kind: 'conflict', reason: 'lease_expired' }
        }
      }
      if (
        (reservation.state === 'answer_persisted' || reservation.state === 'finalized') &&
        reservation.answerDigest !== args.answerDigest
      ) {
        return { kind: 'conflict', reason: 'answer_digest_conflict' }
      }
      if (reservation.state === 'answer_persisted' || reservation.state === 'finalized') {
        return {
          kind: 'replayed',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
        }
      }
      const thread = threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.sessionId) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }

      const timestamp = Date.now()
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
        status: 'pending',
        ...(args.errorCopyId === undefined ? {} : { errorCopyId: args.errorCopyId }),
        ...(args.errorProblemJson === undefined ? {} : { errorProblemJson: args.errorProblemJson }),
        createdAt: timestamp,
      })
      reservations.set(args.reservationKey, {
        ...reservation,
        state: 'answer_persisted',
        finalStatus: args.finalStatus ?? (args.errorProblemJson === undefined ? 'complete' : 'error'),
        answerDigest: args.answerDigest,
        updatedAt: timestamp,
      })
      threads.set(args.threadId, { ...thread, updatedAt: timestamp })
      return {
        kind: 'persisted',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
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
      reservations.set(reservation.reservationKey, { ...reservation, state: 'stopped', updatedAt: timestamp })
      const turn = turns.get(args.turnId)
      if (turn !== undefined) turns.set(args.turnId, { ...turn, status: 'stopped' })
      return { kind: 'stopped', threadId: args.threadId, turnId: args.turnId }
    },
    failPersistedAnswerTurn: async (args) => {
      const reservation = reservationFor(args.reservationKey)
      if (reservation === undefined) return { kind: 'conflict', reason: 'reservation_not_found' }
      if (
        reservation.sessionId !== args.sessionId ||
        reservation.threadId !== args.threadId ||
        reservation.turnId !== args.turnId ||
        reservation.seq !== args.turnSeq
      ) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { kind: 'conflict', reason: 'request_digest_mismatch' }
      }
      if (reservation.state === 'stopped') {
        return {
          kind: 'stopped',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
        }
      }
      if (reservation.state !== 'finalized') {
        if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
          return { kind: 'conflict', reason: 'generation_mismatch' }
        }
        if (reservation.leaseOwner !== args.leaseOwner) {
          return { kind: 'conflict', reason: 'lease_owner_mismatch' }
        }
        if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
          return { kind: 'conflict', reason: 'lease_expired' }
        }
      }
      if (reservation.state === 'finalized') {
        if (reservation.answerDigest !== args.answerDigest) {
          return { kind: 'conflict', reason: 'answer_digest_conflict' }
        }
        return {
          kind: 'replayed',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
          status: reservation.finalStatus ?? 'error',
        }
      }
      if (reservation.state === 'reserved') return { kind: 'conflict', reason: 'not_persisted' }
      if (reservation.answerDigest !== args.answerDigest) {
        return { kind: 'conflict', reason: 'answer_digest_conflict' }
      }
      const thread = threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.sessionId) {
        return { kind: 'conflict', reason: 'reservation_identity_mismatch' }
      }
      const turn = turns.get(args.turnId)
      if (turn === undefined) return { kind: 'conflict', reason: 'turn_not_found' }
      if (turn.status === 'stopped') {
        return {
          kind: 'stopped',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
        }
      }
      if (turn.status === 'complete' || turn.status === 'error') {
        reservations.set(args.reservationKey, {
          ...reservation,
          state: 'finalized',
          finalStatus: turn.status,
          answerDigest: args.answerDigest,
          updatedAt: Date.now(),
        })
        return {
          kind: 'replayed',
          reservationKey: reservation.reservationKey,
          threadId: reservation.threadId,
          turnId: reservation.turnId,
          turnSeq: reservation.seq,
          status: turn.status,
        }
      }
      const timestamp = Date.now()
      turns.set(args.turnId, {
        ...turn,
        evidenceJson: '{}',
        proseJson: '{}',
        artifactKindsJson: '[]',
        status: 'error',
        ...(args.errorCopyId === undefined ? {} : { errorCopyId: args.errorCopyId }),
        errorProblemJson: args.errorProblemJson,
      })
      reservations.set(args.reservationKey, {
        ...reservation,
        state: 'finalized',
        finalStatus: 'error',
        answerDigest: args.answerDigest,
        updatedAt: timestamp,
      })
      threads.set(args.threadId, { ...thread, updatedAt: timestamp })
      return {
        kind: 'failed',
        reservationKey: reservation.reservationKey,
        threadId: reservation.threadId,
        turnId: reservation.turnId,
        turnSeq: reservation.seq,
      }
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
        if (reservation.threadId === args.threadId) reservations.delete(reservation.reservationKey)
      }
      return { threadId: args.threadId }
    },
    finalizeTurnHarnessRun: async (args) => {
      const reservation = reservationFor(args.reservationKey)
      if (reservation === undefined) {
        return { status: 'conflict', reason: 'reservation_not_found', message: 'Answer turn reservation does not exist.' }
      }
      if (
        reservation.sessionId !== args.sessionId ||
        reservation.threadId !== args.threadId ||
        reservation.turnId !== args.turnId ||
        reservation.seq !== args.turnSeq
      ) {
        return { status: 'conflict', reason: 'reservation_identity_mismatch', message: 'Answer turn reservation identity mismatch.' }
      }
      if (reservation.requestDigest !== args.requestDigest) {
        return { status: 'conflict', reason: 'request_digest_mismatch', message: 'Answer turn request digest mismatch.' }
      }
      const thread = threads.get(args.threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== args.sessionId) {
        return { status: 'conflict', reason: 'parent_conflict', message: 'Answer thread parent is not available for finalization.' }
      }
      if (args.entries.some((entry) =>
        entry.sessionId !== args.sessionId
        || entry.runId !== args.turnId
        || entry.turnId !== args.turnId
      )) {
        return { status: 'conflict', reason: 'entry_identity_mismatch', message: 'Finalization journal entries must match the answer turn identity.' }
      }
      if (reservation.state === 'stopped') {
        return { status: 'conflict', reason: 'stopped', message: 'Answer turn was stopped.' }
      }
      if (reservation.state !== 'finalized') {
        if (reservation.runGeneration === undefined || reservation.runGeneration !== args.generation) {
          return {
            status: 'conflict',
            reason: 'reservation_identity_mismatch',
            message: 'Answer turn generation does not match finalization.',
          }
        }
        if (reservation.leaseOwner !== args.leaseOwner) {
          return {
            status: 'conflict',
            reason: 'reservation_identity_mismatch',
            message: 'Answer turn lease owner does not match finalization.',
          }
        }
        if (reservation.leaseExpiresAt === undefined || reservation.leaseExpiresAt <= Date.now()) {
          return {
            status: 'conflict',
            reason: 'reservation_identity_mismatch',
            message: 'Answer turn lease has expired.',
          }
        }
      }
      if (reservation.state === 'finalized') {
        if (reservation.harnessFinalizationDigest !== args.finalizationHash) {
          return { status: 'conflict', reason: 'evidence_conflict', message: 'Answer turn finalization conflict.' }
        }
        return {
          status: 'replayed',
          turnId: args.turnId,
          finalizationHash: args.finalizationHash,
          entriesAccepted: 0,
          entriesReplayed: args.entries.length,
        }
      }
      const turn = turns.get(args.turnId)
      if (turn === undefined) {
        return { status: 'conflict', reason: 'turn_not_found', message: 'Answer turn does not exist.' }
      }
      if (turn.snapshotHash !== args.snapshotHash) {
        return { status: 'conflict', reason: 'snapshot_mismatch', message: 'Answer turn snapshot mismatch.' }
      }
      turns.set(args.turnId, { ...turn, evidenceJson: args.evidenceJson, status: args.finalStatus })
      reservations.set(args.reservationKey, {
        ...reservation,
        state: 'finalized',
        finalStatus: args.finalStatus,
        harnessFinalizationDigest: args.finalizationHash,
        updatedAt: Date.now(),
      })
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
  FinalizeAnswerTurnHarnessRunArgs,
  'turnId' | 'finalizationHash'
>): string {
  return `answer-turn-finalize:${args.turnId}:${args.finalizationHash}`
}
