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
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { resolveBusinessActor } from './authz'
import type { BusinessActor } from '../src/modules/business/public'

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 50
export const MAX_CHAT_THREAD_TITLE_LENGTH = 80
export const ACTIVE_CHAT_GENERATION_MS = 10 * 60 * 1_000

const threadSummary = v.object({
  threadId: v.string(),
  title: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  busy: v.boolean(),
})

type ThreadContext = Pick<QueryCtx, 'auth' | 'db'>

export async function requireChatOwnerId(ctx: ThreadContext): Promise<string> {
  return (await requireChatOwner(ctx)).canonicalAccountRef
}

export async function requireChatOwner(
  ctx: ThreadContext,
): Promise<Extract<BusinessActor, { kind: 'authenticated_owner' }>> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    throw new Error('unauthenticated')
  }
  return actor
}

export async function requireOwnedChatThread(
  ctx: ThreadContext,
  threadId: string,
): Promise<Doc<'chatThreads'>> {
  const ownerId = await requireChatOwnerId(ctx)
  const row = await ctx.db
    .query('chatThreads')
    .withIndex('by_threadId', (index) => index.eq('threadId', threadId))
    .unique()
  if (row === null || row.ownerId !== ownerId) {
    throw new Error('thread_not_found')
  }
  return row
}

export function normalizeChatThreadTitle(title: string): string {
  return Array.from(title.trim().replace(/\s+/gu, ' '))
    .slice(0, MAX_CHAT_THREAD_TITLE_LENGTH)
    .join('')
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

export function isChatThreadBusy(row: Doc<'chatThreads'>, now: number): boolean {
  return row.activePromptMessageId !== undefined
    && row.activeStartedAt !== undefined
    && row.activeStartedAt > now - ACTIVE_CHAT_GENERATION_MS
}

function projectThread(row: Doc<'chatThreads'>, now: number) {
  return {
    threadId: row.threadId,
    title: row.title,
    createdAt: row._creationTime,
    updatedAt: row.updatedAt,
    busy: isChatThreadBusy(row, now),
  }
}

function paginationOpts(
  value: typeof paginationOptsValidator.type | undefined,
): typeof paginationOptsValidator.type {
  const resolved = value ?? { cursor: null, numItems: DEFAULT_PAGE_SIZE }
  if (
    !Number.isInteger(resolved.numItems)
    || resolved.numItems < 1
    || resolved.numItems > MAX_PAGE_SIZE
  ) {
    throw new Error('chat_thread_page_size_invalid')
  }
  return resolved
}

export const createThread = mutation({
  args: { title: v.optional(v.string()) },
  returns: threadSummary,
  handler: async (ctx, args) => {
    const ownerId = await requireChatOwnerId(ctx)
    const title = createTitle(args.title)
    const now = Date.now()
    const threadId = await createAgentThread(ctx, components.agent, {
      userId: ownerId,
      title,
    })
    const rowId = await ctx.db.insert('chatThreads', {
      threadId,
      ownerId,
      title,
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
    paginationOpts: v.optional(paginationOptsValidator),
    now: v.number(),
  },
  returns: paginationResultValidator(threadSummary),
  handler: async (ctx, args) => {
    const ownerId = await requireChatOwnerId(ctx)
    const page = await ctx.db
      .query('chatThreads')
      .withIndex('by_ownerId_and_updatedAt', (index) => index.eq('ownerId', ownerId))
      .order('desc')
      .paginate(paginationOpts(args.paginationOpts))
    return {
      ...page,
      page: page.page.map((row) => projectThread(row, args.now)),
    }
  },
})

export const searchThreads = query({
  args: {
    query: v.string(),
    paginationOpts: v.optional(paginationOptsValidator),
    now: v.number(),
  },
  returns: paginationResultValidator(threadSummary),
  handler: async (ctx, args) => {
    const ownerId = await requireChatOwnerId(ctx)
    const search = normalizeChatThreadTitle(args.query)
    if (search.length === 0) {
      const page = await ctx.db
        .query('chatThreads')
        .withIndex('by_ownerId_and_updatedAt', (index) => index.eq('ownerId', ownerId))
        .order('desc')
        .paginate(paginationOpts(args.paginationOpts))
      return {
        ...page,
        page: page.page.map((row) => projectThread(row, args.now)),
      }
    }
    const page = await ctx.db
      .query('chatThreads')
      .withSearchIndex('search_title_by_ownerId', (index) =>
        index.search('title', search).eq('ownerId', ownerId))
      .paginate(paginationOpts(args.paginationOpts))
    return {
      ...page,
      page: page.page.map((row) => projectThread(row, args.now)),
    }
  },
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
    await ctx.db.patch(row._id, { title, updatedAt: now })
    return projectThread({ ...row, title, updatedAt: now }, now)
  },
})

async function deleteShares(ctx: MutationCtx, threadId: string): Promise<void> {
  for await (const share of ctx.db
    .query('chatThreadShares')
    .withIndex('by_threadId', (index) => index.eq('threadId', threadId))) {
    await ctx.db.delete(share._id)
  }
}

export const deleteThread = mutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await requireOwnedChatThread(ctx, args.threadId)
    if (isChatThreadBusy(row, Date.now())) throw new Error('thread_busy')

    await deleteShares(ctx, row.threadId)
    await ctx.db.delete(row._id)
    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId: row.threadId,
    })
    return null
  },
})
