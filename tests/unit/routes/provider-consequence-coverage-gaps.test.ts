import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { declarePaymentIdentifierExtension } from '@x402/extensions/payment-identifier'

import type { RouteTransportInvocation } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  providerConsequenceInvocationDigest,
  providerConsequenceTicketClaimsDigest,
  type CanonicalProviderConsequenceTicket,
} from '@/modules/capability-execution/invocation-worker/jitProviderConsequence'

const mocks = vi.hoisted(() => {
  const agents: FakeAgent[] = []
  const state = { rejectClose: false }
  class FakeAgent {
    close = vi.fn(async () => {
      if (state.rejectClose) throw new Error('dispatcher_close_failed')
    })

    constructor() {
      agents.push(this)
    }
  }
  return {
    guardedFetch: vi.fn(),
    getVercelOidcToken: vi.fn(),
    isPublicHttpTarget: vi.fn(),
    FakeAgent,
    agents,
    state,
  }
})

vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: mocks.getVercelOidcToken }))
vi.mock('undici', () => ({ Agent: mocks.FakeAgent, fetch: mocks.guardedFetch }))
vi.mock('@/modules/network-guard/public', () => ({
  createGuardedLookup: vi.fn(() => vi.fn()),
  defaultDnsResolver: { lookup: vi.fn() },
  isPublicHttpTarget: mocks.isPublicHttpTarget,
}))

import {
  handleProviderConsequenceRequest,
  Route,
} from '@/routes/api.internal.provider-consequence'

type ProviderInvocation = Extract<
  RouteTransportInvocation,
  { binding: { authority: { kind: 'provider_connection' } } }
>

const NOW = 2_000_000_000_000
const DIGEST = (character: string) => `sha256:${character.repeat(64)}`
const CUSTOMER_SECRET_REF = `sec_${'1'.repeat(32)}`
const CUSTOMER_GENERATION = `sgn_${'2'.repeat(32)}`
const SIGNING_SECRET_REF = `sec_${'8'.repeat(32)}`
const SIGNING_GENERATION = `sgn_${'9'.repeat(32)}`
const CUSTOMER_SECRET = `0x${'11'.repeat(32)}`
const SIGNING_KEY = 'platform-ticket-signing-key-at-least-32-bytes'
const JOURNAL_TOKEN = 'a'.repeat(43)

describe('provider consequence route coverage gaps', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mocks.getVercelOidcToken.mockReset()
    mocks.getVercelOidcToken.mockResolvedValue(jwt())
    mocks.guardedFetch.mockReset()
    mocks.isPublicHttpTarget.mockReset()
    mocks.isPublicHttpTarget.mockResolvedValue(true)
    mocks.agents.length = 0
    mocks.state.rejectClose = false
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('declares POST as the only method across every registered route handler', async () => {
    const handlers = Route.options.server?.handlers
    if (typeof handlers !== 'object' || handlers === null) throw new Error('provider_route_handlers_missing')
    const indexedHandlers = handlers as Record<string, unknown>
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'TRACE', 'CONNECT'] as const) {
      const handler = indexedHandlers[method]
      if (typeof handler !== 'function') throw new Error(`provider_route_${method}_missing`)
      const response = await handler({
        request: new Request('https://agentic-economy.example/api/internal/provider-consequence'),
      } as never)
      if (!(response instanceof Response)) throw new Error(`provider_route_${method}_response_missing`)
      expect(response.status).toBe(405)
      expect(response.headers.get('allow')).toBe('POST')
    }
    const post = indexedHandlers.POST
    if (typeof post !== 'function') throw new Error('provider_route_POST_missing')
    const response = await post({ request: rawRequest('{') } as never)
    if (!(response instanceof Response)) throw new Error('provider_route_POST_response_missing')
    expect(response.status).toBe(400)
  })

  it.each([
    ['wrong media type', rawRequest('{}', { 'Content-Type': 'text/plain' })],
    ['oversize declaration', rawRequest('{}', { 'Content-Type': 'application/json', 'Content-Length': String(513 * 1024) })],
    ['oversize body', rawRequest(JSON.stringify({ value: 'x'.repeat(513 * 1024) }))],
    ['invalid JSON', rawRequest('{')],
    ['array body', rawRequest('[]')],
    ['extra envelope key', consequenceRequest(ticket(), { callerPrincipal: 'attacker' })],
    ['non-record ticket', consequenceRequest(ticket(), { ticket: 'attacker' })],
    ['non-record invocation', consequenceRequest(ticket(), { invocation: 'attacker' })],
    ['non-string claims digest', consequenceRequest(ticket(), { ticketClaimsDigest: 7 })],
    ['short journal token', consequenceRequest(ticket(), { journalToken: 'short' })],
    ['non-record signing pointer', consequenceRequest(ticket(), { signingSecret: 'attacker' })],
    ['extra signing pointer key', consequenceRequest(ticket(), { signingSecret: { ...signingPointer(), source: 'caller' } })],
    ['invalid signing secret ref', consequenceRequest(ticket(), { signingSecret: { ...signingPointer(), secretRef: 'env:KEY' } })],
    ['invalid signing generation', consequenceRequest(ticket(), { signingSecret: { ...signingPointer(), activeGeneration: 'latest' } })],
    ['invalid signing revision', consequenceRequest(ticket(), { signingSecret: { ...signingPointer(), pointerRevision: 0 } })],
    ['malformed ticket claims', consequenceRequest(ticket(), { ticket: {} })],
  ])('rejects malformed request before vault or provider access: %s', async (_label, request) => {
    const externalFetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', externalFetch)
    const response = await handleProviderConsequenceRequest(request, environment())
    expect(response.status).toBe(400)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(externalFetch).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['malformed explicit site URL', { CONVEX_SITE_URL: 'https://[invalid' }],
    ['insecure deployment URL', { CONVEX_SITE_URL: undefined, CONVEX_URL: 'http://test-deployment.convex.cloud' }],
    ['credentialed deployment URL', { CONVEX_SITE_URL: undefined, CONVEX_URL: 'https://user:pass@test-deployment.convex.cloud' }],
    ['deployment URL with path', { CONVEX_SITE_URL: undefined, CONVEX_URL: 'https://test-deployment.convex.cloud/path' }],
    ['non-Convex deployment URL', { CONVEX_SITE_URL: undefined, CONVEX_URL: 'https://attacker.example' }],
    ['missing deployment URL', { CONVEX_SITE_URL: undefined, CONVEX_URL: undefined }],
  ])('fails closed for configuration variant: %s', async (_label, override) => {
    const externalFetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', externalFetch)
    const response = await handleProviderConsequenceRequest(consequenceRequest(), environment(override))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(externalFetch).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
  })

  it('derives the Convex site fallback and preserves optional vault organization scopes', async () => {
    const visited: string[] = []
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async (input) => {
      visited.push(String(input))
      throw new Error('vault_offline')
    }))
    const response = await handleProviderConsequenceRequest(consequenceRequest(), environment({
      CONVEX_SITE_URL: undefined,
      CONVEX_URL: 'https://test-deployment.convex.cloud',
      AE_INFISICAL_PLATFORM_ORGANIZATION_SLUG: 'platform-org',
      AE_INFISICAL_CUSTOMER_ORGANIZATION_SLUG: 'customer-org',
    }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ disposition: 'refused' })
    expect(visited.length).toBeGreaterThan(0)
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
  })

  it('contains vault login, journal status, and journal JSON failures without provider release', async () => {
    for (const fetcher of [
      vi.fn<typeof globalThis.fetch>(async () => { throw new Error('vault_offline') }),
      scriptedFetch({ begin: new Response('journal-down', { status: 503 }) }),
      scriptedFetch({ begin: new Response('not-json', { status: 200 }) }),
      scriptedFetch({ begin: Response.json({ kind: 'unavailable' }) }),
    ]) {
      vi.stubGlobal('fetch', fetcher)
      const response = await handleProviderConsequenceRequest(consequenceRequest(), environment())
      expect([200, 503]).toContain(response.status)
      const body = await response.json() as Record<string, unknown>
      expect(['unavailable', 'refused']).toContain(body.kind ?? body.disposition)
      expect(mocks.guardedFetch).not.toHaveBeenCalled()
    }
  })

  it('aborts before release for a non-public provider and contains an invalid abort acknowledgement', async () => {
    mocks.isPublicHttpTarget.mockResolvedValue(false)
    vi.stubGlobal('fetch', scriptedFetch({ abort: Response.json({ kind: 'unavailable' }) }))
    const response = await handleProviderConsequenceRequest(consequenceRequest(), environment())
    expect([200, 503]).toContain(response.status)
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
  })

  it('uses the abort journal when admitted invocation configuration fails before provider release', async () => {
    const invalid = invocation()
    const binding = invalid.binding as { configJson: string; configDigest: string }
    binding.configJson = '{'
    binding.configDigest = canonicalDigest('{')
    const canonicalTicket = ticket(invalid)
    vi.stubGlobal('fetch', scriptedFetch({ abort: Response.json({ kind: 'unavailable' }) }))
    const response = await handleProviderConsequenceRequest(
      consequenceRequest(canonicalTicket, { invocation: invalid }),
      environment(),
    )
    expect([200, 503]).toContain(response.status)
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
  })

  it('contains provider transport failure and an invalid completion acknowledgement after release starts', async () => {
    mocks.guardedFetch.mockRejectedValue(new Error('provider_connection_reset'))
    vi.stubGlobal('fetch', scriptedFetch({ complete: Response.json({ kind: 'unavailable' }) }))
    const response = await handleProviderConsequenceRequest(consequenceRequest(), environment())
    expect([200, 503]).toContain(response.status)
    expect(mocks.guardedFetch).toHaveBeenCalledOnce()
  })

  it('fails closed across callback-scoped x402 identity, parsing, cache, and journal seams', async () => {
    vi.resetModules()
    const routeInvocation = x402Invocation()
    const canonicalTicket = ticket(routeInvocation)
    let probeError: unknown
    const probe = vi.fn(async (rawOptions: unknown, opaqueTicket: string) => {
      const options = rawOptions as ProbeOptions
      await expect(options.verifyTicket('attacker-ticket')).resolves.toBeUndefined()
      await expect(options.verifyTicket(opaqueTicket)).resolves.toEqual(canonicalTicket)
      const platformPointer = options.secretRuntime.platform.pointerStore
      expect(await platformPointer.getActive(SIGNING_SECRET_REF)).toMatchObject({ revision: 2 })
      expect(await platformPointer.getActive(`sec_${'0'.repeat(32)}`)).toBeUndefined()
      await expect(platformPointer.advanceActive()).rejects.toThrow('provider_consequence_pointer_read_only')
      await expect(options.secretRuntime.platform.generationProbe.validate()).rejects.toThrow(
        'provider_consequence_rotation_not_available',
      )
      await options.journal.complete({
        claimRef: 'provider-claim:test',
        observation: exactObservation(routeInvocation),
      })
      await expect(options.journal.abortBeforeRelease({ claimRef: 'provider-claim:test' }))
        .rejects.toThrow('provider_consequence_abort_unknown')
      await expect(options.journal.abortBeforeRelease({ claimRef: 'provider-claim:test' }))
        .rejects.toThrow('provider_consequence_abort_unknown')
      await expect(options.journal.abortBeforeRelease({ claimRef: 'provider-claim:test' }))
        .resolves.toBeUndefined()

      const runtime = options.createCallbackScopedX402Runtime({ ticket: canonicalTicket, invocation: routeInvocation })
      await expect(runtime.readX402PaymentCredentialRef()).resolves.toBe(CUSTOMER_SECRET_REF)
      await expect(runtime.validateProviderConnectionAuthority({
        connectionRef: routeInvocation.binding.authority.connectionRef,
        providerRef: canonicalTicket.providerRef,
        adapterId: canonicalTicket.adapterId,
        authorityGeneration: canonicalTicket.canonicalConnectionGeneration,
        authorityDigest: canonicalTicket.authorityDigest,
        leaseRef: canonicalTicket.leaseRef,
      })).resolves.toEqual({ kind: 'valid' })
      await expect(runtime.validateProviderConnectionAuthority({
        connectionRef: 'connection:attacker', providerRef: canonicalTicket.providerRef,
        adapterId: canonicalTicket.adapterId, authorityGeneration: canonicalTicket.canonicalConnectionGeneration,
        authorityDigest: canonicalTicket.authorityDigest, leaseRef: canonicalTicket.leaseRef,
      })).resolves.toMatchObject({ kind: 'unavailable' })
      expect(runtime.x402PaymentSigningAvailable({
        credentialRef: routeInvocation.binding.authority.connectionRef,
        maximumSpend: routeInvocation.authority.maximumSpend,
      })).toBe(true)
      expect(runtime.x402PaymentSigningAvailable({
        credentialRef: routeInvocation.binding.authority.connectionRef,
        maximumSpend: { currency: 'USD', units: '1', exponent: 1.5 },
      })).toBe(false)

      const challenge = x402Challenge()
      const selectedRequirement = challenge.accepts[0]
      if (selectedRequirement === undefined) throw new Error('x402_requirement_missing')
      const paymentRequest = {
        attemptRef: routeInvocation.authority.attemptRef,
        effectGeneration: routeInvocation.authority.effectGeneration,
        paymentIdentifier: routeInvocation.authority.operationKeyDigest,
        credential: CUSTOMER_SECRET_REF,
        challenge,
        selectedRequirement,
        challengeDigest: canonicalDigest(challenge),
        paymentAmount: { currency: 'USD', units: '1', exponent: 2 },
      }
      await expect(runtime.prepareX402PaymentAuthorization({ ...paymentRequest, attemptRef: 'attempt:attacker' }))
        .resolves.toBeUndefined()
      await expect(runtime.prepareX402PaymentAuthorization(paymentRequest)).resolves.toBeUndefined()
      await expect(runtime.prepareX402PaymentAuthorization(paymentRequest)).resolves.toBeUndefined()
      const prepared = await runtime.prepareX402PaymentAuthorization(paymentRequest)
      expect(prepared).toMatchObject({ custodyRef: 'custody:test', authorizationDigest: DIGEST('a') })
      if (prepared === undefined) throw new Error('x402_prepared_missing')

      await expect(runtime.readX402PaymentAuthorization(prepared)).resolves.toBeUndefined()
      await expect(runtime.readX402PaymentAuthorization(prepared)).resolves.toBeUndefined()
      await expect(runtime.readX402PaymentAuthorization(prepared)).resolves.toBeUndefined()
      await expect(runtime.readX402PaymentAuthorizationByDigest(prepared)).resolves.toBeUndefined()
      const signature = await runtime.readX402PaymentAuthorizationByDigest(prepared)
      expect(typeof signature).toBe('string')
      expect(signature?.length).toBeGreaterThan(0)
      await expect(runtime.readX402PaymentAuthorizationByDigest(prepared)).resolves.toBe(signature)
      await expect(runtime.markX402PaymentPossiblySubmitted({ custodyRef: prepared.custodyRef }))
        .rejects.toThrow('provider_consequence_x402_unavailable')
      await runtime.markX402PaymentPossiblySubmitted({ custodyRef: prepared.custodyRef })
      await runtime.observeX402PaymentAttempt({ custodyRef: prepared.custodyRef })
      await expect(runtime.verifyX402Settlement({
        response: { success: true, transaction: '0xsettlement', network: selectedRequirement.network },
        requirement: selectedRequirement,
        paymentSignature: 'not-a-payment-signature',
      })).resolves.toBe(false)
      try {
        await runtime.verifyX402Settlement({
          response: { success: true, transaction: '0xsettlement', network: selectedRequirement.network },
          requirement: selectedRequirement,
          paymentSignature: signature,
        })
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
    let signatureCalls = 0
    vi.doMock('@/modules/capability-supply/server', async () => {
      const actual = await vi.importActual<typeof import('@/modules/capability-supply/server')>(
        '@/modules/capability-supply/server',
      )
      return {
        ...actual,
        createSandboxEvmX402PaymentSignature: async (
          ...args: Parameters<typeof actual.createSandboxEvmX402PaymentSignature>
        ) => {
          signatureCalls += 1
          return signatureCalls === 1 ? '' : await actual.createSandboxEvmX402PaymentSignature(...args)
        },
      }
    })
    vi.doMock('@/modules/capability-execution/invocation-worker/jitProviderConsequence', async () => {
      const actual = await vi.importActual<typeof import('@/modules/capability-execution/invocation-worker/jitProviderConsequence')>(
        '@/modules/capability-execution/invocation-worker/jitProviderConsequence',
      )
      return {
        ...actual,
        createJitProviderConsequenceBoundary: (options: unknown) => ({
          execute: async (input: { ticket: string }) => {
            try {
              await probe(options, input.ticket)
            } catch (error) {
              probeError = error
              throw error
            }
            return exactObservation(routeInvocation)
          },
        }),
      }
    })
    const dynamicRoute = await import('@/routes/api.internal.provider-consequence')
    vi.stubGlobal('fetch', probeFetch(canonicalTicket, routeInvocation))
    try {
      const response = await dynamicRoute.handleProviderConsequenceRequest(
        consequenceRequest(canonicalTicket, { invocation: routeInvocation }),
        environment(),
      )
      if (probeError !== undefined) throw probeError
      expect(response.status).toBe(200)
      expect(probe).toHaveBeenCalledOnce()
    } finally {
      vi.doUnmock('@/modules/capability-execution/invocation-worker/jitProviderConsequence')
      vi.doUnmock('@/modules/capability-supply/server')
    }
  })

  it('rejects a short signing key and always closes the callback dispatcher', async () => {
    vi.stubGlobal('fetch', scriptedFetch({ signingKey: 'short' }))
    const response = await handleProviderConsequenceRequest(consequenceRequest(), environment())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ disposition: 'refused' })
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
    expect(mocks.agents).toHaveLength(1)
    expect(mocks.agents[0]?.close).toHaveBeenCalledOnce()
  })

  it.each([
    ['wrong signed-ticket prefix', `attacker-ticket.${NOW + 10_000}.${'a'.repeat(64)}`],
    ['non-hex signed-ticket signature', `provider-ticket:test.${NOW + 10_000}.${'z'.repeat(64)}`],
  ])('rejects %s before journal or provider release', async (_label, signedTicket) => {
    vi.stubGlobal('fetch', scriptedFetch())
    const response = await handleProviderConsequenceRequest(
      consequenceRequest(ticket(), { signedTicket }),
      environment(),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ disposition: 'refused', releaseStarted: false })
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
  })

  it('contains issuer signing-key, callback, and opaque-ticket failures', async () => {
    vi.stubGlobal('fetch', scriptedFetch({ signingKey: 'short' }))
    await expect(handleProviderConsequenceRequest(signingRequest(), environment()))
      .resolves.toMatchObject({ status: 503 })

    const oversized = { ...ticket(), ticketRef: `provider-ticket:${'x'.repeat(190)}` }
    vi.stubGlobal('fetch', scriptedFetch())
    await expect(handleProviderConsequenceRequest(signingRequest(oversized), environment()))
      .resolves.toMatchObject({ status: 503 })

    vi.resetModules()
    vi.doMock('@/modules/secrets/public', async () => {
      const actual = await vi.importActual<typeof import('@/modules/secrets/public')>('@/modules/secrets/public')
      return {
        ...actual,
        createProductionSecretRuntime: () => ({
          consequences: {
            platform: { execute: async () => undefined },
            customer: { execute: async () => undefined },
          },
        }),
      }
    })
    const dynamicRoute = await import('@/routes/api.internal.provider-consequence')
    vi.stubGlobal('fetch', scriptedFetch())
    try {
      await expect(dynamicRoute.handleProviderConsequenceRequest(signingRequest(), environment()))
        .resolves.toMatchObject({ status: 503 })
    } finally {
      vi.doUnmock('@/modules/secrets/public')
    }
  })

  it('contains an unexpected consequence-boundary construction failure', async () => {
    vi.resetModules()
    vi.doMock('@/modules/capability-execution/invocation-worker/jitProviderConsequence', async () => {
      const actual = await vi.importActual<typeof import('@/modules/capability-execution/invocation-worker/jitProviderConsequence')>(
        '@/modules/capability-execution/invocation-worker/jitProviderConsequence',
      )
      return {
        ...actual,
        createJitProviderConsequenceBoundary: () => { throw new Error('boundary_construction_failed') },
      }
    })
    const dynamicRoute = await import('@/routes/api.internal.provider-consequence')
    vi.stubGlobal('fetch', scriptedFetch())
    try {
      await expect(dynamicRoute.handleProviderConsequenceRequest(consequenceRequest(), environment()))
        .resolves.toMatchObject({ status: 503 })
    } finally {
      vi.doUnmock('@/modules/capability-execution/invocation-worker/jitProviderConsequence')
    }
  })

  it('rejects an oversized opaque ticket before allocating a dispatcher', async () => {
    const oversized = { ...ticket(), ticketRef: `provider-ticket:${'x'.repeat(190)}` }
    vi.stubGlobal('fetch', scriptedFetch())
    const response = await handleProviderConsequenceRequest(consequenceRequest(oversized), environment())
    expect(response.status).toBe(400)
    expect(mocks.agents).toHaveLength(0)
  })

  it('contains dispatcher close rejection after an otherwise valid consequence', async () => {
    mocks.state.rejectClose = true
    vi.stubGlobal('fetch', scriptedFetch())
    const response = await handleProviderConsequenceRequest(consequenceRequest(), environment())
    expect(response.status).toBe(200)
    expect(mocks.agents).toHaveLength(1)
    expect(mocks.agents[0]?.close).toHaveBeenCalledOnce()
  })

  it('fails closed when the platform secret runtime violates its execute callback contract', async () => {
    vi.resetModules()
    vi.doMock('@/modules/secrets/public', async () => {
      const actual = await vi.importActual<typeof import('@/modules/secrets/public')>('@/modules/secrets/public')
      return {
        ...actual,
        createProductionSecretRuntime: () => ({
          consequences: {
            platform: { execute: async () => undefined },
            customer: { execute: async () => undefined },
          },
        }),
      }
    })
    const dynamicRoute = await import('@/routes/api.internal.provider-consequence')
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>())
    try {
      const response = await dynamicRoute.handleProviderConsequenceRequest(consequenceRequest(), environment())
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ disposition: 'refused' })
      expect(mocks.guardedFetch).not.toHaveBeenCalled()
    } finally {
      vi.doUnmock('@/modules/secrets/public')
    }
  })
})

function invocation(): ProviderInvocation {
  const config = { method: 'POST' as const, requestTimeoutMs: 5_000, credential: { kind: 'bearer' as const } }
  return {
    binding: {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://provider.example/run',
      authority: { kind: 'provider_connection', connectionRef: 'connection:test', providerRef: 'provider:test' },
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority: {
      attemptRef: 'attempt:test', effectGeneration: 1, operationKeyDigest: DIGEST('3'), mandateDigest: DIGEST('4'),
      grantDigest: DIGEST('5'), capabilityContractDigest: DIGEST('6'),
      maximumSpend: { currency: 'USD', units: '0', exponent: 2 }, expiresAt: NOW + 120_000,
      callIdentity: { keyId: 'route-calls:test', signature: 'hmac-sha256:test' },
      authorityGeneration: 7, authorityDigest: DIGEST('7'), leaseRef: 'lease:test', invocationRef: 'invocation:test',
      canonicalConnectionRef: `con_${'3'.repeat(32)}`,
      operationRef: 'operation:test', grantedScopes: ['provider:invoke'], grantedResources: ['operation:test'],
      readinessValidUntil: NOW + 120_000, readinessDigest: DIGEST('8'),
    },
    inputJson: '{}',
  }
}

function requestDigest(routeInvocation: RouteTransportInvocation): string {
  return canonicalDigest({
    adapterId: routeInvocation.binding.adapterId,
    endpointUrl: routeInvocation.binding.endpointUrl,
    configDigest: routeInvocation.binding.configDigest,
    attemptRef: routeInvocation.authority.attemptRef,
    operationKeyDigest: routeInvocation.authority.operationKeyDigest,
    mandateDigest: routeInvocation.authority.mandateDigest,
    grantDigest: routeInvocation.authority.grantDigest,
    capabilityContractDigest: routeInvocation.authority.capabilityContractDigest,
    inputJson: routeInvocation.inputJson,
  } as StableHashValue)
}

function ticket(routeInvocation: ProviderInvocation = invocation()): CanonicalProviderConsequenceTicket {
  const invocationDigest = providerConsequenceInvocationDigest(routeInvocation)
  if (invocationDigest === undefined) throw new Error('test_fixture_invalid')
  const readinessValidUntil = routeInvocation.authority.readinessValidUntil
  const readinessDigest = routeInvocation.authority.readinessDigest
  if (readinessValidUntil === undefined) throw new Error('readiness_fixture_missing')
  if (readinessDigest === undefined) throw new Error('readiness_digest_fixture_missing')
  return {
    version: 'provider-consequence:v1', ticketRef: 'provider-ticket:test', effectRef: 'connection-effect:test',
    requestDigest: requestDigest(routeInvocation), invocationDigest, issuedAt: NOW - 1_000, expiresAt: NOW + 10_000,
    invocationRef: 'invocation:test', operationRef: 'operation:test', leaseRef: 'lease:test',
    canonicalLeaseRef: 'lease-canonical:test', canonicalConnectionRef: routeInvocation.authority.canonicalConnectionRef!,
    canonicalConnectionGeneration: 7, providerRef: 'provider:test', adapterId: routeInvocation.binding.adapterId,
    authorityDigest: routeInvocation.authority.authorityDigest, grantedScopes: ['provider:invoke'],
    grantedResources: ['operation:test'], readinessValidUntil, readinessDigest,
    owningAccountRef: `acc_${'1'.repeat(32)}`, activeAccountRef: `acc_${'1'.repeat(32)}`,
    actorPrincipalRef: `prn_${'2'.repeat(32)}`, grantRef: 'grant:test', grantGeneration: 3,
    secret: { secretRef: CUSTOMER_SECRET_REF, activeGeneration: CUSTOMER_GENERATION, pointerRevision: 4 },
  }
}

function signingPointer() {
  return { secretRef: SIGNING_SECRET_REF, activeGeneration: SIGNING_GENERATION, pointerRevision: 2 }
}

function consequenceRequest(canonicalTicket = ticket(), overrides: Record<string, unknown> = {}) {
  const body = {
    action: 'execute',
    ticket: canonicalTicket,
    ticketClaimsDigest: providerConsequenceTicketClaimsDigest(canonicalTicket),
    signingSecret: signingPointer(),
    journalToken: JOURNAL_TOKEN,
    signedTicket: signedTicketFor(canonicalTicket),
    invocation: invocation(),
    ...overrides,
  }
  return rawRequest(JSON.stringify(body))
}

function signingRequest(canonicalTicket = ticket()) {
  return rawRequest(JSON.stringify({
    action: 'issue',
    ticket: canonicalTicket,
    ticketClaimsDigest: providerConsequenceTicketClaimsDigest(canonicalTicket),
    signingSecret: signingPointer(),
    journalToken: JOURNAL_TOKEN,
  }))
}

function signedTicketFor(canonicalTicket: CanonicalProviderConsequenceTicket): string {
  const claimsDigest = providerConsequenceTicketClaimsDigest(canonicalTicket)
  const message = `${canonicalTicket.ticketRef}:${claimsDigest}:${canonicalTicket.expiresAt}`
  const signature = createHmac('sha256', SIGNING_KEY).update(message).digest('hex')
  return `${canonicalTicket.ticketRef}.${canonicalTicket.expiresAt}.${signature}`
}

function rawRequest(body: string, headers: Record<string, string> = {}) {
  return new Request('https://agentic-economy.example/api/internal/provider-consequence', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body,
  })
}

function environment(overrides: Record<string, string | undefined> = {}) {
  return {
    AE_INFISICAL_BASE_URL: 'https://app.infisical.com',
    AE_INFISICAL_PLATFORM_PROJECT_ID: 'project-platform',
    AE_INFISICAL_PLATFORM_ENVIRONMENT: 'production',
    AE_INFISICAL_PLATFORM_SECRET_PATH: '/agentic-economy/platform',
    AE_INFISICAL_PLATFORM_MACHINE_IDENTITY_ID: 'identity-platform',
    AE_INFISICAL_CUSTOMER_PROJECT_ID: 'project-customer',
    AE_INFISICAL_CUSTOMER_ENVIRONMENT: 'production',
    AE_INFISICAL_CUSTOMER_SECRET_PATH: '/agentic-economy/customer',
    AE_INFISICAL_CUSTOMER_MACHINE_IDENTITY_ID: 'identity-customer',
    CONVEX_SITE_URL: 'https://test-deployment.convex.site',
    ...overrides,
  }
}

function jwt() {
  const seconds = NOW / 1_000
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iat: seconds - 60, nbf: seconds - 60, exp: seconds + 3_540 })).toString('base64url'),
    Buffer.from('signature').toString('base64url'),
  ].join('.')
}

function scriptedFetch(overrides: Readonly<{
  attest?: Response
  begin?: Response
  complete?: Response
  abort?: Response
  signingKey?: string
}> = {}) {
  return vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input))
    if (url.hostname === 'app.infisical.com' && url.pathname === '/api/v1/auth/oidc-auth/login') {
      return Response.json({ accessToken: 'vault-token', tokenType: 'Bearer', expiresIn: 600, accessTokenMaxTTL: 600 })
    }
    if (url.hostname === 'app.infisical.com' && url.pathname.startsWith('/api/v4/secrets/')) {
      const platform = url.searchParams.get('projectId') === 'project-platform'
      return Response.json({
        secret: {
          secretKey: platform
            ? `${SIGNING_SECRET_REF}--${SIGNING_GENERATION}`
            : `${CUSTOMER_SECRET_REF}--${CUSTOMER_GENERATION}`,
          secretValue: platform ? (overrides.signingKey ?? SIGNING_KEY) : CUSTOMER_SECRET,
          environment: 'production',
          workspace: platform ? 'project-platform' : 'project-customer',
        },
      })
    }
    if (url.pathname.endsWith('/journal/begin')) {
      return overrides.begin ?? Response.json({ kind: 'claimed', claimRef: 'provider-claim:test' })
    }
    if (url.pathname.endsWith('/journal/attest')) {
      return overrides.attest ?? Response.json({ kind: 'attested' })
    }
    if (url.pathname.endsWith('/journal/complete')) {
      return overrides.complete ?? Response.json({ kind: 'completed' })
    }
    if (url.pathname.endsWith('/journal/abort')) {
      return overrides.abort ?? Response.json({ kind: 'aborted' })
    }
    throw new Error(`unexpected_fetch:${url}`)
  })
}

type ProbeOptions = Readonly<{
  verifyTicket(candidate: string): Promise<CanonicalProviderConsequenceTicket | undefined>
  journal: {
    complete(input: { claimRef: string; observation: ReturnType<typeof exactObservation> }): Promise<void>
    abortBeforeRelease(input: { claimRef: string }): Promise<void>
  }
  secretRuntime: {
    platform: {
      pointerStore: {
        getActive(ref: string): Promise<unknown>
        advanceActive(): Promise<never>
      }
      generationProbe: { validate(): Promise<never> }
    }
  }
  createCallbackScopedX402Runtime(input: {
    ticket: CanonicalProviderConsequenceTicket
    invocation: RouteTransportInvocation
  }): ProbeX402Runtime
}>

type ProbeX402Runtime = Readonly<{
  readX402PaymentCredentialRef(): Promise<string>
  validateProviderConnectionAuthority(input: Record<string, unknown>): Promise<unknown>
  x402PaymentSigningAvailable(input: Record<string, unknown>): boolean
  prepareX402PaymentAuthorization(input: Record<string, unknown>): Promise<ProbePrepared | undefined>
  readX402PaymentAuthorization(input: ProbePrepared): Promise<string | undefined>
  readX402PaymentAuthorizationByDigest(input: ProbePrepared): Promise<string | undefined>
  markX402PaymentPossiblySubmitted(input: Record<string, unknown>): Promise<void>
  observeX402PaymentAttempt(input: Record<string, unknown>): Promise<void>
  verifyX402Settlement(input: Record<string, unknown>): Promise<boolean>
}>

type ProbePrepared = Readonly<{ custodyRef: string; authorizationDigest: string }>

function exactObservation(routeInvocation: RouteTransportInvocation) {
  return {
    transport: 'x402' as const,
    disposition: 'refused' as const,
    releaseStarted: false,
    requestDigest: requestDigest(routeInvocation),
    failureCode: 'coverage_probe',
  }
}

function x402Challenge() {
  return {
    x402Version: 2 as const,
    resource: { url: 'https://provider.example/paid', description: 'Paid result', mimeType: 'application/json' },
    extensions: { 'payment-identifier': declarePaymentIdentifierExtension(true) },
    accepts: [{
      scheme: 'exact', network: 'eip155:84532' as const, amount: '10000',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C', maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
    }],
  }
}

function x402Invocation(): ProviderInvocation {
  const base = invocation()
  const challenge = x402Challenge()
  const requirement = challenge.accepts[0]
  if (requirement === undefined) throw new Error('x402_requirement_missing')
  const config = {
    method: 'POST' as const, requestTimeoutMs: 5_000, scheme: 'exact' as const,
    network: requirement.network, currency: 'USD', routeAmountExponent: 2, assetAmountExponent: 6,
    asset: requirement.asset, payTo: requirement.payTo, paymentRequiredJson: JSON.stringify(challenge),
  }
  return {
    ...base,
    binding: {
      ...base.binding, adapterId: 'x402-fetch:v2', endpointUrl: challenge.resource.url,
      configJson: JSON.stringify(config), configDigest: canonicalDigest(config),
    },
    authority: { ...base.authority, maximumSpend: { currency: 'USD', units: '1', exponent: 2 } },
  }
}

function probeFetch(
  canonicalTicket: CanonicalProviderConsequenceTicket,
  routeInvocation: RouteTransportInvocation,
) {
  let reserveCalls = 0
  let readCalls = 0
  let prepareCalls = 0
  let markCalls = 0
  let abortCalls = 0
  let platformSecretReads = 0
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input))
    if (url.hostname === 'app.infisical.com' && url.pathname === '/api/v1/auth/oidc-auth/login') {
      return Response.json({ accessToken: 'vault-token', tokenType: 'Bearer', expiresIn: 600, accessTokenMaxTTL: 600 })
    }
    if (url.hostname === 'app.infisical.com' && url.pathname.startsWith('/api/v4/secrets/')) {
      const platform = url.searchParams.get('projectId') === 'project-platform'
      if (platform) platformSecretReads += 1
      return Response.json({
        secret: {
          secretKey: platform
            ? `${SIGNING_SECRET_REF}--${SIGNING_GENERATION}`
            : `${CUSTOMER_SECRET_REF}--${CUSTOMER_GENERATION}`,
          secretValue: platform
            ? (platformSecretReads === 1 ? SIGNING_KEY : 'different-platform-signing-key-at-least-32-bytes')
            : CUSTOMER_SECRET,
          environment: 'production', workspace: platform ? 'project-platform' : 'project-customer',
        },
      })
    }
    if (url.pathname.endsWith('/journal/complete')) return Response.json({ kind: 'completed' })
    if (url.pathname.endsWith('/journal/abort')) {
      abortCalls += 1
      if (abortCalls === 1) return Response.json(null)
      return Response.json({ kind: abortCalls === 2 ? 'unavailable' : 'aborted' })
    }
    if (url.pathname.endsWith('/x402')) {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      const operation = String(body.operation)
      if (operation === 'reserve_external_spend') {
        reserveCalls += 1
        return reserveCalls === 1
          ? Response.json({ kind: 'result', value: { kind: 'unavailable' } })
          : Response.json({ kind: 'result', value: { kind: 'accepted', reservation: { reservationRef: 'reservation:test' } } })
      }
      if (operation === 'prepare_authorization') {
        prepareCalls += 1
        return prepareCalls === 1
          ? Response.json({ kind: 'result', value: { custodyRef: 7 } })
          : Response.json({ kind: 'result', value: { custodyRef: 'custody:test', authorizationDigest: DIGEST('a') } })
      }
      if (operation === 'read_authorization' || operation === 'read_authorization_by_digest') {
        readCalls += 1
        const challenge = x402Challenge()
        const selectedRequirement = challenge.accepts[0]
        const base = {
          state: 'prepared', dispatchRef: canonicalTicket.invocationRef,
          attemptRef: routeInvocation.authority.attemptRef,
          effectGeneration: routeInvocation.authority.effectGeneration,
          operationRef: canonicalTicket.operationRef, credentialRef: CUSTOMER_SECRET_REF,
          challengeJson: JSON.stringify(challenge), selectedRequirementJson: JSON.stringify(selectedRequirement),
          challengeDigest: canonicalDigest(challenge), paymentIdentifier: routeInvocation.authority.operationKeyDigest,
        }
        if (readCalls === 1) return Response.json({ kind: 'result', value: { ...base, dispatchRef: 'invocation:attacker' } })
        if (readCalls === 2) return Response.json({ kind: 'result', value: { ...base, challengeDigest: DIGEST('f') } })
        if (readCalls === 3) return Response.json({ kind: 'result', value: { ...base, challengeJson: '{' } })
        return Response.json({ kind: 'result', value: base })
      }
      if (operation === 'mark_possibly_submitted') {
        markCalls += 1
        if (markCalls === 1) return Response.json({ kind: 'unavailable' })
      }
      return Response.json({ kind: 'result', value: null })
    }
    throw new Error(`unexpected_fetch:${url}`)
  })
}
