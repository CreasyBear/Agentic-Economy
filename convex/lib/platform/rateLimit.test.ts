import { describe, expect, it } from 'vitest'
import { limitOrRetryAfter } from './rateLimit'

describe('limitOrRetryAfter', () => {
  it('maps OCC exhaustion to a typed retryAfter without throwing', async () => {
    const out = await limitOrRetryAfter(async () => {
      throw new Error('Documents read from or written by this mutation changed while this mutation was being run')
    })
    expect(out).toMatchObject({ ok: false })
    expect((out as { retryAfter: number }).retryAfter).toBeGreaterThan(0)
  })
  it('rethrows other errors and passes results through', async () => {
    await expect(limitOrRetryAfter(async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(await limitOrRetryAfter(async () => ({ ok: true, retryAfter: undefined }))).toEqual({ ok: true, retryAfter: undefined })
  })
})
