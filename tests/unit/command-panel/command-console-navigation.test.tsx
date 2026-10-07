// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { useState, type ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/resize-observer'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

vi.mock('@tanstack/react-start', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-start')>(),
  useServerFn: () =>
    vi.fn(async () => ({
      items: [],
      page: { isDone: true, continueCursor: '' },
    })),
}))

vi.mock('convex/react', () => ({
  useQuery: () => undefined,
}))

vi.mock('@clerk/tanstack-react-start', () => ({
  useAuth: () => ({ isSignedIn: false }),
  UserProfile: () => null,
  SignOutButton: ({ children }: { children: React.ReactNode }) => children,
  OrganizationProfile: Object.assign(() => null, { Page: () => null }),
}))

import { AeCommandPanel, CommandPanelProvider } from '@/components/ae/command-panel'
import { ThemeProvider } from '@/components/ae/theme/ThemeProvider'
import { APP_NAVIGATION } from '@/lib/navigation/app-navigation'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('command console navigation groups', () => {
  it('projects canonical navigation and keeps only non-destination quick actions', async () => {
    renderCommandPanel({ openImmediately: true })

    expect(await screen.findByText('Navigation')).toBeTruthy()
    expect(screen.getByText('Quick Actions')).toBeTruthy()
    for (const destination of APP_NAVIGATION) {
      const href = `${destination.to}${destination.hash ?? ''}`
      const item = screen.getByRole('option', {
        name: new RegExp(`^${destination.label}\\b`),
      })
      expect(item.getAttribute('data-value')).toBe(`ae-nav:${href}`)
    }
    expect(screen.getByRole('option', { name: /Toggle Theme/ })).toBeTruthy()
    expect(screen.queryByRole('option', { name: /Check System Status/ })).toBeNull()
  })

  it('does not offer a second settings product from the command palette', async () => {
    renderCommandPanel({ openImmediately: true })

    const input = screen.getByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'settings' } })

    expect(screen.queryByRole('option', { name: /Account & Settings/ })).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Account & settings' })).toBeNull()
  })

  it('shows Toggle Theme in Quick Actions when the query is "theme"', async () => {
    renderCommandPanel({ openImmediately: true })

    const input = screen.getByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'theme' } })

    expect(screen.queryByText('Navigation')).toBeNull()
    expect(screen.getByText('Quick Actions')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Toggle Theme/ })).toBeTruthy()
  })

  it('hides Navigation and Quick Actions for a catalog-only query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            kind: 'match',
            schemaVersion: 'registry-tools:v3',
            query: 'custom-api-tool',
            partialResults: false,
            assessed: { source: 'all', scope: 'complete', examined: 1, coverage: 'complete' },
            results: [{
              id: `operation:v1:${'d'.repeat(64)}`,
              source: 'current',
              access: 'ae_callable',
              toolRef: `operation:v1:${'d'.repeat(64)}`,
              title: 'Custom API Tool',
              summary: 'A bespoke API integration.',
              provider: 'Acme',
              actionClass: 'retrieve',
              objectClass: 'data',
              readiness: 'ready',
              price: { kind: 'indicative', label: 'Price confirmed at inspection' },
              detailRef: `operation:v1:${'d'.repeat(64)}`,
              next: [{ action: 'registry.tools.describe', args: { toolRef: `operation:v1:${'d'.repeat(64)}` }, authority: 'public' }],
            }],
            next: [],
            pagination: { limit: 8, hasMore: false },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      ),
    )

    renderCommandPanel({ openImmediately: true })

    const input = screen.getByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'custom-api-tool' } })

    await screen.findByRole('option', { name: /Custom API Tool/ })
    expect(screen.queryByText('Navigation')).toBeNull()
    expect(screen.queryByText('Quick Actions')).toBeNull()
  })

  it('switches between category groups with Tab and Shift+Tab (S-06)', async () => {
    renderCommandPanel({ openImmediately: true })

    expect(await screen.findByText('Navigation')).toBeTruthy()
    expect(screen.getByText('Quick Actions')).toBeTruthy()

    const command = document.querySelector('[cmdk-root]')
    expect(command).toBeTruthy()

    // Press Tab to jump to the first item in the next group (Quick Actions)
    fireEvent.keyDown(command!, { key: 'Tab' })
    const themeItem = screen.getByRole('option', { name: /Toggle Theme/ })
    expect(themeItem.getAttribute('data-value')).toBe('ae-action:toggle-theme')

    // Press Shift+Tab to jump back to the Navigation group
    fireEvent.keyDown(command!, { key: 'Tab', shiftKey: true })
    const navItem = screen.getByRole('option', { name: /^Market\b/ })
    expect(navItem.getAttribute('data-value')).toBe('ae-nav:/market')
  })
})

function PanelHarness(props: { initialOpen: boolean }): ReactElement {
  const [open, setOpen] = useState(props.initialOpen)
  return (
    <ThemeProvider>
      <CommandPanelProvider open={open} onOpenChange={setOpen}>
        <AeCommandPanel />
      </CommandPanelProvider>
    </ThemeProvider>
  )
}

function renderCommandPanel(options: { openImmediately?: boolean } = {}) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/market' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/activity' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/operations' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/credit' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/settings' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/agent-access' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/for-providers' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/status' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <PanelHarness initialOpen={options.openImmediately === true} />
    </RouterContextProvider>,
  )

  return router
}
