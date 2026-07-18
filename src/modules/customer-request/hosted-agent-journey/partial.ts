import type { CustomerRequestView } from '../agent-contract'
import {
  HOSTED_JOURNEY_CLAIM_BOUNDARY,
  hostedCustomerRequestJourneyProofSchema,
  type HostedCustomerRequestJourneyProof,
  type ObservedNavigationAction,
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
} from './runtime'

export async function partialResultHostedJourney(
  input: ScenarioFinishBase & Readonly<{
    problemAction: ObservedNavigationAction
    nonce: string
  }>,
): Promise<HostedCustomerRequestJourneyProof> {
  let partial: CustomerRequestView | undefined
  for (let attempt = 0; attempt < 24; attempt += 1) {
    partial = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
    observe(input.states, partial)
    if (partial.state === 'outcome_unknown') break
    if (partial.state !== 'in_progress') {
      throw new Error(`hosted_journey_partial_stopped:${partial.state}:request=${input.requestRef}`)
    }
    await (input.input.sleep ?? defaultSleep)(1_000)
  }
  if (partial?.state !== 'outcome_unknown' || partial.action?.state !== 'unknown'
    || partial.action.automaticRetry !== false || partial.action.result === undefined
    || partial.progress?.completed !== input.route.stepCount - 1) {
    throw new Error('hosted_journey_partial_timeout')
  }
  const result = partial.action.result
  if (typeof result !== 'object' || result === null || Array.isArray(result)
    || !('kind' in result) || result.kind !== 'partial_result' || !('output' in result)) {
    throw new Error('hosted_journey_partial_result_missing')
  }
  if (JSON.stringify(partial).includes('sandbox-continuation:')) {
    throw new Error('hosted_journey_partial_continuation_disclosed')
  }
  const evidence = await callAgentEvidence(input.input, input.evidencePath)
  if (evidence.state !== 'outcome_unknown' || evidence.result === undefined
    || evidence.steps.length !== input.route.stepCount
    || evidence.steps.filter(({ state }) => state === 'completed').length !== input.route.stepCount - 1
    || evidence.steps.at(-1)?.state !== 'outcome_unknown') {
    throw new Error('hosted_journey_partial_evidence_missing')
  }
  const actionResultDigest = digestInput(result)
  const evidenceResultDigest = digestInput(evidence.result)
  if (actionResultDigest !== evidenceResultDigest) throw new Error('hosted_journey_partial_result_mismatch')
  if (JSON.stringify(evidence).includes('sandbox-continuation:')) {
    throw new Error('hosted_journey_partial_evidence_disclosed_continuation')
  }
  const problem = await callAgentProblem(input.input, input.problemAction.path, materializeObservedInput(
    input.started, input.problemAction, {
      '<unique string>': `acceptance:problem:${input.nonce}`,
      '<incorrect_result | unexpected_cost | duplicate_charge_or_effect | privacy_concern | could_not_stop | other>': 'other',
      '<problem summary>': 'The labelled sandbox provider returned only a partial result.',
      '<step number from evidence>': input.route.stepCount,
    },
  ))
  const resumed = await callAgent(input.input, input.progressPath, 'GET')
  observe(input.states, resumed)
  if (resumed.state !== 'outcome_unknown' || resumed.action?.automaticRetry !== false
    || resumed.action.result === undefined
    || digestInput(resumed.action.result) !== actionResultDigest) {
    throw new Error(`hosted_journey_partial_resume_failed:${resumed.state}`)
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
      resumedState: resumed.state, completedSteps: resumed.progress?.completed,
      automaticRetry: false, resultDigest: evidenceResultDigest,
    },
    measurements: journeyMeasurements(input.input, input.route, false, true, evidenceResultDigest),
    sandbox: true,
    claimBoundary: HOSTED_JOURNEY_CLAIM_BOUNDARY,
  })
}
