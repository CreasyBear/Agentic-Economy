import { describe, expect, it } from 'vitest'

import {
  parseAnswerTurnCheckpoint,
  projectAnswerTurnCheckpointResponseMessages,
} from '@/modules/answer-thread/answer-thread.schema'

const providerMessages = [
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'capability_frankfurter_latest',
        input: { base: 'EUR', symbols: ['USD'] },
        providerOptions: { openrouter: { reasoning_details: [{ type: 'reasoning.encrypted', data: 'private' }] } },
      },
    ],
    providerMetadata: { openrouter: { usage: { internal: true } } },
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'capability_frankfurter_latest',
        output: { type: 'json', value: { amount: 1, rates: { USD: 1.08 } } },
        providerOptions: { openrouter: { reasoning_details: [{ type: 'reasoning.encrypted', data: 'private' }] } },
      },
    ],
  },
] as const

describe('answer turn checkpoint response messages', () => {
  it('projects provider metadata away while preserving a parseable tool continuation', () => {
    const projected = projectAnswerTurnCheckpointResponseMessages(providerMessages as never)
    expect(projected).toEqual([
      {
        role: 'assistant',
        content: [{
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'capability_frankfurter_latest',
          input: { base: 'EUR', symbols: ['USD'] },
        }],
      },
      {
        role: 'tool',
        content: [{
          type: 'tool-result',
          toolCallId: 'call-1',
          toolName: 'capability_frankfurter_latest',
          output: { type: 'json', value: { amount: 1, rates: { USD: 1.08 } } },
        }],
      },
    ])
    const checkpoint = parseAnswerTurnCheckpoint({
      schemaVersion: 1,
      phase: 'selected_capability',
      stepIndex: 0,
      responseMessages: projected,
      toolCalls: [],
      modelRequests: [],
      timings: [],
      providers: [],
      capabilityToolNames: ['capability_frankfurter_latest'],
      modelId: 'anthropic/claude-test',
      userPrompt: 'Use the completed result.',
    })
    expect(checkpoint).not.toBeNull()
  })

  it('accepts bounded model usage counters but rejects credential-shaped fields', () => {
    const base = {
      schemaVersion: 1,
      phase: 'selected_capability',
      stepIndex: 1,
      responseMessages: [],
      toolCalls: [],
      timings: [],
      providers: [],
      capabilityToolNames: ['capability_frankfurter_latest'],
      modelId: 'anthropic/claude-test',
      userPrompt: 'Continue from the completed tool call.',
    }
    const modelRequest = {
      seq: 0,
      provider: 'openrouter',
      model: 'anthropic/claude-test',
      status: 'ok',
      durationMs: 12,
      usage: {
        inputTokens: 100,
        outputTokens: 25,
        cachedInputTokens: 10,
        cacheWriteTokens: 2,
        reasoningOutputTokens: 3,
        totalTokens: 140,
      },
    }

    expect(parseAnswerTurnCheckpoint({ ...base, modelRequests: [modelRequest] })).not.toBeNull()
    expect(parseAnswerTurnCheckpoint({
      ...base,
      modelRequests: [{ ...modelRequest, accessToken: 'private' }],
    })).toBeNull()
  })

  it('rejects malformed timing entries instead of persisting unbounded accounting state', () => {
    expect(parseAnswerTurnCheckpoint({
      schemaVersion: 1,
      phase: 'selected_capability',
      stepIndex: 0,
      responseMessages: [],
      toolCalls: [],
      modelRequests: [],
      timings: [{ name: 'bad' }],
      providers: [],
      capabilityToolNames: ['capability_frankfurter_latest'],
      modelId: 'anthropic/claude-test',
      userPrompt: 'Use the completed result.',
    })).toBeNull()
  })
})
