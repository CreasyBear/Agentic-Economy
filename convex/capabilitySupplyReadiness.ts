"use node"

import { v } from 'convex/values'
import type { RegisteredAction } from 'convex/server'
import { defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import { sendGuardedHttpRequest } from '@/modules/network-guard/server'
import {
  type CapabilityProbeTargetUnavailableReason,
  type ReadCapabilityProbeTargetResult,
} from '@/modules/capability-supply/public'
import { credentialFromEnvironment, runCapabilityReadinessProbe } from '@/modules/capability-supply/server'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { internalAction, type ActionCtx } from './_generated/server'
import {
  bindWorkloadCronActionContext,
  parseWorkloadCronSnapshot,
  workloadCronSnapshotValue,
  type WorkloadCronSnapshot,
} from './workloadCron'
type PublicationLifecycle = {
  state: 'inactive' | 'active' | 'withdrawn' | 'incompatible'
  reasons: Array<
    | 'admission_unproven'
    | 'conformance_unproven'
    | 'credential_readiness_unobserved'
    | 'health_unobserved'
    | 'credential_unavailable'
    | 'health_unhealthy'
    | 'health_stale'
    | 'withdrawn'
    | 'incompatible_revision'
    | 'eligibility_integrity_failure'
  >
}
type ProbeRecordResult =
  | { kind: 'observed'; publicationRef: string; revision: number; lifecycle: PublicationLifecycle }
  | { kind: 'refused'; reason: 'revision_changed' | 'target_changed' }
type ProbeArgs = { publicationRef: string; expectedRevision: number }
type CapabilityProbeAuthority = Readonly<{
  publicationRef: string
  publicationRevision: number
  businessId: Id<'businesses'>
  publisherPrincipalRef: string
  ownerPrincipalRef: string
  owningAccountRef: string
  ownershipRef: string
  accountRevision: number
  authorityDigest: string
}> & (
  | Readonly<{ mode: 'human_owner'; publisherPrincipalRevision: number }>
  | Readonly<{
      mode: 'agent_grant'
      grantRef: string
      grantGeneration: number
      grantPolicyDigest: string
      authorityExpiresAt: number
    }>
)
type ProbeTargetBase = Extract<ReadCapabilityProbeTargetResult, { kind: 'available' }>['target']
type WithResourceAuthority<T> = T extends unknown
  ? T & Readonly<{ resourceAuthority: CapabilityProbeAuthority }>
  : never
type Target = WithResourceAuthority<ProbeTargetBase>
type ProbeTargetResult =
  | Exclude<ReadCapabilityProbeTargetResult, { kind: 'available' }>
  | Readonly<{ kind: 'available'; target: Target }>
type ProbeResult = ProbeRecordResult | {
  kind: 'unavailable'
  reason: CapabilityProbeTargetUnavailableReason
  evidenceRefs: string[]
}

type ProbeTerminalEvent =
  | Readonly<{ terminalKind: 'observed'; lifecycleState: PublicationLifecycle['state'] }>
  | Readonly<{
      terminalKind: 'unavailable'
      reason: CapabilityProbeTargetUnavailableReason
    }>
  | Readonly<{
      terminalKind: 'refused'
      reason: Extract<ProbeRecordResult, { kind: 'refused' }>['reason']
    }>

function logProbeStarted(scheduledFunctionId: string | null): void {
  console.info(JSON.stringify({
    kind: 'capability_readiness_probe_started',
    schemaVersion: 'capability-readiness-probe-event:v1',
    observedAt: Date.now(),
    scheduledFunctionId,
  }))
}

function logProbeTerminal(
  scheduledFunctionId: string | null,
  terminal: ProbeTerminalEvent,
): void {
  console.info(JSON.stringify({
    kind: 'capability_readiness_probe_terminal',
    schemaVersion: 'capability-readiness-probe-event:v1',
    observedAt: Date.now(),
    scheduledFunctionId,
    ...terminal,
  }))
}

async function readScheduledFunctionId(ctx: ActionCtx): Promise<string | null> {
  if (typeof ctx.meta?.getRequestMetadata !== 'function') {
    return null
  }
  try {
    const { scheduledFunctionId } = await ctx.meta.getRequestMetadata()
    return scheduledFunctionId
  } catch (error) {
    if (error instanceof Error
      && error.message.includes('`convexTest` does not support async syscall: "1.0/getRequestMetadata"')) {
      return null
    }
    throw error
  }
}

const probeTargetUnavailableReasonValue = v.union(
  v.literal('publication_missing'), v.literal('publication_stale'),
  v.literal('offering_invalid'), v.literal('binding_invalid'),
  v.literal('contract_missing'), v.literal('input_unrepresentable'),
  v.literal('effectful_probe_unsupported'),
  v.literal('mcp_tool_missing'), v.literal('authority_stale'),
  v.literal('target_not_public'),
)
const publicationLifecycleValue = v.object({
  state: v.union(v.literal('inactive'), v.literal('active'), v.literal('withdrawn'), v.literal('incompatible')),
  reasons: v.array(v.union(
    v.literal('admission_unproven'),
    v.literal('conformance_unproven'),
    v.literal('credential_readiness_unobserved'),
    v.literal('health_unobserved'),
    v.literal('credential_unavailable'),
    v.literal('health_unhealthy'),
    v.literal('health_stale'),
    v.literal('withdrawn'),
    v.literal('incompatible_revision'),
    v.literal('eligibility_integrity_failure'),
  )),
})
const probeResultValue = v.union(
  v.object({
    kind: v.literal('unavailable'),
    reason: probeTargetUnavailableReasonValue,
    evidenceRefs: v.array(v.string()),
  }),
  v.object({
    kind: v.literal('refused'),
    reason: v.union(v.literal('revision_changed'), v.literal('target_changed')),
  }),
  v.object({
    kind: v.literal('observed'),
    publicationRef: v.string(),
    revision: v.number(),
    lifecycle: publicationLifecycleValue,
  }),
)
export async function probeHandler(ctx: ActionCtx, args: ProbeArgs): Promise<ProbeResult> {
    const scheduledFunctionId = await readScheduledFunctionId(ctx)
    logProbeStarted(scheduledFunctionId)
    const result: ProbeTargetResult = await ctx.runQuery(
      internal.capabilitySupply.readCapabilityProbeTarget,
      { ...args, now: Date.now() },
    )
    if (result.kind !== 'available') {
      logProbeTerminal(scheduledFunctionId, {
        terminalKind: 'unavailable',
        reason: result.reason,
      })
      return {
        kind: 'unavailable' as const,
        reason: result.reason,
        evidenceRefs: [...result.evidenceRefs],
      }
    }
    const target: Target = result.target
    const observation = await runCapabilityReadinessProbe(target, {
      resolveProviderConnectionCredential: async (authority) => {
        if (authority.kind !== 'provider_connection' || !('connectionAuthority' in target)) return undefined
        const expected = target.connectionAuthority
        if (
          authority.connectionRef !== expected.connectionRef
          || authority.providerRef !== expected.providerRef
        ) return undefined
        const row = await ctx.runQuery(internal.capabilityProviderConnections.read, {
          connectionRef: expected.connectionRef,
        })
        if (row === null
          || row.providerRef !== expected.providerRef
          || row.adapterId !== expected.adapterId
          || row.authorityGeneration !== expected.authorityGeneration
          || row.authorityDigest !== expected.authorityDigest
          || [...row.grantedScopes].sort().join('\u0000') !== [...expected.grantedScopes].sort().join('\u0000')
          || [...row.grantedResources].sort().join('\u0000') !== [...expected.grantedResources].sort().join('\u0000')) return undefined
        const resolved = await ctx.runQuery(internal.capabilityProviderConnections.resolveCredentialRef, {
          connectionRef: expected.connectionRef,
          expectedAuthorityGeneration: expected.authorityGeneration,
          expectedAuthorityDigest: expected.authorityDigest,
          now: Date.now(),
        })
        return resolved.kind === 'resolved'
          ? credentialFromEnvironment(resolved.credentialRef)
          : undefined
      },
      validateTarget: async (url) => isPublicHttpTarget(url, defaultDnsResolver),
      send: sendGuardedHttpRequest,
    })
    const recorded: ProbeRecordResult = await ctx.runMutation(
      internal.capabilitySupply.recordCapabilityProbeResult,
      {
        publicationRef: target.publicationRef,
        expectedRevision: target.revision,
        targetDigest: observation.targetDigest,
        requestDigest: observation.requestDigest,
        ...(observation.responseStatus === undefined ? {} : { responseStatus: observation.responseStatus }),
        ...(observation.responseContentType === undefined ? {} : { responseContentType: observation.responseContentType }),
        ...(observation.responseDigest === undefined ? {} : { responseDigest: observation.responseDigest }),
        outcome: observation.outcome,
        credentialState: observation.credentialState,
        healthState: observation.healthState,
        observedAt: observation.observedAt,
        validUntil: observation.validUntil,
        evidenceRefs: [...observation.evidenceRefs],
        resourceAuthority: target.resourceAuthority,
      },
    )
    if (recorded.kind === 'observed') {
      logProbeTerminal(scheduledFunctionId, {
        terminalKind: 'observed',
        lifecycleState: recorded.lifecycle.state,
      })
    } else {
      logProbeTerminal(scheduledFunctionId, {
        terminalKind: 'refused',
        reason: recorded.reason,
      })
    }
    return recorded
}

export async function probeFromCronHandler(
  ctx: ActionCtx,
  args: ProbeArgs & Readonly<{ workload: unknown }>,
): Promise<ProbeResult> {
  const { workload: workloadInput, ...probeArgs } = args
  const parsed = parseWorkloadCronSnapshot(workloadInput)
  const workload: WorkloadCronSnapshot = await ctx.runQuery(internal.workloadCron.reconcile, {
    name: 'refresh capability supply readiness',
    snapshot: parsed,
  })
  return await probeHandler(bindWorkloadCronActionContext(ctx, {
    name: 'refresh capability supply readiness',
    snapshot: workload,
  }), probeArgs)
}

export const probe: RegisteredAction<'internal', ProbeArgs, ProbeResult> = internalAction({
  args: { publicationRef: v.string(), expectedRevision: v.number() },
  returns: probeResultValue,
  handler: probeHandler,
})

export const probeFromCron = internalAction({
  args: {
    publicationRef: v.string(),
    expectedRevision: v.number(),
    workload: workloadCronSnapshotValue,
  },
  returns: probeResultValue,
  handler: probeFromCronHandler,
})
