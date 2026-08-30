import { v } from 'convex/values'
import {
  consumeProviderConnectionLease,
  expireProviderConnectionLease,
  invalidateProviderConnectionLease,
  issueProviderConnectionLease,
  providerConnectionAuthorityProvenanceIsValid,
  type ProviderConnectionLeaseCommandResult,
} from '../../../src/modules/capability-supply/provider-connection'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import {
  isProviderApprovalDecisionIntegrityValid,
  type ProviderApprovalDecision,
} from '../../../src/modules/capability-supply/provider-approval'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import {
  toDomain,
  toLeaseDomain,
  toLeaseRow,
} from './lifecycle'
import { validateCanonicalAgentDelegation } from '../canonicalAgentAuthority'

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

function existingLease(
  row: Parameters<typeof toLeaseDomain>[0] | null,
): ReturnType<typeof toLeaseDomain> | undefined {
  return row === null ? undefined : toLeaseDomain(row)
}

async function resolveInvocationLeaseAuthority(
  ctx: MutationCtx,
  args: IssueLeaseArgs,
  connection: ReturnType<typeof toDomain>,
) {
  const invocation = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  if (invocation === null) return null
  if (invocation.operationRef !== args.operationRef) return null
  const now = Date.now()
  const snapshot = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'provider-connection-lease',
    evidenceRef: args.leaseRef,
    principalRef: invocation.principalId,
    accountRef: connection.owningAccountRef,
    grantRef: invocation.grantRef,
    grantGeneration: invocation.grantGeneration,
    requiredScopes: ['connection:lease'],
    resourceRefs: [invocation.operationRef, `connection:${args.connectionRef}`],
    now,
  })
  const leaf = snapshot?.ancestry.at(-1)
  if (snapshot === null || leaf === undefined || ![
    snapshot.accountRef === connection.owningAccountRef,
    snapshot.actorPrincipalRef === invocation.principalId,
    snapshot.grantRef === invocation.grantRef,
    snapshot.generation === invocation.grantGeneration,
    leaf.expiresAt === invocation.grantExpiresAt,
  ].every(Boolean)) return null
  const expiresAt = Math.min(now + args.leaseMs, args.readinessValidUntil, snapshot.expiresAt)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null
  return {
    activeAccountRef: snapshot.accountRef,
    actorPrincipalRef: snapshot.actorPrincipalRef,
    grantRef: snapshot.grantRef,
    grantGeneration: snapshot.generation,
    leaseMs: expiresAt - now,
  }
}

async function leaseRowForConnection(ctx: Pick<QueryCtx, 'db'>, leaseRef: string) {
  const lease = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', leaseRef)).unique()
  if (lease === null) return null
  return await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', lease.connectionRef)).unique()
}

function providerLeaseIsCurrent(
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

async function persistLeaseIssueResult(
  ctx: MutationCtx,
  result: Exclude<ProviderConnectionLeaseCommandResult, { kind: 'refused' }>,
  existingLeaseRow: Parameters<typeof toLeaseDomain>[0] | null,
  currentConnection: ReturnType<typeof toDomain>,
  args: IssueLeaseArgs,
  now: number,
): Promise<boolean> {
  if (result.kind === 'applied') {
    await ctx.db.insert(
      'capabilityProviderConnectionLeases',
      toLeaseRow(result.lease, args.commandId, result.commandDigest),
    )
    return true
  }
  return existingLeaseRow !== null
    && providerLeaseIsCurrent(toLeaseDomain(existingLeaseRow), currentConnection, now)
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
  if (connectionRow === null) return { kind: 'refused' as const, code: 'connection_not_found' as const }
  const currentConnection = toDomain(connectionRow)
  if (!providerConnectionAuthorityProvenanceIsValid(currentConnection)
    || currentConnection.lifecycle !== 'active') {
    return { kind: 'refused' as const, code: 'connection_not_active' as const }
  }
  const invocationAuthority = await resolveInvocationLeaseAuthority(ctx, args, currentConnection)
  if (invocationAuthority === null) return { kind: 'refused' as const, code: 'invalid_lease' as const }
  const now = Date.now()
  const result = issueProviderConnectionLease(
    currentConnection,
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
      ...Object.fromEntries(Object.entries({
        readinessDigest: args.readinessDigest,
      }).filter(([, value]) => value !== undefined)),
      leaseMs: invocationAuthority.leaseMs,
      evidenceRefs: args.evidenceRefs,
      activeAccountRef: invocationAuthority.activeAccountRef,
      actorPrincipalRef: invocationAuthority.actorPrincipalRef,
      grantRef: invocationAuthority.grantRef,
      grantGeneration: invocationAuthority.grantGeneration,
    },
    now,
    existingLease(existingLeaseRow),
  )
  if (result.kind === 'refused') return result
  if (!await persistLeaseIssueResult(ctx, result, existingLeaseRow, currentConnection, args, now)) {
    return { kind: 'refused' as const, code: 'invalid_lease' as const }
  }
  return projectLeaseResult(result)
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

export async function readLeaseByInvocationHandler(ctx: QueryCtx, args: { invocationRef: string }) {
  const row = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_invocationRef', (index) => index.eq('invocationRef', args.invocationRef)).order('desc').first()
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

export const beginLeaseEffectArgs = {
  leaseRef: v.string(),
  invocationRef: v.string(),
  operationRef: v.string(),
  commandId: v.string(),
} as const

export const leaseEffectAdmission = v.union(
  v.object({
    kind: v.literal('admitted'),
    effectRef: v.string(),
    leaseRef: v.string(),
    connectionRef: v.string(),
    authorityGeneration: v.number(),
    owningAccountRef: v.string(),
    activeAccountRef: v.string(),
    actorPrincipalRef: v.string(),
    grantRef: v.string(),
    grantGeneration: v.number(),
    secretRef: v.string(),
  }),
  v.object({ kind: v.literal('unavailable'), reason: v.string() }),
)

function leaseMatchesEffectRequest(
  lease: ReturnType<typeof toLeaseDomain>,
  args: Readonly<{ invocationRef: string; operationRef: string }>,
): boolean {
  return [
    lease.invocationRef === args.invocationRef,
    lease.operationRef === args.operationRef,
    lease.state === 'active',
  ].every(Boolean)
}

async function invocationAuthorityMatchesLease(
  ctx: MutationCtx,
  invocation: Doc<'capabilityOperationInvocations'> | null,
  lease: ReturnType<typeof toLeaseDomain>,
  connection: ReturnType<typeof toDomain>,
  operationRef: string,
  now: number,
): Promise<boolean> {
  if (invocation === null || ![
    invocation.operationRef === operationRef,
    invocation.grantRef === lease.grantRef,
    invocation.grantGeneration === lease.grantGeneration,
    invocation.principalId === lease.actorPrincipalRef,
    lease.owningAccountRef === connection.owningAccountRef,
    lease.activeAccountRef === connection.owningAccountRef,
  ].every(Boolean)) return false
  const snapshot = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'provider-connection-effect',
    evidenceRef: lease.leaseRef,
    principalRef: lease.actorPrincipalRef,
    accountRef: connection.owningAccountRef,
    grantRef: lease.grantRef,
    grantGeneration: lease.grantGeneration,
    requiredScopes: ['connection:begin_effect', 'connection:lease'],
    resourceRefs: [operationRef, `connection:${lease.connectionRef}`],
    now,
  })
  const leaf = snapshot?.ancestry.at(-1)
  return snapshot !== null && leaf !== undefined && [
    snapshot.accountRef === connection.owningAccountRef,
    snapshot.actorPrincipalRef === lease.actorPrincipalRef,
    snapshot.grantRef === lease.grantRef,
    snapshot.generation === lease.grantGeneration,
    leaf.expiresAt === invocation.grantExpiresAt,
  ].every(Boolean)
}

export async function beginLeaseEffectHandler(
  ctx: MutationCtx,
  args: Readonly<{ leaseRef: string; invocationRef: string; operationRef: string; commandId: string }>,
) {
  const leaseRow = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef))
    .unique()
  if (leaseRow === null) {
    return { kind: 'unavailable' as const, reason: 'lease_inactive' }
  }
  const lease = toLeaseDomain(leaseRow)
  if (!leaseMatchesEffectRequest(lease, args)) {
    return { kind: 'unavailable' as const, reason: 'lease_inactive' }
  }
  const connectionRow = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', leaseRow.connectionRef))
    .unique()
  if (connectionRow === null) return { kind: 'unavailable' as const, reason: 'connection_not_found' }
  const connection = toDomain(connectionRow)
  if (!providerLeaseIsCurrent(lease, connection)) {
    return { kind: 'unavailable' as const, reason: 'lease_inactive' }
  }
  if (connection.secretRef === undefined) {
    return { kind: 'unavailable' as const, reason: 'credential_unavailable' }
  }
  const invocation = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  const now = Date.now()
  if (!await invocationAuthorityMatchesLease(ctx, invocation, lease, connection, args.operationRef, now)) return {
    kind: 'unavailable' as const, reason: 'invocation_authority_mismatch',
  }
  return {
    kind: 'admitted' as const,
    effectRef: `effect:${canonicalDigest({
      kind: 'provider-lease-effect:v1',
      leaseRef: lease.leaseRef,
      connectionRef: lease.connectionRef,
      authorityGeneration: lease.authorityGeneration,
    })}`,
    leaseRef: lease.leaseRef,
    connectionRef: lease.connectionRef,
    authorityGeneration: lease.authorityGeneration,
    owningAccountRef: lease.owningAccountRef,
    activeAccountRef: lease.activeAccountRef,
    actorPrincipalRef: lease.actorPrincipalRef,
    grantRef: lease.grantRef,
    grantGeneration: lease.grantGeneration,
    secretRef: connection.secretRef,
  }
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
