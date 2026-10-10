import { isPublicToolRef } from '@/modules/common/tool-ref'
import type { ChatToolId, ToolCardProjection, ToolChoiceRow } from './tool-card'

export type ChatChoiceAction = Readonly<{
  choice: ToolChoiceRow
  toolId: ChatToolId
  reviewInputs: boolean
  compare: boolean
}>

/**
 * Requires validated card projections in transcript order. Ensures at most four
 * unique current choices: the latest shortlist replaces broad results; latest
 * explicit details take priority, including over later broad reads.
 * Review only opens canonical input review; fresh detail and authority still
 * gate a Call. Listing-ref and unavailable rows cannot acquire review eligibility.
 * Empty/non-choice input returns no actions; inputs are never mutated.
 */
export function projectChatChoiceActions(cards: readonly ToolCardProjection[]): readonly ChatChoiceAction[] {
  const details = new Map<string, ChatChoiceAction>()
  let shortlist: ChatChoiceAction[] = []
  for (const card of cards) {
    if (card.kind !== 'choices') continue
    const actions = card.choices.map((choice): ChatChoiceAction => {
      const eligible = !choice.belowMatch && choice.readiness !== 'unavailable' && isPublicToolRef(choice.toolRef)
      return {
        choice,
        toolId: card.toolId,
        reviewInputs: eligible && (choice.callable === true || card.toolId === 'registry.tools.describe'),
        compare: !choice.belowMatch,
      }
    })
    if (card.toolId !== 'registry.tools.describe') {
      shortlist = actions
      continue
    }
    for (const action of actions) {
      details.delete(action.choice.toolRef)
      details.set(action.choice.toolRef, action)
    }
  }
  const current = [...details.values()].reverse().concat(shortlist.filter(action => !details.has(action.choice.toolRef))).slice(0, 4)
  const canCompare = current.filter(action => action.compare).length > 1
  return current.map(action => ({ ...action, compare: canCompare && action.compare }))
}
