// @vitest-environment jsdom

import type { ReactElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { BoxesIcon } from 'lucide-react'
import { afterEach, expect, it, vi } from 'vitest'
import '../setup/jsdom-platform'

vi.mock('@clerk/tanstack-react-start', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@clerk/tanstack-react-start')>()),
  useUser: () => ({ isLoaded: true, isSignedIn: true, user: { fullName: 'Owner' } }),
  UserButton: () => <button type="button" aria-label="Account menu" />,
  OrganizationSwitcher: () => <div data-testid="organization-switcher" />,
}))

import { AeOperatorSidebar } from '@/components/ae/layout/AeOperatorSidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

afterEach(cleanup)

it('keeps Supply out of the default buyer workspace but discloses it on a direct Provider journey', () => {
  const buyer = renderSidebar('/owner')
  expect(screen.getByRole('link', { name: 'Market' })).toBeTruthy()
  expect(screen.queryByText('Supply')).toBeNull()
  expect(screen.queryByRole('link', { name: 'Tools' })).toBeNull()
  buyer.unmount()

  renderSidebar('/owner/operations/new')
  expect(screen.getByText('Supply')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Tools' }).getAttribute('href')).toBe('/owner/operations')
})

function renderSidebar(currentPath: string) {
  const root = createRootRoute()
  const route = (path: string, label?: string, group = 'Buy') => createRoute({
    getParentRoute: () => root,
    path,
    ...(label === undefined ? {} : {
      staticData: {
        nav: {
          label,
          operator: {
            roles: ['owner'],
            group,
            groupOrder: group === 'Supply' ? 1 : 0,
            order: 0,
            icon: BoxesIcon,
            tier: 'core',
          },
        },
      },
    }),
  })
  const router = createRouter({
    routeTree: root.addChildren([
      route('/owner'),
      route('/owner/market', 'Market'),
      route('/owner/operations', 'Tools', 'Supply'),
      route('/owner/operations/new'),
    ]),
    history: createMemoryHistory({ initialEntries: [currentPath] }),
  })
  return render(
    <RouterContextProvider router={router}>
      <SidebarProvider>
        <AeOperatorSidebar operatorRole="owner" currentPath={currentPath} />
      </SidebarProvider>
    </RouterContextProvider> as ReactElement,
  )
}
