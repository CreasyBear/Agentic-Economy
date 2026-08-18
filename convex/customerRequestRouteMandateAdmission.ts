import { v, type Infer } from 'convex/values'

import { routeStepGrantValue } from '@/modules/customer-request/runtime'

import { internalMutation, type MutationCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

const command = {
  requestId: v.string(),
  mandateRef: v.string(),
  expectedMandateDigest: v.string(),
  expectedGenerationRef: v.string(),
  expectedRoutePlanId: v.string(),
  expectedRouteDigest: v.string(),
  stepPosition: v.number(),
  expectedActionId: v.string(),
  expectedCapabilityId: v.string(),
  expectedCapabilityVersion: v.number(),
  expectedCapabilityContractDigest: v.string(),
  idempotencyKey: v.string(),
}
const commandValue = v.object(command)
export type RouteStepAdmissionCommand = Infer<typeof commandValue>

const result = v.union(
  v.object({ kind: v.literal('admitted'), grant: routeStepGrantValue }),
  v.object({ kind: v.literal('replayed'), grant: routeStepGrantValue }),
  v.object({ kind: v.literal('conflict'), reason: v.literal('command_changed') }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('mandate_not_current'),
      v.literal('mandate_scope_mismatch'),
      v.literal('step_already_reserved'),
      v.literal('spend_limit_exceeded'),
    ),
  }),
)

export const admitStep = internalMutation({
  args: command,
  returns: result,
  handler: async () => {
    throw new Error('customer_request_tables_unlisted')
  },
})

export async function admitRouteStep(
  _ctx: MutationCtx,
  _args: RouteStepAdmissionCommand,
  _verifiedPrincipalId?: string,
): Promise<Infer<typeof result>> {
  return unlistedCustomerRequestTables()
}
