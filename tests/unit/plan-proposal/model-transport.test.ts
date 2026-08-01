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

  it('uses strict structured outputs on the primary model and parses its object', async () => {
    const primaryModel = mockModel('{"kind":"proposal","value":"safe"}')
    mocks.models = [primaryModel]

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
      modelId: 'openai/gpt-5.4-mini',
      settings: {
        provider: { allow_fallbacks: true, require_parameters: true },
        structuredOutputs: { strict: true },
        usage: { include: true },
      },
    }])
    expect(primaryModel.doGenerateCalls[0]?.responseFormat).toMatchObject({
      type: 'json',
      schema: expect.any(Object),
    })
    expect(primaryModel.doGenerateCalls[0]?.maxOutputTokens).toBe(8_000)
  })

  it('falls back to the JSON-mode model after the primary model breaks its schema', async () => {
    const primaryModel = mockModel('{"kind":"proposal"}')
    const jsonModeModel = mockModel('{"kind":"proposal","value":"fallback"}', 'json-mode-model-id')
    mocks.models = [primaryModel, jsonModeModel]

    const result = await requestProposalModel({
      role: 'proposal',
      system: 'system',
      prompt: 'prompt',
      schema: responseSchema,
    })

    expect(result.object).toEqual({ kind: 'proposal', value: 'fallback' })
    expect(result.modelId).toBe('json-mode-model-id')
    expect(mocks.providerCalls).toEqual([
      {
        modelId: 'openai/gpt-5.4-mini',
        settings: {
          provider: { allow_fallbacks: true, require_parameters: true },
          structuredOutputs: { strict: true },
          usage: { include: true },
        },
      },
      {
        modelId: 'google/gemini-3.1-pro-preview',
        settings: {
          provider: { allow_fallbacks: true, require_parameters: false },
          extraBody: { response_format: { type: 'json_object' } },
          usage: { include: true },
        },
      },
    ])
    expect(jsonModeModel.doGenerateCalls[0]?.responseFormat).toBeUndefined()
    expect(JSON.stringify(jsonModeModel.doGenerateCalls[0]?.prompt)).toContain(
      'Respond with one JSON object matching this schema exactly',
    )
    expect(jsonModeModel.doGenerateCalls[0]?.maxOutputTokens).toBe(8_000)
  })

  it('re-asks the same model with the rejection reason before falling back', async () => {
    const rejected = mockModel('{"kind":"proposal","value":"duplicate-node"}', 'first-model-id')
    const repaired = mockModel('{"kind":"proposal","value":"valid-map"}', 'first-model-id')
    mocks.models = [rejected, repaired]

    const result = await requestProposalModel({
      role: 'proposal',
      system: 'system',
      prompt: 'prompt',
      schema: responseSchema,
      accept: (object) => responseSchema.parse(object).value === 'valid-map'
        ? undefined
        : 'decision_map_invalid',
    })

    expect(result.object).toEqual({ kind: 'proposal', value: 'valid-map' })
    expect(result.modelId).toBe('first-model-id')
    expect(result.usage).toEqual({ inputTokens: 22, outputTokens: 14 })
    expect(result.costUsd).toBe(0.02)
    expect(mocks.providerCalls.map((call) => call.modelId)).toEqual([
      'openai/gpt-5.4-mini',
      'openai/gpt-5.4-mini',
    ])
    const repairPrompt = JSON.stringify(repaired.doGenerateCalls[0]?.prompt)
    expect(repairPrompt).toContain('decision_map_invalid')
    expect(repairPrompt).toContain('duplicate-node')
  })

  it('moves to the next model when a rejected response cannot be repaired', async () => {
    mocks.models = [
      mockModel('{"kind":"proposal","value":"bad"}', 'first-model-id'),
      mockModel('{"kind":"proposal","value":"bad"}', 'first-model-id'),
      mockModel('{"kind":"proposal","value":"valid-map"}', 'second-model-id'),
    ]

    const result = await requestProposalModel({
      role: 'proposal',
      system: 'system',
      prompt: 'prompt',
      schema: responseSchema,
      accept: (object) => responseSchema.parse(object).value === 'valid-map'
        ? undefined
        : 'decision_map_invalid',
    })

    expect(result.modelId).toBe('second-model-id')
    expect(mocks.providerCalls.map((call) => call.modelId)).toEqual([
      'openai/gpt-5.4-mini',
      'openai/gpt-5.4-mini',
      'google/gemini-3.1-pro-preview',
    ])
  })

  it('treats a truncated response as invalid instead of parsing a cut-off object', async () => {
    const truncated = new MockLanguageModelV4({
      modelId: 'truncated-model-id',
      doGenerate: async () => ({
        content: [{ type: 'text', text: '{"kind":"proposal","value":"cut' }],
        finishReason: { unified: 'length', raw: undefined },
        usage: {
          inputTokens: { total: 11, noCache: 11, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 8_000, text: 8_000, reasoning: undefined },
        },
        providerMetadata: { openrouter: { usage: { cost: 0.01 } } },
        warnings: [],
      }),
    })
    mocks.models = [truncated, mockModel('{"kind":"proposal","value":"whole"}', 'second-model-id')]

    const result = await requestProposalModel({
      role: 'proposal', system: 'system', prompt: 'prompt', schema: responseSchema,
    })

    expect(result.object).toEqual({ kind: 'proposal', value: 'whole' })
    expect(result.modelId).toBe('second-model-id')
    expect(mocks.providerCalls).toHaveLength(2)
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
