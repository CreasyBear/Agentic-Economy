import type * as Ai from 'ai'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { discoverBusinessesFromWebSearch, enrichBusinessFromWebSearch } from '@/modules/storefront/public'

import { openRouterGatewayConfig } from '@/modules/model-gateway/public'

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
  return new Response(
    JSON.stringify({
      choices: [
        {
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content,
            annotations: citations.map((url) => ({ type: 'url_citation', url_citation: { url } })),
          },
        },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

describe('business enrichment from a web search', () => {
  beforeEach(() => {
    // Ambient env leaks into vitest in this repo; the unconfigured branch needs a clean slate.
    delete process.env.OPENROUTER_API_KEY
    aiSdkTestState.generateTextCalls.length = 0
  })

  it('reports unavailable rather than failing when no model is configured', async () => {
    expect(openRouterGatewayConfig().apiKey).toBeUndefined()

    const result = await enrichBusinessFromWebSearch({ businessName: 'Joondalup Emergency Plumbing' }, openRouterGatewayConfig())

    expect(result).toEqual({ kind: 'unavailable', reason: 'llm_not_configured' })
  })

  it('drafts owner-reviewable facts and carries the citation URL on each one', async () => {
    const fetchMock = vi.fn(async () =>
      completionResponse(
        JSON.stringify({
          businessName: 'Joondalup Emergency Plumbing',
          category: 'Emergency plumbing',
          suburb: 'Joondalup',
          stateTerritory: 'WA',
          serviceName: 'Burst pipe repair',
          serviceSummary: 'Same day burst pipe and blocked drain repairs.',
        }),
        ['https://joondalupplumbing.example/about'],
      ),
    )

    const result = await enrichBusinessFromWebSearch(
      { businessName: 'Joondalup Emergency Plumbing', suburb: 'Joondalup' },
      config,
      { fetch: fetchMock },
    )

    const call = aiSdkTestState.generateTextCalls[0]
    expect(call).toMatchObject({
      instructions: expect.stringContaining('You draft public profile facts'),
      prompt: 'Draft public profile facts for the Australian local business named "Joondalup Emergency Plumbing" in Joondalup.',
    })
    expect(call).not.toHaveProperty('system')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    if (result.kind !== 'draft') throw new Error(`expected a draft, received ${result.kind}`)

    expect(result.draft.status).toBe('draft_unconfirmed')
    expect(result.draft.source).toMatchObject({ kind: 'web_search', label: 'gathered-from-web-search', confirmation: 'unconfirmed' })
    expect(result.draft.profile.businessName).toBe('Joondalup Emergency Plumbing')
    expect(result.draft.profile.requestedSlug).toBe('joondalup-emergency-plumbing')

    for (const fact of result.draft.facts) {
      expect(fact.sourceLabel).toBe('gathered-from-web-search')
      expect(fact.confirmation).toBe('unconfirmed')
      expect(fact.evidenceRef).toBe('https://joondalupplumbing.example/about')
    }
    expect(result.draft.facts.map((fact) => fact.field)).toContain('category')
  })
  it('sends exactly one web-search-grounded request and never fetches the business website', async () => {
    const seen: { url: string; body: unknown }[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) })
      return completionResponse(JSON.stringify({ businessName: 'A', websiteUrl: 'https://a.example' }))
    })

    await enrichBusinessFromWebSearch({ businessName: 'A' }, config, { fetch: fetchMock })

    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(seen[0]?.body).toMatchObject({ plugins: [{ id: 'web', max_results: 5 }], response_format: { type: 'json_object' } })
  })

  it('classifies unreadable model output as a retryable failure', async () => {
    const fetchMock = vi.fn(async () => completionResponse('not json at all'))

    const result = await enrichBusinessFromWebSearch({ businessName: 'A' }, config, { fetch: fetchMock })

    expect(result).toMatchObject({ kind: 'error', code: 'enrichment_failed', retryable: true })
  })

  it('refuses without retry when nothing could be grounded', async () => {
    const fetchMock = vi.fn(async () => completionResponse(JSON.stringify({})))

    const result = await enrichBusinessFromWebSearch({ businessName: 'A' }, config, { fetch: fetchMock })

    expect(result).toMatchObject({ kind: 'error', code: 'enrichment_no_facts', retryable: false })
  })

  it('discovers imported claims with citation provenance in one web search', async () => {
    const fetchMock = vi.fn(async () =>
      completionResponse(
        JSON.stringify({
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
        }),
        ['https://directory.example/parramatta-funeral'],
      ),
    )
    const modelRequests: unknown[] = []

    const result = await discoverBusinessesFromWebSearch(
      { query: 'funeral parlours in Parramatta', location: 'Parramatta' },
      config,
      {
        fetch: fetchMock,
        onModelRequest: (observation) => modelRequests.push(observation),
      },
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
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
    expect(modelRequests).toEqual([
      expect.objectContaining({
        provider: 'openrouter',
        model: config.model,
        status: 'ok',
        costUnavailableReason: 'provider_cost_not_reported',
      }),
    ])
  })

  it('never throws a provider error at the caller', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 500 }))

    const result = await enrichBusinessFromWebSearch({ businessName: 'A' }, config, { fetch: fetchMock })

    expect(result.kind).toBe('error')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
