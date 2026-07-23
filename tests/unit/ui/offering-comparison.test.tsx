/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeOfferingDetail } from '@/components/ae/comparison/AeOfferingDetail'
import { AeShortlistBar } from '@/components/ae/comparison/AeShortlistBar'
import { AeOfferingSupplyList } from '@/components/ae/offerings/AeOfferingSupplyList'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicOfferingSupplyProjection } from '@/modules/catalog/public'
import type { ResolvedComparisonSelection } from '@/modules/comparison/public'

afterEach(cleanup)

describe('render-only Offering decision surfaces', () => {
  it('uses exact removal identity, recovers focus, and keeps one bounded live region', async () => {
    const onRemove = vi.fn()
    const first = selection('one')
    const second = selection('two')
    const third = selection('three')
    const view = render(
      <AeShortlistBar
        selections={[first, second, third]}
        onRemove={onRemove}
        compareHref="/compare?state=canonical"
      />,
    )
    const removeSecond = screen.getByRole('button', { name: 'Remove Offering two from comparison' })
    expect(removeSecond.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(removeSecond)
    expect(onRemove).toHaveBeenCalledWith(comparisonId(second))

    view.rerender(
      <AeShortlistBar
        selections={[first, third]}
        onRemove={onRemove}
        compareHref="/compare?state=canonical"
      />,
    )
    await waitFor(() => {
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: 'Remove Offering three from comparison' }),
      )
    })
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })

  it('passes the exact Offering toggle payload and refuses a fifth selection', () => {
    const onToggle = vi.fn()
    render(
      <AeOfferingSupplyList
        offerings={[
          offering('one'),
          offering('two'),
          offering('three'),
          offering('four'),
        ]}
        business={{ businessId: 'business:studio', name: 'Studio', slug: 'studio' }}
        selectedSelectionIds={['one', 'two', 'three', 'four'].map((suffix) => exactSelectionId(
          'business:studio',
          `offering:${suffix}`,
          1,
        ))}
        onToggleComparison={onToggle}
      />,
    )

    const remove = screen.getByRole('button', { name: 'Remove Offering two from comparison' })
    expect(remove.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(remove)
    expect(onToggle).toHaveBeenCalledWith({
      selectionId: exactSelectionId('business:studio', 'offering:two', 1),
      reference: {
        businessId: 'business:studio',
        offeringRef: 'offering:two',
        offeringRevision: 1,
      },
      selected: false,
    })
    expect(screen.getAllByText('Comparison list full — remove one to add another.').length).toBeGreaterThan(0)
  })

  it('does not mark the current card selected when only an older exact revision is selected', () => {
    render(
      <AeOfferingSupplyList
        offerings={[offering('same', 2)]}
        business={{ businessId: 'business:studio', name: 'Studio', slug: 'studio' }}
        selectedSelectionIds={[exactSelectionId('business:studio', 'offering:same', 1)]}
        onToggleComparison={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', {
      name: 'Add Offering same to comparison',
    }).getAttribute('aria-pressed')).toBe('false')
  })

  it('renders source semantic cells, provenance, and currentness without effect controls', () => {
    const detail = selection('detail')
    render(
      <AeOfferingDetail
        selection={detail}
        selected={false}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Offering detail' })).toBeTruthy()
    expect(screen.getAllByText('Revision 1')).toHaveLength(2)
    expect(screen.getByText('Observed 1 Jan 1970')).toBeTruthy()
    expect(screen.getByText('Brochure website')).toBeTruthy()
    expect(screen.getByText('Not supplied')).toBeTruthy()
    expect(screen.getByText('Not known')).toBeTruthy()
    expect(screen.getByText('Out of date')).toBeTruthy()
    expect(screen.getByText('Published by the business')).toBeTruthy()
    expect(screen.getByText('Current when resolved')).toBeTruthy()
    const toggle = screen.getByRole('button', { name: 'Add Offering detail to comparison' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('button', { name: /call|inquiry|book|pay|run|test endpoint/i })).toBeNull()
    expect(screen.queryByText(/KNOWN|UNKNOWN|UNAVAILABLE|NEXT_STEP/)).toBeNull()
  })

  it('ignores caller-supplied arbitrary price and trust facts', () => {
    const hostile = {
      facts: [
        { id: 'price', label: 'Best price', cell: { kind: 'known', value: 'Free forever' } },
        { id: 'trust', label: 'Trust', cell: { kind: 'known', value: 'Verified winner' } },
      ],
    }
    render(
      <AeOfferingDetail
        {...hostile}
        selection={selection('hostile')}
        selected={false}
        onToggle={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Free forever|Verified winner|Best price/)).toBeNull()
    expect(screen.getByText('Brochure website')).toBeTruthy()
  })
})

const source = { kind: 'business_supplied' as const }

function known(value: string) {
  return { kind: 'known' as const, value, source, observedAt: 100 }
}

function comparisonId(item: ResolvedComparisonSelection): string {
  const { businessId, offeringRef, offeringRevision } = item.selection
  return exactSelectionId(businessId, offeringRef, offeringRevision)
}

function exactSelectionId(businessId: string, offeringRef: string, offeringRevision: number): string {
  return `selection:${businessId.length}:${businessId}${offeringRef.length}:${offeringRef}${String(offeringRevision).length}:${offeringRevision}`
}

function selection(suffix: string): ResolvedComparisonSelection {
  return {
    selection: {
      businessId: `business:${suffix}`,
      offeringRef: `offering:${suffix}`,
      offeringRevision: 1,
      projectionObservedAt: 100,
    },
    business: {
      businessId: `business:${suffix}`,
      slug: `business-${suffix}`,
      name: `Business ${suffix}`,
    },
    offering: {
      offeringRef: `offering:${suffix}`,
      revision: 1,
      name: `Offering ${suffix}`,
      category: 'Professional service',
      summary: 'Published website service.',
      comparison: {
        schemaVersion: 'offering-comparison:v1',
        profile: {
          profileId: 'professional_service:v1',
          scopeBasis: known('Brochure website'),
          priceBasis: { kind: 'not_supplied', source, observedAt: 100 },
          timingBasis: { kind: 'unknown', explanation: 'Not confirmed.', source, observedAt: 100 },
          serviceArea: { kind: 'stale', lastKnown: 'Perth', source, observedAt: 100, validUntil: 120 },
        },
      },
    },
    publication: { publishedAt: 100, safeDisplayDisposition: 'retain_safe_history' },
    projectionDisposition: 'current',
    resolvedAt: 150,
  }
}

function offering(suffix: string, revision = 1): PublicOfferingSupplyProjection {
  return {
    offering: {
      offeringRef: brandNonEmpty(`offering:${suffix}`, 'OfferingRef'),
      revision,
      name: `Offering ${suffix}`,
      category: 'Professional service',
      summary: 'Published website service.',
      serviceAreaSummary: 'Out of date',
      availabilitySummary: 'Not known',
      pricingSummary: 'Not supplied',
    },
    accessPaths: [],
    support: { integrated: false, routeable: false, reasons: ['not_integrated'], observedAt: 100 },
  }
}
