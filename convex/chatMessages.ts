import {
  createThread as createAgentThread,
  listUIMessages,
  saveMessage,
  syncStreams,
  updateThreadMetadata,
  vStreamArgs,
} from '@convex-dev/agent'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { components, internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import type { MutationCtx } from './_generated/server'
import type { InteractiveBusinessAuthorityContext } from '../src/modules/business/public'
import { assertAdmission } from './lib/rateLimit'
import {
  isChatThreadBusy,
  normalizeChatThreadTitle,
  requireChatOwner,
  requireOwnedChatThread,
} from './chatThreads'
import {
  interactiveAuthorityContextValue,
  resolveScheduledInteractiveAuthorityContext,
} from './interactiveAuthority'

const MAX_PROMPT_LENGTH = 2_000
const MAX_MESSAGE_PAGE_SIZE = 50
const DEFAULT_CHAT_TITLE = 'New conversation'

function normalizePrompt(prompt: string): string {
  return prompt.trim().replace(/\s+/gu, ' ')
}

function validatePaginationOpts(
  value: typeof paginationOptsValidator.type,
): typeof paginationOptsValidator.type {
  if (
    !Number.isInteger(value.numItems)
    || value.numItems < 0
    || value.numItems > MAX_MESSAGE_PAGE_SIZE
  ) {
    throw new Error('chat_message_page_size_invalid')
  }
  return value
}

async function createOwnedThread(
  ctx: MutationCtx,
  ownerId: string,
  now: number,
): Promise<Doc<'chatThreads'>> {
  const threadId = await createAgentThread(ctx, components.agent, {
    userId: ownerId,
    title: DEFAULT_CHAT_TITLE,
  })
  const rowId = await ctx.db.insert('chatThreads', {
    threadId,
    ownerId,
    title: DEFAULT_CHAT_TITLE,
    updatedAt: now,
  })
  const row = await ctx.db.get(rowId)
  if (row === null) throw new Error('chat_thread_create_failed')
  return row
}

export const sendMessage = mutation({
  args: {
    threadId: v.optional(v.string()),
    prompt: v.string(),
  },
  returns: v.object({
    threadId: v.string(),
    promptMessageId: v.string(),
  }),
  handler: async (ctx, args) => {
    const actor = await requireChatOwner(ctx)
    const ownerId = actor.canonicalAccountRef
    const authority: InteractiveBusinessAuthorityContext = Object.freeze({
      principalRef: actor.canonicalPrincipalRef,
      accountRef: actor.canonicalAccountRef,
      legacyOwnerId: actor.legacyOwnerId,
      legacyOwnerLocator: actor.clerkUserId,
      revision: actor.authorityRevision,
      provenance: actor.authorityProvenance,
    })
    const prompt = normalizePrompt(args.prompt)
    if (prompt.length === 0 || Array.from(prompt).length > MAX_PROMPT_LENGTH) {
      throw new Error('invalid_input')
    }

    const admission = await assertAdmission(ctx, {
      name: 'chat-submit',
      key: ownerId,
    })
    if (!admission.ok) throw new Error('rate_limited')

    const now = Date.now()
    let row = args.threadId === undefined
      ? await createOwnedThread(ctx, ownerId, now)
      : await requireOwnedChatThread(ctx, args.threadId)

    if (isChatThreadBusy(row, now)) throw new Error('thread_busy')
    if (row.activePromptMessageId !== undefined || row.activeStartedAt !== undefined) {
      await ctx.db.patch(row._id, {
        activePromptMessageId: undefined,
        activeStartedAt: undefined,
      })
      const {
        activePromptMessageId: _activePromptMessageId,
        activeStartedAt: _activeStartedAt,
        ...clearedRow
      } = row
      row = clearedRow
    }

    const { messageId: promptMessageId } = await saveMessage(ctx, components.agent, {
      threadId: row.threadId,
      userId: ownerId,
      prompt,
    })

    const title = row.title === DEFAULT_CHAT_TITLE
      ? normalizeChatThreadTitle(prompt)
      : row.title
    if (title !== row.title) {
      await updateThreadMetadata(ctx, components.agent, {
        threadId: row.threadId,
        patch: { title },
      })
    }
    await ctx.db.patch(row._id, {
      title,
      activePromptMessageId: promptMessageId,
      activeStartedAt: now,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.chatGenerate.generate, {
      threadId: row.threadId,
      promptMessageId,
      authority,
    })
    return { threadId: row.threadId, promptMessageId }
  },
})

export const clearActiveGeneration = internalMutation({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query('chatThreads')
      .withIndex('by_threadId', (index) => index.eq('threadId', args.threadId))
      .unique()
    if (row === null || row.activePromptMessageId !== args.promptMessageId) {
      return false
    }
    await ctx.db.patch(row._id, {
      activePromptMessageId: undefined,
      activeStartedAt: undefined,
      updatedAt: Date.now(),
    })
    return true
  },
})

export const authorizeScheduledGeneration = internalQuery({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    authority: interactiveAuthorityContextValue,
  },
  returns: v.union(v.object({ ownerId: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const current = await resolveScheduledInteractiveAuthorityContext(ctx.db, args.authority)
    if (current === null) return null
    const row = await ctx.db.query('chatThreads')
      .withIndex('by_threadId', (index) => index.eq('threadId', args.threadId))
      .unique()
    if (row === null
      || row.ownerId !== current.accountRef
      || row.activePromptMessageId !== args.promptMessageId) return null
    return { ownerId: current.accountRef }
  },
})

export const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    await requireOwnedChatThread(ctx, args.threadId)
    const paginationOpts = validatePaginationOpts(args.paginationOpts)
    const [messages, streams] = await Promise.all([
      listUIMessages(ctx, components.agent, {
        threadId: args.threadId,
        paginationOpts,
      }),
      syncStreams(ctx, components.agent, {
        threadId: args.threadId,
        streamArgs: args.streamArgs,
      }),
    ])
    return { ...messages, streams }
  },
})
