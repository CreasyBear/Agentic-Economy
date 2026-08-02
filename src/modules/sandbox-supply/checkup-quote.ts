import { addDays, addMilliseconds, addMinutes, getHours, getMinutes, set, startOfMinute, toDate } from 'date-fns'

import type { OfferingPrice } from '@/modules/catalog/public'

/**
 * Sandbox provider behaviour standing in for a business's own booking system.
 *
 * This is the supply side of a machine-callable capability: an agent asks for a
 * price and gets a bounded commitment back, rather than an instruction to contact
 * a human. Responses are labelled sandbox and must never be presented as evidence
 * of independent provider fulfilment.
 */

export const SandboxQuoteProvenance = 'ae_sandbox_provider' as const

/** Quotes stay honest by expiring; an agent must not treat a stale price as current.
 * `addMilliseconds` is the date-fns v4 API declared at `node_modules/date-fns/addMilliseconds.d.ts:8-36`.
 */
const QuoteValidityMs = 24 * 60 * 60 * 1000
const OpeningHour = 9
const ClosingHour = 17
const SlotMinutes = 30

export type CheckupQuoteOfferingFacts = Readonly<{
  name: string
  price: Readonly<{
    currency: string
    amountMinor: number
    unit?: OfferingPrice['unit']
    taxTreatment?: OfferingPrice['taxTreatment']
  }>
}>

export type CheckupQuoteRequest = Readonly<{
  slug: string
  requestedAt: number
  offering: CheckupQuoteOfferingFacts
}>

export type CheckupQuote = Readonly<{
  provenance: typeof SandboxQuoteProvenance
  slug: string
  service: string
  price: CheckupQuoteOfferingFacts['price']
  nextAvailable: string
  quotedAt: string
  validUntil: string
}>

export type CategoryQuoteCategory = 'photographer' | 'funeral' | 'dentist'

export type CategoryQuoteRequest = Readonly<{
  category: CategoryQuoteCategory
  slug: string
  requestedAt: number
  offering: CheckupQuoteOfferingFacts
}>

export type CategoryQuote = Readonly<{
  provenance: typeof SandboxQuoteProvenance
  evidenceClass: typeof SandboxQuoteProvenance
  category: CategoryQuoteCategory
  slug: string
  service: string
  price: CheckupQuoteOfferingFacts['price']
  nextAvailable: string
  quotedAt: string
  validUntil: string
}>

/**
 * Next slot inside opening hours, rounded up to the slot grid. Before opening the
 * same day opens; at or after closing it rolls to the next day.
 * date-fns v4 declarations: `startOfMinute.d.ts:8-35`, `getMinutes.d.ts:7-27`,
 * `getHours.d.ts:7-27`, `addMinutes.d.ts:8-36`, `set.d.ts:8-48`,
 * `addDays.d.ts:8-55`, and `toDate.d.ts:7-28`; expiry uses
 * `addMilliseconds.d.ts:8-36`.
 */
export function nextAvailableSlot(from: Date): Date {
  const slot = startOfMinute(from)
  const remainder = getMinutes(slot) % SlotMinutes
  const minutesToAdd = remainder === 0 ? SlotMinutes : SlotMinutes - remainder
  const rounded = addMinutes(slot, minutesToAdd)
  if (getHours(rounded) < OpeningHour) {
    return set(rounded, { hours: OpeningHour, minutes: 0, seconds: 0, milliseconds: 0 })
  }
  if (getHours(rounded) >= ClosingHour) {
    return set(addDays(rounded, 1), { hours: OpeningHour, minutes: 0, seconds: 0, milliseconds: 0 })
  }
  return rounded
}

export function quoteStandardCheckup(input: CheckupQuoteRequest): CheckupQuote {
  const requestedAt = toDate(input.requestedAt)
  return {
    provenance: SandboxQuoteProvenance,
    slug: input.slug,
    service: input.offering.name,
    price: input.offering.price,
    nextAvailable: nextAvailableSlot(requestedAt).toISOString(),
    quotedAt: requestedAt.toISOString(),
    validUntil: addMilliseconds(requestedAt, QuoteValidityMs).toISOString(),
  }
}

/**
 * Category-generic sandbox quote. It intentionally copies the selected offering's
 * fixed price and emits both provenance fields as `ae_sandbox_provider`; the
 * category is a cohort label, never a claim of a real photographer, funeral
 * director, or dentist's availability.
 */
export function quoteCategoryOffering(input: CategoryQuoteRequest): CategoryQuote {
  const requestedAt = toDate(input.requestedAt)
  return {
    provenance: SandboxQuoteProvenance,
    evidenceClass: SandboxQuoteProvenance,
    category: input.category,
    slug: input.slug,
    service: input.offering.name,
    price: input.offering.price,
    nextAvailable: nextAvailableSlot(requestedAt).toISOString(),
    quotedAt: requestedAt.toISOString(),
    validUntil: addMilliseconds(requestedAt, QuoteValidityMs).toISOString(),
  }
}
