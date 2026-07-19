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

type Provider = ReturnType<typeof createDevelopmentBookingProvider>

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
    events: readonly TransferBoundaryEvent[]
  }>

export async function runReservationInvocation(input: Readonly<{
  provider: Provider
  booking: DevelopmentBookingInput
  origin: ActionInvocationOrigin
  ref: string
  nowMs?: number
  loseResponseAfterRelease?: boolean
  verifyReconciliationEvidence?: ReconciliationEvidenceVerifier
}>): Promise<BookingInvocationRun<DevelopmentBookingResult>> {
  const events: TransferBoundaryEvent[] = []
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
  const tracer = createDurableActionInvocationTracer({
    action: createDevelopmentReservationAction,
    port: createDevelopmentDurablePort(state),
    now: developmentBookingNow,
    developmentReleaseSignal: release,
    ...(input.verifyReconciliationEvidence === undefined
      ? {}
      : { verifyReconciliationEvidence: input.verifyReconciliationEvidence }),
    nextInvocationRef: () => `mock:booking-invocation:${input.ref}`,
    nextAuthorityRef: () => `mock:booking-authority:${input.ref}`,
    nextAttemptRef: () => `mock:booking-attempt:${input.ref}`,
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
