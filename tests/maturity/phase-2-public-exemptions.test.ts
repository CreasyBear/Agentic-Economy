import { convexTest, type TestConvex } from 'convex-test'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import schema from '../../convex/schema'
import {
  PHASE_2_CRON_ACCOUNT_REF,
  PHASE_2_CRON_PRINCIPAL_REF,
  type WorkloadCronSnapshot,
} from '../../convex/workloadCron'
import {
  convexModules,
  convexTestWithMarketComponents,
} from '../helpers/convex-fixtures'

const serverMocks = vi.hoisted(() => ({
  callPublicSourceQuery: vi.fn(),
  callSourceMutation: vi.fn(),
  getRequest: vi.fn(),
  readCapabilityOperationDetail: vi.fn(),
  readMarketRouteProjection: vi.fn(),
  readPublicOfferingRegistryBusinessDetail: vi.fn(),
  readDeveloperDiscoveryRoute: vi.fn(),
  buildDeveloperDiscoveryRouteSnapshot: vi.fn(),
  requireClerkServerSession: vi.fn(),
}))

const marketSourceMocks = vi.hoisted(() => ({
  fetchAgenticMarketSnapshot: vi.fn(),
  fetchAgenticMarketCatalog: vi.fn(),
  fetchTregCatalog: vi.fn(),
}))

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({ handler: (handler: unknown) => handler }),
    handler: (handler: unknown) => handler,
  }),
}))
vi.mock('@tanstack/react-start/server', () => ({ getRequest: serverMocks.getRequest }))
vi.mock('@/lib/server/convex-source', () => ({
  callPublicSourceQuery: serverMocks.callPublicSourceQuery,
  callSourceMutation: serverMocks.callSourceMutation,
  callSourceQuery: serverMocks.callPublicSourceQuery,
  sourceQuery: (name: string) => ({ name }),
}))
vi.mock('@/modules/registry/registry.functions', () => ({
  readPublicOfferingRegistryBusinessDetail:
    serverMocks.readPublicOfferingRegistryBusinessDetail,
}))
vi.mock('@/modules/market/server', () => ({
  readMarketRouteProjection: serverMocks.readMarketRouteProjection,
}))
vi.mock('@/modules/capability-supply/operation-source', () => ({
  readCapabilityOperationDetail: serverMocks.readCapabilityOperationDetail,
}))
vi.mock('@/modules/discovery/developer-discovery', () => ({
  readDeveloperDiscoveryRoute: serverMocks.readDeveloperDiscoveryRoute,
}))
vi.mock('@/routes/api.discovery.schema', () => ({
  buildDeveloperDiscoveryRouteSnapshot:
    serverMocks.buildDeveloperDiscoveryRouteSnapshot,
}))
vi.mock('@/lib/server/require-clerk-server-session', () => ({
  requireClerkServerSession: serverMocks.requireClerkServerSession,
}))
vi.mock('@/modules/market/agentic-market-source', () => ({
  fetchAgenticMarketSnapshot: marketSourceMocks.fetchAgenticMarketSnapshot,
}))
vi.mock('@/modules/market/registry-source-adapters', () => ({
  fetchAgenticMarketCatalog: marketSourceMocks.fetchAgenticMarketCatalog,
  fetchTregCatalog: marketSourceMocks.fetchTregCatalog,
}))

import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { requireOperatorBeforeLoad } from '@/lib/server/require-operator-session'
import { readPublicBusinessPageServer } from '@/lib/server/owner-status.functions'
import { readPublicBusinessRouteServer } from '@/lib/server/public-business-route.functions'
import { loadDeveloperDiscoveryRouteServer } from '@/modules/discovery/developer-discovery-route'
import { readMarketRouteServer } from '@/modules/market/market.functions'
import { readPublicOperationDetailRouteServer } from '@/modules/registry/operation-detail-route.functions'
import { anonymousChat } from '../../convex/chatAnonymous'

type Backend = TestConvex<typeof schema>

const MUST_NOT_LEAK = 'secret:must-not-leak:cross-account'
const callerIdentity = {
  subject: 'caller-shaped-subject',
  issuer: 'https://identity.example',
  tokenIdentifier: 'https://identity.example|caller-shaped-subject',
}

const publicCatalog = {
  schemaVersion: 'public-business-catalog-api:v2' as const,
  businessId: 'public-business-id',
  slug: 'public-provider',
  name: 'Public Provider',
  category: 'Public services',
  businessContext: { kind: 'local_human' as const, suburb: 'Perth', stateTerritory: 'WA' },
  publicUrl: '/business/public-provider',
  trustTier: 'listed' as const,
  photos: [],
  observedAt: 1,
  disposition: 'current' as const,
  offerings: [],
  accessSummary: { humanRequest: false, externalOperation: false, aeSupportedAction: false },
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('AE_CANONICAL_BASE_URL', 'https://public.example')
  serverMocks.getRequest.mockReturnValue(new Request('https://public.example/catalog', {
    headers: {
      Authorization: 'Bearer caller-shaped-credential',
      'X-Account-Id': 'cross-account-private',
    },
  }))
  serverMocks.callPublicSourceQuery.mockResolvedValue({ kind: 'available', catalog: publicCatalog })
  serverMocks.readPublicOfferingRegistryBusinessDetail.mockResolvedValue({ kind: 'not_found' })
  serverMocks.readCapabilityOperationDetail.mockResolvedValue({
    kind: 'not_found',
    operationRef: 'caller-shaped-operation',
  })
  serverMocks.readMarketRouteProjection.mockResolvedValue({
    kind: 'available',
    catalog: { items: [], pagination: { hasMore: false } },
  })
  serverMocks.buildDeveloperDiscoveryRouteSnapshot.mockResolvedValue({
    kind: 'public_snapshot',
    slugs: ['public-provider'],
  })
  serverMocks.requireClerkServerSession.mockResolvedValue({
    kind: 'authenticated',
    userId: 'caller-shaped-user',
  })
  serverMocks.readDeveloperDiscoveryRoute.mockImplementation(
    async (_input: unknown, options: { routeSnapshot: unknown }) => options.routeSnapshot,
  )
  marketSourceMocks.fetchAgenticMarketSnapshot.mockImplementation(async ({ window }) => ({
    fetchedAt: 1_000,
    sourceTimestamp: '2026-08-26T00:00:00.000Z',
    metrics: [],
    daily: [],
    recentActivity: [],
    featuredExternalServices: [],
    window,
  }))
  marketSourceMocks.fetchAgenticMarketCatalog.mockResolvedValue(incompleteRegistrySource('agentic_market'))
  marketSourceMocks.fetchTregCatalog.mockResolvedValue(incompleteRegistrySource('treg'))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('Phase 2 public server read exemptions', () => {
  it('src/lib/server/canonical-url.functions.ts:readCanonicalBaseUrlServer ignores caller-shaped identity headers and returns only the public origin', async () => {
    expect(readCanonicalBaseUrlServer()).toBe('https://public.example')
    expect(serverMocks.callPublicSourceQuery).not.toHaveBeenCalled()
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('src/lib/server/require-operator-session.ts:admitOperatorSessionServer establishes only a Clerk session and cannot establish Account or resource authority', async () => {
    const admission = await requireOperatorBeforeLoad({
      location: { href: 'https://public.example/admin/audit-events?accountRef=caller-shaped' },
    })

    expect(admission).toEqual({ kind: 'authenticated', userId: 'caller-shaped-user' })
    expect(serverMocks.requireClerkServerSession).toHaveBeenCalledWith({
      localBypassPrincipal: 'local-e2e-operator',
      redirectTo: 'https://public.example/admin/audit-events?accountRef=caller-shaped',
    })
    expect(serverMocks.callPublicSourceQuery).not.toHaveBeenCalled()
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('src/lib/server/owner-status.functions.ts:readPublicBusinessPageServer returns only public catalog data for a cross-account slug', async () => {
    const result = await readPublicBusinessPageServer({ data: { slug: 'cross-account-private' } })

    expect(result).toEqual({ kind: 'available', catalog: publicCatalog })
    expect(serverMocks.callPublicSourceQuery).toHaveBeenCalledWith(
      { name: 'catalog:getPublicBusinessCatalogBySlug' },
      { slug: 'cross-account-private' },
    )
    expect(JSON.stringify(result)).not.toContain(MUST_NOT_LEAK)
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('src/lib/server/public-business-route.functions.ts:readPublicBusinessRouteServer cannot turn a public slug into a provider, money, or secret effect', async () => {
    const result = await readPublicBusinessRouteServer({ data: { slug: 'cross-account-private' } })

    expect(result).toEqual({ kind: 'not_found', reason: 'not_public' })
    expect(serverMocks.readPublicOfferingRegistryBusinessDetail).toHaveBeenCalledWith({
      slug: 'cross-account-private',
    })
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('src/modules/discovery/developer-discovery-route.ts:loadDeveloperDiscoveryRouteServer fixes its public request context instead of accepting caller authority', async () => {
    const result = await loadDeveloperDiscoveryRouteServer()

    expect(result).toEqual({ kind: 'public_snapshot', slugs: ['public-provider'] })
    expect(serverMocks.buildDeveloperDiscoveryRouteSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://ae.example/developers/discovery' }),
      { canonicalBaseUrl: 'https://ae.example', now: 0 },
    )
    expect(serverMocks.readDeveloperDiscoveryRoute).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ canonicalBaseUrl: 'https://ae.example', now: 0 }),
    )
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('src/modules/market/market.functions.ts:readMarketRouteServer passes only bounded public filters and performs no consequence', async () => {
    const data = {
      window: '24h' as const,
      query: 'caller-shaped ownerId=cross-account-private',
      availability: 'routeable' as const,
      cursor: 'public-cursor',
    }
    const result = await readMarketRouteServer({ data })

    expect(result).toMatchObject({ kind: 'available' })
    expect(serverMocks.readMarketRouteProjection).toHaveBeenCalledWith('24h', {
      query: data.query,
      availability: 'routeable',
      cursor: 'public-cursor',
    })
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
  })

  it('src/modules/registry/operation-detail-route.functions.ts:readPublicOperationDetailRouteServer treats the operation ref as lookup data, never authority', async () => {
    const operationRef = 'caller-shaped:principal=other-account'
    const result = await readPublicOperationDetailRouteServer({ data: { operationRef } })

    expect(result).toEqual({ kind: 'not_found', operationRef: 'caller-shaped-operation' })
    expect(serverMocks.readCapabilityOperationDetail).toHaveBeenCalledWith({ operationRef })
    expect(serverMocks.callSourceMutation).not.toHaveBeenCalled()
  })
})

describe('Phase 2 public Convex exemptions', () => {
  it('keeps OAuth client metadata public while grants remain source-admitted', async () => {
    const backend = convexTest(schema, convexModules)
    const client = {
      clientId: 'public-oauth-client',
      clientName: 'Public OAuth client',
      redirectUris: ['https://public.example/oauth/callback'],
      grantTypes: ['authorization_code' as const],
      tokenEndpointAuthMethod: 'none' as const,
      createdAt: 1,
    }
    await backend.run(async (ctx) => {
      await ctx.db.insert('agentAccessOAuthClients', client)
    })

    const anonymous = await backend.query(api.agentAccessOAuth.getClient, {
      clientId: client.clientId,
    })
    const identified = await backend.withIdentity(callerIdentity)
      .query(api.agentAccessOAuth.getClient, { clientId: client.clientId })

    expect(identified).toEqual(anonymous)
    expect(anonymous).toEqual(client)
    expect(JSON.stringify(anonymous)).not.toMatch(/grantRef|deviceCode|authorizationCode|secret/u)
  })

  it('convex/capabilitySupplyOperations.ts:search is identity-invariant, bounded, and cannot disclose cross-account private state', async () => {
    const backend = convexTest(schema, convexModules)
    await seedPrivateBusinesses(backend)
    const args = { query: 'caller-shaped ownerId=cross-account-private', limit: 1 }
    const before = await consequenceState(backend)

    const anonymous = await backend.query(api.capabilitySupplyOperations.search, args)
    const identified = await backend.withIdentity(callerIdentity)
      .query(api.capabilitySupplyOperations.search, args)

    expect(identified).toEqual(anonymous)
    expect(anonymous).toMatchObject({ matchedCount: 0 })
    expect(JSON.stringify(anonymous)).not.toContain(MUST_NOT_LEAK)
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('keeps public operation projections identity-invariant and consequence-free', async () => {
    const backend = convexTest(schema, convexModules)
    await seedPrivateBusinesses(backend)
    const before = await consequenceState(backend)
    const operationRef = `operation:v1:${'f'.repeat(64)}`
    const read = async (client: Pick<Backend, 'query'>) => ({
      compare: await client.query(api.capabilitySupplyOperations.compare, {
        operationRefs: [operationRef],
      }),
      detail: await client.query(api.capabilitySupplyOperations.detail, { operationRef }),
      inspectPlan: await client.query(api.capabilitySupplyOperations.inspectPlan, {
        operationRefs: [operationRef],
      }),
      listKeylessExecutable: await client.query(
        api.capabilitySupplyOperations.listKeylessExecutable,
        {},
      ),
      offeringOperationMap: await client.query(
        api.capabilitySupplyOperations.offeringOperationMap,
        { businessIds: [MUST_NOT_LEAK] },
      ),
    })

    const anonymous = await read(backend)
    const identified = await read(backend.withIdentity(callerIdentity))

    expect(identified).toEqual(anonymous)
    expect(JSON.stringify(anonymous)).not.toContain(MUST_NOT_LEAK)
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('convex/catalog.ts:getPublicBusinessCatalogBySlug denies unpublished cross-account rows without trusting caller identity', async () => {
    const backend = convexTest(schema, convexModules)
    await seedPrivateBusinesses(backend)
    const args = { slug: 'cross-account-private' }
    const before = await consequenceState(backend)

    const anonymous = await backend.query(api.catalog.getPublicBusinessCatalogBySlug, args)
    const identified = await backend.withIdentity(callerIdentity)
      .query(api.catalog.getPublicBusinessCatalogBySlug, args)

    expect(anonymous).toEqual({ kind: 'not_found', reason: 'not_public' })
    expect(identified).toEqual(anonymous)
    expect(JSON.stringify(anonymous)).not.toContain(MUST_NOT_LEAK)
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('convex/discovery.ts:readDiscoveryBusinessSlugPage returns only public offering slugs and no cross-account private detail', async () => {
    const backend = convexTest(schema, convexModules)
    await seedPrivateBusinesses(backend)
    const args = {
      surface: 'sitemap' as const,
      paginationOpts: { cursor: null, numItems: 1 },
    }
    const before = await consequenceState(backend)

    const anonymous = await backend.query(api.discovery.readDiscoveryBusinessSlugPage, args)
    const identified = await backend.withIdentity(callerIdentity)
      .query(api.discovery.readDiscoveryBusinessSlugPage, args)

    expect(anonymous.page).toEqual([])
    expect(identified).toEqual(anonymous)
    expect(JSON.stringify(anonymous)).not.toContain(MUST_NOT_LEAK)
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('convex/marketExternalRegistry.ts:search exposes source metadata only and is invariant across caller identities', async () => {
    const backend = convexTest(schema, convexModules)
    await seedPrivateBusinesses(backend)
    await seedPublicRegistryGeneration(backend)
    const args = { query: 'public', access: 'all' as const, limit: 1, cursor: null }
    const before = await consequenceState(backend)

    const anonymous = await backend.query(api.marketExternalRegistry.search, args)
    const identified = await backend.withIdentity(callerIdentity)
      .query(api.marketExternalRegistry.search, args)

    expect(identified).toEqual(anonymous)
    expect(anonymous).toMatchObject({
      kind: 'ok',
      page: [{ authority: 'registry_metadata_only' }],
    })
    expect(JSON.stringify(anonymous)).not.toMatch(/sourceDigest|probeRequest|upstreamServiceId|must-not-leak/u)
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('convex/marketExternalSnapshots.ts:read returns aggregate public evidence without account-scoped disclosure or writes', async () => {
    const backend = convexTestWithMarketComponents()
    await seedPrivateBusinesses(backend)
    await backend.mutation(internal.marketExternalSnapshots.upsert, {
      window: '24h',
      fetchedAt: 1_000,
      sourceTimestamp: '2026-08-26T00:00:00.000Z',
      snapshotJson: '{"public":"market-evidence"}',
    })
    const args = { window: '24h' as const, now: 2_000 }
    const before = await consequenceState(backend)

    const anonymous = await backend.query(api.marketExternalSnapshots.read, args)
    const identified = await backend.withIdentity(callerIdentity)
      .query(api.marketExternalSnapshots.read, args)

    expect(identified).toEqual(anonymous)
    expect(anonymous).toMatchObject({
      generatedAt: 2_000,
      snapshot: { snapshotJson: '{"public":"market-evidence"}' },
    })
    expect(JSON.stringify(anonymous)).not.toContain(MUST_NOT_LEAK)
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('convex/marketListingEvidence.ts:read returns bounded public operation evidence and ignores caller-shaped identity', async () => {
    const backend = convexTestWithMarketComponents()
    await seedPrivateBusinesses(backend)
    const operationRef = `operation:v1:${'a'.repeat(64)}`
    await backend.mutation(internal.marketListingEvidence.assignCategory, {
      operationRef,
      categoryId: 'identity-compliance',
      assignedBy: MUST_NOT_LEAK,
      assignedAt: 1,
    })
    const args = { operationRefs: [operationRef, operationRef], since: 0 }
    const before = await consequenceState(backend)

    const anonymous = await backend.query(api.marketListingEvidence.read, args)
    const identified = await backend.withIdentity(callerIdentity)
      .query(api.marketListingEvidence.read, args)

    expect(identified).toEqual(anonymous)
    expect(anonymous).toEqual([{
      operationRef,
      categoryId: 'identity-compliance',
      ratingCount: 0,
      ratingSum: 0,
      completedInvocations: 0,
      latencySamplesMs: [],
    }])
    expect(JSON.stringify(anonymous)).not.toContain(MUST_NOT_LEAK)
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('convex/chatAnonymous.ts:anonymousChat fails closed before admission or provider use regardless of caller-shaped headers', async () => {
    const handler = (anonymousChat as unknown as {
      _handler: (ctx: { runMutation: ReturnType<typeof vi.fn> }, request: Request) => Promise<Response>
    })._handler
    const runMutation = vi.fn()
    const requests = ['Bearer account-a', 'Bearer account-b'].map((authorization) =>
      new Request('https://convex.example/chat/anonymous', {
        method: 'POST',
        headers: { Authorization: authorization, 'X-Account-Id': 'cross-account-private' },
        body: JSON.stringify({ messages: [{ role: 'user', content: MUST_NOT_LEAK }] }),
      }))

    const responses = await Promise.all(requests.map(async (request) => {
      const response = await handler({ runMutation }, request)
      return { status: response.status, body: await response.json() }
    }))

    expect(responses[0]).toEqual(responses[1])
    expect([404, 503]).toContain(responses[0]?.status)
    expect(runMutation).not.toHaveBeenCalled()
  })

  it('convex/moneyLedger.ts:reserveConnectAccount and finalizeConnectAccount remain identity-invariant fail-closed compatibility surfaces with no money effect', async () => {
    const backend = convexTest(schema, convexModules)
    const reserveArgs = {
      businessId: MUST_NOT_LEAK,
      currency: 'AUD',
      exponent: 2,
      idempotencyKey: 'caller-shaped-idempotency',
      commandRef: 'caller-shaped-command',
      inputDigest: 'caller-shaped-input',
      providerRequestDigest: 'caller-shaped-provider-request',
      recoveryLeaseOwner: 'caller-shaped-lease-owner',
      operationKey: 'caller-shaped-operation',
      correlationId: 'caller-shaped-correlation',
    }
    const finalizeArgs = {
      ...reserveArgs,
      recoveryLeaseGeneration: 1,
      outcome: {
        state: 'succeeded' as const,
        stripeAccountId: 'acct_caller_shaped',
        providerEvidenceRef: MUST_NOT_LEAK,
      },
    }
    const before = await backend.run(async (ctx) => ({
      accounts: await ctx.db.query('moneyPayoutAccounts').collect(),
      ledger: await ctx.db.query('moneyLedgerEntries').collect(),
    }))
    const invoke = async (client: Pick<Backend, 'mutation'>) => ({
      reserve: await client.mutation(api.moneyLedger.reserveConnectAccount, reserveArgs),
      finalize: await client.mutation(api.moneyLedger.finalizeConnectAccount, finalizeArgs),
    })

    const anonymous = await invoke(backend)
    const identified = await invoke(backend.withIdentity(callerIdentity))

    expect(identified).toEqual(anonymous)
    expect(anonymous).toEqual({
      reserve: { kind: 'refused', code: 'connect_account_unlisted', retryable: false },
      finalize: { kind: 'refused', code: 'connect_account_unlisted', retryable: false },
    })
    expect(await backend.run(async (ctx) => ({
      accounts: await ctx.db.query('moneyPayoutAccounts').collect(),
      ledger: await ctx.db.query('moneyLedgerEntries').collect(),
    }))).toEqual(before)
  })
})

describe('Phase 2 authority-bound narrow-system jobs', () => {
  it('authority-bound job:market-aggregate-backfill changes only bounded projection bookkeeping on an empty public evidence set', async () => {
    vi.useFakeTimers()
    const backend = convexTestWithMarketComponents()
    await seedWorkloadAuthority(backend)
    const workload = await backend.query(internal.workloadCron.admit, {
      name: 'continue market aggregate backfill',
    })
    const before = await consequenceState(backend)

    await expect(backend.mutation(internal.marketAggregateBackfill.run, {} as never))
      .rejects.toThrow(/Missing required field `workload`/u)
    await expect(backend.mutation(internal.marketAggregateBackfill.run, {
      workload: forgedWorkload(
        'continue market aggregate backfill',
        'continueMarketAggregateBackfill',
      ),
    })).rejects.toThrow('workload_snapshot_invalid')
    expect(await backend.run((ctx) => ctx.db.query('marketAggregateBackfills').collect()))
      .toEqual([])

    const result = await backend.mutation(internal.marketAggregateBackfill.run, { workload })

    expect(result).toEqual({ projection: 'invocations', processed: 0, complete: false })
    expect(await backend.run((ctx) => ctx.db.query('marketAggregateBackfills').collect()))
      .toHaveLength(1)
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('authority-bound job:market-external-refresh binds a current workload snapshot and writes only bounded public snapshot metadata', async () => {
    const backend = convexTest(schema, convexModules)
    await seedWorkloadAuthority(backend)
    const workload = await backend.query(internal.workloadCron.admit, {
      name: 'refresh Agentic Market snapshots',
    })
    const before = await consequenceState(backend)

    await expect(backend.action(internal.marketExternalRefresh.run, {
      workload: forgedWorkload(
        'refresh Agentic Market snapshots',
        'refreshAgenticMarketSnapshots',
      ),
    })).rejects.toThrow('workload_snapshot_invalid')
    expect(await backend.run((ctx) => ctx.db.query('marketExternalSnapshots').collect()))
      .toEqual([])

    const result = await backend.action(internal.marketExternalRefresh.run, { workload })

    expect(result).toEqual({ refreshed: 3, failed: 0 })
    expect(await backend.run((ctx) => ctx.db.query('marketExternalSnapshots').collect()))
      .toHaveLength(3)
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('authority-bound job:market-presence-refresh removes no authority and creates no presence from an empty publication set', async () => {
    const backend = convexTestWithMarketComponents()
    await seedWorkloadAuthority(backend)
    const workload = await backend.query(internal.workloadCron.admit, {
      name: 'refresh current market presence',
    })
    const before = await consequenceState(backend)

    await expect(backend.mutation(internal.marketPresence.refresh, { cursor: null } as never))
      .rejects.toThrow(/Missing required field `workload`/u)
    await expect(backend.mutation(internal.marketPresence.refresh, {
      cursor: null,
      workload: forgedWorkload(
        'refresh current market presence',
        'refreshCurrentMarketPresence',
      ),
    })).rejects.toThrow('workload_snapshot_invalid')
    expect(await backend.run((ctx) => ctx.db.query('marketActiveOperations').collect())).toEqual([])

    const result = await backend.mutation(internal.marketPresence.refresh, { cursor: null, workload })

    expect(result).toEqual({ processed: 0, complete: true })
    expect(await backend.run((ctx) => ctx.db.query('marketActiveOperations').collect())).toEqual([])
    expect(await backend.run((ctx) => ctx.db.query('marketActiveSuppliers').collect())).toEqual([])
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('authority-bound job:market-registry-refresh preserves the active generation on incomplete input and cannot widen workload authority', async () => {
    vi.useFakeTimers()
    const backend = convexTest(schema, convexModules)
    await seedWorkloadAuthority(backend)
    const workload = await backend.query(internal.workloadCron.admit, {
      name: 'refresh Agentic Economy API registry',
    })
    const before = await consequenceState(backend)

    await expect(backend.action(internal.marketExternalRegistryRefresh.run, {
      workload: forgedWorkload(
        'refresh Agentic Economy API registry',
        'refreshAgenticEconomyApiRegistry',
      ),
    })).rejects.toThrow('workload_snapshot_invalid')
    expect(await backend.run((ctx) => ctx.db.query('marketExternalRegistryState').collect()))
      .toEqual([])

    const result = await backend.action(internal.marketExternalRegistryRefresh.run, { workload })

    expect(result).toMatchObject({ kind: 'preserved', entries: 0 })
    const state = await backend.run((ctx) => ctx.db.query('marketExternalRegistryState').collect())
    expect(state).toHaveLength(1)
    expect(state[0]).not.toHaveProperty('activeGeneration')
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('authority-bound job:oauth-grant-cleanup deletes only expired grants in a bounded batch and preserves cross-account live grants', async () => {
    vi.useFakeTimers()
    const backend = convexTest(schema, convexModules)
    await seedWorkloadAuthority(backend)
    const workload = await backend.query(internal.workloadCron.admit, {
      name: 'cleanup expired agent access oauth grants',
    })
    const now = 10_000_000
    const cutoff = now - 60 * 60 * 1_000
    await backend.run(async (ctx) => {
      await ctx.db.insert('agentAccessOAuthGrants', oauthGrant('expired', cutoff - 1, MUST_NOT_LEAK))
      await ctx.db.insert('agentAccessOAuthGrants', oauthGrant('live', cutoff + 1, 'cross-account-live'))
    })
    const before = await consequenceState(backend)

    await expect(backend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
      now,
      batchSize: 1,
    } as never)).rejects.toThrow(/Missing required field `workload`/u)
    await expect(backend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
      now,
      batchSize: 1,
      workload: forgedWorkload(
        'cleanup expired agent access oauth grants',
        'cleanupExpiredAgentAccessOAuthGrants',
      ),
    })).rejects.toThrow('workload_snapshot_invalid')
    expect(await backend.run((ctx) => ctx.db.query('agentAccessOAuthGrants').collect()))
      .toHaveLength(2)

    const result = await backend.mutation(internal.agentAccessOAuth.cleanupExpiredOAuthGrants, {
      now,
      batchSize: 1,
      workload,
    })

    expect(result).toEqual({ deleted: 1, cutoff, rescheduled: true })
    const remaining = await backend.run((ctx) => ctx.db.query('agentAccessOAuthGrants').collect())
    expect(remaining.map((row) => row.grantRef)).toEqual(['grant:live'])
    expect(await consequenceState(backend)).toEqual(before)
  })

  it('authority-bound job:source-write-nonce-cleanup deletes only expired replay rows and preserves live cross-account nonces', async () => {
    vi.useFakeTimers()
    const backend = convexTest(schema, convexModules)
    await seedWorkloadAuthority(backend)
    const workload = await backend.query(internal.workloadCron.admit, {
      name: 'cleanup expired source write nonces',
    })
    await backend.run(async (ctx) => {
      await ctx.db.insert('sourceWriteNonces', sourceNonce('expired', 999, MUST_NOT_LEAK))
      await ctx.db.insert('sourceWriteNonces', sourceNonce('live', 1_000, 'cross-account-live'))
    })
    const before = await consequenceState(backend)

    await expect(backend.mutation(internal.sourceWriteAdmission.cleanupExpiredSourceWriteNonces, {
      now: 1_000,
      batchSize: 1,
    } as never)).rejects.toThrow(/Missing required field `workload`/u)
    await expect(backend.mutation(internal.sourceWriteAdmission.cleanupExpiredSourceWriteNonces, {
      now: 1_000,
      batchSize: 1,
      workload: forgedWorkload(
        'cleanup expired source write nonces',
        'cleanupExpiredSourceWriteNonces',
      ),
    })).rejects.toThrow('workload_snapshot_invalid')
    expect(await backend.run((ctx) => ctx.db.query('sourceWriteNonces').collect()))
      .toHaveLength(2)

    const result = await backend.mutation(internal.sourceWriteAdmission.cleanupExpiredSourceWriteNonces, {
      now: 1_000,
      batchSize: 1,
      workload,
    })

    expect(result).toEqual({ deleted: 1, cutoff: 1_000, rescheduled: true })
    const remaining = await backend.run((ctx) => ctx.db.query('sourceWriteNonces').collect())
    expect(remaining.map((row) => row.nonce)).toEqual(['nonce:live'])
    expect(await consequenceState(backend)).toEqual(before)
  })
})

async function seedPrivateBusinesses(backend: Backend): Promise<void> {
  await backend.run(async (ctx) => {
    const ownerA = await ctx.db.insert('owners', {
      clerkUserId: 'owner-public',
      createdAt: 1,
      updatedAt: 1,
    })
    const ownerB = await ctx.db.insert('owners', {
      clerkUserId: MUST_NOT_LEAK,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('businesses', {
      ownerId: ownerA,
      slug: 'public-no-offering',
      name: 'Public no offering',
      normalizedName: 'public no offering',
      category: 'Services',
      businessContext: { kind: 'local_human', suburb: 'Perth', stateTerritory: 'WA' },
      publicStatus: 'published',
      trustTier: 'listed',
      sourceHash: 'public-source',
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('businesses', {
      ownerId: ownerB,
      slug: 'cross-account-private',
      name: MUST_NOT_LEAK,
      normalizedName: MUST_NOT_LEAK,
      category: 'Private',
      businessContext: { kind: 'local_human', suburb: 'Secret', stateTerritory: 'WA' },
      publicStatus: 'unpublished',
      trustTier: 'claimed',
      sourceHash: MUST_NOT_LEAK,
      createdAt: 1,
      updatedAt: 1,
    })
  })
}

async function consequenceState(backend: Backend) {
  return await backend.run(async (ctx) => ({
    accounts: (await ctx.db.query('accounts').collect()).map((row) => row.accountRef).sort(),
    invocations: (await ctx.db.query('capabilityOperationInvocations').collect())
      .map((row) => row.invocationRef).sort(),
    money: (await ctx.db.query('moneyLedgerEntries').collect()).map((row) => row.entryRef).sort(),
    providerConnections: (await ctx.db.query('connections').collect())
      .map((row) => row.connectionRef).sort(),
    secretPointers: (await ctx.db.query('secretPointers').collect())
      .map((row) => row.secretRef).sort(),
  }))
}

async function seedPublicRegistryGeneration(backend: Backend): Promise<void> {
  await backend.mutation(internal.marketExternalRegistry.begin, {
    generation: 'public-generation',
    startedAt: 1,
  })
  await backend.mutation(internal.marketExternalRegistry.writeBatch, {
    generation: 'public-generation',
    entries: [publicRegistryEntry()],
  })
  await backend.mutation(internal.marketExternalRegistry.finalize, {
    generation: 'public-generation',
    completedAt: 2,
    expectedEntries: 1,
    agenticMarketReported: 1,
    agenticMarketFetched: 1,
    tregReported: 0,
    tregFetched: 0,
  })
}

function publicRegistryEntry() {
  const endpointUrl = 'https://public.example/search'
  return {
    documentId: `registry:${'a'.repeat(64)}`,
    source: 'agentic_market' as const,
    upstreamServiceId: MUST_NOT_LEAK,
    upstreamEndpointId: MUST_NOT_LEAK,
    sourceUrl: 'https://public.example/catalog',
    endpointUrl,
    routeIdentity: `GET ${endpointUrl}`,
    name: 'Public search',
    summary: 'Search public data',
    provider: 'Public provider',
    category: 'Search',
    method: 'GET' as const,
    tags: ['public'],
    networks: [],
    exactPrice: { scheme: 'exact' as const, amount: '0.01', currency: 'USDC', network: 'eip155:8453' },
    access: 'x402' as const,
    credentialRequirements: ['x402_payment' as const],
    readiness: 'source_declared_callable' as const,
    lastObservedAt: '2026-08-26T00:00:00.000Z',
    inputSchemaJson: '{"type":"object"}',
    exampleInvocation: 'curl https://public.example/search',
    probeRequest: { method: 'GET' as const, url: endpointUrl, headers: [] },
    quality: 'callable' as const,
    authority: 'source_metadata_only' as const,
    sourceDigest: `sha256:${'b'.repeat(64)}`,
    searchText: 'public search data',
  }
}

async function seedWorkloadAuthority(backend: Backend): Promise<void> {
  const ownerPrincipalRef = 'prn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const ownershipRef = 'own_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const action = {
    actorPrincipalRef: ownerPrincipalRef,
    activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
    correlationRef: 'public-exemption:account',
    idempotencyRef: 'public-exemption:account',
  }
  await backend.run(async (ctx) => {
    await ctx.db.insert('principals', {
      principalRef: PHASE_2_CRON_PRINCIPAL_REF,
      kind: 'workload',
      displayName: 'Phase 2 scheduled workload',
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await ctx.db.insert('accounts', {
      accountRef: PHASE_2_CRON_ACCOUNT_REF,
      displayName: 'Phase 2 operations',
      lifecycle: 'active',
      recoveryPolicy: { kind: 'no_transfer', revision: 1 },
      creationActorPrincipalRef: ownerPrincipalRef,
      creationIdempotencyRef: 'public-exemption:account',
      initialOwnershipRef: ownershipRef,
      currentOwnershipRef: ownershipRef,
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
      lastAction: action,
    })
    await ctx.db.insert('accountOwnerships', {
      ownershipRef,
      accountRef: PHASE_2_CRON_ACCOUNT_REF,
      ownerPrincipalRef,
      lifecycle: 'active',
      changeKind: 'creation',
      revision: 1,
      createdAt: 1,
      createdBy: action,
    })
    await ctx.db.insert('memberships', {
      membershipRef: 'mem_cccccccccccccccccccccccccccccccc',
      accountRef: PHASE_2_CRON_ACCOUNT_REF,
      memberPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
      lifecycle: 'active',
      revision: 1,
      createdAt: 1,
      createdBy: action,
    })
  })
}

function incompleteRegistrySource(source: 'agentic_market' | 'treg') {
  return {
    source,
    fetchedAt: 1,
    complete: false,
    incompleteReason: 'deadline_reached',
    sourceReportedCount: 1,
    admittedCount: 0,
    excludedCount: 1,
    entries: [],
  }
}

function forgedWorkload(
  name: WorkloadCronSnapshot['name'],
  handler: string,
): WorkloadCronSnapshot {
  return {
    name,
    workloadKind: 'cron',
    actorPrincipalRef: 'prn_ffffffffffffffffffffffffffffffff',
    activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
    correlationRef: 'cron:forged-caller',
    idempotencyRef: 'cron:forged-caller',
    purpose: name,
    source: `convex/workloadCron:${handler}`,
    principalRevision: 1,
    activeAccountRevision: 1,
    accessVia: 'membership',
    admittedAt: 1,
  } as WorkloadCronSnapshot
}

function oauthGrant(suffix: string, expiresAt: number, ownerId: string) {
  return {
    grantRef: `grant:${suffix}`,
    flow: 'device_code' as const,
    clientId: 'public-exemption-client',
    requestedScopes: [],
    requestedAccess: { environment: 'sandbox' as const, expiresInSeconds: 300 },
    status: 'pending' as const,
    ownerId,
    createdAt: 1,
    expiresAt,
    displayName: 'Public exemption cleanup',
  }
}

function sourceNonce(suffix: string, expiresAt: number, correlationId: string) {
  return {
    keyId: 'public-exemption-key',
    nonce: `nonce:${suffix}`,
    family: 'public-exemption',
    scope: 'catalog_publish' as const,
    operationKey: `operation:${suffix}`,
    correlationId,
    commandDigest: `sha256:${'c'.repeat(64)}`,
    bodyDigest: `sha256:${'d'.repeat(64)}`,
    issuedAt: 1,
    consumedAt: 2,
    expiresAt,
  }
}
