import type { AnswerSynthesizerFollowUpIntent } from '../answer-synthesizer'
import type { AnswerSource } from '../answer-synthesizer'
import { parseNarrowToSuburb } from '@/modules/common/narrow-to-chip'

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
        oneLine: count >= 2 ? 'Comparing the top two listings.' : buildDefaultOneLine(count, input.displayQuery, input.providers),
        summary: buildCompareSummary(input.providers),
        nextStep: buildInquiryNextStep(input.providers),
      }
    case 'inquiry_handoff':
      return {
        oneLine: count === 1 && input.providers[0] !== undefined
          ? `Ready to open ${input.providers[0].name}'s qualified inquiry form. ${buildProviderDecisionOneLine(input.providers[0])}`
          : 'Choose which listed business to message.',
        summary: resultsLine(input.providers),
        nextStep: buildInquiryNextStep(input.providers),
      }
    case 'explain_boundary':
    case 'unsupported':
      return {
        oneLine: input.followUpIntent === 'explain_boundary'
          ? 'Agentic Economy reads and compares published listings. The business confirms what happens next.'
          : 'This request needs a business-supported action that is not available here.',
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
    return `No listed businesses in ${suburb} yet.`
  }
  if (count === 1 && providers[0] !== undefined) {
    return buildProviderDecisionOneLine(providers[0])
  }
  return `${count} listed in ${suburb}.`
}

function buildFilterOneLine(count: number, providers: readonly AnswerSource[]): string {
  if (count === 0) {
    return 'None of the listed businesses accept inquiries yet.'
  }
  if (count === 1 && providers[0] !== undefined) {
    return `1 listed business accepts inquiries: ${buildProviderDecisionOneLine(providers[0])}`
  }
  return `${count} listed businesses accept inquiries.`
}

function buildDefaultOneLine(count: number, query: string, providers: readonly AnswerSource[]): string {
  if (count === 0) {
    return `No listed businesses match "${query}" yet.`
  }
  if (count === 1 && providers[0] !== undefined) {
    return buildProviderDecisionOneLine(providers[0])
  }
  return `${count} listed businesses match.`
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

  return `${first.name} works around ${first.serviceArea || first.suburb}. ${second.name} works around ${second.serviceArea || second.suburb}.`
}

function buildInquiryNextStep(providers: readonly AnswerSource[]): string {
  const inquiryReady = providers.find((provider) => provider.inquiryUrl !== undefined)
  if (inquiryReady !== undefined) {
    return 'Open a listed business page and send an inquiry when that option is published.'
  }

  return 'Open a listed business page to review what they publish, then contact the business.'
}

/**
 * The summary describes the results in front of the reader.
 *
 * It used to append a standing caveat about what the business confirms later,
 * on every answer, regardless of what was being answered. That told the reader
 * nothing about these results and made every reply read like a disclaimer.
 */
function resultsLine(providers: readonly AnswerSource[]): string {
  if (providers.length === 0) {
    return 'Try a different service or area.'
  }

  return 'Each card shows the published services, the service area, and how to get started.'
}
