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

import type { OperationCardViewModel } from '@/modules/market/operation-view-model'
import { HomeCapabilityResults } from '@/components/ae/home/AeHomeLanding'

const operation = {
  operationRef: 'operation:v1:invoice-extraction',
  title: 'Invoice extraction',
  supplierName: 'Ledger Labs',
  supplierSlug: 'ledger-labs',
  supplierInitials: 'LL',
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
  popularity: { kind: 'no_activity', completedInvocations: 0, display: 'No completed calls yet', definition: 'No calls' },
  latency: { kind: 'insufficient_sample', sampleSize: 0, minimumSampleSize: 5, display: 'Not enough data', definition: 'No sample' },
} satisfies OperationCardViewModel

function renderResults() {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/market' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/operations/$operationRef' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  return render(
    <RouterContextProvider router={router}>
      <HomeCapabilityResults read={{ kind: 'ok', operations: [operation], matchedCount: 1 }} />
    </RouterContextProvider>,
  )
}

afterEach(cleanup)

describe('catalogue-first home', () => {
  it('peeks capabilities as catalog tiles instead of Operation rows', () => {
    renderResults()

    expect(screen.getByRole('heading', { level: 2, name: 'Tools in the catalog' })).toBeTruthy()
    const row = screen.getByRole('listitem')
    expect(
      within(row).getByRole('link', {
        name: 'Invoice extract, 1 Operation, from USD 1.25',
      }),
    ).toBeTruthy()
    expect(within(row).getByText('Extract line items and totals from a supplier invoice.')).toBeTruthy()
    expect(within(row).getByText('Data')).toBeTruthy()
    expect(screen.queryByText('Ledger Labs')).toBeNull()
    expect(screen.queryByText('Total price')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Use Invoice extraction' })).toBeNull()
    expect(
      within(row).getByRole('link', {
        name: 'Invoice extract, 1 Operation, from USD 1.25',
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

    expect(screen.getByText(/The tool catalog is temporarily unavailable/)).toBeTruthy()
    view.rerender(
      <RouterContextProvider router={router}>
        <HomeCapabilityResults read={{ kind: 'ok', operations: [], matchedCount: 0 }} />
      </RouterContextProvider>,
    )
    expect(screen.getByText(/No tools are ready right now/)).toBeTruthy()
    expect(screen.queryByText('Invoice extract')).toBeNull()
  })
})
