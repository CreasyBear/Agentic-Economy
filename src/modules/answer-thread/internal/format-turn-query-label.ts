import type { FollowUpIntent } from '@/modules/answer-thread/public'
import { isNarrowToChipQuery, parseNarrowToSuburb } from '@/modules/common/narrow-to-chip'

export type TurnQueryLabelRole = 'need' | 'follow-up'

export type TurnQueryLabel = {
  text: string
  role: TurnQueryLabelRole
}

export function formatTurnQueryLabel(input: {
  query: string
  intent: FollowUpIntent
  seq: number
}): TurnQueryLabel {
  if (input.seq <= 1) {
    return { text: input.query, role: 'need' }
  }

  const suburb = parseNarrowToSuburb(input.query)
  if (suburb !== undefined) {
    return { text: `→ ${suburb}`, role: 'follow-up' }
  }

  if (/^show only businesses that accept inquiries$/i.test(input.query.trim())) {
    return { text: '→ Inquiries only', role: 'follow-up' }
  }

  if (/^compare the top two$/i.test(input.query.trim())) {
    return { text: '→ Compare top two', role: 'follow-up' }
  }

  if (/^what can agentic economy do here\??$/i.test(input.query.trim())) {
    return { text: '→ What AE can do', role: 'follow-up' }
  }

  if (input.intent === 'explain_boundary' || input.intent === 'unsupported') {
    return { text: input.query, role: 'follow-up' }
  }

  if (isNarrowToChipQuery(input.query)) {
    return { text: input.query, role: 'follow-up' }
  }

  return { text: input.query, role: 'follow-up' }
}
