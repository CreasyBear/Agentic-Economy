import {
  createDevelopmentStandingMandateGrantVerifier,
  evaluateStandingMandatePolicy,
  issueStandingMandate,
  materialDigest,
  StandingMandateStore,
  type StandingMandatePolicyDecision,
  type StandingMandate,
  type StandingMandateSnapshot,
} from '@/modules/action-invocation'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { AnyAction } from '@/modules/common/action'
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
import {
  projectDurableRun,
  reconstructDevelopmentBookingInvocation,
} from './development-booking-packet'
import { createDevelopmentBookingProvider } from './development-booking-provider'
import type { DevelopmentBookingProviderSnapshot } from './development-booking-provider'
import {
  createDevelopmentBookingOffsetRuleTrust,
  developmentCancellationConfirmationRule,
} from './development-booking-offset-rule'
import { runCancellationInvocation, runReservationInvocation } from './development-booking-runner'

const objective = 'Book one development consultation and cancel it if the provider confirms the objective no longer requires attendance.'
const principalRef = 'mock:principal:full-yolo'
const callerRef = 'mock:caller:full-yolo'
const delegateRef = 'mock:delegate:full-yolo'
const origin = { kind: 'standalone', principalRef, callerRef } as const
const objectiveRef = 'mock:objective:full-yolo'

export type DevelopmentBookingObjectiveState = Readonly<{
  format: 'ae.development-booking-objective:v1'
  objectiveRef: string
  stage: 'attempt_primary' | 'booking_confirmed' | 'completed'
  currentActionRef: string
  fallbackProgress: Readonly<{
    attemptedProviderRefs: readonly string[]
    activeFallbackRef: string
  }>
  completedInvocationRefs: readonly string[]
  policyDecisionRefs: readonly string[]
  bookingResultRef: string | null
  cancellationResultRef: string | null
  digest: string
}>

function objectiveState(
  material: Omit<DevelopmentBookingObjectiveState, 'format' | 'digest'>,
): DevelopmentBookingObjectiveState {
  const value = { format: 'ae.development-booking-objective:v1' as const, ...material }
  return { ...value, digest: canonicalDigest(value as never) }
}

export function developmentBookingObjectiveStateValid(state: DevelopmentBookingObjectiveState) {
  const { digest, ...material } = state
  return digest === canonicalDigest(material as never)
}

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
      exposureOffsetRules: [developmentCancellationConfirmationRule],
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
  const decisions: StandingMandatePolicyDecision[] = []
  const initialObjectiveState = objectiveState({
    objectiveRef,
    stage: 'attempt_primary',
    currentActionRef: createDevelopmentReservationAction.id,
    fallbackProgress: { attemptedProviderRefs: [], activeFallbackRef: 'provider_a_primary' },
    completedInvocationRefs: [],
    policyDecisionRefs: [],
    bookingResultRef: null,
    cancellationResultRef: null,
  })

  const choose = (
    policyDecisionRef: string,
    proposal: Parameters<typeof evaluateStandingMandatePolicy>[0]['proposal'],
  ) => {
    const decision = evaluateStandingMandatePolicy({
      mandate,
      proposal,
      uses: store.exportSnapshot().uses,
      policyDecisionRef,
    })
    if (decision.kind === 'refused') throw new Error(decision.code)
    const accepted = store.acceptPolicyDecision(decision.value)
    if (accepted.kind === 'refused') throw new Error(accepted.code)
    decisions.push(decision.value)
    return decision.value
  }

  const bookingA = bookingInput(slotA, principalRef, 'mock:operation:full-yolo:a')
  const bookingAInvocationRef = 'mock:booking-invocation:full-yolo-a'
  const decisionA = choose('mock:policy-decision:full-yolo:a', {
    objectiveRef,
    objective,
    sourceOptionRef: slotA.provenance.observationRef,
    materialDigest: materialDigest(
      bookingA,
      createDevelopmentReservationAction.invocationContract!.materialInputPaths,
    ),
    authorityUseRef: 'mock:authority-use:full-yolo:a',
    invocationRef: bookingAInvocationRef,
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
    booking: bookingA,
    origin,
    ref: 'full-yolo-a',
    boundedMandate: {
      service,
      mandateRef: mandate.mandateRef,
      authorityUseRef: 'mock:authority-use:full-yolo:a',
      fallbackRef: 'provider_a_primary',
      reservedLossMinor: 0,
      risk: 'development_booking_bounded_loss',
      policyDecisionRef: decisionA.policyDecisionRef,
    },
  })
  if (first.view.observedResolution.state !== 'returned'
    || first.view.observedResolution.result.kind !== 'reservation_refused') {
    throw new Error('provider_a_expected_refusal_missing')
  }

  const bookingB = bookingInput(slotB, principalRef, 'mock:operation:full-yolo:b')
  const bookingBInvocationRef = 'mock:booking-invocation:full-yolo-b'
  const decisionB = choose('mock:policy-decision:full-yolo:b', {
    objectiveRef,
    objective,
    sourceOptionRef: slotB.provenance.observationRef,
    materialDigest: materialDigest(
      bookingB,
      createDevelopmentReservationAction.invocationContract!.materialInputPaths,
    ),
    authorityUseRef: 'mock:authority-use:full-yolo:b',
    invocationRef: bookingBInvocationRef,
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
    booking: bookingB,
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
      policyDecisionRef: decisionB.policyDecisionRef,
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
  const midObjectiveState = objectiveState({
    objectiveRef,
    stage: 'booking_confirmed',
    currentActionRef: cancelDevelopmentReservationAction.id,
    fallbackProgress: {
      attemptedProviderRefs: [slotA.providerRef, slotB.providerRef],
      activeFallbackRef: 'none',
    },
    completedInvocationRefs: [first.view.invocationRef, second.view.invocationRef],
    policyDecisionRefs: decisions.map(({ policyDecisionRef }) => policyDecisionRef),
    bookingResultRef: confirmed.reservationRef,
    cancellationResultRef: null,
  })
  const midRun = {
    mandateSnapshot: structuredClone(store.exportSnapshot()),
    providerSnapshot: providerB.exportSnapshot(),
    objectiveState: midObjectiveState,
    durableInvocations: [projectDurableRun(first), projectDurableRun(second)],
  }
  const resumed = await resumeDevelopmentBookingObjective({
    processRef: 'mock:process:cold-resume:1',
    mandate,
    mandateSnapshot: midRun.mandateSnapshot,
    providerSnapshot: midRun.providerSnapshot,
    objectiveState: midRun.objectiveState,
    durableInvocations: midRun.durableInvocations,
  })
  decisions.push(...resumed.newPolicyDecisions)
  const cancellation = resumed.cancellationRun!
  const cancellationResult = resumed.cancellationResult!
  const cancellationMaterial = cancellation.source.input
  const cold = resumed.store
  const record = (run: any) => ({
    invocationRef: run.view.invocationRef,
    action: run.view.action,
    acceptedAuthority: run.view.acceptedAuthority,
    events: run.events,
    durable: projectDurableRun(run),
    resultDigest: canonicalDigest(run.view.observedResolution),
  })
  const invocationRecords = [record(first), record(second), record(cancellation)]
  const actionById = new Map<string, AnyAction>([
    [createDevelopmentReservationAction.id, createDevelopmentReservationAction],
    [cancelDevelopmentReservationAction.id, cancelDevelopmentReservationAction],
  ])
  const reconstructed = invocationRecords.map((record) => {
    const action = actionById.get(record.action.id)
    if (action === undefined) throw new Error('cold_action_missing')
    return reconstructDevelopmentBookingInvocation({
      invocationRef: record.invocationRef,
      action,
      durable: record.durable,
    }).view
  })
  const providerSnapshot = resumed.providerSnapshot
  const effectsBeforeReplay = resumed.effectCounts
  const replayed = await resumeDevelopmentBookingObjective({
    processRef: 'mock:process:cold-resume:2',
    mandate,
    mandateSnapshot: cold.exportSnapshot(),
    providerSnapshot,
    objectiveState: resumed.objectiveState,
    durableInvocations: invocationRecords.map(({ durable }) => durable),
  })
  const effectsAfterReplay = replayed.effectCounts
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
    invocations: invocationRecords,
    authoritativeResults: {
      booking: {
        principalRef,
        input: bookingB,
        result: confirmed,
        resultDigest: canonicalDigest(confirmed),
      },
      cancellation: {
        principalRef,
        input: cancellationMaterial,
        result: cancellationResult,
        resultDigest: canonicalDigest(cancellationResult),
      },
    },
    coldContinuation: {
      midRun,
      initialObjectiveState,
      finalObjectiveState: resumed.objectiveState,
      replayedObjectiveState: replayed.objectiveState,
      freshProcessRefs: [resumed.processRef, replayed.processRef],
      resumeReconstructedInvocationRefs: resumed.reconstructed.map(({ invocationRef }) => invocationRef),
      replayReconstructedInvocationRefs: replayed.reconstructed.map(({ invocationRef }) => invocationRef),
      reconstructed: reconstructed.map((view) => ({
        invocationRef: view.invocationRef,
        invocationVersion: view.invocationVersion,
        controlState: view.control.state,
        authorityUseRef: view.acceptedAuthority?.kind === 'standing_mandate_use'
          ? view.acceptedAuthority.authorityUseRef
          : null,
      })),
      mandateSnapshot: cold.exportSnapshot(),
      providerSnapshot,
      effectsBeforeReplay,
      effectsAfterReplay,
      continuationKind: 'source_owned_objective_resume' as const,
      noDuplicateEffect:
        effectsBeforeReplay.booking === effectsAfterReplay.booking
        && effectsBeforeReplay.cancellation === effectsAfterReplay.cancellation
        && resumed.objectiveState.digest === replayed.objectiveState.digest,
    },
    providerEffects: {
      providerA: providerA.effectCount(),
      providerB: providerSnapshot.effects,
      cancellation: providerSnapshot.cancellationEffects,
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

export async function resumeDevelopmentBookingObjective(input: Readonly<{
  processRef: string
  mandate: StandingMandate
  mandateSnapshot: StandingMandateSnapshot
  providerSnapshot: DevelopmentBookingProviderSnapshot
  objectiveState: DevelopmentBookingObjectiveState
  durableInvocations: readonly ReturnType<typeof projectDurableRun>[]
}>) {
  if (!developmentBookingObjectiveStateValid(input.objectiveState)) {
    throw new Error('development_booking_objective_integrity_refused')
  }
  if (
    input.objectiveState.objectiveRef !== objectiveRef
    || input.objectiveState.completedInvocationRefs.length !== input.durableInvocations.length
  ) throw new Error('development_booking_objective_linkage_refused')

  const reconstructed = input.durableInvocations.map((durable, index) => {
    const invocationRef = input.objectiveState.completedInvocationRefs[index]
    const action = index < 2
      ? createDevelopmentReservationAction
      : cancelDevelopmentReservationAction
    if (invocationRef === undefined) throw new Error('development_booking_objective_invocation_missing')
    return reconstructDevelopmentBookingInvocation({ invocationRef, action, durable }).view
  })
  const provider = createDevelopmentBookingProvider({
    ...input.providerSnapshot.options,
    snapshot: input.providerSnapshot,
  })
  const effectCounts = () => ({
    booking: provider.effectCount(),
    cancellation: provider.cancellationEffectCount(),
  })
  if (input.objectiveState.stage === 'completed') {
    if (
      input.objectiveState.currentActionRef !== 'none'
      || input.objectiveState.cancellationResultRef === null
      || reconstructed.at(-1)?.observedResolution.state !== 'returned'
    ) throw new Error('development_booking_terminal_state_refused')
    const trust = createDevelopmentBookingOffsetRuleTrust(input.providerSnapshot)
    return {
      processRef: input.processRef,
      store: new StandingMandateStore(structuredClone(input.mandateSnapshot), {
        offsetRuleTrust: trust,
      }),
      providerSnapshot: provider.exportSnapshot(),
      objectiveState: input.objectiveState,
      reconstructed,
      effectCounts: effectCounts(),
      newPolicyDecisions: [] as StandingMandatePolicyDecision[],
      cancellationRun: null,
      cancellationResult: null,
    }
  }
  if (
    input.objectiveState.stage !== 'booking_confirmed'
    || input.objectiveState.currentActionRef !== cancelDevelopmentReservationAction.id
  ) throw new Error('development_booking_objective_stage_refused')
  const bookingView = reconstructed.at(-1)
  if (
    bookingView?.observedResolution.state !== 'returned'
    || bookingView.observedResolution.result.kind !== 'reservation_confirmed'
    || bookingView.observedResolution.result.reservationRef !== input.objectiveState.bookingResultRef
  ) throw new Error('development_booking_objective_booking_result_refused')
  const confirmed = bookingView.observedResolution.result
  let store = new StandingMandateStore(structuredClone(input.mandateSnapshot), {
    offsetRuleTrust: createDevelopmentBookingOffsetRuleTrust(input.providerSnapshot),
  })
  const cancellationMaterial = cancellationInput({
    reservationRef: confirmed.reservationRef,
    providerRef: confirmed.providerRef,
    principalRef,
    operationKey: 'mock:operation:full-yolo:cancel',
  })
  const cancellationInvocationRef = 'mock:cancellation-invocation:full-yolo-cancel'
  const decision = evaluateStandingMandatePolicy({
    mandate: input.mandate,
    uses: store.exportSnapshot().uses,
    policyDecisionRef: 'mock:policy-decision:full-yolo:cancel',
    proposal: {
      objectiveRef,
      objective,
      sourceOptionRef: confirmed.evidenceRef,
      materialDigest: materialDigest(
        cancellationMaterial,
        cancelDevelopmentReservationAction.invocationContract!.materialInputPaths,
      ),
      authorityUseRef: 'mock:authority-use:full-yolo:cancel',
      invocationRef: cancellationInvocationRef,
      action: { id: cancelDevelopmentReservationAction.id, version: 'v1' },
      providerRef: confirmed.providerRef,
      recipientRef: confirmed.providerRef,
      purpose: 'cancel_development_reservation',
      dataFields: ['reason'],
      spend: { amountMinor: 0, currency: 'AUD' },
      worstCaseLoss: { amountMinor: 0, currency: 'AUD' },
      fallbackRef: 'none',
      risk: 'development_booking_bounded_loss',
    },
  })
  if (decision.kind === 'refused') throw new Error(decision.code)
  const accepted = store.acceptPolicyDecision(decision.value)
  if (accepted.kind === 'refused') throw new Error(accepted.code)
  const cancellationRun = await runCancellationInvocation({
    provider,
    cancellation: cancellationMaterial,
    origin,
    ref: 'full-yolo-cancel',
    fullYoloMandate: {
      service: bookingService(store),
      mandateRef: input.mandate.mandateRef,
      authorityUseRef: 'mock:authority-use:full-yolo:cancel',
      policyDecisionRef: decision.value.policyDecisionRef,
    },
  })
  if (
    cancellationRun.view.observedResolution.state !== 'returned'
    || cancellationRun.view.observedResolution.result.kind !== 'reservation_cancellation_confirmed'
  ) throw new Error('provider_confirmed_cancellation_missing')
  const cancellationResult = cancellationRun.view.observedResolution.result
  const providerSnapshot = provider.exportSnapshot()
  store = new StandingMandateStore(structuredClone(store.exportSnapshot()), {
    offsetRuleTrust: createDevelopmentBookingOffsetRuleTrust(providerSnapshot),
  })
  const offset = store.recordExposureOffset({
    authorityUseRef: 'mock:authority-use:full-yolo:b',
    offsetAuthorityUseRef: 'mock:authority-use:full-yolo:cancel',
    mandateRef: input.mandate.mandateRef,
    mandateVersion: input.mandate.version,
    mandateGeneration: input.mandate.generation,
    principalRef,
    providerRef: confirmed.providerRef,
    exposureAction: { id: createDevelopmentReservationAction.id, version: 'v1' },
    offsetAction: { id: cancelDevelopmentReservationAction.id, version: 'v1' },
    exposureSubjectRef: confirmed.reservationRef,
    exposureResultRef: confirmed.reservationRef,
    exposureEvidenceRef: confirmed.evidenceRef,
    offsetSubjectRef: cancellationResult.reservationRef,
    offsetResultRef: cancellationResult.cancellationRef,
    offsetEvidenceRef: cancellationResult.evidenceRef,
    amountMinor: 5_000,
    currency: 'AUD',
    evidenceRuleRef: developmentCancellationConfirmationRule.evidenceRuleRef,
    evidenceRuleSource: developmentCancellationConfirmationRule.source,
    evidenceRuleVersion: developmentCancellationConfirmationRule.version,
    offsetGeneration: 1,
    recordedAt: developmentBookingNow(),
  })
  if (offset.kind === 'refused') throw new Error(offset.code)
  const finalState = objectiveState({
    objectiveRef,
    stage: 'completed',
    currentActionRef: 'none',
    fallbackProgress: input.objectiveState.fallbackProgress,
    completedInvocationRefs: [
      ...input.objectiveState.completedInvocationRefs,
      cancellationRun.view.invocationRef,
    ],
    policyDecisionRefs: [
      ...input.objectiveState.policyDecisionRefs,
      decision.value.policyDecisionRef,
    ],
    bookingResultRef: confirmed.reservationRef,
    cancellationResultRef: cancellationResult.cancellationRef,
  })
  return {
    processRef: input.processRef,
    store,
    providerSnapshot,
    objectiveState: finalState,
    reconstructed,
    effectCounts: effectCounts(),
    newPolicyDecisions: [decision.value],
    cancellationRun,
    cancellationResult,
  }
}

function bookingService(store: StandingMandateStore) {
  return createDevelopmentBookingMandateService({
    store,
    authenticatedDelegate: { delegateRef, principalRef, callerRef },
    now: developmentBookingNow,
  })
}
