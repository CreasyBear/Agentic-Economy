import { describe, expect, it, vi } from 'vitest'

import {
  package5ProviderOperationsConfigFromEnvironment,
  runPackage5ProviderOperationsRelease,
  type Package5ProviderOperationsConfig,
} from '../../../tools/release/package5-provider-operations'
import type { SupplySourceInput } from '../../../src/modules/capability-supply/source-preview'

const sha = (letter: string): string => `sha256:${letter.repeat(64)}`
const toolRef = (index: number): string => `operation:v1:${String(index).repeat(64)}`
const sourceKinds = ['openapi', 'mcp', 'agent_plugin', 'x402'] as const

function source(kind: (typeof sourceKinds)[number]): SupplySourceInput {
  if (kind === 'openapi') {
    return { kind, definitionUrl: 'https://fixtures.example/openapi.json', environment: 'sandbox' }
  }
  if (kind === 'mcp') {
    return { kind, serverUrl: 'https://fixtures.example/mcp', environment: 'sandbox' }
  }
  if (kind === 'agent_plugin') {
    return {
      kind,
      pluginJson: { schema_version: '1.0', name_for_model: 'fixture' },
      mcpJson: { schema_version: '1.0', servers: [] },
      remoteRef: sha('f'),
      environment: 'sandbox',
    }
  }
  return { kind, resourceUrl: 'https://fixtures.example/x402', method: 'POST', environment: 'sandbox' }
}

function config(fetch: typeof globalThis.fetch): Package5ProviderOperationsConfig {
  return {
    baseUrl: 'https://staging.agentic-economy.example',
    expectedSourceRevision: 'a'.repeat(40),
    providerApiKey: 'provider-secret',
    buyerApiKey: 'buyer-secret',
    businessRef: 'business:fixture',
    environment: 'sandbox',
    maxStatusWaitMs: 1_000,
    statusDelayMs: 0,
    fetch,
    now: () => 1_700_000_000_000,
    sleep: async () => undefined,
    fixtures: sourceKinds.map((kind, index) => ({
      kind,
      source: source(kind),
      candidateMatch: kind === 'openapi'
        ? { path: '/execute', method: 'post' }
        : kind === 'x402'
          ? { resourceUrl: 'https://fixtures.example/x402', method: 'POST' }
          : { toolName: `${kind}-tool` },
      connectionRef: kind === 'openapi' ? undefined : `connection:${kind}`,
      presentation: {
        name: `Package 5 ${kind} ${index}`,
        description: `Package 5 ${kind} staging fixture`,
        category: 'release-proof',
      },
      consequences: { effects: [], dataUse: [], evidence: [] },
      pricing: kind === 'x402' ? { kind: 'source_x402' } : { kind: 'free' },
      validationInput: { value: kind },
      callInput: { value: kind },
    })),
  }
}

function status(kind: (typeof sourceKinds)[number], index: number) {
  return {
    schemaVersion: 'provider_tools:v1',
    businessRef: 'business:fixture',
    providerRef: `provider:${kind}`,
    toolRef: toolRef(index + 1),
    revision: 1,
    state: 'Published',
    reasonCodes: [],
    observedAt: 1_700_000_000_000,
    validUntil: 1_700_000_060_000,
    source: { kind, revision: `${kind}:revision`, digest: sha(String(index + 1)) },
    routeability: { available: true, reasonCodes: [] },
    authority: kind === 'openapi'
      ? { kind: 'public' }
      : { kind: 'connection', connectionRef: `connection:${kind}`, providerRef: `provider:${kind}` },
    health: {
      connection: kind === 'openapi' ? 'not_required' : 'connected',
      validation: 'passed',
      publication: 'published',
      freshness: 'current',
      delivery: { kind: 'unobserved', provenance: 'canonical_call_receipts' },
      usefulOutcome: { kind: 'unobserved', provenance: 'qualified_use_receipts' },
      operationalConditions: [],
    },
  }
}

function json(body: unknown, statusCode = 200): Response {
  return Response.json(body, { status: statusCode })
}

function successfulFetch(requests: Request[]): typeof globalThis.fetch {
  return vi.fn(async (input, init) => {
    const request = new Request(input, init)
    requests.push(request)
    const path = new URL(request.url).pathname
    if (path === '/api/v1/release') return json({ kind: 'ok', sourceRevision: 'a'.repeat(40) })

    const body = request.method === 'POST' ? JSON.parse(await request.clone().text()) as Record<string, unknown> : {}
    const kind = sourceKinds.find((candidate) => JSON.stringify(body).includes(`\"kind\":\"${candidate}\"`))
    if (path.endsWith('/sources/preview')) {
      const sourceKind = String((body as { kind: string }).kind) as (typeof sourceKinds)[number]
      const index = sourceKinds.indexOf(sourceKind)
      const selector = sourceKind === 'openapi'
        ? { serverUrl: 'https://fixtures.example', path: '/execute', method: 'post' }
        : sourceKind === 'x402'
          ? { resourceUrl: 'https://fixtures.example/x402', method: 'POST' }
          : sourceKind === 'agent_plugin'
            ? { serverName: 'fixture', serverUrl: 'https://fixtures.example/mcp', toolName: `${sourceKind}-tool`, protocolVersion: '2025-11-25' }
            : { serverUrl: 'https://fixtures.example/mcp', toolName: `${sourceKind}-tool`, protocolVersion: '2025-11-25' }
      return json({
        kind: 'ready', sourceDigest: sha(String(index + 1)), sourceRevision: `${sourceKind}:revision`,
        provenance: { sourceKind, sourceUrl: 'https://fixtures.example/source', authority: sourceKind === 'x402' ? 'observed_external' : 'unverified_public' },
        authentication: [{ kind: sourceKind === 'openapi' ? 'public' : sourceKind === 'x402' ? 'x402_wallet' : 'mcp_oauth' }],
        candidates: [{
          candidateRef: sha(String(index + 5)), sourceSelector: selector, title: `${sourceKind} operation`, description: 'fixture',
          inputSchema: { type: 'object' }, outputSchema: { type: 'object' }, authentication: { kind: sourceKind === 'openapi' ? 'public' : sourceKind === 'x402' ? 'x402_wallet' : 'mcp_oauth' },
          validationExampleAvailable: true,
          ...(sourceKind === 'x402' ? { x402: { scheme: 'exact', network: 'eip155:84532', amount: '1', asset: '0x123', payTo: '0x456' } } : {}),
          disposition: { kind: 'supported' },
        }],
      })
    }
    if (path.endsWith('/supply/publish')) {
      const sourceKind = String(((body.source as Record<string, unknown>).kind)) as (typeof sourceKinds)[number]
      const index = sourceKinds.indexOf(sourceKind)
      return json({ kind: 'submitted', publicationRef: `publication:${sourceKind}`, publicationRevision: 1, toolRef: toolRef(index + 1), state: 'Submitted' })
    }
    if (path.endsWith('/supply/status')) {
      const index = sourceKinds.findIndex((_, candidateIndex) => body.toolRef === toolRef(candidateIndex + 1))
      return json({ kind: 'available', schemaVersion: 'provider_tools:v1', businessRef: 'business:fixture', status: status(sourceKinds[index]!, index) })
    }
    if (path.endsWith('/supply/tools/list')) {
      return json({ kind: 'available', schemaVersion: 'provider_tools:v1', businessRef: 'business:fixture', page: sourceKinds.map(status), isDone: true, continueCursor: null })
    }
    if (path.endsWith('/market-tools/search')) {
      const index = sourceKinds.findIndex((sourceKind) => String(body.query).includes(sourceKind))
      return json({
        kind: 'ok', schemaVersion: 'registry-tools:v3', query: body.query, count: 1,
        items: [{ toolRef: toolRef(index + 1), capabilityId: `fixture.${sourceKinds[index]}`, title: String(body.query), description: 'fixture', provider: { name: 'Fixture', slug: 'fixture' }, priceLabel: 'Free', healthStatus: 'operational' }],
        pagination: { limit: 20, hasMore: false },
      })
    }
    if (path.endsWith('/market-tools/describe')) {
      return json({
        kind: 'found', schemaVersion: 'registry-tools:v2', tool: {
          toolRef: body.toolRef, capabilityId: 'fixture.execute', title: 'Fixture', description: 'fixture', provider: { name: 'Fixture', slug: 'fixture' },
          priceLabel: 'Free', healthStatus: 'operational', inputJsonSchema: { type: 'object' }, outputJsonSchema: { type: 'object' }, materialTerms: [], dataUse: [], effects: [], evidence: [], authentication: { kind: 'ae_api_key' },
        },
      })
    }
    if (path.endsWith('/tools/call') && 'toolRef' in body) {
      return json({ type: 'https://agentic-economy.example/problems/invalid-argument', title: 'Invalid argument', status: 400, code: 'invalid_request' }, 400)
    }
    if (path.endsWith('/tools/quote')) {
      const index = sourceKinds.findIndex((sourceKind) => (body.input as Record<string, unknown>).value === sourceKind)
      const quoteRef = `operation-commitment:v1:${String(index + 5).repeat(64)}`
      return json({
        kind: 'committed', quoteRef, toolRef: body.toolRef, toolVersion: 1, expiresAt: 1_700_000_060_000,
        normalizedInput: body.input, price: { currency: 'AUD', units: '0', exponent: 6 },
        account: { accountRef: 'account:fixture', available: { currency: 'AUD', units: '1000000', exponent: 6 } },
        budget: { principalRef: 'principal:buyer', maximumPerCall: { currency: 'AUD', units: '1000000', exponent: 6 } },
        policyRefs: ['policy:fixture'], evidenceDigest: sha('e'),
        continuation: { action: 'tool.call', method: 'POST', path: '/api/v1/tools/call', input: { quoteRef, idempotencyKey: `call-${index}` } },
      })
    }
    if (path.endsWith('/tools/call')) {
      const index = Number(String(body.idempotencyKey).split('-').at(-1))
      return json({
        kind: 'completed', callRef: `invocation:${index}`, toolRef: toolRef(index + 1), output: { ok: true }, evidenceHash: sha('d'),
        usage: { usageRef: `usage:${index}`, observedAt: 1_700_000_000_000, chargeState: 'free_tier', amount: { currency: 'AUD', units: '0', exponent: 6 }, priceDigest: sha('c') },
      })
    }
    throw new Error(`unexpected_request:${path}:${kind ?? 'none'}`)
  }) as typeof globalThis.fetch
}

describe('Package 5 Provider Operations release harness', () => {
  it('fails configuration before any HTTP effect when a prerequisite is absent', async () => {
    const fetch = vi.fn()
    expect(() => package5ProviderOperationsConfigFromEnvironment({
      AE_PACKAGE5_BASE_URL: 'https://staging.agentic-economy.example',
    }, fetch as typeof globalThis.fetch)).toThrow('AE_PACKAGE5_EXPECTED_SOURCE_REVISION')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('proves every source through public Provider and buyer contracts in exact order', async () => {
    const requests: Request[] = []
    const receipt = await runPackage5ProviderOperationsRelease(config(successfulFetch(requests)))

    expect(receipt.schemaVersion).toBe('package5-provider-operations-release:v1')
    expect(receipt.deployment.sourceRevision).toBe('a'.repeat(40))
    expect(receipt.fixtures.map(({ sourceKind }) => sourceKind)).toEqual(sourceKinds)
    expect(JSON.stringify(receipt)).not.toContain('provider-secret')
    expect(JSON.stringify(receipt)).not.toContain('buyer-secret')

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/api/v1/release',
      ...sourceKinds.flatMap(() => [
        '/api/v1/supply/sources/preview',
        '/api/v1/supply/publish',
        '/api/v1/supply/status',
        '/api/v1/supply/tools/list',
        '/api/v1/market-tools/search',
        '/api/v1/market-tools/describe',
        '/api/v1/tools/call',
        '/api/v1/tools/quote',
        '/api/v1/tools/call',
      ]),
    ])

    for (const request of requests.filter((candidate) => new URL(candidate.url).pathname.includes('/supply/'))) {
      expect(request.headers.get('authorization')).toBe('Bearer provider-secret')
    }
    for (const request of requests.filter((candidate) => new URL(candidate.url).pathname.startsWith('/api/v1/tools/'))) {
      expect(request.headers.get('authorization')).toBe('Bearer buyer-secret')
    }
    const invokeBodies = await Promise.all(requests
      .filter((request) => new URL(request.url).pathname === '/api/v1/tools/call')
      .map(async (request) => JSON.parse(await request.clone().text())))
    expect(invokeBodies.filter((body) => 'quoteRef' in body)).toHaveLength(4)
    expect(invokeBodies.filter((body) => 'quoteRef' in body).every((body) => Object.keys(body).sort().join(',') === 'idempotencyKey,quoteRef')).toBe(true)
  })

  it('fails the release when the public gateway accepts the obsolete call shape', async () => {
    const requests: Request[] = []
    const fetch = successfulFetch(requests)
    const acceptingFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (new URL(request.url).pathname === '/api/v1/tools/call') {
        const body = JSON.parse(await request.clone().text()) as Record<string, unknown>
        if ('toolRef' in body) return json({ kind: 'completed' })
      }
      return await fetch(input, init)
    }) as typeof globalThis.fetch

    await expect(runPackage5ProviderOperationsRelease(config(acceptingFetch)))
      .rejects.toThrow('package5_old_call_shape_accepted')
  })

  it('returns one hosted authority-review handoff and resumes the same publication after approval', async () => {
    const requests: Request[] = []
    const baseFetch = successfulFetch(requests)
    let reviewed = false
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init)
      if (new URL(request.url).pathname === '/api/v1/supply/status') {
        const body = JSON.parse(await request.clone().text()) as Record<string, unknown>
        if (body.toolRef === toolRef(1) && !reviewed) {
          requests.push(request)
          return json({
            kind: 'available',
            schemaVersion: 'provider_tools:v1',
            businessRef: 'business:fixture',
            status: {
              ...status('openapi', 0),
              state: 'Action required',
              reasonCodes: ['provider_authority_unverified'],
              routeability: { available: false, reasonCodes: ['provider_authority_unverified'] },
              authority: { kind: 'unverified' },
              health: {
                ...status('openapi', 0).health,
                operationalConditions: ['provider_authority_unverified'],
              },
            },
          })
        }
      }
      return await baseFetch(input, init)
    }) as typeof globalThis.fetch

    const firstFailure = await runPackage5ProviderOperationsRelease(config(fetch)).catch((error: unknown) => error)
    expect(firstFailure).toMatchObject({
      name: 'Package5AuthorityReviewRequired',
      sourceKind: 'openapi',
      toolRef: toolRef(1),
    })
    const reviewUrl = new URL((firstFailure as { reviewUrl: string }).reviewUrl)
    expect(`${reviewUrl.origin}${reviewUrl.pathname}`).toBe('https://staging.agentic-economy.example/admin/index-health')
    expect(Object.fromEntries(reviewUrl.searchParams)).toEqual({
      expectedRevision: '1',
      expectedSourceDigest: sha('1'),
      toolRef: toolRef(1),
      publicationRef: 'publication:openapi',
      sourceKind: 'openapi',
      sourceUrl: 'https://fixtures.example/source',
    })

    reviewed = true
    await expect(runPackage5ProviderOperationsRelease(config(fetch)))
      .resolves.toMatchObject({ schemaVersion: 'package5-provider-operations-release:v1' })
    const openApiPublishes = requests.filter((request) => (
      new URL(request.url).pathname === '/api/v1/supply/publish'
    ))
    const replayBodies = await Promise.all(openApiPublishes.map(async (request) => JSON.parse(await request.clone().text()) as Record<string, unknown>))
    const openApiReplayBodies = replayBodies.filter((body) => (body.source as { kind?: string } | undefined)?.kind === 'openapi')
    expect(openApiReplayBodies).toHaveLength(2)
    expect(openApiReplayBodies.map((body) => body.idempotencyKey)).toEqual([
      'package5:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:openapi',
      'package5:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:openapi',
    ])
  })
})
