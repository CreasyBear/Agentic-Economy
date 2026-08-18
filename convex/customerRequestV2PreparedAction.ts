import { v, type Infer } from 'convex/values'

import {
  preparationMaterialDigest as preparationMaterialDigestMachine,
  preparePreparedAction as preparePreparedActionMachine,
} from '@/modules/customer-request/v2-preparation-egress'
import {
  preparedActionRecoveryReasonV2Value, preparedActionV2Value,
} from '@/modules/customer-request/runtime'

import { internalMutation, internalQuery } from './_generated/server'
import { customerRequestV2PreparedActionPorts } from './customerRequestV2PreparedActionPorts'

const resultValue = v.union(
  v.object({ kind: v.literal('prepared'), preparedAction: preparedActionV2Value }),
  v.object({
    kind: v.literal('not_prepared'), reason: preparedActionRecoveryReasonV2Value, recoveryRef: v.string(),
  }),
  v.object({
    kind: v.literal('conflict'),
    reason: v.union(v.literal('idempotency_key_reused'), v.literal('prepared_action_material_changed')),
  }),
)
type Result = Infer<typeof resultValue>

export const preparationMaterialDigest = internalQuery({
  args: { preparationRef: v.string(), principalId: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export const prepare = internalMutation({
  args: {
    commandKey: v.string(), commandDigest: v.string(), principalId: v.string(),
    preparationRef: v.string(), preparationMaterialDigest: v.string(), now: v.number(),
  },
  returns: resultValue,
  handler: async (ctx, args): Promise<Result> => {
    throw new Error('customer_request_tables_unlisted')
  },
})
