/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'

import {
  AeOperatorBreadcrumbs,
  truncateBreadcrumbLabel,
} from '@/components/ae/layout/AeOperatorBreadcrumbs'

const LONG_CALL_ID = 'call_cl_01jb89xyz000000000123456'

afterEach(() => {
  cleanup()
})

function renderBreadcrumbs(
  items: { label: string; href?: string }[],
  initialPath = '/',
) {
  const rootRoute = createRootRoute()
  const catchAll = createRoute({
    getParentRoute: () => rootRoute,
    path: '/$',
  })
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    catchAll,
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  })

  return render(
    <RouterContextProvider router={router}>
      <AeOperatorBreadcrumbs items={items} />
    </RouterContextProvider>,
  )
}

describe('truncateBreadcrumbLabel', () => {
  it('returns the full label when within max length', () => {
    expect(truncateBreadcrumbLabel('Calls')).toEqual({
      isTruncated: false,
      display: 'Calls',
    })
  })

  it('middle-truncates long ID-like labels', () => {
    const result = truncateBreadcrumbLabel(LONG_CALL_ID)
    expect(result.isTruncated).toBe(true)
    expect(result.display).toBe('call_cl_01...123456')
  })
})

describe('AeOperatorBreadcrumbs', () => {
  it('renders short breadcrumbs without truncation or tooltips', () => {
    renderBreadcrumbs([
      { label: 'Owner', href: '/owner' },
      { label: 'Calls', href: '/owner/calls' },
    ])

    expect(screen.getByRole('link', { name: 'Owner' })).toBeTruthy()
    expect(screen.getByText('Calls')).toBeTruthy()
    expect(document.querySelector('[data-slot="tooltip-trigger"]')).toBeNull()
    expect(document.querySelector('[data-slot="breadcrumb-ellipsis"]')).toBeNull()
  })

  it('middle-truncates long technical IDs and exposes the full label in a tooltip', () => {
    renderBreadcrumbs([
      { label: 'Calls', href: '/calls' },
      { label: LONG_CALL_ID },
    ])

    expect(screen.getByText('call_cl_01...123456')).toBeTruthy()
    expect(screen.queryByText(LONG_CALL_ID)).toBeNull()

    const trigger = document.querySelector('[data-slot="tooltip-trigger"]')
    expect(trigger).toBeTruthy()
    expect(within(trigger as HTMLElement).getByText('call_cl_01...123456')).toBeTruthy()
  })

  it('collapses intermediate crumbs when more than three hierarchy levels exist', () => {
    renderBreadcrumbs([
      { label: 'Root', href: '/root' },
      { label: 'Level two', href: '/root/two' },
      { label: 'Level three', href: '/root/two/three' },
      { label: 'Current page' },
    ])

    expect(screen.getByRole('link', { name: 'Root' })).toBeTruthy()
    expect(screen.getByText('Current page')).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Level two' })).toBeNull()
    expect(screen.queryByText('Level three')).toBeNull()
    expect(document.querySelector('[data-slot="breadcrumb-ellipsis"]')).toBeTruthy()
    expect(document.querySelector('[data-slot="breadcrumb-collapsed-items"]')).toBeTruthy()
  })

  it('reveals collapsed intermediate links when opening the ellipsis dropdown menu', async () => {
    renderBreadcrumbs([
      { label: 'Root', href: '/root' },
      { label: 'Level two', href: '/root/two' },
      { label: 'Level three', href: '/root/two/three' },
      { label: 'Current page' },
    ])

    const ellipsisBtn = screen.getByRole('button', { name: 'Show intermediate crumbs' })
    expect(ellipsisBtn).toBeTruthy()
    fireEvent.click(ellipsisBtn)
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Level two' }).getAttribute('href')).toBe('/root/two')
    expect(within(menu).getByRole('menuitem', { name: 'Level three' }).getAttribute('href')).toBe('/root/two/three')
  })

  it('keeps link navigation intact for non-collapsed crumbs', () => {
    renderBreadcrumbs(
      [
        { label: 'Root', href: '/root' },
        { label: 'Child', href: '/root/child' },
      ],
      '/root',
    )

    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    const link = within(nav).getByRole('link', { name: 'Root' })
    expect(link.getAttribute('href')).toBe('/root')
    expect(within(nav).getByText('Child')).toBeTruthy()
  })
})
