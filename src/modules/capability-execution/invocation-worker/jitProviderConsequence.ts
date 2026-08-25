import {
  invokePreparedRouteTransport,
  parseRouteTransportObservationJson,
  prepareRegisteredRouteTransportInvocation,
  type RouteTransportFetch,
  type RouteTransportInvocation,
  type RouteTransportObservation,
} from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
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
  expiresAt: number
  now: number
}>

export type ProviderConsequenceJournalBeginResult =
  | Readonly<{ kind: 'claimed'; claimRef: string }>
  | Readonly<{ kind: 'completed'; observation: RouteTransportObservation }>
  | Readonly<{ kind: 'started' }>
  | Readonly<{ kind: 'unavailable' }>

export interface ProviderConsequenceJournal {
  begin(input: ProviderConsequenceJournalBegin): Promise<ProviderConsequenceJournalBeginResult>
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
  now?: () => number
}>

type ProviderRouteTransportInvocation = Extract<
  RouteTransportInvocation,
  Readonly<{ binding: Readonly<{ authority: Readonly<{ kind: 'provider_connection' }> }> }>
>

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
      if (!OPAQUE_REF.test(input.ticket)) {
        return refused(transport, prepared.requestDigest, 'provider_consequence_ticket_invalid')
      }

      let ticket: CanonicalProviderConsequenceTicket | undefined
      try {
        ticket = await options.verifyTicket(input.ticket)
      } catch {
        ticket = undefined
      }
      const canonical = canonicalTicket(ticket, input.invocation, prepared.requestDigest, now())
      if (canonical === undefined) {
        return refused(transport, prepared.requestDigest, 'provider_consequence_ticket_invalid')
      }

      let journalResult: ProviderConsequenceJournalBeginResult
      try {
        journalResult = await options.journal.begin({
          ticketRef: canonical.ticketRef,
          effectRef: canonical.effectRef,
          requestDigest: canonical.requestDigest,
          invocationDigest: canonical.invocationDigest,
          expiresAt: canonical.expiresAt,
          now: now(),
        })
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
      const send: RouteTransportFetch = async (target, init) => {
        if (now() >= canonical.expiresAt) {
          expiredBeforeRelease = true
          throw new Error('provider_consequence_expired')
        }
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
            observation = await invokePreparedRouteTransport(prepared, {
              send,
              resolveCredential: callbackScopedCredentialResolver(lease),
              readProviderConnectionCredentialRef: () => ({
                kind: 'resolved',
                credentialRef: canonical.secret.secretRef,
              }),
            })
          },
        )
        if (expiredBeforeRelease) {
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

function canonicalTicket(
  candidate: CanonicalProviderConsequenceTicket | undefined,
  invocation: RouteTransportInvocation,
  requestDigest: string,
  now: number,
): CanonicalProviderConsequenceTicket | undefined {
  if (!isProviderInvocation(invocation)) return undefined
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
