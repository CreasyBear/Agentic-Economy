import { describe, expect, it } from 'vitest'

import { listActions } from '@/modules/actions'

const CHAT_ACTION_IDS = [
  'registry.operations.search',
  'registry.operations.detail',
  'registry.operations.compare',
  'registry.operations.inspectPlan',
  'operation.execute',
] as const

describe('Operation chat prune boundary', () => {
  it('pins the five canonical chat Actions and excludes consequential surfaces', () => {
    const actions = listActions()
    const registeredIds = actions.map(({ id }) => id)
    const excludedActionIds = new Set([
      'operation.invoke',
      'operation.status',
      'operation.cancel',
      'operation.reconcile',
      'supply.publish',
      'supply.withdraw',
      'supply.earnings',
    ])

    expect(registeredIds).toEqual(expect.arrayContaining([...CHAT_ACTION_IDS]))
    expect(CHAT_ACTION_IDS.filter((id) => excludedActionIds.has(id))).toEqual([])

    const paymentBearingIds = actions
      .filter(({ effect }) => effect.class === 'payment' || effect.spendExposure !== 'none')
      .map(({ id }) => id)
    expect(paymentBearingIds).not.toEqual([])
    expect(CHAT_ACTION_IDS.filter((id) => paymentBearingIds.includes(id))).toEqual([])
  })

})
