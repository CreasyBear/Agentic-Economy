import type {
  AnswerContinuation,
  AnswerRequestInterpretation,
  EffectiveAnswerAgentRoute,
} from '@/modules/answer/answer-schema'
import { hasAnswerServiceSignal } from './answer-response-planner'
import {
  isCorrectiveSearchFollowUp,
  isRationaleFollowUpQuery,
  shouldOverrideOperationRouteForBusiness,
} from './answer-continuation-state'
import { resolveIntentRoute, type IntentRoute } from './intent-router'
import type { FollowUpIntent } from '../answer-thread.schema'

type AgentRouteKind = 'initial_retrieval' | 'tool_search'
type DeterministicRouteKind =
  | Exclude<IntentRoute['kind'], 'tool_search'>
  | 'rationale'
  | 'safety_refusal'

export type EffectiveAnswerRoute =
  | Readonly<{
      kind: AgentRouteKind
      agent: EffectiveAnswerAgentRoute
      shouldRunBusinessRetrievalFirst: boolean
    }>
  | Readonly<{
      kind: DeterministicRouteKind
    }>

export type EffectiveAnswerRouteDecision = Readonly<{
  route: EffectiveAnswerRoute
  shouldBuildCorrectiveRegistryQuery: boolean
}>

function agentRouteFor(input: {
  interpretation: AnswerRequestInterpretation | undefined
  operationRouteOverridden: boolean
}): EffectiveAnswerAgentRoute {
  const continuation: AnswerContinuation =
    input.interpretation?.continuation ?? 'new'
  const lane =
    (
      input.interpretation?.route === 'operation'
      || input.interpretation?.route === 'confirmation'
    )
    && !input.operationRouteOverridden
      ? 'operation'
      : 'business'

  return {
    lane,
    continuation,
    allowedReadToolFamily: lane,
    exactOperationDetailRequired: lane === 'operation',
    effectAllowed:
      lane === 'operation'
      && input.interpretation?.effectPolicy !== 'candidate_only',
  }
}

export function resolveEffectiveAnswerRoute(input: {
  query: string
  registryQuery?: string
  querySafetyRefused: boolean
  intent: FollowUpIntent
  interpretation: AnswerRequestInterpretation | undefined
  priorTurnCount: number
  priorProviderCount: number
  priorOperationRef: string | undefined
  resuming: boolean
}): EffectiveAnswerRouteDecision {
  if (input.querySafetyRefused) {
    return {
      route: { kind: 'safety_refusal' },
      shouldBuildCorrectiveRegistryQuery: false,
    }
  }

  const baseRoute = resolveIntentRoute(input.intent)
  const rationaleRoute =
    input.priorTurnCount > 0
    && input.priorProviderCount === 0
    && isRationaleFollowUpQuery(input.query)
    && baseRoute.kind !== 'boundary_explain'
    && baseRoute.kind !== 'unsupported'
  const restartRoute =
    input.priorProviderCount === 0
    && isCorrectiveSearchFollowUp(input.query)
    && (
      baseRoute.kind === 'frozen_filter'
      || baseRoute.kind === 'frozen_compare'
    )

  if (rationaleRoute) {
    return {
      route: { kind: 'rationale' },
      shouldBuildCorrectiveRegistryQuery: false,
    }
  }

  const operationRouteOverridden =
    shouldOverrideOperationRouteForBusiness(input)
  const agent = agentRouteFor({
    interpretation: input.interpretation,
    operationRouteOverridden,
  })
  const initialRetrieval =
    !restartRoute
    && !input.resuming
    && input.priorTurnCount === 0
    && baseRoute.kind === 'tool_search'
    && input.query.trim().split(/\s+/).length === 1

  if (initialRetrieval) {
    return {
      route: {
        kind: 'initial_retrieval',
        agent,
        shouldRunBusinessRetrievalFirst:
          input.interpretation?.route !== 'operation'
          || operationRouteOverridden,
      },
      shouldBuildCorrectiveRegistryQuery: false,
    }
  }

  if (restartRoute || baseRoute.kind === 'tool_search') {
    return {
      route: {
        kind: 'tool_search',
        agent,
        shouldRunBusinessRetrievalFirst:
          input.interpretation?.route !== 'operation'
            ? hasAnswerServiceSignal(input.registryQuery ?? input.query)
            : operationRouteOverridden,
      },
      shouldBuildCorrectiveRegistryQuery: input.priorProviderCount === 0,
    }
  }

  return {
    route: baseRoute,
    shouldBuildCorrectiveRegistryQuery: false,
  }
}
