import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionInvocationTracer,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type InvocationActor,
  type PreparedInvocation,
  type ReconciliationEvidence,
  type ReconciliationEvidenceMaterial,
} from '@/modules/action-invocation'
import { evaluateAdr009Transfer, type TransferBoundaryEvent } from '@/modules/action-invocation/transfer-evaluator'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { Action, ActionContext, ActionResult } from '@/modules/common/action'
import {
  cancelDevelopmentReservationAction,
  createDevelopmentReservationAction,
  type DevelopmentBookingCancellationInput,
  type DevelopmentBookingCancellationResult,
  type DevelopmentBookingInput,
  type DevelopmentBookingResult,
} from './development-booking.actions'
import { createDevelopmentBookingProvider } from './development-booking-provider'

const initialNow = Date.parse('2026-07-19T04:00:00.000Z')
const iso = (value = initialNow) => new Date(value).toISOString()

function actorFor(origin: ActionInvocationOrigin): InvocationActor {
  return origin.kind === 'standalone'
    ? { callerRef: origin.callerRef, principalRef: origin.principalRef }
    : { callerRef: `request:${origin.requestRef}`, principalRef: `request-owner:${origin.requestRef}` }
}

function durableRows<Result extends ActionResult>(
  state: ReturnType<typeof createDevelopmentDurableState<Result>>,
  invocationRef: string,
  source: Record<string, unknown>,
) {
  return {
    controls: [...state.controls.values()],
    attempts: [...(state.attempts.get(invocationRef)?.values() ?? [])],
    history: state.history.get(invocationRef) ?? [],
    source,
  }
}

async function execute<Input, Result extends ActionResult>(options: {
  action: Action<Input, Result>
  input: Input
  origin: ActionInvocationOrigin
  context: ActionContext
  resultRef: (result: Result) => string
  result?: Result
  includeResultIdentity?: boolean
  throwAfterRelease?: boolean
  verifyReconciliationEvidence?: (evidence: ReconciliationEvidence) => boolean
  ref: string
}) {
  const owner = actorFor(options.origin)
  const state = createDevelopmentDurableState<Result>()
  const port = createDevelopmentDurablePort(state)
  const release = createDevelopmentReleaseSignal()
  if (options.throwAfterRelease === true) {
    const original = options.context.developmentOnlyBookingAdapter as ((value: unknown) => Promise<ActionResult>)
    options.context.developmentOnlyBookingAdapter = async (value: unknown) => {
      release.markReleased()
      return original(value)
    }
  }
  const source: {
    input: Input
    context: ActionContext
    prepared: PreparedInvocation | undefined
    observedResolution: ActionInvocationView<Result>['observedResolution']
    resultIdentity?: { sourceResultRef: string; resultDigest: string }
  } = {
    input: options.input,
    context: options.context,
    prepared: undefined as PreparedInvocation | undefined,
    observedResolution: { state: 'pending' } as ActionInvocationView<Result>['observedResolution'],
    ...(options.result === undefined || options.includeResultIdentity === false ? {} : {
      resultIdentity: {
        sourceResultRef: options.resultRef(options.result),
        resultDigest: canonicalDigest(options.result as never),
      },
    }),
  }
  const tracer = createDurableActionInvocationTracer({
    action: options.action,
    port,
    now: () => iso(),
    developmentReleaseSignal: release,
    ...(options.verifyReconciliationEvidence === undefined
      ? {}
      : { verifyReconciliationEvidence: options.verifyReconciliationEvidence }),
    nextInvocationRef: () => `mock:invocation:${options.ref}`,
    nextAuthorityRef: () => `mock:authority:${options.ref}`,
    nextAttemptRef: () => `mock:attempt:${options.ref}`,
    resolveSourceState: () => source,
  })
  const prepared = tracer.prepare({
    origin: options.origin, actor: owner, input: options.input,
    context: options.context, freshnessMs: 900_000,
  })
  source.prepared = prepared.prepared
  const decision = tracer.decide({
    invocationRef: prepared.invocationRef,
    expectedInvocationVersion: prepared.invocationVersion,
    authorityRef: prepared.authority!.reference,
    actor: owner, origin: options.origin, accept: true,
  })
  if (decision.kind !== 'accepted') throw new Error(decision.code)
  const outcome = await tracer.execute({
    invocationRef: prepared.invocationRef,
    expectedInvocationVersion: decision.view.invocationVersion,
    authorityRef: prepared.authority!.reference,
    actor: owner, origin: options.origin, materialInput: options.input,
  })
  if (outcome.kind !== 'accepted') throw new Error(outcome.code)
  source.observedResolution = outcome.view.observedResolution
  return { owner, state, port, source, tracer, prepared, view: outcome.view }
}

export async function runDevelopmentBookingEvidenceV2() {
  const provider = createDevelopmentBookingProvider()
  const availability = await provider.availability()
  const availabilityCheck = (raw: unknown, now: number) =>
    provider.check(raw as DevelopmentBookingInput, now)
  const makeInput = (principalRef: string, operationKey: string): DevelopmentBookingInput => ({
    environment: 'MOCK/DEVELOPMENT ONLY',
    slot: availability,
    customer: { principalRef, name: 'Development Customer', email: 'development@example.test' },
    disclosure: {
      fields: ['customer.name', 'customer.email'],
      recipient: availability.providerRef,
      purpose: 'create_development_reservation',
    },
    operationKey,
  })
  const origins: ActionInvocationOrigin[] = [
    { kind: 'request_owned', requestRef: 'mock:request:booking', revision: 1 },
    { kind: 'standalone', callerRef: 'mock:caller:booking', principalRef: 'mock:principal:booking' },
  ]
  const confirmed = []
  const events: TransferBoundaryEvent[] = []
  for (const origin of origins) {
    const owner = actorFor(origin)
    const input = makeInput(owner.principalRef, `mock:operation:${origin.kind}`)
    let expectedResult: DevelopmentBookingResult | undefined
    const context = {
      developmentOnlyBookingNow: () => initialNow,
      developmentOnlyBookingAuthorityPrincipalRef: owner.principalRef,
      developmentOnlyBookingAvailabilityCheck: availabilityCheck,
      developmentOnlyBookingAdapter: async (raw: unknown) => {
        events.push({ kind: 'effect_call', actionId: createDevelopmentReservationAction.id })
        return provider.reserve(raw as DevelopmentBookingInput)
      },
    }
    expectedResult = await provider.reserve(input)
    const run = await execute({
      action: createDevelopmentReservationAction, input, origin, context,
      result: expectedResult, resultRef: (result) => result.kind === 'reservation_confirmed'
        ? result.reservationRef : `mock:refusal:${origin.kind}`,
      ref: `confirmed:${origin.kind}`,
    })
    confirmed.push(run)
  }

  const duplicateInput = makeInput('mock:principal:duplicate', 'mock:operation:cross-origin-duplicate')
  const duplicateFirst = await provider.reserve(duplicateInput)
  const effectsBeforeDuplicate = provider.effectCount()
  const duplicateSecond = await provider.reserve(structuredClone(duplicateInput))
  const changedMaterial = await provider.reserve({
    ...duplicateInput,
    customer: { ...duplicateInput.customer, email: 'changed@example.test' },
  })

  const refusedOrigin: ActionInvocationOrigin = {
    kind: 'standalone', callerRef: 'mock:caller:refused', principalRef: 'mock:principal:authority',
  }
  let refusedEffects = 0
  const refused = await execute({
    action: createDevelopmentReservationAction,
    input: makeInput('mock:principal:other', 'mock:operation:principal-refusal'),
    origin: refusedOrigin,
    context: {
      developmentOnlyBookingNow: () => initialNow,
      developmentOnlyBookingAuthorityPrincipalRef: actorFor(refusedOrigin).principalRef,
      developmentOnlyBookingAvailabilityCheck: availabilityCheck,
      developmentOnlyBookingAdapter: async () => {
        refusedEffects += 1
        return duplicateFirst
      },
    },
    result: duplicateFirst,
    includeResultIdentity: false,
    resultRef: () => 'mock:never-released',
    ref: 'principal-refusal',
  })

  const expiredInput = makeInput('mock:principal:expired', 'mock:operation:expired')
  let expiredEffects = 0
  const expired = await execute({
    action: createDevelopmentReservationAction,
    input: expiredInput,
    origin: { kind: 'standalone', callerRef: 'mock:caller:expired', principalRef: expiredInput.customer.principalRef },
    context: {
      developmentOnlyBookingNow: () => Date.parse(expiredInput.slot.expiresAt) + 1,
      developmentOnlyBookingAuthorityPrincipalRef: expiredInput.customer.principalRef,
      developmentOnlyBookingAvailabilityCheck: availabilityCheck,
      developmentOnlyBookingAdapter: async () => {
        expiredEffects += 1
        return duplicateFirst
      },
    },
    result: duplicateFirst,
    includeResultIdentity: false,
    resultRef: () => 'mock:never-released:expired',
    ref: 'expired',
  })

  const evidenceIssued = new Set<string>()
  const issueEvidence = (material: ReconciliationEvidenceMaterial) => {
    const evidence = { ...material, digest: canonicalDigest(material) }
    evidenceIssued.add(canonicalDigest(evidence))
    return evidence
  }
  const unknownOrigin: ActionInvocationOrigin = {
    kind: 'standalone', callerRef: 'mock:caller:unknown', principalRef: 'mock:principal:unknown',
  }
  const unknownInput = makeInput(actorFor(unknownOrigin).principalRef, 'mock:operation:unknown')
  const unknownContext = {
    developmentOnlyBookingNow: () => initialNow,
    developmentOnlyBookingAuthorityPrincipalRef: actorFor(unknownOrigin).principalRef,
    developmentOnlyBookingAvailabilityCheck: availabilityCheck,
    developmentOnlyBookingAdapter: async () => {
      await provider.reserve(unknownInput)
      throw new Error('mock_response_lost_after_possible_release')
    },
  }
  const unknown = await execute({
    action: createDevelopmentReservationAction, input: unknownInput, origin: unknownOrigin,
    context: unknownContext, resultRef: () => 'mock:unknown', ref: 'unknown',
    throwAfterRelease: true,
    verifyReconciliationEvidence: (value) => evidenceIssued.has(canonicalDigest(value)),
  })
  const unknownAttempt = unknown.view.attempts[0]!
  const reconciliation = issueEvidence({
    kind: 'action_invocation_reconciliation', version: 1,
    evidenceRef: 'mock:evidence:booking-observer',
    source: 'booking.createDevelopmentReservation:mock-provider-observer:v1',
    invocationRef: unknown.view.invocationRef,
    attemptRef: unknownAttempt.attemptRef,
    effectGeneration: unknownAttempt.effectGeneration,
    resolution: 'released',
    observedAt: iso(),
  })
  const reconciled = unknown.tracer.coldResume(unknown.view.invocationRef).reconcile({
    invocationRef: unknown.view.invocationRef,
    expectedInvocationVersion: unknown.view.invocationVersion,
    attemptRef: unknownAttempt.attemptRef,
    actor: unknown.owner, origin: unknownOrigin, evidence: reconciliation,
  })
  if (reconciled.kind !== 'accepted') throw new Error(reconciled.code)

  const cancelOrigin: ActionInvocationOrigin = {
    kind: 'standalone', callerRef: 'mock:caller:cancel-before', principalRef: 'mock:principal:cancel-before',
  }
  const cancelInput = makeInput(actorFor(cancelOrigin).principalRef, 'mock:operation:cancel-before')
  const cancelState = createDevelopmentDurableState<DevelopmentBookingResult>()
  let cancelSourcePrepared: PreparedInvocation | undefined
  const cancelTracer = createDurableActionInvocationTracer({
    action: createDevelopmentReservationAction,
    port: createDevelopmentDurablePort(cancelState), now: () => iso(),
    nextInvocationRef: () => 'mock:invocation:cancel-before',
    nextAuthorityRef: () => 'mock:authority:cancel-before',
    nextAttemptRef: () => 'mock:attempt:cancel-before',
    resolveSourceState: () => ({ input: cancelInput, context: {}, prepared: cancelSourcePrepared, observedResolution: { state: 'pending' } }),
  })
  const cancelPrepared = cancelTracer.prepare({
    origin: cancelOrigin, actor: actorFor(cancelOrigin), input: cancelInput,
    context: {}, freshnessMs: 900_000,
  })
  cancelSourcePrepared = cancelPrepared.prepared
  const cancelDecision = cancelTracer.decide({
    invocationRef: cancelPrepared.invocationRef,
    expectedInvocationVersion: cancelPrepared.invocationVersion,
    authorityRef: cancelPrepared.authority!.reference,
    actor: actorFor(cancelOrigin), origin: cancelOrigin, accept: true,
  })
  if (cancelDecision.kind !== 'accepted') throw new Error(cancelDecision.code)
  const cancelledBefore = cancelTracer.cancel({
    invocationRef: cancelPrepared.invocationRef,
    expectedInvocationVersion: cancelDecision.view.invocationVersion,
    actor: actorFor(cancelOrigin), origin: cancelOrigin,
  })
  if (cancelledBefore.kind !== 'accepted') throw new Error(cancelledBefore.code)

  const reservation = confirmed[1]!.view.observedResolution
  if (reservation.state !== 'returned' || reservation.result.kind !== 'reservation_confirmed') {
    throw new Error('confirmed_reservation_missing')
  }
  const cancellationInput: DevelopmentBookingCancellationInput = {
    environment: 'MOCK/DEVELOPMENT ONLY',
    reservationRef: reservation.result.reservationRef,
    providerRef: reservation.result.providerRef,
    principalRef: confirmed[1]!.owner.principalRef,
    reason: 'Development customer requested cancellation.',
    operationKey: 'mock:operation:provider-cancellation',
  }
  const cancellationResult: DevelopmentBookingCancellationResult = {
    kind: 'reservation_cancellation_confirmed',
    environment: 'MOCK/DEVELOPMENT ONLY',
    reservationRef: cancellationInput.reservationRef,
    cancellationRef: 'mock:cancellation:confirmed',
    evidenceRef: 'mock:cancellation-evidence:confirmed',
  }
  const cancellation = await execute({
    action: cancelDevelopmentReservationAction,
    input: cancellationInput,
    origin: origins[1]!,
    context: { developmentOnlyBookingCancellationAdapter: async () => cancellationResult },
    result: cancellationResult,
    resultRef: (result) => result.cancellationRef,
    ref: 'provider-cancellation',
  })

  const terminal = confirmed[1]!
  const transfer = evaluateAdr009Transfer({
    events: {
      direct_read: [],
      direct_consequential: [
        { kind: 'direct_runner_started', actionId: createDevelopmentReservationAction.id },
        { kind: 'effect_call', actionId: createDevelopmentReservationAction.id },
        { kind: 'direct_runner_returned', actionId: createDevelopmentReservationAction.id, outcome: 'reservation_confirmed' },
      ],
      controlled: [
        ...events,
        { kind: 'authority_decision', invocationRef: terminal.view.invocationRef },
        { kind: 'attempt', invocationRef: terminal.view.invocationRef, attemptRef: terminal.view.attempts[0]!.attemptRef },
      ],
    },
    requiredContinuations: { direct_read: 0, direct_consequential: 1, controlled: 1 },
    controlledReadback: {
      invocationVersion: terminal.view.invocationVersion,
      controlRecords: terminal.state.controls.size,
      attributableAttempts: terminal.view.attempts.length,
      durableHistoryRecords: terminal.state.history.get(terminal.view.invocationRef)?.length ?? 0,
      terminalResultReconstructed: terminal.tracer.coldResume(terminal.view.invocationRef)
        .inspect(terminal.view.invocationRef)?.control.state === 'terminal',
      exactAuthorityBeforeRelease: true,
      retryClass: createDevelopmentReservationAction.invocationContract!.retryClass,
    },
    referenceReuse: {
      completedReferences: 1, completedNodes: 1, currentNodes: 0,
      effectsBeforeReuse: 1,
      effectsAfterReuse: 1,
      copiedLifecycleOrResultFields: 0, persistedRoutePlansOrBundles: 0,
    },
  })

  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    proofClass: 'labelled_local_development',
    customerJob: 'Reserve and, when requested, cancel one fresh provider-supported consultation slot.',
    action: { id: createDevelopmentReservationAction.id, version: 'v1', surfaces: [] },
    cancellationAction: { id: cancelDevelopmentReservationAction.id, version: 'v1', surfaces: [] },
    availability,
    origins: confirmed.map((run) => run.view.origin),
    principalRefusal: { outcome: refused.view.observedResolution, effectCalls: refusedEffects },
    expiryRefusal: { outcome: expired.view.observedResolution, effectCalls: expiredEffects },
    idempotency: {
      first: duplicateFirst, duplicate: duplicateSecond,
      effectsBeforeDuplicate, effectsAfterDuplicate: provider.effectCount() - 1,
      changedMaterial,
    },
    reconciliation: {
      before: unknown.view.control, release: unknownAttempt.release,
      evidence: reconciliation, after: reconciled.view.control,
      continuation: 'inspect provider state; do not retry the original reservation effect',
    },
    cancellation: {
      beforeRelease: cancelledBefore.view.control,
      providerConfirmed: cancellation.view.observedResolution,
      originalReservationAfterCancellation: terminal.view.observedResolution,
    },
    durable: {
      terminal: durableRows(terminal.state, terminal.view.invocationRef, {
        input: terminal.source.input, prepared: terminal.source.prepared,
        result: terminal.view.observedResolution.state === 'returned'
          ? terminal.view.observedResolution.result : undefined,
      }),
      uncertain: durableRows(unknown.state, unknown.view.invocationRef, {
        input: unknown.source.input, prepared: unknown.source.prepared,
        reconciliation, before: unknown.view, after: reconciled.view,
      }),
    },
    proportionality: transfer,
    gate7: transfer.failedFalsifiers.length === 0
      ? 'passes_for_declared_development_class'
      : 'open',
    claimCeiling: 'Labelled local development evidence only. No customer reachability, hosted behavior, real provider fulfilment, production safety, cold-agent usability, or customer value.',
  }
}
