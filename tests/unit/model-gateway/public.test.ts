import { generateText } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_OPENROUTER_MODEL,
  openRouterGatewayConfig,
  openRouterModel,
  type OpenRouterGatewayConfig,
  type OpenRouterModelOptions,
} from '@/modules/model-gateway/public'

const config: OpenRouterGatewayConfig = { apiKey: 'test-key', model: 'test-model' }

async function requestBody(options: Omit<OpenRouterModelOptions, 'fetch'> = {}) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ))

  await generateText({
    model: openRouterModel(config, config.model, { ...options, fetch: fetchMock }),
    prompt: 'hello',
  })

  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('openRouterModel routing options', () => {
  it('accepts explicit Convex environment values and keeps the single default model', () => {
    expect(openRouterGatewayConfig({
      OPENROUTER_API_KEY: '  convex-key  ',
      AE_LLM_MODEL: '  openrouter/configured-model  ',
      AE_OPENROUTER_API_BASE_URL: '  https://router.example.test/api  ',
      SITE_URL: '  https://agentic.example.test  ',
    })).toEqual({
      apiKey: 'convex-key',
      model: 'openrouter/configured-model',
      baseUrl: 'https://router.example.test/api',
      siteUrl: 'https://agentic.example.test',
    })

    expect(openRouterGatewayConfig({ AE_LLM_MODEL: '  ' })).toEqual({
      model: DEFAULT_OPENROUTER_MODEL,
    })
  })

  it('requires strict-output support without forcing provider parallel calls', async () => {
    const body = await requestBody({ structuredOutputs: true })

    expect(body.provider).toEqual({ allow_fallbacks: true, require_parameters: true })
    expect(body).not.toHaveProperty('parallel_tool_calls')
  })

})
