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
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}

describe('AeOperatorPage stickyHeader', () => {
  it('defaults stickyHeader to false with no sticky shelf', () => {
    renderAt(
      <AeOperatorPage
        operatorRole="owner"
        title="Tools"
        description="Manage tools."
        currentPath="/owner/operations"
      >
        <p>Page body</p>
      </AeOperatorPage>,
    )

    expect(document.querySelector('[data-sticky-shelf="true"]')).toBeNull()
    expect(screen.queryByTestId('operator-sticky-shelf')).toBeNull()
  })

  it('renders the sticky shelf when stickyHeader is true', () => {
    renderAt(
      <AeOperatorPage
        operatorRole="owner"
        title="Tools"
        description="Manage tools."
        currentPath="/owner/operations"
        stickyHeader
        secondaryBar={<div data-testid="secondary-filter-bar">Filters</div>}
      >
        <p>Page body</p>
      </AeOperatorPage>,
    )

    const shelf = screen.getByTestId('operator-sticky-shelf')
    expect(shelf.getAttribute('data-sticky-shelf')).toBe('true')
  })

  it('places record header and secondary bar inside the sticky shelf', () => {
    renderAt(
      <AeOperatorPage
        operatorRole="owner"
        title="Tools"
        description="Manage tools."
        currentPath="/owner/operations"
        stickyHeader
        secondaryBar={<div data-testid="secondary-filter-bar">Filters</div>}
      >
        <p>Page body</p>
      </AeOperatorPage>,
    )

    const shelf = screen.getByTestId('operator-sticky-shelf')
    expect(within(shelf).getByRole('heading', { level: 1, name: 'Tools' })).toBeTruthy()
    expect(within(shelf).getByTestId('secondary-filter-bar')).toBeTruthy()
  })
})

describe('AeRecordHeader sticky', () => {
  it('applies sticky styling and data attribute when sticky is true', () => {
    const { container } = render(
      <AeRecordHeader title="Record" description="Details." sticky />,
    )

    const root = container.firstElementChild
    expect(root?.getAttribute('data-record-header-sticky')).toBe('true')
    expect(root?.className).toContain('sticky')
    expect(root?.className).toContain('top-(--header-height)')
    expect(root?.className).toContain('backdrop-blur')
  })

  it('does not expose sticky marker when sticky is false', () => {
    const { container } = render(<AeRecordHeader title="Record" />)

    const root = container.firstElementChild
    expect(root?.getAttribute('data-record-header-sticky')).toBeNull()
    expect(root?.className).not.toContain('top-(--header-height)')
  })
})
