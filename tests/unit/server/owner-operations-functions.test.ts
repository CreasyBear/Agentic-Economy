import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as TanstackReactStartModule from '@tanstack/react-start'

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  connections: vi.fn(),
  earnings: vi.fn(),
  payoutReadiness: vi.fn(),
  ownerStatus: vi.fn(),
  setResponseHeader: vi.fn(),
  mutation: vi.fn(),
}))

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof TanstackReactStartModule>()),
  createServerFn: () => ({
    handler: (handler: unknown) => handler,
    validator: () => ({ handler: (handler: unknown) => handler }),
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({
  setResponseHeader: mocks.setResponseHeader,
}))
vi.mock('@/lib/server/convex-source', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/convex-source')>()),
  callSourceQuery: mocks.identity,
  callSourceMutation: mocks.mutation,
}))
vi.mock('@/modules/capability-supply/supply-funnel.functions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-supply/supply-funnel.functions')>()),
  readOwnerProviderConnections: mocks.connections,
  readOwnerProviderEarnings: mocks.earnings,
}))
vi.mock('@/modules/money/money.functions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/money/money.functions')>()),
  readOwnerConnectReadinessThroughSource: mocks.payoutReadiness,
}))
vi.mock('@/lib/server/owner-status.functions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/server/owner-status.functions')>()),
  readOwnerStatusThroughSource: mocks.ownerStatus,
}))

import {
  readOwnerOperationsConnectionsDetailServer,
  readOwnerOperationsConnectionsSummaryServer,
  readOwnerOperationsConnectionsSummaryThroughSource,
  readOwnerOperationsIdentityDetailServer,
  readOwnerOperationsPageServer,
  readOwnerOperationsPageThroughSource,
  readOwnerOperationsPayoutSummaryServer,
  readOwnerOperationsPayoutSummaryThroughSource,
  readOwnerOperationsPublicStatusServer,
  readOwnerOperationsPublicStatusThroughSource,
  startOwnerProviderOffboardingServer,
} from '@/components/ae/offerings/owner-operations.functions'

afterEach(() => {
  mocks.identity.mockReset()
  mocks.connections.mockReset()
  mocks.earnings.mockReset()
  mocks.payoutReadiness.mockReset()
  mocks.ownerStatus.mockReset()
  mocks.setResponseHeader.mockReset()
  mocks.mutation.mockReset()
  vi.unstubAllEnvs()
})

describe('narrow owner Operations inventory read', () => {
  it('fails closed for no supplier, duplicate ownership, and source rejection', async () => {
    mocks.identity.mockResolvedValueOnce({ kind: 'not_found' })
    await expect(readOwnerOperationsPageThroughSource()).resolves.toEqual({ inventory: { kind: 'not_found' } })

    mocks.identity.mockResolvedValueOnce({ kind: 'conflict', code: 'multiple_businesses' })
    await expect(readOwnerOperationsPageThroughSource()).resolves.toEqual({ inventory: { kind: 'conflict', reason: 'multiple_suppliers' } })

    mocks.identity.mockRejectedValueOnce(new Error('private source failure'))
    await expect(readOwnerOperationsPageThroughSource()).resolves.toEqual({ inventory: { kind: 'unavailable' } })

    mocks.identity.mockResolvedValueOnce({ kind: 'error', code: 'unauthenticated' })
    await expect(readOwnerOperationsPageThroughSource()).resolves.toEqual({ inventory: { kind: 'unavailable' } })
  })

  it('returns one bounded canonical directory page without internal source evidence', async () => {
    mocks.identity
      .mockResolvedValueOnce({ kind: 'available', businessId: 'biz:one', name: 'One', slug: 'one', publicStatus: 'published' })
      .mockResolvedValueOnce({
      kind: 'available',
      isDone: false,
      continueCursor: 'cursor:next',
      page: [{
        offeringRef: 'offering:one', currentRevision: 3, status: 'published', name: 'Search', category: 'tools', summary: 'Search safely', accessPathCount: 1,
        statusJson: JSON.stringify({
          schemaVersion: 'supplier_operations:v1', businessRef: 'biz:one', providerRef: 'provider:one', operationRef: 'operation:one', revision: 3,
          state: 'Published', reasonCodes: [], observedAt: 1, source: { kind: 'openapi' }, routeability: { available: true, reasonCodes: [] }, authority: { kind: 'public' },
          health: { connection: 'not_required', validation: 'passed', publication: 'published', freshness: 'current', delivery: { kind: 'unobserved', provenance: 'canonical_call_receipts' }, usefulOutcome: { kind: 'unobserved', provenance: 'qualified_use_receipts' }, operationalConditions: [] },
        }),
      }],
    })

    const result = await readOwnerOperationsPageThroughSource({ cursor: 'cursor:current' })
    expect(result.inventory).toEqual({
      kind: 'available', supplier: { name: 'One' }, projection: 'current', isDone: false, continueCursor: 'cursor:next',
      operations: [{ offeringRef: 'offering:one', currentRevision: 3, name: 'Search', category: 'tools', summary: 'Search safely', status: 'published', accessPathCount: 1 }],
    })
    expect(result.lifecycle).toMatchObject({ kind: 'available', value: [{ offeringRef: 'offering:one', status: { state: 'Published', operationRef: 'operation:one' } }] })
    expect(mocks.identity.mock.calls[1]?.[1]).toMatchObject({ paginationOpts: { numItems: 50, cursor: 'cursor:current' } })
    expect(JSON.stringify(result)).not.toMatch(/sourceHash|descriptor|secret/)
  })

  it('returns connection counts without sending rich connection records', async () => {
    mocks.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'One', slug: 'one', publicStatus: 'published' })
    mocks.connections.mockResolvedValue([
      { businessId: 'biz:one', connectionRef: 'connection:secret-one', lifecycle: 'active', available: true, reasonCode: null },
      { businessId: 'biz:one', connectionRef: 'connection:secret-two', lifecycle: 'refused', available: false, reasonCode: 'credential_rejected' },
    ])

    const result = await readOwnerOperationsConnectionsSummaryThroughSource()

    expect(result).toEqual({ kind: 'available', value: { total: 2, available: 1, needsAttention: 1 } })
    expect(JSON.stringify(result)).not.toMatch(/connectionRef|lifecycle|reasonCode|secret|credential_rejected/)
  })

  it('rejects a public-status readback owned by another supplier', async () => {
    mocks.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'One', slug: 'one', publicStatus: 'published' })
    mocks.ownerStatus.mockResolvedValue({
      kind: 'available',
      readback: { catalog: { businessId: 'biz:other' } },
    })

    await expect(readOwnerOperationsPublicStatusThroughSource()).resolves.toEqual({ kind: 'conflict', reason: 'business_mismatch' })
  })

  it('returns payout counts without Stripe or payout account identifiers', async () => {
    mocks.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'One', slug: 'one', publicStatus: 'published' })
    mocks.earnings.mockResolvedValue({
      kind: 'available',
      businessId: 'biz:one',
      accounts: [{ currency: 'USD', earnings: { kind: 'ok', evidenceRef: 'evidence:private' }, payout: { kind: 'ok', payoutRef: 'payout:private' } }],
      accountsTruncated: false,
    })
    mocks.payoutReadiness.mockResolvedValue({
      kind: 'available',
      businessId: 'biz:one',
      accounts: [{ currency: 'USD', account: { state: 'ready', stripeAccountId: 'acct_private' }, payout: { payoutRef: 'payout:private' } }],
      accountsTruncated: false,
    })

    const result = await readOwnerOperationsPayoutSummaryThroughSource()

    expect(result).toEqual({
      kind: 'available',
      value: { currencies: ['USD'], earningsAccounts: 1, payoutAccounts: 1, readyAccounts: 1, needsAttention: 0 },
    })
    expect(JSON.stringify(result)).not.toMatch(/stripeAccountId|acct_private|payoutRef|evidence|private/)
  })

  it('marks every Operations read as private and non-cacheable', async () => {
    mocks.identity.mockResolvedValue({ kind: 'not_found' })

    await Promise.all([
      readOwnerOperationsPageServer({ data: {} }),
      readOwnerOperationsConnectionsSummaryServer(),
      readOwnerOperationsConnectionsDetailServer(),
      readOwnerOperationsPayoutSummaryServer(),
      readOwnerOperationsPublicStatusServer(),
      readOwnerOperationsIdentityDetailServer(),
    ])

    expect(mocks.setResponseHeader).toHaveBeenCalledTimes(6)
    expect(mocks.setResponseHeader.mock.calls).toEqual(
      Array.from({ length: 6 }, () => ['cache-control', 'private, no-store']),
    )
  })

  it('does not start Provider offboarding when its production rollout is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AE_PACKAGE5_WRITES_ENABLED', 'true')
    vi.stubEnv('AE_PROVIDER_OFFBOARDING_ENABLED', undefined)

    await expect(startOwnerProviderOffboardingServer({
      data: { idempotencyKey: 'offboarding-disabled' },
    })).resolves.toEqual({ kind: 'refused', reason: 'provider_offboarding_disabled' })
    expect(mocks.identity).not.toHaveBeenCalled()
    expect(mocks.mutation).not.toHaveBeenCalled()
  })
})
