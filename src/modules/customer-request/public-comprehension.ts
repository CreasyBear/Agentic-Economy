export const CUSTOMER_REQUEST_PUBLIC_COMPREHENSION = Object.freeze({
  situation: 'When plans change or several businesses may be involved, start with the outcome you need.',
  examples: 'That can be a procurement decision, an itinerary, a service journey, or recovery after disruption.',
  support: 'AE checks current registered support and shows what is available. If nothing supports the Request, AE says so.',
  sandboxBoundary: 'Current multi-business Request examples use labelled AE sandbox businesses. They prove the workflow only—not independent supply, booking, payment, dispatch, or fulfilment.',
  authority: 'You decide whether to confirm an option. Starting it is a separate decision.',
})

export const CUSTOMER_REQUEST_PUBLIC_COMPREHENSION_LINES = Object.freeze([
  CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.situation,
  CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.examples,
  CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.support,
  CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.sandboxBoundary,
  CUSTOMER_REQUEST_PUBLIC_COMPREHENSION.authority,
])
