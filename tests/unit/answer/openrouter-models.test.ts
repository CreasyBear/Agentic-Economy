import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchOpenRouterModels,
  groupModelsByProvider,
  normalizeOpenRouterModels,
  providerLabelFromModelId,
  resolveChatModelId,
  resolveSelectedModelId,
  resetOpenRouterModelsCacheForTest,
  type AnswerModel,
} from '@/modules/answer/public'

describe('openrouter model selector', () => {
  afterEach(() => {
    resetOpenRouterModelsCacheForTest()
    delete process.env.AE_LLM_MODELS
    vi.unstubAllGlobals()
  })

  it('groups models by provider label and sorts each provider bucket by model name', () => {
    const models: AnswerModel[] = [
      {
        id: 'deepseek/deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        provider: 'Deepseek',
        providerId: 'deepseek',
      },
      {
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        provider: 'Anthropic',
        providerId: 'anthropic',
      },
      {
        id: 'anthropic/claude-haiku-4',
        name: 'Claude Haiku 4',
        provider: 'Anthropic',
        providerId: 'anthropic',
      },
    ]

    const grouped = groupModelsByProvider(models)

    expect(grouped).toEqual({
      Deepseek: [
        {
          id: 'deepseek/deepseek-v4-flash',
          name: 'DeepSeek V4 Flash',
          provider: 'Deepseek',
          providerId: 'deepseek',
        },
      ],
      Anthropic: [
        {
          id: 'anthropic/claude-haiku-4',
          name: 'Claude Haiku 4',
          provider: 'Anthropic',
          providerId: 'anthropic',
        },
        {
          id: 'anthropic/claude-sonnet-4',
          name: 'Claude Sonnet 4',
          provider: 'Anthropic',
          providerId: 'anthropic',
        },
      ],
    })
  })

  it('uses refusal redirects, abort timeout plumbing, and bounded model responses', async () => {
    const calls: { init: RequestInit | undefined }[] = []
    vi.stubGlobal('fetch', async (_input: string | URL, init?: RequestInit) => {
      calls.push({ init })
      return new Response(JSON.stringify({ data: [] }), {
        headers: { 'Content-Type': 'application/json' },
      })
    })

    await expect(fetchOpenRouterModels('openrouter-test-key')).resolves.toEqual([])

    expect(calls).toHaveLength(1)
    expect(calls[0]?.init?.redirect).toBe('error')
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('refuses an oversized model response before parsing it', async () => {
    vi.stubGlobal('fetch', async () => new Response('', {
      headers: { 'content-length': String(512 * 1024 + 1) },
    }))

    await expect(fetchOpenRouterModels('openrouter-test-key')).rejects.toThrow('openrouter_models_response_too_large')
  })

  it('filters non-chat models and applies whitelist', () => {
    process.env.AE_LLM_MODELS = 'deepseek/deepseek-v4-flash'

    const models = normalizeOpenRouterModels([
      {
        id: 'deepseek/deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        architecture: { input_modalities: ['text'], output_modalities: ['text'] },
      },
      {
        id: 'deepseek/deepseek-v4-flash',
        name: 'Duplicate must not replace the first record',
        architecture: { input_modalities: ['text'], output_modalities: ['text'] },
      },
      {
        id: 'openai/text-embedding-3-small',
        name: 'Embedding 3 Small',
        architecture: { input_modalities: ['text'], output_modalities: ['text'] },
      },
      {
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        architecture: { input_modalities: ['text'], output_modalities: ['text'] },
      },
    ])

    expect(models.map((model) => model.id)).toEqual(['deepseek/deepseek-v4-flash'])
    expect(models[0]?.name).toBe('DeepSeek V4 Flash')
  })

  it('resolves forwarded model ids against the allowed list', () => {
    const allowed = [
      {
        id: 'deepseek/deepseek-v4-flash',
        name: 'DeepSeek V4 Flash',
        provider: 'Deepseek',
        providerId: 'deepseek',
      },
      {
        id: 'anthropic/claude-sonnet-4',
        name: 'Claude Sonnet 4',
        provider: 'Anthropic',
        providerId: 'anthropic',
      },
    ]

    expect(
      resolveChatModelId(allowed, { model: 'anthropic/claude-sonnet-4' }, 'deepseek/deepseek-v4-flash'),
    ).toBe('anthropic/claude-sonnet-4')

    expect(resolveChatModelId(allowed, { model: 'unknown/model' }, 'deepseek/deepseek-v4-flash')).toBe(
      'deepseek/deepseek-v4-flash',
    )
  })

  it('formats provider labels from model ids', () => {
    expect(providerLabelFromModelId('deepseek/deepseek-v4-flash')).toBe('Deepseek')
    expect(resolveSelectedModelId([], undefined, 'deepseek/deepseek-v4-flash')).toBe('deepseek/deepseek-v4-flash')
  })
})
