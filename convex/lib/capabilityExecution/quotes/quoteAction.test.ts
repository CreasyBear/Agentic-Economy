import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../_generated/api', () => ({ internal: { capabilityQuotes: { admitCallableResolve: 'admit', prepareFinancialSubjects: 'prepare' }, x402Directory: { resolve: 'resolve' } } }))

import { quoteActionHandler } from './quoteAction'

describe('quoteActionHandler URL ref admission', () => {
  it('never runs directory resolve when admission refuses', async () => {
    const runAction = vi.fn()
    const runMutation = vi.fn().mockResolvedValue({ kind: 'refused', code: 'budget_exceeded' })
    const result = await quoteActionHandler({ runAction, runMutation } as never, { toolRef: 'https://example.com/api' } as never)
    expect(runAction).not.toHaveBeenCalled()
    expect(runMutation).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ code: 'budget_exceeded' })
  })
})
