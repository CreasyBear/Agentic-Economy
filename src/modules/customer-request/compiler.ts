import {
  sameCapabilityContractRef,
  type CapabilityContractRef,
  type CapabilityDecisionModel,
  type CapabilityInputSemantic,
} from '@/modules/capability-contract/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  discoverRequestEvaluationCandidates,
  evaluateCustomerRequestSnapshot,
  evaluateIntentDirectionRequestSnapshot,
  requestRegistrySnapshotDigest,
  type ProposedRequestAction,
  type RegisteredEvaluationBinding,
  type RequestEvaluation,
  type RequestFact,
} from './evaluation'
import {
  deriveCustomerDecisionPreference,
  type CustomerRequestSemanticProposal,
} from './semantic-interpreter'

const MAX_SELECTIONS = 64
const MAX_FACTS = 128
const MAX_AGGREGATE_BYTES = 700_000

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
  proposalDigest: string
  registrySnapshotDigest: string
  actions: readonly ProposedRequestAction[]
  completionRequirements: RequestEvaluation['completionRequirements']
  planDigest: string
  createdAt: number
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
  const proposalFacts = selected.flatMap((selection) => selection.facts)
  const facts = mergeFacts(command.priorFacts ?? [], proposalFacts)
  if (facts === undefined) return { kind: 'refused', reason: 'unsafe_interpretation' }
  const decisionPreference = deriveCustomerDecisionPreference(command.intent)
  const actions = selected.map((selection, index): ProposedRequestAction => {
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
    })
  })
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
  const planMaterial = {
    requestId: command.requestId,
    requestRevision,
    proposedByAgentId: command.delegatedAgentId,
    interpreterId: command.interpreterId,
    proposalDigest,
    registrySnapshotDigest,
    actions,
    completionRequirements: evaluation.completionRequirements,
  }
  const planDigest = canonicalDigest(planMaterial)
  const plan: CustomerRequestV2PlanRevision = Object.freeze({
    planRevisionId: `plan:${planDigest}`,
    ...planMaterial,
    planDigest,
    createdAt: command.now,
  })
  const outcome = evaluation.posture === 'unsupported'
    ? 'unsupported' as const
    : evaluation.posture === 'needs_information' ? 'needs_information' as const : 'plan_ready' as const
  const aggregateMaterial = { aggregateVersion: 2 as const, snapshot, evaluation, plan, outcome }
  if (new TextEncoder().encode(JSON.stringify(aggregateMaterial)).byteLength > MAX_AGGREGATE_BYTES) {
    return { kind: 'refused', reason: 'unsafe_interpretation' }
  }
  return {
    kind: 'compiled',
    aggregate: Object.freeze({ ...aggregateMaterial, aggregateDigest: canonicalDigest(aggregateMaterial) }),
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
  return Object.freeze(normalized)
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
      })),
      completionRequirements: aggregate.plan.completionRequirements.map(writableCompletion),
    },
    outcome: aggregate.outcome,
    aggregateDigest: aggregate.aggregateDigest,
  }
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
