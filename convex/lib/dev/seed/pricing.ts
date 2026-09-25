import { DEV_SEED_BUSINESS_FIXTURES } from '../../../../src/modules/dev/public'
import type { OfferingPrice } from '@/modules/catalog/public'

/*
 * The sandbox Tool's single price fact.
 *
 * `/tools/<ref>` and `ae describe` read the capability-supply publication
 * price; the business page reads the catalog Offering's `price` /
 * `pricingSummary`. Both are published below from these three constants, so a
 * reader can never be quoted two different numbers for the same Tool.
 */
export const SANDBOX_TOOL_PRICING_SUMMARY = 'AUD 1.00 per Call (sandbox)'
export const SANDBOX_TOOL_PRICE_AMOUNT = { currency: 'AUD', units: '1000000', exponent: 6 } as const
export const SANDBOX_TOOL_OFFERING_PRICE: OfferingPrice = {
  kind: 'fixed',
  amount: { ...SANDBOX_TOOL_PRICE_AMOUNT },
  unit: 'call',
  // The sandbox fixture publishes no tax position, so neither does its twin.
  taxTreatment: 'unstated',
}

export const DEV_SEED_PRICING_BY_SLUG: Readonly<Record<string, string>> = Object.fromEntries(
  DEV_SEED_BUSINESS_FIXTURES.flatMap((fixture) => fixture.offerings.flatMap((offering) => (
    offering.pricingSummary === undefined ? [] : [[fixture.requestedSlug, offering.pricingSummary]]
  ))),
)

/**
 * The comparable twin of each seeded `pricingSummary`, authored by hand against
 * the sentence it sits beside. Nothing is parsed out of the prose at runtime:
 * the two are independent published facts, and a fixture sentence with no entry
 * here seeds prose only, exactly as it did before prices existed.
 */
const DEV_SEED_PRICE_BY_PRICING_SUMMARY: Readonly<Record<string, OfferingPrice>> = {
  'Demo price — $180 call-out, quoted before work starts': { kind: 'fixed', amount: { currency: 'AUD', units: '18000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — $140 first hour, then $95 per hour': { kind: 'from', amount: { currency: 'AUD', units: '14000', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
  'Demo price — $95 check-up and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '9500', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — $350 first consultation': { kind: 'fixed', amount: { currency: 'AUD', units: '35000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — $55 per hour, 3 hour minimum': { kind: 'from', amount: { currency: 'AUD', units: '5500', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 5,000–7,000 typical wedding investment': { kind: 'from', amount: { currency: 'AUD', units: '500000', exponent: 2 }, unit: 'day', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 250 per additional hour': { kind: 'from', amount: { currency: 'AUD', units: '25000', exponent: 2 }, unit: 'hour', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 1,800 wedding coverage package': { kind: 'fixed', amount: { currency: 'AUD', units: '180000', exponent: 2 }, unit: 'day', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 4,500 base funeral service': { kind: 'fixed', amount: { currency: 'AUD', units: '450000', exponent: 2 }, unit: 'job', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 4,200 base funeral service': { kind: 'fixed', amount: { currency: 'AUD', units: '420000', exponent: 2 }, unit: 'job', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 4,800 base funeral service': { kind: 'fixed', amount: { currency: 'AUD', units: '480000', exponent: 2 }, unit: 'job', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 150 check-up and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '15000', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 199 check-up, scale and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '19900', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  'Demo price — publicly observed / development mock — AUD 139 check-up and clean': { kind: 'fixed', amount: { currency: 'AUD', units: '13900', exponent: 2 }, unit: 'visit', taxTreatment: 'inclusive' },
  [SANDBOX_TOOL_PRICING_SUMMARY]: SANDBOX_TOOL_OFFERING_PRICE,
}

export const DEV_SEED_PRICE_BY_SLUG: Readonly<Record<string, OfferingPrice>> = Object.fromEntries(
  Object.entries(DEV_SEED_PRICING_BY_SLUG).flatMap(([slug, summary]) => {
    const price = DEV_SEED_PRICE_BY_PRICING_SUMMARY[summary]
    return price === undefined ? [] : [[slug, price]]
  }),
)
