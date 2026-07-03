import type { AnswerSynthesizerFollowUpIntent } from '../answer-synthesizer'
import type { AnswerSource } from '../answer-synthesizer'
import { parseNarrowToSuburb } from '@/modules/common/narrow-to-chip'

export function shouldUseCompactFollowUpLayout(input: {
  compactFollowUp?: boolean
  followUpIntent?: AnswerSynthesizerFollowUpIntent
  prefetchedProviders?: readonly AnswerSource[]
}): boolean {
  if (input.compactFollowUp !== true) {
    return false
  }

  if (input.followUpIntent === 'explain_boundary' || input.followUpIntent === 'unsupported') {
    return true
  }

  return input.prefetchedProviders !== undefined
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
        oneLine: buildFilterOneLine(count),
        summary: boundaryLine(),
        nextStep: buildInquiryNextStep(input.providers),
      }
    case 'compare_known':
      return {
        oneLine: count >= 2 ? 'Comparing the top two listings.' : buildDefaultOneLine(count, input.displayQuery),
        summary: buildCompareSummary(input.providers),
        nextStep: buildInquiryNextStep(input.providers),
      }
    case 'inquiry_handoff':
      return {
        oneLine: count === 1 && input.providers[0] !== undefined
          ? `Ready to send a qualified inquiry to ${input.providers[0].name}.`
          : 'Choose which listed business to message.',
        summary: boundaryLine(),
        nextStep: buildInquiryNextStep(input.providers),
      }
    case 'explain_boundary':
    case 'unsupported':
      return {
        oneLine: input.followUpIntent === 'explain_boundary'
          ? 'Agentic Economy reads and compares published listings. It does not book, charge, or dispatch.'
          : 'Agentic Economy cannot book, charge, or dispatch on your behalf.',
        summary: boundaryLine(),
        nextStep: buildInquiryNextStep(input.providers),
      }
    default: {
      const suburb = parseNarrowToSuburb(input.displayQuery)
      if (suburb !== undefined) {
        return {
          oneLine: buildNarrowOneLine(count, suburb),
          summary: boundaryLine(),
          nextStep: buildInquiryNextStep(input.providers),
        }
      }

      return {
        oneLine: buildDefaultOneLine(count, input.displayQuery),
        summary: boundaryLine(),
        nextStep: buildInquiryNextStep(input.providers),
      }
    }
  }
}

function buildNarrowOneLine(count: number, suburb: string): string {
  if (count === 0) {
    return `No listed businesses in ${suburb} yet.`
  }
  if (count === 1) {
    return `1 listed in ${suburb}.`
  }
  return `${count} listed in ${suburb}.`
}

function buildFilterOneLine(count: number): string {
  if (count === 0) {
    return 'None of the listed businesses accept inquiries yet.'
  }
  if (count === 1) {
    return '1 listed business accepts inquiries.'
  }
  return `${count} listed businesses accept inquiries.`
}

function buildDefaultOneLine(count: number, query: string): string {
  if (count === 0) {
    return `No listed businesses match "${query}" yet.`
  }
  if (count === 1) {
    return `1 listed business matches.`
  }
  return `${count} listed businesses match.`
}

function buildCompareSummary(providers: readonly AnswerSource[]): string {
  const first = providers[0]
  const second = providers[1]
  if (first === undefined || second === undefined) {
    return boundaryLine()
  }

  return [
    `${first.name} works around ${first.serviceArea || first.suburb}. ${second.name} works around ${second.serviceArea || second.suburb}.`,
    boundaryLine(),
  ].join(' ')
}

function buildInquiryNextStep(providers: readonly AnswerSource[]): string {
  const inquiryReady = providers.find((provider) => provider.inquiryUrl !== undefined)
  if (inquiryReady !== undefined) {
    return 'Open a listed provider page and send an inquiry when that option is published. Agentic Economy does not book or take payment on this page.'
  }

  return 'Open a listed provider page to review what they publish, then contact the business. Agentic Economy does not book or take payment on this page.'
}

function boundaryLine(): string {
  return 'The business handles timing, price, and availability. Agentic Economy does not book or take payment on this page.'
}
