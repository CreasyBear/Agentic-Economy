/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeNetworkHealthIndicator } from '@/components/ae/layout/AeNetworkHealthIndicator'

afterEach(cleanup)

describe('AeNetworkHealthIndicator (S-16)', () => {
  it('links to system status without claiming live connection state', () => {
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/status' }),
    ])
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    render(
      <RouterContextProvider router={router}>
        <AeNetworkHealthIndicator />
      </RouterContextProvider>,
    )

    const link = screen.getByRole('link', { name: 'System status' })
    expect(link.getAttribute('href')).toBe('/status')
  })
})
