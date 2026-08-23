import { v, type Infer } from 'convex/values'
import { connectionAuthoritySnapshotValue } from '@/modules/capability-supply/convex'
import {
  readCapabilityProbeTarget as readCapabilityProbeTargetFromModule,
  recordCapabilityProbeResult as recordCapabilityProbeResultFromModule,
  publicationLifecycle,
  validRegistrationContext,
  readinessOutcomeValue,
} from '@/modules/capability-supply/public'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { capabilitySupplyGraphPorts } from './capabilitySupplyGraphPorts'
import {
  convexPublicationLifecycle,
  contextFields,
  keylessAuthorityValue,
  providerConnectionAuthorityValue,
  publicationLifecycleValue,
  rebuildCapabilityOriginSupplyProjection,
} from './capabilitySupplyShared'
import { syncMarketOperationPresence } from './marketPresence'

const READINESS_REFRESH_LEAD_MS = 90_000
const MAX_READINESS_REFRESH_BATCH = 20

const capabilityProbeTargetFields = {
  publicationRef: v.string(),
  revision: v.number(),
  bindingId: v.string(),
  capabilityId: v.string(),
  endpointUrl: v.string(),
  adapterId: v.string(),
  probeKind: v.union(
    v.literal('ae_quote'),
    v.literal('openapi_http'),
    v.literal('mcp'),
    v.literal('x402'),
  ),
  probeQuery: v.array(v.object({ parameter: v.string(), value: v.string() })),
  probeMethod: v.union(v.literal('GET'), v.literal('POST')),
  transportConfigJson: v.string(),
  probeInputJson: v.optional(v.string()),
  outputSchemaJson: v.optional(v.string()),
  expectedPaymentJson: v.optional(v.string()),
  targetDigest: v.string(),
}
const capabilityProbeTargetValue = v.union(
  v.object({
    ...capabilityProbeTargetFields,
    authority: keylessAuthorityValue,
  }),
  v.object({
    ...capabilityProbeTargetFields,
    authority: providerConnectionAuthorityValue,
    connectionAuthority: connectionAuthoritySnapshotValue,
  }),
)
const probeTargetUnavailableReasonValue = v.union(
  v.literal('publication_missing'),
  v.literal('publication_stale'),
  v.literal('offering_invalid'),
  v.literal('binding_invalid'),
  v.literal('contract_missing'),
  v.literal('input_unrepresentable'),
  v.literal('effectful_probe_unsupported'),
  v.literal('mcp_tool_missing'),
  v.literal('authority_stale'),
  v.literal('target_not_public'),
)

export const observeCapabilityReadinessArgs = {
  publicationRef: v.string(),
  expectedRevision: v.number(),
  credentialState: v.union(v.literal('ready'), v.literal('unavailable')),
  healthState: v.union(v.literal('healthy'), v.literal('unhealthy')),
  validUntil: v.number(),
  ...contextFields,
} as const
export const observeCapabilityReadinessReturns = v.union(
  v.object({
    kind: v.literal('observed'),
    publicationRef: v.string(),
    revision: v.number(),
    lifecycle: publicationLifecycleValue,
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('authorization_denied'),
      v.literal('publication_not_found'),
      v.literal('revision_changed'),
      v.literal('observation_invalid'),
    ),
  }),
)
export const readCapabilityProbeTargetArgs = {
  publicationRef: v.string(),
  expectedRevision: v.number(),
} as const
export const readCapabilityProbeTargetReturns = v.union(
  v.object({
    kind: v.literal('unavailable'),
    reason: probeTargetUnavailableReasonValue,
    evidenceRefs: v.array(v.string()),
  }),
  v.object({
    kind: v.literal('available'),
    target: capabilityProbeTargetValue,
  }),
)
export const recordCapabilityProbeResultArgs = {
  publicationRef: v.string(),
  expectedRevision: v.number(),
  targetDigest: v.string(),
  requestDigest: v.string(),
  responseStatus: v.optional(v.number()),
  responseContentType: v.optional(v.string()),
  responseDigest: v.optional(v.string()),
  outcome: readinessOutcomeValue,
  credentialState: v.union(v.literal('ready'), v.literal('unavailable')),
  healthState: v.union(v.literal('healthy'), v.literal('unhealthy')),
  observedAt: v.number(),
  validUntil: v.number(),
  evidenceRefs: v.array(v.string()),
} as const
export const recordCapabilityProbeResultReturns = v.union(
  v.object({
    kind: v.literal('observed'),
    publicationRef: v.string(),
    revision: v.number(),
    lifecycle: publicationLifecycleValue,
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(
      v.literal('revision_changed'),
      v.literal('target_changed'),
    ),
  }),
)

/** Fixture/curated-seed helper. Production owner readiness uses probe → record. */
export async function observeCapabilityReadinessHandler(
  ctx: MutationCtx,
  args: {
    publicationRef: string
    expectedRevision: number
    credentialState: 'ready' | 'unavailable'
    healthState: 'healthy' | 'unhealthy'
    validUntil: number
    operationKey: string
    correlationId: string
    reasonCode: string
    evidenceRefs: string[]
  },
) {
  const now = Date.now()
  if (
    !validRegistrationContext(args) ||
    !Number.isSafeInteger(args.expectedRevision) ||
    args.validUntil <= now ||
    args.validUntil > now + 86_400_000
  ) {
    return {
      kind: 'refused' as const,
      reason: 'observation_invalid' as const,
    }
  }
  const publication = await ctx.db
    .query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (index) =>
      index
        .eq('publicationRef', args.publicationRef)
        .eq('revision', args.expectedRevision),
    )
    .unique()
  if (publication === null)
    return {
      kind: 'refused' as const,
      reason: 'publication_not_found' as const,
    }
  if (publication.disposition !== 'current') {
    return { kind: 'refused' as const, reason: 'revision_changed' as const }
  }
  await ctx.db.patch(publication._id, {
    credentialState: args.credentialState,
    healthState: args.healthState,
    readinessEvidenceRefs: [...args.evidenceRefs],
    readinessObservedAt: now,
    readinessValidUntil: args.validUntil,
    updatedAt: now,
  })
  await syncMarketOperationPresence(ctx, {
    operationRef: publication.operationRef,
    businessId: publication.businessId,
    active: args.credentialState === 'ready' && args.healthState === 'healthy',
    now,
  })
  const [offering, binding] = await Promise.all([
    ctx.db
      .query('capabilityOfferings')
      .withIndex('by_offeringId', (index) =>
        index.eq('offeringId', publication.offeringId),
      )
      .unique(),
    ctx.db
      .query('capabilityTransportBindings')
      .withIndex('by_bindingId', (index) =>
        index.eq('bindingId', publication.bindingId),
      )
      .unique(),
  ])
  if (offering === null || binding === null)
    throw new Error('capability_publication_supply_integrity_failure')
  const result = {
    kind: 'observed' as const,
    publicationRef: publication.publicationRef,
    revision: publication.revision,
    lifecycle: convexPublicationLifecycle(
      publicationLifecycle(
        {
          ...publication,
          credentialState: args.credentialState,
          healthState: args.healthState,
          readinessObservedAt: now,
          readinessValidUntil: args.validUntil,
        },
        offering,
        binding,
        now,
      ),
    ),
  }
  await rebuildCapabilityOriginSupplyProjection(
    ctx,
    publication.businessId,
    now,
  )
  return result
}

export async function readCapabilityProbeTargetHandler(
  ctx: QueryCtx,
  args: { publicationRef: string; expectedRevision: number },
) {
  const result = await readCapabilityProbeTargetFromModule(
    capabilitySupplyGraphPorts(ctx.db),
    args,
  )
  if (result.kind === 'unavailable') {
    return {
      kind: 'unavailable' as const,
      reason: result.reason,
      evidenceRefs: [...result.evidenceRefs],
    }
  }

  const { target } = result
  const targetFields = {
    publicationRef: target.publicationRef,
    revision: target.revision,
    bindingId: target.bindingId,
    capabilityId: target.capabilityId,
    endpointUrl: target.endpointUrl,
    adapterId: target.adapterId,
    probeKind: target.probeKind,
    probeQuery: target.probeQuery,
    probeMethod: target.probeMethod,
    transportConfigJson: target.transportConfigJson,
    ...(target.probeInputJson === undefined
      ? {}
      : { probeInputJson: target.probeInputJson }),
    ...(target.outputSchemaJson === undefined
      ? {}
      : { outputSchemaJson: target.outputSchemaJson }),
    ...(target.expectedPaymentJson === undefined
      ? {}
      : { expectedPaymentJson: target.expectedPaymentJson }),
    targetDigest: target.targetDigest,
  }
  if (target.authority.kind === 'provider_connection') {
    if (!('connectionAuthority' in target)) {
      return {
        kind: 'unavailable' as const,
        reason: 'authority_stale' as const,
        evidenceRefs: ['probe-target:authority-stale'],
      }
    }
    return {
      kind: 'available' as const,
      target: {
        ...targetFields,
        authority: {
          kind: 'provider_connection' as const,
          connectionRef: target.authority.connectionRef,
          providerRef: target.authority.providerRef,
        },
        connectionAuthority: {
          connectionRef: target.connectionAuthority.connectionRef,
          providerRef: target.connectionAuthority.providerRef,
          adapterId: target.connectionAuthority.adapterId,
          authorityGeneration: target.connectionAuthority.authorityGeneration,
          authorityDigest: target.connectionAuthority.authorityDigest,
          operationRef: target.connectionAuthority.operationRef,
          grantedScopes: target.connectionAuthority.grantedScopes,
          grantedResources: target.connectionAuthority.grantedResources,
        },
      },
    }
  }
  return {
    kind: 'available' as const,
    target: {
      ...targetFields,
      authority: { kind: 'keyless' as const },
    },
  }
}

export async function recordCapabilityProbeResultHandler(
  ctx: MutationCtx,
  args: {
    publicationRef: string
    expectedRevision: number
    targetDigest: string
    requestDigest: string
    responseStatus?: number
    responseContentType?: string
    responseDigest?: string
    outcome: Infer<typeof readinessOutcomeValue>
    credentialState: 'ready' | 'unavailable'
    healthState: 'healthy' | 'unhealthy'
    observedAt: number
    validUntil: number
    evidenceRefs: string[]
  },
) {
  const [publication, result] = await Promise.all([
    ctx.db
      .query('capabilityPublications')
      .withIndex('by_publicationRef_and_revision', (index) =>
        index
          .eq('publicationRef', args.publicationRef)
          .eq('revision', args.expectedRevision),
      )
      .unique(),
    recordCapabilityProbeResultFromModule(
      capabilitySupplyGraphPorts(ctx.db),
      {
        ...args,
        now: Date.now(),
      },
    ),
  ])
  if (result.kind === 'observed' && publication !== null) {
    await rebuildCapabilityOriginSupplyProjection(
      ctx,
      publication.businessId as Id<'businesses'>,
      Date.now(),
    )
  }
  return result.kind === 'observed'
    ? { ...result, lifecycle: convexPublicationLifecycle(result.lifecycle) }
    : result
}

export async function scheduleDueCapabilityProbesHandler(ctx: MutationCtx) {
  const due = await ctx.db
    .query('capabilityPublications')
    .withIndex('by_disposition_and_readinessValidUntil', (index) =>
      index
        .eq('disposition', 'current')
        .lt('readinessValidUntil', Date.now() + READINESS_REFRESH_LEAD_MS),
    )
    .take(MAX_READINESS_REFRESH_BATCH)
  await Promise.all(
    due.map((publication) =>
      ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probe, {
        publicationRef: publication.publicationRef,
        expectedRevision: publication.revision,
      }),
    ),
  )
  return due.length
}
