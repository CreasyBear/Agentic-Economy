import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionInvocationTracer,
  type ActionInvocationOrigin,
  type PreparedInvocation,
  type ReconciliationEvidenceMaterial,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createDevelopmentReservationAction,
  type DevelopmentBookingInput,
  type DevelopmentBookingResult,
} from './development-booking.actions'
import { bookingActor, developmentBookingNow } from './development-booking-fixture'
import type { createDevelopmentBookingProvider } from './development-booking-provider'
import { runReservationInvocation } from './development-booking-runner'

type Provider = ReturnType<typeof createDevelopmentBookingProvider>

export async function runBookingReconciliation(input: Readonly<{
  provider: Provider
  booking: DevelopmentBookingInput
  origin: ActionInvocationOrigin
}>) {
  const issued = new Set<string>()
  const uncertain = await runReservationInvocation({
    ...input,
    ref: 'unknown',
    loseResponseAfterRelease: true,
    verifyReconciliationEvidence: (evidence) => issued.has(canonicalDigest(evidence)),
  })
  const attempt = uncertain.view.attempts[0]!
  const material: ReconciliationEvidenceMaterial = {
    kind: 'action_invocation_reconciliation',
    version: 1,
    evidenceRef: 'mock:evidence:booking-observer',
    source: 'booking.createDevelopmentReservation:mock-provider-observer:v1',
    invocationRef: uncertain.view.invocationRef,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
    resolution: 'released',
    observedAt: developmentBookingNow(),
  }
  const evidence = { ...material, digest: canonicalDigest(material) }
  issued.add(canonicalDigest(evidence))
  const reconciled = uncertain.tracer.coldResume(uncertain.view.invocationRef).reconcile({
    invocationRef: uncertain.view.invocationRef,
    expectedInvocationVersion: uncertain.view.invocationVersion,
    attemptRef: attempt.attemptRef,
    actor: uncertain.owner,
    origin: uncertain.origin,
    evidence,
  })
  if (reconciled.kind !== 'accepted') throw new Error(reconciled.code)
  return { uncertain, attempt, evidence, reconciled: reconciled.view }
}

export function runCancelBeforeRelease(input: Readonly<{
  booking: DevelopmentBookingInput
  origin: ActionInvocationOrigin
}>) {
  const owner = bookingActor(input.origin)
  const state = createDevelopmentDurableState<DevelopmentBookingResult>()
  let preparedSource: PreparedInvocation | undefined
  const tracer = createDurableActionInvocationTracer({
    action: createDevelopmentReservationAction,
    port: createDevelopmentDurablePort(state),
    now: developmentBookingNow,
    nextInvocationRef: () => 'mock:booking-invocation:cancel-before',
    nextAuthorityRef: () => 'mock:booking-authority:cancel-before',
    nextAttemptRef: () => 'mock:booking-attempt:cancel-before',
    resolveSourceState: () => ({
      input: input.booking,
      context: {},
      prepared: preparedSource,
      observedResolution: { state: 'pending' },
    }),
  })
  const prepared = tracer.prepare({
    origin: input.origin, actor: owner, input: input.booking, context: {}, freshnessMs: 900_000,
  })
  preparedSource = prepared.prepared
  const decision = tracer.decide({
    invocationRef: prepared.invocationRef,
    expectedInvocationVersion: prepared.invocationVersion,
    authorityRef: prepared.authority!.reference,
    actor: owner, origin: input.origin, accept: true,
  })
  if (decision.kind !== 'accepted') throw new Error(decision.code)
  const cancelled = tracer.cancel({
    invocationRef: prepared.invocationRef,
    expectedInvocationVersion: decision.view.invocationVersion,
    actor: owner, origin: input.origin,
  })
  if (cancelled.kind !== 'accepted') throw new Error(cancelled.code)
  return { view: cancelled.view, state }
}
