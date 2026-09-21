// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { LayoutDashboardIcon, StoreIcon } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeOwnerMobileNavigation } from '@/components/ae/layout/AeOwnerMobileNavigation'
import { roleHomeHref, roleLabel } from '@/lib/operator/roles'

afterEach(cleanup)

function renderNavigation(pathname: string) {
  const root = createRootRoute()
  const ownerNav = {
    roles: ['owner'] as const,
    group: 'Workspace',
    groupOrder: 0,
    order: 0,
    icon: LayoutDashboardIcon,
    tier: 'core' as const,
  }
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/market', staticData: { nav: { label: 'Market', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 0, icon: StoreIcon } } } }),
    createRoute({ getParentRoute: () => root, path: '/agent-access', staticData: { nav: { label: 'Agents', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 10 } } } }),
    createRoute({ getParentRoute: () => root, path: '/activity', staticData: { nav: { label: 'Calls', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 20 } } } }),
    createRoute({ getParentRoute: () => root, path: '/owner/operations', staticData: { nav: { label: 'Tools', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 30 } } } }),
    createRoute({ getParentRoute: () => root, path: '/owner/operations/new' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [pathname] }) })

  return render(
    <RouterContextProvider router={router}>
      <AeOwnerMobileNavigation currentPath={pathname} />
    </RouterContextProvider>,
  )
}

describe('owner primary navigation', () => {
  it('uses Overview as the owner workspace home', () => {
    expect(roleHomeHref.owner).toBe('/owner')
    expect(roleLabel.owner).toBe('Workspace')
  })

  it('keeps Market in the tab bar when the route has header nav only', () => {
    const root = createRootRoute()
    const ownerNav = {
      roles: ['owner'] as const,
      group: 'Buy',
      groupOrder: 0,
      order: 0,
      icon: LayoutDashboardIcon,
      tier: 'core' as const,
    }
    const routeTree = root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/market',
        staticData: { nav: { label: 'Market', header: { order: 0, audience: 'always' } } },
      }),
      createRoute({ getParentRoute: () => root, path: '/agent-access', staticData: { nav: { label: 'Agents', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 10 } } } }),
      createRoute({ getParentRoute: () => root, path: '/activity', staticData: { nav: { label: 'Calls', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 20 } } } }),
      createRoute({ getParentRoute: () => root, path: '/owner/operations', staticData: { nav: { label: 'Tools', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 30 } } } }),
    ])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/market'] }) })

    render(
      <RouterContextProvider router={router}>
        <AeOwnerMobileNavigation currentPath="/market" />
      </RouterContextProvider>,
    )

    const navigation = screen.getByRole('navigation', { name: 'Owner primary navigation' })
    const links = within(navigation).getAllByRole('link')
    expect(links.map(link => link.textContent)).toEqual(['Market', 'Agents', 'Calls', 'Tools'])
    expect(links[0]?.getAttribute('aria-current')).toBe('page')
  })

  it('keeps the mobile progression to Market, Agents, Calls and Tools', () => {
    renderNavigation('/activity')

    const navigation = screen.getByRole('navigation', { name: 'Owner primary navigation' })
    const links = within(navigation).getAllByRole('link')
    expect(links.map(link => link.textContent)).toEqual(['Market', 'Agents', 'Calls', 'Tools'])
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/market', '/agent-access', '/activity', '/owner/operations'])
    expect(links.filter(link => link.getAttribute('aria-current') === 'page').map(link => link.textContent)).toEqual(['Calls'])
    expect(navigation.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4)
  })

  it('marks Tools active on operations routes without mislabeling nested paths', () => {
    renderNavigation('/owner/operations/new')

    const navigation = screen.getByRole('navigation', { name: 'Owner primary navigation' })
    expect(within(navigation).getByRole('link', { name: 'Tools' }).getAttribute('aria-current')).toBe('page')
  })
})
