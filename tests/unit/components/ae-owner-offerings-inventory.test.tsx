/** @vitest-environment jsdom */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '../../setup/jsdom-platform'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

import { AeOwnerOfferingsList, type OwnerOfferingSummary } from '@/components/ae/offerings/AeOwnerOfferings'
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

  it('T1: renders tool name, status, pricing, and calls count columns', () => {
    render(<AeOwnerOfferingsList offerings={testTools} />)

    expect(screen.getAllByText('Australian Tax Calculator').length).toBeGreaterThan(0)
    expect(screen.getByText('Calculates exact PAYG withholding and Medicare levy.')).toBeInTheDocument()
    expect(screen.getByText('A$0.10 / call')).toBeInTheDocument()
    expect(screen.getByText('Protocol: OpenAPI')).toBeInTheDocument()
    expect(screen.getAllByText('Catalog: Published').length).toBeGreaterThan(0)
    expect(screen.getByText('1420 calls')).toBeInTheDocument()

    expect(screen.getAllByText('AU Postcode Validator').length).toBeGreaterThan(0)
    expect(screen.getByText('A$0.02 / call')).toBeInTheDocument()
    expect(screen.getByText('Protocol: MCP')).toBeInTheDocument()
    expect(screen.getAllByText('Catalog: Published').length).toBeGreaterThan(0)
    expect(screen.getByText('0 calls')).toBeInTheDocument()
  })

  it('T2: falls back to access path count when callsCount is undefined', () => {
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
    expect(screen.getByText('3 access paths')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
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
})
