import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionInvocationTracer,
  type ActionInvocationOrigin,
  type PreparedInvocation,
  type ReconciliationEvidenceMaterial,
} from '../../../../src/modules/action-invocation'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import {
  executeDevelopmentProviderOperationAction,
  type DevelopmentProviderOperationInput,
  type DevelopmentProviderOperationResult,
} from './development-provider-operation.actions'
import { providerOperationActor, developmentProviderOperationNow } from './development-provider-operation-fixture'
import type { createDevelopmentProviderOperationProvider } from './development-provider-operation-provider'
import { runProviderOperationInvocation } from './development-provider-operation-runner'
import type { DevelopmentProviderOperationMandateService } from './development-provider-operation-mandate'

type Provider = ReturnType<typeof createDevelopmentProviderOperationProvider>

export async function runProviderOperationReconciliation(input: Readonly<{
  provider: Provider
  operation: DevelopmentProviderOperationInput
  origin: ActionInvocationOrigin
  resolution?: 'released' | 'not_released'
  ref?: string
  evidenceRef?: string
  boundedMandate?: Readonly<{
    service: DevelopmentProviderOperationMandateService
    mandateRef: string
    authorityUseRef: string
  }>
}>) {
  const issued = new Set<string>()
  const uncertain = await runProviderOperationInvocation({
    ...input,
    ref: input.ref ?? 'unknown',
    loseResponseAfterRelease: true,
    verifyReconciliationEvidence: (evidence) => issued.has(canonicalDigest(evidence)),
    ...(input.resolution === 'not_released' ? { unknownWithoutProviderRelease: true } : {}),
    ...(input.boundedMandate === undefined ? {} : { boundedMandate: input.boundedMandate }),
  })
  const attempt = uncertain.view.attempts[0]
  if (attempt === undefined) throw new Error('operation_reconciliation_attempt_missing')
  const material: ReconciliationEvidenceMaterial = {
    kind: 'action_invocation_reconciliation',
    version: 1,
    evidenceRef: input.evidenceRef ?? 'mock:evidence:operation-observer',
    source: 'provider_operation.executeDevelopmentCancellable:mock-provider-observer:v1',
    invocationRef: uncertain.view.invocationRef,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
    resolution: input.resolution ?? 'released',
    observedAt: developmentProviderOperationNow(),
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
  if (input.boundedMandate !== undefined) {
    const settled = input.boundedMandate.service.settleFromInvocation({
      authorityUseRef: input.boundedMandate.authorityUseRef,
      view: reconciled.view,
      attemptRef: attempt.attemptRef,
    })
    if (settled.kind === 'refused') throw new Error(settled.code)
  }
  return { uncertain, attempt, evidence, reconciled: reconciled.view }
}

export function runCancelBeforeRelease(input: Readonly<{
  operation: DevelopmentProviderOperationInput
  origin: ActionInvocationOrigin
}>) {
  const owner = providerOperationActor(input.origin)
  const state = createDevelopmentDurableState<DevelopmentProviderOperationResult>()
  let preparedSource: PreparedInvocation | undefined
  const tracer = createDurableActionInvocationTracer({
    action: executeDevelopmentProviderOperationAction,
    port: createDevelopmentDurablePort(state),
    now: developmentProviderOperationNow,
    nextInvocationRef: () => 'mock:operation-invocation:cancel-before',
    nextAuthorityRef: () => 'mock:operation-authority:cancel-before',
    nextAttemptRef: () => 'mock:operation-attempt:cancel-before',
    resolveSourceState: () => ({
      input: input.operation,
      context: {},
      prepared: preparedSource,
      observedResolution: { state: 'pending' },
    }),
  })
  const prepared = tracer.prepare({
    origin: input.origin, actor: owner, input: input.operation, context: {}, freshnessMs: 900_000,
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
