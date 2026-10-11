import { afterEach, describe, expect, it, vi } from 'vitest'

import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'

const readPublicFundingHandoff = vi.hoisted(() => vi.fn(async () => ({})))
vi.mock('@/lib/server/funding-handoff-api', () => ({
  readPublicFundingHandoff,
  publicFundingHandoffResponse: () => new Response('{}', { status: 200 }),
}))

import { handlePublicFundingSessionRequest } from '@/routes/api.v1.account.funding-sessions.public.$fundingSessionId'

describe('GET public funding session rate limit', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    vi.clearAllMocks()
  })

  it('invokes the public-read limiter and returns 429 without reading the handoff when limited', async () => {
    const admission = vi.fn(async () => ({ ok: false as const, retryAfter: 2_000 }))
    setHttpRateLimitAdmissionForTests(admission as never)
    const response = await handlePublicFundingSessionRequest(new Request('http://ae.test/x'), 'fs_1')
    expect(admission).toHaveBeenCalled()
    expect(JSON.stringify(admission.mock.calls[0])).toContain('public-read')
    expect(response.status).toBe(429)
    expect(readPublicFundingHandoff).not.toHaveBeenCalled()
  })

  it('reads the handoff when admitted', async () => {
    setHttpRateLimitAdmissionForTests((async () => ({ ok: true })) as never)
    const response = await handlePublicFundingSessionRequest(new Request('http://ae.test/x'), 'fs_1')
    expect(response.status).toBe(200)
    expect(readPublicFundingHandoff).toHaveBeenCalledWith('fs_1')
  })
})
