import type { Infer } from 'convex/values'

import { supplyIntegrationDraftRefs } from '@/modules/capability-supply/integration-draft'
import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import {
  readOwnerSupplyIntegrationDraftResult,
  type SaveAgentSupplyIntegrationDraftArgs,
} from './contracts'

export async function readOwnerSupplyIntegrationDraftHandler(
  ctx: QueryCtx,
  args: Readonly<{ businessId: SaveAgentSupplyIntegrationDraftArgs['businessId']; candidateRef: string }>,
): Promise<Infer<typeof readOwnerSupplyIntegrationDraftResult>> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' }
  const business = await ctx.db.get(args.businessId)
  if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) return { kind: 'not_found' }
  const refs = supplyIntegrationDraftRefs(String(args.businessId), args.candidateRef)
  const path = await ctx.db.query('offeringAccessPaths')
    .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', refs.accessPathRef))
    .unique()
  if (path === null || path.businessId !== args.businessId || path.integrationDraft === undefined) {
    return { kind: 'not_found' }
  }
  return {
    kind: 'available',
    offeringRef: refs.offeringRef,
    accessPathRef: refs.accessPathRef,
    draft: path.integrationDraft,
  }
}
