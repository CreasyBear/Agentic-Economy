import { afterEach, describe, expect, it } from 'vitest'

import {
  groupModelsByProvider,
  normalizeOpenRouterModels,
  providerLabelFromModelId,
  resolveChatModelId,
  resolveSelectedModelId,
  resetOpenRouterModelsCacheForTest,
} from '@/modules/answer/public'

describe('openrouter model selector', () => {
  afterEach(() => {
    resetOpenRouterModelsCacheForTest()
    delete process.env.AE_LLM_MODELS
  })

  it('groups models by provider label', () => {
    const grouped = groupModelsByProvider([
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
    ])

    expect(Object.keys(grouped).sort()).toEqual(['Anthropic', 'Deepseek'])
    expect(grouped.Anthropic?.[0]?.id).toBe('anthropic/claude-sonnet-4')
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
