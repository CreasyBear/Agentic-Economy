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
  projectOperationCard,
  serializeOperationCard,
} from '@/modules/chat/tool-card'

import { components } from './_generated/api'
import { env, mutation, query } from './_generated/server'
import { requireOwnedChatThread } from './chatThreads'

const MAX_MESSAGE_PAGE_SIZE = 50
const MAX_PUBLIC_TEXT_CHARS = 8_000
const MAX_PUBLIC_SUMMARY_CHARS = 240

const chatToolId = v.union(
  v.literal('registry.operations.search'),
  v.literal('registry.operations.detail'),
  v.literal('registry.operations.compare'),
  v.literal('registry.operations.inspectPlan'),
  v.literal('operation.invoke'),
)

const publicTextPart = v.object({
  type: v.literal('text'),
  text: v.string(),
})

const publicChoiceRow = v.object({
  operationRef: v.string(),
  title: v.string(),
  supplier: v.optional(v.string()),
  price: v.optional(v.string()),
  readiness: v.optional(v.string()),
  access: v.optional(v.string()),
})

const publicFact = v.object({
  label: v.string(),
  value: v.string(),
})

const publicCardChrome = {
  type: v.literal('operation-card'),
  toolId: chatToolId,
  title: v.string(),
}

const publicOperationCardPart = v.union(
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
    operationRefs: v.array(v.string()),
    choices: v.array(publicChoiceRow),
    count: v.optional(v.number()),
    contrasts: v.optional(v.array(publicFact)),
  }),
  v.object({
    ...publicCardChrome,
    kind: v.literal('inspect'),
    state: v.literal('complete'),
    operationRefs: v.array(v.string()),
    facts: v.array(publicFact),
  }),
  v.object({
    ...publicCardChrome,
    kind: v.literal('execute'),
    state: v.literal('complete'),
    operationRefs: v.array(v.string()),
    name: v.optional(v.string()),
  }),
)

const publicSharedMessage = v.object({
  id: v.string(),
  role: v.union(v.literal('user'), v.literal('assistant')),
  parts: v.array(v.union(publicTextPart, publicOperationCardPart)),
})

type PublicOperationCard = typeof publicOperationCardPart.type
type PublicSharedPart = typeof publicTextPart.type | PublicOperationCard
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

function sanitizeStoredCard(stored: Record<string, unknown>): PublicOperationCard | null {
  const title = typeof stored.title === 'string' ? sanitizeSummary(stored.title) : ''
  if (stored.kind === 'status') {
    return {
      type: 'operation-card',
      kind: 'status',
      toolId: stored.toolId as PublicOperationCard['toolId'],
      title,
      state: stored.state === 'refused' ? 'refused' : 'error',
      summary: typeof stored.summary === 'string' ? sanitizeSummary(stored.summary) : 'Tool unavailable',
    }
  }
  const operationRefs = Array.isArray(stored.operationRefs)
    ? stored.operationRefs.filter((value): value is string => typeof value === 'string')
    : []
  if (stored.kind === 'choices') {
    const choices = Array.isArray(stored.choices)
      ? stored.choices.flatMap((value) => {
          if (!isRecord(value) || typeof value.operationRef !== 'string' || typeof value.title !== 'string') return []
          return [{
            operationRef: value.operationRef,
            title: sanitizeSummary(value.title),
            ...(typeof value.supplier === 'string' ? { supplier: sanitizeSummary(value.supplier) } : {}),
            ...(typeof value.price === 'string' ? { price: sanitizeSummary(value.price) } : {}),
            ...(typeof value.readiness === 'string' ? { readiness: sanitizeSummary(value.readiness) } : {}),
            ...(typeof value.access === 'string' ? { access: sanitizeSummary(value.access) } : {}),
          }]
        })
      : []
    const contrasts = sanitizeFacts(stored.contrasts)
    return {
      type: 'operation-card',
      kind: 'choices',
      toolId: stored.toolId as PublicOperationCard['toolId'],
      title,
      state: 'complete',
      operationRefs,
      choices,
      ...(typeof stored.count === 'number' ? { count: stored.count } : {}),
      ...(contrasts.length === 0 ? {} : { contrasts }),
    }
  }
  if (stored.kind === 'inspect') {
    const facts = sanitizeFacts(stored.facts)
    return {
      type: 'operation-card',
      kind: 'inspect',
      toolId: stored.toolId as PublicOperationCard['toolId'],
      title,
      state: 'complete',
      operationRefs,
      facts,
    }
  }
  if (stored.kind === 'execute') {
    return {
      type: 'operation-card',
      kind: 'execute',
      toolId: stored.toolId as PublicOperationCard['toolId'],
      title,
      state: 'complete',
      operationRefs,
      ...(typeof stored.name === 'string' ? { name: sanitizeSummary(stored.name) } : {}),
    }
  }
  return null
}

function projectPublicToolPart(value: unknown): PublicOperationCard | null {
  const card = projectOperationCard(value)
  if (card === null) return null
  const stored = serializeOperationCard(card)
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
    const operationCard = projectPublicToolPart(part)
    if (operationCard !== null) parts.push(operationCard)
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
