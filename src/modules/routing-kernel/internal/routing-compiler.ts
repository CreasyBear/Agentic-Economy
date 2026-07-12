import type {
  BindingQuote,
  BindingQuoteRefusal,
  CandidateGraphQuote,
  CandidateGraphStepQuote,
  CapabilityBinding,
  KernelCaller,
} from './model'
import { canonicalAuthorityDigest } from './authority-digest'

export const ROUTING_COMPILER_VERSION = 'routing-compiler:v2' as const
export const ORGANIC_OPTIMIZER_VERSION = 'organic-cost-latency-evidence:v2' as const
export const NETWORK_POLICY_VERSION = 'network-policy:binding-evidence:v2' as const
export const ROUTING_EVIDENCE_CONTRACT_VERSION = 'routing-evidence:v1' as const
export const STANDING_ESTIMATOR_VERSION = 'execution-reliability-lcb:v1' as const

export type EvidenceStanding = 'eligible_observed' | 'eligible_run_bound' | 'eligible_corroborated'
  | 'visible_unbound' | 'ineligible_domain' | 'ineligible_scope' | 'held' | 'retracted_or_removed'
export type BindingHealthState = 'healthy' | 'degraded' | 'unavailable' | 'frozen' | 'unknown'
export type IncidentRoutingEffect = 'none' | 'deprioritize' | 'exclude_new_routes' | 'freeze'
export type BindingRoutingEvidenceSnapshot = Readonly<{
  contractVersion: typeof ROUTING_EVIDENCE_CONTRACT_VERSION
  snapshotDigest: string
  networkId: string
  bindingId: string
  bindingRegistrationHash: string
  environment: string
  networkPolicyVersion: typeof NETWORK_POLICY_VERSION
  estimatorVersion: typeof STANDING_ESTIMATOR_VERSION
  sourceCommitment: string
  observedAt: number
  expiresAt: number
  health: Readonly<{ state: BindingHealthState; evidenceStanding: EvidenceStanding }>
  incident: Readonly<{ routingEffect: IncidentRoutingEffect; activeIncidentIds: readonly string[]; evidenceStanding: EvidenceStanding }>
  standing: Readonly<{
    evidenceStanding: EvidenceStanding
    executionReliability: Readonly<{
      status: 'sufficient' | 'insufficient_evidence'
      sampleSize: number
      lowerConfidenceBoundPermille?: number
    }>
  }>
}>

type BindingEvidenceInput = Omit<BindingRoutingEvidenceSnapshot, 'snapshotDigest'>

export function createBindingRoutingEvidenceSnapshot(input: BindingEvidenceInput): BindingRoutingEvidenceSnapshot {
  const normalized = {
    ...input,
    incident: { ...input.incident, activeIncidentIds: [...new Set(input.incident.activeIncidentIds)].sort() },
  }
  return Object.freeze({ ...normalized, snapshotDigest: canonicalAuthorityDigest(normalized) })
}

export type RoutingPriority = 'cost' | 'latency'

export type RoutingSnapshot = Readonly<{
  compilerVersion: typeof ROUTING_COMPILER_VERSION
  optimizerVersion: typeof ORGANIC_OPTIMIZER_VERSION
  networkPolicyVersion: typeof NETWORK_POLICY_VERSION
  networkId: string
  caller: KernelCaller
  normalizedQuery: string
  constraints: Readonly<{ currency: string; maximumSpendMinor: number; optimizeFor: RoutingPriority }>
  eligibleBindingIds: readonly string[]
  relevantBindingIds: readonly string[]
  bindingEvidence: readonly BindingEvidenceFactor[]
}>

export type BindingEvidenceFactor = Readonly<{
  bindingId: string
  disposition: 'current' | 'missing' | 'legacy_unbound' | 'expired' | 'version_mismatch' | 'ineligible_evidence'
  snapshotDigest?: string
  healthState: BindingHealthState
  healthEvidenceStanding?: EvidenceStanding
  incidentRoutingEffect: IncidentRoutingEffect
  incidentEvidenceStanding?: EvidenceStanding
  activeIncidentIds?: readonly string[]
  executionReliabilityStatus: 'sufficient' | 'insufficient_evidence'
  standingEvidenceStanding?: EvidenceStanding
  executionReliabilityLowerBoundPermille?: number
}>

export type OrganicDecisionFactor = Readonly<{
  bindingId: string
  feasible: boolean
  expectedCostMinor?: number
  maximumCostMinor?: number
  expectedLatencyMs?: number
  evidence: BindingEvidenceFactor
  refusalReason?: 'quote_refused' | 'currency_mismatch' | 'maximum_spend_exceeded' | 'health_unavailable' | 'incident_excluded'
}>

export type OrganicRouteDecision = Readonly<{
  optimizerVersion: typeof ORGANIC_OPTIMIZER_VERSION
  optimizeFor: RoutingPriority
  selectedBindingId?: string
  factors: readonly OrganicDecisionFactor[]
}>

type CompileInput = Readonly<{
  networkId: string
  caller: KernelCaller
  query: string
  constraints: Readonly<{ currency: string; maximumSpendMinor: number; optimizeFor?: RoutingPriority }>
  bindings: readonly CapabilityBinding[]
  quotes: readonly Readonly<{ bindingId: string; quote: BindingQuote | BindingQuoteRefusal }>[]
  evidenceSnapshots?: readonly BindingRoutingEvidenceSnapshot[]
  now?: number
}>

export type CompiledRoutingSnapshot = Readonly<{
  snapshot: RoutingSnapshot
  decision: OrganicRouteDecision
  graphs: readonly CandidateGraphQuote[]
  selectedGraph?: CandidateGraphQuote
}>

export function compileRoutingSnapshot(input: CompileInput): CompiledRoutingSnapshot {
  const compiledAt = input.now ?? 0
  const normalizedQuery = normalizeQuery(input.query)
  const optimizeFor = input.constraints.optimizeFor ?? 'cost'
  const eligible = input.bindings.filter((binding) => binding.networkId === input.networkId
    && binding.admission === 'admitted' && binding.conformance === 'conformant')
  const relevant = eligible.filter((binding) => binding.queryTerms.every((term) => normalizedQuery.includes(normalizeQuery(term))))
  const relevantIds = new Set(relevant.map((binding) => binding.bindingId))
  const bindingById = new Map(relevant.map((binding) => [binding.bindingId, binding]))
  const evidenceByBinding = new Map(relevant.map((binding) => [binding.bindingId, resolveBindingEvidence(binding, input)]))
  const factors: OrganicDecisionFactor[] = []
  const steps: CandidateGraphStepQuote[] = []

  for (const evidence of [...evidenceByBinding.values()].sort((left, right) => left.bindingId.localeCompare(right.bindingId))) {
    if (evidence.healthState === 'frozen' || evidence.healthState === 'unavailable') {
      factors.push(Object.freeze({ bindingId: evidence.bindingId, feasible: false, evidence, refusalReason: 'health_unavailable' }))
    } else if (evidence.incidentRoutingEffect === 'freeze' || evidence.incidentRoutingEffect === 'exclude_new_routes') {
      factors.push(Object.freeze({ bindingId: evidence.bindingId, feasible: false, evidence, refusalReason: 'incident_excluded' }))
    }
  }

  for (const candidate of input.quotes.filter((item) => relevantIds.has(item.bindingId)).sort((a, b) => a.bindingId.localeCompare(b.bindingId))) {
    const quote = candidate.quote
    const evidence = evidenceByBinding.get(candidate.bindingId)
    if (evidence === undefined) continue
    if (evidence.healthState === 'frozen' || evidence.healthState === 'unavailable'
      || evidence.incidentRoutingEffect === 'freeze' || evidence.incidentRoutingEffect === 'exclude_new_routes') continue
    if (quote.kind === 'refused') {
      factors.push(Object.freeze({ bindingId: candidate.bindingId, feasible: false, evidence, refusalReason: 'quote_refused' }))
      continue
    }
    const facts = {
      bindingId: candidate.bindingId,
      expectedCostMinor: quote.expectedCost.amountMinor,
      maximumCostMinor: quote.maximumCost.amountMinor,
      expectedLatencyMs: quote.expectedLatencyMs,
    }
    if (quote.maximumCost.currency !== input.constraints.currency || quote.expectedCost.currency !== input.constraints.currency) {
      factors.push(Object.freeze({ ...facts, feasible: false, evidence, refusalReason: 'currency_mismatch' }))
      continue
    }
    if (quote.maximumCost.amountMinor > input.constraints.maximumSpendMinor) {
      factors.push(Object.freeze({ ...facts, feasible: false, evidence, refusalReason: 'maximum_spend_exceeded' }))
      continue
    }
    if ((quote.providerQuoteRef === undefined) !== (quote.providerQuoteExpiresAt === undefined)
      || (quote.providerQuoteExpiresAt !== undefined && quote.providerQuoteExpiresAt <= compiledAt)) {
      factors.push(Object.freeze({ ...facts, feasible: false, evidence, refusalReason: 'quote_refused' }))
      continue
    }
    const binding = bindingById.get(candidate.bindingId)
    if (binding === undefined) continue
    factors.push(Object.freeze({ ...facts, feasible: true, evidence }))
    steps.push(Object.freeze({
      role: 'primary' as const, bindingId: binding.bindingId, nodeId: binding.nodeId,
      capabilityContractId: binding.capabilityContractId, expectedCost: Object.freeze({ ...quote.expectedCost }),
      maximumCost: Object.freeze({ ...quote.maximumCost }), expectedLatencyMs: quote.expectedLatencyMs,
      ...(quote.providerQuoteRef === undefined ? {} : { providerQuoteRef: quote.providerQuoteRef }),
      ...(quote.providerQuoteExpiresAt === undefined ? {} : { providerQuoteExpiresAt: quote.providerQuoteExpiresAt }),
      dataFields: Object.freeze([...quote.dataFields].sort()), disclosures: Object.freeze([...quote.disclosures]),
    }))
  }

  const rankedSteps = [...steps].sort((left, right) => compareSteps(left, right, optimizeFor, evidenceByBinding))
  const graphs = rankedSteps.map((primary) => composeGraph(primary, rankedSteps.find((candidate) => candidate.bindingId !== primary.bindingId
    && candidate.capabilityContractId === primary.capabilityContractId), input.constraints.maximumSpendMinor))
    .sort((left, right) => compareGraphs(left, right, optimizeFor, evidenceByBinding))
  const selectedGraph = graphs[0]
  const snapshot = Object.freeze({
    compilerVersion: ROUTING_COMPILER_VERSION,
    optimizerVersion: ORGANIC_OPTIMIZER_VERSION,
    networkPolicyVersion: NETWORK_POLICY_VERSION,
    networkId: input.networkId,
    caller: Object.freeze({ ...input.caller }),
    normalizedQuery,
    constraints: Object.freeze({ ...input.constraints, optimizeFor }),
    eligibleBindingIds: Object.freeze(eligible.map((binding) => binding.bindingId).sort()),
    relevantBindingIds: Object.freeze(relevant.map((binding) => binding.bindingId).sort()),
    bindingEvidence: Object.freeze([...evidenceByBinding.values()].sort((left, right) => left.bindingId.localeCompare(right.bindingId))),
  })
  const decision = Object.freeze({
    optimizerVersion: ORGANIC_OPTIMIZER_VERSION,
    optimizeFor,
    ...(selectedGraph === undefined ? {} : { selectedBindingId: selectedGraph.bindingId }),
    factors: Object.freeze(factors),
  })
  return Object.freeze({ snapshot, decision, graphs: Object.freeze(graphs), ...(selectedGraph === undefined ? {} : { selectedGraph }) })
}

function normalizeQuery(value: string) { return value.trim().toLowerCase().replace(/\s+/g, ' ') }

function compareSteps(left: CandidateGraphStepQuote, right: CandidateGraphStepQuote, priority: RoutingPriority, evidence: ReadonlyMap<string, BindingEvidenceFactor>) {
  const evidenceOrder = compareEvidence(requireBindingEvidence(evidence, left.bindingId), requireBindingEvidence(evidence, right.bindingId))
  return priority === 'latency'
    ? left.expectedLatencyMs - right.expectedLatencyMs || left.expectedCost.amountMinor - right.expectedCost.amountMinor || evidenceOrder || left.bindingId.localeCompare(right.bindingId)
    : left.expectedCost.amountMinor - right.expectedCost.amountMinor || left.expectedLatencyMs - right.expectedLatencyMs || evidenceOrder || left.bindingId.localeCompare(right.bindingId)
}

function compareGraphs(left: CandidateGraphQuote, right: CandidateGraphQuote, priority: RoutingPriority, evidence: ReadonlyMap<string, BindingEvidenceFactor>) {
  const leftPrimary = left.steps.at(0)
  const rightPrimary = right.steps.at(0)
  if (leftPrimary === undefined || rightPrimary === undefined) throw new Error('candidate_graph_primary_missing')
  const evidenceOrder = compareEvidence(requireBindingEvidence(evidence, left.bindingId), requireBindingEvidence(evidence, right.bindingId))
  return priority === 'latency'
    ? leftPrimary.expectedLatencyMs - rightPrimary.expectedLatencyMs || leftPrimary.expectedCost.amountMinor - rightPrimary.expectedCost.amountMinor || evidenceOrder || left.bindingId.localeCompare(right.bindingId)
    : leftPrimary.expectedCost.amountMinor - rightPrimary.expectedCost.amountMinor || leftPrimary.expectedLatencyMs - rightPrimary.expectedLatencyMs || evidenceOrder || left.bindingId.localeCompare(right.bindingId)
}

function requireBindingEvidence(evidence: ReadonlyMap<string, BindingEvidenceFactor>, bindingId: string): BindingEvidenceFactor {
  const factor = evidence.get(bindingId)
  if (factor === undefined) throw new Error('binding_evidence_missing')
  return factor
}

function compareEvidence(left: BindingEvidenceFactor, right: BindingEvidenceFactor) {
  const incident = incidentRank(left.incidentRoutingEffect) - incidentRank(right.incidentRoutingEffect)
  if (incident !== 0) return incident
  const health = healthRank(left.healthState) - healthRank(right.healthState)
  if (health !== 0) return health
  return (right.executionReliabilityLowerBoundPermille ?? -1) - (left.executionReliabilityLowerBoundPermille ?? -1)
}

function healthRank(value: BindingHealthState) { return value === 'healthy' ? 0 : value === 'unknown' ? 1 : value === 'degraded' ? 2 : 3 }
function incidentRank(value: IncidentRoutingEffect) { return value === 'none' ? 0 : value === 'deprioritize' ? 1 : 2 }

function resolveBindingEvidence(binding: CapabilityBinding, input: CompileInput): BindingEvidenceFactor {
  const unknown = (disposition: BindingEvidenceFactor['disposition']): BindingEvidenceFactor => Object.freeze({
    bindingId: binding.bindingId, disposition, healthState: 'unknown', incidentRoutingEffect: 'none', executionReliabilityStatus: 'insufficient_evidence',
  })
  if (binding.registrationHash === undefined || binding.environment === undefined) return unknown('legacy_unbound')
  const candidate = input.evidenceSnapshots?.find((snapshot) => snapshot.bindingId === binding.bindingId && snapshot.networkId === binding.networkId)
  if (candidate === undefined) return unknown('missing')
  if (candidate.contractVersion !== ROUTING_EVIDENCE_CONTRACT_VERSION || candidate.networkPolicyVersion !== NETWORK_POLICY_VERSION
    || candidate.estimatorVersion !== STANDING_ESTIMATOR_VERSION || candidate.bindingRegistrationHash !== binding.registrationHash
    || candidate.environment !== binding.environment) return unknown('version_mismatch')
  const { snapshotDigest: _snapshotDigest, ...digestValue } = candidate
  if (candidate.snapshotDigest !== canonicalAuthorityDigest(digestValue)) return unknown('version_mismatch')
  if ((input.now ?? candidate.observedAt) >= candidate.expiresAt) return unknown('expired')
  const eligible = new Set<EvidenceStanding>(['eligible_observed', 'eligible_run_bound', 'eligible_corroborated'])
  if (!eligible.has(candidate.health.evidenceStanding) || !eligible.has(candidate.incident.evidenceStanding)
    || !eligible.has(candidate.standing.evidenceStanding)) return unknown('ineligible_evidence')
  const reliability = candidate.standing.executionReliability
  const lowerConfidenceBoundPermille = reliability.lowerConfidenceBoundPermille
  const sufficient = reliability.status === 'sufficient' && Number.isInteger(reliability.sampleSize) && reliability.sampleSize > 0
    && lowerConfidenceBoundPermille !== undefined && Number.isInteger(lowerConfidenceBoundPermille)
    && lowerConfidenceBoundPermille >= 0 && lowerConfidenceBoundPermille <= 1_000
  return Object.freeze({
    bindingId: binding.bindingId, disposition: 'current', snapshotDigest: candidate.snapshotDigest,
    healthState: candidate.health.state, incidentRoutingEffect: candidate.incident.routingEffect,
    healthEvidenceStanding: candidate.health.evidenceStanding,
    incidentEvidenceStanding: candidate.incident.evidenceStanding,
    activeIncidentIds: Object.freeze([...candidate.incident.activeIncidentIds]),
    executionReliabilityStatus: sufficient ? 'sufficient' : 'insufficient_evidence',
    standingEvidenceStanding: candidate.standing.evidenceStanding,
    ...(sufficient ? { executionReliabilityLowerBoundPermille: lowerConfidenceBoundPermille } : {}),
  })
}

function composeGraph(primary: CandidateGraphStepQuote, fallback: CandidateGraphStepQuote | undefined, maximumSpendMinor: number): CandidateGraphQuote {
  const cumulativeMaximum = fallback === undefined || fallback.maximumCost.currency !== primary.maximumCost.currency
    ? undefined
    : safeAddMinor(primary.maximumCost.amountMinor, fallback.maximumCost.amountMinor)
  const admittedFallback = fallback !== undefined && cumulativeMaximum !== undefined && cumulativeMaximum <= maximumSpendMinor
    ? Object.freeze({ ...fallback, role: 'fallback' as const, trigger: 'on_effect_not_committed' as const })
    : undefined
  const steps = admittedFallback === undefined ? [primary] : [primary, admittedFallback]
  const maximumAmountMinor = admittedFallback === undefined || cumulativeMaximum === undefined
    ? primary.maximumCost.amountMinor
    : cumulativeMaximum
  return Object.freeze({
    bindingId: primary.bindingId, nodeId: primary.nodeId, capabilityContractId: primary.capabilityContractId,
    expectedCost: primary.expectedCost,
    maximumCost: Object.freeze({
      currency: primary.maximumCost.currency,
      amountMinor: maximumAmountMinor,
    }),
    expectedLatencyMs: steps.reduce((total, step) => total + step.expectedLatencyMs, 0),
    dataFields: Object.freeze([...new Set(steps.flatMap((step) => step.dataFields))].sort()),
    disclosures: Object.freeze([...new Set(steps.flatMap((step) => step.disclosures))]),
    steps: Object.freeze(steps),
  })
}

function safeAddMinor(left: number, right: number): number | undefined {
  if (!Number.isSafeInteger(left) || left < 0 || !Number.isSafeInteger(right) || right < 0) return undefined
  const total = left + right
  return Number.isSafeInteger(total) ? total : undefined
}
