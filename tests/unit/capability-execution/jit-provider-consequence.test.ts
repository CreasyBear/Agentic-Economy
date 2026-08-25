import { beforeEach, describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import {
  createJitProviderConsequenceBoundary,
  providerConsequenceInvocationDigest,
  type CanonicalProviderConsequenceTicket,
  type ProviderConsequenceJournal,
  type ProviderConsequenceJournalBeginResult,
  type ProviderConsequenceTicketVerifier,
} from '@/modules/capability-execution/invocation-worker/jitProviderConsequence'
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
const CREDENTIAL = 'provider-secret-never-return'

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
    canonicalConnectionRef: routeInvocation.binding.authority.connectionRef,
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
  })
  return { boundary, durableJournal, routeInvocation, send }
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
      binding: { ...provider.binding, authority: { kind: 'keyless' } },
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
        authority: { kind: 'keyless' },
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
