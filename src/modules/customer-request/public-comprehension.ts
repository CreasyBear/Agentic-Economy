/**
 * Structured claims for the public Customer Request journey.
 *
 * Human and machine surfaces render these facts separately. Keeping the facts
 * here prevents a polished sentence from becoming an accidental API contract.
 */
export const CUSTOMER_REQUEST_PUBLIC_COMPREHENSION = Object.freeze({
  outcome: 'find_compare_and_progress' as const,
  examples: ['trade', 'itinerary', 'procurement', 'recovery'] as const,
  supply: Object.freeze({
    source: 'registered_businesses' as const,
    state: 'published_current' as const,
  }),
  exampleSupply: Object.freeze({
    kind: 'ae_sandbox' as const,
    label: 'labelled AE sandbox businesses',
    proves: ['workflow'] as const,
    doesNotProve: ['independent supply', 'booking', 'payment', 'dispatch', 'fulfilment'] as const,
  }),
  authority: Object.freeze({
    customerChooses: true,
    separateApprovalBeforeStart: true,
  }),
})

/** Customer-facing copy. Do not import this from machine discovery. */
export const CUSTOMER_REQUEST_HUMAN_COMPREHENSION = Object.freeze({
  situation: 'Tell AE what you need. It finds businesses, compares options, and helps you take the next step.',
  examples: 'Describe a job, trip, purchase, or recovery in your own words.',
  support: 'See what businesses have published, including price and timing when available.',
  sandboxBoundary: 'Examples use AE test businesses. They show how the journey works, not a real booking or payment.',
  authority: 'You choose what happens next. AE asks before sharing details or starting work.',
})

/** Assistant-facing copy. It is deliberately independent from the human copy. */
const CUSTOMER_REQUEST_MACHINE_NON_PROOF = CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.exampleSupply.doesNotProve
const CUSTOMER_REQUEST_MACHINE_NON_PROOF_TEXT = `${CUSTOMER_REQUEST_MACHINE_NON_PROOF.slice(0, -1).join(', ')}, or ${CUSTOMER_REQUEST_MACHINE_NON_PROOF.at(-1)}`
export const CUSTOMER_REQUEST_MACHINE_BOUNDARY = `Multi-business examples use ${CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.exampleSupply.label}. They demonstrate ${CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.exampleSupply.proves.join(', ')} only; they do not prove ${CUSTOMER_REQUEST_MACHINE_NON_PROOF_TEXT}.`

export const CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES = Object.freeze([
  'AE accepts a natural-language outcome request, compares published options from registered businesses, and can progress an approved option through its declared completion steps.',
  `Examples include ${CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.examples.join(', ')} paths.`,
  `The public catalogue contains ${CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.supply.state.replace('_', ' ')} claims from ${CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.supply.source.replace('_', ' ')}.`,
  CUSTOMER_REQUEST_MACHINE_BOUNDARY,
  'A customer selects and separately approves an exact option before AE can start it.',
])
