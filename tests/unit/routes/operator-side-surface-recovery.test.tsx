/**
 * @vitest-environment jsdom
 */
import { createElement, type ReactNode } from 'react'
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

const serverMocks = vi.hoisted(() => ({
  readDirectory: vi.fn(),
  readOfferings: vi.fn(),
  readConnections: vi.fn(),
  readStatus: vi.fn(),
}))
const routeDiagnostics = vi.hoisted(() => ({ capture: vi.fn() }))

vi.mock('@/lib/observability/capture-route-exception', () => ({
  captureRouteException: routeDiagnostics.capture,
}))

vi.mock('@/lib/server/agent-access-console.functions', () => ({
  readAgentDirectoryServer: serverMocks.readDirectory,
}))

vi.mock('@/components/ae/layout/AeOperatorShell', () => ({
  AeOperatorShell: ({ children, title }: { children: ReactNode; title: string }) => (
    <main><h1>{title}</h1>{children}</main>
  ),
}))

vi.mock('@/components/ae/offerings/owner-offering.functions', () => ({
  readOwnerOfferingSupplyServer: serverMocks.readOfferings,
}))

vi.mock('@/lib/server/owner-status.functions', () => ({
  readOwnerStatusServer: serverMocks.readStatus,
}))

vi.mock('@/modules/capability-supply/supply-funnel.functions', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/modules/capability-supply/supply-funnel.functions')>()
  return { ...original, readOwnerProviderConnectionsServer: serverMocks.readConnections }
})

import { Route as ActivityRoute } from '@/routes/_operator/activity'
import { Route as ConnectionsRoute } from '@/routes/_operator/owner.settings.connections'

const emptyDirectory = Object.freeze({ items: Object.freeze([]), details: Object.freeze([]) })
const existingConnection = Object.freeze({
  connectionRef: 'provider-connection:partial',
  businessId: 'business-partial',
  providerRef: 'provider:partial',
  providerAccountRef: 'https://provider.example/partial',
  adapterId: 'x402-fetch:v2',
  grantedScopes: Object.freeze(['invoke']),
  grantedResources: Object.freeze(['https://provider.example/partial']),
  authorityGeneration: 1,
  authorityDigest: 'sha256:partial',
  lifecycle: 'active',
  available: true,
  credentialConfigured: false,
  observedAt: 1,
  reasonCode: null,
  evidenceRefs: Object.freeze([]),
  createdAt: 1,
  updatedAt: 1,
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  for (const mock of Object.values(serverMocks)) mock.mockReset()
  routeDiagnostics.capture.mockReset()
})

function renderRouteComponent(route: typeof ActivityRoute | typeof ConnectionsRoute, result: unknown) {
  vi.spyOn(route, 'useLoaderData').mockReturnValue(result as never)
  const Component = route.options.component
  if (Component === undefined) throw new Error('operator_side_surface_component_missing')
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([createRoute({ getParentRoute: () => rootRoute, path: '/' })])
  const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
  const invalidate = vi.spyOn(router, 'invalidate').mockResolvedValue(undefined)
  render(
    <RouterContextProvider router={router}>
      {createElement(Component)}
    </RouterContextProvider>,
  )
  return { invalidate }
}

describe('operator side-surface route recovery', () => {
  it('projects a Connections source rejection into an in-shell unavailable state', async () => {
    serverMocks.readStatus.mockResolvedValue({ kind: 'not_found' })
    serverMocks.readOfferings.mockResolvedValue({ kind: 'error', code: 'source_unavailable' })
    serverMocks.readConnections.mockRejectedValue(new Error('source offline'))
    const loader = ConnectionsRoute.options.loader as () => Promise<unknown>

    await expect(loader()).resolves.toEqual({ kind: 'unavailable' })
    expect(routeDiagnostics.capture).toHaveBeenCalledWith(
      expect.any(Error),
      { 'ae.surface': 'connections_read' },
    )

    const { invalidate } = renderRouteComponent(ConnectionsRoute, { kind: 'unavailable' })
    expect(screen.getByRole('alert').textContent).toContain('Connections are temporarily unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  })

  it('keeps successful Connections visible when only identity reads are unavailable', async () => {
    serverMocks.readStatus.mockRejectedValue(new Error('status source offline'))
    serverMocks.readOfferings.mockRejectedValue(new Error('offering source offline'))
    serverMocks.readConnections.mockResolvedValue([existingConnection])
    const loader = ConnectionsRoute.options.loader as () => Promise<unknown>

    await expect(loader()).resolves.toEqual({
      kind: 'available',
      identity: 'unavailable',
      connections: [existingConnection],
    })
    const { invalidate } = renderRouteComponent(ConnectionsRoute, {
      kind: 'available',
      identity: 'unavailable',
      connections: [existingConnection],
    })
    expect(screen.getByRole('alert').textContent).toContain('Connection setup is temporarily unavailable')
    expect(screen.getByText('https://provider.example/partial')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Connect provider' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Refresh authority' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: 'Revoke' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reload identity' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  })

  it('projects a Calls source rejection into an in-shell unavailable state', async () => {
    serverMocks.readDirectory.mockRejectedValue(new Error('source offline'))
    const loader = ActivityRoute.options.loader as () => Promise<unknown>

    await expect(loader()).resolves.toEqual({ kind: 'unavailable' })
    expect(routeDiagnostics.capture).toHaveBeenCalledWith(
      expect.any(Error),
      { 'ae.surface': 'operator_activity_loader' },
    )

    const { invalidate } = renderRouteComponent(ActivityRoute, { kind: 'unavailable' })
    expect(screen.getByRole('alert').textContent).toContain('Calls are temporarily unavailable')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1))
  })

  it('keeps successful Connections and Calls results explicitly available', async () => {
    serverMocks.readStatus.mockResolvedValue({ kind: 'not_found' })
    serverMocks.readOfferings.mockResolvedValue({ kind: 'not_found' })
    serverMocks.readConnections.mockResolvedValue([])
    serverMocks.readDirectory.mockResolvedValue(emptyDirectory)
    const connectionsLoader = ConnectionsRoute.options.loader as () => Promise<unknown>
    const activityLoader = ActivityRoute.options.loader as () => Promise<unknown>

    await expect(connectionsLoader()).resolves.toEqual({ kind: 'available', identity: 'not_found', connections: [] })
    await expect(activityLoader()).resolves.toEqual({ kind: 'available', directory: emptyDirectory })
  })
})
