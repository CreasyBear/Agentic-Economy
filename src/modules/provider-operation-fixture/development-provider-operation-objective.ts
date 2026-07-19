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
  cancelDevelopmentProviderOperationAction,
  executeDevelopmentProviderOperationAction,
} from './development-provider-operation.actions'
import {
  providerOperationInput,
  cancellationInput,
  developmentProviderOperationNow,
} from './development-provider-operation-fixture'
import { createDevelopmentProviderOperationMandateService } from './development-provider-operation-mandate'
import {
  projectDurableRun,
  reconstructDevelopmentProviderOperationInvocation,
} from './development-provider-operation-packet'
import { createDevelopmentProviderOperationProvider } from './development-provider-operation-provider'
import type { DevelopmentProviderOperationProviderSnapshot } from './development-provider-operation-provider'
import {
  developmentCancellationConfirmationRule,
} from './development-provider-operation-offset-rule'
import {
  developmentProviderOperationVerificationKey,
  type DevelopmentProviderOperationSigningCustody,
} from './development-provider-operation-signing-custody'
import { runCancellationInvocation, runProviderOperationInvocation } from './development-provider-operation-runner'

const objective = 'Book one development consultation and cancel it if the provider confirms the objective no longer requires attendance.'
const principalRef = 'mock:principal:full-yolo'
const callerRef = 'mock:caller:full-yolo'
const delegateRef = 'mock:delegate:full-yolo'
const origin = { kind: 'standalone', principalRef, callerRef } as const
const objectiveRef = 'mock:objective:full-yolo'

export type DevelopmentProviderOperationObjectiveState = Readonly<{
  format: 'ae.development-provider-operation-objective:v1'
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
  material: Omit<DevelopmentProviderOperationObjectiveState, 'format' | 'digest'>,
): DevelopmentProviderOperationObjectiveState {
  const value = { format: 'ae.development-provider-operation-objective:v1' as const, ...material }
  return { ...value, digest: canonicalDigest(value as never) }
}

export function developmentProviderOperationObjectiveStateValid(state: DevelopmentProviderOperationObjectiveState) {
  const { digest, ...material } = state
  return digest === canonicalDigest(material as never)
}

export type DevelopmentProviderOperationMidPhase = Readonly<{
  kind: 'operation_phase_complete'
  processId: number
  mandate: StandingMandate
  grant: ReturnType<ReturnType<typeof createDevelopmentStandingMandateGrantVerifier>>
  policyDecisions: readonly StandingMandatePolicyDecision[]
  initialObjectiveState: DevelopmentProviderOperationObjectiveState
  midRun: {
    mandateSnapshot: StandingMandateSnapshot
    providerSnapshot: DevelopmentProviderOperationProviderSnapshot
    objectiveState: DevelopmentProviderOperationObjectiveState
    durableInvocations: readonly ReturnType<typeof projectDurableRun>[]
  }
  invocationRecords: readonly ReturnType<typeof invocationRecord>[]
  providerAEffects: number
}>

export async function runFullYoloDevelopmentObjective(
  signingCustody: DevelopmentProviderOperationSigningCustody,
) {
  const result = await runFullYoloDevelopmentObjectiveInternal(signingCustody, false)
  if ('kind' in result) throw new Error('development_provider_operation_final_phase_missing')
  return result
}

export async function runFullYoloDevelopmentProviderOperationPhase(
  signingCustody: DevelopmentProviderOperationSigningCustody,
) {
  const result = await runFullYoloDevelopmentObjectiveInternal(signingCustody, true)
  if (!('kind' in result)) throw new Error('development_provider_operation_mid_phase_missing')
  return result
}

async function runFullYoloDevelopmentObjectiveInternal(
  signingCustody: DevelopmentProviderOperationSigningCustody,
  stopAfterOperation: boolean,
) {
  const providerA = createDevelopmentProviderOperationProvider({
    providerRef: 'mock:provider:calendar:a',
    slotRef: 'mock:slot:a',
    refusal: 'terms_changed',
  })
  const providerB = createDevelopmentProviderOperationProvider({
    providerRef: 'mock:provider:calendar:b',
    slotRef: 'mock:slot:b',
    exposureAmount: { amountMinor: 5_000, currency: 'AUD' },
    signingCustody,
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
    issuedAt: developmentProviderOperationNow(),
    scope: {
      objective,
      action: { id: executeDevelopmentProviderOperationAction.id, version: 'v1' },
      actions: [
        { id: executeDevelopmentProviderOperationAction.id, version: 'v1' },
        { id: cancelDevelopmentProviderOperationAction.id, version: 'v1' },
      ],
      providerRefs: [slotA.providerRef, slotB.providerRef],
      recipientRefs: [slotA.providerRef, slotB.providerRef],
      purposes: ['create_development_effect', 'cancel_development_effect'],
      allowedDataFields: ['customer.name', 'customer.email', 'reason'],
      maximumSpend: { amountMinor: 10_000, currency: 'AUD' },
      maximumLoss: { amountMinor: 5_000, currency: 'AUD' },
      maximumActionCount: 4,
      maximumConcurrentEffects: 2,
      startsAt: developmentProviderOperationNow(),
      expiresAt: '2026-07-19T05:00:00.000Z',
      permittedFallbacks: ['provider_a_primary', 'provider_b_after_terms_refusal', 'none'],
      riskCeiling: 'development_provider_operation_bounded_loss',
      exposureOffsetRules: [developmentCancellationConfirmationRule],
      exposureOffsetVerificationKeys: [developmentProviderOperationVerificationKey(signingCustody)],
    },
  })
  const verifier = createDevelopmentStandingMandateGrantVerifier({
    admittedMandateDigest: mandate.digest,
    evidenceRef: 'mock:evidence:full-yolo-grant',
    verifierRef: 'mock:verifier:full-yolo-grant',
    source: 'mock:authenticated-principal-grant:v1',
    freshUntil: '2026-07-19T04:30:00.000Z',
  })
  const grant = verifier(mandate, developmentProviderOperationNow())
  if (!grant.authenticated) throw new Error(grant.reason)
  let store = new StandingMandateStore()
  const issued = store.issue(mandate, grant, developmentProviderOperationNow())
  if (issued.kind === 'refused') throw new Error(issued.code)
  let service = providerOperationService(store)
  const decisions: StandingMandatePolicyDecision[] = []
  const initialObjectiveState = objectiveState({
    objectiveRef,
    stage: 'attempt_primary',
    currentActionRef: executeDevelopmentProviderOperationAction.id,
    fallbackProgress: { attemptedProviderRefs: [], activeFallbackRef: 'provider_a_primary' },
    completedInvocationRefs: [],
    policyDecisionRefs: [],
    operationResultRef: null,
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

  const operationA = providerOperationInput(slotA, principalRef, 'mock:operation:full-yolo:a')
  const operationAInvocationRef = 'mock:operation-invocation:full-yolo-a'
  const decisionA = choose('mock:policy-decision:full-yolo:a', {
    objectiveRef,
    objective,
    sourceOptionRef: slotA.provenance.observationRef,
    materialDigest: materialDigest(
      operationA,
      executeDevelopmentProviderOperationAction.invocationContract!.materialInputPaths,
    ),
    authorityUseRef: 'mock:authority-use:full-yolo:a',
    invocationRef: operationAInvocationRef,
    action: { id: executeDevelopmentProviderOperationAction.id, version: 'v1' },
    providerRef: slotA.providerRef,
    recipientRef: slotA.providerRef,
    purpose: 'create_development_effect',
    dataFields: ['customer.name', 'customer.email'],
    spend: { amountMinor: 0, currency: 'AUD' },
    worstCaseLoss: { amountMinor: 0, currency: 'AUD' },
    fallbackRef: 'provider_a_primary',
    risk: 'development_provider_operation_bounded_loss',
  })
  const first = await runProviderOperationInvocation({
    provider: providerA,
    operation: operationA,
    origin,
    ref: 'full-yolo-a',
    boundedMandate: {
      service,
      mandateRef: mandate.mandateRef,
      authorityUseRef: 'mock:authority-use:full-yolo:a',
      fallbackRef: 'provider_a_primary',
      reservedLossMinor: 0,
      risk: 'development_provider_operation_bounded_loss',
      policyDecisionRef: decisionA.policyDecisionRef,
    },
  })
  if (first.view.observedResolution.state !== 'returned'
    || first.view.observedResolution.result.kind !== 'effect_refused') {
    throw new Error('provider_a_expected_refusal_missing')
  }

  const operationB = providerOperationInput(slotB, principalRef, 'mock:operation:full-yolo:b')
  const operationBInvocationRef = 'mock:operation-invocation:full-yolo-b'
  const decisionB = choose('mock:policy-decision:full-yolo:b', {
    objectiveRef,
    objective,
    sourceOptionRef: slotB.provenance.observationRef,
    materialDigest: materialDigest(
      operationB,
      executeDevelopmentProviderOperationAction.invocationContract!.materialInputPaths,
    ),
    authorityUseRef: 'mock:authority-use:full-yolo:b',
    invocationRef: operationBInvocationRef,
    action: { id: executeDevelopmentProviderOperationAction.id, version: 'v1' },
    providerRef: slotB.providerRef,
    recipientRef: slotB.providerRef,
    purpose: 'create_development_effect',
    dataFields: ['customer.name', 'customer.email'],
    spend: { amountMinor: 5_000, currency: 'AUD' },
    worstCaseLoss: { amountMinor: 5_000, currency: 'AUD' },
    fallbackRef: 'provider_b_after_terms_refusal',
    risk: 'development_provider_operation_bounded_loss',
  })
  const second = await runProviderOperationInvocation({
    provider: providerB,
    operation: operationB,
    origin,
    ref: 'full-yolo-b',
    boundedMandate: {
      service,
      mandateRef: mandate.mandateRef,
      authorityUseRef: 'mock:authority-use:full-yolo:b',
      fallbackRef: 'provider_b_after_terms_refusal',
      reservedSpendMinor: 5_000,
      reservedLossMinor: 5_000,
      risk: 'development_provider_operation_bounded_loss',
      policyDecisionRef: decisionB.policyDecisionRef,
      reconstructBeforeRelease: () => {
        store = new StandingMandateStore(structuredClone(store.exportSnapshot()))
        service = providerOperationService(store)
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
    currentActionRef: cancelDevelopmentProviderOperationAction.id,
    fallbackProgress: {
      attemptedProviderRefs: [slotA.providerRef, slotB.providerRef],
      activeFallbackRef: 'none',
    },
    completedInvocationRefs: [first.view.invocationRef, second.view.invocationRef],
    policyDecisionRefs: decisions.map(({ policyDecisionRef }) => policyDecisionRef),
    operationResultRef: confirmed.effectRef,
    cancellationResultRef: null,
  })
  const midRun = {
    mandateSnapshot: structuredClone(store.exportSnapshot()),
    providerSnapshot: providerB.exportSnapshot(),
    objectiveState: midObjectiveState,
    durableInvocations: [projectDurableRun(first), projectDurableRun(second)],
  }
  if (stopAfterOperation) {
    return {
      kind: 'operation_phase_complete' as const,
      processId: process.pid,
      mandate,
      grant,
      policyDecisions: decisions,
      initialObjectiveState,
      midRun,
      invocationRecords: [invocationRecord(first), invocationRecord(second)],
      providerAEffects: providerA.effectCount(),
    }
  }
  const resumed = await resumeDevelopmentProviderOperationObjective({
    processRef: 'mock:process:cold-resume:1',
    mandate,
    mandateSnapshot: midRun.mandateSnapshot,
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
    [executeDevelopmentProviderOperationAction.id, executeDevelopmentProviderOperationAction],
    [cancelDevelopmentProviderOperationAction.id, cancelDevelopmentProviderOperationAction],
  ])
  const reconstructed = invocationRecords.map((record) => {
    const action = actionById.get(record.action.id)
    if (action === undefined) throw new Error('cold_action_missing')
    return reconstructDevelopmentProviderOperationInvocation({
      invocationRef: record.invocationRef,
      action,
      durable: record.durable,
    }).view
  })
  const providerSnapshot = resumed.providerSnapshot
  const effectsBeforeReplay = resumed.effectCounts
  const replayed = await resumeDevelopmentProviderOperationObjective({
    processRef: 'mock:process:cold-resume:2',
    mandate,
    mandateSnapshot: cold.exportSnapshot(),
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
    mandateSnapshot: cold.exportSnapshot(),
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
        effectsBeforeReplay.operation === effectsAfterReplay.operation
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

function invocationRecord(run: any) {
  return {
    invocationRef: run.view.invocationRef,
    action: run.view.action,
    acceptedAuthority: run.view.acceptedAuthority,
    events: run.events,
    durable: projectDurableRun(run),
    resultDigest: canonicalDigest(run.view.observedResolution),
  }
}

export async function resumeDevelopmentProviderOperationObjective(input: Readonly<{
  processRef: string
  mandate: StandingMandate
  mandateSnapshot: StandingMandateSnapshot
  providerSnapshot: DevelopmentProviderOperationProviderSnapshot
  objectiveState: DevelopmentProviderOperationObjectiveState
  durableInvocations: readonly ReturnType<typeof projectDurableRun>[]
  signingCustody: DevelopmentProviderOperationSigningCustody
}>) {
  if (!developmentProviderOperationObjectiveStateValid(input.objectiveState)) {
    throw new Error('development_provider_operation_objective_integrity_refused')
  }
  if (
    input.objectiveState.objectiveRef !== objectiveRef
    || input.objectiveState.completedInvocationRefs.length !== input.durableInvocations.length
  ) throw new Error('development_provider_operation_objective_linkage_refused')

  const reconstructed = input.durableInvocations.map((durable, index) => {
    const invocationRef = input.objectiveState.completedInvocationRefs[index]
    const action = index < 2
      ? executeDevelopmentProviderOperationAction
      : cancelDevelopmentProviderOperationAction
    if (invocationRef === undefined) throw new Error('development_provider_operation_objective_invocation_missing')
    return reconstructDevelopmentProviderOperationInvocation({ invocationRef, action, durable }).view
  })
  const provider = createDevelopmentProviderOperationProvider({
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
      store: new StandingMandateStore(structuredClone(input.mandateSnapshot)),
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
    input.objectiveState.stage !== 'operation_confirmed'
    || input.objectiveState.currentActionRef !== cancelDevelopmentProviderOperationAction.id
  ) throw new Error('development_provider_operation_objective_stage_refused')
  const operationView = reconstructed.at(-1)
  if (
    operationView?.observedResolution.state !== 'returned'
    || operationView.observedResolution.result.kind !== 'effect_confirmed'
    || operationView.observedResolution.result.effectRef !== input.objectiveState.operationResultRef
  ) throw new Error('development_provider_operation_objective_booking_result_refused')
  const confirmed = operationView.observedResolution.result
  let store = new StandingMandateStore(structuredClone(input.mandateSnapshot))
  const cancellationMaterial = cancellationInput({
    effectRef: confirmed.effectRef,
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
        cancelDevelopmentProviderOperationAction.invocationContract!.materialInputPaths,
      ),
      authorityUseRef: 'mock:authority-use:full-yolo:cancel',
      invocationRef: cancellationInvocationRef,
      action: { id: cancelDevelopmentProviderOperationAction.id, version: 'v1' },
      providerRef: confirmed.providerRef,
      recipientRef: confirmed.providerRef,
      purpose: 'cancel_development_effect',
      dataFields: ['reason'],
      spend: { amountMinor: 0, currency: 'AUD' },
      worstCaseLoss: { amountMinor: 0, currency: 'AUD' },
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
    fullYoloMandate: {
      service: providerOperationService(store),
      mandateRef: input.mandate.mandateRef,
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
  store = new StandingMandateStore(structuredClone(store.exportSnapshot()))
  const offset = store.recordExposureOffset({
    authorityUseRef: 'mock:authority-use:full-yolo:b',
    offsetAuthorityUseRef: 'mock:authority-use:full-yolo:cancel',
    mandateRef: input.mandate.mandateRef,
    mandateVersion: input.mandate.version,
    mandateGeneration: input.mandate.generation,
    principalRef,
    providerRef: confirmed.providerRef,
    exposureAction: { id: executeDevelopmentProviderOperationAction.id, version: 'v1' },
    offsetAction: { id: cancelDevelopmentProviderOperationAction.id, version: 'v1' },
    exposureSubjectRef: confirmed.effectRef,
    exposureResultRef: confirmed.effectRef,
    exposureEvidenceRef: confirmed.evidenceRef,
    offsetSubjectRef: cancellationResult.effectRef,
    offsetResultRef: cancellationResult.cancellationRef,
    offsetEvidenceRef: cancellationResult.evidenceRef,
    amountMinor: 5_000,
    currency: 'AUD',
    evidenceRuleRef: developmentCancellationConfirmationRule.evidenceRuleRef,
    evidenceRuleSource: developmentCancellationConfirmationRule.source,
    evidenceRuleVersion: developmentCancellationConfirmationRule.version,
    releaseAttestation: cancellationResult.exposureReleaseAttestation,
    offsetGeneration: 1,
    recordedAt: developmentProviderOperationNow(),
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

function providerOperationService(store: StandingMandateStore) {
  return createDevelopmentProviderOperationMandateService({
    store,
    authenticatedDelegate: { delegateRef, principalRef, callerRef },
    now: developmentProviderOperationNow,
  })
}
