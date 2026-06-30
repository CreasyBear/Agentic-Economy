import { afterEach, describe, expect, it } from 'vitest'

import {
  readAnswerSynthesizerMode,
  readChatApiAllowed,
  readToolUseAgentEnabled,
} from '@/modules/answer/internal/llm-config'

afterEach(() => {
  delete process.env.AE_ANSWER_SYNTHESIZER
  delete process.env.AE_GATED_LLM_ANSWER
  delete process.env.AE_ALLOW_CHAT_API
  delete process.env.OPENROUTER_API_KEY
  delete process.env.NODE_ENV
})

describe('readAnswerSynthesizerMode', () => {
  it('always returns tool-use - the single Phase 7 answer path', () => {
    expect(readAnswerSynthesizerMode()).toBe('tool-use')
    process.env.AE_ANSWER_SYNTHESIZER = 'deterministic'
    expect(readAnswerSynthesizerMode()).toBe('tool-use')
    process.env.AE_ANSWER_SYNTHESIZER = 'gated-llm'
    expect(readAnswerSynthesizerMode()).toBe('tool-use')
  })

  it('ignores the legacy AE_GATED_LLM_ANSWER flag', () => {
    process.env.AE_GATED_LLM_ANSWER = '1'
    expect(readAnswerSynthesizerMode()).toBe('tool-use')
  })
})

describe('readToolUseAgentEnabled', () => {
  it('is off without an OpenRouter key', () => {
    expect(readToolUseAgentEnabled()).toBe(false)
  })

  it('is on whenever OpenRouter is configured - tool-use is the default', () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    expect(readToolUseAgentEnabled()).toBe(true)
  })
})

describe('readChatApiAllowed', () => {
  it('allows /api/chat outside production without an explicit flag', () => {
    process.env.NODE_ENV = 'development'
    expect(readChatApiAllowed()).toBe(true)
  })

  it('gates /api/chat in production behind AE_ALLOW_CHAT_API', () => {
    process.env.NODE_ENV = 'production'
    expect(readChatApiAllowed()).toBe(false)
    process.env.AE_ALLOW_CHAT_API = '1'
    expect(readChatApiAllowed()).toBe(true)
  })
})
