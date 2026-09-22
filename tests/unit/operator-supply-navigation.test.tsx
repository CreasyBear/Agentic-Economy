// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, expect, it } from 'vitest'
import '../setup/jsdom-platform'

import { AeAppSidebar } from '@/components/ae/layout/app-shell/AeAppSidebar'
import { OperatorChromeProvider } from '@/components/ae/layout/AeOperatorPage'
import { SidebarProvider } from '@/components/ui/sidebar'

afterEach(cleanup)

it('keeps Provider Tools visible throughout the signed-in frame', () => {
  const owner = renderSidebar('/owner')
  expect(screen.getByText('Provider')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Tools' }).getAttribute('href')).toBe('/owner/operations')
  owner.unmount()

  renderSidebar('/owner/operations/new')
  const nav = screen.getByRole('navigation', { name: 'App navigation' })
  expect(within(nav).getByRole('link', { name: 'Tools' }).getAttribute('aria-current')).toBe('page')
  expect(within(nav).getAllByRole('link').filter((link) => link.hasAttribute('aria-current'))).toHaveLength(1)
})

function renderSidebar(currentPath: string) {
  const root = createRootRoute()
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/owner' }),
      createRoute({ getParentRoute: () => root, path: '/owner/operations' }),
      createRoute({ getParentRoute: () => root, path: '/owner/operations/new' }),
    ]),
    history: createMemoryHistory({ initialEntries: [currentPath] }),
  })
  return render(
    <RouterContextProvider router={router}>
      <SidebarProvider>
        <OperatorChromeProvider>
          <AeAppSidebar operatorRole="owner" pathname={currentPath} hash="" />
        </OperatorChromeProvider>
      </SidebarProvider>
    </RouterContextProvider>,
  )
}
