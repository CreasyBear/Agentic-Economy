import { neutralizeBidiFormattingControls } from '@/modules/answer/projection'
import type { FollowUpIntent } from '@/modules/answer-thread/public'
import { isNarrowToChipQuery, parseNarrowToSuburb } from '@/modules/common/narrow-to-chip'
import { isRecord } from '@/modules/common/is-record'

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
  const query = neutralizeBidiFormattingControls(input.query)
  if (query.startsWith('{"operationRef"')) {
    try {
      const selection: unknown = JSON.parse(query)
      if (isRecord(selection) && typeof selection.operationRef === 'string' && isRecord(selection.input)) {
        return { text: '→ Run selected operation', role: 'follow-up' }
      }
    } catch {
      return { text: '→ Invalid operation input', role: 'follow-up' }
    }
  }
  if (input.seq <= 1) {
    return { text: query, role: 'need' }
  }

  const suburb = parseNarrowToSuburb(query)
  if (suburb !== undefined) {
    return { text: `→ ${suburb}`, role: 'follow-up' }
  }

  if (/^show only businesses that accept inquiries$/i.test(query.trim())) {
    return { text: '→ Inquiry-ready listings', role: 'follow-up' }
  }

  if (/^compare the top two$/i.test(query.trim())) {
    return { text: '→ Compare the top two', role: 'follow-up' }
  }


  if (input.intent === 'explain_boundary' || input.intent === 'unsupported') {
    return { text: query, role: 'follow-up' }
  }

  if (isNarrowToChipQuery(query)) {
    return { text: query, role: 'follow-up' }
  }

  return { text: query, role: 'follow-up' }
}
