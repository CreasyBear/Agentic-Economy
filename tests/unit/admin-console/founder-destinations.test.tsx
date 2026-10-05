/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { FounderDestinations } from '@/components/ae/admin/overview/components/FounderDestinations'

const config = vi.hoisted(() => ({ enabled: false, posthogHost: 'https://us.i.posthog.com',
  environment: 'test', posthogAppUrl: 'https://us.posthog.com/project/491802/dashboard/1778627', posthogKey: undefined as string | undefined }))
vi.mock('@/lib/observability/config', () => ({ readObservabilityClientConfig: () => config }))

beforeEach(() => {
  config.enabled = false
  config.posthogKey = undefined
  config.posthogAppUrl = 'https://us.posthog.com/project/491802/dashboard/1778627'
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(360)
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('founder destinations', () => {
  it('opens real destinations without simulating connected status', () => {
    render(<FounderDestinations />)
    fireEvent.click(screen.getByRole('button', { name: 'PostHog, Signals' }))
    const details = screen.getByRole('region', { name: 'PostHog details' })
    expect(within(details).getByText(/PostHog is not connected/)).toBeTruthy()
    const analytics = within(details).getByRole('link', { name: 'Open PostHog' })
    expect(analytics.getAttribute('href')).toBe(config.posthogAppUrl)
    expect(analytics.getAttribute('target')).toBe('_blank')
    expect(analytics.getAttribute('rel')).toContain('noopener')
    expect(screen.queryByRole('button', { name: /^Connect/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Treasury, Money' }))
    const treasury = within(screen.getByRole('region', { name: 'Treasury details' })).getByRole('link', { name: 'Open treasury' })
    expect(treasury.getAttribute('href')).toBe('/admin/treasury')
    expect(treasury.getAttribute('target')).toBeNull()
  })

  it('preserves configuration uncertainty and excludes unsafe analytics URLs', () => {
    config.enabled = true
    config.posthogKey = 'test-configured'
    const view = render(<FounderDestinations />)
    fireEvent.click(screen.getByRole('button', { name: 'PostHog, Signals' }))
    expect(within(screen.getByRole('region', { name: 'PostHog details' })).getByText(/Configuration does not prove event receipt/)).toBeTruthy()
    config.posthogAppUrl = 'https://user:secret@example.com'
    view.rerender(<FounderDestinations />)
    expect(screen.queryByRole('button', { name: 'PostHog, Signals' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open PostHog' })).toBeNull()
  })

  it('supports category keyboard navigation, close focus return and motion pause', () => {
    render(<FounderDestinations />)
    fireEvent.click(screen.getByRole('button', { name: 'Signals' }))
    const analytics = screen.getByRole('button', { name: 'PostHog, Signals' })
    analytics.focus()
    fireEvent.keyDown(analytics, { key: 'ArrowRight' })
    const sentry = screen.getByRole('button', { name: 'Sentry, Signals' })
    expect(document.activeElement).toBe(sentry)
    fireEvent.click(sentry)
    const close = within(screen.getByRole('region', { name: 'Sentry details' })).getByRole('button', { name: 'Close' })
    close.focus()
    fireEvent.keyDown(close, { key: 'Escape' })
    expect(document.activeElement).toBe(sentry)
    expect(screen.queryByRole('region', { name: 'Sentry details' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Pause motion' }))
    expect(screen.getByRole('button', { name: 'Resume motion' }).getAttribute('aria-pressed')).toBe('true')
  })
})
