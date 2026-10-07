import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setHttpRateLimitAdmissionForTests } from '@/lib/server/rate-limit'
import { handleSupplyActionPost } from '@/lib/server/supply-action-api'
import type { SupplyManagementService } from '@/modules/capability-supply/supply-actions'
import { projectProviderToolStatus } from '@/modules/capability-supply/provider-tool-status'

beforeEach(() => vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'development'))
afterEach(() => vi.unstubAllEnvs())

const authenticate = async (scopes: readonly string[] = ['market_supply:manage']) => ({
  isAuthenticated: true as const,
  tokenType: 'api_key' as const,
  id: 'key_supply',
  subject: 'user_supply',
  scopes,
  claims: { aeEnvironment: 'sandbox' },
})

function service(overrides: Partial<SupplyManagementService> = {}): SupplyManagementService {
  return {
    sourcePreview: vi.fn().mockResolvedValue({ kind: 'action_required', requiredAction: {
      action: 'supply.source.preview', blockedCapabilities: ['supply.publish'], cta: null,
      ctaLabel: 'Check source', description: 'Check source.', iconUrl: null,
      status: 'required', title: 'Source unavailable',
    } }),
    toolsList: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    status: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    publish: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    withdraw: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    recheck: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    republish: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    earnings: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    calls: vi.fn().mockResolvedValue({ kind: 'available', items: [], limit: 20, hasMore: false }),
    connectionList: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    connectionDetail: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    connectionConnect: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    connectionReconnect: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    connectionRevoke: vi.fn().mockResolvedValue({ kind: 'refused', reason: 'unused' }),
    offboardingStatus: vi.fn().mockResolvedValue({ kind: 'not_found' }),
    ...overrides,
  }
}

const resolvePrincipal = async () => ({
  principalId: 'prn_00000000000040008000000000000044',
  ownerId: 'acc_00000000000040008000000000000044',
  credentialId: 'key_supply',
  applicationRef: 'agentic-economy',
  environment: 'sandbox' as const,
  scopes: ['market_supply:manage'],
  authorityMode: 'spending_policy' as const,
})
const authenticateProduction = async (scopes: readonly string[] = ['market_supply:manage']) => ({
  ...await authenticate(scopes), claims: { aeEnvironment: 'production' },
})
const resolveProductionPrincipal = async () => ({ ...await resolvePrincipal(), environment: 'production' as const })

describe('Provider action HTTP adapter', () => {
  it('rate-limits Provider actions before service dispatch when admission is denied', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: false, retryAfter: 5_000 }))
    const status = vi.fn().mockResolvedValue({ kind: 'not_found' })
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/status', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-provider-secret' },
        body: JSON.stringify({ businessRef: 'business:one', toolRef: 'operation:one' }),
      }),
      'status',
      { authenticate, resolvePrincipal, supplyManagementService: service({ status }) },
    )

    expect(response.status).toBe(429)
    expect(status).not.toHaveBeenCalled()
  })

  it('dispatches native source preview through the same authenticated read boundary', async () => {
    const sourcePreview = vi.fn().mockResolvedValue({
      kind: 'ready',
      sourceDigest: `sha256:${'1'.repeat(64)}`,
      sourceRevision: `x402:sha256:${'1'.repeat(64)}`,
      provenance: {
        sourceKind: 'x402',
        sourceUrl: 'https://provider.example/paid',
        authority: 'observed_external',
      },
      authentication: [{ kind: 'x402_wallet' }],
      candidates: [],
    })
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/sources/preview', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-provider-secret' },
        body: JSON.stringify({
          kind: 'x402',
          resourceUrl: 'https://provider.example/paid',
          method: 'POST',
        }),
      }),
      'sourcePreview',
      { authenticate, resolvePrincipal, supplyManagementService: service({ sourcePreview }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toMatchObject({
      kind: 'ready',
      provenance: { sourceKind: 'x402' },
    })
    expect(sourcePreview).toHaveBeenCalledOnce()
  })

  it('authenticates, validates, and dispatches through the canonical status action', async () => {
    const status = vi.fn().mockResolvedValue({ kind: 'not_found' })
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/status', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-provider-secret' },
        body: JSON.stringify({ businessRef: 'business:one', toolRef: 'operation:one' }),
      }),
      'status',
      { authenticate, resolvePrincipal, supplyManagementService: service({ status }) },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-ae-request-id')).toBeTruthy()
    await expect(response.json()).resolves.toEqual({ kind: 'not_found' })
    expect(status).toHaveBeenCalledWith(expect.objectContaining({
      input: { businessRef: 'business:one', toolRef: 'operation:one' },
      principal: expect.objectContaining({ scopes: ['market_supply:manage'] }),
    }))
  })

  it('dispatches the bounded Provider Tool directory independently of exact status', async () => {
    const toolsList = vi.fn().mockResolvedValue({ kind: 'not_found' })
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/tools/list', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-provider-secret' },
        body: JSON.stringify({ businessRef: 'business:one', limit: 50 }),
      }),
      'toolsList',
      { authenticate, resolvePrincipal, supplyManagementService: service({ toolsList }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ kind: 'not_found' })
    expect(toolsList).toHaveBeenCalledWith(expect.objectContaining({
      input: { businessRef: 'business:one', limit: 50 },
    }))
  })

  it.each(['status', 'toolsList'] as const)('returns Provider maintenance in %s without changing authority', async actionName => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const status = projectProviderToolStatus({
      schemaVersion: 'provider_tools:v1', businessRef: 'business:one', providerRef: 'provider:one', toolRef: 'operation:one',
      observedAt: 100, draftPresent: true, setupComplete: true, submitted: true, reviewActive: false,
      routeable: true, paused: false, retired: false, retirementProven: false, blockerCodes: [],
      maintenance: { businessId: 'business:one', offeringRef: 'offering:one', offeringRevision: 1,
        offeringSourceHash: 'source:one', publicationRef: 'publication:one', publicationRevision: 2 },
    })
    const complete = actionName === 'status'
      ? { kind: 'available', schemaVersion: 'provider_tools:v1', businessRef: 'business:one', status }
      : { kind: 'available', schemaVersion: 'provider_tools:v1', businessRef: 'business:one', page: [status], isDone: true, continueCursor: null }
    const input = actionName === 'status' ? { businessRef: 'business:one', toolRef: 'operation:one' } : { businessRef: 'business:one', limit: 50 }
    const dispatch = vi.fn().mockResolvedValue(complete)
    const response = await handleSupplyActionPost(new Request('https://ae.example/api/v1/supply/status', {
      method: 'POST', headers: { Authorization: 'Bearer hidden' },
      body: JSON.stringify(input),
    }), actionName, { authenticate, resolvePrincipal, supplyManagementService: service({ [actionName]: dispatch }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(complete)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ input }))
  })

  it('returns unsupported earnings as a permanent capability limit', async () => {
    setHttpRateLimitAdmissionForTests(async () => ({ ok: true }))
    const unsupported = { kind: 'error', code: 'capability_unsupported', capability: 'supply.earnings', retryable: false,
      detail: 'Agent Provider earnings readback is not supported. The Business owner can review recorded Provider obligations in the owner earnings view.' }
    const earnings = vi.fn().mockResolvedValue(unsupported)
    const response = await handleSupplyActionPost(new Request('https://ae.example/api/v1/supply/earnings', {
      method: 'POST', headers: { Authorization: 'Bearer hidden-provider-secret' },
      body: JSON.stringify({ currency: 'AUD' }),
    }), 'earnings', { authenticate, resolvePrincipal, supplyManagementService: service({ earnings }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(unsupported)
    expect(earnings).toHaveBeenCalledWith(expect.objectContaining({ input: { currency: 'AUD' } }))
  })

  it('refuses buyer-only credentials without invoking Provider lifecycle', async () => {
    const status = vi.fn()
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/status', {
        method: 'POST',
        headers: { Authorization: 'Bearer buyer-only' },
        body: JSON.stringify({ businessRef: 'business:one' }),
      }),
      'status',
      { authenticate: async () => await authenticate(['market_tools:call']), supplyManagementService: service({ status }) },
    )

    expect(response.status).toBe(403)
    expect(response.headers.get('www-authenticate')).toContain('market_supply:manage')
    await expect(response.json()).resolves.toMatchObject({ kind: 'PERMISSION_DENIED', code: 'scope_required' })
    expect(status).not.toHaveBeenCalled()
  })

  it('returns a bounded invalid-request problem before dispatch', async () => {
    const status = vi.fn()
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/status', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden' },
        body: JSON.stringify({ businessRef: '', leakedExtra: true }),
      }),
      'status',
      { authenticate, resolvePrincipal, supplyManagementService: service({ status }) },
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ kind: 'INVALID_ARGUMENT', code: 'invalid_request' })
    expect(status).not.toHaveBeenCalled()
  })

  it('dispatches Provider connection detail through the same authentication boundary', async () => {
    const connectionDetail = vi.fn().mockResolvedValue({ kind: 'not_found' })
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/connections/detail', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-provider-secret' },
        body: JSON.stringify({ connectionRef: 'connection:x402:one' }),
      }),
      'connectionDetail',
      { authenticate, resolvePrincipal, supplyManagementService: service({ connectionDetail }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ kind: 'not_found' })
    expect(connectionDetail).toHaveBeenCalledWith(expect.objectContaining({
      input: { connectionRef: 'connection:x402:one' },
      principal: expect.objectContaining({ scopes: ['market_supply:manage'] }),
    }))
  })

  it('fails Package 5 writes closed in production while preserving source preview', async () => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const withdraw = vi.fn().mockResolvedValue({ kind: 'refused', reason: 'must-not-run' })
    const rolloutEnvironment = { NODE_ENV: 'production', AE_DEPLOYMENT_ENVIRONMENT: 'production' }
    const writeResponse = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/withdraw', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-provider-secret' },
        body: JSON.stringify({
          businessId: 'business:one', offeringRef: 'offering:one', offeringRevision: 1,
          offeringSourceHash: 'source:one', publicationRef: 'publication:one', publicationRevision: 1,
          idempotencyKey: 'withdraw:one',
        }),
      }),
      'withdraw',
      { authenticate: authenticateProduction, resolvePrincipal: resolveProductionPrincipal, supplyManagementService: service({ withdraw }), rolloutEnvironment },
    )

    expect(writeResponse.status).toBe(503)
    await expect(writeResponse.json()).resolves.toMatchObject({
      kind: 'UNAVAILABLE', code: 'package5_writes_disabled', retryable: false,
    })
    expect(withdraw).not.toHaveBeenCalled()

    const sourcePreview = vi.fn().mockResolvedValue({
      kind: 'ready', sourceDigest: `sha256:${'1'.repeat(64)}`,
      sourceRevision: `x402:sha256:${'1'.repeat(64)}`,
      provenance: { sourceKind: 'x402', sourceUrl: 'https://provider.example/paid', authority: 'observed_external' },
      authentication: [{ kind: 'x402_wallet' }], candidates: [],
    })
    const previewResponse = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/sources/preview', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-provider-secret' },
        body: JSON.stringify({ kind: 'x402', resourceUrl: 'https://provider.example/paid', method: 'POST' }),
      }),
      'sourcePreview',
      { authenticate: authenticateProduction, resolvePrincipal: resolveProductionPrincipal, supplyManagementService: service({ sourcePreview }), rolloutEnvironment },
    )

    expect(previewResponse.status).toBe(200)
    expect(sourcePreview).toHaveBeenCalledOnce()
  })

  it.each([
    {
      code: 'supply_http_credentials_disabled',
      body: {
        kind: 'http_credential', businessRef: 'business:one',
        sourceUrl: 'https://provider.example/openapi.yaml',
        authentication: { kind: 'http_bearer' }, environment: 'production',
        idempotencyKey: 'connect-http-disabled',
      },
      enabled: { AE_PACKAGE5_WRITES_ENABLED: 'true' },
    },
    {
      code: 'supply_mcp_oauth_disabled',
      body: {
        kind: 'mcp_oauth', businessRef: 'business:one',
        serverUrl: 'https://provider.example/mcp', environment: 'production',
        idempotencyKey: 'connect-mcp-disabled',
      },
      enabled: { AE_PACKAGE5_WRITES_ENABLED: 'true' },
    },
  ])('keeps $code behind its independent connection start switch', async ({ body, code, enabled }) => {
    vi.stubEnv('AE_DEPLOYMENT_ENVIRONMENT', 'production')
    const connectionConnect = vi.fn()
    const response = await handleSupplyActionPost(
      new Request('https://ae.example/api/v1/supply/connections/connect', {
        method: 'POST',
        headers: { Authorization: 'Bearer hidden-provider-secret' },
        body: JSON.stringify(body),
      }),
      'connectionConnect',
      {
        authenticate: authenticateProduction,
        resolvePrincipal: resolveProductionPrincipal,
        supplyManagementService: service({ connectionConnect }),
        rolloutEnvironment: { NODE_ENV: 'production', AE_DEPLOYMENT_ENVIRONMENT: 'production', ...enabled },
      },
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ code })
    expect(connectionConnect).not.toHaveBeenCalled()
  })
})
