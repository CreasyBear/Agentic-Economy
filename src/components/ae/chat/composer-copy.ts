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
  if (completedTurns.at(-1)?.layoutProfile === 'data_answer') {
    return {
      placeholder: 'Ask a follow-up',
      loopHint: '',
    }
  }

  const state = readComposerContext(completedTurns)
  if (state.selectedProvider !== undefined) {
    return providerHasInquiryPath(state.selectedProvider)
      ? {
          placeholder: 'Ask a follow-up',
          loopHint: '',
        }
      : {
          placeholder: 'Ask a follow-up',
          loopHint: 'This business does not have a request form yet. Review its page before contacting it.',
        }
  }

  if (state.hasInquiryReadyProvider) {
    return {
      placeholder: 'Ask a follow-up',
      loopHint: '',
    }
  }

  if (state.hasListedProvider) {
    return {
      placeholder: 'Ask a follow-up',
      loopHint: 'These options do not have a request form yet.',
    }
  }

  return {
    placeholder: 'Try a different question',
    loopHint: '',
  }
}

function buildLiveComposerCopy(intent: FollowUpIntent, completedTurnCount: number): FollowUpComposerCopy {
  switch (intent) {
    case 'filter_known':
      return {
        placeholder: 'Narrowing matches from this chat',
        loopHint: '',
      }
    case 'compare_known':
      return {
        placeholder: 'Comparing options from this chat',
        loopHint: '',
      }
    case 'inquiry_handoff':
      return {
        placeholder: 'Preparing a request to the business',
        loopHint: 'The business still confirms timing, quote, and availability.',
      }
    case 'explain_boundary':
      return {
        placeholder: 'Checking what can happen next',
        loopHint: '',
      }
    case 'unsupported':
      return {
        placeholder: 'Finding another way forward',
        loopHint: '',
      }
    case 'refine_search':
      return {
        placeholder: completedTurnCount > 0 ? 'Checking what is available again' : "Checking what's available",
        loopHint: '',
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
