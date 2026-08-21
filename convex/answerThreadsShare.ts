import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { MutationCtx } from './_generated/server'

import type { SourceWriteArgs } from './sourceWriteAdmission'
import {
  mintAnswerThreadShareToken,
  planAnswerThreadTurnDeletion,
  resolveAnswerThreadShareKeyring,
  answerThreadShareAccessId,
  answerThreadShareVerifier,
} from '../src/modules/answer-thread/convex'
import { requireAnswerThreadSourceWrite } from './answerThreadsReserve'

const ANSWER_THREAD_DELETE_BATCH_SIZE = 100

export type IssueAnswerThreadShareHandlerArgs = SourceWriteArgs & {
  threadId: string
  pseudonymousSessionId: string
}

export type RevokeAnswerThreadShareHandlerArgs = SourceWriteArgs & {
  threadId: string
  pseudonymousSessionId: string
}

export type DeleteAnswerThreadHandlerArgs = SourceWriteArgs & {
  threadId: string
  pseudonymousSessionId: string
}

export const issueAnswerThreadShareResult = v.object({
  threadId: v.string(),
  shareToken: v.string(),
})

export const revokeAnswerThreadShareResult = v.object({
  threadId: v.string(),
  revoked: v.boolean(),
})

export async function issueAnswerThreadShareHandler(
  ctx: MutationCtx,
  args: IssueAnswerThreadShareHandlerArgs,
) {
  await requireAnswerThreadSourceWrite(ctx, args)
  const thread = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
    .unique()
  if (thread === null) {
    throw new Error('thread_not_found')
  }
  if (thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
    throw new Error('thread_forbidden')
  }

  const keyring = resolveAnswerThreadShareKeyring(process.env)
  const existing = await ctx.db
    .query('answerThreadShares')
    .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
    .unique()
  const generation = existing === null
    ? 1
    : existing.status === 'revoked'
      ? existing.generation + 1
      : existing.generation
  const shareToken = mintAnswerThreadShareToken(
    { threadId: args.threadId, generation, keyId: keyring.keyId },
    keyring,
  )
  const share = {
    threadId: args.threadId,
    accessId: answerThreadShareAccessId(shareToken),
    generation,
    verifier: answerThreadShareVerifier(shareToken, keyring.secret),
    keyId: keyring.keyId,
    status: 'active' as const,
    createdAt: existing?.createdAt ?? Date.now(),
  }
  if (existing === null) {
    await ctx.db.insert('answerThreadShares', share)
  } else {
    await ctx.db.replace(existing._id, share)
  }
  return { threadId: args.threadId, shareToken }
}

export async function revokeAnswerThreadShareHandler(
  ctx: MutationCtx,
  args: RevokeAnswerThreadShareHandlerArgs,
) {
  await requireAnswerThreadSourceWrite(ctx, args)
  const thread = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
    .unique()
  if (thread === null) {
    throw new Error('thread_not_found')
  }
  if (thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
    throw new Error('thread_forbidden')
  }

  const existing = await ctx.db
    .query('answerThreadShares')
    .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
    .unique()
  if (existing === null || existing.status === 'revoked') {
    return { threadId: args.threadId, revoked: false }
  }
  await ctx.db.patch(existing._id, { status: 'revoked', revokedAt: Date.now() })
  return { threadId: args.threadId, revoked: true }
}

async function deleteAnswerThreadBatch(ctx: MutationCtx, threadId: string): Promise<void> {
  const [turns, reservations] = await Promise.all([
    ctx.db
      .query('answerTurns')
      .withIndex('by_thread_seq', (q) => q.eq('threadId', threadId))
      .order('asc')
      .take(ANSWER_THREAD_DELETE_BATCH_SIZE),
    ctx.db
      .query('answerTurnReservations')
      .withIndex('by_thread_seq', (q) => q.eq('threadId', threadId))
      .order('asc')
      .take(ANSWER_THREAD_DELETE_BATCH_SIZE),
  ])
  let remainingWrites = ANSWER_THREAD_DELETE_BATCH_SIZE
  let hasMoreChildren =
    turns.length === ANSWER_THREAD_DELETE_BATCH_SIZE ||
    reservations.length === ANSWER_THREAD_DELETE_BATCH_SIZE

  for (const turn of turns) {
    if (remainingWrites === 0) {
      hasMoreChildren = true
      break
    }

    const toolCalls = await ctx.db
      .query('answerToolCalls')
      .withIndex('by_turn_seq', (q) => q.eq('turnId', turn.turnId))
      .order('asc')
      .take(remainingWrites)
    const deletion = planAnswerThreadTurnDeletion({
      remainingWrites,
      toolCallCount: toolCalls.length,
      hasMoreChildren,
    })
    for (const toolCall of toolCalls) {
      await ctx.db.delete(toolCall._id)
    }
    remainingWrites = deletion.remainingWrites
    hasMoreChildren = deletion.hasMoreChildren
    if (!deletion.deleteTurn) {
      break
    }
    await ctx.db.delete(turn._id)
  }

  if (remainingWrites > 0) {
    for (const reservation of reservations) {
      if (remainingWrites === 0) {
        hasMoreChildren = true
        break
      }
      await ctx.db.delete(reservation._id)
      remainingWrites -= 1
    }
  }

  if (!hasMoreChildren) {
    return
  }

  await ctx.scheduler.runAfter(0, internal.answerThreads.continueDeleteAnswerThread, { threadId })
}

export async function continueDeleteAnswerThreadHandler(
  ctx: MutationCtx,
  args: { threadId: string },
): Promise<void> {
  await deleteAnswerThreadBatch(ctx, args.threadId)
}

export async function deleteAnswerThreadHandler(ctx: MutationCtx, args: DeleteAnswerThreadHandlerArgs) {
  await requireAnswerThreadSourceWrite(ctx, args)
  const thread = await ctx.db
    .query('answerThreads')
    .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
    .unique()

  if (thread === null) {
    throw new Error('thread_not_found')
  }

  if (thread.pseudonymousSessionId !== args.pseudonymousSessionId) {
    throw new Error('thread_forbidden')
  }
  const share = await ctx.db
    .query('answerThreadShares')
    .withIndex('by_threadId', (q) => q.eq('threadId', args.threadId))
    .unique()
  if (share !== null) {
    await ctx.db.delete(share._id)
  }

  await ctx.db.delete(thread._id)
  await deleteAnswerThreadBatch(ctx, args.threadId)
  return { threadId: args.threadId }
}
