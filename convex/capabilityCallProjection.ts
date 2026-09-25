import { query } from './_generated/server'
import { supplyCallsArgs, supplyCallsResultValue } from './lib/capabilityExecution/callLifecycle/supplyCallsListing'
import { listAgentSupplyCallsQuery } from './lib/capabilityExecution/callProjection/listing'
export const listAgentSupplyCalls = query({
  args: supplyCallsArgs,
  returns: supplyCallsResultValue,
  handler: listAgentSupplyCallsQuery,
})
