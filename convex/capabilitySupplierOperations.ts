import { paginationOptsValidator } from 'convex/server'
import { v } from 'convex/values'

import { projectSupplierOperationStatus } from '@/modules/capability-supply/supplier-operation-status'
import { qualifySuppliedCandidate } from '@/modules/capability-supply/public'
import { MAX_ACCESS_PATHS_PER_OFFERING } from '@/modules/catalog/public'
import { agentAccessPrincipalValue, verifySupplyAgentPrincipal } from './agentAccessPrincipals'
import { resolveBusinessActor } from './authz'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import { upsertSupplierOperationIdentity } from './capabilitySupplierOperationProjection'
import type { Doc } from './_generated/dataModel'
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'

const EVIDENCE_WINDOW_MS = 30 * 24 * 60 * 60_000
const EVIDENCE_READ_LIMIT = 10_000

const readResultValue = v.union(
  v.object({ kind: v.literal('available'), statusJson: v.string() }),
  v.object({ kind: v.literal('not_found') }),
)

const ownerReadResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    statusJson: v.string(),
    operation: v.object({
      offeringRef: v.string(),
      currentRevision: v.number(),
      name: v.string(),
      category: v.string(),
      summary: v.string(),
      status: v.union(v.literal('draft'), v.literal('published'), v.literal('paused'), v.literal('retired')),
      accessPathCount: v.number(),
    }),
    maintenance: v.optional(v.object({
      offeringRef: v.string(),
      offeringRevision: v.number(),
      offeringSourceHash: v.string(),
      publicationRef: v.string(),
      publicationRevision: v.number(),
    })),
    resumeCandidateRef: v.optional(v.string()),
  }),
  v.object({ kind: v.literal('not_found') }),
)

const listResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    page: v.array(v.object({ statusJson: v.string() })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  v.object({ kind: v.literal('not_found') }),
)

const ownerListResultValue = v.union(
  v.object({
    kind: v.literal('available'),
    page: v.array(v.object({
      offeringRef: v.string(),
      currentRevision: v.number(),
      name: v.string(),
      category: v.string(),
      summary: v.string(),
      status: v.union(v.literal('draft'), v.literal('published'), v.literal('paused'), v.literal('retired')),
      accessPathCount: v.number(),
      statusJson: v.string(),
    })),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  v.object({ kind: v.literal('not_found') }),
)

const agentReadArgs = {
  businessId: v.id('businesses'),
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

async function authorize(ctx: MutationCtx, args: { businessId: Doc<'businesses'>['_id']; agentPrincipal: Parameters<typeof verifySupplyAgentPrincipal>[1] }) {
  const admission = await verifySupplyAgentPrincipal(ctx, args.agentPrincipal)
  if (admission.kind !== 'allowed') return null
  const business = await ctx.db.get(args.businessId)
  return business !== null && business.owningAccountRef === admission.ownerId ? business : null
}

function sourceKind(sourceKind: Doc<'capabilityPublications'>['sourceKind'] | undefined) {
  if (sourceKind === 'openapi_http') return 'openapi' as const
  if (sourceKind === 'agent_plugin_mcp') return 'agent_plugin' as const
  if (sourceKind === 'ae_envelope') return 'legacy' as const
  return sourceKind ?? 'unavailable'
}

async function projectIdentity(
  ctx: MutationCtx | QueryCtx,
  identity: Doc<'capabilitySupplierOperationProjections'>,
  now: number,
  includeEvidence: boolean,
) {
  const [offering, revision, paths, publication, admissionCase, offboarding] = await Promise.all([
    ctx.db.query('businessOfferings').withIndex('by_offeringRef', (query) => query.eq('offeringRef', identity.offeringRef)).unique(),
    ctx.db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', (query) => query.eq('offeringRef', identity.offeringRef).eq('revision', identity.offeringRevision)).unique(),
    ctx.db.query('offeringAccessPaths').withIndex('by_offeringRef_and_offeringRevision', (query) => query.eq('offeringRef', identity.offeringRef).eq('offeringRevision', identity.offeringRevision)).take(MAX_ACCESS_PATHS_PER_OFFERING + 1),
    identity.publicationRef === undefined || identity.publicationRevision === undefined
      ? null
      : ctx.db.query('capabilityPublications').withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', identity.publicationRef as string).eq('revision', identity.publicationRevision as number)).unique(),
    identity.publicationRef === undefined || identity.publicationRevision === undefined
      ? null
      : ctx.db.query('capabilitySupplyAdmissionCases').withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', identity.publicationRef as string).eq('publicationRevision', identity.publicationRevision as number)).unique(),
    ctx.db.query('capabilityProviderOffboardingCases').withIndex('by_businessId_and_updatedAt', (query) => query.eq('businessId', identity.businessId)).order('desc').first(),
  ])
  if (offering === null || revision === null || offering.businessId !== identity.businessId || revision.businessId !== identity.businessId) return null
  const binding = identity.bindingId === undefined
    ? null
    : await ctx.db.query('capabilityTransportBindings').withIndex('by_bindingId', (query) => query.eq('bindingId', identity.bindingId as string)).unique()
  const connectionRef = publication?.connectionAuthority?.connectionRef
  const connection = connectionRef === undefined
    ? null
    : await ctx.db.query('capabilityProviderConnections').withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef)).unique()
  const qualification = publication === null || binding === null || identity.offeringId === undefined
    ? null
    : await qualifySuppliedCandidate(capabilitySupplyGraphPorts(ctx.db), {
        candidate: {
          publicationRef: publication.publicationRef,
          revision: publication.revision,
          networkId: publication.networkId,
          businessId: String(identity.businessId),
          offeringId: identity.offeringId,
          bindingId: binding.bindingId,
          contractRef: { capabilityId: publication.capabilityId, version: publication.version, contractDigest: publication.contractDigest },
        },
        now,
      })
  const windowStartAt = now - EVIDENCE_WINDOW_MS
  const [calls, qualifiedUses] = includeEvidence
    ? await Promise.all([
        ctx.db.query('capabilityOperationCallProjections').withIndex('by_operationRef_and_createdAt', (query) => query.eq('operationRef', identity.operationRef).gte('createdAt', windowStartAt)).take(EVIDENCE_READ_LIMIT + 1),
        ctx.db.query('qualifiedUseReceipts').withIndex('by_operationRef_and_qualifiedAt', (query) => query.eq('operationRef', identity.operationRef).gte('qualifiedAt', windowStartAt)).take(EVIDENCE_READ_LIMIT + 1),
      ])
    : [[], []]
  const blockers = new Set<string>(admissionCase?.blockerRefs ?? [])
  for (const reason of qualification?.reasons ?? []) blockers.add(reason)
  if (publication?.sourceAuthorityState === 'review_required') blockers.add('provider_authority_unverified')
  if (connectionRef !== undefined && (connection === null || connection.lifecycle !== 'active' || (connection.expiresAt !== undefined && connection.expiresAt <= now))) blockers.add('credential_lost')
  const routeabilityFrozen = offboarding?.routeabilityFrozenAt !== undefined
  if (routeabilityFrozen) blockers.add('provider_offboarding')
  const routeable = qualification?.status === 'eligible' && !routeabilityFrozen
  const setupComplete = publication !== null || paths.some((path) => path.integrationDraft !== undefined)
  const callsOverflow = calls.length > EVIDENCE_READ_LIMIT
  const usesOverflow = qualifiedUses.length > EVIDENCE_READ_LIMIT
  const boundedCalls = calls.slice(0, EVIDENCE_READ_LIMIT)
  const boundedUses = qualifiedUses.slice(0, EVIDENCE_READ_LIMIT)
  const status = projectSupplierOperationStatus({
    schemaVersion: 'supplier_operations:v1',
    businessRef: String(identity.businessId),
    providerRef: identity.providerRef,
    operationRef: identity.operationRef,
    revision: identity.publicationRevision ?? identity.offeringRevision,
    observedAt: publication?.readinessObservedAt ?? identity.updatedAt,
    ...(publication?.readinessValidUntil === undefined ? {} : { validUntil: publication.readinessValidUntil }),
    draftPresent: true,
    setupComplete,
    submitted: admissionCase !== null || publication !== null,
    reviewActive: admissionCase?.state === 'submitted' || admissionCase?.state === 'under_review',
    routeable,
    paused: offering.status === 'paused' || publication?.disposition === 'withdrawn',
    retired: offering.status === 'retired' || offboarding?.state === 'retired',
    retirementProven: offboarding?.state === 'retired',
    blockerCodes: [...blockers],
    source: {
      kind: sourceKind(publication?.sourceKind),
      ...(publication?.sourceRevision === undefined ? {} : { revision: publication.sourceRevision }),
      ...(publication?.sourceDigest === undefined ? {} : { digest: publication.sourceDigest }),
    },
    routeability: { available: routeable, reasonCodes: [...blockers] },
    authority: connectionRef === undefined
      ? publication?.sourceAuthorityState === 'verified' ? { kind: 'public' } : { kind: 'unverified' }
      : { kind: 'connection', connectionRef, providerRef: identity.providerRef },
    health: {
      connection: connectionRef === undefined ? 'not_required' : blockers.has('credential_lost') ? 'action_required' : 'connected',
      validation: admissionCase?.terminalDecision === 'published' ? 'passed' : admissionCase?.terminalDecision === 'action_required' ? 'failed' : admissionCase === null ? 'not_started' : 'in_progress',
      publication: offering.status === 'retired' ? 'removed' : offering.status === 'paused' || publication?.disposition === 'withdrawn' ? 'paused' : publication === null ? 'not_published' : 'published',
      freshness: publication?.readinessOutcome === 'healthy' && (publication.readinessValidUntil ?? 0) > now ? 'current' : publication?.readinessOutcome === undefined ? 'unobserved' : (publication.readinessValidUntil ?? 0) <= now ? 'stale' : 'failed',
      delivery: callsOverflow
        ? { kind: 'unavailable', reason: 'window_too_large', provenance: 'canonical_call_receipts' }
        : boundedCalls.length === 0
          ? { kind: 'unobserved', provenance: 'canonical_call_receipts' }
          : { kind: 'observed', deliveredCount: boundedCalls.filter((row) => row.deliveryState === 'delivered').length, notDeliveredCount: boundedCalls.filter((row) => row.deliveryState === 'not_delivered').length, unknownCount: boundedCalls.filter((row) => row.deliveryState === 'unknown').length, sampleSize: boundedCalls.length, lastObservedAt: Math.max(...boundedCalls.map((row) => row.updatedAt)), windowStartAt, windowEndAt: now, provenance: 'canonical_call_receipts' },
      usefulOutcome: usesOverflow
        ? { kind: 'unavailable', reason: 'window_too_large', provenance: 'qualified_use_receipts' }
        : boundedUses.length === 0
          ? { kind: 'unobserved', provenance: 'qualified_use_receipts' }
          : { kind: 'observed', qualifiedUseCount: boundedUses.length, lastObservedAt: Math.max(...boundedUses.map((row) => row.qualifiedAt)), windowStartAt, windowEndAt: now, provenance: 'qualified_use_receipts' },
      operationalConditions: [...blockers],
    },
  })
  return status
}

export const readOwner = query({
  args: {
    businessId: v.id('businesses'),
    offeringRef: v.string(),
    now: v.number(),
  },
  returns: ownerReadResultValue,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' as const }
    const business = await ctx.db.get(args.businessId)
    if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'not_found' as const }
    }
    const identity = await ctx.db.query('capabilitySupplierOperationProjections')
      .withIndex('by_businessId_and_offeringRef', (index) => index.eq('businessId', args.businessId).eq('offeringRef', args.offeringRef))
      .unique()
    if (identity === null) return { kind: 'not_found' as const }
    const [status, offering, revision, paths] = await Promise.all([
      projectIdentity(ctx, identity, args.now, true),
      ctx.db.query('businessOfferings')
        .withIndex('by_offeringRef', (index) => index.eq('offeringRef', identity.offeringRef))
        .unique(),
      ctx.db.query('businessOfferingRevisions')
        .withIndex('by_offeringRef_and_revision', (index) => index
          .eq('offeringRef', identity.offeringRef)
          .eq('revision', identity.offeringRevision))
        .unique(),
      ctx.db.query('offeringAccessPaths')
        .withIndex('by_offeringRef_and_offeringRevision', (index) => index.eq('offeringRef', identity.offeringRef).eq('offeringRevision', identity.offeringRevision))
        .take(21),
    ])
    if (
      status === null
      || offering === null
      || revision === null
      || offering.businessId !== args.businessId
      || revision.businessId !== args.businessId
      || paths.length > 20
    ) return { kind: 'not_found' as const }
    const resumeCandidateRef = paths.find((path) => path.integrationDraft !== undefined)?.integrationDraft?.candidateRef
    return {
      kind: 'available' as const,
      statusJson: JSON.stringify(status),
      operation: {
        offeringRef: offering.offeringRef,
        currentRevision: offering.currentRevision,
        name: revision.name,
        category: revision.category,
        summary: revision.summary,
        status: offering.status,
        accessPathCount: paths.filter((path) => path.status !== 'withdrawn').length,
      },
      ...(identity.publicationRef === undefined || identity.publicationRevision === undefined
        ? {}
        : {
            maintenance: {
              offeringRef: offering.offeringRef,
              offeringRevision: identity.offeringRevision,
              offeringSourceHash: revision.sourceHash,
              publicationRef: identity.publicationRef,
              publicationRevision: identity.publicationRevision,
            },
          }),
      ...(resumeCandidateRef === undefined ? {} : { resumeCandidateRef }),
    }
  },
})

export const listOwner = query({
  args: {
    businessId: v.id('businesses'),
    paginationOpts: paginationOptsValidator,
    now: v.number(),
  },
  returns: ownerListResultValue,
  handler: async (ctx, args) => {
    const actor = await resolveBusinessActor(ctx)
    if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' as const }
    const business = await ctx.db.get(args.businessId)
    if (business === null || business.owningAccountRef !== actor.canonicalAccountRef) {
      return { kind: 'not_found' as const }
    }
    const rows = await ctx.db.query('capabilitySupplierOperationProjections')
      .withIndex('by_businessId_and_updatedAt', (index) => index.eq('businessId', args.businessId))
      .order('desc')
      .paginate(args.paginationOpts)
    const page = await Promise.all(rows.page.map(async (identity) => {
      const [projected, offering, revision, paths] = await Promise.all([
        projectIdentity(ctx, identity, args.now, false),
        ctx.db.query('businessOfferings').withIndex('by_offeringRef', (index) => index.eq('offeringRef', identity.offeringRef)).unique(),
        ctx.db.query('businessOfferingRevisions').withIndex('by_offeringRef_and_revision', (index) => index.eq('offeringRef', identity.offeringRef).eq('revision', identity.offeringRevision)).unique(),
        ctx.db.query('offeringAccessPaths').withIndex('by_offeringRef_and_offeringRevision', (index) => index.eq('offeringRef', identity.offeringRef).eq('offeringRevision', identity.offeringRevision)).take(MAX_ACCESS_PATHS_PER_OFFERING + 1),
      ])
      if (projected === null || offering === null || revision === null || offering.businessId !== args.businessId || revision.businessId !== args.businessId) return null
      return {
        offeringRef: identity.offeringRef,
        currentRevision: offering.currentRevision,
        name: revision.name,
        category: revision.category,
        summary: revision.summary,
        status: offering.status,
        accessPathCount: paths.filter((path) => path.status !== 'withdrawn').length,
        statusJson: JSON.stringify(projected),
      }
    }))
    return {
      kind: 'available' as const,
      page: page.flatMap((item) => item === null ? [] : [item]),
      isDone: rows.isDone,
      continueCursor: rows.continueCursor,
    }
  },
})

export const listAgent = mutation({
  args: { ...agentReadArgs, paginationOpts: paginationOptsValidator },
  returns: listResultValue,
  handler: async (ctx, args) => {
    if ((await requireSourceWrite(ctx, args, 'catalog_publish')).kind === 'rejected') return { kind: 'not_found' as const }
    if ((await authorize(ctx, args)) === null) return { kind: 'not_found' as const }
    const rows = await ctx.db.query('capabilitySupplierOperationProjections')
      .withIndex('by_businessId_and_updatedAt', (query) => query.eq('businessId', args.businessId))
      .order('desc')
      .paginate(args.paginationOpts)
    const now = Date.now()
    const statuses = await Promise.all(rows.page.map((row) => projectIdentity(ctx, row, now, false)))
    return { kind: 'available' as const, page: statuses.flatMap((status) => status === null ? [] : [{ statusJson: JSON.stringify(status) }]), isDone: rows.isDone, continueCursor: rows.continueCursor }
  },
})

export const readAgent = mutation({
  args: { ...agentReadArgs, operationRef: v.string() },
  returns: readResultValue,
  handler: async (ctx, args) => {
    if ((await requireSourceWrite(ctx, args, 'catalog_publish')).kind === 'rejected') return { kind: 'not_found' as const }
    if ((await authorize(ctx, args)) === null) return { kind: 'not_found' as const }
    const identity = await ctx.db.query('capabilitySupplierOperationProjections')
      .withIndex('by_businessId_and_operationRef', (query) => query.eq('businessId', args.businessId).eq('operationRef', args.operationRef))
      .unique()
    if (identity === null) return { kind: 'not_found' as const }
    const status = await projectIdentity(ctx, identity, Date.now(), true)
    return status === null ? { kind: 'not_found' as const } : { kind: 'available' as const, statusJson: JSON.stringify(status) }
  },
})

const backfillResultValue = v.object({
  processed: v.number(),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

export const backfillDraftPage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: backfillResultValue,
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('offeringAccessPaths').paginate(args.paginationOpts)
    let processed = 0
    for (const path of rows.page) {
      if (path.integrationDraft === undefined) continue
      const offering = await ctx.db.query('businessOfferings')
        .withIndex('by_offeringRef', (query) => query.eq('offeringRef', path.offeringRef))
        .unique()
      if (offering === null || offering.businessId !== path.businessId) continue
      await upsertSupplierOperationIdentity(ctx, {
        businessId: path.businessId,
        providerRef: String(path.businessId),
        operationRef: path.offeringRef,
        offeringRef: path.offeringRef,
        offeringRevision: path.offeringRevision,
        updatedAt: path.integrationDraft.updatedAt,
      })
      processed += 1
    }
    return { processed, isDone: rows.isDone, continueCursor: rows.continueCursor }
  },
})

export const backfillAdmissionPage = internalMutation({
  args: { paginationOpts: paginationOptsValidator },
  returns: backfillResultValue,
  handler: async (ctx, args) => {
    const rows = await ctx.db.query('capabilitySupplyAdmissionCases').paginate(args.paginationOpts)
    let processed = 0
    for (const admission of rows.page) {
      const publication = await ctx.db.query('capabilityPublications')
        .withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', admission.publicationRef).eq('revision', admission.publicationRevision))
        .unique()
      const canonicalOffering = publication === null
        ? null
        : await ctx.db.query('capabilityOfferings').withIndex('by_offeringId', (query) => query.eq('offeringId', publication.offeringId)).unique()
      const origin = canonicalOffering?.origin
      if (publication === null || canonicalOffering === null || origin?.kind !== 'catalog_offering') continue
      await upsertSupplierOperationIdentity(ctx, {
        businessId: admission.businessId,
        providerRef: admission.providerRef,
        operationRef: admission.operationRef,
        offeringRef: origin.offeringRef,
        offeringRevision: origin.offeringRevision,
        publicationRef: admission.publicationRef,
        publicationRevision: admission.publicationRevision,
        offeringId: publication.offeringId,
        bindingId: publication.bindingId,
        updatedAt: admission.updatedAt,
      })
      processed += 1
    }
    return { processed, isDone: rows.isDone, continueCursor: rows.continueCursor }
  },
})
