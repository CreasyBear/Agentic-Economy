import { describe, expect, it } from 'vitest'

import type { KeylessExecutableToolDescriptor } from '@/modules/capability-execution'
import {
  answerNavigationBudgetExceeded,
  answerNavigationBudgetExhausted,
  answerNavigationStepPolicy,
  answerRouteForbidsTool,
  initialAnswerOperationNavigationState,
  oneNativeBatchCoversRequestedIntents,
  reduceAnswerOperationNavigation,
  shouldRunStagedAnswerNavigation,
} from '@/modules/answer/internal/answer-navigation-policy'
import type { EffectiveAnswerAgentRoute } from '@/modules/answer/public'

const operationRoute = {
  lane: 'operation',
  continuation: 'new',
  allowedReadToolFamily: 'operation',
  exactOperationDetailRequired: true,
  effectAllowed: true,
} as const satisfies EffectiveAnswerAgentRoute

const businessRoute = {
  lane: 'business',
  continuation: 'new',
  allowedReadToolFamily: 'business',
  exactOperationDetailRequired: false,
  effectAllowed: false,
} as const satisfies EffectiveAnswerAgentRoute

describe('answer navigation policy', () => {
  it('enforces the orchestrator-selected read family and effect policy', () => {
    expect(answerRouteForbidsTool(
      operationRoute,
      'registry.search',
    )).toBe(true)
    expect(answerRouteForbidsTool(
      operationRoute,
      'registry.operations.search',
    )).toBe(false)
    expect(answerRouteForbidsTool(
      businessRoute,
      'registry.operations.detail',
    )).toBe(true)
    expect(answerRouteForbidsTool(
      businessRoute,
      'operation.execute',
    )).toBe(true)
    expect(answerRouteForbidsTool(
      businessRoute,
      'registry.detail',
    )).toBe(false)
  })

  it('starts staged navigation only when unresolved evidence needs it', () => {
    const base = {
      route: operationRoute,
      hasSelectedOperation: false,
      hasKeylessDataAsk: true,
      resumeNavigation: false,
      hasExplicitSelection: false,
      resumedHasEffectSelection: false,
    }
    expect(shouldRunStagedAnswerNavigation(base)).toBe(true)
    expect(shouldRunStagedAnswerNavigation({
      ...base,
      hasSelectedOperation: true,
    })).toBe(false)
    expect(shouldRunStagedAnswerNavigation({
      ...base,
      hasExplicitSelection: true,
    })).toBe(false)
  })

  it('forces operation search first and requires any read for unresolved business discovery', () => {
    expect(answerNavigationStepPolicy({
      route: operationRoute,
      toolCalls: [],
      candidates: [],
      navigationReadCallAttempts: 0,
      maxToolCalls: 4,
    })).toEqual({
      readBudgetAvailable: true,
      forcedToolId: 'registry.operations.search',
      requireAnyRead: false,
    })
    expect(answerNavigationStepPolicy({
      route: businessRoute,
      toolCalls: [],
      candidates: [],
      navigationReadCallAttempts: 0,
      maxToolCalls: 4,
    })).toEqual({
      readBudgetAvailable: true,
      requireAnyRead: true,
    })
  })

  it('reduces read/effect budgets and effect unlock as explicit state transitions', () => {
    const initial = initialAnswerOperationNavigationState({
      toolCalls: [],
      effectUnlocked: false,
    })
    expect(answerNavigationBudgetExceeded({
      state: initial,
      effect: true,
      maxNavigationCalls: 4,
      maxEffectCalls: 1,
    })).toBe(false)
    const read = reduceAnswerOperationNavigation(
      initial,
      { kind: 'tool_attempted', effect: false },
    )
    const unlocked = reduceAnswerOperationNavigation(
      read,
      { kind: 'effect_unlocked' },
    )
    const effected = reduceAnswerOperationNavigation(
      unlocked,
      { kind: 'tool_attempted', effect: true },
    )
    expect(effected).toEqual({
      navigationReadCallAttempts: 1,
      effectCallAttempts: 1,
      effectUnlocked: true,
    })
    expect(answerNavigationBudgetExhausted({
      state: effected,
      maxNavigationCalls: 4,
      maxEffectCalls: 1,
    })).toBe(true)
  })

  it('accepts multi-intent execution only when one declared array covers every result', () => {
    const descriptor: KeylessExecutableToolDescriptor = {
      operationRef: `operation:v1:${'a'.repeat(64)}`,
      capabilityId: 'batch.lookup',
      name: 'Batch lookup',
      summary: 'Looks up several values.',
      searchTerms: ['batch'],
      inputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { type: 'string' } },
        },
        required: ['items'],
        additionalProperties: false,
      },
    }
    const requestedIntents = [
      { intentId: 'one', phrase: 'one', requestedResult: 'Alpha' },
      { intentId: 'two', phrase: 'two', requestedResult: 'Beta' },
    ]
    expect(oneNativeBatchCoversRequestedIntents(
      { input: { items: ['Alpha', 'Beta'] } },
      descriptor,
      requestedIntents,
    )).toBe(true)
    expect(oneNativeBatchCoversRequestedIntents(
      { input: { items: ['Alpha'] } },
      descriptor,
      requestedIntents,
    )).toBe(false)
  })

  it('treats a requested optional output modifier as part of one native result', () => {
    const descriptor: KeylessExecutableToolDescriptor = {
      operationRef: `operation:v1:${'b'.repeat(64)}`,
      capabilityId: 'price.lookup',
      name: 'Price lookup',
      summary: 'Looks up current prices and optional change fields.',
      searchTerms: ['price'],
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'string',
            description: 'Comma-separated asset ids.',
          },
          vs_currencies: {
            type: 'string',
            description: 'Comma-separated quote currencies.',
          },
          include_change: {
            type: 'boolean',
            description: 'Whether to include the 24-hour percentage price change.',
          },
        },
        required: ['ids', 'vs_currencies'],
        additionalProperties: false,
      },
    }
    expect(oneNativeBatchCoversRequestedIntents(
      {
        input: {
          ids: 'bitcoin',
          vs_currencies: 'usd',
          include_change: true,
        },
      },
      descriptor,
      [
        {
          intentId: 'price',
          phrase: "Bitcoin's current price in USD",
          requestedResult: 'Bitcoin current price in USD',
        },
        {
          intentId: 'change',
          phrase: 'Include the 24-hour percentage change',
          requestedResult: '24-hour percentage change',
        },
      ],
    )).toBe(true)
  })
})
