/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { CanonicalSearchResults } from '@/components/ae/market/CanonicalSearchResults'
import type { SearchResult } from '@/modules/registry/tool-choice-contracts'
import { type PublicToolRef } from '@/modules/capability-supply/public'
import { REASON_COPY } from '@/content/reason-copy'

const admittedRef = `operation:v1:${'a'.repeat(64)}` as PublicToolRef
const externalId = `registry:${'b'.repeat(64)}`

const currentResult = {
  id: admittedRef,
  source: 'current',
  access: 'ae_callable',
  toolRef: admittedRef,
  title: 'Weather Forecast',
  summary: 'Forecast for a city',
  provider: 'Weather Co',
  actionClass: 'retrieve',
  objectClass: 'data',
  readiness: 'ready',
  price: { kind: 'indicative', label: 'A$900719925474099.01' },
  detailRef: admittedRef,
  next: [{ action: 'registry.tools.describe', args: { toolRef: admittedRef }, authority: 'public' }],
  signals: { calls: 4, successRate: 3 / 4, payers30d: 30 },
  freshness: {
    source: 'supply_projection',
    state: 'fresh',
    completedAt: Date.UTC(2026, 8, 27),
    staleAfterMs: 10_800_000,
  },
} satisfies SearchResult

const externalResult = {
  id: externalId,
  source: 'coinbase',
  access: 'unavailable',
  reason: 'chain_unsupported',
  title: 'External Forecast',
  summary: 'Published weather endpoint',
  provider: 'example.com',
  actionClass: 'retrieve',
  objectClass: 'data',
  readiness: 'unverified',
  sourcePrice: '1 USDC',
  price: { kind: 'indicative', label: 'US$1' },
  detailRef: `/api/v1/registry/detail?id=${externalId}`,
  next: [],
  freshness: {
    source: 'x402_directory',
    state: 'stale',
    completedAt: Date.UTC(2026, 8, 26),
    staleAfterMs: 10_800_000,
  },
} satisfies SearchResult

const unavailablePriceResult = {
  ...currentResult,
  id: `operation:v1:${'c'.repeat(64)}` as PublicToolRef,
  toolRef: `operation:v1:${'c'.repeat(64)}` as PublicToolRef,
  title: 'Unpriced Forecast',
  detailRef: `operation:v1:${'c'.repeat(64)}` as PublicToolRef,
  price: { kind: 'unavailable' },
} satisfies SearchResult

const searchRows: readonly SearchResult[] = [currentResult, externalResult, unavailablePriceResult]

function makeRouter() {
  const root = createRootRoute()
  return createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: '/market' }),
      createRoute({ getParentRoute: () => root, path: '/tools/$toolRef' }),
    ]),
    history: createMemoryHistory({ initialEntries: ['/market'] }),
  })
}

function renderResults(results: readonly SearchResult[], saveAction = vi.fn<(item: SearchResult) => void>()) {
  const router = makeRouter()
  const renderActions = (item: SearchResult) => (
    <button type="button" onClick={() => saveAction(item)}>Save {item.title}</button>
  )
  render(
    <RouterContextProvider router={router}>
      <CanonicalSearchResults results={results} renderActions={renderActions} />
    </RouterContextProvider>,
  )
  return { saveAction }
}

afterEach(() => cleanup())

describe('canonical search results', () => {
  it('renders the canonical table in supplied order with full labels and exact native destinations', () => {
    renderResults(searchRows)
    const table = screen.getByRole('table', { name: 'Best matches' })

    expect(within(table).getAllByRole('columnheader').map(header => header.textContent?.trim())).toEqual([
      'Tool', 'Access', 'Price per call', 'Save or compare',
    ])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map(row => within(row).getByRole('link').textContent?.trim())).toEqual([
      'Weather Forecast', 'External Forecast', 'Unpriced Forecast',
    ])

    expect(within(rows[0]!).getByText('Ready to call')).toBeTruthy()
    expect(within(rows[0]!).getByText('Weather Co')).toBeTruthy()
    expect(within(rows[0]!).getByText('A$900719925474099.01')).toBeTruthy()
    expect(within(rows[1]!).getByText('Unavailable').closest('[title]')?.getAttribute('title')).toBe(REASON_COPY.chain_unsupported)
    expect(within(rows[1]!).getByText('US$1').getAttribute('title')).toBe('Provider lists 1 USDC')
    expect(within(rows[2]!).getByText('Price unavailable')).toBeTruthy()
    expect(table.querySelector('td[data-numeric]')?.textContent).toBe('A$900719925474099.01')
    expect(within(table).queryAllByRole('button', { name: /^Sort by/ })).toHaveLength(0)

    expect(within(rows[0]!).getByRole('link').getAttribute('href')).toBe(`/tools/${encodeURIComponent(admittedRef)}`)
    expect(within(rows[1]!).getByRole('link').getAttribute('href')).toBe(`/api/v1/registry/detail?id=${externalId}`)
  })

  it('leaves a reasonless unavailable row without a named reason', () => {
    const { reason: _reason, ...reasonless } = externalResult
    renderResults([reasonless])
    expect(screen.getByText('Unavailable').closest('[title]')).toBeNull()
  })

  it('keeps equal IDs from different sources distinct and passes each exact row to caller actions', () => {
    const sameIdExternal = { ...externalResult, id: currentResult.id } satisfies SearchResult
    const saveAction = vi.fn<(item: SearchResult) => void>()
    renderResults([currentResult, sameIdExternal], saveAction)
    const table = screen.getByRole('table', { name: 'Best matches' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Save Weather Forecast' }))
    expect(saveAction).toHaveBeenLastCalledWith(currentResult)
    fireEvent.click(screen.getByRole('button', { name: 'Save External Forecast' }))
    expect(saveAction).toHaveBeenLastCalledWith(sameIdExternal)
    expect(saveAction).toHaveBeenCalledTimes(2)
  })
})
