import { describe, expect, it, vi } from 'vitest'
import {
  executeDecisionGateway,
  callDeterministicRuleEngine,
} from '@/modules/decision-engine/public'

describe('Decision Gateway & Fallback Matrix', () => {
  const sampleRequest = {
    state: { need: 'convert 3pm New York time to Tokyo time' },
    questions: {
      toolChoice: {
        type: 'choice' as const,
        instructions: 'Select tool',
        criteria: {
          timezone_converter: 'Convert times between IANA time zones',
          crypto_lookup: 'Ethereum transaction analysis',
          unsupported: 'None match',
        },
      },
      hasError: {
        type: 'noul' as const,
        instructions: 'Check if state indicates failure',
      },
    },
  }

  it('Tier 1: uses Jev System One when endpoint returns valid answers', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: '~typesafe/jev-latest',
          answers: {
            toolChoice: {
              type: 'choice',
              choice: 'timezone_converter',
              confidence: 0.98,
              probabilities: { timezone_converter: 0.98 },
            },
            hasError: {
              type: 'noul',
              noul: 0.05,
            },
          },
          usage: { input_tokens: 150, output_tokens: 0 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const res = await executeDecisionGateway(sampleRequest, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    expect(res.tier).toBe('jev_system_one')
    expect(res.attemptedTiers).toEqual(['jev_system_one'])
    expect(res.answers.toolChoice?.type).toBe('choice')
    if (res.answers.toolChoice?.type === 'choice') {
      expect(res.answers.toolChoice.choice).toBe('timezone_converter')
    }
  })

  it('Tier 2: degrades gracefully to Secondary LLM adapter when Jev times out or 500s', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/decisions') || url.includes('/v1/systemone')) {
        return new Response('Gateway Timeout', { status: 504 })
      }
      if (url.includes('/api/v1/chat/completions')) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    answers: {
                      toolChoice: {
                        type: 'choice',
                        choice: 'timezone_converter',
                        confidence: 0.92,
                      },
                      hasError: {
                        type: 'noul',
                        noul: 0.02,
                      },
                    },
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 300, completion_tokens: 40 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      throw new Error(`Unexpected url: ${url}`)
    })

    const res = await executeDecisionGateway(sampleRequest, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    expect(res.tier).toBe('secondary_llm_adapter')
    expect(res.attemptedTiers).toEqual(['jev_system_one', 'secondary_llm_adapter'])
    if (res.answers.toolChoice?.type === 'choice') {
      expect(res.answers.toolChoice.choice).toBe('timezone_converter')
    }
  })

  it('Tier 3: falls back to Deterministic Rule Engine when all external network calls fail', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network Offline'))

    const res = await executeDecisionGateway(sampleRequest, {
      openrouterApiKey: 'test-key',
      fetchImpl: mockFetch as unknown as typeof fetch,
    })

    expect(res.tier).toBe('deterministic_rule_engine')
    expect(res.attemptedTiers).toEqual([
      'jev_system_one',
      'secondary_llm_adapter',
      'deterministic_rule_engine',
    ])
    if (res.answers.toolChoice?.type === 'choice') {
      expect(res.answers.toolChoice.choice).toBe('timezone_converter')
    }
  })

  it('Deterministic Rule Engine correctly detects failure tokens in noul questions', () => {
    const errorState = {
      status: 200,
      payload: { error: 'upstream_timeout', code: 'ETIMEDOUT' },
    }

    const res = callDeterministicRuleEngine({
      state: errorState,
      questions: {
        isFailure: {
          type: 'noul',
          instructions: 'Detect error',
        },
      },
    })

    expect(res.tier).toBe('deterministic_rule_engine')
    const ans = res.answers.isFailure
    expect(ans?.type).toBe('noul')
    if (ans?.type === 'noul') {
      expect(ans.noul).toBeGreaterThanOrEqual(0.85)
    }
  })
})
