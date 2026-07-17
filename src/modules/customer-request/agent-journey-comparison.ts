import { canonicalDigest } from '@/modules/common/canonical-digest'

type Money = Readonly<{ currency: string; amountMinor: number }>

type DirectJourney = Readonly<{
  kind: 'frozen_direct_agent_baseline'
  jobDigest: string
  predeclaredGain: string
  comparisonEligibility: Readonly<{ state: 'eligible' | 'ineligible' }>
  completion: Readonly<{ state: 'completed' | 'blocked' }>
  integrationBurden: Readonly<{
    originsProvided: number; discoveryCalls: number; invocationCalls: number; schemaMappings: number
  }>
  turns: Readonly<{ total: number }>
  elapsedMs: number
  hardConstraintAccuracy: Readonly<{ state: 'satisfied' | 'violated' | 'not_declared' }>
  totalCostAccuracy: Readonly<{ state: 'exact'; total: Money } | { state: 'unavailable'; total?: Money }>
  recovery: Readonly<{ state: 'unsupported' }>
  resultUsability: Readonly<{ state: 'usable' | 'unusable' | 'partial' }>
  invocations: readonly Readonly<{ business: string }>[]
  claimBoundary: 'labelled_sandbox_direct_baseline_not_real_supply_or_customer_value'
}>

type AeJourney = Readonly<{
  kind: 'cold_external_agent_journey'
  sandbox: true
  input: Readonly<{ request: string }>
  final: Readonly<{
    state: 'completed' | 'failed' | 'cancelled' | 'outcome_unknown'
    runState: 'completed' | 'in_progress' | 'failed' | 'cancelled' | 'outcome_unknown'
    evidenceState: 'completed' | 'running' | 'queued' | 'failed' | 'cancelled' | 'outcome_unknown'
    resumedState: 'completed' | 'failed' | 'cancelled' | 'outcome_unknown'
    selectedBusinesses: readonly string[]
    resultDigest?: string | undefined
  }>
  measurements: Readonly<{
    integrationBurden: Readonly<{ requestCalls: number; clarifications: number }>
    turns: Readonly<{ total: number }>
    elapsedMs: number
    hardConstraintAccuracy: Readonly<{ state: 'satisfied' | 'not_evaluated' }>
    totalCostAccuracy: Readonly<{ state: 'exact'; total: Money } | { state: 'unavailable' }>
    recovery: Readonly<{ state: 'durable'; resumed: boolean; postures: readonly ('retry_safe' | 'reconcile_required')[] }>
    interruptionRecovery?: Readonly<{
      state: 'verified'
      requestRef: string
      revision: number
      completedSteps: number
    }> | undefined
    resultUsability: Readonly<{ state: 'usable' | 'unusable' }>
    replaySafety: Readonly<{ executionStart: 'not_proven' | 'same_request_monotonic_progress' }>
    disclosureIntegrity: Readonly<{
      state: 'verified' | 'not_proven'
      recipients: readonly string[]
      purposes: readonly string[]
    }>
    resultIntegrity: Readonly<
      { state: 'verified'; digest: string }
      | { state: 'not_applicable' | 'not_proven' }
    >
    controlIntegrity: Readonly<{
      state: 'verified' | 'not_proven'
      operatorInterventions: number
      mutations: readonly Readonly<{
        path: string
        source: 'declared_request' | 'observed_navigation' | 'automatic_replay'
      }>[]
    }>
  }>
  claimBoundary: 'contract_and_hosted_journey_only_not_real_supply_or_customer_value'
}>

type ComparisonFailure =
  | 'predeclared_gain_unsupported' | 'request_mismatch' | 'provider_set_mismatch'
  | 'direct_baseline_ineligible'
  | 'direct_incomplete' | 'ae_incomplete'
  | 'direct_hard_constraint_not_satisfied' | 'ae_hard_constraint_not_satisfied'
  | 'direct_total_cost_not_exact' | 'ae_total_cost_not_exact' | 'total_cost_mismatch'
  | 'direct_result_unusable' | 'ae_result_unusable'
  | 'ae_recovery_not_durable' | 'ae_recovery_not_resumed'
  | 'ae_interruption_recovery_not_proven'
  | 'ae_execution_start_replay_not_proven'
  | 'ae_disclosure_integrity_not_proven'
  | 'ae_result_integrity_not_proven'
  | 'ae_control_integrity_not_proven'

export function compareAgentJourneys(input: Readonly<{ direct: DirectJourney; ae: AeJourney }>) {
  const { direct, ae } = input
  const failures: ComparisonFailure[] = []
  if (direct.predeclaredGain !== 'recoverable_progress') failures.push('predeclared_gain_unsupported')
  if (direct.jobDigest !== canonicalDigest(ae.input.request)) failures.push('request_mismatch')
  if (!sameStringSet(direct.invocations.map(({ business }) => business), ae.final.selectedBusinesses)) {
    failures.push('provider_set_mismatch')
  }
  if (direct.comparisonEligibility.state !== 'eligible') failures.push('direct_baseline_ineligible')
  if (direct.completion.state !== 'completed') failures.push('direct_incomplete')
  if (!aeCompleted(ae)) failures.push('ae_incomplete')
  if (direct.hardConstraintAccuracy.state !== 'satisfied') failures.push('direct_hard_constraint_not_satisfied')
  if (ae.measurements.hardConstraintAccuracy.state !== 'satisfied') failures.push('ae_hard_constraint_not_satisfied')
  if (direct.totalCostAccuracy.state !== 'exact') failures.push('direct_total_cost_not_exact')
  if (ae.measurements.totalCostAccuracy.state !== 'exact') failures.push('ae_total_cost_not_exact')
  const totalsMatch = costsMatch(direct.totalCostAccuracy, ae.measurements.totalCostAccuracy)
  if (direct.totalCostAccuracy.state === 'exact' && ae.measurements.totalCostAccuracy.state === 'exact' && !totalsMatch) {
    failures.push('total_cost_mismatch')
  }
  if (direct.resultUsability.state !== 'usable') failures.push('direct_result_unusable')
  if (ae.measurements.resultUsability.state !== 'usable') failures.push('ae_result_unusable')
  if (ae.measurements.recovery.state !== 'durable') failures.push('ae_recovery_not_durable')
  if (!ae.measurements.recovery.resumed) failures.push('ae_recovery_not_resumed')
  if (ae.measurements.interruptionRecovery?.state !== 'verified') {
    failures.push('ae_interruption_recovery_not_proven')
  }
  if (ae.measurements.replaySafety.executionStart !== 'same_request_monotonic_progress') {
    failures.push('ae_execution_start_replay_not_proven')
  }
  if (ae.measurements.disclosureIntegrity.state !== 'verified') {
    failures.push('ae_disclosure_integrity_not_proven')
  }
  if (ae.measurements.resultIntegrity.state !== 'verified'
    || ae.final.resultDigest !== ae.measurements.resultIntegrity.digest) {
    failures.push('ae_result_integrity_not_proven')
  }
  if (ae.measurements.controlIntegrity.state !== 'verified'
    || ae.measurements.controlIntegrity.operatorInterventions !== 0
    || !validControlMutations(ae.measurements.controlIntegrity.mutations)) {
    failures.push('ae_control_integrity_not_proven')
  }

  return {
    kind: 'agent_journey_comparison' as const,
    predeclaredGain: direct.predeclaredGain,
    verdict: failures.length === 0 ? 'pass_for_declared_class' as const : 'fail_for_declared_class' as const,
    failures,
    measurements: {
      integrationBurden: { direct: direct.integrationBurden, ae: ae.measurements.integrationBurden },
      completion: { direct: direct.completion.state, ae: aeCompleted(ae) ? 'completed' as const : 'incomplete' as const },
      turns: { direct: direct.turns.total, ae: ae.measurements.turns.total },
      elapsedMs: { direct: direct.elapsedMs, ae: ae.measurements.elapsedMs },
      hardConstraintAccuracy: {
        direct: direct.hardConstraintAccuracy.state, ae: ae.measurements.hardConstraintAccuracy.state,
      },
      totalCostAccuracy: {
        direct: direct.totalCostAccuracy.state, ae: ae.measurements.totalCostAccuracy.state, totalsMatch,
      },
      recovery: {
        direct: direct.recovery.state, ae: ae.measurements.recovery.state,
        aeResumed: ae.measurements.recovery.resumed,
      },
      interruptionRecovery: ae.measurements.interruptionRecovery,
      resultUsability: {
        direct: direct.resultUsability.state, ae: ae.measurements.resultUsability.state,
      },
      replaySafety: { aeExecutionStart: ae.measurements.replaySafety.executionStart },
      disclosureIntegrity: ae.measurements.disclosureIntegrity,
      resultIntegrity: ae.measurements.resultIntegrity,
      controlIntegrity: ae.measurements.controlIntegrity,
    },
    claimBoundary: 'labelled_sandbox_comparison_not_independently_operated_supply_fulfilment_or_customer_value' as const,
  }
}

function validControlMutations(
  mutations: AeJourney['measurements']['controlIntegrity']['mutations'],
): boolean {
  if (mutations.length < 2
    || mutations[0]?.path !== '/api/v1/requests'
    || mutations[0]?.source !== 'declared_request') return false
  const priorPaths = new Set<string>(['/api/v1/requests'])
  let observedNavigation = false
  for (const { path, source } of mutations.slice(1)) {
    if ((path !== '/api/v1/requests' && !path.startsWith('/api/v1/requests/'))
      || source === 'declared_request'
      || (source === 'automatic_replay' && !priorPaths.has(path))) return false
    if (source === 'observed_navigation') observedNavigation = true
    priorPaths.add(path)
  }
  return observedNavigation
}

function aeCompleted(ae: AeJourney) {
  return ae.final.state === 'completed' && ae.final.runState === 'completed'
    && ae.final.evidenceState === 'completed' && ae.final.resumedState === 'completed'
}

function costsMatch(
  direct: DirectJourney['totalCostAccuracy'],
  ae: AeJourney['measurements']['totalCostAccuracy'],
) {
  return direct.state === 'exact' && ae.state === 'exact'
    && direct.total.currency === ae.total.currency
    && direct.total.amountMinor === ae.total.amountMinor
}

function sameStringSet(left: readonly string[], right: readonly string[]) {
  if (left.length !== right.length) return false
  const remaining = new Map<string, number>()
  for (const value of left) remaining.set(value, (remaining.get(value) ?? 0) + 1)
  for (const value of right) {
    const count = remaining.get(value)
    if (count === undefined) return false
    if (count === 1) remaining.delete(value)
    else remaining.set(value, count - 1)
  }
  return remaining.size === 0
}
