/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentType, ReactElement } from 'react'
import { isNotFound, RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import type { PublicBusinessRouteDataResult } from '@/lib/server/public-business-route.functions'

const readPublicBusinessRouteMock = vi.hoisted(() =>
  vi.fn<(input: { data: { slug: string } }) => Promise<PublicBusinessRouteDataResult>>(),
)

vi.mock('@/lib/server/public-business-route.functions', () => ({
  readPublicBusinessRouteServer: readPublicBusinessRouteMock,
}))

import { PublicBusinessNotFound } from '@/components/ae/listing/PublicBusinessNotFound'
import { Route } from '@/routes/$slug'


afterEach(() => {
  cleanup()
  readPublicBusinessRouteMock.mockReset()
})

async function loadSlug(slug: string): Promise<unknown> {
  const loader = Route.options.loader as (input: { params: { slug: string } }) => Promise<unknown>
  return loader({ params: { slug } }).then(
    (value) => value,
    (error: unknown) => error,
  )
}

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
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <RouterContextProvider router={router}>
      {ui}
    </RouterContextProvider>,
  )
}

describe('/$slug not-found reason', () => {
  it('raises a not-found for a slug with no business record, carrying no_such_business', async () => {
    readPublicBusinessRouteMock.mockResolvedValue({ kind: 'not_found', reason: 'no_such_business' })

    const thrown = await loadSlug('definitely-not-a-business-xyz')

    expect(isNotFound(thrown)).toBe(true)
    expect(thrown).toMatchObject({ data: { reason: 'no_such_business' } })
    expect(readPublicBusinessRouteMock).toHaveBeenCalledWith({ data: { slug: 'definitely-not-a-business-xyz' } })

  })

  it('raises a not-found carrying not_public for a business record that is not published', async () => {
    readPublicBusinessRouteMock.mockResolvedValue({ kind: 'not_found', reason: 'not_public' })

    const thrown = await loadSlug('unpublished-business')

    expect(isNotFound(thrown)).toBe(true)
    expect(thrown).toMatchObject({ data: { reason: 'not_public' } })
  })

  it('marks the not-found response noindex because there is no page to index', async () => {
    const head = await Route.options.head?.({ loaderData: undefined } as never)

    expect(head?.meta).toContainEqual({ name: 'robots', content: 'noindex' })
    expect(head?.meta).toContainEqual({ title: 'Page not found | Agentic Economy' })
  })
})

describe('PublicBusinessNotFound copy', () => {
  it('does not assert that a business exists when no record was found', () => {
    renderWithRouter(<PublicBusinessNotFound data={{ reason: 'no_such_business' }} isNotFound routeId="/$slug" />)

    expect(screen.getByText('No supplier at this address')).toBeTruthy()
    expect(screen.queryByText(/may need to claim or review it/)).toBeNull()

    expect(screen.getByRole('link', { name: 'Browse catalog' }).getAttribute('href')).toContain('/market')
  })

  it('does not revive claim framing when a real business page is withheld', () => {
    renderWithRouter(<PublicBusinessNotFound data={{ reason: 'not_public' }} isNotFound routeId="/$slug" />)

    expect(screen.getByText('Supplier profile unavailable')).toBeTruthy()
    expect(screen.getByText('This supplier is not published in the catalogue right now.')).toBeTruthy()
    expect(screen.queryByText(/claim or review/)).toBeNull()
    expect(screen.getByRole('link', { name: 'Back to catalog' }).getAttribute('href')).toContain('/market')
  })

  it('falls back to the no-such-business copy when the boundary carries no reason', () => {
    renderWithRouter(<PublicBusinessNotFound isNotFound routeId="/$slug" />)

    expect(screen.getByText('No supplier at this address')).toBeTruthy()
    expect(screen.queryByText(/may need to claim or review it/)).toBeNull()
  })
})

describe('ProviderListingError copy', () => {
  it('returns to the catalogue without internal terminology and keeps recovery links at 44px', () => {
    const ErrorComponent = Route.options.errorComponent as ComponentType
    renderWithRouter(<ErrorComponent />)

    expect(screen.getByText('This supplier didn’t load')).toBeTruthy()
    expect(screen.queryByText(/registry/i)).toBeNull()
    expect(screen.getByRole('link', { name: 'Try again' }).classList.contains('min-h-11')).toBe(true)
    expect(screen.getByRole('link', { name: 'Back to catalog' }).getAttribute('href')).toContain('/market')
    expect(screen.getByRole('link', { name: 'Back to catalog' }).classList.contains('min-h-11')).toBe(true)
  })
})
