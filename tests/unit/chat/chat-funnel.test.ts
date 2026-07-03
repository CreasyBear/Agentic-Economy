import { describe, expect, it } from 'vitest'

import {
  buildChatCompleteFunnelEvents,
  buildChatSubmitFunnelEvents,
} from '@/components/ae/chat/chat-funnel'

describe('chat funnel events', () => {
  it('records the first query as the start of an answer journey', () => {
    expect(buildChatSubmitFunnelEvents({ query: 'plumber Parramatta', completedTurnCount: 0 })).toEqual([
      {
        eventType: 'answer_query_started',
        payload: {
          queryLength: 18,
          priorTurnCount: 0,
          followUpIntent: 'refine_search',
        },
      },
    ])
  })

  it('records normal follow-ups separately from first queries', () => {
    expect(buildChatSubmitFunnelEvents({ query: 'Compare the top two', completedTurnCount: 1 })).toEqual([
      {
        eventType: 'answer_follow_up_submitted',
        payload: {
          queryLength: 19,
          priorTurnCount: 1,
          followUpIntent: 'compare_known',
        },
      },
    ])
  })

  it('records provider selection and inquiry attempt for handoff-shaped follow-ups', () => {
    expect(buildChatSubmitFunnelEvents({ query: 'message the first one', completedTurnCount: 1 }).map((event) => event.eventType)).toEqual([
      'answer_follow_up_submitted',
      'answer_provider_selected',
      'inquiry_attempted',
    ])
  })

  it('records registry search completion only for completed search-shaped turns', () => {
    expect(buildChatCompleteFunnelEvents({ query: 'plumber Parramatta', completedTurnCount: 0, outcome: 'complete' })).toEqual([
      {
        eventType: 'answer_registry_searched',
        payload: {
          queryLength: 18,
          priorTurnCount: 0,
          followUpIntent: 'refine_search',
        },
      },
    ])
    expect(buildChatCompleteFunnelEvents({ query: 'message the first one', completedTurnCount: 1, outcome: 'complete' })).toEqual([])
    expect(buildChatCompleteFunnelEvents({ query: 'plumber Parramatta', completedTurnCount: 0, outcome: 'error' })).toEqual([])
  })
})
