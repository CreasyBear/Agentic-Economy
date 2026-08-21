import { describe, expect, it } from 'vitest'

import type { KeylessExecutableToolDescriptor } from '@/modules/capability-execution'
import {
  answerNavigationBudgetExceeded,
  answerNavigationBudgetExhausted,
  answerRouteForbidsTool,
  completedOperationDetailResult,
  initialAnswerOperationNavigationState,
  inspectEvidenceHasOperationRef,
  nextToolLoopStep,
  oneNativeBatchCoversRequestedIntents,
  reduceAnswerOperationNavigation,
  selectedOperationRefFromCompletedDetail,
} from '@/modules/answer/internal/answer-navigation-policy'
import type { AnswerToolCallRecord } from '@/modules/answer-thread/tooling'
import type { EffectiveAnswerAgentRoute } from '@/modules/answer/public'
import { stagedDetailResult } from './answer-selected-operation-loop-harness'

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

const operationRef = `operation:v1:${'a'.repeat(64)}`

function toolCall(
  toolId: AnswerToolCallRecord['toolId'],
  result: unknown,
  input: Readonly<Record<string, unknown>> = {},
): AnswerToolCallRecord {
  return {
    toolCallId: `call-${toolId}`,
    turnId: 'turn-1',
    seq: 1,
    toolId,
    inputJson: JSON.stringify(input),
    resultSummaryJson: '{}',
    resultJson: JSON.stringify(result),
    resultHash: 'hash',
    status: 'complete',
    createdAt: 1,
  }
}

const inspectTools = [
  'registry.search',
  'registry.detail',
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
  'operation.execute',
] as const

const idleNavigation = initialAnswerOperationNavigationState({
  toolCalls: [],
  effectUnlocked: true,
})

function loopStep(
  toolCalls: readonly AnswerToolCallRecord[],
  route: EffectiveAnswerAgentRoute = operationRoute,
  allowedToolIds: readonly string[] = inspectTools,
) {
  return nextToolLoopStep({
    route,
    toolCalls,
    navigationState: idleNavigation,
    allowedToolIds,
    maxNavigationCalls: 4,
    maxEffectCalls: 1,
    unsafeOperationOutput: false,
    toolExecutionError: false,
    selectedOperationRef: selectedOperationRefFromCompletedDetail(toolCalls),
  })
}

describe('nextToolLoopStep', () => {
  it('keeps inspect required until an operation inspect returns an operationRef', () => {
    const businessSearch = [
      toolCall('registry.search', { kind: 'ok', items: [] }),
    ]
    const step = loopStep(businessSearch)
    expect(step).toEqual({
      kind: 'inspect',
      activeToolIds: [...inspectTools],
      toolChoice: 'required',
    })
  })

  it('does not unlock operation.execute from search evidence alone', () => {
    const search = [
      toolCall('registry.operations.search', {
        kind: 'ok',
        items: [{ operationRef }],
      }),
    ]
    expect(inspectEvidenceHasOperationRef(search)).toBe(true)
    expect(selectedOperationRefFromCompletedDetail(search)).toBeUndefined()
    const step = loopStep(search)
    expect(step.kind).toBe('inspect')
    expect(step.toolChoice).toBe('required')
    expect(step.activeToolIds).not.toContain('operation.execute')
  })

  it('keeps operation.execute required after completed detail of the selected ordinal', () => {
    const detail = [
      toolCall(
        'registry.operations.detail',
        stagedDetailResult,
        { operationRef },
      ),
    ]
    expect(completedOperationDetailResult(detail, operationRef)).toBeDefined()
    expect(selectedOperationRefFromCompletedDetail(detail)).toBe(operationRef)
    const step = loopStep(detail)
    expect(step.kind).toBe('execute')
    expect(step.toolChoice).toBe('required')
    expect(step.activeToolIds).toContain('operation.execute')
  })

  it('turns tools off after an effect attempt even when a ref is still in evidence', () => {
    const search = toolCall('registry.operations.search', {
      kind: 'ok',
      items: [{ operationRef }],
    })
    const effected = reduceAnswerOperationNavigation(
      idleNavigation,
      { kind: 'tool_attempted', effect: true },
    )
    expect(nextToolLoopStep({
      route: operationRoute,
      toolCalls: [search],
      navigationState: effected,
      allowedToolIds: inspectTools,
      maxNavigationCalls: 4,
      maxEffectCalls: 1,
      unsafeOperationOutput: false,
      toolExecutionError: false,
      selectedOperationRef: selectedOperationRefFromCompletedDetail([search]),
    }).kind).toBe('prose')
  })

  it('turns tools off when an operation inspect completed with no executable ref', () => {
    const emptySearch = [
      toolCall('registry.operations.search', { kind: 'ok', items: [] }),
    ]
    expect(inspectEvidenceHasOperationRef(emptySearch)).toBe(false)
    expect(loopStep(emptySearch).kind).toBe('prose')
  })

  it('keeps inspect tools and drops execute when the route forbids effects', () => {
    const search = [
      toolCall('registry.operations.search', {
        kind: 'ok',
        items: [{ operationRef }],
      }),
    ]
    const step = loopStep(
      search,
      { ...operationRoute, effectAllowed: false },
      inspectTools.filter((id) => id !== 'operation.execute'),
    )
    expect(step.kind).toBe('inspect')
    expect(step.toolChoice).toBe('auto')
    expect(step.activeToolIds).not.toContain('operation.execute')
  })
})
