import { listUIMessages } from '@convex-dev/agent'

import { isRecord } from '@/modules/common/is-record'
import { projectToolCard, serializeToolCard } from '@/modules/chat/tool-card'
import type { PublicSharedMessage, PublicSharedPart, PublicToolCard } from './contracts'

const MAX_PUBLIC_TEXT_CHARS = 8_000
const MAX_PUBLIC_SUMMARY_CHARS = 240

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

export function projectPublicMessage(message: Awaited<ReturnType<typeof listUIMessages>>['page'][number]): PublicSharedMessage | null {
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
