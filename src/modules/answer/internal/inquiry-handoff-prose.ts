import type { AnswerSource } from '../answer-synthesizer'

export type InquiryHandoffResolution =
  | { kind: 'no_provider'; providers: readonly AnswerSource[] }
  | { kind: 'choose_provider'; providers: readonly AnswerSource[] }
  | { kind: 'provider_unavailable'; provider: AnswerSource; providers: readonly AnswerSource[] }
  | { kind: 'resolved'; provider: AnswerSource; providers: readonly AnswerSource[] }

export function resolveInquiryHandoff(input: {
  query: string
  providers: readonly AnswerSource[]
}): InquiryHandoffResolution {
  const providers = input.providers
  if (providers.length === 0) {
    return { kind: 'no_provider', providers }
  }

  const explicitProvider = selectProviderFromQuery(input.query, providers)
  const onlyInquiryReady = providers.filter((provider) => provider.inquiryUrl !== undefined)

  const provider =
    explicitProvider ??
    (providers.length === 1 ? providers[0] : undefined) ??
    (onlyInquiryReady.length === 1 && asksForInquiry(input.query) ? onlyInquiryReady[0] : undefined)

  if (provider === undefined) {
    return { kind: 'choose_provider', providers }
  }

  if (provider.inquiryUrl === undefined) {
    return { kind: 'provider_unavailable', provider, providers: [provider] }
  }

  return { kind: 'resolved', provider, providers: [provider] }
}

export function buildInquiryHandoffOneLine(resolution: InquiryHandoffResolution): string {
  switch (resolution.kind) {
    case 'resolved':
      return `Ready to send a request to ${resolution.provider.name}.`
    case 'provider_unavailable':
      return `${resolution.provider.name} does not have a request form here yet.`
    case 'choose_provider':
      return 'Choose a business to contact.'
    case 'no_provider':
      return 'Find a business that can help before sending a request.'
  }
}

export function buildInquiryHandoffSummary(resolution: InquiryHandoffResolution): string {
  switch (resolution.kind) {
    case 'resolved':
      return [
        `${resolution.provider.name} offers a way to send a request for business review.`,
        'I can send your request that way. The business reviews it and decides whether to accept it; timing, price, and availability are not confirmed yet.',
      ].join(' ')
    case 'provider_unavailable':
      return [
        `The published page for ${resolution.provider.name} remains available for review.`,
        'This business does not have a request form here yet.',
        'Use the published details and confirm timing, price, and availability with the business.',
      ].join(' ')
    case 'choose_provider':
      return [
        'I can send a request when a business offers that option.',
        'Name the business you want to contact, or use the request option from the businesses in this answer.',
        'A submitted request goes to the business for review; timing, price, and availability are not confirmed yet.',
      ].join(' ')
    case 'no_provider':
      return [
        'No business is in this answer yet.',
        'Search for what you need and where, then send a request to a business that can help.',
      ].join(' ')
  }
}

export function buildInquiryHandoffNextStep(resolution: InquiryHandoffResolution): string {
  switch (resolution.kind) {
    case 'resolved':
      return `Open ${resolution.provider.name}'s request form, describe what you need, and send it for the business to review.`
    case 'provider_unavailable':
      return `Open ${resolution.provider.name}'s page and use the contact details they provide.`
    case 'choose_provider':
      return 'Choose a business from this answer, then use its request option, or tell me which business you want to contact.'
    case 'no_provider':
      return 'Search for what you need and where, then choose a business that offers a way to send a request—or review a business’s contact details.'
  }
}

export function inquiryHandoffProviders(resolution: InquiryHandoffResolution): readonly AnswerSource[] {
  return resolution.providers
}

function selectProviderFromQuery(query: string, providers: readonly AnswerSource[]): AnswerSource | undefined {
  const normalized = normalize(query)
  const index = ordinalIndex(normalized)
  if (index !== undefined && providers[index] !== undefined) {
    return providers[index]
  }

  return providers.find((provider) => queryNamesProvider(normalized, provider))
}

function queryNamesProvider(normalizedQuery: string, provider: AnswerSource): boolean {
  const normalizedName = normalize(provider.name)
  if (normalizedName.length > 0 && normalizedQuery.includes(normalizedName)) {
    return true
  }

  const slugWords = provider.slug.split(/[-_]+/).filter((word) => word.length > 2)
  if (slugWords.length === 0) {
    return false
  }
  return slugWords.every((word) => normalizedQuery.includes(word.toLowerCase()))
}

function ordinalIndex(normalizedQuery: string): number | undefined {
  if (/\b(?:first|top|1st|number one|listing one|provider one|#1)\b/.test(normalizedQuery)) {
    return 0
  }
  if (/\b(?:second|2nd|number two|listing two|provider two|#2)\b/.test(normalizedQuery)) {
    return 1
  }
  if (/\b(?:third|3rd|number three|listing three|provider three|#3)\b/.test(normalizedQuery)) {
    return 2
  }
  return undefined
}

function asksForInquiry(query: string): boolean {
  return /\b(?:prepare|open|send|submit|start)\b.*\binquir/i.test(query)
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
