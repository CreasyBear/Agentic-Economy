import { describe, expect, it } from 'vitest'

import {
  createOfferingInState,
  formatOfferingPrice,
  normalizeOfferingPrice,
  type BusinessOfferingRevisionRecord,
  type OfferingSourceState,
} from '@/modules/catalog/public'
import type { ExactAmount } from '@/modules/money/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'
import { DEV_SEED_PRICE_BY_SLUG } from '../../../convex/devSeed'

const businessId = brandNonEmpty('business:meridian', 'BusinessId')
const offeringRef = brandNonEmpty('offering:burst-pipe', 'OfferingRef')
const authority = { actorRef: 'owner:1', ownerRef: 'owner:1', businessOwnerRef: 'owner:1' }
const facts = { name: 'Burst pipe repair', category: 'Emergency plumbing', summary: 'Burst pipe triage and repair.' }
const empty: OfferingSourceState = { offerings: [], revisions: [], accessPaths: [], operations: [] }

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}

function createdRevision(price: unknown): BusinessOfferingRevisionRecord {
  const created = createOfferingInState(empty, {
    authority,
    operationKey: 'op:price',
    businessId,
    offeringRef,
    facts: { ...facts, pricingSummary: '$180 call-out', price: price as never },
    now: 10,
  })
  if (created.kind !== 'ok') throw new Error(`fixture: ${created.code}`)
  const revision = created.state.revisions.at(-1)
  if (revision === undefined) throw new Error('fixture: no revision')
  return revision
}

describe('normalizeOfferingPrice', () => {
  it('normalizes each published kind without duplicating currency or minor fields', () => {
    expect(normalizeOfferingPrice({ kind: 'fixed', amount: amount('AUD', '18000', 2), unit: 'visit', taxTreatment: 'inclusive' }))
      .toEqual({ kind: 'fixed', amount: amount('AUD', '18000', 2), unit: 'visit', taxTreatment: 'inclusive' })
    expect(normalizeOfferingPrice({ kind: 'fixed', amount: amount('USD', '7', 3), unit: 'call', taxTreatment: 'unstated' }))
      .toEqual({ kind: 'fixed', amount: amount('USD', '7', 3), unit: 'call', taxTreatment: 'unstated' })
    expect(normalizeOfferingPrice({ kind: 'from', amount: amount('AUD', '14000', 2), unit: 'hour', taxTreatment: 'exclusive' }))
      .toEqual({ kind: 'from', amount: amount('AUD', '14000', 2), unit: 'hour', taxTreatment: 'exclusive' })
    expect(normalizeOfferingPrice({
      kind: 'range',
      minimum: amount('AUD', '9500', 2),
      maximum: amount('AUD', '25000', 2),
      unit: 'job',
      taxTreatment: 'inclusive',
    })).toEqual({
      kind: 'range',
      minimum: amount('AUD', '9500', 2),
      maximum: amount('AUD', '25000', 2),
      unit: 'job',
      taxTreatment: 'inclusive',
    })
    // `quote_only` is the honest absence of an amount, not a zero.
    expect(normalizeOfferingPrice({ kind: 'quote_only', currency: 'AUD' }))
      .toEqual({ kind: 'quote_only', currency: 'AUD', taxTreatment: 'unstated' })
  })

  it('preserves a proven sub-cent decimal through normalization and plain formatting', () => {
    const price = normalizeOfferingPrice({
      kind: 'fixed',
      amount: amount('USD', '7', 3),
      unit: 'item',
      taxTreatment: 'unstated',
    })

    expect(price).toEqual({
      kind: 'fixed',
      amount: amount('USD', '7', 3),
      unit: 'item',
      taxTreatment: 'unstated',
    })
    expect(price).toBeDefined()
    expect(formatOfferingPrice(price!)).toBe('USD 0.007 per item')
  })

  it('compares range endpoints by exact value across exponent scales', () => {
    expect(normalizeOfferingPrice({
      kind: 'range',
      minimum: amount('USD', '7', 3),
      maximum: amount('USD', '1', 2),
      taxTreatment: 'unstated',
    })).toEqual({
      kind: 'range',
      minimum: amount('USD', '7', 3),
      maximum: amount('USD', '1', 2),
      taxTreatment: 'unstated',
    })
    expect(normalizeOfferingPrice({
      kind: 'range',
      minimum: amount('USD', '11', 3),
      maximum: amount('USD', '1', 2),
    })).toBeUndefined()
    expect(normalizeOfferingPrice({
      kind: 'range',
      minimum: amount('USD', '7', 3),
      maximum: amount('EUR', '1', 2),
    })).toBeUndefined()
  })

  it('refuses malformed exact amounts and the retired minor-unit alias', () => {
    for (const malformed of [
      { kind: 'fixed', amount: { currency: 'USD', units: '07', exponent: 3 } },
      { kind: 'fixed', amount: { currency: 'usd', units: '7', exponent: 3 } },
      { kind: 'fixed', amount: { currency: 'US', units: '7', exponent: 3 } },
      { kind: 'fixed', amount: { currency: 'USD', units: '7', exponent: -1 } },
      { kind: 'fixed', amount: { currency: 'USD', units: '7', exponent: 19 } },
      { kind: 'fixed', amount: { currency: 'USD', units: '7', exponent: 2.5 } },
    ]) {
      expect(normalizeOfferingPrice(malformed as never)).toBeUndefined()
    }
    expect(normalizeOfferingPrice({ kind: 'fixed', currency: 'USD', amountMinor: 1 } as never)).toBeUndefined()
  })

  it('keeps an unrecognised unit or tax treatment from failing the whole price', () => {
    expect(normalizeOfferingPrice({ kind: 'fixed', amount: amount('AUD', '18000', 2), unit: 'fortnight', taxTreatment: 'maybe' }))
      .toEqual({ kind: 'fixed', amount: amount('AUD', '18000', 2), taxTreatment: 'unstated' })
  })
})

describe('formatOfferingPrice', () => {
  it('renders each kind as plain copy without truncating exact decimals', () => {
    expect(formatOfferingPrice({ kind: 'fixed', amount: amount('AUD', '18000', 2), unit: 'visit', taxTreatment: 'inclusive' })).toBe('AUD 180.00 per visit incl. tax')
    expect(formatOfferingPrice({ kind: 'fixed', amount: amount('USD', '7', 3), unit: 'call', taxTreatment: 'unstated' })).toBe('USD 0.007 per call')
    expect(formatOfferingPrice({ kind: 'from', amount: amount('AUD', '14050', 2), unit: 'hour', taxTreatment: 'exclusive' })).toBe('From AUD 140.50 per hour excl. tax')
    expect(formatOfferingPrice({
      kind: 'range',
      minimum: amount('AUD', '9500', 2),
      maximum: amount('AUD', '25000', 2),
      taxTreatment: 'unstated',
    })).toBe('AUD 95.00–AUD 250.00')
    expect(formatOfferingPrice({ kind: 'quote_only', currency: 'AUD', taxTreatment: 'unstated' })).toBe('Quoted on request (AUD)')
  })
})

describe('Offering facts cleaning', () => {
  it('carries a well-formed exact price into the stored revision and preserves prose', () => {
    const revision = createdRevision({
      kind: 'range',
      minimum: amount('USD', '7', 3),
      maximum: amount('USD', '1', 2),
      unit: 'job',
      taxTreatment: 'inclusive',
    })

    expect(revision.price).toEqual({
      kind: 'range',
      minimum: amount('USD', '7', 3),
      maximum: amount('USD', '1', 2),
      unit: 'job',
      taxTreatment: 'inclusive',
    })
    // Prose and structured price are independent published facts; neither is
    // derived from the other, so both survive the same write.
    expect(revision.pricingSummary).toBe('$180 call-out')
  })

  it('drops an inconsistent price without failing the rest of the Offering', () => {
    for (const bad of [
      { kind: 'range', minimum: amount('USD', '11', 3), maximum: amount('USD', '1', 2) },
      { kind: 'fixed', amount: { currency: 'USD', units: '07', exponent: 3 } },
      { kind: 'fixed', amount: { currency: 'usd', units: '7', exponent: 3 } },
    ]) {
      const revision = createdRevision(bad)
      expect(revision.price).toBeUndefined()
      expect(revision.name).toBe('Burst pipe repair')
      expect(revision.pricingSummary).toBe('$180 call-out')
    }
  })

  it('leaves an unpriced Offering exactly as it was', () => {
    const created = createOfferingInState(empty, { authority, operationKey: 'op:none', businessId, offeringRef, facts, now: 10 })
    if (created.kind !== 'ok') throw new Error('fixture')

    expect(created.state.revisions[0]).not.toHaveProperty('price')
  })
})

describe('Dev seed prices', () => {
  it('publishes no fabricated price for the curated provider listings', () => {
    const pricedSlugs = DEV_SEED_BUSINESS_FIXTURES
      .filter((fixture) => fixture.offerings.some((offering) => offering.pricingSummary !== undefined))
      .map((fixture) => fixture.requestedSlug)

    // The curated-only seed observes external provider listings, none of which
    // publishes a verifiable price AE can carry as a fact. Inventing one here
    // would be the fabrication the price twin exists to prevent.
    expect(pricedSlugs).toEqual([])
    // The prose <=> structured twin invariant still holds for whatever the seed
    // does publish: a floating pricing sentence must never silently drop its twin.
    expect(pricedSlugs.filter((slug) => DEV_SEED_PRICE_BY_SLUG[slug] === undefined)).toEqual([])
    expect(Object.values(DEV_SEED_PRICE_BY_SLUG).every((price) => normalizeOfferingPrice(price) !== undefined)).toBe(true)
    expect(Object.keys(DEV_SEED_PRICE_BY_SLUG)).toHaveLength(pricedSlugs.length)
  })
})
