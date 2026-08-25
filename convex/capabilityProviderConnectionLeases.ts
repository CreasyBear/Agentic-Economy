import { v } from 'convex/values'
import {
  canonicalProviderLeaseProjection,
  canonicalProviderLeaseProjectionIsCurrent,
  consumeProviderConnectionLease,
  expireProviderConnectionLease,
  invalidateProviderConnectionLease,
  issueProviderConnectionLease,
  type ProviderConnectionLeaseCommandResult,
} from '../src/modules/capability-supply/provider-connection'
import { DelegationError } from '../src/modules/authority/delegation/public'
import {
  ConnectionLifecycleError,
  parsePersistedConnectionLease,
  type Connection,
  type ConnectionLease,
} from '../src/modules/connections/lifecycle/public'
import { accountRef, principalRef } from '../src/modules/principal-account/public'
import {
  isProviderApprovalDecisionIntegrityValid,
  type ProviderApprovalDecision,
} from '../src/modules/capability-supply/provider-approval'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  canonicalConnectionActionContext,
  createCanonicalConnectionLifecycleService,
  failClosedCanonicalLifecycleError,
  readCanonicalConnectionForProjection,
  toDomain,
  toLeaseDomain,
  toLeaseRow,
  type CanonicalActor,
} from './capabilityProviderConnectionLifecycle'

const leaseState = v.union(
  v.literal('active'),
  v.literal('consumed'),
  v.literal('expired'),
  v.literal('invalidated'),
)
export const leaseValue = v.object({
  leaseRef: v.string(),
  canonicalLeaseRef: v.optional(v.string()),
  canonicalConnectionRef: v.optional(v.string()),
  canonicalConnectionGeneration: v.optional(v.number()),
  owningAccountRef: v.optional(v.string()),
  activeAccountRef: v.optional(v.string()),
  actorPrincipalRef: v.optional(v.string()),
  grantRef: v.optional(v.string()),
  grantGeneration: v.optional(v.number()),
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

function withoutSystemFields<Value extends { _id: unknown; _creationTime: number }>(value: Value) {
  const { _id, _creationTime, ...domain } = value
  void _id
  void _creationTime
  return domain
}

export async function readCanonicalLeaseForProjection(
  ctx: Pick<QueryCtx, 'db'>,
  legacy: ReturnType<typeof toLeaseDomain>,
  canonicalConnection: Connection,
): Promise<ConnectionLease | null> {
  if (legacy.canonicalLeaseRef === undefined) return null
  const row = await ctx.db.query('connectionLeases')
    .withIndex('by_leaseRef', (query) => query.eq('leaseRef', legacy.canonicalLeaseRef as never))
    .unique()
  if (row === null) return null
  try {
    const canonical = parsePersistedConnectionLease(withoutSystemFields(row))
    return canonicalProviderLeaseProjectionIsCurrent(legacy, canonical, canonicalConnection) ? canonical : null
  } catch {
    return null
  }
}

export async function issueCanonicalLease(
  ctx: MutationCtx,
  args: IssueLeaseArgs,
  connection: Connection,
): Promise<ConnectionLease | null> {
  const invocation = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  if (invocation === null || invocation.operationRef !== args.operationRef) return null
  const grant = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', invocation.grantRef))
    .unique()
  const now = Date.now()
  if (grant === null
    || grant.lifecycle !== 'active'
    || grant.generation !== invocation.grantGeneration
    || grant.expiresAt !== invocation.grantExpiresAt
    || grant.expiresAt <= now
    || grant.subjectPrincipalRef !== invocation.principalId
    || !grant.scopes.includes('connection:lease')
    || !grant.resourceRefs.includes(invocation.operationRef)
    || !grant.resourceRefs.includes(`connection:${connection.connectionRef}`)) return null
  let actor: CanonicalActor
  try {
    actor = {
      principalRef: principalRef(grant.subjectPrincipalRef),
      accountRef: accountRef(grant.accountRef),
    }
  } catch {
    return null
  }
  const expiresAt = Math.min(now + args.leaseMs, args.readinessValidUntil, grant.expiresAt)
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) return null
  try {
    return await createCanonicalConnectionLifecycleService(ctx, actor).lease({
      connectionRef: connection.connectionRef,
      context: canonicalConnectionActionContext(actor, 'lease', args.commandId),
      grantRef: grant.grantRef,
      expectedGrantGeneration: grant.generation,
      expiresAt,
    })
  } catch (error) {
    return failClosedCanonicalLifecycleError(error)
  }
}

async function leaseRowForConnection(ctx: Pick<QueryCtx, 'db'>, leaseRef: string) {
  const lease = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', leaseRef)).unique()
  if (lease === null) return null
  return await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', lease.connectionRef)).unique()
}

export async function canonicalLeaseContext(
  ctx: Pick<QueryCtx, 'db'>,
  leaseRow: ReturnType<typeof toLeaseDomain> | undefined,
  connectionRow: ReturnType<typeof toDomain> | undefined,
) {
  if (leaseRow === undefined || connectionRow === undefined) return null
  const connection = await readCanonicalConnectionForProjection(ctx, connectionRow, true)
  if (connection === null) return null
  const lease = await readCanonicalLeaseForProjection(ctx, leaseRow, connection)
  return lease === null ? null : { connection, lease }
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
  const currentLegacyConnection = toDomain(connectionRow)
  const canonicalConnection = await readCanonicalConnectionForProjection(ctx, currentLegacyConnection, true)
  if (canonicalConnection === null) return { kind: 'refused' as const, code: 'connection_not_active' as const }
  const now = Date.now()
  const legacyResult = issueProviderConnectionLease(
    currentLegacyConnection,
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
    now,
    existingLeaseRow === null ? undefined : toLeaseDomain(existingLeaseRow),
  )
  if (legacyResult.kind === 'refused') return legacyResult
  const canonicalLease = await issueCanonicalLease(ctx, args, canonicalConnection)
  if (canonicalLease === null) return { kind: 'refused' as const, code: 'invalid_lease' as const }
  const projected = canonicalProviderLeaseProjection(legacyResult.lease, canonicalLease)
  if (legacyResult.kind === 'applied') {
    await ctx.db.insert(
      'capabilityProviderConnectionLeases',
      toLeaseRow(projected, args.commandId, legacyResult.commandDigest),
    )
  } else if (existingLeaseRow === null
    || !canonicalProviderLeaseProjectionIsCurrent(toLeaseDomain(existingLeaseRow), canonicalLease, canonicalConnection)) {
    return { kind: 'refused' as const, code: 'invalid_lease' as const }
  }
  return projectLeaseResult({ ...legacyResult, lease: projected })
}

export async function readLeaseHandler(ctx: QueryCtx, args: { leaseRef: string }) {
  const row = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique()
  if (row === null) return null
  const connection = await leaseRowForConnection(ctx, args.leaseRef)
  const legacyLease = toLeaseDomain(row)
  if (await canonicalLeaseContext(ctx, legacyLease, connection === null ? undefined : toDomain(connection)) === null) return null
  return toLeaseRow(legacyLease, row.lastCommandId, row.lastCommandDigest)
}

export async function readLeaseByInvocationHandler(ctx: QueryCtx, args: { invocationRef: string }) {
  const row = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_invocationRef', (index) => index.eq('invocationRef', args.invocationRef)).order('desc').first()
  if (row === null) return null
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', row.connectionRef)).unique()
  const legacyLease = toLeaseDomain(row)
  if (await canonicalLeaseContext(ctx, legacyLease, connection === null ? undefined : toDomain(connection)) === null) return null
  return toLeaseRow(legacyLease, row.lastCommandId, row.lastCommandDigest)
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
    canonicalLeaseRef: v.string(),
    canonicalConnectionRef: v.string(),
    canonicalConnectionGeneration: v.number(),
    owningAccountRef: v.string(),
    activeAccountRef: v.string(),
    actorPrincipalRef: v.string(),
    grantRef: v.string(),
    grantGeneration: v.number(),
    secretRef: v.string(),
  }),
  v.object({ kind: v.literal('unavailable'), reason: v.string() }),
)

export function canonicalLeaseEffectFailureReason(error: unknown): string {
  if (error instanceof ConnectionLifecycleError || error instanceof DelegationError) return error.code
  throw error
}

export async function beginLeaseEffectHandler(
  ctx: MutationCtx,
  args: Readonly<{ leaseRef: string; invocationRef: string; operationRef: string; commandId: string }>,
) {
  const legacyLeaseRow = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef))
    .unique()
  if (legacyLeaseRow === null
    || legacyLeaseRow.invocationRef !== args.invocationRef
    || legacyLeaseRow.operationRef !== args.operationRef
    || legacyLeaseRow.state !== 'active') {
    return { kind: 'unavailable' as const, reason: 'lease_inactive' }
  }
  const legacyConnectionRow = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', legacyLeaseRow.connectionRef))
    .unique()
  if (legacyConnectionRow === null) return { kind: 'unavailable' as const, reason: 'connection_not_found' }
  const legacyConnection = toDomain(legacyConnectionRow)
  const canonical = await canonicalLeaseContext(ctx, toLeaseDomain(legacyLeaseRow), legacyConnection)
  if (canonical === null || canonical.connection.secretRef === undefined) {
    return { kind: 'unavailable' as const, reason: 'canonical_mapping_invalid' }
  }
  const invocation = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef))
    .unique()
  if (invocation === null
    || invocation.operationRef !== args.operationRef
    || invocation.grantRef !== canonical.lease.grantRef
    || invocation.grantGeneration !== canonical.lease.grantGeneration
    || invocation.principalId !== canonical.lease.actorPrincipalRef) {
    return { kind: 'unavailable' as const, reason: 'invocation_authority_mismatch' }
  }
  const actor: CanonicalActor = {
    principalRef: canonical.lease.actorPrincipalRef,
    accountRef: canonical.lease.activeAccountRef,
  }
  try {
    const admission = await createCanonicalConnectionLifecycleService(ctx, actor).beginEffect({
      leaseRef: canonical.lease.leaseRef,
      context: canonicalConnectionActionContext(actor, 'begin_effect', args.commandId),
    })
    return {
      kind: 'admitted' as const,
      effectRef: admission.effectRef,
      canonicalLeaseRef: admission.leaseRef,
      canonicalConnectionRef: admission.connectionRef,
      canonicalConnectionGeneration: admission.connectionGeneration,
      owningAccountRef: admission.owningAccountRef,
      activeAccountRef: admission.activeAccountRef,
      actorPrincipalRef: admission.actorPrincipalRef,
      grantRef: admission.grantRef,
      grantGeneration: admission.grantGeneration,
      secretRef: canonical.connection.secretRef,
    }
  } catch (error) {
    return { kind: 'unavailable' as const, reason: canonicalLeaseEffectFailureReason(error) }
  }
}

export async function consumeLeaseHandler(ctx: MutationCtx, args: ConsumeLeaseArgs) {
  const [leaseRow, connectionRow] = await Promise.all([
    ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (index) => index.eq('leaseRef', args.leaseRef)).unique(),
    leaseRowForConnection(ctx, args.leaseRef),
  ])
  const currentConnection = connectionRow === null ? undefined : toDomain(connectionRow)
  const legacyLease = leaseRow === null ? undefined : toLeaseDomain(leaseRow)
  if (await canonicalLeaseContext(ctx, legacyLease, currentConnection) === null) {
    return { kind: 'refused' as const, code: 'lease_inactive' as const }
  }
  const result = consumeProviderConnectionLease(
    legacyLease,
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
  const legacyLease = toLeaseDomain(existing)
  if (await canonicalLeaseContext(ctx, legacyLease, connection === null ? undefined : toDomain(connection)) === null) {
    return { kind: 'refused' as const, code: 'lease_inactive' as const }
  }
  const result = expireProviderConnectionLease(legacyLease, args, Date.now())
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
  const legacyLease = toLeaseDomain(existing)
  if (await canonicalLeaseContext(ctx, legacyLease, connection === null ? undefined : toDomain(connection)) === null) {
    return { kind: 'refused' as const, code: 'lease_inactive' as const }
  }
  const result = invalidateProviderConnectionLease(legacyLease, args, Date.now())
  if (result.kind === 'applied' && existing !== null) {
    await ctx.db.replace(existing._id, toLeaseRow(result.lease, args.commandId, result.commandDigest))
  }
  return projectLeaseResult(result)
}
