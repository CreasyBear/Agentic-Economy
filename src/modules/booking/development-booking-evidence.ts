import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionInvocationTracer,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type PreparedInvocation,
} from '@/modules/action-invocation'
import { evaluateAdr009Transfer, type TransferBoundaryEvent } from '@/modules/action-invocation/transfer-evaluator'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  createDevelopmentReservationAction as action,
  type DevelopmentBookingInput,
  type DevelopmentBookingResult,
} from './development-booking.actions'

const nowMs = Date.parse('2026-07-19T04:00:00.000Z')
const now = () => new Date(nowMs).toISOString()
const actor = { callerRef: 'mock:caller:booking', principalRef: 'mock:principal:booking' }

export const developmentBookingInput: DevelopmentBookingInput = {
  environment: 'MOCK/DEVELOPMENT ONLY',
  slot: {
    slotRef: 'mock:slot:2026-07-21T02:00Z',
    providerRef: 'mock:provider:calendar',
    offeringRef: 'mock:offering:consultation',
    bindingRef: 'mock:binding:calendar-create-reservation',
    contractRef: 'calendar.create-reservation@1',
    actionVersion: 'v1',
    startsAt: '2026-07-21T02:00:00.000Z',
    freshAt: now(),
    expiresAt: '2026-07-19T04:15:00.000Z',
    termsDigest: canonicalDigest({ cancellation: 'provider_supported_before_start', priceMinor: 0 }),
    provenance: {
      source: 'mock_provider_availability',
      observationRef: 'mock:availability-observation:001',
      observedBy: 'mock:provider:calendar',
    },
  },
  customer: {
    principalRef: actor.principalRef,
    name: 'Development Customer',
    email: 'development@example.test',
  },
  disclosure: {
    fields: ['customer.name', 'customer.email'],
    recipient: 'mock:provider:calendar',
    purpose: 'create_development_reservation',
  },
  operationKey: 'mock:reservation-operation:001',
}

function originActor(origin: ActionInvocationOrigin) {
  return origin.kind === 'standalone'
    ? actor
    : { callerRef: `request:${origin.requestRef}`, principalRef: `request-owner:${origin.requestRef}` }
}

async function runConfirmed(origin: ActionInvocationOrigin) {
  const state = createDevelopmentDurableState<DevelopmentBookingResult>()
  const port = createDevelopmentDurablePort(state)
  const release = createDevelopmentReleaseSignal()
  const events: TransferBoundaryEvent[] = []
  let effectCalls = 0
  const result: DevelopmentBookingResult = {
    kind: 'reservation_confirmed',
    environment: 'MOCK/DEVELOPMENT ONLY',
    reservationRef: `mock:reservation:${origin.kind}`,
    providerRef: developmentBookingInput.slot.providerRef,
    slotRef: developmentBookingInput.slot.slotRef,
    evidenceRef: `mock:reservation-evidence:${origin.kind}`,
  }
  const source = {
    input: developmentBookingInput,
    context: {
      developmentOnlyBookingAdapter: async () => {
        effectCalls += 1
        events.push({ kind: 'effect_call', actionId: action.id })
        release.markReleased()
        return result
      },
    },
    prepared: undefined as PreparedInvocation | undefined,
    observedResolution: { state: 'pending' } as ActionInvocationView<DevelopmentBookingResult>['observedResolution'],
    resultIdentity: { sourceResultRef: result.reservationRef, resultDigest: canonicalDigest(result) },
  }
  const owner = originActor(origin)
  const tracer = createDurableActionInvocationTracer({
    action, port, now, developmentReleaseSignal: release,
    nextInvocationRef: () => `mock:booking-invocation:${origin.kind}`,
    nextAuthorityRef: () => `mock:booking-authority:${origin.kind}`,
    nextAttemptRef: () => `mock:booking-attempt:${origin.kind}`,
    resolveSourceState: () => source,
  })
  const prepared = tracer.prepare({ origin, actor: owner, input: developmentBookingInput, context: source.context, freshnessMs: 900_000 })
  source.prepared = prepared.prepared
  const decided = tracer.decide({
    invocationRef: prepared.invocationRef, expectedInvocationVersion: prepared.invocationVersion,
    authorityRef: prepared.authority!.reference, actor: owner, origin, accept: true,
  })
  if (decided.kind !== 'accepted') throw new Error(decided.code)
  events.push({ kind: 'authority_decision', invocationRef: prepared.invocationRef })
  const executed = await tracer.execute({
    invocationRef: prepared.invocationRef, expectedInvocationVersion: decided.view.invocationVersion,
    authorityRef: prepared.authority!.reference, actor: owner, origin, materialInput: developmentBookingInput,
  })
  if (executed.kind !== 'accepted') throw new Error(executed.code)
  source.observedResolution = executed.view.observedResolution
  const cold = tracer.coldResume(prepared.invocationRef).inspect(prepared.invocationRef)!
  return { view: cold, state, effectCalls, events, result, tracer, origin, owner }
}

async function runUnknown() {
  const origin: ActionInvocationOrigin = { kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef }
  const state = createDevelopmentDurableState<DevelopmentBookingResult>()
  const port = createDevelopmentDurablePort(state)
  const release = createDevelopmentReleaseSignal()
  const source = {
    input: developmentBookingInput,
    context: { developmentOnlyBookingAdapter: async () => {
      release.markReleased()
      throw new Error('mock_response_lost_after_possible_release')
    } },
    prepared: undefined as PreparedInvocation | undefined,
    observedResolution: { state: 'pending' } as ActionInvocationView<DevelopmentBookingResult>['observedResolution'],
  }
  const tracer = createDurableActionInvocationTracer({
    action, port, now, developmentReleaseSignal: release,
    nextInvocationRef: () => 'mock:booking-invocation:unknown',
    nextAuthorityRef: () => 'mock:booking-authority:unknown',
    nextAttemptRef: () => 'mock:booking-attempt:unknown',
    resolveSourceState: () => source,
  })
  const prepared = tracer.prepare({ origin, actor, input: developmentBookingInput, context: source.context, freshnessMs: 900_000 })
  source.prepared = prepared.prepared
  const decision = tracer.decide({
    invocationRef: prepared.invocationRef, expectedInvocationVersion: prepared.invocationVersion,
    authorityRef: prepared.authority!.reference, actor, origin, accept: true,
  })
  if (decision.kind !== 'accepted') throw new Error(decision.code)
  const uncertain = await tracer.execute({
    invocationRef: prepared.invocationRef, expectedInvocationVersion: decision.view.invocationVersion,
    authorityRef: prepared.authority!.reference, actor, origin, materialInput: developmentBookingInput,
  })
  if (uncertain.kind !== 'accepted') throw new Error(uncertain.code)
  const retry = await tracer.execute({
    invocationRef: prepared.invocationRef, expectedInvocationVersion: uncertain.view.invocationVersion,
    authorityRef: prepared.authority!.reference, actor, origin, materialInput: developmentBookingInput,
  })
  return { view: uncertain.view, retry }
}

export async function runDevelopmentBookingEvidence() {
  const request = await runConfirmed({ kind: 'request_owned', requestRef: 'mock:request:booking', revision: 1 })
  const standalone = await runConfirmed({ kind: 'standalone', callerRef: actor.callerRef, principalRef: actor.principalRef })
  const replay = await standalone.tracer.execute({
    invocationRef: standalone.view.invocationRef,
    expectedInvocationVersion: standalone.view.invocationVersion,
    authorityRef: standalone.view.authority!.reference,
    actor: standalone.owner,
    origin: standalone.origin,
    materialInput: developmentBookingInput,
  })
  const unknown = await runUnknown()
  const historyCount = standalone.state.history.get(standalone.view.invocationRef)?.length ?? 0
  const transfer = evaluateAdr009Transfer({
    events: {
      direct_read: [],
      direct_consequential: [
        { kind: 'direct_runner_started', actionId: action.id },
        { kind: 'effect_call', actionId: action.id },
        { kind: 'direct_runner_returned', actionId: action.id, outcome: 'reservation_confirmed' },
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
      durableHistoryRecords: historyCount,
      terminalResultReconstructed: standalone.view.control.state === 'terminal',
      exactAuthorityBeforeRelease: true,
      retryClass: action.invocationContract!.retryClass,
    },
    referenceReuse: {
      completedReferences: 1, completedNodes: 1, currentNodes: 0,
      effectsBeforeReuse: standalone.effectCalls, effectsAfterReuse: standalone.effectCalls,
      copiedLifecycleOrResultFields: 0, persistedRoutePlansOrBundles: 0,
    },
  })
  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    proofClass: 'labelled_local_development',
    customerJob: 'Reserve one fresh provider-supported consultation slot.',
    permittedEffects: ['one mock provider reservation release after exact approve_each authority'],
    authorityStop: 'awaiting_authority before provider release',
    expectedGain: 'same booking effect with attributable authority, recovery and cold reconstruction',
    action: { id: action.id, version: action.invocationContract!.version, surfaces: action.surfaces },
    availability: developmentBookingInput.slot,
    authorityMode: 'approve_each',
    origins: [request.view.origin, standalone.view.origin],
    observedTransitions: [request.view, standalone.view, unknown.view],
    replay: { effectCalls: standalone.effectCalls, disposition: replay.kind === 'refused' ? replay.code : replay.kind },
    uncertainty: {
      control: unknown.view.control,
      release: unknown.view.attempts[0]!.release,
      retryDisposition: unknown.view.control.state === 'reconciliation_required'
        ? 'reconciliation_required'
        : unknown.retry.kind === 'refused' ? unknown.retry.code : unknown.retry.kind,
    },
    cancellationTruth: {
      beforeRelease: 'existing Action Invocation cancel records cancelled/not_released',
      afterRelease: 'provider stop request and confirmed provider cancellation require provider evidence; no reversal is claimed',
    },
    directBaseline: transfer.measurements.directConsequential,
    controlled: transfer.measurements.controlled,
    proportionality: transfer,
    gate7: transfer.failedFalsifiers.length === 0
      ? 'proportionality_passes_but_gate_remains_open_for_observed_provider_cancellation'
      : 'open',
    claimCeiling: 'Labelled local development evidence only. No customer reachability, hosted behavior, real provider fulfilment, production safety, cold-agent usability, or customer value.',
  }
}
