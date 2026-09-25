// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeOwnerMobileNavigation } from '@/components/ae/layout/AeOwnerMobileNavigation'
import { mobileNavigation } from '@/lib/navigation/app-navigation'

afterEach(cleanup)

function renderNavigation(pathname: string) {
  const root = createRootRoute()
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/market' }),
    createRoute({ getParentRoute: () => root, path: '/t/new' }),
    createRoute({ getParentRoute: () => root, path: '/agent-access' }),
    createRoute({ getParentRoute: () => root, path: '/activity' }),
    createRoute({ getParentRoute: () => root, path: '/owner/credit' }),
    createRoute({ getParentRoute: () => root, path: '/owner/operations' }),
    createRoute({ getParentRoute: () => root, path: '/owner/operations/new' }),
    createRoute({ getParentRoute: () => root, path: '/owner/settings' }),
    createRoute({ getParentRoute: () => root, path: '/support' }),
    createRoute({ getParentRoute: () => root, path: '/status' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [pathname] }) })

  return render(
    <RouterContextProvider router={router}>
      <AeOwnerMobileNavigation currentPath={pathname} />
    </RouterContextProvider>,
  )
}

describe('owner primary navigation', () => {

  it('renders exactly the dropdown group destinations, with no More sheet', () => {
    renderNavigation('/activity')

    const primary = mobileNavigation()
    const navigation = screen.getByRole('navigation', { name: 'Owner primary navigation' })
    const links = within(navigation).getAllByRole('link')

    expect(links.map(link => link.textContent)).toEqual(primary.map(destination => destination.label))
    expect(links.map(link => link.getAttribute('href'))).toEqual(primary.map(destination => destination.to))
    expect(links.filter(link => link.getAttribute('aria-current') === 'page').map(link => link.textContent)).toEqual(['Activity'])
    expect(within(navigation).queryByRole('button', { name: 'More' })).toBeNull()
  })

  it('marks a child route within its group without falsely identifying a different page', () => {
    renderNavigation('/owner/operations')
    const navigation = screen.getByRole('navigation', { name: 'Owner primary navigation' })
    expect(within(navigation).getByRole('link', { name: 'Settings' }).getAttribute('aria-current')).toBe('location')
    expect(within(navigation).queryByRole('link', { current: 'page' })).toBeNull()
  })
  it('marks Settings as the current mobile destination on settings pages', () => {
    renderNavigation('/owner/settings')
    const settings = within(screen.getByRole('navigation', { name: 'Owner primary navigation' })).getByRole('link', { name: 'Settings' })
    expect(settings.getAttribute('href')).toBe('/owner/settings')
    expect(settings.getAttribute('aria-current')).toBe('page')
  })
})
