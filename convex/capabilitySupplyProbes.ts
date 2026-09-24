import {
  readCapabilityProbeTarget as readCapabilityProbeTargetFromModule,
  recordCapabilityProbeResult as recordCapabilityProbeResultFromModule,
  readinessOutcomeValue,
} from '@/modules/capability-supply/public'
import { type Infer } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { capabilitySupplyGraphPorts } from './lib/capabilitySupply/graphPorts/ports'
import { convexPublicationLifecycle } from './capabilitySupplyShared'
import {
  capabilityProbeAuthorityMatches,
  readCurrentCapabilityProbeAuthority,
  ownerStagedProbeBusinessIsAllowed,
  type CapabilityProbeAuthority,
} from './lib/capabilitySupply/probes/authority'
import { applyObservedCapabilityProbeSideEffects } from './lib/capabilitySupply/probes/observe'
import {
  capabilityProbeTargetAllowUnpublishedBusiness,
  presentCapabilityProbeTargetAfterModuleRead,
  refuseCapabilityProbeTargetIfSelectedRequest,
} from './lib/capabilitySupply/probes/target'

export {
  capabilityProbeAuthorityValue,
  readCurrentCapabilityProbeAuthority,
  capabilityProbeAuthorityMatches,
  type CapabilityProbeAuthority,
} from './lib/capabilitySupply/probes/authority'
export {
  observeCapabilityReadinessArgs,
  observeCapabilityReadinessReturns,
  observeCapabilityReadinessHandler,
  recordCapabilityProbeResultArgs,
  recordCapabilityProbeResultReturns,
  recordOwnerStagedCapabilityProbeResultArgs,
} from './lib/capabilitySupply/probes/observe'
export {
  readCapabilityProbeTargetArgs,
  readCapabilityProbeTargetReturns,
  readOwnerStagedCapabilityProbeTargetArgs,
} from './lib/capabilitySupply/probes/target'
export { scheduleDueCapabilityProbesHandler } from './lib/capabilitySupply/probes/schedule'

export async function readCapabilityProbeTargetHandler(
  ctx: QueryCtx,
  args: {
    publicationRef: string
    expectedRevision: number
    now: number
    ownerStagedBusinessId?: Id<'businesses'>
  },
) {
  const selectedRequestRefusal = await refuseCapabilityProbeTargetIfSelectedRequest(ctx, args)
  if (selectedRequestRefusal !== null) return selectedRequestRefusal

  const result = await readCapabilityProbeTargetFromModule(
    capabilitySupplyGraphPorts(ctx.db),
    args,
    capabilityProbeTargetAllowUnpublishedBusiness(ctx, args),
  )
  if (result.kind === 'unavailable') {
    return {
      kind: 'unavailable' as const,
      reason: result.reason,
      evidenceRefs: [...result.evidenceRefs],
    }
  }

  return await presentCapabilityProbeTargetAfterModuleRead(ctx, args, result.target)
}

export async function readOwnerStagedCapabilityProbeTargetHandler(
  ctx: QueryCtx,
  args: {
    publicationRef: string
    expectedRevision: number
    now: number
    businessId: Id<'businesses'>
  },
) {
  if (!(await ownerStagedProbeBusinessIsAllowed(ctx, {
    publicationRef: args.publicationRef,
    expectedRevision: args.expectedRevision,
    businessId: args.businessId,
    candidateBusinessId: String(args.businessId),
  }))) {
    return {
      kind: 'unavailable' as const,
      reason: 'target_not_public' as const,
      evidenceRefs: ['probe-target:target_not_public'],
    }
  }
  const { businessId, ...targetArgs } = args
  return await readCapabilityProbeTargetHandler(ctx, {
    ...targetArgs,
    ownerStagedBusinessId: businessId,
  })
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
    ownerStagedBusinessId?: Id<'businesses'>
  },
) {
  const ownerStagedBusinessId = args.ownerStagedBusinessId
  const currentAuthority = await readCurrentCapabilityProbeAuthority(ctx, {
    publicationRef: args.publicationRef,
    expectedRevision: args.expectedRevision,
    now: Date.now(),
    ...(ownerStagedBusinessId === undefined
      ? {}
      : { ownerStagedBusinessId }),
  })
  if (currentAuthority === null
    || !capabilityProbeAuthorityMatches(args.resourceAuthority, currentAuthority)) {
    return { kind: 'refused' as const, reason: 'target_changed' as const }
  }
  const {
    resourceAuthority: _resourceAuthority,
    ownerStagedBusinessId: _ownerStagedBusinessId,
    ...observation
  } = args
  const result = await recordCapabilityProbeResultFromModule(
    capabilitySupplyGraphPorts(ctx.db),
    {
      ...observation,
      now: Date.now(),
    },
    capabilityProbeTargetAllowUnpublishedBusiness(ctx, {
      publicationRef: args.publicationRef,
      expectedRevision: args.expectedRevision,
      ...(ownerStagedBusinessId === undefined
        ? {}
        : { ownerStagedBusinessId }),
    }),
  )
  if (result.kind === 'observed') {
    await applyObservedCapabilityProbeSideEffects(ctx, {
      healthState: args.healthState,
      outcome: args.outcome,
      observedAt: args.observedAt,
    }, result)
  }
  return result.kind === 'observed'
    ? { ...result, lifecycle: convexPublicationLifecycle(result.lifecycle) }
    : result
}

export async function recordOwnerStagedCapabilityProbeResultHandler(
  ctx: MutationCtx,
  args: Omit<Parameters<typeof recordCapabilityProbeResultHandler>[1], 'ownerStagedBusinessId'>
    & Readonly<{ businessId: Id<'businesses'> }>,
) {
  if (!(await ownerStagedProbeBusinessIsAllowed(ctx, {
    publicationRef: args.publicationRef,
    expectedRevision: args.expectedRevision,
    businessId: args.businessId,
    candidateBusinessId: String(args.businessId),
  }))) {
    const refused: { kind: 'refused'; reason: 'target_changed' } = {
      kind: 'refused',
      reason: 'target_changed',
    }
    return refused
  }
  const { businessId, ...observation } = args
  return await recordCapabilityProbeResultHandler(ctx, {
    ...observation,
    ownerStagedBusinessId: businessId,
  })
}
