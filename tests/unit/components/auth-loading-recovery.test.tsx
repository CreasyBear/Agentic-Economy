/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthLoadingState } from '@/components/ae/auth/AuthLoadingState'

const analytics = vi.hoisted(() => ({ recordProductJourney: vi.fn() }))
vi.mock('@/lib/observability/product-journey', () => analytics)
afterEach(() => { cleanup(); vi.useRealTimers(); analytics.recordProductJourney.mockReset() })

describe('delayed account form recovery', () => {
  it('announces loading and offers delayed manual retry without changing the URL', () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    window.history.replaceState(null, '', '/sign-up?redirect=%2Fagent-access%3FresumeTool%3Dpublic-tool')
    const original = window.location.href
    render(<AuthLoadingState mode="sign_up" reload={reload} />)
    expect(screen.getByRole('status').textContent).toContain('Loading')
    expect(screen.queryByRole('button', { name: 'Reload account form' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Get help' }).getAttribute('href')).toBe('/support')
    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.getByRole('status').textContent).toContain('longer than expected')
    fireEvent.click(screen.getByRole('button', { name: 'Reload account form' }))
    expect(reload).toHaveBeenCalledTimes(1)
    expect(window.location.href).toBe(original)
    expect(analytics.recordProductJourney).toHaveBeenCalledWith({ action: 'auth_retry', phase: 'attempted', surface: 'sign_up' })
  })
  it('cancels the delayed state when the account form replaces the fallback', () => {
    vi.useFakeTimers()
    const { unmount } = render(<AuthLoadingState mode="sign_in" />)
    unmount()
    act(() => vi.advanceTimersByTime(20_000))
    expect(analytics.recordProductJourney).not.toHaveBeenCalled()
  })
})
