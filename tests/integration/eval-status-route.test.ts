import { afterEach, describe, expect, it } from 'vitest'

import { handleEvalStatusRequest } from '@/routes/api.answer.eval-status'

describe('GET /api/answer/eval-status', () => {
  afterEach(() => {
    delete process.env.AE_ANSWER_EVAL_PASSED
    delete process.env.OPENROUTER_API_KEY
  })

  it('reports LLM chips disabled before eval sign-off', async () => {
    const response = handleEvalStatusRequest()
    const body = (await response.json()) as { llmChipsEnabled: boolean }
    expect(body.llmChipsEnabled).toBe(false)
  })

  it('reports LLM chips enabled after eval sign-off with OpenRouter configured', async () => {
    process.env.AE_ANSWER_EVAL_PASSED = '1'
    process.env.OPENROUTER_API_KEY = 'test-key'

    const response = handleEvalStatusRequest()
    const body = (await response.json()) as { llmChipsEnabled: boolean }
    expect(body.llmChipsEnabled).toBe(true)
  })
})
