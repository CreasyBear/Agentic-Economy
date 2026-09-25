import { issueProviderConnectionLease, providerConnectionAuthorityProvenanceIsValid, type ProviderConnectionLeaseCommandResult } from '../../../../src/modules/capability-supply/provider-connection'
import { isProviderApprovalDecisionIntegrityValid, type ProviderApprovalDecision } from '../../../../src/modules/capability-supply/provider-approval'
import type { MutationCtx } from '../../../_generated/server'
import { toDomain, toLeaseDomain, toLeaseRow } from './lifecycle'
import { validateCanonicalAgentDelegation } from '../../authority/canonicalAgent/authority'
import { projectLeaseResult, providerLeaseIsCurrent } from './leases'

type IssueLeaseArgs = {
  commandId: string
  leaseRef: string
  callRef: string
  toolRef: string
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
  const invocation = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  if (invocation === null) return null
  if (invocation.toolRef !== args.toolRef) return null
  const now = Date.now()
  const snapshot = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'provider-connection-lease',
    evidenceRef: args.leaseRef,
    principalRef: invocation.principalId,
    accountRef: connection.owningAccountRef,
    grantRef: invocation.grantRef,
    grantGeneration: invocation.grantGeneration,
    requiredScopes: ['connection:lease'],
    resourceRefs: [invocation.toolRef, `connection:${args.connectionRef}`],
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
      callRef: args.callRef,
      toolRef: args.toolRef,
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
