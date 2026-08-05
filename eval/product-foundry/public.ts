const WEDGE_EXECUTION_PACK_FORMAT = 'ae.wedge-execution-pack:v1' as const

export type EvidenceMaturity = 'simulated' | 'field' | 'production'
export type WedgeRole =
  | 'commercial_candidate'
  | 'transfer_test'
  | 'falsification_test'
  | 'negative_control'

export type EvidenceReference = Readonly<{
  evidenceId: string
  kind:
    | 'simulation'
    | 'field_observation'
    | 'baseline_measurement'
    | 'assisted_measurement'
    | 'preregistration'
    | 'replay_input'
    | 'replay_expected'
    | 'replay_actual'
    | 'replay_assertions'
    | 'conformance_report'
    | 'compatibility_report'
    | 'threat_review'
    | 'adr'
  uri: string
  collectedAt: string
  owner: string
  verifiedBy: string
  permittedUseBasis: string
}>

export type WorkflowObservation = Readonly<{
  caseId: string
  evidenceKind: 'simulated' | 'field_observed' | 'production_observed'
  objective: string
  completionBoundary: string
  actors: readonly string[]
  activeCoordinatorMinutes: number
  providerManualTouches: number
  operatorManualTouches: number
  repeatedFactEntries: number
  parallelTrackerUsed: boolean
  unresolvedUncertaintyCount: number
  evidenceRef: EvidenceReference
}>

export type PrimitiveCoverageClassification =
  | 'existing_primitive'
  | 'wedge_contract'
  | 'provider_adapter'
  | 'reusable_module'
  | 'kernel_candidate'
  | 'human_operation'
  | 'unsupported'

export type PrimitiveCoverageTransition = Readonly<{
  transitionId: string
  description: string
  classification: PrimitiveCoverageClassification
  mechanismRef: string
}>

export type WedgeReplayTrace = Readonly<{
  traceId: string
  kind: 'success' | 'failure' | 'cancelled' | 'uncertain'
  events: readonly string[]
  runnerVersion: string
  inputRef: EvidenceReference
  expectedOutputRef: EvidenceReference
  actualOutputRef: EvidenceReference
  assertionsRef: EvidenceReference
  result: 'passed' | 'failed'
}>

export type CanonicalRequestCase = Readonly<{
  requestId: string
  facts: Readonly<Record<string, string | number | boolean>>
  expectedUnknowns: readonly string[]
}>

export type WedgeProviderProfile = Readonly<{
  providerId: string
  capabilityContractRefs: readonly string[]
  bindingRefs: readonly string[]
  integrationKind: 'simulator' | 'hosted' | 'external'
}>

export type CustomerConformance = Readonly<{
  decisionPackage: EvidenceAssertion
  contractDeclaredCommitment: EvidenceAssertion
  progressOwnership: EvidenceAssertion
  recoveryPath: EvidenceAssertion
  completionEvidenceOrHonestUnknown: EvidenceAssertion
}>

export type ProviderConformance = Readonly<{
  acceptsStructuredRequest: EvidenceAssertion
  returnsContractEvidence: EvidenceAssertion
  repeatedRekeyingMeasured: EvidenceAssertion
  cancellationOrUncertainOutcomeHandled: EvidenceAssertion
}>

export type EvidenceAssertion = Readonly<{
  passed: boolean
  evidenceRefs: readonly EvidenceReference[]
}>

export type MeasuredComparison = Readonly<{
  unit: string
  direction: 'lower_is_better' | 'higher_is_better'
  baseline: number
  assisted: number
  requiredImprovementRatio: number
  baselineEvidenceRefs: readonly EvidenceReference[]
  assistedEvidenceRefs: readonly EvidenceReference[]
}>

export type ProductFoundryScorecard = Readonly<{
  preregistrationRef: EvidenceReference
  customerBurden: MeasuredComparison
  correctness: MeasuredComparison
  elapsedTime: MeasuredComparison
  totalCost: MeasuredComparison
  privacyAndControl: MeasuredComparison
  providerBurden: MeasuredComparison
  operatorBurden: MeasuredComparison
}>

export type AgentConformance = Readonly<{
  coldDiscovery: EvidenceAssertion
  createAndResume: EvidenceAssertion
  missingFacts: EvidenceAssertion
  staleRevision: EvidenceAssertion
  duplicateCall: EvidenceAssertion
  changedSupply: EvidenceAssertion
  uncertainEffect: EvidenceAssertion
  cancellation: EvidenceAssertion
  recovery: EvidenceAssertion
  evidenceInspection: EvidenceAssertion
}>

export type WedgeExecutionPack = Readonly<{
  format: typeof WEDGE_EXECUTION_PACK_FORMAT
  wedgeId: string
  workflowFamily: string
  role: WedgeRole
  evidenceMaturity: EvidenceMaturity
  observations: readonly WorkflowObservation[]
  canonicalRequests: readonly CanonicalRequestCase[]
  capabilityContractRefs: readonly string[]
  offeringRefs: readonly string[]
  bindingRefs: readonly string[]
  selectionPolicyRefs: readonly string[]
  authorityPolicyRefs: readonly string[]
  dataUsePolicyRefs: readonly string[]
  externalEffectPolicyRefs: readonly string[]
  recoveryExpectationRefs: readonly string[]
  providerProfiles: readonly WedgeProviderProfile[]
  expectedDecisionProjectionRefs: readonly string[]
  transitions: readonly PrimitiveCoverageTransition[]
  traces: readonly WedgeReplayTrace[]
  scorecard: ProductFoundryScorecard
  customerConformance: CustomerConformance
  agentConformance: AgentConformance
  providerConformance: ProviderConformance
  kernelEditsRequired: readonly string[]
  kernelPromotionCandidates: readonly PrimitivePromotionCandidate[]
  bespokeOrchestrationBranches: number
  parallelLifecycleCount: number
  negativeControlDecision?: Readonly<{
    decision: 'direct_provider_path' | 'orchestrate'
    evidenceRefs: readonly EvidenceReference[]
  }>
}>

export type WedgePackGap =
  | 'field_observations_required'
  | 'five_observed_cases_required'
  | 'primitive_coverage_required'
  | 'canonical_request_cases_required'
  | 'contract_and_binding_refs_required'
  | 'policy_refs_required'
  | 'provider_profiles_required'
  | 'decision_projection_required'
  | 'complete_replay_trace_set_required'
  | 'trace_events_required'
  | 'replay_assertions_required'
  | 'preregistered_customer_threshold_required'
  | 'customer_value_gate_failed'
  | 'provider_value_gate_failed'
  | 'operational_leverage_gate_failed'
  | 'customer_conformance_gate_failed'
  | 'agent_conformance_gate_failed'
  | 'provider_conformance_gate_failed'

export type WedgeExecutionPackEvaluation = Readonly<{
  structurallyReplayable: boolean
  fieldEvidenceReady: boolean
  evaluationComplete: boolean
  productProofReady: boolean
  agentOperable: boolean
  gaps: readonly WedgePackGap[]
}>

const REQUIRED_TRACE_KINDS: readonly WedgeReplayTrace['kind'][] = [
  'success',
  'failure',
  'cancelled',
  'uncertain',
]

export function evaluateWedgeExecutionPack(
  pack: WedgeExecutionPack,
): WedgeExecutionPackEvaluation {
  const gaps: WedgePackGap[] = []
  const fieldObservations = pack.observations.filter((observation) =>
    (observation.evidenceKind === 'field_observed'
      || observation.evidenceKind === 'production_observed')
    && observation.evidenceRef.kind === 'field_observation'
    && validEvidenceReference(observation.evidenceRef)
  )
  const distinctCaseIds = new Set(fieldObservations.map((observation) => observation.caseId))
  const distinctObservationEvidence = new Set(
    fieldObservations.map((observation) => observation.evidenceRef.evidenceId),
  )
  const fieldEvidenceReady = pack.evidenceMaturity !== 'simulated'
    && fieldObservations.length === pack.observations.length
    && distinctCaseIds.size >= 5
    && distinctObservationEvidence.size >= 5

  if (pack.evidenceMaturity === 'simulated' || fieldObservations.length !== pack.observations.length) {
    gaps.push('field_observations_required')
  }
  if (distinctCaseIds.size < 5 || distinctObservationEvidence.size < 5) {
    gaps.push('five_observed_cases_required')
  }
  if (pack.transitions.length === 0) gaps.push('primitive_coverage_required')
  if (pack.canonicalRequests.length === 0) gaps.push('canonical_request_cases_required')
  if (pack.capabilityContractRefs.length === 0
    || pack.offeringRefs.length === 0
    || pack.bindingRefs.length === 0) {
    gaps.push('contract_and_binding_refs_required')
  }
  if (pack.selectionPolicyRefs.length === 0
    || pack.authorityPolicyRefs.length === 0
    || pack.dataUsePolicyRefs.length === 0
    || pack.externalEffectPolicyRefs.length === 0
    || pack.recoveryExpectationRefs.length === 0) {
    gaps.push('policy_refs_required')
  }
  if (pack.providerProfiles.length === 0) gaps.push('provider_profiles_required')
  if (pack.expectedDecisionProjectionRefs.length === 0) gaps.push('decision_projection_required')

  const traceKinds = new Set(pack.traces.map((trace) => trace.kind))
  const completeTraceSet = REQUIRED_TRACE_KINDS.every((kind) => traceKinds.has(kind))
  if (!completeTraceSet) gaps.push('complete_replay_trace_set_required')
  const traceEventsPresent = pack.traces.every((trace) => trace.events.length > 0)
  if (!traceEventsPresent) gaps.push('trace_events_required')

  const replayEvidenceComplete = pack.traces.length > 0
    && pack.traces.every((trace) =>
      trace.events.length > 0
      && trace.runnerVersion.length > 0
      && trace.inputRef.kind === 'replay_input'
      && validEvidenceReference(trace.inputRef)
      && trace.expectedOutputRef.kind === 'replay_expected'
      && validEvidenceReference(trace.expectedOutputRef)
      && trace.actualOutputRef.kind === 'replay_actual'
      && validEvidenceReference(trace.actualOutputRef)
      && trace.assertionsRef.kind === 'replay_assertions'
      && validEvidenceReference(trace.assertionsRef)
    )
  const replayAssertionsPassed = replayEvidenceComplete
    && pack.traces.every((trace) => trace.result === 'passed')
  if (!replayAssertionsPassed) gaps.push('replay_assertions_required')

  const structureEvidenceComplete = pack.transitions.length > 0
    && pack.canonicalRequests.length > 0
    && pack.capabilityContractRefs.length > 0
    && pack.offeringRefs.length > 0
    && pack.bindingRefs.length > 0
    && pack.selectionPolicyRefs.length > 0
    && pack.authorityPolicyRefs.length > 0
    && pack.dataUsePolicyRefs.length > 0
    && pack.externalEffectPolicyRefs.length > 0
    && pack.recoveryExpectationRefs.length > 0
    && pack.providerProfiles.length > 0
    && pack.expectedDecisionProjectionRefs.length > 0
    && completeTraceSet
    && replayEvidenceComplete
  const structurallyReplayable = structureEvidenceComplete && replayAssertionsPassed

  const preregistered = pack.scorecard.preregistrationRef.kind === 'preregistration'
    && validEvidenceReference(pack.scorecard.preregistrationRef)
    && preregistrationOrdered(pack.scorecard)
  if (!preregistered) {
    gaps.push('preregistered_customer_threshold_required')
  }
  const customerValuePassed = measuredComparisonPassed(pack.scorecard.customerBurden)
    && measuredComparisonPassed(pack.scorecard.correctness)
    && measuredComparisonPassed(pack.scorecard.elapsedTime)
    && measuredComparisonPassed(pack.scorecard.totalCost)
    && measuredComparisonPassed(pack.scorecard.privacyAndControl)
  if (!customerValuePassed) gaps.push('customer_value_gate_failed')
  const providerValuePassed = measuredComparisonPassed(pack.scorecard.providerBurden)
  if (!providerValuePassed) gaps.push('provider_value_gate_failed')
  const operationalLeveragePassed = measuredComparisonPassed(pack.scorecard.operatorBurden)
  if (!operationalLeveragePassed) gaps.push('operational_leverage_gate_failed')

  const customerConformant = Object.values(pack.customerConformance).every(assertionPassed)
  if (!customerConformant) gaps.push('customer_conformance_gate_failed')
  const agentOperable = Object.values(pack.agentConformance).every(assertionPassed)
  if (!agentOperable) gaps.push('agent_conformance_gate_failed')
  const providerConformant = Object.values(pack.providerConformance).every(assertionPassed)
  if (!providerConformant) gaps.push('provider_conformance_gate_failed')
  const conformanceEvidenceComplete = Object.values(pack.customerConformance).every(assertionComplete)
    && Object.values(pack.agentConformance).every(assertionComplete)
    && Object.values(pack.providerConformance).every(assertionComplete)
  const measurementEvidenceComplete = Object.values(pack.scorecard)
    .filter((value): value is MeasuredComparison => 'baselineEvidenceRefs' in value)
    .every(measuredComparisonComplete)
  const evaluationComplete = fieldEvidenceReady
    && structureEvidenceComplete
    && preregistered
    && measurementEvidenceComplete
    && conformanceEvidenceComplete

  return Object.freeze({
    structurallyReplayable,
    fieldEvidenceReady,
    evaluationComplete,
    productProofReady: fieldEvidenceReady
      && structurallyReplayable
      && preregistered
      && customerValuePassed
      && providerValuePassed
      && operationalLeveragePassed
      && customerConformant
      && agentOperable
      && providerConformant,
    agentOperable,
    gaps: Object.freeze(gaps),
  })
}

function validEvidenceReference(reference: EvidenceReference): boolean {
  const collectedAt = Date.parse(reference.collectedAt)
  return reference.evidenceId.length > 0
    && reference.uri.length > 0
    && Number.isFinite(collectedAt)
    && reference.owner.length > 0
    && reference.verifiedBy.length > 0
    && reference.verifiedBy !== reference.owner
    && reference.permittedUseBasis.length > 0
}

function preregistrationOrdered(scorecard: ProductFoundryScorecard): boolean {
  const preregisteredAt = Date.parse(scorecard.preregistrationRef.collectedAt)
  const baselineTimes = scorecard.customerBurden.baselineEvidenceRefs
    .map((reference) => Date.parse(reference.collectedAt))
  const assistedTimes = scorecard.customerBurden.assistedEvidenceRefs
    .map((reference) => Date.parse(reference.collectedAt))
  return baselineTimes.length > 0
    && assistedTimes.length > 0
    && baselineTimes.every((time) => Number.isFinite(time) && time <= preregisteredAt)
    && assistedTimes.every((time) => Number.isFinite(time) && time > preregisteredAt)
}

function assertionPassed(assertion: EvidenceAssertion): boolean {
  return assertion.passed && assertionComplete(assertion)
}

function assertionComplete(assertion: EvidenceAssertion): boolean {
  return assertion.evidenceRefs.length > 0
    && assertion.evidenceRefs.every(validEvidenceReference)
}

function measuredComparisonPassed(comparison: MeasuredComparison): boolean {
  if (!measuredComparisonComplete(comparison)) return false
  const magnitude = Math.abs(comparison.baseline)
  if (magnitude === 0) {
    return comparison.requiredImprovementRatio === 0
      && (comparison.direction === 'lower_is_better'
        ? comparison.assisted <= comparison.baseline
        : comparison.assisted >= comparison.baseline)
  }
  const improvement = comparison.direction === 'lower_is_better'
    ? (comparison.baseline - comparison.assisted) / magnitude
    : (comparison.assisted - comparison.baseline) / magnitude
  return improvement >= comparison.requiredImprovementRatio
}

function measuredComparisonComplete(comparison: MeasuredComparison): boolean {
  return Number.isFinite(comparison.baseline)
    && Number.isFinite(comparison.assisted)
    && comparison.requiredImprovementRatio >= 0
    && comparison.requiredImprovementRatio <= 1
    && comparison.baselineEvidenceRefs.length > 0
    && comparison.assistedEvidenceRefs.length > 0
    && comparison.baselineEvidenceRefs.every((reference) =>
      reference.kind === 'baseline_measurement' && validEvidenceReference(reference)
    )
    && comparison.assistedEvidenceRefs.every((reference) =>
      reference.kind === 'assisted_measurement' && validEvidenceReference(reference)
    )
}

export type PrimitivePromotionCandidate = Readonly<{
  candidateId: string
  neutralName: string
  observedWorkflows: readonly Readonly<{
    workflowFamily: string
    evidenceRefs: readonly EvidenceReference[]
  }>[]
  stableInterfaceAcrossFamilies: EvidenceAssertion
  compositionFailureDemonstrated: EvidenceAssertion
  platformInvariantProtected: EvidenceAssertion
  negativeControlUnaffected: EvidenceAssertion
  humanAgentParity: EvidenceAssertion
  replayRegressionPassed: EvidenceAssertion
  backwardsCompatibilityPassed: EvidenceAssertion
  threatReviewPassed: EvidenceAssertion
  adrAccepted: EvidenceAssertion
}>

export type PrimitivePromotionGate =
  | 'three_distinct_workflow_families'
  | 'neutral_name'
  | 'stable_cross_wedge_interface'
  | 'composition_failure'
  | 'platform_invariant'
  | 'negative_control'
  | 'human_agent_parity'
  | 'replay_regression'
  | 'backwards_compatibility'
  | 'threat_review'
  | 'accepted_adr'

export type PrimitivePromotionEvaluation = Readonly<{
  disposition: 'wedge_local' | 'reusable_module' | 'kernel_candidate' | 'kernel_primitive'
  eligibleForKernel: boolean
  unmetGates: readonly PrimitivePromotionGate[]
}>

export function evaluatePrimitivePromotion(
  candidate: PrimitivePromotionCandidate,
): PrimitivePromotionEvaluation {
  const families = new Set(candidate.observedWorkflows.map((workflow) => workflow.workflowFamily))
  if (families.size < 2 || !assertionPassed(candidate.stableInterfaceAcrossFamilies)) {
    return Object.freeze({
      disposition: 'wedge_local',
      eligibleForKernel: false,
      unmetGates: Object.freeze(kernelPromotionGaps(candidate, families)),
    })
  }
  if (families.size < 3) {
    return Object.freeze({
      disposition: 'reusable_module',
      eligibleForKernel: false,
      unmetGates: Object.freeze(kernelPromotionGaps(candidate, families)),
    })
  }

  const unmetGates = kernelPromotionGaps(candidate, families)
  return Object.freeze({
    disposition: unmetGates.length === 0 ? 'kernel_primitive' : 'kernel_candidate',
    eligibleForKernel: unmetGates.length === 0,
    unmetGates: Object.freeze(unmetGates),
  })
}

function kernelPromotionGaps(
  candidate: PrimitivePromotionCandidate,
  families: ReadonlySet<string>,
): PrimitivePromotionGate[] {
  const gaps: PrimitivePromotionGate[] = []
  if (families.size < 3) gaps.push('three_distinct_workflow_families')
  if (!/^[a-z][a-z0-9_]*$/.test(candidate.neutralName)) gaps.push('neutral_name')
  const evidencedFamilies = new Set(candidate.observedWorkflows.flatMap((workflow) =>
    workflow.workflowFamily.length > 0
    && workflow.evidenceRefs.length > 0
    && workflow.evidenceRefs.every((reference) =>
      reference.kind === 'field_observation' && validEvidenceReference(reference)
    )
      ? [workflow.workflowFamily]
      : [],
  ))
  if (evidencedFamilies.size < 3 || evidencedFamilies.size !== families.size) {
    gaps.push('three_distinct_workflow_families')
  }
  if (!assertionPassed(candidate.stableInterfaceAcrossFamilies)) gaps.push('stable_cross_wedge_interface')
  if (!assertionPassed(candidate.compositionFailureDemonstrated)) gaps.push('composition_failure')
  if (!assertionPassed(candidate.platformInvariantProtected)) gaps.push('platform_invariant')
  if (!assertionPassed(candidate.negativeControlUnaffected)) gaps.push('negative_control')
  if (!assertionPassed(candidate.humanAgentParity)) gaps.push('human_agent_parity')
  if (!assertionPassed(candidate.replayRegressionPassed)) gaps.push('replay_regression')
  if (!assertionPassed(candidate.backwardsCompatibilityPassed)
    || !candidate.backwardsCompatibilityPassed.evidenceRefs.every((reference) =>
      reference.kind === 'compatibility_report'
    )) {
    gaps.push('backwards_compatibility')
  }
  if (!assertionPassed(candidate.threatReviewPassed)
    || !candidate.threatReviewPassed.evidenceRefs.every((reference) =>
      reference.kind === 'threat_review'
    )) {
    gaps.push('threat_review')
  }
  if (!assertionPassed(candidate.adrAccepted)
    || !candidate.adrAccepted.evidenceRefs.every((reference) => reference.kind === 'adr')) {
    gaps.push('accepted_adr')
  }
  return gaps
}

export type FoundryPortfolio = Readonly<{
  packs: readonly WedgeExecutionPack[]
  marginalWedgeCost: MeasuredComparison
  repeatedKernelGapObserved: EvidenceAssertion
  humanOperationsEconomicallyViable: EvidenceAssertion
}>

export type FoundryInvestmentDecision = Readonly<{
  decision: 'evidence_pending' | 'invest' | 'narrow' | 'refine_platform' | 'operate_as_service' | 'stop'
  productProof: boolean
  platformProof: boolean
  reasons: readonly string[]
}>

export function evaluateFoundryPortfolio(
  portfolio: FoundryPortfolio,
): FoundryInvestmentDecision {
  const commercial = portfolio.packs.find((pack) => pack.role === 'commercial_candidate')
  const transfer = portfolio.packs.find((pack) => pack.role === 'transfer_test')
  const falsification = portfolio.packs.find((pack) => pack.role === 'falsification_test')
  const negativeControl = portfolio.packs.find((pack) => pack.role === 'negative_control')
  const commercialEvaluation = commercial === undefined
    ? undefined
    : evaluateWedgeExecutionPack(commercial)
  const transferEvaluation = transfer === undefined
    ? undefined
    : evaluateWedgeExecutionPack(transfer)
  const productProof = commercialEvaluation?.productProofReady === true
  const transferProof = transfer !== undefined
    && transferEvaluation?.productProofReady === true
    && kernelChangesAdmissible(transfer)
    && transfer.bespokeOrchestrationBranches === 0
    && transfer.parallelLifecycleCount === 0
  const falsificationEvaluation = falsification === undefined
    ? undefined
    : evaluateWedgeExecutionPack(falsification)
  const falsificationProof = falsificationEvaluation?.fieldEvidenceReady === true
    && falsificationEvaluation.structurallyReplayable
    && falsificationEvaluation.productProofReady
    && falsification !== undefined
    && kernelChangesAdmissible(falsification)
    && falsification.bespokeOrchestrationBranches === 0
    && falsification.parallelLifecycleCount === 0
  const negativeControlEvaluation = negativeControl === undefined
    ? undefined
    : evaluateWedgeExecutionPack(negativeControl)
  const negativeControlProof = negativeControlEvaluation?.fieldEvidenceReady === true
    && negativeControlEvaluation.structurallyReplayable
    && negativeControlEvaluation.evaluationComplete
    && negativeControl?.negativeControlDecision?.decision === 'direct_provider_path'
    && negativeControl.negativeControlDecision.evidenceRefs.length > 0
    && negativeControl.negativeControlDecision.evidenceRefs.every(validEvidenceReference)
    && measuredComparisonPassed(negativeControl.scorecard.customerBurden)
    && measuredComparisonPassed(negativeControl.scorecard.correctness)
    && measuredComparisonPassed(negativeControl.scorecard.totalCost)
    && measuredComparisonPassed(negativeControl.scorecard.privacyAndControl)
    && measuredComparisonPassed(negativeControl.scorecard.providerBurden)
    && measuredComparisonPassed(negativeControl.scorecard.operatorBurden)
    && negativeControl.bespokeOrchestrationBranches === 0
    && negativeControl.parallelLifecycleCount === 0
  const platformProof = transferProof
    && falsificationProof
    && negativeControlProof
    && measuredComparisonPassed(portfolio.marginalWedgeCost)

  if (commercialEvaluation?.evaluationComplete !== true) {
    return decision('evidence_pending', productProof, platformProof, ['commercial_evaluation_incomplete'])
  }
  const platformEvaluationComplete = transferEvaluation?.evaluationComplete === true
    && falsificationEvaluation?.evaluationComplete === true
    && negativeControlEvaluation?.evaluationComplete === true
    && measuredComparisonComplete(portfolio.marginalWedgeCost)
  if (productProof && !platformEvaluationComplete) {
    return decision('evidence_pending', productProof, platformProof, ['platform_evaluation_incomplete'])
  }
  if (productProof && platformProof) {
    return decision('invest', productProof, platformProof, ['customer_and_platform_proof_passed'])
  }
  if (productProof && assertionPassed(portfolio.humanOperationsEconomicallyViable)) {
    return decision('operate_as_service', productProof, platformProof, ['value_depends_on_viable_human_operations'])
  }
  if (productProof) {
    return decision('narrow', productProof, platformProof, ['customer_value_without_transfer_proof'])
  }
  if (assertionPassed(portfolio.repeatedKernelGapObserved)) {
    return decision('refine_platform', productProof, platformProof, ['repeated_cross_wedge_kernel_gap'])
  }
  return decision('stop', productProof, platformProof, ['customer_and_platform_proof_missing'])
}

function kernelChangesAdmissible(pack: WedgeExecutionPack): boolean {
  if (pack.kernelEditsRequired.length === 0) return true
  const candidates = new Map(
    pack.kernelPromotionCandidates.map((candidate) => [candidate.candidateId, candidate]),
  )
  return pack.kernelEditsRequired.every((candidateId) => {
    const candidate = candidates.get(candidateId)
    return candidate !== undefined && evaluatePrimitivePromotion(candidate).eligibleForKernel
  })
}

function decision(
  value: FoundryInvestmentDecision['decision'],
  productProof: boolean,
  platformProof: boolean,
  reasons: readonly string[],
): FoundryInvestmentDecision {
  return Object.freeze({
    decision: value,
    productProof,
    platformProof,
    reasons: Object.freeze([...reasons]),
  })
}
