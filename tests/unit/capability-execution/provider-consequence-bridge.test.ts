import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ActionCtx } from '../../../convex/_generated/server'
import type { RouteTransportInvocation } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  invokeProviderConsequenceViaVercel,
} from '@/modules/capability-execution/invocation-worker/providerConsequenceBridge'
import {
  providerConsequenceInvocationDigest,
  providerConsequenceTicketClaimsDigest,
  type CanonicalProviderConsequenceTicket,
} from '@/modules/capability-execution/invocation-worker/jitProviderConsequence'

const NOW = 2_000_000_000_000
const DIGEST = (character: string) => `sha256:${character.repeat(64)}`
const SIGNING_SECRET_REF = `sec_${'9'.repeat(32)}`
const CUSTOMER_SECRET_REF = `sec_${'1'.repeat(32)}`
const PAYMENT_SECRET_REF = `sec_${'6'.repeat(32)}`
const GENERATION = `sgn_${'2'.repeat(32)}`
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
      effectGeneration: 4,
      operationKeyDigest: DIGEST('3'),
      mandateDigest: DIGEST('4'),
      grantDigest: DIGEST('5'),
      capabilityContractDigest: DIGEST('6'),
      maximumSpend: { currency: 'USD', units: '0', exponent: 2 },
      expiresAt: NOW + 20_000,
      callIdentity: { keyId: 'route-calls:test', signature: 'hmac-sha256:test' },
      authorityGeneration: 7,
      authorityDigest: DIGEST('7'),
      canonicalConnectionRef: CANONICAL_CONNECTION_REF,
      leaseRef: 'lease:test',
      invocationRef: 'invocation:test',
      operationRef: 'operation:test',
      grantedScopes: ['provider:invoke'],
      grantedResources: ['operation:test'],
      readinessValidUntil: NOW + 15_000,
      readinessDigest: DIGEST('8'),
    },
    inputJson: JSON.stringify({ destination: 'PER' }),
  }
}

function ticket(routeInvocation = invocation()): CanonicalProviderConsequenceTicket {
  const invocationDigest = providerConsequenceInvocationDigest(routeInvocation)
  if (invocationDigest === undefined) throw new Error('test_fixture_invalid')
  return {
    version: 'provider-consequence:v1',
    ticketRef: 'provider-ticket:test',
    effectRef: 'connection-effect:test',
    requestDigest: DIGEST('a'),
    invocationDigest,
    issuedAt: NOW,
    expiresAt: NOW + 10_000,
    invocationRef: 'invocation:test',
    operationRef: 'operation:test',
    leaseRef: 'lease:test',
    canonicalLeaseRef: 'lease_canonical_test',
    canonicalConnectionRef: CANONICAL_CONNECTION_REF,
    canonicalConnectionGeneration: 7,
    providerRef: 'provider:test',
    adapterId: 'http-json:v1',
    authorityDigest: DIGEST('7'),
    grantedScopes: ['provider:invoke'],
    grantedResources: ['operation:test'],
    readinessValidUntil: NOW + 15_000,
    readinessDigest: DIGEST('8'),
    owningAccountRef: `acc_${'1'.repeat(32)}`,
    activeAccountRef: `acc_${'1'.repeat(32)}`,
    actorPrincipalRef: `prn_${'2'.repeat(32)}`,
    grantRef: 'grant:test',
    grantGeneration: 3,
    secret: {
      secretRef: CUSTOMER_SECRET_REF,
      activeGeneration: GENERATION,
      pointerRevision: 5,
    },
    ...(routeInvocation.binding.adapterId === 'x402-fetch:v2'
      ? { paymentSecret: {
          secretRef: PAYMENT_SECRET_REF,
          activeGeneration: `sgn_${'6'.repeat(32)}`,
          pointerRevision: 6,
        } }
      : {}),
  }
}

function issued(routeInvocation = invocation()) {
  const canonicalTicket = ticket(routeInvocation)
  return {
    kind: 'issued' as const,
    ticket: canonicalTicket,
    ticketClaimsDigest: providerConsequenceTicketClaimsDigest(canonicalTicket),
    signingSecret: {
      secretRef: SIGNING_SECRET_REF,
      activeGeneration: `sgn_${'8'.repeat(32)}`,
      pointerRevision: 2,
    },
  }
}

function context(result: unknown) {
  return {
    runMutation: vi.fn(async () => result),
  } as unknown as ActionCtx
}

const SIGNED_TICKET = `provider-ticket:test.${NOW + 10_000}.${'a'.repeat(64)}`

function signingResponse(): Response {
  return Response.json({ signedTicket: SIGNED_TICKET })
}

describe('provider consequence Convex-to-Vercel bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    process.env.AE_PROVIDER_CONSEQUENCE_ORIGIN = 'https://agentic-economy.example'
    process.env.AE_PROVIDER_TICKET_SIGNING_SECRET_REF = SIGNING_SECRET_REF
    process.env.AE_X402_PAYMENT_SECRET_REF = PAYMENT_SECRET_REF
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    delete process.env.AE_PROVIDER_CONSEQUENCE_ORIGIN
    delete process.env.AE_PROVIDER_TICKET_SIGNING_SECRET_REF
    delete process.env.AE_X402_PAYMENT_SECRET_REF
  })

  it('journals the exact admitted authority and sends the one-time token only to Vercel', async () => {
    const routeInvocation = invocation()
    const issue = issued(routeInvocation)
    const ctx = context(issue)
    let fetchCount = 0
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => ++fetchCount === 1
      ? signingResponse()
      : Response.json({
          transport: 'http',
          disposition: 'succeeded',
          releaseStarted: true,
          requestDigest: DIGEST('a'),
          outputJson: JSON.stringify({ serviceReference: 'service:test' }),
        }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await invokeProviderConsequenceViaVercel(ctx, {
      invocation: routeInvocation,
      requestDigest: DIGEST('a'),
    })

    expect(result).toMatchObject({ disposition: 'succeeded', releaseStarted: true })
    expect(ctx.runMutation).toHaveBeenCalledOnce()
    const mutationInput = vi.mocked(ctx.runMutation).mock.calls[0]?.[1] as Record<string, unknown>
    expect(mutationInput).toMatchObject({
      invocationRef: 'invocation:test',
      attemptRef: 'attempt:test',
      effectGeneration: 4,
      operationKeyDigest: DIGEST('3'),
      signingSecretRef: SIGNING_SECRET_REF,
    })
    expect(mutationInput).not.toHaveProperty('journalToken')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const signingOutbound = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>
    const outbound = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<string, unknown>
    expect(signingOutbound).toMatchObject({ action: 'issue', ticket: issue.ticket, signingSecret: issue.signingSecret })
    expect(outbound).toMatchObject({ action: 'execute', ticket: issue.ticket, signedTicket: SIGNED_TICKET })
    expect(typeof outbound.journalToken).toBe('string')
    expect(signingOutbound.journalToken).toBe(outbound.journalToken)
    const tokenDigest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(String(outbound.journalToken)),
    )
    expect(mutationInput.journalTokenDigest).toBe(
      `sha256:${Buffer.from(tokenDigest).toString('hex')}`,
    )
    expect(JSON.stringify(mutationInput)).not.toContain(String(outbound.journalToken))
    expect(JSON.stringify(outbound)).not.toContain('provider-secret')
  })

  it('returns a reconciliation-required unknown after an ambiguous external result without retrying', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => {
      if (fetchMock.mock.calls.length === 1) return signingResponse()
      throw new Error('connection_reset_after_submit')
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await invokeProviderConsequenceViaVercel(context(issued()), {
      invocation: invocation(),
      requestDigest: DIGEST('a'),
    })

    expect(result).toEqual({
      transport: 'http',
      disposition: 'unknown',
      releaseStarted: true,
      requestDigest: DIGEST('a'),
      failureCode: 'provider_consequence_bridge_unknown',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('binds provider-direct x402 to a distinct payment pointer and fails before journal or transport when absent', async () => {
    const routeInvocation = invocation()
    ;(routeInvocation.binding as { adapterId: string }).adapterId = 'x402-fetch:v2'
    const issue = issued(routeInvocation)
    let fetchCount = 0
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => ++fetchCount === 1
      ? signingResponse()
      : Response.json({
          transport: 'x402',
          disposition: 'refused',
          releaseStarted: false,
          requestDigest: DIGEST('a'),
          failureCode: 'payment_not_required',
        }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = context(issue)

    await expect(invokeProviderConsequenceViaVercel(ctx, {
      invocation: routeInvocation,
      requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({ transport: 'x402', disposition: 'refused' })
    expect(vi.mocked(ctx.runMutation).mock.calls[0]?.[1]).toMatchObject({
      paymentSecretRef: PAYMENT_SECRET_REF,
      signingSecretRef: SIGNING_SECRET_REF,
    })
    expect(PAYMENT_SECRET_REF).not.toBe(CUSTOMER_SECRET_REF)

    delete process.env.AE_X402_PAYMENT_SECRET_REF
    const unavailable = context(issue)
    fetchMock.mockClear()
    await expect(invokeProviderConsequenceViaVercel(unavailable, {
      invocation: routeInvocation,
      requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_runtime_unavailable',
    })
    expect(unavailable.runMutation).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a successful-looking Vercel response attributed to another request', async () => {
    let fetchCount = 0
    const fetchMock = vi.fn<typeof globalThis.fetch>(async () => ++fetchCount === 1
      ? signingResponse()
      : Response.json({
          transport: 'http',
          disposition: 'succeeded',
          releaseStarted: true,
          requestDigest: DIGEST('f'),
          outputJson: '{}',
        }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(invokeProviderConsequenceViaVercel(context(issued()), {
      invocation: invocation(),
      requestDigest: DIGEST('a'),
    })).resolves.toEqual({
      transport: 'http',
      disposition: 'unknown',
      releaseStarted: true,
      requestDigest: DIGEST('a'),
      failureCode: 'provider_consequence_bridge_unknown',
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not re-invoke Vercel when the durable journal reports started or completed', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const started = await invokeProviderConsequenceViaVercel(context({
      kind: 'started',
      ticketRef: 'provider-ticket:test',
    }), { invocation: invocation(), requestDigest: DIGEST('a') })
    const completed = await invokeProviderConsequenceViaVercel(context({
      kind: 'completed',
      ticketRef: 'provider-ticket:test',
      observationJson: JSON.stringify({
        transport: 'http',
        disposition: 'succeeded',
        releaseStarted: true,
        requestDigest: DIGEST('a'),
        outputJson: '{}',
      }),
    }), { invocation: invocation(), requestDigest: DIGEST('a') })

    expect(started).toMatchObject({
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'provider_consequence_started',
    })
    expect(completed).toMatchObject({ disposition: 'succeeded', outputJson: '{}' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed before release for incomplete authority, bad configuration, and journal errors', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', fetchMock)
    const missingLease = invocation()
    delete (missingLease.authority as { leaseRef?: string }).leaseRef
    const incompleteCtx = context(issued())
    await expect(invokeProviderConsequenceViaVercel(incompleteCtx, {
      invocation: missingLease,
      requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({ disposition: 'refused', releaseStarted: false })
    expect(incompleteCtx.runMutation).not.toHaveBeenCalled()

    process.env.AE_PROVIDER_CONSEQUENCE_ORIGIN = 'http://localhost:3000'
    const unavailableCtx = context(issued())
    await expect(invokeProviderConsequenceViaVercel(unavailableCtx, {
      invocation: invocation(),
      requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_runtime_unavailable',
    })
    expect(unavailableCtx.runMutation).not.toHaveBeenCalled()

    process.env.AE_PROVIDER_CONSEQUENCE_ORIGIN = 'https://agentic-economy.example'
    const journalFailure = {
      runMutation: vi.fn(async () => { throw new Error('journal_down') }),
    } as unknown as ActionCtx
    await expect(invokeProviderConsequenceViaVercel(journalFailure, {
      invocation: invocation(),
      requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_ticket_unavailable',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed across every bridge state without retrying or accepting caller-shaped authority', async () => {
    const fetchMock = vi.fn<typeof globalThis.fetch>()
    vi.stubGlobal('fetch', fetchMock)

    for (const adapterId of ['mcp-jsonrpc:v1', 'x402-fetch:v2']) {
      const candidate = invocation()
      ;(candidate.binding as { adapterId: string }).adapterId = adapterId
      delete (candidate.authority as { leaseRef?: string }).leaseRef
      await expect(invokeProviderConsequenceViaVercel(context(issued()), {
        invocation: candidate,
        requestDigest: DIGEST('a'),
      })).resolves.toMatchObject({
        transport: adapterId === 'mcp-jsonrpc:v1' ? 'mcp' : 'x402',
        disposition: 'refused',
      })
    }

    const keyless = invocation()
    ;(keyless.binding as unknown as { authority: { kind: 'keyless' } }).authority = { kind: 'keyless' }
    await expect(invokeProviderConsequenceViaVercel(context(issued()), {
      invocation: keyless,
      requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({ failureCode: 'provider_consequence_authority_invalid' })

    for (const field of [
      'leaseRef', 'invocationRef', 'operationRef', 'attemptRef', 'effectGeneration',
      'operationKeyDigest', 'grantedScopes', 'grantedResources', 'readinessValidUntil',
    ] as const) {
      const candidate = invocation()
      delete (candidate.authority as unknown as Record<string, unknown>)[field]
      await expect(invokeProviderConsequenceViaVercel(context(issued()), {
        invocation: candidate,
        requestDigest: DIGEST('a'),
      })).resolves.toMatchObject({ failureCode: 'provider_consequence_authority_invalid' })
    }

    process.env.AE_PROVIDER_CONSEQUENCE_ORIGIN = 'https://agentic-economy.example/path'
    await expect(invokeProviderConsequenceViaVercel(context(issued()), {
      invocation: invocation(), requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({ failureCode: 'provider_consequence_runtime_unavailable' })

    process.env.AE_PROVIDER_CONSEQUENCE_ORIGIN = 'https://agentic-economy.example:443'
    await expect(invokeProviderConsequenceViaVercel(context(issued()), {
      invocation: invocation(), requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({ failureCode: 'provider_consequence_runtime_unavailable' })

    process.env.AE_PROVIDER_CONSEQUENCE_ORIGIN = 'https://agentic-economy.example'
    const RealURL = URL
    class ThrowingURL extends RealURL {
      constructor(input: string | URL, base?: string | URL) {
        if (String(input) === 'https://agentic-economy.example') throw new Error('url_parser_unavailable')
        super(input, base)
      }
    }
    vi.stubGlobal('URL', ThrowingURL)
    await expect(invokeProviderConsequenceViaVercel(context(issued()), {
      invocation: invocation(), requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({ failureCode: 'provider_consequence_runtime_unavailable' })
    vi.stubGlobal('URL', RealURL)

    delete process.env.AE_PROVIDER_TICKET_SIGNING_SECRET_REF
    await expect(invokeProviderConsequenceViaVercel(context(issued()), {
      invocation: invocation(), requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({ failureCode: 'provider_consequence_runtime_unavailable' })
    process.env.AE_PROVIDER_TICKET_SIGNING_SECRET_REF = SIGNING_SECRET_REF

    const withoutReadinessDigest = invocation()
    delete (withoutReadinessDigest.authority as { readinessDigest?: string }).readinessDigest
    await expect(invokeProviderConsequenceViaVercel(context({ kind: 'unavailable' }), {
      invocation: withoutReadinessDigest, requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({ failureCode: 'provider_consequence_ticket_unavailable' })

    await expect(invokeProviderConsequenceViaVercel(context({ kind: 'unavailable' }), {
      invocation: invocation(), requestDigest: DIGEST('a'),
    })).resolves.toMatchObject({ failureCode: 'provider_consequence_ticket_unavailable' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats non-success and malformed callback responses as an ambiguous external result', async () => {
    for (const response of [
      new Response('unavailable', { status: 503 }),
      new Response('not-json', { status: 200 }),
    ]) {
      let fetchCount = 0
      const fetchMock = vi.fn<typeof globalThis.fetch>(async () => ++fetchCount === 1
        ? signingResponse()
        : response)
      vi.stubGlobal('fetch', fetchMock)
      await expect(invokeProviderConsequenceViaVercel(context(issued()), {
        invocation: invocation(),
        requestDigest: DIGEST('a'),
      })).resolves.toEqual({
        transport: 'http',
        disposition: 'unknown',
        releaseStarted: true,
        requestDigest: DIGEST('a'),
        failureCode: 'provider_consequence_bridge_unknown',
      })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    }
  })

  it('fails before release for every malformed or unavailable ticket-signing response', async () => {
    for (const response of [
      Response.json({ signedTicket: SIGNED_TICKET }, { status: 503 }),
      Response.json('caller-shaped-ticket'),
      Response.json(null),
      Response.json({ signedTicket: SIGNED_TICKET, extra: true }),
      Response.json({ signedTicket: 7 }),
      new Response('not-json', { status: 200 }),
    ]) {
      const fetchMock = vi.fn<typeof globalThis.fetch>(async () => response)
      vi.stubGlobal('fetch', fetchMock)
      await expect(invokeProviderConsequenceViaVercel(context(issued()), {
        invocation: invocation(),
        requestDigest: DIGEST('a'),
      })).resolves.toEqual({
        transport: 'http',
        disposition: 'refused',
        releaseStarted: false,
        requestDigest: DIGEST('a'),
        failureCode: 'provider_consequence_ticket_signing_unavailable',
      })
      expect(fetchMock).toHaveBeenCalledOnce()
    }
  })
})
