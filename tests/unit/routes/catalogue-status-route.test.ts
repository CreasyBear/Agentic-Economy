import { afterEach, describe, expect, it, vi } from 'vitest'

import { setPublicSourceTransportForTests } from '@/lib/server/convex-source'
import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { catalogueFreshness, CATALOGUE_STALE_AFTER_MS } from '@/modules/market/x402-directory-index.server'
import { handleCatalogueStatusRequest } from '@/routes/api.v1.catalogue-status'

describe('catalogue-status route', () => {
  afterEach(() => {
    setHttpRateLimitAdmissionForTests(undefined)
    setPublicSourceTransportForTests(undefined)
    vi.clearAllMocks()
  })

  it('returns fresh status when catalogue was completed within 36 hours', async () => {
    const now = Date.now()
    const completedAt = now - 3_600_000 // 1 hour ago
    const query = vi.fn(async () => ({
      kind: 'ready' as const,
      coverage: { generation: 'g1', completedAt },
      refreshState: 'complete' as const,
    }))

    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(),
      action: vi.fn(),
    } as never)

    const response = await handleCatalogueStatusRequest(
      new Request('http://ae.test/api/v1/catalogue-status'),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json()
    expect(body).toMatchObject({
      schemaVersion: 'catalogue-status:v1',
      status: 'fresh',
      refreshState: 'complete',
      generation: 'g1',
      completedAt,
      ageHours: 1,
    })
    expect(body.lastError).toBeUndefined()
  })

  it('returns stale status when catalogue was completed over 36 hours ago', async () => {
    const now = Date.now()
    const completedAt = now - 40 * 60 * 60 * 1000 // 40 hours ago
    const query = vi.fn(async () => ({
      kind: 'ready' as const,
      coverage: { generation: 'g2', completedAt },
      refreshState: 'complete' as const,
    }))

    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(),
      action: vi.fn(),
    } as never)

    const response = await handleCatalogueStatusRequest(
      new Request('http://ae.test/api/v1/catalogue-status'),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      schemaVersion: 'catalogue-status:v1',
      status: 'stale',
      refreshState: 'complete',
      generation: 'g2',
      completedAt,
      ageHours: 40,
    })
  })

  it('returns failed status when refresh failed', async () => {
    const now = Date.now()
    const completedAt = now - 3_600_000 // 1 hour ago (still fresh by time, but failed)
    const query = vi.fn(async () => ({
      kind: 'ready' as const,
      coverage: { generation: 'g3', completedAt },
      refreshState: 'failed' as const,
      lastError: 'boom',
    }))

    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(),
      action: vi.fn(),
    } as never)

    const response = await handleCatalogueStatusRequest(
      new Request('http://ae.test/api/v1/catalogue-status'),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      schemaVersion: 'catalogue-status:v1',
      status: 'failed',
      refreshState: 'failed',
      generation: 'g3',
      lastError: 'boom',
    })
  })

  it('returns absent status when catalogue is unavailable', async () => {
    const query = vi.fn(async () => ({
      kind: 'unavailable' as const,
      refreshState: 'none' as const,
    }))

    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(),
      action: vi.fn(),
    } as never)

    const response = await handleCatalogueStatusRequest(
      new Request('http://ae.test/api/v1/catalogue-status'),
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      schemaVersion: 'catalogue-status:v1',
      status: 'absent',
      refreshState: 'none',
    })
    expect(body.generation).toBeUndefined()
    expect(body.completedAt).toBeUndefined()
    expect(body.lastError).toBeUndefined()
  })

  it('HEAD request returns 200 with no body', async () => {
    const query = vi.fn(async () => ({
      kind: 'ready' as const,
      coverage: { generation: 'g1', completedAt: Date.now() - 3_600_000 },
      refreshState: 'complete' as const,
    }))

    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    setPublicSourceTransportForTests({
      query,
      mutation: vi.fn(),
      action: vi.fn(),
    } as never)

    const response = await handleCatalogueStatusRequest(
      new Request('http://ae.test/api/v1/catalogue-status', { method: 'HEAD' }),
      true,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.text()).toBe('')
  })

  describe('catalogueFreshness function', () => {
    it('returns fresh when completedAt is exactly at 36h boundary', () => {
      const now = 1000
      const completedAt = now - CATALOGUE_STALE_AFTER_MS
      const result = catalogueFreshness({
        kind: 'ready',
        coverage: { generation: 'g', completedAt },
        refreshState: 'complete',
      }, now)

      expect(result.status).toBe('fresh')
    })

    it('returns stale when completedAt is 36h + 1ms ago', () => {
      const now = 1000
      const completedAt = now - CATALOGUE_STALE_AFTER_MS - 1
      const result = catalogueFreshness({
        kind: 'ready',
        coverage: { generation: 'g', completedAt },
        refreshState: 'complete',
      }, now)

      expect(result.status).toBe('stale')
    })
  })
})
