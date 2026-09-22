/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const useQueryMock = vi.hoisted(() => vi.fn())
vi.mock('convex/react', () => ({ useQuery: useQueryMock }))

import { AdminExceptionsPage } from '@/components/ae/admin/exceptions/AdminExceptionsPage'
import type { AdminExceptionFeed } from '@/lib/operator/admin-console/contracts'
import { parseBusinessSlug } from '@/modules/business/public'

const parsedSlug = parseBusinessSlug('exception-provider')
if (parsedSlug.kind === 'malformed') throw new Error('admin_exception_fixture_slug_invalid')

function renderPage(
  feed: AdminExceptionFeed,
  search: { kind?: 'removal_dispute' } = {},
  onSearchChange = vi.fn(),
) {
  useQueryMock
    .mockReturnValueOnce(feed)
    .mockReturnValueOnce([])
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/calls/$callRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/tools/$toolRef' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/providers/$slug' }),
  ])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  render(
    <RouterContextProvider router={router}>
      <AdminExceptionsPage search={search} onSearchChange={onSearchChange} />
    </RouterContextProvider>,
  )
  return onSearchChange
}

afterEach(() => {
  cleanup()
  useQueryMock.mockReset()
})

describe('/admin/exceptions', () => {
  it('renders exception rows and clears a selected kind filter', () => {
    const onSearchChange = renderPage({
      items: [{
        kind: 'removal_dispute',
        disputeRef: 'dispute:route-test',
        businessSlug: parsedSlug.slug,
        since: Date.now() - 60_000,
      }],
      unavailable: [],
    }, { kind: 'removal_dispute' })

    expect(screen.getByText('dispute:route-test')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onSearchChange).toHaveBeenCalledWith({})
  })

  it('renders the unfiltered empty state', () => {
    renderPage({ items: [], unavailable: [] })

    expect(screen.getByText('Nothing needs attention.')).toBeTruthy()
  })
})
