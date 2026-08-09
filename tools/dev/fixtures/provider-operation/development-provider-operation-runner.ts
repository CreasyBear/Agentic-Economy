import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionInvocationTracer,
  type ActionInvocationOrigin,
  type ActionInvocationView,
  type PreparedInvocation,
  type ReconciliationEvidenceVerifier,
} from '../../../../src/modules/action-invocation'
import type { TransferBoundaryEvent } from '../../../../src/modules/action-invocation/transfer-evaluator'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import {
  cancelDevelopmentProviderOperationAction,
  executeDevelopmentProviderOperationAction,
  type DevelopmentProviderOperationCancellationInput,
  type DevelopmentProviderOperationCancellationResult,
  type DevelopmentProviderOperationInput,
  type DevelopmentProviderOperationResult,
} from './development-provider-operation.actions'
import { providerOperationActor, developmentProviderOperationNow } from './development-provider-operation-fixture'
import { bindDevelopmentProviderOperationContext } from './development-provider-operation-context'
import type { createDevelopmentProviderOperationProvider } from './development-provider-operation-provider'
import {
  mandateRefusalToInvocationRefusal,
  type DevelopmentProviderOperationMandateService,
} from './development-provider-operation-mandate'
import type { ExactAmount } from '../../../../src/modules/money/public'

type Provider = ReturnType<typeof createDevelopmentProviderOperationProvider>
type ProviderOperationInvocationEvent = TransferBoundaryEvent | Readonly<{
  kind: 'standing_mandate_authorization'
  invocationRef: string
}>

export type ProviderOperationInvocationRun<Result extends DevelopmentProviderOperationResult | DevelopmentProviderOperationCancellationResult> =
  Readonly<{
    view: ActionInvocationView<Result>
    origin: ActionInvocationOrigin
    owner: ReturnType<typeof providerOperationActor>
    state: ReturnType<typeof createDevelopmentDurableState<Result>>
    tracer: ReturnType<typeof createDurableActionInvocationTracer<unknown, Result>>
    source: Readonly<{
      input: unknown
      prepared: PreparedInvocation | undefined
      result?: Result
      resultIdentity?: Readonly<{ sourceResultRef: string; resultDigest: string }>
    }>
    events: readonly ProviderOperationInvocationEvent[]
  }>

export async function runProviderOperationInvocation(input: Readonly<{
  provider: Provider
  operation: DevelopmentProviderOperationInput
  origin: ActionInvocationOrigin
  ref: string
  nowMs?: number
  loseResponseAfterRelease?: boolean
  unknownWithoutProviderRelease?: boolean
  corruptSourceResultAfterRelease?: boolean
  verifyReconciliationEvidence?: ReconciliationEvidenceVerifier
  boundedMandate?: Readonly<{
    service: DevelopmentProviderOperationMandateService
    mandateRef: string
    authorityUseRef: string
    afterEffect?: () => void
    reconstructBeforeRelease?: (
      view: ActionInvocationView<DevelopmentProviderOperationResult>,
    ) => DevelopmentProviderOperationMandateService
    developmentAuthorizationVersionOverride?: number
    developmentAcquisitionVersionOverride?: number
    throwDuringReconstruction?: boolean
    throwFromReleaseFenceBeforeProvider?: boolean
    fallbackRef?: string | null
    reservedSpend?: ExactAmount
    reservedLoss?: ExactAmount
    risk?: string
    policyDecisionRef?: string
  }>
}>): Promise<ProviderOperationInvocationRun<DevelopmentProviderOperationResult>> {
  const events: ProviderOperationInvocationEvent[] = []
  const source: {
    input: DevelopmentProviderOperationInput
    prepared: PreparedInvocation | undefined
    result?: DevelopmentProviderOperationResult
    resultIdentity?: { sourceResultRef: string; resultDigest: string }
  } = { input: input.operation, prepared: undefined }
  const owner = providerOperationActor(input.origin)
  const release = createDevelopmentReleaseSignal()
  const nowMs = input.nowMs ?? Date.parse(developmentProviderOperationNow())
  const context = bindDevelopmentProviderOperationContext({
    now: () => nowMs,
    authorityPrincipalRef: owner.principalRef,
    checkAvailability: (operation, now) => input.provider.check(operation, now),
    execute: async (operation) => {
      if (input.unknownWithoutProviderRelease === true) {
        throw new Error('mock_transport_failed_before_provider_release_observation')
      }
      events.push({ kind: 'provider_release' as const, actionId: executeDevelopmentProviderOperationAction.id })
      release.markReleased()
      const result = await input.provider.execute(operation)
      if (input.loseResponseAfterRelease === true) throw new Error('mock_response_lost_after_possible_release')
      source.result = result
      source.resultIdentity = {
        sourceResultRef: result.kind === 'effect_confirmed'
          ? result.effectRef
          : `mock:operation-refusal:${input.ref}`,
        resultDigest: canonicalDigest(result as never),
      }
      if (input.corruptSourceResultAfterRelease === true && source.resultIdentity !== undefined) {
        source.resultIdentity.resultDigest = canonicalDigest({ corrupted: true })
      }
      return result
    },
  })
  const state = createDevelopmentDurableState<DevelopmentProviderOperationResult>()
  const configuredMandate = input.boundedMandate
  let activeMandateService = configuredMandate?.service
  const tracer = createDurableActionInvocationTracer<DevelopmentProviderOperationInput, DevelopmentProviderOperationResult>({
    action: executeDevelopmentProviderOperationAction,
    port: createDevelopmentDurablePort(state),
    now: developmentProviderOperationNow,
    ...(input.unknownWithoutProviderRelease === true ? {} : { developmentReleaseSignal: release }),
    ...(input.verifyReconciliationEvidence === undefined
      ? {}
      : { verifyReconciliationEvidence: input.verifyReconciliationEvidence }),
    nextInvocationRef: () => `mock:operation-invocation:${input.ref}`,
    nextAuthorityRef: () => `mock:operation-authority:${input.ref}`,
    nextAttemptRef: () => `mock:operation-attempt:${input.ref}`,
    ...(configuredMandate === undefined ? {} : {
      beforeEffectRelease: (current, effectGeneration) => {
        if (activeMandateService === undefined) return 'authority_not_accepted' as const
        const checked = activeMandateService.recheckRelease({
          authorityUseRef: configuredMandate.authorityUseRef,
          view: current,
          effectGeneration,
        })
        if (configuredMandate.throwFromReleaseFenceBeforeProvider === true) {
          throw new Error('mock_pre_release_infrastructure_fault')
        }
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
            businessOutcome: source.result.kind === 'effect_confirmed' ? 'completed' : 'refused',
            resultReferenceable: source.result.kind === 'effect_confirmed',
            result: source.result,
          },
      ...(source.resultIdentity === undefined ? {} : { resultIdentity: source.resultIdentity }),
    }),
  })
  const prepared = await tracer.prepare({
    origin: input.origin, actor: owner, input: input.operation, context, freshnessMs: 900_000,
  })
  source.prepared = prepared.prepared
  if (configuredMandate === undefined) {
    const decision = await tracer.decide({
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
      actor: owner, origin: input.origin, materialInput: input.operation,
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
    operation: input.operation,
    effectGeneration: prepared.attempts.length + 1,
    ...(bounded.fallbackRef === undefined ? {} : { fallbackRef: bounded.fallbackRef }),
    ...(bounded.reservedSpend === undefined ? {} : { reservedSpend: bounded.reservedSpend }),
    ...(bounded.reservedLoss === undefined ? {} : { reservedLoss: bounded.reservedLoss }),
    ...(bounded.risk === undefined ? {} : { risk: bounded.risk }),
    ...(bounded.policyDecisionRef === undefined ? {} : { policyDecisionRef: bounded.policyDecisionRef }),
  })
  if (reserved.kind === 'refused') throw new Error(reserved.code)
  let standingAuthorization
  try {
    standingAuthorization = await tracer.authorizeStandingMandateUse({
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
    acquired = await tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: bounded.developmentAcquisitionVersionOverride
        ?? standingAuthorization.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: owner, origin: input.origin, materialInput: input.operation,
      leaseOwner: `mock:operation-worker:${input.ref}`,
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
      acquired.kind === 'refused' ? acquired.code : 'operation_acquisition_failed',
    )
  }
  if (bounded.reconstructBeforeRelease !== undefined) {
    try {
      if (bounded.throwDuringReconstruction === true) {
        throw new Error('mock_cold_reconstruction_failed')
      }
      const resumed = await tracer.coldResume(prepared.invocationRef)
      activeMandateService = bounded.reconstructBeforeRelease(
        resumed.inspect(prepared.invocationRef) ?? acquired.view,
      )
    } catch (error) {
      throw compensateAndPreserve(
        bounded.service,
        bounded.authorityUseRef,
        error instanceof Error ? error.message : 'cold_reconstruction_failed',
      )
    }
  }
  try {
    bounded.afterEffect?.()
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
    const current = tracer.inspect(prepared.invocationRef)
    const settlement = activeMandateService.settleExecutionException({
      authorityUseRef: bounded.authorityUseRef,
      view: current,
      attemptRef: acquired.view.control.attemptRef,
      releaseSignalObserved: release.wasReleased(),
    })
    const original = error instanceof Error ? error.message : 'execution_threw'
    throw settlement.kind === 'accepted'
      ? new Error(original)
      : new Error(`${original}; exception_settlement_failed:${settlement.code}`)
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
  service: DevelopmentProviderOperationMandateService,
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
  cancellation: DevelopmentProviderOperationCancellationInput
  origin: ActionInvocationOrigin
  ref: string
  fullYoloMandate?: Readonly<{
    service: DevelopmentProviderOperationMandateService
    mandateRef: string
    authorityUseRef: string
    policyDecisionRef?: string
  }>
}>): Promise<ProviderOperationInvocationRun<DevelopmentProviderOperationCancellationResult>> {
  const events: ProviderOperationInvocationEvent[] = []
  const source: {
    input: DevelopmentProviderOperationCancellationInput
    prepared: PreparedInvocation | undefined
    result?: DevelopmentProviderOperationCancellationResult
    resultIdentity?: { sourceResultRef: string; resultDigest: string }
  } = { input: input.cancellation, prepared: undefined }
  const owner = providerOperationActor(input.origin)
  const release = createDevelopmentReleaseSignal()
  const context = bindDevelopmentProviderOperationContext({
    authorityPrincipalRef: owner.principalRef,
    checkCancellation: (cancellation) => input.provider.checkCancellation(cancellation),
    cancel: async (cancellation) => {
      events.push({ kind: 'provider_release' as const, actionId: cancelDevelopmentProviderOperationAction.id })
      release.markReleased()
      const result = await input.provider.cancel(cancellation)
      source.result = result
      source.resultIdentity = {
        sourceResultRef: result.kind === 'effect_cancellation_confirmed'
          ? result.cancellationRef : `mock:cancellation-refusal:${input.ref}`,
        resultDigest: canonicalDigest(result as never),
      }
      return result
    },
  })
  const state = createDevelopmentDurableState<DevelopmentProviderOperationCancellationResult>()
  const tracer = createDurableActionInvocationTracer<
    DevelopmentProviderOperationCancellationInput,
    DevelopmentProviderOperationCancellationResult
  >({
    action: cancelDevelopmentProviderOperationAction,
    port: createDevelopmentDurablePort(state),
    now: developmentProviderOperationNow,
    developmentReleaseSignal: release,
    nextInvocationRef: () => `mock:cancellation-invocation:${input.ref}`,
    nextAuthorityRef: () => `mock:cancellation-authority:${input.ref}`,
    nextAttemptRef: () => `mock:cancellation-attempt:${input.ref}`,
    ...(input.fullYoloMandate === undefined ? {} : {
      beforeEffectRelease: (current, effectGeneration) => {
        const checked = input.fullYoloMandate!.service.recheckRelease({
          authorityUseRef: input.fullYoloMandate!.authorityUseRef,
          view: current,
          effectGeneration,
        })
        return checked.kind === 'accepted' ? undefined : mandateRefusalToInvocationRefusal(checked.code)
      },
    }),
    resolveSourceState: () => ({
      input: source.input, context, prepared: source.prepared,
      observedResolution: source.result === undefined
        ? { state: 'pending' as const }
        : {
            state: 'returned' as const, execution: 'runner_returned' as const,
            businessOutcome: source.result.kind === 'effect_cancellation_confirmed' ? 'completed' : 'refused',
            resultReferenceable: source.result.kind === 'effect_cancellation_confirmed',
            result: source.result,
          },
      ...(source.resultIdentity === undefined ? {} : { resultIdentity: source.resultIdentity }),
    }),
  })
  const prepared = await tracer.prepare({
    origin: input.origin, actor: owner, input: input.cancellation, context, freshnessMs: 900_000,
  })
  source.prepared = prepared.prepared
  if (input.fullYoloMandate !== undefined) {
    const configured = input.fullYoloMandate
    const reserved = configured.service.reserveCancellationAndAuthorize({
      mandateRef: configured.mandateRef,
      authorityUseRef: configured.authorityUseRef,
      actor: owner,
      providerRef: input.cancellation.providerRef,
      recipientRef: input.cancellation.providerRef,
      purpose: 'cancel_development_effect',
      dataFields: ['reason'],
      preparedMaterialDigest: prepared.prepared!.materialInputDigest,
      invocationRef: prepared.invocationRef,
      action: { id: cancelDevelopmentProviderOperationAction.id, version: 'v1' },
      effectGeneration: 1,
      risk: 'development_provider_operation_bounded_loss',
      ...(configured.policyDecisionRef === undefined
        ? {}
        : { policyDecisionRef: configured.policyDecisionRef }),
    })
    if (reserved.kind === 'refused') throw new Error(reserved.code)
    const authorized = await tracer.authorizeStandingMandateUse({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: prepared.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: owner,
      origin: input.origin,
      basis: reserved.value.basis,
    })
    if (authorized.kind === 'refused') {
      configured.service.compensateNotReleased(configured.authorityUseRef)
      throw new Error(authorized.code)
    }
    events.push({ kind: 'standing_mandate_authorization', invocationRef: prepared.invocationRef })
    const acquired = await tracer.acquire({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: authorized.view.invocationVersion,
      authorityRef: prepared.authority!.reference,
      actor: owner,
      origin: input.origin,
      materialInput: input.cancellation,
      leaseOwner: `mock:cancellation-worker:${input.ref}`,
      leaseMs: 30_000,
      acceptedAuthorityBasis: reserved.value.basis,
    })
    if (acquired.kind === 'refused' || acquired.view.control.state !== 'leased') {
      configured.service.compensateNotReleased(configured.authorityUseRef)
      throw new Error(acquired.kind === 'refused' ? acquired.code : 'cancellation_acquisition_failed')
    }
    const executed = await tracer.executeAcquired({
      invocationRef: prepared.invocationRef,
      expectedInvocationVersion: acquired.view.invocationVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
    if (executed.kind !== 'accepted') throw new Error(executed.code)
    const settled = configured.service.settleFromInvocation({
      authorityUseRef: configured.authorityUseRef,
      view: executed.view,
      attemptRef: acquired.view.control.attemptRef,
    })
    if (settled.kind === 'refused') throw new Error(settled.code)
    return { view: executed.view, origin: input.origin, owner, state, tracer: tracer as never, source, events }
  }
  const decision = await tracer.decide({
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
