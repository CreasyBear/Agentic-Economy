import type { CustomerRequestView } from '../agent-contract'
import {
  HOSTED_JOURNEY_CLAIM_BOUNDARY,
  hostedCustomerRequestJourneyProofSchema,
  type HostedCustomerRequestJourneyProof,
  type HostedCustomerRequestJourneyRuntimeInput,
  type ObservedNavigationAction,
  type ReleaseVerification,
} from './types'
import {
  assertCancelledExecutionStartReplay,
  assertExecutionStartReplay,
  callAgent,
  callAgentEvidence,
  defaultSleep,
  journeyMeasurements,
  journeyProofInput,
  journeyReleaseProjection,
  materializeObservedInput,
  observe,
  observedNavigationAction,
} from './runtime'
import { completeHostedJourney } from './happy'

export async function adapterCancellationHostedJourney(input: Readonly<{
  input: HostedCustomerRequestJourneyRuntimeInput
  release: ReleaseVerification
  requestRef: string
  route: NonNullable<CustomerRequestView['decision']>['routes'][number]
  selectedBusiness: string
  selectedBusinesses: readonly string[]
  states: CustomerRequestView['state'][]
  authorityStops: 'route_confirmation'[]
  consumedFacts: Array<Readonly<{ requirementKey: string; valueDigest: string }>>
  consumedMessages: Array<Readonly<{ index: number; valueDigest: string }>>
  progressPath: string
  evidencePath: string
  started: CustomerRequestView
  startAction: ObservedNavigationAction
  startCommand: unknown
  nonce: string
  expected: 'accepted' | 'rejected' | 'unknown'
}>): Promise<HostedCustomerRequestJourneyProof> {
  const cancelAction = observedNavigationAction(input.input, input.started, 'cancel')
  const cancelCommand = materializeObservedInput(input.started, cancelAction, {
    '<unique string>': `acceptance:adapter-cancel:${input.expected}:${input.nonce}`,
  })
  let released: CustomerRequestView | undefined
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const progress = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
    observe(input.states, progress)
    if (progress.state !== 'in_progress') {
      throw new Error(`hosted_journey_adapter_cancel_release_state:${progress.state}`)
    }
    if (progress.progress?.current.state === 'contacting'
      || progress.progress?.current.state === 'awaiting_result') {
      released = progress
      break
    }
    await (input.input.sleep ?? defaultSleep)(125)
  }
  if (released?.progress?.current.step !== 1) {
    throw new Error('hosted_journey_adapter_cancel_release_not_observed')
  }
  const requested = await callAgent(
    input.input, cancelAction.path, cancelAction.method, cancelCommand, [200], 'observed_navigation',
  )
  observe(input.states, requested)
  const initialCancellation = requested.activity?.cancellation
  if (requested.state !== 'in_progress' || typeof initialCancellation !== 'object'
    || (initialCancellation.state !== 'pending'
      && initialCancellation.state !== 'unknown'
      && initialCancellation.state !== 'rejected')) {
    throw new Error('hosted_journey_adapter_cancel_request_not_recorded')
  }
  const replayedRequest = await callAgent(
    input.input, cancelAction.path, cancelAction.method, cancelCommand, [200], 'automatic_replay',
  )
  observe(input.states, replayedRequest)
  let observed: CustomerRequestView | undefined
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const progress = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
    observe(input.states, progress)
    const cancellation = progress.activity?.cancellation
    if (input.expected === 'accepted' && progress.state === 'cancelled') {
      observed = progress
      break
    }
    if (input.expected === 'unknown' && progress.state === 'in_progress'
      && progress.progress?.completed === 1
      && typeof cancellation === 'object' && cancellation.state === 'unknown') {
      observed = progress
      break
    }
    if (input.expected === 'rejected' && progress.state === 'in_progress'
      && typeof cancellation === 'object' && cancellation.state === 'rejected') {
      observed = progress
      break
    }
    if (progress.state !== 'in_progress') {
      throw new Error(`hosted_journey_adapter_cancel_unexpected_terminal:${JSON.stringify({
        state: progress.state,
        progress: progress.progress,
        activity: progress.activity,
        nextAction: progress.nextAction,
      })}`)
    }
    await (input.input.sleep ?? defaultSleep)(125)
  }
  if (observed === undefined) throw new Error(`hosted_journey_adapter_cancel_${input.expected}_not_observed`)
  if (input.expected === 'rejected') {
    const startReplay = await callAgent(
      input.input, input.startAction.path, input.startAction.method, input.startCommand,
      [200], 'automatic_replay',
    )
    assertExecutionStartReplay(input.started, startReplay)
    input.input.metrics.executionStartReplay = 'same_request_monotonic_progress'
    const completed = await completeHostedJourney({
      input: input.input, release: input.release, requestRef: input.requestRef,
      route: input.route, selectedBusiness: input.selectedBusiness,
      selectedBusinesses: input.selectedBusinesses, states: input.states,
      authorityStops: input.authorityStops, consumedFacts: input.consumedFacts,
      consumedMessages: input.consumedMessages, progressPath: input.progressPath,
      evidencePath: input.evidencePath, started: observed,
    })
    const cancellation = observed.activity?.cancellation
    if (typeof cancellation !== 'object' || cancellation.state !== 'rejected') {
      throw new Error('hosted_journey_adapter_cancel_rejected_record_missing')
    }
    return hostedCustomerRequestJourneyProofSchema.parse({
      ...completed,
      final: { ...completed.final, cancellation },
    })
  }
  const startReplay = await callAgent(
    input.input, input.startAction.path, input.startAction.method, input.startCommand,
    [200], 'automatic_replay',
  )
  input.input.metrics.executionStartReplay = 'same_request_monotonic_progress'
  const evidence = await callAgentEvidence(input.input, input.evidencePath)
  if (input.expected === 'accepted' && evidence.state !== 'cancelled') {
    throw new Error(`hosted_journey_adapter_cancel_accepted_evidence:${evidence.state}`)
  }
  if (input.expected === 'unknown'
    && (evidence.state !== 'running' || evidence.steps.length !== 1
      || evidence.steps[0]?.step !== 1 || evidence.steps[0].state !== 'completed')) {
    throw new Error('hosted_journey_adapter_cancel_unknown_evidence_invalid')
  }
  const resumed = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
  observe(input.states, resumed)
  const cancellation = resumed.activity?.cancellation
  if (input.expected === 'accepted') {
    if (resumed.state !== 'cancelled' || typeof cancellation !== 'object'
      || cancellation.state !== 'stopped') {
      throw new Error('hosted_journey_adapter_cancel_accepted_resume_failed')
    }
    assertCancelledExecutionStartReplay(input.started, resumed, startReplay)
  } else if (resumed.state !== 'in_progress' || typeof cancellation !== 'object'
    || cancellation.state !== 'unknown' || resumed.progress?.completed !== 1) {
    throw new Error('hosted_journey_adapter_cancel_unknown_resume_failed')
  } else {
    assertExecutionStartReplay(input.started, startReplay)
  }
  return hostedCustomerRequestJourneyProofSchema.parse({
    kind: 'cold_external_agent_journey',
    agent: input.input.agent,
    release: journeyReleaseProjection(input.input, input.release),
    observedAt: new Date((input.input.now ?? Date.now)()).toISOString(),
    input: journeyProofInput(input.input, input.consumedFacts, input.consumedMessages),
    observedStates: input.states,
    authorityStops: input.authorityStops,
    final: {
      requestRef: input.requestRef,
      revision: resumed.revision,
      state: resumed.state,
      selectedBusiness: input.selectedBusiness,
      selectedBusinesses: input.selectedBusinesses,
      stepCount: input.route.stepCount,
      runState: resumed.state === 'cancelled' ? 'cancelled' : 'in_progress',
      evidenceState: evidence.state,
      problemState: 'not_reported',
      resumedState: resumed.state,
      completedSteps: resumed.progress?.completed ?? 0,
      ...(cancellation === undefined || typeof cancellation !== 'object'
        || (cancellation.state !== 'stopped' && cancellation.state !== 'unknown')
        ? {}
        : { cancellation }),
    },
    measurements: journeyMeasurements(input.input, input.route, false, true),
    sandbox: true,
    claimBoundary: HOSTED_JOURNEY_CLAIM_BOUNDARY,
  })
}

export async function cancelAfterCurrentHostedJourney(input: Readonly<{
  input: HostedCustomerRequestJourneyRuntimeInput
  release: ReleaseVerification
  requestRef: string
  route: NonNullable<CustomerRequestView['decision']>['routes'][number]
  selectedBusiness: string
  selectedBusinesses: readonly string[]
  states: CustomerRequestView['state'][]
  authorityStops: 'route_confirmation'[]
  consumedFacts: Array<Readonly<{ requirementKey: string; valueDigest: string }>>
  consumedMessages: Array<Readonly<{ index: number; valueDigest: string }>>
  progressPath: string
  evidencePath: string
  started: CustomerRequestView
  startAction: ObservedNavigationAction
  startCommand: unknown
  nonce: string
}>): Promise<HostedCustomerRequestJourneyProof> {
  let released: CustomerRequestView | undefined
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const progress = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
    observe(input.states, progress)
    if (progress.state !== 'in_progress') {
      throw new Error(`hosted_journey_cancel_after_current_released_state:${progress.state}`)
    }
    if (progress.progress?.current.state === 'contacting'
      || progress.progress?.current.state === 'awaiting_result') {
      released = progress
      break
    }
    await (input.input.sleep ?? defaultSleep)(250)
  }
  if (released?.progress?.current.step !== 1) {
    throw new Error('hosted_journey_cancel_after_current_release_not_observed')
  }
  const cancelAction = observedNavigationAction(input.input, released, 'stop_after_current')
  if (cancelAction.method !== 'POST') throw new Error('hosted_journey_navigation_method:stop_after_current')
  const cancelCommand = materializeObservedInput(released, cancelAction, {
    '<unique string>': `acceptance:cancel-after-current:${input.nonce}`,
  })
  const requested = await callAgent(
    input.input, cancelAction.path, cancelAction.method, cancelCommand, [200], 'observed_navigation',
  )
  observe(input.states, requested)
  const requestedCancellation = requested.activity?.cancellation
  if (requested.state !== 'in_progress'
    || typeof requestedCancellation !== 'object'
    || requestedCancellation.state !== 'not_available'
    || requestedCancellation.reason !== 'business_step_released'
    || requestedCancellation.requestedAt === undefined) {
    throw new Error('hosted_journey_cancel_after_current_request_not_recorded')
  }
  let cancelled: CustomerRequestView | undefined
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const progress = await callAgent(input.input, input.progressPath, 'GET', undefined, [200, 202])
    observe(input.states, progress)
    if (progress.state === 'cancelled') {
      cancelled = progress
      break
    }
    if (progress.state !== 'in_progress') {
      throw new Error(`hosted_journey_cancel_after_current_terminal:${progress.state}`)
    }
    await (input.input.sleep ?? defaultSleep)(250)
  }
  if (cancelled?.progress?.completed !== 1
    || cancelled.progress.total !== input.route.stepCount
    || cancelled.progress.current.step !== 2
    || cancelled.progress.current.state !== 'cancelled') {
    throw new Error('hosted_journey_cancel_after_current_downstream_not_stopped')
  }
  const replayed = await callAgent(
    input.input, cancelAction.path, cancelAction.method, cancelCommand, [200], 'automatic_replay',
  )
  observe(input.states, replayed)
  if (replayed.state !== 'cancelled'
    || replayed.progress?.completed !== cancelled.progress.completed
    || replayed.progress?.current.state !== 'cancelled') {
    throw new Error('hosted_journey_cancel_after_current_replay_changed')
  }
  const startReplay = await callAgent(
    input.input, input.startAction.path, input.startAction.method, input.startCommand, [200], 'automatic_replay',
  )
  assertCancelledExecutionStartReplay(input.started, cancelled, startReplay)
  input.input.metrics.executionStartReplay = 'same_request_monotonic_progress'
  const evidence = await callAgentEvidence(input.input, input.evidencePath)
  if (evidence.state !== 'cancelled'
    || evidence.steps.length !== 1
    || evidence.steps[0]?.step !== 1
    || evidence.steps[0].state !== 'completed') {
    throw new Error('hosted_journey_cancel_after_current_evidence_invalid')
  }
  input.input.metrics.downstreamCancellation = {
    state: 'verified',
    releasedStep: 1,
    completedSteps: 1,
    unreleasedStep: 2,
    downstreamStarted: false,
    cancellationReplaySafe: true,
  }
  return hostedCustomerRequestJourneyProofSchema.parse({
    kind: 'cold_external_agent_journey', agent: input.input.agent,
    release: journeyReleaseProjection(input.input, input.release),
    observedAt: new Date((input.input.now ?? Date.now)()).toISOString(),
    input: journeyProofInput(input.input, input.consumedFacts, input.consumedMessages),
    observedStates: input.states,
    authorityStops: input.authorityStops,
    final: {
      requestRef: input.requestRef,
      revision: cancelled.revision,
      state: 'cancelled',
      selectedBusiness: input.selectedBusiness,
      selectedBusinesses: input.selectedBusinesses,
      stepCount: input.route.stepCount,
      runState: 'cancelled',
      evidenceState: evidence.state,
      problemState: 'not_reported',
      resumedState: replayed.state,
      completedSteps: cancelled.progress.completed,
      dependencies: {
        completedBusinesses: cancelled.progress.dependencies?.completed.map(({ business }) => business) ?? [],
        blockedBusinesses: cancelled.progress.dependencies?.blocked.map(({ business }) => business) ?? [],
      },
      cancellation: {
        state: 'stopped',
        stoppedAt: typeof cancelled.activity?.cancellation === 'object'
          && cancelled.activity.cancellation.state === 'stopped'
          ? cancelled.activity.cancellation.stoppedAt
          : 0,
      },
    },
    measurements: journeyMeasurements(input.input, input.route, false, true),
    sandbox: true,
    claimBoundary: HOSTED_JOURNEY_CLAIM_BOUNDARY,
  })
}
