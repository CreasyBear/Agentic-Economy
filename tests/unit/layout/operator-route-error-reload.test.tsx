/**
 * @vitest-environment jsdom
 */
import { StrictMode, type ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const routeStateMocks = vi.hoisted(() => ({
  invalidate: vi.fn(async () => undefined),
  parentShell: null as null | { nested: true },
  pathname: '/owner/settings/connections',
}))
const diagnostics = vi.hoisted(() => ({ capture: vi.fn() }))
const originalLocation = window.location

vi.mock('@/lib/observability/sentry.client', () => ({
  captureClientException: vi.fn(),
  Sentry: {
    flush: vi.fn(async () => true),
    getClient: vi.fn(() => undefined),
  },
}))

vi.mock('@/lib/observability/capture-client-exception', () => ({
  captureClientExceptionOnClient: diagnostics.capture,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className, to }: { children: ReactNode; className?: string; to: string }) => (
    <a href={to} className={className}>{children}</a>
  ),
  useLocation: () => ({ pathname: routeStateMocks.pathname }),
  useRouter: () => ({ invalidate: routeStateMocks.invalidate }),
}))

vi.mock('@/components/ae/layout/AeOperatorPage', () => ({
  AeOperatorPage: ({
    children,
    currentPath,
    title,
  }: {
    children: ReactNode
    currentPath: string
    title: string
  }) => (
    <section data-current-path={currentPath}>
      <h1>{title}</h1>
      {children}
    </section>
  ),
}))

vi.mock('@/components/ae/layout/OperatorChromeContext', () => ({
  useOperatorShellChrome: () => routeStateMocks.parentShell,
}))

import { OperatorRouteError, RouteError } from '@/components/ae/layout/AeRouteStates'
import { STALE_CHUNK_RELOAD_TIMESTAMP_KEY } from '@/lib/observability/stale-chunk-reload'

afterEach(() => {
  cleanup()
  routeStateMocks.parentShell = null
  routeStateMocks.pathname = '/owner/settings/connections'
  routeStateMocks.invalidate.mockReset()
  routeStateMocks.invalidate.mockResolvedValue(undefined)
  diagnostics.capture.mockReset()
  window.sessionStorage.clear()
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

describe('OperatorRouteError router recovery', () => {
  it('offers retry and system-status recovery without leaking error details', () => {
    render(<OperatorRouteError error={new Error('private upstream credential')} />)

    const alert = screen.getByRole('alert')
    const button = within(alert).getByRole('button', { name: 'Try again' })
    const statusLink = within(alert).getByRole('link', { name: 'Check system status' })

    expect(within(alert).getAllByRole('button')).toHaveLength(1)
    expect(button.getAttribute('type')).toBe('button')
    expect(statusLink.getAttribute('href')).toBe('/status')
    expect(alert.textContent).not.toContain('private upstream credential')
    expect(document.querySelectorAll('h1')).toHaveLength(1)
    expect(alert.textContent).not.toContain('Couldn’t load this page')
    expect(alert.textContent).toContain('Try again, or check system status.')
    expect(alert.textContent).not.toContain('Nothing was charged')
  })

  it.each(['/owner/credit', '/calls/call_123', '/owner/settings/receipts', '/activity'])('does not infer a payment outcome from a read failure at %s', (pathname) => {
    routeStateMocks.pathname = pathname
    render(<OperatorRouteError error={new Error('route failed')} />)
    expect(screen.getByRole('alert').textContent).not.toContain('Nothing was charged.')
    expect(screen.getByRole('alert').textContent).toContain('Try again, or check system status.')
  })

  it('retains nested parent chrome with one Settings heading', () => {
    routeStateMocks.parentShell = { nested: true }

    render(
      <main>
        <h1>Settings</h1>
        <OperatorRouteError error={new Error('private nested failure')} />
      </main>,
    )

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('alert')).toBeTruthy()
  })

  it('retries through router invalidation without allowing duplicate attempts', async () => {
    let finishRetry: (() => void) | undefined
    routeStateMocks.invalidate.mockImplementation(() => new Promise<undefined>((resolve) => {
      finishRetry = () => resolve(undefined)
    }))
    render(<OperatorRouteError error={new Error('private upstream credential')} />)

    const retry = screen.getByRole('button', { name: 'Try again' })
    fireEvent.click(retry)
    fireEvent.click(retry)

    expect(routeStateMocks.invalidate).toHaveBeenCalledTimes(1)
    expect(retry).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Trying again…' })).toBe(retry)
    expect(retry.getAttribute('aria-busy')).toBe('true')

    finishRetry?.()
    await waitFor(() => expect(retry).toHaveProperty('disabled', false))
  })

  it('contains a rejected invalidation and restores the retry control', async () => {
    routeStateMocks.invalidate.mockRejectedValueOnce(new Error('invalidation failed'))
    render(<OperatorRouteError error={new Error('route failed')} />)

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveProperty('disabled', false))
    expect(routeStateMocks.invalidate).toHaveBeenCalledTimes(1)
    expect(diagnostics.capture).toHaveBeenCalledWith(expect.any(Error))
  })
})

describe.each([
  { surface: 'operator', ErrorComponent: OperatorRouteError },
  { surface: 'public', ErrorComponent: RouteError },
])('$surface stale release recovery', ({ ErrorComponent }) => {
  it.each([
    'Unable to preload CSS for https://app.aecon.ai/assets/owner-old.css',
    'Failed to fetch dynamically imported module: https://app.aecon.ai/assets/owner-old.js',
  ])('reloads the current document once for %s and retains funding recovery', async (message) => {
    const reload = vi.fn()
    const target = new URL('https://app.aecon.ai/owner/credit?funding=cs_saved#fund')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: target.href, pathname: target.pathname, search: target.search, hash: target.hash, reload },
    })
    const recoveryKey = 'ae.account-funding.recovery.user_owner'
    const recovery = JSON.stringify({ externalRef: 'cs_saved' })
    window.sessionStorage.setItem(recoveryKey, recovery)

    routeStateMocks.pathname = target.pathname
    const view = render(<StrictMode><ErrorComponent error={new Error(message)} /></StrictMode>)

    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    expect(window.location.href).toBe(target.href)
    expect(window.sessionStorage.getItem(recoveryKey)).toBe(recovery)
    expect(routeStateMocks.invalidate).not.toHaveBeenCalled()

    await act(async () => {
      view.rerender(<StrictMode><ErrorComponent error={new Error(message)} /></StrictMode>)
    })
    expect(reload).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Try again' })).toHaveProperty('disabled', false)
  })

  it('uses a document reload for manual retry when automatic recovery is in cooldown', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } })
    window.sessionStorage.setItem(STALE_CHUNK_RELOAD_TIMESTAMP_KEY, String(Date.now()))

    render(<ErrorComponent error={new Error('Unable to preload CSS for /assets/owner-old.css')} />)
    expect(reload).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(reload).toHaveBeenCalledOnce()
    expect(routeStateMocks.invalidate).not.toHaveBeenCalled()
  })

  it('keeps ordinary data errors on router retry without reloading the document', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } })

    render(<ErrorComponent error={new Error('Account balance is temporarily unavailable')} />)
    expect(reload).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Try again' })).toHaveProperty('disabled', false))
    expect(routeStateMocks.invalidate).toHaveBeenCalledOnce()
    expect(reload).not.toHaveBeenCalled()
  })

  it('keeps manual recovery usable when browser storage is denied', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { ...originalLocation, reload } })
    const storageGetter = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('sessionStorage access denied')
    })
    try {
      render(<ErrorComponent error={new Error('Unable to preload CSS for /assets/owner-old.css')} />)
      expect(reload).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

      expect(reload).toHaveBeenCalledOnce()
      expect(routeStateMocks.invalidate).not.toHaveBeenCalled()
    } finally {
      storageGetter.mockRestore()
    }
  })
})
