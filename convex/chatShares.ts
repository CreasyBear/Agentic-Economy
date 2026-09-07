import { listUIMessages } from '@convex-dev/agent'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { isRecord } from '@/modules/common/is-record'
import {
  CHAT_THREAD_SHARE_TOKEN_PATTERN,
  chatThreadShareAccessId,
  chatThreadShareVerifier,
  mintChatThreadShareToken,
  resolveChatThreadShareKeyring,
  verifyChatThreadShare,
} from '@/modules/chat-sharing/share-token'
import {
  findChatThreadShareByAccessId,
  findChatThreadShareByThread,
  writeChatThreadShare,
} from '@/modules/chat-sharing/convex'
import {
  projectToolCard,
  serializeToolCard,
} from '@/modules/chat/tool-card'

import { components } from './_generated/api'
import { env, mutation, query } from './_generated/server'
import { requireOwnedChatThread } from './chatThreads'

const MAX_MESSAGE_PAGE_SIZE = 50
const MAX_PUBLIC_TEXT_CHARS = 8_000
const MAX_PUBLIC_SUMMARY_CHARS = 240

const chatToolId = v.union(
  v.literal('registry.tools.list'),
  v.literal('registry.tools.search'),
  v.literal('registry.tools.describe'),
  v.literal('registry.tools.compare'),
  v.literal('tool.quote'),
  v.literal('tool.call'),
)

const publicTextPart = v.object({
  type: v.literal('text'),
  text: v.string(),
})

const publicChoiceRow = v.object({
  toolRef: v.string(),
  title: v.string(),
  provider: v.optional(v.string()),
  price: v.optional(v.string()),
  readiness: v.optional(v.string()),
  access: v.optional(v.string()),
})

const publicFact = v.object({
  label: v.string(),
  value: v.string(),
})

const publicCardChrome = {
  type: v.literal('tool-card'),
  toolId: chatToolId,
  title: v.string(),
}

const publicToolCardPart = v.union(
  v.object({
    ...publicCardChrome,
    kind: v.literal('status'),
    state: v.union(v.literal('refused'), v.literal('error')),
    summary: v.string(),
  }),
  v.object({
    ...publicCardChrome,
    kind: v.literal('choices'),
    state: v.literal('complete'),
    toolRefs: v.array(v.string()),
    choices: v.array(publicChoiceRow),
    count: v.optional(v.number()),
    contrasts: v.optional(v.array(publicFact)),
  }),
  v.object({
    ...publicCardChrome,
    kind: v.literal('inspect'),
    state: v.literal('complete'),
    toolRefs: v.array(v.string()),
    facts: v.array(publicFact),
  }),
  v.object({
    ...publicCardChrome,
    kind: v.literal('execute'),
    state: v.union(
      v.literal('completed'),
      v.literal('pending'),
      v.literal('needs_authority'),
      v.literal('reconciliation_required'),
      v.literal('refused'),
    ),
    toolRefs: v.array(v.string()),
    name: v.optional(v.string()),
    callRef: v.optional(v.string()),
    outputPreview: v.optional(v.string()),
    outputTruncated: v.optional(v.boolean()),
    facts: v.array(publicFact),
    receiptRef: v.optional(v.string()),
    evidenceHash: v.optional(v.string()),
    summary: v.string(),
    nextAction: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
  }),
)

const publicSharedMessage = v.object({
  id: v.string(),
  role: v.union(v.literal('user'), v.literal('assistant')),
  parts: v.array(v.union(publicTextPart, publicToolCardPart)),
})

type PublicToolCard = typeof publicToolCardPart.type
type PublicSharedPart = typeof publicTextPart.type | PublicToolCard
type PublicSharedMessage = typeof publicSharedMessage.type

function boundUnicode(value: string, maximum: number): string {
  return Array.from(value).slice(0, maximum).join('')
}

function sanitizePublicString(value: string, maximum: number): string {
  return boundUnicode(value
    .replace(/<\s*\/?\s*(?:system|assistant|user|tool)\b[^>]*>/giu, '[data-tag]')
    .replace(/[<>]/gu, (character) => character === '<' ? '‹' : '›'), maximum)
}

function sanitizeSummary(value: string): string {
  return sanitizePublicString(value.replace(/\s+/gu, ' ').trim(), MAX_PUBLIC_SUMMARY_CHARS)
}

function sanitizeFacts(values: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(values)) return []
  return values.flatMap((value) => {
    if (!isRecord(value) || typeof value.label !== 'string' || typeof value.value !== 'string') return []
    return [{ label: sanitizeSummary(value.label), value: sanitizeSummary(value.value) }]
  })
}

function sanitizeStoredCard(stored: Record<string, unknown>): PublicToolCard | null {
  const title = typeof stored.title === 'string' ? sanitizeSummary(stored.title) : ''
  if (stored.kind === 'status') {
    return {
      type: 'tool-card',
      kind: 'status',
      toolId: stored.toolId as PublicToolCard['toolId'],
      title,
      state: stored.state === 'refused' ? 'refused' : 'error',
      summary: typeof stored.summary === 'string' ? sanitizeSummary(stored.summary) : 'Tool unavailable',
    }
  }
  const toolRefs = Array.isArray(stored.toolRefs)
    ? stored.toolRefs.filter((value): value is string => typeof value === 'string')
    : []
  if (stored.kind === 'choices') {
    const choices = Array.isArray(stored.choices)
      ? stored.choices.flatMap((value) => {
          if (!isRecord(value) || typeof value.toolRef !== 'string' || typeof value.title !== 'string') return []
          return [{
            toolRef: value.toolRef,
            title: sanitizeSummary(value.title),
            ...(typeof value.provider === 'string' ? { provider: sanitizeSummary(value.provider) } : {}),
            ...(typeof value.price === 'string' ? { price: sanitizeSummary(value.price) } : {}),
            ...(typeof value.readiness === 'string' ? { readiness: sanitizeSummary(value.readiness) } : {}),
            ...(typeof value.access === 'string' ? { access: sanitizeSummary(value.access) } : {}),
          }]
        })
      : []
    const contrasts = sanitizeFacts(stored.contrasts)
    return {
      type: 'tool-card',
      kind: 'choices',
      toolId: stored.toolId as PublicToolCard['toolId'],
      title,
      state: 'complete',
      toolRefs,
      choices,
      ...(typeof stored.count === 'number' ? { count: stored.count } : {}),
      ...(contrasts.length === 0 ? {} : { contrasts }),
    }
  }
  if (stored.kind === 'inspect') {
    const facts = sanitizeFacts(stored.facts)
    return {
      type: 'tool-card',
      kind: 'inspect',
      toolId: stored.toolId as PublicToolCard['toolId'],
      title,
      state: 'complete',
      toolRefs,
      facts,
    }
  }
  if (stored.kind === 'execute') {
    const state = stored.state === 'completed'
      || stored.state === 'pending'
      || stored.state === 'needs_authority'
      || stored.state === 'reconciliation_required'
      || stored.state === 'refused'
      ? stored.state
      : 'refused'
    return {
      type: 'tool-card',
      kind: 'execute',
      toolId: stored.toolId as PublicToolCard['toolId'],
      title,
      state,
      toolRefs,
      ...(typeof stored.name === 'string' ? { name: sanitizeSummary(stored.name) } : {}),
      ...(typeof stored.callRef === 'string'
        ? { callRef: sanitizeSummary(stored.callRef) }
        : {}),
      ...(typeof stored.outputPreview === 'string'
        ? { outputPreview: sanitizePublicString(stored.outputPreview, MAX_PUBLIC_TEXT_CHARS) }
        : {}),
      ...(stored.outputTruncated === true ? { outputTruncated: true } : {}),
      facts: sanitizeFacts(stored.facts),
      ...(typeof stored.receiptRef === 'string'
        ? { receiptRef: sanitizeSummary(stored.receiptRef) }
        : {}),
      ...(typeof stored.evidenceHash === 'string'
        ? { evidenceHash: sanitizeSummary(stored.evidenceHash) }
        : {}),
      summary: typeof stored.summary === 'string' ? sanitizeSummary(stored.summary) : 'Call result recorded.',
      ...(typeof stored.nextAction === 'string'
        ? { nextAction: sanitizeSummary(stored.nextAction) }
        : {}),
      ...(typeof stored.retryable === 'boolean' ? { retryable: stored.retryable } : {}),
    }
  }
  return null
}

function projectPublicToolPart(value: unknown): PublicToolCard | null {
  const card = projectToolCard(value)
  if (card === null) return null
  const stored = serializeToolCard(card)
  if (stored === null) return null
  return sanitizeStoredCard(stored)
}

function projectPublicMessage(message: Awaited<ReturnType<typeof listUIMessages>>['page'][number]): PublicSharedMessage | null {
  if (message.status === 'pending' || message.status === 'streaming') return null
  if (message.role !== 'user' && message.role !== 'assistant') return null

  const parts: PublicSharedPart[] = []
  for (const part of message.parts) {
    if (part.type === 'text') {
      parts.push({
        type: 'text',
        text: sanitizePublicString(part.text, MAX_PUBLIC_TEXT_CHARS),
      })
      continue
    }
    const toolCard = projectPublicToolPart(part)
    if (toolCard !== null) parts.push(toolCard)
  }
  if (parts.length === 0) return null
  return { id: message.id, role: message.role, parts }
}

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
    const existing = await findChatThreadShareByThread(ctx, thread.threadId)
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
    await writeChatThreadShare(ctx, share)
    return { threadId: thread.threadId, shareToken }
  },
})

export const revokeShare = mutation({
  args: { threadId: v.string() },
  returns: v.object({ threadId: v.string(), revoked: v.boolean() }),
  handler: async (ctx, args) => {
    const thread = await requireOwnedChatThread(ctx, args.threadId)
    const existing = await findChatThreadShareByThread(ctx, thread.threadId)
    if (existing === null || existing.status === 'revoked') {
      return { threadId: thread.threadId, revoked: false }
    }
    await writeChatThreadShare(ctx, {
      threadId: existing.threadId,
      accessId: existing.accessId,
      generation: existing.generation,
      verifier: existing.verifier,
      keyId: existing.keyId,
      status: 'revoked',
      createdAt: existing.createdAt,
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
    const existing = await findChatThreadShareByThread(ctx, thread.threadId)
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
  returns: paginationResultValidator(publicSharedMessage).extend({ title: v.string() }),
  handler: async (ctx, args) => {
    const shareToken = args.shareToken.trim()
    if (!CHAT_THREAD_SHARE_TOKEN_PATTERN.test(shareToken)) {
      throw new Error('shared_thread_not_found')
    }
    const grant = await findChatThreadShareByAccessId(
      ctx,
      chatThreadShareAccessId(shareToken),
    )
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
        const projected = projectPublicMessage(message)
        return projected === null ? [] : [projected]
      }),
    }
  },
})
