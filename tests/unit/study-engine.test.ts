import { describe, expect, it } from 'vitest'

import {
  qualifyStudyProviders,
  quoteQualifiedProviders,
  scanStudySupply,
  scoreFreshStudyQuotes,
  scoreTopsis,
  replayRfxEvents,
} from '@/modules/study/public'
import {
  resolveCategoryQuote,
  sandboxCategoryQuotePathForSlug,
  type CheckupQuoteOffering,
} from '@/modules/sandbox-supply/public'
import type { ExactAmount } from '@/modules/money/public'

function audAmount(units: string, exponent: number): ExactAmount {
  return { currency: 'AUD', units, exponent }
}
import type {
  StudyCharter,
  StudyRegistryService,
} from '@/modules/study/public'

const charter: StudyCharter = {
  wants: [
    { id: 'price', label: 'Price', weight: 0.6, sense: 'cost', valueKey: 'price' },
    { id: 'quality', label: 'Quality', weight: 0.4, sense: 'benefit', valueKey: 'qualityScore' },
  ],
  hardNeeds: [
    { kind: 'category', values: ['dentist'] },
    { kind: 'fixed_price' },
    { kind: 'open_quote' },
  ],
}

function offering(category: 'photographer' | 'funeral' | 'dentist', slug: string, amount: ExactAmount): CheckupQuoteOffering {
  return {
    name: `${category} package`,
    price: { kind: 'fixed', amount, taxTreatment: 'inclusive' },
    accessPaths: [{ kind: 'external_operation', url: sandboxCategoryQuotePathForSlug(category, slug), method: 'POST' }],
  }
}

function provider(category: string, slug: string, amount: ExactAmount, open = true): StudyRegistryService {
  return {
    id: `service:${slug}`,
    revision: 1,
    business: { slug, name: slug, suburb: 'Melbourne', stateTerritory: 'VIC' },
    name: `${category} package`,
    category,
    summary: `${category} service`,
    price: { kind: 'fixed', amount, taxTreatment: 'inclusive' },
    endpoints: open
      ? [{ url: sandboxCategoryQuotePathForSlug(category as 'photographer' | 'funeral' | 'dentist', slug), method: 'POST', access: 'open' }]
      : [],
  }
}

describe('study engine', () => {
  it('persists every TOPSIS intermediate for a known 3x3 fixture', () => {
    const result = scoreTopsis({
      criteria: [
        { id: 'cost', weight: 0.5, sense: 'cost' },
        { id: 'speed', weight: 0.3, sense: 'benefit' },
        { id: 'quality', weight: 0.2, sense: 'benefit' },
      ],
      alternatives: [
        { id: 'A', values: [100, 8, 7] },
        { id: 'B', values: [120, 9, 8] },
        { id: 'C', values: [80, 7, 6] },
      ],
    })

    expect(result.winnerId).toBe('C')
    expect(result.alternatives).toHaveLength(3)
    const a = result.alternatives.find((alternative) => alternative.alternativeId === 'A')
    expect(a?.criteria).toHaveLength(3)
    expect(a?.criteria[0]).toMatchObject({ raw: 100, normalized: 0.5, weight: 0.5, weighted: 0.25 })
    expect(a?.criteria[0]?.pisDelta).toBeCloseTo(-0.25)
    expect(a?.criteria[0]?.nisDelta).toBeCloseTo(0.25)
    expect(a?.criteria[0]?.pisSquaredDistanceContribution).toBeCloseTo(0.0625)
    expect(a?.criteria[0]?.nisSquaredDistanceContribution).toBeCloseTo(0.0625)
    expect(a?.closeness).toBeCloseTo(0.5)
    expect(result.alternatives.every((alternative) => alternative.criteria.length === 3)).toBe(true)
  })
  it('replays RFx events through enquiry, tender, qualification, and award', () => {
    expect(replayRfxEvents([])).toMatchObject({ state: 'enquiry', eventsApplied: 0 })
    expect(replayRfxEvents([
      { type: 'submit_enquiry' },
      { type: 'issue_tender' },
      { type: 'complete_qualification' },
    ])).toEqual({ state: 'award', eventsApplied: 3 })
  })

  it('keeps web discovery quarantined and applies hard-needs qualification', () => {
    const scan = scanStudySupply({
      registryServices: [
        provider('dentist', 'listed-dentist', audAmount('9500', 2)),
        provider('dentist', 'closed-dentist', audAmount('7500', 2), false),
      ],
      webClaims: [{ businessName: 'web dentist', suburb: 'Melbourne', sourceUrl: 'https://example.com/web-dentist' }],
    })
    const qualification = qualifyStudyProviders(scan, charter)
    expect(qualification.allowedSlugs).toEqual(['listed-dentist'])
    expect(qualification.allowedSlugs).not.toContain('web-dentist')
    expect(qualification.excluded[0]?.reasons).toEqual(['open_quote'])
  })

  it('labels photographer, funeral, and dentist cohort quotes as sandbox evidence', () => {
    for (const category of ['photographer', 'funeral', 'dentist'] as const) {
      const result = resolveCategoryQuote({
        category,
        slug: `${category}-one`,
        requestedAt: Date.parse('2026-08-01T10:00:00.000Z'),
        offerings: [offering(category, `${category}-one`, audAmount('7', 3))],
      })
      expect(result.kind).toBe('ok')
      if (result.kind === 'ok') {
        expect(result.quote).toMatchObject({ category, evidenceClass: 'ae_sandbox_provider', provenance: 'ae_sandbox_provider' })
        expect(result.quote.price.amount).toEqual(audAmount('7', 3))
      }
    }
  })
  it('does not relabel a checkup operation as a photographer quote', () => {
    const result = resolveCategoryQuote({
      category: 'photographer',
      slug: 'photographer-one',
      requestedAt: Date.parse('2026-08-01T10:00:00.000Z'),
      offerings: [{
        name: 'checkup',
        price: { kind: 'fixed', amount: audAmount('100', 2), taxTreatment: 'inclusive' },
        accessPaths: [{ kind: 'external_operation', url: '/api/sandbox/photographer-one/checkup-quote', method: 'POST' }],
      }],
    })
    expect(result).toMatchObject({ kind: 'error', code: 'unknown_offering' })
  })

  it('excludes expired quotes with a typed reason before scoring', () => {
    const quotes = quoteQualifiedProviders({
      qualification: {
        eligibleProviders: [provider('dentist', 'expired-dentist', audAmount('7', 3))],
        excluded: [],
        allowedSlugs: ['expired-dentist'],
      },
      requestedAt: Date.parse('2026-08-01T10:00:00.000Z'),
    }).quotes
    expect(quotes[0]?.price.amount).toEqual(audAmount('7', 3))
    const result = scoreFreshStudyQuotes({
      quotes,
      charter,
      now: Math.max(...quotes.map((quote) => quote.expiresAt)),
    })
    expect(result).toMatchObject({ kind: 'error', code: 'no_fresh_quotes' })
    if (result.kind === 'error') expect(result.excludedQuotes[0]).toMatchObject({ reason: 'expired_quote' })
  })
})
