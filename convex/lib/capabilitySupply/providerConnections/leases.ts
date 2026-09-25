import { v } from 'convex/values'
import {
  consumeProviderConnectionLease,
  expireProviderConnectionLease,
  invalidateProviderConnectionLease,
  providerConnectionAuthorityProvenanceIsValid,
  type ProviderConnectionLeaseCommandResult,
} from '../../../../src/modules/capability-supply/provider-connection'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import {
  toDomain,
  toLeaseDomain,
  toLeaseRow,
} from './lifecycle'

const leaseState = v.union(
  v.literal('active'),
  v.literal('consumed'),
  v.literal('expired'),
  v.literal('invalidated'),
)
export const leaseValue = v.object({
  leaseRef: v.string(),
  owningAccountRef: v.string(),
  activeAccountRef: v.string(),
  actorPrincipalRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  callRef: v.string(),
  toolRef: v.string(),
  connectionRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  approvalDecisionRef: v.string(),
  approvalDecisionDigest: v.string(),
  readinessValidUntil: v.number(),
  readinessDigest: v.optional(v.string()),
  state: leaseState,
  issuedAt: v.number(),
  expiresAt: v.number(),
  consumedAt: v.optional(v.number()),
  invalidatedAt: v.optional(v.number()),
  evidenceRefs: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
  lastCommandId: v.string(),
  lastCommandDigest: v.string(),
})
export const leaseResult = v.union(
  v.object({ kind: v.literal('applied'), lease: leaseValue, commandDigest: v.string() }),
  v.object({ kind: v.literal('duplicate'), lease: leaseValue, commandDigest: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('invalid_identity'), v.literal('invalid_time'), v.literal('invalid_generation'),
      v.literal('invalid_digest'), v.literal('invalid_scope'), v.literal('invalid_resource'),
      v.literal('invalid_lease'), v.literal('invalid_transition'), v.literal('connection_not_found'),
      v.literal('connection_not_active'), v.literal('connection_expired'), v.literal('approval_missing'),
      v.literal('approval_refused'), v.literal('approval_stale'), v.literal('approval_scope_mismatch'),
      v.literal('approval_resource_mismatch'), v.literal('readiness_expired'), v.literal('readiness_mismatch'),
      v.literal('lease_not_found'), v.literal('lease_inactive'), v.literal('lease_expired'),
      v.literal('lease_generation_stale'), v.literal('lease_digest_stale'), v.literal('lease_scope_mismatch'),
      v.literal('lease_resource_mismatch'), v.literal('lease_identity_mismatch'), v.literal('lease_not_expired'),
      v.literal('command_identity_conflict'),
    ),
  }),
)
export const leaseCredentialResolution = v.union(
  v.object({ kind: v.literal('resolved'), credentialRef: v.string() }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('lease_not_found'), v.literal('lease_inactive'), v.literal('lease_expired'),
      v.literal('lease_generation_stale'), v.literal('lease_digest_stale'),
      v.literal('lease_scope_mismatch'), v.literal('lease_resource_mismatch'),
      v.literal('lease_identity_mismatch'), v.literal('connection_not_found'),
      v.literal('connection_inactive'), v.literal('connection_expired'),
      v.literal('readiness_expired'), v.literal('readiness_mismatch'),
      v.literal('credential_unavailable'),
    ),
  }),
)
export const leaseAuthorityValidation = v.union(
  v.object({ kind: v.literal('valid') }),
  v.object({
    kind: v.literal('unavailable'),
    reason: v.union(
      v.literal('lease_not_found'), v.literal('lease_inactive'), v.literal('lease_expired'),
      v.literal('lease_generation_stale'), v.literal('lease_digest_stale'),
      v.literal('lease_scope_mismatch'), v.literal('lease_resource_mismatch'),
      v.literal('lease_identity_mismatch'), v.literal('connection_not_found'),
      v.literal('connection_inactive'), v.literal('connection_expired'),
      v.literal('readiness_expired'), v.literal('readiness_mismatch'),
      v.literal('credential_unavailable'),
    ),
  }),
)

const leaseIssueFields = {
  commandId: v.string(),
  leaseRef: v.string(),
  callRef: v.string(),
  toolRef: v.string(),
  connectionRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  requestedScopes: v.array(v.string()),
  grantedScopes: v.array(v.string()),
  requestedResources: v.array(v.string()),
  grantedResources: v.array(v.string()),
  approvalDecisionRef: v.string(),
  readinessValidUntil: v.number(),
  readinessDigest: v.optional(v.string()),
  leaseMs: v.number(),
  evidenceRefs: v.array(v.string()),
} as const

export const issueLeaseArgs = {
  ...leaseIssueFields,
  now: v.number(),
} as const
export const readLeaseArgs = {
  leaseRef: v.string(),
} as const
export const readLeaseByInvocationArgs = {
  callRef: v.string(),
} as const
export const resolveLeaseCredentialRefArgs = {
  leaseRef: v.string(),
  connectionRef: v.string(),
  callRef: v.string(),
  toolRef: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  readinessValidUntil: v.number(),
  readinessDigest: v.optional(v.string()),
  now: v.number(),
} as const
export const validateLeaseAuthorityArgs = {
  leaseRef: v.string(),
  connectionRef: v.string(),
  callRef: v.string(),
  toolRef: v.string(),
  providerRef: v.string(),
  adapterId: v.string(),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  readinessValidUntil: v.number(),
  readinessDigest: v.optional(v.string()),
  now: v.number(),
} as const
export const consumeLeaseArgs = {
  leaseRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  readinessValidUntil: v.number(),
  readinessDigest: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
  now: v.number(),
} as const
export const expireLeaseArgs = {
  leaseRef: v.string(),
  commandId: v.string(),
  evidenceRefs: v.array(v.string()),
  now: v.number(),
} as const
export const invalidateLeaseArgs = {
  leaseRef: v.string(),
  commandId: v.string(),
  reasonCode: v.union(
    v.literal('generation_changed'),
    v.literal('revocation_started'),
    v.literal('readiness_expired'),
    v.literal('invocation_aborted'),
  ),
  evidenceRefs: v.array(v.string()),
  now: v.number(),
} as const

type ResolveLeaseCredentialRefArgs = {
  leaseRef: string
  connectionRef: string
  callRef: string
  toolRef: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
  grantedScopes: string[]
  grantedResources: string[]
  readinessValidUntil: number
  readinessDigest?: string
  now: number
}

type ValidateLeaseAuthorityArgs = {
  leaseRef: string
  connectionRef: string
  callRef: string
  toolRef: string
  providerRef: string
  adapterId: string
  authorityGeneration: number
  authorityDigest: string
  grantedScopes: string[]
  grantedResources: string[]
  readinessValidUntil: number
  readinessDigest?: string
  now: number
}

type ConsumeLeaseArgs = {
  leaseRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  readinessValidUntil: number
  readinessDigest?: string
  evidenceRefs: string[]
  now: number
}

type ExpireLeaseArgs = {
  leaseRef: string
  commandId: string
  evidenceRefs: string[]
  now: number
}

type InvalidateLeaseArgs = {
  leaseRef: string
  commandId: string
  reasonCode: 'generation_changed' | 'revocation_started' | 'readiness_expired' | 'invocation_aborted'
  evidenceRefs: string[]
  now: number
}

export function projectLeaseResult(result: ProviderConnectionLeaseCommandResult) {
  if (result.kind === 'refused') return result
  const lease = toLeaseRow(result.lease, result.lease.lastCommandId ?? '', result.commandDigest)
  return result.kind === 'applied'
    ? { kind: 'applied' as const, lease, commandDigest: result.commandDigest }
    : { kind: 'duplicate' as const, lease, commandDigest: result.commandDigest }
}

async function leaseRowForConnection(ctx: Pick<QueryCtx, 'db'>, leaseRef: string) {
  const lease = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', leaseRef)).unique()
  if (lease === null) return null
  return await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', lease.connectionRef)).unique()
}

export function providerLeaseIsCurrent(
  leaseRow: ReturnType<typeof toLeaseDomain> | undefined,
  connectionRow: ReturnType<typeof toDomain> | undefined,
  now = Date.now(),
  allowExpired = false,
): boolean {
  if (leaseRow === undefined || connectionRow === undefined) return false
  const connectionAcceptsLease = [
    providerConnectionAuthorityProvenanceIsValid(connectionRow),
    connectionRow.lifecycle === 'active',
    connectionRow.expiresAt === undefined || connectionRow.expiresAt > now,
  ].every(Boolean)
  const leaseIsLive = leaseRow.state === 'active' && (allowExpired || leaseRow.expiresAt > now)
  const authorityMatches = [
    leaseRow.owningAccountRef === connectionRow.owningAccountRef,
    leaseRow.activeAccountRef === connectionRow.owningAccountRef,
    leaseRow.connectionRef === connectionRow.connectionRef,
    leaseRow.providerRef === connectionRow.providerRef,
    leaseRow.providerAccountRef === connectionRow.providerAccountRef,
    leaseRow.adapterId === connectionRow.adapterId,
    leaseRow.authorityGeneration === connectionRow.authorityGeneration,
    leaseRow.authorityDigest === connectionRow.authorityDigest,
  ].every(Boolean)
  return connectionAcceptsLease && leaseIsLive && authorityMatches
}

export async function readLeaseHandler(ctx: QueryCtx, args: { leaseRef: string }) {
  const row = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique()
  if (row === null) return null
  const connection = await leaseRowForConnection(ctx, args.leaseRef)
  const lease = toLeaseDomain(row)
  if (!providerLeaseIsCurrent(lease, connection === null ? undefined : toDomain(connection))) return null
  return toLeaseRow(lease, row.lastCommandId, row.lastCommandDigest)
}

export async function readLeaseByInvocationHandler(ctx: QueryCtx, args: { callRef: string }) {
  const row = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_callRef', (index) => index.eq('callRef', args.callRef)).order('desc').first()
  if (row === null) return null
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', row.connectionRef)).unique()
  const lease = toLeaseDomain(row)
  if (!providerLeaseIsCurrent(lease, connection === null ? undefined : toDomain(connection))) return null
  return toLeaseRow(lease, row.lastCommandId, row.lastCommandDigest)
}

export async function resolveLeaseCredentialRefHandler(ctx: QueryCtx, args: ResolveLeaseCredentialRefArgs) {
  void ctx
  void args
  // Queries are cached and cannot establish consequence-time lease validity.
  // The beginLeaseEffect mutation below is the only credential-pointer gate.
  return { kind: 'unavailable' as const, reason: 'lease_inactive' as const }
}

export async function validateLeaseAuthorityHandler(ctx: QueryCtx, args: ValidateLeaseAuthorityArgs) {
  void ctx
  void args
  return { kind: 'unavailable' as const, reason: 'lease_inactive' as const }
}

export async function consumeLeaseHandler(ctx: MutationCtx, args: ConsumeLeaseArgs) {
  const [leaseRow, connectionRow] = await Promise.all([
    ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique(),
    leaseRowForConnection(ctx, args.leaseRef),
  ])
  const currentConnection = connectionRow === null ? undefined : toDomain(connectionRow)
  const lease = leaseRow === null ? undefined : toLeaseDomain(leaseRow)
  if (!providerLeaseIsCurrent(lease, currentConnection)) {
    return { kind: 'refused' as const, code: 'lease_inactive' as const }
  }
  const result = consumeProviderConnectionLease(
    lease,
    currentConnection,
    {
      commandId: args.commandId,
      leaseRef: args.leaseRef,
      expectedAuthorityGeneration: args.expectedAuthorityGeneration,
      expectedAuthorityDigest: args.expectedAuthorityDigest,
      readinessValidUntil: args.readinessValidUntil,
      ...(args.readinessDigest === undefined ? {} : { readinessDigest: args.readinessDigest }),
      evidenceRefs: args.evidenceRefs,
    },
    Date.now(),
  )
  if (result.kind === 'applied' && leaseRow !== null) {
    await ctx.db.replace(leaseRow._id, toLeaseRow(result.lease, args.commandId, result.commandDigest))
  }
  return projectLeaseResult(result)
}

export async function expireLeaseHandler(ctx: MutationCtx, args: ExpireLeaseArgs) {
  const existing = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique()
  if (existing === null) return { kind: 'refused' as const, code: 'lease_not_found' as const }
  const connection = await leaseRowForConnection(ctx, args.leaseRef)
  const lease = toLeaseDomain(existing)
  if (!providerLeaseIsCurrent(lease, connection === null ? undefined : toDomain(connection), Date.now(), true)) {
    return { kind: 'refused' as const, code: 'lease_inactive' as const }
  }
  const result = expireProviderConnectionLease(lease, args, Date.now())
  if (result.kind === 'applied' && existing !== null) {
    await ctx.db.replace(existing._id, toLeaseRow(result.lease, args.commandId, result.commandDigest))
  }
  return projectLeaseResult(result)
}

export async function invalidateLeaseHandler(ctx: MutationCtx, args: InvalidateLeaseArgs) {
  const existing = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique()
  if (existing === null) return { kind: 'refused' as const, code: 'lease_not_found' as const }
  const connection = await leaseRowForConnection(ctx, args.leaseRef)
  const lease = toLeaseDomain(existing)
  if (!providerLeaseIsCurrent(lease, connection === null ? undefined : toDomain(connection))) {
    return { kind: 'refused' as const, code: 'lease_inactive' as const }
  }
  const result = invalidateProviderConnectionLease(lease, args, Date.now())
  if (result.kind === 'applied' && existing !== null) {
    await ctx.db.replace(existing._id, toLeaseRow(result.lease, args.commandId, result.commandDigest))
  }
  return projectLeaseResult(result)
}
