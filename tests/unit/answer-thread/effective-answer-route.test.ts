import { describe, expect, it } from 'vitest'

import {
  resolveEffectiveAnswerRoute,
  type EffectiveAnswerRoute,
} from '@/modules/answer-thread/internal/effective-answer-route'
import type {
  AnswerRequestInterpretation,
  FollowUpIntent,
} from '@/modules/answer-thread/answer-thread.schema'

const operationInterpretation: AnswerRequestInterpretation = {
  route: 'operation',
  requestedIntents: [{
    intentId: 'live-value',
    phrase: 'current live value',
    requestedResult: 'current value',
  }],
  continuation: 'new',
  effectPolicy: 'run_when_ready',
}

function resolve(input: {
  query: string
  intent?: FollowUpIntent
  interpretation?: AnswerRequestInterpretation
  priorTurnCount?: number
  priorProviderCount?: number
  priorOperationRef?: string
  querySafetyRefused?: boolean
  resuming?: boolean
}): EffectiveAnswerRoute {
  return resolveEffectiveAnswerRoute({
    query: input.query,
    querySafetyRefused: input.querySafetyRefused ?? false,
    intent: input.intent ?? 'refine_search',
    interpretation: input.interpretation,
    priorTurnCount: input.priorTurnCount ?? 0,
    priorProviderCount: input.priorProviderCount ?? 0,
    priorOperationRef: input.priorOperationRef,
    resuming: input.resuming ?? false,
  }).route
}

describe('resolveEffectiveAnswerRoute', () => {
  it('makes operation policy once for the agent to enforce', () => {
    expect(resolve({
      query: 'get the current live value',
      interpretation: operationInterpretation,
    })).toEqual({
      kind: 'tool_search',
      agent: {
        lane: 'operation',
        continuation: 'new',
        allowedReadToolFamily: 'operation',
        exactOperationDetailRequired: true,
        effectAllowed: true,
      },
      shouldRunBusinessRetrievalFirst: false,
    })
  })

  it('keeps operation reads available while forbidding effects for a candidate-only request', () => {
    expect(resolve({
      query: 'Search only and return the candidate; do not execute.',
      interpretation: {
        ...operationInterpretation,
        effectPolicy: 'candidate_only',
      },
    })).toMatchObject({
      kind: 'tool_search',
      agent: {
        lane: 'operation',
        allowedReadToolFamily: 'operation',
        exactOperationDetailRequired: true,
        effectAllowed: false,
      },
    })
  })

  it('deterministically overrides a new local-service query misrouted as an operation', () => {
    expect(resolve({
      query: 'find a plumber in Darwin tonight',
      interpretation: operationInterpretation,
    })).toEqual({
      kind: 'tool_search',
      agent: {
        lane: 'business',
        continuation: 'new',
        allowedReadToolFamily: 'business',
        exactOperationDetailRequired: false,
        effectAllowed: false,
      },
      shouldRunBusinessRetrievalFirst: true,
    })
  })

  it('does not override a frozen operation continuation', () => {
    expect(resolve({
      query: 'make it five',
      interpretation: {
        ...operationInterpretation,
        continuation: 'refine_prior_operation',
      },
      priorTurnCount: 1,
      priorOperationRef: `operation:v1:${'a'.repeat(64)}`,
    })).toMatchObject({
      kind: 'tool_search',
      agent: {
        lane: 'operation',
        continuation: 'refine_prior_operation',
      },
    })
  })

  it('keeps safety and boundary routes deterministic and agent-free', () => {
    expect(resolve({
      query: 'unsafe request',
      querySafetyRefused: true,
    })).toEqual({ kind: 'safety_refusal' })
    expect(resolve({
      query: 'why can you not do that?',
      intent: 'explain_boundary',
    })).toEqual({ kind: 'boundary_explain' })
  })

  it('uses frozen-empty rationale and corrective restart policies before the agent', () => {
    expect(resolve({
      query: 'why were there no matches?',
      intent: 'compare_known',
      priorTurnCount: 1,
      priorProviderCount: 0,
    })).toEqual({ kind: 'rationale' })
    expect(resolve({
      query: 'only licensed providers within 5 km',
      intent: 'filter_known',
      priorTurnCount: 1,
      priorProviderCount: 0,
    })).toMatchObject({ kind: 'tool_search' })
  })

  it('uses initial retrieval only for a fresh one-word search', () => {
    expect(resolve({
      query: 'plumber',
      interpretation: {
        route: 'business',
        requestedIntents: [{
          intentId: 'plumber',
          phrase: 'plumber',
          requestedResult: 'providers',
        }],
        continuation: 'new',
        effectPolicy: 'run_when_ready',
      },
    })).toMatchObject({
      kind: 'initial_retrieval',
      agent: { lane: 'business' },
      shouldRunBusinessRetrievalFirst: true,
    })
    expect(resolve({
      query: 'plumber',
      interpretation: operationInterpretation,
      resuming: true,
    }).kind).toBe('tool_search')
  })
})
