// @vitest-environment jsdom

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

import { AePublicShell } from '@/components/ae/layout/AePublicShell'

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('public shell command panel', () => {
  it('exposes Search on every public page and restores focus after Cmd/Ctrl-K closes', async () => {
    renderPublicShell()

    const trigger = screen.getByRole('button', { name: 'Search' })
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
    renderPublicShell()

    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy()
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
    renderPublicShell()

    fireEvent.click(screen.getByRole('button', { name: 'Open public menu' }))
    expect(await screen.findByRole('dialog', { name: 'Public navigation' })).toBeTruthy()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(await screen.findByRole('dialog', { name: 'Command console' })).toBeTruthy()
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Public navigation' })).toBeNull()
    })
  })
})

function renderPublicShell(): void {
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
    createRoute({ getParentRoute: () => rootRoute, path: '/operations/$operationRef' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/about'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <AePublicShell><p>Public page</p></AePublicShell>
    </RouterContextProvider>,
  )
}
