// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MarketToolSearchStatus } from './tools-search-page.contracts'
import { useCommandPaletteSelection } from './useCommandPaletteSelection'

type SelectionArgs = Parameters<typeof useCommandPaletteSelection>[0]

function keyEvent(key: string, extras: Partial<KeyboardEvent> = {}) {
  const preventDefault = vi.fn()
  const stopPropagation = vi.fn()
  const event = {
    key,
    preventDefault,
    stopPropagation,
    shiftKey: extras.shiftKey ?? false,
  }
  return { event, preventDefault, stopPropagation }
}

const baseArgs = (): SelectionArgs => {
  const input = document.createElement('input')
  input.value = 'live'
  const inputRef = { current: input }
  return {
    isActive: true,
    trimmedQuery: 'live',
    choices: [],
    isAwaitingChoices: true,
    toolChoiceValues: [] as const,
    navChoiceValues: ['ae-nav:/market'] as const,
    quickChoiceValues: ['ae-action:status'] as const,
    choiceValues: ['ae-nav:/market', 'ae-action:status'] as const,
    choiceValuesKey: 'ae-nav:/market\u001fae-action:status',
    inputRef,
    status: { kind: 'loading', query: 'live' } satisfies MarketToolSearchStatus,
    onSelectTool: vi.fn(),
    onQueryInputChange: vi.fn(),
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useCommandPaletteSelection', () => {
  it('records pending ArrowDown intent while awaiting catalog results', () => {
    const args = baseArgs()
    const { result } = renderHook(() => useCommandPaletteSelection(args))
    const { event, preventDefault, stopPropagation } = keyEvent('ArrowDown')
    act(() => {
      result.current.handleKeyDown(event as never)
    })
    expect(preventDefault).toHaveBeenCalled()
    expect(stopPropagation).toHaveBeenCalled()
  })

  it('defers to cmdk when mounted tool choices exist', () => {
    const args = baseArgs()
    const withChoices: SelectionArgs = {
      ...args,
      isAwaitingChoices: false,
      choices: [{
        kind: 'result',
        item: {
          toolRef: 'operation:v1:' + 'b'.repeat(64),
          title: 'B',
          providerLine: 'p · c',
          healthLabel: 'Operational',
          priceLabel: '$1',
        },
      }],
      toolChoiceValues: ['operation:v1:' + 'b'.repeat(64)],
    }
    const { result } = renderHook(() => useCommandPaletteSelection(withChoices))
    const { event, preventDefault } = keyEvent('ArrowDown')
    act(() => {
      result.current.handleKeyDown(event as never)
    })
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('activates the second catalog result after deferred search resolves', () => {
    const onSelectTool = vi.fn()
    const args = { ...baseArgs(), onSelectTool }
    const toolA = 'operation:v1:' + 'a'.repeat(64)
    const toolB = 'operation:v1:' + 'b'.repeat(64)
    const { result, rerender } = renderHook(
      (props: SelectionArgs) => useCommandPaletteSelection(props),
      { initialProps: args },
    )
    const down = keyEvent('ArrowDown')
    act(() => {
      result.current.handleKeyDown(down.event as never)
    })
    const enter = keyEvent('Enter')
    act(() => {
      result.current.handleKeyDown(enter.event as never)
    })
    const resolvedArgs: SelectionArgs = {
      ...args,
      isAwaitingChoices: false,
      choices: [
        {
          kind: 'result',
          item: {
            toolRef: toolA,
            title: 'A',
            providerLine: 'p · c',
            healthLabel: 'Operational',
            priceLabel: '$1',
          },
        },
        {
          kind: 'result',
          item: {
            toolRef: toolB,
            title: 'B',
            providerLine: 'p · c',
            healthLabel: 'Operational',
            priceLabel: '$2',
          },
        },
      ],
      toolChoiceValues: [toolA, toolB],
      choiceValues: ['ae-nav:/market', 'ae-action:status', toolA, toolB],
      choiceValuesKey: `ae-nav:/market\u001fae-action:status\u001f${toolA}\u001f${toolB}`,
      status: {
        kind: 'success' as const,
        query: 'live',
        count: 2,
        items: [
          {
            toolRef: toolA,
            title: 'A',
            providerLine: 'p · c',
            healthLabel: 'Operational' as const,
            priceLabel: '$1',
          },
          {
            toolRef: toolB,
            title: 'B',
            providerLine: 'p · c',
            healthLabel: 'Operational' as const,
            priceLabel: '$2',
          },
        ],
      } satisfies MarketToolSearchStatus,
    }
    act(() => {
      rerender(resolvedArgs as typeof args)
    })
    expect(onSelectTool).toHaveBeenCalledWith(toolB)
  })

  it('moves Tab focus to the first item in the next group', () => {
    const args = baseArgs()
    const { result } = renderHook(() => useCommandPaletteSelection(args))
    const { event, preventDefault } = keyEvent('Tab')
    act(() => {
      result.current.handleKeyDown(event as never)
    })
    expect(preventDefault).toHaveBeenCalled()
    expect(result.current.selectedValue).toBe('ae-action:status')
  })
})
