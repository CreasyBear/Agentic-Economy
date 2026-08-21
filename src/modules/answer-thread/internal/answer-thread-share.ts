import {
  callPublicSourceMutation,
  callPublicSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'
import type { PublicThreadProjection } from '../answer-thread.schema'
import { mintAnswerThreadShareToken } from './share-token'
import { buildPublicThreadProjection } from './public-projection'
import {
  activeAnswerThreadPort,
  decodePublicThreadProjection,
  withAnswerThreadSourceWrite,
  type AnswerThreadSourceWriteMutationArgs,
  type AnswerThreadSourceWriteRequestArgs,
  type LocalE2eAnswerThreadState,
} from './answer-thread-reads'

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

export const issueAnswerThreadShareMutation = sourceMutation<
  IssueAnswerThreadShareMutationArgs,
  IssueAnswerThreadShareResult
>('answerThreads:issueAnswerThreadShare')

export const revokeAnswerThreadShareMutation = sourceMutation<
  RevokeAnswerThreadShareMutationArgs,
  RevokeAnswerThreadShareResult
>('answerThreads:revokeAnswerThreadShare')

export const getSharedThreadProjectionQuery = sourceQuery<
  { shareToken: string },
  string | null
>('answerThreads:getSharedThreadProjection')

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

export function createLocalE2eShareHandlers(state: LocalE2eAnswerThreadState) {
  return {
    issueShare: async (args: IssueAnswerThreadShareArgs): Promise<IssueAnswerThreadShareResult> => {
      const thread = state.threads.get(args.threadId)
      if (thread === undefined) throw new Error('thread_not_found')
      if (thread.pseudonymousSessionId !== args.pseudonymousSessionId && !isLocalE2EAuthBypassEnabled()) {
        throw new Error('thread_forbidden')
      }
      const existing = state.shares.get(args.threadId)
      const generation = existing?.revoked === false ? existing.generation : (existing?.generation ?? 0) + 1
      const shareToken = mintAnswerThreadShareToken(
        { threadId: args.threadId, generation, keyId: state.localShareKeyring.keyId },
        state.localShareKeyring,
      )
      state.shares.set(args.threadId, { threadId: args.threadId, generation, shareToken, revoked: false })
      return { threadId: args.threadId, shareToken }
    },
    revokeShare: async (args: RevokeAnswerThreadShareArgs): Promise<RevokeAnswerThreadShareResult> => {
      const thread = state.threads.get(args.threadId)
      if (thread === undefined) throw new Error('thread_not_found')
      if (thread.pseudonymousSessionId !== args.pseudonymousSessionId && !isLocalE2EAuthBypassEnabled()) {
        throw new Error('thread_forbidden')
      }
      const existing = state.shares.get(args.threadId)
      if (existing === undefined || existing.revoked) return { threadId: args.threadId, revoked: false }
      state.shares.set(args.threadId, { ...existing, revoked: true })
      return { threadId: args.threadId, revoked: true }
    },
    getSharedThreadProjection: async (shareToken: string): Promise<PublicThreadProjection | null> => {
      const grant = [...state.shares.values()].find((candidate) => candidate.shareToken === shareToken && !candidate.revoked)
      if (grant === undefined) return null
      const thread = state.threads.get(grant.threadId)
      return thread === undefined ? null : buildPublicThreadProjection(thread, state.turnsForThread(grant.threadId))
    },
  }
}
