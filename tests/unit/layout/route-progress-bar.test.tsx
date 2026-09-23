/**
 * @vitest-environment jsdom
 */
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { RouteProgressBar } from '@/components/ae/layout/AeRouteProgressBar'

const useRouterStateMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useRouterState: (options: { select: (state: { isLoading: boolean }) => unknown }) =>
    useRouterStateMock(options),
}))

function mockRouterLoading(isLoading: boolean) {
  useRouterStateMock.mockImplementation(({ select }) => select({ isLoading }))
}

function getProgressBarRoot() {
  const root = document.querySelector('[data-progress-bar="true"]')
  if (!root) {
    throw new Error('Expected route progress bar root')
  }
  return root as HTMLElement
}

function getProgressFill(root: HTMLElement) {
  const fill = root.firstElementChild
  if (!fill) {
    throw new Error('Expected route progress bar fill')
  }
  return fill as HTMLElement
}

describe('RouteProgressBar (S-18)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockRouterLoading(false)
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    useRouterStateMock.mockReset()
  })

  it('when idle, progress bar has opacity-0 and data-phase="idle"', () => {
    render(<RouteProgressBar />)

    const root = getProgressBarRoot()
    expect(root).toBeTruthy()
    expect(root.getAttribute('data-progress-bar')).toBe('true')
    expect(root.getAttribute('data-phase')).toBe('idle')
    expect(root.className).toContain('opacity-0')

    const fill = getProgressFill(root)
    expect(fill.className).toContain('scale-x-0')
  })

  it('enters starting phase with 30% scale after the initial delay when loading starts', () => {
    mockRouterLoading(true)
    render(<RouteProgressBar />)

    const root = getProgressBarRoot()
    expect(root.getAttribute('data-phase')).toBe('idle')

    act(() => {
      vi.advanceTimersByTime(75)
    })

    expect(root.getAttribute('data-phase')).toBe('starting')
    expect(root.className).toContain('opacity-100')
    const fill = getProgressFill(root)
    expect(fill.className).toContain('scale-x-[0.3]')
  })

  it('transitions to creeping phase with 70% scale', () => {
    mockRouterLoading(true)
    render(<RouteProgressBar />)

    const root = getProgressBarRoot()

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(root.getAttribute('data-phase')).toBe('creeping')
    const fill = getProgressFill(root)
    expect(fill.className).toContain('scale-x-[0.7]')
  })

  it('finishing transition reaches 100% scale and resets to idle', () => {
    mockRouterLoading(true)
    const { rerender } = render(<RouteProgressBar />)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    mockRouterLoading(false)
    act(() => {
      rerender(<RouteProgressBar />)
    })

    const root = getProgressBarRoot()
    expect(root.getAttribute('data-phase')).toBe('finishing')
    const fill = getProgressFill(root)
    expect(fill.className).toContain('scale-x-100')

    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(root.getAttribute('data-phase')).toBe('idle')
    expect(root.className).toContain('opacity-0')
  })
})
