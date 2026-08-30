import type {
  ProviderConnectionAuthorityReader,
  ProviderConnectionAuthorityValidator,
} from '@/modules/capability-supply/route-transport-runtime'
import type { PublishedOperation } from '@/modules/capability-supply/public'
import type { ActionCtx } from '../../../../convex/_generated/server'
import { internal } from '../../../../convex/_generated/api'
import type { OpenDispatch } from '../../../../convex/capabilityOperationInvocationProjection'

export type ConnectionAuthority = Readonly<{
  connectionRef: string
  providerRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
}>

export type ProviderLeaseAuthority = Readonly<{
  connectionRef: string
  authorityGeneration: number
  authorityDigest: string
  grantedScopes: readonly string[]
  grantedResources: readonly string[]
  leaseExpiresAt: number
}>

export async function issueProviderLease(
  ctx: ActionCtx,
  input: Readonly<{
    dispatch: OpenDispatch
    operation: PublishedOperation
    connectionAuthority: ConnectionAuthority
    durableAttemptRef: string
    durableEffectGeneration: number
    authorityExpiresAt: string
  }>,
): Promise<
  | Readonly<{ kind: 'issued'; leaseRef: string; leaseAuthority: ProviderLeaseAuthority }>
  | Readonly<{ kind: 'refused'; nextAction: string }>
> {
  const authority = await ctx.runQuery(internal.capabilityOperationInvocations.readProviderLeaseAuthority, {
    connectionRef: input.connectionAuthority.connectionRef,
    authorityGeneration: input.connectionAuthority.authorityGeneration,
  })
  if (authority === null) {
    return { kind: 'refused', nextAction: 'Provider approval changed before lease issuance.' }
  }
  const leaseNow = Date.now()
  const leaseMs = Math.min(30_000, Date.parse(input.authorityExpiresAt) - leaseNow)
  if (leaseMs < 100) {
    return { kind: 'refused', nextAction: 'Provider authority expires too soon for a connection lease.' }
  }
  const lease = await ctx.runMutation(internal.capabilityProviderConnections.issueLease, {
    commandId: `operation-lease:${input.dispatch.invocationRef}:${input.durableAttemptRef}`,
    leaseRef: `operation-lease:${input.dispatch.invocationRef}:${input.durableAttemptRef}:${input.durableEffectGeneration}`,
    invocationRef: input.dispatch.invocationRef,
    operationRef: input.dispatch.operationRef,
    connectionRef: authority.connectionRef,
    providerRef: authority.providerRef,
    providerAccountRef: authority.providerAccountRef,
    adapterId: authority.adapterId,
    expectedAuthorityGeneration: authority.authorityGeneration,
    expectedAuthorityDigest: authority.authorityDigest,
    requestedScopes: [...authority.grantedScopes],
    grantedScopes: [...authority.grantedScopes],
    requestedResources: [...authority.grantedResources],
    grantedResources: [...authority.grantedResources],
    approvalDecisionRef: authority.approvalDecisionRef,
    readinessValidUntil: input.operation.readiness.validUntil,
    readinessDigest: input.operation.readiness.qualificationDigest,
    leaseMs,
    evidenceRefs: [...input.operation.readiness.evidenceRefs],
    now: leaseNow,
  })
  if (lease.kind !== 'applied' && lease.kind !== 'duplicate') {
    return { kind: 'refused', nextAction: 'Provider connection lease was refused.' }
  }
  return {
    kind: 'issued',
    leaseRef: lease.lease.leaseRef,
    leaseAuthority: {
      connectionRef: lease.lease.connectionRef,
      authorityGeneration: lease.lease.authorityGeneration,
      authorityDigest: lease.lease.authorityDigest,
      grantedScopes: lease.lease.grantedScopes,
      grantedResources: lease.lease.grantedResources,
      leaseExpiresAt: lease.lease.expiresAt,
    },
  }
}

export async function settleProviderLease(
  ctx: ActionCtx,
  dispatch: OpenDispatch,
  operation: PublishedOperation,
  leaseRef: string | undefined,
  leaseAuthority: Readonly<{
    authorityGeneration: number
    authorityDigest: string
    leaseExpiresAt: number
  }> | undefined,
  releaseStarted: boolean,
  attemptRef = `operation-attempt:${dispatch.invocationRef}:1`,
  effectGeneration = 1,
): Promise<void> {
  if (leaseRef === undefined || leaseAuthority === undefined) return
  const commandPrefix = `operation-lease:${dispatch.invocationRef}:${attemptRef}:${effectGeneration}`
  const evidenceRefs = [...operation.readiness.evidenceRefs]
  const now = Date.now()
  if (releaseStarted) {
    const result = await ctx.runMutation(internal.capabilityProviderConnections.consumeLease, {
      leaseRef,
      commandId: `${commandPrefix}:consume`,
      expectedAuthorityGeneration: leaseAuthority.authorityGeneration,
      expectedAuthorityDigest: leaseAuthority.authorityDigest,
      readinessValidUntil: operation.readiness.validUntil,
      readinessDigest: operation.readiness.qualificationDigest,
      evidenceRefs,
      now,
    })
    if (result.kind === 'refused' && result.code === 'lease_expired') {
      await ctx.runMutation(internal.capabilityProviderConnections.expireLease, {
        leaseRef,
        commandId: `${commandPrefix}:expire`,
        evidenceRefs,
        now,
      })
    }
    return
  }
  if (now >= leaseAuthority.leaseExpiresAt) {
    await ctx.runMutation(internal.capabilityProviderConnections.expireLease, {
      leaseRef,
      commandId: `${commandPrefix}:expire`,
      evidenceRefs,
      now,
    })
    return
  }
  await ctx.runMutation(internal.capabilityProviderConnections.invalidateLease, {
    leaseRef,
    commandId: `${commandPrefix}:invalidate`,
    reasonCode: now >= operation.readiness.validUntil ? 'readiness_expired' : 'invocation_aborted',
    evidenceRefs,
    now,
  })
}

export function providerCredentialReader(
  ctx: ActionCtx,
  connectionAuthority: ConnectionAuthority,
  dispatch: OpenDispatch,
): ProviderConnectionAuthorityReader {
  return async (lookup) => {
    if (
      lookup.leaseRef === undefined
      || lookup.invocationRef !== dispatch.invocationRef
      || lookup.operationRef !== dispatch.operationRef
      || lookup.connectionRef !== connectionAuthority.connectionRef
      || lookup.providerRef !== connectionAuthority.providerRef
      || lookup.authorityGeneration !== connectionAuthority.authorityGeneration
      || lookup.authorityDigest !== connectionAuthority.authorityDigest
      || lookup.grantedScopes === undefined
      || lookup.grantedResources === undefined
      || lookup.readinessValidUntil === undefined
    ) return { kind: 'unavailable' as const, reason: 'lease_identity_mismatch' as const }
    const authorityExpiresAt = dispatch.authority?.expiresAt
    if (authorityExpiresAt === undefined || Date.parse(authorityExpiresAt) <= Date.now()) {
      return { kind: 'unavailable' as const, reason: 'lease_expired' as const }
    }
    const authority = await ctx.runQuery(internal.capabilityOperationInvocations.readProviderLeaseAuthority, {
      connectionRef: lookup.connectionRef,
      authorityGeneration: lookup.authorityGeneration,
    })
    if (authority === null || authority.providerRef !== connectionAuthority.providerRef) {
      return { kind: 'unavailable' as const, reason: 'connection_not_found' as const }
    }
    return await ctx.runQuery(internal.capabilityProviderConnections.resolveLeaseCredentialRef, {
      leaseRef: lookup.leaseRef,
      connectionRef: lookup.connectionRef,
      invocationRef: lookup.invocationRef,
      operationRef: lookup.operationRef,
      providerRef: lookup.providerRef,
      providerAccountRef: authority.providerAccountRef,
      adapterId: lookup.adapterId,
      authorityGeneration: lookup.authorityGeneration,
      authorityDigest: lookup.authorityDigest,
      grantedScopes: [...lookup.grantedScopes],
      grantedResources: [...lookup.grantedResources],
      readinessValidUntil: lookup.readinessValidUntil,
      ...(lookup.readinessDigest === undefined ? {} : { readinessDigest: lookup.readinessDigest }),
      now: Date.now(),
    })
  }
}

export function providerLeaseAuthorityValidator(
  ctx: ActionCtx,
  connectionAuthority: ConnectionAuthority,
  dispatch: OpenDispatch,
): ProviderConnectionAuthorityValidator {
  return async (lookup) => {
    if (
      lookup.leaseRef === undefined
      || lookup.invocationRef !== dispatch.invocationRef
      || lookup.operationRef !== dispatch.operationRef
      || lookup.connectionRef !== connectionAuthority.connectionRef
      || lookup.providerRef !== connectionAuthority.providerRef
      || lookup.adapterId !== connectionAuthority.adapterId
      || lookup.authorityGeneration !== connectionAuthority.authorityGeneration
      || lookup.authorityDigest !== connectionAuthority.authorityDigest
      || lookup.grantedScopes === undefined
      || lookup.grantedResources === undefined
      || lookup.readinessValidUntil === undefined
    ) return { kind: 'unavailable' as const, reason: 'lease_identity_mismatch' as const }
    const authorityExpiresAt = dispatch.authority?.expiresAt
    if (authorityExpiresAt === undefined || Date.parse(authorityExpiresAt) <= Date.now()) {
      return { kind: 'unavailable' as const, reason: 'lease_expired' as const }
    }
    return await ctx.runQuery(internal.capabilityProviderConnections.validateLeaseAuthority, {
      leaseRef: lookup.leaseRef,
      connectionRef: lookup.connectionRef,
      invocationRef: lookup.invocationRef,
      operationRef: lookup.operationRef,
      providerRef: lookup.providerRef,
      adapterId: lookup.adapterId,
      authorityGeneration: lookup.authorityGeneration,
      authorityDigest: lookup.authorityDigest,
      grantedScopes: [...lookup.grantedScopes],
      grantedResources: [...lookup.grantedResources],
      readinessValidUntil: lookup.readinessValidUntil,
      ...(lookup.readinessDigest === undefined ? {} : { readinessDigest: lookup.readinessDigest }),
      now: Date.now(),
    })
  }
}
