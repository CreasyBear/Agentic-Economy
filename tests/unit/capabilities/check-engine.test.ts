import { getFunctionName } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import schema from '../../../convex/schema'
import { computeCapabilityTrustState } from '@/modules/capabilities/internal/capability-model'
import {
  AeEndpointCheckAllowedMethods,
  AeEndpointCheckBackoffMs,
  AeEndpointCheckMaxBodyBytes,
  AeEndpointCheckTimeoutMs,
} from '@/modules/capabilities/internal/check-standard'
import type { CapabilityCheckFacetResults } from '@/modules/capabilities/internal/check-standard'

const dnsLookupMock = vi.hoisted(() =>
  vi.fn(async () => [{ address: '93.184.216.34', family: 4 }])
)

vi.mock('node:dns/promises', () => ({
  lookup: dnsLookupMock,
}))


type RuntimeHandler = (ctx: unknown, args: Record<string, unknown>) => Promise<unknown>
type MutationCall = Readonly<{
  ref: FunctionReference<'mutation', 'internal'> | unknown
  args: Record<string, unknown>
}>
type RuntimeModules = Readonly<{
  runEndpointCheck: RuntimeHandler
  recordEndpointCheckAttempt: RuntimeHandler
}>
type CronSplitRuntimeModules = RuntimeModules &
  Readonly<{
    recheckDueBusinessCapabilities: RuntimeHandler
  }>
type SchedulerCall = Readonly<{
  delayMs: number
  ref: FunctionReference<'action', 'internal'> | unknown
  args: Record<string, unknown>
}>
type Row = Record<string, unknown> & { _id: string; _creationTime: number }
type EndpointCheckScenario = Readonly<{
  name: string
  attemptId: string
  url: string
  dnsAddresses?: readonly { address: string; family: number }[]
  expectedReason: string
  response?: Response
  fetchCalls: number
}>
type IndexFilter = { op: 'eq' | 'lte'; field: string; value: unknown }
type IndexTrace = { tableName: string; indexName: string; filters: IndexFilter[]; takeLimit?: number }
type IndexBuilder = {
  eq: (field: string, value: unknown) => IndexBuilder
  lte: (field: string, value: unknown) => IndexBuilder
}
type Query = {
  withIndex: (indexName: string, callback: (query: IndexBuilder) => IndexBuilder) => Query
  collect: () => Promise<Row[]>
  take: (limit: number) => Promise<Row[]>
  unique: () => Promise<Row | null>
  first: () => Promise<Row | null>
}
type Db = {
  query: (tableName: string) => Query
  get: (id: string) => Promise<Row | null>
  insert: (tableName: string, value: Record<string, unknown>) => Promise<string>
  patch: (id: string, value: Record<string, unknown>) => Promise<void>
}

describe('capability endpoint check runtime split', () => {
  it('exports the internal action and mutation names expected by the runtime split with exact v1 limits', async () => {
    const modules = await loadRuntimeModules()

    expect(modules.runEndpointCheck).toBeTypeOf('function')
    expect(modules.recordEndpointCheckAttempt).toBeTypeOf('function')
    expect(AeEndpointCheckAllowedMethods).toEqual(['GET', 'HEAD'])
    expect(AeEndpointCheckTimeoutMs).toBe(5_000)
    expect(AeEndpointCheckMaxBodyBytes).toBe(256 * 1024)
    expect(AeEndpointCheckBackoffMs).toEqual([5 * 60_000, 30 * 60_000, 2 * 60 * 60_000])
  })

  it('keeps capability check storage in separate source-owned tables with a due-work index instead of discovery manifest projections', () => {
    const exported = exportConvexSchema()
    const tableIndexes = Object.fromEntries(
      exported.tables.map((table) => [table.tableName, table.indexes.map((index) => index.indexDescriptor)])
    )

    expect(exported.tables.map((table) => table.tableName)).toEqual(
      expect.arrayContaining(['businessCapabilities', 'capabilityCheckAttempts'])
    )
    expect(tableIndexes.businessCapabilities).toEqual(
      expect.arrayContaining([
        'by_capabilityId',
        'by_business_kind',
        'by_business_service_kind',
        'by_descriptorKey',
        'by_recheckEnabled_staleThresholdAt',
      ])
    )
    expect(tableIndexes.capabilityCheckAttempts).toEqual(
      expect.arrayContaining(['by_attemptId', 'by_business_status', 'by_capability_startedAt'])
    )
    expect(tableIndexes.discoveryManifests).not.toEqual(expect.arrayContaining(['by_capability_status', 'by_attemptId']))
  })

  it('refuses SSRF targets, unsafe redirects, and oversized bodies before direct DB access while delegating persistence by internal reference', async () => {
    const modules = await loadRuntimeModules()
    const scenarios = [
      {
        name: 'private IPv4 literal',
        attemptId: 'attempt:private-ipv4',
        url: 'https://10.0.0.1/.well-known/ucp',
        dnsAddresses: [{ address: '10.0.0.1', family: 4 }],
        expectedReason: 'host_not_allowed',
        fetchCalls: 0,
      },
      {
        name: 'link-local metadata endpoint',
        attemptId: 'attempt:metadata',
        url: 'https://169.254.169.254/latest/meta-data',
        dnsAddresses: [{ address: '169.254.169.254', family: 4 }],
        expectedReason: 'host_not_allowed',
        fetchCalls: 0,
      },
      {
        name: 'link-local IPv6 literal',
        attemptId: 'attempt:link-local-ipv6',
        url: 'https://[fe80::1]/.well-known/ucp',
        dnsAddresses: [{ address: 'fe80::1', family: 6 }],
        expectedReason: 'host_not_allowed',
        fetchCalls: 0,
      },
      {
        name: 'DNS resolution to a private address',
        attemptId: 'attempt:dns-private',
        url: 'https://business.example/.well-known/ucp',
        dnsAddresses: [{ address: '10.0.0.5', family: 4 }],
        expectedReason: 'private_network',
        fetchCalls: 0,
      },
      {
        name: 'redirect to a private address',
        attemptId: 'attempt:unsafe-redirect',
        url: 'https://business.example/.well-known/ucp',
        expectedReason: 'unsafe_redirect',
        response: new Response('do not parse redirected response bodies', {
          status: 302,
          headers: { location: 'https://10.0.0.2/.well-known/ucp' },
        }),
        fetchCalls: 1,
      },
      {
        name: 'oversized JSON body',
        attemptId: 'attempt:oversize-body',
        url: 'https://business.example/.well-known/ucp',
        expectedReason: 'body_too_large',
        response: new Response('x'.repeat(256 * 1024 + 1), {
          status: 200,
          headers: {
            'content-type': 'application/json',
          },
        }),
        fetchCalls: 1,
      },
    ] satisfies readonly EndpointCheckScenario[]

    for (const scenario of scenarios) {
      dnsLookupMock.mockReset()
      dnsLookupMock.mockResolvedValue(scenario.dnsAddresses ?? [{ address: '93.184.216.34', family: 4 }])
      const fetchMock = vi.fn(async () => scenario.response ?? checkedManifestResponse())
      vi.stubGlobal('fetch', fetchMock)
      const mutationCalls: MutationCall[] = []

      await modules.runEndpointCheck(trapDbActionCtx(mutationCalls), checkArgs({
        attemptId: scenario.attemptId,
        url: scenario.url,
      }))

      expect(fetchMock, scenario.name).toHaveBeenCalledTimes(scenario.fetchCalls)
      const firstCall = firstMutationCall(mutationCalls, scenario.name)
      expect(getFunctionName(firstCall.ref as FunctionReference<'mutation', 'internal'>)).toBe('capabilities:recordEndpointCheckAttempt')
      expect(firstCall.args, scenario.name).toMatchObject({
        attemptId: scenario.attemptId,
        businessId: 'businesses:capability-check-test',
        capabilityId: 'capability:business-endpoint',
        kind: 'business_endpoint',
      })
      expect(firstCall.args).toMatchObject({
        facets: {
          reachability: {
            outcome: 'fail',
            reason: scenario.expectedReason,
          },
        },
      })
      expect(JSON.stringify(firstCall.args), scenario.name).not.toContain('sourceWrite')
      vi.unstubAllGlobals()
    }
  })
})

describe('capability due recheck cron split', () => {
  it('selects stale capabilities by indexed threshold in a bounded batch and schedules endpoint actions without fetching', async () => {
    const modules = await loadCronSplitRuntimeModules()
    const db = dueCapabilityDb()
    const schedulerCalls: SchedulerCall[] = []
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await modules.recheckDueBusinessCapabilities(
      {
        db,
        scheduler: {
          runAfter: async (
            delayMs: number,
            ref: FunctionReference<'action', 'internal'> | unknown,
            args: Record<string, unknown>
          ) => {
            schedulerCalls.push({ delayMs, ref, args })
            return `scheduled:${schedulerCalls.length}`
          },
        },
      },
      { now: 10_000, batchSize: 1 }
    )

    expect(result).toMatchObject({ selected: 1, enqueued: 1, skipped: 0, now: 10_000, batchSize: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(db.indexTraces).toEqual([
      {
        tableName: 'businessCapabilities',
        indexName: 'by_recheckEnabled_staleThresholdAt',
        filters: [
          { op: 'eq', field: 'recheckEnabled', value: true },
          { op: 'lte', field: 'staleThresholdAt', value: 10_000 },
        ],
        takeLimit: 1,
      },
    ])
    expect(schedulerCalls).toHaveLength(1)
    const scheduled = schedulerCalls[0]
    expect(scheduled?.delayMs).toBe(0)
    expect(getFunctionName(scheduled?.ref as FunctionReference<'action', 'internal'>)).toBe('capabilityCheck:runEndpointCheck')
    expect(scheduled?.args).toMatchObject({
      businessId: 'businesses:capability-check-test',
      capabilityId: 'capability:due-1',
      descriptorKey: 'businesses:capability-check-test:due-1',
      kind: 'business_endpoint',
      method: 'GET',
      url: 'https://business.example/.well-known/ucp',
      allowedOrigin: 'https://business.example',
      manifestUrl: 'https://business.example/.well-known/ucp',
      schemaRef: 'ae-ucp:v1',
      sourceHash: 'sha256:due-1',
      previousSourceHash: 'sha256:due-1',
      previousState: 'checked',
      now: 10_000,
      retryCount: 0,
    })
    expect(scheduled?.args.attemptId).toEqual(expect.any(String))

    vi.unstubAllGlobals()
  })
})

describe('capability check persistence mutation', () => {
  it('upserts attempts idempotently by attemptId and derives trust state with the pure oracle without sourceWrite admission', async () => {
    const modules = await loadRuntimeModules()
    const db = capabilityDb()
    const facets = passingFacets()
    const expectedTrustState = computeCapabilityTrustState({
      kind: 'checked',
      previousState: 'business_supplied',
      facets,
    })
    const args = mutationArgs({ attemptId: 'attempt:checked', facets, retryCount: 0, now: 10_000 })

    const first = await modules.recordEndpointCheckAttempt({ db }, args)
    const replay = await modules.recordEndpointCheckAttempt({ db }, args)

    expect(first).toMatchObject({ kind: 'ok', trustState: expectedTrustState })
    expect(replay).toMatchObject({ kind: 'ok', trustState: expectedTrustState })
    expect(db.dump('capabilityCheckAttempts')).toHaveLength(1)
    expect(db.dump('businessCapabilities')).toEqual([
      expect.objectContaining({ capabilityId: 'capability:business-endpoint', trustState: expectedTrustState }),
    ])
  })

  it('preserves prior state during retryable failures, applies the +5m/+30m/+2h backoff curve, then exhausts to unsupported with no_repair', async () => {
    const modules = await loadRuntimeModules()
    const retryCases = [
      { retryCount: 0, now: 100_000, expectedRetryAfter: 100_000 + 5 * 60_000 },
      { retryCount: 1, now: 200_000, expectedRetryAfter: 200_000 + 30 * 60_000 },
      { retryCount: 2, now: 300_000, expectedRetryAfter: 300_000 + 2 * 60 * 60_000 },
    ] as const

    for (const retryCase of retryCases) {
      const db = capabilityDb('checked')
      const facets = failedReachabilityFacets({ exhausted: false })
      const result = await modules.recordEndpointCheckAttempt(
        { db },
        mutationArgs({
          attemptId: `attempt:retry:${retryCase.retryCount}`,
          facets,
          previousTrustState: 'checked',
          retryCount: retryCase.retryCount,
          now: retryCase.now,
        })
      )

      expect(result, `retry ${retryCase.retryCount}`).toMatchObject({
        kind: 'ok',
        trustState: computeCapabilityTrustState({ kind: 'checked', previousState: 'checked', facets }),
        retryAfter: retryCase.expectedRetryAfter,
        repairAction: 'retry_later',
      })
      expect(db.dump('businessCapabilities')[0]).toMatchObject({ trustState: 'checked' })
    }

    const exhaustedDb = capabilityDb('checked')
    const exhaustedFacets = failedReachabilityFacets({ exhausted: true })
    const exhausted = await modules.recordEndpointCheckAttempt(
      { db: exhaustedDb },
      mutationArgs({
        attemptId: 'attempt:exhausted',
        facets: exhaustedFacets,
        previousTrustState: 'checked',
        retryCount: 3,
        now: 400_000,
      })
    )

    expect(exhausted).toMatchObject({
      kind: 'ok',
      trustState: computeCapabilityTrustState({ kind: 'checked', previousState: 'checked', facets: exhaustedFacets }),
      repairAction: 'no_repair',
    })
    expect(JSON.stringify(exhausted)).not.toContain('private-error-detail')
    expect(exhaustedDb.dump('businessCapabilities')[0]).toMatchObject({ trustState: 'unsupported' })
  })

  it('clears retry state and schedules the next stale threshold after a later successful check', async () => {
    const modules = await loadRuntimeModules()
    const facets = passingFacets()
    const db = capabilityDb('stale', {
      retryAfter: 25_000,
      repairAction: 'retry_later',
      staleThresholdAt: 20_000,
      latestAttemptId: 'attempt:old-failure',
    })
    const expectedTrustState = computeCapabilityTrustState({
      kind: 'checked',
      previousState: 'stale',
      facets,
    })

    const result = await modules.recordEndpointCheckAttempt(
      { db },
      mutationArgs({
        attemptId: 'attempt:success-after-retry',
        facets,
        previousTrustState: 'stale',
        retryCount: 1,
        now: 10_000,
      })
    )

    expect(result).toMatchObject({
      kind: 'ok',
      trustState: expectedTrustState,
      repairAction: 'none',
    })
    expect(result).not.toHaveProperty('retryAfter')

    const capability = db.dump('businessCapabilities')[0]
    expect(capability).toMatchObject({
      trustState: expectedTrustState,
      repairAction: 'none',
      staleThresholdAt: 10_000 + 3_600_000,
      latestAttemptId: 'attempt:success-after-retry',
    })
    expect(capability).not.toHaveProperty('retryAfter')

    const attempt = db.dump('capabilityCheckAttempts')[0]
    expect(attempt).toMatchObject({
      attemptId: 'attempt:success-after-retry',
      repairAction: 'none',
      status: 'succeeded',
    })
    expect(attempt).not.toHaveProperty('retryAfter')
  })
})

async function loadRuntimeModules(): Promise<RuntimeModules> {
  // Dynamic import is intentional: this source-local contract test needs absent runtime modules
  // to surface as focused RED assertions instead of preventing unrelated schema checks from loading.
  const actionModule = await import('../../../convex/capabilityCheck').catch((error: unknown) => {
    throw new Error(`Missing convex/capabilityCheck.ts runtime module: ${errorMessage(error)}`)
  })
  // Dynamic import is intentional for the same module-existence boundary as above.
  const mutationModule = await import('../../../convex/capabilities').catch((error: unknown) => {
    throw new Error(`Missing convex/capabilities.ts persistence module: ${errorMessage(error)}`)
  })

  return {
    runEndpointCheck: readRuntimeHandler(Reflect.get(actionModule, 'runEndpointCheck'), 'runEndpointCheck'),
    recordEndpointCheckAttempt: readRuntimeHandler(
      Reflect.get(mutationModule, 'recordEndpointCheckAttempt'),
      'recordEndpointCheckAttempt'
    ),
  }
}

async function loadCronSplitRuntimeModules(): Promise<CronSplitRuntimeModules> {
  const modules = await loadRuntimeModules()
  // Dynamic import is intentional: this source-local contract test keeps the missing
  // cron selector as a focused RED assertion instead of blocking older runtime tests.
  const mutationModule = await import('../../../convex/capabilities').catch((error: unknown) => {
    throw new Error(`Missing convex/capabilities.ts cron selector module: ${errorMessage(error)}`)
  })

  return {
    ...modules,
    recheckDueBusinessCapabilities: readRuntimeHandler(
      Reflect.get(mutationModule, 'recheckDueBusinessCapabilities'),
      'recheckDueBusinessCapabilities'
    ),
  }
}

function readRuntimeHandler(value: unknown, exportName: string): RuntimeHandler {
  if (typeof value === 'function') {
    const runtimeHandler = value as RuntimeHandler
    return runtimeHandler
  }
  if (value === null || typeof value !== 'object' || !('_handler' in value)) {
    const keys = value === null || typeof value !== 'object' ? [] : Reflect.ownKeys(value)
    throw new Error(`${exportName} must be a Convex internal function export with an _handler; got ${typeof value} keys=${keys.join(',')}.`)
  }
  const handler = value._handler
  if (typeof handler !== 'function') {
    throw new Error(`${exportName} must expose a callable Convex _handler.`)
  }

  const runtimeHandler = handler as RuntimeHandler
  return runtimeHandler
}

function exportConvexSchema(): { tables: Array<{ tableName: string; indexes: Array<{ indexDescriptor: string }> }> } {
  const exportSchema = Reflect.get(schema, 'export')
  if (typeof exportSchema !== 'function') {
    throw new Error('Convex schema export function is unavailable')
  }

  return z.object({
    tables: z.array(
      z.object({
        tableName: z.string(),
        indexes: z.array(z.object({ indexDescriptor: z.string() })),
      })
    ),
  }).parse(JSON.parse(String(exportSchema.call(schema))))
}

function trapDbActionCtx(mutationCalls: MutationCall[]) {
  return {
    get db(): never {
      throw new Error('capability check action must not access ctx.db directly')
    },
    runMutation: async (ref: FunctionReference<'mutation', 'internal'> | unknown, args: Record<string, unknown>) => {
      mutationCalls.push({ ref, args })
      return { kind: 'ok', trustState: 'unsupported' }
    },
    scheduler: {
      runAfter: async () => 'scheduled:ignored',
    },
  }
}

function firstMutationCall(calls: readonly MutationCall[], scenarioName: string): MutationCall {
  const firstCall = calls[0]
  if (firstCall === undefined) {
    throw new Error(`${scenarioName} did not delegate to internal.capabilities.recordEndpointCheckAttempt`)
  }

  return firstCall
}

function checkArgs(input: { attemptId: string; url: string }): Record<string, unknown> {
  return {
    attemptId: input.attemptId,
    businessId: 'businesses:capability-check-test',
    capabilityId: 'capability:business-endpoint',
    descriptorKey: 'businesses:capability-check-test:business_endpoint',
    kind: 'business_endpoint',
    method: 'GET',
    url: input.url,
    allowedOrigin: 'https://business.example',
    manifestUrl: 'https://business.example/.well-known/ucp',
    schemaRef: 'ae-ucp:v1',
    sourceHash: 'sha256:previous',
    previousSourceHash: 'sha256:previous',
    previousState: 'business_supplied',
    generatedAt: 10_000,
    retryCount: 0,
    now: 10_000,
    domainControl: {
      originUrl: 'https://business.example',
      checkedAt: 9_000,
      expiresAt: 20_000,
    },
    aeHeldFacts: {
      businessName: 'Capability Test',
      category: 'Software',
      claimedLocation: 'Internet',
      claimedServiceIdentity: 'Endpoint check',
      publicUrl: 'https://business.example',
      originUrl: 'https://business.example',
      ownerIdentifiers: ['owner:test'],
    },
  }
}

function mutationArgs(input: {
  attemptId: string
  facets: CapabilityCheckFacetResults
  retryCount: number
  now: number
  previousTrustState?: 'business_supplied' | 'checked' | 'stale' | 'contradicted' | 'unsupported'
}): Record<string, unknown> {
  return {
    attemptId: input.attemptId,
    businessId: 'businesses:capability-check-test',
    capabilityId: 'capability:business-endpoint',
    descriptorKey: 'businesses:capability-check-test:business_endpoint',
    descriptorJson: JSON.stringify({
      kind: 'business_endpoint',
      originUrl: 'https://business.example',
      manifestUrl: 'https://business.example/.well-known/ucp',
      schemaRef: 'ae-ucp:v1',
    }),
    kind: 'business_endpoint',
    standardVersion: 'ae-endpoint-check:v1',
    method: 'GET',
    url: 'https://business.example/.well-known/ucp',
    allowedOrigin: 'https://business.example',
    manifestUrl: 'https://business.example/.well-known/ucp',
    schemaRef: 'ae-ucp:v1',
    sourceHash: 'sha256:manifest-v1',
    previousSourceHash: 'sha256:previous',
    previousState: input.previousTrustState ?? 'business_supplied',
    generatedAt: input.now,
    domainControl: {
      originUrl: 'https://business.example',
      checkedAt: input.now - 1_000,
      expiresAt: input.now + 10_000,
    },
    aeHeldFacts: {
      businessName: 'Capability Test',
      category: 'Software',
      claimedLocation: 'Internet',
      claimedServiceIdentity: 'Endpoint check',
      publicUrl: 'https://business.example',
      originUrl: 'https://business.example',
      ownerIdentifiers: ['owner:test'],
    },
    checkedAt: input.now,
    retryCount: input.retryCount,
    facets: input.facets,
    failureMessageRedacted: 'private-error-detail must not leak',
  }
}

function checkedManifestResponse(): Response {
  return new Response(
    JSON.stringify({
      schemaRef: 'ae-ucp:v1',
      originUrl: 'https://business.example',
      manifestUrl: 'https://business.example/.well-known/ucp',
      endpointUrl: 'https://business.example/.well-known/agent-endpoint',
      generatedAt: '2026-07-04T00:00:00.000Z',
      sourceHash: 'sha256:manifest-v1',
      capabilities: [{ kind: 'business_endpoint', callable: false, paymentRequired: false }],
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  )
}

function passingFacets(): CapabilityCheckFacetResults {
  return {
    reachability: { facet: 'reachability', outcome: 'pass', code: 'reachable' },
    schema: { facet: 'schema', outcome: 'pass', code: 'schema_conformant' },
    freshness: { facet: 'freshness', outcome: 'pass', code: 'fresh', windowMs: 3_600_000 },
    contradiction: { facet: 'contradiction', outcome: 'pass', code: 'not_contradicted' },
  }
}

function failedReachabilityFacets(input: { exhausted: boolean }): CapabilityCheckFacetResults {
  return {
    reachability: {
      facet: 'reachability',
      outcome: 'fail',
      code: 'unreachable',
      reason: 'timeout',
      retryable: true,
      exhausted: input.exhausted,
    },
    schema: { facet: 'schema', outcome: 'pass', code: 'schema_conformant' },
    freshness: { facet: 'freshness', outcome: 'pass', code: 'fresh', windowMs: 3_600_000 },
    contradiction: { facet: 'contradiction', outcome: 'pass', code: 'not_contradicted' },
  }
}

function dueCapabilityDb(): FakeDb {
  return new FakeDb({
    businessCapabilities: [
      {
        _id: 'businessCapabilities:due-1',
        _creationTime: 1,
        businessId: 'businesses:capability-check-test',
        capabilityId: 'capability:due-1',
        descriptorKey: 'businesses:capability-check-test:due-1',
        descriptorJson: JSON.stringify({
          kind: 'business_endpoint',
          originUrl: 'https://business.example',
          manifestUrl: 'https://business.example/.well-known/ucp',
          schemaRef: 'ae-ucp:v1',
        }),
        kind: 'business_endpoint',
        standardVersion: 'ae-endpoint-check:v1',
        trustState: 'checked',
        checkedEvidenceCount: 4,
        sourceHash: 'sha256:due-1',
        recheckEnabled: true,
        staleThresholdAt: 9_000,
        recheckPayloadJson: JSON.stringify({
          attemptId: 'attempt:due-1',
          businessId: 'businesses:capability-check-test',
          capabilityId: 'capability:due-1',
          descriptorKey: 'businesses:capability-check-test:due-1',
          descriptorJson: JSON.stringify({
            kind: 'business_endpoint',
            originUrl: 'https://business.example',
            manifestUrl: 'https://business.example/.well-known/ucp',
            schemaRef: 'ae-ucp:v1',
          }),
          kind: 'business_endpoint',
          standardVersion: 'ae-endpoint-check:v1',
          method: 'GET',
          url: 'https://business.example/.well-known/ucp',
          allowedOrigin: 'https://business.example',
          manifestUrl: 'https://business.example/.well-known/ucp',
          schemaRef: 'ae-ucp:v1',
          domainControl: {
            originUrl: 'https://business.example',
            checkedAt: 8_000,
            expiresAt: 20_000,
          },
          aeHeldFacts: {
            businessName: 'Capability Test',
            category: 'Software',
            claimedLocation: 'Internet',
            claimedServiceIdentity: 'Endpoint check',
            publicUrl: 'https://business.example',
            originUrl: 'https://business.example',
            ownerIdentifiers: ['owner:test'],
          },
          sourceHash: 'sha256:due-1',
          previousSourceHash: 'sha256:due-1',
          previousState: 'checked',
          generatedAt: 9_000,
          retryCount: 0,
        }),
        updatedAt: 9_000,
      },
      {
        _id: 'businessCapabilities:due-2',
        _creationTime: 2,
        businessId: 'businesses:capability-check-test',
        capabilityId: 'capability:due-2',
        descriptorKey: 'businesses:capability-check-test:due-2',
        descriptorJson: JSON.stringify({
          kind: 'business_endpoint',
          originUrl: 'https://second.example',
          manifestUrl: 'https://second.example/.well-known/ucp',
          schemaRef: 'ae-ucp:v1',
        }),
        kind: 'business_endpoint',
        standardVersion: 'ae-endpoint-check:v1',
        trustState: 'checked',
        checkedEvidenceCount: 4,
        sourceHash: 'sha256:due-2',
        recheckEnabled: true,
        staleThresholdAt: 9_500,
        recheckPayloadJson: JSON.stringify({
          attemptId: 'attempt:due-2',
          businessId: 'businesses:capability-check-test',
          capabilityId: 'capability:due-2',
          descriptorKey: 'businesses:capability-check-test:due-2',
          descriptorJson: JSON.stringify({
            kind: 'business_endpoint',
            originUrl: 'https://second.example',
            manifestUrl: 'https://second.example/.well-known/ucp',
            schemaRef: 'ae-ucp:v1',
          }),
          kind: 'business_endpoint',
          standardVersion: 'ae-endpoint-check:v1',
          method: 'GET',
          url: 'https://second.example/.well-known/ucp',
          allowedOrigin: 'https://second.example',
          manifestUrl: 'https://second.example/.well-known/ucp',
          schemaRef: 'ae-ucp:v1',
          domainControl: {
            originUrl: 'https://second.example',
            checkedAt: 8_000,
            expiresAt: 20_000,
          },
          aeHeldFacts: {
            businessName: 'Second Capability Test',
            category: 'Software',
            claimedLocation: 'Internet',
            claimedServiceIdentity: 'Endpoint check',
            publicUrl: 'https://second.example',
            originUrl: 'https://second.example',
            ownerIdentifiers: ['owner:test'],
          },
          sourceHash: 'sha256:due-2',
          previousSourceHash: 'sha256:due-2',
          previousState: 'checked',
          generatedAt: 9_500,
          retryCount: 0,
        }),
        updatedAt: 9_500,
      },
      {
        _id: 'businessCapabilities:future',
        _creationTime: 3,
        businessId: 'businesses:capability-check-test',
        capabilityId: 'capability:future',
        descriptorKey: 'businesses:capability-check-test:future',
        descriptorJson: JSON.stringify({
          kind: 'business_endpoint',
          originUrl: 'https://future.example',
          manifestUrl: 'https://future.example/.well-known/ucp',
          schemaRef: 'ae-ucp:v1',
        }),
        kind: 'business_endpoint',
        standardVersion: 'ae-endpoint-check:v1',
        trustState: 'checked',
        checkedEvidenceCount: 4,
        sourceHash: 'sha256:future',
        recheckEnabled: true,
        staleThresholdAt: 11_000,
        recheckPayloadJson: JSON.stringify({
          attemptId: 'attempt:future',
          businessId: 'businesses:capability-check-test',
          capabilityId: 'capability:future',
          descriptorKey: 'businesses:capability-check-test:future',
          descriptorJson: JSON.stringify({
            kind: 'business_endpoint',
            originUrl: 'https://future.example',
            manifestUrl: 'https://future.example/.well-known/ucp',
            schemaRef: 'ae-ucp:v1',
          }),
          kind: 'business_endpoint',
          standardVersion: 'ae-endpoint-check:v1',
          method: 'GET',
          url: 'https://future.example/.well-known/ucp',
          allowedOrigin: 'https://future.example',
          manifestUrl: 'https://future.example/.well-known/ucp',
          schemaRef: 'ae-ucp:v1',
          domainControl: {
            originUrl: 'https://future.example',
            checkedAt: 8_000,
            expiresAt: 20_000,
          },
          aeHeldFacts: {
            businessName: 'Future Capability Test',
            category: 'Software',
            claimedLocation: 'Internet',
            claimedServiceIdentity: 'Endpoint check',
            publicUrl: 'https://future.example',
            originUrl: 'https://future.example',
            ownerIdentifiers: ['owner:test'],
          },
          sourceHash: 'sha256:future',
          previousSourceHash: 'sha256:future',
          previousState: 'checked',
          generatedAt: 9_500,
          retryCount: 0,
        }),
        updatedAt: 9_500,
      },
    ],
  })
}

function capabilityDb(trustState = 'business_supplied', overrides: Record<string, unknown> = {}): FakeDb {
  return new FakeDb({
    businessCapabilities: [
      {
        _id: 'businessCapabilities:1',
        _creationTime: 1,
        businessId: 'businesses:capability-check-test',
        capabilityId: 'capability:business-endpoint',
        descriptorKey: 'businesses:capability-check-test:business_endpoint',
        kind: 'business_endpoint',
        descriptorJson: JSON.stringify({
          kind: 'business_endpoint',
          originUrl: 'https://business.example',
          manifestUrl: 'https://business.example/.well-known/ucp',
          schemaRef: 'ae-ucp:v1',
        }),
        trustState,
        sourceHash: 'sha256:previous',
        sourceVersion: 'business-origin-manifest:v1',
        repairAction: 'none',
        updatedAt: 1,
        ...overrides,
      },
    ],
    capabilityCheckAttempts: [],
    auditEvents: [],
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

class FakeIndexBuilder implements IndexBuilder {
  readonly filters: IndexFilter[] = []

  eq(field: string, value: unknown): IndexBuilder {
    this.filters.push({ op: 'eq', field, value })
    return this
  }

  lte(field: string, value: unknown): IndexBuilder {
    this.filters.push({ op: 'lte', field, value })
    return this
  }
}

class FakeQuery implements Query {
  constructor(
    private readonly rows: readonly Row[],
    private readonly tableName: string,
    private readonly traces: IndexTrace[],
    private readonly filters: readonly IndexFilter[] = [],
    private readonly trace?: IndexTrace
  ) {}

  withIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): Query {
    const builder = new FakeIndexBuilder()
    callback(builder)
    const trace = { tableName: this.tableName, indexName, filters: [...builder.filters] }
    this.traces.push(trace)
    return new FakeQuery(this.rows, this.tableName, this.traces, [...this.filters, ...builder.filters], trace)
  }

  async collect(): Promise<Row[]> {
    return this.rows.filter((row) =>
      this.filters.every((filter) => {
        if (filter.op === 'eq') return row[filter.field] === filter.value
        const rowValue = row[filter.field]
        return typeof rowValue === 'number' && typeof filter.value === 'number' && rowValue <= filter.value
      })
    )
  }

  async take(limit: number): Promise<Row[]> {
    if (this.trace !== undefined) {
      this.trace.takeLimit = limit
    }
    return (await this.collect()).slice(0, limit)
  }

  async unique(): Promise<Row | null> {
    return (await this.collect()).at(0) ?? null
  }

  async first(): Promise<Row | null> {
    return this.unique()
  }
}

class FakeDb implements Db {
  readonly indexTraces: IndexTrace[] = []
  private readonly tables: Record<string, Row[]>
  private sequence = 100

  constructor(seed: Record<string, Row[]> = {}) {
    this.tables = Object.fromEntries(Object.entries(seed).map(([tableName, rows]) => [tableName, rows.map((row) => ({ ...row }))]))
  }

  query(tableName: string): Query {
    return new FakeQuery(this.table(tableName), tableName, this.indexTraces)
  }

  async get(id: string): Promise<Row | null> {
    return this.allRows().find((row) => row._id === id) ?? null
  }

  async insert(tableName: string, value: Record<string, unknown>): Promise<string> {
    this.sequence += 1
    const id = `${tableName}:${this.sequence}`
    this.table(tableName).push({ _id: id, _creationTime: this.sequence, ...withoutUndefined(value) })
    return id
  }

  async patch(id: string, value: Record<string, unknown>): Promise<void> {
    const row = this.allRows().find((candidate) => candidate._id === id)
    if (row === undefined) {
      throw new Error(`No row for ${id}`)
    }
    for (const [key, patchValue] of Object.entries(value)) {
      if (patchValue === undefined) {
        delete row[key]
      } else {
        row[key] = patchValue
      }
    }
  }

  dump(tableName: string): Row[] {
    return this.table(tableName).map((row) => ({ ...row }))
  }

  private table(tableName: string): Row[] {
    const existing = this.tables[tableName]
    if (existing !== undefined) {
      return existing
    }

    this.tables[tableName] = []
    return this.tables[tableName]
  }

  private allRows(): Row[] {
    return Object.values(this.tables).flat()
  }
}

function withoutUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entryValue]) => entryValue !== undefined))
}
