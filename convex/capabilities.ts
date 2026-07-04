import { internalMutation } from './_generated/server'
import { internal } from './_generated/api'
import { v } from 'convex/values'

import { literalUnion } from '../src/modules/common/convex-literals'
import {
  AeEndpointCheckAllowedMethods,
  AeEndpointCheckBackoffMs,
  AeEndpointCheckStandardVersion,
  BusinessCapabilityKindValues,
  CapabilityTrustStateValues,
  computeCapabilityTrustState,
  type BusinessCapabilityKind,
  type CapabilityCheckFacetResults,
  type CapabilityTrustState,
  type ContradictionFacetResult,
  type FreshnessFacetResult,
  type ReachabilityFacetResult,
  type SchemaFacetResult,
} from '../src/modules/capabilities/public'
import { AeEndpointCheckFreshnessWindowMsByKind } from '../src/modules/capabilities/internal/check-standard'

const capabilityKind = literalUnion(BusinessCapabilityKindValues)

const capabilityRecheckBatchDefault = 25
const capabilityRecheckBatchMax = 100

const endpointDomainControl = v.object({
  originUrl: v.string(),
  checkedAt: v.number(),
  expiresAt: v.number(),
})

const endpointAeHeldFacts = v.object({
  businessName: v.string(),
  category: v.string(),
  claimedLocation: v.string(),
  claimedServiceIdentity: v.string(),
  publicUrl: v.string(),
  originUrl: v.string(),
  ownerIdentifiers: v.array(v.string()),
})
const capabilityTrustState = literalUnion(CapabilityTrustStateValues)
const endpointCheckMethod = literalUnion(AeEndpointCheckAllowedMethods)

const reachabilityFailureReason = v.union(
  v.literal('non_https'),
  v.literal('unsupported_method'),
  v.literal('tls_invalid'),
  v.literal('http_status'),
  v.literal('timeout'),
  v.literal('host_not_allowed'),
  v.literal('private_network'),
  v.literal('unsafe_redirect'),
  v.literal('body_too_large')
)

const reachabilityFacet = v.union(
  v.object({ facet: v.literal('reachability'), outcome: v.literal('pass'), code: v.literal('reachable') }),
  v.object({
    facet: v.literal('reachability'),
    outcome: v.literal('fail'),
    code: v.literal('unreachable'),
    reason: reachabilityFailureReason,
    retryable: v.boolean(),
    exhausted: v.boolean(),
  })
)

const schemaFacet = v.union(
  v.object({ facet: v.literal('schema'), outcome: v.literal('pass'), code: v.literal('schema_conformant') }),
  v.object({
    facet: v.literal('schema'),
    outcome: v.literal('fail'),
    code: v.literal('schema_invalid'),
    reason: v.literal('parse_failed'),
    retryable: v.literal(false),
    exhausted: v.boolean(),
  }),
  v.object({
    facet: v.literal('schema'),
    outcome: v.literal('fail'),
    code: v.literal('schema_invalid'),
    reason: v.literal('forbidden_claim'),
    forbiddenClaims: v.array(v.string()),
    retryable: v.literal(false),
    exhausted: v.boolean(),
  })
)

const freshnessFacet = v.union(
  v.object({
    facet: v.literal('freshness'),
    outcome: v.literal('pass'),
    code: v.literal('fresh'),
    windowMs: v.union(v.number(), v.null()),
  }),
  v.object({
    facet: v.literal('freshness'),
    outcome: v.literal('stale'),
    code: v.union(v.literal('window_exceeded'), v.literal('source_hash_changed')),
    windowMs: v.union(v.number(), v.null()),
  })
)

const contradictionFacet = v.union(
  v.object({ facet: v.literal('contradiction'), outcome: v.literal('pass'), code: v.literal('not_contradicted') }),
  v.object({
    facet: v.literal('contradiction'),
    outcome: v.literal('contradicted'),
    code: v.literal('ae_held_fact_conflict'),
    fields: v.array(v.string()),
  })
)

const facetResults = v.object({
  reachability: reachabilityFacet,
  schema: schemaFacet,
  freshness: freshnessFacet,
  contradiction: contradictionFacet,
})

const capabilityCheckReadback = v.object({
  attemptId: v.string(),
  standardVersion: v.literal(AeEndpointCheckStandardVersion),
  checkedAt: v.number(),
  trustState: capabilityTrustState,
  checkedEvidenceCount: v.number(),
  reachabilityCode: v.string(),
  schemaCode: v.string(),
  freshnessCode: v.string(),
  contradictionCode: v.string(),
  publicReadbackAllowed: v.literal(true),
  privatePayloadAllowed: v.literal(false),
})

const recordEndpointCheckResult = v.union(
  v.object({
    kind: v.literal('ok'),
    code: v.union(v.literal('capability_check_recorded'), v.literal('capability_check_replayed')),
    attemptId: v.string(),
    capabilityId: v.string(),
    trustState: capabilityTrustState,
    status: v.union(v.literal('succeeded'), v.literal('failed'), v.literal('stale')),
    repairAction: v.union(v.literal('none'), v.literal('retry_later'), v.literal('no_repair')),
    retryAfter: v.optional(v.number()),
    readback: capabilityCheckReadback,
  })
)

const recheckDueBusinessCapabilitiesResult = v.object({
  selected: v.number(),
  enqueued: v.number(),
  skipped: v.number(),
  now: v.number(),
  batchSize: v.number(),
})

export const recordEndpointCheckAttempt = internalMutation({
  args: {
    attemptId: v.string(),
    capabilityId: v.string(),
    businessId: v.id('businesses'),
    serviceId: v.optional(v.id('businessServices')),
    descriptorKey: v.string(),
    descriptorJson: v.string(),
    kind: capabilityKind,
    standardVersion: v.literal(AeEndpointCheckStandardVersion),
    method: endpointCheckMethod,
    url: v.string(),
    allowedOrigin: v.optional(v.string()),
    manifestUrl: v.optional(v.string()),
    schemaRef: v.optional(v.literal('ae-ucp:v1')),
    domainControl: v.optional(endpointDomainControl),
    aeHeldFacts: v.optional(endpointAeHeldFacts),
    sourceHash: v.string(),
    previousSourceHash: v.string(),
    previousState: capabilityTrustState,
    generatedAt: v.number(),
    checkedAt: v.number(),
    retryCount: v.number(),
    facets: facetResults,
    failureMessageRedacted: v.optional(v.string()),
  },
  returns: recordEndpointCheckResult,
  handler: async (ctx, args) => {
    const existingAttempt = await ctx.db
      .query('capabilityCheckAttempts')
      .withIndex('by_attemptId', (query) => query.eq('attemptId', args.attemptId))
      .unique()

    if (existingAttempt !== null) {
      return {
        kind: 'ok' as const,
        code: 'capability_check_replayed' as const,
        attemptId: existingAttempt.attemptId,
        capabilityId: existingAttempt.capabilityId,
        trustState: existingAttempt.trustState,
        status: existingAttempt.status,
        repairAction: existingAttempt.repairAction,
        ...(existingAttempt.retryAfter === undefined ? {} : { retryAfter: existingAttempt.retryAfter }),
        readback: existingAttempt.readback,
      }
    }

    const facets: CapabilityCheckFacetResults = args.facets
    const trustState = computeCapabilityTrustState({
      kind: 'checked',
      previousState: args.previousState,
      facets,
    })
    const checkedEvidenceCount = countCheckedEvidence(facets)
    const retryAfter = computeRetryAfter(args.checkedAt, args.retryCount, facets)
    const repairAction = repairActionFor(trustState, retryAfter)
    const status = statusForFacets(facets)
    const readback = {
      attemptId: args.attemptId,
      standardVersion: args.standardVersion,
      checkedAt: args.checkedAt,
      trustState,
      checkedEvidenceCount,
      reachabilityCode: reachabilityCode(facets.reachability),
      schemaCode: schemaCode(facets.schema),
      freshnessCode: freshnessCode(facets.freshness),
      contradictionCode: contradictionCode(facets.contradiction),
      publicReadbackAllowed: true as const,
      privatePayloadAllowed: false as const,
    }
    const failureCode = failureCodeFor(facets)
    const recheckPayloadJson = buildRecheckPayloadJson(args)
    const staleThresholdAt = computeStaleThresholdAt({
      checkedAt: args.checkedAt,
      kind: args.kind,
      trustState,
      retryAfter,
      recheckPayloadJson,
    })
    const nextRetryCount = retryAfter === undefined ? 0 : args.retryCount + 1

    const existingCapability = await ctx.db
      .query('businessCapabilities')
      .withIndex('by_capabilityId', (query) => query.eq('capabilityId', args.capabilityId))
      .unique()
    const capabilityPatch = {
      capabilityId: args.capabilityId,
      businessId: args.businessId,
      ...(args.serviceId === undefined ? {} : { serviceId: args.serviceId }),
      descriptorKey: args.descriptorKey,
      kind: args.kind,
      descriptorJson: args.descriptorJson,
      sourceHash: args.sourceHash,
      standardVersion: args.standardVersion,
      trustState,
      checkedEvidenceCount,
      latestAttemptId: args.attemptId,
      latestReadback: readback,
      repairAction,
      retryCount: nextRetryCount,
      ...(retryAfter === undefined ? {} : { retryAfter }),
      ...(staleThresholdAt === undefined
        ? {}
        : { recheckEnabled: true as const, staleThresholdAt, recheckPayloadJson: recheckPayloadJson as string }),
      updatedAt: args.checkedAt,
    }
    if (existingCapability === null) {
      await ctx.db.insert('businessCapabilities', capabilityPatch)
    } else {
      await ctx.db.patch(existingCapability._id, capabilityPatch)
      if (retryAfter === undefined && existingCapability.retryAfter !== undefined) {
        await ctx.db.patch(existingCapability._id, { retryAfter: undefined })
      }
      if (staleThresholdAt === undefined && existingCapability.staleThresholdAt !== undefined) {
        await ctx.db.patch(existingCapability._id, {
          recheckEnabled: undefined,
          staleThresholdAt: undefined,
          recheckPayloadJson: undefined,
        })
      }
    }

    await ctx.db.insert('capabilityCheckAttempts', {
      attemptId: args.attemptId,
      capabilityId: args.capabilityId,
      businessId: args.businessId,
      ...(args.serviceId === undefined ? {} : { serviceId: args.serviceId }),
      descriptorKey: args.descriptorKey,
      kind: args.kind,
      standardVersion: args.standardVersion,
      method: args.method,
      url: args.url,
      sourceHash: args.sourceHash,
      previousSourceHash: args.previousSourceHash,
      previousState: args.previousState,
      trustState,
      status,
      retryCount: args.retryCount,
      ...(retryAfter === undefined ? {} : { retryAfter }),
      repairAction,
      checkedEvidenceCount,
      facetsJson: JSON.stringify(facets),
      readback,
      ...(failureCode === undefined ? {} : { failureCode }),
      ...(args.failureMessageRedacted === undefined ? {} : { failureMessageRedacted: args.failureMessageRedacted }),
      startedAt: args.checkedAt,
      finishedAt: args.checkedAt,
    })

    return {
      kind: 'ok' as const,
      code: 'capability_check_recorded' as const,
      attemptId: args.attemptId,
      capabilityId: args.capabilityId,
      trustState,
      status,
      repairAction,
      ...(retryAfter === undefined ? {} : { retryAfter }),
      readback,
    }
  },
})

type RecheckPayload = Readonly<{
  method: 'GET' | 'HEAD'
  url: string
  allowedOrigin: string
  manifestUrl: string
  schemaRef: 'ae-ucp:v1'
  generatedAt: number
  domainControl: {
    originUrl: string
    checkedAt: number
    expiresAt: number
  }
  aeHeldFacts: {
    businessName: string
    category: string
    claimedLocation: string
    claimedServiceIdentity: string
    publicUrl: string
    originUrl: string
    ownerIdentifiers: string[]
  }
}>

export const recheckDueBusinessCapabilities = internalMutation({
  args: {
    now: v.optional(v.number()),
    batchSize: v.optional(v.number()),
  },
  returns: recheckDueBusinessCapabilitiesResult,
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const batchSize = clampRecheckBatchSize(args.batchSize)
    const dueCapabilities = await ctx.db
      .query('businessCapabilities')
      .withIndex('by_recheckEnabled_staleThresholdAt', (query) =>
        query.eq('recheckEnabled', true).lte('staleThresholdAt', now)
      )
      .take(batchSize)

    let enqueued = 0
    let skipped = 0

    for (const capability of dueCapabilities) {
      const payload = parseRecheckPayload(capability.recheckPayloadJson)
      if (payload === undefined) {
        skipped += 1
        continue
      }

      await ctx.scheduler.runAfter(0, internal.capabilityCheck.runEndpointCheck, {
        attemptId: recheckAttemptId(capability.capabilityId, now),
        capabilityId: capability.capabilityId,
        businessId: capability.businessId,
        ...(capability.serviceId === undefined ? {} : { serviceId: capability.serviceId }),
        descriptorKey: capability.descriptorKey,
        kind: capability.kind,
        method: payload.method,
        url: payload.url,
        allowedOrigin: payload.allowedOrigin,
        manifestUrl: payload.manifestUrl,
        schemaRef: payload.schemaRef,
        sourceHash: capability.sourceHash,
        previousSourceHash: capability.sourceHash,
        previousState: capability.trustState,
        generatedAt: payload.generatedAt,
        retryCount: capability.retryCount ?? 0,
        now,
        domainControl: payload.domainControl,
        aeHeldFacts: payload.aeHeldFacts,
      })
      enqueued += 1
    }

    return { selected: dueCapabilities.length, enqueued, skipped, now, batchSize }
  },
})

function buildRecheckPayloadJson(args: {
  method?: unknown
  url?: unknown
  allowedOrigin?: unknown
  manifestUrl?: unknown
  schemaRef?: unknown
  generatedAt?: unknown
  domainControl?: unknown
  aeHeldFacts?: unknown
}): string | undefined {
  if (
    (args.method !== 'GET' && args.method !== 'HEAD') ||
    typeof args.url !== 'string' ||
    typeof args.allowedOrigin !== 'string' ||
    typeof args.manifestUrl !== 'string' ||
    args.schemaRef !== 'ae-ucp:v1' ||
    typeof args.generatedAt !== 'number' ||
    !isRecheckDomainControl(args.domainControl) ||
    !isRecheckAeHeldFacts(args.aeHeldFacts)
  ) {
    return undefined
  }

  return JSON.stringify({
    method: args.method,
    url: args.url,
    allowedOrigin: args.allowedOrigin,
    manifestUrl: args.manifestUrl,
    schemaRef: args.schemaRef,
    generatedAt: args.generatedAt,
    domainControl: args.domainControl,
    aeHeldFacts: args.aeHeldFacts,
  } satisfies RecheckPayload)
}

function computeStaleThresholdAt(input: {
  checkedAt: number
  kind: BusinessCapabilityKind
  trustState: CapabilityTrustState
  retryAfter: number | undefined
  recheckPayloadJson: string | undefined
}): number | undefined {
  if (input.recheckPayloadJson === undefined) return undefined
  if (input.trustState === 'unsupported' || input.trustState === 'contradicted') return undefined
  if (input.retryAfter !== undefined) return input.retryAfter
  const windowMs = AeEndpointCheckFreshnessWindowMsByKind[input.kind]
  return windowMs === null ? undefined : input.checkedAt + windowMs
}

function clampRecheckBatchSize(value: number | undefined): number {
  if (value === undefined) return capabilityRecheckBatchDefault
  if (!Number.isFinite(value) || value < 1) return capabilityRecheckBatchDefault
  return Math.min(Math.floor(value), capabilityRecheckBatchMax)
}

function parseRecheckPayload(value: unknown): RecheckPayload | undefined {
  if (typeof value !== 'string') return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (!isRecheckPayload(parsed)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

function isRecheckPayload(value: unknown): value is RecheckPayload {
  return isRecord(value) &&
    (value.method === 'GET' || value.method === 'HEAD') &&
    value.schemaRef === 'ae-ucp:v1' &&
    stringKeys(value, ['url', 'allowedOrigin', 'manifestUrl']) &&
    typeof value.generatedAt === 'number' &&
    isRecheckDomainControl(value.domainControl) &&
    isRecheckAeHeldFacts(value.aeHeldFacts)
}

function isRecheckDomainControl(value: unknown): value is RecheckPayload['domainControl'] {
  return isRecord(value) &&
    stringKeys(value, ['originUrl']) &&
    typeof value.checkedAt === 'number' &&
    typeof value.expiresAt === 'number'
}

function isRecheckAeHeldFacts(value: unknown): value is RecheckPayload['aeHeldFacts'] {
  return isRecord(value) &&
    stringKeys(value, [
      'businessName',
      'category',
      'claimedLocation',
      'claimedServiceIdentity',
      'publicUrl',
      'originUrl',
    ]) &&
    Array.isArray(value.ownerIdentifiers) &&
    value.ownerIdentifiers.every((identifier) => typeof identifier === 'string')
}

function stringKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof value[key] === 'string')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recheckAttemptId(capabilityId: string, now: number): string {
  return `${capabilityId}:recheck:${now}`
}


function countCheckedEvidence(facets: CapabilityCheckFacetResults): number {
  return [
    facets.reachability.outcome === 'pass',
    facets.schema.outcome === 'pass',
    facets.freshness.outcome === 'pass',
    facets.contradiction.outcome === 'pass',
  ].filter(Boolean).length
}

function computeRetryAfter(
  checkedAt: number,
  retryCount: number,
  facets: CapabilityCheckFacetResults
): number | undefined {
  if (!hasRetryableNonExhaustedFailure(facets)) return undefined
  const delay = AeEndpointCheckBackoffMs[retryCount]
  return delay === undefined ? undefined : checkedAt + delay
}

function hasRetryableNonExhaustedFailure(facets: CapabilityCheckFacetResults): boolean {
  return (
    facets.reachability.outcome === 'fail' &&
    facets.reachability.retryable &&
    !facets.reachability.exhausted
  )
}

function repairActionFor(
  trustState: CapabilityTrustState,
  retryAfter: number | undefined
): 'none' | 'retry_later' | 'no_repair' {
  if (trustState === 'unsupported' || trustState === 'contradicted') return 'no_repair'
  if (retryAfter !== undefined || trustState === 'stale') return 'retry_later'
  return 'none'
}

function statusForFacets(facets: CapabilityCheckFacetResults): 'succeeded' | 'failed' | 'stale' {
  if (
    facets.reachability.outcome === 'fail' ||
    facets.schema.outcome === 'fail' ||
    facets.contradiction.outcome === 'contradicted'
  ) {
    return 'failed'
  }
  if (facets.freshness.outcome === 'stale') return 'stale'
  return 'succeeded'
}

function reachabilityCode(facet: ReachabilityFacetResult): string {
  return facet.outcome === 'pass' ? facet.code : `${facet.code}:${facet.reason}`
}

function schemaCode(facet: SchemaFacetResult): string {
  return facet.outcome === 'pass' ? facet.code : `${facet.code}:${facet.reason}`
}

function freshnessCode(facet: FreshnessFacetResult): string {
  return facet.code
}

function contradictionCode(facet: ContradictionFacetResult): string {
  return facet.code
}

function failureCodeFor(facets: CapabilityCheckFacetResults): string | undefined {
  if (facets.contradiction.outcome === 'contradicted') return facets.contradiction.code
  if (facets.reachability.outcome === 'fail') return facets.reachability.reason
  if (facets.schema.outcome === 'fail') return facets.schema.reason
  if (facets.freshness.outcome === 'stale') return facets.freshness.code
  return undefined
}
