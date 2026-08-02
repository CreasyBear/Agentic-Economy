import type {
  CancelMandateLoadResult,
  CancelSupplyLoadResult,
} from '@/modules/customer-request/route-execution/machines'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { getEligibleExactCapabilitySupply } from './capabilitySupply'
import { readCurrentRouteMandateStateForPrincipal } from './customerRequestRouteMandate'

type DbCtx = QueryCtx | MutationCtx

export async function loadActiveRouteMandate(
  ctx: DbCtx,
  requestId: string,
  principalId: string,
  now: number,
): Promise<CancelMandateLoadResult> {
  const current = await readCurrentRouteMandateStateForPrincipal(
    ctx, requestId, principalId, now, { requireCurrentGraph: false },
  )
  if (current.kind !== 'active') return { kind: 'missing' }
  return {
    kind: 'active',
    mandateRef: current.mandate.mandateRef,
    mandateDigest: current.mandate.mandateDigest,
    networkId: current.networkId,
  }
}

export async function loadEligibleRouteSupply(
  ctx: DbCtx,
  input: Parameters<typeof getEligibleExactCapabilitySupply>[1],
): Promise<CancelSupplyLoadResult> {
  const supply = await getEligibleExactCapabilitySupply(ctx.db, input)
  if (supply.kind !== 'available') return { kind: 'unavailable' }
  return {
    kind: 'available',
    binding: {
      adapterId: supply.binding.adapterId,
      endpointUrl: supply.binding.endpointUrl,
      credentialRef: supply.binding.credentialRef,
      configJson: supply.binding.configJson,
      configDigest: supply.binding.configDigest,
    },
  }
}
