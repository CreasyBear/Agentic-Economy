import { describe, expect, it } from 'vitest'

import { listActions } from '@/modules/actions'

const CHAT_ACTION_IDS = [
  'registry.operations.list',
  'registry.operations.search',
  'registry.operations.describe',
  'registry.operations.compare',
  'operation.inspect',
  'operation.invoke',
] as const

describe('Operation chat prune boundary', () => {
  it('pins the six canonical chat Actions and excludes unrelated consequential surfaces', () => {
    const actions = listActions()
    const registeredIds = actions.map(({ id }) => id)
    const excludedActionIds: readonly string[] = [
      'operation.status',
      'operation.cancel',
      'operation.reconcile',
      'supply.publish',
      'supply.withdraw',
      'supply.earnings',
    ]
    expect(registeredIds).toEqual(expect.arrayContaining([...CHAT_ACTION_IDS]))
    expect(CHAT_ACTION_IDS.filter((id) => excludedActionIds.includes(id))).toEqual([])

    const boundedCommercialIds = actions
      .filter(({ effect }) => effect.class === 'payment' || effect.spendExposure !== 'none')
      .map(({ id }) => id)
    expect(boundedCommercialIds).toEqual(['operation.inspect', 'operation.invoke'])
    expect(actions.find(({ id }) => id === 'operation.inspect')?.effect).toMatchObject({
      class: 'commitment',
      reversible: true,
      recipientKind: 'none',
    })
  })

})
