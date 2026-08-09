import type { AnswerSynthesizerFollowUpIntent } from '../answer-synthesizer'
import type { AnswerSource } from '../answer-synthesizer'
import { parseNarrowToSuburb } from '@/modules/common/narrow-to-chip'
import { buildBoundaryOneLine } from './boundary-prose'

export function buildRationaleFollowUpProse(input: {
  constraints: readonly string[]
  budget?: string
  failure?: string
}): { oneLine: string; summary: string; nextStep: string } {
  const facts = [
    input.constraints.length > 0
      ? `Retained constraints: ${input.constraints.join('; ')}.`
      : 'Retained constraints: none were recorded.',
    input.budget ?? 'Budget: no explicit budget was retained.',
    input.failure === undefined
      ? 'Durable failure evidence: no failed search step was recorded.'
      : `Durable failure evidence: ${input.failure}.`,
  ]
  return {
    oneLine: 'Here is what the earlier search retained.',
    summary: facts.join(' '),
    nextStep: 'Revise a constraint or add a location, then search again.',
  }
}

export function buildCompactFollowUpProse(input: {
  followUpIntent?: AnswerSynthesizerFollowUpIntent
  displayQuery: string
  providers: readonly AnswerSource[]
}): { oneLine: string; summary: string; nextStep: string } {
  const count = input.providers.length

  switch (input.followUpIntent) {
    case 'filter_known':
      return {
        oneLine: buildFilterOneLine(count, input.providers),
        summary: resultsLine(input.providers),
        nextStep: buildInquiryNextStep(input.providers),
      }
    case 'compare_known':
      return {
        oneLine: count >= 2 ? 'Comparing the top two matches.' : buildDefaultOneLine(count, input.displayQuery, input.providers),
        summary: buildCompareSummary(input.providers),
        nextStep: buildInquiryNextStep(input.providers),
      }
    case 'inquiry_handoff': {
      const provider = count === 1 && input.providers[0] !== undefined && hasProviderIdentity(input.providers[0])
        ? input.providers[0]
        : undefined
      const oneLine = provider === undefined
        ? 'No business is selected yet. Search again before sending a request.'
        : provider.inquiryUrl === undefined
          ? `${provider.name} does not have a request form here yet.`
          : `Ready to send a request to ${provider.name}. ${buildProviderDecisionOneLine(provider)}`
      return {
        oneLine,
        summary: resultsLine(input.providers),
        nextStep: buildInquiryNextStep(input.providers),
      }
    }
    case 'explain_boundary':
    case 'unsupported':
      return {
        oneLine: input.followUpIntent === 'explain_boundary'
          ? buildBoundaryOneLine()
          : 'This kind of request is not available here; the business would need to handle it directly.',
        summary: resultsLine(input.providers),
        nextStep: buildInquiryNextStep(input.providers),
      }
    default: {
      const suburb = parseNarrowToSuburb(input.displayQuery)
      if (suburb !== undefined) {
        return {
          oneLine: buildNarrowOneLine(count, suburb, input.providers),
          summary: resultsLine(input.providers),
          nextStep: buildInquiryNextStep(input.providers),
        }
      }

      return {
        oneLine: buildDefaultOneLine(count, input.displayQuery, input.providers),
        summary: resultsLine(input.providers),
        nextStep: buildInquiryNextStep(input.providers),
      }
    }
  }
}

function buildNarrowOneLine(count: number, suburb: string, providers: readonly AnswerSource[]): string {
  if (count === 0) {
    return `No matches found in ${suburb} yet.`
  }
  if (count === 1 && providers[0] !== undefined) {
    return buildProviderDecisionOneLine(providers[0])
  }
  return `${count} matches in ${suburb}.`
}

function buildFilterOneLine(count: number, providers: readonly AnswerSource[]): string {
  if (count === 0) {
    return 'No businesses accept requests yet.'
  }
  if (count === 1 && providers[0] !== undefined) {
    return `1 business accepts requests: ${buildProviderDecisionOneLine(providers[0])}`
  }
  return `${count} businesses accept requests.`
}

function buildDefaultOneLine(count: number, query: string, providers: readonly AnswerSource[]): string {
  if (count === 0) {
    return `No businesses match "${query}" yet.`
  }
  if (count === 1 && providers[0] !== undefined) {
    return buildProviderDecisionOneLine(providers[0])
  }
  return `${count} businesses match.`
}

export function buildProviderDecisionOneLine(provider: AnswerSource): string {
  const suburb = provider.suburb.trim()
  const price = provider.pricingSummary?.trim()
  const availability = provider.availabilitySummary?.trim()
  const details = [
    suburb.length === 0 ? undefined : `in ${suburb}`,
    price === undefined || price.length === 0 ? undefined : `Price: ${price}`,
    availability === undefined || availability.length === 0 ? undefined : `Published availability: ${availability}`,
  ].filter((detail): detail is string => detail !== undefined)
  return details.length === 0
    ? `${provider.name}.`
    : `${provider.name} — ${details.join(' · ')}.`
}

function buildCompareSummary(providers: readonly AnswerSource[]): string {
  const first = providers[0]
  const second = providers[1]
  if (first === undefined || second === undefined) {
    return resultsLine(providers)
  }

  return `${first.name} serves ${first.serviceArea || first.suburb}. ${second.name} serves ${second.serviceArea || second.suburb}.`
}

function buildInquiryNextStep(providers: readonly AnswerSource[]): string {
  if (providers.length === 0) {
    return 'Search again or revise a constraint to find a match.'
  }

  const inquiryReady = providers.find((provider) => provider.inquiryUrl !== undefined)
  if (inquiryReady !== undefined) {
    return 'Open the business page and send a request when that option is available.'
  }

  return 'Review the business details and search again if you need a request option.'
}

function hasProviderIdentity(provider: AnswerSource | undefined): provider is AnswerSource {
  return provider !== undefined && provider.slug.trim().length > 0 && provider.name.trim().length > 0
}

/**
 * The summary describes the results in front of the reader.
 * It used to append the same boundary disclaimer to every answer, regardless
 * of what was being answered. That told the reader nothing about these results
 * and made every reply read like a disclaimer.
 */
function resultsLine(providers: readonly AnswerSource[]): string {
  if (providers.length === 0) {
    return 'Try describing what you need or choose another area.'
  }

  return 'Each card shows what the business offers, where it serves, and how to get in touch.'
}
