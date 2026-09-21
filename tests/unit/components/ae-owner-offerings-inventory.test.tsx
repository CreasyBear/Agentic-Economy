/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
  TACTILE_PRESS_CLASS,
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
    },
  ]

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
    const calls = screen.getAllByText('—').find((node) =>
      node.className.includes('text-foreground'),
    )
    expect(calls).toBeDefined()
    expect(calls?.className).toContain('font-mono')
    expect(calls?.className).toContain('tabular-nums')
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

  it('T4: renders quick actions with accessible labels, links, and tactile press class', () => {
    render(<AeOwnerOfferingsList offerings={testTools} />)

    const testRun = screen.getAllByRole('link', { name: 'Test Run for Australian Tax Calculator' })[0]
    expect(testRun).toBeDefined()
    expect(testRun?.getAttribute('href')).toBe('/owner/operations/tax-calculator')
    expect(testRun?.className).toContain('active:scale-[0.98]')

    const activity = screen.getAllByRole('link', { name: 'View logs for Australian Tax Calculator' })[0]
    expect(activity).toBeDefined()
    expect(activity?.getAttribute('href')).toBe('/activity')

    expect(TACTILE_PRESS_CLASS).toContain('motion-reduce:active:scale-100')
  })

  it('T5: filters inventory by name, summary, protocol, and offering ref or slug', () => {
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

  it('T6: shows filter empty state on desktop and compact layouts', () => {
    const onFilterChange = vi.fn()
    render(
      <AeOwnerOfferingsList
        offerings={testTools}
        filterValue="xyz"
        onFilterChange={onFilterChange}
      />,
    )

    const emptyMessages = screen.getAllByText("No tools match 'xyz'")
    expect(emptyMessages.length).toBeGreaterThanOrEqual(1)
    expect(emptyMessages.some((node) => node.closest('div')?.className.includes('min-h-24'))).toBe(true)

    const resetButtons = screen.getAllByRole('button', { name: 'Reset filter' })
    expect(resetButtons.length).toBeGreaterThan(0)
    const firstResetButton = resetButtons[0]
    expect(firstResetButton).toBeDefined()
    if (firstResetButton) {
      fireEvent.click(firstResetButton)
    }
    expect(onFilterChange).toHaveBeenCalledWith('')
  })

  it('T7: compact list shows canonical badges, price, Calls, and quick actions', () => {
    render(<AeOwnerOfferingsList offerings={testTools} />)

    const compactList = screen.getByTestId('provider-workspace-compact-list')
    const firstRow = within(compactList).getAllByRole('listitem')[0]
    expect(firstRow).toBeDefined()
    if (!firstRow) return

    expect(within(firstRow).getByText('Published')).toBeInTheDocument()
    expect(within(firstRow).getByText('Available')).toBeInTheDocument()
    expect(within(firstRow).getByText('OpenAPI')).toBeInTheDocument()
    expect(within(firstRow).getByText('A$0.10 / call')).toBeInTheDocument()
    expect(within(firstRow).getByText('1,420')).toBeInTheDocument()
    expect(within(firstRow).getByRole('link', { name: 'Test Run for Australian Tax Calculator' })).toBeInTheDocument()
    expect(within(firstRow).getByRole('link', { name: 'View logs for Australian Tax Calculator' })).toBeInTheDocument()
  })
})
