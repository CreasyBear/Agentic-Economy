import { afterEach, describe, expect, it, vi } from 'vitest'
import { callJevSystemOne } from '@/modules/decision-engine/public'
import { serializeToolSearchResult } from '@/modules/capability-supply/public'
import { ERC20_QUERY, jevSystemOneResponse, misorderedSearchResult } from '../../../../tests/helpers/tool-search-rerank-fixtures'
import { presentSearch } from '../../capabilitySupply/toolCatalog/presentation'
import { createJevModelCostObserver } from './jevModelCost'

const binding = { turnRef: 'turn:jev', threadId: 'thread:jev', promptMessageId: 'prompt:jev' }
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('chat Jev attribution through the SDK boundary', () => {
  it('waits for the bound begin mutation and projects only usage, never a price or payload', async () => {
    const begin = Promise.withResolvers<null>()
    const runMutation = vi.fn().mockReturnValueOnce(begin.promise).mockResolvedValue(null)
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      model: '~typesafe/jev-latest', answers: { fits: { type: 'noul', noul: 0.8 } }, usage: { input_tokens: 12, output_tokens: 0 },
    }))
    const work = callJevSystemOne({ state: { privatePrompt: 'private prompt' }, questions: { fits: { type: 'noul' } } }, {
      typesafeApiKey: 'ts-test', purpose: 'discovery', fetchImpl,
      inferenceObserver: createJevModelCostObserver({ runMutation }, binding, 'discovery_rerank'),
    })
    await vi.waitFor(() => expect(runMutation).toHaveBeenCalledOnce())
    expect(fetchImpl).not.toHaveBeenCalled()
    begin.resolve(null)
    await work
    const start = runMutation.mock.calls[0]?.[1]
    const completion = runMutation.mock.calls[1]?.[1]
    expect(start).toEqual({ ...binding, requestRef: expect.any(String), source: 'jev', purpose: 'discovery_rerank', requestedModel: 'jev-latest' })
    expect(completion).toEqual({ ...binding, requestRef: start.requestRef, model: '~typesafe/jev-latest', inputTokens: 12, outputTokens: 0,
      accounting: { status: 'unpriced', reason: 'jev_usage_only' },
    })
    expect(JSON.stringify(runMutation.mock.calls.map(([, args]) => args))).not.toMatch(/private prompt|privatePrompt|ts-test|amountUsd/u)
  })

  it('records reranking with the exact turn binding and actual requested model', async () => {
    vi.stubEnv('AE_JEV_DISCOVERY_ENABLED', 'true')
    vi.stubEnv('OPENROUTER_API_KEY', 'sk-or-test')
    vi.stubEnv('TYPESAFE_API_KEY', '')
    const runMutation = vi.fn().mockResolvedValue(null)
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        questions: Record<string, { type: string; criteria?: Record<string, string> }>
      }
      expect(Object.keys(body.questions).sort()).toEqual(['match_0', 'match_1', 'match_2', 'use'])
      const answers = Object.fromEntries(Object.entries(body.questions).map(([key, question]) => {
        if (question.type === 'noul') return [key, { type: 'noul', noul: 0.8 }]
        const choice = Object.keys(question.criteria ?? {})[0]
        if (question.type !== 'choice' || choice === undefined) throw new Error('unexpected_jev_fixture_question')
        return [key, { type: 'choice', choice, confidence: 0.9, probabilities: { [choice]: 0.9 } }]
      }))
      return jevSystemOneResponse(answers)
    })
    vi.stubGlobal('fetch', fetcher)
    await presentSearch({ result: serializeToolSearchResult(misorderedSearchResult(ERC20_QUERY)), query: ERC20_QUERY, modelCostBinding: binding }, { runMutation })
    expect(fetcher).toHaveBeenCalledOnce()
    expect(runMutation.mock.calls[0]?.[1]).toMatchObject({ ...binding, purpose: 'discovery_rerank', source: 'jev', requestedModel: '~typesafe/jev-latest' })
    expect(runMutation.mock.calls[1]?.[1]).toMatchObject({ ...binding, model: '~typesafe/jev-latest', inputTokens: 180, outputTokens: 0, accounting: { status: 'unpriced', reason: 'jev_usage_only' } })
  })

  it('creates no rows for disabled discovery', async () => {
    vi.stubEnv('AE_JEV_DISCOVERY_ENABLED', 'false')
    const runMutation = vi.fn().mockResolvedValue(null)
    const fetcher = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetcher)
    await presentSearch({ result: serializeToolSearchResult(misorderedSearchResult(ERC20_QUERY)), query: ERC20_QUERY, modelCostBinding: binding }, { runMutation })
    expect(runMutation).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
