import type { MutationCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import { X402_SELLER_CANARY_ADMISSION_REQUIRED_REF, x402SellerCanaryAdmissionEvidenceRef, parsePublishedToolSnapshot, type X402SellerPromotionAnchor } from '../../../../src/modules/capability-supply/public'
import { readExactSellerCanaryOperationSnapshotHandler } from '../../capabilitySupply/currentTool/reads'

export async function exactCatalogPromotionTarget(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  anchor: X402SellerPromotionAnchor,
): Promise<boolean> {
  const [offering, revision, path] = await Promise.all([
    ctx.db.query('businessOfferings')
      .withIndex('by_offeringRef', (query) => query.eq('offeringRef', anchor.offeringRef))
      .unique(),
    ctx.db.query('businessOfferingRevisions')
      .withIndex('by_offeringRef_and_revision', (query) => (
        query.eq('offeringRef', anchor.offeringRef).eq('revision', anchor.offeringRevision)
      ))
      .unique(),
    ctx.db.query('offeringAccessPaths')
      .withIndex('by_accessPathRef', (query) => query.eq('accessPathRef', anchor.accessPathRef))
      .unique(),
  ])
  return offering !== null
    && revision !== null
    && path !== null
    && offering.businessId === businessId
    && offering.currentRevision === anchor.offeringRevision
    && offering.status === 'published'
    && revision.businessId === businessId
    && revision.sourceHash === anchor.offeringSourceHash
    && path.businessId === businessId
    && path.offeringRef === anchor.offeringRef
    && path.offeringRevision === anchor.offeringRevision
    && path.offeringSourceHash === anchor.offeringSourceHash
    && path.status === 'published'
    && path.sourceHash === anchor.accessPathSourceHash
}

export async function exactCurrentSellerClaim(
  ctx: MutationCtx,
  operation: NonNullable<ReturnType<typeof parsePublishedToolSnapshot>>,
  anchor: X402SellerPromotionAnchor,
): Promise<boolean> {
  if (operation.binding.authority.kind !== 'provider_connection'
    || operation.identity.payment.kind !== 'x402'
    || operation.identity.payment.payTo.toLowerCase() !== anchor.sellerPayTo.toLowerCase()) return false
  const authority = operation.binding.authority
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => (
      query.eq('connectionRef', authority.connectionRef)
    ))
    .unique()
  return connection !== null
    && connection.lifecycle === 'active'
    && String(connection.businessId) === anchor.businessId
    && connection.owningAccountRef === anchor.ownerId
    && connection.providerRef === authority.providerRef
    && connection.evidenceRefs.includes(`x402-payee-claim:${anchor.sellerClaimDigest}`)
}

export function currentAnchorFromSnapshot(
  sealed: X402SellerPromotionAnchor,
  snapshot: NonNullable<Awaited<ReturnType<typeof readExactSellerCanaryOperationSnapshotHandler>>>,
  operation: NonNullable<ReturnType<typeof parsePublishedToolSnapshot>>,
): X402SellerPromotionAnchor {
  return {
    ownerId: sealed.ownerId,
    businessId: operation.identity.businessId,
    offeringRef: snapshot.offeringRef,
    offeringRevision: snapshot.offeringRevision,
    offeringSourceHash: snapshot.offeringSourceHash,
    accessPathRef: snapshot.accessPathRef,
    accessPathSourceHash: snapshot.accessPathSourceHash,
    publicationRef: snapshot.publicationRef,
    publicationRevision: snapshot.publicationRevision,
    draftOperationRef: snapshot.toolRef,
    toolMaterialDigest: operation.materialDigest,
    contractDigest: operation.identity.contractDigest,
    bindingDigest: operation.identity.bindingDigest,
    priceDigest: operation.priceDigest,
    sellerPayTo: snapshot.sellerPayTo,
    sellerClaimDigest: snapshot.sellerClaimDigest,
    readinessDigest: snapshot.readinessDigest,
    readinessObservedAt: snapshot.readinessObservedAt,
    readinessValidUntil: snapshot.readinessValidUntil,
  }
}

export async function admitExactSellerCanaryPublication(
  ctx: MutationCtx,
  anchor: X402SellerPromotionAnchor,
  promotionEvidenceDigest: string,
  now: number,
): Promise<boolean> {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query
      .eq('publicationRef', anchor.publicationRef)
      .eq('revision', anchor.publicationRevision))
    .unique()
  if (publication === null
    || String(publication.businessId) !== anchor.businessId
    || publication.toolRef !== anchor.draftOperationRef
    || publication.disposition !== 'current'
    || publication.registrationEvidenceRefs.filter(
      (ref) => ref === X402_SELLER_CANARY_ADMISSION_REQUIRED_REF,
    ).length !== 1) return false
  const admissionRef = x402SellerCanaryAdmissionEvidenceRef(promotionEvidenceDigest)
  const existingAdmissionRefs = publication.registrationEvidenceRefs.filter((ref) => (
    ref.startsWith('x402-seller-canary-admission:admitted:v1:')
  ))
  if (existingAdmissionRefs.length > 0) return false
  await ctx.db.patch(publication._id, {
    registrationEvidenceRefs: [...new Set([
      ...publication.registrationEvidenceRefs,
      admissionRef,
    ])].sort(),
    updatedAt: now,
  })
  return true
}


export async function markSellerCanaryAdmissionPublished(
  ctx: MutationCtx,
  publicationRef: string,
  publicationRevision: number,
  now: number,
): Promise<void> {
  const admissionCase = await ctx.db.query('capabilitySupplyAdmissionCases')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', publicationRef).eq('publicationRevision', publicationRevision)
    ))
    .unique()
  if (admissionCase === null) return
  await ctx.db.patch(admissionCase._id, {
    state: 'completed',
    terminalDecision: 'published',
    blockerRefs: [],
    completedAt: now,
    updatedAt: now,
  })
}

