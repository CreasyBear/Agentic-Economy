import type * as Ai from 'ai'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { openRouterGatewayConfig } from '@/modules/model-gateway/public'
import { discoverBusinessesFromWebSearch } from '@/modules/storefront/public'

const aiSdkTestState = vi.hoisted(() => ({
  generateTextCalls: [] as Array<Record<string, unknown>>,
}))

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof Ai>()
  return {
    ...actual,
    generateText: new Proxy(actual.generateText, {
      apply(target, thisArg, args) {
        aiSdkTestState.generateTextCalls.push(args[0] as Record<string, unknown>)
        return Reflect.apply(target, thisArg, args)
      },
    }),
  }
})

const config = { apiKey: 'test-key', model: 'test/model' }

function completionResponse(content: string, citations: readonly string[] = []): Response {
  return new Response(JSON.stringify({
    choices: [{
      finish_reason: 'stop',
      message: {
        role: 'assistant',
        content,
        annotations: citations.map((url) => ({ type: 'url_citation', url_citation: { url } })),
      },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

describe('business discovery from web search', () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_API_KEY
    aiSdkTestState.generateTextCalls.length = 0
  })

  it('reports unavailable when no model is configured', async () => {
    expect(await discoverBusinessesFromWebSearch({ query: 'plumber' }, openRouterGatewayConfig())).toEqual({
      kind: 'unavailable',
      reason: 'llm_not_configured',
    })
  })

  it('returns only claims backed by a citation from one bounded web search', async () => {
    const fetchMock = vi.fn(async () => completionResponse(JSON.stringify({
      businesses: [{
        businessName: 'Parramatta Funeral Home',
        suburb: 'Parramatta',
        phone: '02 0000 0000',
        websiteUrl: 'https://funeral.example',
        sourceUrl: 'https://directory.example/parramatta-funeral',
      }, {
        businessName: 'Invented Funeral Home',
        suburb: 'Parramatta',
        sourceUrl: 'https://invented.example',
      }],
    }), ['https://directory.example/parramatta-funeral']))
    const modelRequests: unknown[] = []

    const result = await discoverBusinessesFromWebSearch(
      { query: 'funeral parlours in Parramatta', location: 'Parramatta' },
      config,
      { fetch: fetchMock, onModelRequest: (observation) => modelRequests.push(observation) },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(aiSdkTestState.generateTextCalls[0]).toMatchObject({
      instructions: expect.stringContaining('Find real published businesses'),
      prompt: 'Find real published businesses for "funeral parlours in Parramatta" near Parramatta.',
    })
    expect(result).toEqual({
      kind: 'found',
      query: 'funeral parlours in Parramatta',
      claims: [{
        businessName: 'Parramatta Funeral Home',
        suburb: 'Parramatta',
        phone: '02 0000 0000',
        websiteUrl: 'https://funeral.example',
        sourceUrl: 'https://directory.example/parramatta-funeral',
      }],
    })
    expect(modelRequests).toEqual([expect.objectContaining({
      provider: 'openrouter',
      model: config.model,
      status: 'ok',
      costUnavailableReason: 'provider_cost_not_reported',
    })])
  })

  it('returns no matches when the provider output is ungrounded', async () => {
    const fetchMock = vi.fn(async () => completionResponse(JSON.stringify({
      businesses: [{ businessName: 'Invented', suburb: 'Perth', sourceUrl: 'https://invented.example' }],
    }), ['https://real.example']))

    await expect(discoverBusinessesFromWebSearch({ query: 'plumber' }, config, { fetch: fetchMock })).resolves.toEqual({
      kind: 'none',
      query: 'plumber',
      reason: 'no_matches',
    })
  })

  it('contains provider failures and performs only the configured retry', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }))

    const result = await discoverBusinessesFromWebSearch({ query: 'plumber' }, config, { fetch: fetchMock })

    expect(result).toMatchObject({ kind: 'error', code: 'discovery_failed', retryable: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
