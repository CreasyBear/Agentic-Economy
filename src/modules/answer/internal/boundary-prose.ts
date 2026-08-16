import type { AnswerSource } from '../answer-synthesizer'

export function buildBoundaryOneLine(): string {
  return 'The assistant compares published details, but it cannot book or start the job. Timing, price, and availability still need confirmation from the business.'
}

export function buildBoundarySummary(providers: readonly AnswerSource[]): string {
  const context =
    providers.length > 0
      ? 'In this thread, the cards above show published details you can compare and open.'
      : 'This page shows details supplied by businesses for comparison.'

  return [
    context,
    'Use the cards to compare what is offered, service area, and how to get in touch.',
  ].join(' ')
}

export function buildBoundaryNextStep(providers: readonly AnswerSource[]): string {
  if (providers.some((provider) => provider.inquiryUrl !== undefined)) {
    return 'Open a business and send a request when that option is available.'
  }

  return 'See other options or refine your search, then contact the business when you find a match.'
}

export function buildUnsupportedOneLine(): string {
  return 'This kind of request is not available here; the business would need to handle it directly.'
}

export function buildUnsupportedSummary(providers: readonly AnswerSource[]): string {
  const route =
    providers.length > 0
      ? 'Open a business page and send a request when that option is available.'
      : 'See other options, then open a business page when you find a match.'

  return [
    route,
    'The business reviews your message and replies using the contact details you provide.',
  ].join(' ')
}

export function buildUnsupportedNextStep(providers: readonly AnswerSource[]): string {
  if (providers.some((provider) => provider.inquiryUrl !== undefined)) {
    return 'Send a request from the business page.'
  }

  return 'Open a business page to use its request option when available.'
}

export function buildSafetyRefusalOneLine(): string {
  return 'I cannot help with requests that could cause physical harm.'
}

export function buildSafetyRefusalSummary(): string {
  return 'No search, provider lookup, capability selection, or external action was run for this request.'
}

export function buildSafetyRefusalNextStep(): string {
  return 'Try a safe question or start a new ask.'
}

export function buildSafetyCheckUnavailableOneLine(): string {
  return 'I could not run the safety check needed before answering this request.'
}

export function buildSafetyCheckUnavailableSummary(): string {
  return 'No search, provider lookup, capability selection, or external action was run for this request.'
}

export function buildSafetyCheckUnavailableNextStep(): string {
  return 'Please try again.'
}
