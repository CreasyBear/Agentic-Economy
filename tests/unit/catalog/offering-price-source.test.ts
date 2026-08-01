import { describe, expect, it } from 'vitest'

import {
  createOfferingInState,
  formatOfferingPrice,
  normalizeOfferingPrice,
  offeringPriceCeilingMinor,
  type BusinessOfferingRevisionRecord,
  type OfferingSourceState,
} from '@/modules/catalog/public'
import { brandNonEmpty } from '@/modules/common/ids'
import { DEV_SEED_BUSINESS_FIXTURES } from '@/modules/dev/public'
import { withoutNativeOnlyFacts } from '../../../convex/catalog'
import { DEV_SEED_PRICE_BY_SLUG } from '../../../convex/devSeed'

const businessId = brandNonEmpty('business:meridian', 'BusinessId')
const offeringRef = brandNonEmpty('offering:burst-pipe', 'OfferingRef')
const authority = { actorRef: 'owner:1', ownerRef: 'owner:1', businessOwnerRef: 'owner:1' }
const facts = { name: 'Burst pipe repair', category: 'Emergency plumbing', summary: 'Burst pipe triage and repair.' }
const empty: OfferingSourceState = { offerings: [], revisions: [], accessPaths: [], operations: [] }

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
  it('normalizes each published kind', () => {
    expect(normalizeOfferingPrice({ kind: 'fixed', currency: 'aud', amountMinor: 18_000, unit: 'visit', taxTreatment: 'inclusive' }))
      .toEqual({ kind: 'fixed', currency: 'AUD', amountMinor: 18_000, unit: 'visit', taxTreatment: 'inclusive' })
    expect(normalizeOfferingPrice({ kind: 'from', currency: 'AUD', amountMinor: 14_000, unit: 'hour', taxTreatment: 'exclusive' }))
      .toEqual({ kind: 'from', currency: 'AUD', amountMinor: 14_000, unit: 'hour', taxTreatment: 'exclusive' })
    expect(normalizeOfferingPrice({ kind: 'range', currency: 'AUD', amountMinor: 9_500, maximumAmountMinor: 25_000, unit: 'job', taxTreatment: 'inclusive' }))
      .toEqual({ kind: 'range', currency: 'AUD', amountMinor: 9_500, maximumAmountMinor: 25_000, unit: 'job', taxTreatment: 'inclusive' })
    // `quote_only` is the honest absence of an amount, not a zero.
    expect(normalizeOfferingPrice({ kind: 'quote_only', currency: 'AUD' }))
      .toEqual({ kind: 'quote_only', currency: 'AUD', taxTreatment: 'unstated' })
  })

  it('drops a price it cannot publish whole', () => {
    // A range whose ceiling sits under its floor would sort against a number
    // the business never agreed to.
    expect(normalizeOfferingPrice({ kind: 'range', currency: 'AUD', amountMinor: 25_000, maximumAmountMinor: 9_500 })).toBeUndefined()
    expect(normalizeOfferingPrice({ kind: 'range', currency: 'AUD', amountMinor: 9_500 })).toBeUndefined()
    expect(normalizeOfferingPrice({ kind: 'fixed', currency: 'AUD', amountMinor: 180.5 })).toBeUndefined()
    expect(normalizeOfferingPrice({ kind: 'fixed', currency: 'AUD', amountMinor: -100 })).toBeUndefined()
    expect(normalizeOfferingPrice({ kind: 'fixed', currency: 'AUD', amountMinor: 10_000_001 })).toBeUndefined()
    expect(normalizeOfferingPrice({ kind: 'fixed', currency: 'DOLLARS', amountMinor: 18_000 })).toBeUndefined()
    expect(normalizeOfferingPrice({ kind: 'fixed', amountMinor: 18_000 })).toBeUndefined()
    expect(normalizeOfferingPrice({ kind: 'negotiable', currency: 'AUD', amountMinor: 18_000 })).toBeUndefined()
    expect(normalizeOfferingPrice({ kind: 'fixed', currency: 'AUD' })).toBeUndefined()
    expect(normalizeOfferingPrice(undefined)).toBeUndefined()
  })

  it('keeps an unrecognised unit or tax treatment from failing the whole price', () => {
    expect(normalizeOfferingPrice({ kind: 'fixed', currency: 'AUD', amountMinor: 18_000, unit: 'fortnight', taxTreatment: 'maybe' }))
      .toEqual({ kind: 'fixed', currency: 'AUD', amountMinor: 18_000, taxTreatment: 'unstated' })
  })
})

describe('offeringPriceCeilingMinor', () => {
  it('reports the amount a caller must be willing to spend', () => {
    expect(offeringPriceCeilingMinor({ kind: 'fixed', currency: 'AUD', amountMinor: 18_000, taxTreatment: 'inclusive' })).toBe(18_000)
    expect(offeringPriceCeilingMinor({ kind: 'from', currency: 'AUD', amountMinor: 14_000, taxTreatment: 'inclusive' })).toBe(14_000)
    expect(offeringPriceCeilingMinor({ kind: 'range', currency: 'AUD', amountMinor: 9_500, maximumAmountMinor: 25_000, taxTreatment: 'inclusive' })).toBe(25_000)
  })

  it('gives no ceiling for quote_only, so a spend limit never filters it out', () => {
    expect(offeringPriceCeilingMinor({ kind: 'quote_only', currency: 'AUD', taxTreatment: 'unstated' })).toBeUndefined()
    expect(offeringPriceCeilingMinor(undefined)).toBeUndefined()
  })
})

describe('formatOfferingPrice', () => {
  it('renders each kind as plain copy', () => {
    expect(formatOfferingPrice({ kind: 'fixed', currency: 'AUD', amountMinor: 18_000, unit: 'visit', taxTreatment: 'inclusive' })).toBe('AUD 180 per visit incl. tax')
    expect(formatOfferingPrice({ kind: 'from', currency: 'AUD', amountMinor: 14_050, unit: 'hour', taxTreatment: 'exclusive' })).toBe('From AUD 140.50 per hour excl. tax')
    expect(formatOfferingPrice({ kind: 'range', currency: 'AUD', amountMinor: 9_500, maximumAmountMinor: 25_000, taxTreatment: 'unstated' })).toBe('AUD 95–AUD 250')
    expect(formatOfferingPrice({ kind: 'quote_only', currency: 'AUD', taxTreatment: 'unstated' })).toBe('Quoted on request (AUD)')
  })
})

describe('Offering facts cleaning', () => {
  it('carries a well-formed price into the stored revision', () => {
    const revision = createdRevision({ kind: 'range', currency: 'aud', amountMinor: 9_500, maximumAmountMinor: 25_000, unit: 'job', taxTreatment: 'inclusive' })

    expect(revision.price).toEqual({ kind: 'range', currency: 'AUD', amountMinor: 9_500, maximumAmountMinor: 25_000, unit: 'job', taxTreatment: 'inclusive' })
    // Prose and structured price are independent published facts; neither is
    // derived from the other, so both survive the same write.
    expect(revision.pricingSummary).toBe('$180 call-out')
  })

  it('drops an inconsistent price without failing the rest of the Offering', () => {
    for (const bad of [
      { kind: 'range', currency: 'AUD', amountMinor: 25_000, maximumAmountMinor: 9_500 },
      { kind: 'fixed', currency: 'AUD', amountMinor: 180.5 },
      { kind: 'fixed', currency: 'DOLLARS', amountMinor: 18_000 },
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

describe('withoutNativeOnlyFacts', () => {
  it('strips the price the retained v1 service row cannot hold', () => {
    const revision = createdRevision({ kind: 'fixed', currency: 'AUD', amountMinor: 18_000, unit: 'visit', taxTreatment: 'inclusive' })

    const legacyExpressible = withoutNativeOnlyFacts(revision)

    // Comparing a native-only fact during cutover would demote the business to
    // `compare`, where the legacy projection serves and the price disappears.
    expect(legacyExpressible).not.toHaveProperty('price')
    expect(legacyExpressible).not.toHaveProperty('pricingSummary')
    expect(legacyExpressible.name).toBe('Burst pipe repair')
    expect(legacyExpressible.sourceHash).toBe(revision.sourceHash)
  })
})

describe('Dev seed prices', () => {
  it('publishes a structured twin for every seeded pricing sentence', () => {
    const pricedSlugs = DEV_SEED_BUSINESS_FIXTURES
      .filter((fixture) => fixture.pricingSummary !== undefined)
      .map((fixture) => fixture.requestedSlug)

    expect(pricedSlugs.length).toBeGreaterThan(0)
    // Prose without a comparable twin is the exact gap this seed data exists to
    // demonstrate closed; a drifted fixture sentence must not silently reopen it.
    expect(pricedSlugs.filter((slug) => DEV_SEED_PRICE_BY_SLUG[slug] === undefined)).toEqual([])
    expect(Object.values(DEV_SEED_PRICE_BY_SLUG).every((price) => normalizeOfferingPrice(price) !== undefined)).toBe(true)
    expect(Object.keys(DEV_SEED_PRICE_BY_SLUG)).toHaveLength(pricedSlugs.length)
  })
})
