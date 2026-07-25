/**
 * Sandbox provider behaviour standing in for a business's own booking system.
 *
 * This is the supply side of a machine-callable capability: an agent asks for a
 * price and gets a bounded commitment back, rather than an instruction to contact
 * a human. Responses are labelled sandbox and must never be presented as evidence
 * of independent provider fulfilment.
 */

export const SandboxQuoteProvenance = 'ae_sandbox_provider' as const

/** Quotes stay honest by expiring; an agent must not treat a stale price as current. */
const QuoteValidityMs = 24 * 60 * 60 * 1000
const OpeningHour = 9
const ClosingHour = 17
const SlotMinutes = 30

export type CheckupQuoteRequest = Readonly<{
  slug: string
  requestedAt: number
}>

export type CheckupQuote = Readonly<{
  provenance: typeof SandboxQuoteProvenance
  slug: string
  service: string
  price: Readonly<{ currency: string; amountMinor: number }>
  nextAvailable: string
  quotedAt: string
  validUntil: string
}>

export type CheckupQuoteResult =
  | Readonly<{ kind: 'quoted'; quote: CheckupQuote }>
  | Readonly<{ kind: 'refused'; reason: 'unknown_offering' }>

const CheckupPriceMinorByslug: Record<string, number> = {
  'adelaide-dental-clinic': 18_000,
}

/**
 * Next slot inside opening hours, rounded up to the slot grid. Before opening the
 * same day opens; at or after closing it rolls to the next day.
 */
export function nextAvailableSlot(from: Date): Date {
  const slot = new Date(from)
  slot.setSeconds(0, 0)
  const remainder = slot.getMinutes() % SlotMinutes
  slot.setMinutes(slot.getMinutes() + (remainder === 0 ? SlotMinutes : SlotMinutes - remainder))
  if (slot.getHours() < OpeningHour) {
    slot.setHours(OpeningHour, 0, 0, 0)
    return slot
  }
  if (slot.getHours() >= ClosingHour) {
    slot.setDate(slot.getDate() + 1)
    slot.setHours(OpeningHour, 0, 0, 0)
  }
  return slot
}

export function quoteStandardCheckup(input: CheckupQuoteRequest): CheckupQuoteResult {
  const amountMinor = CheckupPriceMinorByslug[input.slug]
  if (amountMinor === undefined) return { kind: 'refused', reason: 'unknown_offering' }

  const requestedAt = new Date(input.requestedAt)
  return {
    kind: 'quoted',
    quote: {
      provenance: SandboxQuoteProvenance,
      slug: input.slug,
      service: 'Standard checkup',
      price: { currency: 'AUD', amountMinor },
      nextAvailable: nextAvailableSlot(requestedAt).toISOString(),
      quotedAt: requestedAt.toISOString(),
      validUntil: new Date(input.requestedAt + QuoteValidityMs).toISOString(),
    },
  }
}
