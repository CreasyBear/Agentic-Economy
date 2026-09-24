import { v } from 'convex/values'
import { moneyRefusalValue } from '../../../moneyLedgerValues'
import { connectAccountViewValue, connectAccountCommandValue } from '../../../../src/modules/money/public'

export const connectAccountResultValue = v.union(
  v.object({ kind: v.literal('accepted'), account: connectAccountViewValue }),
  moneyRefusalValue,
)
export const connectAccountReservationResultValue = v.union(
  v.object({
    kind: v.literal('accepted'),
    command: connectAccountCommandValue,
    execute: v.boolean(),
  }),
  moneyRefusalValue,
)

