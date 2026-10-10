/**
 * @vitest-environment jsdom
 */
import type { ReactElement } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeRecordHeader } from '@/components/ae/layout/AeRecordHeader'

afterEach(() => {
  cleanup()
})

function renderAt(ui: ReactElement, pathname = '/owner/operations') {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/operations' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/admin/accounts' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}

describe('AeOperatorPage', () => {
  it('places description and secondary bar inside the page stack without an h1', () => {
    renderAt(
      <AeOperatorPage
        operatorRole="owner"
        title="Tools"
        description="Manage tools."
        currentPath="/owner/operations"
        secondaryBar={<div data-testid="secondary-filter-bar">Filters</div>}
      >
        <p>Page body</p>
      </AeOperatorPage>,
    )

    const stack = screen.getByTestId('operator-page-stack')
    expect(within(stack).getByText('Manage tools.')).toBeTruthy()
    expect(within(stack).getByTestId('secondary-filter-bar')).toBeTruthy()
    expect(within(stack).queryByRole('heading', { level: 1 })).toBeNull()
  })
})

describe('AeRecordHeader sticky', () => {
  it('exposes the sticky contract while retaining the heading, description and actions', () => {
    const { container } = render(
      <AeRecordHeader title="Record" description="Details." sticky actions={<button type="button">Refresh record</button>} />,
    )

    const root = container.firstElementChild
    expect(root?.getAttribute('data-record-header-sticky')).toBe('true')
    expect(screen.getByRole('heading', { level: 1, name: 'Record' })).toBeTruthy()
    expect(document.getElementById(root?.getAttribute('aria-describedby') ?? '')?.textContent).toBe('Details.')
    expect(screen.getByRole('button', { name: 'Refresh record' })).toBeTruthy()
  })

  it('does not expose sticky marker when sticky is false', () => {
    const { container } = render(<AeRecordHeader title="Record" />)

    const root = container.firstElementChild
    expect(root?.getAttribute('data-record-header-sticky')).toBeNull()
  })
})

describe('admin current destination', () => {
  it('marks Accounts, without also marking Overview, on the Accounts route', () => {
    renderAt(<AeOperatorPage operatorRole="admin" title="Accounts" description="" currentPath="/admin/accounts"><p>Accounts</p></AeOperatorPage>, '/admin/accounts')
    const navigation = screen.getByRole('navigation', { name: 'Admin navigation' })
    expect(within(navigation).getByRole('link', { name: 'Accounts' }).getAttribute('aria-current')).toBe('page')
    expect(within(navigation).getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull()
  })
})
