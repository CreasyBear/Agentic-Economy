import { MockLanguageModelV4 } from 'ai/test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
  models: [] as MockLanguageModelV4[],
  providerCalls: [] as Array<{ modelId: string; settings: unknown }>,
}))

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: () => (modelId: string, settings: unknown) => {
    mocks.providerCalls.push({ modelId, settings })
    const model = mocks.models.shift()
    if (model === undefined) throw new Error('missing mock model')
    return model
  },
}))

import {
  ProposalTransportError,
  requestProposalModel,
} from '@/modules/plan-proposal/internal/model-transport'

const responseSchema = z.strictObject({ kind: z.literal('proposal'), value: z.string() })

function mockModel(text: string, modelId = 'mock-model-id') {
  return new MockLanguageModelV4({
    modelId,
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 11, noCache: 11, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 7, text: 7, reasoning: undefined },
      },
      providerMetadata: { openrouter: { usage: { cost: 0.01 } } },
      warnings: [],
    }),
  })
}

describe('proposal model transport', () => {
  beforeEach(() => {
    mocks.models = []
    mocks.providerCalls = []
  })

  it('uses DeepSeek JSON mode and parses its object with the request schema', async () => {
    const deepseekModel = mockModel('{"kind":"proposal","value":"safe"}')
    mocks.models = [deepseekModel]

    const result = await requestProposalModel({
      role: 'proposal',
      system: 'Return the requested proposal.',
      prompt: 'Propose the next step.',
      schema: responseSchema,
    })

    expect(result.object).toEqual({ kind: 'proposal', value: 'safe' })
    expect(result.usage).toEqual({ inputTokens: 11, outputTokens: 7 })
    expect(result.costUsd).toBe(0.01)
    expect(result.modelId).toBe('mock-model-id')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(mocks.providerCalls).toEqual([{
      modelId: 'deepseek/deepseek-v4-flash-0731',
      settings: {
        provider: { allow_fallbacks: true, require_parameters: false },
        extraBody: {
          response_format: { type: 'json_object' },
          reasoning: { exclude: true, effort: 'none' },
        },
        usage: { include: true },
      },
    }])
    expect(deepseekModel.doGenerateCalls[0]?.responseFormat).toBeUndefined()
    expect(deepseekModel.doGenerateCalls[0]?.maxOutputTokens).toBe(2_000)
    expect(JSON.stringify(deepseekModel.doGenerateCalls[0]?.prompt)).toContain(
      'Respond with one JSON object matching this schema exactly',
    )
  })

  it('falls back to strict structured output models after client-side schema failure', async () => {
    const deepseekModel = mockModel('{"kind":"proposal"}')
    const strictModel = mockModel('{"kind":"proposal","value":"fallback"}', 'strict-model-id')
    mocks.models = [deepseekModel, strictModel]

    const result = await requestProposalModel({
      role: 'proposal',
      system: 'system',
      prompt: 'prompt',
      schema: responseSchema,
    })

    expect(result.object).toEqual({ kind: 'proposal', value: 'fallback' })
    expect(result.modelId).toBe('strict-model-id')
    expect(mocks.providerCalls).toEqual([
      {
        modelId: 'deepseek/deepseek-v4-flash-0731',
        settings: {
          provider: { allow_fallbacks: true, require_parameters: false },
          extraBody: {
            response_format: { type: 'json_object' },
            reasoning: { exclude: true, effort: 'none' },
          },
          usage: { include: true },
        },
      },
      {
        modelId: 'openai/gpt-5.4-mini',
        settings: {
          provider: { allow_fallbacks: true, require_parameters: true },
          structuredOutputs: { strict: true },
          usage: { include: true },
        },
      },
    ])
    expect(deepseekModel.doGenerateCalls[0]?.responseFormat).toBeUndefined()
    expect(strictModel.doGenerateCalls[0]?.responseFormat).toMatchObject({
      type: 'json',
      schema: expect.any(Object),
    })
    expect(strictModel.doGenerateCalls[0]?.maxOutputTokens).toBe(2_000)
  })

  it('classifies invalid structured output', async () => {
    mocks.models = [
      mockModel('{"kind":"proposal"}'),
      mockModel('{"kind":"proposal"}'),
      mockModel('{"kind":"proposal"}'),
    ]

    await expect(requestProposalModel({
      role: 'proposal', system: 'system', prompt: 'prompt', schema: responseSchema,
    })).rejects.toMatchObject({ code: 'invalid_response' } satisfies Partial<ProposalTransportError>)
  })

})
