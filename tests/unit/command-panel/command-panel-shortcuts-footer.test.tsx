// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
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
import type * as ClerkReact from '@clerk/tanstack-react-start'
import '../../setup/resize-observer'
import '../../setup/jsdom-platform'
import '../../setup/jsdom-dialog'

vi.mock('@clerk/tanstack-react-start', async (loadOriginal) => ({
  ...await loadOriginal<typeof ClerkReact>(),
  useAuth: () => ({ isSignedIn: false }),
}))

import { AeCommandPanel, CommandPanelProvider } from '@/components/ae/command-panel'

afterEach(() => {
  cleanup()
})

function PanelHarness(): ReactElement {
  const [open, setOpen] = useState(true)
  return (
    <CommandPanelProvider open={open} onOpenChange={setOpen}>
      <AeCommandPanel />
    </CommandPanelProvider>
  )
}

function renderOpenPanel() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })

  render(
    <RouterContextProvider router={router}>
      <PanelHarness />
    </RouterContextProvider>,
  )
}

describe('AeCommandPanel keyboard shortcuts footer', () => {
  it('shows tactile shortcut chips and descriptions when the panel is open', async () => {
    renderOpenPanel()

    const footer = await screen.findByLabelText('Keyboard shortcuts')
    expect(footer.tagName).toBe('FOOTER')

    const chips = footer.querySelectorAll('kbd')
    const chipTexts = Array.from(chips).map((kbd) => kbd.textContent)
    expect(chipTexts).toContain('↑↓')
    expect(chipTexts).toContain('↵')
    expect(chipTexts).toContain('esc')
    expect(chipTexts).toContain('/')

    expect(chips.length).toBe(4)

    expect(screen.getByText('Navigate')).toBeTruthy()
    expect(screen.getByText('Select')).toBeTruthy()
    expect(screen.getByText('Back / Close')).toBeTruthy()
    expect(screen.getByText('Search')).toBeTruthy()

    expect(footer.textContent).not.toContain('Esc pops a layer')
  })
})
