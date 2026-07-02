import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'

import type {
  AnswerThreadRecord,
  AnswerTurnRecord,
  AnswerTurnStatus,
  FollowUpIntent,
  PublicThreadProjection,
} from './answer-thread.schema'
import type { AnswerToolCallInputRow } from './internal/commands'

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
}

let testPort: AnswerThreadPort | undefined
const missingConvexFunctions = new Set<string>()

export function setAnswerThreadPortForTests(port: AnswerThreadPort | undefined): () => void {
  const previous = testPort
  testPort = port
  return () => {
    testPort = previous
  }
}

export async function createAnswerThread(args: CreateAnswerThreadArgs): Promise<{ threadId: string }> {
  if (testPort !== undefined) {
    return testPort.createThread(args)
  }
  return callPublicSourceMutation(createAnswerThreadMutation, args)
}

export async function appendAnswerTurn(args: AppendAnswerTurnArgs): Promise<{ turnId: string }> {
  if (testPort !== undefined) {
    return testPort.appendTurn(args)
  }
  return callPublicSourceMutation(appendAnswerTurnMutation, args)
}

export async function appendAnswerTurnWithToolCalls(
  args: AppendAnswerTurnWithToolCallsArgs,
): Promise<{ turnId: string; insertedToolCalls: number }> {
  if (testPort !== undefined) {
    if (testPort.appendTurnWithToolCalls !== undefined) {
      return testPort.appendTurnWithToolCalls(args)
    }
    const { turnId } = await testPort.appendTurn(args)
    return { turnId, insertedToolCalls: args.toolCalls.length }
  }
  return callPublicSourceMutation(appendAnswerTurnWithToolCallsMutation, args)
}

export async function appendAnswerTurnWithThreadAndToolCalls(
  args: AppendAnswerTurnWithThreadAndToolCallsArgs,
): Promise<{ turnId: string; insertedToolCalls: number }> {
  const { title, ...appendArgs } = args
  if (testPort !== undefined) {
    if (testPort.appendTurnWithThreadAndToolCalls !== undefined) {
      return testPort.appendTurnWithThreadAndToolCalls(args)
    }
    await testPort.createThread({
      threadId: args.threadId,
      pseudonymousSessionId: args.pseudonymousSessionId,
      title,
    })
    if (testPort.appendTurnWithToolCalls !== undefined) {
      return testPort.appendTurnWithToolCalls(appendArgs)
    }
    const { turnId } = await testPort.appendTurn(appendArgs)
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

export async function listSessionThreads(
  pseudonymousSessionId: string,
  limit = 20,
): Promise<ListSessionThreadsResult> {
  if (testPort !== undefined) {
    return testPort.listSessionThreads(pseudonymousSessionId, limit)
  }
  return callPublicSourceQuery(listSessionThreadsQuery, { pseudonymousSessionId, limit })
}

export async function getAnswerThread(threadId: string): Promise<AnswerThreadWithTurnCount | null> {
  if (testPort !== undefined) {
    if (testPort.getAnswerThread === undefined) {
      return null
    }
    return testPort.getAnswerThread(threadId)
  }
  return callPublicSourceQuery(getAnswerThreadQuery, { threadId })
}

export async function getAnswerThreadWithTurns(threadId: string): Promise<AnswerThreadWithTurns | null> {
  if (testPort !== undefined) {
    const thread = await (testPort.getAnswerThread?.(threadId) ?? Promise.resolve(null))
    const turns = await testPort.getThreadTurns(threadId).catch(() => ({ turns: [] as readonly AnswerTurnRecord[] }))
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
  if (testPort !== undefined) {
    return testPort.getPublicThreadProjection(threadId)
  }
  return callPublicSourceQuery(getPublicThreadProjectionQuery, { threadId })
}

export async function getThreadTurns(threadId: string): Promise<{ turns: readonly AnswerTurnRecord[] }> {
  if (testPort !== undefined) {
    return testPort.getThreadTurns(threadId)
  }
  return callPublicSourceQuery(getThreadTurnsQuery, { threadId })
}

export async function deleteAnswerThread(args: DeleteAnswerThreadArgs): Promise<{ threadId: string }> {
  if (testPort?.deleteThread !== undefined) {
    return testPort.deleteThread(args)
  }
  return callPublicSourceMutation(deleteAnswerThreadMutation, args)
}

function isMissingConvexFunction(error: unknown, functionName: string): boolean {
  const text = error instanceof Error ? `${error.message}\n${String(error.cause ?? '')}` : String(error)
  return text.includes('Could not find public function') && text.includes(functionName)
}

function markOptimizedAnswerThreadFunctionsMissing(): void {
  missingConvexFunctions.add('answerThreads:appendAnswerTurnWithThreadAndToolCalls')
  missingConvexFunctions.add('answerThreads:getAnswerThreadWithTurns')
}
