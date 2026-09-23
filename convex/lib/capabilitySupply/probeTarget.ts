import { usesSelectedRequestReadiness, connectionAuthoritySnapshotValue } from '@/modules/capability-supply/convex'
import { readCapabilityProbeTarget as readCapabilityProbeTargetFromModule } from '@/modules/capability-supply/public'
import { v } from 'convex/values'
import type { Id } from '../../_generated/dataModel'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import {
  publicUpstreamAuthorityValue,
  providerConnectionAuthorityValue,
} from '../../capabilitySupplyShared'
import {
  capabilityProbeAuthorityValue,
  nativeDraftProbeBusinessIsAllowed,
  ownerStagedProbeBusinessIsAllowed,
  readCurrentCapabilityProbeAuthority,
} from './probeAuthority'

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
    authority: publicUpstreamAuthorityValue,
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

export const readCapabilityProbeTargetArgs = {
  publicationRef: v.string(),
  expectedRevision: v.number(),
  now: v.number(),
} as const
export const readOwnerStagedCapabilityProbeTargetArgs = {
  ...readCapabilityProbeTargetArgs,
  businessId: v.id('businesses'),
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

export type ReadCapabilityProbeTargetHandlerArgs = Readonly<{
  publicationRef: string
  expectedRevision: number
  now: number
  ownerStagedBusinessId?: Id<'businesses'>
}>

export async function refuseCapabilityProbeTargetIfSelectedRequest(
  ctx: Pick<QueryCtx, 'db'>,
  args: Readonly<{ publicationRef: string; expectedRevision: number }>,
) {
  const publication = await ctx.db.query('capabilityPublications')
    .withIndex('by_publicationRef_and_revision', q => q.eq('publicationRef', args.publicationRef).eq('revision', args.expectedRevision)).unique()
  if (publication !== null && usesSelectedRequestReadiness(publication)) {
    return { kind: 'unavailable' as const, reason: 'effectful_probe_unsupported' as const,
      evidenceRefs: ['probe-target:caller-input-required'] }
  }
  return null
}

export function capabilityProbeTargetAllowUnpublishedBusiness(
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  args: Readonly<{
    publicationRef: string
    expectedRevision: number
    ownerStagedBusinessId?: Id<'businesses'>
  }>,
) {
  const ownerStagedBusinessId = args.ownerStagedBusinessId
  return ownerStagedBusinessId === undefined
    ? { allowUnpublishedBusiness: (businessId: string) => nativeDraftProbeBusinessIsAllowed(ctx, args, businessId) }
    : {
        allowUnpublishedBusiness: async (businessId: string) => (
          await ownerStagedProbeBusinessIsAllowed(ctx, {
            publicationRef: args.publicationRef,
            expectedRevision: args.expectedRevision,
            businessId: ownerStagedBusinessId,
            candidateBusinessId: businessId,
          })
        ),
      }
}

type ModuleProbeTarget = Extract<
  Awaited<ReturnType<typeof readCapabilityProbeTargetFromModule>>,
  { kind: 'available' }
>['target']

export async function presentCapabilityProbeTargetAfterModuleRead(
  ctx: Pick<QueryCtx, 'db'>,
  args: ReadCapabilityProbeTargetHandlerArgs,
  target: ModuleProbeTarget,
) {
  const resourceAuthority = await readCurrentCapabilityProbeAuthority(ctx, {
    publicationRef: args.publicationRef,
    expectedRevision: args.expectedRevision,
    now: args.now,
    ...(args.ownerStagedBusinessId === undefined
      ? {}
      : { ownerStagedBusinessId: args.ownerStagedBusinessId }),
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
    probeQuery: [...target.probeQuery],
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
    if (!('connectionAuthority' in target) || target.connectionAuthority === undefined) {
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
          toolRef: target.connectionAuthority.toolRef,
          grantedScopes: [...target.connectionAuthority.grantedScopes],
          grantedResources: [...target.connectionAuthority.grantedResources],
        },
      },
    }
  }
  return {
    kind: 'available' as const,
    target: {
      ...targetFields,
      authority: { kind: 'public_upstream' as const },
    },
  }
}
