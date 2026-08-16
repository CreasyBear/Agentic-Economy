import { describe, expect, it } from 'vitest'

import { buildFollowUpComposerCopy } from '@/components/ae/chat/composer-copy'
import type { AnswerSource } from '@/modules/answer/public'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'

describe('chat composer loop copy', () => {
  it('does not narrate routine live work below the composer', () => {
    expect(buildFollowUpComposerCopy([], 'refine_search')).toEqual({
      placeholder: 'Checking what\'s available',
      loopHint: '',
    })
    expect(buildFollowUpComposerCopy([turn()], 'compare_known')).toEqual({
      placeholder: 'Comparing options from this chat',
      loopHint: '',
    })
  })

  it('uses a settled follow-up placeholder without redundant guidance', () => {
    expect(buildFollowUpComposerCopy([turn()], null)).toEqual({
      placeholder: 'Ask a follow-up',
      loopHint: '',
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
      placeholder: 'Ask a follow-up',
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
      placeholder: 'Ask a follow-up',
      loopHint: '',
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
      placeholder: 'Ask a follow-up',
      loopHint: '',
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
      placeholder: 'Ask a follow-up',
      loopHint: 'This business does not have a request form yet. Review its page before contacting it.',
    })
  })

  it('uses a different-question recovery when no matches are available', () => {
    expect(buildFollowUpComposerCopy([
      turn({
        artifacts: [],
        oneLine: 'No matching businesses were found.',
        layoutProfile: 'empty_state',
      }),
    ], null)).toEqual({
      placeholder: 'Try a different question',
      loopHint: '',
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
