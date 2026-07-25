/**
 * Public comprehension copy for the Customer Request surface.
 *
 * PRODUCT.md sets the voice: direct, capable, and exact. State the target
 * confidently, state today's proof honestly, and never turn a safeguard into
 * the headline. Each line below leads with what AE does. The boundary lines
 * stay exact, but they are qualifiers, not the pitch — the surface renders them
 * at the moment they apply rather than stacking them in front of the input.
 */
export const CUSTOMER_REQUEST_PUBLIC_COMPREHENSION = Object.freeze({
  situation: 'Name the outcome. AE finds the businesses, compares real options, and carries the work through.',
  examples: 'Book a trade, plan an itinerary, run a procurement decision, or recover when plans fall apart.',
  support: 'AE shows only what registered businesses can do right now, and says so plainly when nothing can.',
  sandboxBoundary: 'Multi-business examples currently run on labelled AE sandbox businesses. They prove the workflow, not independent supply, booking, payment, dispatch, or fulfilment.',
  authority: 'You confirm the choice. Starting it is a separate decision.',
})

export const CUSTOMER_REQUEST_PUBLIC_COMPREHENSION_LINES = Object.freeze([
  CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.situation,
  CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.examples,
  CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.support,
  CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.sandboxBoundary,
  CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.authority,
])
