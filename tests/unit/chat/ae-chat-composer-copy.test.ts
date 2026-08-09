import { describe, expect, it } from 'vitest'

import { buildFollowUpComposerCopy } from '@/components/ae/chat/composer-copy'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'

describe('chat composer loop copy', () => {
  it('labels first live searches as a checked discovery loop', () => {
    expect(buildFollowUpComposerCopy([], 'refine_search')).toEqual({
      placeholder: 'Checking what\'s available',
      loopHint: 'Checking what\'s available before any contact step.',
    })
  })

  it('labels live refinement after saved turns as a thread-aware search', () => {
    expect(buildFollowUpComposerCopy([turn()], 'refine_search')).toEqual({
      placeholder: 'Checking what is available again with this thread in mind',
      loopHint: 'Checking what\'s available before any contact step.',
    })
  })

  it('makes live compare and inquiry handoff state explicit', () => {
    expect(buildFollowUpComposerCopy([turn()], 'compare_known')).toEqual({
      placeholder: 'Comparing options from this thread',
      loopHint: 'Comparing details from the businesses already found.',
    })

    expect(buildFollowUpComposerCopy([turn()], 'inquiry_handoff')).toEqual({
      placeholder: 'Preparing a request to the business',
      loopHint: 'Carrying the selected business into a request. It still confirms timing, quote, and availability.',
    })
  })

  it('keeps saved thread guidance when no turn is streaming', () => {
    expect(buildFollowUpComposerCopy([turn()], null)).toEqual({
      placeholder: 'Narrow, compare, or ask the business',
      loopHint: 'Narrow or compare the matches, then ask the business when one fits.',
    })
  })

  it('uses neutral follow-up copy after a data answer', () => {
    expect(buildFollowUpComposerCopy([
      turn({
        query: 'What is the current bitcoin price?',
        artifacts: [{ kind: 'one-line', text: 'Bitcoin is trading at $65,041 USD.' }],
        oneLine: 'Bitcoin is trading at $65,041 USD.',
        layoutProfile: 'data_answer',
      }),
    ], null)).toEqual({
      placeholder: 'Ask a follow-up or try another live data lookup',
      loopHint: '',
    })
  })

  it('keeps an active selected provider through a boundary-only answer', () => {
    expect(buildFollowUpComposerCopy([
      turn({
        intent: 'inquiry_handoff',
        artifacts: [{ kind: 'selected-provider', provider: provider() }],
        oneLine: "Ready to open Demo Plumber's qualified inquiry form.",
      }),
      turn({
        seq: 2,
        query: 'Can AE book this for me?',
        intent: 'explain_boundary',
        artifacts: [{ kind: 'one-line', text: 'AE cannot book, charge, or dispatch.' }],
        oneLine: 'AE cannot book, charge, or dispatch.',
      }),
    ], null)).toEqual({
      placeholder: 'Ask limits, refine, or continue with the selected business',
      loopHint: 'That business stays in context. It confirms timing, quote, and availability.',
    })
  })

  it('clears older selected-provider guidance after a later provider answer', () => {
    expect(buildFollowUpComposerCopy([
      turn({
        intent: 'inquiry_handoff',
        artifacts: [
          {
            kind: 'selected-provider',
            provider: provider({ name: 'Northside Plumbing', slug: 'northside-plumbing' }),
          },
        ],
        oneLine: 'Northside Plumbing is selected for inquiry review.',
      }),
      turn({
        seq: 2,
        query: 'Show plumbing in Parramatta',
        intent: 'refine_search',
        artifacts: [{ kind: 'provider-cards', providers: [provider()] }],
        oneLine: 'One listed business matches.',
      }),
    ], null)).toEqual({
      placeholder: 'Narrow, compare, or ask the business',
      loopHint: 'Narrow or compare the matches, then ask the business when one fits.',
    })
  })

  it('does not call a selected review-only listing inquiry-ready', () => {
    expect(buildFollowUpComposerCopy([
      turn({
        intent: 'inquiry_handoff',
        artifacts: [{ kind: 'selected-provider', provider: provider({ inquiryUrl: '' }) }],
        oneLine: 'This business needs listing review first.',
      }),
    ], null)).toEqual({
      placeholder: 'Ask limits, refine, or review the selected business',
      loopHint: 'This business does not have a request form yet. Review its page before contacting it.',
    })
  })
})

function turn(overrides: Partial<PublicThreadTurn> = {}): PublicThreadTurn {
  return {
    turnId: `turn-${overrides.seq ?? 1}`,
    seq: 1,
    query: 'plumbers in Perth',
    intent: 'refine_search',
    status: 'complete',
    workLog: [],
    artifacts: [{ kind: 'provider-cards', providers: [provider()] }],
    oneLine: 'One listed business matches.',
    ...overrides,
  }
}

function provider(overrides: Partial<AnswerSource> = {}): AnswerSource {
  return {
    citationIndex: 1,
    slug: 'demo-plumber',
    name: 'Demo Plumber',
    category: 'Plumber',
    suburb: 'Perth',
    stateTerritory: 'WA',
    serviceArea: 'Perth',
    hoursLabel: 'Hours supplied',
    availabilityLabel: 'Published',
    trustLabel: 'Checked',
    responseTimeLabel: '',
    trustCue: 'Checked',
    nextStepLabel: 'Send inquiry',
    detailUrl: '/demo-plumber',
    inquiryUrl: '/demo-plumber/inquiry',
    services: [],
    ...overrides,
  }
}
