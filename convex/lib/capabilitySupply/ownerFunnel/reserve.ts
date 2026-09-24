import type { MutationCtx } from '../../../_generated/server'
import { nativeSubmissionBusiness } from '../../../capabilitySupplyNativeAdmission'
import { publicationPorts } from '../../../capabilitySupply'
import { verifySupplyAgentPrincipal } from '../../../agentAccessPrincipals'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { resolveBusinessActor } from '../../../authz'
import { beginOperation, replayOperationResult, succeedOperation } from '@/modules/capability-supply/public'
import { ownerPublishReservationArgsValue, ownerPublishReservationResultValue } from './contracts'
import type { Infer } from 'convex/values'

export async function reserveOwnerCapabilityPublicationHandler(
  ctx: MutationCtx,
  args: Infer<typeof ownerPublishReservationArgsValue>,
): Promise<Infer<typeof ownerPublishReservationResultValue>> {
    const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
    if (sourceWrite.kind === 'rejected') return { kind: 'refused', reason: 'authorization_denied' }
    const admission = args.agentPrincipal === undefined
      ? undefined
      : await verifySupplyAgentPrincipal(ctx, args.agentPrincipal, true)
    const ownerActor = args.agentPrincipal === undefined
      ? await resolveBusinessActor(ctx)
      : undefined
    const owned = admission?.kind === 'allowed'
      ? (await nativeSubmissionBusiness(ctx, args.businessId))?.owningAccountRef === admission.ownerId
      : ownerActor?.kind === 'authenticated_owner'
        && (await nativeSubmissionBusiness(ctx, args.businessId))?.owningAccountRef === ownerActor.canonicalAccountRef
    if (!owned) {
      return { kind: 'refused', reason: 'authorization_denied' }
    }
    const now = Date.now()
    const operation = await beginOperation(
      publicationPorts(ctx),
      {
        kind: 'owner',
        ref: admission?.kind === 'allowed'
          ? admission.principalId
          : ownerActor?.kind === 'authenticated_owner'
            ? ownerActor.canonicalPrincipalRef
            : '',
      },
      'reserveOwnerCapabilityPublication',
      {
        operationKey: args.operationKey,
        correlationId: args.correlationId,
        reasonCode: args.reasonCode,
        evidenceRefs: args.evidenceRefs,
      },
      {
        version: 'supply-publication:v1',
        businessId: String(args.businessId),
        offeringRef: args.offeringRef,
        offeringRevision: args.offeringRevision,
        offeringSourceHash: args.offeringSourceHash,
        materialDigest: args.materialDigest,
      },
      now,
    )
    const expected = { kind: 'reserved' as const }
    if (operation.kind === 'conflict') return { kind: 'refused', reason: 'operation_key_conflict' }
    if (operation.kind === 'replay') {
      replayOperationResult(operation, expected)
      return { kind: 'replayed' }
    }
    await succeedOperation(publicationPorts(ctx), operation.operationId, expected, [], now)
    return expected
}
