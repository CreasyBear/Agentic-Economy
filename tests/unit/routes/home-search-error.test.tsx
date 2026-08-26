/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType, ReactElement } from 'react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { Route } from '@/routes/index'

afterEach(() => {
  cleanup()
})

function renderWithRouter(ui: ReactElement) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/for-providers' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/sign-in/$' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/for-agents' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/privacy' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/terms' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}

describe('homepage search error', () => {
  it('explains the transient failure and gives a truthful recovery action', () => {
    const ErrorComponent = Route.options.errorComponent as ComponentType
    renderWithRouter(<ErrorComponent />)

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('Unable to load capabilities')
    expect(alert.textContent).toContain('Check your connection and try again.')
    expect(alert.textContent).toContain('No capability was called.')

    const backToSearch = screen.getByRole('link', { name: 'Try again' })
    expect(backToSearch.getAttribute('href')).toBe('/')
    expect(backToSearch.classList.contains('min-h-touch')).toBe(true)
  })
})
