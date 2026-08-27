import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from '@x402/core/http'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import {
  createJitProviderConsequenceBoundary,
  ProviderConsequencePreReleaseRefusal,
  providerConsequenceInvocationDigest,
  providerConsequenceTicketClaimsDigest,
  type CanonicalProviderConsequenceTicket,
  type JitProviderX402Runtime,
  type JitProviderX402RuntimeFactory,
  type ProviderConsequenceJournal,
  type ProviderConsequenceJournalBeginResult,
  type ProviderConsequenceTicketVerifier,
} from '@/modules/capability-execution/provider-consequence-runtime'
import {
  secretGeneration,
  secretRef,
  type InfisicalVaultConfiguration,
  type ProductionSecretRuntimeOptions,
  type SecretPointer,
  type SecretPointerStore,
} from '@/modules/secrets/public'
import type {
  RouteTransportFetch,
  RouteTransportInvocation,
} from '@/modules/capability-supply/route-transport-runtime'

const { getVercelOidcToken } = vi.hoisted(() => ({ getVercelOidcToken: vi.fn() }))
vi.mock('@vercel/oidc', () => ({ getVercelOidcToken }))

const NOW = 2_000_000_000_000
const REF = secretRef('sec_11111111111111111111111111111111')
const GENERATION = secretGeneration('sgn_11111111111111111111111111111111')
const PAYMENT_REF = secretRef('sec_22222222222222222222222222222222')
const PAYMENT_GENERATION = secretGeneration('sgn_22222222222222222222222222222222')
const CREDENTIAL = 'provider-secret-never-return'
const CANONICAL_CONNECTION_REF = `con_${'3'.repeat(32)}`

type ProviderRouteTransportInvocation = Extract<
  RouteTransportInvocation,
  Readonly<{ binding: Readonly<{ authority: Readonly<{ kind: 'provider_connection' }> }> }>
>

function invocation(): ProviderRouteTransportInvocation {
  const config = {
    method: 'POST' as const,
    requestTimeoutMs: 5_000,
    credential: { kind: 'bearer' as const },
  }
  const connection = {
    kind: 'provider_connection' as const,
    connectionRef: 'connection:test-provider',
    providerRef: 'provider:test',
  }
  return {
    binding: {
      adapterId: 'http-json:v1',
      endpointUrl: 'https://provider.example/run',
      authority: connection,
      configJson: JSON.stringify(config),
      configDigest: canonicalDigest(config),
    },
    authority: {
      attemptRef: 'operation-attempt:invocation:test:1',
      effectGeneration: 1,
      operationKeyDigest: canonicalDigest({ operation: 'test' }),
      mandateDigest: canonicalDigest({ mandate: 'test' }),
      grantDigest: canonicalDigest({ grant: 'test' }),
      capabilityContractDigest: canonicalDigest({ contract: 'test' }),
      maximumSpend: { currency: 'USD', units: '0', exponent: 2 },
      expiresAt: NOW + 30_000,
      callIdentity: { keyId: 'route-calls:2026-08', signature: 'hmac-sha256:signed-call' },
      authorityGeneration: 4,
      authorityDigest: canonicalDigest({ connection: 'test', generation: 4 }),
      canonicalConnectionRef: CANONICAL_CONNECTION_REF,
      leaseRef: 'lease:test',
      invocationRef: 'invocation:test',
      operationRef: 'operation:test',
      grantedScopes: ['provider:invoke'],
      grantedResources: ['operation:test'],
      readinessValidUntil: NOW + 20_000,
      readinessDigest: canonicalDigest({ readiness: 'test' }),
    },
    inputJson: JSON.stringify({ destination: 'PER' }),
  }
}

const X402_PAYMENT_CREDENTIAL_REF = 'env:AE_X402_PAYMENT_PRIVATE_KEY'

function x402Challenge() {
  return {
    x402Version: 2 as const,
    resource: { url: 'https://provider.example/paid' },
    accepts: [{
      scheme: 'exact',
      network: 'eip155:84532' as const,
      amount: '1250000',
      asset: '0x0000000000000000000000000000000000000001',
      payTo: '0x0000000000000000000000000000000000000002',
      maxTimeoutSeconds: 60,
      extra: {},
    }],
  }
}

function x402Invocation(): ProviderRouteTransportInvocation {
  const base = invocation()
  const challenge = x402Challenge()
  const requirement = challenge.accepts[0]
  if (requirement === undefined) throw new Error('test_fixture_invalid')
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
    paymentRequiredJson: stableStringify(challenge as StableHashValue),
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
      maximumSpend: { currency: 'USD', units: '125', exponent: 2 },
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
  const authority = routeInvocation.authority
  const {
    invocationRef,
    operationRef,
    leaseRef,
    grantedScopes,
    grantedResources,
    readinessValidUntil,
    readinessDigest,
  } = authority
  if (invocationRef === undefined
    || operationRef === undefined
    || leaseRef === undefined
    || grantedScopes === undefined
    || grantedResources === undefined
    || readinessValidUntil === undefined) throw new Error('test_fixture_invalid')
  const invocationDigest = providerConsequenceInvocationDigest(routeInvocation)
  if (invocationDigest === undefined) throw new Error('test_fixture_invalid')
  return Object.freeze({
    version: 'provider-consequence:v1',
    ticketRef: 'provider-effect-ticket:test',
    effectRef: 'connection-effect:test',
    requestDigest: requestDigest(routeInvocation),
    invocationDigest,
    issuedAt: NOW - 1_000,
    expiresAt: NOW + 10_000,
    invocationRef,
    operationRef,
    leaseRef,
    canonicalLeaseRef: 'lease_canonical_test',
    canonicalConnectionRef: routeInvocation.authority.canonicalConnectionRef!,
    canonicalConnectionGeneration: authority.authorityGeneration,
    providerRef: routeInvocation.binding.authority.providerRef,
    adapterId: routeInvocation.binding.adapterId,
    authorityDigest: authority.authorityDigest,
    grantedScopes,
    grantedResources,
    readinessValidUntil,
    ...(readinessDigest === undefined ? {} : { readinessDigest }),
    owningAccountRef: 'acc_11111111111111111111111111111111',
    activeAccountRef: 'acc_11111111111111111111111111111111',
    actorPrincipalRef: 'prn_11111111111111111111111111111111',
    grantRef: 'grant:test',
    grantGeneration: 3,
    secret: { secretRef: REF, activeGeneration: GENERATION, pointerRevision: 7 },
    ...(routeInvocation.binding.adapterId === 'x402-fetch:v2'
      ? { paymentSecret: {
          secretRef: PAYMENT_REF,
          activeGeneration: PAYMENT_GENERATION,
          pointerRevision: 8,
        } }
      : {}),
  })
}

function vault(scope: 'platform' | 'customer'): InfisicalVaultConfiguration {
  return {
    scope,
    baseUrl: 'https://app.infisical.com',
    projectId: scope === 'platform' ? 'project-platform' : 'project-customer',
    environment: 'production',
    secretPath: scope === 'platform' ? '/agentic-economy/platform' : '/agentic-economy/customer',
    machineIdentityId: scope === 'platform' ? 'identity-platform' : 'identity-customer',
  }
}

function pointerStore(pointer: SecretPointer): SecretPointerStore {
  return {
    getActive: async () => pointer,
    advanceActive: async () => { throw new Error('pointer_advance_forbidden') },
  }
}

function vaultFetch(secretValue = CREDENTIAL): typeof fetch {
  return vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname === '/api/v1/auth/oidc-auth/login') {
      return Response.json({
        accessToken: 'vault-access-token',
        tokenType: 'Bearer',
        expiresIn: 600,
        accessTokenMaxTTL: 600,
      })
    }
    const projectId = url.searchParams.get('projectId') ?? ''
    return Response.json({
      secret: {
        secretKey: `${REF}--${GENERATION}`,
        secretValue,
        environment: 'production',
        workspace: projectId,
      },
    })
  }) as typeof fetch
}

function jwt(): string {
  const seconds = NOW / 1_000
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iat: seconds - 60, nbf: seconds - 60, exp: seconds + 3_540 })).toString('base64url'),
    Buffer.from('signature').toString('base64url'),
  ].join('.')
}

function journal(): ProviderConsequenceJournal {
  return {
    begin: vi.fn(async () => ({ kind: 'claimed' as const, claimRef: 'claim:test' })),
    complete: vi.fn(async () => undefined),
    abortBeforeRelease: vi.fn(async () => undefined),
  }
}

function secretRuntimeOptions(
  pointer: SecretPointer,
  fetch: typeof globalThis.fetch,
  now?: () => number,
): ProductionSecretRuntimeOptions {
  return {
    configuration: { platform: vault('platform'), customer: vault('customer') },
    platform: { pointerStore: pointerStore(pointer), generationProbe: { validate: async () => undefined } },
    customer: { pointerStore: pointerStore(pointer), generationProbe: { validate: async () => undefined } },
    fetch,
    ...(now === undefined ? {} : { now }),
  }
}

type HarnessOverrides = Readonly<{
  routeInvocation?: RouteTransportInvocation
  verifiedTicket?: CanonicalProviderConsequenceTicket
  verifyTicket?: ProviderConsequenceTicketVerifier
  journal?: ProviderConsequenceJournal
  pointer?: SecretPointer
  vaultFetch?: typeof fetch
  send?: RouteTransportFetch
  now?: number
  boundaryNow?: () => number
  createCallbackScopedX402Runtime?: JitProviderX402RuntimeFactory
}>

function harness(overrides: HarnessOverrides = {}) {
  const routeInvocation = overrides.routeInvocation ?? invocation()
  const verifiedTicket = overrides.verifiedTicket ?? ticket()
  const durableJournal = overrides.journal ?? journal()
  const pointer = overrides.pointer ?? Object.freeze({
    secretRef: REF,
    activeGeneration: GENERATION,
    revision: 7,
  })
  const send = overrides.send ?? vi.fn<RouteTransportFetch>(async () =>
    Response.json({ serviceReference: 'service:jit' }))
  const boundary = createJitProviderConsequenceBoundary({
    verifyTicket: overrides.verifyTicket ?? (async (opaque) =>
      opaque === 'opaque-ticket' ? verifiedTicket : undefined),
    journal: durableJournal,
    secretRuntime: secretRuntimeOptions(pointer, overrides.vaultFetch ?? vaultFetch(), () => overrides.now ?? NOW),
    send,
    now: overrides.boundaryNow ?? (() => overrides.now ?? NOW),
    ...(overrides.createCallbackScopedX402Runtime === undefined
      ? {}
      : { createCallbackScopedX402Runtime: overrides.createCallbackScopedX402Runtime }),
  })
  return { boundary, durableJournal, routeInvocation, send }
}

function callbackScopedX402Runtime(
  overrides: Partial<JitProviderX402Runtime> = {},
): JitProviderX402Runtime {
  return {
    readX402PaymentCredentialRef: async () => X402_PAYMENT_CREDENTIAL_REF,
    validateProviderConnectionAuthority: async () => ({ kind: 'valid' as const }),
    x402PaymentSigningAvailable: () => true,
    verifyX402Settlement: async () => true,
    prepareX402PaymentAuthorization: async () => ({
      custodyRef: 'sha256:customer-custody-reference',
      authorizationDigest: canonicalDigest({ authorization: 'signed-payment' }),
    }),
    readX402PaymentAuthorization: async () => 'signed-payment',
    readX402PaymentAuthorizationByDigest: async () => 'signed-payment',
    beforeX402PaymentAuthorizationRead: async () => true,
    markX402PaymentPossiblySubmitted: async () => undefined,
    observeX402PaymentAttempt: async () => undefined,
    ...overrides,
  }
}

describe('JIT provider consequence boundary', () => {
  beforeEach(() => {
    getVercelOidcToken.mockReset()
    getVercelOidcToken.mockResolvedValue(jwt())
  })

  it('performs provider I/O inside callback-scoped production customer secret use', async () => {
    const routeInvocation = invocation()
    const canonicalTicket = ticket(routeInvocation)
    const durableJournal = journal()
    let callbackActive = false
    const send = vi.fn<RouteTransportFetch>(async (_target, init) => {
      callbackActive = true
      expect(init?.headers).toMatchObject({ Authorization: `Bearer ${CREDENTIAL}` })
      return Response.json({ serviceReference: 'service:jit' })
    })
    const pointer: SecretPointer = Object.freeze({
      secretRef: REF,
      activeGeneration: GENERATION,
      revision: 7,
    })
    const boundary = createJitProviderConsequenceBoundary({
      verifyTicket: async (opaque) => opaque === 'opaque-ticket' ? canonicalTicket : undefined,
      journal: durableJournal,
      secretRuntime: {
        configuration: { platform: vault('platform'), customer: vault('customer') },
        platform: { pointerStore: pointerStore(pointer), generationProbe: { validate: async () => undefined } },
        customer: { pointerStore: pointerStore(pointer), generationProbe: { validate: async () => undefined } },
        fetch: vaultFetch(),
        now: () => NOW,
      },
      send,
      now: () => NOW,
    })

    const result = await boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })

    expect(result).toMatchObject({
      transport: 'http',
      disposition: 'succeeded',
      releaseStarted: true,
      outputJson: JSON.stringify({ serviceReference: 'service:jit' }),
    })
    expect(callbackActive).toBe(true)
    expect(send).toHaveBeenCalledOnce()
    expect(durableJournal.begin).toHaveBeenCalledWith({
      ticketRef: canonicalTicket.ticketRef,
      effectRef: canonicalTicket.effectRef,
      requestDigest: canonicalTicket.requestDigest,
      invocationDigest: canonicalTicket.invocationDigest,
      ticketClaimsDigest: providerConsequenceTicketClaimsDigest(canonicalTicket),
      expiresAt: canonicalTicket.expiresAt,
      now: NOW,
    })
    expect(durableJournal.complete).toHaveBeenCalledWith({ claimRef: 'claim:test', observation: result })
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL)
  })

  it.each([
    ['blank opaque ticket', '', async () => ticket()],
    ['unverifiable ticket', 'opaque-ticket', async () => undefined],
    ['verifier outage', 'opaque-ticket', async () => { throw new Error('verification-outage') }],
  ])('fails closed before journal or provider I/O for %s', async (_case, opaque, verifyTicket) => {
    const durableJournal = journal()
    const send = vi.fn<RouteTransportFetch>()
    const { boundary, routeInvocation } = harness({
      verifyTicket,
      journal: durableJournal,
      send,
    })

    await expect(boundary.execute({ ticket: opaque, invocation: routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_ticket_invalid',
    })
    expect(durableJournal.begin).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ['expired ticket', (value: CanonicalProviderConsequenceTicket) => ({ ...value, expiresAt: NOW })],
    ['future-issued ticket', (value: CanonicalProviderConsequenceTicket) => ({ ...value, issuedAt: NOW + 1 })],
    ['request digest substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, requestDigest: canonicalDigest({ request: 'other' }) })],
    ['invocation digest substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, invocationDigest: canonicalDigest({ invocation: 'other' }) })],
    ['lease substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, leaseRef: 'lease:other' })],
    ['cross-account connection substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, canonicalConnectionRef: 'connection:other' })],
    ['authority generation substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, canonicalConnectionGeneration: 5 })],
    ['authority digest substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, authorityDigest: canonicalDigest({ authority: 'other' }) })],
    ['scope widening', (value: CanonicalProviderConsequenceTicket) => ({ ...value, grantedScopes: [...value.grantedScopes, 'admin:*'] })],
    ['resource widening', (value: CanonicalProviderConsequenceTicket) => ({ ...value, grantedResources: [...value.grantedResources, 'account:other'] })],
    ['readiness substitution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, readinessValidUntil: value.readinessValidUntil - 1 })],
    ['pointer generation malformed', (value: CanonicalProviderConsequenceTicket) => ({ ...value, secret: { ...value.secret, activeGeneration: 'provider-generation' } })],
    ['account attribution malformed', (value: CanonicalProviderConsequenceTicket) => ({ ...value, activeAccountRef: 'account:caller' })],
    ['unverified cross-account attribution', (value: CanonicalProviderConsequenceTicket) => ({ ...value, activeAccountRef: 'acc_22222222222222222222222222222222' })],
  ])('rejects hostile canonical-ticket mismatch: %s', async (_case, mutate) => {
    const routeInvocation = invocation()
    const durableJournal = journal()
    const send = vi.fn<RouteTransportFetch>()
    const { boundary } = harness({
      routeInvocation,
      verifiedTicket: mutate(ticket(routeInvocation)) as CanonicalProviderConsequenceTicket,
      journal: durableJournal,
      send,
    })

    await expect(boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_ticket_invalid',
    })
    expect(durableJournal.begin).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('does not disclose or send when a valid ticket is replayed against another connection', async () => {
    const original = invocation()
    const substituted = invocation()
    if (substituted.binding.authority.kind !== 'provider_connection') throw new Error('test_fixture_invalid')
    const crossAccountInvocation: RouteTransportInvocation = {
      ...substituted,
      binding: {
        ...substituted.binding,
        authority: { ...substituted.binding.authority, connectionRef: 'connection:other-account' },
      },
    }
    const send = vi.fn<RouteTransportFetch>()
    const { boundary } = harness({
      routeInvocation: crossAccountInvocation,
      verifiedTicket: ticket(original),
      send,
    })

    const result = await boundary.execute({ ticket: 'opaque-ticket', invocation: crossAccountInvocation })
    expect(result).toMatchObject({ disposition: 'refused', failureCode: 'provider_consequence_ticket_invalid' })
    expect(send).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('acc_11111111111111111111111111111111')
  })

  it('binds account and secret claims to the durable issued ticket before secret or provider I/O', async () => {
    const routeInvocation = invocation()
    const issued = ticket(routeInvocation)
    const substituted: CanonicalProviderConsequenceTicket = {
      ...issued,
      owningAccountRef: 'acc_22222222222222222222222222222222',
      activeAccountRef: 'acc_22222222222222222222222222222222',
      secret: {
        secretRef: secretRef('sec_22222222222222222222222222222222'),
        activeGeneration: secretGeneration('sgn_22222222222222222222222222222222'),
        pointerRevision: 9,
      },
    }
    expect(substituted.requestDigest).toBe(issued.requestDigest)
    expect(substituted.invocationDigest).toBe(issued.invocationDigest)
    expect(providerConsequenceTicketClaimsDigest(substituted)).not.toBe(
      providerConsequenceTicketClaimsDigest(issued),
    )
    const durableJournal: ProviderConsequenceJournal = {
      ...journal(),
      begin: vi.fn(async (input) => input.ticketClaimsDigest === providerConsequenceTicketClaimsDigest(issued)
        ? { kind: 'claimed', claimRef: 'claim:test' }
        : { kind: 'unavailable' }),
    }
    const active = harness({
      routeInvocation,
      verifiedTicket: substituted,
      journal: durableJournal,
    })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_ticket_unavailable',
    })
    expect(getVercelOidcToken).not.toHaveBeenCalled()
    expect(active.send).not.toHaveBeenCalled()
  })

  it('binds call identity and monetary authority even though the legacy request digest omits them', async () => {
    const original = invocation()
    const altered: RouteTransportInvocation = {
      ...original,
      authority: {
        ...original.authority,
        maximumSpend: { currency: 'USD', units: '999999', exponent: 2 },
        callIdentity: { keyId: 'attacker-key', signature: 'hmac-sha256:attacker' },
      },
    }
    expect(requestDigest(altered)).toBe(requestDigest(original))
    expect(providerConsequenceInvocationDigest(altered)).not.toBe(providerConsequenceInvocationDigest(original))
    const active = harness({ routeInvocation: altered, verifiedTicket: ticket(original) })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: altered })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_ticket_invalid',
    })
    expect(active.send).not.toHaveBeenCalled()
  })

  it('digests only fully materialized provider consequences and canonicalizes absent optional fields', () => {
    const provider = invocation()
    const keyless: RouteTransportInvocation = {
      ...provider,
      binding: { ...provider.binding, authority: { kind: 'public_upstream' } },
      authority: {
        attemptRef: provider.authority.attemptRef,
        operationKeyDigest: provider.authority.operationKeyDigest,
        mandateDigest: provider.authority.mandateDigest,
        grantDigest: provider.authority.grantDigest,
        capabilityContractDigest: provider.authority.capabilityContractDigest,
        maximumSpend: provider.authority.maximumSpend,
        expiresAt: provider.authority.expiresAt,
        callIdentity: provider.authority.callIdentity,
      },
    }
    expect(providerConsequenceInvocationDigest(keyless)).toBeUndefined()

    const missingAuthority = { ...provider.authority }
    Reflect.deleteProperty(missingAuthority, 'readinessValidUntil')
    expect(providerConsequenceInvocationDigest({ ...provider, authority: missingAuthority })).toBeUndefined()

    const optionalAbsent = { ...provider.authority }
    Reflect.deleteProperty(optionalAbsent, 'effectGeneration')
    Reflect.deleteProperty(optionalAbsent, 'readinessDigest')
    expect(providerConsequenceInvocationDigest({ ...provider, authority: optionalAbsent })).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it.each([
    ['unavailable', { kind: 'unavailable' as const }, 'refused', false, 'provider_consequence_ticket_unavailable'],
    ['started', { kind: 'started' as const }, 'unknown', true, 'provider_consequence_started'],
  ])('honors durable single-use journal state %s without a duplicate send', async (
    _case,
    beginResult,
    disposition,
    releaseStarted,
    failureCode,
  ) => {
    const durableJournal: ProviderConsequenceJournal = {
      ...journal(),
      begin: vi.fn(async () => beginResult as ProviderConsequenceJournalBeginResult),
    }
    const send = vi.fn<RouteTransportFetch>()
    const { boundary, routeInvocation } = harness({ journal: durableJournal, send })
    const result = await boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })
    expect(result).toMatchObject({ disposition, releaseStarted, failureCode })
    expect(send).not.toHaveBeenCalled()
  })

  it('returns the exact sanitized completed replay without reacquiring material or sending', async () => {
    const routeInvocation = invocation()
    const replay = {
      transport: 'http' as const,
      disposition: 'succeeded' as const,
      releaseStarted: true,
      requestDigest: requestDigest(routeInvocation),
      outputJson: JSON.stringify({ serviceReference: 'service:replayed' }),
    }
    const durableJournal: ProviderConsequenceJournal = {
      ...journal(),
      begin: vi.fn(async () => ({ kind: 'completed' as const, observation: replay })),
    }
    const send = vi.fn<RouteTransportFetch>()
    const { boundary } = harness({ routeInvocation, journal: durableJournal, send })
    await expect(boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toEqual(replay)
    expect(getVercelOidcToken).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('turns an invalid completed replay or journal outage into a fixed fail-closed outcome', async () => {
    const routeInvocation = invocation()
    const invalidReplayJournal: ProviderConsequenceJournal = {
      ...journal(),
      begin: vi.fn(async () => ({
        kind: 'completed' as const,
        observation: {
          transport: 'http' as const,
          disposition: 'succeeded' as const,
          releaseStarted: true,
          requestDigest: canonicalDigest({ request: 'other' }),
        },
      })),
    }
    const invalidReplay = harness({ routeInvocation, journal: invalidReplayJournal })
    await expect(invalidReplay.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toMatchObject({
      disposition: 'unknown',
      failureCode: 'provider_consequence_replay_invalid',
    })

    const outageJournal: ProviderConsequenceJournal = {
      ...journal(),
      begin: vi.fn(async () => { throw new Error('journal-outage') }),
    }
    const outage = harness({ routeInvocation, journal: outageJournal })
    await expect(outage.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_journal_unavailable',
    })
  })

  it.each([
    ['non-object result', null],
    ['missing result kind', {}],
    ['unrecognized kind', { kind: 'other' }],
    ['claimed without a canonical claim ref', { kind: 'claimed', claimRef: ' claim:test ' }],
    ['started with caller-shaped fields', { kind: 'started', claimRef: 'claim:test' }],
    ['unavailable with caller-shaped fields', { kind: 'unavailable', retry: true }],
    ['completed without a canonical observation', {
      kind: 'completed',
      observation: { transport: 'http', disposition: 'succeeded', releaseStarted: 'yes' },
    }],
  ])('rejects malformed remote journal result before secret or provider I/O: %s', async (_case, remoteResult) => {
    const durableJournal: ProviderConsequenceJournal = {
      ...journal(),
      begin: vi.fn(async () => remoteResult),
    }
    const active = harness({ journal: durableJournal })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: active.routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_journal_invalid',
    })
    expect(getVercelOidcToken).not.toHaveBeenCalled()
    expect(active.send).not.toHaveBeenCalled()
    expect(durableJournal.complete).not.toHaveBeenCalled()
    expect(durableJournal.abortBeforeRelease).not.toHaveBeenCalled()
  })

  it('rejects a non-serializable completed journal observation before secret or provider I/O', async () => {
    const observation: Record<string, unknown> = { kind: 'completed' }
    observation.observation = observation
    const durableJournal: ProviderConsequenceJournal = {
      ...journal(),
      begin: vi.fn(async () => observation),
    }
    const active = harness({ journal: durableJournal })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: active.routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      failureCode: 'provider_consequence_journal_invalid',
    })
    expect(active.send).not.toHaveBeenCalled()
  })

  it('fails closed before provider I/O on exact stale pointer, identity, and vault outages', async () => {
    const stale = harness({
      pointer: Object.freeze({
        secretRef: REF,
        activeGeneration: secretGeneration('sgn_22222222222222222222222222222222'),
        revision: 8,
      }),
    })
    await expect(stale.boundary.execute({ ticket: 'opaque-ticket', invocation: stale.routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_secret_unavailable',
    })
    expect(stale.send).not.toHaveBeenCalled()
    expect(stale.durableJournal.abortBeforeRelease).toHaveBeenCalledOnce()

    getVercelOidcToken.mockRejectedValueOnce(new Error(`identity-${CREDENTIAL}`))
    const identity = harness()
    await expect(identity.boundary.execute({ ticket: 'opaque-ticket', invocation: identity.routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_secret_unavailable',
    })
    expect(identity.send).not.toHaveBeenCalled()

    const vault = harness({ vaultFetch: vi.fn(async () => { throw new Error(`vault-${CREDENTIAL}`) }) as typeof fetch })
    const vaultResult = await vault.boundary.execute({ ticket: 'opaque-ticket', invocation: vault.routeInvocation })
    expect(vaultResult).toMatchObject({ disposition: 'refused', failureCode: 'provider_consequence_secret_unavailable' })
    expect(JSON.stringify(vaultResult)).not.toContain(CREDENTIAL)
    expect(vault.send).not.toHaveBeenCalled()
  })

  it('records started transport failures as unknown and never performs a duplicate send', async () => {
    const durableJournal = journal()
    const send = vi.fn<RouteTransportFetch>(async () => { throw new Error(`network-${CREDENTIAL}`) })
    const active = harness({ journal: durableJournal, send })
    const first = await active.boundary.execute({ ticket: 'opaque-ticket', invocation: active.routeInvocation })
    expect(first).toMatchObject({ disposition: 'unknown', releaseStarted: true })
    expect(send).toHaveBeenCalledOnce()
    expect(durableJournal.complete).toHaveBeenCalledOnce()
    expect(JSON.stringify(first)).not.toContain(CREDENTIAL)

    const startedJournal: ProviderConsequenceJournal = {
      ...journal(),
      begin: vi.fn(async () => ({ kind: 'started' as const })),
    }
    const replay = harness({ journal: startedJournal, send })
    await expect(replay.boundary.execute({ ticket: 'opaque-ticket', invocation: replay.routeInvocation })).resolves.toMatchObject({
      disposition: 'unknown',
      failureCode: 'provider_consequence_started',
    })
    expect(send).toHaveBeenCalledOnce()
  })

  it('returns reconciliation-required unknown when the completion acknowledgement is unavailable', async () => {
    const durableJournal: ProviderConsequenceJournal = {
      ...journal(),
      complete: vi.fn(async () => { throw new Error('completion-outage') }),
    }
    const active = harness({ journal: durableJournal })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: active.routeInvocation })).resolves.toMatchObject({
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'provider_consequence_completion_unknown',
    })
    expect(active.send).toHaveBeenCalledOnce()
  })

  it('returns route preparation refusal before ticket verification', async () => {
    const malformed = invocation()
    const verifyTicket = vi.fn<ProviderConsequenceTicketVerifier>()
    const { boundary } = harness({
      routeInvocation: {
        ...malformed,
        binding: { ...malformed.binding, configDigest: canonicalDigest({ config: 'wrong' }) },
      },
      verifyTicket,
    })
    const result = await boundary.execute({ ticket: 'opaque-ticket', invocation: {
      ...malformed,
      binding: { ...malformed.binding, configDigest: canonicalDigest({ config: 'wrong' }) },
    } })
    expect(result).toMatchObject({ disposition: 'refused', failureCode: 'adapter_config_invalid' })
    expect(verifyTicket).not.toHaveBeenCalled()
  })

  it('requires a provider lease authority with every consequence binding field materialized', async () => {
    const routeInvocation = invocation()
    const missing = [
      'invocationRef',
      'operationRef',
      'leaseRef',
      'grantedScopes',
      'grantedResources',
      'readinessValidUntil',
    ] as const
    for (const field of missing) {
      const authority = { ...routeInvocation.authority }
      Reflect.deleteProperty(authority, field)
      const malformed: RouteTransportInvocation = { ...routeInvocation, authority }
      const active = harness({ routeInvocation: malformed })
      const result = await active.boundary.execute({ ticket: 'opaque-ticket', invocation: malformed })
      expect(result).toMatchObject({ disposition: 'refused', failureCode: 'provider_consequence_ticket_invalid' })
      expect(active.send).not.toHaveBeenCalled()
    }
  })

  it('refuses keyless invocations and uses the real wall clock when no test clock is supplied', async () => {
    const provider = invocation()
    const keyless: RouteTransportInvocation = {
      ...provider,
      binding: {
        ...provider.binding,
        authority: { kind: 'public_upstream' },
      },
      authority: {
        attemptRef: provider.authority.attemptRef,
        ...(provider.authority.effectGeneration === undefined
          ? {}
          : { effectGeneration: provider.authority.effectGeneration }),
        operationKeyDigest: provider.authority.operationKeyDigest,
        mandateDigest: provider.authority.mandateDigest,
        grantDigest: provider.authority.grantDigest,
        capabilityContractDigest: provider.authority.capabilityContractDigest,
        maximumSpend: provider.authority.maximumSpend,
        expiresAt: Date.now() + 30_000,
        callIdentity: provider.authority.callIdentity,
      },
    }
    const verifyTicket = vi.fn(async () => ticket())
    const durableJournal = journal()
    const send = vi.fn<RouteTransportFetch>()
    const boundary = createJitProviderConsequenceBoundary({
      verifyTicket,
      journal: durableJournal,
      secretRuntime: secretRuntimeOptions(
        Object.freeze({ secretRef: REF, activeGeneration: GENERATION, revision: 7 }),
        vaultFetch(),
      ),
      send,
    })
    const result = await boundary.execute({ ticket: 'opaque-ticket', invocation: keyless })
    expect(result).toMatchObject({ disposition: 'refused', failureCode: 'provider_consequence_ticket_invalid' })
    expect(send).not.toHaveBeenCalled()
  })

  it('does not send when the fetched secret material is blank', async () => {
    const active = harness({ vaultFetch: vaultFetch('   ') })
    const result = await active.boundary.execute({ ticket: 'opaque-ticket', invocation: active.routeInvocation })
    expect(result).toMatchObject({ disposition: 'refused', releaseStarted: false, failureCode: 'credential_unavailable' })
    expect(active.send).not.toHaveBeenCalled()
    expect(active.durableJournal.complete).toHaveBeenCalledOnce()

    const empty = harness({ vaultFetch: vaultFetch('') })
    await expect(empty.boundary.execute({ ticket: 'opaque-ticket', invocation: empty.routeInvocation }))
      .resolves.toMatchObject({ disposition: 'refused', failureCode: 'credential_unavailable' })
    expect(empty.send).not.toHaveBeenCalled()
  })

  it('refuses x402 support when the callback-scoped custody and reconciliation factory is absent', async () => {
    const routeInvocation = x402Invocation()
    const active = harness({ routeInvocation, verifiedTicket: ticket(routeInvocation) })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toMatchObject({
      transport: 'x402',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_custody_unavailable',
    })
    expect(active.send).not.toHaveBeenCalled()
  })

  it('rejects missing, malformed, or provider-secret-reused x402 payment pointers before journal or provider I/O', async () => {
    const routeInvocation = x402Invocation()
    const canonical = ticket(routeInvocation)
    for (const paymentSecret of [
      undefined,
      { ...canonical.paymentSecret!, secretRef: canonical.secret.secretRef },
      { ...canonical.paymentSecret!, pointerRevision: 0 },
      { ...canonical.paymentSecret!, activeGeneration: 'caller-generation' },
    ]) {
      const verifiedTicket = {
        ...canonical,
        ...(paymentSecret === undefined ? {} : { paymentSecret }),
      }
      if (paymentSecret === undefined) Reflect.deleteProperty(verifiedTicket, 'paymentSecret')
      const active = harness({ routeInvocation, verifiedTicket })
      await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation }))
        .resolves.toMatchObject({
          transport: 'x402',
          disposition: 'refused',
          releaseStarted: false,
          failureCode: 'provider_consequence_ticket_invalid',
        })
      expect(active.durableJournal.begin).not.toHaveBeenCalled()
      expect(active.send).not.toHaveBeenCalled()
    }
  })

  it('rejects a caller-injected payment pointer on a non-payment provider ticket', async () => {
    const routeInvocation = invocation()
    const canonical = ticket(routeInvocation)
    const active = harness({
      routeInvocation,
      verifiedTicket: {
        ...canonical,
        paymentSecret: {
          secretRef: PAYMENT_REF,
          activeGeneration: PAYMENT_GENERATION,
          pointerRevision: 8,
        },
      },
    })

    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation }))
      .resolves.toMatchObject({
        transport: 'http',
        disposition: 'refused',
        releaseStarted: false,
        failureCode: 'provider_consequence_ticket_invalid',
      })
    expect(active.durableJournal.begin).not.toHaveBeenCalled()
    expect(active.send).not.toHaveBeenCalled()
  })

  it('runs the existing x402 custody, submission marker, and reconciliation ports inside the JIT callback without retry', async () => {
    const routeInvocation = x402Invocation()
    const challenge = x402Challenge()
    const prepareX402PaymentAuthorization = vi.fn(async () => ({
      custodyRef: 'sha256:customer-custody-reference',
      authorizationDigest: canonicalDigest({ authorization: 'signed-payment' }),
    }))
    const readX402PaymentAuthorization = vi.fn(async () => 'signed-payment')
    const readX402PaymentAuthorizationByDigest = vi.fn(async () => 'signed-payment')
    const markX402PaymentPossiblySubmitted = vi.fn(async () => undefined)
    const observeX402PaymentAttempt = vi.fn(async () => undefined)
    const createCallbackScopedX402Runtime = vi.fn<JitProviderX402RuntimeFactory>(async () => ({
      readX402PaymentCredentialRef: async () => X402_PAYMENT_CREDENTIAL_REF,
      validateProviderConnectionAuthority: async () => ({ kind: 'valid' as const }),
      x402PaymentSigningAvailable: () => true,
      verifyX402Settlement: async () => true,
      prepareX402PaymentAuthorization,
      readX402PaymentAuthorization,
      readX402PaymentAuthorizationByDigest,
      beforeX402PaymentAuthorizationRead: async () => true,
      markX402PaymentPossiblySubmitted,
      observeX402PaymentAttempt,
    }))
    const send = vi.fn<RouteTransportFetch>(async () => new Response(null, {
      status: 402,
      headers: { 'Payment-Required': encodePaymentRequiredHeader(challenge) },
    }))
    const durableJournal = journal()
    const active = harness({
      routeInvocation,
      verifiedTicket: ticket(routeInvocation),
      createCallbackScopedX402Runtime,
      journal: durableJournal,
      send,
    })

    const result = await active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })

    expect(result).toMatchObject({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'payment_required_after_submission',
      paymentAuthorizationStatus: 'created',
      paymentSubmissionStatus: 'observed',
      settlementEvidence: { kind: 'unknown', reason: 'payment_required_after_submission' },
    })
    expect(createCallbackScopedX402Runtime).toHaveBeenCalledWith({
      ticket: ticket(routeInvocation),
      invocation: routeInvocation,
    })
    expect(prepareX402PaymentAuthorization).toHaveBeenCalledOnce()
    expect(readX402PaymentAuthorization).toHaveBeenCalledOnce()
    expect(readX402PaymentAuthorizationByDigest).not.toHaveBeenCalled()
    expect(markX402PaymentPossiblySubmitted).toHaveBeenCalledOnce()
    expect(observeX402PaymentAttempt).toHaveBeenCalledWith(expect.objectContaining({
      state: 'reconciliation_required',
    }))
    expect(send).toHaveBeenCalledOnce()
    expect(durableJournal.complete).toHaveBeenCalledWith({ claimRef: 'claim:test', observation: result })
    expect(JSON.stringify(result)).not.toContain('signed-payment')
  })

  it('quarantines an x402 provider observation that echoes encoded leased secret material', async () => {
    const routeInvocation = x402Invocation()
    const createCallbackScopedX402Runtime = vi.fn<JitProviderX402RuntimeFactory>(async () => ({
      readX402PaymentCredentialRef: async () => X402_PAYMENT_CREDENTIAL_REF,
      validateProviderConnectionAuthority: async () => ({ kind: 'valid' as const }),
      x402PaymentSigningAvailable: () => true,
      verifyX402Settlement: async () => true,
      prepareX402PaymentAuthorization: async () => ({
        custodyRef: 'sha256:customer-custody-reference',
        authorizationDigest: canonicalDigest({ authorization: 'signed-payment' }),
      }),
      readX402PaymentAuthorization: async () => 'signed-payment',
      readX402PaymentAuthorizationByDigest: async () => 'signed-payment',
      beforeX402PaymentAuthorizationRead: async () => true,
      markX402PaymentPossiblySubmitted: async () => undefined,
      observeX402PaymentAttempt: async () => undefined,
    }))
    const send = vi.fn<RouteTransportFetch>(async () => Response.json({
      serviceReference: Buffer.from(CREDENTIAL).toString('base64'),
    }, {
      headers: {
        'Payment-Response': encodePaymentResponseHeader({
          success: true,
          transaction: '0xsettled',
          network: 'eip155:84532',
          amount: '1250000',
          payer: 'test:settled-payer',
        }),
      },
    }))
    const durableJournal = journal()
    const active = harness({
      routeInvocation,
      verifiedTicket: ticket(routeInvocation),
      createCallbackScopedX402Runtime,
      journal: durableJournal,
      send,
    })

    const result = await active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })

    expect(result).toEqual({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      requestDigest: requestDigest(routeInvocation),
      failureCode: 'provider_consequence_secret_echo',
    })
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL)
    expect(JSON.stringify(result)).not.toContain(Buffer.from(CREDENTIAL).toString('base64'))
    expect(durableJournal.complete).toHaveBeenCalledWith({ claimRef: 'claim:test', observation: result })
  })

  it('does not advertise x402 execution when the callback-scoped signer reports unavailable', async () => {
    const routeInvocation = x402Invocation()
    const active = harness({
      routeInvocation,
      verifiedTicket: ticket(routeInvocation),
      createCallbackScopedX402Runtime: async () => callbackScopedX402Runtime({
        x402PaymentSigningAvailable: () => false,
      }),
    })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toMatchObject({
      transport: 'x402',
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_signature_unavailable',
    })
    expect(active.send).not.toHaveBeenCalled()
  })

  it('leaves a post-release x402 exception started and unknown without making the ticket retryable', async () => {
    const routeInvocation = x402Invocation()
    const challenge = x402Challenge()
    const durableJournal = journal()
    const send = vi.fn<RouteTransportFetch>(async () => new Response(null, {
      status: 402,
      headers: { 'Payment-Required': encodePaymentRequiredHeader(challenge) },
    }))
    const active = harness({
      routeInvocation,
      verifiedTicket: ticket(routeInvocation),
      journal: durableJournal,
      send,
      createCallbackScopedX402Runtime: async () => callbackScopedX402Runtime({
        observeX402PaymentAttempt: async () => { throw new Error('reconciliation-port-outage') },
      }),
    })

    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toMatchObject({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'provider_consequence_release_unknown',
    })
    expect(send).toHaveBeenCalledOnce()
    expect(durableJournal.abortBeforeRelease).not.toHaveBeenCalled()
    expect(durableJournal.complete).not.toHaveBeenCalled()
  })

  it('aborts a claimed ticket when the trusted transport refuses before external release', async () => {
    const durableJournal = journal()
    const send = vi.fn<RouteTransportFetch>(async () => {
      throw new ProviderConsequencePreReleaseRefusal()
    })
    const active = harness({ journal: durableJournal, send })

    await expect(active.boundary.execute({
      ticket: 'opaque-ticket',
      invocation: active.routeInvocation,
    })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_target_refused',
    })
    expect(send).toHaveBeenCalledOnce()
    expect(durableJournal.abortBeforeRelease).toHaveBeenCalledWith({ claimRef: 'claim:test' })
    expect(durableJournal.complete).not.toHaveBeenCalled()
  })

  it('does not abort or retry when expiry is detected after x402 authorization and submission fencing', async () => {
    const routeInvocation = x402Invocation()
    const durableJournal = journal()
    const markX402PaymentPossiblySubmitted = vi.fn(async () => undefined)
    const clock = vi.fn()
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValue(NOW + 10_000)
    const active = harness({
      routeInvocation,
      verifiedTicket: ticket(routeInvocation),
      journal: durableJournal,
      boundaryNow: clock,
      createCallbackScopedX402Runtime: async () => callbackScopedX402Runtime({
        markX402PaymentPossiblySubmitted,
      }),
    })

    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toMatchObject({
      transport: 'x402',
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'provider_consequence_release_unknown',
    })
    expect(markX402PaymentPossiblySubmitted).toHaveBeenCalledOnce()
    expect(active.send).not.toHaveBeenCalled()
    expect(durableJournal.abortBeforeRelease).not.toHaveBeenCalled()
    expect(durableJournal.complete).not.toHaveBeenCalled()
  })

  it('fails closed when the callback-scoped x402 runtime factory is unavailable', async () => {
    const routeInvocation = x402Invocation()
    const active = harness({
      routeInvocation,
      verifiedTicket: ticket(routeInvocation),
      createCallbackScopedX402Runtime: async () => { throw new Error('x402-runtime-factory-outage') },
    })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_custody_unavailable',
    })
    expect(active.send).not.toHaveBeenCalled()
  })

  it.each([
    ['non-object runtime', null],
    ['missing required custody port', {}],
    ['runtime attempting to replace the provider send port', {
      ...callbackScopedX402Runtime(),
      send: async () => Response.json({ attacker: true }),
    }],
    ['invalid optional submission fence', {
      readX402PaymentCredentialRef: async () => X402_PAYMENT_CREDENTIAL_REF,
      validateProviderConnectionAuthority: async () => ({ kind: 'valid' as const }),
      x402PaymentSigningAvailable: () => true,
      verifyX402Settlement: async () => true,
      prepareX402PaymentAuthorization: async () => undefined,
      readX402PaymentAuthorization: async () => undefined,
      readX402PaymentAuthorizationByDigest: async () => undefined,
      beforeX402PaymentAuthorizationRead: true,
      markX402PaymentPossiblySubmitted: async () => undefined,
      observeX402PaymentAttempt: async () => undefined,
    }],
  ])('fails closed for malformed callback-scoped x402 runtime: %s', async (_case, runtime) => {
    const routeInvocation = x402Invocation()
    const createCallbackScopedX402Runtime = (async () => runtime) as unknown as JitProviderX402RuntimeFactory
    const active = harness({
      routeInvocation,
      verifiedTicket: ticket(routeInvocation),
      createCallbackScopedX402Runtime,
    })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'payment_custody_unavailable',
    })
    expect(active.send).not.toHaveBeenCalled()
  })

  it('rechecks ticket expiry immediately before the underlying provider call', async () => {
    const clock = vi.fn()
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(NOW)
      .mockReturnValue(NOW + 10_000)
    const active = harness({ boundaryNow: clock })
    const result = await active.boundary.execute({ ticket: 'opaque-ticket', invocation: active.routeInvocation })
    expect(result).toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_expired',
    })
    expect(active.send).not.toHaveBeenCalled()
    expect(active.durableJournal.abortBeforeRelease).toHaveBeenCalledOnce()
    expect(active.durableJournal.complete).not.toHaveBeenCalled()
  })

  it('persists the registered transport unknown result when response handling fails after provider I/O begins', async () => {
    const durableJournal = journal()
    const response = Response.json({ serviceReference: 'service:unreadable' })
    Object.defineProperty(response, 'headers', {
      get: () => { throw new Error('response-headers-unavailable') },
    })
    const send = vi.fn<RouteTransportFetch>(async () => response)
    const active = harness({ journal: durableJournal, send })
    const result = await active.boundary.execute({ ticket: 'opaque-ticket', invocation: active.routeInvocation })
    expect(result).toMatchObject({
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'network_error',
    })
    expect(durableJournal.complete).toHaveBeenCalledWith({ claimRef: 'claim:test', observation: result })
  })

  it.each([
    ['raw', CREDENTIAL, 'response_output_invalid'],
    ['base64', Buffer.from(CREDENTIAL).toString('base64'), 'provider_consequence_secret_echo'],
  ])('quarantines an HTTP provider observation that echoes the %s leased secret', async (_label, echoed, failureCode) => {
    const durableJournal = journal()
    const active = harness({
      journal: durableJournal,
      send: vi.fn(async () => Response.json({ serviceReference: echoed })),
    })

    const result = await active.boundary.execute({
      ticket: 'opaque-ticket',
      invocation: active.routeInvocation,
    })

    expect(result).toEqual({
      transport: 'http',
      disposition: 'unknown',
      releaseStarted: true,
      requestDigest: requestDigest(active.routeInvocation),
      failureCode,
    })
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL)
    expect(JSON.stringify(result)).not.toContain(Buffer.from(CREDENTIAL).toString('base64'))
    expect(durableJournal.complete).toHaveBeenCalledWith({
      claimRef: 'claim:test',
      observation: result,
    })
  })

  it('keeps observed transport failures unknown when the journal cannot acknowledge completion', async () => {
    const durableJournal: ProviderConsequenceJournal = {
      ...journal(),
      complete: vi.fn(async () => { throw new Error('journal-completion-outage') }),
    }
    const response = Response.json({ serviceReference: 'service:unreadable' })
    Object.defineProperty(response, 'headers', {
      get: () => { throw new Error('response-headers-unavailable') },
    })
    const active = harness({ journal: durableJournal, send: vi.fn(async () => response) })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: active.routeInvocation })).resolves.toMatchObject({
      disposition: 'unknown',
      releaseStarted: true,
      failureCode: 'provider_consequence_completion_unknown',
    })
  })

  it('remains fail closed when abort-before-release cannot be acknowledged', async () => {
    getVercelOidcToken.mockRejectedValueOnce(new Error('identity-outage'))
    const durableJournal: ProviderConsequenceJournal = {
      ...journal(),
      abortBeforeRelease: vi.fn(async () => { throw new Error('abort-outage') }),
    }
    const active = harness({ journal: durableJournal })
    await expect(active.boundary.execute({ ticket: 'opaque-ticket', invocation: active.routeInvocation })).resolves.toMatchObject({
      disposition: 'refused',
      releaseStarted: false,
      failureCode: 'provider_consequence_secret_unavailable',
    })
  })
})
