/** @vitest-environment jsdom */
import { getFunctionName } from 'convex/server'
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
import type { AdminExceptionsSearch } from '@/components/ae/admin/exceptions/exceptions.contracts'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { parseBusinessSlug } from '@/modules/business/public'

const parsedSlug = parseBusinessSlug('exception-provider')
if (parsedSlug.kind === 'malformed') throw new Error('admin_exception_fixture_slug_invalid')

function renderPage(
  feed: AdminExceptionFeed,
  search: AdminExceptionsSearch = {},
  onSearchChange = vi.fn(),
) {
  useQueryMock.mockImplementation((query) =>
    getFunctionName(query) === 'adminConsoleExceptions:listAdminExceptions' ? feed : [])
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
      total: 1,
      truncated: false,
      counts: { uncertain_call: 0, removal_dispute: 1, source_authority_review: 0, admission_case: 0 },
    }, { kind: 'removal_dispute' })

    expect(screen.getByRole('button', { name: 'Removal disputes (1)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onSearchChange).toHaveBeenCalledWith({})
  })

  it('renders the unfiltered empty state', () => {
    renderPage({
      items: [], total: 0, truncated: false,
      counts: { uncertain_call: 0, removal_dispute: 0, source_authority_review: 0, admission_case: 0 },
      unavailable: [],
    })

    expect(screen.getByText('Nothing needs attention.')).toBeTruthy()
  })

  it('does not mistake another unavailable source for an empty selected queue', () => {
    renderPage({
      items: [], total: 0, truncated: false,
      counts: { uncertain_call: 0, removal_dispute: 0, source_authority_review: 0, admission_case: 0 },
      unavailable: ['admission_case'],
    }, { kind: 'removal_dispute' })
    expect(screen.getByText('No matches for these filters.')).toBeTruthy()
    expect(screen.queryByText('Exception source unavailable.')).toBeNull()
  })

  it('shows the oldest-100 cue and exact tab count, with a direct object link and review next step', () => {
    const toolRef = `operation:v1:${'c'.repeat(64)}`
    if (!isPublicToolRef(toolRef)) throw new Error('invalid_tool_ref_fixture')
    renderPage({
      items: [{
        kind: 'source_authority_review',
        publicationRef: toolRef,
        businessSlug: parsedSlug.slug,
        since: Date.now() - 60_000,
      }],
      total: 103,
      truncated: true,
      counts: { uncertain_call: 0, removal_dispute: 0, source_authority_review: 103, admission_case: 0 },
      unavailable: [],
    }, { kind: 'source_authority_review' })
    expect(screen.getByText('Showing oldest 100 of 103')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Source authority reviews (103)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: `View details: ${toolRef}` }))
    expect(screen.getByText('Next step: Verify source authority on the Tool version record.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open object record' }).getAttribute('href')).toBe(`/admin/tools/${encodeURIComponent(toolRef)}`)
  })
})
