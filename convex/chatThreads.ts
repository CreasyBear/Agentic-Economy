import {
  createThread as createAgentThread,
  updateThreadMetadata,
} from '@convex-dev/agent'
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { components } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, mutation, query } from './_generated/server'
import type { QueryCtx } from './_generated/server'
import { requireChatOwner, isChatSignedOut, EMPTY_CHAT_PAGE } from './lib/chat/threads/listing'
import { deleteChatThreadShares } from '../src/modules/chat-sharing/convex'
import { chatThreadBelongsToPrincipal } from './lib/chat/threads/ownership'
import {
  isChatThreadBusy, listChatThreads, normalizeChatThreadTitle,
  resolveOwnerChatActor, projectThread, searchChatThreads,
  ACTIVE_CHAT_GENERATION_MS, MAX_CHAT_THREAD_TITLE_LENGTH,
} from './lib/chat/threads/listing'
export {
  isChatThreadBusy, normalizeChatThreadTitle, ACTIVE_CHAT_GENERATION_MS, MAX_CHAT_THREAD_TITLE_LENGTH,
}

const threadSummary = v.object({
  threadId: v.string(),
  title: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  busy: v.boolean(),
})

type ThreadContext = Pick<QueryCtx, 'auth' | 'db'>

export { requireChatOwner } from './lib/chat/threads/listing'

export async function requireOwnedChatThread(
  ctx: ThreadContext,
  threadId: string,
): Promise<Doc<'chatThreads'>> {
  const actor = await requireChatOwner(ctx)
  const row = await ctx.db.query('chatThreads')
    .withIndex('by_threadId', index => index.eq('threadId', threadId)).unique()
  if (row === null) throw new Error('thread_not_found')
  if (chatThreadBelongsToPrincipal(row, actor.canonicalAccountRef, 'clerk_owner', actor.canonicalPrincipalRef)) {
    return row
  }
  const ownerChat = await resolveOwnerChatActor(ctx)
  if (ownerChat === null
    || !chatThreadBelongsToPrincipal(row, actor.canonicalAccountRef, 'agent_key', ownerChat.principalRef)) {
    throw new Error('thread_not_found')
  }
  return row
}

function createTitle(title: string | undefined): string {
  const normalized = normalizeChatThreadTitle(title ?? '')
  return normalized.length === 0 ? 'New conversation' : normalized
}

function renameTitle(title: string): string {
  const normalized = normalizeChatThreadTitle(title)
  if (normalized.length === 0) throw new Error('thread_title_invalid')
  return normalized
}

export const createThread = internalMutation({
  args: { title: v.optional(v.string()) },
  returns: threadSummary,
  handler: async (ctx, args) => {
    const actor = await requireChatOwner(ctx)
    const ownerId = actor.canonicalAccountRef
    const title = createTitle(args.title)
    const now = Date.now()
    const threadId = await createAgentThread(ctx, components.agent, {
      userId: ownerId,
      title,
    })
    const rowId = await ctx.db.insert('chatThreads', {
      threadId,
      principalKind: 'clerk_owner',
      principalRef: actor.canonicalPrincipalRef,
      ownerId,
      title,
      titleUpdatedAt: now,
      updatedAt: now,
    })
    const row = await ctx.db.get(rowId)
    if (row === null) throw new Error('chat_thread_create_failed')
    return projectThread(row, now)
  },
})

export const getThread = query({
  args: { threadId: v.string(), now: v.number() },
  returns: threadSummary,
  handler: async (ctx, args) => projectThread(
    await requireOwnedChatThread(ctx, args.threadId),
    args.now,
  ),
})

export const listThreads = query({
  args: {
    paginationOpts: paginationOptsValidator,
    now: v.number(),
  },
  returns: paginationResultValidator(threadSummary),
  handler: async (ctx, args) => await isChatSignedOut(ctx)
    ? EMPTY_CHAT_PAGE
    : listChatThreads(ctx, await requireChatOwner(ctx), args),
})

export const searchThreads = query({
  args: {
    query: v.string(),
    paginationOpts: paginationOptsValidator,
    now: v.number(),
  },
  returns: paginationResultValidator(threadSummary),
  handler: async (ctx, args) => await isChatSignedOut(ctx)
    ? EMPTY_CHAT_PAGE
    : searchChatThreads(ctx, await requireChatOwner(ctx), args),
})

export const renameThread = mutation({
  args: { threadId: v.string(), title: v.string() },
  returns: threadSummary,
  handler: async (ctx, args) => {
    const row = await requireOwnedChatThread(ctx, args.threadId)
    const title = renameTitle(args.title)
    const now = Date.now()
    await updateThreadMetadata(ctx, components.agent, {
      threadId: row.threadId,
      patch: { title },
    })
    await ctx.db.patch(row._id, { title, titleUpdatedAt: now, updatedAt: now })
    return projectThread({ ...row, title, updatedAt: now }, now)
  },
})

export const deleteThread = mutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await requireOwnedChatThread(ctx, args.threadId)
    if (isChatThreadBusy(row, Date.now())) throw new Error('thread_busy')

    await deleteChatThreadShares(ctx, row.threadId)
    await ctx.db.delete(row._id)
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId: row.threadId,
    })
    return null
  },
})
