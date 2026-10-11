import {
  publishPreparedCapabilityCommand,
  validRegistrationContext,
  validX402SellerClaimTime,
} from '@/modules/capability-supply/public'

import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import {
  boundedSellerClaim,
  convexStagingResult,
  exactOwnerX402Environment,
} from './normalize'
import {
  exactCatalogTarget,
  exactStagingConnection,
  reuseExactStagedPublication,
  stagingPublicationPorts,
} from './reuse'
import type { StageOwnerX402CapabilityArgs, StageOwnerX402CapabilityResult } from './contracts'

export async function stageOwnerX402CapabilityHandler(
  ctx: MutationCtx,
  args: StageOwnerX402CapabilityArgs,
): Promise<StageOwnerX402CapabilityResult> {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  const actor = await resolveBusinessActor(ctx)
  const business = await ctx.db.get(args.businessId)
  if (
    actor.kind !== 'authenticated_owner'
    || business === null
    || business.owningAccountRef !== actor.canonicalAccountRef
    || (business.publicStatus !== 'unpublished' && business.publicStatus !== 'published')
    || business.suppressedAt !== undefined
    || !validRegistrationContext(args)
  ) return { kind: 'refused', reason: 'authorization_denied' }
  if (await providerRouteabilityIsFrozen(ctx, args.businessId)) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }

  const now = Date.now()
  const runtimeEnvironment = exactOwnerX402Environment(args.prepared, args.sellerClaim)
  if (
    !boundedSellerClaim(args.sellerClaim)
    || args.sellerClaim.businessId !== String(args.businessId)
    || !validX402SellerClaimTime(args.sellerClaim.expiresAt, now)
    || runtimeEnvironment === undefined
  ) return { kind: 'refused', reason: 'payment_required_invalid' }
  if (!await exactCatalogTarget(ctx, args)) {
    return { kind: 'refused', reason: 'catalog_offering_origin_changed' }
  }
  const connection = await exactStagingConnection(ctx, {
    businessId: args.businessId,
    ownerId: actor.canonicalAccountRef,
    prepared: args.prepared,
    sellerClaim: args.sellerClaim,
    evidenceRefs: args.evidenceRefs,
    now,
  })
  if (connection === undefined) {
    return { kind: 'refused', reason: 'connection_authority_stale' }
  }

  const replayed = await reuseExactStagedPublication(ctx, {
    args,
    ownerPrincipalRef: actor.canonicalPrincipalRef,
    connection,
    now,
  })
  if (replayed !== undefined) return replayed

  const result = await publishPreparedCapabilityCommand({
    businessId: String(args.businessId),
    runtimeEnvironment,
    prepared: args.prepared,
    actor: { kind: 'owner', ref: actor.canonicalPrincipalRef },
    origin: args.prepared.offering.origin,
    operationKey: args.operationKey,
    correlationId: args.correlationId,
    reasonCode: args.reasonCode,
    evidenceRefs: [...args.evidenceRefs],
    now,
  }, stagingPublicationPorts(ctx, args.businessId))
  return convexStagingResult(result)
}
