import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as TanstackReactStartModule from '@tanstack/react-start'

import { api } from '../../../convex/_generated/api'
import schema from '../../../convex/schema'
import { convexModules as modules } from '../../helpers/convex-fixtures'
import {
  createPublishedBusinessOwner,
  openApiSource,
  prepareOwnerPublicationCommand,
  seedCatalogOffering,
} from '../../integration/capability-supply-owner-funnel-harness'

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
  readProviderWorkspaceConnectionsDetailServer,
  readProviderWorkspaceConnectionsSummaryServer,
  readProviderWorkspaceConnectionsSummaryThroughSource,
  readProviderWorkspaceIdentityDetailServer,
  readProviderWorkspacePageServer,
  readProviderWorkspacePageThroughSource,
  readProviderWorkspacePayoutSummaryServer,
  readProviderWorkspacePayoutSummaryThroughSource,
  readProviderWorkspacePublicStatusServer,
  readProviderWorkspacePublicStatusThroughSource,
  readProviderToolStatusServer,
  startOwnerProviderOffboardingServer,
} from '@/components/ae/offerings/provider-workspace.functions'

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

describe('narrow owner Tools inventory read', () => {
  it('passes real Convex Tool readback through the server consumer and keeps refusal states closed', async () => {
    const backend = convexTest(schema, modules)
    const { businessId, owner } = await createPublishedBusinessOwner(
      backend,
      'server-tool-detail-readback',
    )
    const { owner: foreignOwner } = await createPublishedBusinessOwner(
      backend,
      'server-tool-detail-readback-foreign',
    )
    const offeringRef = 'catalog-offering:server-tool-detail-readback'
    const sourceHash = 'catalog-source:server-tool-detail-readback:v1'
    await seedCatalogOffering(backend, businessId, offeringRef, 1, 1, sourceHash)
    const prepared = await prepareOwnerPublicationCommand(
      backend,
      businessId,
      offeringRef,
      1,
      sourceHash,
      openApiSource('server.tool-detail-readback'),
      'owner-supply:server-tool-detail-readback',
      { kind: 'catalog_offering', offeringRef, offeringRevision: 1, offeringSourceHash: sourceHash },
    )
    if (prepared.kind === 'refused') throw new Error(`server_tool_detail_prepare_failed:${prepared.reason}`)
    // `capabilityOfferings.presentation.price` is now derived from the binding's
    // pricingConfig via `displayPriceFromPricingConfig()`. The harness already
    // handles the Convex validator's optional field exclusion via `withDefinedPrice()`.
    const published = await owner.mutation(api.capabilitySupply.publishPreparedCapability, prepared.command)
    if (published.kind === 'refused') throw new Error(`server_tool_detail_publish_failed:${published.reason}`)

    const through = (client: Pick<typeof owner, 'query'>) => {
      mocks.identity.mockImplementationOnce((query, args) => client.query(query, args))
    }

    through(owner)
    await expect(readProviderToolStatusServer({ data: { businessId, offeringRef } })).resolves.toMatchObject({
      kind: 'available',
      tool: { offeringRef, name: 'Owner lookup service', status: 'published' },
      status: { toolRef: published.toolRef, schemaVersion: 'provider_tools:v1' },
    })

    through(owner)
    await expect(readProviderToolStatusServer({ data: { businessId, offeringRef: 'catalog-offering:missing' } }))
      .resolves.toEqual({ kind: 'not_found' })
    through(backend)
    await expect(readProviderToolStatusServer({ data: { businessId, offeringRef } }))
      .resolves.toEqual({ kind: 'not_found' })
    through(foreignOwner)
    await expect(readProviderToolStatusServer({ data: { businessId, offeringRef } }))
      .resolves.toEqual({ kind: 'not_found' })
  })

  it('fails closed for no provider, duplicate ownership, and source rejection', async () => {
    mocks.identity.mockResolvedValueOnce({ kind: 'not_found' })
    await expect(readProviderWorkspacePageThroughSource()).resolves.toEqual({ inventory: { kind: 'not_found' } })

    mocks.identity.mockResolvedValueOnce({ kind: 'conflict', code: 'multiple_businesses' })
    await expect(readProviderWorkspacePageThroughSource()).resolves.toEqual({ inventory: { kind: 'conflict', reason: 'multiple_providers' } })

    mocks.identity.mockRejectedValueOnce(new Error('private source failure'))
    await expect(readProviderWorkspacePageThroughSource()).resolves.toEqual({ inventory: { kind: 'unavailable' } })

    mocks.identity.mockResolvedValueOnce({ kind: 'error', code: 'unauthenticated' })
    await expect(readProviderWorkspacePageThroughSource()).resolves.toEqual({ inventory: { kind: 'unavailable' } })
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
          schemaVersion: 'provider_tools:v1', businessRef: 'biz:one', providerRef: 'provider:one', toolRef: 'operation:one', revision: 3,
          state: 'Published', reasonCodes: [], observedAt: 1, source: { kind: 'openapi' }, routeability: { available: true, reasonCodes: [] }, authority: { kind: 'public' },
          health: { connection: 'not_required', validation: 'passed', publication: 'published', freshness: 'current', delivery: { kind: 'unobserved', provenance: 'canonical_call_receipts' }, usefulOutcome: { kind: 'unobserved', provenance: 'qualified_use_receipts' }, operationalConditions: [] },
        }),
      }],
    })

    const result = await readProviderWorkspacePageThroughSource({ cursor: 'cursor:current' })
    expect(result.inventory).toEqual({
      kind: 'available', provider: { name: 'One' }, projection: 'current', isDone: false, continueCursor: 'cursor:next',
      tools: [{ offeringRef: 'offering:one', currentRevision: 3, name: 'Search', category: 'tools', summary: 'Search safely', status: 'published', accessPathCount: 1 }],
    })
    expect(result.lifecycle).toMatchObject({ kind: 'available', value: [{ offeringRef: 'offering:one', status: { state: 'Published', toolRef: 'operation:one' } }] })
    expect(mocks.identity.mock.calls[1]?.[1]).toMatchObject({ paginationOpts: { numItems: 50, cursor: 'cursor:current' } })
    expect(JSON.stringify(result)).not.toMatch(/sourceHash|descriptor|secret/)
  })

  it('returns connection counts without sending rich connection records', async () => {
    mocks.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'One', slug: 'one', publicStatus: 'published' })
    mocks.connections.mockResolvedValue([
      { businessId: 'biz:one', connectionRef: 'connection:secret-one', lifecycle: 'active', available: true, reasonCode: null },
      { businessId: 'biz:one', connectionRef: 'connection:secret-two', lifecycle: 'refused', available: false, reasonCode: 'credential_rejected' },
    ])

    const result = await readProviderWorkspaceConnectionsSummaryThroughSource()

    expect(result).toEqual({ kind: 'available', value: { total: 2, available: 1, needsAttention: 1 } })
    expect(JSON.stringify(result)).not.toMatch(/connectionRef|lifecycle|reasonCode|secret|credential_rejected/)
  })

  it('rejects a public-status readback owned by another provider', async () => {
    mocks.identity.mockResolvedValue({ kind: 'available', businessId: 'biz:one', name: 'One', slug: 'one', publicStatus: 'published' })
    mocks.ownerStatus.mockResolvedValue({
      kind: 'available',
      readback: { catalog: { businessId: 'biz:other' } },
    })

    await expect(readProviderWorkspacePublicStatusThroughSource()).resolves.toEqual({ kind: 'conflict', reason: 'business_mismatch' })
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

    const result = await readProviderWorkspacePayoutSummaryThroughSource()

    expect(result).toEqual({
      kind: 'available',
      value: { currencies: ['USD'], earningsAccounts: 1, payoutAccounts: 1, readyAccounts: 1, needsAttention: 0 },
    })
    expect(JSON.stringify(result)).not.toMatch(/stripeAccountId|acct_private|payoutRef|evidence|private/)
  })

  it('marks every Tools read as private and non-cacheable', async () => {
    mocks.identity.mockResolvedValue({ kind: 'not_found' })

    await Promise.all([
      readProviderWorkspacePageServer({ data: {} }),
      readProviderWorkspaceConnectionsSummaryServer(),
      readProviderWorkspaceConnectionsDetailServer(),
      readProviderWorkspacePayoutSummaryServer(),
      readProviderWorkspacePublicStatusServer(),
      readProviderWorkspaceIdentityDetailServer(),
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
