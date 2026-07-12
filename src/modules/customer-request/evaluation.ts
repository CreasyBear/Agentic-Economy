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

export type RequestEvaluationCandidate = Readonly<{
  candidateRef: string
  businessId: string
  bindingId: string
  capabilityContractId: string
  viability:
    | Readonly<{ kind: 'viable' }>
    | Readonly<{ kind: 'blocked_on_information'; fields: readonly string[] }>
}>

export type InformationRequirement = Readonly<{
  field: string
  customerLabel: string
  impact: Readonly<{
    affectedCandidates: readonly string[]
    probesEnabled: readonly string[]
  }>
  requirementDigest: string
}>

export type RequestEvaluation = Readonly<{
  requestId: string
  requestRevision: number
  registrySnapshotDigest: string
  factsDigest: string
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
    candidates,
    ...(nextRequirement === undefined ? {} : { nextRequirement }),
    posture,
  }
  return Object.freeze({
    requestId: input.requestId,
    requestRevision: input.requestRevision,
    registrySnapshotDigest: input.registrySnapshotDigest,
    factsDigest,
    candidates: Object.freeze(candidates),
    ...(nextRequirement === undefined ? {} : { nextRequirement }),
    posture,
    evaluationDigest: canonicalDigest(digestMaterial),
  })
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
    field: selected.field,
    customerLabel: labels.get(selected.field) ?? selected.field,
    impact,
    requirementDigest: canonicalDigest({ field: selected.field, impact }),
  })
}
