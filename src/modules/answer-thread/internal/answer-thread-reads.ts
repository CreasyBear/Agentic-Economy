import type { PaginationOptions, PaginationResult } from 'convex/server'
import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import {
  sourceWriteRequestFromAdmission,
  type SourceWriteAdmission,
  type SourceWriteAdmissionRequest,
} from '@/modules/security/source-write-admission'
import type { AnswerToolCallInputRow } from './commands'
import {
  parsePublicThreadProjection,
  type AnswerThreadRecord,
  type AnswerTurnCheckpoint,
  type AnswerTurnRecord,
  type AnswerTurnReservationRecord,
  type PublicThreadProjection,
} from '../answer-thread.schema'
import { buildPublicThreadProjection } from './public-projection'
import type {
  AnswerTurnReservationResult,
  RenewAnswerTurnLeaseArgs,
  RenewAnswerTurnLeaseResult,
  ReserveAnswerTurnArgs,
} from './answer-thread-reserve'
import type {
  PersistAnswerTurnCheckpointArgs,
  PersistAnswerTurnCheckpointResult,
  ReadAnswerTurnCheckpointArgs,
  ReadAnswerTurnCheckpointWireResult,
} from './answer-thread-checkpoint'
import type {
  AnswerHarnessFinalizationResult,
  FinalizeReservedAnswerTurnArgs,
  StopAnswerTurnArgs,
  StopAnswerTurnResult,
} from './answer-thread-finalize'
import type {
  IssueAnswerThreadShareArgs,
  IssueAnswerThreadShareResult,
  RevokeAnswerThreadShareArgs,
  RevokeAnswerThreadShareResult,
} from './answer-thread-share'

export type AnswerThreadSourceWriteRequestArgs = {
  sourceWriteRequest?: Request
  sourceWriteBody?: string | Uint8Array
}

export type AnswerThreadSourceWriteMutationArgs = {
  operationKey: string
  correlationId: string
  sourceWrite: SourceWriteAdmission
  sourceWriteRequest: SourceWriteAdmissionRequest
}

export type AnswerThreadPort = {
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

export type LocalE2eAnswerThreadState = {
  threads: Map<string, AnswerThreadRecord>
  turns: Map<string, AnswerTurnRecord>
  toolCallsByTurn: Map<string, readonly AnswerToolCallInputRow[]>
  reservations: Map<string, AnswerTurnReservationRecord>
  checkpoints: Map<string, AnswerTurnCheckpoint>
  generations: Map<string, number>
  shares: Map<string, { threadId: string; generation: number; shareToken: string; revoked: boolean }>
  localShareKeyring: { keyId: string; secret: string }
  turnsForThread: (threadId: string) => AnswerTurnRecord[]
  reservationFor: (reservationKey: string) => AnswerTurnReservationRecord | undefined
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

export type DeleteAnswerThreadArgs = AnswerThreadSourceWriteRequestArgs & {
  threadId: string
  pseudonymousSessionId: string
}

type DeleteAnswerThreadMutationArgs = Omit<DeleteAnswerThreadArgs, 'sourceWriteRequest' | 'sourceWriteBody'> & AnswerThreadSourceWriteMutationArgs

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

export const getThreadTurnsQuery = sourceQuery<
  {
    threadId: string
    pseudonymousSessionId: string
    paginationOpts: PaginationOptions
  },
  AnswerThreadPage<AnswerTurnRecord>
>('answerThreads:getThreadTurns')

export const deleteAnswerThreadMutation = sourceMutation<DeleteAnswerThreadMutationArgs, { threadId: string }>(
  'answerThreads:deleteAnswerThread',
)

let testPort: AnswerThreadPort | undefined
let localE2ePort: AnswerThreadPort | undefined
let localE2ePortFactory: ((state: LocalE2eAnswerThreadState) => AnswerThreadPort) | undefined

export function setAnswerThreadPortForTests(port: AnswerThreadPort | undefined): () => void {
  const previous = testPort
  testPort = port
  return () => {
    testPort = previous
  }
}

export function setLocalE2eAnswerThreadPortFactory(
  factory: (state: LocalE2eAnswerThreadState) => AnswerThreadPort,
): void {
  localE2ePortFactory = factory
}

export function activeAnswerThreadPort(): AnswerThreadPort | undefined {
  if (testPort !== undefined) {
    return testPort
  }
  if (!isLocalE2EAuthBypassEnabled()) {
    return undefined
  }
  const hasConvexSource = process.env.CONVEX_URL?.trim() || process.env.VITE_CONVEX_URL?.trim()
  if (process.env.NODE_ENV !== 'test' && hasConvexSource) {
    return undefined
  }
  localE2ePort ??= createLocalE2eAnswerThreadPort()
  return localE2ePort
}

export async function withAnswerThreadSourceWrite<Command extends Record<string, unknown>>(input: {
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

export function decodePublicThreadProjection(encoded: string | null): PublicThreadProjection | null {
  if (encoded === null) return null
  const projection = parsePublicThreadProjection(JSON.parse(encoded))
  if (projection === null) throw new Error('answer_thread_projection_invalid')
  return projection
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

export function createLocalE2eReadHandlers(state: LocalE2eAnswerThreadState): Pick<
  AnswerThreadPort,
  'listSessionThreads' | 'getOwnedThreadProjection' | 'getThreadTurns' | 'getAnswerThread' | 'getAnswerThreadWithTurns' | 'deleteThread'
> {
  return {
    listSessionThreads: async (pseudonymousSessionId, limit = 20) => ({
      threads: [...state.threads.values()]
        .filter((thread) => thread.pseudonymousSessionId === pseudonymousSessionId)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, normalizeSessionThreadLimit(limit)),
    }),
    getOwnedThreadProjection: async (threadId, pseudonymousSessionId) => {
      const thread = state.threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== pseudonymousSessionId) return null
      return buildPublicThreadProjection(thread, state.turnsForThread(threadId))
    },
    getThreadTurns: async (threadId, pseudonymousSessionId, paginationOpts) => {
      const thread = state.threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== pseudonymousSessionId) {
        return { page: [], isDone: true, continueCursor: '' }
      }
      const rows = state.turnsForThread(threadId)
      const start = paginationOpts.cursor === null ? 0 : Number(paginationOpts.cursor)
      const page = rows.slice(start, start + paginationOpts.numItems)
      return {
        page,
        isDone: start + page.length >= rows.length,
        continueCursor: String(start + page.length),
      }
    },
    getAnswerThread: async (threadId, pseudonymousSessionId) => {
      const thread = state.threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== pseudonymousSessionId) return null
      return { ...thread, turnCount: state.turnsForThread(threadId).length }
    },
    getAnswerThreadWithTurns: async (threadId, pseudonymousSessionId, paginationOpts) => {
      const thread = state.threads.get(threadId)
      if (thread === undefined || thread.pseudonymousSessionId !== pseudonymousSessionId) return null
      const rows = state.turnsForThread(threadId)
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
      const thread = state.threads.get(args.threadId)
      if (thread === undefined) return { threadId: args.threadId }
      if (thread.pseudonymousSessionId !== args.pseudonymousSessionId && !isLocalE2EAuthBypassEnabled()) {
        throw new Error('thread_forbidden')
      }
      state.shares.delete(args.threadId)
      state.threads.delete(args.threadId)
      for (const turn of state.turnsForThread(args.threadId)) state.turns.delete(turn.turnId)
      for (const reservation of state.reservations.values()) {
        if (reservation.threadId !== args.threadId) continue
        state.reservations.delete(reservation.reservationKey)
        state.checkpoints.delete(reservation.reservationKey)
        state.generations.delete(reservation.reservationKey)
      }
      return { threadId: args.threadId }
    },
  }
}

function createLocalE2eAnswerThreadPort(): AnswerThreadPort {
  if (localE2ePortFactory === undefined) {
    throw new Error('local_e2e_answer_thread_port_uninitialized')
  }
  return localE2ePortFactory(createLocalE2eAnswerThreadState())
}

function createLocalE2eAnswerThreadState(): LocalE2eAnswerThreadState {
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
    threads,
    turns,
    toolCallsByTurn,
    reservations,
    checkpoints,
    generations,
    shares,
    localShareKeyring,
    turnsForThread,
    reservationFor,
  }
}

function normalizeSessionThreadLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return 20
  }
  return Math.min(Math.max(Math.trunc(limit), 1), 50)
}
