// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/resize-observer'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

import { AeCommandPanel, CommandPanelProvider } from '@/components/ae/command-panel'
import { ThemeProvider } from '@/components/ae/theme/ThemeProvider'

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe('command console navigation groups', () => {
  it('shows Navigation and Quick Actions when the panel is open with an empty query', async () => {
    renderCommandPanel({ openImmediately: true })

    expect(await screen.findByText('Navigation')).toBeTruthy()
    expect(screen.getByText('Quick Actions')).toBeTruthy()
    expect(screen.getByRole('option', { name: /Tools Market/ })).toBeTruthy()
    expect(screen.getByRole('option', { name: /Toggle Theme/ })).toBeTruthy()
  })

  it('filters Navigation to Account & Settings for "settings" and navigates on select', async () => {
    const router = renderCommandPanel({ openImmediately: true })

    const input = screen.getByRole('combobox', { name: 'Search Tools' })
    fireEvent.change(input, { target: { value: 'settings' } })

    expect(screen.queryByText('Navigation')).toBeTruthy()
    expect(screen.queryByText('Quick Actions')).toBeNull()
    const settingsItem = await screen.findByRole('option', { name: /Account & Settings/ })
    fireEvent.click(settingsItem)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/owner/settings')
      expect(screen.queryByRole('dialog')).toBeNull()
    })
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
            kind: 'ok',
            schemaVersion: 'registry-tools:v3',
            query: 'custom-api-tool',
            items: [
              {
                toolRef: `operation:v1:${'d'.repeat(64)}`,
                capabilityId: 'custom.api.tool',
                title: 'Custom API Tool',
                description: 'A bespoke API integration.',
                provider: { name: 'Acme', slug: 'acme' },
                priceLabel: 'Price confirmed at inspection',
                healthStatus: 'operational',
                listingTier: 'reviewed',
              },
            ],
            count: 1,
            pagination: { limit: 12, hasMore: false },
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
    const navItem = screen.getByRole('option', { name: /Tools Market/ })
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
