// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import type { ReactNode } from 'react'
import { Route as OwnerSupplyDetailRoute } from '@/routes/_operator/owner.supply.$offeringRef'
const routeMocks = vi.hoisted(() => ({
  loaderData: undefined as unknown,
  funnelProps: undefined as
    | { callbacks: Record<string, (...args: never[]) => Promise<unknown>> }
    | undefined,
  invalidate: vi.fn(),
  serverFnResults: new Map<unknown, (...args: never[]) => Promise<unknown>>(),
  admitRef: Symbol('admit'),
  saveRef: Symbol('save'),
  saveOfferingRef: Symbol('saveOffering'),
  preflightRef: Symbol('preflight'),
  preflightDocumentRef: Symbol('preflightDocument'),
  readinessRef: Symbol('readiness'),
  testRef: Symbol('test'),
  recheckRef: Symbol('recheck'),
  withdrawRef: Symbol('withdraw'),
  republishRef: Symbol('republish'),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: () => null,
  createFileRoute: () => (options: Record<string, unknown>) => {
    const route = { ...options, useLoaderData: () => routeMocks.loaderData }
    return { ...route, options: route }
  },
  useRouter: () => ({ invalidate: routeMocks.invalidate }),
}))
vi.mock('@tanstack/react-start', () => ({
  useServerFn: (reference: unknown) =>
    routeMocks.serverFnResults.get(reference) ?? (async () => undefined),
}))
vi.mock('@/components/ae/layout/AeOperatorShell', () => ({
  AeOperatorShell: ({ children }: { children?: ReactNode }) => children ?? null,
}))
vi.mock('@/components/ae/supply/AeSupplyFunnel', () => ({
  AeSupplyFunnel: (props: {
    callbacks: Record<string, (...args: never[]) => Promise<unknown>>
  }) => {
    routeMocks.funnelProps = props
    return null
  },
}))
vi.mock('@/components/ae/offerings/owner-offering.functions', () => ({
  readOwnerOfferingSupplyServer: routeMocks.saveOfferingRef,
  saveOwnerOfferingServer: routeMocks.saveOfferingRef,
}))
vi.mock('@/modules/capability-supply/supply-funnel.functions', () => ({
  admitOwnerCapabilityServer: routeMocks.admitRef,
  readOwnerSupplyFunnelServer: routeMocks.preflightRef,
  readOwnerProviderConnectionsServer: routeMocks.preflightRef,
  preflightOwnerOpenApiDocumentServer: routeMocks.preflightDocumentRef,
  preflightOwnerCapabilityServer: routeMocks.preflightRef,
  recheckOwnerCapabilityServer: routeMocks.recheckRef,
  republishOwnerCapabilityServer: routeMocks.republishRef,
  runOwnerSupplyReadinessServer: routeMocks.readinessRef,
  runOwnerSupplyTestServer: routeMocks.testRef,
  withdrawOwnerCapabilityServer: routeMocks.withdrawRef,
  filterOwnerSupplyAuthorityOptions: () => [],
  ownerSupplyActionContext: () => undefined,
}))
vi.mock('@/lib/operator/route-options', () => ({ operatorRouteOptions: {} }))

afterEach(() => {
  cleanup()
  routeMocks.loaderData = undefined
  routeMocks.funnelProps = undefined
  routeMocks.serverFnResults.clear()
  vi.clearAllMocks()
})

const PREPARED_DIGEST = `sha256:${'b'.repeat(64)}`
const SOURCE = {
  kind: 'openapi_http',
  sourceRevision: 'owner-api/2026-08-09',
  document: {
    openapi: '3.1.0',
    info: { title: 'Owner API', version: '1' },
    servers: [{ url: 'https://provider.example' }],
    paths: { '/lookup': { post: {} } },
  },
  operation: { path: '/lookup', method: 'post' as const },
  fixedQuery: [],
  contract: {},
  commercial: {
    requestTimeoutMs: 5_000,
    authority: { kind: 'keyless' },
    offering: {},
  },
  evidenceRefs: ['source:owner'],
}

function loadedData() {
  const offering = {
    offeringRef: 'catalog-offering:owner',
    currentRevision: 1,
    revision: {
      name: 'Owner lookup',
      category: 'utility',
      summary: 'Returns one result.',
      serviceAreaSummary: '',
      availabilitySummary: '',
      pricingSummary: '',
      price: {
        kind: 'fixed',
        amount: { currency: 'AUD', units: '100', exponent: 2 },
      },
    },
    status: 'draft',
    accessPaths: [],
  }
  return {
    supply: {
      kind: 'available',
      businessId: 'business:owner',
      business: { name: 'Owner', slug: 'owner' },
      offerings: [],
      activityTruncated: false,
      callLog: [],
      liquidity: {},
    },
    offerings: {
      kind: 'available',
      businessId: 'business:owner',
      business: { name: 'Owner', slug: 'owner' },
      offerings: [offering],
    },
    source: offering,
    durableOffering: {
      offeringRef: offering.offeringRef,
      revision: offering.currentRevision,
      name: offering.revision.name,
      sourceHash: `sha256:${'c'.repeat(64)}`,
      accessPaths: [],
    },
    authorityOptions: [],
  }
}

describe('owner supply route in-memory admission', () => {
  it('admits with the current source instead of a stored draft digest', async () => {
    const preflight = vi.fn(async () => ({
      kind: 'prepared',
      prepared: { sourceDigest: PREPARED_DIGEST },
    }))
    const admit = vi.fn(async () => ({
      kind: 'published',
      publicationRef: 'publication:owner',
      operationRef: 'operation:owner',
    }))
    routeMocks.loaderData = loadedData()
    routeMocks.serverFnResults.set(routeMocks.preflightRef, preflight)
    routeMocks.serverFnResults.set(routeMocks.admitRef, admit)

    const Component = OwnerSupplyDetailRoute.options.component
    if (Component === undefined) throw new Error('route_component_missing')
    render(createElement(Component))
    const callbacks = routeMocks.funnelProps?.callbacks
    if (callbacks?.preflight === undefined || callbacks.admit === undefined)
      throw new Error('funnel_callbacks_missing')
    await callbacks.preflight(SOURCE as never)
    await callbacks.admit(SOURCE as never)

    expect(admit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: SOURCE,
      }),
    })
    const admitPayload = admit.mock.calls.at(0)?.at(0) as { data?: Record<string, unknown> } | undefined
    if (admitPayload?.data === undefined) throw new Error('admit_payload_missing')
    expect(admitPayload.data).not.toHaveProperty('sourceDraftRevision')
    expect(admitPayload.data).not.toHaveProperty('sourceDigest')
  })
})
