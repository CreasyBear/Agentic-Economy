import type { MutationCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import { deriveBusinessOfferingSupportFromCapabilitySupply } from '../../capabilitySupply/projection/support'
import { rebuildBusinessSupplyProjectionSnapshotCommand } from '../../capabilitySupply/projection/snapshot'
import { evaluateX402SellerPromotion, parsePublishedToolSnapshot } from '../../../../src/modules/capability-supply/public'
import { readCurrentPublishedTool } from '../../capabilitySupply/currentTool/reads'
import { readExactSellerCanaryOperationSnapshotHandler } from '../../capabilitySupply/currentTool/sellerCanary'
import { providerRouteabilityIsFrozen } from '../../capabilitySupply/providerOffboarding/freeze'
import type { PromoteX402SellerCanaryResult } from './contracts'
import { promotionAnchorFromEnvelope, reconstructCanaryCommitment, canaryObservation, exactPlatformCanaryFundingEvidence, promotionOutputEvidence } from './evidence'
import { exactCatalogPromotionTarget, exactCurrentSellerClaim, currentAnchorFromSnapshot, admitExactSellerCanaryPublication, markSellerCanaryAdmissionPublished } from './target'

function promotionRefusalCode(
  code: Extract<ReturnType<typeof evaluateX402SellerPromotion>, { kind: 'refused' }>['code'],
): Extract<PromoteX402SellerCanaryResult, { kind: 'refused' }>['code'] {
  if (code === 'evidence_invalid') return 'canary_evidence_invalid'
  if (code === 'owner_mismatch') return 'wrong_owner'
  return code
}

export async function promoteAdmittedSellerCanaryHandler(
  ctx: MutationCtx,
  args: Readonly<{ canaryRef: string }>,
): Promise<PromoteX402SellerCanaryResult> {
  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => (
      query.eq('sellerOnboardingCanary.canaryRef', args.canaryRef)
    ))
    .take(2)
  const [row] = rows
  const envelope = row?.sellerOnboardingCanary
  if (rows.length !== 1 || row === undefined || envelope === undefined) {
    return { kind: 'refused', code: 'canary_not_found' }
  }
  return await promoteX402SellerCanaryForOwner(ctx, {
    ownerId: envelope.ownerId,
    businessId: envelope.businessId as Id<'businesses'>,
    canaryRef: args.canaryRef,
  })
}

async function promoteX402SellerCanaryForOwner(
  ctx: MutationCtx,
  args: Readonly<{ ownerId: string; businessId: Id<'businesses'>; canaryRef: string }>,
): Promise<PromoteX402SellerCanaryResult> {
  const business = await ctx.db.get(args.businessId)
  if (business === null || business.owningAccountRef !== args.ownerId) {
    return { kind: 'refused', code: 'wrong_owner' }
  }

  const rows = await ctx.db.query('capabilityCalls')
    .withIndex('by_sellerOnboardingCanary_canaryRef', (query) => (
      query.eq('sellerOnboardingCanary.canaryRef', args.canaryRef)
    ))
    .take(2)
  const [row] = rows
  if (rows.length !== 1 || row === undefined) return { kind: 'refused', code: 'canary_not_found' }
  const envelope = row.sellerOnboardingCanary
  if (envelope === undefined
    || envelope.canaryRef !== args.canaryRef
    || envelope.ownerId !== args.ownerId
    || envelope.businessId !== String(args.businessId)
    || row.callRef !== envelope.callRef
    || row.toolRef !== envelope.toolRef
    || row.inputDigest !== envelope.inputDigest
    || row.idempotencyKey !== envelope.idempotencyKey) {
    return { kind: 'refused', code: 'canary_evidence_invalid' }
  }
  const commitment = reconstructCanaryCommitment(envelope)
  const retainedOperation = row.toolJson === undefined
    ? undefined
    : parsePublishedToolSnapshot(row.toolJson)
  if (commitment === undefined
    || retainedOperation === undefined
    || retainedOperation.runtimeEnvironment !== row.environment
    || retainedOperation.materialDigest !== envelope.toolMaterialDigest
    || retainedOperation.identity.contractDigest !== envelope.contractDigest
    || retainedOperation.identity.bindingDigest !== envelope.bindingDigest
    || retainedOperation.priceDigest !== envelope.priceDigest) {
    return { kind: 'refused', code: 'canary_evidence_invalid' }
  }
  const sealed = promotionAnchorFromEnvelope(envelope)
  if (!await exactCatalogPromotionTarget(ctx, args.businessId, sealed)) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const output = promotionOutputEvidence(row, retainedOperation)
  const observation = canaryObservation(row, output.contractValid, output.deterministic)
  const now = Date.now()
  const platformFundingAuthorized = exactPlatformCanaryFundingEvidence(row, envelope)
  const operationMarker = await ctx.db.query('operationKeys')
    .withIndex('by_actor_operation_key', (query) => query
      .eq('actorRef', args.ownerId)
      .eq('operationName', 'promoteX402SellerCanary')
      .eq('key', args.canaryRef))
    .unique()

  if (operationMarker !== null) {
    const currentOperation = await readCurrentPublishedTool(ctx, envelope.toolRef, now)
    const claimCurrent = currentOperation !== undefined
      && await exactCurrentSellerClaim(ctx, currentOperation, sealed)
    const current = currentOperation === undefined
      ? sealed
      : {
          ...sealed,
          toolMaterialDigest: currentOperation.materialDigest,
          readinessObservedAt: currentOperation.readiness.observedAt,
          readinessValidUntil: currentOperation.readiness.validUntil,
        }
    const evaluated = evaluateX402SellerPromotion({
      actingOwnerId: args.ownerId,
      sealed,
      current,
      sellerClaimCurrent: claimCurrent,
      platformFundingAuthorized,
      readinessCurrent: currentOperation !== undefined
        && currentOperation.identity.contractDigest === sealed.contractDigest
        && currentOperation.identity.bindingDigest === sealed.bindingDigest
        && currentOperation.priceDigest === sealed.priceDigest,
      outputDeterministic: output.deterministic,
      outputAssertionMatched: output.assertionMatched,
      expectedOutputEvidenceDigest: envelope.expectedOutputEvidenceDigest,
      outputDigest: output.outputDigest,
      commitment,
      observation,
      now,
    })
    if (evaluated.kind === 'refused') {
      return { kind: 'refused', code: promotionRefusalCode(evaluated.code) }
    }
    if (operationMarker.scope !== 'catalog_offering'
      || operationMarker.status !== 'succeeded'
      || operationMarker.requestHash !== evaluated.consumptionDigest
      || operationMarker.resultHash !== evaluated.promotionEvidence.promotionEvidenceDigest
      || business.publicStatus !== 'published'
      || business.suppressedAt !== undefined) {
      return { kind: 'refused', code: 'operation_conflict' }
    }
    const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, args.businessId, now)
    if (support[sealed.offeringRef]?.routeable !== true) {
      return { kind: 'refused', code: 'target_drift' }
    }
    const projection = await rebuildBusinessSupplyProjectionSnapshotCommand({
      db: ctx.db,
      sourceDb: ctx.db,
      businessId: args.businessId,
      support,
      now,
    })
    if (projection.kind !== 'ok') throw new Error(`seller_promotion_projection_failed:${projection.code}`)
    return {
      kind: 'replayed',
      canaryRef: args.canaryRef,
      offeringRef: sealed.offeringRef,
      offeringRevision: sealed.offeringRevision,
      publicationRef: sealed.publicationRef,
      publicationRevision: sealed.publicationRevision,
      toolRef: sealed.draftOperationRef,
      promotionEvidenceDigest: evaluated.promotionEvidence.promotionEvidenceDigest,
      outputDigest: output.outputDigest,
    }
  }

  if ((business.publicStatus !== 'unpublished' && business.publicStatus !== 'published')
    || business.suppressedAt !== undefined) {
    return { kind: 'refused', code: 'target_drift' }
  }
  if (await providerRouteabilityIsFrozen(ctx, args.businessId)) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const promotionTargetPublication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', sealed.publicationRef).eq('revision', sealed.publicationRevision)
    ))
    .unique()
  if (promotionTargetPublication === null) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const offeringDoc = await ctx.db.query('capabilityOfferings')
    .withIndex('by_offeringId', (query) => query.eq('offeringId', promotionTargetPublication.offeringId))
    .unique()
  if (offeringDoc === null || offeringDoc.status !== 'active') {
    return { kind: 'refused', code: 'target_drift' }
  }
  const snapshot = await readExactSellerCanaryOperationSnapshotHandler(ctx, {
    publicationRef: envelope.publicationRef,
    revision: envelope.publicationRevision,
  })
  const currentOperation = snapshot === null
    ? undefined
    : parsePublishedToolSnapshot(snapshot.toolJson)
  if (snapshot === null || currentOperation === undefined) {
    return { kind: 'refused', code: 'target_drift' }
  }
  const current = currentAnchorFromSnapshot(sealed, snapshot, currentOperation)
  const evaluated = evaluateX402SellerPromotion({
    actingOwnerId: args.ownerId,
    sealed,
    current,
    sellerClaimCurrent: await exactCurrentSellerClaim(ctx, currentOperation, current),
    platformFundingAuthorized,
    readinessCurrent: true,
    outputDeterministic: output.deterministic,
    outputAssertionMatched: output.assertionMatched,
    expectedOutputEvidenceDigest: envelope.expectedOutputEvidenceDigest,
    outputDigest: output.outputDigest,
    commitment,
    observation,
    now,
  })
  if (evaluated.kind === 'refused') {
    return { kind: 'refused', code: promotionRefusalCode(evaluated.code) }
  }

  if (!await admitExactSellerCanaryPublication(
    ctx,
    sealed,
    evaluated.promotionEvidence.promotionEvidenceDigest,
    now,
  )) return { kind: 'refused', code: 'target_drift' }
  if (business.publicStatus === 'unpublished') {
    await ctx.db.patch(args.businessId, { publicStatus: 'published' })
  }
  const publicOperation = await readCurrentPublishedTool(ctx, sealed.draftOperationRef, now)
  if (publicOperation === undefined
    || publicOperation.identity.contractDigest !== sealed.contractDigest
    || publicOperation.identity.bindingDigest !== sealed.bindingDigest
    || publicOperation.priceDigest !== sealed.priceDigest) {
    throw new Error('seller_promotion_post_publish_operation_drift')
  }
  const support = await deriveBusinessOfferingSupportFromCapabilitySupply(ctx.db, args.businessId, now)
  if (support[sealed.offeringRef]?.routeable !== true) {
    throw new Error('seller_promotion_post_publish_not_routeable')
  }
  const projection = await rebuildBusinessSupplyProjectionSnapshotCommand({
    db: ctx.db,
    sourceDb: ctx.db,
    businessId: args.businessId,
    support,
    now,
  })
  if (projection.kind !== 'ok') throw new Error(`seller_promotion_projection_failed:${projection.code}`)
  await ctx.db.insert('operationKeys', {
    scope: 'catalog_offering',
    actorKind: 'owner',
    actorRef: args.ownerId,
    operationName: 'promoteX402SellerCanary',
    key: args.canaryRef,
    requestHash: evaluated.consumptionDigest,
    sourceHash: evaluated.promotionEvidence.promotionEvidenceDigest,
    status: 'succeeded',
    resultHash: evaluated.promotionEvidence.promotionEvidenceDigest,
    effectRefs: [
      args.canaryRef,
      sealed.offeringRef,
      `${sealed.publicationRef}@${sealed.publicationRevision}`,
      sealed.draftOperationRef,
    ],
    createdAt: now,
    updatedAt: now,
  })
  await markSellerCanaryAdmissionPublished(
    ctx,
    sealed.publicationRef,
    sealed.publicationRevision,
    now,
  )
  return {
    kind: 'promoted',
    canaryRef: args.canaryRef,
    offeringRef: sealed.offeringRef,
    offeringRevision: sealed.offeringRevision,
    publicationRef: sealed.publicationRef,
    publicationRevision: sealed.publicationRevision,
    toolRef: sealed.draftOperationRef,
    promotionEvidenceDigest: evaluated.promotionEvidence.promotionEvidenceDigest,
    outputDigest: output.outputDigest,
  }
}

