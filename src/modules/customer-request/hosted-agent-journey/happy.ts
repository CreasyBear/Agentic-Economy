import type { CustomerRequestView } from '../agent-contract'
import {
  HOSTED_JOURNEY_CLAIM_BOUNDARY,
  hostedCustomerRequestJourneyProofSchema,
  type HostedCustomerRequestJourneyProof,
  type HostedCustomerRequestJourneyRuntimeInput,
  type ObservedNavigationAction,
  type ReleaseVerification,
  type ScenarioFinishBase,
} from './types'
import {
  callAgent,
  callAgentEvidence,
  callAgentProblem,
  defaultSleep,
  digestInput,
  journeyMeasurements,
  journeyProofInput,
  journeyReleaseProjection,
  materializeObservedInput,
  observe,
  withdrawRepeatPermission,
} from './runtime'

export async function providerDeniedHostedJourney(input: Readonly<{
  input: HostedCustomerRequestJourneyRuntimeInput
  release: ReleaseVerification
  requestRef: string
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number]
  selectedBusiness: string
  selectedBusinesses: readonly string[]
  states: CustomerRequestView['state'][]
  authorityStops: Array<'route_confirmation'>
  consumedFacts: Array<{ requirementKey: string; valueDigest: string }>
  consumedMessages: Array<{ index: number; valueDigest: string }>
  progressPath: string
  evidencePath: string
  problemAction: ObservedNavigationAction
  started: CustomerRequestView
  nonce: string
}>): Promise<HostedCustomerRequestJourneyProof> {
  let failed: CustomerRequestView | undefined
  for (let attempt = 0; attempt < 24; attempt += 1) {
    failed = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
    observe(input.states, failed)
    if (failed.state === 'failed') break
    if (failed.state !== 'in_progress') throw new Error(`hosted_journey_denial_stopped:${failed.state}`)
    await (input.input.sleep ?? defaultSleep)(1_000)
  }
  if (failed?.state !== 'failed' || failed.action?.state !== 'failed'
    || failed.action.resolution !== 'reconciled' || failed.action.automaticRetry !== false
    || failed.action.result === undefined || failed.progress?.completed !== input.route.stepCount - 1) {
    throw new Error('hosted_journey_denial_timeout')
  }
  if (failed.navigation?.actions.some(({ relation }) => relation === 'start_confirmed_option')) {
    throw new Error('hosted_journey_denial_replay_available')
  }
  const evidence = await callAgentEvidence(input.input, input.evidencePath)
  if (evidence.state !== 'failed' || evidence.result === undefined
    || evidence.steps.length !== input.route.stepCount
    || evidence.steps.filter(({ state }) => state === 'completed').length !== input.route.stepCount - 1
    || evidence.steps.at(-1)?.state !== 'failed') {
    throw new Error('hosted_journey_denial_evidence_missing')
  }
  const actionResultDigest = digestInput(failed.action.result)
  const evidenceResultDigest = digestInput(evidence.result)
  if (actionResultDigest !== evidenceResultDigest) throw new Error('hosted_journey_denial_result_mismatch')
  const problem = await callAgentProblem(input.input, input.problemAction.path, materializeObservedInput(
    input.started, input.problemAction, {
      '<unique string>': `acceptance:problem:${input.nonce}`,
      '<incorrect_result | unexpected_cost | duplicate_charge_or_effect | privacy_concern | could_not_stop | other>': 'other',
      '<problem summary>': 'The labelled sandbox provider declined the second step.',
      '<step number from evidence>': input.route.stepCount,
    },
  ))
  const resumed = await callAgent(input.input, input.progressPath, 'GET')
  observe(input.states, resumed)
  if (resumed.state !== 'failed' || resumed.action?.automaticRetry !== false
    || resumed.progress?.completed !== failed.progress.completed) {
    throw new Error(`hosted_journey_denial_resume_failed:${resumed.state}`)
  }
  return hostedCustomerRequestJourneyProofSchema.parse({
    kind: 'cold_external_agent_journey', agent: input.input.agent,
    release: journeyReleaseProjection(input.input, input.release),
    observedAt: new Date((input.input.now ?? Date.now)()).toISOString(),
    input: journeyProofInput(input.input, input.consumedFacts, input.consumedMessages),
    observedStates: input.states, authorityStops: input.authorityStops,
    final: {
      requestRef: input.requestRef, revision: resumed.revision,
      state: resumed.state, selectedBusiness: input.selectedBusiness,
      selectedBusinesses: input.selectedBusinesses, stepCount: input.route.stepCount,
      runState: 'failed', evidenceState: evidence.state, problemState: problem.state,
      resumedState: resumed.state, completedSteps: resumed.progress.completed,
      automaticRetry: false, resultDigest: evidenceResultDigest,
    },
    measurements: journeyMeasurements(input.input, input.route, false, true, evidenceResultDigest),
    sandbox: true,
    claimBoundary: HOSTED_JOURNEY_CLAIM_BOUNDARY,
  })
}

export async function outcomeUnknownHostedJourney(input: Readonly<{
  input: HostedCustomerRequestJourneyRuntimeInput
  release: ReleaseVerification
  requestRef: string
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number]
  selectedBusiness: string
  selectedBusinesses: readonly string[]
  states: CustomerRequestView['state'][]
  authorityStops: Array<'route_confirmation'>
  consumedFacts: Array<{ requirementKey: string; valueDigest: string }>
  consumedMessages: Array<{ index: number; valueDigest: string }>
  progressPath: string
  evidencePath: string
  problemAction: ObservedNavigationAction
  started: CustomerRequestView
  nonce: string
  failureClass: 'outcome_unknown' | 'invalid_output'
  problemCategory: 'incorrect_result' | 'other'
  problemSummary: string
}>): Promise<HostedCustomerRequestJourneyProof> {
  let uncertain: CustomerRequestView | undefined
  for (let attempt = 0; attempt < 24; attempt += 1) {
    uncertain = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
    observe(input.states, uncertain)
    if (uncertain.state === 'outcome_unknown') break
    if (uncertain.state !== 'in_progress') throw new Error(`hosted_journey_unknown_stopped:${uncertain.state}`)
    await (input.input.sleep ?? defaultSleep)(1_000)
  }
  if (uncertain?.state !== 'outcome_unknown' || uncertain.action?.state !== 'unknown'
    || uncertain.action.automaticRetry !== false || uncertain.progress?.completed !== input.route.stepCount - 1) {
    throw new Error('hosted_journey_unknown_timeout')
  }
  if (uncertain.navigation?.actions.some(({ relation }) => relation === 'start_confirmed_option')) {
    throw new Error('hosted_journey_unknown_replay_available')
  }
  const evidence = await callAgentEvidence(input.input, input.evidencePath)
  if (evidence.state !== 'outcome_unknown' || evidence.steps.length !== input.route.stepCount
    || evidence.steps.filter(({ state }) => state === 'completed').length !== input.route.stepCount - 1
    || evidence.steps.at(-1)?.state !== 'outcome_unknown') {
    throw new Error('hosted_journey_unknown_evidence_missing')
  }
  const problem = await callAgentProblem(input.input, input.problemAction.path, materializeObservedInput(
    input.started, input.problemAction, {
      '<unique string>': `acceptance:problem:${input.nonce}`,
      '<incorrect_result | unexpected_cost | duplicate_charge_or_effect | privacy_concern | could_not_stop | other>':
        input.problemCategory,
      '<problem summary>': input.problemSummary,
      '<step number from evidence>': input.route.stepCount,
    },
  ))
  const resumed = await callAgent(input.input, input.progressPath, 'GET')
  observe(input.states, resumed)
  if (resumed.state !== 'outcome_unknown' || resumed.action?.automaticRetry !== false
    || resumed.progress?.completed !== uncertain.progress.completed) {
    throw new Error(`hosted_journey_unknown_resume_failed:${resumed.state}`)
  }
  return hostedCustomerRequestJourneyProofSchema.parse({
    kind: 'cold_external_agent_journey', agent: input.input.agent,
    release: journeyReleaseProjection(input.input, input.release),
    observedAt: new Date((input.input.now ?? Date.now)()).toISOString(),
    input: journeyProofInput(input.input, input.consumedFacts, input.consumedMessages),
    observedStates: input.states, authorityStops: input.authorityStops,
    final: {
      requestRef: input.requestRef, revision: resumed.revision,
      state: resumed.state, selectedBusiness: input.selectedBusiness,
      selectedBusinesses: input.selectedBusinesses, stepCount: input.route.stepCount,
      runState: 'outcome_unknown', evidenceState: evidence.state, problemState: problem.state,
      resumedState: resumed.state, completedSteps: resumed.progress.completed, automaticRetry: false,
      failureClass: input.failureClass,
      ...(resumed.progress.dependencies === undefined ? {} : {
        dependencies: {
          completedBusinesses: resumed.progress.dependencies.completed.map(({ business }) => business),
          blockedBusinesses: resumed.progress.dependencies.blocked.map(({ business }) => business),
        },
      }),
    },
    measurements: journeyMeasurements(input.input, input.route, false, true),
    sandbox: true,
    claimBoundary: HOSTED_JOURNEY_CLAIM_BOUNDARY,
  })
}

export async function completeHostedJourney(input: Readonly<{
  input: HostedCustomerRequestJourneyRuntimeInput
  release: ReleaseVerification
  requestRef: string
  route: NonNullable<NonNullable<CustomerRequestView['decision']>['routes']>[number]
  selectedBusiness: string
  selectedBusinesses: readonly string[]
  states: CustomerRequestView['state'][]
  authorityStops: Array<'route_confirmation'>
  consumedFacts: Array<{ requirementKey: string; valueDigest: string }>
  consumedMessages: Array<{ index: number; valueDigest: string }>
  progressPath: string
  evidencePath: string
  started: CustomerRequestView
}>): Promise<HostedCustomerRequestJourneyProof> {
  let resumed: CustomerRequestView | undefined
  for (let attempt = 0; attempt < 24; attempt += 1) {
    resumed = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
    observe(input.states, resumed)
    if (attempt === 0) {
      const completedSteps = resumed.progress?.completed
        ?? (resumed.state === 'completed' ? input.route.stepCount : 0)
      if (resumed.requestRef !== input.started.requestRef
        || resumed.revision !== input.started.revision
        || completedSteps < (input.started.progress?.completed ?? 0)) {
        throw new Error('hosted_journey_interruption_recovery_changed')
      }
      input.input.metrics.interruptionRecovery = {
        state: 'verified',
        requestRef: resumed.requestRef,
        revision: resumed.revision,
        completedSteps,
      }
    }
    if (resumed.state === 'completed') break
    if (resumed.state !== 'in_progress') {
      throw new Error(
        `hosted_journey_completion_stopped:${resumed.state}:requestRef=${resumed.requestRef}:action=${resumed.action?.state ?? 'none'}`,
      )
    }
    await (input.input.sleep ?? defaultSleep)(1_000)
  }
  if (resumed?.state !== 'completed' || resumed.action?.state !== 'completed'
    || resumed.action.result === undefined) throw new Error('hosted_journey_completion_timeout')
  if (JSON.stringify(resumed.businesses?.map(({ name }) => name))
    !== JSON.stringify(input.selectedBusinesses)) {
    throw new Error('hosted_journey_terminal_businesses_changed')
  }
  const evidence = await callAgentEvidence(input.input, input.evidencePath)
  if (evidence.state !== 'completed' || evidence.result === undefined
    || evidence.steps.length !== input.route.stepCount
    || evidence.steps.some((step) => step.state !== 'completed')) {
    throw new Error('hosted_journey_completed_evidence_missing')
  }
  const actionResultDigest = digestInput(resumed.action.result)
  const evidenceResultDigest = digestInput(evidence.result)
  if (actionResultDigest !== evidenceResultDigest) throw new Error('hosted_journey_result_mismatch')
  if (input.input.scenario.repeatPermission !== undefined) {
    await withdrawRepeatPermission(input.input, resumed, input.input.scenario.repeatPermission)
  }
  return hostedCustomerRequestJourneyProofSchema.parse({
    kind: 'cold_external_agent_journey', agent: input.input.agent,
    release: journeyReleaseProjection(input.input, input.release),
    observedAt: new Date((input.input.now ?? Date.now)()).toISOString(),
    input: journeyProofInput(input.input, input.consumedFacts, input.consumedMessages),
    observedStates: input.states, authorityStops: input.authorityStops,
    final: {
      requestRef: input.requestRef, revision: resumed.revision,
      state: resumed.state, selectedBusiness: input.selectedBusiness,
      selectedBusinesses: input.selectedBusinesses, stepCount: input.route.stepCount,
      runState: 'completed', evidenceState: evidence.state,
      problemState: 'not_reported', resumedState: resumed.state,
      resultDigest: evidenceResultDigest,
    },
    measurements: journeyMeasurements(input.input, input.route, true, true, evidenceResultDigest, evidence),
    sandbox: true,
    claimBoundary: HOSTED_JOURNEY_CLAIM_BOUNDARY,
  })
}
