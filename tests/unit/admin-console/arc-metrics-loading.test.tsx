/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import { AdminMetricsPageSkeleton } from '@/components/ae/admin/metrics/AdminMetricsPageSkeleton'

vi.mock('convex/react', () => ({
  useQuery: () => ({ kind: 'allowed', actorRef: 'principal:metrics-loading', role: 'support' }),
}))

afterEach(cleanup)

function renderMetricsSkeleton() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/metrics' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/admin/metrics'] }),
  })
  return render(
    <RouterContextProvider router={router}>
      <AdminMetricsPageSkeleton />
    </RouterContextProvider>,
  )
}

function expectDecorativeSkeleton(frame: Element) {
  const statuses = frame.querySelectorAll('[role="status"]')
  expect(statuses.length).toBeGreaterThan(0)
  for (const status of statuses) {
    expect(status.closest('[aria-hidden="true"]')).not.toBeNull()
  }
}

describe('Admin metrics loading composition', () => {
  it('keeps the existing frames and exposes one named loading status without placeholder facts or controls', () => {
    renderMetricsSkeleton()

    const loading = screen.getByRole('status', { name: 'Loading metrics' })
    expect(loading.getAttribute('aria-busy')).toBe('true')
    expect(screen.getAllByRole('status')).toHaveLength(1)

    const kpis = loading.querySelectorAll('.arc-admin-loading-kpi')
    const charts = loading.querySelectorAll('.arc-admin-loading-chart')
    const rows = loading.querySelectorAll('.arc-admin-loading-row')
    expect(kpis).toHaveLength(4)
    expect(charts).toHaveLength(1)
    expect(rows).toHaveLength(4)

    for (const frame of kpis) expectDecorativeSkeleton(frame)
    for (const frame of charts) expectDecorativeSkeleton(frame)
    for (const frame of rows) expectDecorativeSkeleton(frame)

    expect(loading.textContent?.trim()).toBe('')
    expect(loading.querySelector('button, a[href], input, select, textarea, [role="button"], [role="link"]')).toBeNull()
  })
})
