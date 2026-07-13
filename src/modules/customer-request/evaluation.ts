import { canonicalDigest } from '@/modules/common/canonical-digest'

import type { CapabilityContract } from './public'

type LiteralValue = string | number | boolean

export type RequestFactSource = Readonly<
  | { kind: 'customer'; assertionRef: string }
  | { kind: 'agent_inference'; inferenceRef: string }
>

export type RequestFact = Readonly<{
  value: LiteralValue
  source: RequestFactSource
}>

export type RequestEvaluationCandidateInput = Readonly<{
  businessId: string
  bindingId: string
  contract: CapabilityContract
}>

export type RegisteredEvaluationBinding = Readonly<{
  businessId: string
  bindingId: string
  capabilityContractId: string
  queryTerms: readonly string[]
  registrationHash: string
}>

export type RequestEvaluationCandidate = Readonly<{
  candidateRef: string
  businessId: string
  bindingId: string
  capabilityContractId: string
  viability:
    | Readonly<{ kind: 'viable' }>
    | Readonly<{ kind: 'blocked_on_information'; fields: readonly string[] }>
}>

export type ContractFactInformationRequirement = Readonly<{
  kind: 'contract_fact'
  field: string
  customerLabel: string
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
  field: string
  label: string
  value: LiteralValue
  basis: 'customer_provided' | 'extracted_from_request'
  criterionDigest: string
}>
export type PreparationDisclosurePreview = Readonly<{
  purposeLabel: string
  maximumRecipients: number
  categories: readonly Readonly<{
    field: string
    label: string
    classification: 'personal' | 'sensitive' | 'credential'
  }>[]
}>

export type RequestEvaluation = Readonly<{
  requestId: string
  requestRevision: number
  registrySnapshotDigest: string
  factsDigest: string
  facts: Readonly<Record<string, RequestFact>>
  criteria: readonly UnderstoodCriterion[]
  preparationDisclosure?: PreparationDisclosurePreview
  candidates: readonly RequestEvaluationCandidate[]
  nextRequirement?: InformationRequirement
  posture: 'progress_available' | 'needs_information' | 'unsupported'
  evaluationDigest: string
}>

export function evaluateCustomerRequestSnapshot(input: Readonly<{
  requestId: string
  requestRevision: number
  intent: string
  facts: Readonly<Record<string, RequestFact>>
  registrySnapshotDigest: string
  candidates: readonly RequestEvaluationCandidateInput[]
}>): RequestEvaluation {
  const candidates = input.candidates.map((candidate): RequestEvaluationCandidate => {
    const missingFields = Object.entries(candidate.contract.input)
      .filter(([field, definition]) => definition.required && input.facts[field] === undefined)
      .map(([field]) => field)
      .sort()
    const candidateRef = `candidate:${candidate.bindingId}`
    return Object.freeze({
      candidateRef,
      businessId: candidate.businessId,
      bindingId: candidate.bindingId,
      capabilityContractId: candidate.contract.capabilityContractId,
      viability: missingFields.length === 0
        ? Object.freeze({ kind: 'viable' as const })
        : Object.freeze({ kind: 'blocked_on_information' as const, fields: Object.freeze(missingFields) }),
    })
  })
  const nextRequirement = chooseNextRequirement(input.candidates, candidates)
  const criteria = projectUnderstoodCriteria(input.facts, input.candidates)
  const preparationDisclosure = projectPreparationDisclosure(input.facts, input.candidates)
  const posture = candidates.length === 0
    ? 'unsupported' as const
    : nextRequirement === undefined ? 'progress_available' as const : 'needs_information' as const
  const factsDigest = canonicalDigest(input.facts)
  const digestMaterial = {
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    intent: input.intent,
    registrySnapshotDigest: input.registrySnapshotDigest,
    factsDigest,
    facts: input.facts,
    criteria,
    ...(preparationDisclosure === undefined ? {} : { preparationDisclosure }),
    candidates,
    ...(nextRequirement === undefined ? {} : { nextRequirement }),
    posture,
  }
  return Object.freeze({
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    registrySnapshotDigest: input.registrySnapshotDigest,
    factsDigest,
    facts: input.facts,
    criteria,
    ...(preparationDisclosure === undefined ? {} : { preparationDisclosure }),
    candidates: Object.freeze(candidates),
    ...(nextRequirement === undefined ? {} : { nextRequirement }),
    posture,
    evaluationDigest: canonicalDigest(digestMaterial),
  })
}

function projectPreparationDisclosure(
  facts: Readonly<Record<string, RequestFact>>,
  candidates: readonly RequestEvaluationCandidateInput[],
): PreparationDisclosurePreview | undefined {
  const purposes = [...new Set(candidates.flatMap((candidate) => candidate.contract.preparation === undefined
    ? [] : [candidate.contract.preparation.customerLabel]))]
  if (purposes.length !== 1 || purposes[0] === undefined) return undefined
  const categories = new Map<string, { label: string; classification: 'personal' | 'sensitive' | 'credential' }>()
  for (const candidate of candidates) {
    for (const [field, definition] of Object.entries(candidate.contract.input)) {
      const disclosure = definition.disclosure
      if (facts[field] === undefined || disclosure?.phase !== 'preparation' || disclosure.classification === 'public') continue
      const existing = categories.get(field)
      if (existing !== undefined && (existing.label !== definition.customerLabel || existing.classification !== disclosure.classification)) {
        return undefined
      }
      categories.set(field, { label: definition.customerLabel, classification: disclosure.classification })
    }
  }
  if (categories.size === 0) return undefined
  return Object.freeze({
    purposeLabel: purposes[0],
    maximumRecipients: new Set(candidates.map((candidate) => candidate.businessId)).size,
    categories: Object.freeze([...categories.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([field, category]) => Object.freeze({ field, ...category }))),
  })
}

export function evaluateIntentDirectionRequestSnapshot(input: Readonly<{
  requestId: string
  requestRevision: number
  intent: string
  facts: Readonly<Record<string, RequestFact>>
  registrySnapshotDigest: string
  prompt: string
}>): RequestEvaluation {
  const factsDigest = canonicalDigest(input.facts)
  const nextRequirement: IntentDirectionInformationRequirement = Object.freeze({
    kind: 'intent_direction',
    prompt: input.prompt,
    requirementDigest: canonicalDigest({
      requestId: input.requestId, requestRevision: input.requestRevision,
      intent: input.intent, registrySnapshotDigest: input.registrySnapshotDigest,
      kind: 'intent_direction', prompt: input.prompt,
    }),
  })
  const digestMaterial = {
    requestId: input.requestId, requestRevision: input.requestRevision, intent: input.intent,
    registrySnapshotDigest: input.registrySnapshotDigest, factsDigest, facts: input.facts,
    candidates: [], criteria: [], nextRequirement, posture: 'needs_information' as const,
  }
  return Object.freeze({
    requestId: input.requestId, requestRevision: input.requestRevision,
    registrySnapshotDigest: input.registrySnapshotDigest, factsDigest, facts: input.facts,
    candidates: Object.freeze([]), criteria: Object.freeze([]), nextRequirement, posture: 'needs_information' as const,
    evaluationDigest: canonicalDigest(digestMaterial),
  })
}

function projectUnderstoodCriteria(
  facts: Readonly<Record<string, RequestFact>>,
  candidates: readonly RequestEvaluationCandidateInput[],
): readonly UnderstoodCriterion[] {
  return Object.freeze(Object.entries(facts).sort(([left], [right]) => left.localeCompare(right)).flatMap(([field, fact]) => {
    const labels = [...new Set(candidates.flatMap((candidate) => {
      const definition = candidate.contract.input[field]
      return definition === undefined ? [] : [definition.customerLabel]
    }))]
    const label = labels.length === 1 ? labels[0] : undefined
    if (label === undefined) return []
    const basis = fact.source.kind === 'customer' ? 'customer_provided' as const : 'extracted_from_request' as const
    return [Object.freeze({
      field, label, value: fact.value, basis,
      criterionDigest: canonicalDigest({ field, label, value: fact.value, basis }),
    })]
  }))
}

export function discoverRequestEvaluationCandidates(input: Readonly<{
  candidateCapabilityContractIds: readonly string[]
  bindings: readonly RegisteredEvaluationBinding[]
  resolveContract: (capabilityContractId: string) => CapabilityContract | undefined
}>): readonly RequestEvaluationCandidateInput[] {
  const admittedCapabilityContractIds = new Set(input.candidateCapabilityContractIds)
  return Object.freeze(input.bindings
    .filter((binding) => admittedCapabilityContractIds.has(binding.capabilityContractId))
    .map((binding) => {
      const contract = input.resolveContract(binding.capabilityContractId)
      return contract === undefined ? undefined : Object.freeze({
        businessId: binding.businessId,
        bindingId: binding.bindingId,
        contract,
      })
    })
    .filter((candidate): candidate is RequestEvaluationCandidateInput => candidate !== undefined)
    .sort((left, right) => left.bindingId.localeCompare(right.bindingId)))
}

export function requestRegistrySnapshotDigest(bindings: readonly RegisteredEvaluationBinding[]): string {
  return canonicalDigest([...bindings].map((binding) => ({
    businessId: binding.businessId,
    bindingId: binding.bindingId,
    capabilityContractId: binding.capabilityContractId,
    registrationHash: binding.registrationHash,
  })).sort((left, right) => left.bindingId.localeCompare(right.bindingId)))
}

function chooseNextRequirement(
  inputs: readonly RequestEvaluationCandidateInput[],
  candidates: readonly RequestEvaluationCandidate[],
): InformationRequirement | undefined {
  const labels = new Map<string, string>()
  const affected = new Map<string, string[]>()
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    const candidateInput = inputs[index]
    if (candidate === undefined || candidateInput === undefined) throw new Error('request_evaluation_candidate_alignment_invalid')
    if (candidate.viability.kind !== 'blocked_on_information') continue
    for (const field of candidate.viability.fields) {
      labels.set(field, candidateInput.contract.input[field]?.customerLabel ?? field)
      affected.set(field, [...(affected.get(field) ?? []), candidate.candidateRef])
    }
  }
  const ranked = [...affected.entries()].map(([field, candidateRefs]) => {
    const probesEnabled = candidates
      .filter((candidate) => candidate.viability.kind === 'blocked_on_information'
        && candidate.viability.fields.length === 1
        && candidate.viability.fields[0] === field)
      .map((candidate) => candidate.candidateRef)
    return { field, candidateRefs: [...candidateRefs].sort(), probesEnabled: probesEnabled.sort() }
  }).sort((left, right) => right.probesEnabled.length - left.probesEnabled.length
    || right.candidateRefs.length - left.candidateRefs.length
    || left.field.localeCompare(right.field))
  const selected = ranked[0]
  if (selected === undefined) return undefined
  const impact = Object.freeze({
    affectedCandidates: Object.freeze(selected.candidateRefs),
    probesEnabled: Object.freeze(selected.probesEnabled),
  })
  return Object.freeze({
    kind: 'contract_fact' as const,
    field: selected.field,
    customerLabel: labels.get(selected.field) ?? selected.field,
    impact,
    requirementDigest: canonicalDigest({ field: selected.field, impact }),
  })
}
