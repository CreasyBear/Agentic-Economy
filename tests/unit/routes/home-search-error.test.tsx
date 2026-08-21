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
    expect(alert.textContent).toContain('We couldn’t search right now')
    expect(alert.textContent).toContain('We couldn’t search for businesses right now.')
    expect(alert.textContent).toContain('Your request wasn’t the problem')
    expect(alert.textContent).toContain('no business was contacted')
    expect(screen.queryByText(/market is temporarily unavailable/i)).toBeNull()

    const backToSearch = screen.getByRole('link', { name: 'Back to search' })
    expect(backToSearch.getAttribute('href')).toBe('/')
    expect(backToSearch.classList.contains('min-h-11')).toBe(true)
  })
})
