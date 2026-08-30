import { v, type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { pricingConfigDigest, type PricingConfig } from '@/modules/money/public'
import { stableStringify } from '@/modules/common/stable-hash'
import {
  capabilityPublicationProvenanceDigest,
  preparePublicationDraft,
  refreshCapabilityCommand,
  withdrawCapabilityCommand,
} from '@/modules/capability-supply/public'
import {
  createX402ProviderConnection,
  isCanonicalCredentiallessX402ProviderConnection,
} from '@/modules/capability-supply/provider-connection'
import {
  FACILITATOR_DISCOVERY_PUBLISHER_REF,
  dereferenceLocalSchema,
  parseFacilitatorDiscoverySourceImport,
} from '@/modules/capability-supply/convex'
import { isRecord } from '@/modules/common/is-record'
import { generateAccountRef } from '@/modules/principal-account/account/public'

import type { Id } from './_generated/dataModel'
import { internalMutation, type MutationCtx } from './_generated/server'
import { toDomain, toRow } from './lib/providerConnections/lifecycle'
import {
  capabilityPublicationBindingValue,
  capabilityPublicationOfferingValue,
  publicationPorts,
  publishBootstrapCapability,
} from './capabilitySupplyPublish'
import { rebuildCapabilityOriginSupplyProjection } from './capabilitySupplyShared'
import {
  parseWorkloadCronSnapshot,
  reconcileWorkloadCronSnapshot,
  workloadCronSnapshotValue,
} from './workloadCron'
const SOURCE_EVIDENCE = 'source:facilitator-discovery'
const BUSINESS_SOURCE_KIND = 'facilitator-discovery-business:v1'
const MAX_RECONCILE_ITEMS = 100
const MAX_RECONCILE_ITEM_BYTES = 262_144
const MAX_SEEN_PUBLICATION_REFS = 2_000
const MAX_PUBLICATION_REF_LENGTH = 240
const textEncoder = new TextEncoder()
const exactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})
const facilitatorDiscoveryAdmissionValue = v.object({
  offering: capabilityPublicationOfferingValue,
  binding: capabilityPublicationBindingValue,
  execution: v.object({
    endpoint: v.object({ url: v.string() }),
    method: v.union(v.literal('GET'), v.literal('POST')),
    query: v.optional(v.array(v.object({
      inputPointer: v.string(),
      parameter: v.string(),
      required: v.optional(v.boolean()),
    }))),
  }),
  price: v.object({
    provider: exactAmountValue,
    platformFee: exactAmountValue,
    total: exactAmountValue,
    feeBps: v.literal(1_000),
  }),
  sourceImportJson: v.string(),
  sourceRevision: v.string(),
})
type FacilitatorDiscoveryAdmissionItem = Infer<typeof facilitatorDiscoveryAdmissionValue>
const reconcileResult = v.object({
  admitted: v.number(),
  published: v.number(),
  skipped: v.number(),
  withdrawn: v.number(),
  seenPublicationRefs: v.array(v.string()),
  deadlineExceeded: v.boolean(),
})

async function publishFacilitatorDiscoveryCapability(
  ctx: MutationCtx,
  input: Parameters<typeof publishBootstrapCapability>[1],
) {
  return publishBootstrapCapability(ctx, input, {
    kind: 'system',
    ref: FACILITATOR_DISCOVERY_PUBLISHER_REF,
  })
}

async function refreshFacilitatorDiscoveryCapability(
  ctx: MutationCtx,
  input: Parameters<typeof refreshCapabilityCommand>[0],
  pricingConfig: PricingConfig,
  sourceRevision: string,
) {
  if (
    input.publication.publisherRef !== FACILITATOR_DISCOVERY_PUBLISHER_REF
    || input.publication.authorityMode !== 'observed_external'
  ) {
    return { kind: 'refused' as const, reason: 'refresh_invalid' as const }
  }
  const result = await refreshCapabilityCommand(input, publicationPorts(ctx))
  if (result.kind !== 'refreshed') return result
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => (
      query.eq('publicationRef', result.publicationRef).eq('revision', result.revision)
    )).unique()
  if (publication === null) throw new Error('facilitator_discovery_publication_missing_after_refresh')
  if (
    publication.publisherRef !== FACILITATOR_DISCOVERY_PUBLISHER_REF
    || publication.authorityMode !== 'observed_external'
  ) {
    throw new Error('facilitator_discovery_publication_provenance_invalid')
  }
  await ctx.db.patch(publication._id, {
    pricingConfigJson: stableStringify(pricingConfig as StableHashValue),
    priceDigest: pricingConfigDigest(pricingConfig),
    sourceRevision,
    provenanceDigest: capabilityPublicationProvenanceDigest({
      publisherRef: publication.publisherRef,
      authorityMode: publication.authorityMode,
      sourceRevision,
      sourceDigest: publication.sourceDigest,
    }),
  })
  await rebuildCapabilityOriginSupplyProjection(
    ctx,
    publication.businessId,
    input.now,
  )
  return result
}

async function withdrawFacilitatorDiscoveryCapability(
  ctx: MutationCtx,
  input: Readonly<{
    publicationRef: string
    expectedRevision: number
    evidenceRefs: readonly string[]
    now: number
  }>,
) {
  const ports = publicationPorts(ctx)
  const publication = await ports.loadPublicationAtRevision(
    input.publicationRef,
    input.expectedRevision,
  )
  if (publication === null) {
    return {
      kind: 'refused' as const,
      reason: 'publication_not_found' as const,
    }
  }
  if (
    publication.publisherRef !== FACILITATOR_DISCOVERY_PUBLISHER_REF
    || publication.authorityMode !== 'observed_external'
  ) {
    return {
      kind: 'refused' as const,
      reason: 'authorization_denied' as const,
    }
  }
  const result = await withdrawCapabilityCommand(
    {
      publication,
      evidenceRefs: input.evidenceRefs,
      now: input.now,
    },
    ports,
  )
  if (result.kind === 'withdrawn') {
    await rebuildCapabilityOriginSupplyProjection(
      ctx,
      publication.businessId as Id<'businesses'>,
      input.now,
    )
  }
  return result
}

export const reconcile = internalMutation({
  args: {
    items: v.array(facilitatorDiscoveryAdmissionValue),
    complete: v.boolean(),
    seenPublicationRefs: v.optional(v.array(v.string())),
    deadlineAt: v.number(),
    workload: workloadCronSnapshotValue,
  },
  returns: reconcileResult,
  handler: async (ctx, args) => {
    await reconcileWorkloadCronSnapshot(
      ctx,
      args.workload.name,
      parseWorkloadCronSnapshot(args.workload),
    )
    if (
      args.items.length > MAX_RECONCILE_ITEMS
      || args.items.some((item) => {
        const serialized = JSON.stringify(item)
        return serialized === undefined
          || textEncoder.encode(serialized).byteLength > MAX_RECONCILE_ITEM_BYTES
      })
      || (args.seenPublicationRefs?.length ?? 0) > MAX_SEEN_PUBLICATION_REFS
      || args.seenPublicationRefs?.some((ref) => ref.length === 0 || ref.length > MAX_PUBLICATION_REF_LENGTH)
    ) {
      throw new Error('facilitator_discovery_batch_invalid')
    }
    if (!Number.isFinite(args.deadlineAt) || Date.now() >= args.deadlineAt) {
      return {
        admitted: 0,
        published: 0,
        skipped: 0,
        withdrawn: 0,
        seenPublicationRefs: [],
        deadlineExceeded: true,
      }
    }
    let published = 0
    let skipped = 0
    const seenPublicationRefs = new Set(args.seenPublicationRefs ?? [])
    const candidates = args.items.filter((item) => {
      if (parseFacilitatorDiscoverySourceImport(item.sourceImportJson) === undefined) {
        skipped += 1
        return false
      }
      return true
    })
    let deadlineExceeded = false
    if (Date.now() >= args.deadlineAt) deadlineExceeded = true
    for (const draft of candidates) {
      if (deadlineExceeded) break
      if (Date.now() >= args.deadlineAt) {
        deadlineExceeded = true
        break
      }
      seenPublicationRefs.add(draft.offering.offeringId)
      const result = await reconcileDraft(ctx, draft, Date.now())
      if (result === 'published') published += 1
      if (result === 'skipped') skipped += 1
    }
    if (Date.now() >= args.deadlineAt) deadlineExceeded = true
    const withdrawn = args.complete && !deadlineExceeded && Date.now() < args.deadlineAt
      ? await withdrawMissing(ctx, seenPublicationRefs, Date.now(), args.deadlineAt)
      : 0
    return {
      admitted: candidates.length,
      published,
      skipped,
      withdrawn,
      seenPublicationRefs: [...seenPublicationRefs].sort(),
      deadlineExceeded,
    }
  },
})

async function reconcileDraft(
  ctx: MutationCtx,
  draft: FacilitatorDiscoveryAdmissionItem,
  now: number,
): Promise<'published' | 'skipped'> {
  const sourceImport = parseFacilitatorDiscoverySourceImport(draft.sourceImportJson)
  if (sourceImport === undefined) return 'skipped'
  const route = routeIdentity(sourceImport)
  if (route === undefined) return 'skipped'
  const pricingConfig: PricingConfig = {
    version: 'pricing:v2',
    unit: 'call',
    providerAmount: draft.price.provider,
    platformFee: draft.price.platformFee,
    paidAmount: draft.price.total,
  }
  const sourceRevision = draft.sourceRevision
  const probe = await preparePublicationDraft({
    source: sourceImport,
    sourceRevision,
    pricingConfig,
    offering: draft.offering,
    binding: draft.binding,
    evidenceRefs: [SOURCE_EVIDENCE],
    derefSchema: dereferenceLocalSchema,
  })
  if (probe.kind === 'refused') return 'skipped'
  const business = await ensureProviderBusiness(ctx, route.host, now)
  if (business === undefined) return 'skipped'
  const connection = await ensureProviderConnection(ctx, business.businessId, route.resourceUrl, now)
  if (connection === undefined) {
    if (business.created || business.activated) throw new Error('facilitator_discovery_connection_unavailable')
    return 'skipped'
  }
  const binding = {
    ...draft.binding,
    authority: {
      kind: 'provider_connection' as const,
      connectionRef: connection.connectionRef,
      providerRef: connection.providerRef,
    },
  }
  const prepared = await preparePublicationDraft({
    source: sourceImport,
    sourceRevision,
    pricingConfig,
    offering: draft.offering,
    binding,
    evidenceRefs: [SOURCE_EVIDENCE],
    derefSchema: dereferenceLocalSchema,
  })
  if (prepared.kind === 'refused') {
    if (business.created || business.activated) {
      throw new Error(`facilitator_discovery_publication_prepare_failed:${prepared.reason}`)
    }
    return 'skipped'
  }
  const publicationRef = draft.offering.offeringId
  const current = await currentPublication(ctx, publicationRef)
  const priceDigest = pricingConfigDigest(pricingConfig)
  if (current !== undefined
    && current.publisherRef === FACILITATOR_DISCOVERY_PUBLISHER_REF
    && current.authorityMode === 'observed_external'
    && current.sourceDigest === prepared.sourceDigest
    && current.priceDigest === priceDigest
    && current.sourceRevision === sourceRevision) return 'skipped'

  const operationDigest = canonicalDigest({ publicationRef, sourceRevision, sourceDigest: prepared.sourceDigest })
  const context = {
    operationKey: `facilitator-discovery:${operationDigest.slice(7)}`,
    correlationId: `facilitator-discovery:${canonicalDigest(route).slice(7)}`,
    reasonCode: 'facilitator_discovery_ingest',
    evidenceRefs: [SOURCE_EVIDENCE],
    now,
  }
  if (current === undefined) {
    const result = await publishFacilitatorDiscoveryCapability(ctx, {
      businessId: String(business.businessId),
      runtimeEnvironment: 'production',
      prepared: prepared.prepared,
      publicationMetadata: {
        sourceRevision: prepared.prepared.sourceRevision,
        authorityMode: 'observed_external',
        publisherRef: FACILITATOR_DISCOVERY_PUBLISHER_REF,
        provenanceDigest: capabilityPublicationProvenanceDigest({
          publisherRef: FACILITATOR_DISCOVERY_PUBLISHER_REF,
          authorityMode: 'observed_external',
          sourceRevision: prepared.prepared.sourceRevision,
          sourceDigest: prepared.prepared.sourceDigest,
        }),
      },
      ...context,
    })
    if (result.kind === 'refused') {
      if (business.created || business.activated) {
        throw new Error(`facilitator_discovery_publication_failed:${result.reason}`)
      }
      return 'skipped'
    }
    return 'published'
  }
  const result = await refreshFacilitatorDiscoveryCapability(ctx, {
    publication: current,
    source: sourceImport,
    offering: draft.offering,
    binding,
    ...context,
  }, pricingConfig, sourceRevision)
  return result.kind === 'refreshed' ? 'published' : 'skipped'
}

function routeIdentity(
  sourceImport: Readonly<{ resource: unknown }>,
): Readonly<{
  host: string
  resourceUrl: string
}> | undefined {
  const resource = isRecord(sourceImport.resource) ? sourceImport.resource : undefined
  const rawUrl = typeof resource?.resourceUrl === 'string' ? resource.resourceUrl : undefined
  if (rawUrl === undefined) return undefined
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '' || parsed.hash !== '') return undefined
    return { host: parsed.host.toLowerCase(), resourceUrl: parsed.toString() }
  } catch {
    return undefined
  }
}

async function ensureProviderBusiness(
  ctx: MutationCtx,
  host: string,
  now: number,
): Promise<Readonly<{ businessId: Id<'businesses'>; created: boolean; activated: boolean }> | undefined> {
  const businessSlug = providerBusinessSlug(host)
  const existingBusiness = await ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', businessSlug)).unique()
  if (existingBusiness !== null) {
    if (existingBusiness.suppressedAt !== undefined) return undefined
    if (existingBusiness.businessContext.kind !== 'programmable_provider'
      || existingBusiness.businessContext.providerIdentifier !== `provider:x402:${host}`) return undefined
    const activated = existingBusiness.publicStatus !== 'published'
    if (activated) await ctx.db.patch(existingBusiness._id, { publicStatus: 'published', updatedAt: now })
    return { businessId: existingBusiness._id, created: false, activated }
  }
  const sourceHash = canonicalDigest({ kind: BUSINESS_SOURCE_KIND, host })
  const businessId = await ctx.db.insert('businesses', {
    owningAccountRef: generateAccountRef(),
    slug: businessSlug,
    name: `x402 ${host}`,
    normalizedName: `x402 ${host}`.toLowerCase(),
    category: 'programmable provider',
    businessContext: {
      kind: 'programmable_provider',
      website: `https://${host}`,
      providerIdentifier: `provider:x402:${host}`,
    },
    publicStatus: 'published',
    trustTier: 'registry_verified',
    sourceHash,
    createdAt: now,
    updatedAt: now,
  })
  return { businessId, created: true, activated: false }
}

function providerBusinessSlug(host: string): string {
  const token = host.replace(/[^a-z0-9]+/giu, '-').replace(/^-|-$/gu, '').toLowerCase()
  return `x402-${(token || 'provider').slice(0, 160)}-${canonicalDigest(host).slice(7, 19)}`
}

async function ensureProviderConnection(
  ctx: MutationCtx,
  businessId: Id<'businesses'>,
  resourceUrl: string,
  now: number,
) {
  const parsed = new URL(resourceUrl)
  const identity = { businessId: String(businessId), resourceUrl }
  const connectionRef = `connection:x402:${canonicalDigest(identity)}`
  const providerRef = `provider:x402:${parsed.host.toLowerCase()}`
  const providerAccountRef = `x402:${resourceUrl}`
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef)).unique()
  if (existing !== null) {
    const connection = toDomain(existing)
    return connection.lifecycle === 'active'
      && connection.businessId === String(businessId)
      && connection.providerRef === providerRef
      && connection.providerAccountRef === providerAccountRef
      && isCanonicalCredentiallessX402ProviderConnection(connection)
      ? connection
      : undefined
  }
  const business = await ctx.db.get(businessId)
  if (business === null) return undefined
  const commandId = `facilitator-discovery:connection:${canonicalDigest(identity).slice(7)}`
  const result = createX402ProviderConnection({
    commandId,
    connectionRef,
    businessId: String(businessId),
    providerRef,
    providerAccountRef,
    resourceUrl,
    evidenceRefs: [SOURCE_EVIDENCE],
    owningAccountRef: business.owningAccountRef,
    installedByPrincipalRef: FACILITATOR_DISCOVERY_PUBLISHER_REF,
    authorityGrantRef: `observed:${FACILITATOR_DISCOVERY_PUBLISHER_REF}`,
    authorityGrantGeneration: 1,
  }, now)
  if (result.kind !== 'applied') return undefined
  await ctx.db.insert('capabilityProviderConnections', toRow(result.connection, commandId, result.commandDigest))
  return result.connection
}

async function currentPublication(ctx: MutationCtx, publicationRef: string) {
  const publication = (await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (query) => query.eq('publicationRef', publicationRef))
    .order('desc').take(100)).find((candidate) => (
      candidate.disposition === 'current' && candidate.publisherRef === FACILITATOR_DISCOVERY_PUBLISHER_REF
    ))
  if (publication === undefined) return undefined
  return (await publicationPorts(ctx).loadPublicationAtRevision(publicationRef, publication.revision)) ?? undefined
}

async function withdrawMissing(
  ctx: MutationCtx,
  seen: ReadonlySet<string>,
  now: number,
  deadlineAt: number,
): Promise<number> {
  if (Date.now() >= deadlineAt) return 0
  const rows = await ctx.db.query('capabilityPublications')
    .withIndex('by_networkId_and_disposition', (query) => query.eq('networkId', 'ae:public').eq('disposition', 'current'))
    .take(1000)
  const missing = rows.filter((row) => (
    row.publisherRef === FACILITATOR_DISCOVERY_PUBLISHER_REF
    && row.sourceRevision.startsWith('facilitator-discovery:')
    && !seen.has(row.publicationRef)
  ))
  let withdrawn = 0
  const businessIds = new Set<Id<'businesses'>>()
  for (const publication of missing) {
    if (Date.now() >= deadlineAt) return withdrawn
    const result = await withdrawFacilitatorDiscoveryCapability(ctx, {
      publicationRef: publication.publicationRef,
      expectedRevision: publication.revision,
      evidenceRefs: [SOURCE_EVIDENCE],
      now,
    })
    if (result.kind === 'withdrawn') {
      withdrawn += 1
      businessIds.add(publication.businessId as Id<'businesses'>)
    }
  }
  for (const businessId of businessIds) {
    if (Date.now() >= deadlineAt) return withdrawn
    const remaining = await ctx.db.query('capabilityPublications')
      .withIndex('by_businessId_and_disposition', (query) => query.eq('businessId', businessId).eq('disposition', 'current'))
      .take(1)
    if (remaining.length !== 0) continue
    const business = await ctx.db.get(businessId)
    if (business === null) continue
    if (business.businessContext.kind === 'programmable_provider'
      && business.businessContext.providerIdentifier.startsWith('provider:x402:')) {
      await ctx.db.patch(businessId, { publicStatus: 'unpublished', updatedAt: now })
    }
  }
  return withdrawn
}
