import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
}))

vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/convex-source')>()),
  createAuthenticatedSourceTransport: mocks.createTransport,
}))

import {
  ADMIN_METRICS_CSV_HEADER,
  handleAdminMetricsExportRequest,
} from '@/routes/api.admin.metrics-export'

const EMPTY_REPORT = {
  days: [{
    day: '2026-09-21',
    computedAt: 1,
    version: 1 as const,
    settledCallValue: null,
    money: 'not_configured' as const,
    settledCalls: 0,
    attemptedCalls: 0,
    completedCalls: 0,
    uncertainCalls: 0,
    uncertainCallsOpenAtClose: 0,
    quotesCreated: 0,
    quotesConvertedAtClose: 0,
    transactingWorkspaces: 0,
    transactingAgents: 0,
    transactingProviders: 0,
    transactingTools: 0,
    returningWorkspaces: 0,
    newTransactingWorkspaces: 0,
    newTransactingProviders: 0,
    terminalCalls: 0,
    terminalCallsWithResolution: 0,
  }],
  latestDay: '2026-09-21',
  headline: {
    settledCallValue: null,
    money: 'not_configured' as const,
    settledCalls: 0,
    successRate: null,
    transactingWorkspaces: 0,
  },
  ratios: {
    successRate: null,
    quoteConversion: null,
    returningWorkspaceRate: null,
    resolutionCoverage: null,
    takeRate: null,
  },
  wow: {
    settledCalls: null,
    attemptedCalls: null,
    completedCalls: null,
    transactingWorkspaces: null,
    quotesCreated: null,
  },
}

afterEach(() => vi.clearAllMocks())

describe('admin metrics CSV export', () => {
  it('returns an RFC 9457 permission problem for a refused read', async () => {
    mocks.createTransport.mockResolvedValue({
      query: vi.fn(async () => ({ kind: 'refused', code: 'missing_membership' })),
    })

    const response = await handleAdminMetricsExportRequest(
      new Request('http://ae.test/api/admin/metrics-export?range=last_7'),
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(await response.json()).toMatchObject({ kind: 'PERMISSION_DENIED' })
  })

  it('returns exact CSV headers and labels absent money truthfully', async () => {
    mocks.createTransport.mockResolvedValue({ query: vi.fn(async () => EMPTY_REPORT) })

    const response = await handleAdminMetricsExportRequest(
      new Request('http://ae.test/api/admin/metrics-export?range=last_7'),
    )
    const [header, row] = (await response.text()).split('\r\n')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(header).toBe(ADMIN_METRICS_CSV_HEADER)
    expect(row?.split(',')[1]).toBe('Not configured')
  })

  it('rejects an invalid range', async () => {
    const response = await handleAdminMetricsExportRequest(
      new Request('http://ae.test/api/admin/metrics-export?range=forever'),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    expect(mocks.createTransport).not.toHaveBeenCalled()
  })
})
