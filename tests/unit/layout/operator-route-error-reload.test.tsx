/**
 * @vitest-environment jsdom
 */
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const routeStateMocks = vi.hoisted(() => ({
  invalidate: vi.fn(async () => undefined),
  parentShell: null as null | { nested: true },
  pathname: '/owner/settings/connections',
}))
const diagnostics = vi.hoisted(() => ({ capture: vi.fn() }))

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

vi.mock('@/components/ae/layout/AeOperatorShell', () => ({
  AeOperatorShell: ({
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
  useOperatorShellChrome: () => routeStateMocks.parentShell,
}))

import { OperatorRouteError } from '@/components/ae/layout/AeOperatorRouteStates'

afterEach(() => {
  cleanup()
  routeStateMocks.parentShell = null
  routeStateMocks.pathname = '/owner/settings/connections'
  routeStateMocks.invalidate.mockReset()
  routeStateMocks.invalidate.mockResolvedValue(undefined)
  diagnostics.capture.mockReset()
})

describe('OperatorRouteError router recovery', () => {
  it('offers retry and system-status recovery without leaking error details', () => {
    render(<OperatorRouteError error={new Error('private upstream credential')} />)

    const alert = screen.getByRole('alert')
    const button = within(alert).getByRole('button', { name: 'Try again' })
    const statusLink = within(alert).getByRole('link', { name: 'Check system status' })

    expect(within(alert).getAllByRole('button')).toHaveLength(1)
    expect(button.getAttribute('type')).toBe('button')
    expect(button.classList.contains('min-h-touch')).toBe(true)
    expect(statusLink.getAttribute('href')).toBe('/status')
    expect(statusLink.classList.contains('min-h-touch')).toBe(true)
    expect(alert.textContent).not.toContain('private upstream credential')
    expect(alert.textContent).toContain('check system status before repeating a Call')
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
    expect(retry.textContent).toBe('Trying again…')

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
