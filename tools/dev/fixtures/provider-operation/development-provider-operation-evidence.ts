import {
  evaluateAdr009Transfer,
  type TransferBoundaryEvent,
} from '../../../../src/modules/action-invocation/transfer-evaluator'
import {
  cancelDevelopmentProviderOperationAction,
  executeDevelopmentProviderOperationAction,
  type DevelopmentProviderOperationResult,
} from './development-provider-operation.actions'
import {
  providerOperationActor,
  providerOperationInput,
  cancellationInput,
  developmentProviderOperationNowMs,
} from './development-provider-operation-fixture'
import { projectDurableRun } from './development-provider-operation-packet'
import { createDevelopmentProviderOperationProvider } from './development-provider-operation-provider'
import {
  runProviderOperationReconciliation,
  runCancelBeforeRelease,
} from './development-provider-operation-recovery'
import {
  runCancellationInvocation,
  runProviderOperationInvocation,
} from './development-provider-operation-runner'

export async function runDevelopmentProviderOperationEvidence() {
  const provider = createDevelopmentProviderOperationProvider()
  const availability = await provider.availability()
  const requestOrigin = { kind: 'request_owned', requestRef: 'mock:request:operation', revision: 1 } as const
  const standaloneOrigin = {
    kind: 'standalone', callerRef: 'mock:caller:operation', principalRef: 'mock:principal:operation',
  } as const

  const requestOperation = providerOperationInput(
    availability, providerOperationActor(requestOrigin).principalRef, 'mock:operation:request-owned',
  )
  const standaloneOperation = providerOperationInput(
    availability, providerOperationActor(standaloneOrigin).principalRef, 'mock:operation:standalone',
  )
  const request = await runProviderOperationInvocation({
    provider, operation: requestOperation, origin: requestOrigin, ref: 'request-owned',
  })
  const standalone = await runProviderOperationInvocation({
    provider, operation: standaloneOperation, origin: standaloneOrigin, ref: 'standalone',
  })

  const sharedOriginA = {
    kind: 'standalone', callerRef: 'mock:caller:dedupe:a', principalRef: 'mock:principal:dedupe',
  } as const
  const sharedOriginB = {
    kind: 'standalone', callerRef: 'mock:caller:dedupe:b', principalRef: 'mock:principal:dedupe',
  } as const
  const sharedOperation = providerOperationInput(
    availability, sharedOriginA.principalRef, 'mock:operation:dedupe',
  )
  const effectsBeforeDedupe = provider.effectCount()
  const dedupeA = await runProviderOperationInvocation({
    provider, operation: sharedOperation, origin: sharedOriginA, ref: 'dedupe-a',
  })
  const effectsAfterFirst = provider.effectCount()
  const dedupeB = await runProviderOperationInvocation({
    provider, operation: structuredClone(sharedOperation), origin: sharedOriginB, ref: 'dedupe-b',
  })
  const effectsAfterReplay = provider.effectCount()
  const conflict = await runProviderOperationInvocation({
    provider,
    operation: { ...sharedOperation, customer: { ...sharedOperation.customer, email: 'changed@example.test' } },
    origin: sharedOriginB,
    ref: 'dedupe-conflict',
  })
  const effectsAfterConflict = provider.effectCount()

  const principalOrigin = {
    kind: 'standalone', callerRef: 'mock:caller:principal-refusal', principalRef: 'mock:principal:authority',
  } as const
  const principalRefusal = await runProviderOperationInvocation({
    provider,
    operation: providerOperationInput(availability, 'mock:principal:other', 'mock:operation:principal-refusal'),
    origin: principalOrigin,
    ref: 'principal-refusal',
  })
  const expiredOperation = providerOperationInput(
    availability, 'mock:principal:expired', 'mock:operation:expired',
  )
  const expired = await runProviderOperationInvocation({
    provider,
    operation: expiredOperation,
    origin: {
      kind: 'standalone', callerRef: 'mock:caller:expired', principalRef: expiredOperation.customer.principalRef,
    },
    ref: 'expired',
    nowMs: Date.parse(expiredOperation.slot.expiresAt) + 1,
  })

  const unknownOrigin = {
    kind: 'standalone', callerRef: 'mock:caller:unknown', principalRef: 'mock:principal:unknown',
  } as const
  const recovery = await runProviderOperationReconciliation({
    provider,
    operation: providerOperationInput(availability, unknownOrigin.principalRef, 'mock:operation:unknown'),
    origin: unknownOrigin,
  })
  const cancelBefore = runCancelBeforeRelease({
    operation: providerOperationInput(availability, 'mock:principal:cancel-before', 'mock:operation:cancel-before'),
    origin: {
      kind: 'standalone', callerRef: 'mock:caller:cancel-before', principalRef: 'mock:principal:cancel-before',
    },
  })

  const effect = effectResult(standalone.view.observedResolution)
  const cancellation = cancellationInput({
    effectRef: effect.effectRef,
    providerRef: effect.providerRef,
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
        { kind: 'direct_runner_started', actionId: executeDevelopmentProviderOperationAction.id },
        { kind: 'provider_release', actionId: executeDevelopmentProviderOperationAction.id },
        { kind: 'direct_runner_returned', actionId: executeDevelopmentProviderOperationAction.id, outcome: 'effect_confirmed' },
      ],
      controlled: [
        ...standalone.events.filter(
          (event): event is TransferBoundaryEvent =>
            event.kind !== 'standing_mandate_authorization',
        ),
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
      retryClass: executeDevelopmentProviderOperationAction.invocationContract!.retryClass,
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
      effectResult(dedupeA.view.observedResolution).effectRef
      === effectResult(dedupeB.view.observedResolution).effectRef
      && effectsAfterFirst === effectsAfterReplay
      && effectsAfterFirst === effectsBeforeDedupe + 1,
    conflictWithoutEffect:
      conflict.view.observedResolution.state === 'returned'
      && conflict.view.observedResolution.result.kind === 'effect_refused'
      && effectsAfterConflict === effectsAfterReplay,
    providerCancellation:
      cancellationRun.view.observedResolution.state === 'returned'
      && cancellationRun.view.observedResolution.result.kind === 'effect_cancellation_confirmed'
      && provider.cancellationEffectCount() === cancellationEffectsBeforePrincipalRefusal,
  }

  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    proofClass: 'labelled_local_development',
    action: { id: executeDevelopmentProviderOperationAction.id, version: 'v1', surfaces: [] },
    cancellationAction: { id: cancelDevelopmentProviderOperationAction.id, version: 'v1', surfaces: [] },
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
      originalEffect: standalone.view.observedResolution,
      providerEffectRecord: provider.inspect(standaloneOperation.operationKey),
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

function effectResult(
  resolution: import('@/modules/action-invocation').ActionInvocationView<DevelopmentProviderOperationResult>['observedResolution'],
) {
  if (resolution.state !== 'returned' || resolution.result.kind !== 'effect_confirmed') {
    throw new Error('confirmed_effect_missing')
  }
  return resolution.result
}
