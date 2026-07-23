/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AeOfferingDetail } from '@/components/ae/comparison/AeOfferingDetail'
import { AeOfferingComparison } from '@/components/ae/comparison/AeOfferingComparison'
import { AeShortlistBar } from '@/components/ae/comparison/AeShortlistBar'
import { AeOfferingSupplyList } from '@/components/ae/offerings/AeOfferingSupplyList'
import { brandNonEmpty } from '@/modules/common/ids'
import type { PublicOfferingSupplyProjection } from '@/modules/catalog/public'
import type {
  ComparisonOfferingReadPort,
  ResolvedComparisonSelection,
} from '@/modules/comparison/public'
import {
  buildComparisonRouteReadback,
  comparisonRouteMetadata,
  normalizeComparisonRouteSearch,
  PriorityControls,
  ShareComparison,
} from '@/routes/compare'
import {
  appendComparisonUrlState,
  buildComparisonBrief,
  compareOfferings,
  parseComparisonUrlState,
  type ComparisonUrlState,
} from '@/modules/comparison/public'

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

  it('keeps the canonical cross-business shortlist through browse, detail, and back links', () => {
    const state: ComparisonUrlState = {
      version: 'offering-comparison:v1',
      selections: [
        selection('one').selection,
        selection('two').selection,
      ],
      priorities: ['professional_service:v1:lowest_total_price'],
    }
    const paths = [
      appendComparisonUrlState('/registry?q=website&limit=10', state),
      appendComparisonUrlState('/business-two?from=registry', state),
      appendComparisonUrlState('/business-two/offerings/offering%3Atwo', state),
      appendComparisonUrlState('/registry?q=&limit=10', state),
    ]

    for (const href of paths) {
      const query = new URL(href, 'https://agentic.example').searchParams
      query.delete('q')
      query.delete('limit')
      query.delete('from')
      expect(parseComparisonUrlState(query)).toEqual({ kind: 'accepted', state })
      expect(href).not.toMatch(/sourceHash|token|facts=/)
    }

    render(
      <AeOfferingSupplyList
        offerings={[offering('two')]}
        business={{ businessId: 'business:two', name: 'Business two', slug: 'business-two' }}
        detailSearch={appendComparisonUrlState('', state)}
      />,
    )
    expect(screen.getByRole('link', { name: 'View Offering' }).getAttribute('href'))
      .toBe(paths[2])
  })

  it('does not disclose a referrer when opening external published details', () => {
    render(
      <AeOfferingSupplyList
        offerings={[externalOffering('external')]}
      />,
    )

    const link = screen.getByRole('link', { name: 'View published details' })
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.getAttribute('referrerpolicy')).toBe('no-referrer')
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

describe('public comparison route contract', () => {
  it('re-resolves exact URL references and keeps a newer revision separate', async () => {
    const reads: string[] = []
    const selected = selection('route')
    const search = normalizeComparisonRouteSearch({
      selection: JSON.stringify(selected.selection),
    })
    const result = await buildComparisonRouteReadback(search, exactReadPort(selected, reads))

    expect(reads).toEqual(['live:1', 'history:1'])
    expect(result).toMatchObject({
      kind: 'ready',
      state: { selections: [selected.selection] },
      resolution: {
        selections: [{
          offering: { revision: 1 },
          newerCurrentReference: { offeringRevision: 2 },
        }],
      },
    })
  })

  it.each([
    ['malformed', { selection: '{' }, 'malformed_state'],
    ['duplicate', {
      selection: [
        JSON.stringify(selection('duplicate').selection),
        JSON.stringify(selection('duplicate').selection),
      ],
    }, 'duplicate_selection'],
    ['fifth', {
      selection: ['1', '2', '3', '4', '5'].map((suffix) => (
        JSON.stringify(selection(suffix).selection)
      )),
    }, 'selection_limit_exceeded'],
  ] as const)('keeps %s URL input in a bounded ordinary refusal', async (_label, raw, reason) => {
    const port: ComparisonOfferingReadPort = {
      readLiveAvailability: vi.fn(),
      readExactPublicOffering: vi.fn(),
    }
    const result = await buildComparisonRouteReadback(
      normalizeComparisonRouteSearch(raw),
      port,
    )

    expect(result).toEqual({ kind: 'refused', reason })
    expect(port.readLiveAvailability).not.toHaveBeenCalled()
    expect(port.readExactPublicOffering).not.toHaveBeenCalled()
  })

  it('declares transient comparison metadata without authenticating or indexing it', () => {
    expect(comparisonRouteMetadata).toEqual({
      canonicalPath: '/compare',
      robots: 'noindex,follow',
      cacheControl: 'no-store',
    })
  })
})

describe('answer-first responsive comparison evidence', () => {
  it('keeps source answer and caveats before one default-closed native evidence disclosure', () => {
    const comparison = compareOfferings({
      selections: [selection('one'), selection('two')],
      priorities: [],
    })
    render(
      <AeOfferingComparison
        comparison={comparison}
        brief={buildComparisonBrief(comparison)}
      />,
    )

    const heading = screen.getByRole('heading', { name: 'Not ranked' })
    const notes = screen.getByRole('region', { name: 'Important comparison notes' })
    const disclosure = screen.getByText('See full comparison').closest('details')
    expect(disclosure).not.toBeNull()
    expect(disclosure?.hasAttribute('open')).toBe(false)
    expect(heading.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(notes.compareDocumentPosition(disclosure!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByRole('button', { name: /call|inquiry|book|pay|run|endpoint/i })).toBeNull()
  })

  it('projects identical semantic cells in a desktop table and mobile fact list', () => {
    const comparison = compareOfferings({
      selections: [selection('one'), selection('two')],
      priorities: [],
    })
    render(
      <AeOfferingComparison
        comparison={comparison}
        brief={buildComparisonBrief(comparison)}
      />,
    )

    const desktop = document.querySelector('[data-comparison-projection="desktop"]')
    const mobile = document.querySelector('[data-comparison-projection="mobile"]')
    expect(desktop?.tagName).toBe('TABLE')
    expect(mobile?.tagName).toBe('DL')
    expect(desktop?.className).toContain('md:table')
    expect(mobile?.className).toContain('md:hidden')

    const desktopFacts = [...desktop!.querySelectorAll('[data-fact-id]')].map((node) => ({
      id: node.getAttribute('data-fact-id'),
      text: node.textContent,
    }))
    const mobileFacts = [...mobile!.querySelectorAll('[data-fact-id]')].map((node) => ({
      id: node.getAttribute('data-fact-id'),
      text: node.textContent,
    }))
    expect(mobileFacts).toEqual(desktopFacts)
    expect(desktopFacts.every(({ text }) => (
      text?.includes('Source:')
      && text.includes('Observed:')
      && text.includes('Currentness:')
    ))).toBe(true)
  })

  it('applies only registered presentation density and emphasis to the complete surface', () => {
    const comparison = compareOfferings({
      selections: [selection('one'), selection('two')],
      priorities: [],
    })
    const brief = buildComparisonBrief(comparison)
    const emphasized = brief.foregroundableFactIds[0]!
    const { container } = render(
      <AeOfferingComparison
        comparison={comparison}
        brief={brief}
        presentation={{
          mode: 'guided_compare',
          density: 'concise',
          responsiveComposition: 'guided_sections',
          emphasisIds: [emphasized],
        }}
      />,
    )

    const surface = container.querySelector('[data-presentation-mode="guided_compare"]')
    expect(surface?.className).toContain('gap-4')
    expect(surface?.querySelector('.ring-2')).not.toBeNull()
    expect(screen.getByText('See full comparison')).toBeTruthy()
  })
})

describe('bounded comparison route controls', () => {
  it('preserves TanStack-decoded exact selections for source validation', () => {
    const exact = selection('decoded').selection
    expect(normalizeComparisonRouteSearch({
      selection: exact,
      priority: [],
    })).toEqual({
      selection: [JSON.stringify(exact)],
      priority: [],
    })
    expect(normalizeComparisonRouteSearch({
      selection: [['nested-is-not-an-exact-selection']],
      priority: [],
    }).selection).toEqual([])
  })

  it('shows only priorities shared by every selected profile', () => {
    const onFeedback = vi.fn()
    const view = render(
      <PriorityControls
        selectionRefs={[selection('professional').selection]}
        resolvedSelections={[selection('professional')]}
        priorities={[]}
        onFeedback={onFeedback}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add Lowest published total price' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /request price|authentication|GraphQL/i })).toBeNull()

    view.rerender(
      <PriorityControls
        selectionRefs={[
          selection('professional').selection,
          machineSelection('machine').selection,
        ]}
        resolvedSelections={[selection('professional'), machineSelection('machine')]}
        priorities={[]}
        onFeedback={onFeedback}
      />,
    )
    expect(screen.getByText('No registered priority applies to the selected Offering profiles.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
  })

  it('keeps priority order explicit until Apply priorities', () => {
    const onFeedback = vi.fn()
    render(
      <PriorityControls
        selectionRefs={[machineSelection('machine').selection]}
        resolvedSelections={[machineSelection('machine')]}
        priorities={[
          'machine_data:v1:lowest_request_price',
          'machine_data:v1:no_authentication_preferred',
        ]}
        onFeedback={onFeedback}
      />,
    )

    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]!)
    expect(onFeedback).toHaveBeenCalledWith('Lowest published request price moved down.')
    const apply = screen.getByRole('link', { name: 'Apply priorities' })
    const parsed = parseComparisonUrlState(new URL(apply.getAttribute('href')!, 'https://ae.example').searchParams)
    expect(parsed).toMatchObject({
      kind: 'accepted',
      state: {
        priorities: [
          'machine_data:v1:no_authentication_preferred',
          'machine_data:v1:lowest_request_price',
        ],
      },
    })
  })

  it('reports share success and failure through the caller-owned bounded status', async () => {
    const onFeedback = vi.fn()
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('blocked'))
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<ShareComparison href="/compare?selection=exact" onFeedback={onFeedback} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy comparison link' }))
    await waitFor(() => expect(onFeedback).toHaveBeenCalledWith('Comparison link copied.'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy comparison link' }))
    await waitFor(() => expect(onFeedback).toHaveBeenCalledWith(
      'Could not copy the comparison link. Copy it from the address bar.',
    ))
  })
})

const source = { kind: 'business_supplied' as const }

function known<const Value extends string>(value: Value) {
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

function machineSelection(suffix: string): ResolvedComparisonSelection {
  const base = selection(suffix)
  return {
    ...base,
    offering: {
      ...base.offering,
      category: 'Machine data',
      comparison: {
        schemaVersion: 'offering-comparison:v1',
        profile: {
          profileId: 'machine_data:v1',
          interfaceFormat: known('rest_json' as const),
          requestMethod: known('GET' as const),
          authentication: known('api_key' as const),
          priceBasis: {
            kind: 'known',
            value: {
              description: 'AUD 0.01 per request',
              currency: 'AUD',
              amountMinor: 1,
              unit: 'request',
            },
            source,
            observedAt: 100,
          },
          freshnessOrUpdateCadence: known('Hourly'),
        },
      },
    },
  }
}

function exactReadPort(
  selected: ResolvedComparisonSelection,
  reads: string[],
): ComparisonOfferingReadPort {
  return {
    readLiveAvailability: async () => {
      reads.push(`live:${selected.offering.revision}`)
      return {
        kind: 'available',
        currentReference: {
          businessId: selected.business.businessId,
          offeringRef: selected.offering.offeringRef,
          offeringRevision: 2,
        },
      }
    },
    readExactPublicOffering: async () => {
      reads.push(`history:${selected.offering.revision}`)
      return {
        kind: 'resolved',
        business: selected.business,
        offering: selected.offering,
        publication: selected.publication,
        projectionDisposition: selected.projectionDisposition,
      }
    },
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

function externalOffering(suffix: string): PublicOfferingSupplyProjection {
  return {
    ...offering(suffix),
    accessPaths: [{
      accessPathRef: brandNonEmpty(`access:${suffix}`, 'AccessPathRef'),
      descriptor: {
        kind: 'external_operation',
        name: 'Published API',
        summary: 'Read the published operation details.',
        url: 'https://provider.example/operation',
        provenance: 'business_declared',
      },
    }],
  }
}
