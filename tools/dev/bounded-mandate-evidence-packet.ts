import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

import {
  createDevelopmentStandingMandateGrantVerifier,
  issueStandingMandate,
  StandingMandateStore,
  verifiedGrantMatchesMandate,
  type StandingMandateSnapshot,
  type VerifiedStandingMandateGrant,
} from '../../src/modules/action-invocation'
import { createDevelopmentReservationAction } from '../../src/modules/booking/development-booking.actions'
import {
  bookingActor,
  bookingInput,
  developmentBookingNow,
} from '../../src/modules/booking/development-booking-fixture'
import {
  createDevelopmentBookingMandateService,
} from '../../src/modules/booking/development-booking-mandate'
import { projectDurableRun } from '../../src/modules/booking/development-booking-packet'
import { createDevelopmentBookingProvider } from '../../src/modules/booking/development-booking-provider'
import { runBookingReconciliation } from '../../src/modules/booking/development-booking-recovery'
import { runReservationInvocation } from '../../src/modules/booking/development-booking-runner'
import { canonicalDigest } from '../../src/modules/common/canonical-digest'

type BookingRecord = Readonly<{
  invocationRef: string
  origin: 'request_owned' | 'standalone'
  events: readonly Readonly<{ kind: string; invocationRef?: string; actionId?: string }>[]
  durable: ReturnType<typeof projectDurableRun>
}>

export type BoundedMandatePacketEvidence = Readonly<{
  environment: 'MOCK/DEVELOPMENT ONLY'
  gitRevision: string
  action: Readonly<{ id: string; version: string }>
  mandateSnapshot: StandingMandateSnapshot
  grantEvidence: VerifiedStandingMandateGrant
  bookings: readonly BookingRecord[]
  observations: Readonly<{
    principalGrantDecisions: number
    standingMandateAuthorizations: number
    providerReleases: number
    concurrentRefusal: string
    scopeRefusal: string
    compensationCases: readonly Readonly<{
      stage: string
      refusal: string
      providerEffects: number
      heldCount: number
      useState: string
    }>[]
    revokeRace: Readonly<{ refusal: string; providerEffects: number; useState: string }>
    reconciliations: readonly Readonly<{
      authorityUseRef: string
      invocationRef: string
      attemptRef: string
      evidenceRef: string
      resolution: string
      useState: string
    }>[]
  }>
  comparison: Readonly<{
    approveEachPrincipalDecisionsForTwoInvocations: 2
    boundedMandatePrincipalGrantDecisions: number
    boundedMandateRepeatPrincipalDecisions: number
    exactAuthorityUses: number
  }>
  claimCeiling: string
}>

export type BoundedMandatePacket = Readonly<{
  schema: 'ae.bounded-mandate-development-evidence:v2'
  checksum: string
  evidence: BoundedMandatePacketEvidence
}>

const now = developmentBookingNow()
const requestOrigin = { kind: 'request_owned', requestRef: 'mock:request:packet', revision: 1 } as const
const principalRef = bookingActor(requestOrigin).principalRef
const callerRef = bookingActor(requestOrigin).callerRef
const standaloneOrigin = { kind: 'standalone', principalRef, callerRef } as const

function createIssuedStore(maximumConcurrentReservations = 2) {
  const mandate = issueStandingMandate({
    mandateRef: 'mock:packet:standing-mandate',
    version: 1,
    generation: 1,
    grantorRef: 'mock:grantor:customer',
    principalRef,
    delegateRef: 'mock:delegate:agent',
    callerRef,
    issuedAt: now,
    scope: {
      objective: 'Reserve suitable development consultation times.',
      action: { id: createDevelopmentReservationAction.id, version: 'v1' },
      providerRefs: ['mock:provider:calendar'],
      recipientRefs: ['mock:provider:calendar'],
      purposes: ['create_development_reservation'],
      allowedDataFields: ['customer.name', 'customer.email'],
      maximumSpend: { amountMinor: 0, currency: 'AUD' },
      maximumActionCount: 8,
      maximumConcurrentReservations,
      startsAt: now,
      expiresAt: '2026-07-19T05:00:00.000Z',
      permittedFallbacks: ['none'],
      riskCeiling: 'development_booking_zero_charge',
    },
  })
  const verifier = createDevelopmentStandingMandateGrantVerifier({
    admittedMandateDigest: mandate.digest,
    evidenceRef: 'mock:packet:grant-evidence',
    verifierRef: 'mock:packet:grant-verifier',
    source: 'mock:authenticated-principal-grant:v1',
    freshUntil: '2026-07-19T04:30:00.000Z',
  })
  const grant = verifier(mandate, now)
  if (!grant.authenticated) throw new Error(grant.reason)
  const store = new StandingMandateStore()
  const issued = store.issue(mandate, grant, now)
  if (issued.kind === 'refused') throw new Error(issued.code)
  const service = createDevelopmentBookingMandateService({
    store,
    authenticatedDelegate: { delegateRef: mandate.delegateRef, principalRef, callerRef },
    now: developmentBookingNow,
  })
  return { store, service, mandate, grant }
}

export async function runBoundedMandateDevelopmentEvidence(): Promise<BoundedMandatePacketEvidence> {
  const provider = createDevelopmentBookingProvider()
  const slot = await provider.availability()
  const issued = createIssuedStore()
  let activeStore = issued.store
  let activeService = issued.service
  const bookings = []
  for (const [index, origin] of [requestOrigin, standaloneOrigin].entries()) {
    const run = await runReservationInvocation({
      provider,
      booking: bookingInput(slot, principalRef, `mock:packet:success:${index}`),
      origin,
      ref: `packet-success-${index}`,
      boundedMandate: {
        service: activeService,
        mandateRef: issued.mandate.mandateRef,
        authorityUseRef: `mock:packet:use:success:${index}`,
        ...(index === 0 ? {
          reconstructBeforeRelease: () => {
            activeStore = new StandingMandateStore(structuredClone(activeStore.exportSnapshot()))
            activeService = createDevelopmentBookingMandateService({
              store: activeStore,
              authenticatedDelegate: {
                delegateRef: issued.mandate.delegateRef,
                principalRef,
                callerRef,
              },
              now: developmentBookingNow,
            })
            return activeService
          },
        } : {}),
      },
    })
    bookings.push({
      invocationRef: run.view.invocationRef,
      origin: origin.kind,
      events: run.events,
      durable: projectDurableRun(run),
    })
  }

  const unknownReleased = await runBookingReconciliation({
    provider,
    booking: bookingInput(slot, principalRef, 'mock:packet:unknown-released'),
    origin: standaloneOrigin,
    resolution: 'released',
    boundedMandate: {
      service: activeService,
      mandateRef: issued.mandate.mandateRef,
      authorityUseRef: 'mock:packet:use:unknown-released',
    },
    ref: 'packet-unknown-released',
    evidenceRef: 'mock:packet:evidence:unknown-released',
  })
  const unknownNotReleased = await runBookingReconciliation({
    provider,
    booking: bookingInput(slot, principalRef, 'mock:packet:unknown-not-released'),
    origin: standaloneOrigin,
    resolution: 'not_released',
    boundedMandate: {
      service: activeService,
      mandateRef: issued.mandate.mandateRef,
      authorityUseRef: 'mock:packet:use:unknown-not-released',
    },
    ref: 'packet-unknown-not-released',
    evidenceRef: 'mock:packet:evidence:unknown-not-released',
  })
  for (const recovery of [unknownReleased, unknownNotReleased]) {
    bookings.push({
      invocationRef: recovery.reconciled.invocationRef,
      origin: recovery.uncertain.origin.kind,
      events: recovery.uncertain.events,
      durable: projectDurableRun({
        ...recovery.uncertain,
        view: recovery.reconciled,
      }),
    })
  }

  const concurrency = createIssuedStore(1)
  const firstUse = {
    authorityUseRef: 'mock:packet:concurrency:1', mandateRef: concurrency.mandate.mandateRef,
    mandateVersion: 1, mandateGeneration: 1, callerRef, principalRef,
    delegateRef: concurrency.mandate.delegateRef, invocationRef: 'mock:packet:concurrency-invocation:1',
    action: concurrency.mandate.scope.action, preparedMaterialDigest: 'sha256:prepared:1',
    providerRef: slot.providerRef, recipientRef: slot.providerRef,
    purpose: 'create_development_reservation', dataFields: ['customer.name', 'customer.email'],
    reservedSpend: { amountMinor: 0, currency: 'AUD' }, fallbackRef: null,
    risk: 'development_booking_zero_charge', effectGeneration: 1,
  } as const
  if (concurrency.store.reserve(firstUse, now).kind === 'refused') throw new Error('packet_concurrency_setup_refused')
  const concurrent = concurrency.store.reserve({
    ...firstUse,
    authorityUseRef: 'mock:packet:concurrency:2',
    invocationRef: 'mock:packet:concurrency-invocation:2',
  }, now)

  const scope = activeStore.reserve({
    ...firstUse,
    authorityUseRef: 'mock:packet:scope-refusal',
    mandateRef: issued.mandate.mandateRef,
    providerRef: 'mock:provider:wrong',
  }, now)

  const compensationCases = []
  for (const [stage, override] of [
    ['standing_authorization', { developmentAuthorizationVersionOverride: 99 }],
    ['acquisition', { developmentAcquisitionVersionOverride: 99 }],
  ] as const) {
    const compensation = createIssuedStore()
    const compensationProvider = createDevelopmentBookingProvider()
    const compensationSlot = await compensationProvider.availability()
    const authorityUseRef = `mock:packet:use:compensation:${stage}`
    let refusal = 'none'
    try {
      await runReservationInvocation({
        provider: compensationProvider,
        booking: bookingInput(compensationSlot, principalRef, `mock:packet:operation:compensation:${stage}`),
        origin: standaloneOrigin,
        ref: `packet-compensation-${stage}`,
        boundedMandate: {
          service: compensation.service,
          mandateRef: compensation.mandate.mandateRef,
          authorityUseRef,
          ...override,
        },
      })
    } catch (error) {
      refusal = error instanceof Error ? error.message : 'unknown'
    }
    compensationCases.push({
      stage,
      refusal,
      providerEffects: compensationProvider.effectCount(),
      heldCount: compensation.store.capacity(compensation.mandate.mandateRef).reservedCount,
      useState: compensation.store.inspectUse(authorityUseRef)?.state ?? 'missing',
    })
  }

  const revoke = createIssuedStore()
  let revokeRefusal = 'none'
  const effectsBeforeRevoke = provider.effectCount()
  try {
    await runReservationInvocation({
      provider,
      booking: bookingInput(slot, principalRef, 'mock:packet:revoke-race'),
      origin: standaloneOrigin,
      ref: 'packet-revoke-race',
      boundedMandate: {
        service: revoke.service,
        mandateRef: revoke.mandate.mandateRef,
        authorityUseRef: 'mock:packet:use:revoke-race',
        afterReservation: () => {
          const result = revoke.store.revoke({
            mandateRef: revoke.mandate.mandateRef,
            expectedGeneration: 1,
            reason: 'Development revoke race.',
            revokedAt: '2026-07-19T04:00:01.000Z',
          })
          if (result.kind === 'refused') throw new Error(result.code)
        },
      },
    })
  } catch (error) {
    revokeRefusal = error instanceof Error ? error.message : 'unknown'
  }

  const snapshot = activeStore.exportSnapshot()
  new StandingMandateStore(structuredClone(snapshot))
  return {
    environment: 'MOCK/DEVELOPMENT ONLY',
    gitRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    action: { id: createDevelopmentReservationAction.id, version: 'v1' },
    mandateSnapshot: snapshot,
    grantEvidence: issued.grant,
    bookings,
    observations: {
      principalGrantDecisions: snapshot.grants.length,
      standingMandateAuthorizations: bookings.filter(({ events }) =>
        events.some(({ kind }) => kind === 'standing_mandate_authorization')).length,
      providerReleases: bookings.flatMap(({ events }) => events).filter(({ kind }) => kind === 'provider_release').length,
      concurrentRefusal: concurrent.kind === 'refused' ? concurrent.code : 'not_refused',
      scopeRefusal: scope.kind === 'refused' ? scope.code : 'not_refused',
      compensationCases,
      revokeRace: {
        refusal: revokeRefusal,
        providerEffects: provider.effectCount() - effectsBeforeRevoke,
        useState: revoke.store.inspectUse('mock:packet:use:revoke-race')?.state ?? 'missing',
      },
      reconciliations: [
        {
          authorityUseRef: 'mock:packet:use:unknown-released',
          invocationRef: unknownReleased.reconciled.invocationRef,
          attemptRef: unknownReleased.attempt.attemptRef,
          evidenceRef: unknownReleased.evidence.evidenceRef,
          resolution: unknownReleased.evidence.resolution,
          useState: activeStore.inspectUse('mock:packet:use:unknown-released')?.state ?? 'missing',
        },
        {
          authorityUseRef: 'mock:packet:use:unknown-not-released',
          invocationRef: unknownNotReleased.reconciled.invocationRef,
          attemptRef: unknownNotReleased.attempt.attemptRef,
          evidenceRef: unknownNotReleased.evidence.evidenceRef,
          resolution: unknownNotReleased.evidence.resolution,
          useState: activeStore.inspectUse('mock:packet:use:unknown-not-released')?.state ?? 'missing',
        },
      ],
    },
    comparison: {
      approveEachPrincipalDecisionsForTwoInvocations: 2,
      boundedMandatePrincipalGrantDecisions: snapshot.grants.length,
      boundedMandateRepeatPrincipalDecisions: 0,
      exactAuthorityUses: snapshot.uses.length,
    },
    claimCeiling: 'Labelled local in-process development semantics only; no durable multi-worker CAS, deployment, provider fulfilment, production safety, or customer value.',
  }
}

export function verifyBoundedMandateEvidence(evidence: BoundedMandatePacketEvidence) {
  const reconstructed = new StandingMandateStore(structuredClone(evidence.mandateSnapshot))
  const unique = (values: readonly string[]) => new Set(values).size === values.length
  const invocationRefs = evidence.bookings.map(({ invocationRef }) => invocationRef)
  const useRefs = evidence.mandateSnapshot.uses.map(({ authorityUseRef }) => authorityUseRef)
  const attemptRefs = evidence.bookings.flatMap(({ durable }) =>
    durable.attempts.map((attempt) => String((attempt as { attemptRef?: string }).attemptRef)))
  const evidenceRefs = evidence.observations.reconciliations.map(({ evidenceRef }) => evidenceRef)
  if (
    evidence.environment !== 'MOCK/DEVELOPMENT ONLY'
    || evidence.action.id !== createDevelopmentReservationAction.id
    || evidence.grantEvidence.digest !== evidence.mandateSnapshot.grants[0]?.digest
    || evidence.mandateSnapshot.mandates[0] === undefined
    || !verifiedGrantMatchesMandate(
      evidence.grantEvidence,
      evidence.mandateSnapshot.mandates[0],
      evidence.grantEvidence.verifiedAt,
    )
    || evidence.observations.principalGrantDecisions !== 1
    || evidence.observations.principalGrantDecisions !== evidence.mandateSnapshot.grants.length
    || evidence.comparison.boundedMandatePrincipalGrantDecisions !== evidence.mandateSnapshot.grants.length
    || evidence.comparison.boundedMandateRepeatPrincipalDecisions !== 0
    || evidence.observations.standingMandateAuthorizations !== evidence.bookings.length
    || evidence.observations.concurrentRefusal !== 'mandate_concurrency_exhausted'
    || evidence.observations.scopeRefusal !== 'mandate_provider_mismatch'
    || evidence.observations.compensationCases.length !== 2
    || evidence.observations.compensationCases.some(({ refusal, providerEffects, heldCount, useState }) =>
      refusal !== 'stale_invocation_version'
      || providerEffects !== 0
      || heldCount !== 0
      || useState !== 'not_released')
    || evidence.observations.revokeRace.providerEffects !== 0
    || evidence.observations.revokeRace.useState !== 'not_released'
    || evidence.observations.reconciliations.some(({ resolution, useState }) => resolution !== useState)
    || !unique(invocationRefs)
    || !unique(useRefs)
    || !unique(attemptRefs)
    || !unique(evidenceRefs)
  ) throw new Error('bounded_mandate_semantic_verification_refused')
  for (const booking of evidence.bookings) {
    const standingAuthorizationIndex = booking.events.findIndex(({ kind }) =>
      kind === 'standing_mandate_authorization')
    const providerReleaseIndex = booking.events.findIndex(({ kind }) => kind === 'provider_release')
    if (
      standingAuthorizationIndex < 0
      || (providerReleaseIndex >= 0 && standingAuthorizationIndex >= providerReleaseIndex)
    ) throw new Error('bounded_mandate_event_order_refused')
    const control = booking.durable.controls[0] as {
      invocationRef: string
      preparedMaterialDigest: string
      control: {
        acceptedAuthority?: { kind: string; authorityUseRef?: string }
        action: { id: string; contractVersion: string }
        owner: { callerRef: string; principalRef: string }
      }
    }
    const attempt = booking.durable.attempts[0] as {
      invocationRef: string
      effectGeneration: number
      idempotency: { materialInputDigest: string }
      release: { state: string }
      outcome: { state: string }
    }
    const useRef = control.control.acceptedAuthority?.authorityUseRef
    const use = useRef === undefined ? undefined : reconstructed.inspectUse(useRef)
    if (
      control.invocationRef !== booking.invocationRef
      || control.control.acceptedAuthority?.kind !== 'standing_mandate_use'
      || use === undefined
      || use.invocationRef !== booking.invocationRef
      || use.action.id !== control.control.action.id
      || use.action.version !== control.control.action.contractVersion
      || use.preparedMaterialDigest !== control.preparedMaterialDigest
      || use.preparedMaterialDigest !== attempt.idempotency.materialInputDigest
      || use.effectGeneration !== attempt.effectGeneration
      || use.callerRef !== control.control.owner.callerRef
      || use.principalRef !== control.control.owner.principalRef
      || (
        attempt.outcome.state === 'reconciled_released'
        && use.state !== 'released'
      )
      || (
        attempt.outcome.state === 'reconciled_not_released'
        && use.state !== 'not_released'
      )
      || (
        attempt.release.state === 'released'
        && attempt.outcome.state !== 'reconciled_not_released'
        && use.state !== 'released'
      )
    ) throw new Error('bounded_mandate_booking_linkage_refused')
  }
  for (const reconciliation of evidence.observations.reconciliations) {
    const booking = evidence.bookings.find(({ invocationRef }) =>
      invocationRef === reconciliation.invocationRef)
    if (
      booking === undefined
      || !booking.durable.attempts.some((attempt) =>
        (attempt as { attemptRef?: string }).attemptRef === reconciliation.attemptRef)
      || reconstructed.inspectUse(reconciliation.authorityUseRef)?.invocationRef
        !== reconciliation.invocationRef
    ) throw new Error('bounded_mandate_reconciliation_identity_refused')
  }
  const capacity = reconstructed.capacity(evidence.mandateSnapshot.mandates[0]?.mandateRef ?? '')
  const releasedUses = evidence.mandateSnapshot.uses.filter(({ state }) => state === 'released')
  const heldUses = evidence.mandateSnapshot.uses.filter(({ state }) =>
    state === 'reserved' || state === 'uncertain')
  if (
    capacity.consumedCount !== releasedUses.length
    || capacity.reservedCount !== heldUses.length
    || capacity.consumedSpendMinor
      !== releasedUses.reduce((sum, use) => sum + use.reservedSpend.amountMinor, 0)
  ) throw new Error('bounded_mandate_capacity_verification_refused')
  return {
    verdict: 'PASS_FOR_DECLARED_CLASS' as const,
    gitRevision: evidence.gitRevision,
    mandateRef: evidence.mandateSnapshot.mandates[0]?.mandateRef,
    authorityUseCount: evidence.mandateSnapshot.uses.length,
  }
}

function checksum(evidence: BoundedMandatePacketEvidence) {
  return `sha256:${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`
}

export async function runCli(command: string, path: string) {
  if (command === 'run') {
    const evidence = await runBoundedMandateDevelopmentEvidence()
    verifyBoundedMandateEvidence(evidence)
    const packet: BoundedMandatePacket = {
      schema: 'ae.bounded-mandate-development-evidence:v2',
      checksum: checksum(evidence),
      evidence,
    }
    await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    return packet
  }
  if (command === 'verify') {
    const packet = JSON.parse(await readFile(path, 'utf8')) as BoundedMandatePacket
    if (
      packet.schema !== 'ae.bounded-mandate-development-evidence:v2'
      || packet.checksum !== checksum(packet.evidence)
    ) throw new Error('bounded_mandate_packet_checksum_refused')
    verifyBoundedMandateEvidence(packet.evidence)
    return packet
  }
  throw new Error('usage: evidence:bounded-mandate:development -- <run|verify> <path>')
}

if (process.argv[1]?.endsWith('bounded-mandate-evidence-packet.ts')) {
  const command = process.argv[2]
  const path = process.argv[3]
  if (command === undefined || path === undefined) throw new Error('command_and_path_required')
  const packet = await runCli(command, path)
  process.stdout.write(`${packet.checksum}\n${packet.evidence.gitRevision}\n`)
}
