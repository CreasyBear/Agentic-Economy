/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/react', async () => {
  const { Component } = await import('react')

  class ErrorBoundary extends Component<{
    children: ReactNode
    fallback: ReactNode
    onError?: (error: unknown, componentStack: string, eventId: string) => void
  }, { hasError: boolean }> {
    override state = { hasError: false }

    static getDerivedStateFromError() {
      return { hasError: true }
    }

    override componentDidCatch(error: unknown, info: import('react').ErrorInfo) {
      this.props.onError?.(error, info.componentStack ?? '', 'test-event-id')
    }

    override render() {
      return this.state.hasError ? this.props.fallback : this.props.children
    }
  }

  return {
    ErrorBoundary,
  }
})

vi.mock('@/lib/observability/stale-chunk-reload', () => ({
  attemptViteStaleChunkReload: vi.fn(),
}))

import { AeObservabilityErrorBoundary } from '@/components/ae/feedback/AeObservabilityErrorBoundary'
import { attemptViteStaleChunkReload } from '@/lib/observability/stale-chunk-reload'

describe('AeObservabilityErrorBoundary', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    window.sessionStorage.clear()
  })

  it('renders children through the Sentry boundary', () => {
    render(
      <AeObservabilityErrorBoundary>
        <div>Protected child</div>
      </AeObservabilityErrorBoundary>,
    )

    expect(screen.queryByText('Protected child')).not.toBeNull()
  })

  it('catches an ordinary error on the first client render and keeps the accessible fallback', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('Some unrelated error')

    function ThrowError(): never {
      throw error
    }

    render(
      <AeObservabilityErrorBoundary>
        <ThrowError />
      </AeObservabilityErrorBoundary>,
    )

    expect(attemptViteStaleChunkReload).toHaveBeenCalledOnce()
    expect(attemptViteStaleChunkReload).toHaveBeenCalledWith(error)
    expect(screen.getByRole('alert')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Something went wrong' })).not.toBeNull()
    expect(screen.getByText('The page stopped unexpectedly. Try loading it again, or continue from the Operation catalogue.')).not.toBeNull()
    expect(screen.queryByText(/Nothing you sent was lost/u)).toBeNull()
    const retryButton = screen.getByRole('button', { name: 'Try again' })
    const marketLink = screen.getByRole('link', { name: 'Browse Operations' })

    expect(retryButton.tagName).toBe('BUTTON')
    expect(retryButton.getAttribute('type')).toBe('button')
    expect(retryButton.classList.contains('min-h-touch')).toBe(true)
    expect(marketLink.tagName).toBe('A')
    expect(marketLink.getAttribute('href')).toBe('/market')
    expect(marketLink.classList.contains('min-h-touch')).toBe(true)
    expect(document.querySelector('a[href="/t/new"]')).toBeNull()
    expect(screen.queryByRole('link', { name: /chat/i })).toBeNull()

    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    retryButton.click()
    expect(reload).toHaveBeenCalledOnce()
  })

  it('offers a stale-chunk error from the first client render to automatic recovery', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const error = new Error('Failed to fetch dynamically imported module: /assets/Page.js')

    function ThrowError(): never {
      throw error
    }

    render(
      <AeObservabilityErrorBoundary>
        <ThrowError />
      </AeObservabilityErrorBoundary>,
    )

    expect(attemptViteStaleChunkReload).toHaveBeenCalledOnce()
    expect(attemptViteStaleChunkReload).toHaveBeenCalledWith(error)
  })
})
