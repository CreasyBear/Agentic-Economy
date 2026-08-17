import { describe, expect, it } from 'vitest'

import type { KeylessExecutableToolDescriptor } from '@/modules/capability-execution'
import {
  answerNavigationBudgetExceeded,
  answerNavigationBudgetExhausted,
  answerRouteForbidsTool,
  initialAnswerOperationNavigationState,
  oneNativeBatchCoversRequestedIntents,
  reduceAnswerOperationNavigation,
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

const sharedRoute = {
  lane: 'operation',
  continuation: 'new',
  allowedReadToolFamily: 'shared',
  exactOperationDetailRequired: true,
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

  it('allows both read families on a shared route but still refuses effects', () => {
    expect(answerRouteForbidsTool(
      sharedRoute,
      'registry.search',
    )).toBe(false)
    expect(answerRouteForbidsTool(
      sharedRoute,
      'registry.detail',
    )).toBe(false)
    expect(answerRouteForbidsTool(
      sharedRoute,
      'registry.operations.search',
    )).toBe(false)
    expect(answerRouteForbidsTool(
      sharedRoute,
      'registry.operations.detail',
    )).toBe(false)
    expect(answerRouteForbidsTool(
      sharedRoute,
      'operation.execute',
    )).toBe(true)
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
          include_market_cap: {
            type: 'boolean',
            description: 'Whether to include the current market capitalization.',
          },
          include_source: {
            type: 'boolean',
            description: 'Whether to include the current price source.',
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
          include_market_cap: true,
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
        {
          intentId: 'market-cap',
          phrase: 'Include the current market capitalization',
          requestedResult: 'current market capitalization',
        },
      ],
    )).toBe(true)
    expect(oneNativeBatchCoversRequestedIntents(
      {
        input: {
          ids: 'bitcoin',
          vs_currencies: 'usd',
          include_source: true,
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
    )).toBe(false)
  })
})
