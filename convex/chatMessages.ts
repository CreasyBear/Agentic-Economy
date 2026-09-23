import {
  listUIMessages,
  syncStreams,
  vPaginationResult,
  vStreamArgs,
} from '@convex-dev/agent'
import { vStreamDelta, vStreamMessage } from '@convex-dev/agent/validators'
import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { components } from './_generated/api'
import { internalMutation, internalQuery, mutation, query } from './_generated/server'
import { normalizedTurnPrompt, reserveAndStartTurn } from './lib/chat/turnHandlers'
import { requireChatOwner, requireOwnedChatThread } from './chatThreads'
import { chatThreadBelongsToPrincipal } from './lib/chat/threadOwnership'
import {
  interactiveAuthorityContextValue,
  resolveScheduledInteractiveAuthorityContext,
} from './interactiveAuthority'

const MAX_MESSAGE_PAGE_SIZE = 50

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
    const prompt = normalizedTurnPrompt(args.prompt)

    const turn = await reserveAndStartTurn(ctx, {
      actor: {
        kind: 'clerk_owner', principalRef: actor.canonicalPrincipalRef,
        accountRef: ownerId,
        authority: {
          principalRef: actor.canonicalPrincipalRef,
          accountRef: actor.canonicalAccountRef,
          revision: actor.authorityRevision,
          provenance: actor.authorityProvenance,
        },
      },
      threadId: args.threadId, prompt, clientTurnId: crypto.randomUUID(),
    })
    return { threadId: turn.threadId, promptMessageId: turn.promptMessageId }
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
      || !chatThreadBelongsToPrincipal(row, current.accountRef, 'clerk_owner', current.principalRef)
      || row.activePromptMessageId !== args.promptMessageId) return null
    return { ownerId: current.accountRef }
  },
})

// The Vercel AI SDK's UIMessage `parts` union is deeply nested and vendor-owned,
// and evolves with the SDK, so its element shape stays a runtime-validated
// boundary here (the package's own validators take the same approach for
// equally deep AI SDK content, e.g. `vStreamDelta`'s parts field); everything
// else the client actually depends on is validated precisely below.
const chatUIMessageValue = v.object({
  id: v.string(),
  key: v.string(),
  role: v.union(v.literal('system'), v.literal('user'), v.literal('assistant')),
  order: v.number(),
  stepOrder: v.number(),
  status: v.union(v.literal('streaming'), v.literal('pending'), v.literal('success'), v.literal('failed')),
  text: v.string(),
  _creationTime: v.number(),
  agentName: v.optional(v.string()),
  userId: v.optional(v.string()),
  metadata: v.optional(v.any()), // runtime-validated AI SDK UIMessage boundary
  parts: v.array(v.any()), // runtime-validated AI SDK UIMessage boundary
})

// `useUIMessages`'s `StreamQuery` type constraint requires a *required*
// `streams` field typed exactly as `syncStreams`'s return value, so this
// stays a required union (never `v.optional`) and the handler normalizes
// `syncStreams`'s `undefined` ("no streamArgs supplied") to an empty list.
const chatStreamsValue = v.union(
  v.object({ kind: v.literal('list'), messages: v.array(vStreamMessage) }),
  v.object({ kind: v.literal('deltas'), deltas: v.array(vStreamDelta) }),
)

export const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  returns: vPaginationResult(chatUIMessageValue).extend({
    streams: chatStreamsValue,
  }),
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
    return { ...messages, streams: streams ?? { kind: 'list' as const, messages: [] } }
  },
})
