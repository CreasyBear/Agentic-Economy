import { makeFunctionReference } from 'convex/server'
import type { Infer } from 'convex/values'
import type { Doc } from '../../_generated/dataModel'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../_generated/server'
import { resolveBusinessActor } from '../../authz'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import { uniqueSorted } from '@/modules/common/unique-sorted'
import {
  operationResultValue,
  recoveryResultValue,
  statusResultValue,
} from '@/modules/capability-execution/convex'
import {
  resolveCanonicalAgentContext,
  validateCanonicalAgentDelegation,
} from '../canonicalAgentAuthority'
import {
  decideOperationApprovalHandler,
  listPendingOperationApprovalsHandler,
} from './admission'
import {
  cancelInvocationHandler,
  cancelOwnerInvocationHandler,
  invokeHandler,
  readInvocationStatusHandler,
  readOwnerInvocationStatusHandler,
  reconcileInvocationHandler,
  reconcileOwnerInvocationHandler,
} from './invokeActions'
import {
  reconciledInvocationAuthorityResult,
  type CurrentAgentAuthority,
  type OperationPrincipal,
  type ReconciledInvocationAuthority,
} from './contracts'

export const resolveInvocationAgentAuthorityRef = makeFunctionReference<
  'mutation',
  { principal: OperationPrincipal; operationRef?: string; invocationRef?: string },
  OperationPrincipal | null
>('capabilityOperationInvocations:resolveInvocationAgentAuthority')

type InvocationAuthorityTarget = Readonly<{
  operationRef: string
  invocation: Doc<'capabilityOperationInvocations'> | null
}>

function invocationMatchesCurrentAuthority(
  row: Doc<'capabilityOperationInvocations'>,
  current: CurrentAgentAuthority,
): boolean {
  return [
    row.principalId === current.principal.principalId,
    row.ownerId === current.principal.ownerId,
    row.credentialId === current.principal.credentialId,
    row.applicationRef === current.principal.applicationRef,
    row.environment === current.principal.environment,
    row.grantRef === current.grantRef,
    row.grantGeneration === current.grantGeneration,
    row.policyDigest === current.policyDigest,
    row.grantExpiresAt === current.expiresAt,
  ].every(Boolean)
}

async function resolveInvocationAuthorityTarget(
  ctx: MutationCtx,
  args: Readonly<{ operationRef?: string; invocationRef?: string }>,
): Promise<InvocationAuthorityTarget | null> {
  if ((args.operationRef === undefined) === (args.invocationRef === undefined)) return null
  if (args.operationRef !== undefined) return { operationRef: args.operationRef, invocation: null }
  if (args.invocationRef === undefined) return null
  const invocationRef = args.invocationRef
  const rows = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .take(2)
  if (rows.length !== 1) return null
  const [invocation] = rows
  return invocation === undefined
    ? null
    : { operationRef: invocation.operationRef, invocation }
}

export async function resolveInvocationAgentAuthorityHandler(
  ctx: MutationCtx,
  args: Readonly<{ principal: OperationPrincipal; operationRef?: string; invocationRef?: string }>,
): Promise<OperationPrincipal | null> {
  const target = await resolveInvocationAuthorityTarget(ctx, args)
  if (target === null) return null
  const current = await resolveCurrentAgentAuthority(ctx, args.principal, Date.now(), target.operationRef)
  if (current === null) return null
  if (target.invocation !== null && !invocationMatchesCurrentAuthority(target.invocation, current)) return null
  return current.principal
}

export async function reconcileInvocationWorkloadAuthorityHandler(
  ctx: MutationCtx,
  args: Readonly<{ invocationRef: string }>,
): Promise<Infer<typeof reconciledInvocationAuthorityResult>> {
  const now = Date.now()
  const authority = await reconcilePersistedInvocationAuthority(ctx, args.invocationRef, now)
  if (authority === null) {
    await refuseInvocationBeforeEffectForInvalidAuthority(ctx, args.invocationRef, now)
    return { kind: 'refused' }
  }
  return { kind: 'authorized', authority }
}

export async function canonicalAgentPrincipal(
  ctx: ActionCtx,
  principal: OperationPrincipal,
  target: Readonly<{ operationRef: string } | { invocationRef: string }>,
): Promise<OperationPrincipal | null> {
  return await ctx.runMutation(resolveInvocationAgentAuthorityRef, { principal, ...target })
}

type CanonicalAgentContext = NonNullable<Awaited<ReturnType<typeof resolveCanonicalAgentContext>>>
type StoredAgent = Doc<'agentAccessPrincipals'>
type ActiveGrant = Doc<'agentAccessGrants'>

function validAuthorityRequest(candidate: OperationPrincipal, now: number, operationRef: string): boolean {
  return [
    Number.isSafeInteger(now),
    now >= 0,
    operationRef.trim().length > 0,
    candidate.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE),
  ].every(Boolean)
}

function candidateMatchesCanonical(candidate: OperationPrincipal, canonical: CanonicalAgentContext): boolean {
  return [
    candidate.principalId === canonical.principalRef,
    candidate.ownerId === canonical.accountRef,
  ].every(Boolean)
}

function scopeSubset(candidateScopes: readonly string[], storedScopes: readonly string[]): boolean {
  return candidateScopes.every((scope) => storedScopes.includes(scope))
}

function storedAgentMatches(
  stored: StoredAgent,
  candidate: OperationPrincipal,
  canonical: CanonicalAgentContext,
  now: number,
): boolean {
  const unexpired = stored.expiresAt === undefined || stored.expiresAt > now
  return [
    stored.principalId === canonical.principalRef,
    stored.ownerId === canonical.accountRef,
    stored.credentialId === candidate.credentialId,
    stored.applicationRef === candidate.applicationRef,
    stored.environment === candidate.environment,
    stored.authorityMode === candidate.authorityMode,
    stored.lifecycle === 'active',
    unexpired,
    stored.scopes.includes(MARKET_OPERATIONS_INVOKE_SCOPE),
    scopeSubset(candidate.scopes, stored.scopes),
  ].every(Boolean)
}

async function loadCurrentStoredAgent(
  ctx: MutationCtx,
  candidate: OperationPrincipal,
  canonical: CanonicalAgentContext,
  now: number,
): Promise<StoredAgent | null> {
  const rows = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', canonical.credentialLocator))
    .take(2)
  if (rows.length !== 1) return null
  const [stored] = rows
  if (stored === undefined) return null
  return storedAgentMatches(stored, candidate, canonical, now) ? stored : null
}

function activeGrantMatches(
  grant: ActiveGrant,
  stored: StoredAgent,
  canonical: CanonicalAgentContext,
  now: number,
): boolean {
  return [
    grant.principalId === canonical.principalRef,
    grant.ownerId === stored.ownerId,
    grant.applicationRef === stored.applicationRef,
    grant.environment === stored.environment,
    grant.authorityMode === stored.authorityMode,
    grant.generation === stored.grantGeneration,
    grant.policyDigest === stored.policyDigest,
    grant.expiresAt > now,
    grant.expiresAt <= canonical.credentialExpiresAt,
  ].every(Boolean)
}

async function loadCurrentActiveGrant(
  ctx: MutationCtx,
  stored: StoredAgent,
  canonical: CanonicalAgentContext,
  now: number,
): Promise<ActiveGrant | null> {
  const [sandboxGrants, productionGrants] = await Promise.all([
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', canonical.credentialLocator)
        .eq('environment', 'sandbox')
        .eq('lifecycle', 'active'))
      .take(2),
    ctx.db.query('agentAccessGrants')
      .withIndex('by_credentialId_and_environment_and_lifecycle', (query) => query
        .eq('credentialId', canonical.credentialLocator)
        .eq('environment', 'production')
        .eq('lifecycle', 'active'))
      .take(2),
  ])
  const activeGrants = [...sandboxGrants, ...productionGrants]
  if (activeGrants.length !== 1) return null
  const [grant] = activeGrants
  if (grant === undefined) return null
  return activeGrantMatches(grant, stored, canonical, now) ? grant : null
}

export async function resolveCurrentAgentAuthority(
  ctx: MutationCtx,
  candidate: OperationPrincipal,
  now: number,
  operationRef: string,
): Promise<CurrentAgentAuthority | null> {
  if (!validAuthorityRequest(candidate, now, operationRef)) return null

  const canonical = await resolveCanonicalAgentContext(ctx, candidate.credentialId, now)
  if (canonical === null || !candidateMatchesCanonical(candidate, canonical)) return null
  const storedAgent = await loadCurrentStoredAgent(ctx, candidate, canonical, now)
  if (storedAgent === null) return null
  const grant = await loadCurrentActiveGrant(ctx, storedAgent, canonical, now)
  if (grant === null) return null

  const scopes = uniqueSorted(candidate.scopes)
  if (scopes.length !== candidate.scopes.length) return null
  const delegation = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'operation-public-admission',
    evidenceRef: operationRef,
    principalRef: canonical.principalRef,
    accountRef: canonical.accountRef,
    grantRef: grant.grantRef,
    grantGeneration: grant.generation,
    requiredScopes: scopes,
    resourceRefs: [operationRef],
    now,
  })
  if (delegation === null) return null

  return Object.freeze({
    principal: Object.freeze({
      principalId: canonical.principalRef,
      ownerId: canonical.accountRef,
      credentialId: storedAgent.credentialId,
      applicationRef: storedAgent.applicationRef,
      environment: storedAgent.environment,
      scopes,
      authorityMode: storedAgent.authorityMode,
    }),
    grantRef: grant.grantRef,
    grantGeneration: grant.generation,
    policyDigest: grant.policyDigest,
    expiresAt: grant.expiresAt,
  })
}

export async function validatePersistedInvocationDelegation(
  ctx: MutationCtx,
  input: Readonly<{
    invocationRef: string
    operationRef: string
    principalId: string
    accountRef: string
    grantRef: string
    grantGeneration: number
  }>,
): Promise<boolean> {
  return await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'operation-workload-reconciliation',
    evidenceRef: input.invocationRef,
    principalRef: input.principalId,
    accountRef: input.accountRef,
    grantRef: input.grantRef,
    grantGeneration: input.grantGeneration,
    requiredScopes: [MARKET_OPERATIONS_INVOKE_SCOPE],
    resourceRefs: [input.operationRef],
    now: Date.now(),
  }) !== null
}

export async function reconcilePersistedInvocationAuthority(
  ctx: MutationCtx,
  invocationRef: string,
  now: number,
): Promise<ReconciledInvocationAuthority | null> {
  const row = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
    .unique()
  if (row === null) return null
  const storedAgent = await ctx.db.query('agentAccessPrincipals')
    .withIndex('by_credentialId', (query) => query.eq('credentialId', row.credentialId))
    .unique()
  if (storedAgent === null) return null
  const current = await resolveCurrentAgentAuthority(ctx, {
    principalId: storedAgent.principalId,
    ownerId: storedAgent.ownerId,
    credentialId: storedAgent.credentialId,
    applicationRef: storedAgent.applicationRef,
    environment: storedAgent.environment,
    scopes: storedAgent.scopes,
    authorityMode: storedAgent.authorityMode,
  }, now, row.operationRef)
  if (current === null) return null
  if (!invocationMatchesCurrentAuthority(row, current)) return null
  const delegationIsCurrent = await validatePersistedInvocationDelegation(ctx, {
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
    principalId: current.principal.principalId,
    accountRef: current.principal.ownerId,
    grantRef: current.grantRef,
    grantGeneration: current.grantGeneration,
  })
  if (!delegationIsCurrent) return null
  return Object.freeze({
    principalId: current.principal.principalId,
    accountRef: current.principal.ownerId,
    credentialId: current.principal.credentialId,
    grantRef: current.grantRef,
    grantGeneration: current.grantGeneration,
    policyDigest: current.policyDigest,
    expiresAt: current.expiresAt,
  })
}

export async function refuseInvocationBeforeEffectForInvalidAuthority(
  ctx: MutationCtx,
  invocationRef: string,
  now: number,
): Promise<void> {
  const [row, control] = await Promise.all([
    ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .unique(),
    ctx.db.query('actionInvocationControls')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', invocationRef))
      .unique(),
  ])
  if (row === null || row.state !== 'pending' || control !== null) return
  await ctx.db.patch(row._id, {
    state: 'refused',
    dispatchState: 'failed',
    result: {
      kind: 'refused',
      operationRef: row.operationRef,
      code: 'grant_not_found',
      retryable: false,
      nextAction: 'Refresh the agent grant and retry.',
    },
    updatedAt: now,
  })
}

export function agentRecoveryNotFound(invocationRef: string): Infer<typeof recoveryResultValue> {
  return { kind: 'refused', invocationRef, code: 'invocation_not_found', retryable: false }
}

export function agentStatusNotFound(invocationRef: string): Infer<typeof statusResultValue> {
  return { kind: 'refused', invocationRef, code: 'invocation_not_found', retryable: false }
}

export async function canonicalAgentInvokeHandler(
  ctx: ActionCtx,
  args: Parameters<typeof invokeHandler>[1],
): Promise<Infer<typeof operationResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { operationRef: args.operationRef })
  if (principal === null) {
    return { kind: 'refused', operationRef: args.operationRef, code: 'grant_not_found', retryable: false }
  }
  return await invokeHandler(ctx, { ...args, principal })
}

export async function canonicalAgentStatusHandler(
  ctx: ActionCtx,
  args: Parameters<typeof readInvocationStatusHandler>[1],
): Promise<Infer<typeof statusResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { invocationRef: args.invocationRef })
  if (principal === null) return agentStatusNotFound(args.invocationRef)
  return await readInvocationStatusHandler(ctx, { ...args, principal })
}

export async function canonicalAgentCancelHandler(
  ctx: ActionCtx,
  args: Parameters<typeof cancelInvocationHandler>[1],
): Promise<Infer<typeof recoveryResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { invocationRef: args.invocationRef })
  if (principal === null) return agentRecoveryNotFound(args.invocationRef)
  return await cancelInvocationHandler(ctx, { ...args, principal })
}

export async function canonicalAgentReconcileHandler(
  ctx: ActionCtx,
  args: Parameters<typeof reconcileInvocationHandler>[1],
): Promise<Infer<typeof recoveryResultValue>> {
  const principal = await canonicalAgentPrincipal(ctx, args.principal, { invocationRef: args.invocationRef })
  if (principal === null) return agentRecoveryNotFound(args.invocationRef)
  return await reconcileInvocationHandler(ctx, { ...args, principal })
}

export type CanonicalOwner = Extract<Awaited<ReturnType<typeof resolveBusinessActor>>, { kind: 'authenticated_owner' }>

export async function canonicalOwnerContext<T extends QueryCtx | MutationCtx | ActionCtx>(
  ctx: T,
  actor: CanonicalOwner,
): Promise<T> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new Error('canonical_owner_identity_missing')
  const auth = new Proxy(ctx.auth, {
    get(target, property, receiver) {
      return property === 'getUserIdentity'
        ? async () => ({
            ...identity,
            subject: actor.canonicalPrincipalRef,
            tokenIdentifier: actor.canonicalAccountRef,
          })
        : Reflect.get(target, property, receiver)
    },
  })
  return new Proxy(ctx, {
    get(target, property, receiver) {
      return property === 'auth' ? auth : Reflect.get(target, property, receiver)
    },
  })
}

export async function canonicalOwnerActor<T extends QueryCtx | MutationCtx | ActionCtx>(
  ctx: T,
): Promise<{ actor: CanonicalOwner; ctx: T } | null> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  return { actor, ctx: await canonicalOwnerContext(ctx, actor) }
}

export async function canonicalOwnerApprovalListHandler(ctx: QueryCtx) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null ? [] : await listPendingOperationApprovalsHandler(canonical.ctx)
}

export async function canonicalOwnerApprovalDecisionHandler(
  ctx: MutationCtx,
  args: Parameters<typeof decideOperationApprovalHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? { kind: 'refused' as const, code: 'authentication_required' as const }
    : await decideOperationApprovalHandler(canonical.ctx, args)
}

export async function canonicalOwnerStatusHandler(
  ctx: ActionCtx,
  args: Parameters<typeof readOwnerInvocationStatusHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentStatusNotFound(args.invocationRef)
    : await readOwnerInvocationStatusHandler(canonical.ctx, args)
}

export async function canonicalOwnerCancelHandler(
  ctx: ActionCtx,
  args: Parameters<typeof cancelOwnerInvocationHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentRecoveryNotFound(args.invocationRef)
    : await cancelOwnerInvocationHandler(canonical.ctx, args)
}

export async function canonicalOwnerReconcileHandler(
  ctx: ActionCtx,
  args: Parameters<typeof reconcileOwnerInvocationHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentRecoveryNotFound(args.invocationRef)
    : await reconcileOwnerInvocationHandler(canonical.ctx, args)
}

