// @vitest-environment jsdom

import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import { AeAppShell } from '@/components/ae/layout/AeAppShell'

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  Show: ({ when, children, fallback }: { when: string; children: ReactNode; fallback?: ReactNode }) =>
    when === 'signed-out' ? children : (fallback ?? null),
  UserButton: () => <button type="button" aria-label="Account menu" />,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('app shell command panel', () => {
  it('exposes Tool search on every page and restores focus after Cmd/Ctrl-K closes', async () => {
    renderAppShell()

    const trigger = screen.getByRole('button', { name: 'Find Tools' })
    expect(trigger.className).toContain('min-h-touch')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(await screen.findByRole('dialog', { name: 'Command console' })).toBeTruthy()
    expect(trigger.getAttribute('aria-expanded')).toBe('true')

    fireEvent.keyDown(window, { key: 'K', ctrlKey: true })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Command console' })).toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('exposes mobile navigation state and restores its trigger after each close path', async () => {
    renderAppShell()

    expect(screen.getByRole('button', { name: 'Find Tools' })).toBeTruthy()
    const trigger = screen.getByRole('button', { name: 'Open public menu' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBeNull()

    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Public navigation' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.id)
    expect(dialog.id).not.toBe('')
    expect(trigger.getAttribute('aria-label')).toBe('Close public menu')
    expect(dialog.contains(document.activeElement)).toBe(true)

    fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Public navigation' })).toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(trigger.getAttribute('aria-controls')).toBeNull()
      expect(trigger.getAttribute('aria-label')).toBe('Open public menu')
      expect(document.activeElement).toBe(trigger)
    })

    fireEvent.click(trigger)

    const reopenedDialog = await screen.findByRole('dialog', { name: 'Public navigation' })
    fireEvent.click(within(reopenedDialog).getByRole('button', { name: 'Close public menu' }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Public navigation' })).toBeNull()
      expect(trigger.getAttribute('aria-expanded')).toBe('false')
      expect(trigger.getAttribute('aria-controls')).toBeNull()
      expect(trigger.getAttribute('aria-label')).toBe('Open public menu')
      expect(document.activeElement).toBe(trigger)
    })
  })

  it('closes the mobile navigation before opening Search from the keyboard', async () => {
    renderAppShell()

    fireEvent.click(screen.getByRole('button', { name: 'Open public menu' }))
    expect(await screen.findByRole('dialog', { name: 'Public navigation' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(await screen.findByRole('dialog', { name: 'Command console' })).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Public navigation' })).toBeNull()
    })
  })
})

function renderAppShell(): void {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/market' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/for-agents' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/for-providers' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/activity' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/about' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/support' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/system-status' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/privacy' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/terms' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/privacy/remove-business' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/tools/$toolRef' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/about'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <AeAppShell><p>Public page</p></AeAppShell>
    </RouterContextProvider>,
  )
}
