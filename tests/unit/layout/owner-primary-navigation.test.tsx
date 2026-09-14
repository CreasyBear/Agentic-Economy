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
    createRoute({ getParentRoute: () => root, path: '/owner', staticData: { nav: { label: 'Overview', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 0 } } } }),
    createRoute({ getParentRoute: () => root, path: '/market', staticData: { nav: { label: 'Market', operatorUtility: { roles: ['owner'], order: 0, icon: StoreIcon } } } }),
    createRoute({ getParentRoute: () => root, path: '/activity', staticData: { nav: { label: 'Calls', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 10 } } } }),
    createRoute({ getParentRoute: () => root, path: '/owner/credit', staticData: { nav: { label: 'Balance', operator: ownerNav } } }),
    createRoute({ getParentRoute: () => root, path: '/agent-access', staticData: { nav: { label: 'Agents', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 20 } } } }),
    createRoute({ getParentRoute: () => root, path: '/owner/operations', staticData: { nav: { label: 'Tools', operator: { ...ownerNav, mobilePrimary: true, mobileOrder: 30 } } } }),
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

  it('keeps the mobile progression to Overview, Market, Calls and Balance', () => {
    renderNavigation('/owner/credit')

    const navigation = screen.getByRole('navigation', { name: 'Owner primary navigation' })
    const links = within(navigation).getAllByRole('link')
    expect(links.map(link => link.textContent)).toEqual(['Overview', 'Market', 'Calls', 'Balance'])
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/owner', '/market', '/activity', '/owner/credit'])
    expect(links.filter(link => link.getAttribute('aria-current') === 'page').map(link => link.textContent)).toEqual(['Balance'])
    expect(navigation.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4)
  })

  it('does not let Provider or Agent management displace purchase continuity', () => {
    renderNavigation('/owner/operations')

    const navigation = screen.getByRole('navigation', { name: 'Owner primary navigation' })
    expect(within(navigation).queryByRole('link', { name: 'Tools' })).toBeNull()
    expect(within(navigation).queryByRole('link', { name: 'Agents' })).toBeNull()
    expect(within(navigation).getAllByRole('link').some(link => link.hasAttribute('aria-current'))).toBe(false)
  })
})
