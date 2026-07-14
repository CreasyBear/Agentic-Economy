import {
  sameCapabilityContractRef,
  type CapabilityContractRef,
  type CapabilityDecisionModel,
  type CapabilityInputFact,
  type CapabilityInputKey,
  type CapabilitySelectionKey,
  type JsonValue,
  type PointedSchemaIdentity,
} from '@/modules/capability-contract/public'
import type { CapabilityCancellation } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

export type RegisteredSupplyPrice =
  | Readonly<{ kind: 'fixed'; currency: string; amountMinor: number }>
  | Readonly<{ kind: 'range'; currency: string; minimumAmountMinor: number; maximumAmountMinor: number }>
  | Readonly<{ kind: 'on_request' }>

export type RequestFactSource = Readonly<
  | { kind: 'customer'; assertionRef: string }
  | { kind: 'agent_inference'; inferenceRef: string }
>

export type RequestFact = Readonly<{
  contractRef: CapabilityContractRef
  selectionKey: CapabilitySelectionKey
  inputKey: CapabilityInputKey
  inputPointer: string
  schemaIdentity: PointedSchemaIdentity
  value: JsonValue
  source: RequestFactSource
}>

export type RequestEvaluationCandidateInput = Readonly<{
  businessId: string
  offeringId: string
  bindingId: string
  model: CapabilityDecisionModel
  offeringRegistrationHash: string
  bindingRegistrationHash: string
  publicationRef?: string
  publicationRevision?: number
  readinessValidUntil?: number
  price?: RegisteredSupplyPrice
  cancellation: CapabilityCancellation
}>

export type RegisteredEvaluationBinding = Readonly<{
  businessId: string
  offeringId: string
  bindingId: string
  contractRef: CapabilityContractRef
  offeringRegistrationHash: string
  bindingRegistrationHash: string
  publicationRef?: string
  publicationRevision?: number
  readinessValidUntil?: number
  price?: RegisteredSupplyPrice
  cancellation: CapabilityCancellation
}>

export type RequestEvaluationCandidate = Readonly<{
  candidateRef: string
  businessId: string
  offeringId: string
  bindingId: string
  contractRef: CapabilityContractRef
  selectionKey: CapabilitySelectionKey
  semanticDigest: string
  offeringRegistrationHash: string
  bindingRegistrationHash: string
  publicationRef?: string
  publicationRevision?: number
  readinessValidUntil?: number
  price?: RegisteredSupplyPrice
  cancellation: CapabilityCancellation
  viability:
    | Readonly<{ kind: 'viable' }>
    | Readonly<{ kind: 'blocked_on_information'; inputs: readonly MissingInputDescriptor[] }>
    | Readonly<{ kind: 'incompatible'; issueKeywords: readonly string[] }>
}>

export type MissingInputTarget = Readonly<{
  contractRef: CapabilityContractRef
  selectionKey: CapabilitySelectionKey
  inputKey: CapabilityInputKey
  inputPointer: string
  schemaIdentity: PointedSchemaIdentity
}>

export type MissingInputDescriptor = MissingInputTarget & Readonly<{ customerLabel: string }>

export type ContractFactInformationRequirement = Readonly<{
  kind: 'contract_fact'
  requirementKey: string
  customerLabel: string
  targets: readonly MissingInputTarget[]
  impact: Readonly<{
    affectedCandidates: readonly string[]
    probesEnabled: readonly string[]
  }>
  requirementDigest: string
}>

export type IntentDirectionInformationRequirement = Readonly<{
  kind: 'intent_direction'
  prompt: string
  requirementDigest: string
}>

export type InformationRequirement = ContractFactInformationRequirement | IntentDirectionInformationRequirement

export type UnderstoodCriterion = Readonly<{
  inputKey: CapabilityInputKey
  inputPointer: string
  label: string
  value: JsonValue
  basis: 'customer_provided' | 'extracted_from_request'
  criterionDigest: string
}>

export type PreparationDisclosurePreview = Readonly<{
  maximumRecipients: number
  purposes: readonly string[]
  categories: readonly Readonly<{
    inputKey: CapabilityInputKey
    label: string
    classification: 'personal' | 'sensitive' | 'credential'
  }>[]
}>

export type ProposedRequestAction = Readonly<{
  actionId: string
  contractRef: CapabilityContractRef
  selectionKey: CapabilitySelectionKey
  semanticDigest: string
  dependsOn: readonly string[]
  inputs: readonly RequestFact[]
  inputMappings: readonly RequestActionInputMapping[]
}>

export type RequestActionInputMapping = Readonly<{
  mappingId: string
  semanticIdentity: string
  source: Readonly<{ actionId: string; annotationId: string; evidenceId: string; outputPointer: string }>
  target: Readonly<{ annotationId: string; inputKey: CapabilityInputKey; inputPointer: string }>
  schemaIdentity: PointedSchemaIdentity
  authority: 'registered_contract_semantics'
}>

export type RequestCompletionRequirement = Readonly<{
  actionId: string
  contractRef: CapabilityContractRef
  evidenceId: string
  outputPointer: string
  purpose: 'completion'
  schemaIdentity: PointedSchemaIdentity
}>

export type RequestEvaluation = Readonly<{
  requestId: string
  requestRevision: number
  registrySnapshotDigest: string
  factsDigest: string
  facts: readonly RequestFact[]
  criteria: readonly UnderstoodCriterion[]
  decisionPreference?: Readonly<{
    objective: 'lowest_maximum_price'
    basis: 'extracted_from_request'
    evidenceRef: string
  }>
  preparationDisclosure?: PreparationDisclosurePreview
  candidates: readonly RequestEvaluationCandidate[]
  completionRequirements: readonly RequestCompletionRequirement[]
  nextRequirement?: InformationRequirement
  posture: 'progress_available' | 'needs_information' | 'unsupported'
  evaluationDigest: string
}>

export function evaluateCustomerRequestSnapshot(input: Readonly<{
  requestId: string
  requestRevision: number
  intent: string
  facts: readonly RequestFact[]
  registrySnapshotDigest: string
  candidates: readonly RequestEvaluationCandidateInput[]
  proposedActions?: readonly ProposedRequestAction[]
  resolveModel?: (ref: CapabilityContractRef) => CapabilityDecisionModel | undefined
  decisionPreference?: RequestEvaluation['decisionPreference']
}>): RequestEvaluation {
  const candidates = input.candidates.map((candidate): RequestEvaluationCandidate => {
    const facts = factsForModel(input.facts, candidate.model)
    const assessment = candidate.model.assessInput({
      contractRef: candidate.model.contractRef,
      selectionKey: candidate.model.selectionKey,
      stage: 'option_selection',
      facts,
    })
    const candidateRef = `candidate:${canonicalDigest({
      businessId: candidate.businessId,
      offeringId: candidate.offeringId,
      bindingId: candidate.bindingId,
      contractRef: candidate.model.contractRef,
    })}`
    const proposedAction = input.proposedActions?.find((action) => (
      sameCapabilityContractRef(action.contractRef, candidate.model.contractRef)
      && action.selectionKey === candidate.model.selectionKey
    ))
    const mappedInputKeys = new Set(proposedAction?.inputMappings.map((mapping) => mapping.target.inputKey) ?? [])
    const unmappedMissing = assessment.kind === 'needs_information'
      ? assessment.missing.filter((semantic) => !mappedInputKeys.has(semantic.key))
      : []
    return Object.freeze({
      candidateRef,
      businessId: candidate.businessId,
      offeringId: candidate.offeringId,
      bindingId: candidate.bindingId,
      contractRef: candidate.model.contractRef,
      selectionKey: candidate.model.selectionKey,
      semanticDigest: candidate.model.semanticDigest,
      offeringRegistrationHash: candidate.offeringRegistrationHash,
      bindingRegistrationHash: candidate.bindingRegistrationHash,
      ...(candidate.publicationRef === undefined ? {} : { publicationRef: candidate.publicationRef }),
      ...(candidate.publicationRevision === undefined ? {} : { publicationRevision: candidate.publicationRevision }),
      ...(candidate.readinessValidUntil === undefined ? {} : { readinessValidUntil: candidate.readinessValidUntil }),
      ...(candidate.price === undefined ? {} : { price: candidate.price }),
      cancellation: {
        ...candidate.cancellation,
        evidenceRefs: [...candidate.cancellation.evidenceRefs],
      },
      viability: assessment.kind === 'viable'
        ? Object.freeze({ kind: 'viable' as const })
        : assessment.kind === 'needs_information' && unmappedMissing.length > 0
          ? Object.freeze({
              kind: 'blocked_on_information' as const,
              inputs: Object.freeze(unmappedMissing.map((semantic) => Object.freeze({
                contractRef: candidate.model.contractRef,
                selectionKey: candidate.model.selectionKey,
                inputKey: semantic.key,
                inputPointer: semantic.inputPointer,
                schemaIdentity: semantic.schemaIdentity,
                customerLabel: semantic.label,
              }))),
            })
          : assessment.kind === 'incompatible' ? Object.freeze({
              kind: 'incompatible' as const,
              issueKeywords: Object.freeze(assessment.issues.map(({ keyword }) => keyword)),
            }) : Object.freeze({ kind: 'viable' as const }),
    })
  })
  const nextRequirement = chooseNextRequirement(candidates)
  const criteria = projectUnderstoodCriteria(input.facts, input.candidates)
  const preparationDisclosure = projectPreparationDisclosure(input.facts, input.candidates)
  const completionRequirements = deriveCompletionRequirements(
    input.proposedActions ?? [], input.resolveModel,
  )
  const posture = candidates.length === 0
    ? 'unsupported' as const
    : nextRequirement === undefined ? 'progress_available' as const : 'needs_information' as const
  const facts = Object.freeze([...input.facts].sort(compareRequestFacts))
  const factsDigest = canonicalDigest(facts)
  const digestMaterial = {
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    intent: input.intent,
    registrySnapshotDigest: input.registrySnapshotDigest,
    factsDigest,
    facts,
    criteria,
    ...(input.decisionPreference === undefined ? {} : { decisionPreference: input.decisionPreference }),
    ...(preparationDisclosure === undefined ? {} : { preparationDisclosure }),
    candidates,
    completionRequirements,
    ...(nextRequirement === undefined ? {} : { nextRequirement }),
    posture,
  }
  return Object.freeze({
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    registrySnapshotDigest: input.registrySnapshotDigest,
    factsDigest,
    facts,
    criteria,
    ...(input.decisionPreference === undefined ? {} : { decisionPreference: input.decisionPreference }),
    ...(preparationDisclosure === undefined ? {} : { preparationDisclosure }),
    candidates: Object.freeze(candidates),
    completionRequirements,
    ...(nextRequirement === undefined ? {} : { nextRequirement }),
    posture,
    evaluationDigest: canonicalDigest(digestMaterial as StableHashValue),
  })
}

export function evaluateIntentDirectionRequestSnapshot(input: Readonly<{
  requestId: string
  requestRevision: number
  intent: string
  facts: readonly RequestFact[]
  registrySnapshotDigest: string
  prompt: string
}>): RequestEvaluation {
  const facts = Object.freeze([...input.facts].sort(compareRequestFacts))
  const factsDigest = canonicalDigest(facts)
  const nextRequirement: IntentDirectionInformationRequirement = Object.freeze({
    kind: 'intent_direction',
    prompt: input.prompt,
    requirementDigest: canonicalDigest({
      requestId: input.requestId,
      requestRevision: input.requestRevision,
      intent: input.intent,
      registrySnapshotDigest: input.registrySnapshotDigest,
      kind: 'intent_direction',
      prompt: input.prompt,
    }),
  })
  const digestMaterial = {
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    intent: input.intent,
    registrySnapshotDigest: input.registrySnapshotDigest,
    factsDigest,
    facts,
    candidates: [],
    criteria: [],
    completionRequirements: [],
    nextRequirement,
    posture: 'needs_information' as const,
  }
  return Object.freeze({
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    registrySnapshotDigest: input.registrySnapshotDigest,
    factsDigest,
    facts,
    candidates: Object.freeze([]),
    criteria: Object.freeze([]),
    completionRequirements: Object.freeze([]),
    nextRequirement,
    posture: 'needs_information' as const,
    evaluationDigest: canonicalDigest(digestMaterial as StableHashValue),
  })
}

export function discoverRequestEvaluationCandidates(input: Readonly<{
  selectedCapabilities: readonly Readonly<{
    selectionKey: CapabilitySelectionKey
    contractRef: CapabilityContractRef
  }>[]
  bindings: readonly RegisteredEvaluationBinding[]
  resolveModel: (ref: CapabilityContractRef) => CapabilityDecisionModel | undefined
}>): readonly RequestEvaluationCandidateInput[] {
  return Object.freeze(input.bindings.flatMap((binding) => {
    const selected = input.selectedCapabilities.find((candidate) => (
      candidate.selectionKey === input.resolveModel(binding.contractRef)?.selectionKey
      && sameCapabilityContractRef(candidate.contractRef, binding.contractRef)
    ))
    if (selected === undefined) return []
    const model = input.resolveModel(binding.contractRef)
    if (model === undefined || model.selectionKey !== selected.selectionKey
      || !sameCapabilityContractRef(model.contractRef, binding.contractRef)) return []
    return [Object.freeze({
      businessId: binding.businessId,
      offeringId: binding.offeringId,
      bindingId: binding.bindingId,
      model,
      offeringRegistrationHash: binding.offeringRegistrationHash,
      bindingRegistrationHash: binding.bindingRegistrationHash,
      ...(binding.publicationRef === undefined ? {} : { publicationRef: binding.publicationRef }),
      ...(binding.publicationRevision === undefined ? {} : { publicationRevision: binding.publicationRevision }),
      ...(binding.readinessValidUntil === undefined ? {} : { readinessValidUntil: binding.readinessValidUntil }),
      ...(binding.price === undefined ? {} : { price: binding.price }),
      cancellation: {
        ...binding.cancellation,
        evidenceRefs: [...binding.cancellation.evidenceRefs],
      },
    })]
  }).sort((left, right) => left.bindingId.localeCompare(right.bindingId)))
}

export function requestRegistrySnapshotDigest(bindings: readonly RegisteredEvaluationBinding[]): string {
  return canonicalDigest([...bindings].map((binding) => ({
    businessId: binding.businessId,
    offeringId: binding.offeringId,
    bindingId: binding.bindingId,
    contractRef: binding.contractRef,
    offeringRegistrationHash: binding.offeringRegistrationHash,
    bindingRegistrationHash: binding.bindingRegistrationHash,
    ...(binding.price === undefined ? {} : { price: binding.price }),
    cancellation: binding.cancellation,
  })).sort((left, right) => left.bindingId.localeCompare(right.bindingId)))
}

function factsForModel(facts: readonly RequestFact[], model: CapabilityDecisionModel): readonly CapabilityInputFact[] {
  return facts.filter((fact) => (
    fact.selectionKey === model.selectionKey
    && sameCapabilityContractRef(fact.contractRef, model.contractRef)
  )).map((fact) => ({ input: fact.inputKey, inputPointer: fact.inputPointer, value: fact.value }))
}

function chooseNextRequirement(candidates: readonly RequestEvaluationCandidate[]): InformationRequirement | undefined {
  const groups = new Map<string, {
    customerLabel: string
    targets: MissingInputTarget[]
    affectedCandidates: string[]
    probesEnabled: string[]
  }>()
  for (const candidate of candidates) {
    if (candidate.viability.kind !== 'blocked_on_information') continue
    for (const missing of candidate.viability.inputs) {
      const groupKey = canonicalDigest({ customerLabel: missing.customerLabel, schemaIdentity: missing.schemaIdentity })
      const group = groups.get(groupKey) ?? {
        customerLabel: missing.customerLabel, targets: [], affectedCandidates: [], probesEnabled: [],
      }
      group.targets.push(targetFromMissing(missing))
      group.affectedCandidates.push(candidate.candidateRef)
      if (candidate.viability.inputs.length === 1) group.probesEnabled.push(candidate.candidateRef)
      groups.set(groupKey, group)
    }
  }
  const selected = [...groups.values()].sort((left, right) => (
    right.probesEnabled.length - left.probesEnabled.length
    || right.affectedCandidates.length - left.affectedCandidates.length
    || left.customerLabel.localeCompare(right.customerLabel)
  ))[0]
  if (selected === undefined) return undefined
  const targets = Object.freeze(uniqueTargets(selected.targets).sort(compareTargets))
  const impact = Object.freeze({
    affectedCandidates: Object.freeze([...new Set(selected.affectedCandidates)].sort()),
    probesEnabled: Object.freeze([...new Set(selected.probesEnabled)].sort()),
  })
  const requirementKey = `requirement:${canonicalDigest({ targets, impact })}`
  return Object.freeze({
    kind: 'contract_fact',
    requirementKey,
    customerLabel: selected.customerLabel,
    targets,
    impact,
    requirementDigest: canonicalDigest({ requirementKey, customerLabel: selected.customerLabel, targets, impact }),
  })
}

function projectUnderstoodCriteria(
  facts: readonly RequestFact[], candidates: readonly RequestEvaluationCandidateInput[],
): readonly UnderstoodCriterion[] {
  return Object.freeze(facts.flatMap((fact) => {
    const model = candidates.find((candidate) => (
      candidate.model.selectionKey === fact.selectionKey
      && sameCapabilityContractRef(candidate.model.contractRef, fact.contractRef)
    ))?.model
    const semantic = model?.inputs.find((candidate) => (
      candidate.key === fact.inputKey
      && candidate.inputPointer === fact.inputPointer
      && candidate.schemaIdentity === fact.schemaIdentity
    ))
    if (semantic === undefined) return []
    const basis = fact.source.kind === 'customer' ? 'customer_provided' as const : 'extracted_from_request' as const
    return [Object.freeze({
      inputKey: fact.inputKey,
      inputPointer: fact.inputPointer,
      label: semantic.label,
      value: fact.value,
      basis,
      criterionDigest: canonicalDigest({
        contractRef: fact.contractRef, inputKey: fact.inputKey, inputPointer: fact.inputPointer,
        label: semantic.label, value: fact.value, basis,
      }),
    })]
  }).sort((left, right) => left.label.localeCompare(right.label) || left.inputPointer.localeCompare(right.inputPointer)))
}

function projectPreparationDisclosure(
  facts: readonly RequestFact[], candidates: readonly RequestEvaluationCandidateInput[],
): PreparationDisclosurePreview | undefined {
  const categories = new Map<string, PreparationDisclosurePreview['categories'][number]>()
  const purposes = new Set<string>()
  for (const candidate of candidates) {
    const projection = candidate.model.projectPreparation({
      contractRef: candidate.model.contractRef,
      selectionKey: candidate.model.selectionKey,
      semanticDigest: candidate.model.semanticDigest,
      facts: factsForModel(facts, candidate.model),
    })
    if (projection.kind === 'incompatible') continue
    for (const use of projection.dataUse) {
      if (use.phase !== 'preparation' || use.classification === 'public') continue
      for (const input of use.inputs) {
        categories.set(input.inputKey, {
          inputKey: input.inputKey,
          label: input.label,
          classification: use.classification,
        })
      }
      for (const purpose of use.purposes) purposes.add(purpose)
    }
  }
  if (categories.size === 0) return undefined
  return Object.freeze({
    maximumRecipients: new Set(candidates.map(({ businessId }) => businessId)).size,
    purposes: Object.freeze([...purposes].sort()),
    categories: Object.freeze([...categories.values()].sort((left, right) => left.label.localeCompare(right.label))),
  })
}

function deriveCompletionRequirements(
  actions: readonly ProposedRequestAction[],
  resolveModel: ((ref: CapabilityContractRef) => CapabilityDecisionModel | undefined) | undefined,
): readonly RequestCompletionRequirement[] {
  if (actions.length === 0) return Object.freeze([])
  if (resolveModel === undefined) throw new Error('request_completion_model_resolver_required')
  return Object.freeze(actions.flatMap((action) => {
    const model = resolveModel(action.contractRef)
    if (model === undefined
      || model.selectionKey !== action.selectionKey
      || model.semanticDigest !== action.semanticDigest
      || !sameCapabilityContractRef(model.contractRef, action.contractRef)) {
      throw new Error('request_action_contract_mismatch')
    }
    return model.evidence.filter((evidence) => evidence.purpose === 'completion').map((evidence) => Object.freeze({
      actionId: action.actionId,
      contractRef: action.contractRef,
      evidenceId: evidence.evidenceId,
      outputPointer: evidence.outputPointer,
      purpose: 'completion' as const,
      schemaIdentity: evidence.schemaIdentity,
    }))
  }).sort((left, right) => left.actionId.localeCompare(right.actionId) || left.outputPointer.localeCompare(right.outputPointer)))
}

function targetFromMissing(missing: MissingInputDescriptor): MissingInputTarget {
  return {
    contractRef: missing.contractRef,
    selectionKey: missing.selectionKey,
    inputKey: missing.inputKey,
    inputPointer: missing.inputPointer,
    schemaIdentity: missing.schemaIdentity,
  }
}

function uniqueTargets(targets: readonly MissingInputTarget[]): MissingInputTarget[] {
  const byDigest = new Map(targets.map((target) => [canonicalDigest(target), target]))
  return [...byDigest.values()]
}

function compareTargets(left: MissingInputTarget, right: MissingInputTarget): number {
  return left.contractRef.capabilityId.localeCompare(right.contractRef.capabilityId)
    || left.contractRef.version - right.contractRef.version
    || left.contractRef.contractDigest.localeCompare(right.contractRef.contractDigest)
    || left.inputPointer.localeCompare(right.inputPointer)
}

function compareRequestFacts(left: RequestFact, right: RequestFact): number {
  return compareTargets(left, right)
}
