/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { RouterContextProvider, createMemoryHistory, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'
import { CanonicalSearchResults } from '@/components/ae/market/CanonicalSearchResults'
import type { SearchResult, SupplyProjectionFreshness } from '@/modules/registry/tool-choice-contracts'
import { type PublicToolRef } from '@/modules/capability-supply/public'
import { REASON_COPY, REASON_COPY_FALLBACK } from '@/content/reason-copy'

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

function renderResults(results: readonly SearchResult[], saveAction = vi.fn<(item: SearchResult) => void>(), sourceFreshness?: SupplyProjectionFreshness) {
  const router = makeRouter()
  const renderActions = (item: SearchResult) => (
    <button type="button" onClick={() => saveAction(item)}>Save {item.title}</button>
  )
  const view = render(
    <RouterContextProvider router={router}>
      <CanonicalSearchResults results={results} renderActions={renderActions} {...(sourceFreshness === undefined ? {} : { sourceFreshness })} />
    </RouterContextProvider>,
  )
  return {
    ...view,
    router,
    saveAction,
    updateResults(nextResults: readonly SearchResult[]) {
      view.rerender(
        <RouterContextProvider router={router}>
          <CanonicalSearchResults results={nextResults} renderActions={renderActions} {...(sourceFreshness === undefined ? {} : { sourceFreshness })} />
        </RouterContextProvider>,
      )
    },
  }
}

function detailText(dialog: HTMLElement, term: string) {
  const label = within(dialog).getByText(term)
  return label.nextElementSibling?.textContent?.trim()
}

afterEach(() => cleanup())

describe('canonical search results', () => {
  it('renders the canonical table in supplied order with full labels and exact native destinations', () => {
    renderResults(searchRows)
    const table = screen.getByRole('table', { name: 'Canonical search results' })

    expect(table.closest('[data-mobile-layout]')?.getAttribute('data-mobile-layout')).toBe('cards')
    expect(within(table).getAllByRole('columnheader').map(header => header.textContent?.trim())).toEqual([
      'Tool', 'Provider or host', 'Access', 'Price', 'AE calls completed', 'Payers (30d)', 'Actions',
    ])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map(row => within(row).getByRole('link').textContent?.trim())).toEqual([
      'Weather Forecast', 'External Forecast', 'Unpriced Forecast',
    ])

    const cell = (row: HTMLElement, column: string) => row.querySelector(`td[data-column="${column}"]`)
    expect(rows.map(row => cell(row, 'access')?.textContent?.trim())).toEqual(['Callable', 'Unavailable', 'Callable'])
    expect(within(rows[1]!).getByText('Unavailable').closest('[title]')?.getAttribute('title')).toBe(REASON_COPY.chain_unsupported)
    expect(rows.map(row => cell(row, 'price')?.textContent?.trim())).toEqual(['A$900719925474099.01', 'US$1', 'No price'])
    expect(cell(rows[0]!, 'price')?.className).toContain('text-end')
    expect(rows.map(row => cell(row, 'calls')?.textContent?.trim())).toEqual(['3 of 4', '0', '3 of 4'])
    expect(rows.map(row => cell(row, 'payers')?.textContent?.trim())).toEqual(['30', '–', '30'])
    expect(cell(rows[0]!, 'calls')?.className).toContain('tabular-nums')
    expect(table.textContent).not.toMatch(/refreshed|verified|Indicative AUD|Provider price/)

    expect(within(rows[0]!).getByRole('link').getAttribute('href')).toBe(`/tools/${encodeURIComponent(admittedRef)}`)
    expect(within(rows[1]!).getByRole('link').getAttribute('href')).toBe(`/api/v1/registry/detail?id=${externalId}`)
  })

  it('uses envelope freshness only for current rows without their own snapshot', async () => {
    const { freshness: _currentFreshness, ...currentWithoutFreshness } = currentResult
    const { freshness: _externalFreshness, ...externalWithoutFreshness } = externalResult
    const archivedCurrent = { ...unavailablePriceResult, freshness: { ...currentResult.freshness, state: 'stale' as const, completedAt: Date.UTC(2026, 8, 26) } }
    renderResults([currentWithoutFreshness, externalResult, archivedCurrent, { ...externalWithoutFreshness, id: 'registry:missing', title: 'Undated External' }], undefined, currentResult.freshness)
    const expected = [
      ['Weather Forecast', 'Fresh · refreshed 27 Sept 2026', 'AE supply projection'],
      ['External Forecast', 'Stale · refreshed 26 Sept 2026', 'Coinbase Bazaar index'],
      ['Unpriced Forecast', 'Stale · refreshed 26 Sept 2026', 'AE supply projection'],
      ['Undated External', 'Freshness unavailable', 'Coinbase Bazaar index'],
    ] as const
    for (const [title, freshness, source] of expected) {
      fireEvent.click(screen.getByRole('button', { name: `Inspect ${title}` }))
      const dialog = await screen.findByRole('dialog')
      expect(detailText(dialog, 'Freshness')).toBe(freshness)
      expect(detailText(dialog, 'Source')).toBe(source)
      fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    }
  })

  it('names a reasonless unavailable row plainly instead of the generic error sentence', async () => {
    const { reason: _reason, ...reasonless } = externalResult
    renderResults([reasonless])
    const row = within(screen.getByRole('table', { name: 'Canonical search results' })).getAllByRole('row')[1]!
    expect(within(row).getByText('Unavailable').closest('[title]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Inspect External Forecast' }))
    const dialog = await screen.findByRole('dialog')
    expect(detailText(dialog, 'Access')).toBe('Currently unavailable')
    expect(dialog.textContent).not.toContain(REASON_COPY_FALLBACK)
  })

  it('opens the real Inspect dialog with complete current facts and does not imply a save or call', async () => {
    const saveAction = vi.fn<(item: SearchResult) => void>()
    renderResults(searchRows.slice(0, 2), saveAction)

    fireEvent.click(screen.getByRole('button', { name: 'Inspect Weather Forecast' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Weather Forecast')).toBeTruthy()
    expect(within(dialog).getByText('Forecast for a city')).toBeTruthy()
    expect(detailText(dialog, 'Provider')).toBe('Weather Co')
    expect(detailText(dialog, 'Access')).toBe('AE-callable · ready')
    expect(detailText(dialog, 'Price')).toBe('Indicative AUD · A$900719925474099.01')
    expect(detailText(dialog, 'AE calls')).toBe('3 of 4 completed')
    expect(detailText(dialog, 'Payers (30d)')).toBe('30')
    expect(detailText(dialog, 'Freshness')).toBe('Fresh · refreshed 27 Sept 2026')
    expect(detailText(dialog, 'Source')).toBe('AE supply projection')
    expect(detailText(dialog, 'ID')).toBe(admittedRef)
    expect(within(dialog).getAllByText(admittedRef, { selector: 'code[title]' })).toHaveLength(2)
    expect(within(dialog).getByRole('button', { name: 'Copy ID' })).toBeTruthy()
    expect(detailText(dialog, 'Tool reference')).toBe(admittedRef)
    expect(within(dialog).getByRole('link', { name: 'Open Tool detail' }).getAttribute('href')).toBe(`/tools/${encodeURIComponent(admittedRef)}`)
    expect(within(dialog).queryByRole('button', { name: /Save|Call|Purchase/ })).toBeNull()
    expect(saveAction).not.toHaveBeenCalled()
  })

  it('returns focus to the same Inspect trigger when Escape closes the dialog', async () => {
    renderResults(searchRows.slice(0, 2))
    const trigger = screen.getByRole('button', { name: 'Inspect External Forecast' })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog')

    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('closes when a selected result leaves the page and stays closed if it later returns', async () => {
    const { updateResults } = renderResults([currentResult])
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Weather Forecast' }))
    expect(await screen.findByRole('dialog')).toBeTruthy()

    act(() => updateResults([]))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    act(() => updateResults([currentResult]))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps equal IDs from different sources distinct and passes each exact row to caller actions', async () => {
    const sameIdExternal = { ...externalResult, id: currentResult.id } satisfies SearchResult
    const saveAction = vi.fn<(item: SearchResult) => void>()
    renderResults([currentResult, sameIdExternal], saveAction)
    const table = screen.getByRole('table', { name: 'Canonical search results' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Save Weather Forecast' }))
    expect(saveAction).toHaveBeenLastCalledWith(currentResult)
    fireEvent.click(screen.getByRole('button', { name: 'Save External Forecast' }))
    expect(saveAction).toHaveBeenLastCalledWith(sameIdExternal)
    expect(saveAction).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Inspect External Forecast' }))
    const dialog = await screen.findByRole('dialog')
    expect(detailText(dialog, 'Source')).toBe('Coinbase Bazaar index')
    expect(detailText(dialog, 'ID')).toBe(currentResult.id)
    expect(detailText(dialog, 'Provider-listed source')).toBe('1 USDC')

  })

  it('resolves the selected identity against updated facts after a same-identity refresh', async () => {
    const { updateResults } = renderResults([currentResult])
    fireEvent.click(screen.getByRole('button', { name: 'Inspect Weather Forecast' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Forecast for a city')).toBeTruthy()

    const updatedResult = {
      ...currentResult,
      summary: 'Updated forecast for a city',
      provider: 'Weather Co, updated',
      price: { kind: 'indicative', label: 'A$2.50' },
      freshness: {
        ...currentResult.freshness,
        state: 'stale',
        completedAt: Date.UTC(2026, 8, 28),
      },
    } satisfies SearchResult
    act(() => updateResults([updatedResult]))

    expect(within(screen.getByRole('dialog')).getByText('Updated forecast for a city')).toBeTruthy()
    expect(detailText(screen.getByRole('dialog'), 'Provider')).toBe('Weather Co, updated')
    expect(detailText(screen.getByRole('dialog'), 'Price')).toBe('Indicative AUD · A$2.50')
    expect(detailText(screen.getByRole('dialog'), 'Freshness')).toBe('Stale · refreshed 28 Sept 2026')
    expect(screen.queryByText('Forecast for a city')).toBeNull()
  })
})
