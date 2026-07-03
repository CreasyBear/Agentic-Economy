import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest } from '@/lib/server/source-write-admission'
import type { SourceWriteAdmission } from '@/modules/security/source-write-admission'
import type { AppendHarnessSessionEntrySourceInput } from '@/modules/harness/harness.functions'

import type {
  AnswerThreadRecord,
  AnswerTurnRecord,
  AnswerTurnStatus,
  FollowUpIntent,
  PublicThreadProjection,
} from './answer-thread.schema'
import {
  appendAnswerToolCalls,
  type AnswerToolCallInputRow,
} from './internal/commands'
import { buildPublicThreadProjection } from './internal/public-projection'

export type CreateAnswerThreadArgs = {
  threadId: string
  pseudonymousSessionId: string
  title: string
}

export type AppendAnswerTurnArgs = {
  turnId: string
  threadId: string
  pseudonymousSessionId: string
  seq: number
  query: string
  intent: FollowUpIntent
  evidenceJson: string
  snapshotHash: string
  proseJson: string
  artifactKindsJson: string
  status: AnswerTurnStatus
  errorCopyId?: string
}

export type AppendAnswerTurnWithToolCallsArgs = AppendAnswerTurnArgs & {
  toolCalls: readonly AnswerToolCallInputRow[]
}

export type AppendAnswerTurnWithThreadAndToolCallsArgs = AppendAnswerTurnWithToolCallsArgs & {
  title: string
}

export type FinalizeAnswerTurnHarnessRunArgs = {
  turnId: string
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
        | 'turn_not_found'
        | 'snapshot_mismatch'
        | 'evidence_conflict'
        | 'entry_id_conflict'
        | 'idempotency_conflict'
        | 'parent_conflict'
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

export type DeleteAnswerThreadArgs = {
  threadId: string
  pseudonymousSessionId: string
}

export type AnswerThreadWithTurnCount = AnswerThreadRecord & {
  turnCount: number
}

export type AnswerThreadWithTurns = AnswerThreadWithTurnCount & {
  turns: readonly AnswerTurnRecord[]
}

export type ListSessionThreadsResult = {
  threads: readonly AnswerThreadRecord[]
}

export const createAnswerThreadMutation = sourceMutation<CreateAnswerThreadArgs, { threadId: string }>(
  'answerThreads:createAnswerThread',
)

export const appendAnswerTurnMutation = sourceMutation<AppendAnswerTurnArgs, { turnId: string }>(
  'answerThreads:appendAnswerTurn',
)

export const appendAnswerTurnWithToolCallsMutation = sourceMutation<
  AppendAnswerTurnWithToolCallsArgs,
  { turnId: string; insertedToolCalls: number }
>('answerThreads:appendAnswerTurnWithToolCalls')

export const appendAnswerTurnWithThreadAndToolCallsMutation = sourceMutation<
  AppendAnswerTurnWithThreadAndToolCallsArgs,
  { turnId: string; insertedToolCalls: number }
>('answerThreads:appendAnswerTurnWithThreadAndToolCalls')

export const finalizeAnswerTurnHarnessRunMutation = sourceMutation<
  FinalizeAnswerTurnHarnessRunMutationArgs,
  Exclude<AnswerHarnessFinalizationResult, { status: 'error' }>
>('harnessSessions:finalizeAnswerTurnHarnessRun')

export const deleteAnswerThreadMutation = sourceMutation<DeleteAnswerThreadArgs, { threadId: string }>(
  'answerThreads:deleteAnswerThread',
)

export const listSessionThreadsQuery = sourceQuery<
  { pseudonymousSessionId: string; limit?: number },
  ListSessionThreadsResult
>('answerThreads:listSessionThreads')

export const getAnswerThreadQuery = sourceQuery<{ threadId: string }, AnswerThreadWithTurnCount | null>(
  'answerThreads:getAnswerThread',
)

export const getAnswerThreadWithTurnsQuery = sourceQuery<{ threadId: string }, AnswerThreadWithTurns | null>(
  'answerThreads:getAnswerThreadWithTurns',
)

export const getPublicThreadProjectionQuery = sourceQuery<
  { threadId: string },
  PublicThreadProjection | null
>('answerThreads:getPublicThreadProjection')

export const getThreadTurnsQuery = sourceQuery<{ threadId: string }, { turns: readonly AnswerTurnRecord[] }>(
  'answerThreads:getThreadTurns',
)

type AnswerThreadPort = {
  createThread(args: CreateAnswerThreadArgs): Promise<{ threadId: string }>
  appendTurn(args: AppendAnswerTurnArgs): Promise<{ turnId: string }>
  appendTurnWithToolCalls?(
    args: AppendAnswerTurnWithToolCallsArgs,
  ): Promise<{ turnId: string; insertedToolCalls: number }>
  appendTurnWithThreadAndToolCalls?(
    args: AppendAnswerTurnWithThreadAndToolCallsArgs,
  ): Promise<{ turnId: string; insertedToolCalls: number }>
  listSessionThreads(pseudonymousSessionId: string, limit?: number): Promise<ListSessionThreadsResult>
  getPublicThreadProjection(threadId: string): Promise<PublicThreadProjection | null>
  getThreadTurns(threadId: string): Promise<{ turns: readonly AnswerTurnRecord[] }>
  deleteThread?(args: DeleteAnswerThreadArgs): Promise<{ threadId: string }>
  getAnswerThread?(threadId: string): Promise<AnswerThreadWithTurnCount | null>
  finalizeTurnHarnessRun?(args: FinalizeAnswerTurnHarnessRunArgs): Promise<AnswerHarnessFinalizationResult>
}

let testPort: AnswerThreadPort | undefined
let localE2ePort: AnswerThreadPort | undefined
const missingConvexFunctions = new Set<string>()

export function setAnswerThreadPortForTests(port: AnswerThreadPort | undefined): () => void {
  const previous = testPort
  testPort = port
  return () => {
    testPort = previous
  }
}

export async function createAnswerThread(args: CreateAnswerThreadArgs): Promise<{ threadId: string }> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.createThread(args)
  }
  return callPublicSourceMutation(createAnswerThreadMutation, args)
}

export async function appendAnswerTurn(args: AppendAnswerTurnArgs): Promise<{ turnId: string }> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.appendTurn(args)
  }
  return callPublicSourceMutation(appendAnswerTurnMutation, args)
}

export async function appendAnswerTurnWithToolCalls(
  args: AppendAnswerTurnWithToolCallsArgs,
): Promise<{ turnId: string; insertedToolCalls: number }> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    if (port.appendTurnWithToolCalls !== undefined) {
      return port.appendTurnWithToolCalls(args)
    }
    const { turnId } = await port.appendTurn(args)
    return { turnId, insertedToolCalls: args.toolCalls.length }
  }
  if (!missingConvexFunctions.has('answerThreads:appendAnswerTurnWithToolCalls')) {
    try {
      return await callPublicSourceMutation(appendAnswerTurnWithToolCallsMutation, args)
    } catch (error) {
      if (!isMissingConvexFunction(error, 'answerThreads:appendAnswerTurnWithToolCalls')) {
        throw error
      }
      missingConvexFunctions.add('answerThreads:appendAnswerTurnWithToolCalls')
    }
  }

  const { toolCalls, ...turnArgs } = args
  const { turnId } = await appendAnswerTurn(turnArgs)
  if (toolCalls.length === 0) {
    return { turnId, insertedToolCalls: 0 }
  }
  const { inserted } = await appendAnswerToolCalls({ turnId, toolCalls })
  return { turnId, insertedToolCalls: inserted }
}

export async function appendAnswerTurnWithThreadAndToolCalls(
  args: AppendAnswerTurnWithThreadAndToolCallsArgs,
): Promise<{ turnId: string; insertedToolCalls: number }> {
  const { title, ...appendArgs } = args
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    if (port.appendTurnWithThreadAndToolCalls !== undefined) {
      return port.appendTurnWithThreadAndToolCalls(args)
    }
    await port.createThread({
      threadId: args.threadId,
      pseudonymousSessionId: args.pseudonymousSessionId,
      title,
    })
    if (port.appendTurnWithToolCalls !== undefined) {
      return port.appendTurnWithToolCalls(appendArgs)
    }
    const { turnId } = await port.appendTurn(appendArgs)
    return { turnId, insertedToolCalls: args.toolCalls.length }
  }
  if (!missingConvexFunctions.has('answerThreads:appendAnswerTurnWithThreadAndToolCalls')) {
    try {
      return await callPublicSourceMutation(appendAnswerTurnWithThreadAndToolCallsMutation, args)
    } catch (error) {
      if (!isMissingConvexFunction(error, 'answerThreads:appendAnswerTurnWithThreadAndToolCalls')) {
        throw error
      }
      markOptimizedAnswerThreadFunctionsMissing()
    }
  }
  await createAnswerThread({
    threadId: args.threadId,
    pseudonymousSessionId: args.pseudonymousSessionId,
    title,
  })
  return appendAnswerTurnWithToolCalls(appendArgs)
}

export async function finalizeAnswerTurnHarnessRunFromRequest(
  request: Request,
  args: FinalizeAnswerTurnHarnessRunArgs,
): Promise<AnswerHarnessFinalizationResult> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    if (port.finalizeTurnHarnessRun !== undefined) {
      return port.finalizeTurnHarnessRun(args)
    }
    const activeLeafEntryId = args.entries.at(-1)?.entryId
    return {
      status: 'accepted',
      turnId: args.turnId,
      finalizationHash: args.finalizationHash,
      entriesAccepted: args.entries.length,
      entriesReplayed: 0,
      ...(activeLeafEntryId === undefined ? {} : { activeLeafEntryId }),
    }
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
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.listSessionThreads(pseudonymousSessionId, limit)
  }
  return callPublicSourceQuery(listSessionThreadsQuery, { pseudonymousSessionId, limit })
}

export async function getAnswerThread(threadId: string): Promise<AnswerThreadWithTurnCount | null> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    if (port.getAnswerThread === undefined) {
      return null
    }
    return port.getAnswerThread(threadId)
  }
  return callPublicSourceQuery(getAnswerThreadQuery, { threadId })
}

export async function getAnswerThreadWithTurns(threadId: string): Promise<AnswerThreadWithTurns | null> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    const thread = await (port.getAnswerThread?.(threadId) ?? Promise.resolve(null))
    const turns = await port.getThreadTurns(threadId).catch(() => ({ turns: [] as readonly AnswerTurnRecord[] }))
    return thread === null
      ? null
      : {
          ...thread,
          turns: turns.turns,
          turnCount: turns.turns.length,
        }
  }
  if (!missingConvexFunctions.has('answerThreads:getAnswerThreadWithTurns')) {
    try {
      return await callPublicSourceQuery(getAnswerThreadWithTurnsQuery, { threadId })
    } catch (error) {
      if (!isMissingConvexFunction(error, 'answerThreads:getAnswerThreadWithTurns')) {
        throw error
      }
      markOptimizedAnswerThreadFunctionsMissing()
    }
  }
  const thread = await getAnswerThread(threadId)
  if (thread === null) {
    return null
  }
  const turns = await getThreadTurns(threadId)
  return {
    ...thread,
    turns: turns.turns,
    turnCount: turns.turns.length,
  }
}

export async function getPublicThreadProjection(threadId: string): Promise<PublicThreadProjection | null> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.getPublicThreadProjection(threadId)
  }
  return callPublicSourceQuery(getPublicThreadProjectionQuery, { threadId })
}

export async function getThreadTurns(threadId: string): Promise<{ turns: readonly AnswerTurnRecord[] }> {
  const port = activeAnswerThreadPort()
  if (port !== undefined) {
    return port.getThreadTurns(threadId)
  }
  return callPublicSourceQuery(getThreadTurnsQuery, { threadId })
}

export async function deleteAnswerThread(args: DeleteAnswerThreadArgs): Promise<{ threadId: string }> {
  const port = activeAnswerThreadPort()
  if (port?.deleteThread !== undefined) {
    return port.deleteThread(args)
  }
  return callPublicSourceMutation(deleteAnswerThreadMutation, args)
}

function activeAnswerThreadPort(): AnswerThreadPort | undefined {
  if (testPort !== undefined) {
    return testPort
  }
  if (!usesLocalE2eBypass()) {
    return undefined
  }
  localE2ePort ??= createLocalE2eAnswerThreadPort()
  return localE2ePort
}

function createLocalE2eAnswerThreadPort(): AnswerThreadPort {
  const threads = new Map<string, AnswerThreadRecord>()
  const turns = new Map<string, AnswerTurnRecord>()

  const turnsForThread = (threadId: string) =>
    [...turns.values()]
      .filter((turn) => turn.threadId === threadId)
      .sort((left, right) => left.seq - right.seq)

  const appendTurnRecord = async (args: AppendAnswerTurnArgs): Promise<{ turnId: string }> => {
    const thread = threads.get(args.threadId)
    if (thread === undefined) {
      throw new Error('thread_not_found')
    }
    if (thread.pseudonymousSessionId !== args.pseudonymousSessionId && !usesLocalE2eBypass()) {
      throw new Error('thread_forbidden')
    }
    if (turnsForThread(args.threadId).length >= 25) {
      throw new Error('thread_turn_limit')
    }
    const timestamp = Date.now()
    turns.set(args.turnId, {
      ...args,
      createdAt: timestamp,
    })
    threads.set(args.threadId, {
      ...thread,
      updatedAt: timestamp,
    })
    return { turnId: args.turnId }
  }

  return {
    createThread: async (args) => {
      const timestamp = Date.now()
      const existing = threads.get(args.threadId)
      if (existing !== undefined) {
        if (existing.pseudonymousSessionId !== args.pseudonymousSessionId && !usesLocalE2eBypass()) {
          throw new Error('thread_forbidden')
        }
        return { threadId: args.threadId }
      }
      threads.set(args.threadId, {
        threadId: args.threadId,
        pseudonymousSessionId: args.pseudonymousSessionId,
        title: args.title,
        sharePolicy: 'public',
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      return { threadId: args.threadId }
    },
    appendTurn: appendTurnRecord,
    appendTurnWithToolCalls: async (args) => {
      const { toolCalls, ...turnArgs } = args
      const { turnId } = await appendTurnRecord(turnArgs)
      return { turnId, insertedToolCalls: toolCalls.length }
    },
    appendTurnWithThreadAndToolCalls: async (args) => {
      if (!threads.has(args.threadId)) {
        const timestamp = Date.now()
        threads.set(args.threadId, {
          threadId: args.threadId,
          pseudonymousSessionId: args.pseudonymousSessionId,
          title: args.title,
          sharePolicy: 'public',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      }
      const { title: _title, toolCalls, ...turnArgs } = args
      const { turnId } = await appendTurnRecord(turnArgs)
      return { turnId, insertedToolCalls: toolCalls.length }
    },
    listSessionThreads: async (pseudonymousSessionId, limit = 20) => ({
      threads: [...threads.values()]
        .filter((thread) => thread.pseudonymousSessionId === pseudonymousSessionId)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, limit),
    }),
    getPublicThreadProjection: async (threadId) => {
      const thread = threads.get(threadId)
      if (thread === undefined) {
        return null
      }
      return buildPublicThreadProjection(thread, turnsForThread(threadId))
    },
    getThreadTurns: async (threadId) => ({ turns: turnsForThread(threadId) }),
    getAnswerThread: async (threadId) => {
      const thread = threads.get(threadId)
      if (thread === undefined) {
        return null
      }
      return { ...thread, turnCount: turnsForThread(threadId).length }
    },
    deleteThread: async (args) => {
      const thread = threads.get(args.threadId)
      if (thread === undefined) {
        return { threadId: args.threadId }
      }
      if (thread.pseudonymousSessionId !== args.pseudonymousSessionId && !usesLocalE2eBypass()) {
        throw new Error('thread_forbidden')
      }
      threads.delete(args.threadId)
      for (const turn of turnsForThread(args.threadId)) {
        turns.delete(turn.turnId)
      }
      return { threadId: args.threadId }
    },
    finalizeTurnHarnessRun: async (args) => {
      const turn = turns.get(args.turnId)
      if (turn === undefined) {
        return {
          status: 'conflict',
          reason: 'turn_not_found',
          message: `Answer turn ${args.turnId} does not exist.`,
        }
      }
      turns.set(args.turnId, {
        ...turn,
        evidenceJson: args.evidenceJson,
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

function isMissingConvexFunction(error: unknown, functionName: string): boolean {
  const text = error instanceof Error ? `${error.message}\n${String(error.cause ?? '')}` : String(error)
  return text.includes('Could not find public function') && text.includes(functionName)
}

function markOptimizedAnswerThreadFunctionsMissing(): void {
  missingConvexFunctions.add('answerThreads:appendAnswerTurnWithToolCalls')
  missingConvexFunctions.add('answerThreads:appendAnswerTurnWithThreadAndToolCalls')
  missingConvexFunctions.add('answerThreads:getAnswerThreadWithTurns')
}

function usesLocalE2eBypass(): boolean {
  return process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true'
}

function answerHarnessFinalizationOperationKey(args: Pick<
  FinalizeAnswerTurnHarnessRunArgs,
  'turnId' | 'finalizationHash'
>): string {
  return `answer-turn-finalize:${args.turnId}:${args.finalizationHash}`
}
