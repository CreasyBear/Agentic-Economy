'use node'

import { Agent, fetch as guardedFetch } from 'undici'
import { readBoundedRequestText } from '@/lib/server/bounded-request-body'
import { isRecord } from '@/modules/common/is-record'
import { parseModelCostUsd } from '@/modules/chat/model-cost'
import { createGuardedLookup, defaultDnsResolver } from '@/modules/network-guard/public'
import { internal } from '../../../_generated/api'
import { env, type ActionCtx } from '../../../_generated/server'

type GenerationCost = {
  amountUsd: string
  model?: string
  inputTokens?: number
  outputTokens?: number
}

/**
 * Requires a provider-proven generation ID, never an SDK fallback ID.
 * Ensures exact reported USD or an explicit unavailable result. The fixed
 * metadata endpoint cannot generate content; it never retries a model request.
 * Invariant: no prompts, bodies or credentials enter the returned observation.
 * On violation: retain unknown cost. One deadline bounds headers and body.
 * https://openrouter.ai/docs/api/api-reference/generations/get-generation
 */
export async function readOpenRouterGenerationCost(input: {
  generationId: string
  apiKey: string | undefined
}): Promise<GenerationCost | null> {
  if (!/^[a-zA-Z0-9_.:-]{1,200}$/.test(input.generationId)
    || input.apiKey === undefined || input.apiKey.trim().length === 0) return null
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup(defaultDnsResolver) } })
  try {
    const url = new URL('https://openrouter.ai/api/v1/generation')
    url.searchParams.set('id', input.generationId)
    const response = await guardedFetch(url, {
      method: 'GET', dispatcher, redirect: 'error',
      headers: { authorization: `Bearer ${input.apiKey}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) {
      await response.body?.cancel()
      return null
    }
    const bounded = await readBoundedRequestText(response, 64 * 1024)
    if (!bounded.ok) return null
    const body: unknown = JSON.parse(bounded.text)
    if (!isRecord(body) || !isRecord(body.data) || body.data.id !== input.generationId) return null
    const data = body.data
    const amountUsd = parseModelCostUsd(data.total_cost)
    if (amountUsd === undefined) return null
    const model = typeof data.model === 'string' && /^[a-zA-Z0-9~_./:-]{1,200}$/.test(data.model)
      ? data.model : undefined
    const inputTokens = safeTokens(data.native_tokens_prompt ?? data.tokens_prompt)
    const outputTokens = safeTokens(data.native_tokens_completion ?? data.tokens_completion)
    return { amountUsd, ...(model === undefined ? {} : { model }),
      ...(inputTokens === undefined ? {} : { inputTokens }),
      ...(outputTokens === undefined ? {} : { outputTokens }) }
  } catch {
    return null
  } finally {
    await dispatcher.destroy()
  }
}

export async function reconcileModelCost(
  ctx: ActionCtx,
  args: { requestRef: string; attempt: number },
): Promise<null> {
  // The transaction claims each of three attempts once. It schedules its
  // successor before I/O; a crashed action leaves bounded recovery available.
  const request = await ctx.runMutation(internal.chatModelCost.claimStatsLookup, args)
  if (request === null) return null
  const cost = await readOpenRouterGenerationCost({
    generationId: request.providerGenerationId, apiKey: env.OPENROUTER_API_KEY,
  })
  const binding = { turnRef: request.turnRef, threadId: request.threadId,
    promptMessageId: request.promptMessageId, requestRef: request.requestRef }
  if (cost === null) {
    await ctx.runMutation(internal.chatModelCost.observe, {
      ...binding, accounting: { status: 'unpriced', reason: 'lookup_failed' },
    })
    return null
  }
  await ctx.runMutation(internal.chatModelCost.observe, {
    ...binding,
    ...(request.model === undefined && cost.model !== undefined ? { model: cost.model } : {}),
    ...(request.inputTokens === undefined && cost.inputTokens !== undefined ? { inputTokens: cost.inputTokens } : {}),
    ...(request.outputTokens === undefined && cost.outputTokens !== undefined ? { outputTokens: cost.outputTokens } : {}),
    accounting: { status: 'priced', amountUsd: cost.amountUsd, source: 'generation_stats' },
  })
  return null
}

function safeTokens(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}
