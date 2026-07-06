import type { AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection } from '@/modules/answer-thread/public'
import { activeSelectedProviderForTurns, providerHasInquiryPath } from './session-provider-context'

export type FollowUpComposerCopy = {
  placeholder: string
  loopHint: string
}

export function buildFollowUpComposerCopy(
  completedTurns: readonly NonNullable<PublicThreadProjection>['turns'][number][],
  liveIntent: FollowUpIntent | null = null,
): FollowUpComposerCopy | null {
  if (liveIntent !== null) {
    return buildLiveComposerCopy(liveIntent, completedTurns.length)
  }

  if (completedTurns.length === 0) {
    return null
  }

  const state = readComposerContext(completedTurns)
  if (state.selectedProvider !== undefined) {
    return providerHasInquiryPath(state.selectedProvider)
      ? {
          placeholder: 'Ask limits, refine, or continue with the selected business',
          loopHint: 'AE keeps that business in context for qualified inquiry review. The business still confirms timing, quote, and availability.',
        }
      : {
          placeholder: 'Ask limits, refine, or review the selected listing',
          loopHint: 'This business needs a published inquiry path before AE can route contact.',
        }
  }

  if (state.hasInquiryReadyProvider) {
    return {
      placeholder: 'Narrow, compare, or prepare a qualified inquiry',
      loopHint: 'Continue by narrowing or comparing the listed businesses, then prepare a qualified inquiry when one fits.',
    }
  }

  if (state.hasListedProvider) {
    return {
      placeholder: 'Narrow, compare, or ask for the contact step',
      loopHint: 'These listings need a published inquiry path before AE can route contact.',
    }
  }

  return {
    placeholder: 'Refine the search or ask what AE can safely do',
    loopHint: 'AE needs a listed business before it can compare options or route a qualified inquiry.',
  }
}

function buildLiveComposerCopy(intent: FollowUpIntent, completedTurnCount: number): FollowUpComposerCopy {
  switch (intent) {
    case 'filter_known':
      return {
        placeholder: 'Filtering the listed businesses from this thread',
        loopHint: 'AE is narrowing the known businesses before any contact step.',
      }
    case 'compare_known':
      return {
        placeholder: 'Comparing the listed businesses from this thread',
        loopHint: 'AE is comparing published details from the businesses already found.',
      }
    case 'inquiry_handoff':
      return {
        placeholder: 'Preparing the qualified inquiry next step',
        loopHint: 'AE is carrying the selected business into inquiry review. The business still confirms timing, quote, and availability.',
      }
    case 'explain_boundary':
      return {
        placeholder: "Checking AE's inquiry-only limits",
        loopHint: 'AE will route back to published listings when a request exceeds read, compare, or qualified inquiry.',
      }
    case 'unsupported':
      return {
        placeholder: 'Routing back to published listings',
        loopHint: 'AE does not book, charge, or dispatch; it reads, compares, and routes qualified inquiries.',
      }
    case 'refine_search':
      return {
        placeholder: completedTurnCount > 0 ? 'Searching again with this thread in mind' : 'Checking published business details',
        loopHint: 'AE is checking published business details before any contact step.',
      }
  }
}

function readComposerContext(
  completedTurns: readonly NonNullable<PublicThreadProjection>['turns'][number][],
): {
  hasListedProvider: boolean
  hasInquiryReadyProvider: boolean
  selectedProvider: AnswerSource | undefined
} {
  let hasListedProvider = false
  let hasInquiryReadyProvider = false
  const selectedProvider = activeSelectedProviderForTurns(completedTurns)

  for (const turn of completedTurns) {
    for (const artifact of turn.artifacts) {
      switch (artifact.kind) {
        case 'selected-provider':
          hasListedProvider = true
          if (hasPublishedInquiryPath(artifact.provider)) {
            hasInquiryReadyProvider = true
          }
          break
        case 'provider-cards':
        case 'provider-compare-table':
          if (artifact.providers.length > 0) {
            hasListedProvider = true
          }
          if (artifact.providers.some(hasPublishedInquiryPath)) {
            hasInquiryReadyProvider = true
          }
          break
        default:
          break
      }
    }
  }

  return { hasListedProvider, hasInquiryReadyProvider, selectedProvider }
}

function hasPublishedInquiryPath(provider: { inquiryUrl?: string }): boolean {
  return provider.inquiryUrl !== undefined && provider.inquiryUrl.length > 0
}
