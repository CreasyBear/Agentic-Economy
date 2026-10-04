/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AePageSkeleton } from '@/components/ae/layout/AePageState'
import {
  RouteError,
  RoutePending,
  errorCorrelationRef,
} from '@/components/ae/layout/AeRouteStates'
import { getRouter } from '@/router'

afterEach(cleanup)

describe('public route containment', () => {
  it.each(['list', 'detail', 'market'] as const)('exposes one named loading state for the %s shape', shape => {
    const { container } = renderAt(<AePageSkeleton title="Loading services" description="Fetching the current catalogue." shape={shape} />)
    expect(screen.getAllByRole('status')).toHaveLength(1)
    expect(screen.getByRole('status', { name: 'Loading services' }).getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('Fetching the current catalogue.')).toBeTruthy()
    expect(within(screen.getByRole('status', { name: 'Loading services' })).queryByRole('button')).toBeNull()
    expect(container.querySelector('.arc-loading-line')).toBeNull()
  })

  it('installs shared pending, error, and not-found defaults', () => {
    const router = getRouter()
    expect(router.options.defaultPendingComponent).toBe(RoutePending)
    expect(router.options.defaultErrorComponent).toBe(RouteError)
    expect(router.options.defaultNotFoundComponent).toBeTypeOf('function')
  })

  it('keeps private exception detail hidden while retaining bounded evidence', () => {
    renderAt(
      <RouteError
        error={{ message: 'private provider credential failure', correlationRef: '  ref-public-123  ' }}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('Couldn’t load this page')
    expect(screen.queryByText(/private provider credential failure/i)).toBeNull()
    expect(screen.getByText('ref-public-123')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Check system status' }).getAttribute('href')).toBe('/status')
  })

  it('allows only one authoritative read invalidation while retry is pending', async () => {
    const deferred = Promise.withResolvers<void>()
    const { router } = renderAt(<RouteError error={new Error('hidden')} />)
    const invalidate = vi.spyOn(router, 'invalidate').mockImplementation(() => deferred.promise as never)
    const retry = screen.getByRole('button', { name: 'Try again' })

    fireEvent.click(retry)
    fireEvent.click(retry)

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect((retry as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Trying again…' })).toBe(retry)
    deferred.resolve()
    await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false))
  })

  it('drops oversized or empty correlation values', () => {
    expect(errorCorrelationRef({ correlationId: ' '.repeat(10) })).toBeUndefined()
    expect(errorCorrelationRef({ correlationRef: 'x'.repeat(201) })).toBeUndefined()
  })
})

function renderAt(ui: React.ReactElement) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  const result = render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
  return { ...result, router }
}
