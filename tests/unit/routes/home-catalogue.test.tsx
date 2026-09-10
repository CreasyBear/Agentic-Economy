/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import type { ToolCardViewModel } from '@/modules/market/tool-view-model'
import { HomeCapabilityResults } from '@/components/ae/home/AeHomeLanding'

const tool = {
  toolRef: 'operation:v1:invoice-extraction',
  title: 'Invoice extraction',
  providerName: 'Ledger Labs',
  providerSlug: 'ledger-labs',
  providerInitials: 'LL',
  capabilityId: 'invoice.extract',
  capability: 'Invoice extract',
  category: { id: 'data-research', label: 'Data', description: 'Data tools' },
  summary: 'Extract line items and totals from a supplier invoice.',
  readiness: 'Routeable',
  readinessLabel: 'Ready now',
  trustFact: 'Ready to run through Agentic Economy',
  price: 'USD 1.25',
  authentication: 'API key',
  lastVerifiedAt: 1_725_000_000_000,
  callLabel: 'Use capability',
  rating: { kind: 'unrated', count: 0, display: 'No ratings yet', definition: 'No rating' },
  popularity: { kind: 'no_activity', completedCalls: 0, display: 'No completed calls yet', definition: 'No calls' },
  latency: { kind: 'insufficient_sample', sampleSize: 0, minimumSampleSize: 5, display: 'Not enough data', definition: 'No sample' },
} satisfies ToolCardViewModel

function renderResults() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/market' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/tools/$toolRef' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <RouterContextProvider router={router}>
      <HomeCapabilityResults read={{ kind: 'ok', tools: [tool], matchedCount: 1 }} />
    </RouterContextProvider>,
  )
}

afterEach(cleanup)

describe('catalogue-first home', () => {
  it('peeks capabilities as catalog tiles instead of Tool rows', () => {
    renderResults()

    expect(screen.getByRole('heading', { level: 2, name: 'Current Tools' })).toBeTruthy()
    const row = screen.getByRole('listitem')
    expect(
      within(row).getByRole('link', {
        name: 'Invoice extract, Ledger Labs, USD 1.25',
      }),
    ).toBeTruthy()
    expect(within(row).getByText('Extract line items and totals from a supplier invoice.')).toBeTruthy()
    expect(within(row).getByText('Data')).toBeTruthy()
    expect(within(row).getByText('Ledger Labs')).toBeTruthy()
    expect(screen.queryByText('Total price')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Use Invoice extraction' })).toBeNull()
    expect(
      within(row).getByRole('link', {
        name: 'Invoice extract, Ledger Labs, USD 1.25',
      }).getAttribute('href'),
    ).toContain('capability=invoice.extract')
  })

  it('states unavailable and empty catalogue conditions without presenting stale capability facts', () => {
    const rootRoute = createRootRoute()
    const routeTree = rootRoute.addChildren([
      createRoute({ getParentRoute: () => rootRoute, path: '/' }),
      createRoute({ getParentRoute: () => rootRoute, path: '/market' }),
    ])
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ['/'] }) })
    const view = render(
      <RouterContextProvider router={router}>
        <HomeCapabilityResults read={{ kind: 'unavailable' }} />
      </RouterContextProvider>,
    )

    expect(screen.getByText(/The Tool catalog is temporarily unavailable/)).toBeTruthy()
    const retry = screen.getByRole('link', { name: 'Try again' })
    expect(retry.getAttribute('href')).toBe('/')
    view.rerender(
      <RouterContextProvider router={router}>
        <HomeCapabilityResults read={{ kind: 'ok', tools: [], matchedCount: 0 }} />
      </RouterContextProvider>,
    )
    expect(screen.getByText(/No Tools are published yet/)).toBeTruthy()
    expect(screen.queryByText('Invoice extract')).toBeNull()
    const browse = screen.getAllByRole('link', { name: 'Browse Tools' })
    expect(browse.some((link) => link.getAttribute('href')?.includes('/market'))).toBe(true)
  })
})
