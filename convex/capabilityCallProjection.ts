import { query } from './_generated/server'
import { supplyCallsArgs, supplyCallsResultValue } from './lib/callLifecycle/supplyCallsListing'
import { listAgentSupplyCallsQuery } from './lib/callProjection/listing'
export const listAgentSupplyCalls = query({
  args: supplyCallsArgs,
  returns: supplyCallsResultValue,
  handler: listAgentSupplyCallsQuery,
})
