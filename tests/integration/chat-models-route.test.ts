import { afterEach, describe, expect, it } from 'vitest'

import { resetOpenRouterModelsCacheForTest } from '@/modules/answer/public'
import { handleChatModelsRequest } from '@/routes/api.chat.models'

describe('GET /api/chat/models', () => {
  afterEach(() => {
    resetOpenRouterModelsCacheForTest()
    delete process.env.OPENROUTER_API_KEY
    delete process.env.AE_LLM_MODEL
    delete process.env.AE_LLM_MODELS
  })

  it('returns disabled payload when OpenRouter is not configured', async () => {
    const response = await handleChatModelsRequest()
    const body = (await response.json()) as { enabled: boolean }

    expect(response.headers.get('content-type')).toContain('application/json')
    expect(body.enabled).toBe(false)
  })

  it('returns fallback models when OpenRouter key is configured', async () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.AE_LLM_MODEL = 'deepseek/deepseek-v4-flash'
    process.env.AE_LLM_MODELS = 'deepseek/deepseek-v4-flash,anthropic/claude-sonnet-4'

    const response = await handleChatModelsRequest()
    const body = (await response.json()) as {
      enabled: boolean
      selectedModelId: string
      modelsByProvider: Record<string, { id: string }[]>
    }

    expect(body.enabled).toBe(true)
    expect(body.selectedModelId).toBe('deepseek/deepseek-v4-flash')
    expect(
      Object.values(body.modelsByProvider)
        .flat()
        .map((model) => model.id)
        .sort(),
    ).toEqual(['anthropic/claude-sonnet-4', 'deepseek/deepseek-v4-flash'])
  })
})
