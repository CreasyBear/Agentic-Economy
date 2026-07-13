import { createCapabilityContractRegistry, type CapabilityContractRegistry } from '@/modules/customer-request/legacy-v1'

import { internal } from './_generated/api'
import type { ActionCtx } from './_generated/server'

type Context = Pick<ActionCtx, 'runQuery'>

export async function loadConvexCapabilityContractRegistry(ctx: Context): Promise<CapabilityContractRegistry> {
  const contracts = await ctx.runQuery(internal.customerRequestCapabilityContracts.listActiveInternal, {})
  return createCapabilityContractRegistry(contracts)
}
