import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const external = vi.hoisted(() => ({ fetch: vi.fn(), destroy: vi.fn(async () => {}) }))
vi.mock('undici', () => ({ fetch: external.fetch,
  Agent: class { destroy = external.destroy },
}))
import { readOpenRouterGenerationCost } from '../../../convex/lib/chat/turns/modelCostActions'
import { api, internal } from '../../../convex/_generated/api'
import { convexTestWithMarketComponents, publishedBusinessOwner } from '../../helpers/convex-fixtures'

beforeEach(() => vi.clearAllMocks())
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.clearAllTimers(); vi.useRealTimers() })
const input = { generationId: 'gen-fixture', apiKey: 'fixture-only-key' }
function response(data: Record<string, unknown>) {
  return new Response(JSON.stringify({ data: { id: input.generationId, ...data } }))
}

describe('OpenRouter generation-cost metadata', () => {
  it('reconciles a registered request once even when the scheduled action is delivered twice', async () => {
    vi.useFakeTimers()
    vi.stubEnv('OPENROUTER_API_KEY', input.apiKey)
    const backend = convexTestWithMarketComponents()
    const { owner } = await publishedBusinessOwner(backend, 'generation-cost-owner')
    const turn = await owner.mutation(api.chatTurns.startTurn, {
      principal: { kind: 'clerk' }, clientTurnId: 'metadata-cost', prompt: 'A fixture prompt',
    })
    const binding = { turnRef: turn.turnRef, threadId: turn.threadId, promptMessageId: turn.promptMessageId }
    await backend.mutation(internal.chatModelCost.begin, { ...binding,
      requestRef: 'request:metadata', source: 'openrouter', purpose: 'initial', requestedModel: 'requested/model' })
    await backend.mutation(internal.chatModelCost.observe, { ...binding,
      requestRef: 'request:metadata', providerGenerationId: input.generationId,
      accounting: { status: 'unpriced', reason: 'missing_usage' } })
    external.fetch.mockResolvedValue(response({ total_cost: 0.003, model: 'actual/model', tokens_prompt: 9, tokens_completion: 3 }))
    await Promise.all([1, 1].map(attempt => backend.action(internal['chatModelCostActions'].reconcile, { requestRef: 'request:metadata', attempt })))
    expect(external.fetch).toHaveBeenCalledTimes(1)
    await backend.mutation(internal.chatTurns.finishTurn, { turnRef: turn.turnRef, promptMessageId: turn.promptMessageId, state: 'completed' })
    expect(await backend.query(internal.chatModelCost.readTurn, { turnRef: turn.turnRef })).toMatchObject({
      status: 'complete', knownCostUsd: '0.003', requestCount: 1, unknownRequestCount: 0,
      requests: [{ model: 'actual/model', inputTokens: 9, outputTokens: 3,
        accounting: { status: 'priced', source: 'generation_stats', amountUsd: '0.003' } }],
    })
    await backend.action(internal['chatModelCostActions'].reconcile, { requestRef: 'request:metadata', attempt: 2 })
    expect(external.fetch).toHaveBeenCalledTimes(1)
  })

  it('reads exact reported cost and safe usage through a fixed GET with a body deadline', async () => {
    external.fetch.mockResolvedValue(response({ total_cost: 0.0000001, model: 'test/model',
      native_tokens_prompt: 10, native_tokens_completion: 20, prompt: 'private content', api_key: 'do-not-copy' }))
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    expect(await readOpenRouterGenerationCost(input)).toEqual({ amountUsd: '0.0000001',
      model: 'test/model', inputTokens: 10, outputTokens: 20 })
    const [url, options] = external.fetch.mock.calls[0] ?? []
    expect(String(url)).toBe('https://openrouter.ai/api/v1/generation?id=gen-fixture')
    expect(options).toMatchObject({ method: 'GET', redirect: 'error', headers: { authorization: 'Bearer fixture-only-key' } })
    expect(options.body).toBeUndefined()
    expect(timeout).toHaveBeenCalledWith(5_000)
    expect(external.fetch).toHaveBeenCalledTimes(1)
    expect(external.destroy).toHaveBeenCalledTimes(1)
  })

  it('retains an observed zero while rejecting invalid metadata fields', async () => {
    external.fetch.mockResolvedValue(response({ total_cost: 0, model: 'a secret\nbody', native_tokens_prompt: -1, native_tokens_completion: 0.5 }))
    expect(await readOpenRouterGenerationCost(input)).toEqual({ amountUsd: '0' })
  })

  it.each([undefined, null, -1, 'NaN', 'Infinity', '1000000000000000000', '1e-31'])('leaves invalid cost %s unknown', async total_cost => {
    external.fetch.mockResolvedValue(response({ total_cost }))
    expect(await readOpenRouterGenerationCost(input)).toBeNull()
  })

  it('refuses another generation, malformed JSON and oversized metadata without a second request', async () => {
    for (const body of [response({ id: 'gen-other', total_cost: 1 }), new Response('{'), new Response('x'.repeat(65_537))]) {
      external.fetch.mockResolvedValueOnce(body)
      expect(await readOpenRouterGenerationCost(input)).toBeNull()
    }
    expect(external.fetch).toHaveBeenCalledTimes(3)
    expect(external.destroy).toHaveBeenCalledTimes(3)
  })

  it('keeps lookup failure unknown and closes its dispatcher', async () => {
    external.fetch.mockResolvedValueOnce(new Response('private provider error', { status: 404 }))
    expect(await readOpenRouterGenerationCost(input)).toBeNull()
    external.fetch.mockRejectedValueOnce(new Error('credential and raw body must not escape'))
    expect(await readOpenRouterGenerationCost(input)).toBeNull()
    expect(external.destroy).toHaveBeenCalledTimes(2)
  })

  it('does not send invalid IDs or absent credentials', async () => {
    expect(await readOpenRouterGenerationCost({ ...input, generationId: '../other?secret' })).toBeNull()
    expect(await readOpenRouterGenerationCost({ ...input, apiKey: undefined })).toBeNull()
    expect(external.fetch).not.toHaveBeenCalled()
  })
})
