/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { act, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tanstack/react-router', async () => {
  const React = await import('react')

  return {
    ClientOnly: ({ children }: { children: ReactNode }) => React.createElement(React.Fragment, null, children),
  }
})

vi.mock('@/lib/observability/sentry.client', async () => {
  const { Component } = await import('react')

  class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
    override state = { hasError: false }

    static getDerivedStateFromError() {
      return { hasError: true }
    }

    override render() {
      return this.state.hasError ? this.props.fallback : this.props.children
    }
  }

  return {
    Sentry: {
      ErrorBoundary,
    },
  }
})

import { AeObservabilityErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'

describe('AeObservabilityErrorBoundary', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('loads the Sentry class boundary without invoking it as a state updater', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <AeObservabilityErrorBoundary>
        <div>Protected child</div>
      </AeObservabilityErrorBoundary>,
    )

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByText('Protected child')).not.toBeNull()
    expect(
      consoleError.mock.calls.some((call) => call.some((part) => String(part).includes('cannot be invoked without'))),
    ).toBe(false)
  })
})
