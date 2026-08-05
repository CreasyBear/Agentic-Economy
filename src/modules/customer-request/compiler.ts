import { DirectedGraph } from 'graphology'
import { hasCycle, topologicalGenerations } from 'graphology-dag'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import {
  sameCapabilityContractRef,
  type CapabilityContractRef,
  type CapabilityDecisionModel,
  type CapabilityInputSemantic,
} from '@/modules/capability-contract/public'
import {
  isPublicOperationRef,
  resolveRegisteredOperationMappingRef,
  type AdmittedOperationRef,
  type CapabilityCancellation,
  type PublicOperationRef,
  type RegisteredOperationMapping,
} from '@/modules/capability-supply/public'

import { exactContractRefKey } from './contract-ref-key'
import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  evaluateIntentDirectionRequestSnapshot,
  requestRegistrySnapshotDigest,
  type ProposedRequestAction,
  type RequestActionInputMapping,
  type RegisteredEvaluationBinding,
  type RegisteredCommercialRelationship,
  type RequestEvaluation,
  type RequestFact,
  type RegisteredSupplyPrice,
} from './evaluation'
import {
  deriveCustomerDecisionPreference,
  deriveCustomerMaterialConstraints,
  deriveCustomerMaximumTotalCostCriterion,
  deriveCustomerMaximumResponseTimeCriterion,
  deriveCustomerProviderDataSharingCriterion,
  type CustomerRequestSemanticProposal,
} from './semantic-interpreter'
import {
  createCustomerRequestRoutePlanGeneration,
  routePlanGenerationDecisionSnapshot,
  type CustomerRequestRoutePlanGeneration,
} from './route-plan-generation'

const MAX_SELECTIONS = 64
const MAX_FACTS = 128
const MAX_AGGREGATE_BYTES = 700_000
const MAX_ROUTE_PLANS = 256
export const CUSTOMER_REQUEST_ROUTE_COMPILER_VERSION = 'customer-request-route-compiler:v1' as const

export type CustomerRequestV2Snapshot = Readonly<{
  requestId: string
  revision: number
  principalId: string
  delegatedAgentId: string
  intent: string
  networkId: string
  facts: readonly RequestFact[]
  routeExclusions?: readonly CustomerReportedRouteExclusion[]
  snapshotDigest: string
  recordedAt: number
}>

export type CustomerReportedRouteExclusion = Readonly<{
  choiceSignature: string
  reportedRouteRef: string
  reportedGenerationRef: string
  reason: string
  recordedAtRevision: number
}>

export type CustomerRequestV2PlanRevision = Readonly<{
  planRevisionId: string
  requestId: string
  requestRevision: number
  proposedByAgentId: string
  interpreterId: string
  interpretationEvidence:
    | Readonly<{
        kind: 'model_output'
        systemInstructionVersion: string
        inputDigest: string
        outputDigest: string
      }>
    | Readonly<{ kind: 'deterministic_input' }>
  proposalDigest: string
  registrySnapshotDigest: string
  actions: readonly ProposedRequestAction[]
  completionRequirements: RequestEvaluation['completionRequirements']
  compilerVersion: typeof CUSTOMER_REQUEST_ROUTE_COMPILER_VERSION
  authority: 'proposal_only'
  planDigest: string
  createdAt: number
}>

export type CustomerRequestRoutePlan = Readonly<{
  routePlanId: string
  requestId: string
  requestRevision: number
  registrySnapshotDigest: string
  steps: readonly Readonly<{
    operationRef: PublicOperationRef
    admittedOperation: AdmittedOperationRef
    actionId: string
    candidateRef: string
    businessId: string
    offeringId: string
    bindingId: string
    contractRef: CapabilityContractRef
    offeringRegistrationHash: string
    bindingRegistrationHash: string
    publicationRef: string
    publicationRevision: number
    resolvedInputs: readonly RequestFact[]
    deferredInputs: readonly RequestActionInputMapping[]
    price: RegisteredSupplyPrice
    /** Optional only for immutable generations compiled before recommendation integrity was source-owned. */
    commercialRelationship?: RegisteredCommercialRelationship
    dataUse: CapabilityDecisionModel['dataUse']
    effects: CapabilityDecisionModel['effects']
    evidence: CapabilityDecisionModel['evidence']
    cancellation: CapabilityCancellation
    recovery: CapabilityDecisionModel['lifecycle']
  }>[]
  edges: readonly (RequestActionInputMapping & Readonly<{ fromStep: string; toStep: string }>)[]
  maximumTotalCost:
    | Readonly<{ kind: 'known'; currency: string; amountMinor: number }>
    | Readonly<{ kind: 'requires_preparation' }>
  expiresAt: number
  uncertainty: readonly ('cost_requires_preparation' | 'customer_fact_requires_evidence')[]
  fallbacks: Readonly<{
    ordering: 'unranked'
    alternatives: readonly Readonly<{
      alternativeRouteRef: string
      when: 'route_unavailable_before_approval'
    }>[]
  }>
  comparison: Readonly<{
    fit: 'all_steps_viable'
    completeness: 'complete'
    dataExposureCount: number
    irreversibleEffectCount: number
    evidenceRequirementCount: number
    trust: 'registered_current_option'
    /** Optional only for immutable generations compiled before recommendation integrity was source-owned. */
    outcomeSignature?: string
    hardConstraints?: 'satisfied' | 'not_evaluated'
    duration?: 'not_declared'
    recovery?: 'retry_safe' | 'reconcile_required'
    freshnessValidUntil?: number
    ordering:
      | Readonly<{ kind: 'unranked' }>
      | Readonly<{
          kind: 'ranked'
          objective: 'lowest_maximum_price'
          position: number
          /** Optional only for immutable generations compiled before recommendation integrity was source-owned. */
          evidenceRef?: string
        }>
  }>
  authority: 'proposal_only'
  routeDigest: string
}>

export type CustomerRequestV2Aggregate = Readonly<{
  aggregateVersion: 2
  snapshot: CustomerRequestV2Snapshot
  evaluation: RequestEvaluation
  plan: CustomerRequestV2PlanRevision
  completedTaskReferences?: readonly CustomerRequestCompletedTaskReference[]
  importedCommitmentReferences?: readonly CustomerRequestImportedCommitmentReference[]
  outcome: 'plan_ready' | 'needs_information' | 'unsupported'
  aggregateDigest: string
}>

export type CustomerRequestImportedCommitmentReference = Readonly<{
  role: 'imported_commitment_claim'
  referenceRef: string
  claimRef: string
  claimDigest: string
  issuerRef: string
  observerRef: string
  subject: Readonly<{ kind: string; ref: string }>
  commitmentKind: string
  source: Readonly<{ system: string; reference: string; digest: string }>
  observedAt: number
  assertedAt?: number
  validity:
    | Readonly<{ kind: 'valid_until'; validUntil: number }>
    | Readonly<{ kind: 'unknown' }>
    | Readonly<{ kind: 'withdrawn'; withdrawnAt: number; evidenceRefs: readonly string[] }>
  evidenceRefs: readonly string[]
  verification: 'imported_unverified'
  observationPosture: 'imported_claim_only'
  referencedAt: number
}>

export type CustomerRequestCompletedTaskReference = Readonly<{
  role: 'prior_completed_task'
  referenceRef: string
  invocationRef: string
  actionId: string
  actionVersion: string
  sourceResultRef: string
  resultDigest: string
  businessOutcome: 'queued_communication' | 'completed'
  referencedAt: number
}>

export type CompileCustomerRequestCommand = Readonly<{
  requestId: string
  expectedRevision: number
  expectedRouteGeneration?: number
  principalId: string
  delegatedAgentId: string
  intent: string
  networkId: string
  priorFacts?: readonly RequestFact[]
  routeExclusions?: readonly CustomerReportedRouteExclusion[]
  proposal: CustomerRequestSemanticProposal
  interpreterId: string
  bindings: readonly RegisteredEvaluationBinding[]
  mappings: readonly RegisteredOperationMapping[]
  models: readonly CapabilityDecisionModel[]
  now: number
}>

export type CompileCustomerRequestResult =
  | Readonly<{
      kind: 'compiled'
      aggregate: CustomerRequestV2Aggregate
      routeGeneration?: CustomerRequestRoutePlanGeneration
    }>
  | Readonly<{ kind: 'refused'; reason: 'unsafe_interpretation' | 'capability_graph_invalid' }>

export function compileCustomerRequest(command: CompileCustomerRequestCommand): CompileCustomerRequestResult {
  if (command.proposal.kind === 'capability_candidates'
    && (command.proposal.selections.length > MAX_SELECTIONS
      || command.proposal.selections.reduce((count, selection) => count + selection.facts.length, 0) > MAX_FACTS)) {
    return { kind: 'refused', reason: 'unsafe_interpretation' }
  }
  for (const mapping of command.mappings) {
    try {
      if (mapping.mappingRef !== resolveRegisteredOperationMappingRef(mapping)) {
        return { kind: 'refused', reason: 'capability_graph_invalid' }
      }
    } catch {
      return { kind: 'refused', reason: 'capability_graph_invalid' }
    }
  }
  const models = exactModelRegistry(command.models)
  if (models === undefined) return { kind: 'refused', reason: 'capability_graph_invalid' }
  const registrySnapshotDigest = requestRegistrySnapshotDigest(command.bindings)
  const selected = command.proposal.kind === 'capability_candidates'
    ? normalizeInferredFacts(command, models)
    : []
  if (selected === undefined) return { kind: 'refused', reason: 'unsafe_interpretation' }
  if (new Set(selected.map((selection) => selection.selectionKey)).size !== selected.length) {
    return { kind: 'refused', reason: 'unsafe_interpretation' }
  }
  const proposalFacts = selected.flatMap((selection) => selection.facts)
  const facts = mergeFacts(command.priorFacts ?? [], proposalFacts)
  if (facts === undefined) return { kind: 'refused', reason: 'unsafe_interpretation' }
  const decisionPreference = deriveCustomerDecisionPreference(command.intent)
  const maximumTotalCostCriterion = deriveCustomerMaximumTotalCostCriterion(command.intent)
  const maximumResponseTimeCriterion = deriveCustomerMaximumResponseTimeCriterion(command.intent)
  const providerDataSharingCriterion = deriveCustomerProviderDataSharingCriterion(command.intent)
  const derivedCriteria = [
    ...deriveCustomerMaterialConstraints(command.intent),
    maximumTotalCostCriterion, maximumResponseTimeCriterion, providerDataSharingCriterion,
  ]
    .filter((criterion): criterion is NonNullable<typeof criterion> => criterion !== undefined)
  const baseActions = selected.map((selection, index): ProposedRequestAction => {
    const model = resolveExactModel(models, selection.contractRef)
    const binding = command.bindings.find((candidate) => (
      candidate.operationRef === selection.operationRef
      && sameCapabilityContractRef(candidate.contractRef, selection.contractRef)
    ))
    if (model === undefined || model.selectionKey !== selection.selectionKey
      || binding === undefined) {
      throw new Error('customer_request_selection_model_missing')
    }
    const actionMaterial = {
      requestId: command.requestId,
      requestRevision: command.expectedRevision + 1,
      ordinal: index,
      operationRef: selection.operationRef,
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
    }
    return Object.freeze({
      actionId: `action:${canonicalDigest(actionMaterial)}`,
      operationRef: selection.operationRef,
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
      dependsOn: Object.freeze([]),
      inputs: Object.freeze(facts.filter((fact) => fact.selectionKey === model.selectionKey
        && sameCapabilityContractRef(fact.contractRef, model.contractRef))),
      mappingRefs: Object.freeze([]),
      inputMappings: Object.freeze([]),
    })
  })
  const actions = composeRequestActions(baseActions, models, command.mappings)
  if (actions === undefined) return { kind: 'refused', reason: 'capability_graph_invalid' }
  const requestRevision = command.expectedRevision + 1
  const evaluation = command.proposal.kind === 'needs_intent_direction'
    ? evaluateIntentDirectionRequestSnapshot({
        requestId: command.requestId,
        requestRevision,
        intent: command.intent,
        facts,
        registrySnapshotDigest,
        prompt: command.proposal.prompt,
      })
    : evaluateCustomerRequestSnapshot({
        requestId: command.requestId,
        requestRevision,
        intent: command.intent,
        facts,
        registrySnapshotDigest,
        ...(decisionPreference === undefined
          ? {}
          : { decisionPreference }),
        ...(derivedCriteria.length === 0
          ? {}
          : { derivedCriteria }),
        candidates: discoverRequestEvaluationCandidates({
          selectedCapabilities: selected.map(({ operationRef, selectionKey, contractRef }) => ({
            operationRef, selectionKey, contractRef,
          })),
          bindings: command.bindings,
          resolveModel: (ref) => resolveExactModel(models, ref),
        }),
        proposedActions: actions,
        resolveModel: (ref) => resolveExactModel(models, ref),
      })
  if (evaluation.candidates.some((candidate) => candidate.viability.kind === 'incompatible')) {
    return { kind: 'refused', reason: 'unsafe_interpretation' }
  }
  const snapshotMaterial = {
    requestId: command.requestId,
    revision: requestRevision,
    principalId: command.principalId,
    delegatedAgentId: command.delegatedAgentId,
    intent: command.intent,
    networkId: command.networkId,
    facts,
    ...(command.routeExclusions === undefined || command.routeExclusions.length === 0
      ? {}
      : { routeExclusions: command.routeExclusions }),
  }
  const snapshot: CustomerRequestV2Snapshot = Object.freeze({
    ...snapshotMaterial,
    snapshotDigest: canonicalDigest(snapshotMaterial),
    recordedAt: command.now,
  })
  const proposalDigest = canonicalDigest({
    interpreterId: command.interpreterId,
    selected: selected.map(({ selectionKey, contractRef }) => ({ selectionKey, contractRef })),
    facts,
  })
  const interpretationEvidence = command.proposal.interpretationEvidence
    ?? Object.freeze({ kind: 'deterministic_input' as const })
  const routes = compileRoutePlans({
    requestId: command.requestId, requestRevision, registrySnapshotDigest,
    actions, candidates: evaluation.candidates, now: command.now,
    models,
    ...(evaluation.decisionPreference === undefined ? {} : { objective: evaluation.decisionPreference.objective }),
    ...(evaluation.decisionPreference === undefined ? {} : {
      objectiveEvidenceRef: evaluation.decisionPreference.evidenceRef,
    }),
    ...(maximumTotalCostCriterion === undefined ? {} : {
      maximumTotalCost: maximumTotalCostCriterion.value,
    }),
    customerFactRequiresEvidence: derivedCriteria.some(({ impact }) => impact === 'uncertainty'),
    ...(command.routeExclusions === undefined ? {} : {
      excludedChoiceSignatures: command.routeExclusions.map(({ choiceSignature }) => choiceSignature),
    }),
  })
  if (routes === undefined) return { kind: 'refused', reason: 'capability_graph_invalid' }
  const planMaterial = {
    requestId: command.requestId,
    requestRevision,
    proposedByAgentId: command.delegatedAgentId,
    interpreterId: command.interpreterId,
    interpretationEvidence,
    proposalDigest,
    registrySnapshotDigest,
    actions,
    completionRequirements: evaluation.completionRequirements,
    compilerVersion: CUSTOMER_REQUEST_ROUTE_COMPILER_VERSION,
    authority: 'proposal_only' as const,
  }
  const planDigest = canonicalDigest(planMaterial as StableHashValue)
  const plan: CustomerRequestV2PlanRevision = Object.freeze({
    planRevisionId: `plan:${planDigest}`,
    ...planMaterial,
    planDigest,
    createdAt: command.now,
  })
  const routeGeneration = routes.length === 0
    || routes.some((route) => route.maximumTotalCost.kind !== 'known')
    ? undefined
    : createCustomerRequestRoutePlanGeneration({
        generation: (command.expectedRouteGeneration ?? 0) + 1,
        requestId: command.requestId,
        requestRevision,
        compiler: {
          compilerVersion: CUSTOMER_REQUEST_ROUTE_COMPILER_VERSION,
          interpreterId: command.interpreterId,
          interpretationEvidence,
          proposalDigest,
        },
        registrySnapshotDigest,
        decisionSnapshot: routePlanGenerationDecisionSnapshot({ snapshot, evaluation, plan }),
        routes,
        createdAt: command.now,
      })
  const outcome = evaluation.posture === 'unsupported'
    ? 'unsupported' as const
    : evaluation.posture === 'needs_information'
      ? 'needs_information' as const
      : actions.length > 0 && routeGeneration === undefined ? 'unsupported' as const : 'plan_ready' as const
  const aggregateMaterial = { aggregateVersion: 2 as const, snapshot, evaluation, plan, outcome }
  if (new TextEncoder().encode(JSON.stringify({ aggregateMaterial, routeGeneration })).byteLength > MAX_AGGREGATE_BYTES) {
    return { kind: 'refused', reason: 'unsafe_interpretation' }
  }
  return {
    kind: 'compiled',
    aggregate: Object.freeze({ ...aggregateMaterial, aggregateDigest: canonicalDigest(aggregateMaterial as StableHashValue) }),
    ...(routeGeneration === undefined ? {} : { routeGeneration }),
  }
}

type CapabilitySelections = Extract<
  CustomerRequestSemanticProposal,
  { kind: 'capability_candidates' }
>['selections']

function normalizeInferredFacts(
  command: CompileCustomerRequestCommand,
  models: ReadonlyMap<string, CapabilityDecisionModel>,
): CapabilitySelections | undefined {
  if (command.proposal.kind !== 'capability_candidates') return Object.freeze([])
  const normalized = []
  for (const selection of command.proposal.selections) {
    if (!isPublicOperationRef(selection.operationRef)
      || !command.bindings.some((binding) => (
        binding.operationRef === selection.operationRef
        && sameCapabilityContractRef(binding.contractRef, selection.contractRef)
      ))) return undefined
    const model = resolveExactModel(models, selection.contractRef)
    if (model === undefined || model.selectionKey !== selection.selectionKey) return undefined
    const accepted: RequestFact[] = []
    for (const fact of selection.facts) {
      const input = exactInputForFact(fact, model)
      if (input === undefined) return undefined
      if (fact.source.kind === 'agent_inference' && input.inference === 'customer_required') continue
      if (factBelongsToExactModel(fact, models)) {
        accepted.push(fact)
      } else if (fact.source.kind === 'agent_inference') {
        continue
      } else {
        return undefined
      }
    }
    normalized.push(Object.freeze({ ...selection, facts: Object.freeze(accepted) }))
  }
  return Object.freeze(normalized.sort((left, right) => left.selectionKey.localeCompare(right.selectionKey)))
}

export function writableCustomerRequestV2Aggregate(aggregate: CustomerRequestV2Aggregate) {
  const writableFact = (fact: RequestFact) => ({
    contractRef: { ...fact.contractRef }, selectionKey: fact.selectionKey, inputKey: fact.inputKey,
    inputPointer: fact.inputPointer, schemaIdentity: fact.schemaIdentity, value: structuredClone(fact.value),
    source: { ...fact.source },
  })
  const writableCompletion = (completion: RequestEvaluation['completionRequirements'][number]) => ({
    ...completion, contractRef: { ...completion.contractRef },
  })
  const {
    decisionPreference,
    preparationDisclosure,
    nextRequirement,
    ...evaluationRequired
  } = aggregate.evaluation
  const { routeExclusions, ...snapshotRequired } = aggregate.snapshot
  return {
    aggregateVersion: aggregate.aggregateVersion,
    snapshot: {
      ...snapshotRequired,
      facts: aggregate.snapshot.facts.map(writableFact),
      ...(routeExclusions === undefined ? {} : {
        routeExclusions: routeExclusions.map((exclusion) => ({ ...exclusion })),
      }),
    },
    evaluation: {
      ...evaluationRequired,
      facts: aggregate.evaluation.facts.map(writableFact),
      criteria: aggregate.evaluation.criteria.map((criterion) => ({
        ...criterion, value: structuredClone(criterion.value),
      })),
      ...(decisionPreference === undefined
        ? {}
        : { decisionPreference: { ...decisionPreference } }),
      ...(preparationDisclosure === undefined
        ? {}
        : { preparationDisclosure: {
            ...preparationDisclosure,
            purposes: [...preparationDisclosure.purposes],
            categories: preparationDisclosure.categories.map((category) => ({ ...category })),
          } }),
      candidates: aggregate.evaluation.candidates.map((candidate) => ({
        ...candidate,
        contractRef: { ...candidate.contractRef },
        admittedOperation: {
          ...candidate.admittedOperation,
          contractRef: { ...candidate.admittedOperation.contractRef },
        },
        ...(candidate.commercialRelationship === undefined
          ? {}
          : {
              commercialRelationship: {
                ...candidate.commercialRelationship,
                evidenceRefs: [...candidate.commercialRelationship.evidenceRefs],
              },
            }),
        cancellation: {
          ...candidate.cancellation,
          evidenceRefs: [...candidate.cancellation.evidenceRefs],
        },
        viability: candidate.viability.kind === 'viable'
          ? { kind: 'viable' as const }
          : candidate.viability.kind === 'blocked_on_information'
            ? {
                kind: 'blocked_on_information' as const,
                inputs: candidate.viability.inputs.map((input) => ({
                  ...input,
                  contractRef: { ...input.contractRef },
                })),
              }
            : { kind: 'incompatible' as const, issueKeywords: [...candidate.viability.issueKeywords] },
      })),
      completionRequirements: aggregate.evaluation.completionRequirements.map(writableCompletion),
      ...(nextRequirement === undefined
        ? {}
        : { nextRequirement: nextRequirement.kind === 'intent_direction'
            ? { ...nextRequirement }
            : {
                ...nextRequirement,
                targets: nextRequirement.targets.map((target) => ({ ...target, contractRef: { ...target.contractRef } })),
                impact: {
                  affectedCandidates: [...nextRequirement.impact.affectedCandidates],
                  probesEnabled: [...nextRequirement.impact.probesEnabled],
                },
              } }),
    },
    plan: {
      ...aggregate.plan,
      actions: aggregate.plan.actions.map((action) => ({
        ...action,
        contractRef: { ...action.contractRef },
        dependsOn: [...action.dependsOn],
        mappingRefs: [...action.mappingRefs],
        inputs: action.inputs.map(writableFact),
        inputMappings: action.inputMappings.map((mapping) => ({
          ...mapping,
          source: { ...mapping.source },
          target: { ...mapping.target },
        })),
      })),
      completionRequirements: aggregate.plan.completionRequirements.map(writableCompletion),
    },
    ...(aggregate.completedTaskReferences === undefined
      ? {}
      : { completedTaskReferences: aggregate.completedTaskReferences.map((reference) => ({ ...reference })) }),
    ...(aggregate.importedCommitmentReferences === undefined
      ? {}
      : {
          importedCommitmentReferences: aggregate.importedCommitmentReferences.map((reference) => ({
            ...reference,
            subject: { ...reference.subject },
            source: { ...reference.source },
            validity: reference.validity.kind === 'withdrawn'
              ? { ...reference.validity, evidenceRefs: [...reference.validity.evidenceRefs] }
              : { ...reference.validity },
            evidenceRefs: [...reference.evidenceRefs],
          })),
        }),
    outcome: aggregate.outcome,
    aggregateDigest: aggregate.aggregateDigest,
  }
}

export function compileRoutePlans(input: Readonly<{
  requestId: string
  requestRevision: number
  registrySnapshotDigest: string
  actions: readonly ProposedRequestAction[]
  candidates: RequestEvaluation['candidates']
  now: number
  models: ReadonlyMap<string, CapabilityDecisionModel>
  objective?: 'lowest_maximum_price'
  objectiveEvidenceRef?: string
  maximumTotalCost?: Readonly<{ currency: string; amountMinor: number }>
  customerFactRequiresEvidence: boolean
  excludedChoiceSignatures?: readonly string[]
}>): readonly CustomerRequestRoutePlan[] | undefined {
  if (input.actions.length === 0) return Object.freeze([])
  const choices = input.actions.map((action) => input.candidates.filter(
    (candidate): candidate is RouteCandidate => isRouteCandidate(candidate)
      && candidate.viability.kind === 'viable'
      && candidate.selectionKey === action.selectionKey
      && sameCapabilityContractRef(candidate.contractRef, action.contractRef)
      && candidate.readinessValidUntil > input.now,
  ))
  if (choices.some((items) => items.length === 0)) return Object.freeze([])
  let combinations: RouteCandidate[][] = [[]]
  for (const candidates of choices) {
    combinations = combinations.flatMap((combination) => candidates.map((candidate) => [...combination, candidate]))
    if (combinations.length > MAX_ROUTE_PLANS) return undefined
  }
  const drafts = combinations.flatMap((combination) => {
    const steps = input.actions.map((action, index) => {
      const candidate = combination[index]
      if (candidate === undefined) throw new Error('customer_request_route_candidate_missing')
      const model = input.models.get(exactContractRefKey(action.contractRef))
      if (model === undefined) throw new Error('customer_request_route_model_missing')
      const activeInputPointers = new Set([
        ...action.inputs.map(({ inputPointer }) => inputPointer),
        ...action.inputMappings.map(({ target }) => target.inputPointer),
      ])
      const dataUse = model.dataUse.filter(({ inputPointer }) => activeInputPointers.has(inputPointer))
      const activeDataReleaseEffects = new Set(dataUse.map(({ effectId }) => effectId))
      const effects = model.effects.filter((effect) => (
        effect.class !== 'data_release' || activeDataReleaseEffects.has(effect.effectId)
      ))
      return Object.freeze({
        operationRef: candidate.operationRef,
        admittedOperation: candidate.admittedOperation,
        actionId: action.actionId, candidateRef: candidate.candidateRef,
        businessId: candidate.businessId, offeringId: candidate.offeringId, bindingId: candidate.bindingId,
        contractRef: candidate.contractRef, offeringRegistrationHash: candidate.offeringRegistrationHash,
        bindingRegistrationHash: candidate.bindingRegistrationHash,
        publicationRef: candidate.publicationRef, publicationRevision: candidate.publicationRevision,
        resolvedInputs: action.inputs,
        deferredInputs: action.inputMappings,
        price: candidate.price,
        ...(candidate.commercialRelationship === undefined ? {} : {
          commercialRelationship: {
            ...candidate.commercialRelationship,
            evidenceRefs: [...candidate.commercialRelationship.evidenceRefs],
          },
        }),
        dataUse, effects, evidence: model.evidence,
        cancellation: candidate.cancellation,
        recovery: model.lifecycle,
      })
    })
    const cost = maximumRouteCost(steps.map((step) => step.price))
    if (cost === undefined) return []
    const edges = input.actions.flatMap((action) => action.inputMappings.map((mapping) => Object.freeze({
      ...mapping, fromStep: mapping.source.actionId, toStep: action.actionId,
    })))
    const expiresAt = Math.min(...combination.map((candidate) => candidate.readinessValidUntil))
    const comparison = Object.freeze({
      fit: 'all_steps_viable' as const, completeness: 'complete' as const,
      dataExposureCount: steps.reduce((count, step) => count + step.dataUse.length, 0),
      irreversibleEffectCount: steps.reduce((count, step) => count
        + step.effects.filter((effect) => effect.reversibility === 'irreversible').length, 0),
      evidenceRequirementCount: steps.reduce((count, step) => count + step.evidence.length, 0),
      trust: 'registered_current_option' as const,
      outcomeSignature: canonicalDigest({
        contracts: steps.map(({ contractRef }) => contractRef),
        edges: edges.map(({ fromStep, toStep, semanticIdentity, schemaIdentity }) => ({
          fromStep, toStep, semanticIdentity, schemaIdentity,
        })),
      } as StableHashValue),
      hardConstraints: 'not_evaluated' as const,
      duration: 'not_declared' as const,
      recovery: steps.some(({ recovery }) => recovery.recovery === 'reconcile_required')
        ? 'reconcile_required' as const
        : 'retry_safe' as const,
      freshnessValidUntil: expiresAt,
    })
    const core = {
      requestId: input.requestId, requestRevision: input.requestRevision,
      registrySnapshotDigest: input.registrySnapshotDigest, steps, edges,
      maximumTotalCost: cost, expiresAt,
      uncertainty: [
        ...(cost.kind === 'requires_preparation' ? ['cost_requires_preparation' as const] : []),
        ...(input.customerFactRequiresEvidence ? ['customer_fact_requires_evidence' as const] : []),
      ],
      comparison, authority: 'proposal_only' as const,
    }
    return [Object.freeze({ routePlanId: `route:${canonicalDigest(core as StableHashValue)}`, ...core })]
  })
  const excludedChoiceSignatures = new Set(input.excludedChoiceSignatures ?? [])
  const eligibleDrafts = drafts.filter((route) => !excludedChoiceSignatures.has(routeChoiceSignature(route)))
  const admittedDrafts = input.maximumTotalCost === undefined
    ? eligibleDrafts
    : eligibleDrafts.filter((route) => route.maximumTotalCost.kind === 'known'
      && route.maximumTotalCost.currency === input.maximumTotalCost?.currency
      && route.maximumTotalCost.amountMinor <= input.maximumTotalCost.amountMinor)
  const ranking = canRankByLowestMaximumPrice(admittedDrafts)
    && input.objectiveEvidenceRef !== undefined
    ? Object.freeze({ objective: input.objective, evidenceRef: input.objectiveEvidenceRef })
    : undefined
  const ordered = admittedDrafts.sort((left, right) => compareRoutePlans(left, right, ranking?.objective))
  return Object.freeze(ordered.map((draft, index): CustomerRequestRoutePlan => {
    const alternatives: Array<Readonly<{
      alternativeRouteRef: string
      when: 'route_unavailable_before_approval'
    }>> = []
    for (const alternative of ordered) {
      if (alternative.routePlanId === draft.routePlanId || !routesUseDisjointProviders(draft, alternative)) continue
      alternatives.push(Object.freeze({
        alternativeRouteRef: alternative.routePlanId,
        when: 'route_unavailable_before_approval',
      }))
    }
    const fallbacks = Object.freeze({
      ordering: 'unranked' as const,
      alternatives: Object.freeze(alternatives),
    })
    const ordering = ranking?.objective === 'lowest_maximum_price'
      ? Object.freeze({
          kind: 'ranked' as const,
          objective: ranking.objective,
          position: index + 1,
          evidenceRef: ranking.evidenceRef,
        })
      : Object.freeze({ kind: 'unranked' as const })
    const material = {
      ...draft,
      fallbacks: Object.freeze(fallbacks),
      comparison: Object.freeze({ ...draft.comparison, ordering }),
    }
    return Object.freeze({ ...material, routeDigest: canonicalDigest(material as StableHashValue) })
  }))
}

export function routeChoiceSignature(
  route: Readonly<{ steps: readonly Readonly<{
    businessId: string
    offeringId: string
    bindingId: string
    contractRef: CapabilityContractRef
    offeringRegistrationHash: string
    bindingRegistrationHash: string
  }>[] }>,
): string {
  const supplyIdentities = route.steps.map((step) => ({
    businessId: step.businessId,
    offeringId: step.offeringId,
    bindingId: step.bindingId,
    contractRef: step.contractRef,
    offeringRegistrationHash: step.offeringRegistrationHash,
    bindingRegistrationHash: step.bindingRegistrationHash,
  }))
  supplyIdentities.sort((left, right) => (
    canonicalDigest(left as StableHashValue).localeCompare(canonicalDigest(right as StableHashValue))
  ))
  return canonicalDigest(supplyIdentities as StableHashValue)
}

type RouteCandidate = RequestEvaluation['candidates'][number] & Required<Pick<
  RequestEvaluation['candidates'][number],
  'publicationRef' | 'publicationRevision' | 'readinessValidUntil' | 'price' | 'cancellation'
>>

function isRouteCandidate(candidate: RequestEvaluation['candidates'][number]): candidate is RouteCandidate {
  return candidate.publicationRef !== undefined && candidate.publicationRevision !== undefined
    && candidate.readinessValidUntil !== undefined && candidate.price !== undefined
    && candidate.cancellation !== undefined
}

function maximumRouteCost(prices: readonly RegisteredSupplyPrice[]): CustomerRequestRoutePlan['maximumTotalCost'] | undefined {
  if (prices.some((price) => price.kind === 'on_request')) {
    return Object.freeze({ kind: 'requires_preparation' as const })
  }
  const currencies = new Set(prices.map((price) => price.kind === 'on_request' ? '' : price.currency))
  if (currencies.size !== 1) return undefined
  let amountMinor = 0
  for (const price of prices) {
    if (price.kind === 'on_request') continue
    const maximum = price.kind === 'fixed' ? price.amountMinor : price.maximumAmountMinor
    amountMinor += maximum
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return undefined
  }
  const [currency] = currencies
  if (currency === undefined) return undefined
  return Object.freeze({ kind: 'known' as const, currency, amountMinor })
}

function canRankByLowestMaximumPrice(
  routes: readonly Pick<CustomerRequestRoutePlan, 'maximumTotalCost'>[],
): boolean {
  if (routes.length === 0 || routes.some((route) => route.maximumTotalCost.kind !== 'known')) return false
  return new Set(routes.map((route) => route.maximumTotalCost.kind === 'known'
    ? route.maximumTotalCost.currency
    : '')).size === 1
}

function routesUseDisjointProviders(
  left: Pick<CustomerRequestRoutePlan, 'steps'>,
  right: Pick<CustomerRequestRoutePlan, 'steps'>,
): boolean {
  const leftBindings = new Set(left.steps.map((step) => step.bindingId))
  const leftBusinesses = new Set(left.steps.map((step) => step.businessId))
  return right.steps.every((step) => !leftBindings.has(step.bindingId) && !leftBusinesses.has(step.businessId))
}

function compareRoutePlans(
  left: Pick<CustomerRequestRoutePlan, 'routePlanId' | 'maximumTotalCost'>,
  right: Pick<CustomerRequestRoutePlan, 'routePlanId' | 'maximumTotalCost'>,
  objective: 'lowest_maximum_price' | undefined,
): number {
  if (objective === undefined) return left.routePlanId.localeCompare(right.routePlanId)
  const leftCost = left.maximumTotalCost.kind === 'known' ? left.maximumTotalCost.amountMinor : Number.MAX_SAFE_INTEGER
  const rightCost = right.maximumTotalCost.kind === 'known' ? right.maximumTotalCost.amountMinor : Number.MAX_SAFE_INTEGER
  return leftCost - rightCost || left.routePlanId.localeCompare(right.routePlanId)
}

export function composeRequestActions(
  actions: readonly ProposedRequestAction[],
  models: ReadonlyMap<string, CapabilityDecisionModel>,
  registeredMappings: readonly RegisteredOperationMapping[],
): readonly ProposedRequestAction[] | undefined {
  const composed = actions.map((action): ProposedRequestAction => {
    const model = resolveExactModel(models, action.contractRef)
    if (model === undefined) throw new Error('customer_request_selection_model_missing')
    const supplied = new Set(action.inputs.map((fact) => fact.inputKey))
    const mappings: RequestActionInputMapping[] = []
    for (const target of model.inputs.filter((input) => !supplied.has(input.key))) {
      const semanticIdentity = target.semanticIdentity
      if (semanticIdentity === undefined) continue
      const candidates = actions.flatMap((sourceAction) => {
        if (sourceAction.actionId === action.actionId) return []
        const sourceModel = resolveExactModel(models, sourceAction.contractRef)
        if (sourceModel === undefined) return []
        return sourceModel.evidence.flatMap((evidence) => {
          if (!evidence.guaranteed || evidence.semanticIdentity !== semanticIdentity) return []
          return registeredMappings.flatMap((mapping) => (
            sameCapabilityContractRef(mapping.sourceContractRef, sourceModel.contractRef)
            && sameCapabilityContractRef(mapping.targetContractRef, model.contractRef)
            && mapping.sourceSchemaIdentity === evidence.schemaIdentity
            && mapping.targetSchemaIdentity === target.schemaIdentity
            && mappingCompatibleWithPointers(mapping, evidence.outputPointer, target.inputPointer)
              ? [{ sourceAction, sourceModel, evidence, mapping }]
              : []
          ))
        })
      })
      if (candidates.length !== 1) continue
      const candidate = candidates[0]
      if (candidate === undefined) continue
      const { sourceAction, evidence, mapping } = candidate
      mappings.push(Object.freeze({
        mappingRef: mapping.mappingRef,
        kind: mapping.kind,
        mappingId: mapping.mappingRef,
        semanticIdentity,
        source: Object.freeze({
          actionId: sourceAction.actionId, annotationId: evidence.annotationId,
          evidenceId: evidence.evidenceId, outputPointer: evidence.outputPointer,
        }),
        target: Object.freeze({ annotationId: target.annotationId, inputKey: target.key, inputPointer: target.inputPointer }),
        schemaIdentity: target.schemaIdentity, authority: 'registered_contract_semantics' as const,
        ...(mapping.kind === 'array_project' ? {
          sourceArrayPointer: mapping.sourceArrayPointer,
          sourceItemPointer: mapping.sourceItemPointer,
          targetArrayPointer: mapping.targetArrayPointer,
          minItems: mapping.minItems,
          maxItems: mapping.maxItems,
        } : {}),
        ...(mapping.kind === 'registered_transform' ? {
          transformRef: mapping.transformRef,
          transformVersion: mapping.transformVersion,
          inputCardinalityMax: mapping.inputCardinalityMax,
          outputCardinalityMax: mapping.outputCardinalityMax,
        } : {}),
      }))
    }
    return Object.freeze({
      ...action,
      mappingRefs: Object.freeze(mappings.map((mapping) => mapping.mappingRef)),
      dependsOn: Object.freeze(uniqueSorted(mappings.map((mapping) => mapping.source.actionId))),
      inputMappings: Object.freeze(mappings.sort((left, right) => left.mappingRef.localeCompare(right.mappingRef))),
    })
  })
  const composedById = new Map(composed.map((action) => [action.actionId, action]))
  const orderGraph = new DirectedGraph()
  for (const action of composed) orderGraph.mergeNode(action.actionId)
  for (const action of composed) {
    for (const dependency of action.dependsOn) {
      if (composedById.has(dependency)) orderGraph.mergeDirectedEdge(dependency, action.actionId)
    }
  }
  if (hasCycle(orderGraph)) return undefined
  const ordered: ProposedRequestAction[] = []
  for (const generation of topologicalGenerations(orderGraph)) {
    for (const actionId of [...generation].sort((left, right) => left.localeCompare(right))) {
      const action = composedById.get(actionId)
      if (action !== undefined) ordered.push(action)
    }
  }
  return Object.freeze(ordered)
}

function mappingCompatibleWithPointers(
  mapping: RegisteredOperationMapping,
  sourceOutputPointer: string,
  targetInputPointer: string,
): boolean {
  if (mapping.kind === 'array_project') {
    return mapping.sourceArrayPointer === sourceOutputPointer
      && mapping.targetArrayPointer === targetInputPointer
      && Number.isSafeInteger(mapping.minItems)
      && Number.isSafeInteger(mapping.maxItems)
      && mapping.minItems >= 0
      && mapping.maxItems >= mapping.minItems
  }
  return mapping.sourceOutputPointer === sourceOutputPointer
    && mapping.targetInputPointer === targetInputPointer
    && (mapping.kind !== 'registered_transform'
      || (Number.isSafeInteger(mapping.transformVersion)
        && mapping.transformVersion > 0
        && Number.isSafeInteger(mapping.inputCardinalityMax)
        && Number.isSafeInteger(mapping.outputCardinalityMax)
        && mapping.inputCardinalityMax > 0
        && mapping.outputCardinalityMax > 0))
}

function exactModelRegistry(models: readonly CapabilityDecisionModel[]): Map<string, CapabilityDecisionModel> | undefined {
  const registry = new Map<string, CapabilityDecisionModel>()
  for (const model of models) {
    const key = exactContractRefKey(model.contractRef)
    if (registry.has(key)) return undefined
    registry.set(key, model)
  }
  return registry
}

function resolveExactModel(
  models: ReadonlyMap<string, CapabilityDecisionModel>, ref: CapabilityContractRef,
): CapabilityDecisionModel | undefined {
  const model = models.get(exactContractRefKey(ref))
  return model !== undefined && sameCapabilityContractRef(model.contractRef, ref) ? model : undefined
}

function factBelongsToExactModel(
  fact: RequestFact, models: ReadonlyMap<string, CapabilityDecisionModel>,
): boolean {
  const model = resolveExactModel(models, fact.contractRef)
  const semantic = model?.inputs.find((input) => input.key === fact.inputKey)
  if (model === undefined || model.selectionKey !== fact.selectionKey || semantic === undefined
    || semantic.inputPointer !== fact.inputPointer || semantic.schemaIdentity !== fact.schemaIdentity) return false
  const assessment = model.assessInput({
    contractRef: model.contractRef,
    selectionKey: model.selectionKey,
    stage: 'option_selection',
    facts: [{ input: fact.inputKey, inputPointer: fact.inputPointer, value: fact.value }],
  })
  return assessment.kind !== 'incompatible'
}

function exactInputForFact(
  fact: RequestFact,
  model: CapabilityDecisionModel,
): CapabilityInputSemantic | undefined {
  if (!sameCapabilityContractRef(model.contractRef, fact.contractRef)
    || model.selectionKey !== fact.selectionKey) return undefined
  const input = model.inputs.find((candidate) => candidate.key === fact.inputKey)
  return input !== undefined
    && input.inputPointer === fact.inputPointer
    && input.schemaIdentity === fact.schemaIdentity
    ? input
    : undefined
}

function mergeFacts(prior: readonly RequestFact[], proposed: readonly RequestFact[]): readonly RequestFact[] | undefined {
  const byInput = new Map<string, RequestFact>()
  for (const fact of [...prior, ...proposed]) {
    const key = canonicalDigest({ contractRef: fact.contractRef, inputKey: fact.inputKey, inputPointer: fact.inputPointer })
    const existing = byInput.get(key)
    if (existing !== undefined && canonicalDigest(existing.value) !== canonicalDigest(fact.value)) return undefined
    byInput.set(key, fact)
  }
  return Object.freeze([...byInput.values()].sort((left, right) => (
    left.contractRef.capabilityId.localeCompare(right.contractRef.capabilityId)
    || left.contractRef.version - right.contractRef.version
    || left.contractRef.contractDigest.localeCompare(right.contractRef.contractDigest)
    || left.inputPointer.localeCompare(right.inputPointer)
  )))
}

