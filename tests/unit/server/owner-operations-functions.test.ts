import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as TanstackReactStartModule from '@tanstack/react-start'

const mocks = vi.hoisted(() => ({
  identity: vi.fn(),
  offerings: vi.fn(),
  connections: vi.fn(),
  earnings: vi.fn(),
  lifecycle: vi.fn(),
  payoutReadiness: vi.fn(),
  ownerStatus: vi.fn(),
  setResponseHeader: vi.fn(),
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
}))
vi.mock('@/components/ae/offerings/owner-offering.functions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/ae/offerings/owner-offering.functions')>()),
  readOwnerOfferingSupplyThroughSource: mocks.offerings,
}))
vi.mock('@/modules/capability-supply/supply-funnel.functions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/capability-supply/supply-funnel.functions')>()),
  readOwnerProviderConnections: mocks.connections,
  readOwnerProviderEarnings: mocks.earnings,
  readOwnerSupplyFunnel: mocks.lifecycle,
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
  readOwnerOperationsInventoryServer,
  readOwnerOperationsInventoryThroughSource,
  readOwnerOperationsLifecycleServer,
  readOwnerOperationsLifecycleThroughSource,
  readOwnerOperationsPayoutSummaryServer,
  readOwnerOperationsPayoutSummaryThroughSource,
  readOwnerOperationsPublicStatusServer,
  readOwnerOperationsPublicStatusThroughSource,
} from '@/components/ae/offerings/owner-operations.functions'

afterEach(() => {
  mocks.identity.mockReset()
  mocks.offerings.mockReset()
  mocks.connections.mockReset()
  mocks.earnings.mockReset()
  mocks.lifecycle.mockReset()
  mocks.payoutReadiness.mockReset()
  mocks.ownerStatus.mockReset()
  mocks.setResponseHeader.mockReset()
})

describe('narrow owner Operations inventory read', () => {
  it('fails closed for no supplier, duplicate ownership, and source rejection', async () => {
    mocks.identity.mockResolvedValueOnce({ kind: 'not_found' })
    await expect(readOwnerOperationsInventoryThroughSource()).resolves.toEqual({ kind: 'not_found' })

    mocks.identity.mockResolvedValueOnce({ kind: 'conflict', code: 'multiple_businesses' })
    await expect(readOwnerOperationsInventoryThroughSource()).resolves.toEqual({ kind: 'conflict', reason: 'multiple_suppliers' })

    mocks.identity.mockRejectedValueOnce(new Error('private source failure'))
    await expect(readOwnerOperationsInventoryThroughSource()).resolves.toEqual({ kind: 'unavailable' })

    mocks.identity.mockResolvedValueOnce({ kind: 'error', code: 'unauthenticated' })
    await expect(readOwnerOperationsInventoryThroughSource()).resolves.toEqual({ kind: 'unavailable' })
  })

  it('rejects mixed-business source results', async () => {
    mocks.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'One', slug: 'one', publicStatus: 'unpublished' })
    mocks.offerings.mockResolvedValue({ kind: 'available', businessId: 'biz:other' })
    await expect(readOwnerOperationsInventoryThroughSource()).resolves.toEqual({ kind: 'conflict', reason: 'business_mismatch' })
  })

  it('returns only the inventory field allowlist', async () => {
    mocks.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'One', slug: 'one', publicStatus: 'published' })
    mocks.offerings.mockResolvedValue({
      kind: 'available',
      businessId: 'biz:one',
      business: { name: 'One', slug: 'one', publicStatus: 'published', businessContext: { kind: 'online' }, secret: 'no' },
      offerings: [{
        offeringRef: 'offering:one', businessId: 'biz:one', currentRevision: 3, status: 'published', createdAt: 1, updatedAt: 2,
        revision: { offeringRef: 'offering:one', businessId: 'biz:one', revision: 3, name: 'Search', category: 'tools', summary: 'Search safely', sourceHash: 'sha256:private', createdAt: 1 },
        accessPaths: [{ accessPathRef: 'path:one', businessId: 'biz:one', offeringRef: 'offering:one', offeringRevision: 3, offeringSourceHash: 'sha256:private', status: 'published', descriptor: { kind: 'external_operation' }, sourceHash: 'sha256:private', createdAt: 1, updatedAt: 1 }],
      }],
      projection: { status: 'current', observedAt: 1, disposition: 'current', authorityDigest: 'sha256:private' },
    })

    const result = await readOwnerOperationsInventoryThroughSource()
    expect(result).toEqual({
      kind: 'available',
      supplier: { name: 'One' },
      operations: [{ offeringRef: 'offering:one', currentRevision: 3, name: 'Search', category: 'tools', summary: 'Search safely', status: 'published', accessPathCount: 1 }],
      projection: 'current',
    })
    expect(JSON.stringify(result)).not.toMatch(/businessId|sourceHash|Digest|descriptor|secret/)
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

  it('returns only lifecycle fields needed by the Operations projector', async () => {
    mocks.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'One', slug: 'one', publicStatus: 'published' })
    mocks.lifecycle.mockResolvedValue({
      kind: 'available',
      businessId: 'biz:one',
      offerings: [{
        offeringRef: 'offering:one',
        revision: 3,
        name: 'Search',
        summary: 'Search safely',
        status: 'published',
        currentStep: 'test',
        stepStates: { describe: 'completed', admission: 'completed', readiness: 'completed', test: 'completed' },
        admission: { state: 'admitted', evidenceRefs: ['evidence:private'] },
        authority: { kind: 'provider_connection', mode: 'provider_owned', connectionRef: 'connection:private', providerRef: 'provider:private' },
        readiness: { outcome: 'healthy', evidenceRefs: ['evidence:private'] },
        publication: { state: 'current', operationRef: 'operation:one', revision: 3, authorityDigest: 'sha256:private' },
        lifecycle: { state: 'active', reasons: [] },
        live: { available: true },
        grantedResources: ['resource:private'],
        credentialRef: 'credential:private',
      }],
    })

    const result = await readOwnerOperationsLifecycleThroughSource()

    expect(result).toEqual({
      kind: 'available',
      value: [{
        offeringRef: 'offering:one',
        revision: 3,
        status: 'published',
        currentStep: 'test',
        readinessState: 'completed',
        publicationState: 'current',
        operationRef: 'operation:one',
        lifecycleState: 'active',
        readinessOutcome: 'healthy',
        liveAvailable: true,
        continuation: {
          kind: 'navigate',
          label: 'View live Operation',
          href: '/operations/operation:one',
          command: 'ae describe operation:one',
        },
      }],
    })
    expect(JSON.stringify(result)).not.toMatch(/connectionRef|providerRef|credentialRef|evidence|Digest|grantedResources|private/)
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
      readOwnerOperationsInventoryServer(),
      readOwnerOperationsLifecycleServer(),
      readOwnerOperationsConnectionsSummaryServer(),
      readOwnerOperationsConnectionsDetailServer(),
      readOwnerOperationsPayoutSummaryServer(),
      readOwnerOperationsPublicStatusServer(),
      readOwnerOperationsIdentityDetailServer(),
    ])

    expect(mocks.setResponseHeader).toHaveBeenCalledTimes(7)
    expect(mocks.setResponseHeader.mock.calls).toEqual(
      Array.from({ length: 7 }, () => ['cache-control', 'private, no-store']),
    )
  })
})
