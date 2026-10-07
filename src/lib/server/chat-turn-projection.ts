import type { UIMessageChunk } from 'ai'

import { degrade } from '@/lib/observability/degrade'
import { validateJourneyNext, type CallEvent } from '@/modules/actions/contract'
import { parseCallRef, parseQuoteRef, callResultSchema } from '@/modules/capability-execution/call-contracts'
import { toolQuoteResultSchema } from '@/modules/capability-execution/quote'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { formatExactAmount } from '@/modules/money/public'

const MAX_TOOL_OUTPUT_BYTES = 4 * 1024
const SECRET_FIELD = /token|key|secret|authorization|password/iu

function safeToolValue(value: unknown): unknown {
  const json = JSON.stringify(value, (key, entry) => key && SECRET_FIELD.test(key) ? undefined : entry)
  return json === undefined ? null : JSON.parse(json) as unknown
}

function boundedToolOutput(value: unknown, origin: string): unknown {
  const safe = safeToolValue(value)
  const structured = typeof safe === 'string' ? { text: safe } : safe
  if (new TextEncoder().encode(JSON.stringify(structured)).byteLength <= MAX_TOOL_OUTPUT_BYTES) return structured
  const record = typeof structured === 'object' && structured !== null && !Array.isArray(structured)
    ? structured as Record<string, unknown> : {}
  const choices = [
    ...(Array.isArray(record.results) ? record.results : []),
    ...(Array.isArray(record.tools) ? record.tools : []),
  ].slice(0, 10)
  const next = validateJourneyNext([
    ...(Array.isArray(record.next) ? record.next : []),
    ...choices.flatMap((choice) => {
      if (typeof choice !== 'object' || choice === null) return []
      const item = choice as Record<string, unknown>
      return [
        ...(Array.isArray(item.next) ? item.next : []),
        ...(typeof item.toolRef === 'string' ? [{ action: 'registry.tools.describe', args: { toolRef: item.toolRef }, authority: 'public' }] : []),
      ]
    }),
    ...(typeof record.callRef === 'string' ? [{ action: 'call.status', args: { callRef: record.callRef }, authority: 'same_principal' }] : []),
    ...(typeof record.quoteRef === 'string' ? [{ action: 'journey.status', args: { ref: { kind: 'quote', ref: record.quoteRef } }, authority: 'same_principal' }] : []),
    ...(typeof record.toolRef === 'string' ? [{ action: 'registry.tools.describe', args: { toolRef: record.toolRef }, authority: 'public' }] : []),
  ], { origin })
  const boundedNext = next.slice(0, 1)
  return { truncated: true, ...(boundedNext.length ? { next: boundedNext } : {}) }
}

export function projectedPart(part: unknown, toolNames: Map<string, string>, turn: Readonly<{ turnRef: string; threadId: string }>, correlationId: string, sequence: number, origin: string): readonly UIMessageChunk[] {
  if (typeof part !== 'object' || part === null || !('type' in part)) return []
  const chunk = part as Record<string, unknown>
  if (chunk.type === 'tool-input-available' && typeof chunk.toolCallId === 'string' && typeof chunk.toolName === 'string') {
    const tool = CHAT_TOOL_NAME_MAP.providerToCanonical[chunk.toolName]
    if (tool === undefined) return []
    toolNames.set(chunk.toolCallId, tool)
    return [{ type: 'tool-input-available', toolCallId: chunk.toolCallId, toolName: tool, input: safeToolValue(chunk.input) }]
  }
  if (chunk.type === 'tool-output-available' && typeof chunk.toolCallId === 'string') {
    const tool = toolNames.get(chunk.toolCallId)
    if (tool === undefined) return []
    const output = typeof chunk.output === 'string' ? (() => {
      try { return JSON.parse(chunk.output) as unknown } catch (cause) {
        return degrade(cause, chunk.output, { site: 'projectedPart', reason: 'invalid_response' })
      }
    })() : chunk.output
    const projected: UIMessageChunk[] = [{ type: 'tool-output-available', toolCallId: chunk.toolCallId, output: boundedToolOutput(output, origin) }]
    if (tool === 'tool.quote') {
      const quote = toolQuoteResultSchema.safeParse(output)
      if (quote.success && quote.data.kind === 'committed' && parseQuoteRef(quote.data.quoteRef).kind === 'valid') {
        const maxSpendAud = formatExactAmount(quote.data.price)
        if (maxSpendAud !== undefined && quote.data.price.currency === 'AUD') {
          projected.push({ type: 'data-ae-quote', data: { quoteRef: quote.data.quoteRef, maxSpendAud, expiresAt: quote.data.expiresAt } })
        }
      }
    }
    if (tool === 'tool.call') {
      const call = callResultSchema.safeParse(output)
      if (call.success && call.data.kind !== 'refused' && parseCallRef(call.data.callRef).kind === 'valid') {
        const receipt = 'receipt' in call.data ? call.data.receipt : undefined
        const state = call.data.kind === 'completed' ? 'completed' : call.data.kind === 'needs_authority' ? 'auth-required' : 'working'
        const payment = call.data.kind === 'reconciliation_required' ? 'outcome_unknown' : receipt === undefined ? call.data.kind === 'completed' ? 'not_requested' : 'pending' : receipt.state === 'settled' ? 'paid' : receipt.state === 'refunded' ? 'refunded' : 'outcome_unknown'
        const event: CallEvent = { kind: 'call', callRef: call.data.callRef as CallEvent['callRef'], contextId: turn.threadId as NonNullable<CallEvent['contextId']>, state, payment, ...(receipt === undefined ? {} : { receiptArtifactRef: receipt.receiptRef }), sequence, eventId: `${turn.turnRef}:call:${sequence}`, correlationId }
        projected.push({ type: 'data-ae-receipt', data: event })
      }
    }
    return projected
  }
  // Persisted model data is untrusted: do not forward arbitrary data parts or hidden reasoning.
  if ((chunk.type === 'text-start' || chunk.type === 'text-end') && typeof chunk.id === 'string') return [{ type: chunk.type, id: chunk.id }]
  if (chunk.type === 'text-delta' && typeof chunk.id === 'string' && typeof chunk.delta === 'string') return [{ type: 'text-delta', id: chunk.id, delta: chunk.delta }]
  return []
}
