// @vitest-environment jsdom

import type * as ConvexReactModule from 'convex/react'
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
import arcButton from '@/components/arc/button/button.module.css'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import { AeAppShell } from '@/components/ae/layout/AeAppShell'

vi.mock('@/lib/observability/funnel-client', () => ({
  emitFunnelEventOnce: vi.fn(),
}))

// Vitest hoists the mock factory, so its shared helper must be loaded inside it.
vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReactModule>()),
  ...(await import('../../helpers/shell-convex-mock')).shellConvexMock,
}))
const clerkSignedIn = vi.hoisted(() => ({ value: false }))

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useAuth: () => ({ isSignedIn: clerkSignedIn.value, isLoaded: true, orgId: null }),
  useUser: () => ({ user: null }),
  Show: ({ when, children, fallback }: { when: string; children?: ReactNode; fallback?: ReactNode }) => {
    if (when === 'signed-out') return clerkSignedIn.value ? (fallback ?? null) : (children ?? null)
    if (when === 'signed-in') return clerkSignedIn.value ? (children ?? null) : null
    return children ?? null
  },
  UserButton: () => <button type="button" aria-label="Account menu" />,
  OrganizationSwitcher: () => null,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  clerkSignedIn.value = false
})

describe('app shell command panel', () => {
  it('exposes Tool search on every page and restores focus after Cmd/Ctrl-K closes', async () => {
    renderAppShell()

    const trigger = screen.getByRole('button', { name: 'Find tools' })
    expect(trigger.className.split(' ')).toContain(arcButton.md)
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

    expect(screen.getByRole('button', { name: 'Find tools' })).toBeTruthy()
    const trigger = screen.getByRole('button', { name: 'Open public menu' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(trigger.getAttribute('aria-controls')).toBeNull()

    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Public navigation' })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.getAttribute('aria-controls')).toBe(dialog.id)
    expect(dialog.id).not.toBe('')
    expect(trigger.getAttribute('aria-label')).toBe('Close public menu')
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })

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

  it('keeps public navigation out of the authenticated workspace hierarchy', async () => {
    clerkSignedIn.value = true
    const rootRoute = createRootRoute()
    const operatorRoute = createRoute({ getParentRoute: () => rootRoute, id: '_operator', staticData: { shell: 'operator' } })
    const ownerRoute = createRoute({ getParentRoute: () => operatorRoute, path: '/owner' })
    const marketRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/market',
      staticData: { nav: { label: 'Market', header: { order: 0, audience: 'always' } } },
    })
    const router = createRouter({
      routeTree: rootRoute.addChildren([operatorRoute.addChildren([ownerRoute]), marketRoute]),
      history: createMemoryHistory({ initialEntries: ['/owner'] }),
    })
    await router.load()

    render(
      <RouterContextProvider router={router}>
        <AeAppShell><p>Owner workspace</p></AeAppShell>
      </RouterContextProvider>,
    )

    await waitFor(() => {
      expect(screen.queryByRole('navigation', { name: 'Primary' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Open public menu' })).toBeNull()
    })
    expect(screen.getByRole('button', { name: 'Find tools' })).toBeTruthy()
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
