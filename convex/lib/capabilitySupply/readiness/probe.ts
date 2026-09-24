"use node"

import { defaultDnsResolver, isPublicHttpTarget } from '@/modules/network-guard/public'
import { sendGuardedHttpRequest } from '@/modules/network-guard/server'
import { credentialFromEnvironment, runCapabilityReadinessProbe } from '@/modules/capability-supply/server'
import { internal } from '../../../_generated/api'
import type { Id } from '../../../_generated/dataModel'
import type { ActionCtx } from '../../../_generated/server'
import type { ProbeArgs, OwnerStagedProbeArgs, ProbeResult, ProbeRecordResult, ProbeTargetResult, Target, ProbeTerminalEvent } from './contracts'

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
export async function probeHandler(
  ctx: ActionCtx,
  args: ProbeArgs,
  ownerStagedBusinessId?: Id<'businesses'>,
): Promise<ProbeResult> {
    const scheduledFunctionId = await readScheduledFunctionId(ctx)
    logProbeStarted(scheduledFunctionId)
    const result: ProbeTargetResult = ownerStagedBusinessId === undefined
      ? await ctx.runQuery(
          internal.capabilitySupply.readCapabilityProbeTarget,
          { ...args, now: Date.now() },
        )
      : await ctx.runQuery(
          internal.capabilitySupply.readOwnerStagedCapabilityProbeTarget,
          { ...args, businessId: ownerStagedBusinessId, now: Date.now() },
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
    const probeObservation = await runCapabilityReadinessProbe(target, {
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
    const recordInput = {
        publicationRef: target.publicationRef,
        expectedRevision: target.revision,
        targetDigest: probeObservation.targetDigest,
        requestDigest: probeObservation.requestDigest,
        ...(probeObservation.responseStatus === undefined ? {} : { responseStatus: probeObservation.responseStatus }),
        ...(probeObservation.responseContentType === undefined ? {} : { responseContentType: probeObservation.responseContentType }),
        ...(probeObservation.responseDigest === undefined ? {} : { responseDigest: probeObservation.responseDigest }),
        outcome: probeObservation.outcome,
        credentialState: probeObservation.credentialState,
        healthState: probeObservation.healthState,
        observedAt: probeObservation.observedAt,
        validUntil: probeObservation.validUntil,
        evidenceRefs: [...probeObservation.evidenceRefs],
        resourceAuthority: target.resourceAuthority,
      }
    const recorded: ProbeRecordResult = ownerStagedBusinessId === undefined
      ? await ctx.runMutation(
          internal.capabilitySupply.recordCapabilityProbeResult,
          recordInput,
        )
      : await ctx.runMutation(
          internal.capabilitySupply.recordOwnerStagedCapabilityProbeResult,
          { ...recordInput, businessId: ownerStagedBusinessId },
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

export async function probeOwnerStagedHandler(ctx: ActionCtx, args: OwnerStagedProbeArgs): Promise<ProbeResult> {
  const { businessId, ...probeArgs } = args
  return await probeHandler(ctx, probeArgs, businessId)
}
