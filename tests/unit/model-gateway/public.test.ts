import { generateText } from 'ai'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
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
  it('requires strict-output support without forcing provider parallel calls', async () => {
    const body = await requestBody({ structuredOutputs: true })

    expect(body.provider).toEqual({ allow_fallbacks: true, require_parameters: true })
    expect(body).not.toHaveProperty('parallel_tool_calls')
  })

})
