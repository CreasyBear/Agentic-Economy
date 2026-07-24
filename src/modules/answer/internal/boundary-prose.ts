import type { AnswerSource } from '../answer-synthesizer'

export function buildBoundaryOneLine(): string {
  return 'Agentic Economy reads and compares published listings. The business confirms what happens next.'
}

export function buildBoundarySummary(providers: readonly AnswerSource[]): string {
  const context =
    providers.length > 0
      ? 'In this thread, the cards above are published listings you can compare and open.'
      : 'Agentic Economy publishes business-supplied details for comparison.'

  return [
    context,
    'Use the cards to compare published services, service area, and contact path.',
    'The business confirms timing, price, availability, and the work after you make contact.',
  ].join(' ')
}

export function buildBoundaryNextStep(providers: readonly AnswerSource[]): string {
  if (providers.some((provider) => provider.inquiryUrl !== undefined)) {
    return 'Open a listed business and send an inquiry when that option is published.'
  }

  return 'Browse services or refine your search, then contact the business when you find a match.'
}

export function buildUnsupportedOneLine(): string {
  return 'This request needs a business-supported action that is not available here.'
}

export function buildUnsupportedSummary(providers: readonly AnswerSource[]): string {
  const route =
    providers.length > 0
      ? 'Open a listed business page and send a qualified inquiry when that option is published.'
      : 'Browse services, then open a business page when you find a match.'

  return [
    route,
    'The business reviews your message and replies through your contact detail.',
    'The business confirms timing, price, availability, and the work.',
  ].join(' ')
}

export function buildUnsupportedNextStep(providers: readonly AnswerSource[]): string {
  if (providers.some((provider) => provider.inquiryUrl !== undefined)) {
    return 'Send an inquiry from a listed business page.'
  }

  return 'Find a listed business first, then use an inquiry option when it is published.'
}
