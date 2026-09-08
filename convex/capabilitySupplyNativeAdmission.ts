import {
  registerCapabilityOffering,
  registerCapabilityTransportBinding,
  setCapabilitySupplyEligibility,
  type CapabilityPublicationOfferingDraft,
} from '@/modules/capability-supply/public'
import { changeOfferingStatusInState, upsertAccessPathInState } from '@/modules/catalog/public'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { capabilitySupplyPublicationPorts } from './capabilitySupplyPublicationPorts'
import { capabilitySupplyWriterPorts } from './capabilitySupplyWriterPorts'
import { loadExactOfferingSourceState, persistOfferingSourceState } from './catalogOfferingMutations'

type ReadContext = Pick<QueryCtx, 'db'>
type CatalogOrigin = Extract<CapabilityPublicationOfferingDraft['origin'], { kind: 'catalog_offering' }>

export function isNativeSupplySource(kind: string): boolean {
  return kind === 'openapi_http' || kind === 'mcp' || kind === 'agent_plugin_mcp'
}

/** New Provider workspaces stay private while their first Tool is validated. */
export async function nativeSubmissionBusiness(ctx: ReadContext, businessId: Id<'businesses'>) {
  const business = await ctx.db.get(businessId)
  return business !== null
    && business.suppressedAt === undefined
    && (business.publicStatus === 'published'
      || (business.publicStatus === 'unpublished' && business.businessContext?.kind === 'programmable_provider'))
    ? business
    : null
}

async function exactNativeDraft(ctx: ReadContext, businessId: Id<'businesses'>, origin: CatalogOrigin) {
  if (origin.declaredAccessPathRef === undefined) return null
  const [offering, revision, path] = await Promise.all([
    ctx.db.query('businessOfferings').withIndex('by_offeringRef', q => q.eq('offeringRef', origin.offeringRef)).unique(),
    ctx.db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', q =>
      q.eq('offeringRef', origin.offeringRef).eq('revision', origin.offeringRevision)).unique(),
    ctx.db.query('offeringAccessPaths').withIndex('by_accessPathRef', q =>
      q.eq('accessPathRef', origin.declaredAccessPathRef!)).unique(),
  ])
  if (offering === null || revision === null || path === null
    || offering.businessId !== businessId || revision.businessId !== businessId || path.businessId !== businessId
    || (offering.status !== 'draft' && offering.status !== 'published')
    || (path.status !== 'draft' && path.status !== 'published')
    || offering.currentRevision !== origin.offeringRevision
    || revision.sourceHash !== origin.offeringSourceHash
    || path.offeringRef !== origin.offeringRef || path.offeringRevision !== origin.offeringRevision
    || path.offeringSourceHash !== origin.offeringSourceHash || path.sourceHash !== origin.accessPathSourceHash
    || path.integrationDraft === undefined || path.integrationDraft.sourceKind === 'x402') return null
  return { offering, path }
}

export function nativeSubmissionPorts(ctx: MutationCtx, businessId: Id<'businesses'>) {
  const writer = {
    ...capabilitySupplyWriterPorts(ctx.db),
    loadPublishedBusiness: async (candidateBusinessId: string) => candidateBusinessId === String(businessId)
      && await nativeSubmissionBusiness(ctx, businessId) !== null ? { businessId: String(businessId) } : null,
  }
  const ports = capabilitySupplyPublicationPorts(ctx, {
    registerOffering: (input, now) => registerCapabilityOffering(writer, input, now),
    registerBinding: (input, now, toolRef) => registerCapabilityTransportBinding(writer, input, now, toolRef),
    setEligibility: (input, now) => setCapabilitySupplyEligibility(writer, input, now),
  })
  return {
    ...ports,
    catalogOriginIsCurrent: async (origin: CatalogOrigin, candidateBusinessId: string) =>
      (await ports.catalogOriginIsCurrent?.(origin, candidateBusinessId) ?? false)
      || (candidateBusinessId === String(businessId) && await exactNativeDraft(ctx, businessId, origin) !== null),
  }
}

export async function nativePublicationCanBeValidated(ctx: ReadContext, publication: Doc<'capabilityPublications'>): Promise<boolean> {
  if (!isNativeSupplySource(publication.sourceKind) || publication.sourceAuthorityState === undefined
    || publication.authorityMode !== 'provider_owned' || publication.disposition !== 'current'
    || await nativeSubmissionBusiness(ctx, publication.businessId) === null) return false
  const offering = await ctx.db.query('capabilityOfferings')
    .withIndex('by_offeringId', q => q.eq('offeringId', publication.offeringId)).unique()
  return offering?.origin?.kind === 'catalog_offering'
    && await exactNativeDraft(ctx, publication.businessId, offering.origin) !== null
}

/** Called only after the exact live probe and current publisher authority pass. */
export async function publishValidatedNativeDraft(ctx: MutationCtx, publication: Doc<'capabilityPublications'>, now: number) {
  if (publication.sourceAuthorityState !== 'verified' || publication.healthState !== 'healthy'
    || publication.credentialState !== 'ready' || publication.readinessOutcome !== 'healthy'
    || (publication.readinessValidUntil ?? 0) <= now
    || !await nativePublicationCanBeValidated(ctx, publication)) return
  const capabilityOffering = await ctx.db.query('capabilityOfferings')
    .withIndex('by_offeringId', q => q.eq('offeringId', publication.offeringId)).unique()
  const origin = capabilityOffering?.origin
  if (origin?.kind !== 'catalog_offering') return
  const exact = await exactNativeDraft(ctx, publication.businessId, origin)
  if (exact === null) return
  if (exact.offering.status === 'published' && exact.path.status === 'published') {
    const business = await nativeSubmissionBusiness(ctx, publication.businessId)
    if (business?.publicStatus === 'unpublished') await ctx.db.patch(business._id, { publicStatus: 'published', updatedAt: now })
    return
  }
  const state = await loadExactOfferingSourceState(ctx.db, publication.businessId, { offeringRef: origin.offeringRef })
  const offering = state.offerings.find(row => row.offeringRef === origin.offeringRef)
  const path = state.accessPaths.find(row => row.accessPathRef === origin.declaredAccessPathRef)
  if (offering === undefined || path === undefined) throw new Error('native_admission_source_missing')
  const authority = { actorRef: publication.publisherRef, ownerRef: publication.publisherRef, businessOwnerRef: publication.publisherRef }
  const operationKey = `native-admission:${publication.publicationRef}:${publication.revision}`
  const published = changeOfferingStatusInState(state, {
    authority, operationKey: `${operationKey}:offering`, offeringRef: offering.offeringRef,
    expectedRevision: origin.offeringRevision, status: 'published', now,
  })
  if (published.kind === 'error') throw new Error(`native_admission_offering:${published.code}`)
  const activated = upsertAccessPathInState(published.state, {
    authority, operationKey: `${operationKey}:path`, offeringRef: offering.offeringRef,
    accessPathRef: path.accessPathRef, expectedRevision: origin.offeringRevision,
    status: 'published', descriptor: path.descriptor, now,
  })
  if (activated.kind === 'error') throw new Error(`native_admission_path:${activated.code}`)
  const saved = await persistOfferingSourceState(ctx.db, publication.businessId, state, activated.state, 'system')
  if (saved.kind === 'error') throw new Error(`native_admission_save:${saved.code}`)
  const business = await nativeSubmissionBusiness(ctx, publication.businessId)
  if (business?.publicStatus === 'unpublished') await ctx.db.patch(business._id, { publicStatus: 'published', updatedAt: now })
}
