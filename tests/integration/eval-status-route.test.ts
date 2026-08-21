import { afterEach, describe, expect, it } from 'vitest'

import { handleEvalStatusRequest } from '@/routes/api.answer.eval-status'

describe('GET /api/answer/eval-status', () => {
  afterEach(() => {
    delete process.env.AE_ANSWER_EVAL_PASSED
  })

  it('reports eval unsigned before AE_ANSWER_EVAL_PASSED', async () => {
    const response = handleEvalStatusRequest()
    const body = (await response.json()) as { evalPassed: boolean }
    expect(body.evalPassed).toBe(false)
  })

  it('reports eval passed after AE_ANSWER_EVAL_PASSED=1', async () => {
    process.env.AE_ANSWER_EVAL_PASSED = '1'

    const response = handleEvalStatusRequest()
    const body = (await response.json()) as { evalPassed: boolean }
    expect(body.evalPassed).toBe(true)
  })
})
