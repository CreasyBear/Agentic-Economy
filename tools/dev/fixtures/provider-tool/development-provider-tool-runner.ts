import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDevelopmentReleaseSignal,
  createDurableActionExecutionTracer,
  type ActionExecutionOrigin,
  type ActionExecutionView,
  type PreparedExecution,
  type ReconciliationEvidenceVerifier,
} from '../../../../src/modules/action-execution'
import type { TransferBoundaryEvent } from '../../../../src/modules/action-execution/transfer-evaluator'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import {
  cancelDevelopmentProviderToolAction,
  executeDevelopmentProviderToolAction,
  type DevelopmentProviderToolCancellationInput,
  type DevelopmentProviderToolCancellationResult,
  type DevelopmentProviderToolInput,
  type DevelopmentProviderToolResult,
} from './development-provider-tool.actions'
import { providerToolActor, developmentProviderToolNow } from './development-provider-tool-fixture'
import { bindDevelopmentProviderToolContext } from './development-provider-tool-context'
import type { createDevelopmentProviderToolProvider } from './development-provider-tool-provider'
import {
  spendingPolicyRefusalToExecutionRefusal,
  type DevelopmentProviderToolSpendingPolicyService,
} from './development-provider-tool-spending-policy'
import type { ExactAmount } from '../../../../src/modules/money/public'

type Provider = ReturnType<typeof createDevelopmentProviderToolProvider>
type ProviderToolExecutionEvent = TransferBoundaryEvent | Readonly<{
  kind: 'spending_policy_authorization'
  executionRef: string
}>

export type ProviderToolExecutionRun<Result extends DevelopmentProviderToolResult | DevelopmentProviderToolCancellationResult> =
  Readonly<{
    view: ActionExecutionView<Result>
    origin: ActionExecutionOrigin
    owner: ReturnType<typeof providerToolActor>
    state: ReturnType<typeof createDevelopmentDurableState<Result>>
    tracer: ReturnType<typeof createDurableActionExecutionTracer<unknown, Result>>
    source: Readonly<{
      input: unknown
      prepared: PreparedExecution | undefined
      result?: Result
      resultIdentity?: Readonly<{ sourceResultRef: string; resultDigest: string }>
    }>
    events: readonly ProviderToolExecutionEvent[]
  }>

export async function runProviderToolExecution(input: Readonly<{
  provider: Provider
  operation: DevelopmentProviderToolInput
  origin: ActionExecutionOrigin
  ref: string
  nowMs?: number
  loseResponseAfterRelease?: boolean
  unknownWithoutProviderRelease?: boolean
  corruptSourceResultAfterRelease?: boolean
  verifyReconciliationEvidence?: ReconciliationEvidenceVerifier
  spendingPolicy?: Readonly<{
    service: DevelopmentProviderToolSpendingPolicyService
    spendingPolicyRef: string
    authorityUseRef: string
    afterEffect?: () => void
    reconstructBeforeRelease?: (
      view: ActionExecutionView<DevelopmentProviderToolResult>,
    ) => DevelopmentProviderToolSpendingPolicyService
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
}>): Promise<ProviderToolExecutionRun<DevelopmentProviderToolResult>> {
  const events: ProviderToolExecutionEvent[] = []
  const source: {
    input: DevelopmentProviderToolInput
    prepared: PreparedExecution | undefined
    result?: DevelopmentProviderToolResult
    resultIdentity?: { sourceResultRef: string; resultDigest: string }
  } = { input: input.operation, prepared: undefined }
  const owner = providerToolActor(input.origin)
  const release = createDevelopmentReleaseSignal()
  const nowMs = input.nowMs ?? Date.parse(developmentProviderToolNow())
  const context = bindDevelopmentProviderToolContext({
    now: () => nowMs,
    authorityPrincipalRef: owner.principalRef,
    checkAvailability: (operation, now) => input.provider.check(operation, now),
    execute: async (operation) => {
      if (input.unknownWithoutProviderRelease === true) {
        throw new Error('mock_transport_failed_before_provider_release_observation')
      }
      events.push({ kind: 'provider_release' as const, actionId: executeDevelopmentProviderToolAction.id })
      release.markReleased()
      const result = await input.provider.execute(operation)
      if (input.loseResponseAfterRelease === true) throw new Error('mock_response_lost_after_possible_release')
      source.result = result
      source.resultIdentity = {
        sourceResultRef: result.kind === 'effect_confirmed'
          ? result.effectRef
          : `mock:tool-refusal:${input.ref}`,
        resultDigest: canonicalDigest(result as never),
      }
      if (input.corruptSourceResultAfterRelease === true && source.resultIdentity !== undefined) {
        source.resultIdentity.resultDigest = canonicalDigest({ corrupted: true })
      }
      return result
    },
  })
  const state = createDevelopmentDurableState<DevelopmentProviderToolResult>()
  const configuredSpendingPolicy = input.spendingPolicy
  let activeSpendingPolicyService = configuredSpendingPolicy?.service
  const tracer = createDurableActionExecutionTracer<DevelopmentProviderToolInput, DevelopmentProviderToolResult>({
    action: executeDevelopmentProviderToolAction,
    port: createDevelopmentDurablePort(state),
    now: developmentProviderToolNow,
    ...(input.unknownWithoutProviderRelease === true ? {} : { developmentReleaseSignal: release }),
    ...(input.verifyReconciliationEvidence === undefined
      ? {}
      : { verifyReconciliationEvidence: input.verifyReconciliationEvidence }),
    nextExecutionRef: () => `mock:operation-invocation:${input.ref}`,
    nextAuthorityRef: () => `mock:operation-authority:${input.ref}`,
    nextAttemptRef: () => `mock:operation-attempt:${input.ref}`,
    ...(configuredSpendingPolicy === undefined ? {} : {
      beforeEffectRelease: (current, effectGeneration) => {
        if (activeSpendingPolicyService === undefined) return 'authority_not_accepted' as const
        const checked = activeSpendingPolicyService.recheckRelease({
          authorityUseRef: configuredSpendingPolicy.authorityUseRef,
          view: current,
          effectGeneration,
        })
        if (configuredSpendingPolicy.throwFromReleaseFenceBeforeProvider === true) {
          throw new Error('mock_pre_release_infrastructure_fault')
        }
        return checked.kind === 'accepted'
          ? undefined
          : spendingPolicyRefusalToExecutionRefusal(checked.code)
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
  if (configuredSpendingPolicy === undefined) {
    const decision = await tracer.decide({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: prepared.executionVersion,
      authorityRef: prepared.authority!.reference,
      actor: owner, origin: input.origin, accept: true,
    })
    if (decision.kind !== 'accepted') throw new Error(decision.code)
    events.push({ kind: 'authority_decision', executionRef: prepared.executionRef })
    const executed = await tracer.execute({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: decision.view.executionVersion,
      authorityRef: prepared.authority!.reference,
      actor: owner, origin: input.origin, materialInput: input.operation,
    })
    if (executed.kind !== 'accepted') throw new Error(executed.code)
    return { view: executed.view, origin: input.origin, owner, state, tracer: tracer as never, source, events }
  }
  const bounded = configuredSpendingPolicy
  activeSpendingPolicyService = bounded.service
  const reserved = bounded.service.reserveAndAuthorize({
    spendingPolicyRef: bounded.spendingPolicyRef,
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
    standingAuthorization = await tracer.authorizeSpendingPolicyUse({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: bounded.developmentAuthorizationVersionOverride
        ?? prepared.executionVersion,
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
  events.push({ kind: 'spending_policy_authorization', executionRef: prepared.executionRef })
  let acquired
  try {
    acquired = await tracer.acquire({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: bounded.developmentAcquisitionVersionOverride
        ?? standingAuthorization.view.executionVersion,
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
      const resumed = await tracer.coldResume(prepared.executionRef)
      activeSpendingPolicyService = bounded.reconstructBeforeRelease(
        resumed.inspect(prepared.executionRef) ?? acquired.view,
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
      activeSpendingPolicyService,
      bounded.authorityUseRef,
      error instanceof Error ? error.message : 'pre_release_hook_threw',
    )
  }
  let executed
  try {
    executed = await tracer.executeAcquired({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: acquired.view.executionVersion,
      attemptRef: acquired.view.control.attemptRef,
      leaseOwner: acquired.view.control.leaseOwner,
      effectGeneration: acquired.view.control.effectGeneration,
    })
  } catch (error) {
    const current = tracer.inspect(prepared.executionRef)
    const settlement = activeSpendingPolicyService!.settleExecutionException({
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
    const settlement = activeSpendingPolicyService!.settleFromInvocation({
      authorityUseRef: bounded.authorityUseRef,
      view: executed.view ?? acquired.view,
      attemptRef: acquired.view.control.attemptRef,
    })
    if (settlement.kind === 'refused') throw new Error(settlement.code)
    throw new Error(executed.code)
  }
  const settled = activeSpendingPolicyService!.settleFromInvocation({
    authorityUseRef: bounded.authorityUseRef,
    view: executed.view,
    attemptRef: acquired.view.control.attemptRef,
  })
  if (settled.kind === 'refused') throw new Error(settled.code)
  return { view: executed.view, origin: input.origin, owner, state, tracer: tracer as never, source, events }
}

function compensateAndPreserve(
  service: DevelopmentProviderToolSpendingPolicyService,
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
  cancellation: DevelopmentProviderToolCancellationInput
  origin: ActionExecutionOrigin
  ref: string
  unrestrictedTestOnlySpendingPolicy?: Readonly<{
    service: DevelopmentProviderToolSpendingPolicyService
    spendingPolicyRef: string
    authorityUseRef: string
    policyDecisionRef?: string
  }>
}>): Promise<ProviderToolExecutionRun<DevelopmentProviderToolCancellationResult>> {
  const events: ProviderToolExecutionEvent[] = []
  const source: {
    input: DevelopmentProviderToolCancellationInput
    prepared: PreparedExecution | undefined
    result?: DevelopmentProviderToolCancellationResult
    resultIdentity?: { sourceResultRef: string; resultDigest: string }
  } = { input: input.cancellation, prepared: undefined }
  const owner = providerToolActor(input.origin)
  const release = createDevelopmentReleaseSignal()
  const context = bindDevelopmentProviderToolContext({
    authorityPrincipalRef: owner.principalRef,
    checkCancellation: (cancellation) => input.provider.checkCancellation(cancellation),
    cancel: async (cancellation) => {
      events.push({ kind: 'provider_release' as const, actionId: cancelDevelopmentProviderToolAction.id })
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
  const state = createDevelopmentDurableState<DevelopmentProviderToolCancellationResult>()
  const tracer = createDurableActionExecutionTracer<
    DevelopmentProviderToolCancellationInput,
    DevelopmentProviderToolCancellationResult
  >({
    action: cancelDevelopmentProviderToolAction,
    port: createDevelopmentDurablePort(state),
    now: developmentProviderToolNow,
    developmentReleaseSignal: release,
    nextExecutionRef: () => `mock:cancellation-invocation:${input.ref}`,
    nextAuthorityRef: () => `mock:cancellation-authority:${input.ref}`,
    nextAttemptRef: () => `mock:cancellation-attempt:${input.ref}`,
    ...(input.unrestrictedTestOnlySpendingPolicy === undefined ? {} : {
      beforeEffectRelease: (current, effectGeneration) => {
        const checked = input.unrestrictedTestOnlySpendingPolicy!.service.recheckRelease({
          authorityUseRef: input.unrestrictedTestOnlySpendingPolicy!.authorityUseRef,
          view: current,
          effectGeneration,
        })
        return checked.kind === 'accepted' ? undefined : spendingPolicyRefusalToExecutionRefusal(checked.code)
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
  if (input.unrestrictedTestOnlySpendingPolicy !== undefined) {
    const configured = input.unrestrictedTestOnlySpendingPolicy
    const reserved = configured.service.reserveCancellationAndAuthorize({
      spendingPolicyRef: configured.spendingPolicyRef,
      authorityUseRef: configured.authorityUseRef,
      actor: owner,
      providerRef: input.cancellation.providerRef,
      recipientRef: input.cancellation.providerRef,
      purpose: 'cancel_development_effect',
      dataFields: ['reason'],
      preparedMaterialDigest: prepared.prepared!.materialInputDigest,
      executionRef: prepared.executionRef,
      action: { id: cancelDevelopmentProviderToolAction.id, version: 'v1' },
      effectGeneration: 1,
      risk: 'development_provider_operation_bounded_loss',
      ...(configured.policyDecisionRef === undefined
        ? {}
        : { policyDecisionRef: configured.policyDecisionRef }),
    })
    if (reserved.kind === 'refused') throw new Error(reserved.code)
    const authorized = await tracer.authorizeSpendingPolicyUse({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: prepared.executionVersion,
      authorityRef: prepared.authority!.reference,
      actor: owner,
      origin: input.origin,
      basis: reserved.value.basis,
    })
    if (authorized.kind === 'refused') {
      configured.service.compensateNotReleased(configured.authorityUseRef)
      throw new Error(authorized.code)
    }
    events.push({ kind: 'spending_policy_authorization', executionRef: prepared.executionRef })
    const acquired = await tracer.acquire({
      executionRef: prepared.executionRef,
      expectedExecutionVersion: authorized.view.executionVersion,
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
      executionRef: prepared.executionRef,
      expectedExecutionVersion: acquired.view.executionVersion,
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
    executionRef: prepared.executionRef,
    expectedExecutionVersion: prepared.executionVersion,
    authorityRef: prepared.authority!.reference,
    actor: owner, origin: input.origin, accept: true,
  })
  if (decision.kind !== 'accepted') throw new Error(decision.code)
  events.push({ kind: 'authority_decision', executionRef: prepared.executionRef })
  const executed = await tracer.execute({
    executionRef: prepared.executionRef,
    expectedExecutionVersion: decision.view.executionVersion,
    authorityRef: prepared.authority!.reference,
    actor: owner, origin: input.origin, materialInput: input.cancellation,
  })
  if (executed.kind !== 'accepted') throw new Error(executed.code)
  return { view: executed.view, origin: input.origin, owner, state, tracer: tracer as never, source, events }
}
