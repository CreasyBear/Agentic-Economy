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
      return `Ready to open ${resolution.provider.name}'s qualified inquiry form.`
    case 'provider_unavailable':
      return `${resolution.provider.name} does not publish an AE inquiry form yet.`
    case 'choose_provider':
      return 'Choose which listed business to message.'
    case 'no_provider':
      return 'Find a listed business before opening a qualified inquiry form.'
  }
}

export function buildInquiryHandoffSummary(resolution: InquiryHandoffResolution): string {
  switch (resolution.kind) {
    case 'resolved':
      return [
        `${resolution.provider.name} publishes an inquiry path for owner review.`,
        'AE can route you to that form. The business reviews the request and decides whether to accept it; timing, quote, and availability are not confirmed yet.',
      ].join(' ')
    case 'provider_unavailable':
      return [
        `The published page for ${resolution.provider.name} remains available for review.`,
        'This listing does not publish an AE inquiry form yet.',
        'Use the published details and confirm timing, quote, and availability with the business.',
      ].join(' ')
    case 'choose_provider':
      return [
        'AE can route you to a qualified inquiry form when a listed business publishes one.',
        'Name the business you want to contact, or use Open inquiry form from the listed businesses in this answer.',
        'A submitted inquiry goes to the business for review; timing, quote, and availability are not confirmed yet.',
      ].join(' ')
    case 'no_provider':
      return [
        'No listed business is in this thread yet.',
        'Search a service and area, or carry a short brief to a provider before opening an inquiry.',
      ].join(' ')
  }
}

export function buildInquiryHandoffNextStep(resolution: InquiryHandoffResolution): string {
  switch (resolution.kind) {
    case 'resolved':
      return `Open ${resolution.provider.name}'s inquiry form, describe the job, and submit it for owner review.`
    case 'provider_unavailable':
      return `Open ${resolution.provider.name}'s listing and use the published contact guidance.`
    case 'choose_provider':
      return 'Use Open inquiry form from the listed businesses in this answer, or name the business you want to contact.'
    case 'no_provider':
      return 'Search nearby, then choose a listed business that publishes an inquiry path—or review a provider and use its published contact guidance.'
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
