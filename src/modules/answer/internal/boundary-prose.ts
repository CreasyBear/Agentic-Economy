import type { AnswerSource } from '../answer-synthesizer'

export function buildBoundaryOneLine(): string {
  return 'Agentic Economy reads and compares published listings. It does not book, charge, or dispatch.'
}

export function buildBoundarySummary(providers: readonly AnswerSource[]): string {
  const context =
    providers.length > 0
      ? 'In this thread, the cards above are published listings you can compare and open.'
      : 'Agentic Economy publishes business-supplied details for comparison.'

  return [
    context,
    'You can read listings, compare providers, and send a qualified inquiry when a business publishes that option.',
    'No booking or payment happens on this page. Availability and quotes still need a reply from the business.',
  ].join(' ')
}

export function buildBoundaryNextStep(providers: readonly AnswerSource[]): string {
  if (providers.some((provider) => provider.inquiryUrl !== undefined)) {
    return 'Open a listed provider and send an inquiry when that option is published. Agentic Economy does not book or take payment on this page.'
  }

  return 'Browse the registry or refine your search. Agentic Economy compares and routes; it does not book or take payment on this page.'
}

export function buildUnsupportedOneLine(): string {
  return 'Agentic Economy cannot book, charge, or dispatch on your behalf.'
}

export function buildUnsupportedSummary(providers: readonly AnswerSource[]): string {
  const route =
    providers.length > 0
      ? 'Open a listed provider page and send a qualified inquiry when that option is published.'
      : 'Browse the registry for listed providers, then open a provider page when you find a match.'

  return [
    route,
    'The business reviews your message and replies through your contact detail.',
    'Agentic Economy does not book or take payment on this page.',
  ].join(' ')
}

export function buildUnsupportedNextStep(providers: readonly AnswerSource[]): string {
  if (providers.some((provider) => provider.inquiryUrl !== undefined)) {
    return 'Send a qualified inquiry from a listed provider page. Agentic Economy does not book or take payment on this page.'
  }

  return 'Find a listed provider first, then use an inquiry option when it is published. Agentic Economy does not book or take payment on this page.'
}
