import { describe, expect, it } from 'vitest'

import { listActions } from '@/modules/actions'
import { CHAT_TOOL_IDS } from '@/modules/chat/tool-card'

const EXPECTED_CHAT_TOOL_IDS = [
  'registry.tools.list',
  'registry.tools.search',
  'registry.tools.describe',
  'registry.tools.compare',
  'tool.quote',
  'tool.call',
] as const

describe('Tool chat prune boundary', () => {
  it('pins the six canonical chat Actions and excludes unrelated consequential surfaces', () => {
    const actions = listActions()
    const excludedActionIds: readonly string[] = [
      'call.status',
      'call.cancel',
      'call.reconcile',
      'funding.handoff.create',
      'marketDemand.record',
      'supply.publish',
      'supply.withdraw',
      'supply.recheck',
      'supply.republish',
      'supply.connection.connect',
      'supply.connection.reconnect',
      'supply.connection.revoke',
    ]
    expect(CHAT_TOOL_IDS).toEqual(EXPECTED_CHAT_TOOL_IDS)

    const chatActions = actions.filter(({ id }) => CHAT_TOOL_IDS.some((chatToolId) => chatToolId === id))
    const selectedIds = chatActions.map(({ id }) => id)
    expect(selectedIds).toEqual(EXPECTED_CHAT_TOOL_IDS)
    expect(selectedIds.filter((id) => excludedActionIds.includes(id))).toEqual([])
    const boundedCommercialIds = chatActions
      .filter(({ effect }) => effect.class === 'payment' || effect.spendExposure !== 'none')
      .map(({ id }) => id)
    expect(boundedCommercialIds).toEqual(['tool.quote', 'tool.call'])
    expect(chatActions.find(({ id }) => id === 'tool.quote')?.effect).toMatchObject({
      class: 'commitment',
      reversible: true,
      recipientKind: 'none',
    })
  })
})
