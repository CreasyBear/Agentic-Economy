/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const queryMock = vi.hoisted(() => vi.fn())

vi.mock('convex/react', () => ({
  useConvex: () => ({ query: queryMock }),
}))

import { AdminObjectSearch } from '@/components/ae/admin/object-search/AdminObjectSearch'

function renderSearch() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/calls/$callRef' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  render(
    <RouterContextProvider router={router}>
      <AdminObjectSearch initialKind="call" />
    </RouterContextProvider>,
  )
  return router
}

function submitReference(ref: string) {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Reference' }), { target: { value: ref } })
  fireEvent.click(screen.getByRole('button', { name: 'Search' }))
}

afterEach(() => {
  cleanup()
  queryMock.mockReset()
  window.localStorage.clear()
})

describe('/admin/search', () => {
  it('renders the Call-specific malformed reference copy', async () => {
    queryMock.mockResolvedValueOnce({ kind: 'malformed', code: 'malformed_call_ref' })
    renderSearch()

    submitReference('not-a-call')

    expect(await screen.findByText('The Call reference is not valid.')).toBeTruthy()
  })

  it('renders the object-not-found copy', async () => {
    queryMock.mockResolvedValueOnce({ kind: 'object_not_found' })
    renderSearch()

    submitReference(`operation-invocation:v1:${'f'.repeat(64)}`)

    expect(await screen.findByText('No object with that reference.')).toBeTruthy()
  })

  it('navigates a found Call to its object page', async () => {
    const ref = `operation-invocation:v1:${'a'.repeat(64)}`
    queryMock.mockResolvedValueOnce({ kind: 'found', ref: { kind: 'call', ref } })
    const router = renderSearch()

    submitReference(ref)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(`/admin/calls/${encodeURIComponent(ref)}`)
    })
    expect(queryMock).toHaveBeenCalledTimes(1)
    expect(window.localStorage.getItem('ae.admin.recentRefs')).toBe(
      JSON.stringify([{ kind: 'call', ref }]),
    )
  })
})
