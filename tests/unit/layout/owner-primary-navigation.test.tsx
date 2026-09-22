// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
import { roleHomeHref, roleLabel } from '@/lib/operator/roles'
afterEach(cleanup)

function renderNavigation(pathname: string) {
  const root = createRootRoute()
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/market' }),
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
  it('uses Overview as the owner workspace home', () => {
    expect(roleHomeHref.owner).toBe('/owner')
    expect(roleLabel.owner).toBe('Workspace')
  })

  it('renders the canonical primary destinations without route metadata', () => {
    renderNavigation('/activity')

    const { primary } = mobileNavigation()
    const navigation = screen.getByRole('navigation', { name: 'Owner primary navigation' })
    const links = within(navigation).getAllByRole('link')

    expect(links.map(link => link.textContent)).toEqual(primary.map(destination => destination.label))
    expect(links.map(link => link.getAttribute('href'))).toEqual(primary.map(destination => destination.to))
    expect(links.filter(link => link.getAttribute('aria-current') === 'page').map(link => link.textContent)).toEqual(['Calls'])
    expect(navigation.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(5)
  })

  it('lists the remaining canonical destinations under Provider and Utilities', () => {
    renderNavigation('/owner/operations')

    const moreButton = screen.getByRole('button', { name: 'More' })
    expect(moreButton.getAttribute('aria-current')).toBe('page')
    fireEvent.click(moreButton)

    const { more } = mobileNavigation()
    const sheet = screen.getByRole('dialog', { name: 'More' })
    expect(within(sheet).getByRole('heading', { name: 'Provider' })).toBeTruthy()
    expect(within(sheet).getByRole('heading', { name: 'Utilities' })).toBeTruthy()

    const links = within(sheet).getAllByRole('link')
    expect(links.map(link => link.textContent)).toEqual(more.map(destination => destination.label))
    expect(links.map(link => link.getAttribute('href'))).toEqual(
      more.map(destination => `${destination.to}${destination.hash ?? ''}`),
    )
    expect(within(sheet).getByRole('link', { name: 'Tools' }).getAttribute('aria-current')).toBe('page')
  })
})
