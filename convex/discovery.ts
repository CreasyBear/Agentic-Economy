import { mutationGeneric, paginationOptsValidator, queryGeneric, type PaginationOptions } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { internalMutation, type DatabaseReader, type DatabaseWriter, type MutationCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import {
  buildCatalogDiscoveryManifest,
  buildOfferingLlmsTxt,
} from '../src/modules/discovery/convex'
import type {
  DiscoveryManifestContract,
  DiscoveryManifestReadback,
} from '../src/modules/discovery/public'
import {
  projectBusinessSupplyToPublicApi,
  type PublicBusinessCatalogApiV2Dto,
} from '../src/modules/registry/public'
import { internal } from './_generated/api'
import { resolveBusinessActor } from './authz'
import { requireSourceWrite, sourceWriteArgs, type SourceWriteArgs } from './sourceWriteAdmission'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { brandNonEmpty } from '../src/modules/common/ids'
import { isRecord } from '../src/modules/common/is-record'
import { normalizeSlug } from '../src/modules/common/normalize-slug'
import { trimTrailingSlashes } from '../src/modules/common/trim-trailing-slashes'
import { hasActiveBusinessSuppression } from './catalogRuntimeQueries'
import { readBusinessSupplyProjectionSnapshot } from './businessSupplyProjectionSnapshot'
import { compareExactAmounts, exactAmountSchema } from '../src/modules/money/public'
import type { BusinessMutationActor } from '../src/modules/business/public'
import { businessContext as businessContextResult } from '../src/modules/business/public'

const routeResult = v.object({
  kind: v.union(v.literal('business_page'), v.literal('ucp_manifest'), v.literal('api_detail')),
  url: v.string(),
  routeTested: v.literal(true),
})

const exactAmountResult = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})

const manifestPriceResult = v.union(
  v.object({
    kind: v.literal('quote_only'),
    currency: v.string(),
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
  v.object({
    kind: v.union(v.literal('fixed'), v.literal('from')),
    amount: exactAmountResult,
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
  v.object({
    kind: v.literal('range'),
    minimum: exactAmountResult,
    maximum: exactAmountResult,
    unit: v.optional(v.union(v.literal('call'), v.literal('job'), v.literal('hour'), v.literal('visit'), v.literal('item'), v.literal('day'), v.literal('week'), v.literal('month'))),
    taxTreatment: v.union(v.literal('inclusive'), v.literal('exclusive'), v.literal('unstated')),
  }),
)

const manifestAccessPathResult = v.union(
  v.object({
    accessPathRef: v.string(),
    offeringRevision: v.number(),
    kind: v.literal('human_request'),
    channel: v.union(v.literal('phone'), v.literal('website'), v.literal('ae_inquiry')),
    disclosure: v.string(),
    url: v.optional(v.string()),
  }),
  v.object({
    accessPathRef: v.string(),
    offeringRevision: v.number(),
    kind: v.literal('external_operation'),
    name: v.string(),
    summary: v.string(),
    url: v.string(),
    method: v.optional(v.string()),
    documentationUrl: v.optional(v.string()),
    interfaceDescription: v.optional(v.object({ format: v.string(), url: v.optional(v.string()) })),
    authenticationSummary: v.optional(v.string()),
    pricingSummary: v.optional(v.string()),
    provenance: v.union(v.literal('business_declared'), v.literal('publicly_observed')),
  }),
)

const manifestOfferingResult = v.object({
  offeringRef: v.string(),
  revision: v.number(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceAreaSummary: v.optional(v.string()),
  availabilitySummary: v.optional(v.string()),
  pricingSummary: v.optional(v.string()),
  price: v.optional(manifestPriceResult),
  accessPaths: v.array(manifestAccessPathResult),
  support: v.object({
    integrated: v.boolean(),
    aeSupportedAction: v.boolean(),
    observedAt: v.optional(v.number()),
    validUntil: v.optional(v.number()),
  }),
})

const currentManifestResult = v.object({
  schemaVersion: v.literal('ae-ucp-fallback:v1'),
  businessCatalogSchemaVersion: v.literal('public-business-catalog-api:v2'),
  businessId: v.string(),
  slug: v.string(),
  businessName: v.string(),
  category: v.string(),
  businessContext: businessContextResult,
  publicUrl: v.string(),
  manifestUrl: v.string(),
  ucpVersion: v.string(),
  pathKind: v.literal('ae_hosted_fallback'),
  disposition: v.union(v.literal('current'), v.literal('partial'), v.literal('stale')),
  sourceHash: v.optional(v.string()),
  sourceVersion: v.literal('public-catalog:v1'),
  generatedHash: v.string(),
  bodyHash: v.string(),
  urlHash: v.string(),
  generatedAt: v.number(),
  observedAt: v.number(),
  routes: v.array(routeResult),
  offerings: v.array(manifestOfferingResult),
  degradedReason: v.optional(v.string()),
  suppressedAt: v.optional(v.number()),
})


const legacyManifestCapabilityResult = v.object({
  kind: v.union(
    v.literal('phone_inquiry'),
    v.literal('quote_request'),
    v.literal('emergency_callout_interest'),
    v.literal('ae_hosted_discovery'),
  ),
  status: v.union(v.literal('available'), v.literal('degraded'), v.literal('unavailable'), v.literal('stale')),
  firstRequest: v.object({
    mode: v.union(v.literal('inquiry_available'), v.literal('quote_request_available'), v.literal('not_available_yet')),
    publicDisclosure: v.string(),
    publicChannel: v.union(v.literal('public_business_contact'), v.literal('ae_status_only'), v.literal('not_available')),
    noContactReason: v.optional(v.string()),
  }),
  callable: v.literal(false),
  paymentRequired: v.literal(false),
  reason: v.optional(v.string()),
})

const legacyManifestServiceResult = v.object({
  slug: v.string(),
  name: v.string(),
  category: v.string(),
  summary: v.string(),
  serviceArea: v.string(),
  hoursOrUnknown: v.string(),
  status: v.literal('published'),
  capabilities: v.array(legacyManifestCapabilityResult),
})

const legacyUnavailableManifestResult = v.object({
  kind: v.literal('legacy_unavailable'),
  reason: v.literal('offering_identity_unavailable'),
  schemaVersion: v.string(),
  businessId: v.string(),
  slug: v.string(),
  businessName: v.string(),
  category: v.string(),
  location: v.object({
    suburb: v.string(),
    stateTerritory: v.string(),
    postcode: v.optional(v.string()),
  }),
  publicUrl: v.string(),
  manifestUrl: v.string(),
  ucpVersion: v.string(),
  pathKind: v.union(v.literal('ae_hosted_fallback'), v.literal('business_origin_standard')),
  status: v.union(v.literal('unavailable'), v.literal('degraded'), v.literal('available'), v.literal('stale')),
  sourceHash: v.string(),
  sourceVersion: v.string(),
  generatedHash: v.string(),
  bodyHash: v.string(),
  urlHash: v.string(),
  generatedAt: v.number(),
  updatedAt: v.number(),
  degradedReason: v.optional(v.string()),
  suppressedAt: v.optional(v.number()),
  routes: v.array(routeResult),
  services: v.array(legacyManifestServiceResult),
  unsupportedCapabilities: v.object({
    callable: v.literal(false),
    paymentRequired: v.literal(false),
  }),
})

const manifestResult = v.union(currentManifestResult, legacyUnavailableManifestResult)

const readbackResult = v.object({
  businessId: v.string(),
  slug: v.string(),
  manifestUrl: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
  sourceHash: v.string(),
  generatedHash: v.string(),
  bodyHash: v.string(),
  urlHash: v.string(),
  routeUrls: v.array(v.string()),
  readAt: v.number(),
})

const attemptResult = v.object({
  attemptId: v.string(),
  businessId: v.string(),
  ucpVersion: v.string(),
  pathKind: v.literal('ae_hosted_fallback'),
  sourceHash: v.string(),
  sourceVersion: v.literal('public-catalog:v1'),
  status: v.union(v.literal('queued'), v.literal('succeeded'), v.literal('failed'), v.literal('stale')),
  retryCount: v.number(),
  failureCode: v.optional(v.string()),
  failureMessageRedacted: v.optional(v.string()),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  generatedHash: v.optional(v.string()),
  bodyHash: v.optional(v.string()),
  urlHash: v.optional(v.string()),
  latestReadback: v.optional(readbackResult),
  staleThresholdAt: v.optional(v.number()),
  repairAction: v.union(v.literal('regenerate_manifest'), v.literal('invalidate_manifest'), v.literal('no_repair')),
  repairResult: v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed')),
})

const auditEventResult = v.object({
  eventId: v.string(),
  eventType: v.string(),
  actorKind: v.string(),
  actorRef: v.string(),
  businessId: v.optional(v.string()),
  targetType: v.string(),
  targetRef: v.string(),
  beforeState: v.optional(v.string()),
  afterState: v.optional(v.string()),
  idempotencyKey: v.string(),
  correlationId: v.string(),
  evidenceRefs: v.array(v.string()),
  redactedPayloadJson: v.string(),
  payloadHash: v.string(),
  failureCode: v.optional(v.string()),
  createdAt: v.number(),
})

const discoveryManifestErrorCodeMembers = [
  v.literal('discovery_manifest_unauthenticated'),
  v.literal('discovery_manifest_csrf_rejected'),
  v.literal('discovery_manifest_wrong_owner'),
  v.literal('discovery_manifest_not_public'),
  v.literal('discovery_manifest_canonical_unconfigured'),
] as const
const discoveryManifestErrorCode = v.union(...discoveryManifestErrorCodeMembers)
const regenerateResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(v.literal('discovery_manifest_generated'), v.literal('discovery_manifest_replayed')),
    manifest: manifestResult,
    attempt: attemptResult,
    auditEvent: auditEventResult,
  }),
  v.object({
    kind: v.literal('error'),
    code: v.union(...discoveryManifestErrorCodeMembers, v.literal('discovery_manifest_failed')),
    retryable: v.boolean(),
    reason: v.string(),
    attempt: v.optional(attemptResult),
    auditEvent: v.optional(auditEventResult),
  })
)

const invalidateResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.literal('discovery_manifest_invalidated'),
    attempts: v.array(attemptResult),
    manifests: v.array(manifestResult),
  }),
  v.object({
    kind: v.literal('error'),
    code: discoveryManifestErrorCode,
    retryable: v.boolean(),
    reason: v.string(),
  })
)

const healthResult = v.object({
  businessId: v.string(),
  sourceState: v.union(v.literal('published'), v.literal('not_public')),
  discoveryStatus: v.union(v.literal('unavailable'), v.literal('degraded'), v.literal('available'), v.literal('stale')),
  latestManifest: v.optional(manifestResult),
  latestAttempt: v.optional(attemptResult),
  affectedPublicSurfaces: v.array(v.string()),
  repairAction: v.union(v.literal('regenerate_manifest'), v.literal('invalidate_manifest'), v.literal('no_repair')),
  repairResult: v.union(v.literal('not_run'), v.literal('succeeded'), v.literal('failed')),
})

const manifestReadResult = v.union(
  v.object({
    kind: v.literal('available'),
    manifest: manifestResult,
  }),
  v.object({
    kind: v.literal('hidden'),
    reason: v.union(v.literal('not_public'), v.literal('no_public_catalog'), v.literal('unconfigured')),
  })
)

const discoveryFileResult = v.object({
  body: v.string(),
  urls: v.array(v.string()),
})

const discoverySlugPageResult = v.object({
  page: v.array(v.string()),
  isDone: v.boolean(),
  continueCursor: v.string(),
})

const DISCOVERY_SITEMAP_PAGE_SIZE = 50
const DISCOVERY_LLMS_SAMPLE_SIZE = 12
const DISCOVERY_INVALIDATION_BATCH_SIZE = 50

const discoveryMutationAuthArgs = {
  operationKey: v.string(),
  correlationId: v.string(),
}
export const regenerateDiscoveryManifest = mutationGeneric({
  args: {
    businessId: v.optional(v.id('businesses')),
    slug: v.optional(v.string()),
    canonicalBaseUrl: v.optional(v.string()),
    ...discoveryMutationAuthArgs,
    ...sourceWriteArgs,
  },
  returns: regenerateResult,
  handler: async (): Promise<Infer<typeof regenerateResult>> => ({
    kind: 'error',
    code: 'discovery_manifest_failed',
    retryable: false,
    reason: 'Discovery manifests are retired.',
  }),
})

/** System-callable (no owner gate) discovery-manifest generation for dev seeding. */
export async function seedDiscoveryManifestForBusinessCommand(
  db: DatabaseWriter,
  business: Doc<'businesses'>,
  now: number,
): Promise<'generated' | 'skipped'> {
  void db
  void business
  void now
  return 'skipped'
}

export const invalidateDiscoveryManifest = mutationGeneric({
  args: {
    businessId: v.id('businesses'),
    reasonCode: v.string(),
    ...discoveryMutationAuthArgs,
    ...sourceWriteArgs,
  },
  returns: invalidateResult,
  handler: async (): Promise<Infer<typeof invalidateResult>> => ({
    kind: 'error',
    code: 'discovery_manifest_not_public',
    retryable: false,
    reason: 'Discovery manifests are retired.',
  }),
})

export const invalidateDiscoveryManifestAttemptsBatch = internalMutation({
  args: {
    businessId: v.id('businesses'),
    reasonCode: v.string(),
    paginationOpts: paginationOptsValidator,
    now: v.number(),
  },
  returns: v.object({
    attempts: v.array(attemptResult),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async () => ({ attempts: [], isDone: true, continueCursor: null }),
})

export const continueInvalidateDiscoveryManifest = internalMutation({
  args: {
    businessId: v.id('businesses'),
    reasonCode: v.string(),
    target: v.union(v.literal('manifests'), v.literal('attempts')),
    paginationOpts: paginationOptsValidator,
    now: v.number(),
  },
  returns: v.object({
    processed: v.number(),
    done: v.boolean(),
  }),
  handler: async () => ({ processed: 0, done: true }),
})

export const readDiscoveryHealth = queryGeneric({
  args: {
    businessId: v.id('businesses'),
  },
  returns: healthResult,
  handler: async (_ctx, args): Promise<Infer<typeof healthResult>> => ({
    businessId: String(args.businessId),
    sourceState: 'not_public',
    discoveryStatus: 'unavailable',
    affectedPublicSurfaces: [],
    repairAction: 'no_repair',
    repairResult: 'not_run',
  }),
})

export const readLlmsTxt = queryGeneric({
  args: {
    canonicalBaseUrl: v.optional(v.string()),
    routingBaseUrl: v.optional(v.string()),
    now: v.optional(v.number()),
    totalBusinesses: v.optional(v.number()),
  },
  returns: discoveryFileResult,
  handler: async (): Promise<Infer<typeof discoveryFileResult>> => ({ body: '', urls: [] }),
})

export const readDiscoveryBusinessSlugPage = queryGeneric({
  args: {
    surface: v.union(v.literal('llms'), v.literal('sitemap')),
    paginationOpts: paginationOptsValidator,
  },
  returns: discoverySlugPageResult,
  handler: async (): Promise<Infer<typeof discoverySlugPageResult>> => ({ page: [], isDone: true, continueCursor: '' }),
})

export type {
  DiscoveryHealthReadback,
  DiscoveryManifestAttemptContract,
  DiscoveryManifestContract,
  DiscoveryPathKind,
  DiscoverySourceState,
  DiscoveryStatus,
  InvalidateDiscoveryManifestResult,
  RegenerateDiscoveryManifestResult,
} from '../src/modules/discovery/public'
