import { globSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'

import { describeActionForAgent, findAction } from '@/modules/actions'
import { CALL_ROUTE_CONTRACT } from '@/modules/capability-execution/call-entry'
import { TOOL_QUOTE_ROUTE_CONTRACT } from '@/modules/capability-execution/quote.actions'
import { canonicalDigest, schemaDescriptorDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { buildSiteDiscoveryManifest, projectCompactSiteDiscoveryManifest } from '@/modules/discovery/public'
import { handleSiteDiscoveryManifestRequest } from '@/routes/[.]well-known/ucp'
import { FUNDING_QUOTE_CONTRACT_VERSION } from '@/modules/money/public'

/**
 * `/.well-known/ucp` is the only document a cold agent reads before it knows
 * anything about AE. An advertised path that 404s is worse than no document at
 * all: the agent burns its one entry point and concludes AE is broken. So the
 * central contract here is that every URL the document publishes resolves to a
 * route this app actually serves.
 */

const routesDir = path.resolve(__dirname, '../../../src/routes')
const origin = 'https://ae.test'
const dotEscape = '\u0000'

function readRoutePaths(dir: string, prefix: string, into: Set<string>): void {
  for (const route of globSync(path.join(dir, '**/*.{ts,tsx}')).sort()) {
    const relative = path.relative(dir, route).split(path.sep).join('/')
    const entryName = relative.slice(relative.lastIndexOf('/') + 1)
    if (entryName.startsWith('__root')) continue

    const withoutExtension = `${prefix}${relative}`.replace(/\.tsx?$/u, '')
    const segments = withoutExtension
      .replaceAll('[.]', dotEscape)
      .replaceAll('/', '.')
      .split('.')
      // `_operator` and friends are pathless layout segments.
      .filter((segment) => segment.length > 0 && !segment.startsWith('_'))
      .map((segment) => segment.replaceAll(dotEscape, '.'))
    const last = segments.at(-1)
    const pathSegments = last === 'index' ? segments.slice(0, -1) : segments
    into.add(`/${pathSegments.join('/')}`.replace(/\/$/u, '') || '/')
  }
}

const routePaths = new Set<string>()
readRoutePaths(routesDir, '', routePaths)

function collectAdvertisedUrls(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith(origin)) into.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAdvertisedUrls(item, into)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectAdvertisedUrls(item, into)
  }
}

const manifest = buildSiteDiscoveryManifest({ canonicalBaseUrl: `${origin}/`, now: 1_700_000_000_000 })

describe('Site discovery manifest', () => {
  it('keeps the cold handshake compact and links to schemas instead of embedding them', () => {
    const compact = projectCompactSiteDiscoveryManifest(manifest)
    const serialized = JSON.stringify(compact)

    expect(new TextEncoder().encode(serialized).length).toBeLessThan(64 * 1024)
    expect(serialized).not.toContain('inputJsonSchema')
    expect(serialized).not.toContain('outputJsonSchema')
    expect(compact.fullContract).toBe(`${origin}/.well-known/ucp?technical=1`)
    expect(compact.toolGateway.access.connected.cli).toContain('ae connect')
  })

  it('resolves the route-file scan it depends on', () => {
    // Guards the helper itself: a broken scan would make every path "missing".
    expect(routePaths.has('/.well-known/http-message-signatures-directory')).toBe(true)
    expect(routePaths.has('/$slug/ucp')).toBe(true)
    expect(routePaths.has('/llms.txt')).toBe(true)
    expect(routePaths.has('/agent-access')).toBe(true)
    expect(routePaths.has('/')).toBe(true)
  })

  it('advertises only URLs this app serves', () => {
    const advertised = new Set<string>()
    collectAdvertisedUrls(manifest, advertised)

    const missing = [...advertised].filter((url) => {
      const withoutQuery = url.slice(origin.length).split('?')[0] || '/'
      // Any `{name}` placeholder maps to the router's `$name` segment, so a
      // templated endpoint is still checked against a real route file.
      return !routePaths.has(withoutQuery.replace(/\{(\w+)\}/gu, '$$$1'))
    })

    expect(missing).toEqual([])
    expect(advertised.size).toBeGreaterThan(10)
  })

  it('gives a cold agent the Tool reads, manifest, and authenticated gateway', () => {
    const pathsByKind = new Map<string, readonly string[]>(
      manifest.endpoints.map((endpoint) => [
        endpoint.kind,
        manifest.endpoints.filter((other) => other.kind === endpoint.kind).map((other) => other.path),
      ])
    )

    expect(pathsByKind.get('catalog_list')).toBeUndefined()
    expect(pathsByKind.get('catalog_search')).toBeUndefined()
    expect(pathsByKind.get('business_manifest')).toBeUndefined()
    expect(pathsByKind.get('tool_read')).toEqual([
      '/api/v1/market-tools/search',
      '/api/v1/market-tools/list',
      '/api/v1/market-tools/describe',
      '/api/v1/market-tools/compare',
    ])
    expect(pathsByKind.get('funding_preflight')).toEqual([
      '/api/v1/funding/constraints',
      '/api/v1/funding/quote',
    ])
    expect(pathsByKind.get('discovery_artifact')).toBeUndefined()
    expect(manifest).not.toHaveProperty('businessTools')
    expect(pathsByKind.get('site_entry_point')).toEqual(['/.well-known/ucp'])
    expect(JSON.stringify(manifest)).not.toMatch(/\/api\/answer|answer_turn|\/api\/chat\/anonymous/u)
  })

  it('states the authentication each endpoint actually enforces', () => {
    const call = manifest.endpoints.find((endpoint) => endpoint.kind === 'call')
    const toolReads = manifest.endpoints.filter((endpoint) => endpoint.kind === 'tool_read')

    expect(manifest).not.toHaveProperty('customerRequest')
    expect(call).toMatchObject({
      method: 'POST',
      path: '/api/v1/tools/call',
      authentication: 'clerk_api_key',
      requiredScope: 'market_tools:call',
      requiredHeaders: {
        Authorization: 'required',
        'Content-Type': 'required',
      },
    })
    expect(manifest.toolGateway).toMatchObject({
      contract: 'tool.call:v1',
      action: 'tool.call',
      scope: CALL_ROUTE_CONTRACT.scope,
      http: {
        requestMediaType: 'application/json',
        responseMediaType: 'application/json',
        problemMediaType: 'application/problem+json',
        idempotencyLocation: 'body.idempotencyKey',
        authorizationHeader: 'Authorization',
        retry: {
          retryableField: 'retryable',
          retryAfterHeader: 'Retry-After',
          retryableRule: 'respect_retry_after_same_material',
          uncertainRule: 'status_then_recover_same_identity',
        },
      },
      mcp: {
        endpoint: `${origin}/mcp`,
        callTool: 'ae_tool_call',
        protocolVersion: LATEST_PROTOCOL_VERSION,
        lifecycle: ['initialize', 'notifications/initialized', 'tools/list', 'tools/call', 'close'],
        inputFields: expect.arrayContaining(['quoteRef', 'idempotencyKey']),
      },
      executionModes: {
        gateway: { action: 'tool.call', requiresToolRef: true },
        catalogOnly: { action: null, executable: false },
      },
    })
    expect(manifest.toolGateway).not.toHaveProperty('directKeyless')
    for (const endpoint of toolReads) {
      if (endpoint.actionId === undefined) throw new Error(`Tool endpoint is missing actionId: ${endpoint.path}`)
      const action = findAction(endpoint.actionId)
      if (action === undefined) throw new Error(`Tool endpoint action is not registered: ${endpoint.actionId}`)
      const descriptor = describeActionForAgent(action)
      expect(endpoint.contractVersion).toBe(action.invocationContract.version)
      expect(endpoint.inputJsonSchema).toEqual(descriptor.inputJsonSchema)
      expect(endpoint.outputJsonSchema).toEqual(descriptor.outputJsonSchema)
    }

    expect(toolReads.map((endpoint) => endpoint.path)).toEqual([
      '/api/v1/market-tools/search',
      '/api/v1/market-tools/list',
      '/api/v1/market-tools/describe',
      '/api/v1/market-tools/compare',
    ])
    expect(toolReads.every((endpoint) => endpoint.method === 'POST' && endpoint.authentication === 'none')).toBe(true)
    expect(toolReads.every((endpoint) => endpoint.inputJsonSchema !== undefined)).toBe(true)
  })

  it('advertises exact anonymous funding preflight before any payment authority', () => {
    const funding = manifest.endpoints.filter((endpoint) => endpoint.kind === 'funding_preflight')

    expect(funding).toHaveLength(2)
    expect(funding.map((endpoint) => ({
      path: endpoint.path,
      method: endpoint.method,
      authentication: endpoint.authentication,
      contractVersion: endpoint.contractVersion,
    }))).toEqual([
      {
        path: '/api/v1/funding/constraints',
        method: 'GET',
        authentication: 'none',
        contractVersion: FUNDING_QUOTE_CONTRACT_VERSION,
      },
      {
        path: '/api/v1/funding/quote',
        method: 'POST',
        authentication: 'none',
        contractVersion: FUNDING_QUOTE_CONTRACT_VERSION,
      },
    ])
    expect(funding[0]?.outputJsonSchema).toBeDefined()
    expect(funding[1]).toMatchObject({
      requiredHeaders: { 'Content-Type': 'required' },
      inputJsonSchema: expect.any(Object),
      outputJsonSchema: expect.any(Object),
    })
  })
  it('projects every Tool and Call route and schema from the canonical contract', () => {
    const expected = [
      TOOL_QUOTE_ROUTE_CONTRACT,
      CALL_ROUTE_CONTRACT.call,
      CALL_ROUTE_CONTRACT.list,
      CALL_ROUTE_CONTRACT.status,
      CALL_ROUTE_CONTRACT.cancel,
      CALL_ROUTE_CONTRACT.reconcile,
    ]
    expect(manifest.toolGateway.routes.map((route) => ({
      actionId: route.actionId,
      contractVersion: route.contractVersion,
      method: route.method,
      path: route.path,
      routerPath: route.routerPath,
      requiredHeaders: route.requiredHeaders,
    }))).toEqual(expected.map((route) => ({
      actionId: route.actionId,
      contractVersion: route.contractVersion,
      method: route.method,
      path: route.path,
      routerPath: route.routerPath,
      requiredHeaders: route.requiredHeaders,
    })))
    expect(manifest.toolGateway.routes.every((route) => route.inputJsonSchema !== undefined)).toBe(true)
    expect(manifest.toolGateway.mcpTools.map((tool) => tool.name)).toContain('ae_tool_call')
    expect(manifest.toolGateway.mcpTools.map((tool) => tool.name)).toContain('ae_call_list')
  })
  it('keeps cancellation and reconciliation labelled as advanced recovery actions', () => {
    expect(manifest.toolGateway.recovery).toMatchObject({
      statusAction: 'call.status',
      advancedActions: {
        cancel: 'call.cancel',
        reconcile: 'call.reconcile',
      },
      retryRule: 'inspect_status_then_recover_uncertain',
    })
    expect(manifest.toolGateway.recovery).not.toHaveProperty('cancelAction')
    expect(manifest.toolGateway.recovery).not.toHaveProperty('reconcileAction')
  })

  it('marks exactly the templated paths as templated', () => {
    const templated = manifest.endpoints.filter((endpoint) => endpoint.templated).map((endpoint) => endpoint.path)

    expect([...templated].sort()).toEqual([
      '/api/v1/calls/{callRef}',
      '/api/v1/calls/{callRef}/cancel',
      '/api/v1/calls/{callRef}/reconcile',
    ])
  })

  it('publishes each path once', () => {
    const paths = manifest.endpoints.map((endpoint) => endpoint.path)

    expect(paths).toEqual([...new Set(paths)])
  })

  it('uses the unbounded descriptor digest for deterministic, schema-sensitive manifests', () => {
    const rebuilt = buildSiteDiscoveryManifest({ canonicalBaseUrl: `${origin}/`, now: 1_700_000_000_000 })
    expect(rebuilt.generatedHash).toBe(manifest.generatedHash)

    const { generatedAt: _generatedAt, generatedHash: _generatedHash, ...body } = manifest
    expect(schemaDescriptorDigest(body as StableHashValue)).toBe(manifest.generatedHash)

    const firstRoute = body.toolGateway.routes[0]
    if (firstRoute === undefined) throw new Error('Expected a Tool or Call route')
    const changed = {
      ...body,
      toolGateway: {
        ...body.toolGateway,
        routes: body.toolGateway.routes.map((route, index) => (
          index === 0 ? { ...route, contractVersion: `${route.contractVersion}:changed` } : route
        )),
      },
    }
    expect(schemaDescriptorDigest(changed as StableHashValue)).not.toBe(manifest.generatedHash)

    const changedGatewayAction = {
      ...body,
      toolGateway: {
        ...body.toolGateway,
        executionModes: {
          ...body.toolGateway.executionModes,
          gateway: {
            ...body.toolGateway.executionModes.gateway,
            action: 'call.status',
          },
        },
      },
    }
    expect(schemaDescriptorDigest(changedGatewayAction as StableHashValue)).not.toBe(manifest.generatedHash)


    const oversized = { values: Array.from({ length: 10_001 }, (_, index) => index) }
    expect(() => canonicalDigest(oversized)).toThrow('canonical_digest_value_invalid')
    expect(() => schemaDescriptorDigest(oversized as StableHashValue)).not.toThrow()
  })

  it('carries the listing boundary and claims no capability AE withholds', () => {
    expect(manifest.boundary).toContain('The Tool catalogue is the canonical market')
    expect(manifest.unsupportedCapabilities.map((capability) => capability.label)).toContain(
      'Commercial or owner-action authority'
    )
  })

  it('serves compact, technical, and HEAD discovery from one contract', async () => {
    const compact = await handleSiteDiscoveryManifestRequest(
      new Request(`${origin}/.well-known/ucp`),
    ).json() as Record<string, unknown>
    const technical = await handleSiteDiscoveryManifestRequest(
      new Request(`${origin}/.well-known/ucp?technical=1`),
    ).json() as Record<string, unknown>
    const head = handleSiteDiscoveryManifestRequest(
      new Request(`${origin}/.well-known/ucp`, { method: 'HEAD' }),
      true,
    )

    expect(compact).toHaveProperty(
      'fullContract',
      `${String(compact.origin)}/.well-known/ucp?technical=1`,
    )
    expect(compact).not.toHaveProperty('businessManifestUrlTemplate')
    expect(technical).toHaveProperty('toolGateway.routes')
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })
})
