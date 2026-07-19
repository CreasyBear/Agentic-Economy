import {
  createDevelopmentStandingMandateGrantVerifier,
  evaluateStandingMandatePolicy,
  issueStandingMandate,
  StandingMandateStore,
  type StandingMandatePolicyDecision,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  cancelDevelopmentReservationAction,
  createDevelopmentReservationAction,
} from './development-booking.actions'
import {
  bookingInput,
  cancellationInput,
  developmentBookingNow,
} from './development-booking-fixture'
import { createDevelopmentBookingMandateService } from './development-booking-mandate'
import { projectDurableRun } from './development-booking-packet'
import { createDevelopmentBookingProvider } from './development-booking-provider'
import { runCancellationInvocation, runReservationInvocation } from './development-booking-runner'

const objective = 'Book one development consultation and cancel it if the provider confirms the objective no longer requires attendance.'
const principalRef = 'mock:principal:full-yolo'
const callerRef = 'mock:caller:full-yolo'
const delegateRef = 'mock:delegate:full-yolo'
const origin = { kind: 'standalone', principalRef, callerRef } as const

export async function runFullYoloDevelopmentObjective() {
  const providerA = createDevelopmentBookingProvider({
    providerRef: 'mock:provider:calendar:a',
    slotRef: 'mock:slot:a',
    refusal: 'terms_changed',
  })
  const providerB = createDevelopmentBookingProvider({
    providerRef: 'mock:provider:calendar:b',
    slotRef: 'mock:slot:b',
  })
  const slotA = await providerA.availability()
  const slotB = await providerB.availability()
  const mandate = issueStandingMandate({
    mode: 'full_yolo',
    mandateRef: 'mock:standing-mandate:full-yolo',
    version: 1,
    generation: 1,
    grantorRef: 'mock:grantor:customer',
    principalRef,
    delegateRef,
    callerRef,
    issuedAt: developmentBookingNow(),
    scope: {
      objective,
      action: { id: createDevelopmentReservationAction.id, version: 'v1' },
      actions: [
        { id: createDevelopmentReservationAction.id, version: 'v1' },
        { id: cancelDevelopmentReservationAction.id, version: 'v1' },
      ],
      providerRefs: [slotA.providerRef, slotB.providerRef],
      recipientRefs: [slotA.providerRef, slotB.providerRef],
      purposes: ['create_development_reservation', 'cancel_development_reservation'],
      allowedDataFields: ['customer.name', 'customer.email', 'reason'],
      maximumSpend: { amountMinor: 10_000, currency: 'AUD' },
      maximumLoss: { amountMinor: 5_000, currency: 'AUD' },
      maximumActionCount: 4,
      maximumConcurrentReservations: 2,
      startsAt: developmentBookingNow(),
      expiresAt: '2026-07-19T05:00:00.000Z',
      permittedFallbacks: ['provider_a_primary', 'provider_b_after_terms_refusal', 'none'],
      riskCeiling: 'development_booking_bounded_loss',
    },
  })
  const verifier = createDevelopmentStandingMandateGrantVerifier({
    admittedMandateDigest: mandate.digest,
    evidenceRef: 'mock:evidence:full-yolo-grant',
    verifierRef: 'mock:verifier:full-yolo-grant',
    source: 'mock:authenticated-principal-grant:v1',
    freshUntil: '2026-07-19T04:30:00.000Z',
  })
  const grant = verifier(mandate, developmentBookingNow())
  if (!grant.authenticated) throw new Error(grant.reason)
  let store = new StandingMandateStore()
  const issued = store.issue(mandate, grant, developmentBookingNow())
  if (issued.kind === 'refused') throw new Error(issued.code)
  let service = bookingService(store)
  const decisions: Array<StandingMandatePolicyDecision & { actionId: string; providerRef: string }> = []

  const choose = (proposal: Parameters<typeof evaluateStandingMandatePolicy>[0]['proposal']) => {
    const decision = evaluateStandingMandatePolicy({
      mandate,
      proposal,
      uses: store.exportSnapshot().uses,
    })
    if (decision.kind === 'refused') throw new Error(decision.code)
    decisions.push({ ...decision.value, actionId: proposal.action.id, providerRef: proposal.providerRef })
    return decision.value
  }

  choose({
    objective,
    action: { id: createDevelopmentReservationAction.id, version: 'v1' },
    providerRef: slotA.providerRef,
    recipientRef: slotA.providerRef,
    purpose: 'create_development_reservation',
    dataFields: ['customer.name', 'customer.email'],
    spend: { amountMinor: 0, currency: 'AUD' },
    worstCaseLoss: { amountMinor: 0, currency: 'AUD' },
    fallbackRef: 'provider_a_primary',
    risk: 'development_booking_bounded_loss',
  })
  const first = await runReservationInvocation({
    provider: providerA,
    booking: bookingInput(slotA, principalRef, 'mock:operation:full-yolo:a'),
    origin,
    ref: 'full-yolo-a',
    boundedMandate: {
      service,
      mandateRef: mandate.mandateRef,
      authorityUseRef: 'mock:authority-use:full-yolo:a',
      fallbackRef: 'provider_a_primary',
      reservedLossMinor: 0,
      risk: 'development_booking_bounded_loss',
    },
  })
  if (first.view.observedResolution.state !== 'returned'
    || first.view.observedResolution.result.kind !== 'reservation_refused') {
    throw new Error('provider_a_expected_refusal_missing')
  }

  choose({
    objective,
    action: { id: createDevelopmentReservationAction.id, version: 'v1' },
    providerRef: slotB.providerRef,
    recipientRef: slotB.providerRef,
    purpose: 'create_development_reservation',
    dataFields: ['customer.name', 'customer.email'],
    spend: { amountMinor: 5_000, currency: 'AUD' },
    worstCaseLoss: { amountMinor: 5_000, currency: 'AUD' },
    fallbackRef: 'provider_b_after_terms_refusal',
    risk: 'development_booking_bounded_loss',
  })
  const second = await runReservationInvocation({
    provider: providerB,
    booking: bookingInput(slotB, principalRef, 'mock:operation:full-yolo:b'),
    origin,
    ref: 'full-yolo-b',
    boundedMandate: {
      service,
      mandateRef: mandate.mandateRef,
      authorityUseRef: 'mock:authority-use:full-yolo:b',
      fallbackRef: 'provider_b_after_terms_refusal',
      reservedSpendMinor: 5_000,
      reservedLossMinor: 5_000,
      risk: 'development_booking_bounded_loss',
      reconstructBeforeRelease: () => {
        store = new StandingMandateStore(structuredClone(store.exportSnapshot()))
        service = bookingService(store)
        return service
      },
    },
  })
  if (second.view.observedResolution.state !== 'returned'
    || second.view.observedResolution.result.kind !== 'reservation_confirmed') {
    throw new Error('provider_b_confirmation_missing')
  }
  const confirmed = second.view.observedResolution.result

  choose({
    objective,
    action: { id: cancelDevelopmentReservationAction.id, version: 'v1' },
    providerRef: slotB.providerRef,
    recipientRef: slotB.providerRef,
    purpose: 'cancel_development_reservation',
    dataFields: ['reason'],
    spend: { amountMinor: 0, currency: 'AUD' },
    worstCaseLoss: { amountMinor: 0, currency: 'AUD' },
    fallbackRef: 'none',
    risk: 'development_booking_bounded_loss',
  })
  const cancellation = await runCancellationInvocation({
    provider: providerB,
    cancellation: cancellationInput({
      reservationRef: confirmed.reservationRef,
      providerRef: confirmed.providerRef,
      principalRef,
      operationKey: 'mock:operation:full-yolo:cancel',
    }),
    origin,
    ref: 'full-yolo-cancel',
    fullYoloMandate: {
      service,
      mandateRef: mandate.mandateRef,
      authorityUseRef: 'mock:authority-use:full-yolo:cancel',
    },
  })
  if (cancellation.view.observedResolution.state !== 'returned'
    || cancellation.view.observedResolution.result.kind !== 'reservation_cancellation_confirmed') {
    throw new Error('provider_confirmed_cancellation_missing')
  }
  const cancellationResult = cancellation.view.observedResolution.result
  const offset = store.recordExposureOffset({
    authorityUseRef: 'mock:authority-use:full-yolo:b',
    offsetAuthorityUseRef: 'mock:authority-use:full-yolo:cancel',
    amountMinor: 5_000,
    currency: 'AUD',
    evidenceRef: cancellationResult.evidenceRef,
    offsetAction: { id: cancelDevelopmentReservationAction.id, version: 'v1' },
    evidenceRuleRef: 'provider_confirmed_cancellation:v1',
    recordedAt: developmentBookingNow(),
  }, (candidate) =>
    candidate.evidenceRef === cancellationResult.evidenceRef
    && candidate.offsetAuthorityUseRef === 'mock:authority-use:full-yolo:cancel')
  if (offset.kind === 'refused') throw new Error(offset.code)

  const cold = new StandingMandateStore(structuredClone(store.exportSnapshot()))
  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    objective,
    grant,
    mandateSnapshot: cold.exportSnapshot(),
    policyDecisions: decisions,
    objectiveDecisionRecords: [
      { ordinal: 0, kind: 'attempt_primary', providerRef: slotA.providerRef },
      { ordinal: 1, kind: 'fallback_after_terms_refusal', providerRef: slotB.providerRef },
      { ordinal: 2, kind: 'cancel_on_source_owned_condition', providerRef: slotB.providerRef },
    ],
    invocations: [first, second, cancellation].map((run) => ({
      invocationRef: run.view.invocationRef,
      action: run.view.action,
      acceptedAuthority: run.view.acceptedAuthority,
      events: run.events,
      durable: projectDurableRun(run),
      resultDigest: canonicalDigest(run.view.observedResolution),
    })),
    providerEffects: {
      providerA: providerA.effectCount(),
      providerB: providerB.effectCount(),
      cancellation: providerB.cancellationEffectCount(),
    },
    capacityAfterCancellation: cold.capacity(mandate.mandateRef),
    comparison: {
      approveEachPrincipalDecisions: 3,
      boundedMandateStopsAtDifferentAction: true,
      fullYoloPrincipalGrantDecisions: 1,
      repeatedPrincipalDecisions: 0,
      retainedExactAuthorityUses: cold.exportSnapshot().uses.length,
    },
    claimCeiling: 'Labelled local deterministic development behavior only; no reachable host, live provider, durable multi-worker CAS, deployment, production safety, or customer value.',
  }
}

function bookingService(store: StandingMandateStore) {
  return createDevelopmentBookingMandateService({
    store,
    authenticatedDelegate: { delegateRef, principalRef, callerRef },
    now: developmentBookingNow,
  })
}
