/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { SortingState } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

import {
  AeOwnerOfferingsList,
  type OwnerOfferingSummary,
} from '@/components/ae/offerings/AeOwnerOfferings'
import { ownerToolPricingLabel } from '@/components/ae/offerings/provider-workspace-projection'
import type { OfferingRef } from '@/modules/common/ids'

describe('AeOwnerOfferingsList (W-34)', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  const testTools: readonly OwnerOfferingSummary[] = [
    {
      offering: {
        offeringRef: 'offering:tax-calc' as OfferingRef,
        revision: 1,
        name: 'Australian Tax Calculator',
        category: 'finance',
        summary: 'Calculates exact PAYG withholding and Medicare levy.',
      },
      status: 'published',
      accessPathCount: 1,
      lifecycleLabel: 'Published',
      availability: 'available',
      protocolLabel: 'OpenAPI',
      pricingLabel: 'A$0.10 / call',
      callsCount: 1420,
      slug: 'tax-calculator',
    },
    {
      offering: {
        offeringRef: 'offering:postcode-lookup' as OfferingRef,
        revision: 1,
        name: 'AU Postcode Validator',
        category: 'utility',
        summary: 'Validates postal address and state matching.',
      },
      status: 'published',
      accessPathCount: 2,
      lifecycleLabel: 'Draft',
      availability: 'unavailable',
      protocolLabel: 'MCP',
      pricingLabel: 'A$0.02 / call',
      callsCount: 0,
      blocker: 'Reconnect the provider',
    },
  ]

  it('carries exact list context on both live slug and unpublished offering references', () => {
    render(<AeOwnerOfferingsList offerings={testTools} serverControlled inventoryQuery={{ q: 'postal & tax', sort: 'relevance', cursor: 'opaque:+/=' }} />)
    const links = screen.getAllByRole('link', { name: /Open Tool/ })
    const urls = links.map(link => new URL(link.getAttribute('href')!, 'https://aecon.test'))
    expect(urls.some(url => url.pathname === '/owner/operations/tax-calculator')).toBe(true)
    expect(urls.some(url => url.pathname === '/owner/operations/offering%3Apostcode-lookup')).toBe(true)
    for (const url of urls) {
      expect(url.searchParams.get('inventoryQ')).toBe('postal & tax')
      expect(url.searchParams.get('inventorySort')).toBe('relevance')
      expect(url.searchParams.get('inventoryCursor')).toBe('opaque:+/=')
    }
  })

  it('T1: renders Tool name, canonical status badges, pricing, and Calls', () => {
    render(<AeOwnerOfferingsList offerings={testTools} />)

    expect(screen.getAllByText('Australian Tax Calculator').length).toBeGreaterThan(0)
    expect(screen.getByText('Calculates exact PAYG withholding and Medicare levy.')).toBeInTheDocument()
    expect(screen.getAllByText('A$0.10 / call').length).toBeGreaterThan(0)
    expect(screen.getAllByText('OpenAPI').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Available').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Published').length).toBeGreaterThan(0)
    expect(screen.queryByText('Protocol: OpenAPI')).not.toBeInTheDocument()
    expect(screen.queryByText('Catalog: Published')).not.toBeInTheDocument()
    expect(screen.getAllByText('1,420').length).toBeGreaterThan(0)

    expect(screen.getAllByText('AU Postcode Validator').length).toBeGreaterThan(0)
    expect(screen.getAllByText('A$0.02 / call').length).toBeGreaterThan(0)
    expect(screen.getAllByText('MCP').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0)
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
  })

  it('T2: shows an unknown Calls value when callsCount is undefined', () => {
    const withoutCalls: readonly OwnerOfferingSummary[] = [
      {
        offering: {
          offeringRef: 'offering:abn-checker' as OfferingRef,
          revision: 1,
          name: 'ABN Checker',
          category: 'utility',
          summary: 'Checks ABN checksums.',
        },
        status: 'published',
        accessPathCount: 3,
        lifecycleLabel: 'Published',
      },
    ]

    render(<AeOwnerOfferingsList offerings={withoutCalls} />)

    expect(screen.getAllByText('ABN Checker').length).toBeGreaterThan(0)
    const row = screen.getAllByRole('row').find(node => within(node).queryByText('ABN Checker') !== null)
    expect(row).toBeDefined()
    if (row === undefined) throw new Error('ABN Checker row missing')
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent('—')
    expect(screen.queryByText('3 access paths')).not.toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('T3: formats inventory price through displayPriceFromPricingConfig when config is present', () => {
    expect(ownerToolPricingLabel({
      pricingConfigJson: {
        version: 'pricing:v3',
        kind: 'fixed_aud',
        currency: 'AUD',
        exponent: 6,
        amountUnits: '100000',
      },
    })).toBe('A$0.10 / call')
  })

  it('formats a managed x402 source requirement as an exact per-Call price', () => {
    expect(ownerToolPricingLabel({
      pricingConfigJson: {
        version: 'pricing:v3',
        kind: 'managed_x402',
        effectTiming: 'payment_required_before_effect',
        sourceRequirement: {
          network: 'eip155:8453',
          asset: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
          atomicUnits: '10000',
        },
        pricingPolicyRef: 'pricing-policy:managed-x402:v1',
        publicDisplay: 'on_request',
      },
      pricingLabel: 'Price on request',
    })).toBe('0.01 USDC / call')
  })

  it('T4: retains the accessible Tool destination and native focus', () => {
    render(<AeOwnerOfferingsList offerings={testTools} />)

    const openTool = screen.getAllByRole('link', { name: 'Open Tool for Australian Tax Calculator' })[0]
    expect(openTool).toBeDefined()
    expect(openTool?.getAttribute('href')).toBe('/owner/operations/tax-calculator')
    openTool?.focus()
    expect(document.activeElement).toBe(openTool)

    expect(screen.queryByRole('link', { name: 'Test Run for Australian Tax Calculator' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'View logs for Australian Tax Calculator' })).toBeNull()

  })

  it('T5: filters inventory by name, summary, protocol, price, Calls, and references', () => {
    function FilterHarness({ initial }: { initial: string }) {
      const [filterValue, setFilterValue] = useState(initial)
      return (
        <AeOwnerOfferingsList
          offerings={testTools}
          filterValue={filterValue}
          onFilterChange={setFilterValue}
        />
      )
    }

    const filterCases: ReadonlyArray<{ query: string; visible: string; hidden: string }> = [
      { query: 'PAYG', visible: 'Australian Tax Calculator', hidden: 'AU Postcode Validator' },
      { query: 'OpenAPI', visible: 'Australian Tax Calculator', hidden: 'AU Postcode Validator' },
      { query: 'mcp', visible: 'AU Postcode Validator', hidden: 'Australian Tax Calculator' },
      { query: 'A$0.02', visible: 'AU Postcode Validator', hidden: 'Australian Tax Calculator' },
      { query: '1,420', visible: 'Australian Tax Calculator', hidden: 'AU Postcode Validator' },
      { query: 'tax-calculator', visible: 'Australian Tax Calculator', hidden: 'AU Postcode Validator' },
      { query: 'offering:postcode-lookup', visible: 'AU Postcode Validator', hidden: 'Australian Tax Calculator' },
    ]

    for (const { query, visible, hidden } of filterCases) {
      cleanup()
      render(<FilterHarness initial={query} />)
      expect(screen.getAllByText(visible).length).toBeGreaterThan(0)
      expect(screen.queryByText(hidden)).not.toBeInTheDocument()
    }
  })

  it('T6: shows the supplied filter empty message and clears the controlled filter from Arc', () => {
    const onFilterChange = vi.fn()
    render(
      <AeOwnerOfferingsList
        offerings={testTools}
        filterValue="xyz"
        onFilterChange={onFilterChange}
      />,
    )

    const table = screen.getByRole('table', { name: 'Tools' })
    expect(within(table).getByText("No tools match 'xyz'")).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Open Tool for Australian Tax Calculator' })).toBeNull()

    fireEvent.click(within(table).getByRole('button', { name: 'Clear filter' }))
    expect(onFilterChange).toHaveBeenCalledWith('')
  })

  it('keeps controlled sorting and restores a focused row action when filtering reveals it again', async () => {
    function ControlledTable() {
      const [filterValue, setFilterValue] = useState('')
      const [sorting, setSorting] = useState<SortingState>([])
      const [activeRowActionId, setActiveRowActionId] = useState<string | undefined>(undefined)
      return (
        <AeOwnerOfferingsList
          offerings={testTools}
          filterValue={filterValue}
          onFilterChange={setFilterValue}
          sorting={sorting}
          onSortingChange={setSorting}
          {...(activeRowActionId === undefined ? {} : { activeRowActionId })}
          onActiveRowActionIdChange={setActiveRowActionId}
          restoreRowActionFocus
        />
      )
    }

    render(<ControlledTable />)

    const table = screen.getByRole('table', { name: 'Tools' })
    fireEvent.click(within(table).getByRole('button', { name: 'Sort by Tool' }))
    expect(within(table).getByRole('columnheader', { name: /Tool/ })).toHaveAttribute('aria-sort', 'ascending')
    const taxAction = screen.getByRole('link', { name: 'Open Tool for Australian Tax Calculator' })
    taxAction.focus()
    expect(document.activeElement).toBe(taxAction)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search name, protocol, or ID…' }), {
      target: { value: 'xyz' },
    })
    expect(screen.queryByRole('link', { name: 'Open Tool for Australian Tax Calculator' })).toBeNull()
    fireEvent.click(within(table).getByRole('button', { name: 'Clear filter' }))

    await waitFor(() => {
      const restoredAction = screen.getByRole('link', { name: 'Open Tool for Australian Tax Calculator' })
      expect(document.activeElement).toBe(restoredAction)
    })
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('AU Postcode Validator')
  })

  it('T7: Arc Tools table folds to one row projection with all facts and one native exit', () => {
    render(<AeOwnerOfferingsList offerings={testTools} />)

    const table = screen.getByRole('table', { name: 'Tools' })
    const rows = within(table).getAllByRole('row')
    const firstRow = rows[1]
    expect(firstRow).toBeDefined()
    if (!firstRow) return

    expect(within(firstRow).getByText('Australian Tax Calculator')).toHaveAttribute('title', 'Australian Tax Calculator')
    expect(within(firstRow).getByText('Calculates exact PAYG withholding and Medicare levy.'))
      .toHaveAttribute('title', 'Calculates exact PAYG withholding and Medicare levy.')
    expect(within(firstRow).getByText('Published')).toBeInTheDocument()
    expect(within(firstRow).getByText('Available')).toBeInTheDocument()
    expect(within(firstRow).getByText('OpenAPI')).toBeInTheDocument()
    expect(within(firstRow).getByText('A$0.10 / call')).toBeInTheDocument()
    expect(within(firstRow).getByText('1,420')).toBeInTheDocument()
    const openTool = within(firstRow).getByRole('link', { name: 'Open Tool for Australian Tax Calculator' })
    expect(openTool.tagName).toBe('A')
    expect(openTool).toHaveAttribute('href', '/owner/operations/tax-calculator')
    expect(within(firstRow).queryByRole('link', { name: 'Test Run for Australian Tax Calculator' })).toBeNull()
    expect(within(firstRow).queryByRole('link', { name: 'View logs for Australian Tax Calculator' })).toBeNull()
    const cells = within(firstRow).getAllByRole('cell')
    expect(cells.map((cell) => cell.getAttribute('data-label'))).toEqual([
      'Tool', 'Status', 'Price', 'Calls', 'Next action',
    ])
    expect(cells.filter((cell) => cell.hasAttribute('data-numeric')).map((cell) => cell.getAttribute('data-label')))
      .toEqual(['Price', 'Calls'])

    const secondRow = rows[2]
    expect(secondRow).toBeDefined()
    if (!secondRow) return
    expect(within(secondRow).getByText('AU Postcode Validator')).toBeInTheDocument()
    expect(within(secondRow).getByText('Draft')).toBeInTheDocument()
    expect(within(secondRow).getByText('Unavailable')).toBeInTheDocument()
    expect(within(secondRow).getByText('MCP')).toBeInTheDocument()
    expect(within(secondRow).getByText('Reconnect the provider')).toBeInTheDocument()
    expect(within(secondRow).getByText('A$0.02 / call')).toBeInTheDocument()
    expect(within(secondRow).getByText('0')).toBeInTheDocument()

    expect(screen.getAllByText('Australian Tax Calculator')).toHaveLength(1)
    expect(screen.getAllByRole('link', { name: 'Open Tool for Australian Tax Calculator' })).toHaveLength(1)
  })
})


describe('Server inventory results', () => {
  afterEach(cleanup)
  it('keeps the server inventory toolbar and explicit no-match result reachable on an empty page', () => {
  render(<AeOwnerOfferingsList offerings={[]} serverControlled
    toolbar={<button type="button">Clear inventory search</button>}
    emptyMessage="No Tools match this search." />)
  expect(screen.getByRole('button', { name: 'Clear inventory search' })).toBeTruthy()
  expect(screen.getByRole('table', { name: 'Tools' })).toBeTruthy()
  expect(screen.getByText('No Tools match this search.')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Add Tool' })).toBeNull()
})

})
