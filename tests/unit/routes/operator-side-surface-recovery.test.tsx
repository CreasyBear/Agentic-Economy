/** @vitest-environment jsdom */
import { createElement, type ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

const serverMocks = vi.hoisted(() => ({ readDirectory: vi.fn() }))
const routeDiagnostics = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('@/lib/observability/capture-route-exception', () => ({ captureRouteException: routeDiagnostics.capture }))
vi.mock('@/lib/server/agent-access-console.functions', () => ({ readAgentDirectoryServer: serverMocks.readDirectory }))
vi.mock('@/components/ae/layout/AeOperatorShell', () => ({
  AeOperatorShell: ({ children, title }: { children: ReactNode; title: string }) => <main><h1>{title}</h1>{children}</main>,
}))

import { Route as ActivityRoute } from '@/routes/_operator/activity'

afterEach(() => {
  cleanup()
  serverMocks.readDirectory.mockReset()
  routeDiagnostics.capture.mockReset()
})

function renderActivity(result: unknown) {
  vi.spyOn(ActivityRoute, 'useLoaderData').mockReturnValue(result as never)
  const Component = ActivityRoute.options.component
  if (Component === undefined) throw new Error('activity_component_missing')
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  const invalidate = vi.spyOn(router, 'invalidate').mockResolvedValue(undefined)
  render(<RouterContextProvider router={router}>{createElement(Component)}</RouterContextProvider>)
  return invalidate
}

describe('Calls side-surface recovery', () => {
  it('projects a source rejection into an in-shell unavailable state', async () => {
    serverMocks.readDirectory.mockRejectedValue(new Error('source offline'))
    const loader = ActivityRoute.options.loader as () => Promise<unknown>
    await expect(loader()).resolves.toEqual({ kind: 'unavailable' })
    expect(routeDiagnostics.capture).toHaveBeenCalledWith(expect.any(Error), { 'ae.surface': 'operator_activity_loader' })
    const invalidate = renderActivity({ kind: 'unavailable' })
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  })

  it('keeps a successful empty directory explicitly available', async () => {
    const directory = { items: [], details: [] }
    serverMocks.readDirectory.mockResolvedValue(directory)
    const loader = ActivityRoute.options.loader as () => Promise<unknown>
    await expect(loader()).resolves.toEqual({ kind: 'available', directory })
  })
})
