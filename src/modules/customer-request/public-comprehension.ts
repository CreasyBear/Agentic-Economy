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
  authority: 'You choose what happens next. AE asks before sharing details or starting work.',
})

/** Assistant-facing boundary for published listing evidence. */
export const CUSTOMER_REQUEST_MACHINE_BOUNDARY = 'Published listings are evidence for comparison; they do not by themselves prove booking, payment, dispatch, or fulfilment.'

export const CUSTOMER_REQUEST_MACHINE_COMPREHENSION_LINES = Object.freeze([
  'AE accepts a natural-language outcome request, compares published options from registered businesses, and can progress an approved option through its declared completion steps.',
  `Examples include ${CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.examples.join(', ')} paths.`,
  `The public catalogue contains ${CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.supply.state.replace('_', ' ')} claims from ${CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.supply.source.replace('_', ' ')}.`,
  CUSTOMER_REQUEST_MACHINE_BOUNDARY,
  'A customer selects and separately approves an exact option before AE can start it.',
])
