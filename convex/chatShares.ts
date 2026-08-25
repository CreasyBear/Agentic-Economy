import { listUIMessages } from '@convex-dev/agent'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { isPublicOperationRef } from '@/modules/capability-supply/public'
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
import { CHAT_TOOL_NAME_MAP, type ChatToolId } from './chatTools'

const MAX_MESSAGE_PAGE_SIZE = 50
const MAX_PUBLIC_TEXT_CHARS = 8_000
const MAX_PUBLIC_SUMMARY_CHARS = 240

const chatToolId = v.union(
  v.literal('registry.operations.search'),
  v.literal('registry.operations.detail'),
  v.literal('registry.operations.compare'),
  v.literal('registry.operations.inspectPlan'),
  v.literal('operation.execute'),
)

const publicTextPart = v.object({
  type: v.literal('text'),
  text: v.string(),
})

const publicOperationCardPart = v.object({
  type: v.literal('operation-card'),
  toolId: chatToolId,
  state: v.union(v.literal('complete'), v.literal('refused'), v.literal('error')),
  title: v.string(),
  operationRefs: v.array(v.string()),
  summary: v.string(),
})

const publicSharedMessage = v.object({
  id: v.string(),
  role: v.union(v.literal('user'), v.literal('assistant')),
  parts: v.array(v.union(publicTextPart, publicOperationCardPart)),
})

type PublicOperationCard = typeof publicOperationCardPart.type
type PublicSharedPart = typeof publicTextPart.type | PublicOperationCard
type PublicSharedMessage = typeof publicSharedMessage.type

const PUBLIC_TOOL_TITLES: Readonly<Record<ChatToolId, string>> = Object.freeze({
  'registry.operations.search': 'Search operations',
  'registry.operations.detail': 'Operation details',
  'registry.operations.compare': 'Compare operations',
  'registry.operations.inspectPlan': 'Inspect operation plan',
  'operation.execute': 'Execute operation',
})

const PUBLIC_REASON_LABELS: Readonly<Record<string, string>> = Object.freeze({
  source_unavailable: 'Source unavailable',
  source_capacity_exceeded: 'Source capacity exceeded',
  setup_required: 'Setup required',
  temporarily_unavailable: 'Temporarily unavailable',
  readiness_expired: 'Readiness expired',
  publisher_withdrew: 'Publisher withdrew the operation',
  under_review: 'Operation under review',
  updated_terms_require_review: 'Updated terms require review',
  not_supported_by_ae: 'Operation not supported',
  operation_not_found: 'Operation not found',
  operation_unavailable: 'Operation unavailable',
  mapping_unavailable: 'Mapping unavailable',
  mapping_incompatible: 'Mapping incompatible',
  mapping_cycle: 'Mapping cycle detected',
  operation_not_keyless: 'Operation requires credentials',
  operation_not_executable: 'Operation cannot be executed here',
  input_invalid: 'Input was refused',
  endpoint_invalid: 'Endpoint was refused',
  source_output_invalid: 'Source response was refused',
  result_too_large: 'Result was too large',
  tool_limit: 'Tool limit reached',
  execute_limit: 'Execution limit reached',
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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

function addPublicOperationRef(refs: string[], value: unknown): void {
  if (refs.length >= 4 || !isPublicOperationRef(value) || refs.includes(value)) return
  refs.push(value)
}

function collectPublicOperationRefs(output: Record<string, unknown>): string[] {
  const refs: string[] = []
  addPublicOperationRef(refs, output.operationRef)
  if (Array.isArray(output.operationRefs)) {
    for (const value of output.operationRefs) addPublicOperationRef(refs, value)
  }
  if (isRecord(output.operation)) addPublicOperationRef(refs, output.operation.operationRef)
  for (const field of ['items', 'operations'] as const) {
    const values = output[field]
    if (!Array.isArray(values)) continue
    for (const value of values) {
      if (isRecord(value)) addPublicOperationRef(refs, value.operationRef)
    }
  }
  return refs
}

function publicCount(output: Record<string, unknown>): number | null {
  if (typeof output.matchedCount === 'number' && Number.isSafeInteger(output.matchedCount)) {
    return Math.max(0, output.matchedCount)
  }
  for (const field of ['operationRefs', 'operations', 'items'] as const) {
    if (Array.isArray(output[field])) return output[field].length
  }
  return null
}

function projectSuccessfulToolOutput(
  toolId: ChatToolId,
  output: Record<string, unknown>,
): Pick<PublicOperationCard, 'state' | 'summary'> {
  const kind = typeof output.kind === 'string' ? output.kind : null
  if (kind === 'error') return { state: 'error', summary: 'Tool unavailable' }

  if (
    kind === 'refused'
    || kind === 'unavailable'
    || kind === 'chat_tool_refused'
  ) {
    const reason = typeof output.reason === 'string' ? PUBLIC_REASON_LABELS[output.reason] : undefined
    return {
      state: 'refused',
      summary: sanitizeSummary(reason ?? 'Request refused'),
    }
  }
  if (kind === 'not_found') return { state: 'refused', summary: 'Operation not found' }
  if (kind === 'no_candidates') return { state: 'refused', summary: 'No operations found' }

  if (kind === 'found') return { state: 'complete', summary: 'Operation found' }
  if (kind !== 'ok') return { state: 'error', summary: 'Tool unavailable' }

  const count = publicCount(output)
  if (toolId === 'registry.operations.search') {
    return { state: 'complete', summary: `${count ?? 0} operations found` }
  }
  if (toolId === 'registry.operations.compare') {
    return { state: 'complete', summary: `${count ?? 0} operations compared` }
  }
  if (toolId === 'registry.operations.inspectPlan') {
    return { state: 'complete', summary: `${count ?? 0} operations inspected` }
  }
  if (toolId === 'operation.execute') {
    const name = typeof output.name === 'string' ? sanitizeSummary(output.name) : ''
    return { state: 'complete', summary: name.length > 0 ? `Completed: ${name}` : 'Operation completed' }
  }
  return { state: 'complete', summary: 'Operation details available' }
}

function providerToolName(part: Record<string, unknown>): string | null {
  if (part.type === 'dynamic-tool') {
    return typeof part.toolName === 'string' ? part.toolName : null
  }
  return typeof part.type === 'string' && part.type.startsWith('tool-')
    ? part.type.slice('tool-'.length)
    : null
}

function completedToolOutput(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  if (value.type === 'json') return isRecord(value.value) ? value.value : null
  return value
}

function projectPublicToolPart(value: unknown): PublicOperationCard | null {
  if (!isRecord(value)) return null
  const providerName = providerToolName(value)
  const toolId = providerName === null
    ? undefined
    : CHAT_TOOL_NAME_MAP.providerToCanonical[providerName]
  if (toolId === undefined) return null

  const base = {
    type: 'operation-card' as const,
    toolId,
    title: PUBLIC_TOOL_TITLES[toolId],
    operationRefs: [] as string[],
  }
  if (value.state === 'output-denied') {
    return { ...base, state: 'refused', summary: 'Request refused' }
  }
  if (value.state === 'output-error') {
    return { ...base, state: 'error', summary: 'Tool unavailable' }
  }
  if (value.state !== 'output-available') return null
  const output = completedToolOutput(value.output)
  if (output === null) return { ...base, state: 'error', summary: 'Tool unavailable' }

  const projected = projectSuccessfulToolOutput(toolId, output)
  return {
    ...base,
    ...projected,
    operationRefs: collectPublicOperationRefs(output),
    summary: sanitizeSummary(projected.summary),
  }
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
  returns: paginationResultValidator(publicSharedMessage).extend({ title: v.string() }),
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
        const projected = projectPublicMessage(message)
        return projected === null ? [] : [projected]
      }),
    }
  },
})
