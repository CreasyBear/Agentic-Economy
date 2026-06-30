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

export type AnswerThreadWithTurnCount = AnswerThreadRecord & {
  turnCount: number
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

export const listSessionThreadsQuery = sourceQuery<
  { pseudonymousSessionId: string; limit?: number },
  ListSessionThreadsResult
>('answerThreads:listSessionThreads')

export const getAnswerThreadQuery = sourceQuery<{ threadId: string }, AnswerThreadWithTurnCount | null>(
  'answerThreads:getAnswerThread',
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
  listSessionThreads(pseudonymousSessionId: string, limit?: number): Promise<ListSessionThreadsResult>
  getPublicThreadProjection(threadId: string): Promise<PublicThreadProjection | null>
  getThreadTurns(threadId: string): Promise<{ turns: readonly AnswerTurnRecord[] }>
  getAnswerThread?(threadId: string): Promise<AnswerThreadWithTurnCount | null>
}

let testPort: AnswerThreadPort | undefined

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
