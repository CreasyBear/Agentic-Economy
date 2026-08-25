import {
  invokePreparedRouteTransport,
  parseRouteTransportObservationJson,
  prepareRegisteredRouteTransportInvocation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type RouteTransportObservation,
  type RouteTransportRuntime,
  type X402RouteTransportRuntime,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { accountRef, principalRef } from '@/modules/principal-account/public'
import {
  SecretPlaneError,
  createProductionSecretRuntime,
  secretGeneration,
  secretRef,
  type ProductionSecretRuntimeOptions,
  type SecretMaterialLease,
  type SecretPointerStore,
} from '@/modules/secrets/public'

const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u

export type CanonicalProviderConsequenceTicket = Readonly<{
  version: 'provider-consequence:v1'
  ticketRef: string
  effectRef: string
  requestDigest: string
  invocationDigest: string
  issuedAt: number
  expiresAt: number
  invocationRef: string
  operationRef: string
  leaseRef: string
  canonicalLeaseRef: string
  canonicalConnectionRef: string
  canonicalConnectionGeneration: number
  providerRef: string
  adapterId: string
  authorityDigest: string
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  readinessValidUntil: number
  readinessDigest?: string
  owningAccountRef: string
  activeAccountRef: string
  actorPrincipalRef: string
  grantRef: string
  grantGeneration: number
  secret: Readonly<{
    secretRef: string
    activeGeneration: string
    pointerRevision: number
  }>
}>

export type ProviderConsequenceJournalBegin = Readonly<{
  ticketRef: string
  effectRef: string
  requestDigest: string
  invocationDigest: string
  ticketClaimsDigest: string
  expiresAt: number
  now: number
}>

export type ProviderConsequenceJournalBeginResult =
  | Readonly<{ kind: 'claimed'; claimRef: string }>
  | Readonly<{ kind: 'completed'; observation: RouteTransportObservation }>
  | Readonly<{ kind: 'started' }>
  | Readonly<{ kind: 'unavailable' }>

export interface ProviderConsequenceJournal {
  begin(input: ProviderConsequenceJournalBegin): Promise<unknown>
  complete(input: Readonly<{ claimRef: string; observation: RouteTransportObservation }>): Promise<void>
  abortBeforeRelease(input: Readonly<{ claimRef: string }>): Promise<void>
}

export type ProviderConsequenceTicketVerifier = (
  opaqueTicket: string,
) => Promise<CanonicalProviderConsequenceTicket | undefined>

export interface JitProviderConsequenceBoundary {
  execute(input: Readonly<{
    ticket: string
    invocation: RouteTransportInvocation
  }>): Promise<RouteTransportObservation>
}

export type JitProviderConsequenceBoundaryOptions = Readonly<{
  verifyTicket: ProviderConsequenceTicketVerifier
  journal: ProviderConsequenceJournal
  secretRuntime: ProductionSecretRuntimeOptions
  send: RouteTransportFetch
  createCallbackScopedX402Runtime?: JitProviderX402RuntimeFactory
  now?: () => number
}>

type ProviderRouteTransportInvocation = Extract<
  RouteTransportInvocation,
  Readonly<{ binding: Readonly<{ authority: Readonly<{ kind: 'provider_connection' }> }> }>
>

type RequiredJitProviderX402RuntimeKey =
  | 'readX402PaymentCredentialRef'
  | 'validateProviderConnectionAuthority'
  | 'x402PaymentSigningAvailable'
  | 'verifyX402Settlement'
  | 'prepareX402PaymentAuthorization'
  | 'readX402PaymentAuthorization'
  | 'readX402PaymentAuthorizationByDigest'
  | 'markX402PaymentPossiblySubmitted'
  | 'observeX402PaymentAttempt'

export type JitProviderX402Runtime = Readonly<{
  [Key in RequiredJitProviderX402RuntimeKey]-?: NonNullable<X402RouteTransportRuntime[Key]>
}> & Pick<X402RouteTransportRuntime, 'beforeX402PaymentAuthorizationRead'>

export type JitProviderX402RuntimeFactory = (
  input: Readonly<{
    ticket: CanonicalProviderConsequenceTicket
    invocation: ProviderRouteTransportInvocation
  }>,
) => JitProviderX402Runtime | Promise<JitProviderX402Runtime>

export function createJitProviderConsequenceBoundary(
  options: JitProviderConsequenceBoundaryOptions,
): JitProviderConsequenceBoundary {
  const now = options.now ?? Date.now
  return Object.freeze({
    execute: async (input: Readonly<{
      ticket: string
      invocation: RouteTransportInvocation
    }>) => {
      const preparation = prepareRegisteredRouteTransportInvocation(input.invocation)
      if (preparation.kind === 'refused') return preparation.observation
      const { prepared } = preparation
      const transport = transportFor(input.invocation.binding.adapterId)
      if (!isProviderInvocation(input.invocation)) {
        return refused(transport, prepared.requestDigest, 'provider_consequence_ticket_invalid')
      }
      const providerInvocation = input.invocation
      if (!OPAQUE_REF.test(input.ticket)) {
        return refused(transport, prepared.requestDigest, 'provider_consequence_ticket_invalid')
      }

      let ticket: CanonicalProviderConsequenceTicket | undefined
      try {
        ticket = await options.verifyTicket(input.ticket)
      } catch {
        ticket = undefined
      }
      const canonical = canonicalTicket(ticket, providerInvocation, prepared.requestDigest, now())
      if (canonical === undefined) {
        return refused(transport, prepared.requestDigest, 'provider_consequence_ticket_invalid')
      }

      let journalResult: ProviderConsequenceJournalBeginResult
      try {
        const remoteResult = await options.journal.begin({
          ticketRef: canonical.ticketRef,
          effectRef: canonical.effectRef,
          requestDigest: canonical.requestDigest,
          invocationDigest: canonical.invocationDigest,
          ticketClaimsDigest: providerConsequenceTicketClaimsDigest(canonical),
          expiresAt: canonical.expiresAt,
          now: now(),
        })
        const parsedResult = parseProviderConsequenceJournalBeginResult(remoteResult)
        if (parsedResult === undefined) {
          return refused(transport, prepared.requestDigest, 'provider_consequence_journal_invalid')
        }
        journalResult = parsedResult
      } catch {
        return refused(transport, prepared.requestDigest, 'provider_consequence_journal_unavailable')
      }
      if (journalResult.kind === 'unavailable') {
        return refused(transport, prepared.requestDigest, 'provider_consequence_ticket_unavailable')
      }
      if (journalResult.kind === 'started') {
        return unknown(transport, prepared.requestDigest, 'provider_consequence_started')
      }
      if (journalResult.kind === 'completed') {
        return canonicalReplay(journalResult.observation, prepared.requestDigest)
          ?? unknown(transport, prepared.requestDigest, 'provider_consequence_replay_invalid')
      }

      const { claimRef } = journalResult
      let expiredBeforeRelease = false
      let releaseAttempted = false
      const send: RouteTransportFetch = async (target, init) => {
        if (now() >= canonical.expiresAt) {
          expiredBeforeRelease = true
          throw new Error('provider_consequence_expired')
        }
        releaseAttempted = true
        return await options.send(target, init)
      }
      try {
        const pinnedStore = pinnedPointerStore(
          options.secretRuntime.customer.pointerStore,
          canonical.secret,
        )
        const runtime = createProductionSecretRuntime({
          ...options.secretRuntime,
          customer: {
            ...options.secretRuntime.customer,
            pointerStore: pinnedStore,
          },
        })
        let observation = refused(
          transport,
          prepared.requestDigest,
          'provider_consequence_secret_unavailable',
        )
        await runtime.consequences.customer.execute(
          { secretRef: canonical.secret.secretRef },
          async (lease) => {
            const baseRuntime: RouteTransportRuntime = {
              send,
              resolveCredential: callbackScopedCredentialResolver(lease),
              readProviderConnectionCredentialRef: () => ({
                kind: 'resolved',
                credentialRef: canonical.secret.secretRef,
              }),
            }
            if (providerInvocation.binding.adapterId !== 'x402-fetch:v2') {
              observation = await invokePreparedRouteTransport(prepared, baseRuntime)
              return
            }
            const x402Runtime = await createCallbackScopedX402Runtime(
              options.createCallbackScopedX402Runtime,
              canonical,
              providerInvocation,
            )
            if (x402Runtime === undefined) {
              observation = refused(
                transport,
                prepared.requestDigest,
                'payment_custody_unavailable',
              )
              return
            }
            const x402Preparation = prepareRegisteredRouteTransportInvocation(
              providerInvocation,
              x402Runtime.x402PaymentSigningAvailable,
            )
            if (x402Preparation.kind === 'refused') {
              observation = x402Preparation.observation
              return
            }
            const releaseFencedX402Runtime: JitProviderX402Runtime = {
              ...x402Runtime,
              prepareX402PaymentAuthorization: async (request) => {
                releaseAttempted = true
                return await x402Runtime.prepareX402PaymentAuthorization(request)
              },
              markX402PaymentPossiblySubmitted: async (event) => {
                releaseAttempted = true
                await x402Runtime.markX402PaymentPossiblySubmitted(event)
              },
            }
            observation = await invokePreparedRouteTransport(x402Preparation.prepared, {
              ...baseRuntime,
              ...releaseFencedX402Runtime,
            })
          },
        )
        if (expiredBeforeRelease) {
          if (releaseAttempted) {
            return unknown(
              transport,
              prepared.requestDigest,
              'provider_consequence_release_unknown',
            )
          }
          try {
            await options.journal.abortBeforeRelease({ claimRef })
          } catch {
            // No provider I/O began. Expiry remains a fail-closed refusal.
          }
          return refused(transport, prepared.requestDigest, 'provider_consequence_expired')
        }
        try {
          await options.journal.complete({ claimRef, observation })
        } catch {
          return unknown(transport, prepared.requestDigest, 'provider_consequence_completion_unknown')
        }
        return observation
      } catch {
        if (releaseAttempted) {
          return unknown(
            transport,
            prepared.requestDigest,
            'provider_consequence_release_unknown',
          )
        }
        try {
          await options.journal.abortBeforeRelease({ claimRef })
        } catch {
          // No provider I/O began. A failed abort remains a fail-closed refusal.
        }
        return refused(transport, prepared.requestDigest, 'provider_consequence_secret_unavailable')
      }
    },
  })
}

const REQUIRED_X402_RUNTIME_KEYS = Object.freeze([
  'readX402PaymentCredentialRef',
  'validateProviderConnectionAuthority',
  'x402PaymentSigningAvailable',
  'verifyX402Settlement',
  'prepareX402PaymentAuthorization',
  'readX402PaymentAuthorization',
  'readX402PaymentAuthorizationByDigest',
  'markX402PaymentPossiblySubmitted',
  'observeX402PaymentAttempt',
] as const satisfies readonly RequiredJitProviderX402RuntimeKey[])

async function createCallbackScopedX402Runtime(
  factory: JitProviderX402RuntimeFactory | undefined,
  ticket: CanonicalProviderConsequenceTicket,
  invocation: ProviderRouteTransportInvocation,
): Promise<JitProviderX402Runtime | undefined> {
  if (factory === undefined) return undefined
  let candidate: unknown
  try {
    candidate = await factory({ ticket, invocation })
  } catch {
    return undefined
  }
  if (!isRecord(candidate)
    || Object.keys(candidate).some((key) => (
      key !== 'beforeX402PaymentAuthorizationRead'
      && !REQUIRED_X402_RUNTIME_KEYS.includes(key as RequiredJitProviderX402RuntimeKey)
    ))
    || REQUIRED_X402_RUNTIME_KEYS.some((key) => typeof candidate[key] !== 'function')
    || (candidate.beforeX402PaymentAuthorizationRead !== undefined
      && typeof candidate.beforeX402PaymentAuthorizationRead !== 'function')) return undefined
  return candidate as JitProviderX402Runtime
}

function parseProviderConsequenceJournalBeginResult(
  value: unknown,
): ProviderConsequenceJournalBeginResult | undefined {
  if (!isRecord(value) || typeof value.kind !== 'string') return undefined
  if (value.kind === 'claimed') {
    return hasExactKeys(value, ['kind', 'claimRef'])
      && typeof value.claimRef === 'string'
      && OPAQUE_REF.test(value.claimRef)
      ? { kind: 'claimed', claimRef: value.claimRef }
      : undefined
  }
  if (value.kind === 'started' || value.kind === 'unavailable') {
    return hasExactKeys(value, ['kind']) ? { kind: value.kind } : undefined
  }
  if (value.kind !== 'completed' || !hasExactKeys(value, ['kind', 'observation'])) {
    return undefined
  }
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(value.observation)
  } catch {
    serialized = undefined
  }
  if (serialized === undefined) return undefined
  const observation = parseRouteTransportObservationJson(serialized)
  return observation === undefined ? undefined : { kind: 'completed', observation }
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value)
  return keys.length === expected.length
    && expected.every((key) => Object.prototype.hasOwnProperty.call(value, key))
}

function canonicalTicket(
  candidate: CanonicalProviderConsequenceTicket | undefined,
  invocation: ProviderRouteTransportInvocation,
  requestDigest: string,
  now: number,
): CanonicalProviderConsequenceTicket | undefined {
  const authority = invocation.authority
  const {
    invocationRef,
    operationRef,
    leaseRef,
    grantedScopes,
    grantedResources,
    readinessValidUntil,
  } = authority
  if (invocationRef === undefined
    || operationRef === undefined
    || leaseRef === undefined
    || grantedScopes === undefined
    || grantedResources === undefined
    || readinessValidUntil === undefined) return undefined
  const invocationDigest = providerConsequenceInvocationDigest(invocation)
  if (candidate === undefined
    || candidate.version !== 'provider-consequence:v1'
    || !OPAQUE_REF.test(candidate.ticketRef)
    || !OPAQUE_REF.test(candidate.effectRef)
    || !DIGEST.test(candidate.requestDigest)
    || candidate.requestDigest !== requestDigest
    || !DIGEST.test(candidate.invocationDigest)
    || candidate.invocationDigest !== invocationDigest
    || !Number.isSafeInteger(candidate.issuedAt)
    || !Number.isSafeInteger(candidate.expiresAt)
    || candidate.issuedAt > now
    || candidate.expiresAt <= now
    || candidate.expiresAt > authority.expiresAt
    || !Array.isArray(grantedScopes)
    || !Array.isArray(grantedResources)
    || !Number.isSafeInteger(readinessValidUntil)
    || candidate.expiresAt > readinessValidUntil
    || !OPAQUE_REF.test(candidate.invocationRef)
    || !OPAQUE_REF.test(candidate.operationRef)
    || !OPAQUE_REF.test(candidate.leaseRef)
    || !OPAQUE_REF.test(candidate.canonicalLeaseRef)
    || !OPAQUE_REF.test(candidate.canonicalConnectionRef)
    || !OPAQUE_REF.test(candidate.providerRef)
    || !OPAQUE_REF.test(candidate.adapterId)
    || !OPAQUE_REF.test(candidate.grantRef)
    || candidate.invocationRef !== invocationRef
    || candidate.operationRef !== operationRef
    || candidate.leaseRef !== leaseRef
    || candidate.canonicalConnectionRef !== invocation.binding.authority.connectionRef
    || candidate.providerRef !== invocation.binding.authority.providerRef
    || candidate.adapterId !== invocation.binding.adapterId
    || candidate.canonicalConnectionGeneration !== authority.authorityGeneration
    || candidate.authorityDigest !== authority.authorityDigest
    || !DIGEST.test(candidate.authorityDigest)
    || !sameStrings(candidate.grantedScopes, grantedScopes)
    || !sameStrings(candidate.grantedResources, grantedResources)
    || candidate.readinessValidUntil !== readinessValidUntil
    || candidate.readinessDigest !== authority.readinessDigest
    || candidate.owningAccountRef !== candidate.activeAccountRef
    || !Number.isSafeInteger(candidate.grantGeneration)
    || candidate.grantGeneration < 1
    || !Number.isSafeInteger(candidate.secret.pointerRevision)
    || candidate.secret.pointerRevision < 1) return undefined
  try {
    accountRef(candidate.owningAccountRef)
    accountRef(candidate.activeAccountRef)
    principalRef(candidate.actorPrincipalRef)
    secretRef(candidate.secret.secretRef)
    secretGeneration(candidate.secret.activeGeneration)
    return candidate
  } catch {
    return undefined
  }
}

export function providerConsequenceInvocationDigest(
  invocation: RouteTransportInvocation,
): string | undefined {
  if (!isProviderInvocation(invocation)) return undefined
  const authority = invocation.authority
  if (authority.invocationRef === undefined
    || authority.operationRef === undefined
    || authority.leaseRef === undefined
    || authority.grantedScopes === undefined
    || authority.grantedResources === undefined
    || authority.readinessValidUntil === undefined) return undefined
  return canonicalDigest({
    kind: 'provider-consequence-invocation:v1',
    binding: {
      adapterId: invocation.binding.adapterId,
      endpointUrl: invocation.binding.endpointUrl,
      configDigest: invocation.binding.configDigest,
      connectionRef: invocation.binding.authority.connectionRef,
      providerRef: invocation.binding.authority.providerRef,
    },
    authority: {
      attemptRef: authority.attemptRef,
      ...(authority.effectGeneration === undefined ? {} : { effectGeneration: authority.effectGeneration }),
      operationKeyDigest: authority.operationKeyDigest,
      mandateDigest: authority.mandateDigest,
      grantDigest: authority.grantDigest,
      capabilityContractDigest: authority.capabilityContractDigest,
      maximumSpend: authority.maximumSpend,
      expiresAt: authority.expiresAt,
      callIdentity: authority.callIdentity,
      authorityGeneration: authority.authorityGeneration,
      authorityDigest: authority.authorityDigest,
      leaseRef: authority.leaseRef,
      invocationRef: authority.invocationRef,
      operationRef: authority.operationRef,
      grantedScopes: authority.grantedScopes,
      grantedResources: authority.grantedResources,
      readinessValidUntil: authority.readinessValidUntil,
      ...(authority.readinessDigest === undefined ? {} : { readinessDigest: authority.readinessDigest }),
    },
    inputJson: invocation.inputJson,
  } as StableHashValue)
}

export function providerConsequenceTicketClaimsDigest(
  ticket: CanonicalProviderConsequenceTicket,
): string {
  return canonicalDigest({
    kind: 'provider-consequence-ticket-claims:v1',
    ticket: {
      ...ticket,
      grantedScopes: [...ticket.grantedScopes],
      grantedResources: [...ticket.grantedResources],
      secret: { ...ticket.secret },
    },
  } as StableHashValue)
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isProviderInvocation(
  invocation: RouteTransportInvocation,
): invocation is ProviderRouteTransportInvocation {
  return invocation.binding.authority.kind === 'provider_connection'
}

function pinnedPointerStore(
  source: SecretPointerStore,
  selector: CanonicalProviderConsequenceTicket['secret'],
): SecretPointerStore {
  return {
    getActive: async (ref) => {
      const pointer = await source.getActive(ref)
      if (pointer === undefined
        || pointer.secretRef !== selector.secretRef
        || pointer.activeGeneration !== selector.activeGeneration
        || pointer.revision !== selector.pointerRevision) {
        throw new SecretPlaneError('secret_pointer_stale')
      }
      return pointer
    },
    advanceActive: source.advanceActive,
  }
}

function callbackScopedCredentialResolver(lease: SecretMaterialLease) {
  return async (_reference: string): Promise<string | undefined> => {
    let credential: string | undefined
    await lease.useBytes(async (material) => {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(material)
      credential = decoded.trim().length === 0 ? undefined : decoded
    })
    return credential
  }
}

function canonicalReplay(
  observation: RouteTransportObservation,
  requestDigest: string,
): RouteTransportObservation | undefined {
  const parsed = parseRouteTransportObservationJson(JSON.stringify(observation))
  return parsed?.requestDigest === requestDigest ? parsed : undefined
}

const REGISTERED_TRANSPORTS = Object.freeze({
  'http-json:v1': 'http',
  'mcp-jsonrpc:v1': 'mcp',
  'x402-fetch:v2': 'x402',
} as const)

function transportFor(adapterId: string): RouteTransportObservation['transport'] {
  return REGISTERED_TRANSPORTS[adapterId as keyof typeof REGISTERED_TRANSPORTS]
}

function refused(
  transport: RouteTransportObservation['transport'],
  requestDigest: string,
  failureCode: string,
): RouteTransportObservation {
  return { transport, disposition: 'refused', releaseStarted: false, requestDigest, failureCode }
}

function unknown(
  transport: RouteTransportObservation['transport'],
  requestDigest: string,
  failureCode: string,
): RouteTransportObservation {
  return { transport, disposition: 'unknown', releaseStarted: true, requestDigest, failureCode }
}
