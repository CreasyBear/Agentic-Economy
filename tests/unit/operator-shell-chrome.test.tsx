// @vitest-environment jsdom

import { useMemo, useState, type ReactElement } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import '../setup/jsdom-platform'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { OperatorRouteNotFound } from '@/components/ae/layout/AeOperatorRouteStates'
import { Route as OperatorLayoutRoute } from '@/routes/_operator'
import { Route as AgentAccessRoute } from '@/routes/_operator/agent-access'


afterEach(cleanup)

describe('operator shell nested chrome', () => {
  it('replaces actions, breadcrumbs, and badges when nested route chrome changes', async () => {
    render(<OperatorShellHarness />)

    expect(await screen.findByText('Action one')).toBeTruthy()
    expect(screen.getAllByText('First crumb').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Update chrome' }))

    expect(await screen.findByText('Action two')).toBeTruthy()
    expect(screen.queryByText('Action one')).toBeNull()
    expect(screen.getAllByText('Second crumb').length).toBeGreaterThan(0)
    expect(screen.queryByText('First crumb')).toBeNull()
    expect(screen.getAllByText('5').length).toBeGreaterThan(0)
  })

  it('uses the existing operator shell for unmatched assistant descendants', async () => {
    expect(OperatorLayoutRoute.options.notFoundComponent).toBe(OperatorRouteNotFound)
    expect(AgentAccessRoute.options.notFoundComponent).toBe(OperatorRouteNotFound)

    renderAt(
      <AeOperatorShell
        operatorRole="owner"
        title="Operator workspace"
        description="Loading the latest operator view."
        currentPath="/agent-access/unknown"
      >
        <OperatorRouteNotFound />
      </AeOperatorShell>,
      '/agent-access/unknown',
    )

    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 }).map(({ textContent }) => textContent)).toEqual(['Page not found'])
    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getAllByTestId('skip-to-content')).toHaveLength(1)
    expect(screen.getAllByRole('navigation', { name: 'Operator navigation' })).toHaveLength(1)
    expect(screen.queryByRole('navigation', { name: 'Public navigation' })).toBeNull()

    const recovery = screen.getByRole('link', { name: 'Back to assistant access' })
    expect(recovery.getAttribute('href')).toBe('/agent-access')
  })
})

function OperatorShellHarness() {
  const [version, setVersion] = useState<'one' | 'two'>('one')
  const actions = useMemo(() => <button type="button">Action {version}</button>, [version])
  const breadcrumbs = useMemo(() => [
    { label: version === 'one' ? 'First crumb' : 'Second crumb', href: `/admin/${version}` },
  ], [version])
  const navBadges = useMemo(() => ({ '/admin/inquiries': version === 'one' ? 2 : 5 }), [version])

  return (
    <AeOperatorShell
      operatorRole="admin"
      title="Outer shell"
      description="Outer shell description"
      currentPath="/admin"
    >
      <button type="button" onClick={() => setVersion('two')}>Update chrome</button>
      <AeOperatorShell
        operatorRole="admin"
        title="Nested shell"
        description="Nested shell description"
        currentPath="/admin/inquiries"
        actions={actions}
        breadcrumbs={breadcrumbs}
        navBadges={navBadges}
      >
        <div>Nested content</div>
      </AeOperatorShell>
    </AeOperatorShell>
  )
}

function renderAt(ui: ReactElement, pathname: string) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/agent-access' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/agent-access/$' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })

  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
