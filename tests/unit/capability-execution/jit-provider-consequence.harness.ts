import { expect, vi } from 'vitest'
import { encodePaymentRequiredHeader } from '@x402/core/http'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import {
  createJitProviderConsequenceBoundary,
  providerConsequenceInvocationDigest,
  providerConsequenceTicketClaimsDigest,
  type CanonicalProviderConsequenceTicket,
  type JitProviderConsequenceBoundary,
  type JitProviderX402Runtime,
  type JitProviderX402RuntimeFactory,
  type ProviderConsequenceJournal,
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
import {
  createTestProviderInvocation,
  type ProviderInvocation as ProviderRouteTransportInvocation,
} from '../../helpers/route-transport-fixtures'

// Capture one real wall-clock instant for the module. The x402 transport
// deliberately checks requirement lifetime against Date.now(), so a fixed
// future epoch turns this suite into a date-dependent time bomb.
export const NOW = Math.floor(Date.now() / 1_000) * 1_000
export const REF = secretRef('sec_11111111111111111111111111111111')
const GENERATION = secretGeneration('sgn_11111111111111111111111111111111')
export const PAYMENT_REF = secretRef('sec_22222222222222222222222222222222')
export const PAYMENT_GENERATION = secretGeneration('sgn_22222222222222222222222222222222')
export const CREDENTIAL = 'provider-secret-never-return'
export const OPAQUE_TICKET = 'opaque-ticket'
export const CLAIM_REF = 'claim:test'
export const X402_PAYMENT_CREDENTIAL_REF = 'env:AE_X402_PAYMENT_PRIVATE_KEY'

const JIT_PROVIDER_INVOCATION = {
  connectionRef: 'connection:test-provider',
  attemptRef: 'operation-attempt:invocation:test:1',
  now: NOW,
}

export function x402Challenge() {
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

export function x402Invocation(): ProviderRouteTransportInvocation {
  const base = createTestProviderInvocation(JIT_PROVIDER_INVOCATION)
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

export function jitInvocation() {
  return createTestProviderInvocation(JIT_PROVIDER_INVOCATION)
}

export function requestDigest(routeInvocation: RouteTransportInvocation): string {
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

export function ticket(routeInvocation: any = jitInvocation()): CanonicalProviderConsequenceTicket {
  const authority = routeInvocation.authority
  const {
    callRef,
    toolRef,
    leaseRef,
    grantedScopes,
    grantedResources,
    readinessValidUntil,
    readinessDigest,
  } = authority
  if (callRef === undefined
    || toolRef === undefined
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
    callRef,
    toolRef,
    leaseRef,
    connectionRef: routeInvocation.binding.authority.connectionRef,
    authorityGeneration: authority.authorityGeneration,
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

export function vaultFetch(secretValue = CREDENTIAL): typeof fetch {
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

export function jwt(): string {
  const seconds = NOW / 1_000
  return [
    Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'key-1' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iat: seconds - 60, nbf: seconds - 60, exp: seconds + 3_540 })).toString('base64url'),
    Buffer.from('signature').toString('base64url'),
  ].join('.')
}

export function journal(): ProviderConsequenceJournal {
  return {
    begin: vi.fn(async () => ({ kind: 'claimed' as const, claimRef: CLAIM_REF })),
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

export type HarnessOverrides = Readonly<{
  routeInvocation?: RouteTransportInvocation
  verifiedTicket?: CanonicalProviderConsequenceTicket
  verifyTicket?: ProviderConsequenceTicketVerifier
  journal?: ProviderConsequenceJournal
  pointer?: SecretPointer
  vaultFetch?: typeof fetch
  send?: RouteTransportFetch
  now?: number
  boundaryNow?: () => number
  omitTestClock?: boolean
  createCallbackScopedX402Runtime?: JitProviderX402RuntimeFactory
}>

export type ActiveHarness = ReturnType<typeof harness>

function defaultPointer(): SecretPointer {
  return Object.freeze({ secretRef: REF, activeGeneration: GENERATION, revision: 7 })
}

export function harness(overrides: HarnessOverrides = {}) {
  const routeInvocation = overrides.routeInvocation ?? jitInvocation()
  const verifiedTicket = overrides.verifiedTicket ?? ticket()
  const durableJournal = overrides.journal ?? journal()
  const pointer = overrides.pointer ?? defaultPointer()
  const send = overrides.send ?? vi.fn<RouteTransportFetch>(async () =>
    Response.json({ serviceReference: 'service:jit' }))
  const fetchImpl = overrides.vaultFetch ?? vaultFetch()
  const secretRuntime = overrides.omitTestClock
    ? {
        configuration: { platform: vault('platform'), customer: vault('customer') },
        platform: { pointerStore: pointerStore(pointer), generationProbe: { validate: async () => undefined } },
        customer: { pointerStore: pointerStore(pointer), generationProbe: { validate: async () => undefined } },
        fetch: fetchImpl,
      }
    : secretRuntimeOptions(pointer, fetchImpl, () => overrides.now ?? NOW)
  const boundary = createJitProviderConsequenceBoundary({
    verifyTicket: overrides.verifyTicket ?? (async (opaque) =>
      opaque === OPAQUE_TICKET ? verifiedTicket : undefined),
    journal: durableJournal,
    secretRuntime,
    send,
    ...(overrides.omitTestClock
      ? {}
      : { now: overrides.boundaryNow ?? (() => overrides.now ?? NOW) }),
    ...(overrides.createCallbackScopedX402Runtime === undefined
      ? {}
      : { createCallbackScopedX402Runtime: overrides.createCallbackScopedX402Runtime }),
  })
  return { boundary, durableJournal, routeInvocation, send }
}

export type TestBoundaryTarget = {
  boundary: JitProviderConsequenceBoundary
  durableJournal?: ProviderConsequenceJournal
  send?: RouteTransportFetch
  routeInvocation?: RouteTransportInvocation
}

export function execute(
  active: TestBoundaryTarget,
  ticket: string = OPAQUE_TICKET,
  invocation?: RouteTransportInvocation,
) {
  return active.boundary.execute({
    ticket,
    invocation: (invocation ?? active.routeInvocation ?? jitInvocation()) as any,
  })
}

export async function expectExecute(
  active: TestBoundaryTarget,
  expected: Record<string, unknown>,
  ticket: string = OPAQUE_TICKET,
  invocation?: RouteTransportInvocation,
) {
  await expect(execute(active, ticket, invocation)).resolves.toMatchObject(expected)
}

function expectJournalNeverBegan(active: TestBoundaryTarget) {
  if (active.durableJournal) {
    expect(active.durableJournal.begin).not.toHaveBeenCalled()
  }
}

export function expectNoSend(active: TestBoundaryTarget) {
  if (active.send) {
    expect(active.send).not.toHaveBeenCalled()
  }
}

export function expectNoJournalBeginOrSend(active: TestBoundaryTarget) {
  expectJournalNeverBegan(active)
  expectNoSend(active)
}

export function expectJsonExcludesCredential(value: unknown) {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain(CREDENTIAL)
  expect(serialized).not.toContain(Buffer.from(CREDENTIAL).toString('base64'))
}

export function journalWithBegin(
  begin: (...args: any[]) => Promise<any>,
): ProviderConsequenceJournal {
  return { ...journal(), begin: vi.fn(begin) as any }
}

export function journalWithPatches(patch: Partial<ProviderConsequenceJournal>): ProviderConsequenceJournal {
  const base = journal()
  const next: ProviderConsequenceJournal = { ...base, ...patch }
  if (patch.begin !== undefined && patch.begin !== base.begin) {
    next.begin = vi.isMockFunction(patch.begin) ? patch.begin : vi.fn(patch.begin)
  }
  if (patch.complete !== undefined && patch.complete !== base.complete) {
    next.complete = vi.isMockFunction(patch.complete) ? patch.complete : vi.fn(patch.complete)
  }
  if (patch.abortBeforeRelease !== undefined && patch.abortBeforeRelease !== base.abortBeforeRelease) {
    next.abortBeforeRelease = vi.isMockFunction(patch.abortBeforeRelease)
      ? patch.abortBeforeRelease
      : vi.fn(patch.abortBeforeRelease)
  }
  return next
}

export function expectJournalBeginForTicket(
  durableJournal: ProviderConsequenceJournal,
  canonicalTicket: CanonicalProviderConsequenceTicket,
  now: number = NOW,
) {
  expect(durableJournal.begin).toHaveBeenCalledWith({
    ticketRef: canonicalTicket.ticketRef,
    effectRef: canonicalTicket.effectRef,
    requestDigest: canonicalTicket.requestDigest,
    invocationDigest: canonicalTicket.invocationDigest,
    ticketClaimsDigest: providerConsequenceTicketClaimsDigest(canonicalTicket),
    expiresAt: canonicalTicket.expiresAt,
    now,
  })
}

export async function expectRefusedTicketInvalid(
  active: TestBoundaryTarget,
  invocation?: RouteTransportInvocation,
) {
  await expectExecute(active, {
    disposition: 'refused',
    releaseStarted: false,
    failureCode: 'provider_consequence_ticket_invalid',
  }, OPAQUE_TICKET, invocation)
  expectNoJournalBeginOrSend(active)
}

export function x402Harness(overrides: HarnessOverrides = {}) {
  const routeInvocation = overrides.routeInvocation ?? x402Invocation()
  const active = harness({
    ...overrides,
    routeInvocation,
    verifiedTicket: overrides.verifiedTicket ?? ticket(routeInvocation as any),
  })
  return { ...active, routeInvocation }
}

export function paymentRequired402Response(challenge = x402Challenge()) {
  return new Response(null, {
    status: 402,
    headers: { 'Payment-Required': encodePaymentRequiredHeader(challenge) },
  })
}

export function sendReturning402(challenge = x402Challenge()) {
  return vi.fn<RouteTransportFetch>(async () => paymentRequired402Response(challenge))
}

export function callbackScopedX402Runtime(
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

export function viCallbackScopedX402Factory(
  runtime: Partial<JitProviderX402Runtime> = {},
): ReturnType<typeof vi.fn<JitProviderX402RuntimeFactory>> {
  return vi.fn(async () => callbackScopedX402Runtime(runtime))
}

export function buildTrackedX402Factory() {
  const prepareX402PaymentAuthorization = vi.fn(async () => ({
    custodyRef: 'sha256:customer-custody-reference',
    authorizationDigest: canonicalDigest({ authorization: 'signed-payment' }),
  }))
  const readX402PaymentAuthorization = vi.fn(async () => 'signed-payment')
  const readX402PaymentAuthorizationByDigest = vi.fn(async () => 'signed-payment')
  const markX402PaymentPossiblySubmitted = vi.fn(async () => undefined)
  const observeX402PaymentAttempt = vi.fn(async () => undefined)
  const createCallbackScopedX402Runtime = vi.fn(async () => callbackScopedX402Runtime({
    prepareX402PaymentAuthorization,
    readX402PaymentAuthorization,
    readX402PaymentAuthorizationByDigest,
    markX402PaymentPossiblySubmitted,
    observeX402PaymentAttempt,
  })) as ReturnType<typeof vi.fn<JitProviderX402RuntimeFactory>>
  return {
    createCallbackScopedX402Runtime,
    prepareX402PaymentAuthorization,
    readX402PaymentAuthorization,
    readX402PaymentAuthorizationByDigest,
    markX402PaymentPossiblySubmitted,
    observeX402PaymentAttempt,
  }
}

export function unreadableJsonResponse() {
  const response = Response.json({ serviceReference: 'service:unreadable' })
  Object.defineProperty(response, 'headers', {
    get: () => { throw new Error('response-headers-unavailable') },
  })
  return response
}
