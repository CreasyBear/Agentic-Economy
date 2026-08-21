import { v } from 'convex/values'
import {
  consumeProviderConnectionLease,
  expireProviderConnectionLease,
  invalidateProviderConnectionLease,
  issueProviderConnectionLease,
  resolveProviderConnectionCredentialRefForLease,
  validateProviderConnectionLeaseAuthority,
  type ProviderConnectionLeaseApproval,
  type ProviderConnectionLeaseCommandResult,
} from '../src/modules/capability-supply/provider-connection'
import {
  isProviderApprovalDecisionIntegrityValid,
  type ProviderApprovalDecision,
} from '../src/modules/capability-supply/provider-approval'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { toDomain, toLeaseDomain, toLeaseRow } from './capabilityProviderConnectionLifecycle'

const leaseState = v.union(
  v.literal('active'),
  v.literal('consumed'),
  v.literal('expired'),
  v.literal('invalidated'),
)
export const leaseValue = v.object({
  leaseRef: v.string(),
  invocationRef: v.string(),
  operationRef: v.string(),
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
  invocationRef: v.string(),
  operationRef: v.string(),
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
  invocationRef: v.string(),
} as const
export const resolveLeaseCredentialRefArgs = {
  leaseRef: v.string(),
  connectionRef: v.string(),
  invocationRef: v.string(),
  operationRef: v.string(),
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
  invocationRef: v.string(),
  operationRef: v.string(),
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

type IssueLeaseArgs = {
  commandId: string
  leaseRef: string
  invocationRef: string
  operationRef: string
  connectionRef: string
  providerRef: string
  providerAccountRef: string
  adapterId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  requestedScopes: string[]
  grantedScopes: string[]
  requestedResources: string[]
  grantedResources: string[]
  approvalDecisionRef: string
  readinessValidUntil: number
  readinessDigest?: string
  leaseMs: number
  evidenceRefs: string[]
  now: number
}

type ResolveLeaseCredentialRefArgs = {
  leaseRef: string
  connectionRef: string
  invocationRef: string
  operationRef: string
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
  invocationRef: string
  operationRef: string
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

function projectLeaseResult(result: ProviderConnectionLeaseCommandResult) {
  if (result.kind === 'refused') return result
  const lease = toLeaseRow(result.lease, result.lease.lastCommandId ?? '', result.commandDigest)
  return result.kind === 'applied'
    ? { kind: 'applied' as const, lease, commandDigest: result.commandDigest }
    : { kind: 'duplicate' as const, lease, commandDigest: result.commandDigest }
}

async function leaseRowForConnection(ctx: MutationCtx, leaseRef: string) {
  const lease = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', leaseRef)).unique()
  if (lease === null) return null
  return await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', lease.connectionRef)).unique()
}

export async function issueLeaseHandler(ctx: MutationCtx, args: IssueLeaseArgs) {
  const [connectionRow, approvalRow, existingLeaseRow] = await Promise.all([
    ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (index) => index.eq('connectionRef', args.connectionRef)).unique(),
    ctx.db.query('capabilityProviderApprovals')
      .withIndex('by_decisionRef', (index) => index.eq('decisionRef', args.approvalDecisionRef)).unique(),
    ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique(),
  ])
  if (approvalRow === null || !isProviderApprovalDecisionIntegrityValid(approvalRow as ProviderApprovalDecision)) {
    return { kind: 'refused' as const, code: 'approval_missing' as const }
  }
  const result = issueProviderConnectionLease(
    connectionRow === null ? undefined : toDomain(connectionRow),
    {
      commandId: args.commandId,
      leaseRef: args.leaseRef,
      invocationRef: args.invocationRef,
      operationRef: args.operationRef,
      connectionRef: args.connectionRef,
      providerRef: args.providerRef,
      providerAccountRef: args.providerAccountRef,
      adapterId: args.adapterId,
      expectedAuthorityGeneration: args.expectedAuthorityGeneration,
      expectedAuthorityDigest: args.expectedAuthorityDigest,
      requestedScopes: args.requestedScopes,
      grantedScopes: args.grantedScopes,
      requestedResources: args.requestedResources,
      grantedResources: args.grantedResources,
      approval: approvalRow,
      readinessValidUntil: args.readinessValidUntil,
      ...(args.readinessDigest === undefined ? {} : { readinessDigest: args.readinessDigest }),
      leaseMs: args.leaseMs,
      evidenceRefs: args.evidenceRefs,
    },
    args.now,
    existingLeaseRow === null ? undefined : toLeaseDomain(existingLeaseRow),
  )
  if (result.kind === 'applied') {
    await ctx.db.insert(
      'capabilityProviderConnectionLeases',
      toLeaseRow(result.lease, args.commandId, result.commandDigest),
    )
  }
  return projectLeaseResult(result)
}

export async function readLeaseHandler(ctx: QueryCtx, args: { leaseRef: string }) {
  const row = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique()
  return row === null ? null : toLeaseRow(toLeaseDomain(row), row.lastCommandId, row.lastCommandDigest)
}

export async function readLeaseByInvocationHandler(ctx: QueryCtx, args: { invocationRef: string }) {
  const row = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_invocationRef', (index) => index.eq('invocationRef', args.invocationRef)).order('desc').first()
  return row === null ? null : toLeaseRow(toLeaseDomain(row), row.lastCommandId, row.lastCommandDigest)
}

export async function resolveLeaseCredentialRefHandler(ctx: QueryCtx, args: ResolveLeaseCredentialRefArgs) {
  const [connectionRow, leaseRow] = await Promise.all([
    ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (index) => index.eq('connectionRef', args.connectionRef)).unique(),
    ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique(),
  ])
  const approvalRow = leaseRow === null
    ? null
    : await ctx.db.query('capabilityProviderApprovals')
      .withIndex('by_decisionRef', (index) => index.eq('decisionRef', leaseRow.approvalDecisionRef)).unique()
  const currentApproval: ProviderConnectionLeaseApproval | null =
    approvalRow === null || !isProviderApprovalDecisionIntegrityValid(approvalRow as ProviderApprovalDecision)
      ? null
      : {
          decisionRef: approvalRow.decisionRef,
          decisionDigest: approvalRow.decisionDigest,
          providerRef: approvalRow.providerRef,
          providerAccountRef: approvalRow.providerAccountRef,
          connectionRef: approvalRow.connectionRef,
          authorityGeneration: approvalRow.authorityGeneration,
          connectionAuthorityDigest: approvalRow.connectionAuthorityDigest,
          decision: approvalRow.decision,
          grantedScopes: approvalRow.grantedScopes,
          grantedResources: approvalRow.grantedResources,
        }
  return resolveProviderConnectionCredentialRefForLease(
    connectionRow === null ? undefined : toDomain(connectionRow),
    leaseRow === null ? undefined : toLeaseDomain(leaseRow),
    {
      leaseRef: args.leaseRef,
      invocationRef: args.invocationRef,
      operationRef: args.operationRef,
      connectionRef: args.connectionRef,
      providerRef: args.providerRef,
      providerAccountRef: args.providerAccountRef,
      adapterId: args.adapterId,
      authorityGeneration: args.authorityGeneration,
      authorityDigest: args.authorityDigest,
      grantedScopes: args.grantedScopes,
      grantedResources: args.grantedResources,
      readinessValidUntil: args.readinessValidUntil,
      ...(args.readinessDigest === undefined ? {} : { readinessDigest: args.readinessDigest }),
    },
    args.now,
    currentApproval,
  )
}

export async function validateLeaseAuthorityHandler(ctx: QueryCtx, args: ValidateLeaseAuthorityArgs) {
  const [connectionRow, leaseRow] = await Promise.all([
    ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (index) => index.eq('connectionRef', args.connectionRef)).unique(),
    ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique(),
  ])
  const lease = leaseRow === null ? undefined : toLeaseDomain(leaseRow)
  const approvalRow = leaseRow === null
    ? null
    : await ctx.db.query('capabilityProviderApprovals')
      .withIndex('by_decisionRef', (index) => index.eq('decisionRef', leaseRow.approvalDecisionRef)).unique()
  const currentApproval: ProviderConnectionLeaseApproval | null =
    approvalRow === null || !isProviderApprovalDecisionIntegrityValid(approvalRow as ProviderApprovalDecision)
      ? null
      : {
          decisionRef: approvalRow.decisionRef,
          decisionDigest: approvalRow.decisionDigest,
          providerRef: approvalRow.providerRef,
          providerAccountRef: approvalRow.providerAccountRef,
          connectionRef: approvalRow.connectionRef,
          authorityGeneration: approvalRow.authorityGeneration,
          connectionAuthorityDigest: approvalRow.connectionAuthorityDigest,
          decision: approvalRow.decision,
          grantedScopes: approvalRow.grantedScopes,
          grantedResources: approvalRow.grantedResources,
        }
  return validateProviderConnectionLeaseAuthority(
    connectionRow === null ? undefined : toDomain(connectionRow),
    lease,
    {
      leaseRef: args.leaseRef,
      invocationRef: args.invocationRef,
      operationRef: args.operationRef,
      connectionRef: args.connectionRef,
      providerRef: args.providerRef,
      providerAccountRef: lease?.providerAccountRef ?? '',
      adapterId: args.adapterId,
      authorityGeneration: args.authorityGeneration,
      authorityDigest: args.authorityDigest,
      grantedScopes: args.grantedScopes,
      grantedResources: args.grantedResources,
      readinessValidUntil: args.readinessValidUntil,
      ...(args.readinessDigest === undefined ? {} : { readinessDigest: args.readinessDigest }),
    },
    args.now,
    currentApproval,
  )
}

export async function consumeLeaseHandler(ctx: MutationCtx, args: ConsumeLeaseArgs) {
  const [leaseRow, connectionRow] = await Promise.all([
    ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique(),
    leaseRowForConnection(ctx, args.leaseRef),
  ])
  const currentConnection = connectionRow === null ? undefined : toDomain(connectionRow)
  const result = consumeProviderConnectionLease(
    leaseRow === null ? undefined : toLeaseDomain(leaseRow),
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
    args.now,
  )
  if (result.kind === 'applied' && leaseRow !== null) {
    await ctx.db.replace(leaseRow._id, toLeaseRow(result.lease, args.commandId, result.commandDigest))
  }
  return projectLeaseResult(result)
}

export async function expireLeaseHandler(ctx: MutationCtx, args: ExpireLeaseArgs) {
  const existing = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique()
  const result = expireProviderConnectionLease(existing === null ? undefined : toLeaseDomain(existing), args, args.now)
  if (result.kind === 'applied' && existing !== null) {
    await ctx.db.replace(existing._id, toLeaseRow(result.lease, args.commandId, result.commandDigest))
  }
  return projectLeaseResult(result)
}

export async function invalidateLeaseHandler(ctx: MutationCtx, args: InvalidateLeaseArgs) {
  const existing = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique()
  const result = invalidateProviderConnectionLease(existing === null ? undefined : toLeaseDomain(existing), args, args.now)
  if (result.kind === 'applied' && existing !== null) {
    await ctx.db.replace(existing._id, toLeaseRow(result.lease, args.commandId, result.commandDigest))
  }
  return projectLeaseResult(result)
}
