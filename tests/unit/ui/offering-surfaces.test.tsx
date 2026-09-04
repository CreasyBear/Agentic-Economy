/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import {
  RouterContextProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

import {
  AeOwnerOfferingsList,
  toOwnerOfferingSummary,
} from '@/components/ae/offerings/AeOwnerOfferings'
import { brandNonEmpty } from '@/modules/common/ids'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { PublicOfferingSupplyProjection } from '@/modules/catalog/public'

afterEach(cleanup)

describe('Supplier Operation directory', () => {
  it('starts the source-native Add Operation journey', () => {
    renderAt(<AeOwnerOfferingsList offerings={[]} />, '/owner/offerings')

    expect(screen.getByRole('heading', { name: 'No Operations yet' })).toBeTruthy()
    expect(screen.getByText('Connect a source and choose the exact Operation AE should validate.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Add Operation' }).getAttribute('href')).toBe('/owner/offerings/new')
  })

  it('opens the authoritative Supplier Operation readback', () => {
    const projection = projectionFixture()
    renderAt(
      <AeOwnerOfferingsList
        offerings={[toOwnerOfferingSummary(projection)]}
        projectionState="projection_pending"
        onRetryProjection={vi.fn()}
      />,
      '/owner/offerings',
    )

    expect(screen.getByText('Your public page is still updating')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Refresh public status' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open Blockchain data query' }).getAttribute('href'))
      .toBe('/owner/supply/offering%3Ablockchain-query')
  })

  it('orders compact rows as Operation, lifecycle, blocker, and one continuation', () => {
    const offering = {
      ...toOwnerOfferingSummary(projectionFixture()),
      lifecycleLabel: 'Published',
      availability: 'available' as const,
      blocker: 'Reconnect the provider',
      continuation: { label: 'Manage connection', href: '/owner/offerings#supplier-connections' },
    }

    renderAt(<AeOwnerOfferingsList offerings={[offering]} />, '/owner/offerings')

    const compactList = screen.getByTestId('owner-operations-compact-list')
    const row = within(compactList).getByRole('listitem')
    expect(Array.from(row.children).map((child) => child.textContent)).toEqual([
      'Blockchain data queryPublished / Available',
      'Reconnect the provider',
      'Manage connection',
    ])
    expect(within(row).getByRole('link', { name: 'Manage connection for Blockchain data query' }).className)
      .toContain('w-full')
  })
})

function projectionFixture(): PublicOfferingSupplyProjection {
  return {
    offering: {
      offeringRef: brandNonEmpty('offering:blockchain-query', 'OfferingRef'),
      revision: 2,
      name: 'Blockchain data query',
      category: 'Data',
      summary: 'Query indexed blockchain data.',
      pricingSummary: 'Usage based',
      price: {
        kind: 'fixed',
        amount: { currency: 'AUD', units: '4200', exponent: 2 },
        unit: 'item',
        taxTreatment: 'inclusive',
      },
    },
    accessPaths: [{
      accessPathRef: brandNonEmpty('access:blockchain-query', 'AccessPathRef'),
      offeringRevision: 2,
      offeringSourceHash: canonicalDigest('offering-surfaces:blockchain-query'),
      sourceHash: canonicalDigest('offering-surfaces:access:blockchain-query'),
      descriptor: {
        kind: 'external_operation',
        name: 'GraphQL endpoint',
        summary: 'Quotes this published offering through the labelled sandbox provider.',
        url: 'https://example.com/api/query',
        method: 'POST',
        documentationUrl: 'https://example.com/docs',
        provenance: 'business_declared',
      },
    }],
    support: { integrated: true, routeable: true, reasons: [], observedAt: 1_900_000_000_000 },
  }
}

function renderAt(ui: ReactElement, pathname: string) {
  const rootRoute = createRootRoute()
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/offerings' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/owner/supply/$offeringRef' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [pathname] }),
  })
  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}
