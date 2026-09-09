import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runSupplyCommand } from '../../../tools/ae/commands/supply'
import { runConnectCommand } from '../../../tools/ae/commands/connect'
import type { CliOptions } from '../../../tools/ae/lib/args'
import { readStoredConnection, removeStoredConnection, storeConnection } from '../../../tools/ae/lib/config'
import { CliFailure } from '../../../tools/ae/lib/output'

let directory = ''
const baseOptions: CliOptions = {
  baseUrl: 'https://market.example',
  json: true,
  help: false,
  allowWrite: false,
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'ae-cli-supply-'))
  process.env.AE_CONFIG_DIR = directory
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  storeConnection({ baseUrl: baseOptions.baseUrl, accessToken: 'hidden-provider-secret', scope: 'market_supply:manage' })
})

afterEach(() => {
  delete process.env.AE_CONFIG_DIR
  delete process.env.AE_API_KEY
  delete process.env.AE_API_KEY_ORIGIN
  rmSync(directory, { recursive: true, force: true })
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AE CLI provider Tool lifecycle', () => {
  it('requests and stores a separate provider credential without replacing buyer access', async () => {
    removeStoredConnection(baseOptions.baseUrl, 'provider')
    storeConnection({ baseUrl: baseOptions.baseUrl, accessToken: 'buyer-secret', scope: 'market_operations:invoke customer_requests:bounded_mandate' })
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ client_id: 'provider-client' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({
        device_code: 'provider-device',
        user_code: 'PROV-IDER',
        verification_uri: 'https://market.example/agent-access/authorize?user_code=PROV-IDER',
        expires_in: 600,
        interval: 1,
      }))
      .mockResolvedValueOnce(Response.json({
        access_token: 'new-provider-secret',
        token_type: 'Bearer',
        scope: 'market_supply:manage',
      }))
      .mockResolvedValueOnce(Response.json({
        kind: 'authenticated',
        principalRef: 'prn_provider',
        accountRef: 'acc_owner',
        credentialId: 'key_provider',
        applicationRef: 'agentic-economy',
        environment: 'sandbox',
        scopes: ['market_supply:manage'],
        authorityMode: 'spending_policy',
      }))
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runConnectCommand([], { ...baseOptions, provider: true })

    const registration = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    expect(registration).toMatchObject({ client_name: 'Agentic Economy Provider CLI', scope: 'market_supply:manage' })
    expect(String(fetch.mock.calls[1]?.[1]?.body)).toContain('scope=market_supply%3Amanage')
    expect(String(fetch.mock.calls[3]?.[0])).toBe('https://market.example/api/v1/account')
    expect(readStoredConnection(baseOptions.baseUrl, 'market')?.accessToken).toBe('buyer-secret')
    expect(readStoredConnection(baseOptions.baseUrl, 'provider')?.accessToken).toBe('new-provider-secret')
    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      kind: 'connected',
      profile: 'provider',
      scope: 'market_supply:manage',
    })
  })

  it('reads exact lifecycle status through the canonical action route', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/supply/status')
      expect(init?.method).toBe('POST')
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer hidden-provider-secret')
      expect(JSON.parse(String(init?.body))).toEqual({ businessRef: 'business:one', toolRef: 'operation:one' })
      return Response.json({
        kind: 'available',
        schemaVersion: 'provider_tools:v1',
        businessRef: 'business:one',
        status: {
          schemaVersion: 'provider_tools:v1',
          businessRef: 'business:one',
          providerRef: 'provider:one',
          toolRef: 'operation:one',
          revision: 1,
          state: 'Published',
          reasonCodes: [],
          observedAt: 10,
          source: { kind: 'openapi', revision: 'rev:one', digest: `sha256:${'1'.repeat(64)}` },
          routeability: { available: true, reasonCodes: [] },
          authority: { kind: 'public' },
          health: {
            connection: 'not_required',
            validation: 'passed',
            publication: 'published',
            freshness: 'current',
            delivery: { kind: 'unobserved', provenance: 'canonical_call_receipts' },
            usefulOutcome: { kind: 'unobserved', provenance: 'qualified_use_receipts' },
            operationalConditions: [],
          },
        },
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runSupplyCommand(['status', 'business:one', 'operation:one'], baseOptions)

    expect(fetch).toHaveBeenCalledOnce()
    const output = write.mock.calls.map(([value]) => String(value)).join('')
    expect(JSON.parse(output)).toMatchObject({ kind: 'available', status: { toolRef: 'operation:one', state: 'Published' } })
    expect(output).not.toContain('hidden-provider-secret')
  })

  it('requires a Tool reference for status and refuses before any external fetch', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(runSupplyCommand(['status', 'business:one'], baseOptions)).rejects.toMatchObject({
      code: 'supply-status-usage',
      message: 'Usage: ae supply status <businessRef> <toolRef>',
      nextCommand: 'ae help supply status',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('previews a native x402 source from a schema-matching --input payload without publishing or calling it', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/supply/sources/preview')
      expect(JSON.parse(String(init?.body))).toEqual({
        kind: 'x402',
        resourceUrl: 'https://example.com/pay',
        method: 'GET',
        environment: 'sandbox',
      })
      return Response.json({
        kind: 'ready',
        sourceDigest: `sha256:${'1'.repeat(64)}`,
        sourceRevision: 'rev:one',
        provenance: { sourceKind: 'x402', sourceUrl: 'https://example.com/pay', authority: 'unverified_public' },
        authentication: [],
        candidates: [],
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runSupplyCommand(['preview'], {
      ...baseOptions,
      input: JSON.stringify({ kind: 'x402', resourceUrl: 'https://example.com/pay', method: 'GET', environment: 'sandbox' }),
    })

    expect(fetch).toHaveBeenCalledOnce()
    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({ kind: 'ready' })
  })

  it('rejects a malformed preview payload with a message naming the missing field, before any fetch', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(runSupplyCommand(['preview'], {
      ...baseOptions,
      input: JSON.stringify({ kind: 'x402', resourceUrl: 'https://example.com/pay', method: 'GET' }),
    })).rejects.toMatchObject({
      code: 'supply-input-invalid',
      message: expect.stringContaining('environment'),
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reads Provider offboarding without granting the CLI authority to start or resume it', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/supply/offboarding/status')
      expect(JSON.parse(String(init?.body))).toEqual({ businessRef: 'business:one' })
      return Response.json({
        kind: 'available',
        status: {
          schemaVersion: 'provider_offboarding:v1',
          caseRef: 'offboarding:one',
          businessRef: 'business:one',
          providerRef: 'provider:one',
          revision: 2,
          state: 'Action required',
          routeabilityFrozen: true,
          blockerCodes: ['payout_resolution_required'],
          observedAt: 10,
          retentionPolicyVersion: 'retention:2026-09',
          continuation: { action: 'supply.offboarding.status' },
        },
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runSupplyCommand(['offboarding', 'business:one'], { ...baseOptions, json: false })

    expect(fetch).toHaveBeenCalledOnce()
    const output = write.mock.calls.flat().join('')
    expect(output).toContain('state            Action required')
    expect(output).toContain('new work frozen  yes')
    expect(output).toContain('payout_resolution_required')
  })

  it('renders the shared provider continuation from current lifecycle facts', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({
      kind: 'available',
      schemaVersion: 'provider_tools:v1',
      businessRef: 'business:one',
      page: [{
        schemaVersion: 'provider_tools:v1',
        businessRef: 'business:one',
        providerRef: 'provider:one',
        toolRef: 'operation:one',
        revision: 1,
        state: 'Under review',
        reasonCodes: [],
        observedAt: 10,
        source: { kind: 'mcp' },
        routeability: { available: false, reasonCodes: [] },
        authority: { kind: 'public' },
        health: {
          connection: 'not_required',
          validation: 'in_progress',
          publication: 'published',
          freshness: 'unobserved',
          delivery: {
            kind: 'observed',
            deliveredCount: 4,
            notDeliveredCount: 1,
            unknownCount: 0,
            sampleSize: 5,
            lastObservedAt: 9,
            windowStartAt: 1,
            windowEndAt: 10,
            provenance: 'canonical_call_receipts',
          },
          usefulOutcome: {
            kind: 'observed',
            qualifiedUseCount: 3,
            lastObservedAt: 8,
            windowStartAt: 1,
            windowEndAt: 10,
            provenance: 'qualified_use_receipts',
          },
          operationalConditions: [],
        },
        continuation: { action: 'supply.status' },
      }],
      isDone: true,
      continueCursor: null,
    }))
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runSupplyCommand(['tools', 'business:one'], { ...baseOptions, json: false })

    const output = write.mock.calls.flat().join('')
    expect(output).toContain('next  supply.status')
    expect(output).toContain('4/5 delivered; 1 not delivered; 0 unknown')
    expect(output).toContain('Qualified Use  3')
  })

  it('rejects the retired supply operations command without a compatibility alias', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(runSupplyCommand(['operations', 'business:one'], baseOptions)).rejects.toMatchObject({
      code: 'supply-usage',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the shared missing-provider-connection guidance for an empty connection list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      kind: 'available',
      businessId: 'business:one',
      connections: [],
    })))
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runSupplyCommand(['connections', 'business:one'], { ...baseOptions, json: false })

    expect(write.mock.calls.flat().join('')).toContain('next  /owner/offerings#provider-connections')
  })

  it('adds one explicit idempotency key to maintenance material', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        publicationRef: 'publication:one',
        idempotencyKey: 'stable-recheck-key',
      })
      return Response.json({
        kind: 'refreshed',
        publicationRef: 'publication:one',
        revision: 1,
        disposition: 'current',
        lifecycle: { state: 'inactive', reasons: ['health_unobserved'] },
      })
    })
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    const input = JSON.stringify({
      businessId: 'business:one',
      offeringRef: 'offering:one',
      offeringRevision: 1,
      offeringSourceHash: 'source:one',
      publicationRef: 'publication:one',
      publicationRevision: 1,
    })

    await runSupplyCommand(['recheck'], { ...baseOptions, input, idempotencyKey: 'stable-recheck-key' })

    expect(fetch).toHaveBeenCalledOnce()
  })

  it('refuses conflicting retry identities before any network call', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)

    await expect(runSupplyCommand(['withdraw'], {
      ...baseOptions,
      idempotencyKey: 'command-key-two',
      input: JSON.stringify({ idempotencyKey: 'command-key-one' }),
    })).rejects.toMatchObject({
      kind: 'INVALID_ARGUMENT',
      code: 'supply-idempotency-key-mismatch',
    } satisfies Partial<CliFailure>)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('lists provider connections and preserves their exact lifecycle identity', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/supply/connections/list')
      expect(JSON.parse(String(init?.body))).toEqual({
        businessId: 'business:one',
        lifecycle: 'cleanup_required',
        limit: 100,
      })
      return Response.json({
        kind: 'available',
        businessId: 'business:one',
        connections: [{
          connectionRef: 'connection:x402:one',
          businessId: 'business:one',
          providerRef: 'provider:x402:provider.example',
          providerAccountRef: 'x402:https://provider.example/pay',
          adapterId: 'x402:v1',
          grantedScopes: ['x402:pay'],
          grantedResources: ['https://provider.example/pay'],
          authorityGeneration: 3,
          authorityDigest: 'sha256:authority',
          lifecycle: 'cleanup_required',
          available: false,
          credentialConfigured: false,
          observedAt: 10,
          reasonCode: 'cleanup_failed',
          evidenceRefs: [],
          createdAt: 1,
          updatedAt: 10,
        }],
      })
    })
    vi.stubGlobal('fetch', fetch)
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runSupplyCommand(['connections', 'business:one', 'cleanup_required'], baseOptions)

    expect(JSON.parse(write.mock.calls.map(([value]) => String(value)).join(''))).toMatchObject({
      connections: [{ connectionRef: 'connection:x402:one', lifecycle: 'cleanup_required', authorityGeneration: 3 }],
    })
  })

  it('reconnects using exact concurrency facts and one explicit retry identity', async () => {
    const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('https://market.example/api/v1/supply/connections/reconnect')
      expect(JSON.parse(String(init?.body))).toEqual({
        connectionRef: 'connection:x402:one',
        expectedAuthorityGeneration: 3,
        expectedAuthorityDigest: 'sha256:authority',
        evidenceRefs: [],
        idempotencyKey: 'stable-reconnect-key',
      })
      return Response.json({ kind: 'refused', reason: 'invalid_generation' })
    })
    vi.stubGlobal('fetch', fetch)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)

    await runSupplyCommand(['reconnect'], {
      ...baseOptions,
      idempotencyKey: 'stable-reconnect-key',
      input: JSON.stringify({
        connectionRef: 'connection:x402:one',
        expectedAuthorityGeneration: 3,
        expectedAuthorityDigest: 'sha256:authority',
        evidenceRefs: [],
      }),
    })

    expect(fetch).toHaveBeenCalledOnce()
  })
})
