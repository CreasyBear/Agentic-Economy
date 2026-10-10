/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeLandingSearch } from '@/components/ae/home/AeLandingSearch'

afterEach(cleanup)

describe('landing search', () => {
  it.each([
    ['weather', { query: 'weather', sort: 'relevance' }],
    ['   ', {}],
  ])('submits %j to the market', async (typed, search) => {
    const root = createRootRoute()
    const routeTree = root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/', component: () => <AeLandingSearch /> }),
      createRoute({ getParentRoute: () => root, path: '/market', component: () => <h1>Tool market</h1> }),
    ])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    render(<RouterProvider router={router} />)

    const form = await screen.findByRole('search', { name: 'Search tools' })
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search tools' }), { target: { value: typed } })
    fireEvent.submit(form)

    expect(await screen.findByRole('heading', { name: 'Tool market' })).toBeTruthy()
    expect(router.state.location.pathname).toBe('/market')
    expect(router.state.location.search).toEqual(search)
  })
})
