import type { MutationCtx } from '../../../_generated/server'
import { ownsPublishedBusiness, ownsPublishedBusinessForOwnerId, publicationPorts } from '../../../capabilitySupply'
import { verifySupplyAgentPrincipal } from '../../../agentAccessPrincipals'
import { resolveBusinessActor } from '../../../authz'
import { beginOperation, type OperationBeginResult, type PublicationCommandRow } from '@/modules/capability-supply/public'
import type { OwnerSupplyCommandArgs } from './contracts'

export async function loadOwnerSupplyPublication(
  ctx: MutationCtx,
  args: OwnerSupplyCommandArgs,
): Promise<
  | Readonly<{ kind: 'ok'; publication: PublicationCommandRow }>
  | Readonly<{ kind: 'refused'; reason: string }>
> {
  const agentAdmission = args.agentPrincipal === undefined
    ? undefined
    : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
  const owned = args.agentPrincipal === undefined
    ? await ownsPublishedBusiness(ctx, args.businessId)
    : agentAdmission?.kind === 'allowed'
      && await ownsPublishedBusinessForOwnerId(ctx, args.businessId, agentAdmission.ownerId)
  if (!owned) return { kind: 'refused', reason: 'authorization_denied' }
  const publication = await publicationPorts(ctx).loadPublicationAtRevision(
    args.publicationRef,
    args.publicationRevision,
  )
  if (
    publication === null ||
    publication.businessId !== String(args.businessId)
  ) {
    return { kind: 'refused', reason: 'publication_not_found' }
  }
  const [offering, revision, capabilityOffering] = await Promise.all([
    ctx.db
      .query('businessOfferings')
      .withIndex('by_offeringRef', (q) => q.eq('offeringRef', args.offeringRef))
      .unique(),
    ctx.db
      .query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (q) =>
        q
          .eq('offeringRef', args.offeringRef)
          .eq('revision', args.offeringRevision),
      )
      .unique(),
    ctx.db
      .query('capabilityOfferings')
      .withIndex('by_offeringId', (q) =>
        q.eq('offeringId', publication.offeringId),
      )
      .unique(),
  ])
  if (
    offering === null ||
    revision === null ||
    offering.businessId !== args.businessId ||
    offering.currentRevision !== args.offeringRevision ||
    revision.businessId !== args.businessId ||
    revision.sourceHash !== args.offeringSourceHash ||
    capabilityOffering?.origin?.kind !== 'catalog_offering' ||
    capabilityOffering.origin.offeringRef !== args.offeringRef ||
    capabilityOffering.origin.offeringRevision !== args.offeringRevision ||
    capabilityOffering.origin.offeringSourceHash !== args.offeringSourceHash
  )
    return { kind: 'refused', reason: 'catalog_offering_origin_changed' }
  return { kind: 'ok', publication }
}

type OwnerMaintenanceOperation = Exclude<
  OperationBeginResult,
  { kind: 'conflict' }
>
type OwnerMaintenanceBeginResult =
  | Readonly<{
      kind: 'refused'
      reason: 'authorization_denied' | 'operation_key_conflict'
    }>
  | Readonly<{ kind: 'ready'; operation: OwnerMaintenanceOperation }>

export async function beginOwnerMaintenanceOperation(
  ctx: MutationCtx,
  args: OwnerSupplyCommandArgs,
  operationName: 'withdrawOwnerCapability' | 'refreshOwnerCapability',
  now: number,
): Promise<OwnerMaintenanceBeginResult> {
  const agentAdmission = args.agentPrincipal === undefined
    ? undefined
    : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
  const ownerActor = args.agentPrincipal === undefined
    ? await resolveBusinessActor(ctx)
    : undefined
  const owned = args.agentPrincipal === undefined
    ? ownerActor?.kind === 'authenticated_owner'
      && await ownsPublishedBusiness(ctx, args.businessId)
    : agentAdmission?.kind === 'allowed'
      && await ownsPublishedBusinessForOwnerId(ctx, args.businessId, agentAdmission.ownerId)
  if (!owned) {
    return { kind: 'refused', reason: 'authorization_denied' }
  }
  const operation = await beginOperation(
    publicationPorts(ctx),
    {
      kind: 'owner',
      ref: agentAdmission?.kind === 'allowed'
        ? agentAdmission.principalId
        : ownerActor?.kind === 'authenticated_owner'
          ? ownerActor.canonicalPrincipalRef
          : '',
    },
    operationName,
    {
      operationKey: args.operationKey,
      correlationId: args.correlationId,
      reasonCode: args.reasonCode,
      evidenceRefs: args.evidenceRefs,
    },
    {
      businessId: String(args.businessId),
      offeringRef: args.offeringRef,
      offeringRevision: args.offeringRevision,
      offeringSourceHash: args.offeringSourceHash,
      publicationRef: args.publicationRef,
      publicationRevision: args.publicationRevision,
    },
    now,
  )
  if (operation.kind === 'conflict') {
    return { kind: 'refused', reason: 'operation_key_conflict' }
  }
  return { kind: 'ready', operation }
}
