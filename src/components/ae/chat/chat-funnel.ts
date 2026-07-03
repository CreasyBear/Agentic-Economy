import type { FunnelEventType } from '@/modules/observability/public'
import { classifyFollowUpIntent } from '@/modules/answer-thread/public'
import type { FollowUpIntent } from '@/modules/answer-thread/public'

export type ChatFunnelEvent = {
  eventType: FunnelEventType
  payload: Record<string, string | number | boolean | null>
}

export function buildChatSubmitFunnelEvents(input: {
  query: string
  completedTurnCount: number
}): ChatFunnelEvent[] {
  const intent = classifyFollowUpIntent(input.query, input.completedTurnCount)
  const basePayload = chatFunnelPayload(input.query, input.completedTurnCount, intent)

  const events: ChatFunnelEvent[] = [
    {
      eventType: input.completedTurnCount === 0 ? 'answer_query_started' : 'answer_follow_up_submitted',
      payload: basePayload,
    },
  ]

  if (intent === 'inquiry_handoff') {
    events.push(
      { eventType: 'answer_provider_selected', payload: basePayload },
      { eventType: 'inquiry_attempted', payload: basePayload },
    )
  }

  return events
}

export function buildChatCompleteFunnelEvents(input: {
  query: string
  completedTurnCount: number
  outcome: 'complete' | 'error' | 'stopped' | 'rate_limited'
}): ChatFunnelEvent[] {
  if (input.outcome !== 'complete') {
    return []
  }

  const intent = classifyFollowUpIntent(input.query, input.completedTurnCount)
  if (intent !== 'refine_search') {
    return []
  }

  return [
    {
      eventType: 'answer_registry_searched',
      payload: chatFunnelPayload(input.query, input.completedTurnCount, intent),
    },
  ]
}

function chatFunnelPayload(
  query: string,
  completedTurnCount: number,
  intent: FollowUpIntent,
): Record<string, string | number | boolean | null> {
  return {
    queryLength: query.length,
    priorTurnCount: completedTurnCount,
    followUpIntent: intent,
  }
}
