import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodePaymentRequiredHeader } from '@x402/core/http'
import { declarePaymentIdentifierExtension } from '@x402/extensions/payment-identifier'

import type { RouteTransportInvocation } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  providerConsequenceInvocationDigest,
  providerConsequenceTicketClaimsDigest,
  type CanonicalProviderConsequenceTicket,
} from '@/modules/capability-execution/provider-consequence-runtime'

const mocks = vi.hoisted(() => {
  class FakeAgent {
    close = vi.fn(async () => undefined)
  }
  return {
    guardedFetch: vi.fn(),
    getVercelOidcToken: vi.fn(),
    isPublicHttpTarget: vi.fn(),
    FakeAgent,
  }
})

vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: mocks.getVercelOidcToken }))
vi.mock('undici', () => ({ Agent: mocks.FakeAgent, fetch: mocks.guardedFetch }))
vi.mock('@/modules/network-guard/public', () => ({
  createGuardedLookup: vi.fn(() => vi.fn()),
  defaultDnsResolver: { lookup: vi.fn() },
  isPublicHttpTarget: mocks.isPublicHttpTarget,
}))
vi.mock('@/modules/network-guard/server', () => ({
  sendGuardedHttpRequest: async (request: Request) => await fetch(request.url, {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    ...(request.method === 'GET' || request.method === 'HEAD'
      ? {}
      : { body: await request.text() }),
    redirect: request.redirect,
    signal: request.signal,
  }),
}))

import { handleProviderConsequenceRequest } from '@/routes/api.internal.provider-consequence'

const NOW = 2_000_000_000_000
const DIGEST = (character: string) => `sha256:${character.repeat(64)}`
const CUSTOMER_SECRET_REF = `sec_${'1'.repeat(32)}`
const CUSTOMER_GENERATION = `sgn_${'2'.repeat(32)}`
const SIGNING_SECRET_REF = `sec_${'8'.repeat(32)}`
const SIGNING_GENERATION = `sgn_${'9'.repeat(32)}`
const PAYMENT_SECRET_REF = `sec_${'6'.repeat(32)}`
const PAYMENT_GENERATION = `sgn_${'7'.repeat(32)}`
const CUSTOMER_SECRET = `0x${'11'.repeat(32)}`
const PAYMENT_SECRET = `0x${'22'.repeat(32)}`
const SIGNING_KEY = 'platform-ticket-signing-key-at-least-32-bytes'
const JOURNAL_TOKEN = 'a'.repeat(43)
const CANONICAL_CONNECTION_REF = `con_${'3'.repeat(32)}`

type ProviderInvocation = Extract<
  RouteTransportInvocation,
  Readonly<{ binding: Readonly<{ authority: Readonly<{ kind: 'provider_connection' }> }> }>
>

function invocation(): ProviderInvocation {
  const config = {
    method: 'POST' as const,
    requestTimeoutMs: 5_000,
    credential: { kind: 'bearer' as const },
  }
  return {
    binding: {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://provider.example/run',
      authority: {
        kind: 'provider_connection',
        connectionRef: 'connection:test',
        providerRef: 'provider:test',
      },
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority: {
      attemptRef: 'attempt:test',
      effectGeneration: 1,
      operationKeyDigest: DIGEST('3'),
      mandateDigest: DIGEST('4'),
      grantDigest: DIGEST('5'),
      capabilityContractDigest: DIGEST('6'),
      maximumSpend: { currency: 'USD', units: '0', exponent: 2 },
      expiresAt: NOW + 120_000,
      callIdentity: { keyId: 'route-calls:test', signature: 'hmac-sha256:test' },
      authorityGeneration: 7,
      authorityDigest: DIGEST('7'),
      canonicalConnectionRef: CANONICAL_CONNECTION_REF,
      leaseRef: 'lease:test',
      invocationRef: 'invocation:test',
      operationRef: 'operation:test',
      grantedScopes: ['provider:invoke'],
      grantedResources: ['operation:test'],
      readinessValidUntil: NOW + 120_000,
      readinessDigest: DIGEST('8'),
    },
    inputJson: JSON.stringify({ destination: 'PER' }),
  }
}

function x402Challenge() {
  return {
    x402Version: 2 as const,
    resource: {
      url: 'https://provider.example/paid',
      description: 'Paid result',
      mimeType: 'application/json',
    },
    extensions: { 'payment-identifier': declarePaymentIdentifierExtension(true) },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:84532' as const,
      amount: '10000',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      payTo: '0x209693Bc6afc0C5328bA36FaF03C514EF312287C',
      maxTimeoutSeconds: 60,
      extra: { assetTransferMethod: 'eip3009', name: 'USDC', version: '2' },
    }],
  }
}

function x402Invocation(): ProviderInvocation {
  const base = invocation()
  const challenge = x402Challenge()
  const requirement = challenge.accepts[0]
  if (requirement === undefined) throw new Error('x402_requirement_fixture_missing')
  const config = {
    method: 'POST' as const,
    requestTimeoutMs: 5_000,
    scheme: 'exact' as const,
    network: requirement.network,
    currency: 'USD',
    routeAmountExponent: 2,
    assetAmountExponent: 6,
    asset: requirement.asset,
    payTo: requirement.payTo,
    paymentRequiredJson: JSON.stringify(challenge),
  }
  return {
    ...base,
    binding: {
      ...base.binding,
      adapterId: 'x402-fetch:v2',
      endpointUrl: challenge.resource.url,
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority: {
      ...base.authority,
      maximumSpend: { currency: 'USD', units: '1', exponent: 2 },
    },
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

function ticket(routeInvocation = invocation()): CanonicalProviderConsequenceTicket {
  const invocationDigest = providerConsequenceInvocationDigest(routeInvocation)
  if (invocationDigest === undefined) throw new Error('test_fixture_invalid')
  const readinessValidUntil = routeInvocation.authority.readinessValidUntil
  if (readinessValidUntil === undefined) throw new Error('readiness_fixture_missing')
  const readinessDigest = routeInvocation.authority.readinessDigest
  return {
    version: 'provider-consequence:v1',
    ticketRef: 'provider-ticket:test',
    effectRef: 'connection-effect:test',
    requestDigest: requestDigest(routeInvocation),
    invocationDigest,
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 10_000,
    invocationRef: 'invocation:test',
    operationRef: 'operation:test',
    leaseRef: 'lease:test',
    canonicalLeaseRef: 'lease-canonical:test',
    canonicalConnectionRef: CANONICAL_CONNECTION_REF,
    canonicalConnectionGeneration: 7,
    providerRef: 'provider:test',
    adapterId: routeInvocation.binding.adapterId,
    authorityDigest: routeInvocation.authority.authorityDigest,
    grantedScopes: ['provider:invoke'],
    grantedResources: ['operation:test'],
    readinessValidUntil,
    ...(readinessDigest === undefined ? {} : { readinessDigest }),
    owningAccountRef: `acc_${'1'.repeat(32)}`,
    activeAccountRef: `acc_${'1'.repeat(32)}`,
    actorPrincipalRef: `prn_${'2'.repeat(32)}`,
    grantRef: 'grant:test',
    grantGeneration: 3,
    secret: {
      secretRef: CUSTOMER_SECRET_REF,
      activeGeneration: CUSTOMER_GENERATION,
      pointerRevision: 4,
    },
    ...(routeInvocation.binding.adapterId === 'x402-fetch:v2'
      ? { paymentSecret: {
          secretRef: PAYMENT_SECRET_REF,
          activeGeneration: PAYMENT_GENERATION,
          pointerRevision: 5,
        } }
      : {}),
  }
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

function jwt(): string {
  const seconds = NOW / 1_000
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iat: seconds - 60, nbf: seconds - 60, exp: seconds + 3_540 })).toString('base64url'),
    Buffer.from('signature').toString('base64url'),
  ].join('.')
}

function consequenceRequest(
  canonicalTicket = ticket(),
  overrides: Record<string, unknown> = {},
) {
  const body = {
    action: 'execute',
    ticket: canonicalTicket,
    ticketClaimsDigest: providerConsequenceTicketClaimsDigest(canonicalTicket),
    signingSecret: {
      secretRef: SIGNING_SECRET_REF,
      activeGeneration: SIGNING_GENERATION,
      pointerRevision: 2,
    },
    journalToken: JOURNAL_TOKEN,
    signedTicket: signedTicketFor(canonicalTicket),
    invocation: invocation(),
    ...overrides,
  }
  return new Request('https://agentic-economy.example/api/internal/provider-consequence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function signingRequest(canonicalTicket = ticket()) {
  return new Request('https://agentic-economy.example/api/internal/provider-consequence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'issue',
      ticket: canonicalTicket,
      ticketClaimsDigest: providerConsequenceTicketClaimsDigest(canonicalTicket),
      signingSecret: {
        secretRef: SIGNING_SECRET_REF,
        activeGeneration: SIGNING_GENERATION,
        pointerRevision: 2,
      },
      journalToken: JOURNAL_TOKEN,
    }),
  })
}

function signedTicketFor(canonicalTicket: CanonicalProviderConsequenceTicket): string {
  const claimsDigest = providerConsequenceTicketClaimsDigest(canonicalTicket)
  const message = [
    canonicalTicket.ticketRef,
    claimsDigest,
    canonicalTicket.expiresAt,
    SIGNING_SECRET_REF,
    SIGNING_GENERATION,
    2,
  ].join(':')
  const signature = createHmac('sha256', SIGNING_KEY).update(message).digest('hex')
  return `${canonicalTicket.ticketRef}.${canonicalTicket.expiresAt}.${signature}`
}

function vaultAndJournalFetch(convexBodies: string[]) {
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input))
    if (url.hostname === 'app.infisical.com' && url.pathname === '/api/v1/auth/oidc-auth/login') {
      return Response.json({
        accessToken: 'vault-access-token',
        tokenType: 'Bearer',
        expiresIn: 600,
        accessTokenMaxTTL: 600,
      })
    }
    if (url.hostname === 'app.infisical.com' && url.pathname.startsWith('/api/v4/secrets/')) {
      const projectId = url.searchParams.get('projectId')
      const platform = projectId === 'project-platform'
      return Response.json({
        secret: {
          secretKey: platform
            ? `${SIGNING_SECRET_REF}--${SIGNING_GENERATION}`
            : `${CUSTOMER_SECRET_REF}--${CUSTOMER_GENERATION}`,
          secretValue: platform ? SIGNING_KEY : CUSTOMER_SECRET,
          environment: 'production',
          workspace: projectId,
        },
      })
    }
    if (url.hostname === 'test-deployment.convex.site') {
      const rawBody = String(init?.body)
      convexBodies.push(rawBody)
      if (url.pathname.endsWith('/journal/attest')) {
        return Response.json({ kind: 'attested' })
      }
      if (url.pathname.endsWith('/journal/begin')) {
        return Response.json({ kind: 'claimed', claimRef: 'provider-claim:test' })
      }
      if (url.pathname.endsWith('/journal/complete')) {
        return Response.json({ kind: 'completed' })
      }
      if (url.pathname.endsWith('/journal/abort')) {
        return Response.json({ kind: 'aborted' })
      }
    }
    throw new Error(`unexpected_fetch:${url}`)
  })
}

describe('internal provider consequence route', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    mocks.getVercelOidcToken.mockReset()
    mocks.getVercelOidcToken.mockResolvedValue(jwt())
    mocks.guardedFetch.mockReset()
    mocks.isPublicHttpTarget.mockReset()
    mocks.isPublicHttpTarget.mockResolvedValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('issues an AE-signed short-lived ticket only after durable pending-ticket attestation', async () => {
    const convexBodies: string[] = []
    vi.stubGlobal('fetch', vaultAndJournalFetch(convexBodies))
    const canonicalTicket = ticket()
    const response = await handleProviderConsequenceRequest(signingRequest(canonicalTicket), environment())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ signedTicket: signedTicketFor(canonicalTicket) })
    expect(convexBodies).toHaveLength(1)
    expect(JSON.parse(convexBodies[0]!)).toEqual({
      ticketRef: canonicalTicket.ticketRef,
      ticketClaimsDigest: providerConsequenceTicketClaimsDigest(canonicalTicket),
      expiresAt: canonicalTicket.expiresAt,
      signingSecretRef: SIGNING_SECRET_REF,
      signingSecretGeneration: SIGNING_GENERATION,
      signingSecretPointerRevision: 2,
    })
    expect(convexBodies[0]).not.toContain(CUSTOMER_SECRET)
    expect(convexBodies[0]).not.toContain(SIGNING_KEY)
  })

  it('refuses signing when durable attestation is denied or the issuer boundary is unavailable', async () => {
    const canonicalTicket = ticket()
    const base = vaultAndJournalFetch([])
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(String(input))
      return url.pathname.endsWith('/journal/attest')
        ? Response.json({ kind: 'unavailable' })
        : await base(input, init)
    }))
    const denied = await handleProviderConsequenceRequest(signingRequest(canonicalTicket), environment())
    expect(denied.status).toBe(409)

    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => {
      throw new Error('attestation_unavailable')
    }))
    const unavailable = await handleProviderConsequenceRequest(signingRequest(canonicalTicket), environment())
    expect(unavailable.status).toBe(503)
  })

  it('executes the provider consequence while keeping both vault secrets out of Convex and the response', async () => {
    const convexBodies: string[] = []
    const externalFetch = vaultAndJournalFetch(convexBodies)
    vi.stubGlobal('fetch', externalFetch)
    mocks.guardedFetch.mockResolvedValue(Response.json({ serviceReference: 'service:test' }))

    const response = await handleProviderConsequenceRequest(consequenceRequest(), environment())
    const responseBody = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(JSON.parse(responseBody)).toMatchObject({
      transport: 'http',
      disposition: 'succeeded',
      releaseStarted: true,
      requestDigest: requestDigest(invocation()),
    })
    expect(mocks.guardedFetch).toHaveBeenCalledOnce()
    expect(mocks.guardedFetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${CUSTOMER_SECRET}`,
    })
    expect(convexBodies).toHaveLength(2)
    expect(convexBodies.join('\n')).not.toContain(CUSTOMER_SECRET)
    expect(convexBodies.join('\n')).not.toContain(SIGNING_KEY)
    expect(responseBody).not.toContain(CUSTOMER_SECRET)
    expect(responseBody).not.toContain(SIGNING_KEY)
    expect(responseBody).not.toContain(JOURNAL_TOKEN)
  })

  it('runs provider-direct x402 through existing reserve/prepare/sign/mark/observe ports without custody or secret leakage', async () => {
    const routeInvocation = x402Invocation()
    const canonicalTicket = ticket(routeInvocation)
    const convexBodies: string[] = []
    const operations: string[] = []
    const externalFetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const url = new URL(String(input))
      if (url.hostname === 'app.infisical.com' && url.pathname === '/api/v1/auth/oidc-auth/login') {
        return Response.json({
          accessToken: 'vault-access-token',
          tokenType: 'Bearer',
          expiresIn: 600,
          accessTokenMaxTTL: 600,
        })
      }
      if (url.hostname === 'app.infisical.com' && url.pathname.startsWith('/api/v4/secrets/')) {
        const projectId = url.searchParams.get('projectId')
        const platform = projectId === 'project-platform'
        const payment = url.pathname.includes(PAYMENT_SECRET_REF)
        return Response.json({
          secret: {
            secretKey: payment
              ? `${PAYMENT_SECRET_REF}--${PAYMENT_GENERATION}`
              : platform
              ? `${SIGNING_SECRET_REF}--${SIGNING_GENERATION}`
              : `${CUSTOMER_SECRET_REF}--${CUSTOMER_GENERATION}`,
            secretValue: payment ? PAYMENT_SECRET : platform ? SIGNING_KEY : CUSTOMER_SECRET,
            environment: 'production',
            workspace: projectId,
          },
        })
      }
      if (url.hostname === 'test-deployment.convex.site') {
        const rawBody = String(init?.body)
        convexBodies.push(rawBody)
        const body = JSON.parse(rawBody) as Record<string, unknown>
        if (url.pathname.endsWith('/journal/begin')) {
          return Response.json({ kind: 'claimed', claimRef: 'provider-claim:test' })
        }
        if (url.pathname.endsWith('/journal/complete')) {
          return Response.json({ kind: 'completed' })
        }
        if (url.pathname.endsWith('/x402')) {
          const operation = String(body.operation)
          operations.push(operation)
          const rpcArgs = body.args as Record<string, unknown>
          if (operation === 'reserve_external_spend') {
            expect(rpcArgs).not.toHaveProperty('custodyRef')
            expect(rpcArgs).not.toHaveProperty('custodyGeneration')
            expect(rpcArgs).not.toHaveProperty('custodyDailyMaximum')
            return Response.json({
              kind: 'result',
              value: { kind: 'accepted', reservation: { reservationRef: 'external-spend:test' } },
            })
          }
          if (operation === 'prepare_authorization') {
            expect(rpcArgs).not.toHaveProperty('custodyBudgetRef')
            expect(rpcArgs).not.toHaveProperty('custodyGeneration')
            expect(rpcArgs).not.toHaveProperty('custodyDailyMaximumUnits')
            return Response.json({
              kind: 'result',
              value: { custodyRef: 'attempt:test', authorizationDigest: DIGEST('a') },
            })
          }
          if (operation === 'read_authorization') {
            const challenge = x402Challenge()
            return Response.json({
              kind: 'result',
              value: {
                state: 'prepared',
                dispatchRef: canonicalTicket.invocationRef,
                attemptRef: routeInvocation.authority.attemptRef,
                effectGeneration: routeInvocation.authority.effectGeneration,
                operationRef: canonicalTicket.operationRef,
                credentialRef: PAYMENT_SECRET_REF,
                challengeJson: JSON.stringify(challenge),
                selectedRequirementJson: JSON.stringify(challenge.accepts[0]),
                challengeDigest: canonicalDigest(challenge),
                paymentIdentifier: routeInvocation.authority.operationKeyDigest,
              },
            })
          }
          return Response.json({ kind: 'result', value: null })
        }
      }
      throw new Error(`unexpected_fetch:${url}`)
    })
    vi.stubGlobal('fetch', externalFetch)
    mocks.guardedFetch.mockResolvedValue(new Response(null, {
      status: 402,
      headers: { 'Payment-Required': encodePaymentRequiredHeader(x402Challenge()) },
    }))

    const response = await handleProviderConsequenceRequest(
      consequenceRequest(canonicalTicket, { invocation: routeInvocation }),
      environment(),
    )
    const responseBody = await response.text()

    expect(response.status).toBe(200)
    expect(JSON.parse(responseBody)).toMatchObject({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'observed',
    })
    expect(operations).toEqual([
      'reserve_external_spend',
      'prepare_authorization',
      'read_authorization',
      'record_signature_digest',
      'mark_possibly_submitted',
      'observe_attempt',
    ])
    expect(convexBodies.join('\n')).not.toContain(CUSTOMER_SECRET)
    expect(convexBodies.join('\n')).not.toContain(SIGNING_KEY)
    expect(responseBody).not.toContain(CUSTOMER_SECRET)
    expect(responseBody).not.toContain(SIGNING_KEY)
    expect(responseBody).not.toContain(JOURNAL_TOKEN)
  })

  it('rejects a substituted claims digest before any vault, journal, or provider call', async () => {
    const externalFetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', externalFetch)

    const response = await handleProviderConsequenceRequest(
      consequenceRequest(ticket(), { ticketClaimsDigest: DIGEST('f') }),
      environment(),
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(externalFetch).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['missing customer project', { AE_INFISICAL_CUSTOMER_PROJECT_ID: undefined }],
    ['non-Convex origin', { CONVEX_SITE_URL: 'https://attacker.example' }],
    ['credentialed origin', { CONVEX_SITE_URL: 'https://user:pass@test-deployment.convex.site' }],
  ])('fails closed for invalid production configuration: %s', async (_label, override) => {
    const externalFetch = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', externalFetch)

    const response = await handleProviderConsequenceRequest(
      consequenceRequest(),
      environment(override),
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ kind: 'unavailable' })
    expect(externalFetch).not.toHaveBeenCalled()
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
  })
})
