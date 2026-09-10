/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  PublicRouteError,
  PublicRoutePending,
  publicErrorCorrelationRef,
} from '@/components/ae/layout/AePublicRouteStates'
import { getRouter } from '@/router'

afterEach(cleanup)

describe('public route containment', () => {
  it('installs shared pending, error, and not-found defaults', () => {
    const router = getRouter()
    expect(router.options.defaultPendingComponent).toBe(PublicRoutePending)
    expect(router.options.defaultErrorComponent).toBe(PublicRouteError)
    expect(router.options.defaultNotFoundComponent).toBeTypeOf('function')
  })

  it('keeps private exception detail hidden while retaining bounded evidence', () => {
    renderAt(
      <PublicRouteError
        error={{ message: 'private provider credential failure', correlationRef: '  ref-public-123  ' }}
      />,
    )

    expect(screen.getByRole('alert').textContent).toContain('Couldn’t load this page')
    expect(screen.queryByText(/private provider credential failure/i)).toBeNull()
    expect(screen.getByText('ref-public-123')).not.toBeNull()
    expect(screen.getByRole('link', { name: 'Check system status' }).getAttribute('href')).toBe('/status')
  })

  it('allows only one authoritative read invalidation while retry is pending', () => {
    const deferred = Promise.withResolvers<void>()
    const { router } = renderAt(<PublicRouteError error={new Error('hidden')} />)
    const invalidate = vi.spyOn(router, 'invalidate').mockImplementation(() => deferred.promise as never)
    const retry = screen.getByRole('button', { name: 'Try again' })

    fireEvent.click(retry)
    fireEvent.click(retry)

    expect(invalidate).toHaveBeenCalledTimes(1)
    expect((retry as HTMLButtonElement).disabled).toBe(true)
    deferred.resolve()
  })

  it('drops oversized or empty correlation values', () => {
    expect(publicErrorCorrelationRef({ correlationId: ' '.repeat(10) })).toBeUndefined()
    expect(publicErrorCorrelationRef({ correlationRef: 'x'.repeat(201) })).toBeUndefined()
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
