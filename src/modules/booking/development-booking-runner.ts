import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionInvocationTracer,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type PreparedInvocation,
  type ReconciliationEvidenceVerifier,
} from '@/modules/action-invocation'
import type { TransferBoundaryEvent } from '@/modules/action-invocation/transfer-evaluator'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  cancelDevelopmentReservationAction,
  createDevelopmentReservationAction,
  type DevelopmentBookingCancellationInput,
  type DevelopmentBookingCancellationResult,
  type DevelopmentBookingInput,
  type DevelopmentBookingResult,
} from './development-booking.actions'
import { bookingActor, developmentBookingNow } from './development-booking-fixture'
import type { createDevelopmentBookingProvider } from './development-booking-provider'
import {
  mandateRefusalToInvocationRefusal,
  type DevelopmentBookingMandateService,
} from './development-booking-mandate'

type Provider = ReturnType<typeof createDevelopmentBookingProvider>
type BookingInvocationEvent = TransferBoundaryEvent | Readonly<{
  kind: 'standing_mandate_authorization'
  invocationRef: string
}>

export type BookingInvocationRun<Result extends DevelopmentBookingResult | DevelopmentBookingCancellationResult> =
  Readonly<{
    view: ActionInvocationView<Result>
    origin: ActionInvocationOrigin
    owner: ReturnType<typeof bookingActor>
    state: ReturnType<typeof createDevelopmentDurableState<Result>>
    tracer: ReturnType<typeof createDurableActionInvocationTracer<unknown, Result>>
    source: Readonly<{
      input: unknown
      prepared: PreparedInvocation | undefined
      result?: Result
      resultIdentity?: Readonly<{ sourceResultRef: string; resultDigest: string }>
    }>
    events: readonly BookingInvocationEvent[]
  }>

export async function runReservationInvocation(input: Readonly<{
  provider: Provider
  booking: DevelopmentBookingInput
  origin: ActionInvocationOrigin
  ref: string
  nowMs?: number
  loseResponseAfterRelease?: boolean
  unknownWithoutProviderRelease?: boolean
  verifyReconciliationEvidence?: ReconciliationEvidenceVerifier
  boundedMandate?: Readonly<{
    service: DevelopmentBookingMandateService
    mandateRef: string
    authorityUseRef: string
    afterReservation?: () => void
    reconstructBeforeRelease?: (
      view: ActionInvocationView<DevelopmentBookingResult>,
    ) => DevelopmentBookingMandateService
    developmentAuthorizationVersionOverride?: number
    developmentAcquisitionVersionOverride?: number
  }>
}>): Promise<BookingInvocationRun<DevelopmentBookingResult>> {
  const events: BookingInvocationEvent[] = []
  const source: {
    input: DevelopmentBookingInput
    prepared: PreparedInvocation | undefined
    result?: DevelopmentBookingResult
    resultIdentity?: { sourceResultRef: string; resultDigest: string }
  } = { input: input.booking, prepared: undefined }
  const owner = bookingActor(input.origin)
  const release = createDevelopmentReleaseSignal()
  const nowMs = input.nowMs ?? Date.parse(developmentBookingNow())
  const context = {
    developmentOnlyBookingNow: () => nowMs,
    developmentOnlyBookingAuthorityPrincipalRef: owner.principalRef,
    developmentOnlyBookingAvailabilityCheck: (raw: unknown, now: number) =>
      input.provider.check(raw as DevelopmentBookingInput, now),
    developmentOnlyBookingAdapter: async (raw: unknown) => {
      if (input.unknownWithoutProviderRelease === true) {
        throw new Error('mock_transport_failed_before_provider_release_observation')
      }
      events.push({ kind: 'provider_release' as const, actionId: createDevelopmentReservationAction.id })
      release.markReleased()
      const result = await input.provider.reserve(raw as DevelopmentBookingInput)
      if (input.loseResponseAfterRelease === true) throw new Error('mock_response_lost_after_possible_release')
      source.result = result
      source.resultIdentity = {
        sourceResultRef: result.kind === 'reservation_confirmed'
          ? result.reservationRef
          : `mock:booking-refusal:${input.ref}`,
        resultDigest: canonicalDigest(result),
      }
      return result
    },
  }
  const state = createDevelopmentDurableState<DevelopmentBookingResult>()
  const configuredMandate = input.boundedMandate
  let activeMandateService = configuredMandate?.service
  const tracer = createDurableActionInvocationTracer<DevelopmentBookingInput, DevelopmentBookingResult>({
    action: createDevelopmentReservationAction,
    port: createDevelopmentDurablePort(state),
    now: developmentBookingNow,
    ...(input.unknownWithoutProviderRelease === true ? {} : { developmentReleaseSignal: release }),
    ...(input.verifyReconciliationEvidence === undefined
      ? {}
      : { verifyReconciliationEvidence: input.verifyReconciliationEvidence }),
    nextInvocationRef: () => `mock:booking-invocation:${input.ref}`,
    nextAuthorityRef: () => `mock:booking-authority:${input.ref}`,
    nextAttemptRef: () => `mock:booking-attempt:${input.ref}`,
    ...(configuredMandate === undefined ? {} : {
      beforeEffectRelease: (current, effectGeneration) => {
        if (activeMandateService === undefined) return 'authority_not_accepted' as const
        const checked = activeMandateService.recheckRelease({
          authorityUseRef: configuredMandate.authorityUseRef,
          view: current,
          effectGeneration,
        })
        return checked.kind === 'accepted'
          ? undefined
          : mandateRefusalToInvocationRefusal(checked.code)
      },
    }),
    resolveSourceState: () => ({
      input: source.input, context, prepared: source.prepared,
      observedResolution: source.result === undefined
        ? { state: 'pending' as const }
        : {
            state: 'returned' as const, execution: 'runner_returned' as const,
            businessOutcome: source.result.kind === 'reservation_confirmed' ? 'completed' : 'refused',
            resultReferenceable: source.result.kind === 'reservation_confirmed',
            result: source.result,
          },
      ...(source.resultIdentity === undefined ? {} : { resultIdentity: source.resultIdentity }),
    }),
  })
  const prepared = tracer.prepare({
    origin: input.origin, actor: owner, input: input.booking, context, freshnessMs: 900_000,
  })
  source.prepared = prepared.prepared
  if (configuredMandate === undefined) {
    const decision = tracer.decide({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: owner, origin: input.origin, accept: true,
    })
    if (decision.kind !== 'accepted') throw new Error(decision.code)
    events.push({ kind: 'authority_decision', invocationRef: prepared.invocationRef })
    const executed = await tracer.execute({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: decision.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: owner, origin: input.origin, materialInput: input.booking,
    })
    if (executed.kind !== 'accepted') throw new Error(executed.code)
    return { view: executed.view, origin: input.origin, owner, state, tracer: tracer as never, source, events }
  }
  const bounded = configuredMandate
  activeMandateService = bounded.service
  const reserved = bounded.service.reserveAndAuthorize({
    mandateRef: bounded.mandateRef,
    authorityUseRef: bounded.authorityUseRef,
    view: prepared,
    origin: input.origin,
    booking: input.booking,
    effectGeneration: prepared.attempts.length + 1,
  })
  if (reserved.kind === 'refused') throw new Error(reserved.code)
  let standingAuthorization
  try {
    standingAuthorization = tracer.authorizeStandingMandateUse({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: bounded.developmentAuthorizationVersionOverride
        ?? prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: owner,
      origin: input.origin,
      basis: reserved.value.basis,
    })
  } catch (error) {
    throw compensateAndPreserve(
      bounded.service,
      bounded.authorityUseRef,
      error instanceof Error ? error.message : 'standing_authorization_threw',
    )
  }
  if (standingAuthorization.kind === 'refused') {
    throw compensateAndPreserve(
      bounded.service,
      bounded.authorityUseRef,
      standingAuthorization.code,
    )
  }
  events.push({ kind: 'standing_mandate_authorization', invocationRef: prepared.invocationRef })
  let acquired
  try {
    acquired = tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: bounded.developmentAcquisitionVersionOverride
        ?? standingAuthorization.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: owner, origin: input.origin, materialInput: input.booking,
      leaseOwner: `mock:booking-worker:${input.ref}`,
      leaseMs: 30_000,
      acceptedAuthorityBasis: reserved.value.basis,
    })
  } catch (error) {
    throw compensateAndPreserve(
      bounded.service,
      bounded.authorityUseRef,
      error instanceof Error ? error.message : 'standing_acquisition_threw',
    )
  }
  if (acquired.kind !== 'accepted' || acquired.view.control.state !== 'leased') {
    throw compensateAndPreserve(
      bounded.service,
      bounded.authorityUseRef,
      acquired.kind === 'refused' ? acquired.code : 'booking_acquisition_failed',
    )
  }
  if (bounded.reconstructBeforeRelease !== undefined) {
    activeMandateService = bounded.reconstructBeforeRelease(
      tracer.coldResume(prepared.invocationRef).inspect(prepared.invocationRef) ?? acquired.view,
    )
  }
  try {
    bounded.afterReservation?.()
  } catch (error) {
    throw compensateAndPreserve(
      activeMandateService,
      bounded.authorityUseRef,
      error instanceof Error ? error.message : 'pre_release_hook_threw',
    )
  }
  let executed
  try {
    executed = await tracer.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
  } catch (error) {
    throw compensateAndPreserve(
      activeMandateService,
      bounded.authorityUseRef,
      error instanceof Error ? error.message : 'pre_release_execution_threw',
    )
  }
  if (executed.kind !== 'accepted') {
    const settlement = activeMandateService.settleFromInvocation({
      authorityUseRef: bounded.authorityUseRef,
      view: executed.view ?? acquired.view,
      attemptRef: acquired.view.control.attemptRef,
    })
    if (settlement.kind === 'refused') throw new Error(settlement.code)
    throw new Error(executed.code)
  }
  const settled = activeMandateService.settleFromInvocation({
    authorityUseRef: bounded.authorityUseRef,
    view: executed.view,
    attemptRef: acquired.view.control.attemptRef,
  })
  if (settled.kind === 'refused') throw new Error(settled.code)
  return { view: executed.view, origin: input.origin, owner, state, tracer: tracer as never, source, events }
}

function compensateAndPreserve(
  service: DevelopmentBookingMandateService,
  authorityUseRef: string,
  originalRefusal: string,
): Error {
  const compensation = service.compensateNotReleased(authorityUseRef)
  return compensation.kind === 'accepted'
    ? new Error(originalRefusal)
    : new Error(`${originalRefusal}; compensation_failed:${compensation.code}`)
}

export async function runCancellationInvocation(input: Readonly<{
  provider: Provider
  cancellation: DevelopmentBookingCancellationInput
  origin: ActionInvocationOrigin
  ref: string
}>): Promise<BookingInvocationRun<DevelopmentBookingCancellationResult>> {
  const events: TransferBoundaryEvent[] = []
  const source: {
    input: DevelopmentBookingCancellationInput
    prepared: PreparedInvocation | undefined
    result?: DevelopmentBookingCancellationResult
    resultIdentity?: { sourceResultRef: string; resultDigest: string }
  } = { input: input.cancellation, prepared: undefined }
  const owner = bookingActor(input.origin)
  const release = createDevelopmentReleaseSignal()
  const context = {
    developmentOnlyBookingAuthorityPrincipalRef: owner.principalRef,
    developmentOnlyBookingCancellationCheck: (raw: unknown) =>
      input.provider.checkCancellation(raw as DevelopmentBookingCancellationInput),
    developmentOnlyBookingCancellationAdapter: async (raw: unknown) => {
      events.push({ kind: 'provider_release' as const, actionId: cancelDevelopmentReservationAction.id })
      release.markReleased()
      const result = await input.provider.cancel(raw as DevelopmentBookingCancellationInput)
      source.result = result
      source.resultIdentity = {
        sourceResultRef: result.kind === 'reservation_cancellation_confirmed'
          ? result.cancellationRef : `mock:cancellation-refusal:${input.ref}`,
        resultDigest: canonicalDigest(result),
      }
      return result
    },
  }
  const state = createDevelopmentDurableState<DevelopmentBookingCancellationResult>()
  const tracer = createDurableActionInvocationTracer({
    action: cancelDevelopmentReservationAction,
    port: createDevelopmentDurablePort(state),
    now: developmentBookingNow,
    developmentReleaseSignal: release,
    nextInvocationRef: () => `mock:cancellation-invocation:${input.ref}`,
    nextAuthorityRef: () => `mock:cancellation-authority:${input.ref}`,
    nextAttemptRef: () => `mock:cancellation-attempt:${input.ref}`,
    resolveSourceState: () => ({
      input: source.input, context, prepared: source.prepared,
      observedResolution: source.result === undefined
        ? { state: 'pending' as const }
        : {
            state: 'returned' as const, execution: 'runner_returned' as const,
            businessOutcome: source.result.kind === 'reservation_cancellation_confirmed' ? 'completed' : 'refused',
            resultReferenceable: source.result.kind === 'reservation_cancellation_confirmed',
            result: source.result,
          },
      ...(source.resultIdentity === undefined ? {} : { resultIdentity: source.resultIdentity }),
    }),
  })
  const prepared = tracer.prepare({
    origin: input.origin, actor: owner, input: input.cancellation, context, freshnessMs: 900_000,
  })
  source.prepared = prepared.prepared
  const decision = tracer.decide({
    invocationRef: prepared.invocationRef,
    expectedInvocationVersion: prepared.invocationVersion,
    authorityRef: prepared.authority!.reference,
    actor: owner, origin: input.origin, accept: true,
  })
  if (decision.kind !== 'accepted') throw new Error(decision.code)
  events.push({ kind: 'authority_decision', invocationRef: prepared.invocationRef })
  const executed = await tracer.execute({
    invocationRef: prepared.invocationRef,
    expectedInvocationVersion: decision.view.invocationVersion,
    authorityRef: prepared.authority!.reference,
    actor: owner, origin: input.origin, materialInput: input.cancellation,
  })
  if (executed.kind !== 'accepted') throw new Error(executed.code)
  return { view: executed.view, origin: input.origin, owner, state, tracer: tracer as never, source, events }
}
