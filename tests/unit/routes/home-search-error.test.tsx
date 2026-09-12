/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { Route } from '@/routes/index'

afterEach(cleanup)

describe('application entry navigation', () => {
  it.each(['/', '/?q=weather'])('opens the market from %s without a landing-page step', async (entry) => {
    const beforeLoad = Route.options.beforeLoad
    if (beforeLoad === undefined) throw new Error('root market redirect is unavailable')
    const root = createRootRoute()
    const routeTree = root.addChildren([
      createRoute({
        getParentRoute: () => root,
        path: '/',
        validateSearch: Route.options.validateSearch,
        beforeLoad: (ctx) => beforeLoad(ctx as never),
      }),
      createRoute({ getParentRoute: () => root, path: '/market', component: () => <h1>Tool market</h1> }),
    ])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [entry] }) })
    render(<RouterProvider router={router} />)

    expect(await screen.findByRole('heading', { name: 'Tool market' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/market')
    expect(router.state.location.search).toMatchObject(entry.includes('?')
      ? { query: 'weather' }
      : {})
  })
})
