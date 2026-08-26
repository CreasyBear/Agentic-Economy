import { v, type Infer } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'
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
import {
  parseWorkloadCronSnapshot,
  reconcileWorkloadCronSnapshot,
} from './workloadCron'
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
import { rebuildCurrentOperationProjection } from './capabilitySupplyOperationProjection'
import {
  type AgentAccessPrincipalValue,
  verifySupplyAgentPrincipal,
} from './agentAccessPrincipals'

const READINESS_REFRESH_LEAD_MS = 90_000
const MAX_READINESS_REFRESH_BATCH = 20

const capabilityProbeAuthorityBaseFields = {
  publicationRef: v.string(),
  publicationRevision: v.number(),
  businessId: v.id('businesses'),
  publisherPrincipalRef: v.string(),
  ownerPrincipalRef: v.string(),
  owningAccountRef: v.string(),
  ownershipRef: v.string(),
  accountRevision: v.number(),
}
export const capabilityProbeAuthorityValue = v.union(
  v.object({
    ...capabilityProbeAuthorityBaseFields,
    mode: v.literal('human_owner'),
    publisherPrincipalRevision: v.number(),
    authorityDigest: v.string(),
  }),
  v.object({
    ...capabilityProbeAuthorityBaseFields,
    mode: v.literal('agent_grant'),
    grantRef: v.string(),
    grantGeneration: v.number(),
    grantPolicyDigest: v.string(),
    authorityExpiresAt: v.number(),
    authorityDigest: v.string(),
  }),
)
export type CapabilityProbeAuthority = Infer<typeof capabilityProbeAuthorityValue>

type CapabilityProbeAuthorityReadArgs = Readonly<{
  publicationRef: string
  expectedRevision: number
  now: number
}>

function withCapabilityProbeAuthorityDigest<T extends Omit<CapabilityProbeAuthority, 'authorityDigest'>>(
  authority: T,
): T & Readonly<{ authorityDigest: string }> {
  return {
    ...authority,
    authorityDigest: canonicalDigest({
      format: 'ae.capability-probe-authority:v1',
      ...authority,
    }),
  }
}

export async function readCurrentCapabilityProbeAuthority(
  ctx: Pick<MutationCtx | QueryCtx, 'db'>,
  args: CapabilityProbeAuthorityReadArgs,
): Promise<CapabilityProbeAuthority | null> {
  if (!Number.isSafeInteger(args.now) || args.now < 0) return null
  const publication = await ctx.db
    .query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', (index) =>
      index.eq('publicationRef', args.publicationRef).eq('revision', args.expectedRevision))
    .unique()
  if (publication === null || publication.disposition !== 'current') return null
  const business = await ctx.db.get(publication.businessId)
  if (business === null
    || business.publicStatus !== 'published'
    || business.suppressedAt !== undefined) return null
  const owner = await ctx.db.get(business.ownerId)
  if (owner?.canonicalPrincipalRef === undefined || owner.canonicalAccountRef === undefined) return null
  const [ownerPrincipal, account] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', owner.canonicalPrincipalRef as never))
      .unique(),
    ctx.db.query('accounts')
      .withIndex('by_accountRef', (query) => query.eq('accountRef', owner.canonicalAccountRef as never))
      .unique(),
  ])
  if (ownerPrincipal === null
    || ownerPrincipal.kind !== 'human'
    || ownerPrincipal.lifecycle !== 'active'
    || account === null
    || account.lifecycle !== 'active') return null
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  if (ownership === null
    || ownership.lifecycle !== 'active'
    || ownership.accountRef !== account.accountRef
    || ownership.ownerPrincipalRef !== ownerPrincipal.principalRef) return null

  const base = {
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    businessId: publication.businessId,
    publisherPrincipalRef: publication.publisherRef,
    ownerPrincipalRef: ownerPrincipal.principalRef,
    owningAccountRef: account.accountRef,
    ownershipRef: ownership.ownershipRef,
    accountRevision: account.revision,
  }
  if (publication.publisherRef === ownerPrincipal.principalRef) {
    return withCapabilityProbeAuthorityDigest({
      ...base,
      mode: 'human_owner' as const,
      publisherPrincipalRevision: ownerPrincipal.revision,
    })
  }

  const storedAgent = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_principalId', (query) => query.eq('principalId', publication.publisherRef))
    .unique()
  if (storedAgent === null || storedAgent.ownerId !== account.accountRef) return null
  const agentPrincipal: AgentAccessPrincipalValue = {
    principalId: storedAgent.principalId,
    ownerId: storedAgent.ownerId,
    credentialId: storedAgent.credentialId,
    applicationRef: storedAgent.applicationRef,
    environment: storedAgent.environment,
    scopes: [...storedAgent.scopes],
    authorityMode: storedAgent.authorityMode,
  }
  const exactGrants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_credentialId_and_environment_and_generation', (query) => query
      .eq('credentialId', storedAgent.credentialId)
      .eq('environment', storedAgent.environment)
      .eq('generation', storedAgent.grantGeneration))
    .take(2)
  if (exactGrants.length !== 1) return null
  const grant = exactGrants[0]
  if (grant === undefined
    || grant.lifecycle !== 'active'
    || grant.principalId !== storedAgent.principalId
    || grant.ownerId !== account.accountRef
    || grant.applicationRef !== storedAgent.applicationRef
    || grant.credentialId !== storedAgent.credentialId
    || grant.authorityMode !== storedAgent.authorityMode
    || grant.operationAccess !== 'all_admitted'
    || grant.policyDigest !== storedAgent.policyDigest
    || grant.expiresAt <= args.now) return null
  const admission = await verifySupplyAgentPrincipal(ctx, agentPrincipal)
  if (admission.kind !== 'allowed') return null
  const authorityExpiresAt = Math.min(grant.expiresAt, storedAgent.expiresAt ?? grant.expiresAt)
  if (authorityExpiresAt <= args.now) return null
  return withCapabilityProbeAuthorityDigest({
    ...base,
    mode: 'agent_grant' as const,
    grantRef: grant.grantRef,
    grantGeneration: grant.generation,
    grantPolicyDigest: grant.policyDigest,
    authorityExpiresAt,
  })
}

export function capabilityProbeAuthorityMatches(
  pinned: CapabilityProbeAuthority,
  current: CapabilityProbeAuthority,
): boolean {
  if (pinned.authorityDigest !== current.authorityDigest
    || pinned.publicationRef !== current.publicationRef
    || pinned.publicationRevision !== current.publicationRevision
    || pinned.businessId !== current.businessId
    || pinned.publisherPrincipalRef !== current.publisherPrincipalRef
    || pinned.ownerPrincipalRef !== current.ownerPrincipalRef
    || pinned.owningAccountRef !== current.owningAccountRef
    || pinned.ownershipRef !== current.ownershipRef
    || pinned.accountRevision !== current.accountRevision
    || pinned.mode !== current.mode) return false
  return pinned.mode === 'human_owner' && current.mode === 'human_owner'
    ? pinned.publisherPrincipalRevision === current.publisherPrincipalRevision
    : pinned.mode === 'agent_grant' && current.mode === 'agent_grant'
      && pinned.grantRef === current.grantRef
      && pinned.grantGeneration === current.grantGeneration
      && pinned.grantPolicyDigest === current.grantPolicyDigest
      && pinned.authorityExpiresAt === current.authorityExpiresAt
}

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
  resourceAuthority: capabilityProbeAuthorityValue,
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
  now: v.number(),
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
  resourceAuthority: capabilityProbeAuthorityValue,
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
  await rebuildCurrentOperationProjection(ctx, {
    publicationRef: publication.publicationRef,
    publicationRevision: publication.revision,
    now,
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
  args: { publicationRef: string; expectedRevision: number; now: number },
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
  const resourceAuthority = await readCurrentCapabilityProbeAuthority(ctx, {
    publicationRef: args.publicationRef,
    expectedRevision: args.expectedRevision,
    now: args.now,
  })
  if (resourceAuthority === null) {
    return {
      kind: 'unavailable' as const,
      reason: 'authority_stale' as const,
      evidenceRefs: ['probe-target:authority-stale'],
    }
  }
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
    resourceAuthority,
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
    resourceAuthority: CapabilityProbeAuthority
  },
) {
  const currentAuthority = await readCurrentCapabilityProbeAuthority(ctx, {
    publicationRef: args.publicationRef,
    expectedRevision: args.expectedRevision,
    now: Date.now(),
  })
  if (currentAuthority === null
    || !capabilityProbeAuthorityMatches(args.resourceAuthority, currentAuthority)) {
    return { kind: 'refused' as const, reason: 'target_changed' as const }
  }
  const { resourceAuthority: _resourceAuthority, ...observation } = args
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
        ...observation,
        now: Date.now(),
      },
    ),
  ])
  if (result.kind === 'observed' && publication !== null) {
    const now = Date.now()
    await rebuildCurrentOperationProjection(ctx, {
      publicationRef: publication.publicationRef,
      publicationRevision: publication.revision,
      now,
    })
    await rebuildCapabilityOriginSupplyProjection(
      ctx,
      publication.businessId as Id<'businesses'>,
      now,
    )
  }
  return result.kind === 'observed'
    ? { ...result, lifecycle: convexPublicationLifecycle(result.lifecycle) }
    : result
}

export async function scheduleDueCapabilityProbesHandler(
  ctx: MutationCtx,
  args: Readonly<{ workload: unknown }>,
) {
  const workload = parseWorkloadCronSnapshot(args.workload)
  await reconcileWorkloadCronSnapshot(
    ctx,
    'refresh capability supply readiness',
    workload,
  )
  const due = await ctx.db
    .query('capabilityPublications')
    .withIndex('by_disposition_and_readinessValidUntil', (index) =>
      index
        .eq('disposition', 'current')
        .lt('readinessValidUntil', Date.now() + READINESS_REFRESH_LEAD_MS),
    )
    .take(MAX_READINESS_REFRESH_BATCH)
  const scheduledFunctionIds = await Promise.all(
    due.map((publication) =>
      ctx.scheduler.runAfter(0, internal.capabilitySupplyReadiness.probeFromCron, {
        publicationRef: publication.publicationRef,
        expectedRevision: publication.revision,
        workload,
      }),
    ),
  )
  console.info(JSON.stringify({
    kind: 'capability_readiness_scheduled_cycle',
    schemaVersion: 'capability-readiness-scheduled-cycle:v1',
    observedAt: Date.now(),
    dueCount: due.length,
    scheduledFunctionIds,
  }))
  return due.length
}
