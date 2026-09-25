import type { MutationCtx } from '../../../_generated/server'
import { publicationPorts, rebuildCapabilityOriginSupplyProjection } from '../../../capabilitySupply'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { withdrawCapabilityCommand } from '@/modules/capability-supply/public'
import { advance, block, offeringOffboardingAuthorityDigest, requireCase } from './caseState'

export async function freezeRouteabilityHandler(ctx: MutationCtx, args: { caseRef: string }) {
  const row = await requireCase(ctx, args.caseRef)
  if (row.state === 'cancelled') return { ready: false, cancelled: true }
  if (row.routeabilityFrozenAt !== undefined) return { ready: true, cancelled: false }
  const now = Date.now()
  await ctx.db.patch(row._id, {
    routeabilityFrozenAt: now,
    blockerCodes: [],
    evidenceRefs: [...row.evidenceRefs, `provider-offboarding:routeability-frozen:${row.caseRef}`],
    revision: row.revision + 1,
    updatedAt: now,
  })
  await rebuildCapabilityOriginSupplyProjection(ctx, row.businessId, now)
  return { ready: true, cancelled: false }
}

export async function withdrawCatalogDocumentsPageHandler(ctx: MutationCtx, args: { caseRef: string }) {
  const row = await requireCase(ctx, args.caseRef)
  if (row.routeabilityFrozenAt === undefined) return { done: false }
  const business = await ctx.db.get(row.businessId)
  if (business === null) return { done: true }
  const documents = await ctx.db.query('registrySearchDocuments')
    .withIndex('by_business', (index) => index.eq('businessSlug', business.slug))
    .take(100)
  await Promise.all(documents.map(async (document) => await ctx.db.delete(document._id)))
  return { done: documents.length < 100 }
}

export async function withdrawToolTargetsPageHandler(ctx: MutationCtx, args: { caseRef: string }) {
  const row = await requireCase(ctx, args.caseRef)
  if (row.routeabilityFrozenAt === undefined) return { ready: false, done: false }
  const publications = await ctx.db.query('capabilityPublications')
    .withIndex('by_businessId_and_disposition', (index) => index
      .eq('businessId', row.businessId)
      .eq('disposition', 'current'))
    .take(100)
  const insertedTargets: Array<Readonly<{ targetRef: string; targetRevision: number; authorityDigest: string }>> = []
  for (const publication of publications) {
    const canonicalPublication = await publicationPorts(ctx).loadPublicationAtRevision(
      publication.publicationRef,
      publication.revision,
    )
    if (canonicalPublication === null) {
      await block(ctx, row, 'freeze-routeability', 'routeable_tools_remain')
      return { ready: false, done: false }
    }
    const authorityDigest = canonicalDigest({
      version: 'provider-offboarding-operation-authority:v1',
      publicationRef: publication.publicationRef,
      revision: publication.revision,
      publisherRef: publication.publisherRef,
      authorityMode: publication.authorityMode,
      connectionAuthority: publication.connectionAuthority ?? null,
    })
    const existingTarget = await ctx.db.query('capabilityProviderOffboardingTargets')
      .withIndex('by_caseRef_and_kind_and_targetRef', (index) => index
        .eq('caseRef', row.caseRef)
        .eq('kind', 'tool')
        .eq('targetRef', publication.toolRef))
      .unique()
    if (existingTarget === null) {
      await ctx.db.insert('capabilityProviderOffboardingTargets', {
        caseRef: row.caseRef,
        businessId: row.businessId,
        kind: 'tool',
        targetRef: publication.toolRef,
        targetRevision: publication.revision,
        authorityDigest,
        createdAt: Date.now(),
      })
      insertedTargets.push({ targetRef: publication.toolRef, targetRevision: publication.revision, authorityDigest })
    }
    const result = await withdrawCapabilityCommand({
      publication: canonicalPublication,
      evidenceRefs: [`provider-offboarding:${row.caseRef}`],
      now: Date.now(),
    }, publicationPorts(ctx))
    if (result.kind === 'refused') {
      await block(ctx, row, 'freeze-routeability', 'routeable_tools_remain')
      return { ready: false, done: false }
    }
  }
  if (insertedTargets.length > 0) {
    await ctx.db.patch(row._id, {
      toolTargetCount: row.toolTargetCount + insertedTargets.length,
      targetSnapshotDigest: canonicalDigest({
        version: 'provider-offboarding-target-page:v1',
        previousDigest: row.targetSnapshotDigest,
        targets: insertedTargets,
      }),
      revision: row.revision + 1,
      updatedAt: Date.now(),
    })
  }
  return { ready: true, done: publications.length < 100 }
}

export async function snapshotOfferingTargetsPageHandler(
  ctx: MutationCtx,
  args: { caseRef: string; afterOfferingRef?: string },
) {
  const row = await requireCase(ctx, args.caseRef)
  if (row.routeabilityFrozenAt === undefined) return { done: false }
  const offerings = await ctx.db.query('businessOfferings')
    .withIndex('by_businessId_and_offeringRef', (index) => {
      const business = index.eq('businessId', row.businessId)
      return args.afterOfferingRef === undefined
        ? business
        : business.gt('offeringRef', args.afterOfferingRef)
    })
    .take(100)
  const insertedTargets: Array<Readonly<{ targetRef: string; targetRevision: number; authorityDigest: string }>> = []
  for (const offering of offerings) {
    if (offering.status === 'retired') continue
    const authorityDigest = offeringOffboardingAuthorityDigest(row.businessId, offering)
    const existingTarget = await ctx.db.query('capabilityProviderOffboardingTargets')
      .withIndex('by_caseRef_and_kind_and_targetRef', (index) => index
        .eq('caseRef', row.caseRef)
        .eq('kind', 'offering')
        .eq('targetRef', offering.offeringRef))
      .unique()
    if (existingTarget !== null) continue
    await ctx.db.insert('capabilityProviderOffboardingTargets', {
      caseRef: row.caseRef,
      businessId: row.businessId,
      kind: 'offering',
      targetRef: offering.offeringRef,
      targetRevision: offering.currentRevision,
      authorityDigest,
      createdAt: Date.now(),
    })
    insertedTargets.push({
      targetRef: offering.offeringRef,
      targetRevision: offering.currentRevision,
      authorityDigest,
    })
  }
  if (insertedTargets.length > 0) {
    await ctx.db.patch(row._id, {
      offeringTargetCount: row.offeringTargetCount + insertedTargets.length,
      targetSnapshotDigest: canonicalDigest({
        version: 'provider-offboarding-target-page:v1',
        previousDigest: row.targetSnapshotDigest,
        targets: insertedTargets,
      }),
      revision: row.revision + 1,
      updatedAt: Date.now(),
    })
  }
  const last = offerings.at(-1)
  return {
    done: offerings.length < 100,
    ...(offerings.length < 100 || last === undefined ? {} : { nextOfferingRef: last.offeringRef }),
  }
}

export async function snapshotConnectionTargetsPageHandler(
  ctx: MutationCtx,
  args: { caseRef: string; afterConnectionRef?: string },
) {
  const row = await requireCase(ctx, args.caseRef)
  const connections = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_businessId_and_connectionRef', (index) => {
      const business = index.eq('businessId', row.businessId)
      return args.afterConnectionRef === undefined
        ? business
        : business.gt('connectionRef', args.afterConnectionRef)
    })
    .take(100)
  const insertedTargets: Array<Readonly<{ targetRef: string; targetRevision: number; authorityDigest: string }>> = []
  for (const connection of connections) {
    if (connection.lifecycle === 'revoked') continue
    const existingTarget = await ctx.db.query('capabilityProviderOffboardingTargets')
      .withIndex('by_caseRef_and_kind_and_targetRef', (index) => index
        .eq('caseRef', row.caseRef)
        .eq('kind', 'connection')
        .eq('targetRef', connection.connectionRef))
      .unique()
    if (existingTarget !== null) continue
    await ctx.db.insert('capabilityProviderOffboardingTargets', {
      caseRef: row.caseRef,
      businessId: row.businessId,
      kind: 'connection',
      targetRef: connection.connectionRef,
      targetRevision: connection.authorityGeneration,
      authorityDigest: connection.authorityDigest,
      createdAt: Date.now(),
    })
    insertedTargets.push({
      targetRef: connection.connectionRef,
      targetRevision: connection.authorityGeneration,
      authorityDigest: connection.authorityDigest,
    })
  }
  if (insertedTargets.length > 0) {
    await ctx.db.patch(row._id, {
      connectionTargetCount: row.connectionTargetCount + insertedTargets.length,
      targetSnapshotDigest: canonicalDigest({
        version: 'provider-offboarding-target-page:v1',
        previousDigest: row.targetSnapshotDigest,
        targets: insertedTargets,
      }),
      revision: row.revision + 1,
      updatedAt: Date.now(),
    })
  }
  const last = connections.at(-1)
  return {
    done: connections.length < 100,
    ...(connections.length < 100 || last === undefined ? {} : { nextConnectionRef: last.connectionRef }),
  }
}

export async function completeFreezeHandler(ctx: MutationCtx, args: { caseRef: string }) {
  const row = await requireCase(ctx, args.caseRef)
  await rebuildCapabilityOriginSupplyProjection(ctx, row.businessId, Date.now())
  await advance(ctx, row, 'drain-calls', 'draining')
  return null
}
