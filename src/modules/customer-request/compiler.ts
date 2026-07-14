import {
  sameCapabilityContractRef,
  type CapabilityContractRef,
  type CapabilityDecisionModel,
  type CapabilityInputSemantic,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  evaluateIntentDirectionRequestSnapshot,
  requestRegistrySnapshotDigest,
  type ProposedRequestAction,
  type RequestActionInputMapping,
  type RegisteredEvaluationBinding,
  type RequestEvaluation,
  type RequestFact,
  type RegisteredSupplyPrice,
} from './evaluation'
import {
  deriveCustomerDecisionPreference,
  type CustomerRequestSemanticProposal,
} from './semantic-interpreter'

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
  snapshotDigest: string
  recordedAt: number
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
  routes: readonly CustomerRequestRoutePlan[]
  planDigest: string
  createdAt: number
}>

export type CustomerRequestRoutePlan = Readonly<{
  routePlanId: string
  requestId: string
  requestRevision: number
  registrySnapshotDigest: string
  steps: readonly Readonly<{
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
    price: RegisteredSupplyPrice
    dataUse: CapabilityDecisionModel['dataUse']
    effects: CapabilityDecisionModel['effects']
    evidence: CapabilityDecisionModel['evidence']
    recovery: CapabilityDecisionModel['lifecycle']
  }>[]
  edges: readonly (RequestActionInputMapping & Readonly<{ fromStep: string; toStep: string }>)[]
  maximumTotalCost:
    | Readonly<{ kind: 'known'; currency: string; amountMinor: number }>
    | Readonly<{ kind: 'requires_preparation' }>
  expiresAt: number
  uncertainty: readonly ('cost_requires_preparation')[]
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
    trust: 'registered_live_supply'
    ordering:
      | Readonly<{ kind: 'unranked' }>
      | Readonly<{ kind: 'ranked'; objective: 'lowest_maximum_price'; position: number }>
  }>
  authority: 'proposal_only'
  routeDigest: string
}>

export type CustomerRequestV2Aggregate = Readonly<{
  aggregateVersion: 2
  snapshot: CustomerRequestV2Snapshot
  evaluation: RequestEvaluation
  plan: CustomerRequestV2PlanRevision
  outcome: 'plan_ready' | 'needs_information' | 'unsupported'
  aggregateDigest: string
}>

export type CompileCustomerRequestCommand = Readonly<{
  requestId: string
  expectedRevision: number
  principalId: string
  delegatedAgentId: string
  intent: string
  networkId: string
  priorFacts?: readonly RequestFact[]
  proposal: CustomerRequestSemanticProposal
  interpreterId: string
  bindings: readonly RegisteredEvaluationBinding[]
  models: readonly CapabilityDecisionModel[]
  now: number
}>

export type CompileCustomerRequestResult =
  | Readonly<{ kind: 'compiled'; aggregate: CustomerRequestV2Aggregate }>
  | Readonly<{ kind: 'refused'; reason: 'unsafe_interpretation' | 'capability_graph_invalid' }>

export function compileCustomerRequest(command: CompileCustomerRequestCommand): CompileCustomerRequestResult {
  if (command.proposal.kind !== 'needs_intent_direction'
    && (command.proposal.selections.length > MAX_SELECTIONS
      || command.proposal.selections.reduce((count, selection) => count + selection.facts.length, 0) > MAX_FACTS)) {
    return { kind: 'refused', reason: 'unsafe_interpretation' }
  }
  const models = exactModelRegistry(command.models)
  if (models === undefined) return { kind: 'refused', reason: 'capability_graph_invalid' }
  const registrySnapshotDigest = requestRegistrySnapshotDigest(command.bindings)
  const selected = command.proposal.kind === 'needs_intent_direction'
    ? []
    : normalizeInferredFacts(command, models)
  if (selected === undefined) return { kind: 'refused', reason: 'unsafe_interpretation' }
  if (new Set(selected.map((selection) => selection.selectionKey)).size !== selected.length) {
    return { kind: 'refused', reason: 'unsafe_interpretation' }
  }
  const proposalFacts = selected.flatMap((selection) => selection.facts)
  const facts = mergeFacts(command.priorFacts ?? [], proposalFacts)
  if (facts === undefined) return { kind: 'refused', reason: 'unsafe_interpretation' }
  const decisionPreference = deriveCustomerDecisionPreference(command.intent)
  const baseActions = selected.map((selection, index): ProposedRequestAction => {
    const model = resolveExactModel(models, selection.contractRef)
    if (model === undefined || model.selectionKey !== selection.selectionKey) {
      throw new Error('customer_request_selection_model_missing')
    }
    const actionMaterial = {
      requestId: command.requestId,
      requestRevision: command.expectedRevision + 1,
      ordinal: index,
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
    }
    return Object.freeze({
      actionId: `action:${canonicalDigest(actionMaterial)}`,
      contractRef: model.contractRef,
      selectionKey: model.selectionKey,
      semanticDigest: model.semanticDigest,
      dependsOn: Object.freeze([]),
      inputs: Object.freeze(facts.filter((fact) => fact.selectionKey === model.selectionKey
        && sameCapabilityContractRef(fact.contractRef, model.contractRef))),
      inputMappings: Object.freeze([]),
    })
  })
  const actions = composeRequestActions(baseActions, models)
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
        candidates: discoverRequestEvaluationCandidates({
          selectedCapabilities: selected.map(({ selectionKey, contractRef }) => ({ selectionKey, contractRef })),
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
    routes,
  }
  const planDigest = canonicalDigest(planMaterial as StableHashValue)
  const plan: CustomerRequestV2PlanRevision = Object.freeze({
    planRevisionId: `plan:${planDigest}`,
    ...planMaterial,
    planDigest,
    createdAt: command.now,
  })
  const outcome = evaluation.posture === 'unsupported'
    ? 'unsupported' as const
    : evaluation.posture === 'needs_information'
      ? 'needs_information' as const
      : actions.length > 0 && routes.length === 0 ? 'unsupported' as const : 'plan_ready' as const
  const aggregateMaterial = { aggregateVersion: 2 as const, snapshot, evaluation, plan, outcome }
  if (new TextEncoder().encode(JSON.stringify(aggregateMaterial)).byteLength > MAX_AGGREGATE_BYTES) {
    return { kind: 'refused', reason: 'unsafe_interpretation' }
  }
  return {
    kind: 'compiled',
    aggregate: Object.freeze({ ...aggregateMaterial, aggregateDigest: canonicalDigest(aggregateMaterial as StableHashValue) }),
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
  return {
    aggregateVersion: aggregate.aggregateVersion,
    snapshot: {
      ...aggregate.snapshot,
      facts: aggregate.snapshot.facts.map(writableFact),
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
        viability: candidate.viability.kind === 'viable'
          ? { kind: 'viable' as const }
          : candidate.viability.kind === 'blocked_on_information'
            ? {
                kind: 'blocked_on_information' as const,
                inputs: candidate.viability.inputs.map((input) => ({ ...input, contractRef: { ...input.contractRef } })),
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
        inputs: action.inputs.map(writableFact),
        inputMappings: action.inputMappings.map((mapping) => ({
          ...mapping, source: { ...mapping.source }, target: { ...mapping.target },
        })),
      })),
      completionRequirements: aggregate.plan.completionRequirements.map(writableCompletion),
      routes: aggregate.plan.routes.map((route) => ({
        ...route,
        steps: route.steps.map((step) => ({
          ...step, contractRef: { ...step.contractRef }, price: { ...step.price },
          dataUse: step.dataUse.map((item) => ({ ...item, recipient: { ...item.recipient }, purposes: [...item.purposes] })),
          effects: step.effects.map((effect) => ({ ...effect })),
          evidence: step.evidence.map((evidence) => ({ ...evidence })), recovery: { ...step.recovery },
        })),
        edges: route.edges.map((edge) => ({ ...edge, source: { ...edge.source }, target: { ...edge.target } })),
        maximumTotalCost: { ...route.maximumTotalCost },
        uncertainty: [...route.uncertainty],
        fallbacks: {
          ordering: route.fallbacks.ordering,
          alternatives: route.fallbacks.alternatives.map((fallback) => ({ ...fallback })),
        },
        comparison: { ...route.comparison, ordering: { ...route.comparison.ordering } },
      })),
    },
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
}>): readonly CustomerRequestRoutePlan[] | undefined {
  if (input.actions.length === 0) return Object.freeze([])
  const choices = input.actions.map((action) => input.candidates.filter(isRouteCandidate).filter((candidate) => (
    candidate.viability.kind === 'viable'
    && candidate.selectionKey === action.selectionKey
    && sameCapabilityContractRef(candidate.contractRef, action.contractRef)
    && candidate.readinessValidUntil > input.now
  )))
  if (choices.some((items) => items.length === 0)) return Object.freeze([])
  let combinations: RouteCandidate[][] = [[]]
  for (const candidates of choices) {
    combinations = combinations.flatMap((combination) => candidates.map((candidate) => [...combination, candidate]))
    if (combinations.length > MAX_ROUTE_PLANS) return undefined
  }
  const drafts = combinations.map((combination) => {
    const steps = input.actions.map((action, index) => {
      const candidate = combination[index]
      if (candidate === undefined) throw new Error('customer_request_route_candidate_missing')
      const model = input.models.get(refKey(action.contractRef))
      if (model === undefined) throw new Error('customer_request_route_model_missing')
      return Object.freeze({
        actionId: action.actionId, candidateRef: candidate.candidateRef,
        businessId: candidate.businessId, offeringId: candidate.offeringId, bindingId: candidate.bindingId,
        contractRef: candidate.contractRef, offeringRegistrationHash: candidate.offeringRegistrationHash,
        bindingRegistrationHash: candidate.bindingRegistrationHash,
        publicationRef: candidate.publicationRef, publicationRevision: candidate.publicationRevision,
        price: candidate.price,
        dataUse: model.dataUse, effects: model.effects, evidence: model.evidence,
        recovery: model.lifecycle,
      })
    })
    const cost = maximumRouteCost(steps.map((step) => step.price))
    if (cost === undefined) return undefined
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
      trust: 'registered_live_supply' as const,
    })
    const core = {
      requestId: input.requestId, requestRevision: input.requestRevision,
      registrySnapshotDigest: input.registrySnapshotDigest, steps, edges,
      maximumTotalCost: cost, expiresAt,
      uncertainty: cost.kind === 'requires_preparation' ? ['cost_requires_preparation' as const] : [],
      comparison, authority: 'proposal_only' as const,
    }
    return Object.freeze({ routePlanId: `route:${canonicalDigest(core as StableHashValue)}`, ...core })
  }).filter((route): route is NonNullable<typeof route> => route !== undefined)
  const rankedObjective = canRankByLowestMaximumPrice(drafts) ? input.objective : undefined
  const ordered = drafts.sort((left, right) => compareRoutePlans(left, right, rankedObjective))
  return Object.freeze(ordered.map((draft, index): CustomerRequestRoutePlan => {
    const fallbacks = Object.freeze({
      ordering: 'unranked' as const,
      alternatives: Object.freeze(ordered.filter((alternative) => alternative.routePlanId !== draft.routePlanId
        && routesUseDisjointProviders(draft, alternative)).map((alternative) => Object.freeze({
        alternativeRouteRef: alternative.routePlanId,
        when: 'route_unavailable_before_approval' as const,
      }))),
    })
    const ordering = rankedObjective === 'lowest_maximum_price'
      ? Object.freeze({ kind: 'ranked' as const, objective: rankedObjective, position: index + 1 })
      : Object.freeze({ kind: 'unranked' as const })
    const material = {
      ...draft,
      fallbacks: Object.freeze(fallbacks),
      comparison: Object.freeze({ ...draft.comparison, ordering }),
    }
    return Object.freeze({ ...material, routeDigest: canonicalDigest(material as StableHashValue) })
  }))
}

type RouteCandidate = RequestEvaluation['candidates'][number] & Required<Pick<
  RequestEvaluation['candidates'][number], 'publicationRef' | 'publicationRevision' | 'readinessValidUntil' | 'price'
>>

function isRouteCandidate(candidate: RequestEvaluation['candidates'][number]): candidate is RouteCandidate {
  return candidate.publicationRef !== undefined && candidate.publicationRevision !== undefined
    && candidate.readinessValidUntil !== undefined && candidate.price !== undefined
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
): readonly ProposedRequestAction[] | undefined {
  const composed = actions.map((action): ProposedRequestAction => {
    const model = resolveExactModel(models, action.contractRef)
    if (model === undefined) throw new Error('customer_request_selection_model_missing')
    const supplied = new Set(action.inputs.map((fact) => fact.inputKey))
    const mappings: RequestActionInputMapping[] = []
    for (const target of model.inputs.filter((input) => input.required && !supplied.has(input.key))) {
      const producers = actions.flatMap((sourceAction) => {
        if (sourceAction.actionId === action.actionId) return []
        const sourceModel = resolveExactModel(models, sourceAction.contractRef)
        if (sourceModel === undefined) return []
        return sourceModel.evidence.filter((evidence) => evidence.guaranteed
          && target.semanticIdentity !== undefined
          && evidence.semanticIdentity === target.semanticIdentity
          && evidence.schemaIdentity === target.schemaIdentity).map((evidence) => ({ sourceAction, evidence }))
      })
      if (producers.length !== 1) continue
      const producer = producers[0]
      const semanticIdentity = target.semanticIdentity
      if (producer === undefined || semanticIdentity === undefined) continue
      const material = {
        sourceActionId: producer.sourceAction.actionId, sourceEvidenceId: producer.evidence.evidenceId,
        targetActionId: action.actionId, targetInputKey: target.key, schemaIdentity: target.schemaIdentity,
      }
      mappings.push(Object.freeze({
        mappingId: `mapping:${canonicalDigest(material)}`,
        semanticIdentity,
        source: Object.freeze({
          actionId: producer.sourceAction.actionId, annotationId: producer.evidence.annotationId,
          evidenceId: producer.evidence.evidenceId, outputPointer: producer.evidence.outputPointer,
        }),
        target: Object.freeze({ annotationId: target.annotationId, inputKey: target.key, inputPointer: target.inputPointer }),
        schemaIdentity: target.schemaIdentity, authority: 'registered_contract_semantics' as const,
      }))
    }
    return Object.freeze({
      ...action,
      dependsOn: Object.freeze([...new Set(mappings.map((mapping) => mapping.source.actionId))].sort()),
      inputMappings: Object.freeze(mappings.sort((left, right) => left.mappingId.localeCompare(right.mappingId))),
    })
  })
  const ordered: ProposedRequestAction[] = []
  const remaining = new Map(composed.map((action) => [action.actionId, action]))
  while (remaining.size > 0) {
    const ready = [...remaining.values()].filter((action) => action.dependsOn.every((dependency) => !remaining.has(dependency)))
      .sort((left, right) => left.actionId.localeCompare(right.actionId))
    if (ready.length === 0) return undefined
    for (const action of ready) { ordered.push(action); remaining.delete(action.actionId) }
  }
  return Object.freeze(ordered)
}

function exactModelRegistry(models: readonly CapabilityDecisionModel[]): Map<string, CapabilityDecisionModel> | undefined {
  const registry = new Map<string, CapabilityDecisionModel>()
  for (const model of models) {
    const key = refKey(model.contractRef)
    if (registry.has(key)) return undefined
    registry.set(key, model)
  }
  return registry
}

function resolveExactModel(
  models: ReadonlyMap<string, CapabilityDecisionModel>, ref: CapabilityContractRef,
): CapabilityDecisionModel | undefined {
  const model = models.get(refKey(ref))
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

function refKey(ref: CapabilityContractRef): string {
  return `${ref.capabilityId}\u0000${ref.version}\u0000${ref.contractDigest}`
}
