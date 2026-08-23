import type { AnswerSource } from '../answer-synthesizer'

export function buildBoundaryOneLine(): string {
  return 'This Operation can be compared here, but it cannot be invoked through Agentic Economy yet. Confirm access, price, and availability with the supplier.'
}

export function buildBoundarySummary(providers: readonly AnswerSource[]): string {
  const context =
    providers.length > 0
      ? 'The results above show published Operations you can compare and inspect.'
      : 'This page shows supplier-published Operations for comparison.'

  return [
    context,
    'Compare the outcome, exact contract, price, readiness, and measured evidence.',
  ].join(' ')
}

export function buildBoundaryNextStep(providers: readonly AnswerSource[]): string {
  return 'Inspect another Operation or refine your search, then connect with the supplier when you find a match.'
}

export function buildUnsupportedOneLine(): string {
  return 'This request cannot be completed through the market yet; the supplier would need to handle it directly.'
}

export function buildUnsupportedSummary(providers: readonly AnswerSource[]): string {
  const route =
    providers.length > 0
      ? 'Open an Operation and use the supplier route when one is published.'
      : 'See other Operations, then inspect the supplier when you find a match.'

  return [
    route,
    'The supplier handles any off-market request through its own published route.',
  ].join(' ')
}

export function buildUnsupportedNextStep(providers: readonly AnswerSource[]): string {
  return 'Open an Operation to inspect its available access route.'
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
