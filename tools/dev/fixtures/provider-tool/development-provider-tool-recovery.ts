import {
  createDevelopmentDurablePort,
  createDevelopmentDurableState,
  createDurableActionExecutionTracer,
  type ActionExecutionOrigin,
  type PreparedExecution,
  type ReconciliationEvidenceMaterial,
} from '../../../../src/modules/action-execution'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import {
  executeDevelopmentProviderToolAction,
  type DevelopmentProviderToolInput,
  type DevelopmentProviderToolResult,
} from './development-provider-tool.actions'
import { providerToolActor, developmentProviderToolNow } from './development-provider-tool-fixture'
import type { createDevelopmentProviderToolProvider } from './development-provider-tool-provider'
import { runProviderToolExecution } from './development-provider-tool-runner'
import type { DevelopmentProviderToolSpendingPolicyService } from './development-provider-tool-spending-policy'

type Provider = ReturnType<typeof createDevelopmentProviderToolProvider>

export async function runProviderToolReconciliation(input: Readonly<{
  provider: Provider
  operation: DevelopmentProviderToolInput
  origin: ActionExecutionOrigin
  resolution?: 'released' | 'not_released'
  ref?: string
  evidenceRef?: string
  spendingPolicy?: Readonly<{
    service: DevelopmentProviderToolSpendingPolicyService
    spendingPolicyRef: string
    authorityUseRef: string
  }>
}>) {
  const issued = new Set<string>()
  const uncertain = await runProviderToolExecution({
    ...input,
    ref: input.ref ?? 'unknown',
    loseResponseAfterRelease: true,
    verifyReconciliationEvidence: (evidence) => issued.has(canonicalDigest(evidence)),
    ...(input.resolution === 'not_released' ? { unknownWithoutProviderRelease: true } : {}),
    ...(input.spendingPolicy === undefined ? {} : { spendingPolicy: input.spendingPolicy }),
  })
  const attempt = uncertain.view.attempts[0]
  if (attempt === undefined) throw new Error('operation_reconciliation_attempt_missing')
  const material: ReconciliationEvidenceMaterial = {
    kind: 'action_invocation_reconciliation',
    version: 1,
    evidenceRef: input.evidenceRef ?? 'mock:evidence:operation-observer',
    source: 'provider_operation.executeDevelopmentCancellable:mock-provider-observer:v1',
    invocationRef: uncertain.view.executionRef,
    attemptRef: attempt.attemptRef,
    effectGeneration: attempt.effectGeneration,
    resolution: input.resolution ?? 'released',
    observedAt: developmentProviderToolNow(),
  }
  const evidence = { ...material, digest: canonicalDigest(material) }
  issued.add(canonicalDigest(evidence))
  const cold = await uncertain.tracer.coldResume(uncertain.view.executionRef)
  const reconciled = await cold.reconcile({
    executionRef: uncertain.view.executionRef,
    expectedExecutionVersion: uncertain.view.executionVersion,
    attemptRef: attempt.attemptRef,
    actor: uncertain.owner,
    origin: uncertain.origin,
    evidence,
  })
  if (reconciled.kind !== 'accepted') throw new Error(reconciled.code)
  if (input.spendingPolicy !== undefined) {
    const settled = input.spendingPolicy.service.settleFromInvocation({
      authorityUseRef: input.spendingPolicy.authorityUseRef,
      view: reconciled.view,
      attemptRef: attempt.attemptRef,
    })
    if (settled.kind === 'refused') throw new Error(settled.code)
  }
  return { uncertain, attempt, evidence, reconciled: reconciled.view }
}

export async function runCancelBeforeRelease(input: Readonly<{
  operation: DevelopmentProviderToolInput
  origin: ActionExecutionOrigin
}>) {
  const owner = providerToolActor(input.origin)
  const state = createDevelopmentDurableState<DevelopmentProviderToolResult>()
  let preparedSource: PreparedExecution | undefined
  const tracer = createDurableActionExecutionTracer({
    action: executeDevelopmentProviderToolAction,
    port: createDevelopmentDurablePort(state),
    now: developmentProviderToolNow,
    nextExecutionRef: () => 'mock:operation-invocation:cancel-before',
    nextAuthorityRef: () => 'mock:operation-authority:cancel-before',
    nextAttemptRef: () => 'mock:operation-attempt:cancel-before',
    resolveSourceState: () => ({
      input: input.operation,
      context: {},
      prepared: preparedSource,
      observedResolution: { state: 'pending' },
    }),
  })
  const prepared = await tracer.prepare({
    origin: input.origin, actor: owner, input: input.operation, context: {}, freshnessMs: 900_000,
  })
  preparedSource = prepared.prepared
  const decision = await tracer.decide({
    executionRef: prepared.executionRef,
    expectedExecutionVersion: prepared.executionVersion,
    authorityRef: prepared.authority!.reference,
    actor: owner, origin: input.origin, accept: true,
  })
  if (decision.kind !== 'accepted') throw new Error(decision.code)
  const cancelled = await tracer.cancel({
    executionRef: prepared.executionRef,
    idempotencyKey: `cancel:${prepared.executionRef}:provider-recovery`,
    expectedExecutionVersion: decision.view.executionVersion,
    actor: owner, origin: input.origin,
  })
  if (cancelled.kind !== 'accepted') throw new Error(cancelled.code)
  return { view: cancelled.view, state }
}
