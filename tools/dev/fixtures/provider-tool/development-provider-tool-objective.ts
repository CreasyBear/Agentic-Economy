import {
  createDevelopmentSpendingPolicyGrantVerifier,
  evaluateSpendingPolicy,
  issueSpendingPolicy,
  materialDigest,
  SpendingPolicyStore,
  type SpendingPolicyDecision,
  type SpendingPolicy,
  type SpendingPolicySnapshot,
} from '../../../../src/modules/action-execution'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { AnyAction } from '../../../../src/modules/common/action'
import {
  cancelDevelopmentProviderToolAction,
  executeDevelopmentProviderToolAction,
} from './development-provider-tool.actions'
import {
  providerToolInput,
  cancellationInput,
  developmentProviderToolNow,
} from './development-provider-tool-fixture'
import { createDevelopmentProviderToolSpendingPolicyService } from './development-provider-tool-spending-policy'
import {
  projectDurableRun,
  reconstructDevelopmentProviderToolExecution,
} from './development-provider-tool-packet'
import { createDevelopmentProviderToolProvider } from './development-provider-tool-provider'
import type { DevelopmentProviderToolProviderSnapshot } from './development-provider-tool-provider'
import {
  developmentCancellationConfirmationRule,
} from './development-provider-tool-offset-rule'
import {
  developmentProviderToolVerificationKey,
  type DevelopmentProviderToolSigningCustody,
} from './development-provider-tool-signing-custody'
import { runCancellationInvocation, runProviderToolExecution } from './development-provider-tool-runner'

const objective = 'Create one scheduled provider effect and cancel it if the provider confirms the objective no longer requires it.'
const principalRef = 'mock:principal:full-yolo'
const callerRef = 'mock:caller:full-yolo'
const delegateRef = 'mock:delegate:full-yolo'
const origin = { kind: 'standalone', principalRef, callerRef } as const
const objectiveRef = 'mock:objective:full-yolo'

export type DevelopmentProviderToolObjectiveState = Readonly<{
  format: 'ae.development-provider-tool-objective:v1'
  objectiveRef: string
  stage: 'attempt_primary' | 'operation_confirmed' | 'completed'
  currentActionRef: string
  fallbackProgress: Readonly<{
    attemptedProviderRefs: readonly string[]
    activeFallbackRef: string
  }>
  completedInvocationRefs: readonly string[]
  policyDecisionRefs: readonly string[]
  operationResultRef: string | null
  cancellationResultRef: string | null
  digest: string
}>

function objectiveState(
  material: Omit<DevelopmentProviderToolObjectiveState, 'format' | 'digest'>,
): DevelopmentProviderToolObjectiveState {
  const value = { format: 'ae.development-provider-tool-objective:v1' as const, ...material }
  return { ...value, digest: canonicalDigest(value as never) }
}

export function developmentProviderToolObjectiveStateValid(state: DevelopmentProviderToolObjectiveState) {
  const { digest, ...material } = state
  return digest === canonicalDigest(material as never)
}

export type DevelopmentProviderToolMidPhase = Readonly<{
  kind: 'operation_phase_complete'
  processId: number
  spendingPolicy: SpendingPolicy
  grant: ReturnType<ReturnType<typeof createDevelopmentSpendingPolicyGrantVerifier>>
  policyDecisions: readonly SpendingPolicyDecision[]
  initialObjectiveState: DevelopmentProviderToolObjectiveState
  midRun: {
    spendingPolicySnapshot: SpendingPolicySnapshot
    providerSnapshot: DevelopmentProviderToolProviderSnapshot
    objectiveState: DevelopmentProviderToolObjectiveState
    durableInvocations: readonly ReturnType<typeof projectDurableRun>[]
  }
  invocationRecords: readonly ReturnType<typeof invocationRecord>[]
  providerAEffects: number
}>

export async function runUnrestrictedTestOnlyDevelopmentObjective(
  signingCustody: DevelopmentProviderToolSigningCustody,
) {
  const result = await runUnrestrictedTestOnlyDevelopmentObjectiveInternal(signingCustody, false)
  if ('kind' in result) throw new Error('development_provider_operation_final_phase_missing')
  return result
}

export async function runUnrestrictedTestOnlyDevelopmentProviderToolPhase(
  signingCustody: DevelopmentProviderToolSigningCustody,
) {
  const result = await runUnrestrictedTestOnlyDevelopmentObjectiveInternal(signingCustody, true)
  if (!('kind' in result)) throw new Error('development_provider_operation_mid_phase_missing')
  return result
}

async function runUnrestrictedTestOnlyDevelopmentObjectiveInternal(
  signingCustody: DevelopmentProviderToolSigningCustody,
  stopAfterOperation: boolean,
) {
  const providerA = createDevelopmentProviderToolProvider({
    providerRef: 'mock:provider:calendar:a',
    slotRef: 'mock:slot:a',
    refusal: 'terms_changed',
  })
  const providerB = createDevelopmentProviderToolProvider({
    providerRef: 'mock:provider:calendar:b',
    slotRef: 'mock:slot:b',
    exposureAmount: { currency: 'AUD', units: '5000', exponent: 2 },
    signingCustody,
  })
  const slotA = await providerA.availability()
  const slotB = await providerB.availability()
  const spendingPolicyDecision = issueSpendingPolicy({
    mode: 'unrestricted_test_only',
    spendingPolicyRef: 'mock:standing-mandate:full-yolo',
    version: 1,
    generation: 1,
    grantorRef: 'mock:grantor:customer',
    principalRef,
    delegateRef,
    callerRef,
    issuedAt: developmentProviderToolNow(),
    scope: {
      objective,
      action: { id: executeDevelopmentProviderToolAction.id, version: 'v1' },
      actions: [
        { id: executeDevelopmentProviderToolAction.id, version: 'v1' },
        { id: cancelDevelopmentProviderToolAction.id, version: 'v1' },
      ],
      providerRefs: [slotA.providerRef, slotB.providerRef],
      recipientRefs: [slotA.providerRef, slotB.providerRef],
      purposes: ['create_development_effect', 'cancel_development_effect'],
      allowedDataFields: ['customer.name', 'customer.email', 'reason'],
      maximumSpend: { currency: 'AUD', units: '10000', exponent: 2 },
      maximumLoss: { currency: 'AUD', units: '5000', exponent: 2 },
      maximumActionCount: 4,
      maximumConcurrentReservations: 2,
      startsAt: developmentProviderToolNow(),
      expiresAt: '2026-07-19T05:00:00.000Z',
      permittedFallbacks: ['provider_a_primary', 'provider_b_after_terms_refusal', 'none'],
      riskCeiling: 'development_provider_operation_bounded_loss',
      exposureOffsetRules: [developmentCancellationConfirmationRule],
      exposureOffsetVerificationKeys: [developmentProviderToolVerificationKey(signingCustody)],
    },
  })
  if (spendingPolicyDecision.kind === 'refused') throw new Error(spendingPolicyDecision.code)
  const spendingPolicy = spendingPolicyDecision.value
  const verifier = createDevelopmentSpendingPolicyGrantVerifier({
    admittedSpendingPolicyDigest: spendingPolicy.digest,
    evidenceRef: 'mock:evidence:full-yolo-grant',
    verifierRef: 'mock:verifier:full-yolo-grant',
    source: 'mock:authenticated-principal-grant:v1',
    freshUntil: '2026-07-19T04:30:00.000Z',
  })
  const grant = verifier(spendingPolicy, developmentProviderToolNow())
  if (!grant.authenticated) throw new Error(grant.reason)
  let store = new SpendingPolicyStore()
  const issued = store.issue(spendingPolicy, grant, developmentProviderToolNow())
  if (issued.kind === 'refused') throw new Error(issued.code)
  let service = providerToolSpendingPolicyService(store)
  const decisions: SpendingPolicyDecision[] = []
  const initialObjectiveState = objectiveState({
    objectiveRef,
    stage: 'attempt_primary',
    currentActionRef: executeDevelopmentProviderToolAction.id,
    fallbackProgress: { attemptedProviderRefs: [], activeFallbackRef: 'provider_a_primary' },
    completedInvocationRefs: [],
    policyDecisionRefs: [],
    operationResultRef: null,
    cancellationResultRef: null,
  })

  const choose = (
    policyDecisionRef: string,
    proposal: Parameters<typeof evaluateSpendingPolicy>[0]['proposal'],
  ) => {
    const decision = evaluateSpendingPolicy({
      spendingPolicy,
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

  const operationA = providerToolInput(slotA, principalRef, 'mock:operation:full-yolo:a')
  const operationAInvocationRef = 'mock:operation-invocation:full-yolo-a'
  const decisionA = choose('mock:policy-decision:full-yolo:a', {
    objectiveRef,
    objective,
    sourceOptionRef: slotA.provenance.observationRef,
    materialDigest: materialDigest(
      operationA,
      executeDevelopmentProviderToolAction.invocationContract!.materialInputPaths,
    ),
    authorityUseRef: 'mock:authority-use:full-yolo:a',
    executionRef: operationAInvocationRef,
    action: { id: executeDevelopmentProviderToolAction.id, version: 'v1' },
    providerRef: slotA.providerRef,
    recipientRef: slotA.providerRef,
    purpose: 'create_development_effect',
    dataFields: ['customer.name', 'customer.email'],
    spend: { currency: 'AUD', units: '0', exponent: 2 },
    worstCaseLoss: { currency: 'AUD', units: '0', exponent: 2 },
    fallbackRef: 'provider_a_primary',
    risk: 'development_provider_operation_bounded_loss',
  })
  const first = await runProviderToolExecution({
    provider: providerA,
    operation: operationA,
    origin,
    ref: 'full-yolo-a',
    spendingPolicy: {
      service,
      spendingPolicyRef: spendingPolicy.spendingPolicyRef,
      authorityUseRef: 'mock:authority-use:full-yolo:a',
      fallbackRef: 'provider_a_primary',
      reservedLoss: { currency: 'AUD', units: '0', exponent: 2 },
      risk: 'development_provider_operation_bounded_loss',
      policyDecisionRef: decisionA.policyDecisionRef,
    },
  })
  if (first.view.observedResolution.state !== 'returned'
    || first.view.observedResolution.result.kind !== 'effect_refused') {
    throw new Error('provider_a_expected_refusal_missing')
  }

  const operationB = providerToolInput(slotB, principalRef, 'mock:operation:full-yolo:b')
  const operationBInvocationRef = 'mock:operation-invocation:full-yolo-b'
  const decisionB = choose('mock:policy-decision:full-yolo:b', {
    objectiveRef,
    objective,
    sourceOptionRef: slotB.provenance.observationRef,
    materialDigest: materialDigest(
      operationB,
      executeDevelopmentProviderToolAction.invocationContract!.materialInputPaths,
    ),
    authorityUseRef: 'mock:authority-use:full-yolo:b',
    executionRef: operationBInvocationRef,
    action: { id: executeDevelopmentProviderToolAction.id, version: 'v1' },
    providerRef: slotB.providerRef,
    recipientRef: slotB.providerRef,
    purpose: 'create_development_effect',
    dataFields: ['customer.name', 'customer.email'],
    spend: { currency: 'AUD', units: '5000', exponent: 2 },
    worstCaseLoss: { currency: 'AUD', units: '5000', exponent: 2 },
    fallbackRef: 'provider_b_after_terms_refusal',
    risk: 'development_provider_operation_bounded_loss',
  })
  const second = await runProviderToolExecution({
    provider: providerB,
    operation: operationB,
    origin,
    ref: 'full-yolo-b',
    spendingPolicy: {
      service,
      spendingPolicyRef: spendingPolicy.spendingPolicyRef,
      authorityUseRef: 'mock:authority-use:full-yolo:b',
      fallbackRef: 'provider_b_after_terms_refusal',
      reservedSpend: { currency: 'AUD', units: '5000', exponent: 2 },
      reservedLoss: { currency: 'AUD', units: '5000', exponent: 2 },
      risk: 'development_provider_operation_bounded_loss',
      policyDecisionRef: decisionB.policyDecisionRef,
      reconstructBeforeRelease: () => {
        store = new SpendingPolicyStore(structuredClone(store.exportSnapshot()))
        service = providerToolSpendingPolicyService(store)
        return service
      },
    },
  })
  if (second.view.observedResolution.state !== 'returned'
    || second.view.observedResolution.result.kind !== 'effect_confirmed') {
    throw new Error('provider_b_confirmation_missing')
  }
  const confirmed = second.view.observedResolution.result
  const midObjectiveState = objectiveState({
    objectiveRef,
    stage: 'operation_confirmed',
    currentActionRef: cancelDevelopmentProviderToolAction.id,
    fallbackProgress: {
      attemptedProviderRefs: [slotA.providerRef, slotB.providerRef],
      activeFallbackRef: 'none',
    },
    completedInvocationRefs: [first.view.executionRef, second.view.executionRef],
    policyDecisionRefs: decisions.map(({ policyDecisionRef }) => policyDecisionRef),
    operationResultRef: confirmed.effectRef,
    cancellationResultRef: null,
  })
  const midRun = {
    spendingPolicySnapshot: structuredClone(store.exportSnapshot()),
    providerSnapshot: providerB.exportSnapshot(),
    objectiveState: midObjectiveState,
    durableInvocations: [projectDurableRun(first), projectDurableRun(second)],
  }
  if (stopAfterOperation) {
    return {
      kind: 'operation_phase_complete' as const,
      processId: process.pid,
      spendingPolicy,
      grant,
      policyDecisions: decisions,
      initialObjectiveState,
      midRun,
      invocationRecords: [invocationRecord(first), invocationRecord(second)],
      providerAEffects: providerA.effectCount(),
    }
  }
  const resumed = await resumeDevelopmentProviderToolObjective({
    processRef: 'mock:process:cold-resume:1',
    spendingPolicy,
    spendingPolicySnapshot: midRun.spendingPolicySnapshot,
    providerSnapshot: midRun.providerSnapshot,
    objectiveState: midRun.objectiveState,
    durableInvocations: midRun.durableInvocations,
    signingCustody,
  })
  decisions.push(...resumed.newPolicyDecisions)
  const cancellation = resumed.cancellationRun!
  const cancellationResult = resumed.cancellationResult!
  const cancellationMaterial = cancellation.source.input
  const cold = resumed.store
  const invocationRecords = [
    invocationRecord(first),
    invocationRecord(second),
    invocationRecord(cancellation),
  ]
  const actionById = new Map<string, AnyAction>([
    [executeDevelopmentProviderToolAction.id, executeDevelopmentProviderToolAction],
    [cancelDevelopmentProviderToolAction.id, cancelDevelopmentProviderToolAction],
  ])
  const reconstructed = await Promise.all(invocationRecords.map(async (record) => {
    const action = actionById.get(record.action.id)
    if (action === undefined) throw new Error('cold_action_missing')
    return (await reconstructDevelopmentProviderToolExecution({
      executionRef: record.executionRef,
      action,
      durable: record.durable,
    })).view
  }))
  const providerSnapshot = resumed.providerSnapshot
  const effectsBeforeReplay = resumed.effectCounts
  const replayed = await resumeDevelopmentProviderToolObjective({
    processRef: 'mock:process:cold-resume:2',
    spendingPolicy,
    spendingPolicySnapshot: cold.exportSnapshot(),
    providerSnapshot,
    objectiveState: resumed.objectiveState,
    durableInvocations: invocationRecords.map(({ durable }) => durable),
    signingCustody,
  })
  const effectsAfterReplay = replayed.effectCounts
  return {
    environment: 'MOCK/DEVELOPMENT ONLY' as const,
    objective,
    grant,
    spendingPolicySnapshot: cold.exportSnapshot(),
    policyDecisions: decisions,
    objectiveDecisionRecords: [
      { ordinal: 0, kind: 'attempt_primary', providerRef: slotA.providerRef },
      { ordinal: 1, kind: 'fallback_after_terms_refusal', providerRef: slotB.providerRef },
      { ordinal: 2, kind: 'cancel_on_source_owned_condition', providerRef: slotB.providerRef },
    ],
    invocations: invocationRecords,
    authoritativeResults: {
      operation: {
        principalRef,
        input: operationB,
        result: confirmed,
        resultDigest: canonicalDigest(confirmed),
      },
      cancellation: {
        principalRef,
        input: cancellationMaterial,
        result: cancellationResult,
        resultDigest: canonicalDigest(cancellationResult as never),
      },
    },
    coldContinuation: {
      midRun,
      initialObjectiveState,
      finalObjectiveState: resumed.objectiveState,
      replayedObjectiveState: replayed.objectiveState,
      freshObjectGraphRefs: [resumed.processRef, replayed.processRef],
      resumeReconstructedInvocationRefs: resumed.reconstructed.map(({ executionRef }) => executionRef),
      replayReconstructedInvocationRefs: replayed.reconstructed.map(({ executionRef }) => executionRef),
      reconstructed: reconstructed.map((view) => ({
        executionRef: view.executionRef,
        executionVersion: view.executionVersion,
        controlState: view.control.state,
        authorityUseRef: view.acceptedAuthority?.kind === 'spending_policy_use'
          ? view.acceptedAuthority.authorityUseRef
          : null,
      })),
      spendingPolicySnapshot: cold.exportSnapshot(),
      providerSnapshot,
      effectsBeforeReplay,
      effectsAfterReplay,
      continuationKind: 'source_owned_objective_resume' as const,
      noDuplicateEffect:
        effectsBeforeReplay.operation === effectsAfterReplay.operation
        && effectsBeforeReplay.cancellation === effectsAfterReplay.cancellation
        && resumed.objectiveState.digest === replayed.objectiveState.digest,
    },
    providerEffects: {
      providerA: providerA.effectCount(),
      providerB: providerSnapshot.effects,
      cancellation: providerSnapshot.cancellationEffects,
    },
    capacityAfterCancellation: cold.capacity(spendingPolicy.spendingPolicyRef),
    comparison: {
      approveEachPrincipalDecisions: 3,
      spendingPolicyStopsAtDifferentAction: true,
      unrestrictedTestOnlyPrincipalGrantDecisions: 1,
      repeatedPrincipalDecisions: 0,
      retainedExactAuthorityUses: cold.exportSnapshot().uses.length,
    },
    claimCeiling: 'Labelled local deterministic development behavior only; no reachable host, live provider, durable multi-worker CAS, deployment, production safety, or customer value.',
  }
}

function invocationRecord(run: any) {
  return {
    executionRef: run.view.executionRef,
    action: run.view.action,
    acceptedAuthority: run.view.acceptedAuthority,
    events: run.events,
    durable: projectDurableRun(run),
    resultDigest: canonicalDigest(run.view.observedResolution),
  }
}

export async function resumeDevelopmentProviderToolObjective(input: Readonly<{
  processRef: string
  spendingPolicy: SpendingPolicy
  spendingPolicySnapshot: SpendingPolicySnapshot
  providerSnapshot: DevelopmentProviderToolProviderSnapshot
  objectiveState: DevelopmentProviderToolObjectiveState
  durableInvocations: readonly ReturnType<typeof projectDurableRun>[]
  signingCustody: DevelopmentProviderToolSigningCustody
}>) {
  if (!developmentProviderToolObjectiveStateValid(input.objectiveState)) {
    throw new Error('development_provider_operation_objective_integrity_refused')
  }
  if (
    input.objectiveState.objectiveRef !== objectiveRef
    || input.objectiveState.completedInvocationRefs.length !== input.durableInvocations.length
  ) throw new Error('development_provider_operation_objective_linkage_refused')

  const reconstructed = await Promise.all(input.durableInvocations.map(async (durable, index) => {
    const executionRef = input.objectiveState.completedInvocationRefs[index]
    const action = index < 2
      ? executeDevelopmentProviderToolAction
      : cancelDevelopmentProviderToolAction
    if (executionRef === undefined) throw new Error('development_provider_operation_objective_invocation_missing')
    return (await reconstructDevelopmentProviderToolExecution({ executionRef, action, durable })).view
  }))
  const provider = createDevelopmentProviderToolProvider({
    ...input.providerSnapshot.options,
    signingCustody: input.signingCustody,
    snapshot: input.providerSnapshot,
  })
  const effectCounts = () => ({
    operation: provider.effectCount(),
    cancellation: provider.cancellationEffectCount(),
  })
  if (input.objectiveState.stage === 'completed') {
    if (
      input.objectiveState.currentActionRef !== 'none'
      || input.objectiveState.cancellationResultRef === null
      || reconstructed.at(-1)?.observedResolution.state !== 'returned'
    ) throw new Error('development_provider_operation_terminal_state_refused')
    return {
      processRef: input.processRef,
      store: new SpendingPolicyStore(structuredClone(input.spendingPolicySnapshot)),
      providerSnapshot: provider.exportSnapshot(),
      objectiveState: input.objectiveState,
      reconstructed,
      effectCounts: effectCounts(),
      newPolicyDecisions: [] as SpendingPolicyDecision[],
      cancellationRun: null,
      cancellationResult: null,
    }
  }
  if (
    input.objectiveState.stage !== 'operation_confirmed'
    || input.objectiveState.currentActionRef !== cancelDevelopmentProviderToolAction.id
  ) throw new Error('development_provider_operation_objective_stage_refused')
  const operationView = reconstructed.at(-1)
  if (
    operationView?.observedResolution.state !== 'returned'
    || operationView.observedResolution.result.kind !== 'effect_confirmed'
    || operationView.observedResolution.result.effectRef !== input.objectiveState.operationResultRef
  ) throw new Error('development_provider_operation_objective_operation_result_refused')
  const confirmed = operationView.observedResolution.result
  let store = new SpendingPolicyStore(structuredClone(input.spendingPolicySnapshot))
  const cancellationMaterial = cancellationInput({
    effectRef: confirmed.effectRef,
    providerRef: confirmed.providerRef,
    principalRef,
    operationKey: 'mock:operation:full-yolo:cancel',
  })
  const cancellationInvocationRef = 'mock:cancellation-invocation:full-yolo-cancel'
  const decision = evaluateSpendingPolicy({
    spendingPolicy: input.spendingPolicy,
    uses: store.exportSnapshot().uses,
    policyDecisionRef: 'mock:policy-decision:full-yolo:cancel',
    proposal: {
      objectiveRef,
      objective,
      sourceOptionRef: confirmed.evidenceRef,
      materialDigest: materialDigest(
        cancellationMaterial,
        cancelDevelopmentProviderToolAction.invocationContract!.materialInputPaths,
      ),
      authorityUseRef: 'mock:authority-use:full-yolo:cancel',
      executionRef: cancellationInvocationRef,
      action: { id: cancelDevelopmentProviderToolAction.id, version: 'v1' },
      providerRef: confirmed.providerRef,
      recipientRef: confirmed.providerRef,
      purpose: 'cancel_development_effect',
      dataFields: ['reason'],
      spend: { currency: 'AUD', units: '0', exponent: 2 },
      worstCaseLoss: { currency: 'AUD', units: '0', exponent: 2 },
      fallbackRef: 'none',
      risk: 'development_provider_operation_bounded_loss',
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
    unrestrictedTestOnlySpendingPolicy: {
      service: providerToolSpendingPolicyService(store),
      spendingPolicyRef: input.spendingPolicy.spendingPolicyRef,
      authorityUseRef: 'mock:authority-use:full-yolo:cancel',
      policyDecisionRef: decision.value.policyDecisionRef,
    },
  })
  if (
    cancellationRun.view.observedResolution.state !== 'returned'
    || cancellationRun.view.observedResolution.result.kind !== 'effect_cancellation_confirmed'
  ) throw new Error('provider_confirmed_cancellation_missing')
  const cancellationResult = cancellationRun.view.observedResolution.result
  if (cancellationResult.exposureReleaseAttestation === undefined) {
    throw new Error('provider_release_attestation_missing')
  }
  const providerSnapshot = provider.exportSnapshot()
  store = new SpendingPolicyStore(structuredClone(store.exportSnapshot()))
  const offset = store.recordExposureOffset({
    authorityUseRef: 'mock:authority-use:full-yolo:b',
    offsetAuthorityUseRef: 'mock:authority-use:full-yolo:cancel',
    spendingPolicyRef: input.spendingPolicy.spendingPolicyRef,
    spendingPolicyVersion: input.spendingPolicy.version,
    spendingPolicyGeneration: input.spendingPolicy.generation,
    principalRef,
    providerRef: confirmed.providerRef,
    exposureAction: { id: executeDevelopmentProviderToolAction.id, version: 'v1' },
    offsetAction: { id: cancelDevelopmentProviderToolAction.id, version: 'v1' },
    exposureSubjectRef: confirmed.effectRef,
    exposureResultRef: confirmed.effectRef,
    exposureEvidenceRef: confirmed.evidenceRef,
    offsetSubjectRef: cancellationResult.effectRef,
    offsetResultRef: cancellationResult.cancellationRef,
    offsetEvidenceRef: cancellationResult.evidenceRef,
    amount: { currency: 'AUD', units: '5000', exponent: 2 },
    evidenceRuleRef: developmentCancellationConfirmationRule.evidenceRuleRef,
    evidenceRuleSource: developmentCancellationConfirmationRule.source,
    evidenceRuleVersion: developmentCancellationConfirmationRule.version,
    releaseAttestation: cancellationResult.exposureReleaseAttestation,
    offsetGeneration: 1,
    recordedAt: developmentProviderToolNow(),
  })
  if (offset.kind === 'refused') throw new Error(offset.code)
  const finalState = objectiveState({
    objectiveRef,
    stage: 'completed',
    currentActionRef: 'none',
    fallbackProgress: input.objectiveState.fallbackProgress,
    completedInvocationRefs: [
      ...input.objectiveState.completedInvocationRefs,
      cancellationRun.view.executionRef,
    ],
    policyDecisionRefs: [
      ...input.objectiveState.policyDecisionRefs,
      decision.value.policyDecisionRef,
    ],
    operationResultRef: confirmed.effectRef,
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

function providerToolSpendingPolicyService(store: SpendingPolicyStore) {
  return createDevelopmentProviderToolSpendingPolicyService({
    store,
    authenticatedDelegate: { delegateRef, principalRef, callerRef },
    now: developmentProviderToolNow,
  })
}
