/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterContextProvider,
} from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { AeCapabilityList } from '@/components/ae/status/AeCapabilityList'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicBusinessCatalogApiV2Dto, PublicListingDto } from '@/modules/registry/public'

afterEach(cleanup)

function listing(
  offeringRef: string,
  name: string,
  summary: string,
  routeCount = 0,
): PublicListingDto {
  return {
    offeringRef,
    revision: 1,
    name,
    category: 'Data services',
    summary,
    accessPaths: Array.from({ length: routeCount }, (_, index) => ({
      accessPathRef: `access:${offeringRef}:${index}`,
      offeringRevision: 1,
      kind: 'human_request' as const,
      channel: 'phone' as const,
      disclosure: 'Contact the Provider to request this service.',
    })),
    support: { integrated: false, aeSupportedAction: false },
  }
}

function catalog(offerings: readonly PublicListingDto[]): PublicBusinessCatalogApiV2Dto {
  return {
    schemaVersion: 'public-business-catalog-api:v2',
    businessId: brandNonEmpty('business:capability-list-test', 'BusinessId'),
    slug: brandNonEmpty('capability-list-test', 'Slug'),
    name: 'Capability list test provider',
    category: 'Data services',
    businessContext: {
      kind: 'programmable_provider',
      website: 'https://provider.example',
      providerIdentifier: 'provider.example',
    },
    publicUrl: 'https://provider.example',
    trustTier: 'claimed',
    photos: [],
    observedAt: 1,
    disposition: 'current',
    offerings,
    accessSummary: { humanRequest: true, externalOperation: false, aeSupportedAction: false },
  }
}

function renderWithOwnerRouter(ui: ReactElement) {
  const root = createRootRoute()
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: '/owner/operations/$offeringRef' }),
    createRoute({ getParentRoute: () => root, path: '/owner/operations/new' }),
  ])
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/owner/operations/new'] }),
  })

  return render(<RouterContextProvider router={router}>{ui}</RouterContextProvider>)
}

function toolCellText() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) =>
    within(row).getAllByRole('cell')[0]?.textContent?.trim(),
  )
}

describe('AeCapabilityList', () => {
  it('keeps source order, sorts by Tool name, shows compact full text and preserves access counts and owner links', () => {
    const summary = 'A detailed service description that remains available in full while the compact scan cell truncates it.'
    const first = listing('offering:provider/zulu tool', 'Zulu Fetch', summary, 2)
    const second = listing('offering:provider/alpha tool', 'Alpha Query', 'Query public data.', 0)

    renderWithOwnerRouter(<AeCapabilityList catalog={catalog([first, second])} />)

    const fullText = `${first.name} · ${summary}`
    expect(toolCellText()).toEqual([fullText, `${second.name} · ${second.summary}`])
    expect(screen.getByTitle(fullText)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sort by Access' })).toBeInTheDocument()
    expect(screen.getByText('2 routes')).toBeInTheDocument()
    expect(screen.getByText('No access route')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: `Open ${first.name}` })).toHaveAttribute(
      'href',
      `/owner/operations/${encodeURIComponent(first.offeringRef)}`,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Tool' }))
    expect(toolCellText()).toEqual([`${second.name} · ${second.summary}`, fullText])
    expect(screen.getByRole('link', { name: `Open ${first.name}` })).toHaveAttribute(
      'href',
      `/owner/operations/${encodeURIComponent(first.offeringRef)}`,
    )
  })

  it('filters case-insensitively by summary and recovers from no matches with Clear filter', () => {
    const summaryMatch = listing(
      'offering:provider/telemetry',
      'Telemetry API',
      'Provides live seismic telemetry for monitoring teams.',
    )
    const other = listing('offering:provider/archive', 'Archive API', 'Search historical records.')
    renderWithOwnerRouter(<AeCapabilityList catalog={catalog([summaryMatch, other])} />)

    const filter = screen.getByPlaceholderText('Filter Tools…')
    fireEvent.change(filter, { target: { value: '  SEISMIC TELEMETRY  ' } })
    expect(screen.getByRole('link', { name: `Open ${summaryMatch.name}` })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: `Open ${other.name}` })).not.toBeInTheDocument()

    fireEvent.change(filter, { target: { value: 'no known Tool matches this' } })
    expect(screen.getByText('No rows match this filter.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(toolCellText()).toEqual([
      `${summaryMatch.name} · ${summaryMatch.summary}`,
      `${other.name} · ${other.summary}`,
    ])
  })

  it('keeps the native Add Tool link when the supplied catalogue is empty', () => {
    renderWithOwnerRouter(<AeCapabilityList catalog={catalog([])} />)

    const addTool = screen.getByRole('link', { name: 'Add Tool' })
    expect(addTool.tagName).toBe('A')
    expect(addTool).toHaveAttribute('href', '/owner/operations/new')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
