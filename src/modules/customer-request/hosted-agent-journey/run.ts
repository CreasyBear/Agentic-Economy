import { randomUUID } from 'node:crypto'

import { canonicalDigest } from '@/modules/common/canonical-digest'

import {
  customerRequestJsonValueSchema,
  customerRequestSubmitInputSchema,
  type CustomerRequestView,
} from '../agent-contract'
import {
  HOSTED_JOURNEY_CLAIM_BOUNDARY,
  hostedCustomerRequestJourneyProofSchema,
  type HostedCustomerRequestJourneyInput,
  type HostedCustomerRequestJourneyProof,
  type HostedCustomerRequestJourneyRuntimeInput,
  type JourneyMetrics,
} from './types'
import {
  assertCancelledExecutionStartReplay,
  assertExpectedRoute,
  assertExecutionStartReplay,
  assertJourneyBaseUrl,
  callAgent,
  callAgentEvidence,
  callAgentProblem,
  callObservedAgent,
  confirmThroughRepeatPermission,
  defaultSleep,
  digestInput,
  journeyEnvironment,
  journeyMeasurements,
  journeyProofInput,
  journeyReleaseProjection,
  observe,
  observedNavigationAction,
  observedNavigationPath,
  materializeObservedInput,
  requiredRouteGenerationRef,
  submitWithInterpreterRecovery,
} from './runtime'
import { proveAnonymousRefusal, proveDiscovery } from './discovery'
import {
  adapterCancellationHostedJourney,
  cancelAfterCurrentHostedJourney,
} from './cancel'
import {
  completeHostedJourney,
  outcomeUnknownHostedJourney,
  providerDeniedHostedJourney,
} from './happy'
import { partialResultHostedJourney } from './partial'

export async function runHostedCustomerRequestJourney(
  input: HostedCustomerRequestJourneyInput,
): Promise<HostedCustomerRequestJourneyProof> {
  assertJourneyBaseUrl(input.baseUrl, journeyEnvironment(input), input.trustedDevelopmentOrigin)
  const metrics: JourneyMetrics = {
    startedAt: (input.now ?? Date.now)(), requestCalls: 0, clarifications: 0,
    executionStartReplay: 'not_proven', mutations: [],
    discovery: { state: 'not_proven', reason: 'verification_override' },
  }
  const release = await input.verifyRelease()
  if (release.revision !== input.expectedRevision || release.deploymentId !== input.expectedDeploymentId) {
    throw new Error('hosted_journey_release_mismatch')
  }
  const discovery = await (input.verifyDiscovery ?? (() => proveDiscovery(input)))()
  const requestEntrypointPath = discovery?.requestOperation.path ?? '/api/v1/requests'
  await (input.verifyAnonymousRefusal ?? (() => proveAnonymousRefusal(input, requestEntrypointPath)))()
  if (discovery !== undefined) {
    metrics.discovery = { ...discovery, anonymousRefusal: 'authentication_required' }
  }
  const runtimeInput: HostedCustomerRequestJourneyRuntimeInput = {
    ...input,
    metrics,
    requestEntrypointPath,
  }

  const nonce = randomUUID()
  const requestRef = `acceptance:${nonce}`
  const states: CustomerRequestView['state'][] = []
  const authorityStops: Array<'route_confirmation'> = []
  const consumedFacts: Array<{ requirementKey: string; valueDigest: string }> = []
  const consumedMessages: Array<{ index: number; valueDigest: string }> = []
  const submit = customerRequestSubmitInputSchema.parse({
    idempotencyKey: `acceptance:submit:${nonce}`, requestRef,
    agentRef: `${input.agent.name}:${input.agent.version}`, request: input.scenario.request,
  })
  let view = await submitWithInterpreterRecovery(runtimeInput, submit)
  const replay = await callAgent(
    runtimeInput, requestEntrypointPath, 'POST', submit, [200], 'automatic_replay',
  )
  if (JSON.stringify(view) !== JSON.stringify(replay)) throw new Error('hosted_journey_submit_replay_changed')
  observe(states, view)

  let messageIndex = 0
  let transitions = 0
  let expiredChoice: Readonly<{ generationRef: string; routeRef: string }> | undefined
  let unsupportedRevision: number | undefined
  while (transitions < 24) {
    transitions += 1
    if (view.state === 'needs_information') {
      metrics.clarifications += 1
      const clarification = view.clarification
      if (clarification === undefined) throw new Error('hosted_journey_clarification_missing')
      if (clarification.kind === 'intent_direction') {
        const message = input.scenario.messages[messageIndex]
        if (message === undefined) throw new Error(`hosted_journey_message_missing:${clarification.prompt}`)
        view = await callObservedAgent(runtimeInput, view, 'answer_clarification', {
          '<unique string>': `acceptance:message:${nonce}:${messageIndex}`,
          '<natural-language answer>': message,
        })
        consumedMessages.push({ index: messageIndex, valueDigest: canonicalDigest(message) })
        messageIndex += 1
      } else {
        const fact = clarification.requirementKey in input.scenario.facts
          ? input.scenario.facts[clarification.requirementKey]
          : input.scenario.facts['*']
        if (fact === undefined) {
          throw new Error(`hosted_journey_fact_missing:${clarification.requirementKey}`)
        }
        view = await callObservedAgent(runtimeInput, view, 'answer_clarification', {
          '<unique string>': `acceptance:fact:${nonce}:${clarification.requirementKey}`,
          '<typed value>': customerRequestJsonValueSchema.parse(fact),
        })
        consumedFacts.push({
          requirementKey: clarification.requirementKey,
          valueDigest: digestInput(fact),
        })
      }
      observe(states, view)
      continue
    }

    if (view.state === 'ready_to_compare') {
      view = await callObservedAgent(runtimeInput, view, 'prepare_options', {
        '<unique string>': `acceptance:prepare:${nonce}:${view.revision}`,
      }, [200, 202])
      observe(states, view)
      continue
    }

    if (view.state === 'routes_ready') {
      const route = view.decision?.routes[0]
      const selectedBusinesses = route?.businesses.map(({ name }) => name) ?? []
      const selectedBusiness = selectedBusinesses[0]
      if (route === undefined || selectedBusiness === undefined) throw new Error('hosted_journey_route_missing')
      assertExpectedRoute(input.scenario.expectedRoute, route)
      if (unsupportedRevision !== undefined && runtimeInput.metrics.unsupportedRecovery === undefined) {
        if (view.revision <= unsupportedRevision) throw new Error('hosted_journey_unsupported_revision_not_advanced')
        runtimeInput.metrics.unsupportedRecovery = {
          state: 'verified',
          unsupportedRevision,
          recoveredRevision: view.revision,
          authorityCreatedBeforeRecovery: false,
          executionStartedBeforeRecovery: false,
        }
      }
      if (expiredChoice !== undefined) {
        if (view.routeGenerationRef === expiredChoice.generationRef || route.routeRef === expiredChoice.routeRef) {
          throw new Error('hosted_journey_expired_choice_not_refreshed')
        }
        runtimeInput.metrics.staleOptionRecovery = {
          state: 'verified',
          expiredGenerationRef: expiredChoice.generationRef,
          expiredRouteRef: expiredChoice.routeRef,
          refreshedGenerationRef: requiredRouteGenerationRef(view),
          refreshedRouteRef: route.routeRef,
          staleConfirmationCreated: false,
          staleExecutionStarted: false,
          restoredReason: 'choice_expired',
          workRestarted: false,
        }
      }
      if (!authorityStops.includes('route_confirmation')) authorityStops.push('route_confirmation')
      if (input.scenario.expiryRecovery !== undefined && expiredChoice === undefined) {
        if (!Number.isSafeInteger(input.scenario.expiryRecovery.waitMs)
          || input.scenario.expiryRecovery.waitMs <= 0) {
          throw new Error('hosted_journey_expiry_wait_invalid')
        }
        await (input.sleep ?? defaultSleep)(input.scenario.expiryRecovery.waitMs)
        const expired = await callObservedAgent(
          runtimeInput, view, 'confirm_option',
          {
            '<unique string>': `acceptance:confirm-expired:${nonce}:${view.revision}`,
            '<routeRef from decision.routes>': route.routeRef,
          },
        )
        observe(states, expired)
        if (expired.state !== 'needs_attention'
          || expired.decision?.outcome.kind !== 'routes_expired'
          || expired.confirmation !== undefined
          || expired.navigation?.actions.some(({ relation }) => relation === 'start_confirmed_option')) {
          throw new Error(`hosted_journey_expired_confirmation_not_rejected:${expired.state}`)
        }
        expiredChoice = {
          generationRef: requiredRouteGenerationRef(view),
          routeRef: route.routeRef,
        }
        const restoredExpired = await callObservedAgent(
          runtimeInput, expired, 'inspect_progress', undefined, [200],
        )
        observe(states, restoredExpired)
        if (restoredExpired.state !== 'needs_attention'
          || restoredExpired.recovery?.reason !== 'choice_expired'
          || restoredExpired.recovery.workRestarted !== false
          || restoredExpired.confirmation !== undefined
          || restoredExpired.navigation?.actions.some(({ relation }) => relation === 'start_confirmed_option')) {
          throw new Error('hosted_journey_expired_restoration_not_proven')
        }
        view = await callObservedAgent(runtimeInput, expired, 'prepare_options', {
          '<unique string>': `acceptance:refresh-expired:${nonce}:${view.revision}`,
        }, [200, 202])
        observe(states, view)
        continue
      }
      view = input.scenario.repeatPermission === undefined
        ? await callObservedAgent(
            runtimeInput, view, 'confirm_option',
            {
              '<unique string>': `acceptance:confirm:${nonce}:${view.revision}`,
              '<routeRef from decision.routes>': route.routeRef,
            },
          )
        : await confirmThroughRepeatPermission(
            runtimeInput,
            view,
            route,
            input.scenario.repeatPermission,
            nonce,
          )
      observe(states, view)
      if (view.state !== 'route_confirmed') throw new Error(`hosted_journey_confirmation_failed:${view.state}`)
      const startAction = observedNavigationAction(runtimeInput, view, 'start_confirmed_option')
      if (startAction.method !== 'POST') throw new Error('hosted_journey_navigation_method:start_confirmed_option')
      const startCommand = materializeObservedInput(view, startAction, {
        '<unique string>': `acceptance:run:${nonce}`,
      })
      view = await callAgent(
        runtimeInput, startAction.path, startAction.method, startCommand, [200], 'observed_navigation',
      )
      observe(states, view)
      if (view.state !== 'in_progress') throw new Error(`hosted_journey_run_failed:${view.state}`)
      const progressPath = observedNavigationPath(input, view, 'inspect_progress', 'GET')
      const evidencePath = observedNavigationPath(input, view, 'inspect_evidence', 'GET')
      if (input.scenario.finish === 'cancel_after_current') {
        return await cancelAfterCurrentHostedJourney({
          input: runtimeInput, release, requestRef, route, selectedBusiness, selectedBusinesses,
          states, authorityStops, consumedFacts, consumedMessages, progressPath, evidencePath,
          started: view, startAction, startCommand, nonce,
        })
      }
      if (input.scenario.finish === 'adapter_cancel_accepted'
        || input.scenario.finish === 'adapter_cancel_rejected'
        || input.scenario.finish === 'adapter_cancel_unknown') {
        return await adapterCancellationHostedJourney({
          input: runtimeInput, release, requestRef, route, selectedBusiness, selectedBusinesses,
          states, authorityStops, consumedFacts, consumedMessages, progressPath, evidencePath,
          started: view, startAction, startCommand, nonce,
          expected: input.scenario.finish === 'adapter_cancel_accepted'
            ? 'accepted'
            : input.scenario.finish === 'adapter_cancel_rejected' ? 'rejected' : 'unknown',
        })
      }
      if ((input.scenario.finish ?? 'cancel') === 'cancel') {
        const problemAction = observedNavigationAction(input, view, 'report_problem')
        if (problemAction.method !== 'POST') throw new Error('hosted_journey_navigation_method:report_problem')
        const cancelled = await callObservedAgent(
          runtimeInput, view, 'cancel',
          { '<unique string>': `acceptance:cancel:${nonce}` },
        )
        observe(states, cancelled)
        if (cancelled.state !== 'cancelled') throw new Error(`hosted_journey_cancellation_failed:${cancelled.state}`)
        const startReplay = await callAgent(
          runtimeInput, startAction.path, startAction.method, startCommand, [200], 'automatic_replay',
        )
        assertCancelledExecutionStartReplay(view, cancelled, startReplay)
        runtimeInput.metrics.executionStartReplay = 'same_request_monotonic_progress'
        const evidence = await callAgentEvidence(runtimeInput, evidencePath)
        if (evidence.state !== 'queued' && evidence.state !== 'running' && evidence.state !== 'cancelled') {
          throw new Error(`hosted_journey_evidence_state:${evidence.state}`)
        }
        const problem = await callAgentProblem(runtimeInput, problemAction.path, materializeObservedInput(view, problemAction, {
          '<unique string>': `acceptance:problem:${nonce}`,
          '<incorrect_result | unexpected_cost | duplicate_charge_or_effect | privacy_concern | could_not_stop | other>': 'other',
          '<problem summary>': 'Labelled sandbox recovery verification.',
          '<step number from evidence>': 1,
        }))
        const resumed = await callAgent(runtimeInput, progressPath, 'GET')
        observe(states, resumed)
        if (resumed.state !== 'cancelled') throw new Error(`hosted_journey_cancel_resume_failed:${resumed.state}`)
        const cancellation = resumed.activity?.cancellation
        if (typeof cancellation !== 'object' || cancellation.state !== 'stopped') {
          throw new Error('hosted_journey_cancel_timing_missing')
        }
        return hostedCustomerRequestJourneyProofSchema.parse({
          kind: 'cold_external_agent_journey', agent: input.agent,
          release: journeyReleaseProjection(input, release),
          observedAt: new Date((input.now ?? Date.now)()).toISOString(),
          input: journeyProofInput(runtimeInput, consumedFacts, consumedMessages),
          observedStates: states, authorityStops,
          final: {
            requestRef, revision: resumed.revision, state: resumed.state, selectedBusiness, selectedBusinesses,
            stepCount: route.stepCount, runState: 'cancelled',
            evidenceState: evidence.state, problemState: problem.state, resumedState: resumed.state,
            cancellation: { state: cancellation.state, stoppedAt: cancellation.stoppedAt },
          },
          measurements: journeyMeasurements(runtimeInput, route, false, true),
          sandbox: true,
          claimBoundary: HOSTED_JOURNEY_CLAIM_BOUNDARY,
        })
      }
      const startReplay = await callAgent(
        runtimeInput, startAction.path, startAction.method, startCommand, [200], 'automatic_replay',
      )
      assertExecutionStartReplay(view, startReplay)
      runtimeInput.metrics.executionStartReplay = 'same_request_monotonic_progress'
      if (input.scenario.finish === 'complete') {
        return await completeHostedJourney({
          input: runtimeInput, release, requestRef, route, selectedBusiness, selectedBusinesses,
          states, authorityStops, consumedFacts, consumedMessages, progressPath, evidencePath,
          started: startReplay,
        })
      }
      const problemAction = observedNavigationAction(input, view, 'report_problem')
      if (problemAction.method !== 'POST') throw new Error('hosted_journey_navigation_method:report_problem')
      if (input.scenario.finish === 'outcome_unknown') {
        return await outcomeUnknownHostedJourney({
          input: runtimeInput, release, requestRef, route, selectedBusiness, selectedBusinesses,
          states, authorityStops, consumedFacts, consumedMessages, progressPath, evidencePath,
          problemAction, started: view, nonce,
          failureClass: 'outcome_unknown',
          problemCategory: 'other',
          problemSummary: 'The labelled sandbox provider outcome is unknown after release.',
        })
      }
      if (input.scenario.finish === 'invalid_output') {
        return await outcomeUnknownHostedJourney({
          input: runtimeInput, release, requestRef, route, selectedBusiness, selectedBusinesses,
          states, authorityStops, consumedFacts, consumedMessages, progressPath, evidencePath,
          problemAction, started: view, nonce,
          failureClass: 'invalid_output',
          problemCategory: 'incorrect_result',
          problemSummary: 'The labelled sandbox provider returned output that did not match the registered result contract.',
        })
      }
      if (input.scenario.finish === 'partial_result') {
        return await partialResultHostedJourney({
          input: runtimeInput, release, requestRef, route, selectedBusiness, selectedBusinesses,
          states, authorityStops, consumedFacts, consumedMessages, progressPath, evidencePath,
          problemAction, started: view, nonce,
        })
      }
      if (input.scenario.finish === 'provider_denied') {
        return await providerDeniedHostedJourney({
          input: runtimeInput, release, requestRef, route, selectedBusiness, selectedBusinesses,
          states, authorityStops, consumedFacts, consumedMessages, progressPath, evidencePath,
          problemAction, started: view, nonce,
        })
      }
      throw new Error(`hosted_journey_finish_unhandled:${input.scenario.finish}`)
    }

    if (view.state === 'preparing_options') {
      await (input.sleep ?? defaultSleep)(1_000)
      view = await callObservedAgent(runtimeInput, view, 'inspect_progress', undefined, [200, 202])
      observe(states, view)
      continue
    }

    if (view.state === 'unsupported' && input.scenario.unsupportedRecovery !== undefined
      && unsupportedRevision === undefined) {
      const recoveryMessage = input.scenario.unsupportedRecovery.message.trim()
      if (recoveryMessage.length === 0) throw new Error('hosted_journey_unsupported_recovery_message_missing')
      if (view.confirmation !== undefined || view.decision !== undefined
        || view.navigation?.actions.some(({ relation }) =>
          relation === 'confirm_option' || relation === 'start_confirmed_option')) {
        throw new Error('hosted_journey_unsupported_created_authority')
      }
      unsupportedRevision = view.revision
      const recoveryAction = observedNavigationAction(runtimeInput, view, 'change_request')
      if (recoveryAction.method !== 'POST') {
        throw new Error('hosted_journey_navigation_method:change_request')
      }
      const recoveryCommand = materializeObservedInput(view, recoveryAction, {
        '<unique string>': `acceptance:unsupported-recovery:${nonce}:${view.revision}`,
        '<natural-language change>': recoveryMessage,
      })
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        view = await callAgent(
          runtimeInput, recoveryAction.path, recoveryAction.method, recoveryCommand, [200],
          attempt === 1 ? 'observed_navigation' : 'automatic_replay',
        )
        observe(states, view)
        if (view.state !== 'needs_attention' || view.nextAction !== 'retry'
          || view.revision !== unsupportedRevision) break
        if (attempt === 3) throw new Error('hosted_journey_unsupported_recovery_exhausted')
        await (input.sleep ?? defaultSleep)(1_000)
      }
      consumedMessages.push({ index: messageIndex, valueDigest: canonicalDigest(recoveryMessage) })
      messageIndex += 1
      continue
    }

    if (view.state === 'needs_attention' && view.nextAction === 'retry'
      && expiredChoice !== undefined && runtimeInput.metrics.staleOptionRecovery === undefined) {
      await (input.sleep ?? defaultSleep)(1_000)
      view = await callObservedAgent(runtimeInput, view, 'prepare_options', {
        '<unique string>': `acceptance:retry-expired:${nonce}:${transitions}`,
      }, [200, 202])
      observe(states, view)
      continue
    }

    if (view.state === 'unsupported' || view.state === 'no_options' || view.state === 'needs_attention'
      || view.state === 'outcome_unknown' || view.state === 'completed' || view.state === 'failed'
      || view.state === 'options_ready' || view.state === 'needs_authorization'
      || view.state === 'route_confirmed' || view.state === 'in_progress' || view.state === 'cancelled') {
      throw new Error(
        `hosted_journey_stopped:${view.state}:revision=${view.revision}:transition=${transitions}`
        + `:states=${states.join('>')}:${view.summary}`,
      )
    }
  }
  throw new Error('hosted_journey_transition_limit_exceeded')
}
