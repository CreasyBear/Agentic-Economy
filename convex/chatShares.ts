import { listUIMessages } from '@convex-dev/agent'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import {
  CHAT_THREAD_SHARE_TOKEN_PATTERN,
  chatThreadShareAccessId,
  chatThreadShareVerifier,
  mintChatThreadShareToken,
  resolveChatThreadShareKeyring,
  verifyChatThreadShare,
} from '@/modules/chat/share-token'

import { components } from './_generated/api'
import { env, mutation, query } from './_generated/server'
import { requireOwnedChatThread } from './chatThreads'

const MAX_MESSAGE_PAGE_SIZE = 50

function keyring() {
  return resolveChatThreadShareKeyring({
    AE_CHAT_SHARE_SECRET: env.AE_CHAT_SHARE_SECRET,
    AE_CHAT_SHARE_KEY_ID: env.AE_CHAT_SHARE_KEY_ID,
  })
}

function validatePaginationOpts(
  value: typeof paginationOptsValidator.type,
): typeof paginationOptsValidator.type {
  if (
    !Number.isInteger(value.numItems)
    || value.numItems < 1
    || value.numItems > MAX_MESSAGE_PAGE_SIZE
  ) {
    throw new Error('chat_message_page_size_invalid')
  }
  return value
}

export const issueShare = mutation({
  args: { threadId: v.string() },
  returns: v.object({ threadId: v.string(), shareToken: v.string() }),
  handler: async (ctx, args) => {
    const thread = await requireOwnedChatThread(ctx, args.threadId)
    const signingKey = keyring()
    const existing = await ctx.db
      .query('chatThreadShares')
      .withIndex('by_threadId', (index) => index.eq('threadId', thread.threadId))
      .unique()
    const generation = existing === null
      ? 1
      : existing.status === 'revoked'
        ? existing.generation + 1
        : existing.generation
    const shareToken = mintChatThreadShareToken({
      threadId: thread.threadId,
      generation,
      keyId: signingKey.keyId,
    }, signingKey)
    const now = Date.now()
    const share = {
      threadId: thread.threadId,
      accessId: chatThreadShareAccessId(shareToken),
      generation,
      verifier: chatThreadShareVerifier(shareToken, signingKey.secret),
      keyId: signingKey.keyId,
      status: 'active' as const,
      createdAt: existing?.status === 'active' ? existing.createdAt : now,
    }
    if (existing === null) {
      await ctx.db.insert('chatThreadShares', share)
    } else {
      await ctx.db.replace(existing._id, share)
    }
    return { threadId: thread.threadId, shareToken }
  },
})

export const revokeShare = mutation({
  args: { threadId: v.string() },
  returns: v.object({ threadId: v.string(), revoked: v.boolean() }),
  handler: async (ctx, args) => {
    const thread = await requireOwnedChatThread(ctx, args.threadId)
    const existing = await ctx.db
      .query('chatThreadShares')
      .withIndex('by_threadId', (index) => index.eq('threadId', thread.threadId))
      .unique()
    if (existing === null || existing.status === 'revoked') {
      return { threadId: thread.threadId, revoked: false }
    }
    await ctx.db.patch(existing._id, {
      status: 'revoked',
      revokedAt: Date.now(),
    })
    return { threadId: thread.threadId, revoked: true }
  },
})

export const getShareState = query({
  args: { threadId: v.string() },
  returns: v.object({
    threadId: v.string(),
    state: v.union(v.literal('none'), v.literal('active'), v.literal('revoked')),
  }),
  handler: async (ctx, args) => {
    const thread = await requireOwnedChatThread(ctx, args.threadId)
    const existing = await ctx.db
      .query('chatThreadShares')
      .withIndex('by_threadId', (index) => index.eq('threadId', thread.threadId))
      .unique()
    const state: 'none' | 'active' | 'revoked' = existing?.status ?? 'none'
    return {
      threadId: thread.threadId,
      state,
    }
  },
})

export const listSharedMessages = query({
  args: {
    shareToken: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const shareToken = args.shareToken.trim()
    if (!CHAT_THREAD_SHARE_TOKEN_PATTERN.test(shareToken)) {
      throw new Error('shared_thread_not_found')
    }
    const grant = await ctx.db
      .query('chatThreadShares')
      .withIndex('by_accessId', (index) =>
        index.eq('accessId', chatThreadShareAccessId(shareToken)))
      .unique()
    const signingKey = keyring()
    if (grant === null || !verifyChatThreadShare({
      grant,
      shareToken,
      keyring: signingKey,
    })) {
      throw new Error('shared_thread_not_found')
    }
    const thread = await ctx.db
      .query('chatThreads')
      .withIndex('by_threadId', (index) => index.eq('threadId', grant.threadId))
      .unique()
    if (thread === null) throw new Error('shared_thread_not_found')

    const messages = await listUIMessages(ctx, components.agent, {
      threadId: thread.threadId,
      paginationOpts: validatePaginationOpts(args.paginationOpts),
    })
    return {
      title: thread.title,
      ...messages,
      page: messages.page.flatMap((message) => {
        if (message.status === 'pending' || message.status === 'streaming') return []
        const { userId: _userId, ...publicMessage } = message
        return [publicMessage]
      }),
    }
  },
})
