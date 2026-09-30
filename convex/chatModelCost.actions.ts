'use node'

import { v } from 'convex/values'
import { internalAction } from './_generated/server'
import { reconcileModelCost } from './lib/chat/turns/modelCostActions'

export const reconcile = internalAction({
  args: { requestRef: v.string(), attempt: v.number() },
  returns: v.null(),
  handler: reconcileModelCost,
})
