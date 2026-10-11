import { afterEach, describe, expect, it, vi } from 'vitest'

import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'

vi.mock('@/lib/server/convex-source', async (orig) => ({
  ...(await orig<typeof import('@/lib/server/convex-source')>()),
  createAuthenticatedSourceTransport: vi.fn(async () => { throw new Error('source called') }),
}))

import { handlePersonalDataExportRequest } from '@/lib/server/personal-data-export.functions'

afterEach(() => setHttpRateLimitAdmissionForTests(undefined))

describe('handlePersonalDataExportRequest rate limit', () => {
  it('returns 429 with Retry-After when admission is denied, before reading', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: false, retryAfter: 3_600_000 }))
    const response = await handlePersonalDataExportRequest(new Request('http://x/api/owner/data-export'))
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('3600')
  })

  it('does not consult admission for HEAD', async () => {
    const admission = vi.fn(async () => ({ ok: false as const, retryAfter: 1 }))
    setHttpRateLimitAdmissionForTests(admission)
    const response = await handlePersonalDataExportRequest(new Request('http://x/api/owner/data-export'), true)
    expect(admission).not.toHaveBeenCalled()
    expect(response.status).not.toBe(429)
  })
})
