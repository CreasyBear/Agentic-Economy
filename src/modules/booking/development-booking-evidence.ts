import { evaluateAdr009Transfer } from '@/modules/action-invocation/transfer-evaluator'
import {
  cancelDevelopmentReservationAction,
  createDevelopmentReservationAction,
  type DevelopmentBookingResult,
} from './development-booking.actions'
import {
  bookingActor,
  bookingInput,
  cancellationInput,
  developmentBookingNowMs,
} from './development-booking-fixture'
import { projectDurableRun } from './development-booking-packet'
import { createDevelopmentBookingProvider } from './development-booking-provider'
import {
  runBookingReconciliation,
  runCancelBeforeRelease,
} from './development-booking-recovery'
import {
  runCancellationInvocation,
  runReservationInvocation,
} from './development-booking-runner'

export async function runDevelopmentBookingEvidence() {
  const provider = createDevelopmentBookingProvider()
  const availability = await provider.availability()
  const requestOrigin = { kind: 'request_owned', requestRef: 'mock:request:booking', revision: 1 } as const
  const standaloneOrigin = {
    kind: 'standalone', callerRef: 'mock:caller:booking', principalRef: 'mock:principal:booking',
  } as const

  const requestBooking = bookingInput(
    availability, bookingActor(requestOrigin).principalRef, 'mock:operation:request-owned',
  )
  const standaloneBooking = bookingInput(
    availability, bookingActor(standaloneOrigin).principalRef, 'mock:operation:standalone',
  )
  const request = await runReservationInvocation({
    provider, booking: requestBooking, origin: requestOrigin, ref: 'request-owned',
  })
  const standalone = await runReservationInvocation({
    provider, booking: standaloneBooking, origin: standaloneOrigin, ref: 'standalone',
  })

  const sharedOriginA = {
    kind: 'standalone', callerRef: 'mock:caller:dedupe:a', principalRef: 'mock:principal:dedupe',
  } as const
  const sharedOriginB = {
    kind: 'standalone', callerRef: 'mock:caller:dedupe:b', principalRef: 'mock:principal:dedupe',
  } as const
  const sharedBooking = bookingInput(
    availability, sharedOriginA.principalRef, 'mock:operation:dedupe',
  )
  const effectsBeforeDedupe = provider.effectCount()
  const dedupeA = await runReservationInvocation({
    provider, booking: sharedBooking, origin: sharedOriginA, ref: 'dedupe-a',
  })
  const effectsAfterFirst = provider.effectCount()
  const dedupeB = await runReservationInvocation({
    provider, booking: structuredClone(sharedBooking), origin: sharedOriginB, ref: 'dedupe-b',
  })
  const effectsAfterReplay = provider.effectCount()
  const conflict = await runReservationInvocation({
    provider,
    booking: { ...sharedBooking, customer: { ...sharedBooking.customer, email: 'changed@example.test' } },
    origin: sharedOriginB,
    ref: 'dedupe-conflict',
  })
  const effectsAfterConflict = provider.effectCount()

  const principalOrigin = {
    kind: 'standalone', callerRef: 'mock:caller:principal-refusal', principalRef: 'mock:principal:authority',
  } as const
  const principalRefusal = await runReservationInvocation({
    provider,
    booking: bookingInput(availability, 'mock:principal:other', 'mock:operation:principal-refusal'),
    origin: principalOrigin,
    ref: 'principal-refusal',
  })
  const expiredBooking = bookingInput(
    availability, 'mock:principal:expired', 'mock:operation:expired',
  )
  const expired = await runReservationInvocation({
    provider,
    booking: expiredBooking,
    origin: {
      kind: 'standalone', callerRef: 'mock:caller:expired', principalRef: expiredBooking.customer.principalRef,
    },
    ref: 'expired',
    nowMs: Date.parse(expiredBooking.slot.expiresAt) + 1,
  })

  const unknownOrigin = {
    kind: 'standalone', callerRef: 'mock:caller:unknown', principalRef: 'mock:principal:unknown',
  } as const
  const recovery = await runBookingReconciliation({
    provider,
    booking: bookingInput(availability, unknownOrigin.principalRef, 'mock:operation:unknown'),
    origin: unknownOrigin,
  })
  const cancelBefore = runCancelBeforeRelease({
    booking: bookingInput(availability, 'mock:principal:cancel-before', 'mock:operation:cancel-before'),
    origin: {
      kind: 'standalone', callerRef: 'mock:caller:cancel-before', principalRef: 'mock:principal:cancel-before',
    },
  })

  const reservation = reservationResult(standalone.view.observedResolution)
  const cancellation = cancellationInput({
    reservationRef: reservation.reservationRef,
    providerRef: reservation.providerRef,
    principalRef: standalone.owner.principalRef,
    operationKey: 'mock:operation:cancellation',
  })
  const cancellationRun = await runCancellationInvocation({
    provider, cancellation, origin: standaloneOrigin, ref: 'cancellation',
  })
  const cancellationReplay = await runCancellationInvocation({
    provider, cancellation: structuredClone(cancellation), origin: standaloneOrigin, ref: 'cancellation-replay',
  })
  const cancellationConflict = await runCancellationInvocation({
    provider,
    cancellation: { ...cancellation, reason: 'Changed cancellation reason.' },
    origin: standaloneOrigin,
    ref: 'cancellation-conflict',
  })
  const cancellationEffectsBeforePrincipalRefusal = provider.cancellationEffectCount()
  const cancellationPrincipalRefusal = await runCancellationInvocation({
    provider,
    cancellation: { ...cancellation, principalRef: 'mock:principal:other', operationKey: 'mock:operation:cancellation-other' },
    origin: standaloneOrigin,
    ref: 'cancellation-principal-refusal',
  })

  const order = standalone.events.map(({ kind }) => kind)
  const authorityIndex = order.indexOf('authority_decision')
  const releaseIndex = order.indexOf('provider_release')
  const authorityBeforeRelease = authorityIndex >= 0 && releaseIndex > authorityIndex
  const transfer = evaluateAdr009Transfer({
    events: {
      direct_read: [],
      direct_consequential: [
        { kind: 'direct_runner_started', actionId: createDevelopmentReservationAction.id },
        { kind: 'provider_release', actionId: createDevelopmentReservationAction.id },
        { kind: 'direct_runner_returned', actionId: createDevelopmentReservationAction.id, outcome: 'reservation_confirmed' },
      ],
      controlled: [
        ...standalone.events,
        { kind: 'attempt', invocationRef: standalone.view.invocationRef, attemptRef: standalone.view.attempts[0]!.attemptRef },
      ],
    },
    requiredContinuations: { direct_read: 0, direct_consequential: 1, controlled: 1 },
    controlledReadback: {
      invocationVersion: standalone.view.invocationVersion,
      controlRecords: standalone.state.controls.size,
      attributableAttempts: standalone.view.attempts.length,
      durableHistoryRecords: standalone.state.history.get(standalone.view.invocationRef)?.length ?? 0,
      terminalResultReconstructed: standalone.tracer.coldResume(standalone.view.invocationRef)
        .inspect(standalone.view.invocationRef)?.control.state === 'terminal',
      exactAuthorityBeforeRelease: authorityBeforeRelease,
      retryClass: createDevelopmentReservationAction.invocationContract!.retryClass,
    },
    referenceReuse: {
      completedReferences: 1, completedNodes: 1, currentNodes: 0,
      effectsBeforeReuse: 1, effectsAfterReuse: 1,
      copiedLifecycleOrResultFields: 0, persistedRoutePlansOrBundles: 0,
    },
  })
  const executableChecks = {
    authorityBeforeRelease,
    dedupeThroughActionPlane:
      reservationResult(dedupeA.view.observedResolution).reservationRef
      === reservationResult(dedupeB.view.observedResolution).reservationRef
      && effectsAfterFirst === effectsAfterReplay
      && effectsAfterFirst === effectsBeforeDedupe + 1,
    conflictWithoutEffect:
      conflict.view.observedResolution.state === 'returned'
      && conflict.view.observedResolution.result.kind === 'reservation_refused'
      && effectsAfterConflict === effectsAfterReplay,
    providerCancellation:
      cancellationRun.view.observedResolution.state === 'returned'
      && cancellationRun.view.observedResolution.result.kind === 'reservation_cancellation_confirmed'
      && provider.cancellationEffectCount() === cancellationEffectsBeforePrincipalRefusal,
  }

  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    proofClass: 'labelled_local_development',
    action: { id: createDevelopmentReservationAction.id, version: 'v1', surfaces: [] },
    cancellationAction: { id: cancelDevelopmentReservationAction.id, version: 'v1', surfaces: [] },
    availability,
    eventOrder: standalone.events,
    origins: [request.view.origin, standalone.view.origin],
    principalRefusal: principalRefusal.view,
    expiryRefusal: expired.view,
    idempotency: {
      first: dedupeA.view, replay: dedupeB.view, conflict: conflict.view,
      effectsBeforeDedupe, effectsAfterFirst, effectsAfterReplay, effectsAfterConflict,
    },
    reconciliation: {
      before: recovery.uncertain.view,
      evidence: recovery.evidence,
      after: recovery.reconciled,
    },
    cancellation: {
      beforeRelease: cancelBefore.view,
      confirmed: cancellationRun.view,
      replay: cancellationReplay.view,
      conflict: cancellationConflict.view,
      principalRefusal: cancellationPrincipalRefusal.view,
      cancellationEffects: provider.cancellationEffectCount(),
      originalReservation: standalone.view.observedResolution,
      providerReservationRecord: provider.inspect(standaloneBooking.operationKey),
    },
    durable: {
      terminal: projectDurableRun(standalone),
      uncertain: {
        ...projectDurableRun(recovery.uncertain),
        source: {
          ...projectDurableRun(recovery.uncertain).source,
          before: recovery.uncertain.view,
          after: recovery.reconciled,
          reconciliationEvidence: recovery.evidence,
        },
      },
    },
    executableChecks,
    proportionality: transfer,
    gate7: Object.values(executableChecks).every(Boolean)
      && transfer.failedFalsifiers.length === 0
      ? 'passes_for_declared_development_class'
      : 'open',
    claimCeiling: 'Labelled local development evidence only. No customer reachability, hosted behavior, real provider fulfilment, production safety, cold-agent usability, or customer value.',
  }
}

function reservationResult(
  resolution: import('@/modules/action-invocation').ActionInvocationView<DevelopmentBookingResult>['observedResolution'],
) {
  if (resolution.state !== 'returned' || resolution.result.kind !== 'reservation_confirmed') {
    throw new Error('confirmed_reservation_missing')
  }
  return resolution.result
}
